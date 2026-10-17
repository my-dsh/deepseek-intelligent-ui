/**
 * Unit tests for the openui-lang language core (tokenizer, parser, evaluator, built-ins,
 * signatures and prompt text).
 *
 * Run from the workspace root:
 *
 *     node --test test/lang.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  COMPONENT_SIGNATURES,
  EXAMPLES,
  FUNCTIONS,
  FUNCTION_SIGNATURES,
  callFunction,
  evaluateProgram,
  parseProgram,
  systemPromptSectionText,
} from '../src/lang/index.js'

/** The exact built-in name list frozen in docs/INTERFACES.md §5.4. */
const V1_FUNCTION_NAMES = [
  'Count', 'First', 'Last', 'Sum', 'Avg', 'Min', 'Max', 'Sort', 'Filter', 'Round', 'Abs', 'Floor', 'Ceil',
  'Append', 'Prepend', 'Concat', 'Remove', 'RemoveAt', 'Update', 'Toggle', 'Includes', 'Find', 'IndexOf', 'Take', 'Slice',
  'Unique', 'Reverse', 'Range', 'Pick', 'Shuffle', 'Flatten', 'Chunk',
  'Pow', 'Sqrt', 'Random', 'Clamp', 'Percent', 'Lerp', 'Allocate', 'Payment', 'Convert',
  'Format', 'Join', 'Plural', 'Pad', 'Upper', 'Lower', 'Trim', 'Capitalize', 'Split', 'Replace', 'Duration', 'Default', 'MixColor',
  'Now', 'Today', 'FormatDate', 'AddDays', 'AddMonths', 'DaysBetween', 'MonthsBetween', 'StartOf',
  'GroupBy', 'Pivot', 'Top', 'Between', 'Bucket', 'Cumulative', 'MovingAvg', 'Change', 'Histogram', 'Stats',
]

/** The exact component list frozen in docs/INTERFACES.md §6.4, in order. */
const V1_COMPONENT_GROUPS = {
  Layout: ['Col', 'Row', 'Box', 'Grid', 'Card', 'Carousel', 'Popover', 'Divider', 'Spacer'],
  Text: ['Title', 'Text', 'Caption', 'Label', 'Badge', 'Link', 'List', 'ListItem', 'Quote', 'Code'],
  Drawing: ['Svg', 'G', 'Circle', 'Ellipse', 'Rect', 'Line', 'Path', 'Polyline', 'Polygon', 'SvgText'],
  Inputs: ['Button', 'IconButton', 'Pressable', 'Input', 'TextArea', 'Select', 'SegmentedControl', 'Slider', 'Checkbox', 'RadioGroup', 'DatePicker', 'Timer', 'Form'],
  'Media and data': ['Image', 'Icon', 'Table', 'Chart'],
  Play: ['Flashcard', 'Celebration'],
}

/** Components the v1 subset must not teach. */
const FORBIDDEN_COMPONENTS = ['Markdown', 'Math', 'SearchImage', 'Map', 'MapMarker', 'YouTube', 'HtmlView']

/**
 * Parse and evaluate a program in one step.
 * @param {string} source - program source.
 * @param {object} [options] - evaluator options.
 * @returns {{ program: object, result: object }} both halves, for assertions.
 */
function run(source, options) {
  const program = parseProgram(source)
  return { program, result: evaluateProgram(program, options) }
}

/**
 * All diagnostics of a parse+evaluate pair, for readable failure messages.
 * @param {object} program - parse result.
 * @param {object} result - evaluation result.
 * @returns {string} joined diagnostics.
 */
