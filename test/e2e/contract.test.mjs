// Phase A harness: contract-level checks for the frozen language wording in
// docs/INTERFACES.md §5 (AST shapes, bindings, cycles, signatures, prompt text).
// The expected tables below are transcribed from the document, not from src/**.
import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import {
  FORBIDDEN_COMPONENTS,
  V1_COMPONENTS,
  V1_FUNCTIONS,
  ACTION_NAMES,
  bareName,
  describeDiagnostics,
  errorCount,
  expectSync,
  needLang,
} from './lib.mjs'

const V1_FUNCTION_SIGNATURE_NAMES = [...V1_FUNCTIONS, 'Each']

function parseOk(lang, source, what) {
  const program = expectSync(lang.parseProgram(source), `parseProgram(${what})`)
  assert.equal(program.ok, true, `${what}: expected a clean parse, got: ${describeDiagnostics(program.diagnostics)}`)
  return program
}

function evalRoot(lang, source, options, what) {
  const program = parseOk(lang, source, what)
  return expectSync(lang.evaluateProgram(program, options), `evaluateProgram(${what})`)
}

describe('language contract (Phase A)', () => {
  // ---------------------------------------------------------------- signatures
  test('§6.4 COMPONENT_SIGNATURES is exactly the 48 frozen components with the frozen args/min', async () => {
    const lang = await needLang()
    const sigs = lang.COMPONENT_SIGNATURES
    assert.ok(Array.isArray(sigs), 'COMPONENT_SIGNATURES must be an array')
    const expectedNames = Object.keys(V1_COMPONENTS)
    const actualNames = sigs.map((s) => s.name)
    const missing = expectedNames.filter((n) => !actualNames.includes(n))
    const extra = actualNames.filter((n) => !expectedNames.includes(n))
    assert.deepEqual(missing, [], `COMPONENT_SIGNATURES is missing: ${missing.join(', ')}`)
    assert.deepEqual(extra, [], `COMPONENT_SIGNATURES has names that are not in §6.4: ${extra.join(', ')}`)
    assert.equal(sigs.length, 48, `COMPONENT_SIGNATURES must contain exactly 48 entries, got ${sigs.length}`)
    for (const sig of sigs) {
      const want = V1_COMPONENTS[sig.name]
      if (!want) continue
      // §5.5 shows args as [{name, type, required}]; §6.1 shows the registry entry's args as names.
      // Either encoding is accepted, the positional names and required count are not.
      assert.ok(Array.isArray(sig.args), `${sig.name}: COMPONENT_SIGNATURES.args must be an array`)
      const argNames = sig.args.map((a) => (typeof a === 'string' ? a : a && a.name))
      assert.deepEqual(argNames, want.args, `${sig.name}: COMPONENT_SIGNATURES args must be exactly ${JSON.stringify(want.args)} in §6.4 order, got ${JSON.stringify(sig.args)}`)
      for (const arg of sig.args) {
        if (typeof arg === 'string') continue
        assert.equal(typeof arg.type, 'string', `${sig.name}.${arg.name}: §5.5 signature args carry a type string, got ${JSON.stringify(arg.type)}`)
        assert.equal(typeof arg.required, 'boolean', `${sig.name}.${arg.name}: §5.5 signature args carry required:boolean, got ${JSON.stringify(arg.required)}`)
      }
      const requiredCount = sig.args.filter((a) => a && typeof a === 'object' && a.required === true).length
      assert.equal(requiredCount, want.min, `${sig.name}: §6.4 min is ${want.min}, so ${want.min} leading arg(s) must be required:true, got ${requiredCount}`)
      if (sig.min !== undefined) assert.equal(sig.min, want.min, `${sig.name}: min must be ${want.min}, got ${JSON.stringify(sig.min)}`)
      assert.equal(typeof sig.description, 'string', `${sig.name}: description must be a string`)
      assert.ok(sig.description.length > 0, `${sig.name}: description must not be empty`)
    }
  })

  test('§6.4 the not-in-v1 components are absent from COMPONENT_SIGNATURES', async () => {
    const lang = await needLang()
    const names = lang.COMPONENT_SIGNATURES.map((s) => s.name)
    for (const forbidden of FORBIDDEN_COMPONENTS) {
      assert.ok(!names.includes(forbidden), `${forbidden} is explicitly not in v1 and must not appear in COMPONENT_SIGNATURES`)
    }
  })

  test('§5.4 FUNCTION_SIGNATURES is exactly the 72 v1 functions plus @Each; FUNCTIONS matches', async () => {
    const lang = await needLang()
    const sigs = lang.FUNCTION_SIGNATURES
    assert.ok(Array.isArray(sigs), 'FUNCTION_SIGNATURES must be an array')
    const actual = sigs.map((s) => s.name)
    const missing = V1_FUNCTION_SIGNATURE_NAMES.filter((n) => !actual.includes(n))
    const extra = actual.filter((n) => !V1_FUNCTION_SIGNATURE_NAMES.includes(n))
    assert.deepEqual(missing, [], `FUNCTION_SIGNATURES is missing: ${missing.join(', ')}`)
    assert.deepEqual(extra, [], `FUNCTION_SIGNATURES has extra/unknown names: ${extra.join(', ')}`)
    assert.ok(actual.includes('Each'), '@Each must appear in FUNCTION_SIGNATURES so the prompt can teach it (§5.4)')
    for (const sig of sigs) {
      assert.equal(typeof sig.signature, 'string', `${sig.name}: signature must be a string`)
      assert.ok(sig.signature.length > 0, `${sig.name}: signature must not be empty`)
      assert.equal(typeof sig.description, 'string', `${sig.name}: description must be a string`)
    }

    const fns = Object.keys(lang.FUNCTIONS)
    const fnMissing = V1_FUNCTIONS.filter((n) => !fns.includes(n))
    const fnExtra = fns.filter((n) => !V1_FUNCTIONS.includes(n) && n !== 'Each')
    assert.deepEqual(fnMissing, [], `FUNCTIONS is missing: ${fnMissing.join(', ')}`)
    assert.deepEqual(fnExtra, [], `FUNCTIONS exports names outside the v1 set: ${fnExtra.join(', ')}`)
    for (const name of V1_FUNCTIONS) {
      assert.equal(typeof lang.FUNCTIONS[name], 'function', `FUNCTIONS.${name} must be a function`)
    }
  })

  test('§5.4 callFunction returns values and never throws on bad input', async (t) => {
    const lang = await needLang()
    assert.equal(expectSync(lang.callFunction('Count', [[1, 2, 3]]), 'callFunction Count'), 3)
    assert.equal(expectSync(lang.callFunction('Sum', [[1, 2, 3]]), 'callFunction Sum'), 6)
    assert.equal(expectSync(lang.callFunction('Upper', ['ab']), 'callFunction Upper'), 'AB')
    const unknown = expectSync(lang.callFunction('NoSuchFunction', []), 'callFunction unknown')
    assert.ok(unknown === null || unknown === undefined, `an unknown function must fail soft (null), got ${JSON.stringify(unknown)}`)
    // §5.3: "a bad argument makes a @function call evaluate to null"
    const badType = expectSync(lang.callFunction('Count', [42]), 'callFunction Count(42)')
    assert.ok(badType === null || badType === undefined, `a bad argument must make the call evaluate to null (§5.3), got ${JSON.stringify(badType)}`)
    const badSum = expectSync(lang.callFunction('Sum', ['not an array']), 'callFunction Sum(string)')
    assert.ok(badSum === null || badSum === undefined, `a bad argument must make the call evaluate to null (§5.3), got ${JSON.stringify(badSum)}`)
    t.diagnostic(`[advisory] missing-argument policy is not pinned by INTERFACES.md: callFunction('Count', []) = ${JSON.stringify(lang.callFunction('Count', []))}, callFunction('Format', []) = ${JSON.stringify(lang.callFunction('Format', []))}`)

    // argument order "as in the reference spec" (§5.4) for a few representative built-ins
    const filtered = expectSync(lang.callFunction('Filter', [[{ a: 1 }, { a: 5 }], 'a', '>', 2]), 'Filter')
    assert.deepEqual(filtered, [{ a: 5 }], `@Filter(array, key, op, value) must keep rows matching key op value, got ${JSON.stringify(filtered)}`)
    const days = expectSync(lang.callFunction('DaysBetween', ['2026-01-15', '2026-07-01']), 'DaysBetween')
    assert.ok(typeof days === 'number' && days > 0, `@DaysBetween(from, to) must return a positive number, got ${JSON.stringify(days)}`)
    assert.equal(typeof expectSync(lang.callFunction('AddDays', ['2026-01-15', 30]), 'AddDays'), 'string', '@AddDays(date, n) must return a date value')
    assert.equal(typeof expectSync(lang.callFunction('FormatDate', ['2026-01-15', 'date']), 'FormatDate'), 'string', '@FormatDate(date, kind) must return a string')
    assert.equal(expectSync(lang.callFunction('Plural', [1, 'day']), 'Plural'), '1 day', '@Plural(1, "day") must use the singular')
  })

  // ---------------------------------------------------------------- AST
  test('§5.2 parseProgram produces the documented AST node shapes and statement fields', async () => {
    const lang = await needLang()
    const lines = [
      's = "hi"',
      'n = 12.5',
      'b = true',
      'z = null',
      'arr = [1, 2]',
      'obj = {a: 1, "b": 2}',
      'r = s',
      'r2 = arr[0]',
      'm = obj.a',
      'u = !b',
      'neg = -n',
      'bin = n + 1',
      't = b ? 1 : 2',
      'c = Title("x")',
      '$st = 3',
      'root = Col([c], 1)',
    ]
    const program = parseOk(lang, lines.join('\n') + '\n', 'ast-shapes')
    const byName = new Map(program.statements.map((s) => [s.name.startsWith('$') ? s.name.slice(1) : s.name, s]))

    assert.equal(program.rootName, 'root', 'rootName must be "root" when a root statement is present')
    assert.equal(program.statements.length, lines.length, `expected ${lines.length} statements`)
    for (const [i, name] of ['s', 'n', 'b', 'z', 'arr', 'obj', 'r', 'r2', 'm', 'u', 'neg', 'bin', 't', 'c', 'st', 'root'].entries()) {
      const st = byName.get(name)
      assert.ok(st, `statement ${name} missing`)
      assert.equal(st.line, i + 1, `statement ${name} must carry line ${i + 1}, got ${st.line}`)
    }

    const expr = (name) => byName.get(name).expr
    assert.equal(expr('s').t, 'str')
    assert.equal(expr('s').v, 'hi')
    assert.equal(expr('n').t, 'num')
    assert.equal(expr('n').v, 12.5)
    assert.equal(expr('b').t, 'bool')
    assert.equal(expr('b').v, true)
    assert.equal(expr('z').t, 'null')
    assert.equal(expr('arr').t, 'arr')
    assert.deepEqual(expr('arr').items.map((i) => i.v), [1, 2])
    assert.equal(expr('obj').t, 'obj')
    assert.deepEqual(expr('obj').entries.map((e) => [e.key, e.value.t, e.value.v]), [['a', 'num', 1], ['b', 'num', 2]])
    assert.equal(expr('r').t, 'ref')
    assert.equal(expr('r').name, 's')
    assert.equal(expr('r').state, false)
    assert.equal(expr('r2').t, 'idx')
    assert.equal(expr('r2').index.t, 'num')
    assert.equal(expr('r2').obj.t, 'ref')
    assert.equal(expr('m').t, 'mem')
    assert.equal(expr('m').prop, 'a')
    assert.equal(expr('u').t, 'un')
    assert.equal(expr('u').op, '!')
    assert.equal(expr('neg').op, '-')
    assert.equal(expr('bin').t, 'bin')
    assert.equal(expr('bin').op, '+')
    assert.equal(expr('t').t, 'tern')
    assert.equal(expr('c').t, 'call')
    assert.equal(bareName(expr('c').name), 'Title')
    assert.equal(expr('c').args.length, 1)
    assert.equal(expr('c').args[0].t, 'str')

    const stmt = byName.get('st')
    assert.equal(stmt.state, true, '$name = ... must set Statement.state = true')
    assert.ok(stmt.name === 'st' || stmt.name === '$st', `Statement.name for a $variable should be 'st' or '$st', got ${JSON.stringify(stmt.name)}`)
    assert.equal(byName.get('root').state, false)
  })

  test('§5.2 named arguments produce an error diagnostic', async () => {
    const lang = await needLang()
    for (const source of ['root = Title(text: "hi")\n', 'root = Col([Text("x", size: 1)], 1)\n']) {
      const program = expectSync(lang.parseProgram(source), 'parseProgram(named args)')
      assert.equal(program.ok, false, `named arguments must be an error diagnostic, got a clean parse for ${JSON.stringify(source)}`)
      assert.ok(errorCount(program.diagnostics) >= 1, `expected an error diagnostic for named arguments. diagnostics: ${describeDiagnostics(program.diagnostics)}`)
      const mentionsNamed = program.diagnostics.some((d) => /named|argument name|name:/i.test(d.message))
      assert.ok(mentionsNamed, `ADVISORY: the named-argument diagnostic should tell the model what is wrong; messages: ${describeDiagnostics(program.diagnostics)}`)
    }
  })

  test('§5.2 parseProgram never throws on hostile input', async () => {
    const lang = await needLang()
    const hostile = [
      '',
      '   \n\t\n  ',
      'root',
      'root =',
      'root = Col([',
      '= 5',
      '$ = 1',
      '"unterminated',
      'root = Text("a',
      'root = Text("a\\")',
      'root = @Each',
      'root = Text(,)',
      'root = Col([Text("x")], 1) )))',
      '{',
      '}',
      'root = {a: }',
      'root = 1 +',
      '\u0000\u0001',
      'root = Text("' + 'a'.repeat(50000) + '")',
      'root = ' + 'Col(['.repeat(200),
      'x'.repeat(100000),
      'root = @' + 'Nope('.repeat(100),
      'root\t=\tCol([Title("tabbed")], 1)',
      'ünïcödé = 1\nroot = Col([Title("日本語")], 1)\n',
      Array.from({ length: 500 }, (_, i) => `v${i} = ${i}`).join('\n') + '\nroot = Col([Title("wide")], 1)\n',
    ]
    for (const source of hostile) {
      let program
      try {
        program = expectSync(lang.parseProgram(source), 'parseProgram(hostile)')
      } catch (err) {
        assert.fail(`parseProgram threw on hostile input ${JSON.stringify(source.slice(0, 60))}: ${err && err.message}`)
      }
      assert.equal(typeof program.ok, 'boolean', 'hostile input: Program.ok must still be a boolean')
      assert.ok(Array.isArray(program.diagnostics), 'hostile input: Program.diagnostics must be an array')
      for (const d of program.diagnostics) {
        assert.ok(d.severity === 'error' || d.severity === 'warning', `hostile input: bad diagnostic severity ${JSON.stringify(d.severity)}`)
        assert.equal(typeof d.message, 'string')
      }
      let result
      try {
        result = expectSync(lang.evaluateProgram(program), 'evaluateProgram(hostile)')
      } catch (err) {
        assert.fail(`evaluateProgram threw on hostile input ${JSON.stringify(source.slice(0, 60))}: ${err && err.message}`)
      }
      assert.equal(typeof result.ok, 'boolean')
      assert.ok(result.stateDefaults && typeof result.stateDefaults === 'object')
    }
  })

  // ---------------------------------------------------------------- evaluation semantics
  test('§5.3 bindings stay descriptors only as direct component arguments', async () => {
    const lang = await needLang()
    const result = evalRoot(lang, 'root = Col([Text($x), Text($x + "")], 1)\n$x = 5\n', undefined, 'bindings')
    const children = result.root.args[0]
    assert.ok(Array.isArray(children) && children.length === 2, `Col([...]) must evaluate to an element with an array of 2 children, got ${JSON.stringify(children)?.slice(0, 200)}`)
    const direct = children[0].args[0]
    assert.ok(direct && typeof direct === 'object' && direct.kind === 'binding', `Text($x) must receive a binding descriptor as its direct argument, got ${JSON.stringify(direct)}`)
    assert.ok(direct.name === 'x' || direct.name === '$x', `binding descriptor name should be 'x' or '$x', got ${JSON.stringify(direct.name)}`)
    assert.equal(direct.value, 5, `binding descriptor value must be the current $x value (5), got ${JSON.stringify(direct.value)}`)
    const unwrapped = children[1].args[0]
    assert.equal(unwrapped, '5', `$x inside a binary expression must be unwrapped to its value first, got ${JSON.stringify(unwrapped)}`)
  })

  test('§5.3 @Each unwraps the list, skips null items and shadows statements', async () => {
    const lang = await needLang()
    const result = evalRoot(
      lang,
      'it = "shadowed"\nitems = [1, null, 3]\nroot = Col(@Each(items, "it", Text(it + "")), 1)\n',
      undefined,
      'each',
    )
    const children = result.root.args[0]
    assert.ok(Array.isArray(children), `@Each must concatenate into one array, got ${JSON.stringify(children)?.slice(0, 200)}`)
    assert.equal(children.length, 2, `null items must be skipped, expected 2 children, got ${children.length}`)
    const texts = children.map((c) => c.args[0])
    assert.deepEqual(texts, ['1', '3'], `the loop variable must shadow the statement 'it'; got ${JSON.stringify(texts)}`)
  })

  test('§5.3 a reference cycle is an error diagnostic and evaluates to null', async () => {
    const lang = await needLang()
    // the cyclic reference is passed directly as a component argument, so this checks the
    // documented null value itself and not the (unspecified) null-to-string coercion of "+"
    const result = evalRoot(lang, 'root = Col([Text(a)], 1)\na = b\nb = a\n', undefined, 'cycle')
    assert.equal(result.ok, false, 'a cycle must make the program not ok')
    assert.ok(errorCount(result.diagnostics) >= 1, `a cycle must produce an error diagnostic, got: ${describeDiagnostics(result.diagnostics)}`)
    const value = result.root.args[0][0].args[0]
    assert.equal(value, null, `the cyclic statement must evaluate to null (§5.3), got ${JSON.stringify(value)}`)
  })

  test('§5.3 an unknown statement reference is an error diagnostic, not a throw', async () => {
    const lang = await needLang()
    const result = evalRoot(lang, 'root = Col([Text(nope)], 1)\n', undefined, 'unknown-ref')
    assert.ok(errorCount(result.diagnostics) >= 1, `an unknown statement reference must produce an error diagnostic, got: ${describeDiagnostics(result.diagnostics)}`)
    const value = result.root.args[0][0].args[0]
    assert.equal(value, null, `an unknown reference must evaluate to null, got ${JSON.stringify(value)}`)
  })

  test('§5.3 an undeclared $variable reads as null without throwing', async () => {
    const lang = await needLang()
    const result = evalRoot(lang, 'root = Col([Text($missing)], 1)\n', undefined, 'undeclared-state')
    const value = result.root.args[0][0].args[0]
    assert.ok(value && typeof value === 'object' && value.kind === 'binding', `Text($missing) must receive a binding descriptor as a direct argument, got ${JSON.stringify(value)}`)
    assert.equal(value.value, null, `an undeclared $variable must read as null, got ${JSON.stringify(value.value)}`)
  })

  test('§5.3 an unknown @function is not an evaluator throw', async () => {
    const lang = await needLang()
    const program = parseOk(lang, 'root = Col([Text(@DoesNotExist(1))], 1)\n', 'unknown-function')
    const result = expectSync(lang.evaluateProgram(program), 'evaluateProgram(unknown-function)')
    const value = result.root.args[0][0].args[0]
    assert.equal(value, null, `an unknown @function must evaluate to null, got ${JSON.stringify(value)}`)
  })

  test('§5.5 systemPromptSectionText teaches every v1 name and EXAMPLES are valid programs', async (t) => {
    const lang = await needLang()
    const text = expectSync(lang.systemPromptSectionText(), 'systemPromptSectionText')
    assert.equal(typeof text, 'string', 'systemPromptSectionText() must return a string')
    assert.ok(text.length > 200, `the prompt section looks too short (${text.length} chars)`)
    const missingComponents = Object.keys(V1_COMPONENTS).filter((n) => !text.includes(n))
    assert.deepEqual(missingComponents, [], `the prompt section never mentions: ${missingComponents.join(', ')}`)
    const missingFunctions = V1_FUNCTIONS.filter((n) => !new RegExp(`@${n}\\b`).test(text))
    assert.deepEqual(missingFunctions, [], `the prompt section never teaches: ${missingFunctions.join(', ')}`)
    assert.ok(/@Each\b/.test(text), 'the prompt section must teach @Each')

    const forbiddenCallSyntax = FORBIDDEN_COMPONENTS.filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(text))
    t.diagnostic(`[prompt] forbidden-name call syntax in prompt (advisory, may be a "not supported" warning): ${forbiddenCallSyntax.join(', ') || 'none'}`)
    assert.ok(ACTION_NAMES.every((n) => text.includes(n)), `the prompt must teach the action steps: ${ACTION_NAMES.join(', ')}`)

    assert.ok(Array.isArray(lang.EXAMPLES), 'EXAMPLES must be an array')
    assert.equal(lang.EXAMPLES.length, 2, `§5.5 specifies exactly 2 worked examples, got ${lang.EXAMPLES.length}`)
    for (const example of lang.EXAMPLES) {
      assert.equal(typeof example.title, 'string', 'EXAMPLES[i].title must be a string')
      assert.equal(typeof example.program, 'string', 'EXAMPLES[i].program must be a string')
      const program = expectSync(lang.parseProgram(example.program), `parseProgram(EXAMPLES: ${example.title})`)
      assert.equal(program.ok, true, `example "${example.title}" must parse cleanly, got: ${describeDiagnostics(program.diagnostics)}`)
      assert.equal(program.rootName, 'root', `example "${example.title}" must define a root`)
      const result = expectSync(lang.evaluateProgram(program), `evaluateProgram(EXAMPLES: ${example.title})`)
      assert.ok(result.root && result.root.kind === 'element', `example "${example.title}" root must be an element descriptor`)
      t.diagnostic(`[example] ${example.title}: ${program.statements.length} statements, eval diagnostics: ${describeDiagnostics(result.diagnostics)}`)
    }
  })
})
