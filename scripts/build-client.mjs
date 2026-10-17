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
 * The transform is line-based only for *where* a statement starts: every line first gets a
 * lexical mode (`code`, string, template, block comment), so an `import`/`export`-looking
 * line inside a multi-line template literal or a comment is never rewritten. A previous
 * plain-regex transform silently deleted such lines from the bundle.
 *
 * The build is strict: a missing fragment is always a failure. Rebuilding an unchanged tree
 * is a no-op — the committed `builtAt` stamp is reused when the rendered artifact would be
 * byte-identical, so `npm run check` never dirties a clean working tree. Set `IUI_BUILT_AT`
 * to pin the stamp explicitly.
 *
 * Assembled text drops standalone comment lines (JSDoc and full-line `//`), which is about
 * 16% of the artifact; code itself is never reformatted. Pass `--keep-comments` while
 * debugging a bundle-level problem to keep them.
 *
 * Usage: node scripts/build-client.mjs [--keep-comments]
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** Bundle identity, read from the manifest so name and version cannot drift from it. */
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PACKAGE_NAME = MANIFEST.name
const PACKAGE_VERSION = MANIFEST.version
const OUT = join(ROOT, 'client.js')

/** Raised for every expected build failure; the CLI prints it without a stack. */
export class BuildError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BuildError'
  }
}

/** Throw a {@link BuildError}. */
function fail(message) {
  throw new BuildError(message)
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
  fail(`missing fragment(s): ${missing.join(', ')} — the build is strict and writes nothing`)
}

// --- lexical scan -----------------------------------------------------------------------

const LEX_CODE = 'code'
const LEX_STRING = 'string'
const LEX_TEMPLATE = 'template'
const LEX_BLOCK = 'block'

/**
 * Classify the lexical state at the start of every line of a fragment.
 *
 * The transform only needs to know whether a line starts in real code, inside a
 * (possibly multi-line) template literal, or inside a block comment. Valid JavaScript
 * strings do not span lines unescaped; a leaked one means the syntax gate rejects the
 * fragment anyway.
 *
 * Regex literals are deliberately not modelled. A regex containing a quote, backtick or
 * comment opener can only make this scan more conservative (skip a transform), which shows
 * up as "import/export left after transform" instead of silently corrupting code.
 *
 * @param {string} source - fragment source.
 * @returns {{ mode: string, line: number }[]} state at each line start (0-based `line`).
 */
export function lineStartModes(source) {
  const lines = String(source).split('\n')
  /** @type {{ mode: string, line: number }[]} */
  const modes = []
  let mode = LEX_CODE
  let quote = ''
  for (let index = 0; index < lines.length; index += 1) {
    modes.push({ mode, line: index })
    const line = lines[index]
    let column = 0
    while (column < line.length) {
      const ch = line[column]
      if (mode === LEX_BLOCK) {
        if (ch === '*' && line[column + 1] === '/') {
          mode = LEX_CODE
          column += 2
          continue
        }
        column += 1
        continue
      }
      if (mode === LEX_STRING) {
        if (ch === '\\') {
          column += 2
          continue
        }
        if (ch === quote) {
          mode = LEX_CODE
          quote = ''
        }
        column += 1
        continue
      }
      if (mode === LEX_TEMPLATE) {
        if (ch === '\\') {
          column += 2
          continue
        }
        if (ch === '`') mode = LEX_CODE
        column += 1
        continue
      }
      if (ch === '/' && line[column + 1] === '/') break
      if (ch === '/' && line[column + 1] === '*') {
        mode = LEX_BLOCK
        column += 2
        continue
      }
      if (ch === "'" || ch === '"') {
        mode = LEX_STRING
        quote = ch
        column += 1
        continue
      }
      if (ch === '`') {
        mode = LEX_TEMPLATE
        column += 1
        continue
      }
      column += 1
    }
  }
  return modes
}

// --- transform --------------------------------------------------------------------------

