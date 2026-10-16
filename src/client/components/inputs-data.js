/**
 * components-b — Inputs, Media/data and Play component groups (19 components).
 *
 * This is one fragment of the Intelligent UI client closure: `React`, `h` and `IUI`
 * already exist in scope (docs/INTERFACES.md §4). Nothing executes at fragment-evaluation
 * time except the single `iuiRegisterComponents({...})` call at the bottom.
 *
 * Every top-level name is prefixed `iuiB` so it cannot collide with another fragment.
 *
 * Each component entry is wrapped by `iuiBHookHost`: the entry's `render(props, ctx)`
 * returns a real function-component element instead of calling hooks inside the row's own
 * render pass. Hooks therefore belong to the component instance, so a program whose tree
 * changes shape (@Each over a growing list, a conditional branch) cannot shift the row's
 * hook order. The host also guards its body so a component can never take the row down.
 */

// --- value helpers ------------------------------------------------------------------------

/** `ctx.render` with a null-safe argument (a component may be called with fewer args). */
function iuiBRender(ctx, value) {
  return ctx.render(value === undefined ? null : value)
}

/** Truthy coercion for JSON-ish values that may arrive as strings. */
function iuiBBool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback === undefined ? false : fallback
  if (typeof v === 'string') return v !== 'false' && v !== '0'
  return Boolean(v)
}

function iuiBNum(v, fallback) {
  const missing = fallback === undefined ? 0 : fallback
  if (typeof v === 'number') return Number.isFinite(v) ? v : missing
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return missing
}

/** Human text for a primitive; falls back to the shared stringifier. */
function iuiBText(v) {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return IUI.util.stringify(v)
}

/** Loose equality for option values (a program may bind a number to a string option). */
function iuiBSame(a, b) {
  if (a === b) return true
  if (a === undefined || a === null || b === undefined || b === null) return false
  return String(a) === String(b)
}

function iuiBSpace(v) {
  return v === undefined || v === null || v === '' ? undefined : IUI.util.space(v)
}

function iuiBRadius(v) {
  return v === undefined || v === null || v === '' ? undefined : IUI.util.radius(v)
}

function iuiBColor(v, kind) {
  return v === undefined || v === null || v === '' ? undefined : IUI.util.color(v, kind)
}

function iuiBPick(value, allowed, fallback) {
  const s = value === undefined || value === null ? '' : String(value).toLowerCase()
  return allowed.indexOf(s) === -1 ? fallback : s
}

/** Mark the row as owning live `$state` through the renderer's activation hook. */
function iuiBActivate(props) {
  if (props !== null && props !== undefined && typeof props.__iuiActivate === 'function') props.__iuiActivate()
}

/** Entries whose body reads/writes `$state` or dispatches an action. */
const IUI_B_STATEFUL = {
  Button: true,
  IconButton: true,
  Pressable: true,
  Input: true,
  TextArea: true,
  Select: true,
  SegmentedControl: true,
  Slider: true,
  Checkbox: true,
  RadioGroup: true,
  DatePicker: true,
  Timer: true,
}

/**
 * The one argument that must keep its raw binding descriptor, per component: the
 * two-way input slot (§5.3 — a `$name` in a direct component argument is a binding
 * descriptor, and only these slots are written back through `ctx.bind`).
 */
const IUI_B_BINDING_ARG = {
  Input: 'value',
  TextArea: 'value',
  Select: 'value',
  SegmentedControl: 'value',
  Slider: 'value',
  RadioGroup: 'value',
  DatePicker: 'value',
  Checkbox: 'checked',
  Timer: 'seconds',
}

/**
 * Unwrap every argument with `ctx.value` except the component's two-way input slot.
 *
 * A program may write `Chart("bar", $data, "month")` or `Icon($name)`: because a `$var`
 * in a direct component argument evaluates to a binding descriptor, an argument read
 * literally would otherwise see `{kind:'binding',...}` instead of its value.
 */
function iuiBUnwrapArgs(ctx, props, keep) {
  const out = {}
  for (const key of Object.keys(props)) {
    out[key] = key === keep ? props[key] : ctx.value(props[key])
  }
  return out
}

/**
 * Run a component body as its own function component so its hooks are instance-scoped.
 *
 * The renderer calls `entry.render(props, ctx)` during the row's own render pass, so a
 * hook called directly there would be attributed to the row: any change in the tree shape
 * (@Each over a growing list, a conditional branch) would then shift the row's hook order.
 * Returning a component element keeps each entry's hooks its own.
 *
 * The renderer also hands each entry a stable `props.key`; it is propagated onto the
 * returned element so list children stay keyed. A throw is logged and degraded to a small
 * inline notice, because the renderer's synchronous try/catch cannot see inside React's
 * render pass (the row's error boundary is the second line of defence).
 */
function iuiBHookHost(name, body) {
  function IuiBHost(hostProps) {
    const ctx = hostProps.ctx
    const props = iuiBUnwrapArgs(ctx, hostProps.props, IUI_B_BINDING_ARG[name])
    try {
      if (IUI_B_STATEFUL[name] === true) iuiBActivate(props)
      return body(props, ctx)
    } catch (error) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[intelligent-ui] ' + name + ' failed to render', error)
      }
      let text = 'Component error'
      try {
        text = ctx.t('error.invalid')
      } catch (ignored) {
        text = 'Component error'
      }
      return h('div', { className: 'iui-b-guard-error' }, text)
    }
  }
  return function (props, ctx) {
    return h(IuiBHost, {
      key: props === null || props === undefined ? undefined : props.key,
      props,
      ctx,
    })
  }
}

/**
 * The core two-way binding hook.
 *
 * Returns `[value, setValue, bound]`. When the first argument arrived as a binding
 * descriptor the value comes from `ctx.value` and writes go through `ctx.bind`; otherwise
 * the control keeps an internal value so it still renders and behaves without a `$var`
 * (it just cannot feed the program).
 */
function iuiBField(ctx, binding, literal) {
  const React = ctx.React
  const [local, setLocal] = React.useState(undefined)
  const bound = IUI.util.isBinding(binding)
  const value = bound ? ctx.value(binding) : (local === undefined ? literal : local)
  const setValue = next => {
    if (bound) ctx.bind(binding, next)
    else setLocal(next)
  }
  return [value, setValue, bound]
}

// --- icon set (inline SVG, lucide names) --------------------------------------------------

