/**
 * The system-prompt section that teaches openui-lang, plus the worked examples it quotes.
 *
 * The text is generated from `COMPONENT_SIGNATURES` and `FUNCTION_SIGNATURES`, so the
 * prompt can never teach a name the evaluator does not know. It must stay below 8400
 * characters (see `test/lang.test.mjs`) — every session pays for it. The budget was
 * raised from 7000 to 8000 after a real session repeatedly tripped on rules the prompt
 * never stated: statements must fit on one physical line, non-ASCII object keys must be
 * quoted, and enum arguments silently fall back when wrong. It is now rebalanced to 8400
 * so the bytes go to facts that change behaviour: enum values, the `null` argument
 * placeholder, `//` comments, ASCII-only names, boolean `&&`/`||`, the `@Each`
 * loop-variable scope, the 60 KB program cap and the two "percent" conventions.
 * Component/function descriptions are still not quoted (they do not fit); only the
 * compact signature lines are taught, so keep them accurate.
 *
 * @module src/lang/spec
 */

import { COMPONENT_SIGNATURES, FUNCTION_SIGNATURES } from './signatures.js'

/** Two short worked programs quoted at the end of the prompt section. */
export const EXAMPLES = [
  {
    title: 'Tip splitter:',
    program: [
      'root = Col([Title("Tip splitter"), Slider($bill, 0, 500, 5, "Bill", "$"), Slider($tip, 0, 30, 5, "Tip", "%"), Text("Each of " + $people + " pays " + @Format(share, "currency"))])',
      '$bill = 120',
      '$people = 4',
      '$tip = 18',
      'share = @Round($bill * (1 + $tip / 100) / @Clamp($people, 1, 50), 2)',
    ].join('\n'),
  },
  {
    title: 'Packing checklist:',
    program: [
      'root = Col([Text(@Count($done) + " of " + @Count(items) + " packed"), Col(@Each(items, "item", Pressable([Text(item, "sm", null, null, @Includes($done, item))], @Set($done, @Toggle($done, item)))), 1)], 2)',
      '$done = []',
      'items = ["Passport", "Charger", "Sunscreen"]',
    ].join('\n'),
  },
]

/**
 * Components whose rare positional tail is abbreviated with `…` in the prompt. The
 * frozen argument order in `COMPONENT_SIGNATURES` is unchanged; only the teaching text
 * is shortened so the budget buys facts that prevent failed renders.
 * @type {Record<string, number>}
 */
const specPromptPrefix = {
  Box: 10,
  Text: 4,
  Pressable: 3,
  SvgText: 6,
  Circle: 5,
  Ellipse: 5,
  Rect: 5,
  Line: 5,
  Path: 4,
  Polyline: 4,
  Polygon: 4,
}

/**
 * Render one component as `Name(args)`; `?` marks the optional trailing arguments.
 * @param {object} signature - a `COMPONENT_SIGNATURES` entry.
 * @returns {string} one prompt line.
 */
function specComponentLine(signature) {
  const limit = specPromptPrefix[signature.name] ?? signature.args.length
  const args = signature.args
    .slice(0, limit)
    .map(arg => (arg.required ? arg.name : `${arg.name}?`))
  if (limit < signature.args.length) args.push('…')
  return `${signature.name}(${args.join(',')})`
}

/**
 * Pack the `@function` signatures into a few dense lines. The signatures themselves stay
 * verbatim (the tests and the model need `@Name(args)` exactly); only the per-line bullet
 * and newline overhead is removed, which frees room for the enum cheat-sheet below.
 * @param {number} width - soft maximum characters per line.
 * @returns {string[]} prompt lines.
 */
function specFunctionLines(width) {
  const lines = []
  let current = ''
  for (const signature of FUNCTION_SIGNATURES) {
    if (current === '') {
      current = `- ${signature.signature}`
    } else if (current.length + 2 + signature.signature.length > width) {
      lines.push(current)
      current = `- ${signature.signature}`
    } else {
      current += `  ${signature.signature}`
    }
  }
  if (current !== '') lines.push(current)
  return lines
}

/**
 * Build the complete prompt section text.
 * @returns {string} markdown teaching openui-lang.
 */