const SINGLE_IMPORT = /^\s*import\s+(?:[\w$*{},\s]+?\s+from\s+)?['"][^'"]*['"]\s*;?\s*$/
const MULTI_IMPORT_START = /^\s*import\b/
const IMPORT_END = /\bfrom\s*['"][^'"]*['"]\s*;?\s*$|^\s*import\s*['"][^'"]*['"]\s*;?\s*$/
const SINGLE_REEXPORT = /^\s*export\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]\s*;?\s*$/
const SINGLE_LOCAL_EXPORT = /^\s*export\s*\{[^}]*\}\s*;?\s*$/
const SINGLE_STAR_REEXPORT = /^\s*export\s*\*\s*from\s*['"][^'"]*['"]\s*;?\s*$/
const MULTI_EXPORT_START = /^\s*export\s*\{/
const MULTI_EXPORT_END = /^\s*\}\s*(?:from\s*['"][^'"]*['"]\s*)?;?\s*$/
const EXPORTED_DECLARATION = /^(\s*)export\s+(async\s+function|function|const|let|class)\s+/
const DECLARATION = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/

/**
 * Strip a fragment's ESM wrapper for the bundle closure.
 *
 * `import`/re-export statements are dropped whole (single- or multi-line); a leading
 * `export ` is removed from declarations. Anything the transform does not understand is a
 * loud failure, never a silent line loss.
 *
 * @param {string} source - fragment source.
 * @param {string} [file] - repo-relative path, only used in error messages.
 * @returns {{ text: string, declarations: { name: string, line: number }[], kept: number, dropped: number }}
 *   transformed source, top-level declarations, and line accounting.
 */
export function transformFragment(source, file = '<fragment>') {
  const lines = String(source).split('\n')
  const modes = lineStartModes(source)
  const kept = []
  let dropped = 0
  /** @type {'import' | 'export' | null} */
  let dropping = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const where = `${file}:${index + 1}`
    if (dropping === 'import') {
      dropped += 1
      if (IMPORT_END.test(line)) dropping = null
      continue
    }
    if (dropping === 'export') {
      dropped += 1
      if (MULTI_EXPORT_END.test(line)) dropping = null
      continue
    }
    if (modes[index].mode !== LEX_CODE) {
      kept.push(line)
      continue
    }
    if (SINGLE_IMPORT.test(line)) {
      dropped += 1
      continue
    }
    if (MULTI_IMPORT_START.test(line)) {
      dropped += 1
      if (!IMPORT_END.test(line)) dropping = 'import'
      continue
    }
    if (SINGLE_REEXPORT.test(line) || SINGLE_LOCAL_EXPORT.test(line) || SINGLE_STAR_REEXPORT.test(line)) {
      dropped += 1
      continue
    }
    if (MULTI_EXPORT_START.test(line)) {
      dropped += 1
      if (!MULTI_EXPORT_END.test(line)) dropping = 'export'
      continue
    }
    if (/^\s*export\s+default\b/.test(line)) fail(`${where}: export default is not supported`)
    if (/^\s*var\s/.test(line)) fail(`${where}: use const or let, not var`)
    kept.push(EXPORTED_DECLARATION.test(line) ? line.replace(/^(\s*)export\s+/, '$1') : line)
  }
  if (dropping !== null) fail(`${file}: unterminated ${dropping} statement at end of file`)

  const text = kept.join('\n')
  const textModes = lineStartModes(text)
  /** @type {{ name: string, line: number }[]} */
  const declarations = []
  for (const [index, line] of text.split('\n').entries()) {
    if (textModes[index].mode !== LEX_CODE) continue
    if (/^\s*(import|export)\b/.test(line)) {
      fail(`${file}:${index + 1}: import/export left after transform: ${line.trim()}`)
    }
    const match = DECLARATION.exec(line)
    if (match === null) continue
    declarations.push({ name: match[1] ?? match[2], line: index + 1 })
  }
  return { text, declarations, kept: kept.length, dropped }
}

