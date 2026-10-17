/**
 * Tokenizer for the openui-lang subset implemented by this bundle.
 *
 * The language is line oriented: the parser groups the tokens produced here by their
 * source line, so every statement is exactly one physical line. `//` starts a comment
 * that runs to the end of the line. The tokenizer never throws; anything it cannot read
 * becomes an entry in `diagnostics` and is skipped.
 *
 * @module src/lang/tokenize
 */

/** @typedef {{ kind: 'number'|'string'|'ident'|'state'|'op'|'eof', value: any, text?: string, line: number, col: number }} LangToken */
/** @typedef {{ severity: 'error'|'warning', message: string, line?: number }} Diagnostic */

/** Backslash escapes understood inside a double-quoted string. */
const tokenizeEscapes = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
  '"': '"',
  "'": "'",
  '\\': '\\',
  '/': '/',
}

/**
 * True for an ASCII digit.
 * @param {string} ch - one character.
 * @returns {boolean} whether the character is a digit.
 */
function tokenizeIsDigit(ch) {
  return ch >= '0' && ch <= '9'
}

/**
 * True for the first character of an identifier.
 * @param {string} ch - one character.
 * @returns {boolean} whether the character may start an identifier.
 */
function tokenizeIsIdentStart(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'
}

/**
 * True for a character allowed inside an identifier.
 * @param {string} ch - one character.
 * @returns {boolean} whether the character may continue an identifier.
 */
function tokenizeIsIdentPart(ch) {
  return tokenizeIsIdentStart(ch) || tokenizeIsDigit(ch)
}

/** Operators and punctuation, longest first so two-character operators win. */
const tokenizeOperators = [
  '==', '!=', '<=', '>=', '&&', '||',
  '+', '-', '*', '/', '%', '!', '<', '>', '=',
  '(', ')', '[', ']', '{', '}', ',', '.', '?', ':', '@',
]

/**
 * Read a hexadecimal unicode escape body.
 * @param {string} text - full source.
 * @param {number} at - index of the first hex digit.
 * @returns {{ char: string, length: number } | null} decoded character, or null when malformed.
 */
function tokenizeUnicodeEscape(text, at) {
  const hex = text.slice(at, at + 4)
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null
  return { char: String.fromCharCode(parseInt(hex, 16)), length: 4 }
}

/**
 * Split openui-lang source into tokens and lexical diagnostics.
 * @param {string} source - program source.
 * @returns {{ tokens: LangToken[], diagnostics: Diagnostic[] }} tokens, ending with an `eof` token.
 */
export function tokenize(source) {
  const text = typeof source === 'string' ? source : source === null || source === undefined ? '' : String(source)
  const tokens = []
  const diagnostics = []
  let index = 0
  let line = 1

  while (index < text.length) {
    const ch = text[index]

    if (ch === '\n') {
      line += 1
      index += 1
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\u00a0') {
      index += 1
      continue
    }
    if (ch === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      continue
    }

    const startLine = line
    const col = index

    if (tokenizeIsDigit(ch) || (ch === '.' && tokenizeIsDigit(text[index + 1]))) {
      let raw = ''
      while (index < text.length && tokenizeIsDigit(text[index])) {
        raw += text[index]
        index += 1
      }
      if (text[index] === '.' && tokenizeIsDigit(text[index + 1])) {
        raw += '.'
        index += 1
        while (index < text.length && tokenizeIsDigit(text[index])) {
          raw += text[index]
          index += 1
        }
      }
      tokens.push({ kind: 'number', value: Number(raw), text: raw, line: startLine, col })
      continue
    }

    if (ch === '"') {
      let value = ''
      let closed = false
      index += 1
      while (index < text.length) {
        const current = text[index]
        if (current === '\n') break
        if (current === '"') {
          index += 1
          closed = true
          break
        }
        if (current === '\\') {
          const escape = text[index + 1]
          if (escape === undefined || escape === '\n') {
            index += 1
            break
          }
          if (escape === 'u') {
            const decoded = tokenizeUnicodeEscape(text, index + 2)
            if (decoded) {
              value += decoded.char
              index += 2 + decoded.length
            } else {
              value += 'u'
              index += 2
            }
            continue
          }
          value += Object.prototype.hasOwnProperty.call(tokenizeEscapes, escape) ? tokenizeEscapes[escape] : escape
          index += 2
          continue
        }
        value += current
        index += 1
      }
      if (!closed) {
        diagnostics.push({ severity: 'error', message: 'unterminated string: a string must close on the same line', line: startLine })
      }
      tokens.push({ kind: 'string', value, line: startLine, col })
      continue
    }

    if (tokenizeIsIdentStart(ch)) {
      let name = ''
      while (index < text.length && tokenizeIsIdentPart(text[index])) {
        name += text[index]
        index += 1
      }
      tokens.push({ kind: 'ident', value: name, line: startLine, col })
      continue
    }

    if (ch === '$') {
      index += 1
      if (!tokenizeIsIdentStart(text[index])) {
        diagnostics.push({ severity: 'error', message: 'a name must follow "$"', line: startLine })
        tokens.push({ kind: 'op', value: '$', line: startLine, col })
        continue
      }
      let name = ''
      while (index < text.length && tokenizeIsIdentPart(text[index])) {
        name += text[index]
        index += 1
      }
      tokens.push({ kind: 'state', value: name, line: startLine, col })
      continue
    }

    let operator = null
    for (const candidate of tokenizeOperators) {
      if (text.startsWith(candidate, index)) {
        operator = candidate
        break
      }
    }
    if (operator !== null) {
      tokens.push({ kind: 'op', value: operator, line: startLine, col })
      index += operator.length
      continue
    }

    diagnostics.push({ severity: 'error', message: `unexpected character ${JSON.stringify(ch)}`, line: startLine })
    index += 1
  }

  tokens.push({ kind: 'eof', value: '', line, col: index })
  return { tokens, diagnostics }
}

/**
 * Human-readable description of a token, for error messages.
 * @param {LangToken | undefined} token - token to describe.
 * @returns {string} description such as `"+"` or `the end of the line`.
 */
export function tokenizeDescribe(token) {
  if (!token || token.kind === 'eof') return 'the end of the line'
  if (token.kind === 'string') return `the string ${JSON.stringify(token.value)}`
  if (token.kind === 'number') return `the number ${token.text ?? token.value}`
  if (token.kind === 'state') return `"$${token.value}"`
  return JSON.stringify(token.value)
}
