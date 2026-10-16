/**
 * The Intelligent UI renderer.
 *
 * Turns an evaluated openui-lang program into React elements, and provides the
 * `IUI.util` helpers plus the `ctx` surface every component is written against
 * (docs/INTERFACES.md §6.1–§6.3). Display goes through built-in components, so
 * this file depends on no other fragment's `const` at evaluation time. The
 * built-ins resolve lazily with token-derived fallbacks: with zero registered
 * components every program still renders (as unknown-component notices) instead
 * of blanking the chat.
 *
 * @module dsh-intelligent-ui/client/render
 */

/** Maximum component nodes rendered per row (docs/INTERFACES.md §7). */
const IUI_MAX_NODES = 400

/** Maximum component nesting depth per row (docs/INTERFACES.md §7). */
const IUI_MAX_DEPTH = 20

/** Fallback used when the host locale service is unreachable. */
const IUI_FALLBACK_T = key => (typeof iuiFallbackText === 'function' ? iuiFallbackText(key) : String(key))

/* `iuiErrorMessage` is declared by `20-store.js`, which runs before this fragment. */

/** Semantic colour name → host token. */
const IUI_COLORS = {
  brand: 'var(--dsw-alias-brand-primary)',
  primary: 'var(--dsw-alias-brand-primary)',
  info: 'var(--dsw-alias-brand-primary)',
  success: 'var(--dsw-alias-state-success-primary)',
  ok: 'var(--dsw-alias-state-success-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  critical: 'var(--dsw-alias-state-error-primary)',
  idle: 'var(--dsw-alias-state-idle-primary)',
  default: 'var(--dsw-alias-state-idle-primary)',
  ink: 'var(--dsw-alias-label-primary)',
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-secondary)',
  secondary: 'var(--dsw-alias-label-secondary)',
  subtle: 'var(--dsw-alias-label-secondary)',
  'text-secondary': 'var(--dsw-alias-label-secondary)',
  base: 'var(--dsw-alias-bg-base)',
  surface: 'var(--dsw-alias-bg-base)',
  layer1: 'var(--dsw-alias-bg-layer-1)',
  layer2: 'var(--dsw-alias-bg-layer-2)',
  overlay: 'var(--dsw-alias-bg-overlay)',
  border: 'var(--dsw-alias-border-l1)',
  'border-strong': 'var(--dsw-alias-border-l2)',
  purple: 'var(--iui-c-chart5)',
  pink: 'var(--iui-c-chart4)',
  chart1: 'var(--iui-c-chart1)',
  chart2: 'var(--iui-c-chart2)',
  chart3: 'var(--iui-c-chart3)',
  chart4: 'var(--iui-c-chart4)',
  chart5: 'var(--iui-c-chart5)',
  chart6: 'var(--iui-c-chart6)',
}

/** Semantic colour name → soft tint, for `util.color(v, 'bg')`. */
const IUI_COLORS_SOFT = {
  brand: 'var(--iui-c-brand-soft)',
  primary: 'var(--iui-c-brand-soft)',
  info: 'var(--iui-c-brand-soft)',
  success: 'var(--iui-c-success-soft)',
  ok: 'var(--iui-c-success-soft)',
  warn: 'var(--iui-c-warn-soft)',
  warning: 'var(--iui-c-warn-soft)',
  error: 'var(--iui-c-error-soft)',
  danger: 'var(--iui-c-error-soft)',
  critical: 'var(--iui-c-error-soft)',
  purple: 'var(--iui-c-purple-soft)',
  pink: 'var(--iui-c-pink-soft)',
  chart1: 'var(--iui-c-chart1-soft)',
  chart2: 'var(--iui-c-chart2-soft)',
  chart3: 'var(--iui-c-chart3-soft)',
  chart4: 'var(--iui-c-chart4-soft)',
  chart5: 'var(--iui-c-chart5-soft)',
  chart6: 'var(--iui-c-chart6-soft)',
}

/** True for an evaluated `ElementDescriptor` (`{ kind:'element' }`). */
function utilIsElement(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.kind === 'element'
    && typeof value.name === 'string'
}

