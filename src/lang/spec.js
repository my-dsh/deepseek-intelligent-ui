/**
 * The system-prompt section that teaches openui-lang, plus the worked examples it quotes.
 *
 * The text is generated from `COMPONENT_SIGNATURES` and `FUNCTION_SIGNATURES`, so the
 * prompt can never teach a name the evaluator does not know. It must stay below 8000
 * characters (see `test/lang.test.mjs`). The budget was raised from 7000 after a real
 * session repeatedly tripped on rules the prompt never stated: statements must fit on one
 * physical line, non-ASCII object keys must be quoted, and enum arguments (Card variant,
 * Text weight) silently fall back when wrong — together they cost two failed renders and
 * one "I can't see it" round trip.
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
 * Render one component as `Name(args)`; `?` marks the optional trailing arguments.
 * @param {object} signature - a `COMPONENT_SIGNATURES` entry.
 * @returns {string} one prompt line.
 */
function specComponentLine(signature) {
  const args = signature.args.map(arg => (arg.required ? arg.name : `${arg.name}?`)).join(',')
  return `${signature.name}(${args})`
}

/**
 * Build the complete prompt section text.
 * @returns {string} markdown teaching openui-lang.
 */
export function systemPromptSectionText() {
  const lines = []

  lines.push('## Intelligent UI (openui-lang)')
  lines.push('')
  lines.push('Call the `intelligent_ui` tool when the answer is better explored than read: a calculator, planner, quiz, dashboard, comparison or diagram. Pass one complete program; it renders live in the chat and recomputes from its `$variables`, so it must work on its own.')
  lines.push('')
  lines.push('**Syntax**')
  lines.push('- One statement per physical line: a statement never spans lines, so write long literals (`root = Col([...])`, row lists, objects) on one line. `name = expression`, or `$name = expression` for state.')
  lines.push('- `root = Col([...])` is the entry point drawn; write it first. A reference may come before its statement.')
  lines.push('- Values: "text" (`\\` escapes), numbers, true/false/null, [a, b], {key: value}, `name`, `$name`, `Name(args)`, `@Name(args)`.')
  lines.push('- Object keys are bare identifiers only: quote any non-ASCII key, e.g. {"年份": y, "本金": 1}. A bare Chinese key is a tokenizer error.')
  lines.push('- Arguments are POSITIONAL: `Title("Hi", "lg")`; `gap: 2` is an error, and trailing optional arguments may be left out.')
  lines.push('- Operators, lowest first: `?:`, `||`, `&&`, `== !=`, `< <= > >=`, `+ -`, `* / %`, unary `! -`, then `.prop` and `[index]`. `+` joins text when either side is text; `cond ? a : b` picks between components.')
  lines.push('- `rows.field` extracts that field from every row (`@Sum(rows.amount)`); `rows[0]` indexes, a negative index counting from the end.')
  lines.push('- An input\'s first argument is its `$variable`, two-way bound; elsewhere `$name` reads the current value, and an undeclared `$name` is null. Compute every number shown from `$variables`.')
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
  lines.push('Args: gap and padding count 4px steps; Length is px or "50%"; Radius "sm|md|lg|xl|full" or px; Color "ink|muted|faint|surface|info|success|warning|danger|purple|pink|chart1..chart6" or a CSS colour; options are strings or {value, label}; Chart x is the category key, series the value keys; Chart type "bar|line|area|pie|donut|scatter", format "number|currency|percent"; Card variant is "outline" or "soft"; Text/Title size "xs|sm|md|lg|xl|2xl|3xl", Text weight "normal|medium|semibold"; Table rows are arrays of cells in column order, not objects.')
  lines.push('')
  lines.push('**@Functions** (the only functions there are; `?` is optional)')
  for (const signature of FUNCTION_SIGNATURES) lines.push(`- ${signature.signature}`)
  lines.push('')
  lines.push('**Actions** — the `action` of Button, IconButton and Pressable is one bare step, like `Button("Ask", @ToAssistant("Tell me more"))`, or `Action([@step, @step])` to chain: `@Set($var, value)`, `@Reset($var, ...)`, `@OpenUrl(url)`, `@CopyToClipboard(text)`, `@ToAssistant(message)`. A Button with no action sends its label.')
  lines.push('')
  lines.push('**Rules**')
  lines.push('- Keep every input alive: it changes the page, or sits in a Form whose Button sends a short first-person @ToAssistant.')
  lines.push('- Build rows once with `@Each(rows, "x", ...)` and reuse them in @Each, Table, Chart and `@Sum(rows.field)`; the loop variable exists only inside the template.')
  lines.push('- Format money, counts and dates with @Format, @Plural and @FormatDate; relative dates start from @Today(). Edit lists with @Append, @Remove and @Update.')
  lines.push('- @Random, @Pick and @Shuffle draw anew, so call them inside @Set. Use only the listed components and @functions.')
  lines.push('- Loan and mortgage math: `@Payment(principal, rate, periods)` is the level payment (rate in percent per period, e.g. annual % / 12); equal-principal repayment is principal / periods plus interest on the remaining balance.')
  lines.push('- The block renders where the tool call sits in the chat log, and the log sticks to its bottom: keep the root compact (Chart height, number of stacked cards) or a tall interface lands above the viewport and the user reports not seeing it.')
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
