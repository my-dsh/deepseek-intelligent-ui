/**
 * Recursive-descent parser for openui-lang.
 *
 * One statement per line: `name = expression` or `$name = expression`. References are
 * resolved by name at evaluation time (statements may be used before they are defined),
 * so this module only builds the frozen AST described in docs/INTERFACES.md §5.2.
 *
 * The parser never throws: every problem becomes an error diagnostic and, where useful,
 * an `{ t: 'error' }` recovery node that evaluates to `null`.
 *
 * @module src/lang/parse
 */

import { tokenize, tokenizeDescribe } from './tokenize.js'

/** @typedef {{ severity: 'error'|'warning', message: string, line?: number }} Diagnostic */

/**
 * Binary operator precedence, lowest first. A level groups operators of equal precedence.
 * Conditional expressions (`?:`) sit below every level; unary and postfix are handled
 * explicitly, matching the order frozen in docs/INTERFACES.md §5.2.
 */
const parseBinaryLevels = [
  ['||'],
  ['&&'],
  ['==', '!='],
  ['<', '<=', '>', '>='],
  ['+', '-'],
  ['*', '/', '%'],
]

/**
 * Build an error recovery node.
 * @param {string} message - why the expression is invalid.
 * @returns {{ t: 'error', message: string }} recovery node.
 */
function parseErrorNode(message) {
  return { t: 'error', message }
}

/**
 * Maximum expression nesting the parser will descend into. A runaway program must not be
 * able to overflow the stack, because the host calls `parseProgram` without a try/catch.
 */
const parseMaxDepth = 200

/**
 * Refuse to descend further and report the depth problem once per statement.
 * @param {object} cursor - parse cursor.
 * @returns {{ t: 'error', message: string }} recovery node.
 */
function parseTooDeep(cursor) {
  if (!cursor.reportedDepth) {
    cursor.reportedDepth = true
    cursor.diagnostics.push({ severity: 'error', message: 'the expression is nested too deeply', line: cursor.line })
  }
  return parseErrorNode('expression nested too deeply')
}

/**
 * Parse an openui-lang program into the frozen AST.
 * @param {string} source - program source.
 * @returns {{ ok: boolean, statements: object[], rootName: string | null, diagnostics: Diagnostic[] }} parse result.
 */
export function parseProgram(source) {
  const lexed = tokenize(source)
  const diagnostics = [...lexed.diagnostics]
  const statements = []
  const sourceTokens = lexed.tokens.filter(token => token.kind !== 'eof')

  const lines = []
  for (const token of sourceTokens) {
    const last = lines[lines.length - 1]
    if (last && last[0].line === token.line) last.push(token)
    else lines.push([token])
  }

  for (const group of lines) parseStatementTokens(group, statements, diagnostics)

  const rootName = statements.some(statement => !statement.state && statement.name === 'root') ? 'root' : null
  return {
    ok: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
    statements,
    rootName,
    diagnostics,
  }
}

/**
 * Parse one physical line into at most one statement.
 * @param {object[]} group - tokens of one line.
 * @param {object[]} statements - output statement list, appended to.
 * @param {Diagnostic[]} diagnostics - output diagnostics, appended to.
 * @returns {void}
 */
