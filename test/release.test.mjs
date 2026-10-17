// Release and packaging invariants: what the release gate publishes, not what the
// client renders.
//
// `test/e2e/manifest.test.mjs` covers the static manifest shape and the artifact's
// text; `test/market-index-update.test.mjs` covers the index format. This file covers
// the release-specific gaps found in the audit: the artifact's stamped version, the
// locale dictionaries and metadata, the exact file set npm ships (the build inputs
// used to be included), the tagged-manifest engines override, and the release/workflow
// contract itself.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test, describe } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  entryEngines,
  indexEngines,
  parseEnginesOverride,
} from '../scripts/update-market-index.mjs'

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8')
const exists = (rel) => existsSync(path.join(REPO_ROOT, rel))

const pkg = JSON.parse(read('package.json'))
const bundle = read('client.js')

/** Files the release must carry: the host half, the built client half, the patch, the language core, locales and icon. */
const REQUIRED_TARBALL_FILES = [
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'locale/en.json',
  'locale/zh.json',
  'src/lang/index.js',
  'src/lang/functions.js',
  'src/lang/parse.js',
  'src/lang/evaluate.js',
  'src/lang/signatures.js',
  'src/lang/spec.js',
  'src/lang/tokenize.js',
]

/** Directories that are development-only and must never be installed by a user. */
const DEV_ONLY_PREFIXES = ['src/client/', 'scripts/', 'test/', 'docs/', 'market/']

/** Files npm always publishes, whether or not `files` names them. */
const ALWAYS_PUBLISHED = new Set(['package.json', 'README.md', 'LICENSE'])

