# Intelligent UI — frozen interfaces (v1)

This file is the single authority for every cross-module contract. Implement against it
literally; if something here is wrong or missing, report it to the Lead instead of
inventing a different shape.

## 1. What we are building

A DSH bundle that gives the Harness Web GUI an **Intelligent UI** answer surface, in the
spirit of <https://github.com/thesysdev/open-intelligent-ui>: the model writes a small
declarative **openui-lang** program, and the chat renders it as a real interactive UI
(layout, text, inputs bound to `$variables`, tables, charts, SVG drawings) instead of prose.

Data flow (everything is derived from the session log; no extra event types, no polling):

```
agent --tool call: intelligent_ui({title?, program})--> session log (tool/call)
                                                          |
Client: tool.call.toolview[key=intelligent_ui] reads block.call.argsRaw
        -> parse -> evaluate -> React element tree with its own $state
```

- **Host half** (`index.js`): registers the `intelligent_ui` tool + one system-prompt
  section teaching the language. It parses the program only to return diagnostics.
- **Client half** (`client.js`, generated): registers one keyed `tool.call.toolview`
  entry and renders the program.

## 2. Package identity (frozen)

| Thing | Value |
| --- | --- |
| Package name / bundle row id / client module id | `@my-dsh/dsh-intelligent-ui` |
| Host entry | `index.js` |
| Client entry (generated, committed) | `client.js` |
| Tool wire name | `intelligent_ui` |
| `tool.call.toolview` key | `intelligent_ui` (must equal the tool name) |
| CSS class prefix | `iui-` |
| Client locale namespace | `intelligent-ui` |
| Debug global | `window.__DSH_INTELLIGENT_UI__` |

## 3. File ownership (do not write outside your scope)

| Owner | Files |
| --- | --- |
| Lead | `package.json`, `cordis.patch.yml`, `index.js`, `scripts/build-client.mjs`, `locale/*`, `icon.svg`, `README.md`, `docs/*` |
| lang-core | `src/lang/tokenize.js`, `src/lang/parse.js`, `src/lang/evaluate.js`, `src/lang/functions.js`, `src/lang/signatures.js`, `src/lang/spec.js`, `src/lang/index.js`, `test/lang.test.mjs` |
| client-shell | `src/client/00-namespace.js`, `src/client/10-locales.js`, `src/client/20-store.js`, `src/client/30-render.js`, `src/client/90-apply.js`, `src/client/99-diagnostics.js`, `src/client/css/base.css` |
| components-a | `src/client/components/layout-text.js`, `src/client/css/layout-text.css` |
| components-b | `src/client/components/inputs-data.js`, `src/client/css/inputs-data.css` |
| verifier | `test/programs/**`, `test/e2e/**`, `docs/VERIFICATION.md` |

## 4. Build

`node scripts/build-client.mjs` concatenates the sources into `client.js`.

Phase order (a `.js` file under `src/` that matches no phase is a build error):

1. `src/lang/*.js` sorted by path, **excluding** `src/lang/index.js`
2. `src/client/00-namespace.js`
3. `src/client/10-locales.js`
4. `src/client/20-store.js`
5. `src/client/30-render.js`
6. `src/client/components/**/*.js` sorted by path
7. `src/client/90-apply.js`
8. `src/client/99-diagnostics.js`

Every `src/client/**/*.css` is concatenated (sorted) into one stylesheet.

Per-file transform while concatenating:

- Lines starting with `import` are **dropped**. In `src/lang`, `import` may only target
  `./`-relative files inside `src/lang`. In `src/client`, never write `import`; `React`
  and `h` come from the enclosing factory.
- A leading `export ` is stripped from `export function|async function|const|let|class`.
- Lines of the form `export { ... } from '...'` are dropped.
- `export default` is a build error. Duplicate top-level declaration names across all
  fragments are a build error. A leftover `import`/`export` at line start is a build error.

Emitted shape:

