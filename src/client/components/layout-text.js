/**
 * Intelligent UI — Layout, Text and Drawing component groups (components-a).
 *
 * Contract: docs/INTERFACES.md §6.2 (ctx + IUI.util), §6.4 (names / args order / min),
 * §6.6 (locale keys — none of the frozen keys cover these components, so no ctx.t here) and
 * §7 (styling).
 *
 * The whole file is concatenated into the client factory closure that already holds
 * `React`, `h`, `IUI_CSS` and `IUI`. Everything above the final registration is a hoisted
 * `function` declaration, so the only thing that executes at module-evaluation time is the
 * single `iuiRegisterComponents({ ... })` call at the bottom.
 */

// --- ctx / IUI.util adapters -------------------------------------------------------------

/** `IUI.util.<name>` when the shell has defined it, otherwise `null`. */
function iuiLtU(name) {
  return IUI.util && typeof IUI.util[name] === 'function' ? IUI.util[name] : null
}

/** 4px step count (or CSS length string) -> px length, or undefined when absent. */
function iuiLtSpace(value) {
  if (value === undefined || value === null || value === '') return undefined
  const space = iuiLtU('space')
  return space ? space(value) : typeof value === 'number' ? value * 4 + 'px' : value
}

/** `sm|md|lg|xl|full` or number -> radius, or undefined when absent. */
function iuiLtRadius(value) {
  if (value === undefined || value === null || value === '') return undefined
  const radius = iuiLtU('radius')
  return radius ? radius(value) : typeof value === 'number' ? value + 'px' : value
}

/** Semantic colour name -> CSS custom property; other strings pass through unchanged. */
function iuiLtPaint(value, kind) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return value
  const color = iuiLtU('color')
  return color ? color(value, kind) : value
}

/** px number or CSS length string -> CSS length. */
function iuiLtSize(value) {
  if (value === undefined || value === null || value === '') return undefined
  return typeof value === 'number' ? value + 'px' : value
}

/** SVG coordinate/attribute value: numbers and strings are passed through by value. */
function iuiLtNum(value) {
  if (value === undefined || value === null || value === '') return undefined
  return value
}

/** `0..1` (or `0..100`) opacity -> SVG/CSS opacity. */
function iuiLtOpacity(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return value > 1 ? value / 100 : value
  return value
}

/** Human text for a primitive/array/object. */
function iuiLtString(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  const stringify = iuiLtU('stringify')
  if (stringify) return stringify(value)
  if (Array.isArray(value)) return value.map(iuiLtString).join(', ')
  return String(value)
}

/** Chat-language truthiness: `false`, `0`, `''`, `'false'`, `'none'`, `'no'`, `'off'` are false. */
function iuiLtTruthy(value) {
  if (value === undefined || value === null || value === false || value === 0 || value === '') return false
  const text = String(value).toLowerCase()
  return text !== 'false' && text !== 'none' && text !== 'no' && text !== 'off'
}

/** Stable React key from the render context. */
function iuiLtKey(ctx, prefix, index) {
  return ctx && typeof ctx.key === 'function' ? ctx.key(prefix, index) : prefix + '-' + index
}

/** Unwrap a binding descriptor; anything else passes through. */
function iuiLtValue(ctx, value) {
  return ctx && typeof ctx.value === 'function' ? ctx.value(value) : value
}

/** `render(props.children)` through the context convenience helper. */
function iuiLtChildren(ctx, props) {
  return ctx.children ? ctx.children(props, 'children') : ctx.render(props.children)
}

/** Lowercased value when it is in `allowed`, else `fallback`. */
function iuiLtOneOf(value, allowed, fallback) {
  const text = String(value === undefined || value === null ? '' : value).toLowerCase()
  return allowed.indexOf(text) === -1 ? fallback : text
}

// --- axis / box style helpers ------------------------------------------------------------

function iuiLtDirection(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const table = {
    row: 'row', horizontal: 'row', h: 'row', 'row-reverse': 'row-reverse',
    column: 'column', col: 'column', vertical: 'column', v: 'column', 'column-reverse': 'column-reverse',
  }
  return table[String(value).toLowerCase()] || String(value)
}

function iuiLtWrap(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const text = String(value).toLowerCase()
  if (value === false || text === 'false' || text === 'nowrap' || text === 'no' || text === 'none') return 'nowrap'
  return 'wrap'
}

function iuiLtAlign(value) {
  if (value === undefined || value === null || value === '') return undefined
  const table = {
    start: 'flex-start', left: 'flex-start', end: 'flex-end', right: 'flex-end',
    center: 'center', middle: 'center', stretch: 'stretch', baseline: 'baseline',
  }
  return table[String(value).toLowerCase()] || value
}

function iuiLtJustify(value) {
  if (value === undefined || value === null || value === '') return undefined
  const table = {
    start: 'flex-start', left: 'flex-start', end: 'flex-end', right: 'flex-end', center: 'center', middle: 'center',
    between: 'space-between', 'space-between': 'space-between',
    around: 'space-around', 'space-around': 'space-around',
    evenly: 'space-evenly', 'space-evenly': 'space-evenly',
  }
  return table[String(value).toLowerCase()] || value
}

