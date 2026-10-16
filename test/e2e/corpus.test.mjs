// Phase A harness: adversarial openui-lang program corpus.
//
// Runs with `node --test test/` (or `node --test test/e2e/`). It imports the frozen barrel
// src/lang/index.js and, for every fixture in test/programs, asserts the contract in
// docs/INTERFACES.md §5: parse diagnostics, AST shape, root descriptor, evaluateProgram
// never throws and never mutates the caller's state, stateDefaults is present, and every
// component name used exists in COMPONENT_SIGNATURES.
//
// If src/lang/index.js does not exist yet the suite fails loudly with a single readable
// reason per test instead of crashing the runner.
import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import {
  ACTION_NAMES,
  FORBIDDEN_COMPONENTS,
  V1_COMPONENTS,
  V1_FUNCTIONS,
  assertDiagnosticShape,
  collectCalls,
  collectStrValues,
  describeDiagnostics,
  errorCount,
  expectSync,
  exprDepth,
  isElementDescriptor,
  needLang,
  programFiles,
  readProgram,
  snapshot,
} from './lib.mjs'

const V1_FUNCTION_SIGNATURE_NAMES = new Set([...V1_FUNCTIONS, 'Each'])

// One sentinel state object shared by the purity checks. Every $variable used anywhere in
// the corpus is seeded with a value that differs from the program's own default, so a
// program that ignores `options.state` and a program that mutates it are both caught.
const SENTINEL_STATE = {
  name: 'Grace', notes: 'note', region: 'apac', mode: 'annual', volume: 9, agree: true,
  plan: 'starter', when: '2030-01-01', tier: 'silver', score: 77, active: false,
  rows: [{ region: 'X', revenue: 1, units: 2, sku: 'Z', qty: 9 }],
  known: 1, total: 5, hungry: ['Zed'], items: [{ name: 'Zed', qty: 9 }],
  year: [{ year: 2000, revenue: 1, cost: 1 }], mix: [{ channel: 'X', amount: 1 }],
  values: [9], people: [{ name: 'Z', age: 9 }], cart: ['zed'], label: 'zed',
  start: '2020-01-01', end: '2020-02-01',
  sales: [{ region: 'X', product: 'Alpha', amount: 1 }], prices: [9],
  a: 6, b: 4, c: 2, flag: false, text: 'z', seed: 3, on: false, answer: 'b',
  level: 1, step: 'two',
}

