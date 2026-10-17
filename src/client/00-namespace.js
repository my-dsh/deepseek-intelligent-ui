/**
 * The Intelligent UI client namespace.
 *
 * This fragment runs first among the `src/client` fragments, so every name and
 * every `IUI` property it creates exists before any later fragment evaluates.
 * Nothing here may read a `const` from another fragment: only declarations this
 * file makes are safe to touch at evaluation time (docs/INTERFACES.md §4).
 *
 * @module @my-dsh/dsh-intelligent-ui/client/namespace
 */

/** Plugin service dependencies; the build emits `return { inject: IUI.inject, ... }`. */
const IUI = {
  /** Services this client half needs before `apply` runs. */
  inject: ['slots', 'locale'],
  /** Set by `90-apply.js`; the build returns `apply: ctx => IUI.apply(ctx)`. */
  apply: null,
  /** Helpers every component may use (docs/INTERFACES.md §6.2). */
  util: {},
  /** Component entries keyed by component name, filled by `iuiRegisterComponents`. */
  components: {},
  /** Per-row live `$state` stores keyed by `callId`, for diagnostics only. */
  stores: {},
  /** Diagnostics of the most recent render (capped); diagnostics never throw. */
  diagnostics: [],
  /** Translate seat bound by `90-apply.js`; `null` until `apply` runs. */
  localeT: null,
  /** Set by `90-apply.js` so a re-injected toolview can release the previous one. */
  releaseToolview: null,
  /** Namespaces of the lang core, published by `99-diagnostics.js`. */
  lang: null,
  /** Build stamp injected by `scripts/build-client.mjs`. */
  version: '1.0.0',
  builtAt: '',
}

/** Maximum recorded diagnostics in {@link IUI.diagnostics}. */
const IUI_MAX_DIAGNOSTICS = 64

/** Build stamp, tolerant of a build without the injected `IUI_BUILD`. */
function iuiBuildInfo() {
  if (typeof IUI_BUILD === 'undefined' || IUI_BUILD === null) return { version: '1.0.0', builtAt: '', fragments: [] }
  return IUI_BUILD
}

/** Version string of the running client artifact. */
function iuiVersion() {
  const build = iuiBuildInfo()
  return typeof build.version === 'string' && build.version !== '' ? build.version : '1.0.0'
}

/** ISO timestamp of the build that produced the running client artifact. */
function iuiBuiltAt() {
  const build = iuiBuildInfo()
  return typeof build.builtAt === 'string' ? build.builtAt : ''
}

/**
 * Register component implementations against the client namespace.
 * Called at module-evaluation time by `src/client/components/**` fragments.
 *
 * @param {object} map - component entries keyed by component name.
 * @returns {void}
 */
function iuiRegisterComponents(map) {
  if (map === null || typeof map !== 'object') return
  for (const name of Object.keys(map)) {
    const entry = map[name]
    if (entry === null || typeof entry !== 'object') continue
    IUI.components[name] = entry
  }
}

/**
 * Record one diagnostic for the current render pass and for the debug global.
 * Never throws, never grows without bound.
 *
 * @param {'error'|'warning'} severity - diagnostic severity.
 * @param {string} message - human-readable message.
 * @param {number} [line] - source line, when known.
 * @returns {void}
 */
function iuiReportDiagnostic(severity, message, line) {
  const diagnostic = { severity: severity === 'error' ? 'error' : 'warning', message: String(message) }
  if (Number.isFinite(line) && line > 0) diagnostic.line = line
  if (IUI.diagnostics.length < IUI_MAX_DIAGNOSTICS) IUI.diagnostics.push(diagnostic)
  try {
    console.warn('[intelligent-ui]', diagnostic.severity, diagnostic.line ? `line ${diagnostic.line}:` : '', diagnostic.message)
  } catch {
    /* a console that throws must not break rendering */
  }
}

/** Clear the per-render diagnostic buffer. */
function iuiResetDiagnostics() {
  IUI.diagnostics = []
}
