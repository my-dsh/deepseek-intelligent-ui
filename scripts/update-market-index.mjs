#!/usr/bin/env node
/**
 * List the just-published version in the plugin market index.
 *
 * `market/index.json` is a format-1 market index: every plugin carries an exact
 * version list, so a release has to be added to it before Discover offers it.
 * The reference generator (@deepseek-ai/dsh-plugin-market-generator) is part of
 * the DeepSeek Harness monorepo and is not published to npm, so this script does
 * the one thing a release needs instead: append the released version to the
 * existing entry, keeping the index otherwise byte-identical.
 *
 * Published versions come from the registry rather than from Git tags, so the
 * entry is `{ type: 'npm' }` and install resolves against whichever registry the
 * user configured.
 *
 * Usage: node scripts/update-market-index.mjs [version]
 *   Reads the package name and `engines.dsh` from package.json and lists `version`
 *   (default: the manifest's own version), asking the registry when that version was
 *   published. Rewrites market/index.json only when the result differs. The explicit
 *   version matters in CI, where the index is updated on a checkout of main whose
 *   package.json may already name the next release.
 *
 *   In that CI case the checked-out manifest also has the wrong `engines`, so the
 *   workflow passes the tagged manifest's requirements as `IUI_MARKET_ENGINES_JSON`
 *   (a JSON object of engine requirements, e.g. `{"dsh":">=0.2.1-alpha.4"}`). The
 *   entry then records the released version's floor, not the next release's.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Environment variable carrying the tagged manifest's engines as a JSON object. */
const ENGINES_OVERRIDE_ENV = 'IUI_MARKET_ENGINES_JSON'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX_FILE = join(ROOT, 'market', 'index.json')
const REGISTRY = 'https://registry.npmjs.org'

/** Exact SemVer, optionally with prerelease and build metadata. */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** Ordering fields of one exact SemVer version. */
function precedence(version) {
  const match = SEMVER.exec(version)
  if (match === null) throw new Error(`not an exact SemVer version: ${JSON.stringify(version)}`)
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] === undefined ? null : match[4].split('.'),
  }
}

/** SemVer precedence of two prerelease identifier lists. */
function comparePrerelease(left, right) {
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    if (a === b) continue
    const numericA = /^\d+$/.test(a)
    const numericB = /^\d+$/.test(b)
    if (numericA && numericB) return Number(a) < Number(b) ? -1 : 1
    if (numericA !== numericB) return numericA ? -1 : 1
    return a < b ? -1 : 1
  }
  return 0
}

