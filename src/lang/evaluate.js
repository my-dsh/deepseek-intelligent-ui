/**
 * Evaluator for the openui-lang AST.
 *
 * Evaluation is pure and lazy: statements are resolved by name on demand (so a reference
 * may be used before its statement appears), memoized once, and cycles are reported as
 * errors instead of recursing. Values are JSON-ish, except for the two descriptors the
 * renderer understands:
 *
 * - `ElementDescriptor`: `{ kind: 'element', name, args, line }` for component calls and
 *   `@`-action calls in value position.
 * - `BindingDescriptor`: `{ kind: 'binding', name, value }` for a `$variable` that is used
 *   as a direct argument of a component or of an action's variable slot.
 *
 * @module src/lang/evaluate
 */

import { FUNCTIONS, callFunction, fxDeepEqual, fxIsPlainObject, fxText, fxToNumber, fxTruthy } from './functions.js'

/** @typedef {{ severity: 'error'|'warning', message: string, line?: number }} Diagnostic */

/** Calls that describe an action rather than a value. */
const evalActionNames = new Set(['Set', 'Reset', 'OpenUrl', 'CopyToClipboard', 'ToAssistant', 'Action'])

/**
 * Which argument positions of an action call keep a `$variable` as a binding descriptor.
 * `"all"` keeps every argument (used by `@Reset($a, $b)`); the default is none, so a plain
 * value such as `@Set($final, $choice)` stores the value, not a descriptor.
 */
const evalActionBindingArgs = { Set: [0], Reset: 'all' }

/** Maximum expression nesting depth before evaluation gives up. */
const evalMaxDepth = 250

/** Fallback environment used when a node is evaluated without one. */
const evalEmptyEnv = { loops: null, line: 0 }

/**
 * Evaluate a parsed program.
 * @param {{ statements?: object[], diagnostics?: Diagnostic[] }} program - result of `parseProgram`.
 * @param {{ state?: Record<string, any> }} [options] - current values of `$variables`.
 * @returns {{ ok: boolean, root: any, diagnostics: Diagnostic[], stateDefaults: Record<string, any> }} evaluation result.
 */