/**
 * Drop standalone comments from assembled code, one line at a time.
 *
 * Only a line whose first non-space token is `//` or `/*` is considered, plus every line
 * inside a block comment that started that way. Inline comments, comments inside template
 * literals and strings, and a `/*` block that starts mid-line are all left untouched, so the
 * pass cannot change program behaviour — it only removes documentation that belongs to the
 * sources. Line count is preserved (dropped lines become empty) to keep diagnostics stable.
 *
 * @param {string} source - transformed fragment or stylesheet text.
 * @returns {string} the same text without standalone comments.
 */
export function stripStandaloneComments(source) {
  const lines = String(source).split('\n')
  const modes = lineStartModes(source)
  const kept = []
  let inStandaloneBlock = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (inStandaloneBlock) {
      const end = line.indexOf('*/')
      if (end === -1) {
        kept.push('')
        continue
      }
      inStandaloneBlock = false
      // Anything after the closing marker is real code: keep the line rather than guess.
      kept.push(line.slice(end + 2).trim() === '' ? '' : line)
      continue
    }
    if (modes[index].mode !== LEX_CODE) {
      kept.push(line)
      continue
    }
    const trimmed = line.trimStart()
    if (trimmed.startsWith('//')) {
      kept.push('')
      continue
    }
    if (trimmed.startsWith('/*')) {
      const start = line.indexOf('/*')
      const end = line.indexOf('*/', start + 2)
      if (end === -1) {
        inStandaloneBlock = true
        kept.push('')
        continue
      }
      kept.push(line.slice(end + 2).trim() === '' ? '' : line)
      continue
    }
    kept.push(line)
  }
  return kept.join('\n')
}

// --- assemble ---------------------------------------------------------------------------

/**
 * Transform every phase fragment and collect the stylesheet.
 * @param {{ keepComments?: boolean }} [options] - keep standalone comments in the artifact.
 * @returns {{ fragments: { phase: string, file: string, text: string }[], css: string }}
 *   transformed fragments and the concatenated stylesheet.
 */
export function buildArtifact(options = {}) {
  const keepComments = options.keepComments === true
  const owners = new Map()
  const fragments = []
  for (const phase of PHASES) {
    for (const file of phase.files) {
      const source = readFileSync(join(ROOT, file), 'utf8')
      const result = transformFragment(source, file)
      const text = keepComments ? result.text : stripStandaloneComments(result.text)
      /* Compile each fragment on its own: a half-written or syntactically broken fragment must
       * fail here, naming the file, instead of producing a client.js that only dies in the page. */
      try {
        // eslint-disable-next-line no-new-func -- syntax gate only; the body is never called.
        new Function(text)
      } catch (error) {
        fail(`${file}: fragment does not compile — ${error instanceof Error ? error.message : String(error)}`)
      }
      for (const declaration of result.declarations) {
        const previous = owners.get(declaration.name)
        if (previous !== undefined) {
          fail(`duplicate top-level declaration "${declaration.name}" in ${file} and ${previous.file}`)
        }
        owners.set(declaration.name, { file, line: declaration.line })
      }
      fragments.push({ phase: phase.name, file, text })
    }
  }
  const css = cssFiles
    .map(file => `/* ${file} */\n${readFileSync(join(ROOT, file), 'utf8').trim()}`)
    .join('\n')
  return { fragments, css: keepComments ? css : stripStandaloneComments(css) }
}

/**
 * Render the complete `client.js` text for one build stamp.
 * @param {{ fragments: { phase: string, file: string, text: string }[], css: string }} artifact - built fragments.
 * @param {string} builtAt - ISO timestamp (or pinned stamp) for the banner and `IUI_BUILD`.
 * @returns {string} the artifact text.
 */