describe('release artifact and packaging', () => {
  test('client.js stamps the package version it was built from', () => {
    const match = /IUI_BUILD = \{ version: "([^"]*)"/.exec(bundle)
    assert.ok(match !== null, 'client.js must carry its IUI_BUILD banner object')
    assert.equal(
      match[1],
      pkg.version,
      `client.js was built for version ${match[1]} but package.json says ${pkg.version}; run node scripts/build-client.mjs`,
    )
  })

  test('the client locale dictionaries define the same keys in every language', () => {
    const source = read('src/client/10-locales.js')
    const keysByLanguage = {}
    for (const match of source.matchAll(/\bconst (en|zh) = \{([\s\S]*?)\n\}/g)) {
      const [, language, body] = match
      keysByLanguage[language] = [...body.matchAll(/'([^']+)':/g)].map((key) => key[1])
    }
    assert.deepEqual(Object.keys(keysByLanguage).sort(), ['en', 'zh'], 'src/client/10-locales.js must define en and zh')
    assert.ok(keysByLanguage.en.length > 0, 'the en dictionary must not be empty')
    assert.deepEqual(
      [...keysByLanguage.en].sort(),
      [...keysByLanguage.zh].sort(),
      'en and zh must define exactly the same locale keys',
    )
    for (const key of keysByLanguage.en) {
      assert.ok(bundle.includes(key), `client.js does not carry locale key "${key}" — rebuild the artifact`)
    }
  })

  test('locale/*.json metadata is translated in both shipped languages', () => {
    const en = JSON.parse(read('locale/en.json'))
    const zh = JSON.parse(read('locale/zh.json'))
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), 'locale/en.json and locale/zh.json must carry the same keys')
    for (const [language, json] of [['en', en], ['zh', zh]]) {
      assert.equal(typeof json.meta?.title, 'string', `locale/${language}.json meta.title must be a string`)
      assert.equal(typeof json.meta?.description, 'string', `locale/${language}.json meta.description must be a string`)
      assert.ok(json.meta.title.trim() !== '', `locale/${language}.json meta.title must not be empty`)
    }
    assert.notEqual(en.meta.title, zh.meta.title, 'the zh title must be translated, not copied from en')
  })

  test('package.json files ships the runtime and excludes the build inputs', () => {
    const files = pkg.files
    assert.ok(Array.isArray(files) && files.length > 0, 'package.json must declare files')
    for (const devOnly of ['src', 'src/client', 'scripts', 'test', 'docs', 'market', 'client.js.map']) {
      assert.ok(!files.includes(devOnly), `files must not ship the development-only entry "${devOnly}"`)
    }
    for (const required of ['index.js', 'client.js', 'cordis.patch.yml', 'src/lang', 'locale/*.json', 'icon.svg']) {
      assert.ok(files.includes(required), `files must include "${required}"`)
    }
    // Every exports target and the bundle patch must be covered by the whitelist.
    const covered = (relative) => files.some((entry) => {
      if (!entry.includes('*')) return relative === entry || relative.startsWith(`${entry}/`)
      const pattern = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]*')
      return new RegExp(`^${pattern}$`).test(relative)
    })
    const exported = Object.values(pkg.exports).map((target) => target.slice(2))
    for (const relative of [...exported, pkg.dsh.bundle.patch.slice(2)]) {
      if (relative.includes('*')) {
        // A wildcard target names a directory of resources (locale/*.json).
        const directory = relative.slice(0, relative.lastIndexOf('/'))
        assert.ok(exists(directory), `manifest resource directory ${directory} does not exist`)
        assert.ok(covered(relative), `files whitelist would omit the manifest resources ${relative}`)
        continue
      }
      assert.ok(exists(relative), `manifest resource ${relative} does not exist`)
      assert.ok(
        ALWAYS_PUBLISHED.has(relative) || covered(relative),
        `files whitelist would omit the manifest resource ${relative}`,
      )
    }
  })

  test('the published tarball carries the runtime files and no build inputs', (t) => {
    const packed = spawnSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
    })
    if (packed.error !== undefined || packed.status !== 0) {
      t.skip(`npm pack --dry-run unavailable: ${packed.error?.message ?? (packed.stderr ?? '').trim().split('\n').at(-1) ?? 'unknown error'}`)
      return
    }
    let result
    try {
      result = JSON.parse(packed.stdout.slice(packed.stdout.indexOf('['), packed.stdout.lastIndexOf(']') + 1))
    } catch {
      t.skip('npm pack --dry-run printed no parsable JSON')
      return
    }
    const shipped = new Set(result[0].files.map((file) => file.path))
    for (const required of REQUIRED_TARBALL_FILES) {
      assert.ok(exists(required), `${required} is listed as published but does not exist`)
      assert.ok(shipped.has(required), `the published tarball is missing ${required}`)
    }
    for (const shippedPath of shipped) {
      for (const prefix of DEV_ONLY_PREFIXES) {
        assert.ok(!shippedPath.startsWith(prefix), `the published tarball must not carry the development-only ${shippedPath}`)
      }
    }
    assert.ok(!shipped.has('package-lock.json'), 'the published tarball must not carry a lockfile')
  })
})

describe('market index engines come from the released tree', () => {
  test('indexEngines reads engines.dsh and ignores everything else', () => {
    assert.deepEqual(indexEngines({ engines: { dsh: '>=0.2.1-alpha.4' } }), { dsh: '>=0.2.1-alpha.4' })
    assert.deepEqual(indexEngines({ engines: { node: '>=20' } }), {})
    assert.deepEqual(indexEngines({ engines: { dsh: '   ' } }), {})
    assert.deepEqual(indexEngines({}), {})
    assert.deepEqual(indexEngines(undefined), {})
  })

  test('the tagged-manifest override is validated and preferred over the checkout', () => {
    assert.equal(parseEnginesOverride(undefined), undefined)
    assert.equal(parseEnginesOverride(''), undefined)
    assert.equal(parseEnginesOverride('   '), undefined)
    assert.deepEqual(parseEnginesOverride('{"dsh":">=0.2.1-alpha.4"}'), { dsh: '>=0.2.1-alpha.4' })
    assert.deepEqual(parseEnginesOverride('{}'), {})
    assert.throws(() => parseEnginesOverride('{'), /JSON object/)
    assert.throws(() => parseEnginesOverride('[]'), /JSON object/)
    assert.throws(() => parseEnginesOverride('null'), /JSON object/)
    assert.throws(() => parseEnginesOverride('{"dsh":1}'), /non-empty string/)
  })

  test('entryEngines uses the released manifest, not the checkout whose main moved on', () => {
    const mainManifest = { engines: { dsh: '>=0.3.0' } }
    // main may already name the next release; the tagged floor must win.
    assert.deepEqual(entryEngines(mainManifest, parseEnginesOverride('{"dsh":">=0.2.1-alpha.4"}')), { dsh: '>=0.2.1-alpha.4' })
    // A tagged manifest with no engines must not inherit main's requirement.
    assert.deepEqual(entryEngines(mainManifest, parseEnginesOverride('{}')), {})
    // Without CI's override the checkout's own manifest is used (local runs).
    assert.deepEqual(entryEngines(mainManifest, undefined), { dsh: '>=0.3.0' })
  })
})