export function evaluateProgram(program, options) {
  const parsed = program && typeof program === 'object' ? program : {}
  const diagnostics = []
  if (Array.isArray(parsed.diagnostics)) {
    for (const diagnostic of parsed.diagnostics) {
      if (diagnostic && diagnostic.severity === 'error') {
        diagnostics.push({ severity: 'error', message: String(diagnostic.message ?? ''), line: diagnostic.line })
      }
    }
  }

  const userState = options && typeof options.state === 'object' && options.state !== null ? options.state : null
  const statements = Array.isArray(parsed.statements) ? parsed.statements : []
  const statementByKey = new Map()
  for (const statement of statements) {
    if (!statement || typeof statement.name !== 'string') continue
    statementByKey.set(statement.state === true ? `$${statement.name}` : statement.name, statement)
  }

  const values = new Map()
  const defaults = new Map()
  const visiting = new Set()
  const stateDefaults = {}
  let depthReported = false

  /**
   * Append one diagnostic.
   * @param {string} message - human-readable message.
   * @param {number} [line] - source line.
   * @param {'error'|'warning'} [severity] - severity, default `error`.
   * @returns {void}
   */
  function report(message, line, severity) {
    diagnostics.push({ severity: severity || 'error', message, line: typeof line === 'number' ? line : 0 })
  }

  /**
   * Evaluation environment of a statement: program scope, so a statement never sees an
   * `@Each` loop variable (the loop variable only exists inside the template).
   * @param {number} line - the statement's line.
   * @returns {{ loops: null, line: number }} environment.
   */
  function programEnv(line) {
    return { loops: null, line: typeof line === 'number' ? line : 0 }
  }

  /**
   * Value of a plain (non-`$`) statement, memoized.
   * @param {string} name - statement name.
   * @returns {any} the value, or null when unknown or part of a cycle.
   */
  function loadValue(name) {
    if (values.has(name)) return values.get(name)
    const statement = statementByKey.get(name)
    if (!statement) return null
    if (visiting.has(name)) {
      report(`circular reference: "${name}" eventually refers to itself`, statement.line)
      return null
    }
    visiting.add(name)
    let value = null
    try {
      value = evaluate(statement.expr, programEnv(statement.line), false, 0)
    } finally {
      visiting.delete(name)
    }
    values.set(name, value)
    return value
  }

  /**
   * Evaluated default of a `$name = ...` statement, memoized and independent of
   * `options.state`.
   * @param {string} name - state variable name.
   * @returns {any} the default value, or null when undeclared.
   */
  function stateDefault(name) {
    if (defaults.has(name)) return defaults.get(name)
    const key = `$${name}`
    const statement = statementByKey.get(key)
    if (!statement) return null
    if (visiting.has(key)) {
      report(`circular reference: "${key}" eventually refers to itself`, statement.line)
      return null
    }
    visiting.add(key)
    let value = null
    try {
      value = evaluate(statement.expr, programEnv(statement.line), false, 0)
    } finally {
      visiting.delete(key)
    }
    defaults.set(name, value)
    return value
  }

  /**
   * Read a reference: a loop variable, a `$state` value, or a statement value.
   * @param {string} name - referenced name.
   * @param {boolean} isState - whether the reference was written `$name`.
   * @param {{ loops: Map<string, any> | null, line: number }} env - current environment.
   * @returns {any} the value.
   */
  function readReference(name, isState, env) {
    if (!isState && env && env.loops && env.loops.has(name)) return env.loops.get(name)
    if (isState) {
      if (userState && Object.prototype.hasOwnProperty.call(userState, name)) return userState[name]
      if (statementByKey.has(`$${name}`)) return stateDefault(name)
      return null
    }
    if (!statementByKey.has(name)) {
      report(`unknown reference "${name}": no statement defines it`, env ? env.line : 0)
      return null
    }
    return loadValue(name)
  }

  /**
   * Read a property, with array pluck (`rows.amount`).
   * @param {any} target - receiver value.
   * @param {string} prop - property name.
   * @param {{ line: number }} env - current environment, for diagnostics.
   * @returns {any} the member value.
   */
  function evalMember(target, prop, env) {
    if (target === null || target === undefined) return null
    if (Array.isArray(target)) {
      if (prop === 'length') return target.length
      return target.map((item) => {
        if (item === null || item === undefined) return null
        if (fxIsPlainObject(item)) return Object.prototype.hasOwnProperty.call(item, prop) ? item[prop] : null
        return null
      })
    }
    if (typeof target === 'string') return prop === 'length' ? target.length : null
    if (fxIsPlainObject(target)) return Object.prototype.hasOwnProperty.call(target, prop) ? target[prop] : null
    report(`cannot read ".${prop}" of a ${typeof target}`, env ? env.line : 0)
    return null
  }

  /**
   * Read an index, tolerating negative indexes.
   * @param {any} target - receiver value.
   * @param {any} index - index value.
   * @param {{ line: number }} env - current environment, for diagnostics.
   * @returns {any} the indexed value.
   */
  function evalIndex(target, index, env) {
    if (target === null || target === undefined) return null
    let numeric = null
    if (typeof index === 'number' && Number.isFinite(index)) numeric = Math.trunc(index)
    else if (typeof index === 'string' && index.trim() !== '' && !Number.isNaN(Number(index))) numeric = Math.trunc(Number(index))
    if (Array.isArray(target)) {
      if (numeric === null) {
        report('an array index must be a number', env ? env.line : 0)
        return null
      }
      const at = numeric < 0 ? target.length + numeric : numeric
      return at >= 0 && at < target.length ? target[at] : null
    }
    if (typeof target === 'string') {
      if (numeric === null) {
        report('a text index must be a number', env ? env.line : 0)
        return null
      }
      const at = numeric < 0 ? target.length + numeric : numeric
      return at >= 0 && at < target.length ? target.charAt(at) : null
    }
    if (fxIsPlainObject(target)) {
      const key = fxText(index)
      return Object.prototype.hasOwnProperty.call(target, key) ? target[key] : null
    }
    report('only arrays, strings and objects can be indexed', env ? env.line : 0)
    return null
  }

  /**
   * Evaluate a prefix `!` or `-`.
   * @param {object} node - unary node.
   * @param {object} env - environment.
   * @param {number} depth - nesting depth.
   * @returns {any} the value.
   */
  function evalUnary(node, env, depth) {
    const value = evaluate(node.arg, env, false, depth + 1)
    if (node.op === '!') return !fxTruthy(value)
    if (node.op === '-') {
      const number = fxToNumber(value)
      if (Number.isNaN(number)) {
        report('"-" needs a number', env ? env.line : 0)
        return null
      }
      return -number
    }
    return null
  }

  /**
   * Apply a numeric binary operator.
   * @param {any} left - left value.
   * @param {any} right - right value.
   * @param {string} op - operator.
   * @param {object} env - environment.
   * @returns {any} the value.
   */
  function evalArithmetic(left, right, op, env) {
    const first = fxToNumber(left)
    const second = fxToNumber(right)
    if (Number.isNaN(first) || Number.isNaN(second)) {
      report(`"${op}" needs numbers`, env ? env.line : 0)
      return null
    }
    if (op === '+') return first + second
    if (op === '-') return first - second
    if (op === '*') return first * second
    if (op === '/' || op === '%') {
      if (second === 0) {
        report(`division by zero in "${op}"`, env ? env.line : 0)
        return null
      }
      return op === '/' ? first / second : first % second
    }
    return null
  }

  /**
   * Apply a relational operator.
   * @param {any} left - left value.
   * @param {any} right - right value.
   * @param {string} op - operator.
   * @param {object} env - environment.
   * @returns {any} the boolean result, or null when the operands are not comparable.
   */
  function evalComparison(left, right, op, env) {
    let first = left
    let second = right
    if (!(typeof first === 'string' && typeof second === 'string')) {
      first = fxToNumber(left)
      second = fxToNumber(right)
      if (Number.isNaN(first) || Number.isNaN(second)) {
        report(`"${op}" needs numbers`, env ? env.line : 0)
        return null
      }
    }
    if (op === '<') return first < second
    if (op === '<=') return first <= second
    if (op === '>') return first > second
    return first >= second
  }

  /**
   * Apply one binary operator whose left operand is already evaluated.
   * @param {string} op - operator.
   * @param {any} left - evaluated left value.
   * @param {object} rightNode - right operand node, evaluated lazily.
   * @param {object} env - environment.
   * @param {number} depth - nesting depth.
   * @returns {any} the value.
   */
  function applyBinary(op, left, rightNode, env, depth) {
    if (op === '&&') return fxTruthy(left) ? fxTruthy(evaluate(rightNode, env, false, depth + 1)) : false
    if (op === '||') return fxTruthy(left) ? true : fxTruthy(evaluate(rightNode, env, false, depth + 1))
    const right = evaluate(rightNode, env, false, depth + 1)
    if (op === '==') return fxDeepEqual(left, right)
    if (op === '!=') return !fxDeepEqual(left, right)
    if (op === '+') {
      if (typeof left === 'string' || typeof right === 'string') return fxText(left) + fxText(right)
      return evalArithmetic(left, right, '+', env)
    }
    if (op === '-' || op === '*' || op === '/' || op === '%') {
      return evalArithmetic(left, right, op, env)
    }
    if (op === '<' || op === '<=' || op === '>' || op === '>=') {
      return evalComparison(left, right, op, env)
    }
    return null
  }

  /**
   * Evaluate a binary expression by walking its left spine iteratively, so a long flat
   * chain such as `1 + 2 + 3 + ...` never grows the JavaScript stack.
   * @param {object} node - binary node.
   * @param {object} env - environment.
   * @param {number} depth - nesting depth.
   * @returns {any} the value.
   */
  function evalBinary(node, env, depth) {
    const spine = []
    let current = node
    while (current && current.t === 'bin') {
      spine.push(current)
      current = current.left
    }
    let value = evaluate(current, env, false, depth + 1)
    for (let index = spine.length - 1; index >= 0; index -= 1) {
      const step = spine[index]
      value = applyBinary(step.op, value, step.right, env, depth)
    }
    return value
  }

  /**
   * Evaluate `@Each(list, "name", template)`.
   * @param {object} node - call node.
   * @param {object} env - environment.
   * @param {number} depth - nesting depth.
   * @param {number} line - diagnostic line.
   * @returns {any[] | null} the concatenated results.
   */
  function evalEach(node, env, depth, line) {
    const args = Array.isArray(node.args) ? node.args : []
    if (args.length < 3) {
      report('@Each needs a list, a loop variable name and a template', line)
      return null
    }
    const list = evaluate(args[0], env, false, depth + 1)
    if (list !== null && list !== undefined && !Array.isArray(list)) {
      report('@Each expects an array as its first argument', line)
      return null
    }
    const variable = evaluate(args[1], env, false, depth + 1)
    if (typeof variable !== 'string' || variable === '') {
      report('@Each needs the loop variable name as a string, like @Each(rows, "row", ...)', line)
      return null
    }
    const items = Array.isArray(list) ? list : []
    const out = []
    for (const item of items) {
      if (item === null || item === undefined) continue
      const loops = env && env.loops ? new Map(env.loops) : new Map()
      loops.set(variable, item)
      const value = evaluate(args[2], { loops, line: env ? env.line : line }, false, depth + 1)
      if (Array.isArray(value)) {
        for (const entry of value) out.push(entry)
      } else {
        out.push(value)
      }
    }
    return out
  }

  /**
   * Evaluate a call: `@Each`, an action step, a built-in `@function`, or a component.
   * @param {object} node - call node.
   * @param {object} env - environment.
   * @param {number} depth - nesting depth.
   * @returns {any} the value.
   */
  function evalCall(node, env, depth) {
    const line = typeof node.line === 'number' ? node.line : env ? env.line : 0
    const name = typeof node.name === 'string' ? node.name : ''
    if (name === '@Each') return evalEach(node, env, depth, line)
    const args = Array.isArray(node.args) ? node.args : []

    if (name.charAt(0) !== '@') {
      // A component call keeps `$variable` arguments as binding descriptors.
      return { kind: 'element', name, args: args.map(arg => evaluate(arg, env, true, depth + 1)), line }
    }

    const bare = name.slice(1)
    if (evalActionNames.has(bare)) {
      const keep = Object.prototype.hasOwnProperty.call(evalActionBindingArgs, bare) ? evalActionBindingArgs[bare] : []
      return {
        kind: 'element',
        name,
        args: args.map((arg, index) => evaluate(arg, env, keep === 'all' || (Array.isArray(keep) && keep.includes(index)), depth + 1)),
        line,
      }
    }

    if (typeof FUNCTIONS[bare] !== 'function') return null
    return callFunction(bare, args.map(arg => evaluate(arg, env, false, depth + 1)), (message, severity) => {
      report(message, line, severity)
    })
  }

  /**
   * Evaluate one expression node.
   * @param {object} node - AST node.
   * @param {object} env - environment.
   * @param {boolean} keepBinding - whether a `$variable` stays a binding descriptor.
   * @param {number} depth - nesting depth.
   * @returns {any} the value.
   */
  function evaluate(node, env, keepBinding, depth) {
    if (node === null || typeof node !== 'object') return null
    if (depth > evalMaxDepth) {
      if (!depthReported) {
        depthReported = true
        report('the expression is nested too deeply to evaluate', env ? env.line : 0)
      }
      return null
    }
    switch (node.t) {
      case 'str':
        return typeof node.v === 'string' ? node.v : ''
      case 'num':
        return typeof node.v === 'number' ? node.v : 0
      case 'bool':
        return node.v === true
      case 'null':
        return null
      case 'arr':
        return (Array.isArray(node.items) ? node.items : []).map(item => evaluate(item, env, false, depth + 1))
      case 'obj': {
        const out = {}
        for (const entry of Array.isArray(node.entries) ? node.entries : []) {
          if (!entry || typeof entry.key !== 'string') continue
          out[entry.key] = evaluate(entry.value, env, false, depth + 1)
        }
        return out
      }
      case 'ref': {
        const value = readReference(node.name, node.state === true, env)
        if (node.state === true && keepBinding) return { kind: 'binding', name: node.name, value }
        return value
      }
      case 'mem':
        return evalMember(evaluate(node.obj, env, false, depth + 1), node.prop, env || evalEmptyEnv)
      case 'idx':
        return evalIndex(evaluate(node.obj, env, false, depth + 1), evaluate(node.index, env, false, depth + 1), env || evalEmptyEnv)
      case 'un':
        return evalUnary(node, env, depth)
      case 'bin':
        return evalBinary(node, env, depth)
      case 'tern':
        return fxTruthy(evaluate(node.cond, env, false, depth + 1))
          ? evaluate(node.then, env, false, depth + 1)
          : evaluate(node.else, env, false, depth + 1)
      case 'call':
        return evalCall(node, env, depth)
      case 'error':
        return null
      default:
        return null
    }
  }

  const rootStatement = statementByKey.get('root')
  const root = rootStatement ? loadValue('root') : null

  for (const statement of statements) {
    if (!statement || statement.state !== true || typeof statement.name !== 'string') continue
    if (!Object.prototype.hasOwnProperty.call(stateDefaults, statement.name)) {
      stateDefaults[statement.name] = stateDefault(statement.name)
    }
  }
  for (const statement of statements) {
    if (!statement || statement.state === true || typeof statement.name !== 'string') continue
    loadValue(statement.name)
  }

  const seen = new Set()
  const unique = []
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.severity}|${diagnostic.line ?? 0}|${diagnostic.message}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(diagnostic)
  }

  return {
    ok: unique.every(diagnostic => diagnostic.severity !== 'error'),
    root,
    diagnostics: unique,
    stateDefaults,
  }
}