export function renderArtifact(artifact, builtAt) {
  const banner = [
    '/*',
    ` * ${PACKAGE_NAME} — generated by scripts/build-client.mjs. Do not edit by hand.`,
    ` * built: ${builtAt}`,
    ...artifact.fragments.map(fragment => ` *   ${fragment.phase.padEnd(12)} ${fragment.file}`),
    ' */',
  ].join('\n')
  const body = artifact.fragments
    .map(fragment => `\n// ---- ${fragment.file} ----\n${fragment.text.trim()}\n`)
    .join('')
  return `${banner}
window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_NAME)},
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const IUI_BUILD = { version: ${JSON.stringify(PACKAGE_VERSION)}, builtAt: ${JSON.stringify(builtAt)}, fragments: ${JSON.stringify(artifact.fragments.map(fragment => fragment.file))} }
    const IUI_CSS = ${JSON.stringify(artifact.css)}
${body}
    return { inject: IUI.inject, apply: ctx => IUI.apply(ctx) }
  },
});
`
}

/** Read the `builtAt` stamp baked into the current artifact, when it has one. */
function committedStamp() {
  if (!existsSync(OUT)) return null
  const match = /builtAt: "([^"]*)"/.exec(readFileSync(OUT, 'utf8'))
  return match === null ? null : match[1]
}

/**
 * Build and write `client.js`; a tree whose rendered output is unchanged is left untouched.
 * @param {{ builtAt?: string, log?: (message: string) => void }} [options] - stamp override and logger.
 * @returns {{ wrote: boolean, bytes: number, builtAt: string, fragments: number, cssFiles: number }} outcome.
 */
export function build(options = {}) {
  const log = options.log ?? (() => {})
  const artifact = buildArtifact({ keepComments: options.keepComments === true })
  const existing = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null
  const envStamp = typeof process.env.IUI_BUILT_AT === 'string' && process.env.IUI_BUILT_AT !== ''
    ? process.env.IUI_BUILT_AT
    : null
  const pinned = options.builtAt ?? envStamp

  if (pinned === null && existing !== null) {
    const stamp = committedStamp()
    if (stamp !== null) {
      const candidate = renderArtifact(artifact, stamp)
      if (candidate === existing) {
        log(`build-client: client.js is up to date (${Buffer.byteLength(existing)} bytes, ${artifact.fragments.length} fragments, ${cssFiles.length} stylesheets)`)
        return { wrote: false, bytes: Buffer.byteLength(existing), builtAt: stamp, fragments: artifact.fragments.length, cssFiles: cssFiles.length }
      }
    }
  }

  const builtAt = pinned ?? new Date().toISOString()
  const output = renderArtifact(artifact, builtAt)
  writeFileSync(OUT, output)
  const bytes = Buffer.byteLength(output)
  log(`build-client: wrote client.js (${bytes} bytes, ${artifact.fragments.length} fragments, ${cssFiles.length} stylesheets)`)
  if (bytes > 512 * 1024) log('build-client: warning: client.js exceeds 512 KiB')
  return { wrote: true, bytes, builtAt, fragments: artifact.fragments.length, cssFiles: cssFiles.length }
}

/** CLI entry; only runs when this file is executed directly (tests import the helpers). */
function main() {
  const known = new Set(['--strict', '--keep-comments'])
  const unknown = process.argv.slice(2).filter(arg => !known.has(arg))
  if (unknown.length > 0) {
    fail(`unknown argument(s): ${unknown.join(' ')} — usage: node scripts/build-client.mjs [--keep-comments] (strict is the default; --strict is accepted for compatibility)`)
  }
  if (process.argv.includes('--strict')) {
    console.warn('build-client: --strict is the default now; the flag is accepted but no longer needed')
  }
  build({ keepComments: process.argv.includes('--keep-comments'), log: message => console.log(message) })
}

const invokedDirectly = process.argv[1] !== undefined
  && existsSync(process.argv[1])
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    console.error(`build-client: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