function iuiLtTextAnchor(value) {
  if (value === undefined || value === null || value === '') return undefined
  const table = { start: 'start', left: 'start', middle: 'middle', center: 'middle', end: 'end', right: 'end' }
  return table[String(value).toLowerCase()] || value
}

/**
 * `border` is `boolean | number | string`:
 *   true         -> 1px solid border-l1
 *   number n     -> npx solid border-l1
 *   'none'       -> none
 *   'l1' / 'l2'  -> 1px solid border-l1 / border-l2
 *   other string -> passed through as a CSS border shorthand
 */
function iuiLtBorder(value) {
  if (value === undefined || value === null || value === false || value === '' || value === 'none') return undefined
  if (value === true) return '1px solid var(--dsw-alias-border-l1)'
  if (typeof value === 'number') return value + 'px solid var(--dsw-alias-border-l1)'
  const text = String(value)
  if (text === 'l1' || text === 'l2') return '1px solid var(--dsw-alias-border-' + text + ')'
  return text
}

function iuiLtFlex(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return String(value)
  if (value === true) return '1 1 auto'
  if (value === false) return '0 0 auto'
  return String(value)
}

// --- typography helpers ------------------------------------------------------------------

function iuiLtFontSize(value, table, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'number') return value + 'px'
  const text = String(value)
  const hit = table[text.toLowerCase()]
  return hit === undefined ? text : hit + 'px'
}

/** Body copy scale (host chat base is ~13px). */
function iuiLtTextSize(value) {
  return iuiLtFontSize(value, { xs: 11, sm: 12, md: 13, base: 13, lg: 15, xl: 17, '2xl': 21 }, undefined)
}

/** Heading scale. */
function iuiLtTitleSize(value) {
  return iuiLtFontSize(value, { xs: 13, sm: 15, md: 16, base: 16, lg: 18, xl: 22, '2xl': 26, '3xl': 30 }, '18px')
}

function iuiLtWeight(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return value
  const table = {
    light: 300, normal: 400, regular: 400, medium: 500,
    semibold: 600, 'semi-bold': 600, bold: 700, heavy: 800, black: 900,
  }
  const text = String(value).toLowerCase()
  return table[text] === undefined ? value : table[text]
}

// --- inline text (no HTML injection, ever) ----------------------------------------------

/**
 * Inline markup -> React nodes: `**bold**`, `*italic*`, `` `code` `` and `[label](url)`.
 * Unclosed markers stay literal text. `allowLinks === false` renders a link label as text so
 * anchors can never nest.
 */
function iuiLtInline(ctx, text, keyPrefix, allowLinks) {
  const source = iuiLtString(text)
  if (source === '') return []
  const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g
  const out = []
  let last = 0
  let match
  let index = 0
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > last) out.push(source.slice(last, match.index))
    const key = keyPrefix + '-' + index
    if (match[1] !== undefined) {
      out.push(h('strong', { key: key }, match[1]))
    } else if (match[2] !== undefined) {
      out.push(h('em', { key: key }, match[2]))
    } else if (match[3] !== undefined) {
      out.push(h('code', { key: key, className: 'iui-lt-inline-code' }, match[3]))
    } else if (allowLinks === false) {
      out.push(match[4])
    } else {
      out.push(iuiLtAnchor(match[4], match[5], key))
    }
    last = pattern.lastIndex
    index += 1
  }
  if (last < source.length) out.push(source.slice(last))
  return out
}

/** http(s)/mailto/tel/relative anchors only; everything else degrades to plain text. */
function iuiLtAnchor(label, url, key) {
  const href = typeof url === 'string' ? url.trim() : ''
  const safe = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href)
  if (!safe) return h('span', { key: key, className: 'iui-lt-link iui-lt-link--plain' }, label)
  return h('a', { key: key, className: 'iui-lt-link', href: href, target: '_blank', rel: 'noreferrer noopener' }, label)
}

/** A value rendered inside a text run: descriptor -> ctx.render, string -> inline markup. */
function iuiLtInlineItem(ctx, item, key) {
  const isElement = iuiLtU('isElement')
  const isBinding = iuiLtU('isBinding')
  if (isElement && isElement(item)) return h(React.Fragment, { key: key }, ctx.render(item))
  if (item !== null && typeof item === 'object' && isBinding && isBinding(item)) {
    const inner = item.value
    if (typeof inner === 'string') return h(React.Fragment, { key: key }, iuiLtInline(ctx, inner, key))
    return h(React.Fragment, { key: key }, iuiLtString(inner))
  }
  if (typeof item === 'string') return h(React.Fragment, { key: key }, iuiLtInline(ctx, item, key))
  return h(React.Fragment, { key: key }, iuiLtString(item))
}

/**
 * `text` may be a string, a component/binding descriptor, or an array mixing strings and
 * descriptors (docs/INTERFACES.md §6.5, task acceptance #3).
 */
function iuiLtTextBody(ctx, value, keyPrefix) {
  const isElement = iuiLtU('isElement')
  if (value === undefined || value === null || value === '') return null
  if (Array.isArray(value)) {
    return value.map((item, index) => iuiLtInlineItem(ctx, item, keyPrefix + '-' + index))
  }
  if (isElement && isElement(value)) return ctx.render(value)
  if (typeof value === 'string') return iuiLtInline(ctx, value, keyPrefix)
  return iuiLtString(value)
}

