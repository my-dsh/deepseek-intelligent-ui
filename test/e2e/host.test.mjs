// Phase A harness: host-half contract checks (docs/INTERFACES.md §2, §8) against index.js.
// index.js imports only ./src/lang, so it loads outside the Harness; the Cordis context is
// a minimal mock that records what the plugin registers.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, describe } from 'node:test'
import { REPO_ROOT, expectSync, needLang } from './lib.mjs'

async function loadHost() {
  // needLang() first so a missing/failing src/lang reports the same clear reason.
  await needLang()
  try {
    return await import(new URL('../../index.js', import.meta.url).href)
  } catch (err) {
    assert.fail(`CANNOT VERIFY - importing index.js failed: ${err && err.message}`)
  }
}

function mockCtx() {
  const tools = []
  const sections = []
  const effectLabels = []
  const ctx = {
    effect(fn, label) {
      effectLabels.push(label)
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    tools: { register(spec) { tools.push(spec); return () => {} } },
    systemPrompt: { section(spec) { sections.push(spec); return () => {} } },
  }
  return { ctx, tools, sections, effectLabels }
}

function registerOnce(host, config) {
  const mock = mockCtx()
  expectSync(host.apply(mock.ctx, config), 'apply(ctx)')
  assert.equal(mock.tools.length, 1, `apply() must register exactly one tool, got ${mock.tools.length}`)
  return { ...mock, tool: mock.tools[0] }
}

const OUT_KEYS = ['ok', 'summary', 'statements', 'stateVariables', 'diagnostics']

function assertCanonicalValue(value, where) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${where}: execute must return the canonical object`)
  assert.deepEqual(Object.keys(value).sort(), [...OUT_KEYS].sort(), `${where}: §8 canonical value must be exactly {${OUT_KEYS.join(', ')}}`)
  assert.equal(typeof value.ok, 'boolean', `${where}: ok must be a boolean`)
  assert.equal(typeof value.summary, 'string', `${where}: summary must be a string`)
  assert.ok(Number.isInteger(value.statements), `${where}: statements must be an integer`)
  assert.equal(typeof value.stateVariables, 'string', `${where}: stateVariables must be a string`)
  assert.equal(typeof value.diagnostics, 'string', `${where}: diagnostics must be a string`)
}

const GOOD = `$name = "Ada"
root = Col([Title("Hello", "lg"), Input($name, "Name"), Button("Reset", @Reset())], 3)
`

describe('host half contract (Phase A, §8)', () => {
  test('§2/§8 plugin identity: name, inject, one tool named intelligent_ui', async () => {
    const host = await loadHost()
    assert.equal(host.name, 'intelligent-ui', 'plugin name must be "intelligent-ui"')
    assert.deepEqual(host.inject, ['tools', 'systemPrompt'], '§8 inject must be exactly ["tools","systemPrompt"]')
    assert.equal(typeof host.apply, 'function', 'apply must be exported')

    const { tool, sections, effectLabels } = registerOnce(host)
    assert.equal(tool.name, 'intelligent_ui', '§2 wire tool name must be intelligent_ui (and equal the toolview key)')
    assert.equal(typeof tool.execute, 'function', 'the tool must expose execute')
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 40, 'the tool description must teach the model when to call it')

    // §8 parameters
    const params = tool.parameters
    assert.ok(params && typeof params === 'object', '§8 parameters must be a JSON schema object')
    assert.equal(params.type, 'object')
    assert.ok(params.properties && params.properties.program, 'parameters must define program')
    assert.equal(params.properties.program.type, 'string')
    assert.ok(params.required?.includes('program'), 'program must be required')
    assert.ok(params.properties.title, 'parameters must define title')
    assert.ok(!params.required?.includes('title'), 'title must be optional')

    // §8 output
    assert.ok(tool.output && tool.output.schema, 'the tool must declare output.schema')
    assert.equal(typeof tool.output.render, 'function', 'the tool must declare output.render')
    assert.deepEqual(Object.keys(tool.output.schema.properties ?? {}).sort(), [...OUT_KEYS].sort(), 'output.schema must describe the flat canonical value')

    // §8 prompt section
    assert.equal(sections.length, 1, 'apply() must register exactly one prompt section (prompt defaults to on)')
    assert.equal(sections[0].name, 'tool:intelligent-ui', '§8 prompt section name must be tool:intelligent-ui')
    assert.equal(sections[0].order, 5500, '§8 prompt section order must be 5500')
    assert.equal(typeof sections[0].text, 'string')
    assert.ok(sections[0].text.length > 200, 'the prompt section text must be the full language section')
    assert.equal(effectLabels.length, 2, 'registrations must be wrapped in ctx.effect for disposal')
  })

  test('§8 execute returns the canonical value, renders text, and never throws', async () => {
    const host = await loadHost()
    const { tool } = registerOnce(host)

    const good = expectSync(tool.execute({ program: GOOD, title: 'Greeting' }), 'execute(good)')
    assertCanonicalValue(good, 'execute(good)')
    assert.equal(good.ok, true, `a clean program must be ok:true, diagnostics: ${good.diagnostics}`)
    assert.equal(good.statements, 2, `expected 2 statements, got ${good.statements}`)
    assert.equal(good.stateVariables, 'name', `expected stateVariables "name", got ${JSON.stringify(good.stateVariables)}`)
    assert.equal(good.diagnostics, '', `a clean program must have empty diagnostics, got ${JSON.stringify(good.diagnostics)}`)
    assert.ok(good.summary.includes('Greeting'), `summary must carry the title, got ${JSON.stringify(good.summary)}`)

    const rendered = expectSync(tool.output.render({ program: GOOD, title: 'Greeting' }, good), 'output.render')
    assert.ok(Array.isArray(rendered) && rendered.length === 1, '§8 output.render must return exactly one block')
    assert.equal(rendered[0].type, 'text', 'the block must be a text block')
    assert.equal(rendered[0].text, good.summary, 'the text block must summarise the outcome (the program text must be omitted)')
    assert.ok(!rendered[0].text.includes('root = Col'), 'the rendered text must not repeat the program')

    // §8 fatal problems: parse error, missing root, unknown name, too large -> ok:false
    const cases = [
      ['parse error (unbalanced parens)', { program: 'root = Col([Title("x", "lg")\n' }, /\)|expected|close/i],
      ['missing root', { program: 'title = Title("x", "lg")\n' }, /root/i],
      ['unknown component', { program: 'root = Col([Markdown("## hi")], 1)\n' }, /unknown component/i],
      ['unknown @function', { program: 'root = Col([Text(@Nope(1))], 1)\n' }, /unknown function/i],
      ['named arguments', { program: 'root = Title(text: "x")\n' }, /named/i],
      ['empty program', { program: '' }, /program|empty/i],
      ['missing program argument', {}, /program|empty/i],
    ]
    for (const [label, args, pattern] of cases) {
      const value = expectSync(tool.execute(args), `execute(${label})`)
      assertCanonicalValue(value, `execute(${label})`)
      assert.equal(value.ok, false, `${label} must be ok:false. diagnostics: ${value.diagnostics}`)
      assert.ok(value.diagnostics.length > 0, `${label} must explain itself in diagnostics`)
      assert.match(value.diagnostics, pattern, `${label}: diagnostics should mention the real problem, got ${JSON.stringify(value.diagnostics)}`)
      const block = expectSync(tool.output.render(args, value), `output.render(${label})`)
      assert.equal(block[0].text, value.summary)
    }

    // a program at the size limit still renders; past it is rejected
    const big = 'root = Col([Title("x", "lg")], 1)\n' + Array.from({ length: 200 }, (_, i) => `v${i} = ${i}`).join('\n') + '\n'
    const bigValue = expectSync(tool.execute({ program: big }), 'execute(200 statements)')
    assertCanonicalValue(bigValue, 'execute(200 statements)')
    assert.equal(bigValue.ok, true, `a 201-statement program is well within the size limit and must render: ${bigValue.diagnostics}`)
    assert.equal(bigValue.statements, 201)

    const tooLarge = 'root = Col([Title("' + 'x'.repeat(70000) + '", "lg")], 1)\n'
    const largeValue = expectSync(tool.execute({ program: tooLarge }), 'execute(too large)')
    assertCanonicalValue(largeValue, 'execute(too large)')
    assert.equal(largeValue.ok, false, 'a program over maxProgramBytes must be rejected')
    assert.match(largeValue.diagnostics, /too large/i)

    // hostile input must never throw (§8)
    for (const program of ['\u0000', '{', 'root =', 'root = Col([', 'root = ' + 'Col(['.repeat(300), 'x'.repeat(100000), '@'.repeat(1000)]) {
      const value = expectSync(tool.execute({ program }), `execute(hostile ${JSON.stringify(program.slice(0, 20))})`)
      assertCanonicalValue(value, `execute(hostile ${JSON.stringify(program.slice(0, 20))})`)
    }
    for (const args of [undefined, null, {}, { program: null }, { program: 42 }, { program: GOOD, title: 7 }]) {
      const value = expectSync(tool.execute(args), `execute(${JSON.stringify(args)})`)
      assertCanonicalValue(value, `execute(${JSON.stringify(args)})`)
    }
  })

  test('§8 row config: prompt:false, maxProgramBytes and maxDiagnostics are honoured', async () => {
    const host = await loadHost()

    const off = registerOnce(host, { prompt: false })
    assert.equal(off.sections.length, 0, 'config.prompt:false must not register the prompt section')
    assert.equal(off.tools.length, 1, 'the tool is registered regardless of config.prompt')

    const small = registerOnce(host, { maxProgramBytes: 64 })
    const rejected = expectSync(small.tool.execute({ program: GOOD }), 'execute(maxProgramBytes=64)')
    assert.equal(rejected.ok, false, 'maxProgramBytes must be applied')
    assert.match(rejected.diagnostics, /too large/i)

    const noisy = Array.from({ length: 10 }, (_, i) => `root${i} = Missing${i}("x")`).join('\n') + '\nroot = Col([Title("x", "lg")], 1)\n'
    const capped = registerOnce(host, { maxDiagnostics: 3 })
    const value = expectSync(capped.tool.execute({ program: noisy }), 'execute(maxDiagnostics=3)')
    assertCanonicalValue(value, 'execute(maxDiagnostics=3)')
    const lines = value.diagnostics.split('\n')
    assert.ok(lines.length <= 4, `maxDiagnostics:3 must cap the list (3 lines plus the "more" note), got ${lines.length} lines: ${value.diagnostics}`)
    assert.match(value.diagnostics, /more diagnostic/i)
  })

  test('§8 the tool and the prompt section teach the same library (no drift)', async () => {
    const host = await loadHost()
    const lang = await needLang()
    const { tool, sections } = registerOnce(host)
    const sectionText = sections[0].text
    for (const signature of lang.COMPONENT_SIGNATURES) {
      assert.ok(sectionText.includes(signature.name), `prompt section missing component ${signature.name}`)
      assert.ok(tool.description.includes('openui-lang') || tool.description.includes('Intelligent UI'))
    }
    for (const signature of lang.FUNCTION_SIGNATURES) {
      assert.ok(new RegExp(`@${signature.name}\\b`).test(sectionText), `prompt section missing @${signature.name}`)
    }
    // the YAML patch must reference the package by its real name (§2)
    const patch = readFileSync(path.join(REPO_ROOT, 'cordis.patch.yml'), 'utf8')
    assert.match(patch, /dsh-intelligent-ui/, 'cordis.patch.yml must insert the bundle by package name')
  })
})