/** SemVer precedence, ascending. */
export function compareVersions(left, right) {
  const a = precedence(left)
  const b = precedence(right)
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

/**
 * One `versions[]` entry for a version published to the npm registry.
 * @param version - exact SemVer version.
 * @param publishTimestamp - integer Unix seconds; the index format requires it.
 * @param engines - requirement map, normally `{ dsh: '>=x.y.z' }`; omit when empty.
 */
export function marketVersionEntry(version, publishTimestamp, engines = {}) {
  if (SEMVER.exec(version) === null) throw new Error(`not an exact SemVer version: ${JSON.stringify(version)}`)
  if (!Number.isInteger(publishTimestamp) || publishTimestamp < 0 || publishTimestamp >= 100_000_000_000) {
    throw new Error(`publishTimestamp must be integer Unix seconds in [0, 10^11): ${String(publishTimestamp)}`)
  }
  return {
    version,
    publishTimestamp,
    source: { type: 'npm' },
    ...Object.keys(engines).length === 0 ? {} : { engines },
  }
}

/**
 * `index` with `entry` listed once under the plugin named `name`.
 *
 * The format rejects a plugin that repeats a version, so a re-run replaces the
 * entry it already has instead of adding a second one, and versions come out in
 * descending SemVer precedence the way the reference generator writes them.
 */
export function withMarketVersion(index, name, entry) {
  const plugins = index?.plugins
  if (!Array.isArray(plugins)) throw new Error('market index must carry a plugins array')
  const target = plugins.find((plugin) => plugin?.name === name)
  if (target === undefined) throw new Error(`market index lists no plugin named ${name}`)
  if (!Array.isArray(target.versions) || target.versions.length === 0) {
    throw new Error(`market index lists no versions for ${name}`)
  }
  const versions = [...target.versions.filter((item) => item?.version !== entry.version), entry]
    .sort((left, right) => compareVersions(right.version, left.version))
  return { ...index, plugins: plugins.map((plugin) => (plugin === target ? { ...plugin, versions } : plugin)) }
}

/** `engines` for one index entry, from the manifest's `engines.dsh`. */
export function indexEngines(manifest) {
  const dsh = manifest?.engines?.dsh
  return typeof dsh === 'string' && dsh.trim() !== '' ? { dsh } : {}
}

/**
 * Parse the release workflow's tagged-manifest engines override.
 *
 * The index commit is made on a checkout of main, whose `package.json` may already
 * name the next release, so the entry for the version being listed has to carry the
 * released tree's engine floor. The workflow passes it as JSON in
 * `IUI_MARKET_ENGINES_JSON`.
 *
 * @param {string | undefined} value - JSON object of engine requirements, e.g. `{"dsh":">=0.2.1-alpha.4"}`.
 * @returns {Record<string, string> | undefined} parsed engines, or undefined when the variable is unset or empty.
 */
export function parseEnginesOverride(value) {
  if (value === undefined || value.trim() === '') return undefined
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${ENGINES_OVERRIDE_ENV} must be a JSON object of engine requirements, got ${JSON.stringify(value)}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${ENGINES_OVERRIDE_ENV} must be a JSON object of engine requirements, got ${JSON.stringify(value)}`)
  }
  const engines = {}
  for (const [name, range] of Object.entries(parsed)) {
    if (typeof range !== 'string' || range.trim() === '') {
      throw new Error(`${ENGINES_OVERRIDE_ENV}.${name} must be a non-empty string, got ${JSON.stringify(range)}`)
    }
    engines[name] = range
  }
  return engines
}

/**
 * `engines` to record for one index entry: the tagged-manifest override when supplied,
 * otherwise the checkout's own manifest.
 *
 * @param {object} manifest - the parsed package.json of the current checkout.
 * @param {Record<string, string> | undefined} override - result of {@link parseEnginesOverride}.
 * @returns {Record<string, string>} engines for {@link marketVersionEntry}.
 */
export function entryEngines(manifest, override) {
  return override ?? indexEngines(manifest)
}

/**
 * Publish time of `name@version` as integer Unix seconds.
 *
 * A fresh publish can take a moment to appear in the registry document, so this
 * polls; when the registry never reports it, the current time is used and the
 * caller is warned rather than failing the release.
 */
export async function publishedAt(name, version, { attempts = 12, delayMs = 10_000 } = {}) {
  const url = `${REGISTRY}/${name.replace('/', '%2F')}`
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } })
      if (response.ok) {
        const published = (await response.json())?.time?.[version]
        if (typeof published === 'string') {
          const seconds = Math.floor(Date.parse(published) / 1000)
          if (Number.isInteger(seconds)) return seconds
        }
      }
    } catch {
      // Transient network failure: retry until the attempt budget runs out.
    }
    if (attempt < attempts - 1) await new Promise((wake) => setTimeout(wake, delayMs))
  }
  console.warn(`update-market-index: the registry did not report ${name}@${version}; using the current time`)
  return Math.floor(Date.now() / 1000)
}

/** Whether the index already lists `name@version`. */
export function listsVersion(index, name, version) {
  const plugin = index?.plugins?.find((entry) => entry?.name === name)
  return plugin?.versions?.some((entry) => entry?.version === version) === true
}

/** Version to list: an explicit argument when given, otherwise the manifest's own. */
export function requestedVersion(manifest, argument) {
  const version = argument ?? manifest?.version
  if (typeof version !== 'string' || SEMVER.exec(version) === null) {
    throw new Error(`expected an exact SemVer version to list, got ${JSON.stringify(version)}`)
  }
  return version
}

/** Rewrite `market/index.json` for the version in `package.json`. */
async function main() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const version = requestedVersion(manifest, process.argv[2])
  const before = readFileSync(INDEX_FILE, 'utf8')
  const index = JSON.parse(before)
  // The registry refines a version's publish time for a while after the upload, so
  // re-reading it would rewrite an entry that is already correct. Once listed, the
  // version stays exactly as recorded and a re-run becomes a no-op.
  if (listsVersion(index, manifest.name, version)) {
    console.log(`update-market-index: ${manifest.name}@${version} is already listed`)
    return
  }
  const entry = marketVersionEntry(
    version,
    await publishedAt(manifest.name, version),
    entryEngines(manifest, parseEnginesOverride(process.env[ENGINES_OVERRIDE_ENV])),
  )
  const after = `${JSON.stringify(withMarketVersion(index, manifest.name, entry), null, 2)}\n`
  if (after === before) {
    console.log(`update-market-index: ${manifest.name}@${version} is already listed`)
    return
  }
  writeFileSync(INDEX_FILE, after)
  console.log(`update-market-index: listed ${manifest.name}@${version} (published ${entry.publishTimestamp})`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