```js
window.__ModuleLoader__.load({
  id: '@my-dsh/dsh-intelligent-ui',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const IUI_BUILD = { version, builtAt, fragments }   // emitted by the build
    const IUI_CSS = "/* every src/client/**/*.css, concatenated */"
    /* fragments */
    return { inject: IUI.inject, apply: (ctx) => IUI.apply(ctx) }
  },
});
```

`IUI_CSS` is a plain string constant in the closure. **Do not use the `styles` builtin** (it is
documented only for dynamic client halves): render the stylesheet as a React element
(`h('style', { key: 'iui-style' }, IUI_CSS)`) from the row's root component, so unmounting the
row removes it.

Consequences every fragment must respect:

- All fragments share one closure scope. Top-level names must be globally unique.
- A fragment must not read another fragment's `const` **at module-evaluation time**.
  Cross-fragment API surfaces are `function` declarations or properties on `IUI`
  (`00-namespace.js` runs before every other client fragment).
- Only `react` may be required. No Harness Client package may be imported (see
  `references/practices.md` in the plugin skill).

## 5. Language contract (`src/lang`)

### 5.1 Diagnostics

```js
/** @typedef {{ severity: 'error'|'warning', message: string, line?: number }} Diagnostic */
```

### 5.2 AST

`parseProgram(source)` returns a `Program`:

```js
Program = {
  ok: boolean,              // no error diagnostics
  statements: Statement[],  // source order
  rootName: string | null,  // 'root' when present
  diagnostics: Diagnostic[],
}
Statement = { kind: 'assign', name: string, state: boolean, expr: Node, line: number }
```

`state` is `true` for `$name = ...`.

Expressions (`Node`) are plain objects, always with a `t` tag:

| `t` | Shape |
| --- | --- |
| `str` | `{ t:'str', v:string }` |
| `num` | `{ t:'num', v:number }` |
| `bool` | `{ t:'bool', v:boolean }` |
| `null` | `{ t:'null' }` |
| `arr` | `{ t:'arr', items:Node[] }` |
| `obj` | `{ t:'obj', entries:{ key:string, value:Node }[] }` |
| `ref` | `{ t:'ref', name:string, state:boolean }` — `state` for `$name` |
| `mem` | `{ t:'mem', obj:Node, prop:string }` |
| `idx` | `{ t:'idx', obj:Node, index:Node }` |
| `un` | `{ t:'un', op:'!'\|'-', arg:Node }` |
| `bin` | `{ t:'bin', op:string, left:Node, right:Node }` |
| `tern` | `{ t:'tern', cond:Node, then:Node, else:Node }` |
| `call` | `{ t:'call', name:string, args:Node[], line:number }` — `Name(...)` or `@Name(...)` |
| `error` | `{ t:'error', message:string }` — recovery node; evaluates to `null` |

Operators, lowest to highest precedence: `||`, `&&`, `== !=`, `< <= > >=`, `+ -`, `* / %`,
unary `! -`, then postfix `.`/`[]`, then primary. Ternary sits just above `||`.
`+` concatenates when either side is a string.