function parseStatementTokens(group, statements, diagnostics) {
  const line = group[0].line
  const cursor = { tokens: group, index: 0, diagnostics, line, depth: 0, reportedDepth: false }
  const first = group[0]

  let name = null
  let state = false
  if (first.kind === 'ident') {
    name = first.value
    cursor.index = 1
  } else if (first.kind === 'state') {
    name = first.value
    state = true
    cursor.index = 1
  } else {
    diagnostics.push({ severity: 'error', message: `a statement must start with a name, not ${tokenizeDescribe(first)}`, line })
    return
  }

  const label = (state ? '$' : '') + name
  const equals = parsePeek(cursor)
  if (!equals || equals.kind !== 'op' || equals.value !== '=') {
    diagnostics.push({ severity: 'error', message: `expected "=" after ${label}`, line })
    return
  }
  cursor.index += 1

  if (parsePeek(cursor) === undefined) {
    diagnostics.push({ severity: 'error', message: `${label} is missing a value after "="`, line })
    statements.push({ kind: 'assign', name, state, expr: parseErrorNode('missing value'), line })
    return
  }

  const expr = parseExpression(cursor)
  const extra = parsePeek(cursor)
  if (extra !== undefined) {
    diagnostics.push({ severity: 'error', message: `unexpected ${tokenizeDescribe(extra)} after the expression of ${label}`, line })
  }
  statements.push({ kind: 'assign', name, state, expr, line })
}

/**
 * Current token of a cursor.
 * @param {{ tokens: object[], index: number }} cursor - parse cursor.
 * @returns {object | undefined} current token, or undefined at the end of the line.
 */
function parsePeek(cursor) {
  return cursor.index < cursor.tokens.length ? cursor.tokens[cursor.index] : undefined
}

/**
 * Parse a conditional expression (`condition ? then : else`), the lowest precedence level.
 * @param {object} cursor - parse cursor.
 * @returns {object} expression node.
 */
function parseExpression(cursor) {
  cursor.depth += 1
  try {
    if (cursor.depth > parseMaxDepth) return parseTooDeep(cursor)
    const cond = parseBinaryLevel(cursor, 0)
    const question = parsePeek(cursor)
    if (!question || question.kind !== 'op' || question.value !== '?') return cond

    cursor.index += 1
    const thenExpr = parseExpression(cursor)
    const colon = parsePeek(cursor)
    if (!colon || colon.kind !== 'op' || colon.value !== ':') {
      cursor.diagnostics.push({ severity: 'error', message: 'expected ":" in the conditional expression', line: cursor.line })
      return parseErrorNode('incomplete conditional expression')
    }
    cursor.index += 1
    const elseExpr = parseExpression(cursor)
    return { t: 'tern', cond, then: thenExpr, else: elseExpr }
  } finally {
    cursor.depth -= 1
  }
}

/**
 * Parse one binary precedence level, left-associatively.
 * @param {object} cursor - parse cursor.
 * @param {number} level - index into `parseBinaryLevels`.
 * @returns {object} expression node.
 */
function parseBinaryLevel(cursor, level) {
  if (level >= parseBinaryLevels.length) return parseUnary(cursor)

  let left = parseBinaryLevel(cursor, level + 1)
  for (;;) {
    const next = parsePeek(cursor)
    if (!next || next.kind !== 'op' || !parseBinaryLevels[level].includes(next.value)) return left
    cursor.index += 1
    const right = parseBinaryLevel(cursor, level + 1)
    left = { t: 'bin', op: next.value, left, right }
  }
}

/**
 * Parse a prefix `!` or `-` expression.
 * @param {object} cursor - parse cursor.
 * @returns {object} expression node.
 */
function parseUnary(cursor) {
  cursor.depth += 1
  try {
    if (cursor.depth > parseMaxDepth) return parseTooDeep(cursor)
    const next = parsePeek(cursor)
    if (next && next.kind === 'op' && (next.value === '!' || next.value === '-')) {
      cursor.index += 1
      return { t: 'un', op: next.value, arg: parseUnary(cursor) }
    }
    return parsePostfix(cursor)
  } finally {
    cursor.depth -= 1
  }
}

/**
 * Parse member access (`a.b`) and index access (`a[b]`) applied to a primary expression.
 * @param {object} cursor - parse cursor.
 * @returns {object} expression node.
 */