function diagText(program, result) {
  return [...program.diagnostics, ...result.diagnostics].map(d => `${d.severity}: ${d.message}`).join(' | ')
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test('parseProgram returns the frozen Program shape', () => {
  const program = parseProgram('root = Col([a])\n$count = 2\n')
  assert.equal(program.ok, true)
  assert.equal(program.rootName, 'root')
  assert.deepEqual(program.diagnostics, [])
  assert.equal(program.statements.length, 2)

  const [first, second] = program.statements
  assert.equal(first.kind, 'assign')
  assert.equal(first.name, 'root')
  assert.equal(first.state, false)
  assert.equal(first.line, 1)
  assert.equal(first.expr.t, 'call')
  assert.equal(first.expr.name, 'Col')
  assert.equal(first.expr.line, 1)
  assert.equal(first.expr.args.length, 1)
  assert.equal(first.expr.args[0].t, 'arr')
  assert.equal(first.expr.args[0].items[0].t, 'ref')
  assert.equal(first.expr.args[0].items[0].name, 'a')
  assert.equal(first.expr.args[0].items[0].state, false)

  assert.equal(second.state, true)
  assert.equal(second.expr.t, 'num')
  assert.equal(second.expr.v, 2)
})

test('parseProgram reports a missing root and an empty program as ok', () => {
  const empty = parseProgram('')
  assert.equal(empty.ok, true)
  assert.equal(empty.rootName, null)
  assert.deepEqual(empty.statements, [])

  const noRoot = parseProgram('a = 1')
  assert.equal(noRoot.ok, true)
  assert.equal(noRoot.rootName, null)
})

test('parseProgram builds every literal and expression tag', () => {
  const { statements } = parseProgram([
    'root = null',
    'a = "he said \\"hi\\"\\n"',
    'b = true',
    'c = [1, 2.5, "x"]',
    'd = {bare: 1, "quoted key": 2}',
    'e = @Count(c)',
    'f = obj.field',
    'g = c[0]',
    'h = !flag',
    'i = -3',
  ].join('\n'))

  const byName = new Map(statements.map(statement => [statement.name, statement.expr]))
  assert.deepEqual(byName.get('root'), { t: 'null' })
  assert.deepEqual(byName.get('a'), { t: 'str', v: 'he said "hi"\n' })
  assert.deepEqual(byName.get('b'), { t: 'bool', v: true })
  assert.deepEqual(byName.get('c'), {
    t: 'arr',
    items: [{ t: 'num', v: 1 }, { t: 'num', v: 2.5 }, { t: 'str', v: 'x' }],
  })
  assert.deepEqual(byName.get('d'), {
    t: 'obj',
    entries: [
      { key: 'bare', value: { t: 'num', v: 1 } },
      { key: 'quoted key', value: { t: 'num', v: 2 } },
    ],
  })
  assert.deepEqual(byName.get('e'), { t: 'call', name: '@Count', args: [{ t: 'ref', name: 'c', state: false }], line: 6 })
  assert.deepEqual(byName.get('f'), { t: 'mem', obj: { t: 'ref', name: 'obj', state: false }, prop: 'field' })
  assert.deepEqual(byName.get('g'), {
    t: 'idx',
    obj: { t: 'ref', name: 'c', state: false },
    index: { t: 'num', v: 0 },
  })
  assert.deepEqual(byName.get('h'), { t: 'un', op: '!', arg: { t: 'ref', name: 'flag', state: false } })
  assert.deepEqual(byName.get('i'), { t: 'un', op: '-', arg: { t: 'num', v: 3 } })
})

test('operator precedence, associativity and the conditional level', () => {
  const expr = (source) => parseProgram(`x = ${source}`).statements[0].expr

  assert.deepEqual(expr('1 + 2 * 3'), {
    t: 'bin',
    op: '+',
    left: { t: 'num', v: 1 },
    right: { t: 'bin', op: '*', left: { t: 'num', v: 2 }, right: { t: 'num', v: 3 } },
  })
  assert.equal(expr('(1 + 2) * 3').op, '*')
  assert.equal(expr('(1 + 2) * 3').left.op, '+')
  // `||` binds tighter than the conditional, so the condition is the whole `a || b`.
  assert.deepEqual(expr('a || b ? c : d'), {
    t: 'tern',
    cond: { t: 'bin', op: '||', left: { t: 'ref', name: 'a', state: false }, right: { t: 'ref', name: 'b', state: false } },
    then: { t: 'ref', name: 'c', state: false },
    else: { t: 'ref', name: 'd', state: false },
  })
  // Ternary is right-associative.
  const chained = expr('a ? b : c ? d : e')
  assert.equal(chained.t, 'tern')
  assert.equal(chained.else.t, 'tern')
  // Binary operators are left-associative.
  assert.equal(expr('1 - 2 - 3').left.op, '-')
  assert.deepEqual(expr('a || b && c'), {
    t: 'bin',
    op: '||',
    left: { t: 'ref', name: 'a', state: false },
    right: { t: 'bin', op: '&&', left: { t: 'ref', name: 'b', state: false }, right: { t: 'ref', name: 'c', state: false } },
  })
  // Postfix binds tighter than unary.
  assert.equal(expr('-a.b').t, 'un')
  assert.equal(expr('-a.b').arg.t, 'mem')
  assert.deepEqual(expr('a.b[0].c'), {
    t: 'mem',
    obj: {
      t: 'idx',
      obj: { t: 'mem', obj: { t: 'ref', name: 'a', state: false }, prop: 'b' },
      index: { t: 'num', v: 0 },
    },
    prop: 'c',
  })
})

test('parse errors are diagnostics, never throws', () => {
  const named = parseProgram('x = Col([a], gap: 2)')
  assert.equal(named.ok, false)
  assert.ok(named.diagnostics.some(d => /named arguments/.test(d.message)), diagText(named, { diagnostics: [] }))

  const missingEquals = parseProgram('x 1')
  assert.equal(missingEquals.ok, false)
  assert.ok(missingEquals.diagnostics.some(d => /expected "="/.test(d.message)))

  const unterminated = parseProgram('x = "abc')
  assert.equal(unterminated.ok, false)
  assert.ok(unterminated.diagnostics.some(d => /unterminated string/.test(d.message)))

  const missingParen = parseProgram('x = Col([a]')
  assert.equal(missingParen.ok, false)
  assert.ok(missingParen.diagnostics.some(d => /expected "\)"/.test(d.message)))

  const badStart = parseProgram('= 5')
  assert.equal(badStart.ok, false)
  assert.equal(badStart.statements.length, 0)

  const missingValue = parseProgram('x =')
  assert.equal(missingValue.ok, false)
  assert.equal(missingValue.statements[0].expr.t, 'error')

  const stray = parseProgram('x = 1 2')
  assert.equal(stray.ok, false)

  const unknownChar = parseProgram('x = 1 ; 2')
  assert.equal(unknownChar.ok, false)
  assert.ok(unknownChar.diagnostics.some(d => /unexpected character/.test(d.message)))

  // A bad statement never prevents the good statements from parsing.
  const mixed = parseProgram('root = Col([a])\n???\na = 1')
  assert.equal(mixed.rootName, 'root')
  assert.equal(mixed.statements.length, 2)
})

test('parseProgram never throws on hostile input', () => {
  const inputs = ['', '\n\n', '=', '$', '@', '"', 'x = (((', 'root = ]', 'a = {', 'a = }', 'a = [1,', '$x = @', 'x = a.', 'x = a[', 'x = ?', 'x = 1 ? 2', '@x', 'x = @@Y(1)']
  for (const source of inputs) {
    const program = parseProgram(source)
    assert.equal(typeof program.ok, 'boolean')
    assert.ok(Array.isArray(program.statements))
    assert.ok(Array.isArray(program.diagnostics))
    evaluateProgram(program)
  }
})

test('pathological nesting is refused instead of overflowing the stack', () => {
  const nestedParens = `root = ${'('.repeat(5000)}1${')'.repeat(5000)}`
  const parsed = parseProgram(nestedParens)
  assert.equal(parsed.ok, false)
  assert.ok(parsed.diagnostics.some(d => /nested too deeply/.test(d.message)))
  const result = evaluateProgram(parsed)
  assert.equal(result.root, null)

  const nestedUnary = `root = ${'!'.repeat(5000)}true`
  assert.equal(parseProgram(nestedUnary).ok, false)

  const nestedArrays = `root = ${'['.repeat(5000)}1${']'.repeat(5000)}`
  assert.equal(parseProgram(nestedArrays).ok, false)

  // A long, flat expression is still fine: its left spine is evaluated iteratively.
  const flat = `root = ${Array.from({ length: 500 }, (_, index) => index).join(' + ')}`
  const flatProgram = parseProgram(flat)
  assert.equal(flatProgram.ok, true, diagText(flatProgram, { diagnostics: [] }))
  const flatResult = evaluateProgram(flatProgram)
  assert.deepEqual(flatResult.diagnostics, [], diagText(flatProgram, flatResult))
  assert.equal(flatResult.root, 124750)

  const longPrefix = `root = ${'!'.repeat(5000)}true`
  const prefixProgram = parseProgram(longPrefix)
  assert.equal(prefixProgram.ok, false)
  const prefixResult = evaluateProgram(prefixProgram)
  assert.equal(prefixResult.ok, false)
  assert.ok(prefixResult.diagnostics.some(d => /nested too deeply/.test(d.message)))
})

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

test('evaluateProgram returns root, stateDefaults and diagnostics', () => {
  const { program, result } = run('root = Col([title])\ntitle = Text("Hi")\n$name = "Ada"\n$count = 3')
  assert.equal(program.ok, true)
  assert.equal(result.ok, true)
  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.stateDefaults, { name: 'Ada', count: 3 })
  assert.equal(result.root.kind, 'element')
  assert.equal(result.root.name, 'Col')
  assert.equal(result.root.line, 1)
  const [title] = result.root.args[0]
  assert.equal(title.kind, 'element')
  assert.equal(title.name, 'Text')
  assert.equal(title.args[0], 'Hi')
})

test('references are hoisted: a value defined later still resolves', () => {
  const { result } = run('root = Col([answer])\nanswer = Title(text)\ntext = "later"')
  assert.equal(result.root.args[0][0].args[0], 'later')
})