Grammar notes: one statement per line, `identifier = expression`; `$identifier = expression`;
strings are double-quoted with `\` escapes; `true`/`false`/`null` literals; arrays `[...]`;
objects `{key: value, ...}` with bare or quoted keys; `@Name(args)` for built-ins;
named arguments (`x: 1`) are **not** supported and must produce an error diagnostic.

### 5.3 Evaluation

```js
evaluateProgram(program, options?) -> {
  ok: boolean,
  root: Value | null,                    // value of the `root` statement
  diagnostics: Diagnostic[],
  stateDefaults: Record<string, Value>,  // evaluated defaults of every `$name = ...`
}
options = { state?: Record<string, Value> }   // current values of $variables; optional
```

Rules:

- Pure. Never mutate `options.state`.
- Lazy, memoized per statement, with cycle detection (a cycle is an error diagnostic and
  the value is `null`).
- Undeclared `$var` reads as `null` (auto-created).
- Any evaluation error makes that subexpression `null` and appends one diagnostic; a bad
  argument makes a `@function` call evaluate to `null`.
- **Bindings.** Evaluating a `$name` expression yields
  `{ kind:'binding', name, value }` where `value` is the current value. It stays a binding
  descriptor **only as a direct argument of a component or action call**. Everywhere else
  (binary/unary/ternary operands, `@function` arguments, member/index receiver, `@Each`
  template) it is unwrapped to `.value` first.
- `Value` is JSON-ish: string, number, boolean, null, array, plain object, or
  `ElementDescriptor | BindingDescriptor`.
- `ElementDescriptor = { kind:'element', name:string, args:Value[], line:number }`.
  Component calls and `@Action` calls in value position both produce element descriptors.
- **`@Each(list, "varName", template)`** is evaluated by the evaluator, not a plain
  function: `list` is unwrapped to an array; for each item the template node is evaluated
  in a scope where the loop variable resolves to that item (shadowing statements, not
  `$state`), and the results are concatenated into one array. `null` items are skipped.
- Unknown statement reference → error diagnostic, value `null` (not a throw).
- Unknown component/function names are **not** evaluator errors: the client renderer
  reports them (the host reports them too, so the model can fix). The parser/evaluator must
  expose enough for the host to check names — see `signatures.js`.

### 5.4 Built-in functions (`src/lang/functions.js`)

```js
export const FUNCTIONS = { Count(args) { ... }, ... }   // args: already-unwrapped values
export function callFunction(name, args) -> Value        // returns null + diagnostic path on failure
```

Implement **exactly** these names (v1 set; argument order as in the reference spec):

`Count First Last Sum Avg Min Max Sort Filter Round Abs Floor Ceil`
`Append Prepend Concat Remove RemoveAt Update Toggle Includes Find IndexOf Take Slice`
`Unique Reverse Range Pick Shuffle Flatten Chunk`
`Pow Sqrt Random Clamp Percent Lerp Allocate Payment Convert`
`Format Join Plural Pad Upper Lower Trim Capitalize Split Replace Duration Default MixColor`
`Now Today FormatDate AddDays AddMonths DaysBetween MonthsBetween StartOf`
`GroupBy Pivot Top Between Bucket Cumulative MovingAvg Change Histogram Stats`

`@Each` is handled by the evaluator (§5.3) and must also appear in `FUNCTION_SIGNATURES`
so the prompt can teach it.

### 5.5 Signatures and prompt text

```js
// src/lang/signatures.js
export const COMPONENT_SIGNATURES = [
  { name:'Col', group:'Layout', args:[{name:'children',type:'Node[]',required:true}],
    description:'Vertical layout...' },
]
export const FUNCTION_SIGNATURES = [
  { name:'Count', signature:'@Count(array: any[]) → number', description:'Returns array length' },
]

