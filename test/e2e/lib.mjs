// Shared helpers for the verifier-owned Phase A harness.
// Independent oracle: the expected component/function tables below are transcribed from
// docs/INTERFACES.md (frozen v1 contract), NOT derived from src/**. If they disagree with
// src/lang/signatures.js, the contract says which one is wrong.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const LANG_ENTRY = path.join(REPO_ROOT, 'src', 'lang', 'index.js')
export const PROGRAMS_DIR = path.join(REPO_ROOT, 'test', 'programs')

export const REQUIRED_LANG_EXPORTS = [
  'parseProgram',
  'evaluateProgram',
  'FUNCTIONS',
  'callFunction',
  'COMPONENT_SIGNATURES',
  'FUNCTION_SIGNATURES',
  'systemPromptSectionText',
  'EXAMPLES',
]

// ---------------------------------------------------------------- INTERFACES.md §6.4
// name -> { args, min }
export const V1_COMPONENTS = {
  // Layout (components-a)
  Col: { args: ['children', 'gap', 'align'], min: 1 },
  Row: { args: ['children', 'gap', 'align', 'justify', 'wrap'], min: 1 },
  Box: { args: ['children', 'direction', 'gap', 'padding', 'background', 'radius', 'border', 'width', 'height', 'flex', 'align', 'justify', 'wrap'], min: 0 },
  Grid: { args: ['children', 'columns', 'minChildWidth', 'gap'], min: 1 },
  Card: { args: ['children', 'variant', 'padding', 'gap'], min: 1 },
  Carousel: { args: ['children', 'itemWidth', 'gap'], min: 1 },
  Popover: { args: ['trigger', 'content'], min: 2 },
  Divider: { args: [], min: 0 },
  Spacer: { args: [], min: 0 },
  // Text (components-a)
  Title: { args: ['text', 'size', 'color'], min: 1 },
  Text: { args: ['text', 'size', 'color', 'weight', 'italic', 'lineThrough', 'tabularNums', 'maxLines'], min: 1 },
  Caption: { args: ['text', 'color'], min: 1 },
  Label: { args: ['text'], min: 1 },
  Badge: { args: ['text', 'color'], min: 1 },
  Link: { args: ['text', 'url'], min: 2 },
  List: { args: ['items', 'marker', 'timeline'], min: 1 },
  ListItem: { args: ['title', 'description', 'marker', 'children'], min: 1 },
  Quote: { args: ['text', 'cite'], min: 1 },
  Code: { args: ['code', 'language'], min: 1 },
  // Drawing (components-a)
  Svg: { args: ['children', 'viewBox', 'width', 'height'], min: 2 },
  G: { args: ['children', 'transform', 'opacity'], min: 1 },
  Circle: { args: ['cx', 'cy', 'r', 'fill', 'stroke', 'strokeWidth', 'opacity'], min: 3 },
  Ellipse: { args: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'opacity'], min: 4 },
  Rect: { args: ['x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'opacity', 'rx'], min: 4 },
  Line: { args: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'opacity'], min: 4 },
  Path: { args: ['d', 'fill', 'stroke', 'strokeWidth', 'opacity'], min: 1 },
  Polyline: { args: ['points', 'stroke', 'strokeWidth', 'fill', 'opacity'], min: 1 },
  Polygon: { args: ['points', 'fill', 'stroke', 'strokeWidth', 'opacity'], min: 1 },
  SvgText: { args: ['text', 'x', 'y', 'size', 'fill', 'anchor', 'weight'], min: 3 },
  // Inputs (components-b)
  Button: { args: ['label', 'action', 'variant', 'color', 'size', 'icon', 'disabled', 'block'], min: 1 },
  IconButton: { args: ['icon', 'action', 'label', 'variant'], min: 1 },
  Pressable: { args: ['children', 'action', 'selected', 'padding', 'background', 'radius'], min: 1 },
  Input: { args: ['value', 'label', 'type', 'placeholder'], min: 1 },
  TextArea: { args: ['value', 'label', 'placeholder', 'rows'], min: 1 },
  Select: { args: ['value', 'options', 'label', 'placeholder'], min: 2 },
  SegmentedControl: { args: ['value', 'options', 'block'], min: 2 },
  Slider: { args: ['value', 'min', 'max', 'step', 'label', 'unit', 'marks'], min: 3 },
  Checkbox: { args: ['checked', 'label', 'lineThrough'], min: 2 },
  RadioGroup: { args: ['value', 'options', 'label', 'variant'], min: 2 },
  DatePicker: { args: ['value', 'label', 'min', 'max'], min: 1 },
  Timer: { args: ['seconds', 'label'], min: 1 },
  Form: { args: ['children'], min: 1 },
  // Media and data (components-b)
  Image: { args: ['src', 'alt', 'aspectRatio', 'radius', 'fit'], min: 2 },
  Icon: { args: ['name', 'size', 'color'], min: 1 },
  Table: { args: ['columns', 'rows'], min: 2 },
  Chart: { args: ['type', 'data', 'x', 'series', 'format', 'currency', 'stacked', 'height'], min: 2 },
  // Play (components-b)
  Flashcard: { args: ['front', 'back', 'hint'], min: 2 },
  Celebration: { args: ['when'], min: 1 },
}

