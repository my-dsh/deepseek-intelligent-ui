// Phase B static re-checks (independent of the browser): package identity and the plugin
// manifest (docs/INTERFACES.md §2), the built artifact's integrity, the shipped icon and
// locales, and the §7 styling rules that can be checked from the stylesheet source.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { test, describe } from 'node:test'
import { REPO_ROOT, V1_COMPONENTS, FORBIDDEN_COMPONENTS } from './lib.mjs'

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8')
const exists = (rel) => existsSync(path.join(REPO_ROOT, rel))
const pkg = JSON.parse(read('package.json'))

describe('plugin manifest and built artifact (Phase B static)', () => {
  test('§2 package identity: name, exports and dsh bundle/client manifest', () => {
    assert.equal(pkg.name, '@my-dsh/dsh-intelligent-ui', 'package name must be @my-dsh/dsh-intelligent-ui')
    assert.ok(pkg.exports && typeof pkg.exports === 'object', 'package.json must declare exports')

    // every exports target must resolve to a real file
    for (const [key, target] of Object.entries(pkg.exports)) {
      const value = typeof target === 'string' ? target : target?.import ?? target?.default
      assert.equal(typeof value, 'string', `exports["${key}"] must be a string or {import/default}`)
      if (value.includes('*')) {
        const pattern = value.replace('./', '')
        const dir = path.dirname(pattern) || '.'
        const ext = path.extname(pattern).replace('*', '')
        const matches = existsSync(path.join(REPO_ROOT, dir))
          ? readdirSync(path.join(REPO_ROOT, dir)).filter((f) => f.endsWith(ext))
          : []
        assert.ok(matches.length > 0, `exports["${key}"] = ${value} matches no file in ${dir}`)
      } else {
        assert.ok(exists(value.slice(2)), `exports["${key}"] = ${value} does not exist`)
      }
    }
    for (const key of ['.', './client', './icon', './package.json']) {
      assert.ok(key in pkg.exports, `package.json must export "${key}"`)
    }

    // dsh bundle patch
    const patch = pkg.dsh?.bundle?.patch
    assert.equal(typeof patch, 'string', 'dsh.bundle.patch must be a string (§2/§9.3)')
    assert.ok(exists(patch.slice(2)), `dsh.bundle.patch ${patch} does not exist`)
    const patchText = read(patch.slice(2))
    assert.match(patchText, /@my-dsh\/dsh-intelligent-ui/, 'cordis.patch.yml must insert the bundle by package name')
    assert.match(patchText, /insert:/, 'cordis.patch.yml must be an insert patch')

    // dsh client
    const client = pkg.dsh?.client
    assert.ok(client && typeof client === 'object', 'dsh.client must be an object')
    assert.equal(client.platform, 'web', 'dsh.client.platform must be "web"')
    assert.ok(Array.isArray(client.inject) && client.inject.length > 0, 'dsh.client.inject must list the client packages')
    for (const dep of client.inject) assert.equal(typeof dep, 'string', 'dsh.client.inject entries must be strings')
  })

  test('§9.3 icon.svg is a real, small SVG', () => {
    assert.ok(exists('icon.svg'), 'icon.svg must exist')
    const bytes = statSync(path.join(REPO_ROOT, 'icon.svg')).size
    assert.ok(bytes > 0 && bytes < 256 * 1024, `icon.svg must be < 256 KiB, got ${bytes} bytes`)
    const svg = read('icon.svg')
    assert.match(svg.trimStart(), /^(<\?xml[^>]*\?>\s*)?<svg[\s>]/, 'icon.svg must start with an <svg> root element')
    assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'icon.svg must declare the SVG namespace')
    assert.match(svg, /viewBox="[^"]+"/, 'icon.svg must define a viewBox')
    assert.match(svg, /<\/svg>\s*$/, 'icon.svg must be closed')
    assert.ok(!/<script[\s>]/i.test(svg), 'icon.svg must not contain script')
    assert.ok(!/\son\w+=/i.test(svg), 'icon.svg must not contain inline event handlers')
  })

  test('§6.6/§9.3 locale/en.json and locale/zh.json carry meta.title and meta.description', () => {
    for (const lang of ['en', 'zh']) {
      const file = `locale/${lang}.json`
      assert.ok(exists(file), `${file} must exist`)
      const json = JSON.parse(read(file))
      assert.ok(json.meta && typeof json.meta === 'object', `${file} must define meta`)
      for (const key of ['title', 'description']) {
        assert.equal(typeof json.meta[key], 'string', `${file} meta.${key} must be a string`)
        assert.ok(json.meta[key].trim().length > 0, `${file} meta.${key} must not be empty`)
      }
    }
    const en = JSON.parse(read('locale/en.json')).meta
    const zh = JSON.parse(read('locale/zh.json')).meta
    assert.notEqual(en.title, zh.title, 'the zh title should be translated, not copied from en')
  })

  test('client.js is a self-contained bundle that names all 48 components', () => {
    const bundle = read('client.js')
    assert.ok(exists('client.js'), 'client.js must exist')
    assert.equal((bundle.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1, 'client.js must contain exactly one module handoff')
    assert.ok(bundle.includes('"@my-dsh/dsh-intelligent-ui"') || bundle.includes("'@my-dsh/dsh-intelligent-ui'"), 'client.js must carry the package module id')
    assert.ok(!/^\s*import\s/m.test(bundle), 'the bundle must not contain leftover import statements')
    assert.ok(bundle.includes('IUI_CSS'), 'client.js must carry the concatenated stylesheet constant')

    const missing = Object.keys(V1_COMPONENTS).filter((name) => !new RegExp(`\\b${name}\\b`).test(bundle))
    assert.deepEqual(missing, [], `client.js does not mention these v1 components: ${missing.join(', ')}`)
    assert.ok(bundle.includes('iui-'), 'client.js must carry iui- prefixed classes')
    assert.ok(bundle.includes('var(--dsw-alias-'), 'client.js CSS must resolve host theme tokens')

    // §6.6 frozen locale key set must exist in the generated bundle
    for (const key of ['row.title', 'row.preparing', 'row.copy', 'row.copied', 'row.inspect', 'error.title', 'error.empty', 'error.invalid', 'timer.start', 'timer.pause', 'timer.reset', 'image.failed', 'chart.empty', 'unknown.component']) {
      assert.ok(bundle.includes(key), `client.js must define the frozen locale key "${key}"`)
    }
    for (const forbidden of FORBIDDEN_COMPONENTS) {
      assert.ok(!new RegExp(`\\b${forbidden}\\b\\s*:`).test(bundle), `${forbidden} is not in v1 and must not be registered in the bundle`)
    }
  })

  test('§7 styling source: host tokens are read only, literals stay in --iui-c-*', (t) => {
    const cssDir = path.join(REPO_ROOT, 'src', 'client', 'css')
    const files = readdirSync(cssDir).filter((f) => f.endsWith('.css')).sort()
    assert.ok(files.length >= 3, `expected the component stylesheets, found ${files.join(', ')}`)
    const declaredTokens = []
    const literalOutsidePalette = []
    const tokenWritesInDark = []
    const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
    for (const file of files) {
      const text = readFileSync(path.join(cssDir, file), 'utf8')
      const lines = text.split('\n')
      // brace depth inside @media (prefers-color-scheme: dark) / [data-theme="dark"] blocks
      let darkDepth = -1
      let depth = 0
      let inDark = false
      for (const [i, line] of lines.entries()) {
        const opens = (line.match(/\{/g) ?? []).length
        const closes = (line.match(/\}/g) ?? []).length
        if (/prefers-color-scheme:\s*dark/.test(line) || /\[data-theme=["']dark["']\]/.test(line)) {
          darkDepth = depth
          inDark = true
        }
        const decl = /^\s*(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/.exec(line)
        if (decl) {
          const [, prop, value] = decl
          if (prop.startsWith('--dsw-')) declaredTokens.push(`${file}:${i + 1} defines host token ${prop}`)
          if (LITERAL.test(value) && !prop.startsWith('--iui-c-')) {
            literalOutsidePalette.push(`${file}:${i + 1} ${prop}: ${value.trim()}`)
          }
          if (inDark && prop.startsWith('--dsw-')) tokenWritesInDark.push(`${file}:${i + 1} ${prop}`)
        }
        depth += opens - closes
        if (inDark && depth <= darkDepth) inDark = false
      }
    }
    t.diagnostic(`[css] ${files.length} stylesheets; --iui-c-* palette present: ${/--iui-c-/.test(readFileSync(path.join(cssDir, files[0]), 'utf8')) || files.some((f) => readFileSync(path.join(cssDir, f), 'utf8').includes('--iui-c-'))}`)
    assert.deepEqual(declaredTokens, [], `§7: the plugin must not define --dsw-* host tokens, only read them:\n${declaredTokens.join('\n')}`)
    assert.deepEqual(tokenWritesInDark, [], `§7: host tokens carry light/dark themselves — no prefers-color-scheme override may set --dsw-*:\n${tokenWritesInDark.join('\n')}`)
    assert.deepEqual(literalOutsidePalette, [], `§7: only artwork/data colours may use literals, and only in --iui-c-* custom properties:\n${literalOutsidePalette.join('\n')}`)
    const css = files.map((f) => readFileSync(path.join(cssDir, f), 'utf8')).join('\n')
    assert.ok(css.includes('--iui-c-'), 'the data/artwork palette must be defined as --iui-c-* on .iui-root')
    assert.ok(/prefers-color-scheme:\s*dark/.test(css), 'the --iui-c-* palette must have a dark override block')
    assert.ok(css.includes('[data-theme="dark"]') || css.includes("[data-theme='dark']"), 'the --iui-c-* palette must have a [data-theme="dark"] override block')
    assert.ok(!/position:\s*fixed/.test(css), '§7: the row must not use position:fixed')
    t.diagnostic('[css] §7 static styling checks: no --dsw-* definitions, no dark overrides of host tokens, no literals outside --iui-c-*')
  })
})
