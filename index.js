/**
 * Host half of the Intelligent UI bundle.
 *
 * Registers the model-facing `intelligent_ui` tool and one system-prompt section that
 * teaches openui-lang. The tool only validates a program and answers the model with
 * diagnostics; rendering belongs to the Client half (`client.js`), which reads the program
 * straight from the recorded call arguments — so nothing here has to reach the browser and
 * nothing extra lands in the session log.
 *
 * This module deliberately imports nothing: a bundle linked from a workspace directory does
 * not get the Harness packages resolved into its own `node_modules`, and the raw
 * `ToolDefinition` shape (plus raw JSON Schema) is exactly what `ctx.tools.register`
 * consumes.
 *
 * Tunables come from the row's `config` in `cordis.patch.yml`:
 *
 * ```yaml
 * - id: intelligent-ui
 *   config: { prompt: false, maxProgramBytes: 60000, maxDiagnostics: 24 }
 * ```
 *
 * @module @my-dsh/dsh-intelligent-ui
 */
import {
  COMPONENT_SIGNATURES,
  FUNCTION_SIGNATURES,
  evaluateProgram,
  parseProgram,
  systemPromptSectionText,
} from './src/lang/index.js'

/** Cordis plugin name. */
export const name = 'intelligent-ui'

/** Services the Host half registers into. */
export const inject = ['tools', 'systemPrompt']

/** Wire tool name; also the `tool.call.toolview` key the Client half registers. */
const TOOL_NAME = 'intelligent_ui'

/** Prompt section placement: after the tool-doc block, before deliverable references. */
const PROMPT_SECTION_ORDER = 5500

/** Action steps a program may name next to the built-in `@functions`. */
const ACTION_STEPS = new Set(['Set', 'Reset', 'OpenUrl', 'CopyToClipboard', 'ToAssistant', 'Action'])

const COMPONENT_NAMES = new Set(COMPONENT_SIGNATURES.map(signature => signature.name))
const FUNCTION_NAMES = new Set(FUNCTION_SIGNATURES.map(signature => signature.name))

/** Model-facing parameter schema. */
const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    program: {
      type: 'string',
      description: 'The complete openui-lang program: one statement per line, `root = Col([...])`, components with positional arguments, `$variable` for anything the user edits.',
    },
    title: {
      type: 'string',
      description: 'Short label for the interface, e.g. "One day in San Francisco".',
    },
  },
  required: ['program'],
}

/** Canonical result schema; enforced by the tool registry on every returned value. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'False when the program cannot render; the diagnostics say why.' },
    summary: { type: 'string', description: 'Model-facing text for this call.' },
    statements: { type: 'integer', description: 'Number of statements in the program.' },
    stateVariables: { type: 'string', description: 'Comma-separated $variable names, empty when none.' },
    diagnostics: { type: 'string', description: 'Newline-separated diagnostics, empty when clean.' },
  },
  required: ['ok', 'summary', 'statements', 'stateVariables', 'diagnostics'],
}

/**
 * Visit every expression node of a program.
 *
 * Iterative on purpose: the parser accepts long flat binary chains (its depth guard only
 * bounds nesting) and a recursive walk over a `root = 1 + 1 + ...` program with a few
 * thousand terms would overflow the JavaScript stack instead of returning diagnostics.
 * @param {object} program - parsed program.
 * @param {(node: object) => void} visit - called for each node.
 * @returns {void}
 */
function walkProgram(program, visit) {
  const pending = []
  for (const statement of program.statements ?? []) pending.push(statement ? statement.expr : null)
  while (pending.length > 0) {
    const node = pending.pop()
    if (node === null || typeof node !== 'object') continue
    if (Array.isArray(node)) {
      for (const item of node) pending.push(item)
      continue
    }
    visit(node)
    switch (node.t) {
      case 'arr':
        for (const item of node.items ?? []) pending.push(item)
        break
      case 'obj':
        for (const entry of node.entries ?? []) pending.push(entry ? entry.value : null)
        break
      case 'mem':
        pending.push(node.obj)
        break
      case 'idx':
        pending.push(node.obj, node.index)
        break
      case 'un':
        pending.push(node.arg)
        break
      case 'bin':
        pending.push(node.left, node.right)
        break
      case 'tern':
        pending.push(node.cond, node.then, node.else)
        break
      case 'call':
        for (const arg of node.args ?? []) pending.push(arg)
        break
      default:
        break
    }
  }
}

/**
 * Check every called name against the taught library.
 * @param {object} program - parsed program.
 * @returns {{severity: string, message: string, line: number}[]} diagnostics.
 */
function checkNames(program) {
  const diagnostics = []
  walkProgram(program, (node) => {
    if (node.t !== 'call' || typeof node.name !== 'string') return
    const line = typeof node.line === 'number' ? node.line : 0
    if (node.name.startsWith('@')) {
      const bare = node.name.slice(1)
      if (FUNCTION_NAMES.has(bare) || ACTION_STEPS.has(bare)) return
      diagnostics.push({
        severity: 'error',
        message: `unknown function "@${bare}" — use only the @-builtins listed in the Intelligent UI prompt section`,
        line,
      })
      return
    }
    if (COMPONENT_NAMES.has(node.name)) return
    diagnostics.push({
      severity: 'error',
      message: `unknown component "${node.name}" — use only the components listed in the Intelligent UI prompt section`,
      line,
    })
  })
  return diagnostics
}