test('evaluateProgram is pure and reads options.state', () => {
  const state = { count: 5, nested: [1, 2] }
  const snapshot = JSON.parse(JSON.stringify(state))
  const program = parseProgram('root = Text($count + "")\n$count = 1')
  const result = evaluateProgram(program, { state })
  assert.equal(result.root.args[0], '5')
  assert.deepEqual(result.stateDefaults, { count: 1 })
  assert.deepEqual(state, snapshot)
})

test('bindings survive only as direct component or action arguments', () => {
  const { result } = run([
    'root = Text($name, $name + "!", @Count($items), $items.n)',
    '$name = "Ada"',
    '$items = [{n: 1}, {n: 2}]',
  ].join('\n'))
  const args = result.root.args
  assert.deepEqual(args[0], { kind: 'binding', name: 'name', value: 'Ada' })
  assert.equal(args[1], 'Ada!')
  assert.equal(args[2], 2)
  assert.deepEqual(args[3], [1, 2])
})

test('action calls keep bindings only in their variable slots', () => {
  const { result } = run([
    'root = Button("Go", Action([@Set($final, $choice), @Reset($a, $b), @ToAssistant($label)]))',
    '$choice = 2',
    '$final = 0',
    '$a = 1',
    '$b = 2',
    '$label = "hi"',
  ].join('\n'))
  const steps = result.root.args[1].args[0]
  assert.equal(steps[0].name, '@Set')
  assert.deepEqual(steps[0].args[0], { kind: 'binding', name: 'final', value: 0 })
  assert.equal(steps[0].args[1], 2)
  assert.equal(steps[1].name, '@Reset')
  assert.deepEqual(steps[1].args.map(arg => arg.name), ['a', 'b'])
  assert.equal(steps[2].name, '@ToAssistant')
  assert.equal(steps[2].args[0], 'hi')
})

test('undeclared $variables read as null without a diagnostic', () => {
  const { result } = run('root = Text(($missing == null) + "")')
  assert.equal(result.root.args[0], 'true')
  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.stateDefaults, {})
})

test('unknown references and cycles are error diagnostics, not throws', () => {
  const unknown = run('root = Col([nope])')
  assert.equal(unknown.result.root.args[0][0], null)
  assert.ok(unknown.result.diagnostics.some(d => /unknown reference "nope"/.test(d.message)))
  assert.equal(unknown.result.ok, false)

  const cycle = run('root = Col([a])\na = b\nb = a')
  assert.equal(cycle.result.root.args[0][0], null)
  assert.ok(cycle.result.diagnostics.some(d => /circular reference/.test(d.message)))

  const stateCycle = run('root = Text($x + "")\n$x = $y\n$y = $x')
  assert.ok(stateCycle.result.diagnostics.some(d => /circular reference/.test(d.message)))
  assert.equal(stateCycle.result.stateDefaults.x, null)
})

test('@Each binds the loop variable, skips null items and concatenates arrays', () => {
  const { result } = run([
    'root = Col(@Each(items, "item", Text(item + "")))',
    'items = [1, null, 2]',
  ].join('\n'))
  const children = result.root.args[0]
  assert.equal(children.length, 2)
  assert.deepEqual(children.map(child => child.args[0]), ['1', '2'])

  const nested = run([
    'root = Col(@Each(@Range(0, 2), "i", [Text("a" + i), Text("b" + i)]))',
  ].join('\n'))
  assert.deepEqual(nested.result.root.args[0].map(child => child.args[0]), ['a0', 'b0', 'a1', 'b1'])

  const shadow = run([
    'root = Col(@Each(items, "item", Text(item)))',
    'items = ["inner"]',
    'item = "outer"',
  ].join('\n'))
  assert.equal(shadow.result.root.args[0][0].args[0], 'inner')

  const notAList = run('root = Col(@Each("text", "x", Text(x)))')
  assert.equal(notAList.result.root.args[0], null)
  assert.ok(notAList.result.diagnostics.some(d => /@Each expects an array/.test(d.message)))

  const badName = run('root = Col(@Each([1], 2, Text("x")))')
  assert.ok(badName.result.diagnostics.some(d => /loop variable name as a string/.test(d.message)))
})

test('conditional expressions evaluate only the taken branch', () => {
  const { result } = run('root = Col([v == null ? "safe" : v.deep.field])\nv = null')
  assert.equal(result.root.args[0][0], 'safe')
  assert.deepEqual(result.diagnostics, [])
})

test('operators follow the documented semantics', () => {
  const value = (source) => run(`root = x\n${source}`).result.root
  assert.equal(value('x = 1 + 2 * 3'), 7)
  assert.equal(value('x = "a" + 1'), 'a1')
  assert.equal(value('x = 1 + "a"'), '1a')
  assert.equal(value('x = 7 % 3'), 1)
  assert.equal(value('x = 1 < 2'), true)
  assert.equal(value('x = "b" > "a"'), true)
  assert.equal(value('x = 2 == 2'), true)
  assert.equal(value('x = [1, 2] == [1, 2]'), true)
  assert.equal(value('x = {a: 1} == {a: 1}'), true)
  assert.equal(value('x = true && false'), false)
  assert.equal(value('x = false || true'), true)
  assert.equal(value('x = !"text"'), false)
  assert.equal(value('x = -3'), -3)
  assert.equal(value('x = null <= 0'), true)

  const divideByZero = run('root = x\nx = 1 / 0')
  assert.equal(divideByZero.result.root, null)
  assert.ok(divideByZero.result.diagnostics.some(d => /division by zero/.test(d.message)))

  const badCompare = run('root = x\nx = "abc" < 1')
  assert.equal(badCompare.result.root, null)
  assert.ok(badCompare.result.diagnostics.some(d => /needs numbers/.test(d.message)))
})

test('stateDefaults are independent of options.state', () => {
  const direct = 'root = Text($a + "")\n$a = 2\n$b = $a * 10'
  assert.deepEqual(evaluateProgram(parseProgram(direct)).stateDefaults, { a: 2, b: 20 })
  assert.deepEqual(evaluateProgram(parseProgram(direct), { state: { a: 5 } }).stateDefaults, { a: 2, b: 20 },
    'a derived default must not be computed from the current state')

  const indirect = 'root = Text($a + "")\n$a = 2\n$b = next\nnext = $a + 1'
  assert.deepEqual(evaluateProgram(parseProgram(indirect), { state: { a: 5 } }).stateDefaults, { a: 2, b: 3 },
    'defaults stay independent even through a plain statement')

  const live = evaluateProgram(parseProgram(direct), { state: { a: 5 } })
  assert.equal(live.root.args[0], '5', 'options.state still drives the rendered value')
})

test('the tokenizer supports // comments to the end of the line', () => {
  const trailing = run('x = 6 // 2\nroot = Text("" + x)')
  assert.deepEqual(trailing.program.diagnostics, [], diagText(trailing.program, trailing.result))
  assert.equal(trailing.result.root.args[0], '6', '// is a comment, not integer division')

  const noSpace = run('x = 6//2\nroot = Text("" + x)')
  assert.equal(noSpace.result.root.args[0], '6')

  const wholeLine = parseProgram('// a comment line\nroot = Col([])')
  assert.equal(wholeLine.ok, true)
  assert.equal(wholeLine.statements.length, 1)

  const url = run('root = Text("https://example.com") // trailing note')
  assert.equal(url.result.root.args[0], 'https://example.com', '// inside a string is not a comment')
})