// ---------------------------------------------------------------- INTERFACES.md §5.4
export const V1_FUNCTIONS = [
  'Count', 'First', 'Last', 'Sum', 'Avg', 'Min', 'Max', 'Sort', 'Filter', 'Round', 'Abs', 'Floor', 'Ceil',
  'Append', 'Prepend', 'Concat', 'Remove', 'RemoveAt', 'Update', 'Toggle', 'Includes', 'Find', 'IndexOf', 'Take', 'Slice',
  'Unique', 'Reverse', 'Range', 'Pick', 'Shuffle', 'Flatten', 'Chunk',
  'Pow', 'Sqrt', 'Random', 'Clamp', 'Percent', 'Lerp', 'Allocate', 'Payment', 'Convert',
  'Format', 'Join', 'Plural', 'Pad', 'Upper', 'Lower', 'Trim', 'Capitalize', 'Split', 'Replace', 'Duration', 'Default', 'MixColor',
  'Now', 'Today', 'FormatDate', 'AddDays', 'AddMonths', 'DaysBetween', 'MonthsBetween', 'StartOf',
  'GroupBy', 'Pivot', 'Top', 'Between', 'Bucket', 'Cumulative', 'MovingAvg', 'Change', 'Histogram', 'Stats',
]

// §6.4 "Not in v1 (must not appear in COMPONENT_SIGNATURES)"
export const FORBIDDEN_COMPONENTS = ['Markdown', 'Math', 'SearchImage', 'Map', 'MapMarker', 'YouTube', 'HtmlView']

// §6.3 action steps, accepted anywhere the host checks called names (§8)
export const ACTION_NAMES = ['Set', 'Reset', 'OpenUrl', 'CopyToClipboard', 'ToAssistant', 'Action']

// ---------------------------------------------------------------- module loading
let cached = null

export async function loadLang() {
  if (cached) return cached
  if (!existsSync(LANG_ENTRY)) {
    cached = { lang: null, block: `src/lang/index.js does not exist yet (looked for ${LANG_ENTRY}); lang-core has not landed it` }
    return cached
  }
  try {
    const mod = await import(pathToFileURL(LANG_ENTRY).href)
    const missing = REQUIRED_LANG_EXPORTS.filter((k) => mod[k] === undefined)
    cached = missing.length
      ? { lang: null, block: `src/lang/index.js is missing required exports: ${missing.join(', ')} (INTERFACES.md §5.6)` }
      : { lang: mod, block: null }
  } catch (err) {
    cached = { lang: null, block: `import of src/lang/index.js threw: ${err && err.stack ? err.stack : String(err)}` }
  }
  return cached
}

/** Fails the calling test loudly when the implementation is not importable yet. */
export async function needLang() {
  const { lang, block } = await loadLang()
  if (!lang) assert.fail(`CANNOT VERIFY - harness blocked, this is NOT a product failure: ${block}`)
  return lang
}

