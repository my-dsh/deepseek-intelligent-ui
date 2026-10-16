/**
 * Documentation guard tests: every openui-lang program quoted in README.md must be a
 * program the shipped parser accepts.
 *
 * A README example that does not parse is worse than no example: a real session copied
 * the multi-line `root = Col([...])` block from the 速览 section, burned two failed
 * renders on it, and only then discovered that statements must fit on one physical line.
 * These tests make that class of documentation bug fail CI instead of a user's chat.
 *
 * Run from the workspace root:
 *
 *     node --test test/docs.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { parseProgram } from '../src/lang/index.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const readme = readFileSync(path.join(root, 'README.md'), 'utf8')

/**
 * Every fenced code block that contains a `root =` statement, in document order.
 * @returns {string[]} program sources.
 */
function quotedPrograms() {
  const blocks = [...readme.matchAll(/```(?:\w*)\n([\s\S]*?)```/g)].map(match => match[1])
  return blocks.filter(block => /^\s*root\s*=/m.test(block))
}

test('README quotes at least one openui-lang program', () => {
  assert.ok(quotedPrograms().length > 0, 'expected a fenced block containing root = ...')
})

test('every program quoted in README parses without diagnostics', () => {
  const programs = quotedPrograms()
  for (const [index, program] of programs.entries()) {
    const result = parseProgram(program)
    const detail = result.diagnostics.map(d => `${d.line}: ${d.message}`).join('; ')
    assert.equal(result.ok, true, `README program #${index + 1} has diagnostics: ${detail}`)
    assert.equal(result.rootName, 'root', `README program #${index + 1} must define root`)
  }
})

test('the README 速览 example keeps one statement per physical line', () => {
  const quickStart = quotedPrograms()[0]
  const result = parseProgram(quickStart)
  assert.equal(result.ok, true)
  const contentLines = quickStart.split('\n').filter(line => line.trim() !== '').length
  assert.equal(result.statements.length, contentLines, 'non-blank lines must equal statements: no statement may span lines')
})

test('README states the one-statement-per-line rule next to the example', () => {
  assert.match(readme, /一条语句不能换行续写|one statement per physical line/i, 'README must state that statements never span lines')
})
