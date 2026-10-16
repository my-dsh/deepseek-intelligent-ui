/**
 * Per-row `$variable` store.
 *
 * One store instance belongs to one rendered Tool row (keyed by `callId`) and
 * survives re-renders for that call. Reads are reactive: `set` notifies every
 * subscriber and the row re-evaluates the program (docs/INTERFACES.md §6.3).
 *
 * The returned handle is exactly the §6.3 surface — `get`, `set`, `defaults`,
 * `reset`, `subscribe`, `size`. Lifetime is owned by the React row, which holds
 * it in a ref; `IUI.stores` is a debug index only, never a second owner.
 *
 * @module dsh-intelligent-ui/client/store
 */

/** Maximum state entries one store keeps from a runaway program. */
const IUI_STATE_LIMIT = 256

/**
 * Create one row's `$state` handle.
 *
 * @param {Record<string, unknown>} [defaults] - evaluated `$name = ...` defaults.
 * @returns {{get: (name: string) => unknown, set: (name: string, value: unknown) => void,
 *   defaults: () => Record<string, unknown>, reset: () => void,
 *   syncDefaults: (next: Record<string, unknown>) => void, subscribe: (listener: () => void) => () => void,
 *   size: number}} store handle.
 */
function iuiCreateStore(defaults) {
  /** @type {Record<string, unknown>} */
  let state = {}
  if (defaults !== null && typeof defaults === 'object') {
    for (const name of Object.keys(defaults)) {
      if (countKeys(state) >= IUI_STATE_LIMIT) break
      state[name] = defaults[name]
    }
  }
  let stored = Object.assign({}, state)
  let signature = Object.keys(stored).join('\u0000')
  /** @type {Set<() => void>} */
  const listeners = new Set()

  /** Notify subscribers; one throwing listener never blocks the others. */
  function notify() {
    const targets = Array.from(listeners)
    for (const listener of targets) {
      try {
        listener()
      } catch (error) {
        iuiReportDiagnostic('warning', `state listener failed: ${iuiErrorMessage(error)}`)
      }
    }
  }

  const handle = {
    get(name) {
      return state[String(name)]
    },
    set(name, value) {
      const key = String(name)
      if (state[key] === value) return
      if (state[key] === undefined && countKeys(state) >= IUI_STATE_LIMIT) return
      state[key] = value
      notify()
    },
    defaults() {
      return Object.assign({}, stored)
    },
    /** Shallow copy of the current values, including auto-created variables. */
    snapshot() {
      return Object.assign({}, state)
    },
    reset() {
      const next = Object.assign({}, stored)
      const changed = countKeys(state) !== countKeys(next)
        || Object.keys(next).some(name => state[name] !== next[name])
      state = next
      if (changed) notify()
    },
    /**
     * Adopt the defaults of a re-evaluated program. An unchanged declared set is
     * a no-op so user edits survive; a reshaped program resets instead, so stale
     * variables cannot leak between programs.
     */
    syncDefaults(next) {
      const source = next !== null && typeof next === 'object' ? next : {}
      const nextSignature = Object.keys(source).join('\u0000')
      if (nextSignature === signature) return
      /** @type {Record<string, unknown>} */
      const fresh = {}
      for (const name of Object.keys(source)) {
        if (countKeys(fresh) >= IUI_STATE_LIMIT) break
        fresh[name] = source[name]
      }
      stored = fresh
      signature = nextSignature
      state = Object.assign({}, fresh)
      notify()
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {}
      listeners.add(listener)
      let done = false
      return () => {
        if (done) return
        done = true
        listeners.delete(listener)
      }
    },
    get size() {
      return countKeys(state)
    },
  }
  return handle
}

/** Own-key count of a plain object. */
function countKeys(value) {
  return value === null || typeof value !== 'object' ? 0 : Object.keys(value).length
}

/** Human text for a thrown value; never throws itself. */
function iuiErrorMessage(error) {
  if (error === null || error === undefined) return 'unknown error'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message || error.name || 'Error'
  try {
    return String(error)
  } catch {
    return 'unknown error'
  }
}
