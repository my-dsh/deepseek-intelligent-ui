// Build-script contract tests.
//
// Two layers:
//   1. transformFragment/lineStartModes unit tests, including the corruption cases the old
//      line-regex transform silently mishandled;
//   2. an end-to-end CLI test against a synthetic fixture project, asserting strictness and
//      the "unchanged tree rebuilds byte-identically" contract.
//
// The committed client.js is also checked against a rebuild with its own stamp, so a stale
// artifact fails `node --test` and not just CI.
import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BuildError,
  buildArtifact,
  lineStartModes,
  renderArtifact,
  stripStandaloneComments,
  transformFragment,
} from '../scripts/build-client.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(REPO_ROOT, 'scripts', 'build-client.mjs')

describe('build-client transform', () => {
  test('drops single- and multi-line imports and re-exports', () => {
    const source = [
      "import { a, b } from './x.js'",
      "import './side-effect.js'",
      'import {',
      '  c,',
      '  d,',
      "} from './y.js'",
      "export { e } from './z.js'",
      'export { f, g }',
      'export * from \'./w.js\'',
      'export const kept = 1',
    ].join('\n')
    const result = transformFragment(source, 'fixture.js')
    assert.match(result.text, /const kept = 1/)
    assert.doesNotMatch(result.text, /\bimport\b/)
    assert.doesNotMatch(result.text, /\bexport\b/)
    assert.deepEqual(result.declarations.map(entry => entry.name), ['kept'])
  })

  test('a single-line local export never swallows the code after it', () => {
    // Regression: the old transform treated `export { x }` as a multi-line re-export start
    // and dropped every line until the next lone `}`, deleting the function below it.
    const source = [
      'const x = 1',
      'export { x }',
      'function afterExport() { return x }',
      'const tail = 2',
    ].join('\n')
    const result = transformFragment(source, 'fixture.js')
    assert.match(result.text, /function afterExport\(\)/)
    assert.match(result.text, /const tail = 2/)
    assert.doesNotMatch(result.text, /\bexport\b/)
    assert.deepEqual(result.declarations.map(entry => entry.name), ['x', 'afterExport', 'tail'])
  })

  test('import/export-looking lines inside template literals are preserved', () => {
    const source = [
      'const sample = `',
      "import { notReal } from './nope.js'",
      'export const alsoNotReal = 1',
      '`',
      'export const real = 2',
    ].join('\n')
    const result = transformFragment(source, 'fixture.js')
    assert.match(result.text, /import \{ notReal \} from '\.\/nope\.js'/)
    assert.match(result.text, /export const alsoNotReal = 1/)
    assert.match(result.text, /const real = 2/)
  })

  test('import-looking lines inside block comments are preserved', () => {
    const source = [
      '/*',
      "import { notReal } from './nope.js'",
      '*/',
      'const real = 1',
    ].join('\n')
    const result = transformFragment(source, 'fixture.js')
    assert.match(result.text, /import \{ notReal \}/)
    assert.deepEqual(result.declarations.map(entry => entry.name), ['real'])
  })

  test('export default is a loud failure, not a silent strip', () => {
    assert.throws(() => transformFragment('export default 1', 'fixture.js'), BuildError)
  })

  test('an unsupported export form is a loud failure', () => {
    assert.throws(() => transformFragment('export @decorator class A {}', 'fixture.js'), BuildError)
  })

  test('var declarations are rejected', () => {
    assert.throws(() => transformFragment('var x = 1', 'fixture.js'), BuildError)
  })

  test('stripStandaloneComments only drops standalone comments', () => {
    const source = [
      '/**',
      ' * JSDoc block about the code.',
      ' */',
      '// a full-line comment',
      'const keep = 1 // inline stays',
      'const sample = `',
      '// not a comment inside a template',
      '`',
      'const marker = "/* not a comment */"',
    ].join('\n')
    const result = stripStandaloneComments(source)
    assert.doesNotMatch(result, /JSDoc block/)
    assert.doesNotMatch(result, /a full-line comment/)
    assert.match(result, /inline stays/)
    assert.match(result, /not a comment inside a template/)
    assert.match(result, /\/\* not a comment \*\//)
  })

  test('lineStartModes tracks template and block-comment lines', () => {
    const modes = lineStartModes(['const a = `', 'x', '`', '/*', 'y', '*/', 'const b = 1'].join('\n'))
    assert.deepEqual(modes.map(entry => entry.mode), ['code', 'template', 'template', 'code', 'block', 'block', 'code'])
  })
})

// --- end-to-end CLI fixture ---------------------------------------------------------------

/** Create a minimal but complete buildable project in a fresh temp directory. */
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'iui-build-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@fixture/bundle', version: '9.9.9' }, null, 2))
  mkdirSync(join(root, 'scripts'), { recursive: true })
  cpSync(SCRIPT, join(root, 'scripts', 'build-client.mjs'))
  const fragments = {
    'src/lang/core.js': "/** Fixture documentation. */\nexport const CORE = 'core'\n",
    'src/client/00-namespace.js': "const IUI = { inject: [], apply: null }\n",
    'src/client/10-locales.js': "const en = {}\nconst zh = {}\n",
    'src/client/20-store.js': 'function store() {}\n',
    'src/client/30-render.js': 'function render() {}\n',
    'src/client/components/one.js': "iuiRegisterComponents({ One: {} })\n",
    'src/client/90-apply.js': 'IUI.apply = () => {}\n',
    'src/client/99-diagnostics.js': 'window.__DSH_INTELLIGENT_UI__ = {}\n',
    'src/client/css/base.css': '.iui-root { color: red; }\n',
  }
  for (const [file, contents] of Object.entries(fragments)) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), contents)
  }
  return root
}