// file -> expectations. Fields left out are not asserted.
//   parseOk / parseClean / minErrorDiagnostics / rootName / statementCount
//   checkComponents (default true)  expectCallNames  strings
//   evalClean / evalErrors / evalOk / includes / notIncludes
//   expectDefaultIncludes  expectStateUse { state, includes, notIncludes }  minDepth
const CORPUS = [
  { file: '01-text.oui', group: 'text', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['Quarterly business review', 'On track', 'https://example.com/report', 'Summary deck'] },
  { file: '02-layout.oui', group: 'layout', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['Layout gallery', 'Popover content appears on click.'] },
  { file: '03-inputs.oui', group: 'inputs', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['New subscription', 'Acme Inc.'] },
  { file: '04-media-data.oui', group: 'media-data', parseOk: true, parseClean: true, rootName: 'root', includes: ['Media and data', 'https://example.com/chart.png'] },
  { file: '05-svg-drawing.oui', group: 'drawing', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['Skyline study', '0 0 320 200'] },
  { file: '06-play.oui', group: 'play', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['Study deck', 'What does @Count do?'] },
  { file: '07-bindings.oui', group: 'bindings', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['@Set and @Reset'], expectDefaultIncludes: ['42'], expectStateUse: { state: { score: 77 }, includes: ['77'], notIncludes: ['42'] } },
  { file: '08-each.oui', group: 'each', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, expectDefaultIncludes: ['Apples', 'Bread'] },
  { file: '09-charts.oui', group: 'charts', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['bar', 'line', 'area', 'pie', 'donut', 'scatter'] },
  { file: '10-functions-math.oui', group: 'functions-math', parseOk: true, parseClean: true, rootName: 'root' },
  { file: '11-functions-collections.oui', group: 'functions-collections', parseOk: true, parseClean: true, rootName: 'root' },
  { file: '12-functions-text.oui', group: 'functions-text', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['HELLO', 'world', 'a / b / c', '007', 'fallback', 'a+b+c'] },
  { file: '13-functions-date.oui', group: 'functions-date', parseOk: true, parseClean: true, rootName: 'root', includes: ['Date functions', '2020-01-01 to 2020-02-01'], expectDefaultIncludes: ['2026-01-15 to 2026-07-01'] },
  { file: '14-functions-data.oui', group: 'functions-data', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, expectDefaultIncludes: ['EMEA'] },
  { file: '15-op-precedence.oui', group: 'operators', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['Operator precedence', 'z6 and 10 end', 'n3', 'not ascending', 'null ok'], expectDefaultIncludes: ['ascending', 'x2 and 5 end'] },
  { file: '16-edge-empty.oui', group: 'edge-empty', expectEmpty: true, rootName: null },
  { file: '17-edge-missing-root.oui', group: 'edge-missing-root', rootName: null, statementCount: 2 },
  { file: '18-edge-unbalanced.oui', group: 'edge-unbalanced', parseOk: false, minErrorDiagnostics: 1 },
  { file: '19-edge-unknown-component.oui', group: 'edge-unknown-component', rootName: 'root', checkComponents: false, expectCallNames: FORBIDDEN_COMPONENTS },
  { file: '20-edge-unknown-function.oui', group: 'edge-unknown-function', rootName: 'root', checkComponents: false, expectCallNames: ['Nope', 'AlsoMissing'] },
  { file: '21-edge-cycle.oui', group: 'edge-cycle', parseOk: true, parseClean: true, rootName: 'root', evalErrors: 1, evalOk: false },
  { file: '22-edge-200-statements.oui', group: 'edge-200-statements', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, statementCount: 200 },
  { file: '23-edge-nonascii.oui', group: 'edge-nonascii', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['日本語', '한국어', 'Ελληνικά', 'Café', '🚀', '👨‍👩‍👧‍👦', 'Ünïcödé'] },
  { file: '24-edge-deep-nesting.oui', group: 'edge-deep-nesting', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, minDepth: 31, includes: ['deep'] },
  { file: '25-edge-named-args.oui', group: 'edge-named-args', parseOk: false, minErrorDiagnostics: 1 },
  { file: '26-edge-strings.oui', group: 'edge-strings', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, strings: ['newline:\nsecond line', 'quote:" and backslash:\\ and slash:/', 'tab:\there'] },
  { file: '27-kitchen-sink.oui', group: 'kitchen-sink', parseOk: true, parseClean: true, rootName: 'root', evalClean: true, includes: ['Kitchen sink', '48 components'] },
  { file: '28-edge-unknown-ref.oui', group: 'edge-unknown-ref', parseOk: true, parseClean: true, rootName: 'root', evalErrors: 1, evalOk: false },
]

function classify(bare, componentNames) {
  if (V1_FUNCTIONS.includes(bare) || bare === 'Each' || ACTION_NAMES.includes(bare)) return 'function'
  if (componentNames.has(bare)) return 'component'
  if (V1_COMPONENTS[bare]) return 'component-missing-from-signatures'
  return 'unknown'
}