test('member and index access, including array pluck', () => {
  const { result } = run([
    'root = Col([@Join(rows.name, ","), rows[1].name, rows[-1].name, rows.length + ""])',
    'rows = [{name: "a"}, {name: "b"}]',
  ].join('\n'))
  const args = result.root.args[0]
  assert.equal(args[0], 'a,b')
  assert.equal(args[1], 'b')
  assert.equal(args[2], 'b')
  assert.equal(args[3], '2')
})

test('unknown component and function names are not evaluator errors', () => {
  const component = run('root = Mystery(1)')
  assert.equal(component.result.root.kind, 'element')
  assert.equal(component.result.root.name, 'Mystery')
  assert.deepEqual(component.result.diagnostics, [])

  const builtin = run('root = Col([@Nope(1)])')
  assert.equal(builtin.result.root.args[0][0], null)
  assert.deepEqual(builtin.result.diagnostics, [])
})

test('a bad built-in argument makes the call null with one diagnostic', () => {
  const { program, result } = run('root = Text(@Sum("abc") + "")')
  assert.equal(program.ok, true)
  assert.equal(result.root.args[0], '')
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].severity, 'error')
})

test('evaluateProgram tolerates malformed programs', () => {
  for (const program of [null, undefined, {}, { statements: null }, { statements: [{}] }, { diagnostics: [{ severity: 'error', message: 'x' }] }]) {
    const result = evaluateProgram(program)
    assert.equal(typeof result.ok, 'boolean')
    assert.ok(Array.isArray(result.diagnostics))
    assert.deepEqual(result.stateDefaults, {})
  }
  assert.equal(evaluateProgram(null).ok, true)
  assert.equal(evaluateProgram({ diagnostics: [{ severity: 'error', message: 'broken' }] }).ok, false)
})

// ---------------------------------------------------------------------------
// Built-in functions
// ---------------------------------------------------------------------------

test('FUNCTIONS implements exactly the frozen v1 name list', () => {
  assert.deepEqual(Object.keys(FUNCTIONS).sort(), [...V1_FUNCTION_NAMES].sort())
  for (const name of V1_FUNCTION_NAMES) assert.equal(typeof FUNCTIONS[name], 'function', name)
  assert.equal(FUNCTIONS.Each, undefined, '@Each is handled by the evaluator, not FUNCTIONS')
})

test('callFunction reports unknown names and bad arguments without throwing', () => {
  const diagnostics = []
  assert.equal(callFunction('Nope', [], (message, severity) => diagnostics.push({ message, severity })), null)
  assert.equal(diagnostics.length, 1)
  assert.match(diagnostics[0].message, /unknown function/)
  assert.equal(diagnostics[0].severity, 'error')

  const bad = []
  assert.equal(callFunction('Sum', ['abc'], message => bad.push(message)), null)
  assert.equal(bad.length, 1)

  assert.equal(callFunction('Sum', [[1, 2]]), 3)
  assert.equal(callFunction('Sum', [null]), 0)
  assert.equal(callFunction('Sqrt', [-1]), null, 'a negative square root is null, not an error')
  assert.equal(FUNCTIONS.Sum(['abc']), null, 'direct calls never throw either')
})

test('collection and numeric built-ins', () => {
  assert.equal(FUNCTIONS.Count([[1, 2, 3]]), 3)
  assert.equal(FUNCTIONS.Count([null]), 0)
  assert.equal(FUNCTIONS.First([[1, 2]]), 1)
  assert.equal(FUNCTIONS.Last([[1, 2]]), 2)
  assert.equal(FUNCTIONS.First([[]]), null)
  assert.equal(FUNCTIONS.Sum([[1, 2, 3]]), 6)
  assert.equal(FUNCTIONS.Sum([null]), 0)
  assert.equal(FUNCTIONS.Avg([[1, 2, 3, 4]]), 2.5)
  assert.equal(FUNCTIONS.Min([[3, 1, 2]]), 1)
  assert.equal(FUNCTIONS.Max([[]]), null)
  assert.equal(FUNCTIONS.Round([2.345, 2]), 2.35)
  assert.equal(FUNCTIONS.Abs([-4]), 4)
  assert.equal(FUNCTIONS.Floor([2.9]), 2)
  assert.equal(FUNCTIONS.Ceil([2.1]), 3)
  assert.equal(FUNCTIONS.Clamp([12, 0, 10]), 10)
  assert.equal(FUNCTIONS.Percent([3, 4]), 75)
  assert.equal(FUNCTIONS.Percent([3, 0]), 0)
  assert.equal(FUNCTIONS.Lerp([0, 10, 0.25]), 2.5)
  assert.equal(FUNCTIONS.Pow([2, 10]), 1024)
  assert.equal(FUNCTIONS.Sqrt([9]), 3)
  assert.equal(FUNCTIONS.Sqrt([-1]), null)
})

test('list built-ins', () => {
  const rows = [{ k: 'a', v: 2 }, { k: 'b', v: 1 }, { k: 'c', v: 3 }]
  assert.deepEqual(FUNCTIONS.Sort([rows, 'v']).map(row => row.k), ['b', 'a', 'c'])
  assert.deepEqual(FUNCTIONS.Sort([rows, 'v', 'desc']).map(row => row.k), ['c', 'a', 'b'])
  assert.deepEqual(FUNCTIONS.Filter([rows, 'v', '>', 1]).map(row => row.k), ['a', 'c'])
  assert.deepEqual(FUNCTIONS.Filter([[[1, 2], [3, 4]], '', 'contains', 2]), [[1, 2]])
  assert.deepEqual(FUNCTIONS.Append([[1], 2]), [1, 2])
  assert.deepEqual(FUNCTIONS.Append([null, 2]), [2])
  assert.deepEqual(FUNCTIONS.Prepend([[2], 1]), [1, 2])
  assert.deepEqual(FUNCTIONS.Concat([[1], [2, 3]]), [1, 2, 3])
  assert.deepEqual(FUNCTIONS.Remove([rows, 'k', 'a']).map(row => row.k), ['b', 'c'])
  assert.deepEqual(FUNCTIONS.RemoveAt([[1, 2, 3], -1]), [1, 2])
  assert.deepEqual(FUNCTIONS.Update([[{ k: 'a', v: 1 }], 'k', 'a', 'v', 9]), [{ k: 'a', v: 9 }])
  assert.deepEqual(FUNCTIONS.Toggle([[1, 2], 2]), [1])
  assert.deepEqual(FUNCTIONS.Toggle([[1], 2]), [1, 2])
  assert.equal(FUNCTIONS.Includes([[1, 2], 2]), true)
  assert.equal(FUNCTIONS.Includes(['hello', 'ell']), true)
  assert.deepEqual(FUNCTIONS.Find([rows, 'k', 'b']), rows[1])
  assert.equal(FUNCTIONS.Find([rows, 'k', 'z']), null)
  assert.equal(FUNCTIONS.IndexOf([[1, 2, 3], 3]), 2)
  assert.equal(FUNCTIONS.IndexOf([[1, 2, 3], 9]), -1)
  assert.deepEqual(FUNCTIONS.Take([[1, 2, 3, 4], -2]), [3, 4])
  assert.deepEqual(FUNCTIONS.Slice([[1, 2, 3, 4], 1]), [2, 3, 4])
  assert.deepEqual(FUNCTIONS.Slice([[1, 2, 3, 4], -2]), [3, 4])
  assert.equal(FUNCTIONS.Slice(['abcdef', 1, -1]), 'bcde')
  assert.deepEqual(FUNCTIONS.Unique([[1, 2, 1, 3]]), [1, 2, 3])
  assert.deepEqual(FUNCTIONS.Reverse([[1, 2, 3]]), [3, 2, 1])
  assert.deepEqual(FUNCTIONS.Range([0, 3]), [0, 1, 2])
  assert.deepEqual(FUNCTIONS.Range([3, 0, -1]), [3, 2, 1])
  assert.deepEqual(FUNCTIONS.Flatten([[[1, 2], [3]]]), [1, 2, 3])
  assert.deepEqual(FUNCTIONS.Chunk([[1, 2, 3, 4, 5], 2]), [[1, 2], [3, 4], [5]])
  const randomInteger = FUNCTIONS.Random([1, 3, true])
  assert.ok(Number.isInteger(randomInteger) && randomInteger >= 1 && randomInteger <= 3)
  assert.ok([1, 2, 3].includes(FUNCTIONS.Pick([[1, 2, 3]])))
  assert.equal(FUNCTIONS.Pick([[]]), null)
  assert.deepEqual(FUNCTIONS.Shuffle([[1, 2, 3]]).slice().sort(), [1, 2, 3])
})