/** Same as above but every part is a plain string (used inside `<text>` and `<code>`). */
function iuiLtPlainText(ctx, value) {
  const resolved = iuiLtValue(ctx, value)
  if (Array.isArray(resolved)) return resolved.map(item => iuiLtString(iuiLtValue(ctx, item))).join(' ')
  return iuiLtString(resolved)
}

// --- List / ListItem internals -----------------------------------------------------------

/** `ListItem` descriptor args are positional: title, description, marker, children. */
function iuiLtIsDescriptor(value, name) {
  return value !== null && typeof value === 'object' && value.kind === 'element' && value.name === name
}

function iuiLtListItemParts(descriptor) {
  const args = Array.isArray(descriptor.args) ? descriptor.args : []
  return { title: args[0], description: args[1], marker: args[2], children: args[3] }
}

function iuiLtMarkerText(marker) {
  if (marker === undefined || marker === null) return ''
  if (typeof marker !== 'string') return marker === true ? 'bullet' : String(marker)
  return marker.trim()
}

/** Non-timeline marker-column content. */
function iuiLtMarkerNode(ctx, marker, index) {
  const text = iuiLtMarkerText(marker)
  if (text === '' || text === 'none' || text === 'false') return null
  if (text === true || text === 'bullet' || text === 'dot') {
    return h('span', { className: 'iui-lt-marker iui-lt-marker--bullet' }, '\u2022')
  }
  if (text === 'number' || text === 'ordered' || text === 'decimal') {
    return h('span', { className: 'iui-lt-marker iui-lt-marker--number' }, String(index + 1) + '.')
  }
  if (text === 'dash') return h('span', { className: 'iui-lt-marker iui-lt-marker--dash' }, '\u2013')
  if (text === 'check' || text === 'checkmark' || text === 'done') {
    return h('span', { className: 'iui-lt-marker iui-lt-marker--check' }, '\u2713')
  }
  return h('span', { className: 'iui-lt-marker iui-lt-marker--custom' }, iuiLtInline(ctx, text, 'mk' + index))
}

/** Timeline marker-column content: a dot, labelled when the marker asks for numbering. */
function iuiLtTimelineMarker(marker, index) {
  const text = iuiLtMarkerText(marker)
  const numbered = text === 'number' || text === 'ordered' || text === 'decimal'
  const checked = text === 'check' || text === 'checkmark' || text === 'done'
  const inner = numbered ? String(index + 1) : checked ? '\u2713' : null
  return h(
    'span',
    { className: 'iui-lt-marker iui-lt-marker--dot' + (inner === null ? '' : ' iui-lt-marker--dot-labeled') },
    inner,
  )
}

/** One row: optional marker column + title/description/children content column. */
function iuiLtListItemRow(ctx, parts, options) {
  const body = []
  const hasTitle = parts.title !== undefined && parts.title !== null && parts.title !== ''
  if (hasTitle) {
    body.push(h('div', { key: 'title', className: 'iui-lt-li__title' }, iuiLtTextBody(ctx, parts.title, 'li-title')))
  }
  const hasDescription = parts.description !== undefined && parts.description !== null && parts.description !== ''
  if (hasDescription) {
    body.push(h('div', { key: 'description', className: 'iui-lt-li__desc' }, iuiLtTextBody(ctx, parts.description, 'li-desc')))
  }
  const hasChildren = parts.children !== undefined && parts.children !== null && parts.children !== ''
  if (hasChildren) {
    body.push(h('div', { key: 'children', className: 'iui-lt-li__body' }, ctx.render(parts.children)))
  }
  const markerColumn = options.marker === null || options.marker === undefined
    ? null
    : h('div', { key: 'marker', className: 'iui-lt-li__marker', 'aria-hidden': 'true' }, options.marker)
  return h(
    'div',
    {
      className: 'iui-lt-li'
        + (options.timeline ? ' iui-lt-li--timeline' : '')
        + (options.last ? ' iui-lt-li--last' : ''),
      role: 'listitem',
    },
    [
      markerColumn,
      h('div', { key: 'content', className: 'iui-lt-li__content' }, body),
    ],
  )
}

// --- stateful views (hooks live in real components, so hook order is isolated) -----------