async function checkProgram(entry, t) {
  const lang = await needLang()
  const componentNames = new Set(lang.COMPONENT_SIGNATURES.map((s) => s.name))
  const { text, bytes } = readProgram(entry.file)

  if (entry.expectEmpty) assert.equal(bytes, 0, `${entry.file}: this edge fixture must be a zero-byte file`)
  else assert.ok(bytes > 0, `${entry.file}: fixture is empty (bytes=${bytes})`)

  // ---- parse ----
  const parse = expectSync(lang.parseProgram(text), `parseProgram(${entry.file})`)
  assert.ok(parse && typeof parse === 'object', `${entry.file}: parseProgram must return an object`)
  assert.equal(typeof parse.ok, 'boolean', `${entry.file}: Program.ok must be a boolean`)
  assert.ok(Array.isArray(parse.statements), `${entry.file}: Program.statements must be an array`)
  assert.ok(Array.isArray(parse.diagnostics), `${entry.file}: Program.diagnostics must be an array`)
  assert.ok(parse.rootName === null || typeof parse.rootName === 'string', `${entry.file}: Program.rootName must be string|null, got ${JSON.stringify(parse.rootName)}`)
  parse.diagnostics.forEach((d, i) => assertDiagnosticShape(d, `${entry.file} parse.diagnostics[${i}]`))
  parse.statements.forEach((st, i) => {
    const where = `${entry.file} parse.statements[${i}]`
    assert.equal(st.kind, 'assign', `${where}: Statement.kind must be 'assign'`)
    assert.equal(typeof st.name, 'string', `${where}: Statement.name must be a string`)
    assert.equal(typeof st.state, 'boolean', `${where}: Statement.state must be a boolean`)
    assert.ok(st.expr && typeof st.expr === 'object', `${where}: Statement.expr must be a Node object`)
    assert.ok(Number.isInteger(st.line) && st.line >= 1, `${where}: Statement.line must be a positive integer, got ${JSON.stringify(st.line)}`)
  })
  if (entry.statementCount !== undefined) {
    assert.equal(parse.statements.length, entry.statementCount, `${entry.file}: expected exactly ${entry.statementCount} statements in source order, got ${parse.statements.length}`)
  }
  if (entry.parseOk !== undefined) assert.equal(parse.ok, entry.parseOk, `${entry.file}: parse.ok expected ${entry.parseOk}, got ${parse.ok}. diagnostics: ${describeDiagnostics(parse.diagnostics)}`)
  if (entry.parseClean) assert.equal(errorCount(parse.diagnostics), 0, `${entry.file}: expected a clean parse, got: ${describeDiagnostics(parse.diagnostics)}`)
  if (entry.minErrorDiagnostics) assert.ok(errorCount(parse.diagnostics) >= entry.minErrorDiagnostics, `${entry.file}: expected >=${entry.minErrorDiagnostics} error diagnostic(s), got: ${describeDiagnostics(parse.diagnostics)}`)
  if (entry.rootName !== undefined) assert.equal(parse.rootName, entry.rootName, `${entry.file}: Program.rootName expected ${JSON.stringify(entry.rootName)}, got ${JSON.stringify(parse.rootName)}`)

  if (entry.strings) {
    const values = collectStrValues(parse)
    for (const expected of entry.strings) {
      assert.ok(values.includes(expected), `${entry.file}: string literal ${JSON.stringify(expected)} was not parsed verbatim. Parsed string values: ${JSON.stringify(values)}`)
    }
  }

  // ---- names used by the program ----
  const calls = collectCalls(parse)
  const usedComponents = new Set()
  const unknownNames = []
  for (const call of calls) {
    const kind = classify(call.bare, componentNames)
    if (kind === 'component' || kind === 'component-missing-from-signatures') usedComponents.add(call.bare)
    if (kind === 'component-missing-from-signatures') unknownNames.push(call.bare)
    if (call.bare !== 'Each' && kind === 'unknown' && entry.checkComponents !== false) unknownNames.push(call.bare)
  }
  if (entry.checkComponents !== false) {
    assert.deepEqual(
      unknownNames,
      [],
      `${entry.file}: these call names are neither a v1 component in COMPONENT_SIGNATURES, a v1 @function, nor an action step: ${unknownNames.join(', ')} (INTERFACES.md §5.5/§6.4)`,
    )
    assert.equal(unknownNames.length, 0, `${entry.file}: unknown component name(s)`)
    for (const name of usedComponents) {
      assert.ok(componentNames.has(name), `${entry.file}: component ${name} is used but missing from COMPONENT_SIGNATURES`)
    }
  }
  for (const expected of entry.expectCallNames ?? []) {
    assert.ok(calls.some((c) => c.bare === expected), `${entry.file}: expected the program to call ${expected}(...), call names seen: ${[...new Set(calls.map((c) => c.bare))].join(', ')}`)
  }

  // ---- evaluate ----
  const stateBefore = snapshot(SENTINEL_STATE)
  const stateArg = JSON.parse(stateBefore)
  const result = expectSync(lang.evaluateProgram(parse, { state: stateArg }), `evaluateProgram(${entry.file})`)
  assert.ok(result && typeof result === 'object', `${entry.file}: evaluateProgram must return an object`)
  assert.equal(typeof result.ok, 'boolean', `${entry.file}: evaluate result .ok must be a boolean`)
  assert.ok('root' in result, `${entry.file}: evaluate result must carry .root`)
  assert.ok(Array.isArray(result.diagnostics), `${entry.file}: evaluate result .diagnostics must be an array`)
  assert.ok(result.stateDefaults && typeof result.stateDefaults === 'object' && !Array.isArray(result.stateDefaults), `${entry.file}: evaluate result .stateDefaults must be a plain object (INTERFACES.md §5.3)`)
  result.diagnostics.forEach((d, i) => assertDiagnosticShape(d, `${entry.file} eval.diagnostics[${i}]`))

  assert.equal(snapshot(stateArg), stateBefore, `${entry.file}: evaluateProgram MUTATED the caller's options.state object (purity violation, INTERFACES.md §5.3). before=${stateBefore} after=${snapshot(stateArg)}`)

  // a frozen state object must not be written to either
  const frozenState = Object.freeze(JSON.parse(stateBefore))
  expectSync(lang.evaluateProgram(parse, { state: frozenState }), `evaluateProgram(${entry.file}, frozen state)`)

  // stateDefaults must cover every declared $name
  const declared = parse.statements.filter((s) => s.state).map((s) => (s.name.startsWith('$') ? s.name.slice(1) : s.name))
  const missingDefaults = declared.filter((n) => !(n in result.stateDefaults))
  assert.deepEqual(missingDefaults, [], `${entry.file}: stateDefaults is missing ${missingDefaults.join(', ')}; keys present: ${Object.keys(result.stateDefaults).join(', ')}`)

  // options are optional
  expectSync(lang.evaluateProgram(parse), `evaluateProgram(${entry.file}, no options)`)

  // ---- root ----
  if (entry.rootName === null) {
    assert.ok(result.root === null || result.root === undefined, `${entry.file}: no root statement, so evaluate .root must be null, got ${JSON.stringify(result.root)?.slice(0, 200)}`)
  }
  if (result.root !== null && result.root !== undefined) {
    assert.ok(isElementDescriptor(result.root), `${entry.file}: .root must be an ElementDescriptor {kind:'element', name, args, line}, got ${snapshot(result.root).slice(0, 300)}`)
  }
  if (entry.rootName === 'root' && parse.ok) {
    assert.ok(isElementDescriptor(result.root), `${entry.file}: parse is clean and rootName is 'root', so evaluate .root must be an element descriptor, got ${snapshot(result.root).slice(0, 300)}`)
  }

  if (entry.evalClean) assert.deepEqual(result.diagnostics, [], `${entry.file}: expected zero evaluation diagnostics, got: ${describeDiagnostics(result.diagnostics)}`)
  if (entry.evalErrors) assert.ok(errorCount(result.diagnostics) >= entry.evalErrors, `${entry.file}: expected >=${entry.evalErrors} error diagnostic(s) from evaluation, got: ${describeDiagnostics(result.diagnostics)}`)
  if (entry.evalOk !== undefined) assert.equal(result.ok, entry.evalOk, `${entry.file}: evaluate .ok expected ${entry.evalOk}, got ${result.ok}. diagnostics: ${describeDiagnostics(result.diagnostics)}`)

  const rootJson = JSON.stringify(result.root)
  for (const needle of entry.includes ?? []) {
    assert.ok(rootJson.includes(needle), `${entry.file}: evaluated root does not contain ${JSON.stringify(needle)}. root JSON: ${rootJson.slice(0, 500)}`)
  }
  for (const needle of entry.notIncludes ?? []) {
    assert.ok(!rootJson.includes(needle), `${entry.file}: evaluated root unexpectedly contains ${JSON.stringify(needle)}`)
  }

  if (entry.expectDefaultIncludes) {
    const plain = expectSync(lang.evaluateProgram(parse), `evaluateProgram(${entry.file}, defaults)`)
    const plainJson = JSON.stringify(plain.root)
    for (const needle of entry.expectDefaultIncludes) {
      assert.ok(plainJson.includes(needle), `${entry.file}: default evaluation should contain ${JSON.stringify(needle)}. root JSON: ${plainJson.slice(0, 500)}`)
    }
  }

  if (entry.expectStateUse) {
    const useState = JSON.parse(snapshot(entry.expectStateUse.state))
    const overridden = expectSync(lang.evaluateProgram(parse, { state: useState }), `evaluateProgram(${entry.file}, override state)`)
    const json = JSON.stringify(overridden.root)
    for (const needle of entry.expectStateUse.includes ?? []) {
      assert.ok(json.includes(needle), `${entry.file}: options.state was not honoured: root JSON should contain ${JSON.stringify(needle)}. root JSON: ${json.slice(0, 500)}`)
    }
    for (const needle of entry.expectStateUse.notIncludes ?? []) {
      assert.ok(!json.includes(needle), `${entry.file}: options.state did not override the program default: root JSON still contains ${JSON.stringify(needle)}`)
    }
  }

  if (entry.minDepth !== undefined) {
    const rootStmt = parse.statements.find((s) => (s.name === 'root' || s.name === '$root'))
    assert.ok(rootStmt, `${entry.file}: could not find the root statement for the depth check`)
    const depth = exprDepth(rootStmt.expr)
    assert.ok(depth >= entry.minDepth, `${entry.file}: root expression depth is ${depth}, expected >= ${entry.minDepth} (deep nesting must survive the parser)`)
  }

  t.diagnostic(`[${entry.file}] group=${entry.group} bytes=${bytes} parse.ok=${parse.ok} rootName=${JSON.stringify(parse.rootName)} statements=${parse.statements.length} parse=${describeDiagnostics(parse.diagnostics)} || eval.ok=${result.ok} stateDefaults=[${Object.keys(result.stateDefaults).join(',')}] eval=${describeDiagnostics(result.diagnostics)}`)
}