/** Run the fixture's build script. */
function runBuild(root) {
  return spawnSync(process.execPath, [join(root, 'scripts', 'build-client.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, IUI_BUILT_AT: '' },
  })
}

describe('build-client CLI', () => {
  test('writes once, then leaves an unchanged tree byte-identical', () => {
    const root = makeFixture()
    try {
      const first = runBuild(root)
      assert.equal(first.status, 0, first.stderr)
      const artifact = join(root, 'client.js')
      const bytes = readFileSync(artifact)
      assert.match(bytes.toString(), /fixture\/bundle/)
      assert.match(bytes.toString(), /version: "9\.9\.9"/)
      assert.doesNotMatch(bytes.toString(), /Fixture documentation/)

      const second = runBuild(root)
      assert.equal(second.status, 0, second.stderr)
      assert.match(second.stdout, /up to date/)
      assert.deepEqual(readFileSync(artifact), bytes, 'an unchanged tree must not rewrite client.js')

      writeFileSync(join(root, 'src/lang/core.js'), "export const CORE = 'changed'\n")
      const third = runBuild(root)
      assert.equal(third.status, 0, third.stderr)
      const changed = readFileSync(artifact)
      assert.notDeepEqual(changed, bytes, 'a changed source must produce a new artifact')
      assert.match(changed.toString(), /changed/)

      const fourth = runBuild(root)
      assert.equal(fourth.status, 0, fourth.stderr)
      assert.deepEqual(readFileSync(artifact), changed, 'the new artifact must itself be idempotent')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('--keep-comments preserves the source documentation', () => {
    const root = makeFixture()
    try {
      const result = spawnSync(process.execPath, [join(root, 'scripts', 'build-client.mjs'), '--keep-comments'], {
        cwd: root,
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr)
      assert.match(readFileSync(join(root, 'client.js'), 'utf8'), /Fixture documentation/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('a missing fragment fails and writes nothing', () => {
    const root = makeFixture()
    try {
      const before = runBuild(root)
      assert.equal(before.status, 0, before.stderr)
      const bytes = readFileSync(join(root, 'client.js'))
      rmSync(join(root, 'src/client/99-diagnostics.js'))
      const after = runBuild(root)
      assert.notEqual(after.status, 0)
      assert.match(after.stderr, /missing fragment/)
      assert.deepEqual(readFileSync(join(root, 'client.js')), bytes, 'a failed build must not touch client.js')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('an unknown flag fails instead of being ignored', () => {
    const root = makeFixture()
    try {
      const result = spawnSync(process.execPath, [join(root, 'scripts', 'build-client.mjs'), '--allow-partial'], {
        cwd: root,
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /unknown argument/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('committed artifact', () => {
  test('client.js matches a rebuild with its committed stamp', () => {
    const committed = readFileSync(join(REPO_ROOT, 'client.js'), 'utf8')
    const stamp = /builtAt: "([^"]*)"/.exec(committed)?.[1]
    assert.ok(stamp, 'client.js must carry a builtAt stamp')
    const rebuilt = renderArtifact(buildArtifact(), stamp)
    assert.equal(rebuilt, committed, 'client.js is stale — run node scripts/build-client.mjs and commit it')
  })
})