// src/lang/spec.js
export function systemPromptSectionText(): string   // full prompt section text
export const EXAMPLES: { title:string, program:string }[]   // 2 short worked examples
```

`COMPONENT_SIGNATURES` must contain **exactly** the component names in §6.4 (any name in
the prompt that has no implementation is a bug).

### 5.6 Barrel (`src/lang/index.js`, host only, excluded from the build)

```js
export { parseProgram } from './parse.js'
export { evaluateProgram } from './evaluate.js'
export { FUNCTIONS, callFunction } from './functions.js'
export { COMPONENT_SIGNATURES, FUNCTION_SIGNATURES } from './signatures.js'
export { systemPromptSectionText, EXAMPLES } from './spec.js'
```

## 6. Component contract (`src/client`)

### 6.1 Registry

```js
// src/client/00-namespace.js (client-shell owns it; created first)
const IUI = {
  inject: ['slots', 'locale'],   // plugin service dependencies
  apply: null,                   // set by 90-apply.js
  util: {},                      // helpers, see 6.2
  components: {},                // component entries, keyed by name
  version: '1.0.0',
}
function iuiRegisterComponents(map) { Object.assign(IUI.components, map) }
```

A component entry:

```js
NAME: { args: ['children', 'gap', 'align'], min: 1, render(props, ctx) { return h(...) } }
```

- `props` is keyed by the entry's `args` names; missing optional args are `undefined`.
- `min` is the count of required leading arguments (default `0`); the renderer adds a
  diagnostic when fewer are supplied. The renderer never throws: a component that throws is
  caught, logged, and replaced by a short error box.
- A component name is rendered only when it exists in `IUI.components`; otherwise the
  renderer emits an "unknown component" box (and a diagnostic).

### 6.2 Render context (`ctx`) handed to `render(props, ctx)`

| Member | Meaning |
| --- | --- |
| `h` | `React.createElement` (pre-bound) |
| `React` | the React namespace (for hooks) |
| `render(value)` | `Value` → `ReactNode`; handles arrays, descriptors, bindings (renders `.value`), primitives, `null` |
| `children(props, name)` | `render(props[name])` convenience |
| `value(value)` | unwrap a binding descriptor to its `.value`, pass anything else through |
| `key(prefix, index)` | stable React key |
| `t(key, params?)` | locale lookup in namespace `intelligent-ui`; unknown key returns the key |
| `state.get(name)`, `state.set(name, value)` | the instance's `$variables` |
| `bind(binding, value)` | `state.set(binding.name, value)` — guards against a non-binding |
| `dispatch(action)` | run an action descriptor (`@Set`, `@Reset`, `@OpenUrl`, `@CopyToClipboard`, `@ToAssistant`) |
| `callId`, `sessionId` | identity of the rendered row |

`IUI.util` helpers available to every component:

| Helper | Behaviour |
| --- | --- |
| `util.isElement(v)` / `util.isBinding(v)` | guards |
| `util.space(v)` | number of 4px steps → px string (`2` → `'8px'`); a string passes through |
| `util.radius(v)` | `'sm'\|'md'\|'lg'\|'xl'\|'full'` → px/9999px; number → px; string passes through |
| `util.color(v, kind?)` | semantic name → CSS var; other strings pass through; `kind:'bg'` returns the soft tint |
| `util.formatNumber(v, kind?, decimals?, currency?)` | `number\|currency\|percent\|compact` |
| `util.stringify(v)` | human text for a primitive/array |

### 6.3 State and actions

- Each rendered row owns one store instance (`20-store.js`), initialized from
  `stateDefaults`, surviving re-renders for the same `callId`.
- Reads are reactive: changing a `$variable` re-renders the whole program.
- Actions: `@Set($x, value)`, `@Reset()`, `@OpenUrl(url)`, `@CopyToClipboard(text)`,
  `@ToAssistant(text)`, and `Action([@step, ...])` to chain several.
- `@Reset()` restores `stateDefaults` and re-renders.

### 6.4 Component signatures — the authority for §5.5 and both component files

`args` order is positional in the program and in the `props` object.

**Layout (components-a)**

| Name | args | min |
| --- | --- | --- |
| `Col` | `children, gap, align` | 1 |
| `Row` | `children, gap, align, justify, wrap` | 1 |
| `Box` | `children, direction, gap, padding, background, radius, border, width, height, flex, align, justify, wrap` | 0 |
| `Grid` | `children, columns, minChildWidth, gap` | 1 |
| `Card` | `children, variant, padding, gap` | 1 |
| `Carousel` | `children, itemWidth, gap` | 1 |
| `Popover` | `trigger, content` | 2 |
| `Divider` | — | 0 |
| `Spacer` | — | 0 |

**Text (components-a)**

| Name | args | min |
| --- | --- | --- |
| `Title` | `text, size, color` | 1 |
| `Text` | `text, size, color, weight, italic, lineThrough, tabularNums, maxLines` | 1 |
| `Caption` | `text, color` | 1 |
| `Label` | `text` | 1 |
| `Badge` | `text, color` | 1 |
| `Link` | `text, url` | 2 |
| `List` | `items, marker, timeline` | 1 |
| `ListItem` | `title, description, marker, children` | 1 |
| `Quote` | `text, cite` | 1 |
| `Code` | `code, language` | 1 |

**Drawing (components-a)**

| Name | args | min |
| --- | --- | --- |
| `Svg` | `children, viewBox, width, height` | 2 |
| `G` | `children, transform, opacity` | 1 |
| `Circle` | `cx, cy, r, fill, stroke, strokeWidth, opacity` | 3 |
| `Ellipse` | `cx, cy, rx, ry, fill, stroke, strokeWidth, opacity` | 4 |
| `Rect` | `x, y, width, height, fill, stroke, strokeWidth, opacity, rx` | 4 |
| `Line` | `x1, y1, x2, y2, stroke, strokeWidth, opacity` | 4 |
| `Path` | `d, fill, stroke, strokeWidth, opacity` | 1 |
| `Polyline` | `points, stroke, strokeWidth, fill, opacity` | 1 |
| `Polygon` | `points, fill, stroke, strokeWidth, opacity` | 1 |
| `SvgText` | `text, x, y, size, fill, anchor, weight` | 3 |

**Inputs (components-b)** — the first argument of every input is a `$binding` unless noted.

| Name | args | min |
| --- | --- | --- |
| `Button` | `label, action, variant, color, size, icon, disabled, block` | 1 |
| `IconButton` | `icon, action, label, variant` | 1 |
| `Pressable` | `children, action, selected, padding, background, radius` | 1 |
| `Input` | `value, label, type, placeholder` | 1 |
| `TextArea` | `value, label, placeholder, rows` | 1 |
| `Select` | `value, options, label, placeholder` | 2 |
| `SegmentedControl` | `value, options, block` | 2 |
| `Slider` | `value, min, max, step, label, unit, marks` | 3 |
| `Checkbox` | `checked, label, lineThrough` | 2 |
| `RadioGroup` | `value, options, label, variant` | 2 |
| `DatePicker` | `value, label, min, max` | 1 |
| `Timer` | `seconds, label` | 1 |
| `Form` | `children` | 1 |

**Media and data (components-b)**

| Name | args | min |
| --- | --- | --- |
| `Image` | `src, alt, aspectRatio, radius, fit` | 2 |
| `Icon` | `name, size, color` | 1 |
| `Table` | `columns, rows` | 2 |
| `Chart` | `type, data, x, series, format, currency, stacked, height` | 2 |

**Play (components-b)**

| Name | args | min |
| --- | --- | --- |
| `Flashcard` | `front, back, hint` | 2 |
| `Celebration` | `when` | 1 |

Not in v1 (must **not** appear in `COMPONENT_SIGNATURES`): `Markdown`, `Math`,
`SearchImage`, `Map`, `MapMarker`, `YouTube`, `HtmlView`. A program using one renders an
"unknown component" box.

### 6.5 Argument values

- `options` for `Select` / `SegmentedControl` / `RadioGroup`: array of strings or
  `{value, label, description?}`; a string means value = label = string.
- `Chart.data`: array of objects; `x` is the category key; `series` selects value keys
  (default: every numeric key except `x`). Types `bar|line|area|pie|donut|scatter`.
- `List.items`: array of strings or `ListItem` descriptors.
- `columns`/`rows` for `Table`: string headers and arrays of cells (cell = string, number,
  or component descriptor).
- `gap`/`padding` count 4px steps; `width`/`height` are px numbers or CSS length strings.

### 6.6 Locale

`ctx.locale.register('intelligent-ui', { en, zh })`; the frozen key set is:

```
row.title  row.preparing  row.copy  row.copied  row.inspect
error.title  error.empty  error.invalid
timer.start  timer.pause  timer.reset
image.failed  chart.empty  unknown.component
```

`src/client/10-locales.js` must define exactly these keys in both `en` and `zh`
(components-a/b may only use these keys, via `ctx.t`).

## 7. Styling

- Every class starts with `iui-`.
- Colour, surfaces and borders use the host tokens:
  `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1`, `--dsw-alias-bg-layer-2`,
  `--dsw-alias-bg-overlay`, `--dsw-alias-border-l1`, `--dsw-alias-border-l2`,
  `--dsw-alias-brand-primary`, `--dsw-alias-label-primary`, `--dsw-alias-label-secondary`,
  `--dsw-alias-state-error-primary`, `--dsw-alias-state-idle-primary`,
  `--dsw-alias-state-success-primary`, `--dsw-alias-state-warn-primary`.
  These tokens carry light/dark themselves — do not add `prefers-color-scheme` rules for them.
- Only artwork and data colours (chart palette, SVG fills, status tints) may use literals.
  Define them once in `src/client/css/base.css` as `--iui-c-*` custom properties on
  `.iui-root`, with `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`
  override blocks.
- The row must not break the chat layout: root element is `display:block`, width 100%,
  no fixed heights, no `position: fixed`.
- Runtime limits: the row renders at most 400 component nodes and 20 levels deep; past that
  it renders a short notice instead of the rest (keeps a runaway program from freezing the
  chat).

## 8. Host half (`index.js`, Lead)

- `export const inject = ['tools', 'systemPrompt']`, `export function apply(ctx, config)`.
- Imports **nothing** outside `./src/lang`: a workspace-linked bundle has no `node_modules` of
  its own, so the raw `ToolDefinition` shape is registered directly on `ctx.tools.register`
  (name, description, raw JSON Schema `parameters`, `output: { schema, render }`, `execute`,
  `presentCall`).
- Tunables are read from the row's `config` (no `Config` export): `prompt` (default true),
  `maxProgramBytes` (60000), `maxDiagnostics` (24).
- `parameters` — `program` (string, required), `title` (string, optional).
- `execute` parses with `parseProgram`, checks called names against
  `COMPONENT_SIGNATURES`/`FUNCTION_SIGNATURES` (+ the action steps `@Set @Reset @OpenUrl
  @CopyToClipboard @ToAssistant @Action`), and evaluates with `evaluateProgram` when the
  parse is clean. It returns the flat canonical value
  `{ ok, summary, statements, stateVariables, diagnostics }` where `diagnostics` is a
  newline-joined human list. `ok` is false only for fatal problems (parse error, missing
  `root`, unknown name, program too large); evaluation diagnostics are advisory.
  The tool never throws for a bad program — diagnostics are how the model fixes it.
- `output.render(args, value)` returns one text block summarising the outcome for the model
  (`"Rendered <title>: N statements, no diagnostics."`, or the diagnostics list; the program
  itself is omitted because it is already in the call arguments).
- Registers one prompt section, `name: 'tool:intelligent-ui'`, `order: 5500`, text from
  `systemPromptSectionText()`.

## 9. Verification

1. `node --test` (no path: `node --test test/` is broken on Node v22.22.1) and
   `node --test "test/e2e/*.test.mjs"` — parser/evaluator/function unit tests (lang-core)
   and the program corpus + host contract (verifier).
2. `node scripts/build-client.mjs --strict`, `node --check client.js`, and
   `node scripts/probe-client.mjs` (evaluates the built artifact outside the browser and
   asserts the slot registration plus 48/48 components and every taught `@function`).
3. Manifest check: `dsh.bundle.patch`, `dsh.client`, exports resolve to real files, icon is
   a valid SVG < 256 KiB.
4. Live check after `plugin_manager install_bundle`: `Slots` shows
   `tool.call.toolview` occupied with key `intelligent_ui`.
5. Live UI check: call the `intelligent_ui` tool in the session shown by the GUI, then read
   the page: screenshot, no console error, the row renders interactive controls, and
   `window.__DSH_INTELLIGENT_UI__` reports the component/function counts.