describe('openui-lang program corpus (Phase A)', () => {
  test('src/lang/index.js is importable and exposes the frozen barrel (§5.6)', async () => {
    const lang = await needLang()
    for (const key of ['parseProgram', 'evaluateProgram', 'callFunction', 'systemPromptSectionText']) {
      assert.equal(typeof lang[key], 'function', `index.js export ${key} must be a function`)
    }
    for (const key of ['FUNCTIONS', 'COMPONENT_SIGNATURES', 'FUNCTION_SIGNATURES', 'EXAMPLES']) {
      assert.ok(lang[key] && typeof lang[key] === 'object', `index.js export ${key} must be an object/array`)
    }
  })

  test('corpus has at least 16 program fixtures and every manifest entry exists', () => {
    const files = programFiles()
    assert.ok(files.length >= 16, `expected >= 16 .oui fixtures in test/programs, found ${files.length}: ${files.join(', ')}`)
    for (const entry of CORPUS) {
      assert.ok(files.includes(entry.file), `manifest lists ${entry.file} but test/programs does not contain it. Files: ${files.join(', ')}`)
    }
    assert.ok(CORPUS.length >= 16, `expected >= 16 manifest entries, found ${CORPUS.length}`)
  })

  for (const entry of CORPUS) {
    test(`program: ${entry.file}`, async (t) => {
      await checkProgram(entry, t)
    })
  }

  test('cycle detection terminates instead of hanging (21-edge-cycle.oui)', async (t) => {
    const lang = await needLang()
    const { text } = readProgram('21-edge-cycle.oui')
    const parse = expectSync(lang.parseProgram(text), 'parseProgram(cycle)')
    const started = Date.now()
    const result = expectSync(lang.evaluateProgram(parse), 'evaluateProgram(cycle)')
    const elapsed = Date.now() - started
    assert.ok(elapsed < 2000, `cycle evaluation took ${elapsed}ms; cycle detection must fail fast (INTERFACES.md §5.3)`)
    assert.ok(errorCount(result.diagnostics) >= 1, `a reference cycle must produce an error diagnostic, got: ${describeDiagnostics(result.diagnostics)}`)
    t.diagnostic(`[cycle] elapsed=${elapsed}ms diagnostics=${describeDiagnostics(result.diagnostics)}`)
  })

  test('the corpus exercises every component in COMPONENT_SIGNATURES (all 48 v1 names)', async (t) => {
    const lang = await needLang()
    const componentNames = new Set(lang.COMPONENT_SIGNATURES.map((s) => s.name))
    const seen = new Map()
    for (const entry of CORPUS) {
      if (entry.checkComponents === false) continue
      const { text } = readProgram(entry.file)
      const parse = expectSync(lang.parseProgram(text), `parseProgram(${entry.file})`)
      for (const call of collectCalls(parse)) {
        if (componentNames.has(call.bare)) {
          if (!seen.has(call.bare)) seen.set(call.bare, entry.file)
        }
      }
    }
    const missing = [...componentNames].filter((n) => !seen.has(n))
    assert.deepEqual(missing, [], `these COMPONENT_SIGNATURES names are never exercised by the corpus: ${missing.join(', ')}. Add them to a fixture.`)
    const missingV1 = Object.keys(V1_COMPONENTS).filter((n) => !seen.has(n))
    assert.deepEqual(missingV1, [], `the corpus does not exercise these frozen v1 components: ${missingV1.join(', ')}`)
    t.diagnostic(`[coverage] ${seen.size}/${componentNames.size} components exercised: ${[...seen.entries()].map(([n, f]) => `${n}@${f}`).join(' ')}`)
  })

  test('corpus covers every component group and every declared @function', async (t) => {
    const lang = await needLang()
    const { text: all } = (() => {
      let joined = ''
      for (const entry of CORPUS) joined += readProgram(entry.file).text + '\n'
      return { text: joined }
    })()
    const missingFns = [...V1_FUNCTION_SIGNATURE_NAMES].filter((name) => !new RegExp(`@${name}\\s*\\(`).test(all))
    assert.deepEqual(missingFns, [], `these @functions are never called by any fixture: ${missingFns.join(', ')}`)
    const groups = new Set(CORPUS.map((e) => e.group))
    for (const required of ['layout', 'text', 'drawing', 'inputs', 'media-data', 'play', 'bindings', 'each', 'charts', 'edge-empty', 'edge-missing-root', 'edge-unbalanced', 'edge-unknown-component', 'edge-unknown-function', 'edge-unknown-ref', 'edge-cycle', 'edge-200-statements', 'edge-nonascii', 'edge-deep-nesting']) {
      assert.ok(groups.has(required), `corpus is missing the "${required}" category`)
    }
    t.diagnostic(`[coverage] categories: ${[...groups].sort().join(', ')}`)
  })
})