export function systemPromptSectionText() {
  const lines = []

  lines.push('## Intelligent UI (openui-lang)')
  lines.push('')
  lines.push('Call `intelligent_ui` when the answer is better explored than read: a calculator, planner, quiz, dashboard, comparison or diagram.')
  lines.push('')
  lines.push('**Syntax**')
  lines.push('- One statement per physical line: a statement never spans lines, so write long literals (`root = Col([...])`, row lists, objects) on one line. `name = expression`, or `$name = expression` for state.')
  lines.push('- `root = Col([...])` is the entry point drawn; write it first. A reference may come before its statement.')
  lines.push('- Values: "text" (`\\` escapes), numbers, true/false/null, [a, b], {key: value}, `name`, `$name`, `Name(args)`, `@Name(args)`.')
  lines.push('- Names are ASCII: `$total`, not `$总价`, and object keys are bare ASCII identifiers or quoted, e.g. {"年份": 1}.')
  lines.push('- Arguments are POSITIONAL (`gap: 2` is an error); skip a middle optional with `null`, trailing ones may be omitted.')
  lines.push('- Operators, lowest first: `?:`, `||`, `&&`, `== !=`, `< <= > >=`, `+ -`, `* / %`, unary `! -`, then `.prop` and `[index]`; `+` joins text when either side is text.')
  lines.push('- `rows.field` extracts that field from every row (`@Sum(rows.amount)`); `rows[0]` indexes, a negative index counting from the end.')
  lines.push('- An input takes its `$variable` first and two-way binds it; an undeclared `$name` is null. Compute every number shown from `$variables`.')
  lines.push('- `//` starts a comment to the end of the line (`root = 6 // six`); it is not division.')
  lines.push('- `&&`, `||` and `!` return true/false, not an operand: use `@Default(x, fallback)` or `cond ? a : b` for a fallback.')
  lines.push('')
  lines.push('**Components** (positional arguments; `?` is optional)')

  let group = null
  for (const signature of COMPONENT_SIGNATURES) {
    if (signature.group !== group) {
      group = signature.group
      lines.push(`${group}:`)
    }
    lines.push(`- ${specComponentLine(signature)}`)
  }

  lines.push('')
  lines.push('Args: `gap`/`padding` count 4px steps; `Length` px or "50%"; `Radius` "sm|md|lg|xl|full" or px; `Color` "ink|muted|info|success|warning|danger|purple|pink|chart1..chart6" or CSS; `align`/`justify` "start|center|end|stretch" and "start|center|end|between"; `options` are strings or {value, label}; `Table` rows are cell arrays, not objects; `Text`/`Title` size "xs|sm|md|lg|xl|2xl" (+"3xl" on Title); `Card` variant "soft" or "outlined"; `Button`/`IconButton` variant "primary|secondary|ghost|outline|danger"; `RadioGroup` variant "list|cards"; `List` marker "bullet|number|dash|check|none"; `Image` fit "cover|contain"; `Chart` type "bar|line|area|pie|donut|scatter", `format` "number|currency|percent", `x` is the category key and `series` the value keys.')
  lines.push('')
  lines.push('**@Functions** (the only functions there are; `?` is optional)')
  for (const line of specFunctionLines(150)) lines.push(line)
  lines.push('Enum arguments: `@Sort`/`@Top` dir asc|desc; `@Filter` op == != > < >= <= contains; `@Format` kind number|currency|percent|compact; `@FormatDate` style date|short|long|weekday|month|time|datetime|iso; `@Duration` style short|clock; `@StartOf` unit week|month|year; `@Bucket` unit day|week|month; `@GroupBy`/`@Pivot` agg sum|avg|count|min|max.')
  lines.push('')
  lines.push('**Actions** — the `action` of Button, IconButton and Pressable is one bare step, like `Button("Ask", @ToAssistant("Tell me more"))`, or `Action([@step, @step])` to chain: `@Set($var, value)`, `@Reset($var, ...)`, `@OpenUrl(url)`, `@CopyToClipboard(text)`, `@ToAssistant(message)`. A Button with no action sends its label.')
  lines.push('')
  lines.push('**Rules**')
  lines.push('- Keep every input alive: it changes the page, or sits in a Form whose Button sends a short first-person @ToAssistant.')
  lines.push('- Build rows once with `@Each(rows, "x", ...)` and reuse them in @Each, Table, Chart and `@Sum(rows.field)`. Inside the template the loop variable has no `$` (`Text(x.name)`, never `$x`), and it exists only there.')
  lines.push('- Format money, counts and dates with @Format, @Plural and @FormatDate; relative dates start from @Today(). Edit lists with @Append, @Remove and @Update.')
  lines.push('- Chart `format "percent"` expects a fraction (0.45 → 45%), while `@Format(x, "percent")` and `@Percent` use 0-100 units (45 → 45%).')
  lines.push('- @Random, @Pick, @Shuffle and @Now draw anew on every re-render, so call them inside @Set. Use only the listed names.')
  lines.push('- Loan and mortgage math: `@Payment(principal, rate, periods)` is the level payment (rate in percent per period, e.g. annual % / 12); equal-principal repayment is principal / periods plus interest on the remaining balance.')
  lines.push('- Keep the program under 60,000 characters; larger programs are rejected without rendering. The block renders where the tool call sits, and the log sticks to its bottom: keep the root compact (Chart height, stacked cards) or it lands above the viewport and the user reports not seeing it.')
  lines.push('')
  lines.push('**Examples**')
  for (const example of EXAMPLES) {
    lines.push('')
    lines.push(example.title)
    lines.push('```')
    lines.push(example.program)
    lines.push('```')
  }

  return lines.join('\n')
}