export async function langBlockReason() {
  return (await loadLang()).block
}

// ---------------------------------------------------------------- program files
export function programFiles() {
  if (!existsSync(PROGRAMS_DIR)) return []
  return readdirSync(PROGRAMS_DIR).filter((f) => f.endsWith('.oui')).sort()
}

export function readProgram(file) {
  const full = path.join(PROGRAMS_DIR, file)
  if (!existsSync(full)) assert.fail(`corpus fixture is missing: ${full}`)
  return { text: readFileSync(full, 'utf8'), bytes: readFileSync(full).length }
}

// ---------------------------------------------------------------- AST helpers
export function walk(value, fn) {
  const seen = new Set()
  const visit = (v) => {
    if (v === null || typeof v !== 'object') return
    if (seen.has(v)) return
    seen.add(v)
    fn(v)
    if (Array.isArray(v)) {
      for (const item of v) visit(item)
      return
    }
    for (const key of Object.keys(v)) visit(v[key])
  }
  visit(value)
}

export function bareName(name) {
  return typeof name === 'string' && name.startsWith('@') ? name.slice(1) : name
}

export function collectCalls(program) {
  const calls = []
  walk(program, (node) => {
    if (node && node.t === 'call' && typeof node.name === 'string') calls.push({ name: node.name, bare: bareName(node.name), line: node.line })
  })
  return calls
}

export function collectStrValues(program) {
  const out = []
  walk(program, (node) => {
    if (node && node.t === 'str' && typeof node.v === 'string') out.push(node.v)
  })
  return out
}

export function exprDepth(node) {
  if (node === null || typeof node !== 'object') return 0
  let best = 0
  for (const key of Object.keys(node)) {
    if (key === 'line' || key === 't') continue
    const v = node[key]
    if (Array.isArray(v)) {
      for (const item of v) best = Math.max(best, exprDepth(item))
    } else if (v && typeof v === 'object') {
      best = Math.max(best, exprDepth(v))
    }
  }
  return best + 1
}

// ---------------------------------------------------------------- contract guards
export function assertDiagnosticShape(d, where) {
  assert.ok(d && typeof d === 'object' && !Array.isArray(d), `${where}: diagnostic must be an object, got ${JSON.stringify(d)}`)
  assert.ok(d.severity === 'error' || d.severity === 'warning', `${where}: diagnostic.severity must be 'error'|'warning', got ${JSON.stringify(d.severity)}`)
  assert.equal(typeof d.message, 'string', `${where}: diagnostic.message must be a string`)
  assert.ok(d.message.length > 0, `${where}: diagnostic.message must not be empty`)
  if (d.line !== undefined) {
    assert.ok(Number.isInteger(d.line) && d.line >= 1, `${where}: diagnostic.line must be a positive integer, got ${JSON.stringify(d.line)}`)
  }
}

export function errorCount(diagnostics) {
  return (diagnostics ?? []).filter((d) => d && d.severity === 'error').length
}

export function isElementDescriptor(v) {
  return Boolean(v) && typeof v === 'object' && v.kind === 'element' && typeof v.name === 'string' && Array.isArray(v.args)
}

export function isBindingDescriptor(v) {
  return Boolean(v) && typeof v === 'object' && v.kind === 'binding' && typeof v.name === 'string' && 'value' in v
}

/** INTERFACES.md §5.3/§5.6 are synchronous; a thenable return is a contract deviation. */
export function expectSync(value, what) {
  if (value && typeof value.then === 'function') {
    assert.fail(`${what} returned a Promise/thenable; INTERFACES.md §5.2/§5.3 specify a synchronous return value`)
  }
  return value
}

export function snapshot(value) {
  return JSON.stringify(value ?? null)
}

export function describeDiagnostics(diagnostics) {
  if (!diagnostics || diagnostics.length === 0) return 'none'
  return diagnostics.map((d) => `${d.severity}@${d.line ?? '?'}: ${d.message}`).join(' | ')
}