function IuiLtCarouselView(input) {
  const props = input.props
  const ctx = input.ctx
  const trackRef = React.useRef(null)
  const [active, setActive] = React.useState(0)
  const raw = props.children
  const count = Array.isArray(raw) ? raw.length : raw === undefined || raw === null ? 0 : 1
  const step = props.itemWidth === undefined ? undefined : iuiLtSize(props.itemWidth)

  const scrollToIndex = index => {
    const track = trackRef.current
    if (!track || track.children.length === 0) return
    const first = track.children[0]
    const clamped = Math.max(0, Math.min(index, track.children.length - 1))
    const offset = track.children[clamped].offsetLeft - first.offsetLeft
    if (typeof track.scrollTo === 'function') track.scrollTo({ left: offset, behavior: 'smooth' })
    else track.scrollLeft = offset
  }

  const onScroll = () => {
    const track = trackRef.current
    if (!track || track.children.length === 0) return
    const first = track.children[0]
    let best = 0
    let bestDistance = Infinity
    for (let i = 0; i < track.children.length; i += 1) {
      const distance = Math.abs(track.children[i].offsetLeft - first.offsetLeft - track.scrollLeft)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    setActive(previous => (previous === best ? previous : best))
  }

  const viewport = h(
    'div',
    {
      key: 'viewport',
      className: 'iui-lt-carousel__viewport',
      ref: trackRef,
      onScroll: onScroll,
      style: { gap: iuiLtSpace(props.gap) },
    },
    React.Children.map(iuiLtChildren(ctx, props), child => h(
      'div',
      { className: 'iui-lt-carousel__item', style: step === undefined ? undefined : { width: step } },
      child,
    )),
  )

  const sections = [viewport]
  if (count > 1) {
    const dots = []
    for (let i = 0; i < count; i += 1) {
      dots.push(h('button', {
        key: 'dot-' + i,
        type: 'button',
        className: 'iui-lt-carousel__dot',
        'data-active': i === active ? 'true' : 'false',
        'aria-label': String(i + 1),
        onClick: () => scrollToIndex(i),
      }))
    }
    sections.push(h('div', { key: 'nav', className: 'iui-lt-carousel__nav' }, [
      h('button', {
        key: 'previous',
        type: 'button',
        className: 'iui-lt-carousel__btn',
        'aria-label': 'Previous',
        disabled: active <= 0,
        onClick: () => scrollToIndex(active - 1),
      }, '\u2039'),
      h('div', { key: 'dots', className: 'iui-lt-carousel__dots' }, dots),
      h('button', {
        key: 'next',
        type: 'button',
        className: 'iui-lt-carousel__btn',
        'aria-label': 'Next',
        disabled: active >= count - 1,
        onClick: () => scrollToIndex(active + 1),
      }, '\u203a'),
    ]))
  }
  return h('div', { className: 'iui-lt-carousel' }, sections)
}

function IuiLtPopoverView(input) {
  const props = input.props
  const ctx = input.ctx
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef(null)

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const onPointerDown = event => {
      const root = rootRef.current
      if (root && !root.contains(event.target)) setOpen(false)
    }
    const onKeyDown = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = () => setOpen(value => !value)
  const onKeyDown = event => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      toggle()
    }
  }

  return h('span', { className: 'iui-lt-popover', ref: rootRef }, [
    h('span', {
      key: 'trigger',
      className: 'iui-lt-popover__trigger',
      role: 'button',
      tabIndex: 0,
      'aria-expanded': open ? 'true' : 'false',
      'aria-haspopup': 'true',
      onClick: toggle,
      onKeyDown: onKeyDown,
    }, ctx.render(props.trigger)),
    open
      ? h('div', { key: 'panel', className: 'iui-lt-popover__panel', role: 'dialog' }, ctx.render(props.content))
      : null,
  ])
}

/**
 * Copy text to the clipboard. Deliberately local rather than `ctx.dispatch` of
 * `@CopyToClipboard`: the renderer's action path runs the argument through
 * `IUI.util.stringify`, which truncates a string at 160 characters — useless for a code
 * block. Reported to the Lead; when the shell copies the raw string this can collapse into
 * a dispatch call.
 */
function iuiLtCopyText(text) {
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

/** `Code` with the copy button its prompt description promises. */
function IuiLtCodeView(input) {
  const props = input.props
  const ctx = input.ctx
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef(null)

  React.useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
  }, [])

  const language = iuiLtValue(ctx, props.language)
  const resolved = iuiLtValue(ctx, props.code)
  const isElement = iuiLtU('isElement')
  const body = isElement && isElement(resolved) ? ctx.render(resolved) : iuiLtPlainText(ctx, resolved)

  const copy = () => {
    iuiLtCopyText(isElement && isElement(resolved) ? iuiLtString(resolved) : iuiLtPlainText(ctx, resolved))
    setCopied(true)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setCopied(false)
    }, 1600)
  }

  return h('div', { className: 'iui-lt-code' }, [
    h('div', { key: 'head', className: 'iui-lt-code__head' }, [
      h('span', { key: 'language', className: 'iui-lt-code__lang' },
        language === undefined || language === null || language === '' ? '' : iuiLtString(language)),
      h('button', {
        key: 'copy',
        type: 'button',
        className: 'iui-lt-code__copy',
        onClick: copy,
      }, typeof ctx.t === 'function' ? ctx.t(copied ? 'row.copied' : 'row.copy') : 'Copy'),
    ]),
    h('pre', { key: 'pre', className: 'iui-lt-code__pre' },
      h('code', { className: 'iui-lt-code__body' }, body)),
  ])
}

// --- SVG paint helpers -------------------------------------------------------------------

/** `fill` default: outline shapes get `none` when a stroke was supplied. */
function iuiLtFill(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === false) return 'none'
  if (value === true) return fallback
  return iuiLtPaint(value)
}

function iuiLtStroke(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === false) return 'none'
  if (value === true) return 'currentColor'
  return iuiLtPaint(value)
}