describe('release workflow contract', () => {
  const publish = read('.github/workflows/publish.yml')
  const ci = read('.github/workflows/ci.yml')

  test('the release workflow rebuilds and probes the artifact instead of trusting the stamp', () => {
    assert.match(publish, /node scripts\/build-client\.mjs/, 'publish.yml must rebuild client.js')
    assert.ok(!publish.includes('IUI_BUILT_AT='), 'publish.yml must not reconstruct the build stamp by grep')
    assert.ok(!publish.includes('--strict'), 'the build is strict by default; the flag must not be needed')
    assert.match(publish, /node --check client\.js/, 'publish.yml must syntax-check the artifact')
    assert.match(publish, /node scripts\/probe-client\.mjs/, 'publish.yml must execute the artifact with probe-client')
  })

  test('releases are serialized and pin the npm major', () => {
    assert.match(publish, /\n\s*group: publish\n/, 'publish.yml must serialize releases in one concurrency group')
    assert.ok(!publish.includes('publish-${{'), 'the concurrency group must not be per-tag')
    assert.match(publish, /npm install -g npm@11\b/, 'publish.yml must pin the npm major')
    assert.ok(!publish.includes('npm@latest'), 'publish.yml must not install npm@latest')
  })

  test('prereleases use the next dist-tag and every publish verifies it', () => {
    assert.match(publish, /npm publish --tag "\$dist_tag"/, 'publish.yml must pass an explicit dist-tag')
    assert.match(publish, /dist_tag=next/, 'a prerelease must use the next dist-tag')
    assert.match(publish, /dist_tag=latest/, 'a stable release must use the latest dist-tag')
    assert.match(publish, /dist-tags\.\$\{dist_tag\}/, 'publish.yml must verify the dist-tag after publishing')
    assert.match(publish, /IUI_MARKET_ENGINES_JSON/, 'publish.yml must pass the tagged manifest engines to the index updater')
  })

  test('pull requests and main run the same gate', () => {
    assert.match(ci, /^\s*pull_request:/m, 'ci.yml must run on pull requests')
    assert.match(ci, /branches: \[main\]/, 'ci.yml must run on pushes to main')
    assert.match(ci, /npm run check/, 'ci.yml must run the full local gate')
    assert.match(ci, /git diff --exit-code -- client\.js/, 'ci.yml must fail on a stale client.js')
  })

  test('the local gate matches the release gate', () => {
    assert.equal(pkg.scripts.test, 'node --test', 'scripts.test must stay the plain suite')
    assert.equal(pkg.scripts.build, 'node scripts/build-client.mjs', 'scripts.build must be the strict build with no flag')
    assert.match(pkg.scripts.check, /node --check client\.js/, 'scripts.check must syntax-check the artifact')
    assert.match(pkg.scripts.check, /node scripts\/probe-client\.mjs/, 'scripts.check must execute the artifact')
    assert.match(pkg.scripts.check, /node --test/, 'scripts.check must run the suite')
  })
})
