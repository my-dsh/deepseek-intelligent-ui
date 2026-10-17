#!/usr/bin/env node
/**
 * Assemble `client.js` — the browser artifact of the Intelligent UI bundle — from the
 * plain-JavaScript fragments under `src/lang` and `src/client`.
 *
 * The artifact is one `window.__ModuleLoader__.load({ id, factory })` handoff whose factory
 * closure holds every fragment. There is no bundler and no runtime dependency beyond
 * `react`, which the factory requires from the page's own module table.
 *
 * Rules (see docs/INTERFACES.md §4):
 *   - phase order below is the concatenation order;
 *   - `import` lines are dropped (`src/lang` may only import its own `./` relatives);
 *   - a leading `export ` is stripped, so the same files stay importable ESM for the Host
 *     half and node tests;
 *   - `export default`, a leftover `import`/`export`, a `var` declaration, or a duplicate
 *     top-level name is a build error;
 *   - a `.js` file under `src/` that no phase claims is a build error.
 *
 * Usage: node scripts/build-client.mjs [--strict]
 *   --strict  also fail when any phase file is missing (integration/CI mode)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** Bundle identity, read from the manifest so name and version cannot drift from it. */
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PACKAGE_NAME = MANIFEST.name
const PACKAGE_VERSION = MANIFEST.version
const OUT = join(ROOT, 'client.js')
const STRICT = process.argv.includes('--strict')

/** Hard build failure. */
function fail(message) {
  console.error(`build-client: ${message}`)
  process.exit(1)
}

/** Every file under `dir` whose name ends with `ext`, as sorted repo-relative POSIX paths. */
function walk(dir, ext) {
  const start = join(ROOT, dir)
  let entries
  try {
    entries = readdirSync(start, { withFileTypes: true, recursive: true })
  } catch {
    return []
  }
  const found = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(ext)) continue
    const parent = entry.parentPath ?? entry.path
    found.push(relative(ROOT, join(parent, entry.name)).split(sep).join('/'))
  }
  return found.sort()
}

// --- phase plan -------------------------------------------------------------------------

const langFiles = walk('src/lang', '.js').filter(file => file !== 'src/lang/index.js')
const componentFiles = walk('src/client/components', '.js')
const cssFiles = walk('src/client', '.css')

const PHASES = [
  { name: 'lang', files: langFiles },
  { name: 'namespace', files: ['src/client/00-namespace.js'] },
  { name: 'locales', files: ['src/client/10-locales.js'] },
  { name: 'store', files: ['src/client/20-store.js'] },
  { name: 'render', files: ['src/client/30-render.js'] },
  { name: 'components', files: componentFiles },
  { name: 'apply', files: ['src/client/90-apply.js'] },
  { name: 'diagnostics', files: ['src/client/99-diagnostics.js'] },
]

const claimed = new Set(PHASES.flatMap(phase => phase.files))
claimed.add('src/lang/index.js')

const allSources = [...walk('src/lang', '.js'), ...walk('src/client', '.js')]
const orphans = allSources.filter(file => !claimed.has(file))
if (orphans.length > 0) {
  fail(`no build phase claims: ${orphans.join(', ')} — add it to PHASES in scripts/build-client.mjs`)
}

const declared = PHASES.flatMap(phase => phase.files)
const missing = declared.filter(file => !allSources.includes(file))
if (missing.length > 0) {
  const message = `missing fragment(s): ${missing.join(', ')}`
  if (STRICT) fail(message)
  console.warn(`build-client: warning: ${message} (partial build)`)
  const missingSet = new Set(missing)
  for (const phase of PHASES) phase.files = phase.files.filter(file => !missingSet.has(file))
}

// --- transform --------------------------------------------------------------------------

const EXPORTED = /^export\s+(async\s+function|function|const|let|class)\s+/
const REEXPORT = /^export\s*\{[^}]*\}\s*from\s*['"][^'"]*['"];?\s*$/
const DECLARATION = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/

/* Import and re-export statements may span lines; drop them whole, and fail loudly on an
 * unterminated one instead of leaking the tail into the bundle as stray syntax. */
