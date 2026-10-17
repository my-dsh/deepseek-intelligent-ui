/**
 * Debug surface for the running client artifact.
 *
 * Published as `window.__DSH_INTELLIGENT_UI__` (docs/INTERFACES.md §2, §9.5):
 * diagnostic counts and read-only entry points, never a mutation API. This
 * fragment runs last, so every name it reads is already initialized.
 *
 * @module @my-dsh/dsh-intelligent-ui/client/diagnostics
 */

/** Read-only view of the locale dictionaries registered by `90-apply.js`. */
function iuiLocaleDictionaries() {
  return { en, zh }
}

/** Count of registered components, grouped as a plain `{ name: true }` map copy. */
function iuiComponentNames() {
  const names = {}
  for (const name of Object.keys(IUI.components)) names[name] = true
  return names
}

/** Count of component names the lang core teaches; `-1` before the barrel loads. */
function iuiFunctionNames() {
  try {
    if (typeof FUNCTION_SIGNATURES !== 'undefined' && Array.isArray(FUNCTION_SIGNATURES)) {
      return FUNCTION_SIGNATURES.map(signature => signature && signature.name).filter(Boolean)
    }
  } catch {
    /* the language core may be absent in a partial build */
  }
  return []
}

/** Public diagnostic surface. */
const iuiDebug = {
  version: iuiVersion(),
  builtAt: iuiBuiltAt(),
  /** Names of every registered component. */
  get components() {
    return iuiComponentNames()
  },
  /** Names of every taught `@function`. */
  get functions() {
    return iuiFunctionNames()
  },
  /** Diagnostics recorded by the most recent render pass. */
  get diagnostics() {
    return IUI.diagnostics.slice()
  },
  /** Live `$state` stores, keyed by `callId` (diagnostic read only). */
  get stores() {
    return Object.keys(IUI.stores)
  },
  /** Locale dictionaries of the `intelligent-ui` namespace. */
  get locales() {
    return iuiLocaleDictionaries()
  },
  /** `parseProgram` from the language core, or `null` in a partial build. */
  parseProgram: typeof parseProgram === 'function' ? parseProgram : null,
  /** `evaluateProgram` from the language core, or `null` in a partial build. */
  evaluateProgram: typeof evaluateProgram === 'function' ? evaluateProgram : null,
  /** Component registry, read only. */
  get registry() {
    return IUI.components
  },
}

IUI.lang = {
  parseProgram: iuiDebug.parseProgram,
  evaluateProgram: iuiDebug.evaluateProgram,
  componentNames: iuiComponentNames,
  functionNames: iuiFunctionNames,
}

try {
  window.__DSH_INTELLIGENT_UI__ = iuiDebug
} catch {
  /* a windowless client host has nowhere to publish the debug surface */
}