/** `points` accepts "x,y x,y", `[[x, y], ...]`, `[{x, y}, ...]` or a flat number list. */
function iuiLtPoints(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return String(value)
  return value.map(point => {
    if (Array.isArray(point)) return point.slice(0, 2).map(iuiLtCoord).join(',')
    if (point !== null && typeof point === 'object') {
      const x = point.x !== undefined ? point.x : point[0]
      const y = point.y !== undefined ? point.y : point[1]
      return iuiLtCoord(x) + ',' + iuiLtCoord(y)
    }
    return iuiLtCoord(point)
  }).join(' ')
}

function iuiLtCoord(value) {
  return value === undefined || value === null ? '' : String(value)
}

// --- registry ----------------------------------------------------------------------------

/**
 * Forward the renderer's node key onto a component's root element.
 *
 * `30-render.js` puts the row's stable node key on `props.key` before calling
 * `entry.render(props, ctx)`, and the element a component returns is then placed into the
 * arrays built by `ctx.render`/`ctx.children`. Without that key React logs "each child in a
 * list should have a unique key" for every unkeyed root. Never invent a key here: when the
 * renderer supplied none, the element is returned untouched.
 */
function iuiLtWithKey(element, props) {
  if (element === null || element === undefined || typeof element !== 'object') return element
  const key = props === null || props === undefined ? undefined : props.key
  if (key === undefined || key === null) return element
  const valid = typeof React.isValidElement === 'function' && React.isValidElement(element)
  if (valid && (element.key === null || element.key === undefined)) {
    return React.cloneElement(element, { key: key })
  }
  return element
}

/** Every registered entry, with its root element carrying the renderer's node key. */
function iuiLtKeyedEntries(map) {
  const wrapped = {}
  for (const name of Object.keys(map)) {
    const entry = map[name]
    wrapped[name] = {
      args: entry.args,
      min: entry.min,
      render(props, ctx) {
        return iuiLtWithKey(entry.render(props, ctx), props)
      },
    }
  }
  return wrapped
}