/** True for an evaluated `BindingDescriptor` (`{ kind:'binding' }`). */
function utilIsBinding(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.kind === 'binding'
    && typeof value.name === 'string'
}

/** Unwrap a binding descriptor to its value; anything else passes through. */
function utilValue(value) {
  return utilIsBinding(value) ? value.value : value
}

/** 4px step count → px string; a CSS length string passes through. */
function utilSpace(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 0) return '0'
    return `${value * 4}px`
  }
  return undefined
}

/** Radius name or step count → CSS length. */
function utilRadius(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`
  if (typeof value !== 'string') return undefined
  switch (value) {
    case 'sm': return '6px'
    case 'md': return '10px'
    case 'lg': return '14px'
    case 'xl': return '20px'
    case 'full': return '9999px'
    case 'none': return '0'
    default: return value
  }
}

/**
 * Semantic colour name → CSS value.
 * @param {unknown} value - semantic name, or any CSS colour to pass through.
 * @param {'bg'|undefined} [kind] - `'bg'` returns the soft tint where one exists.
 * @returns {unknown} CSS colour string, or the input unchanged when unrecognized.
 */
function utilColor(value, kind) {
  if (typeof value !== 'string') return value
  const key = value.trim().toLowerCase()
  if (kind === 'bg' && Object.prototype.hasOwnProperty.call(IUI_COLORS_SOFT, key)) return IUI_COLORS_SOFT[key]
  if (Object.prototype.hasOwnProperty.call(IUI_COLORS, key)) return IUI_COLORS[key]
  return value
}

/**
 * Format a number for display.
 * @param {unknown} value - number (or numeric string).
 * @param {'number'|'currency'|'percent'|'compact'} [kind] - format kind.
 * @param {number} [decimals] - fraction digits.
 * @param {string} [currency] - ISO currency code, default `USD`.
 * @returns {string} formatted text (or `''` when not a number).
 */
function utilFormatNumber(value, kind, decimals, currency) {
  const number = typeof value === 'number' ? value : Number(value)
  if (typeof value === 'boolean' || value === null || value === '' || !Number.isFinite(number)) return ''
  const digits = typeof decimals === 'number' && Number.isFinite(decimals) ? Math.max(0, Math.min(20, decimals)) : undefined
  const options = {}
  if (kind === 'currency') {
    options.style = 'currency'
    options.currency = typeof currency === 'string' && currency.length > 0 ? currency : 'USD'
  } else if (kind === 'percent') options.style = 'percent'
  else if (kind === 'compact') options.notation = 'compact'
  if (digits !== undefined) {
    options.minimumFractionDigits = digits
    options.maximumFractionDigits = digits
  }
  try {
    return new Intl.NumberFormat(undefined, options).format(number)
  } catch {
    try {
      return String(number)
    } catch {
      return ''
    }
  }
}

/** Trim human text to `limit` characters. */
function utilTruncate(text, limit) {
  const size = typeof limit === 'number' && Number.isFinite(limit) ? Math.max(1, limit) : 160
  return text.length > size ? `${text.slice(0, size)}…` : text
}

/**
 * Recursive core of {@link utilStringify}; shared with the non-truncating
 * {@link utilRawText} the clipboard and composer actions use.
 *
 * @param {unknown} value - value to describe.
 * @param {Set<unknown>} seen - cycle guard for the current path.
 * @param {number} limit - characters per string.
 * @param {boolean} full - when true, do not cap array/object entry counts.
 * @param {number} depth - recursion depth of this call.
 * @returns {string} human text.
 */
function stringifyValue(value, seen, limit, full, depth) {
  const level = depth ?? 0
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return utilTruncate(value, limit)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (utilIsElement(value)) return `<${value.name}>`
  if (utilIsBinding(value)) return stringifyValue(value.value, seen, limit, full, level + 1)
  // `full` must still terminate: a pathological/deep value degrades instead of hanging.
  if (level > 200) return '…'
  if (Array.isArray(value)) {
    if (seen.has(value)) return '…'
    seen.add(value)
    const items = full ? value.length : Math.min(value.length, 12)
    const parts = []
    for (let index = 0; index < items; index += 1) {
      parts.push(stringifyValue(value[index], seen, Math.max(24, Math.floor(limit / 2)), full, level + 1))
    }
    if (items < value.length) parts.push('…')
    seen.delete(value)
    return utilTruncate(parts.join(', '), limit)
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return '…'
    seen.add(value)
    const entries = Object.keys(value)
    const count = full ? entries.length : Math.min(entries.length, 8)
    const parts = []
    for (let index = 0; index < count; index += 1) {
      const key = entries[index]
      parts.push(`${key}: ${stringifyValue(value[key], seen, Math.max(16, Math.floor(limit / 4)), full, level + 1)}`)
    }
    if (count < entries.length) parts.push('…')
    seen.delete(value)
    return utilTruncate(parts.length === 0 ? '{}' : `{${parts.join(', ')}}`, limit)
  }
  return ''
}

/** Human text for a primitive, array, or object; never throws. Visible-text default: 160 chars. */
function utilStringify(value) {
  try {
    return stringifyValue(value, new Set(), 160, false, 0)
  } catch {
    return ''
  }
}

/**
 * Full-length text for an action payload (`@CopyToClipboard`, `@ToAssistant`).
 * A string passes through byte-for-byte; complex values are serialized without
 * the 160-character display cap. Never throws.
 *
 * @param {unknown} value - already-unwrapped action argument.
 * @returns {string} untruncated text.
 */
function utilRawText(value) {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return stringifyValue(value, new Set(), Number.MAX_SAFE_INTEGER, true, 0)
  } catch {
    return ''
  }
}

/** @type {typeof IUI.util} */
IUI.util = {
  isElement: utilIsElement,
  isBinding: utilIsBinding,
  value: utilValue,
  space: utilSpace,
  radius: utilRadius,
  color: utilColor,
  formatNumber: utilFormatNumber,
  stringify: utilStringify,
}

/**
 * Renderer state for one render pass: budget, store, identity, locale, and the
 * host capabilities a row was given.
 *
 * @param {object} options - per-row inputs.
 * @returns {object} renderer.
 */
function iuiCreateRenderer(options) {
  const config = options ?? {}
  const store = config.store
  const entryMap = IUI.components ?? {}
  const budget = { nodes: 0, max: IUI_MAX_NODES, maxDepth: IUI_MAX_DEPTH, overflow: false }
  const capabilities = config.capabilities ?? {}
  const diagnostics = []
  let announcedOverflow = false

  function translate(key, params) {
    try {
      if (typeof config.t === 'function') return config.t(key, params)
    } catch {
      /* fall through to the English dictionary */
    }
    return IUI_FALLBACK_T(key)
  }

  /** Record one diagnostic; capped so a runaway program cannot flood memory. */
  function record(severity, message, line) {
    if (diagnostics.length >= 40) return
    const diagnostic = { severity, message: String(message) }
    if (Number.isFinite(line) && line > 0) diagnostic.line = line
    diagnostics.push(diagnostic)
    iuiReportDiagnostic(severity, message, line)
  }

  /**
   * Stable React key for one node. Deterministic in the descriptor path, so a
   * re-render produces the same keys in the same order.
   */
  function nodeKey(prefix, index) {
    return `${prefix}|${index}`
  }

  /** Unwrap a binding; anything else passes through. */
  function value(input) {
    return utilIsBinding(input) ? input.value : input
  }

  function render(valueInput) {
    return renderValue(valueInput, 0, 'p')
  }

  /** Depth/budget guard shared by every rendered value. */
  function enter(depth) {
    if (depth > budget.maxDepth) {
      budget.overflow = true
      if (!announcedOverflow) {
        announcedOverflow = true
        record('warning', `interface nested deeper than ${budget.maxDepth} levels; the rest was not rendered`)
      }
      return false
    }
    if (budget.nodes >= budget.max) {
      budget.overflow = true
      return false
    }
    return true
  }

  /** `Value` → `ReactNode`. */
  function renderValue(input, depth, path) {
    if (input === null || input === undefined) return null
    if (typeof input === 'string' || typeof input === 'number') return input
    if (typeof input === 'boolean') return String(input)
    if (!enter(depth)) return null
    if (Array.isArray(input)) {
      const out = []
      for (let index = 0; index < input.length; index += 1) {
        if (budget.nodes >= budget.max) {
          budget.overflow = true
          break
        }
        out.push(renderValue(input[index], depth + 1, `${path}.${index}`))
      }
      return out
    }
    if (typeof input !== 'object') return null
    if (utilIsBinding(input)) return renderValue(input.value, depth + 1, path)
    if (utilIsElement(input)) return dispatch(input, depth + 1, path)
    return utilStringify(input)
  }

  /** A named component call → one React element (or a guard notice). */
  function dispatch(descriptor, depth, path) {
    if (!enter(depth)) return null
    budget.nodes += 1
    const name = String(descriptor.name ?? '')
    const entry = Object.prototype.hasOwnProperty.call(entryMap, name) ? entryMap[name] : undefined
    const args = Array.isArray(descriptor.args) ? descriptor.args : []
    if (entry === null || typeof entry !== 'object' || typeof entry.render !== 'function') {
      record('error', `unknown component "${name}"`, descriptor.line)
      return notice('iui-unknown', `${translate('unknown.component')}: ${name}`, path)
    }
    const argsNames = Array.isArray(entry.args) ? entry.args : []
    const props = { key: nodeKey(`c:${name}:${descriptor.line ?? depth}`, budget.nodes) }
    for (let index = 0; index < args.length; index += 1) {
      const argName = typeof argsNames[index] === 'string' ? argsNames[index] : `arg${index + 1}`
      props[argName] = args[index]
    }
    const min = Number.isFinite(entry.min) ? entry.min : 0
    if (args.length < min) {
      record('warning', `"${name}" expects at least ${min} argument${min === 1 ? '' : 's'}, received ${args.length}`, descriptor.line)
    }
    if (args.length > argsNames.length && argsNames.length > 0) {
      record('warning', `"${name}" received ${args.length - argsNames.length} extra argument(s)`, descriptor.line)
    }
    props.__iuiActivate = markActivated
    props.__iuiDispatch = runAction
    try {
      const element = entry.render(props, componentContext(depth, path))
      if (element === null || element === undefined) return null
      const type = typeof element
      if (type === 'string' || type === 'number') return element
      if (type !== 'object') {
        record('warning', `"${name}" returned ${type}, not a React element`, descriptor.line)
        return notice('iui-unknown', `${translate('unknown.component')}: ${name}`, path)
      }
      return withKey(element, props.key)
    } catch (error) {
      record('error', `component "${name}" failed: ${iuiErrorMessage(error)}`, descriptor.line)
      return notice('iui-component-error', `"${name}": ${iuiErrorMessage(error)}`, path)
    }
  }

  /**
   * Guarantee a React key on the element a component returned.
   *
   * A component may return a bare DOM element (components-a's `Col` returns
   * `h('div', …)`), in which case the key held by this dispatch sits on the
   * descriptor and React sees an unkeyed array child. A component may instead
   * return its own element (components-b wraps in a host function component),
   * where the key already rides the wrapper. This normalizes both, and never
   * replaces a key the component chose itself.
   */
  function withKey(element, wanted) {
    if (React === null || typeof React.cloneElement !== 'function') return element
    if (element.key !== null && element.key !== undefined) return element
    const type = element.type
    if (typeof type === 'string' || typeof type === 'function') {
      try {
        return React.cloneElement(element, { key: wanted })
      } catch {
        return element
      }
    }
    return element
  }

  /** Guard notice: one short box, never a throw. */
  function notice(className, text, path) {
    return h('div', { className: `iui-notice ${className}`, role: 'note', key: `n:${path ?? ''}` }, String(text))
  }

  /** The §6.2 context handed to `render(props, ctx)`. */
  function componentContext(depth, path) {
    return {
      h,
      React,
      render: child => renderValue(child, depth + 1, `${path}:r`),
      children: (props, name) => renderValue(
        props === null || props === undefined ? undefined : props[name],
        depth + 1,
        `${path}:c:${String(name)}`,
      ),
      value,
      key: nodeKey,
      t: translate,
      state: {
        get: name => store.get(name),
        set: (name, next) => store.set(name, next),
      },
      bind: (binding, next) => {
        if (!utilIsBinding(binding)) {
          record('warning', 'bind() expected a $variable binding')
          return
        }
        store.set(binding.name, next)
      },
      dispatch: runAction,
      callId: String(config.callId ?? ''),
      sessionId: String(capabilities.sessionId ?? ''),
      utils: IUI.util,
      input: capabilities.inputActions ?? null,
      capabilities,
    }
  }

  /** A component read `props.__iuiActivate`, so this row owns live `$state`. */
  let activated = false
  function markActivated() {
    activated = true
    return true
  }

  /** Run a `@Set`/`@Reset`/`@OpenUrl`/`@CopyToClipboard`/`@ToAssistant` step, or `Action([...])`. */
  function runAction(action) {
    if (Array.isArray(action)) {
      for (const step of action) runAction(step)
      return
    }
    if (!utilIsElement(action)) return
    const name = String(action.name ?? '').replace(/^@/, '')
    const args = Array.isArray(action.args) ? action.args : []
    try {
      if (name === 'Set') {
        const binding = args[0]
        if (!utilIsBinding(binding)) {
          record('warning', '@Set expects a $variable as its first argument')
          return
        }
        store.set(binding.name, value(args[1]))
        return
      }
      if (name === 'Reset') {
        store.reset()
        return
      }
      if (name === 'OpenUrl') {
        const url = value(args[0])
        if (typeof url !== 'string' || url === '') return
        const open = typeof window !== 'undefined' ? window.open : undefined
        if (typeof open === 'function') open.call(window, url, '_blank', 'noopener,noreferrer')
        return
      }
      if (name === 'CopyToClipboard') {
        copyText(utilRawText(value(args[0])))
        return
      }
      if (name === 'ToAssistant') {
        toAssistant(utilRawText(value(args[0])))
        return
      }
      if (name === 'Action') {
        for (const step of args) runAction(step)
        return
      }
      record('warning', `unknown action "@${name}"`)
    } catch (error) {
      record('warning', `action "@${name}" failed: ${iuiErrorMessage(error)}`)
    }
  }

  /** Clipboard write with a legacy fallback; reports success through `capabilities`. */
  function copyText(text) {
    let done = false
    try {
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
      if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
        const pending = clipboard.writeText(text)
        if (pending !== undefined && typeof pending.then === 'function') {
          pending.then(() => announceCopied(), () => {})
          return
        }
        announceCopied()
        return
      }
      if (typeof document !== 'undefined' && document.body !== null) {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        done = typeof document.execCommand === 'function' && document.execCommand('copy')
        document.body.removeChild(area)
      }
    } catch {
      done = false
    }
    if (done) announceCopied()
  }

  /** Tell the row a clipboard write landed. */
  function announceCopied() {
    try {
      if (typeof capabilities.onCopied === 'function') capabilities.onCopied()
    } catch {
      /* a failing notice must not break the action */
    }
  }

  /** Hand text back to the composer (or the clipboard when the row has no input). */
  function toAssistant(text) {
    if (text === '') return
    let handled = false
    try {
      const input = capabilities.inputActions
      if (input !== null && input !== undefined && typeof input.setDraft === 'function') {
        input.setDraft(text)
        if (typeof input.submit === 'function') input.submit()
        handled = true
      }
    } catch (error) {
      record('warning', `could not reach the composer: ${iuiErrorMessage(error)}`)
    }
    if (!handled) copyText(text)
  }

  /** Finalize one pass: overflow notice + diagnostics; never throws. */
  function finish(element) {
    let tree = element
    if (budget.overflow) {
      tree = [
        tree,
        h('div', { className: 'iui-notice iui-truncated', role: 'note', key: 'iui-truncated' },
          `This interface is larger than ${budget.max} components; the rest was not rendered.`),
      ]
    }
    config.onDiagnostics?.(diagnostics)
    return tree
  }

  return {
    util: IUI.util,
    budget,
    render,
    runAction,
    key: nodeKey,
    emit: finish,
    get activated() {
      return activated
    },
    get diagnostics() {
      return diagnostics
    },
  }
}

/**
 * Error boundary around the rendered program: a throwing component tree shows a
 * short box instead of blanking the slot entry.
 */
class IuiErrorBoundary extends React.Component {
  /** @param {object} props - `{ children }` plus the locale text. */
  constructor(props) {
    super(props)
    this.state = { failed: false, message: '' }
  }

  /** @param {Error} error - thrown by a descendant. */
  static getDerivedStateFromError(error) {
    return { failed: true, message: iuiErrorMessage(error) }
  }

  /** @param {Error} error - thrown by a descendant. */
  componentDidCatch(error) {
    iuiReportDiagnostic('error', `interface render failed: ${iuiErrorMessage(error)}`)
  }

  /** @returns {import('react').ReactNode} children, or the fallback box. */
  render() {
    if (this.state.failed) {
      const label = typeof this.props.title === 'string' ? this.props.title : 'Render error'
      return h('div', { className: 'iui-notice iui-error-boundary', role: 'alert' },
        h('div', { className: 'iui-notice-title' }, label),
        h('div', { className: 'iui-notice-body' }, this.state.message))
    }
    return this.props.children
  }
}

/** Parse `{ program, title }` out of a Tool call's raw arguments JSON. */
function iuiReadCallArgs(block) {
  if (block === null || block === undefined || typeof block !== 'object') {
    return { ok: false, reason: 'empty', program: '', title: '' }
  }
  const call = block.call !== null && block.call !== undefined && typeof block.call === 'object' ? block.call : undefined
  const argsRaw = typeof call?.argsRaw === 'string' ? call.argsRaw : (typeof block.argsRaw === 'string' ? block.argsRaw : '')
  if (argsRaw.trim() === '') return { ok: false, reason: 'empty', program: '', title: '' }
  let parsed = null
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    return { ok: false, reason: 'incomplete', program: '', title: '' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'invalid', program: '', title: '' }
  }
  const program = typeof parsed.program === 'string' ? parsed.program : ''
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
  if (program.trim() === '') return { ok: false, reason: 'empty', program: '', title }
  return { ok: true, reason: 'ok', program, title }
}

/** One diagnostic line for the error box. */
function formatDiagnostic(diagnostic) {
  const where = Number.isFinite(diagnostic?.line) && diagnostic.line > 0 ? `line ${diagnostic.line}: ` : ''
  return `${where}${String(diagnostic?.message ?? '')}`
}

/** The error box shown when a program parses to errors or rejects evaluation. */
function iuiErrorBox(t, diagnostics, message) {
  const lines = (Array.isArray(diagnostics) ? diagnostics : []).slice(0, 12).map(formatDiagnostic)
  const body = []
  if (typeof message === 'string' && message !== '') body.push(h('div', { className: 'iui-error-note', key: 'note' }, message))
  if (lines.length > 0) {
    body.push(h('ul', { className: 'iui-error-list', key: 'list' }, lines.map((line, index) => h('li', { key: `e${index}` }, line))))
  }
  return h('div', { className: 'iui-error', role: 'alert' },
    h('div', { className: 'iui-error-title' }, t('error.title')),
    h('div', { className: 'iui-error-body' }, ...body))
}

/** The program state rendered before the Tool call is dispatched. */
function iuiSkeleton(t) {
  return h('div', { className: 'iui-row iui-preparing' },
    h('div', { className: 'iui-skeleton' },
      h('div', { className: 'iui-skeleton-bar' }),
      h('div', { className: 'iui-skeleton-bar iui-skeleton-bar-short' })),
    h('div', { className: 'iui-preparing-label' }, t('row.preparing')))
}

/**
 * The registered `tool.call.toolview` entry for `intelligent_ui`.
 *
 * Reads the program straight from the call arguments (never a lazy args API),
 * parses and evaluates it with the lang core, owns the row store, and renders
 * the program's `root` plus the local `IUI_CSS` stylesheet.
 *
 * @param {object} props - Tool view owner props (docs/INTERFACES.md §4).
 * @returns {import('react').ReactNode} the row.
 */
function Row(props) {
  const input = props ?? {}
  const phase = input.phase === 'preparing' ? 'preparing' : input.phase === 'start' ? 'start' : 'result'
  const block = input.block
  const callId = typeof input.callId === 'string' ? input.callId : ''
  const toolviewT = typeof input.t === 'function' ? input.t : IUI_FALLBACK_T
  const programText = phase === 'preparing' ? '' : iuiReadCallArgs(block).program
  let parsed = null
  if (programText !== '' && typeof parseProgram === 'function') {
    try {
      parsed = parseProgram(programText)
    } catch (error) {
      parsed = {
        ok: false,
        rootName: null,
        statements: [],
        diagnostics: [{ severity: 'error', message: `parse failed: ${iuiErrorMessage(error)}` }],
      }
    }
  }

  // The Tool view is handed a `t` seat for the namespace declared at registration;
  // `IUI.localeT` is the same dictionary bound from the service, used only when a
  // host renders the row without that seat.
  const localeT = React.useMemo(() => {
    if (typeof toolviewT === 'function') return toolviewT
    return IUI.localeT !== null && typeof IUI.localeT === 'function' ? IUI.localeT : IUI_FALLBACK_T
  }, [toolviewT])

  const ref = React.useRef(null)
  if (ref.current === null) {
    ref.current = {
      callId,
      t: localeT,
      copied: false,
      timer: null,
      program: '',
      store: iuiCreateStore({}),
      renderer: null,
    }
  }
  ref.current.callId = callId
  ref.current.t = localeT

  const store = ref.current.store
  const [version, bump] = React.useState(0)

  React.useEffect(() => {
    const dispose = store.subscribe(() => bump(count => count + 1))
    if (IUI.stores !== null && typeof IUI.stores === 'object') IUI.stores[callId] = store
    return () => {
      dispose()
      if (IUI.stores !== null && IUI.stores[callId] === store) delete IUI.stores[callId]
    }
  }, [store, callId])
  React.useEffect(() => () => {
    if (ref.current !== null && ref.current.timer !== null) clearTimeout(ref.current.timer)
  }, [])

  const disclosure = typeof input.useDisclosure === 'function' ? input.useDisclosure() : null
  /** Flip the header's "Copied" affordance, claimed by `@CopyToClipboard` too. */
  const markCopied = () => {
    ref.current.copied = true
    if (ref.current.timer !== null) clearTimeout(ref.current.timer)
    ref.current.timer = setTimeout(() => {
      ref.current.timer = null
      ref.current.copied = false
      bump(count => count + 1)
    }, 1600)
    bump(count => count + 1)
  }
  const capabilities = {
    sessionId: input.sessionId,
    cwd: input.cwd,
    home: input.home,
    useDisclosure: input.useDisclosure,
    openFile: input.openFile,
    loadImage: input.loadImage,
    inspect: input.inspect,
    inputActions: input.inputActions,
    expanded: disclosure === null ? false : disclosure.expanded === true,
    onCopied: markCopied,
  }

  if (phase === 'preparing') return iuiSkeleton(localeT)

  const renderer = iuiCreateRenderer({
    store,
    t: localeT,
    callId,
    capabilities,
  })
  const previousProgram = ref.current.program
  ref.current.renderer = renderer
  ref.current.program = programText
  iuiResetDiagnostics()

  let content = []
  if (parsed === null) {
    content = [iuiErrorBox(localeT, [], localeT('error.empty'))]
  } else if (parsed.ok === false) {
    // A program that does not parse is shown with its diagnostics and nothing else:
    // evaluating a broken AST would only add duplicate noise.
    content = [iuiErrorBox(localeT, parsed.diagnostics, localeT('error.invalid'))]
  } else {
    const evaluated = iuiEvaluateProgram(parsed, store)
    // Only a NEW program adopts new defaults: a live row must keep the values the
    // user typed, and `syncDefaults` resets state when the declared set changes.
    if (previousProgram !== programText) store.syncDefaults(evaluated.stateDefaults)
    if (evaluated.root === null || evaluated.root === undefined) {
      content = [iuiErrorBox(
        localeT,
        [...(evaluated.diagnostics ?? []), ...(parsed.diagnostics ?? [])],
        parsed.rootName === null || parsed.rootName === undefined ? localeT('error.empty') : localeT('error.invalid'),
      )]
    } else {
      content = [renderer.emit(renderer.render(evaluated.root))]
    }
  }

  const title = headerTitle(block, localeT)
  const canInspect = typeof input.inspect === 'function'

  return h('div', { className: 'iui-root', 'data-iui-version': iuiVersion(), 'data-iui-phase': phase },
    h('style', { key: 'iui-style' }, typeof IUI_CSS === 'string' ? IUI_CSS : ''),
    h('div', { className: 'iui-header' },
      h('div', { className: 'iui-header-title', title }, title),
      h('div', { className: 'iui-header-actions' },
        h('button', {
          type: 'button',
          className: 'iui-action',
          key: 'copy',
          onClick: () => {
            iuiCopyText(ref.current.program)
            markCopied()
          },
        }, ref.current.copied ? localeT('row.copied') : localeT('row.copy')),
        canInspect ? h('button', {
          type: 'button',
          className: 'iui-action',
          key: 'inspect',
          onClick: () => {
            try {
              input.inspect()
            } catch {
              /* inspection is best-effort */
            }
          },
        }, localeT('row.inspect')) : null)),
    h('div', { className: 'iui-body', 'data-iui-version': version },
      h(IuiErrorBoundary, { title: localeT('error.title') }, ...content)))
}

/** Read the header title: the call's `title`, falling back to the tool label. */
function headerTitle(block, t) {
  const read = iuiReadCallArgs(block)
  return read.title !== '' ? read.title : t('row.title')
}

/**
 * Evaluate a parsed program against the row store, defensively.
 * @param {object} program - parsed program.
 * @param {object} store - row store (seeded by the previous pass, if any).
 * @returns {{ok: boolean, root: unknown, diagnostics: object[], stateDefaults: object}} evaluation.
 */
function iuiEvaluateProgram(program, store) {
  // Seed the state with every store value, including the defaults of the previous
  // pass: `$name = <expr>` defaults may reference other `$variables`, and the first
  // pass has no stored values yet. `evaluateProgram` seeds the rest from stateDefaults.
  const read = {}
  try {
    for (const name of Object.keys(store.defaults())) read[name] = store.get(name)
  } catch {
    /* an unreadable state degrades to empty state */
  }
  try {
    for (const name of Object.keys(store.snapshot())) read[name] = store.get(name)
  } catch {
    /* fall through with the defaults */
  }
  if (typeof evaluateProgram !== 'function') {
    return { ok: false, root: null, diagnostics: [{ severity: 'error', message: 'the language evaluator is not loaded' }], stateDefaults: {} }
  }
  try {
    return evaluateProgram(program, { state: read })
  } catch (error) {
    return {
      ok: false,
      root: null,
      diagnostics: [{ severity: 'error', message: `evaluation failed: ${iuiErrorMessage(error)}` }],
      stateDefaults: {},
    }
  }
}

/** Clipboard write used by the row header's Copy button. */
function iuiCopyText(text) {
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
      const pending = clipboard.writeText(text)
      if (pending !== undefined && typeof pending.catch === 'function') pending.catch(() => {})
      return
    }
    if (typeof document !== 'undefined' && document.body !== null) {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      if (typeof document.execCommand === 'function') document.execCommand('copy')
      document.body.removeChild(area)
    }
  } catch {
    /* clipboard access is best-effort */
  }
}