/**
 * Validate one program and describe the outcome for the model.
 * @param {string} source - openui-lang source.
 * @param {{maxProgramBytes: number, maxDiagnostics: number}} config - effective config.
 * @returns {object} canonical tool value per {@link OUTPUT_SCHEMA}.
 */
function inspectProgram(source, config) {
  const bytes = source.length
  if (bytes > config.maxProgramBytes) {
    return {
      ok: false,
      summary: `The interface was NOT rendered: the program is ${bytes} characters and the limit is ${config.maxProgramBytes}. Send a smaller program.`,
      statements: 0,
      stateVariables: '',
      diagnostics: `program too large (${bytes} > ${config.maxProgramBytes}); split the answer into fewer components or fewer statements`,
    }
  }

  const parsed = parseProgram(source)
  /** Fatal problems stop the program from rendering at all. */
  const fatal = [...(parsed.diagnostics ?? [])]
  const advisory = []

  if (parsed.rootName === null || parsed.rootName === undefined) {
    fatal.push({ severity: 'error', message: 'the program must define `root` (usually `root = Col([...])`)', line: 0 })
  }
  fatal.push(...checkNames(parsed))

  const statements = (parsed.statements ?? []).length
  let stateVariables = []
  if (fatal.every(diagnostic => diagnostic.severity !== 'error')) {
    const evaluated = evaluateProgram(parsed)
    advisory.push(...(evaluated.diagnostics ?? []))
    stateVariables = Object.keys(evaluated.stateDefaults ?? {})
  }

  const all = [...fatal, ...advisory]
  const ok = fatal.every(diagnostic => diagnostic.severity !== 'error')
  const lines = all.slice(0, config.maxDiagnostics).map((diagnostic) => {
    const where = diagnostic.line ? `line ${diagnostic.line}: ` : ''
    return `${diagnostic.severity}: ${where}${diagnostic.message}`
  })
  if (all.length > config.maxDiagnostics) lines.push(`… ${all.length - config.maxDiagnostics} more diagnostics`)
  const diagnostics = lines.join('\n')

  const summary = ok
    ? `Rendered "${'{title}'}" in the user's chat: ${statements} statement(s)`
      + `${stateVariables.length > 0 ? `, state: ${stateVariables.join(', ')}` : ''}.`
      + `${diagnostics ? `\nAdvisory notes:\n${diagnostics}` : ''}`
      + '\nThe program is already recorded in this call\'s arguments — do not repeat it, and do not repeat the same answer as prose.'
    : `The interface was NOT rendered. Fix these problems and call intelligent_ui again:\n${diagnostics}`

  return { ok, summary, statements, stateVariables: stateVariables.join(', '), diagnostics }
}

/**
 * Register the tool and the prompt section.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {{prompt?: boolean, maxProgramBytes?: number, maxDiagnostics?: number}} [config] - row config.
 * @returns {void}
 */
export function apply(ctx, config = {}) {
  const effective = {
    prompt: config.prompt !== false,
    maxProgramBytes: Number.isFinite(config.maxProgramBytes) ? config.maxProgramBytes : 60000,
    maxDiagnostics: Number.isFinite(config.maxDiagnostics) ? config.maxDiagnostics : 24,
  }

  ctx.effect(() => ctx.tools.register({
    name: TOOL_NAME,
    description:
      'Answer with an interactive interface instead of prose. Write one complete openui-lang '
      + 'program (not JSON, not markdown): one statement per line, `root = Col([...])` as the '
      + 'entry point, components with positional arguments, `$variable` for anything the user '
      + 'edits, and `@`-builtins for computing. The user then sees a live, working answer — an '
      + 'editable itinerary, a calculator, a quiz, a dashboard, a diagram — that recomputes as '
      + 'they interact. Use it whenever the answer is better explored than read. The system-prompt '
      + 'section "Intelligent UI" lists every component and @function you may use, with their '
      + 'argument order. Call this tool once per answer with the whole program, and do not also '
      + 'repeat the same answer as prose.',
    parameters: PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    execute(args) {
      const title = typeof args?.title === 'string' ? args.title.trim() : ''
      const program = typeof args?.program === 'string' ? args.program : ''
      if (program.trim() === '') {
        return {
          ok: false,
          summary: 'The interface was NOT rendered: `program` was missing or empty. Pass the complete openui-lang program.',
          statements: 0,
          stateVariables: '',
          diagnostics: 'error: `program` must be a non-empty string',
        }
      }
      const result = inspectProgram(program, effective)
      return {
        ok: result.ok,
        summary: result.summary.replace('{title}', title || 'Intelligent UI'),
        statements: result.statements,
        stateVariables: result.stateVariables,
        diagnostics: result.diagnostics,
      }
    },
    presentCall: (args) => {
      const title = typeof args?.title === 'string' ? args.title.trim() : ''
      return { card: 'generic', title: title === '' ? 'Intelligent UI' : `Intelligent UI · ${title}` }
    },
  }), 'intelligent-ui: tool')

  if (effective.prompt) {
    ctx.effect(
      () => ctx.systemPrompt.section({
        name: 'tool:intelligent-ui',
        order: PROMPT_SECTION_ORDER,
        text: systemPromptSectionText(),
      }),
      'intelligent-ui: prompt section',
    )
  }
}