iuiRegisterComponents(iuiLtKeyedEntries({
  // ----- Layout -------------------------------------------------------------------------
  Col: {
    args: ['children', 'gap', 'align'],
    min: 1,
    render(props, ctx) {
      return h('div', {
        className: 'iui-lt-col',
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: iuiLtSpace(props.gap),
          alignItems: iuiLtAlign(props.align),
        },
      }, iuiLtChildren(ctx, props))
    },
  },

  Row: {
    args: ['children', 'gap', 'align', 'justify', 'wrap'],
    min: 1,
    render(props, ctx) {
      return h('div', {
        className: 'iui-lt-row',
        style: {
          display: 'flex',
          flexDirection: 'row',
          flexWrap: iuiLtWrap(props.wrap, 'wrap'),
          gap: iuiLtSpace(props.gap),
          alignItems: iuiLtAlign(props.align) || 'center',
          justifyContent: iuiLtJustify(props.justify),
        },
      }, iuiLtChildren(ctx, props))
    },
  },

  Box: {
    args: ['children', 'direction', 'gap', 'padding', 'background', 'radius', 'border', 'width', 'height', 'flex', 'align', 'justify', 'wrap'],
    min: 0,
    render(props, ctx) {
      const radius = iuiLtRadius(props.radius)
      return h('div', {
        className: 'iui-lt-box',
        style: {
          display: 'flex',
          flexDirection: iuiLtDirection(props.direction, 'column'),
          flexWrap: iuiLtWrap(props.wrap, 'nowrap'),
          gap: iuiLtSpace(props.gap),
          padding: iuiLtSpace(props.padding),
          background: iuiLtPaint(props.background, 'bg'),
          borderRadius: radius,
          overflow: radius === undefined ? undefined : 'hidden',
          border: iuiLtBorder(props.border),
          width: iuiLtSize(props.width),
          height: iuiLtSize(props.height),
          flex: iuiLtFlex(props.flex),
          alignItems: iuiLtAlign(props.align),
          justifyContent: iuiLtJustify(props.justify),
        },
      }, iuiLtChildren(ctx, props))
    },
  },

  Grid: {
    args: ['children', 'columns', 'minChildWidth', 'gap'],
    min: 1,
    render(props, ctx) {
      let template
      const columns = iuiLtValue(ctx, props.columns)
      if (typeof columns === 'number' && columns > 0) {
        template = 'repeat(' + Math.max(1, Math.floor(columns)) + ', minmax(0, 1fr))'
      } else if (typeof columns === 'string' && columns.trim() !== '') {
        template = columns
      } else if (props.minChildWidth !== undefined && props.minChildWidth !== null && props.minChildWidth !== '') {
        // "minChildWidth drops columns when narrow"
        const minimum = iuiLtSize(iuiLtValue(ctx, props.minChildWidth)) || '160px'
        template = 'repeat(auto-fit, minmax(min(100%, ' + minimum + '), 1fr))'
      } else {
        // "Equal columns (2 by default)"
        template = 'repeat(2, minmax(0, 1fr))'
      }
      return h('div', {
        className: 'iui-lt-grid',
        style: { display: 'grid', gridTemplateColumns: template, gap: iuiLtSpace(props.gap) },
      }, iuiLtChildren(ctx, props))
    },
  },

  Card: {
    args: ['children', 'variant', 'padding', 'gap'],
    min: 1,
    render(props, ctx) {
      const variant = iuiLtOneOf(
        props.variant,
        ['default', 'soft', 'outlined', 'elevated', 'ghost', 'plain', 'subtle', 'brand', 'muted'],
        'default',
      )
      const padding = props.padding === undefined ? iuiLtSpace(4) : iuiLtSpace(props.padding)
      const gap = props.gap === undefined ? iuiLtSpace(2) : iuiLtSpace(props.gap)
      return h('div', {
        className: 'iui-lt-card iui-lt-card--' + variant,
        style: { display: 'flex', flexDirection: 'column', padding: padding, gap: gap },
      }, iuiLtChildren(ctx, props))
    },
  },

  Carousel: {
    args: ['children', 'itemWidth', 'gap'],
    min: 1,
    render(props, ctx) {
      return h(IuiLtCarouselView, { props: props, ctx: ctx })
    },
  },

  Popover: {
    args: ['trigger', 'content'],
    min: 2,
    render(props, ctx) {
      return h(IuiLtPopoverView, { props: props, ctx: ctx })
    },
  },

  Divider: {
    args: [],
    min: 0,
    render() {
      return h('div', { className: 'iui-lt-divider', role: 'separator', 'aria-orientation': 'horizontal' })
    },
  },

  Spacer: {
    args: [],
    min: 0,
    render() {
      return h('div', { className: 'iui-lt-spacer', 'aria-hidden': 'true' })
    },
  },

  // ----- Text (locale note: the frozen §6.6 key set has no layout/text key, so no ctx.t) --
  Title: {
    args: ['text', 'size', 'color'],
    min: 1,
    render(props, ctx) {
      return h('div', {
        className: 'iui-lt-title',
        style: {
          fontSize: iuiLtTitleSize(iuiLtValue(ctx, props.size)),
          color: iuiLtPaint(iuiLtValue(ctx, props.color)),
          fontWeight: 600,
          lineHeight: 1.35,
        },
      }, iuiLtTextBody(ctx, iuiLtValue(ctx, props.text), 'title'))
    },
  },

  Text: {
    args: ['text', 'size', 'color', 'weight', 'italic', 'lineThrough', 'tabularNums', 'maxLines'],
    min: 1,
    render(props, ctx) {
      const style = {
        fontSize: iuiLtTextSize(iuiLtValue(ctx, props.size)),
        color: iuiLtPaint(iuiLtValue(ctx, props.color)),
        fontWeight: iuiLtWeight(iuiLtValue(ctx, props.weight)),
        fontStyle: iuiLtTruthy(iuiLtValue(ctx, props.italic)) ? 'italic' : undefined,
        textDecoration: iuiLtTruthy(iuiLtValue(ctx, props.lineThrough)) ? 'line-through' : undefined,
        fontVariantNumeric: iuiLtTruthy(iuiLtValue(ctx, props.tabularNums)) ? 'tabular-nums' : undefined,
      }
      const rawLines = iuiLtValue(ctx, props.maxLines)
      const lines = typeof rawLines === 'number'
        ? Math.floor(rawLines)
        : typeof rawLines === 'string' && /^\d+$/.test(rawLines.trim()) ? Number(rawLines.trim()) : 0
      if (lines > 0) {
        style.display = '-webkit-box'
        style.WebkitLineClamp = String(lines)
        style.WebkitBoxOrient = 'vertical'
        style.overflow = 'hidden'
      }
      return h('div', { className: 'iui-lt-text', style: style }, iuiLtTextBody(ctx, iuiLtValue(ctx, props.text), 'text'))
    },
  },

  Caption: {
    args: ['text', 'color'],
    min: 1,
    render(props, ctx) {
      return h('div', {
        className: 'iui-lt-caption',
        style: { color: iuiLtPaint(iuiLtValue(ctx, props.color)) },
      }, iuiLtTextBody(ctx, iuiLtValue(ctx, props.text), 'caption'))
    },
  },

  Label: {
    args: ['text'],
    min: 1,
    render(props, ctx) {
      return h('div', { className: 'iui-lt-label' }, iuiLtTextBody(ctx, iuiLtValue(ctx, props.text), 'label'))
    },
  },

  Badge: {
    args: ['text', 'color'],
    min: 1,
    render(props, ctx) {
      const color = iuiLtValue(ctx, props.color)
      const style = {}
      if (color !== undefined && color !== null && color !== '') {
        style.color = iuiLtPaint(color)
        style.background = iuiLtPaint(color, 'bg')
      }
      return h('span', { className: 'iui-lt-badge', style: style }, iuiLtTextBody(ctx, iuiLtValue(ctx, props.text), 'badge'))
    },
  },

  Link: {
    args: ['text', 'url'],
    min: 2,
    render(props, ctx) {
      const label = iuiLtValue(ctx, props.text)
      const url = iuiLtValue(ctx, props.url)
      const text = typeof label === 'string' ? label : iuiLtString(label)
      return iuiLtAnchor(text, typeof url === 'string' ? url : '', props.key)
    },
  },

  List: {
    args: ['items', 'marker', 'timeline'],
    min: 1,
    render(props, ctx) {
      const resolved = iuiLtValue(ctx, props.items)
      const items = Array.isArray(resolved) ? resolved : resolved === undefined || resolved === null ? [] : [resolved]
      const timeline = iuiLtTruthy(iuiLtValue(ctx, props.timeline))
      const listMarker = props.marker === undefined ? 'bullet' : iuiLtValue(ctx, props.marker)
      const rows = items.map((item, index) => {
        const last = index === items.length - 1
        const key = iuiLtKey(ctx, 'list-item', index)
        if (iuiLtIsDescriptor(item, 'ListItem')) {
          const parts = iuiLtListItemParts(item)
          const marker = parts.marker === undefined ? listMarker : parts.marker
          const markerNode = timeline ? iuiLtTimelineMarker(marker, index) : iuiLtMarkerNode(ctx, marker, index)
          return h('div', { key: key, className: 'iui-lt-list__item' },
            iuiLtListItemRow(ctx, parts, { marker: markerNode, timeline: timeline, last: last }))
        }
        const isElement = iuiLtU('isElement')
        const parts = isElement && isElement(item) ? { children: item } : { title: item }
        const markerNode = timeline
          ? iuiLtTimelineMarker(listMarker, index)
          : iuiLtMarkerNode(ctx, listMarker, index)
        return h('div', { key: key, className: 'iui-lt-list__item' },
          iuiLtListItemRow(ctx, parts, { marker: markerNode, timeline: timeline, last: last }))
      })
      return h('div', {
        className: 'iui-lt-list' + (timeline ? ' iui-lt-list--timeline' : ''),
        role: 'list',
      }, rows)
    },
  },

  ListItem: {
    args: ['title', 'description', 'marker', 'children'],
    min: 1,
    render(props, ctx) {
      return iuiLtListItemRow(ctx, {
        title: props.title,
        description: props.description,
        marker: props.marker,
        children: props.children,
      }, {
        marker: iuiLtMarkerNode(ctx, props.marker, 0),
        timeline: false,
        last: false,
      })
    },
  },

  Quote: {
    args: ['text', 'cite'],
    min: 1,
    render(props, ctx) {
      const cite = iuiLtValue(ctx, props.cite)
      return h('blockquote', { className: 'iui-lt-quote' }, [
        h('div', { key: 'body', className: 'iui-lt-quote__body' }, iuiLtTextBody(ctx, iuiLtValue(ctx, props.text), 'quote')),
        cite === undefined || cite === null || cite === ''
          ? null
          : h('div', { key: 'cite', className: 'iui-lt-quote__cite' }, iuiLtTextBody(ctx, cite, 'quote-cite')),
      ])
    },
  },

  Code: {
    args: ['code', 'language'],
    min: 1,
    render(props, ctx) {
      return h(IuiLtCodeView, { props: props, ctx: ctx })
    },
  },

  // ----- Drawing ------------------------------------------------------------------------
  Svg: {
    args: ['children', 'viewBox', 'width', 'height'],
    min: 2,
    render(props, ctx) {
      const rawViewBox = iuiLtValue(ctx, props.viewBox)
      const viewBox = Array.isArray(rawViewBox) ? rawViewBox.join(' ') : iuiLtString(rawViewBox) || undefined
      const width = iuiLtSize(iuiLtValue(ctx, props.width)) || '100%'
      const height = iuiLtSize(iuiLtValue(ctx, props.height))
      return h('svg', {
        className: 'iui-lt-svg',
        viewBox: viewBox,
        width: width,
        height: height,
        preserveAspectRatio: 'xMidYMid meet',
        focusable: 'false',
        style: { width: width, height: height === undefined ? 'auto' : height, maxWidth: '100%', display: 'block' },
      }, iuiLtChildren(ctx, props))
    },
  },

  G: {
    args: ['children', 'transform', 'opacity'],
    min: 1,
    render(props, ctx) {
      const transform = iuiLtValue(ctx, props.transform)
      return h('g', {
        className: 'iui-lt-g',
        transform: transform === undefined || transform === null || transform === '' ? undefined : String(transform),
        opacity: iuiLtOpacity(iuiLtValue(ctx, props.opacity)),
      }, iuiLtChildren(ctx, props))
    },
  },

  Circle: {
    args: ['cx', 'cy', 'r', 'fill', 'stroke', 'strokeWidth', 'opacity'],
    min: 3,
    render(props, ctx) {
      const stroke = iuiLtValue(ctx, props.stroke)
      return h('circle', {
        className: 'iui-lt-shape',
        cx: iuiLtNum(iuiLtValue(ctx, props.cx)),
        cy: iuiLtNum(iuiLtValue(ctx, props.cy)),
        r: iuiLtNum(iuiLtValue(ctx, props.r)),
        fill: iuiLtFill(iuiLtValue(ctx, props.fill), stroke ? 'none' : 'currentColor'),
        stroke: iuiLtStroke(stroke),
        strokeWidth: iuiLtNum(iuiLtValue(ctx, props.strokeWidth)),
        opacity: iuiLtOpacity(iuiLtValue(ctx, props.opacity)),
      })
    },
  },

  Ellipse: {
    args: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'opacity'],
    min: 4,
    render(props, ctx) {
      const stroke = iuiLtValue(ctx, props.stroke)
      return h('ellipse', {
        className: 'iui-lt-shape',
        cx: iuiLtNum(iuiLtValue(ctx, props.cx)),
        cy: iuiLtNum(iuiLtValue(ctx, props.cy)),
        rx: iuiLtNum(iuiLtValue(ctx, props.rx)),
        ry: iuiLtNum(iuiLtValue(ctx, props.ry)),
        fill: iuiLtFill(iuiLtValue(ctx, props.fill), stroke ? 'none' : 'currentColor'),
        stroke: iuiLtStroke(stroke),
        strokeWidth: iuiLtNum(iuiLtValue(ctx, props.strokeWidth)),
        opacity: iuiLtOpacity(iuiLtValue(ctx, props.opacity)),
      })
    },
  },

  Rect: {
    args: ['x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'opacity', 'rx'],
    min: 4,
    render(props, ctx) {
      const stroke = iuiLtValue(ctx, props.stroke)
      return h('rect', {
        className: 'iui-lt-shape',
        x: iuiLtNum(iuiLtValue(ctx, props.x)),
        y: iuiLtNum(iuiLtValue(ctx, props.y)),
        width: iuiLtNum(iuiLtValue(ctx, props.width)),
        height: iuiLtNum(iuiLtValue(ctx, props.height)),
        rx: iuiLtNum(iuiLtValue(ctx, props.rx)),
        fill: iuiLtFill(iuiLtValue(ctx, props.fill), stroke ? 'none' : 'currentColor'),
        stroke: iuiLtStroke(stroke),
        strokeWidth: iuiLtNum(iuiLtValue(ctx, props.strokeWidth)),
        opacity: iuiLtOpacity(iuiLtValue(ctx, props.opacity)),
      })
    },
  },

  Line: {
    args: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'opacity'],
    min: 4,
    render(props, ctx) {
      return h('line', {
        className: 'iui-lt-shape',
        x1: iuiLtNum(iuiLtValue(ctx, props.x1)),
        y1: iuiLtNum(iuiLtValue(ctx, props.y1)),
        x2: iuiLtNum(iuiLtValue(ctx, props.x2)),
        y2: iuiLtNum(iuiLtValue(ctx, props.y2)),
        fill: 'none',
        stroke: iuiLtStroke(iuiLtValue(ctx, props.stroke), 'currentColor'),
        strokeWidth: iuiLtNum(iuiLtValue(ctx, props.strokeWidth)),
        strokeLinecap: 'round',
        opacity: iuiLtOpacity(iuiLtValue(ctx, props.opacity)),
      })
    },
  },

  Path: {
    args: ['d', 'fill', 'stroke', 'strokeWidth', 'opacity'],
    min: 1,
    render(props, ctx) {
      return h('path', {
        className: 'iui-lt-shape',
        d: iuiLtString(iuiLtValue(ctx, props.d)),
        fill: iuiLtFill(iuiLtValue(ctx, props.fill), 'none'),
        stroke: iuiLtStroke(iuiLtValue(ctx, props.stroke), 'currentColor'),
        strokeWidth: iuiLtNum(iuiLtValue(ctx, props.strokeWidth)),
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        opacity: iuiLtOpacity(iuiLtValue(ctx, props.opacity)),
      })
    },
  },

  Polyline: {
    args: ['points', 'stroke', 'strokeWidth', 'fill', 'opacity'],
    min: 1,
    render(props, ctx) {
      return h('polyline', {
        className: 'iui-lt-shape',
        points: iuiLtPoints(iuiLtValue(ctx, props.points)),
        fill: iuiLtFill(iuiLtValue(ctx, props.fill), 'none'),
        stroke: iuiLtStroke(iuiLtValue(ctx, props.stroke), 'currentColor'),
        strokeWidth: iuiLtNum(iuiLtValue(ctx, props.strokeWidth)),
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        opacity: iuiLtOpacity(iuiLtValue(ctx, props.opacity)),
      })
    },
  },

  Polygon: {
    args: ['points', 'fill', 'stroke', 'strokeWidth', 'opacity'],
    min: 1,
    render(props, ctx) {
      const stroke = iuiLtValue(ctx, props.stroke)
      return h('polygon', {
        className: 'iui-lt-shape',
        points: iuiLtPoints(iuiLtValue(ctx, props.points)),
        fill: iuiLtFill(iuiLtValue(ctx, props.fill), stroke ? 'none' : 'currentColor'),
        stroke: iuiLtStroke(stroke),
        strokeWidth: iuiLtNum(iuiLtValue(ctx, props.strokeWidth)),
        strokeLinejoin: 'round',
        opacity: iuiLtOpacity(iuiLtValue(ctx, props.opacity)),
      })
    },
  },

  SvgText: {
    args: ['text', 'x', 'y', 'size', 'fill', 'anchor', 'weight'],
    min: 3,
    render(props, ctx) {
      return h('text', {
        className: 'iui-lt-svg-text',
        x: iuiLtNum(iuiLtValue(ctx, props.x)),
        y: iuiLtNum(iuiLtValue(ctx, props.y)),
        fontSize: iuiLtNum(iuiLtValue(ctx, props.size)),
        fill: iuiLtFill(iuiLtValue(ctx, props.fill), 'currentColor'),
        textAnchor: iuiLtTextAnchor(iuiLtValue(ctx, props.anchor)),
        fontWeight: iuiLtWeight(iuiLtValue(ctx, props.weight)),
      }, iuiLtPlainText(ctx, props.text))
    },
  },
}))