/** name -> list of drawing ops: ['path', d] | ['circle', cx, cy, r, fill?] | ['line', …] etc. */
const iuiBIcons = {
  'map-pin': [['path', 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z'], ['circle', 12, 10, 3]],
  'pin': [['path', 'M12 17v5'], ['path', 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z']],
  'clock': [['circle', 12, 12, 10], ['polyline', '12 6 12 12 16 14']],
  'star': [['polygon', '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2']],
  'check': [['path', 'M20 6 9 17l-5-5']],
  'check-circle': [['path', 'M22 11.08V12a10 10 0 1 1-5.93-9.14'], ['polyline', '22 4 12 14.01 9 11.01']],
  'x': [['path', 'M18 6 6 18'], ['path', 'm6 6 12 12']],
  'x-circle': [['circle', 12, 12, 10], ['path', 'm15 9-6 6'], ['path', 'm9 9 6 6']],
  'info': [['circle', 12, 12, 10], ['path', 'M12 16v-4'], ['path', 'M12 8h.01']],
  'alert-triangle': [['path', 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z'], ['path', 'M12 9v4'], ['path', 'M12 17h.01']],
  'alert-circle': [['circle', 12, 12, 10], ['path', 'M12 8v4'], ['path', 'M12 16h.01']],
  'calendar': [['rect', 3, 4, 18, 18, 2], ['line', 16, 2, 16, 6], ['line', 8, 2, 8, 6], ['line', 3, 10, 21, 10]],
  'users': [['path', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'], ['circle', 9, 7, 4], ['path', 'M22 21v-2a4 4 0 0 0-3-3.87'], ['path', 'M16 3.13a4 4 0 0 1 0 7.75']],
  'user': [['path', 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'], ['circle', 12, 7, 4]],
  'arrow-right': [['path', 'M5 12h14'], ['path', 'm12 5 7 7-7 7']],
  'arrow-left': [['path', 'M19 12H5'], ['path', 'm12 19-7-7 7-7']],
  'arrow-up': [['path', 'M12 19V5'], ['path', 'm5 12 7-7 7 7']],
  'arrow-down': [['path', 'M12 5v14'], ['path', 'm19 12-7 7-7-7']],
  'chevron-down': [['path', 'm6 9 6 6 6-6']],
  'chevron-up': [['path', 'm18 15-6-6-6 6']],
  'chevron-left': [['path', 'm15 18-6-6 6-6']],
  'chevron-right': [['path', 'm9 18 6-6-6-6']],
  'plus': [['path', 'M5 12h14'], ['path', 'M12 5v14']],
  'minus': [['path', 'M5 12h14']],
  'search': [['circle', 11, 11, 8], ['path', 'm21 21-4.3-4.3']],
  'sun': [['circle', 12, 12, 4], ['path', 'M12 2v2'], ['path', 'M12 20v2'], ['path', 'm4.93 4.93 1.41 1.41'], ['path', 'm17.66 17.66 1.41 1.41'], ['path', 'M2 12h2'], ['path', 'M20 12h2'], ['path', 'm6.34 17.66-1.41 1.41'], ['path', 'm19.07 4.93-1.41 1.41']],
  'moon': [['path', 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z']],
  'chart': [['path', 'M3 3v18h18'], ['path', 'M18 17V9'], ['path', 'M13 17V5'], ['path', 'M8 17v-3']],
  'trending-up': [['polyline', '22 7 13.5 15.5 8.5 10.5 2 17'], ['polyline', '16 7 22 7 22 13']],
  'trending-down': [['polyline', '22 17 13.5 8.5 8.5 13.5 2 7'], ['polyline', '16 17 22 17 22 11']],
  'activity': [['path', 'M22 12h-4l-3 9L9 3l-3 9H2']],
  'play': [['polygon', '6 3 20 12 6 21 6 3']],
  'pause': [['rect', 6, 4, 4, 16, 1], ['rect', 14, 4, 4, 16, 1]],
  'heart': [['path', 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z']],
  'settings': [['circle', 12, 12, 3], ['path', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z']],
  'bell': [['path', 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'], ['path', 'M10.3 21a1.94 1.94 0 0 0 3.4 0']],
  'download': [['path', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'], ['polyline', '7 10 12 15 17 10'], ['line', 12, 15, 12, 3]],
  'upload': [['path', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'], ['polyline', '17 8 12 3 7 8'], ['line', 12, 3, 12, 15]],
  'trash': [['path', 'M3 6h18'], ['path', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'], ['path', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2']],
  'edit': [['path', 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z']],
  'mail': [['rect', 2, 4, 20, 16, 2], ['path', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7']],
  'phone': [['path', 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z']],
  'home': [['path', 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'], ['polyline', '9 22 9 12 15 12 15 22']],
  'external-link': [['path', 'M15 3h6v6'], ['path', 'M10 14 21 3'], ['path', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6']],
  'refresh': [['path', 'M21 12a9 9 0 1 1-3-6.7L21 8'], ['path', 'M21 3v5h-5']],
  'filter': [['polygon', '22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3']],
  'lock': [['rect', 3, 11, 18, 11, 2], ['path', 'M7 11V7a5 5 0 0 1 10 0v4']],
  'unlock': [['rect', 3, 11, 18, 11, 2], ['path', 'M7 11V7a5 5 0 0 1 9.9-1']],
  'eye': [['path', 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z'], ['circle', 12, 12, 3]],
  'eye-off': [['path', 'M9.88 9.88a3 3 0 1 0 4.24 4.24'], ['path', 'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68'], ['path', 'M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61'], ['path', 'm2 2 20 20']],
  'file': [['path', 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'], ['polyline', '14 2 14 8 20 8']],
  'folder': [['path', 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z']],
  'globe': [['circle', 12, 12, 10], ['path', 'M2 12h20'], ['path', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z']],
  'zap': [['polygon', '13 2 3 14 12 14 11 22 21 10 12 10 13 2']],
  'sparkles': [['path', 'm12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z'], ['path', 'M5 3v4'], ['path', 'M3 5h4'], ['path', 'M19 17v4'], ['path', 'M17 19h4']],
  'target': [['circle', 12, 12, 10], ['circle', 12, 12, 6], ['circle', 12, 12, 2]],
  'award': [['circle', 12, 8, 6], ['path', 'M15.477 12.89 17 22l-5-3-5 3 1.523-9.11']],
  'book': [['path', 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20']],
  'briefcase': [['rect', 2, 7, 20, 14, 2], ['path', 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16']],
  'message': [['path', 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z']],
  'send': [['path', 'm22 2-7 20-4-9-9-4Z'], ['path', 'M22 2 11 13']],
  'share': [['circle', 18, 5, 3], ['circle', 6, 12, 3], ['circle', 18, 19, 3], ['line', 8.59, 13.51, 15.42, 17.49], ['line', 15.41, 6.51, 8.59, 10.49]],
  'copy': [['rect', 8, 8, 14, 14, 2], ['path', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2']],
  'link': [['path', 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'], ['path', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71']],
  'image': [['rect', 3, 3, 18, 18, 2], ['circle', 9, 9, 2], ['path', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21']],
  'music': [['path', 'M9 18V5l12-2v13'], ['circle', 6, 18, 3], ['circle', 18, 16, 3]],
  'video': [['path', 'm22 8-6 4 6 4V8Z'], ['rect', 2, 6, 14, 12, 2]],
  'wifi': [['path', 'M12 20h.01'], ['path', 'M2 8.82a15 15 0 0 1 20 0'], ['path', 'M5 12.859a10 10 0 0 1 14 0'], ['path', 'M8.5 16.429a5 5 0 0 1 7 0']],
  'database': [['ellipse', 12, 5, 9, 3], ['path', 'M3 5v14a9 3 0 0 0 18 0V5'], ['path', 'M3 12a9 3 0 0 0 18 0']],
  'code': [['polyline', '16 18 22 12 16 6'], ['polyline', '8 6 2 12 8 18']],
  'terminal': [['polyline', '4 17 10 11 4 5'], ['line', 12, 19, 20, 19]],
  'layers': [['path', 'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z'], ['path', 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65'], ['path', 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65']],
  'shield': [['path', 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z']],
  'key': [['circle', 7.5, 15.5, 5.5], ['path', 'm21 2-9.6 9.6'], ['path', 'm15.5 7.5 3 3L22 7l-3-3']],
  'tag': [['path', 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z'], ['circle', 7.5, 7.5, 1, 'currentColor']],
  'bookmark': [['path', 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z']],
  'flag': [['path', 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'], ['line', 4, 22, 4, 15]],
  'thumbs-up': [['path', 'M7 10v12'], ['path', 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z']],
  'credit-card': [['rect', 2, 5, 20, 14, 2], ['line', 2, 10, 22, 10]],
  'shopping-cart': [['circle', 8, 21, 1, 'currentColor'], ['circle', 19, 21, 1, 'currentColor'], ['path', 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12']],
  'map': [['path', 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z'], ['path', 'M15 5.764v15'], ['path', 'M9 3.236v15']],
  'navigation': [['polygon', '3 11 22 2 13 21 11 13 3 11']],
  'gift': [['rect', 3, 8, 18, 4, 1], ['path', 'M12 8v13'], ['path', 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7'], ['path', 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5']],
  'coffee': [['path', 'M10 2v2'], ['path', 'M14 2v2'], ['path', 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1'], ['path', 'M6 2v2']],
  'percent': [['line', 19, 5, 5, 19], ['circle', 6.5, 6.5, 2.5], ['circle', 17.5, 17.5, 2.5]],
  'smile': [['circle', 12, 12, 10], ['path', 'M8 14s1.5 2 4 2 4-2 4-2'], ['line', 9, 9, 9.01, 9], ['line', 15, 9, 15.01, 9]],
  'frown': [['circle', 12, 12, 10], ['path', 'M16 16s-1.5-2-4-2-4 2-4 2'], ['line', 9, 9, 9.01, 9], ['line', 15, 9, 15.01, 9]],
  'meh': [['circle', 12, 12, 10], ['line', 8, 15, 16, 15], ['line', 9, 9, 9.01, 9], ['line', 15, 9, 15.01, 9]],
  'loader': [['path', 'M12 2v4'], ['path', 'm16.2 7.8 2.9-2.9'], ['path', 'M18 12h4'], ['path', 'm16.2 16.2 2.9 2.9'], ['path', 'M12 18v4'], ['path', 'm4.9 19.1 2.9-2.9'], ['path', 'M2 12h4'], ['path', 'm4.9 4.9 2.9 2.9']],
  'more-horizontal': [['circle', 12, 12, 1, 'currentColor'], ['circle', 19, 12, 1, 'currentColor'], ['circle', 5, 12, 1, 'currentColor']],
  'maximize': [['path', 'M8 3H5a2 2 0 0 0-2 2v3'], ['path', 'M21 8V5a2 2 0 0 0-2-2h-3'], ['path', 'M3 16v3a2 2 0 0 0 2 2h3'], ['path', 'M16 21h3a2 2 0 0 0 2-2v-3']],
  'cloud': [['path', 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z']],
  'droplet': [['path', 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z']],
  'thermometer': [['path', 'M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z']],
  'anchor': [['circle', 12, 5, 3], ['line', 12, 22, 12, 8], ['path', 'M5 12H2a10 10 0 0 0 20 0h-3']],
  'compass': [['circle', 12, 12, 10], ['polygon', '16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76']],
  'book-open': [['path', 'M12 7v14'], ['path', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z']],
  'package': [['path', 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'], ['path', 'm3.3 7 8.7 5 8.7-5'], ['path', 'M12 22V12'], ['path', 'm7.5 4.27 9 5.15']],
  'sliders': [['line', 21, 4, 14, 4], ['line', 10, 4, 3, 4], ['line', 21, 12, 12, 12], ['line', 8, 12, 3, 12], ['line', 21, 20, 16, 20], ['line', 12, 20, 3, 20], ['line', 14, 2, 14, 6], ['line', 8, 10, 8, 14], ['line', 16, 18, 16, 22]],
  'toggle-left': [['rect', 1, 5, 22, 14, 7], ['circle', 8, 12, 3]],
  'hash': [['line', 4, 9, 20, 9], ['line', 4, 15, 20, 15], ['line', 10, 3, 8, 21], ['line', 16, 3, 14, 21]],
  'at-sign': [['circle', 12, 12, 4], ['path', 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8']],
  'smartphone': [['rect', 5, 2, 14, 20, 2], ['line', 12, 18, 12.01, 18]],
  'monitor': [['rect', 2, 3, 20, 14, 2], ['line', 8, 21, 16, 21], ['line', 12, 17, 12, 21]],
}

/** sm|md|lg|xl, a px number, or a numeric string -> px number for the svg box. */
function iuiBIconSize(size) {
  if (size === undefined || size === null || size === '') return 20
  if (typeof size === 'number') return Number.isFinite(size) && size > 0 ? size : 20
  const key = String(size).toLowerCase()
  if (key === 'sm') return 16
  if (key === 'md') return 20
  if (key === 'lg') return 24
  if (key === 'xl') return 32
  const n = Number(key)
  return Number.isFinite(n) && n > 0 ? n : 20
}

function iuiBIconOp(op, key) {
  const tag = op[0]
  if (tag === 'path') return h('path', { key, d: op[1] })
  if (tag === 'circle') return h('circle', { key, cx: op[1], cy: op[2], r: op[3], fill: op[4] || 'none' })
  if (tag === 'line') return h('line', { key, x1: op[1], y1: op[2], x2: op[3], y2: op[4] })
  if (tag === 'polyline') return h('polyline', { key, points: op[1] })
  if (tag === 'polygon') return h('polygon', { key, points: op[1] })
  if (tag === 'rect') return h('rect', { key, x: op[1], y: op[2], width: op[3], height: op[4], rx: op[5] })
  if (tag === 'ellipse') return h('ellipse', { key, cx: op[1], cy: op[2], rx: op[3], ry: op[4] })
  return null
}

/** Inline SVG for a lucide-style icon name; an unknown name becomes a small dot. */
function iuiBIconNode(name, size, color, className, key) {
  const lookup = name === undefined || name === null ? '' : String(name).toLowerCase()
  const spec = iuiBIcons[lookup] || null
  const attrs = {
    className: className || 'iui-icon',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }
  if (key !== undefined) attrs.key = key
  if (color) attrs.style = { color }
  const kids = spec
    ? spec.map((op, index) => iuiBIconOp(op, 'op' + index))
    : [h('circle', { key: 'dot', cx: 12, cy: 12, r: 3, fill: 'currentColor', stroke: 'none' })]
  return h('svg', attrs, kids)
}

/** Icon from an arg that may be a name string or absent. */
function iuiBMaybeIcon(v, size, color, className, key) {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'string' || typeof v === 'number') return iuiBIconNode(String(v), size, color, className, key)
  return null
}

// --- option normalisation (§6.5) ----------------------------------------------------------

/** string | {value,label,description?} -> [{value,label,description}] */
function iuiBOptions(raw) {
  const list = Array.isArray(raw) ? raw : (raw === undefined || raw === null ? [] : [raw])
  const out = []
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index]
    if (item !== null && typeof item === 'object' && !IUI.util.isElement(item)) {
      const value = item.value !== undefined ? item.value : (item.label !== undefined ? item.label : index)
      out.push({
        value,
        label: item.label !== undefined ? iuiBText(item.label) : iuiBText(value),
        description: item.description,
      })
    } else {
      out.push({ value: item, label: iuiBText(item), description: undefined })
    }
  }
  return out
}

function iuiBFindOption(options, value) {
  for (const option of options) {
    if (iuiBSame(option.value, value)) return option
  }
  return undefined
}

// --- small formatting helpers -------------------------------------------------------------

/** A table cell is a scalar unless it is an array or a plain object (descriptors included). */
function iuiBScalarCell(value) {
  return value === undefined
    || value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
}

/**
 * Re-chunk a flat list of scalar cells into rows of `columnCount`.
 *
 * `@Each(list, "x", [x.a, x.b])` concatenates its array templates with one level of
 * flattening (§5.3 — correct for children lists), so a table that reuses the same list
 * receives one flat array such as `["EU", 1, "US", 2]` rather than rows. Any non-scalar
 * item, a single column, an empty list, or a non-array `rows` keeps its own meaning.
 */
function iuiBShapeRows(rows, columnCount) {
  if (!Array.isArray(rows) || columnCount < 2 || rows.length === 0) return rows
  for (const cell of rows) {
    if (!iuiBScalarCell(cell)) return rows
  }
  const chunked = []
  for (let index = 0; index < rows.length; index += columnCount) {
    chunked.push(rows.slice(index, index + columnCount))
  }
  return chunked
}

/**
 * Stable, row-unique DOM id for a form control (`id` / `htmlFor` / `name` wiring).
 *
 * Built from the row's `callId` and the renderer's per-node key, so it is deterministic
 * across re-renders, unique per row instance, and free of randomness or drifting counters.
 */
function iuiBControlId(props, ctx, role) {
  const node = props !== null && props !== undefined && typeof props.key === 'string' ? props.key : ''
  const row = ctx.callId === undefined || ctx.callId === null ? '' : String(ctx.callId)
  const safe = ('iui-' + role + '-' + row + '-' + node)
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safe === '' ? 'iui-' + role : safe
}

/**
 * Accessible name for a control with no visible `<label>` element.
 *
 * Returns `undefined` when `label` already names the control (a visible label must never be
 * overridden), otherwise the placeholder, otherwise a generic role word.
 */
function iuiBControlName(label, placeholder, generic) {
  if (iuiBText(label) !== '') return undefined
  const text = iuiBText(placeholder)
  return text !== '' ? text : generic
}

function iuiBClock(total) {
  const seconds = Math.max(0, Math.round(iuiBNum(total, 0)))
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60
  return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss
}

function iuiBDecimal(step) {
  if (typeof step !== 'number' || !Number.isFinite(step) || step <= 0) return 0
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : Math.min(6, text.length - dot - 1)
}

function iuiBNumText(value, step) {
  const n = iuiBNum(value, 0)
  const decimals = iuiBDecimal(step)
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n * 1e6) / 1e6)
}

function iuiBTick(value, format, currency) {
  const n = iuiBNum(value, 0)
  const kind = format === undefined || format === null || format === '' ? 'number' : String(format)
  try {
    return IUI.util.formatNumber(n, kind, undefined, currency === null ? undefined : currency)
  } catch (error) {
    return String(n)
  }
}

function iuiBPercent(share) {
  try {
    return IUI.util.formatNumber(share, 'percent', 0)
  } catch (error) {
    return Math.round(share * 100) + '%'
  }
}

function iuiBShort(value, max) {
  const text = iuiBText(value)
  return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text
}

function iuiBAspect(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? String(value) : undefined
  const text = String(value)
  const match = /^\s*(\d+(?:\.\d+)?)\s*[:/xX]\s*(\d+(?:\.\d+)?)\s*$/.exec(text)
  return match ? match[1] + ' / ' + match[2] : text
}

function iuiBChartHeight(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.min(720, Math.max(120, value))
  if (typeof value === 'string') {
    const n = parseFloat(value)
    if (Number.isFinite(n) && n > 0) return Math.min(720, Math.max(120, n))
  }
  return 220
}

// --- chart geometry -----------------------------------------------------------------------

/** Nice round tick values covering [min, max]. */
function iuiBNiceTicks(min, max, count) {
  let lo = Number.isFinite(min) ? min : 0
  let hi = Number.isFinite(max) ? max : lo + 1
  if (hi === lo) hi = lo + 1
  const span = hi - lo
  const rawStep = span / Math.max(2, count)
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / magnitude
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(10)))
  return ticks
}

function iuiBArcPath(cx, cy, r, inner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  if (inner <= 0) {
    return 'M ' + cx + ' ' + cy + ' L ' + x0 + ' ' + y0 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 + ' Z'
  }
  const ix1 = cx + inner * Math.cos(a1)
  const iy1 = cy + inner * Math.sin(a1)
  const ix0 = cx + inner * Math.cos(a0)
  const iy0 = cy + inner * Math.sin(a0)
  return 'M ' + x0 + ' ' + y0 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
    ' L ' + ix1 + ' ' + iy1 + ' A ' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + ix0 + ' ' + iy0 + ' Z'
}

function iuiBSeriesClass(index) {
  return 'iui-chart-c' + (index % 6 + 1)
}

/** Legend row shared by every chart type. */
function iuiBChartLegend(items, ctx) {
  if (items.length === 0) return null
  return h('div', { key: 'legend', className: 'iui-chart-legend' }, items.map((item, index) => h('span', {
    key: ctx.key('legend', index),
    className: 'iui-chart-legend-item',
  }, [
    h('span', { key: 'swatch', className: 'iui-chart-swatch ' + item.className }),
    h('span', { key: 'label', className: 'iui-chart-legend-label' }, item.label),
    item.value === '' ? null : h('span', { key: 'value', className: 'iui-chart-legend-value' }, item.value),
  ])))
}

// --- the 19 components --------------------------------------------------------------------

iuiRegisterComponents({
  // ----- Inputs ---------------------------------------------------------------------------

  Button: {
    args: ['label', 'action', 'variant', 'color', 'size', 'icon', 'disabled', 'block'],
    min: 1,
    render: iuiBHookHost('Button', function (props, ctx) {
      const variant = iuiBPick(props.variant, ['primary', 'secondary', 'ghost', 'outline', 'danger'], 'primary')
      const size = iuiBPick(props.size, ['sm', 'md', 'lg'], 'md')
      const disabled = iuiBBool(ctx.value(props.disabled), false)
      const block = iuiBBool(ctx.value(props.block), false)
      const color = iuiBColor(props.color)
      // Filled variants carry their own contrast colour (`--dsw-alias-bg-base`),
      // so a `color` argument is ignored for the label and the icon: painting
      // them in a semantic colour such as "primary" would match the fill and
      // render invisible text.
      const labelColor = variant === 'primary' || variant === 'danger' ? undefined : color
      const classes = ['iui-btn', 'iui-btn-' + variant, 'iui-btn-' + size]
      if (block) classes.push('iui-btn-block')
      const attrs = {
        type: 'button',
        className: classes.join(' '),
        disabled,
        onClick: event => {
          if (event && event.preventDefault) event.preventDefault()
          if (props.action !== undefined && props.action !== null) ctx.dispatch(props.action)
        },
      }
      if (labelColor) attrs.style = { color: labelColor }
      const nodes = []
      const icon = iuiBMaybeIcon(props.icon, size === 'lg' ? 18 : 15, labelColor, 'iui-btn-icon', 'icon')
      if (icon) nodes.push(icon)
      nodes.push(h('span', { key: 'label', className: 'iui-btn-label' }, iuiBRender(ctx, props.label)))
      return h('button', attrs, nodes)
    }),
  },

  IconButton: {
    args: ['icon', 'action', 'label', 'variant'],
    min: 1,
    render: iuiBHookHost('IconButton', function (props, ctx) {
      const variant = iuiBPick(props.variant, ['primary', 'secondary', 'ghost', 'outline', 'danger'], 'ghost')
      const text = iuiBText(props.label)
      return h('button', {
        type: 'button',
        className: 'iui-icon-btn iui-icon-btn-' + variant,
        title: text === '' ? undefined : text,
        'aria-label': text === '' ? (iuiBText(props.icon) || 'button') : text,
        onClick: event => {
          if (event && event.preventDefault) event.preventDefault()
          if (props.action !== undefined && props.action !== null) ctx.dispatch(props.action)
        },
      }, iuiBMaybeIcon(props.icon, 18, undefined, 'iui-icon'))
    }),
  },

  Pressable: {
    args: ['children', 'action', 'selected', 'padding', 'background', 'radius'],
    min: 1,
    render: iuiBHookHost('Pressable', function (props, ctx) {
      const interactive = props.action !== undefined && props.action !== null
      const selected = iuiBBool(ctx.value(props.selected), false)
      const classes = ['iui-pressable']
      if (selected) classes.push('iui-is-selected')
      if (interactive) classes.push('iui-is-interactive')
      const attrs = {
        className: classes.join(' '),
        style: {
          padding: iuiBSpace(props.padding),
          background: iuiBColor(props.background, 'bg'),
          borderRadius: iuiBRadius(props.radius),
        },
      }
      if (interactive) {
        attrs.role = 'button'
        attrs.tabIndex = 0
        attrs['aria-pressed'] = selected
        attrs.onClick = event => {
          if (event && event.preventDefault) event.preventDefault()
          ctx.dispatch(props.action)
        }
        attrs.onKeyDown = event => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault()
            ctx.dispatch(props.action)
          }
        }
      }
      return h('div', attrs, ctx.children(props, 'children'))
    }),
  },

  Input: {
    args: ['value', 'label', 'type', 'placeholder'],
    min: 1,
    render: iuiBHookHost('Input', function (props, ctx) {
      const field = iuiBField(ctx, props.value, props.value)
      const type = iuiBPick(props.type, ['text', 'number', 'password', 'email', 'url', 'search', 'tel', 'date', 'time', 'color'], 'text')
      const raw = field[0]
      const id = iuiBControlId(props, ctx, 'input')
      const kids = [h('input', {
        key: 'input',
        id,
        name: id,
        className: 'iui-input',
        type,
        'aria-label': iuiBControlName(props.label, props.placeholder, 'Input'),
        value: raw === undefined || raw === null ? '' : String(raw),
        placeholder: props.placeholder === undefined || props.placeholder === null ? undefined : String(props.placeholder),
        onChange: event => {
          const next = event.target.value
          field[1](type === 'number' ? (next === '' ? '' : Number(next)) : next)
        },
      })]
      if (props.label !== undefined && props.label !== null) {
        kids.unshift(h('span', { key: 'label', className: 'iui-field-label' }, iuiBRender(ctx, props.label)))
      }
      return h('label', { className: 'iui-field', htmlFor: id }, kids)
    }),
  },

  TextArea: {
    args: ['value', 'label', 'placeholder', 'rows'],
    min: 1,
    render: iuiBHookHost('TextArea', function (props, ctx) {
      const field = iuiBField(ctx, props.value, props.value)
      const raw = field[0]
      const rows = iuiBNum(ctx.value(props.rows), 4)
      const id = iuiBControlId(props, ctx, 'textarea')
      const kids = [h('textarea', {
        key: 'textarea',
        id,
        name: id,
        className: 'iui-textarea',
        'aria-label': iuiBControlName(props.label, props.placeholder, 'Text'),
        value: raw === undefined || raw === null ? '' : String(raw),
        rows: rows > 0 ? Math.min(24, Math.round(rows)) : 4,
        placeholder: props.placeholder === undefined || props.placeholder === null ? undefined : String(props.placeholder),
        onChange: event => field[1](event.target.value),
      })]
      if (props.label !== undefined && props.label !== null) {
        kids.unshift(h('span', { key: 'label', className: 'iui-field-label' }, iuiBRender(ctx, props.label)))
      }
      return h('label', { className: 'iui-field', htmlFor: id }, kids)
    }),
  },

  Select: {
    args: ['value', 'options', 'label', 'placeholder'],
    min: 2,
    render: iuiBHookHost('Select', function (props, ctx) {
      const options = iuiBOptions(props.options)
      const field = iuiBField(ctx, props.value, props.value)
      const found = iuiBFindOption(options, field[0])
      const hasPlaceholder = props.placeholder !== undefined && props.placeholder !== null
      let current = ''
      if (found !== undefined) current = String(found.value)
      else if (!hasPlaceholder && options.length > 0) current = String(options[0].value)
      const items = []
      if (hasPlaceholder) {
        items.push(h('option', { key: 'ph', value: '', disabled: true, hidden: true }, iuiBText(props.placeholder)))
      }
      for (let index = 0; index < options.length; index += 1) {
        items.push(h('option', { key: ctx.key('opt', index), value: String(options[index].value) }, options[index].label))
      }
      const selectId = iuiBControlId(props, ctx, 'select')
      const select = h('select', {
        id: selectId,
        name: selectId,
        className: 'iui-select',
        'aria-label': iuiBControlName(props.label, props.placeholder, 'Select'),
        value: current,
        onChange: event => {
          const picked = iuiBFindOption(options, event.target.value)
          field[1](picked === undefined ? event.target.value : picked.value)
        },
      }, items)
      const rows = []
      if (props.label !== undefined && props.label !== null) {
        rows.push(h('span', { key: 'label', className: 'iui-field-label' }, iuiBRender(ctx, props.label)))
      }
      rows.push(h('span', { key: 'control', className: 'iui-select-wrap' }, select))
      if (found !== undefined && found.description !== undefined && found.description !== null) {
        rows.push(h('span', { key: 'hint', className: 'iui-field-hint' }, iuiBRender(ctx, found.description)))
      }
      return h('label', { className: 'iui-field', htmlFor: selectId }, rows)
    }),
  },

  SegmentedControl: {
    args: ['value', 'options', 'block'],
    min: 2,
    render: iuiBHookHost('SegmentedControl', function (props, ctx) {
      const options = iuiBOptions(props.options)
      const field = iuiBField(ctx, props.value, props.value)
      const block = iuiBBool(ctx.value(props.block), false)
      const classes = ['iui-segmented']
      if (block) classes.push('iui-segmented-block')
      const items = options.map((option, index) => {
        const active = iuiBSame(option.value, field[0])
        return h('button', {
          key: ctx.key('seg', index),
          type: 'button',
          role: 'radio',
          className: 'iui-segmented-item' + (active ? ' iui-is-active' : ''),
          'aria-checked': active,
          title: option.description === undefined || option.description === null ? undefined : iuiBText(option.description),
          onClick: () => field[1](option.value),
        }, h('span', { className: 'iui-segmented-label' }, option.label))
      })
      return h('div', {
        className: classes.join(' '),
        role: 'radiogroup',
        'aria-label': iuiBControlName(props.label, undefined, 'Options'),
      }, items)
    }),
  },

  Slider: {
    args: ['value', 'min', 'max', 'step', 'label', 'unit', 'marks'],
    min: 3,
    render: iuiBHookHost('Slider', function (props, ctx) {
      const min = iuiBNum(ctx.value(props.min), 0)
      const max = iuiBNum(ctx.value(props.max), 100)
      const step = props.step === undefined || props.step === null ? undefined : iuiBNum(props.step, 1)
      const unit = iuiBText(props.unit)
      const field = iuiBField(ctx, props.value, props.value)
      let current = iuiBNum(field[0], min)
      if (current < Math.min(min, max)) current = Math.min(min, max)
      if (current > Math.max(min, max)) current = Math.max(min, max)
      const marks = Array.isArray(props.marks) ? props.marks : []
      const span = max - min
      const sliderId = iuiBControlId(props, ctx, 'slider')
      const nodes = [h('div', { key: 'head', className: 'iui-slider-head' }, [
        h('label', { key: 'label', className: 'iui-field-label', htmlFor: sliderId }, iuiBRender(ctx, props.label)),
        h('span', { key: 'value', className: 'iui-slider-value' }, iuiBNumText(current, step) + (unit === '' ? '' : ' ' + unit)),
      ]), h('input', {
        key: 'input',
        id: sliderId,
        name: sliderId,
        className: 'iui-slider-input',
        type: 'range',
        'aria-label': iuiBControlName(props.label, undefined, 'Value'),
        'aria-valuetext': iuiBNumText(current, step) + (unit === '' ? '' : ' ' + unit),
        min,
        max,
        step: step === undefined || step <= 0 ? 'any' : step,
        value: current,
        onChange: event => field[1](Number(event.target.value)),
      })]
      if (marks.length > 0) {
        const items = marks.map((mark, index) => {
          const isObject = mark !== null && typeof mark === 'object' && !IUI.util.isElement(mark)
          const value = isObject ? iuiBNum(mark.value, min) : iuiBNum(mark, min)
          const label = isObject && mark.label !== undefined ? iuiBText(mark.label) : iuiBNumText(value, step)
          const percent = span === 0 ? 0 : ((value - min) / span) * 100
          return h('span', {
            key: ctx.key('mark', index),
            className: 'iui-slider-mark',
            style: { left: Math.max(0, Math.min(100, percent)) + '%' },
          }, label)
        })
        nodes.push(h('div', { key: 'marks', className: 'iui-slider-marks' }, items))
      }
      return h('div', { className: 'iui-slider' }, nodes)
    }),
  },

  Checkbox: {
    args: ['checked', 'label', 'lineThrough'],
    min: 2,
    render: iuiBHookHost('Checkbox', function (props, ctx) {
      const field = iuiBField(ctx, props.checked, props.checked)
      const checked = iuiBBool(field[0], false)
      const lineThrough = iuiBBool(ctx.value(props.lineThrough), false)
      const id = iuiBControlId(props, ctx, 'checkbox')
      return h('label', { className: 'iui-check', htmlFor: id }, [
        h('input', {
          key: 'box',
          id,
          name: id,
          className: 'iui-check-input',
          type: 'checkbox',
          'aria-label': iuiBControlName(props.label, undefined, 'Checkbox'),
          checked,
          onChange: event => field[1](event.target.checked),
        }),
        h('span', {
          key: 'label',
          className: 'iui-check-label' + (checked && lineThrough ? ' iui-is-done' : ''),
        }, iuiBRender(ctx, props.label)),
      ])
    }),
  },

  RadioGroup: {
    args: ['value', 'options', 'label', 'variant'],
    min: 2,
    render: iuiBHookHost('RadioGroup', function (props, ctx) {
      const options = iuiBOptions(props.options)
      const field = iuiBField(ctx, props.value, props.value)
      const cards = iuiBPick(props.variant, ['cards', 'card'], 'default') !== 'default'
      const groupId = iuiBControlId(props, ctx, 'radio')
      const items = options.map((option, index) => {
        const active = iuiBSame(option.value, field[0])
        const optionId = groupId + '-' + index
        const body = [h('span', { key: 'label', className: 'iui-radio-label' }, option.label)]
        if (option.description !== undefined && option.description !== null) {
          body.push(h('span', { key: 'desc', className: 'iui-radio-desc' }, iuiBRender(ctx, option.description)))
        }
        return h('label', {
          key: ctx.key('radio', index),
          htmlFor: optionId,
          className: 'iui-radio' + (cards ? ' iui-radio-card' : '') + (active ? ' iui-is-active' : ''),
        }, [h('input', {
          key: 'input',
          id: optionId,
          className: 'iui-radio-input',
          type: 'radio',
          name: groupId,
          checked: active,
          onChange: () => field[1](option.value),
        })].concat(body))
      })
      const nodes = []
      if (props.label !== undefined && props.label !== null) {
        nodes.push(h('span', { key: 'label', className: 'iui-field-label' }, iuiBRender(ctx, props.label)))
      }
      nodes.push(h('div', {
        key: 'items',
        className: 'iui-radio-group',
        role: 'radiogroup',
        'aria-label': iuiBControlName(props.label, undefined, 'Options'),
      }, items))
      return h('div', { className: 'iui-field' }, nodes)
    }),
  },

  DatePicker: {
    args: ['value', 'label', 'min', 'max'],
    min: 1,
    render: iuiBHookHost('DatePicker', function (props, ctx) {
      const field = iuiBField(ctx, props.value, props.value)
      const raw = field[0]
      const id = iuiBControlId(props, ctx, 'date')
      const kids = [h('input', {
        key: 'input',
        id,
        name: id,
        className: 'iui-input iui-input-date',
        type: 'date',
        'aria-label': iuiBControlName(props.label, undefined, 'Date'),
        value: raw === undefined || raw === null ? '' : String(raw),
        min: props.min === undefined || props.min === null ? undefined : String(props.min),
        max: props.max === undefined || props.max === null ? undefined : String(props.max),
        onChange: event => field[1](event.target.value),
      })]
      if (props.label !== undefined && props.label !== null) {
        kids.unshift(h('span', { key: 'label', className: 'iui-field-label' }, iuiBRender(ctx, props.label)))
      }
      return h('label', { className: 'iui-field', htmlFor: id }, kids)
    }),
  },

  Timer: {
    args: ['seconds', 'label'],
    min: 1,
    render: iuiBHookHost('Timer', function (props, ctx) {
      const React = ctx.React
      const bound = IUI.util.isBinding(props.seconds)
      const boundValue = bound ? ctx.value(props.seconds) : undefined
      const [local, setLocal] = React.useState(() => Math.max(0, iuiBNum(bound ? boundValue : props.seconds, 0)))
      const [running, setRunning] = React.useState(false)
      const initial = React.useRef(null)
      if (initial.current === null) initial.current = Math.max(0, iuiBNum(bound ? boundValue : local, 0))
      const remaining = Math.max(0, iuiBNum(bound ? boundValue : local, 0))
      const ctxRef = React.useRef(ctx)
      ctxRef.current = ctx
      const bindingRef = React.useRef(props.seconds)
      bindingRef.current = props.seconds
      const currentRef = React.useRef(remaining)
      currentRef.current = remaining
      React.useEffect(() => {
        if (!running) return undefined
        const id = setInterval(() => {
          const next = Math.max(0, currentRef.current - 1)
          currentRef.current = next
          const active = bindingRef.current
          if (IUI.util.isBinding(active)) ctxRef.current.bind(active, next)
          else setLocal(next)
          if (next <= 0) setRunning(false)
        }, 1000)
        return () => clearInterval(id)
      }, [running, bound])
      const toggle = () => {
        if (running) {
          setRunning(false)
          return
        }
        if (remaining <= 0) {
          const start = Math.max(0, iuiBNum(initial.current, 0))
          currentRef.current = start
          if (IUI.util.isBinding(props.seconds)) ctx.bind(props.seconds, start)
          else setLocal(start)
        }
        setRunning(true)
      }
      const reset = () => {
        setRunning(false)
        const start = Math.max(0, iuiBNum(initial.current, 0))
        currentRef.current = start
        if (IUI.util.isBinding(props.seconds)) ctx.bind(props.seconds, start)
        else setLocal(start)
      }
      const total = Math.max(1, iuiBNum(initial.current, remaining))
      const ratio = Math.max(0, Math.min(100, (remaining / total) * 100))
      const hasLabel = props.label !== undefined && props.label !== null
      const timerId = iuiBControlId(props, ctx, 'timer')
      const labelId = timerId + '-label'
      const head = []
      if (hasLabel) {
        head.push(h('span', { key: 'label', id: labelId, className: 'iui-timer-label' }, iuiBRender(ctx, props.label)))
      }
      head.push(h('span', { key: 'time', className: 'iui-timer-time', role: 'timer' }, iuiBClock(remaining)))
      return h('div', { className: 'iui-timer' + (running ? ' iui-is-running' : '') }, [
        h('div', { key: 'head', className: 'iui-timer-head' }, head),
        h('div', {
          key: 'bar',
          id: timerId,
          className: 'iui-timer-bar',
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': Math.round(ratio),
          'aria-valuetext': iuiBClock(remaining),
          'aria-labelledby': hasLabel ? labelId : undefined,
          'aria-label': iuiBControlName(props.label, undefined, 'Timer'),
        }, h('span', {
          className: 'iui-timer-fill',
          style: { width: ratio + '%' },
        })),
        h('div', { key: 'actions', className: 'iui-timer-actions' }, [
          h('button', {
            key: 'toggle',
            type: 'button',
            className: 'iui-btn iui-btn-secondary iui-btn-sm',
            onClick: toggle,
          }, running ? ctx.t('timer.pause') : ctx.t('timer.start')),
          h('button', {
            key: 'reset',
            type: 'button',
            className: 'iui-btn iui-btn-ghost iui-btn-sm',
            onClick: reset,
          }, ctx.t('timer.reset')),
        ]),
      ])
    }),
  },

  Form: {
    args: ['children'],
    min: 1,
    render: iuiBHookHost('Form', function (props, ctx) {
      return h('form', {
        className: 'iui-form',
        onSubmit: event => {
          if (event && event.preventDefault) event.preventDefault()
        },
      }, ctx.children(props, 'children'))
    }),
  },

  // ----- Media and data -------------------------------------------------------------------

  Image: {
    args: ['src', 'alt', 'aspectRatio', 'radius', 'fit'],
    min: 2,
    render: iuiBHookHost('Image', function (props, ctx) {
      const React = ctx.React
      const [failed, setFailed] = React.useState(false)
      const src = props.src === undefined || props.src === null ? '' : String(props.src)
      const previous = React.useRef(src)
      if (previous.current !== src) {
        previous.current = src
        if (failed) setFailed(false)
      }
      const fit = iuiBPick(props.fit, ['cover', 'contain', 'fill', 'none', 'scale-down'], 'cover')
      const ratio = iuiBAspect(props.aspectRatio)
      const boxClass = 'iui-image' + (ratio === undefined ? '' : ' iui-image-ratio')
      const wrapperStyle = {
        aspectRatio: ratio,
        borderRadius: iuiBRadius(props.radius),
      }
      if (src === '' || failed) {
        return h('div', { className: boxClass + ' iui-image-fallback', style: wrapperStyle }, [
          iuiBIconNode('image', 20, undefined, 'iui-icon', 'icon'),
          h('span', { key: 'text', className: 'iui-image-fallback-text' }, ctx.t('image.failed')),
        ])
      }
      return h('div', { className: boxClass, style: wrapperStyle }, h('img', {
        className: 'iui-image-el',
        src,
        alt: props.alt === undefined || props.alt === null ? '' : String(props.alt),
        loading: 'lazy',
        style: { objectFit: fit },
        onError: () => setFailed(true),
      }))
    }),
  },

  Icon: {
    args: ['name', 'size', 'color'],
    min: 1,
    render: iuiBHookHost('Icon', function (props, ctx) {
      const size = iuiBIconSize(ctx.value(props.size))
      const color = iuiBColor(props.color)
      const name = props.name === undefined || props.name === null ? '' : String(props.name)
      return iuiBIconNode(name, size, color, 'iui-icon')
    }),
  },

  Table: {
    args: ['columns', 'rows'],
    min: 2,
    render: iuiBHookHost('Table', function (props, ctx) {
      const rawColumns = Array.isArray(props.columns)
        ? props.columns
        : (props.columns === undefined || props.columns === null ? [] : [props.columns])
      const columns = rawColumns.map(column => {
        if (column !== null && typeof column === 'object' && !IUI.util.isElement(column)) {
          const key = column.key !== undefined ? column.key : (column.name !== undefined ? column.name : column.label)
          return { key, label: column.label !== undefined ? column.label : key }
        }
        return { key: column, label: column }
      })
      const rawRows = Array.isArray(props.rows)
        ? iuiBShapeRows(props.rows, columns.length)
        : (props.rows === undefined || props.rows === null ? [] : [props.rows])
      const head = h('thead', { key: 'head' }, h('tr', null, columns.map((column, index) => h('th', {
        key: ctx.key('th', index),
        className: 'iui-th',
        scope: 'col',
      }, iuiBRender(ctx, column.label)))))
      const body = h('tbody', { key: 'body' }, rawRows.map((row, rowIndex) => {
        let cells
        if (Array.isArray(row)) cells = row
        else if (row !== null && typeof row === 'object' && !IUI.util.isElement(row) && !IUI.util.isBinding(row)) {
          cells = columns.map(column => (column.key === undefined || column.key === null ? undefined : row[column.key]))
        } else {
          cells = [row]
        }
        return h('tr', { key: ctx.key('tr', rowIndex), className: 'iui-tr' }, cells.map((cell, cellIndex) => {
          const numeric = typeof cell === 'number' && Number.isFinite(cell)
          return h('td', {
            key: ctx.key('td', cellIndex),
            className: 'iui-td' + (numeric ? ' iui-td-num' : ''),
          }, numeric ? iuiBNumText(cell, undefined) : iuiBRender(ctx, cell))
        }))
      }))
      return h('div', { className: 'iui-table-wrap' }, h('table', { className: 'iui-table' }, [head, body]))
    }),
  },

  Chart: {
    args: ['type', 'data', 'x', 'series', 'format', 'currency', 'stacked', 'height'],
    min: 2,
    render: iuiBHookHost('Chart', function (props, ctx) {
      const empty = h('div', { className: 'iui-chart iui-chart-empty' }, h('span', {
        className: 'iui-chart-empty-text',
      }, ctx.t('chart.empty')))
      const type = iuiBPick(props.type, ['bar', 'line', 'area', 'pie', 'donut', 'scatter'], 'bar')
      const rows = Array.isArray(props.data)
        ? props.data.filter(row => row !== null && typeof row === 'object' && !Array.isArray(row))
        : []
      if (rows.length === 0) return empty
      const xKey = props.x === undefined || props.x === null ? null : String(props.x)
      const stacked = iuiBBool(ctx.value(props.stacked), false)
      const format = props.format === undefined || props.format === null ? null : String(props.format)
      const currency = props.currency === undefined || props.currency === null ? null : String(props.currency)
      const height = iuiBChartHeight(ctx.value(props.height))
      const hasSeries = props.series !== undefined && props.series !== null
      let keys = hasSeries
        ? (Array.isArray(props.series) ? props.series.map(String) : [String(props.series)])
        : Object.keys(rows[0]).filter(key => key !== xKey && typeof rows[0][key] === 'number')
      keys = keys.filter(key => rows.some(row => typeof row[key] === 'number' && Number.isFinite(row[key])))
      if (keys.length === 0) return empty
      const labelOf = (row, index) => {
        if (xKey !== null && row[xKey] !== undefined && row[xKey] !== null) return iuiBText(row[xKey])
        if (row.x !== undefined && row.x !== null) return iuiBText(row.x)
        return String(index + 1)
      }
      const width = 640
      const padLeft = 54
      const padRight = 16
      const padTop = 12
      const padBottom = 30
      const innerW = width - padLeft - padRight
      const innerH = Math.max(40, height - padTop - padBottom)
      const legendItems = []

      // pie / donut -----------------------------------------------------------------------
      if (type === 'pie' || type === 'donut') {
        const key = keys[0]
        const values = rows.map(row => Math.max(0, iuiBNum(row[key], 0)))
        const total = values.reduce((sum, value) => sum + value, 0)
        if (total <= 0) return empty
        const cx = width / 2
        const cy = height / 2
        const radius = Math.max(24, Math.min(innerW, innerH) / 2 - 4)
        const inner = type === 'donut' ? radius * 0.58 : 0
        const slices = []
        if (values.length === 1) {
          slices.push(h('circle', {
            key: 'slice0',
            className: 'iui-chart-slice iui-chart-c1',
            cx,
            cy,
            r: inner > 0 ? (radius + inner) / 2 : radius,
            fill: inner > 0 ? 'none' : 'currentColor',
            stroke: inner > 0 ? 'currentColor' : 'none',
            strokeWidth: inner > 0 ? radius - inner : 0,
          }))
        } else {
          let angle = -Math.PI / 2
          for (let index = 0; index < values.length; index += 1) {
            const next = angle + (values[index] / total) * Math.PI * 2
            slices.push(h('path', {
              key: ctx.key('slice', index),
              className: 'iui-chart-slice ' + iuiBSeriesClass(index),
              d: iuiBArcPath(cx, cy, radius, inner, angle, next),
            }))
            angle = next
          }
        }
        for (let index = 0; index < values.length; index += 1) {
          legendItems.push({
            className: iuiBSeriesClass(index),
            label: iuiBShort(labelOf(rows[index], index), 18),
            value: iuiBPercent(values[index] / total),
          })
        }
        return h('div', { className: 'iui-chart' }, [
          h('svg', {
            key: 'svg',
            className: 'iui-chart-svg',
            viewBox: '0 0 ' + width + ' ' + height,
            preserveAspectRatio: 'xMidYMid meet',
            'aria-hidden': 'true',
          }, slices),
          iuiBChartLegend(legendItems, ctx),
        ])
      }

      // cartesian --------------------------------------------------------------------------
      const matrix = keys.map(key => rows.map(row => iuiBNum(row[key], 0)))
      const columnTotals = rows.map(row => keys.reduce((sum, key) => sum + Math.max(0, iuiBNum(row[key], 0)), 0))
      const useStack = stacked && (type === 'bar' || type === 'area')
      let all = []
      if (useStack) all = columnTotals.slice()
      else for (const series of matrix) all = all.concat(series)
      if (all.length === 0) all = [0]
      let lo = Math.min.apply(null, all)
      let hi = Math.max.apply(null, all)
      if (!Number.isFinite(lo)) lo = 0
      if (!Number.isFinite(hi)) hi = 1
      if (lo > 0) lo = 0
      if (hi < 0) hi = 0
      const ticks = iuiBNiceTicks(lo, hi, 4)
      const yMin = Math.min(ticks[0], lo)
      const yMax = Math.max(ticks[ticks.length - 1], hi)
      const yOf = value => padTop + innerH - ((value - yMin) / (yMax - yMin)) * innerH
      const yZero = yOf(0)
      const numericX = type === 'scatter' && xKey !== null && rows.every(row => typeof row[xKey] === 'number')
      const xs = rows.map((row, index) => (numericX ? row[xKey] : index))
      const xLo = Math.min.apply(null, xs)
      const xHi = Math.max.apply(null, xs)
      const band = innerW / Math.max(1, rows.length)
      const xAt = index => (numericX
        ? padLeft + ((xs[index] - xLo) / ((xHi - xLo) || 1)) * innerW
        : padLeft + band * (index + 0.5))
      const shapes = []
      const grid = ticks.map((tick, index) => h('g', { key: ctx.key('grid', index) }, [
        h('line', { key: 'line', className: 'iui-chart-grid', x1: padLeft, y1: yOf(tick), x2: width - padRight, y2: yOf(tick) }),
        h('text', {
          key: 'label',
          className: 'iui-chart-tick',
          x: padLeft - 8,
          y: yOf(tick) + 4,
          textAnchor: 'end',
        }, iuiBTick(tick, format, currency)),
      ]))
      shapes.push(h('g', { key: 'grid' }, grid))

      if (type === 'bar') {
        const groupWidth = band * 0.68
        const barWidth = useStack ? groupWidth : Math.max(2, groupWidth / keys.length)
        const acc = rows.map(() => 0)
        keys.forEach((key, seriesIndex) => {
          rows.forEach((row, index) => {
            const value = iuiBNum(row[key], 0)
            let from = 0
            let to = value
            if (useStack) {
              from = acc[index]
              to = from + Math.max(0, value)
              acc[index] = to
            }
            const x = useStack ? xAt(index) - barWidth / 2 : xAt(index) - groupWidth / 2 + seriesIndex * barWidth
            const yTop = yOf(Math.max(from, to))
            const yBottom = yOf(Math.min(from, to))
            shapes.push(h('rect', {
              key: 'b' + seriesIndex + '-' + index,
              className: 'iui-chart-bar ' + iuiBSeriesClass(seriesIndex),
              x,
              y: yTop,
              width: barWidth,
              height: Math.max(1, yBottom - yTop),
              rx: 2,
            }))
          })
        })
      } else if (type === 'line' || type === 'area') {
        keys.forEach((key, seriesIndex) => {
          const acc = rows.map(() => 0)
          const points = rows.map((row, index) => {
            const value = iuiBNum(row[key], 0)
            let yValue = value
            if (useStack) {
              acc[index] += Math.max(0, value)
              yValue = acc[index]
            }
            return [xAt(index), yOf(yValue)]
          })
          const line = points.map(point => point[0].toFixed(1) + ' ' + point[1].toFixed(1)).join(' L ')
          if (type === 'area') {
            const first = points[0]
            const last = points[points.length - 1]
            shapes.push(h('path', {
              key: 'a' + seriesIndex,
              className: 'iui-chart-area ' + iuiBSeriesClass(seriesIndex),
              d: 'M ' + line + ' L ' + last[0].toFixed(1) + ' ' + yZero.toFixed(1) +
                ' L ' + first[0].toFixed(1) + ' ' + yZero.toFixed(1) + ' Z',
            }))
          }
          shapes.push(h('path', {
            key: 'l' + seriesIndex,
            className: 'iui-chart-line ' + iuiBSeriesClass(seriesIndex),
            d: 'M ' + line,
          }))
          if (points.length <= 24) {
            points.forEach((point, index) => shapes.push(h('circle', {
              key: 'd' + seriesIndex + '-' + index,
              className: 'iui-chart-dot ' + iuiBSeriesClass(seriesIndex),
              cx: point[0],
              cy: point[1],
              r: 2.4,
            })))
          }
        })
      } else {
        keys.forEach((key, seriesIndex) => {
          rows.forEach((row, index) => {
            shapes.push(h('circle', {
              key: 's' + seriesIndex + '-' + index,
              className: 'iui-chart-dot iui-chart-scatter ' + iuiBSeriesClass(seriesIndex),
              cx: xAt(index),
              cy: yOf(iuiBNum(row[key], 0)),
              r: 3.4,
            }))
          })
        })
      }

      const step = Math.max(1, Math.ceil(rows.length / 8))
      const xLabels = []
      for (let index = 0; index < rows.length; index += step) {
        xLabels.push(h('text', {
          key: ctx.key('x', index),
          className: 'iui-chart-tick',
          x: xAt(index),
          y: height - padBottom + 16,
          textAnchor: 'middle',
        }, iuiBShort(labelOf(rows[index], index), 10)))
      }
      shapes.push(h('g', { key: 'xaxis' }, xLabels))
      shapes.push(h('line', {
        key: 'baseline',
        className: 'iui-chart-axis-line',
        x1: padLeft,
        y1: yZero,
        x2: width - padRight,
        y2: yZero,
      }))
      for (let index = 0; index < keys.length; index += 1) {
        legendItems.push({ className: iuiBSeriesClass(index), label: iuiBShort(keys[index], 18), value: '' })
      }
      return h('div', { className: 'iui-chart' }, [
        h('svg', {
          key: 'svg',
          className: 'iui-chart-svg',
          viewBox: '0 0 ' + width + ' ' + height,
          preserveAspectRatio: 'xMidYMid meet',
          'aria-hidden': 'true',
        }, shapes),
        iuiBChartLegend(legendItems, ctx),
      ])
    }),
  },

  // ----- Play -----------------------------------------------------------------------------

  Flashcard: {
    args: ['front', 'back', 'hint'],
    min: 2,
    render: iuiBHookHost('Flashcard', function (props, ctx) {
      const React = ctx.React
      const [flipped, setFlipped] = React.useState(false)
      const flip = () => setFlipped(value => !value)
      const front = [h('div', { key: 'body', className: 'iui-flashcard-body' }, iuiBRender(ctx, props.front))]
      if (props.hint !== undefined && props.hint !== null) {
        front.push(h('div', { key: 'hint', className: 'iui-flashcard-hint' }, iuiBRender(ctx, props.hint)))
      }
      return h('div', {
        className: 'iui-flashcard' + (flipped ? ' iui-is-flipped' : ''),
        role: 'button',
        tabIndex: 0,
        'aria-pressed': flipped,
        onClick: flip,
        onKeyDown: event => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault()
            flip()
          }
        },
      }, h('div', { className: 'iui-flashcard-inner' }, [
        h('div', { key: 'front', className: 'iui-flashcard-face iui-flashcard-front' }, front),
        h('div', { key: 'back', className: 'iui-flashcard-face iui-flashcard-back' }, iuiBRender(ctx, props.back)),
      ]))
    }),
  },

  Celebration: {
    args: ['when'],
    min: 1,
    render: iuiBHookHost('Celebration', function (props, ctx) {
      const React = ctx.React
      const active = iuiBBool(ctx.value(props.when), false)
      const [burst, setBurst] = React.useState(0)
      const previous = React.useRef(false)
      React.useEffect(() => {
        if (active && !previous.current) setBurst(value => value + 1)
        previous.current = active
      }, [active])
      React.useEffect(() => {
        if (burst === 0) return undefined
        const id = setTimeout(() => setBurst(0), 1600)
        return () => clearTimeout(id)
      }, [burst])
      if (burst === 0) return h('div', { className: 'iui-celebration', 'aria-hidden': 'true' })
      const pieces = []
      for (let index = 0; index < 24; index += 1) {
        pieces.push(h('span', {
          key: 'p' + index,
          className: 'iui-confetti-piece ' + iuiBSeriesClass(index),
          style: {
            left: (index * 4.1 + 2) + '%',
            animationDelay: ((index % 8) * 55) + 'ms',
          },
        }))
      }
      return h('div', { className: 'iui-celebration iui-is-bursting', 'aria-hidden': 'true' },
        h('div', { className: 'iui-confetti' }, pieces))
    }),
  },
})
