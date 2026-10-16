/**
 * Client activation: locale dictionary + the keyed `tool.call.toolview` entry.
 *
 * `IUI.inject` (`00-namespace.js`) guarantees the `slots` and `locale` services
 * exist before this runs; the build emits `apply: ctx => IUI.apply(ctx)` from the
 * frozen `IUI.apply` slot. Both registrations are effects, so unloading the
 * plugin removes them (docs/INTERFACES.md §4, §6.6).
 *
 * @module dsh-intelligent-ui/client/apply
 */

/** Locale namespace of the row's copy (docs/INTERFACES.md §2). */
const IUI_LOCALE_NS = 'intelligent-ui'

/** Wire tool name; must equal the `tool.call.toolview` dispatch key. */
const IUI_TOOL_VIEW_KEY = 'intelligent_ui'

/**
 * Register the locale dictionary and the Tool row.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - client context.
 * @returns {void}
 */
function iuiApply(ctx) {
  if (ctx === null || ctx === undefined) return
  ctx.effect(() => ctx.locale.register(IUI_LOCALE_NS, { en, zh }), 'intelligent-ui: dictionaries')
  IUI.localeT = typeof ctx.locale.bind === 'function' ? ctx.locale.bind(IUI_LOCALE_NS) : null
  ctx.slots.inject('tool.call.toolview', () => {
    // `inject` re-runs its callback whenever the owning declaration collapses and
    // returns, so a stale entry from a previous window is released first.
    if (typeof IUI.releaseToolview === 'function') IUI.releaseToolview()
    const dispose = ctx.slots.register({
      name: 'tool.call.toolview',
      key: IUI_TOOL_VIEW_KEY,
      locale: IUI_LOCALE_NS,
    }, Row)
    IUI.releaseToolview = () => {
      IUI.releaseToolview = null
      if (typeof dispose === 'function') dispose()
    }
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  })
}

IUI.apply = iuiApply