function parsePostfix(cursor) {
  let node = parsePrimary(cursor)
  for (;;) {
    const next = parsePeek(cursor)
    if (!next || next.kind !== 'op') return node

    if (next.value === '.') {
      cursor.index += 1
      const prop = parsePeek(cursor)
      if (!prop || prop.kind !== 'ident') {
        cursor.diagnostics.push({ severity: 'error', message: 'expected a property name after "."', line: next.line })
        return parseErrorNode('missing property name')
      }
      cursor.index += 1
      node = { t: 'mem', obj: node, prop: prop.value }
      continue
    }

    if (next.value === '[') {
      cursor.index += 1
      const indexExpr = parseExpression(cursor)
      const close = parsePeek(cursor)
      if (close && close.kind === 'op' && close.value === ']') cursor.index += 1
      else cursor.diagnostics.push({ severity: 'error', message: 'expected "]" to close the index', line: next.line })
      node = { t: 'idx', obj: node, index: indexExpr }
      continue
    }

    return node
  }
}

/**
 * Parse a literal, reference, call, array, object or parenthesised expression.
 * @param {object} cursor - parse cursor.
 * @returns {object} expression node.
 */
function parsePrimary(cursor) {
  const token = parsePeek(cursor)
  if (!token) {
    cursor.diagnostics.push({ severity: 'error', message: 'expected an expression', line: cursor.line })
    return parseErrorNode('missing expression')
  }

  if (token.kind === 'number') {
    cursor.index += 1
    return { t: 'num', v: token.value }
  }
  if (token.kind === 'string') {
    cursor.index += 1
    return { t: 'str', v: token.value }
  }
  if (token.kind === 'state') {
    cursor.index += 1
    return { t: 'ref', name: token.value, state: true }
  }
  if (token.kind === 'ident') {
    cursor.index += 1
    if (token.value === 'true') return { t: 'bool', v: true }
    if (token.value === 'false') return { t: 'bool', v: false }
    if (token.value === 'null') return { t: 'null' }
    const next = parsePeek(cursor)
    if (next && next.kind === 'op' && next.value === '(') {
      return { t: 'call', name: token.value, args: parseArgList(cursor), line: token.line }
    }
    return { t: 'ref', name: token.value, state: false }
  }

  if (token.kind === 'op') {
    if (token.value === '@') return parseAtCall(cursor, token)
    if (token.value === '(') {
      cursor.index += 1
      const inner = parseExpression(cursor)
      const close = parsePeek(cursor)
      if (close && close.kind === 'op' && close.value === ')') cursor.index += 1
      else cursor.diagnostics.push({ severity: 'error', message: 'expected ")"', line: token.line })
      return inner
    }
    if (token.value === '[') return parseArrayLiteral(cursor, token)
    if (token.value === '{') return parseObjectLiteral(cursor, token)
  }

  cursor.diagnostics.push({ severity: 'error', message: `unexpected ${tokenizeDescribe(token)}`, line: token.line })
  cursor.index += 1
  return parseErrorNode(`unexpected ${tokenizeDescribe(token)}`)
}

/**
 * Parse `@Name(args)`; the `@` token is the current token.
 * @param {object} cursor - parse cursor.
 * @param {object} atToken - the `@` token, for its line.
 * @returns {object} call node, or an error node.
 */
function parseAtCall(cursor, atToken) {
  cursor.index += 1
  const nameToken = parsePeek(cursor)
  if (!nameToken || nameToken.kind !== 'ident') {
    cursor.diagnostics.push({ severity: 'error', message: 'expected a function name after "@"', line: atToken.line })
    return parseErrorNode('missing function name')
  }
  cursor.index += 1
  const open = parsePeek(cursor)
  if (!open || open.kind !== 'op' || open.value !== '(') {
    cursor.diagnostics.push({ severity: 'error', message: `expected "(" after "@${nameToken.value}"`, line: atToken.line })
    return parseErrorNode('missing argument list')
  }
  return { t: 'call', name: `@${nameToken.value}`, args: parseArgList(cursor), line: atToken.line }
}