test('Allocate, Payment and Convert', () => {
  assert.deepEqual(FUNCTIONS.Allocate([100, [1, 1, 1]]), [33.34, 33.33, 33.33])
  assert.deepEqual(FUNCTIONS.Allocate([10, [1, 3]]), [2.5, 7.5])
  assert.ok(Math.abs(FUNCTIONS.Payment([300000, 0.5, 360]) - 1798.65) < 0.01)
  assert.equal(FUNCTIONS.Payment([1200, 0, 12]), 100)
  assert.ok(Math.abs(FUNCTIONS.Convert([1, 'km', 'mi']) - 0.621371192237334) < 1e-12)
  assert.equal(FUNCTIONS.Convert([100, 'c', 'f']), 212)
  assert.equal(FUNCTIONS.Convert([0, 'c', 'k']), 273.15)
  assert.equal(FUNCTIONS.Convert([1, 'kg', 'g']), 1000)
  const wrong = []
  assert.equal(callFunction('Convert', [1, 'kg', 'km'], message => wrong.push(message)), null)
  assert.equal(wrong.length, 1)
})

test('text and date built-ins', () => {
  assert.equal(FUNCTIONS.Format([12345.6]), '12,345.6')
  assert.equal(FUNCTIONS.Format([12345.678, 'currency']), '$12,345.68')
  assert.equal(FUNCTIONS.Format([45, 'percent']), '45%')
  assert.equal(FUNCTIONS.Format([45.5, 'percent', 1]), '45.5%')
  assert.equal(FUNCTIONS.Format([1200000, 'compact']), '1.2M')
  assert.equal(FUNCTIONS.Format([null]), '')
  assert.equal(FUNCTIONS.Join([['a', null, 'b'], '-']), 'a-b')
  assert.equal(FUNCTIONS.Join([[{ n: 'x' }, { n: 'y' }], ', ', 'n']), 'x, y')
  assert.equal(FUNCTIONS.Plural([1, 'guest']), '1 guest')
  assert.equal(FUNCTIONS.Plural([3, 'guest']), '3 guests')
  assert.equal(FUNCTIONS.Plural([2, 'person', 'people']), '2 people')
  assert.equal(FUNCTIONS.Pad([7, 2]), '07')
  assert.equal(FUNCTIONS.Upper(['abc']), 'ABC')
  assert.equal(FUNCTIONS.Lower(['ABC']), 'abc')
  assert.equal(FUNCTIONS.Trim(['  a  ']), 'a')
  assert.equal(FUNCTIONS.Capitalize(['new york']), 'New York')
  assert.deepEqual(FUNCTIONS.Split(['a, b,,c']), ['a', 'b', 'c'])
  assert.equal(FUNCTIONS.Replace(['a-b-c', '-', '+']), 'a+b+c')
  assert.equal(FUNCTIONS.Duration([4800]), '1h 20m')
  assert.equal(FUNCTIONS.Duration([245]), '4m 05s')
  assert.equal(FUNCTIONS.Duration([45]), '45s')
  assert.equal(FUNCTIONS.Duration([4800, 'clock']), '1:20:00')
  assert.equal(FUNCTIONS.Duration([245, 'clock']), '4:05')
  assert.equal(FUNCTIONS.Default([null, 5]), 5)
  assert.equal(FUNCTIONS.Default(['', 0]), 0)
  assert.equal(FUNCTIONS.Default([3, 0]), 3)
  assert.equal(FUNCTIONS.Default(['name', 'fallback']), 'name')
  assert.equal(FUNCTIONS.MixColor(['#ffffff', '#000000', 0.5]), '#808080')

  assert.match(FUNCTIONS.Now(), /^\d{4}-\d{2}-\d{2}T/)
  assert.match(FUNCTIONS.Today(), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(FUNCTIONS.FormatDate(['2026-10-09']), 'Oct 9, 2026')
  assert.equal(FUNCTIONS.FormatDate(['2026-10-09', 'short']), 'Oct 9')
  assert.equal(FUNCTIONS.FormatDate(['2026-10-09', 'iso']), '2026-10-09')
  assert.equal(FUNCTIONS.FormatDate(['2026-10-09', 'weekday']), 'Fri')
  assert.equal(FUNCTIONS.AddDays(['2026-01-31', 1]), '2026-02-01')
  assert.equal(FUNCTIONS.AddMonths(['2026-01-31', 1]), '2026-02-28')
  assert.equal(FUNCTIONS.AddMonths(['2026-01-15', 12]), '2027-01-15')
  assert.equal(FUNCTIONS.DaysBetween(['2026-01-01', '2026-01-31']), 30)
  assert.equal(FUNCTIONS.DaysBetween(['2026-01-31', '2026-01-01']), -30)
  assert.equal(FUNCTIONS.MonthsBetween(['2026-01-15', '2026-03-20']), 2)
  assert.equal(FUNCTIONS.MonthsBetween(['2026-01-20', '2026-03-15']), 1)
  assert.equal(FUNCTIONS.StartOf(['2026-01-07', 'week']), '2026-01-05')
  assert.equal(FUNCTIONS.StartOf(['2026-01-07', 'month']), '2026-01-01')
  assert.equal(FUNCTIONS.StartOf(['2026-01-07', 'year']), '2026-01-01')
})

test('aggregation built-ins', () => {
  const rows = [
    { region: 'A', cat: 'x', amount: 1, date: '2026-01-01' },
    { region: 'A', cat: 'y', amount: 2, date: '2026-01-03' },
    { region: 'B', cat: 'x', amount: 3, date: '2026-02-01' },
  ]
  assert.deepEqual(FUNCTIONS.GroupBy([rows, 'region', 'amount']), [
    { key: 'A', value: 3 },
    { key: 'B', value: 3 },
  ])
  assert.deepEqual(FUNCTIONS.GroupBy([rows, 'region']), [
    { key: 'A', value: 2 },
    { key: 'B', value: 1 },
  ])
  assert.deepEqual(FUNCTIONS.Pivot([rows, 'region', 'cat', 'amount']), [
    { key: 'A', x: 1, y: 2 },
    { key: 'B', x: 3, y: 0 },
  ])
  assert.deepEqual(FUNCTIONS.Top([rows, 'amount', 2]).map(row => row.region), ['B', 'A'])
  assert.deepEqual(FUNCTIONS.Top([rows, 'amount', 1, 'asc']).map(row => row.region), ['A'])
  assert.deepEqual(FUNCTIONS.Between([rows, 'amount', 2, 3]).map(row => row.region), ['A', 'B'])
  assert.deepEqual(FUNCTIONS.Between([rows, 'amount', 2]).map(row => row.region), ['A', 'B'])
  assert.deepEqual(FUNCTIONS.Bucket([[{ date: '2026-01-01', amount: 1 }, { date: '2026-01-03', amount: 2 }], 'date', 'day', 'amount']), [
    { key: '2026-01-01', value: 1 },
    { key: '2026-01-02', value: 0 },
    { key: '2026-01-03', value: 2 },
  ])
  assert.deepEqual(FUNCTIONS.Bucket([rows, 'date', 'week', 'amount']), [
    { key: '2025-12-29', value: 3 },
    { key: '2026-01-05', value: 0 },
    { key: '2026-01-12', value: 0 },
    { key: '2026-01-19', value: 0 },
    { key: '2026-01-26', value: 3 },
  ])
  assert.deepEqual(FUNCTIONS.Bucket([rows, 'date', 'month', 'amount']), [
    { key: '2026-01', value: 3 },
    { key: '2026-02', value: 3 },
  ])
  assert.deepEqual(FUNCTIONS.Cumulative([[1, 2, 3], '']), [1, 3, 6])
  assert.deepEqual(FUNCTIONS.Cumulative([rows, 'amount']).map(row => row.amount), [1, 3, 6])
  assert.deepEqual(FUNCTIONS.MovingAvg([[1, 2, 3], '', 2]), [1, 1.5, 2.5])
  assert.equal(FUNCTIONS.Change([120, 100]), 20)
  assert.equal(FUNCTIONS.Change([1, 0]), null)
  assert.deepEqual(FUNCTIONS.Histogram([[1, 2, 3, 4], 2]).map(bin => bin.value), [2, 2])
  assert.deepEqual(FUNCTIONS.Histogram([[1, 2, 3, 4], 2]).map(bin => bin.start), [1, 2.5])
  assert.deepEqual(FUNCTIONS.Stats([[1, 2, 3, 4]]), {
    count: 4, min: 1, max: 4, mean: 2.5, median: 2.5, stdev: Math.sqrt(1.25),
  })
  assert.deepEqual(FUNCTIONS.Stats([[]]), { count: 0, min: 0, max: 0, mean: 0, median: 0, stdev: 0 })
})

test('missing values are skipped by aggregates, not counted as 0', () => {
  assert.equal(FUNCTIONS.Min([[null, 5, 9]]), 5)
  assert.equal(FUNCTIONS.Max([[null, 5, 9]]), 9)
  assert.equal(FUNCTIONS.Avg([[null, 10]]), 10)
  assert.equal(FUNCTIONS.Sum([[null, 10]]), 10)
  assert.deepEqual(FUNCTIONS.Stats([[null, 10]]), { count: 1, min: 10, max: 10, mean: 10, median: 10, stdev: 0 })
  assert.deepEqual(FUNCTIONS.GroupBy([[{ k: 'a', v: null }, { k: 'a', v: 10 }], 'k', 'v', 'avg']), [{ key: 'a', value: 10 }])
  assert.deepEqual(FUNCTIONS.Pivot([[{ r: 'a', c: 'x', v: null }, { r: 'a', c: 'x', v: 10 }], 'r', 'c', 'v', 'sum']), [{ key: 'a', x: 10 }])
  assert.deepEqual(FUNCTIONS.Bucket([[{ d: '2026-01-01', v: null }, { d: '2026-01-01', v: 10 }], 'd', 'day', 'v', 'avg']), [{ key: '2026-01-01', value: 10 }])
  assert.deepEqual(FUNCTIONS.MovingAvg([[null, 10], '', 2]), [0, 10])
  assert.deepEqual(FUNCTIONS.Histogram([[null, 1, 2], 2]).map(bin => bin.value), [1, 1])

  // The documented "empty list -> null / 0" behaviour is preserved.
  assert.equal(FUNCTIONS.Min([[]]), null)
  assert.equal(FUNCTIONS.Max([[]]), null)
  assert.equal(FUNCTIONS.Avg([[]]), 0)
  assert.deepEqual(FUNCTIONS.Stats([[]]), { count: 0, min: 0, max: 0, mean: 0, median: 0, stdev: 0 })

  // A missing field never satisfies an ordering comparison.
  const partial = [{ v: null }, { v: 5 }]
  assert.deepEqual(FUNCTIONS.Filter([partial, 'v', '<', 3]), [])
  assert.deepEqual(FUNCTIONS.Filter([partial, 'v', '>=', 3]), [{ v: 5 }])
  assert.deepEqual(FUNCTIONS.Filter([partial, 'v', '==', null]), [{ v: null }])
})

test('data built-ins keep their documented edge behaviour', () => {
  // @Bucket: empty periods are 0 for sums and null for min/max.
  assert.deepEqual(FUNCTIONS.Bucket([[{ d: '2026-01-01', v: 1 }, { d: '2026-01-03', v: 2 }], 'd', 'day', 'v', 'min']), [
    { key: '2026-01-01', value: 1 },
    { key: '2026-01-02', value: null },
    { key: '2026-01-03', value: 2 },
  ])
  // @GroupBy with a field and agg "count" counts the rows in the group.
  assert.deepEqual(FUNCTIONS.GroupBy([[{ k: 'a', v: null }, { k: 'a', v: 2 }], 'k', 'v', 'count']), [{ key: 'a', value: 2 }])
  // @Pivot never lets a column overwrite the row label or another column.
  assert.deepEqual(FUNCTIONS.Pivot([[{ r: 'a', c: 'key', v: 1 }], 'r', 'c', 'v']), [{ key: 'a', 'key (2)': 1 }])
  assert.deepEqual(
    FUNCTIONS.Pivot([[{ r: 'a', c: 1, v: 1 }, { r: 'a', c: '1', v: 2 }], 'r', 'c', 'v']),
    [{ key: 'a', 1: 1, '1 (2)': 2 }],
  )
  // @Change is relative to |previous| and null when previous is 0.
  assert.equal(FUNCTIONS.Change([0, -100]), 100)
  assert.equal(FUNCTIONS.Change([1, 0]), null)
})

test('@Unique deduplicates primitives in O(n) and structures by value', () => {
  assert.deepEqual(FUNCTIONS.Unique([[1, '1', 1, null, undefined, NaN, NaN]]), [1, '1', null, NaN])
  assert.deepEqual(FUNCTIONS.Unique([[{ a: 1 }, { a: 1 }, [1], [1], { a: 2 }]]), [{ a: 1 }, [1], { a: 2 }])

  const many = Array.from({ length: 8000 }, (_, index) => index)
  const started = process.hrtime.bigint()
  const unique = FUNCTIONS.Unique([many])
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  assert.equal(unique.length, 8000)
  assert.ok(elapsedMs < 500, `@Unique over 8000 numbers took ${elapsedMs.toFixed(1)} ms`)
})

test('enum arguments are validated instead of silently falling back', () => {
  const call = (name, args) => {
    const diagnostics = []
    const value = callFunction(name, args, message => diagnostics.push(message))
    return { value, diagnostics }
  }
  const badKind = call('Format', [45, 'money'])
  assert.equal(badKind.value, null)
  assert.match(badKind.diagnostics[0], /@Format expects/)

  const badStyle = call('Duration', [60, 'verbose'])
  assert.equal(badStyle.value, null)
  assert.match(badStyle.diagnostics[0], /@Duration expects/)

  const badDirection = call('Top', [[{ v: 1 }], 'v', 1, 'sideways'])
  assert.equal(badDirection.value, null)
  assert.match(badDirection.diagnostics[0], /@Top expects/)
  assert.equal(call('Sort', [[{ v: 1 }], 'v', 'up']).value, null)

  // Documented synonyms are accepted.
  assert.deepEqual(FUNCTIONS.Top([[{ v: 1 }, { v: 3 }, { v: 2 }], 'v', 2, 'ascending']), [{ v: 1 }, { v: 2 }])
  assert.deepEqual(FUNCTIONS.Sort([[{ v: 1 }, { v: 3 }, { v: 2 }], 'v', 'descending']), [{ v: 3 }, { v: 2 }, { v: 1 }])
  assert.equal(FUNCTIONS.Duration([60, 'clock']), '1:00')
  assert.equal(FUNCTIONS.Format([45, 'percent']), '45%')
})

test('@Format and @FormatDate stay correct over many rows', () => {
  const rows = Array.from({ length: 300 }, (_, index) => `{name: "r${index}", value: ${index * 3}, date: "2026-10-${String((index % 28) + 1).padStart(2, '0')}"}`).join(',')
  const source = `root = Table(["n", "v", "d"], @Each(rows, "r", [r.name, @Format(r.value, "number"), @FormatDate(r.date, "short")]))\nrows = [${rows}]`
  const program = parseProgram(source)
  const started = process.hrtime.bigint()
  const result = evaluateProgram(program)
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  assert.equal(result.ok, true, diagText(program, result))
  // @Each concatenates array templates one level, so the row cells are flat in template order.
  const cells = result.root.args[1]
  assert.equal(cells.length, 900)
  assert.equal(cells[1], '0')
  assert.equal(cells[299 * 3 + 1], '897')
  assert.equal(cells[0], 'r0')
  assert.equal(cells[299 * 3], 'r299')
  assert.ok(elapsedMs < 1000, `300 formatted rows took ${elapsedMs.toFixed(1)} ms`)
})

// ---------------------------------------------------------------------------
// Signatures and prompt text
// ---------------------------------------------------------------------------

test('COMPONENT_SIGNATURES holds exactly the 48 frozen components', () => {
  const expected = Object.entries(V1_COMPONENT_GROUPS).flatMap(([, names]) => names)
  assert.equal(COMPONENT_SIGNATURES.length, 48)
  assert.deepEqual(COMPONENT_SIGNATURES.map(signature => signature.name), expected)

  for (const [group, names] of Object.entries(V1_COMPONENT_GROUPS)) {
    assert.deepEqual(
      COMPONENT_SIGNATURES.filter(signature => signature.group === group).map(signature => signature.name),
      names,
      group,
    )
  }

  const names = COMPONENT_SIGNATURES.map(signature => signature.name)
  for (const forbidden of FORBIDDEN_COMPONENTS) {
    assert.ok(!names.includes(forbidden), `${forbidden} must not be in v1`)
  }

  for (const signature of COMPONENT_SIGNATURES) {
    assert.ok(signature.description.length > 0, `${signature.name} needs a description`)
    for (const arg of signature.args) {
      assert.equal(typeof arg.name, 'string')
      assert.equal(typeof arg.type, 'string')
      assert.equal(typeof arg.required, 'boolean')
    }
    const required = signature.args.filter(arg => arg.required).length
    const optional = signature.args.length - required
    assert.ok(signature.args.slice(required).every(arg => !arg.required), `${signature.name}: required args come first`)
    assert.ok(optional >= 0)
  }
})

test('component argument order and required counts match the frozen table', () => {
  const byName = new Map(COMPONENT_SIGNATURES.map(signature => [signature.name, signature]))
  const args = name => byName.get(name).args.map(arg => arg.name)
  const required = name => byName.get(name).args.filter(arg => arg.required).map(arg => arg.name)

  assert.deepEqual(args('Col'), ['children', 'gap', 'align'])
  assert.deepEqual(required('Col'), ['children'])
  assert.deepEqual(args('Box'), ['children', 'direction', 'gap', 'padding', 'background', 'radius', 'border', 'width', 'height', 'flex', 'align', 'justify', 'wrap'])
  assert.deepEqual(required('Box'), [])
  assert.deepEqual(args('Svg'), ['children', 'viewBox', 'width', 'height'])
  assert.deepEqual(required('Svg'), ['children', 'viewBox'])
  assert.deepEqual(args('Input'), ['value', 'label', 'type', 'placeholder'])
  assert.deepEqual(required('Input'), ['value'])
  assert.deepEqual(args('Slider'), ['value', 'min', 'max', 'step', 'label', 'unit', 'marks'])
  assert.deepEqual(required('Slider'), ['value', 'min', 'max'])
  assert.deepEqual(args('Chart'), ['type', 'data', 'x', 'series', 'format', 'currency', 'stacked', 'height'])
  assert.deepEqual(required('Chart'), ['type', 'data'])
  assert.deepEqual(args('Table'), ['columns', 'rows'])
  assert.deepEqual(required('Table'), ['columns', 'rows'])
  assert.deepEqual(args('Checkbox'), ['checked', 'label', 'lineThrough'])
  assert.deepEqual(required('Checkbox'), ['checked', 'label'])
  assert.deepEqual(args('Divider'), [])
  assert.deepEqual(args('Spacer'), [])
})

test('taught enum values are the ones the renderer accepts', () => {
  const byName = new Map(COMPONENT_SIGNATURES.map(signature => [signature.name, signature]))
  const quoted = (name, arg) => {
    const entry = byName.get(name).args.find(candidate => candidate.name === arg)
    return (entry.type.match(/"[^"]+"/g) ?? []).map(value => value.slice(1, -1))
  }

  // src/client/components: Card maps outlined/soft/elevated, Button and IconButton map
  // primary/secondary/ghost/outline/danger, Badge paints IUI_COLORS (no "neutral"),
  // RadioGroup only recognises cards (list is the default layout), List has dash/check,
  // Text has no 3xl (Title does), Image supports cover/contain.
  assert.deepEqual(quoted('Card', 'variant'), ['soft', 'outlined', 'elevated'])
  for (const name of ['Button', 'IconButton']) {
    assert.deepEqual(quoted(name, 'variant'), ['primary', 'secondary', 'ghost', 'outline', 'danger'], name)
  }
  assert.deepEqual(quoted('RadioGroup', 'variant'), ['list', 'cards'])
  assert.deepEqual(quoted('Text', 'size'), ['xs', 'sm', 'md', 'lg', 'xl', '2xl'])
  assert.ok(quoted('Title', 'size').includes('3xl'), 'the Title scale has 3xl')
  assert.ok(!quoted('Badge', 'color').includes('neutral'), 'Badge has no "neutral" colour token')
  assert.deepEqual(quoted('List', 'marker'), ['bullet', 'number', 'dash', 'check', 'none'])
  assert.deepEqual(quoted('Image', 'fit'), ['cover', 'contain'])
})

test('FUNCTION_SIGNATURES covers the v1 functions plus @Each', () => {
  assert.deepEqual(
    FUNCTION_SIGNATURES.map(signature => signature.name),
    [...V1_FUNCTION_NAMES, 'Each'],
  )
  for (const signature of FUNCTION_SIGNATURES) {
    assert.match(signature.signature, /^@/, `${signature.name} signature starts with @`)
    assert.ok(signature.description.length > 0, `${signature.name} needs a description`)
  }
})

test('EXAMPLES are two short, valid programs', () => {
  assert.equal(EXAMPLES.length, 2)
  for (const example of EXAMPLES) {
    assert.ok(example.title.length > 0)
    assert.ok(example.program.includes('root ='))
    const { program, result } = run(example.program)
    assert.deepEqual(program.diagnostics, [], diagText(program, result))
    assert.deepEqual(result.diagnostics, [], diagText(program, result))
    assert.equal(program.ok, true)
    assert.equal(result.ok, true)
    assert.equal(result.root.kind, 'element')
    assert.ok(example.program.length < 900, 'examples stay short')
  }
})

test('systemPromptSectionText teaches every name inside the size budget', () => {
  const text = systemPromptSectionText()
  assert.ok(text.length < 8400, `prompt is ${text.length} characters`)
  assert.match(text, /intelligent_ui/)
  assert.match(text, /POSITIONAL/)
  assert.match(text, /@Each/)
  assert.match(text, /Actions/)
  assert.match(text, /physical line/, 'prompt must forbid statements that span lines')
  assert.match(text, /Names are ASCII/, 'prompt must say identifiers are ASCII only')
  assert.match(text, /object keys are bare ASCII identifiers or quoted/, 'prompt must require quoted non-ASCII object keys')
  assert.match(text, /Card` variant "soft" or "outlined"/, 'prompt must teach the real Card variant values')
  assert.match(text, /@Payment\(principal, rate, periods\)/, 'prompt must teach @Payment for loan math')
  assert.match(text, /skip a middle optional with `null`/, 'prompt must teach the null argument placeholder')
  assert.match(text, /`\/\/` starts a comment/, 'prompt must teach // comments')
  assert.match(text, /loop variable has no `\$`/, 'prompt must teach the @Each loop-variable scope')
  assert.match(text, /`&&`, `\|\|` and `!` return true\/false/, 'prompt must teach boolean && / || / !')
  assert.match(text, /60,000 characters/, 'prompt must teach the program size cap')
  assert.match(text, /0\.45 → 45%/, 'prompt must tell the two percent conventions apart')
  assert.match(text, /@Sort`\/`@Top` dir asc\|desc/, 'prompt must teach the validated enum arguments')
  assert.match(text, /`@Format` kind number\|currency\|percent\|compact/, 'prompt must teach the @Format kinds')

  for (const signature of COMPONENT_SIGNATURES) {
    assert.ok(text.includes(`${signature.name}(`), `prompt must teach ${signature.name}`)
    if (signature.args.length > 0) {
      assert.ok(text.includes(signature.args[0].name), `prompt must name the first argument of ${signature.name}`)
    }
  }
  for (const signature of FUNCTION_SIGNATURES) {
    assert.ok(text.includes(signature.signature), `prompt must teach ${signature.signature}`)
  }
  for (const example of EXAMPLES) {
    assert.ok(text.includes(example.program), 'prompt must quote each example')
  }
})

// ---------------------------------------------------------------------------
// Bundle constraints
// ---------------------------------------------------------------------------

test('every language-core file is bundle-safe ESM', () => {
  const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lang')
  const files = readdirSync(directory).filter(name => name.endsWith('.js'))
  assert.ok(files.length >= 7, `expected the language core files, found ${files.join(', ')}`)

  const declarations = new Map()
  for (const file of files) {
    const source = readFileSync(path.join(directory, file), 'utf8')
    assert.ok(!/export\s+default/.test(source), `${file} must not use export default`)
    assert.ok(!/(^|[^\w$])var\s+[A-Za-z_$]/.test(source), `${file} must not use var`)
    for (const line of source.split('\n')) {
      if (line.startsWith('import ')) {
        assert.match(line, /from '\.\//, `${file}: imports must be ./ relative`)
      }
      if (line.startsWith('export ') && line.includes(' from ')) {
        assert.equal(file, 'index.js', `${file}: only the barrel may re-export from another file`)
      }
      if (line.startsWith('export {') && !line.includes(' from ')) {
        assert.fail(`${file}: a bare export list would survive the build`)
      }
    }
    const pattern = /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm
    for (const match of source.matchAll(pattern)) {
      const name = match[1]
      assert.ok(!declarations.has(name), `top-level name ${name} is declared twice (${declarations.get(name)} and ${file})`)
      declarations.set(name, file)
    }
  }

  // The names the host imports must exist in the barrel.
  const barrel = readFileSync(path.join(directory, 'index.js'), 'utf8')
  for (const name of ['parseProgram', 'evaluateProgram', 'FUNCTIONS', 'callFunction', 'COMPONENT_SIGNATURES', 'FUNCTION_SIGNATURES', 'systemPromptSectionText', 'EXAMPLES']) {
    assert.ok(barrel.includes(name), `barrel must export ${name}`)
    assert.ok(declarations.has(name), `lang-core must declare ${name}`)
  }
})