const IMPORT_START = /^\s*import\b/
const IMPORT_END = /\bfrom\s*['"][^'"]*['"]\s*;?\s*$|^\s*import\s*['"][^'"]*['"]\s*;?\s*$/
const REEXPORT_START = /^\s*export\s*\{/
const REEXPORT_END = /^\s*\}\s*(?:from\s*['"][^'"]*['"]\s*)?;?\s*$/

const owners = new Map()
const fragments = []

for (const phase of PHASES) {
  for (const file of phase.files) {
    const source = readFileSync(join(ROOT, file), 'utf8')
    const lines = source.split('\n')
    const kept = []
    /** When set, we are inside a multi-line import/re-export that must be dropped whole. */
    let dropping = null
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (dropping === 'import') {
        if (IMPORT_END.test(line)) dropping = null
        continue
      }
      if (dropping === 'reexport') {
        if (REEXPORT_END.test(line)) dropping = null
        continue
      }
      if (IMPORT_START.test(line)) {
        if (!IMPORT_END.test(line)) dropping = 'import'
        continue
      }
      if (REEXPORT.test(line)) continue
      if (REEXPORT_START.test(line)) {
        dropping = 'reexport'
        continue
      }
      if (/^\s*export\s+default\b/.test(line)) fail(`${file}:${index + 1}: export default is not supported`)
      if (/^var\s/.test(line)) fail(`${file}:${index + 1}: use const or let, not var`)
      kept.push(EXPORTED.test(line) ? line.replace(/^export\s+/, '') : line)
    }
    if (dropping !== null) fail(`${file}: unterminated ${dropping} statement at end of file`)
    const text = kept.join('\n')
    /* Compile each fragment on its own: a half-written or syntactically broken fragment must
     * fail here, naming the file, instead of producing a client.js that only dies in the page. */
    try {
      // eslint-disable-next-line no-new-func -- syntax gate only; the body is never called.
      new Function(text)
    } catch (error) {
      fail(`${file}: fragment does not compile — ${error instanceof Error ? error.message : String(error)}`)
    }
    for (const [index, line] of text.split('\n').entries()) {
      if (/^\s*(import|export)\b/.test(line)) {
        fail(`${file}:${index + 1}: import/export left after transform: ${line.trim()}`)
      }
      const match = DECLARATION.exec(line)
      if (match === null) continue
      const name = match[1] ?? match[2]
      const previous = owners.get(name)
      if (previous !== undefined) {
        fail(`duplicate top-level declaration "${name}" in ${file} and ${previous}`)
      }
      owners.set(name, file)
    }
    fragments.push({ phase: phase.name, file, text })
  }
}

// --- stylesheet -------------------------------------------------------------------------

const css = cssFiles
  .map(file => `/* ${file} */\n${readFileSync(join(ROOT, file), 'utf8').trim()}`)
  .join('\n')

// --- emit -------------------------------------------------------------------------------

// `IUI_BUILT_AT` pins the stamp so a release check can rebuild byte-identically and
// prove the committed artifact still matches the sources.
const builtAt = process.env.IUI_BUILT_AT ?? new Date().toISOString()
const banner = [
  '/*',
  ` * ${PACKAGE_NAME} — generated by scripts/build-client.mjs. Do not edit by hand.`,
  ` * built: ${builtAt}`,
  ...fragments.map(fragment => ` *   ${fragment.phase.padEnd(12)} ${fragment.file}`),
  ' */',
].join('\n')

const body = fragments
  .map(fragment => `\n// ---- ${fragment.file} ----\n${fragment.text.trim()}\n`)
  .join('')

const output = `${banner}
window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_NAME)},
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const IUI_BUILD = { version: ${JSON.stringify(PACKAGE_VERSION)}, builtAt: ${JSON.stringify(builtAt)}, fragments: ${JSON.stringify(fragments.map(fragment => fragment.file))} }
    const IUI_CSS = ${JSON.stringify(css)}
${body}
    return { inject: IUI.inject, apply: ctx => IUI.apply(ctx) }
  },
});
`

writeFileSync(OUT, output)

const bytes = Buffer.byteLength(output)
console.log(`build-client: wrote client.js (${bytes} bytes, ${fragments.length} fragments, ${cssFiles.length} stylesheets)`)
if (bytes > 512 * 1024) console.warn('build-client: warning: client.js exceeds 512 KiB')