/**
 * Parse a parenthesised, comma-separated argument list. Named arguments are rejected:
 * the language is fully positional.
 * @param {object} cursor - parse cursor.
 * @returns {object[]} argument nodes.
 */
function parseArgList(cursor) {
  cursor.index += 1
  const args = []
  for (;;) {
    const next = parsePeek(cursor)
    if (!next) {
      cursor.diagnostics.push({ severity: 'error', message: 'expected ")" to close the argument list', line: cursor.line })
      return args
    }
    if (next.kind === 'op' && next.value === ')') {
      cursor.index += 1
      return args
    }
    if (next.kind === 'op' && next.value === ',') {
      cursor.index += 1
      continue
    }

    const start = cursor.index
    const expr = parseExpression(cursor)

    const after = parsePeek(cursor)
    if (after && after.kind === 'op' && after.value === ':') {
      cursor.diagnostics.push({
        severity: 'error',
        message: 'named arguments (name: value) are not supported: every argument is positional',
        line: after.line,
      })
      while (cursor.index < cursor.tokens.length) {
        const stop = cursor.tokens[cursor.index]
        if (stop.kind === 'op' && (stop.value === ',' || stop.value === ')')) break
        cursor.index += 1
      }
      args.push(parseErrorNode('named argument'))
      continue
    }

    if (cursor.index === start) cursor.index += 1
    args.push(expr)
  }
}

/**
 * Parse `[item, item, ...]`; the `[` token is the current token.
 * @param {object} cursor - parse cursor.
 * @param {object} openToken - the `[` token, for its line.
 * @returns {{ t: 'arr', items: object[] }} array node.
 */
function parseArrayLiteral(cursor, openToken) {
  cursor.index += 1
  const items = []
  for (;;) {
    const next = parsePeek(cursor)
    if (!next) {
      cursor.diagnostics.push({ severity: 'error', message: 'expected "]" to close the array', line: openToken.line })
      return { t: 'arr', items }
    }
    if (next.kind === 'op' && next.value === ']') {
      cursor.index += 1
      return { t: 'arr', items }
    }
    if (next.kind === 'op' && next.value === ',') {
      cursor.index += 1
      continue
    }
    const start = cursor.index
    items.push(parseExpression(cursor))
    if (cursor.index === start) cursor.index += 1
  }
}

/**
 * Parse `{key: value, ...}`; keys may be bare identifiers, quoted strings or numbers.
 * @param {object} cursor - parse cursor.
 * @param {object} openToken - the `{` token, for its line.
 * @returns {{ t: 'obj', entries: { key: string, value: object }[] }} object node.
 */
function parseObjectLiteral(cursor, openToken) {
  cursor.index += 1
  const entries = []
  for (;;) {
    const next = parsePeek(cursor)
    if (!next) {
      cursor.diagnostics.push({ severity: 'error', message: 'expected "}" to close the object', line: openToken.line })
      return { t: 'obj', entries }
    }
    if (next.kind === 'op' && next.value === '}') {
      cursor.index += 1
      return { t: 'obj', entries }
    }
    if (next.kind === 'op' && next.value === ',') {
      cursor.index += 1
      continue
    }

    let key = null
    if (next.kind === 'ident' || next.kind === 'string') key = String(next.value)
    else if (next.kind === 'number') key = String(next.value)
    if (key === null) {
      cursor.diagnostics.push({ severity: 'error', message: `expected a key, not ${tokenizeDescribe(next)}`, line: next.line })
      cursor.index += 1
      continue
    }
    cursor.index += 1

    const colon = parsePeek(cursor)
    if (!colon || colon.kind !== 'op' || colon.value !== ':') {
      cursor.diagnostics.push({ severity: 'error', message: `expected ":" after the key ${JSON.stringify(key)}`, line: next.line })
      entries.push({ key, value: parseErrorNode('missing value') })
      continue
    }
    cursor.index += 1
    entries.push({ key, value: parseExpression(cursor) })
  }
}
