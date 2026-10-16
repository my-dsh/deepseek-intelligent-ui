#!/usr/bin/env node
/**
 * Bundle probe: evaluate `client.js` outside a browser and assert that the artifact is
 * well-formed and complete.
 *
 * It answers questions a static read cannot: does the concatenated closure evaluate at all,
 * does the factory return the plugin Cordis expects, does `apply()` reach the
 * `tool.call.toolview` slot, and does the registered component/function set match the taught
 * signatures exactly (no name in the prompt without an implementation, and none the other
 * way round).
 *
 * Usage: node scripts/probe-client.mjs
 * Exit code 0 only when every assertion holds.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXPECTED_MODULE_ID = 'dsh-intelligent-ui'
const EXPECTED_SLOT = 'tool.call.toolview'
const EXPECTED_KEY = 'intelligent_ui'

const failures = []
/** Record one assertion outcome. */
function check(ok, label, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const noop = () => undefined

/* The smallest React the fragments touch at module-evaluation time. Rendering is not
 * exercised here; `chunk.test.mjs` and the live page cover that. */
const ReactShim = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'Fragment',
  Component: class { constructor(props) { this.props = props } setState() {} render() { return null } },
  useState: value => [typeof value === 'function' ? value() : value, noop],
  useEffect: noop,
  useLayoutEffect: noop,
  useRef: value => ({ current: value }),
  useMemo: factory => factory(),
  useCallback: fn => fn,
  useReducer: (_reducer, initial) => [initial, noop],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useContext: () => ({}),
  createContext: () => ({}),
  memo: component => component,
  forwardRef: component => component,
}

let handoff = null
const win = { __ModuleLoader__: { load: registration => { handoff = registration } } }
const requireFromPage = (spec) => {
  if (spec === 'react') return ReactShim
  throw new Error(`client.js required an unexpected module: ${spec}`)
}

const code = readFileSync(resolve(ROOT, 'client.js'), 'utf8')
new Function('window', 'require', code)(win, requireFromPage)

check(handoff !== null, 'client.js registers a __ModuleLoader__ handoff')
check(handoff?.id === EXPECTED_MODULE_ID, 'module id matches the package name', String(handoff?.id))

const plugin = handoff.factory(requireFromPage)
check(typeof plugin?.apply === 'function', 'factory returns a plugin with apply()')
check(JSON.stringify(plugin.inject) === JSON.stringify(['slots', 'locale']), 'plugin.inject declares slots + locale', JSON.stringify(plugin.inject))

const registrations = []
const ctx = {
  slots: {
    inject: (slot, factory) => registrations.push({ slot, result: factory() }),
    register: (options, component) => {
      registrations.push({ slot: 'register', key: options.key, component })
      return noop
    },
  },
  locale: { register: () => noop, bind: () => key => key },
  effect: (callback) => { const disposer = callback(); return typeof disposer === 'function' ? disposer : noop },
}
plugin.apply(ctx)

const view = registrations.find(entry => entry.slot === 'register' && entry.key === EXPECTED_KEY)
check(view !== undefined, `registers a toolview for key "${EXPECTED_KEY}"`)
check(registrations.some(entry => entry.slot === EXPECTED_SLOT), `injects into "${EXPECTED_SLOT}"`)
check(typeof view?.component === 'function' || (view?.component ?? null) !== null, 'toolview entry has a component')

const { COMPONENT_SIGNATURES, FUNCTION_SIGNATURES } = await import(
  new URL('../src/lang/index.js', import.meta.url).href
)
const debug = win.__DSH_INTELLIGENT_UI__ ?? {}
const registered = Object.keys(debug.components ?? {}).sort()
const taught = COMPONENT_SIGNATURES.map(signature => signature.name).sort()
const bundledFunctions = [...(debug.functions ?? [])].sort()
const taughtFunctions = FUNCTION_SIGNATURES.map(signature => signature.name).sort()

const missing = taught.filter(name => !registered.includes(name))
const extra = registered.filter(name => !taught.includes(name))
check(missing.length === 0, 'every taught component is implemented', missing.join(', '))
check(extra.length === 0, 'every implemented component is taught (no silent extras)', extra.join(', '))
console.log(`     components: ${registered.length} registered / ${taught.length} taught`)

const functionDrift = taughtFunctions.filter(name => !bundledFunctions.includes(name))
  .concat(bundledFunctions.filter(name => !taughtFunctions.includes(name)))
check(functionDrift.length === 0 && bundledFunctions.length > 0,
  'the bundled language core teaches the same @functions as the host', functionDrift.join(', '))
console.log(`     functions : ${bundledFunctions.length} bundled / ${taughtFunctions.length} taught`)

/* Prove the evaluator resolves every taught name: an unknown name is a diagnostic, so a
 * clean run over all of them means none is missing from the implementation map. */
const probeSource = ['root = Col([])', ...taughtFunctions.map((name, index) => `probe${index} = @${name}(null)`)].join('\n')
const parsedProbe = debug.parseProgram(probeSource)
const evaluatedProbe = debug.evaluateProgram(parsedProbe)
const unknown = evaluatedProbe.diagnostics.filter(diagnostic => /unknown function/i.test(diagnostic.message))
check(unknown.length === 0, 'every taught @function resolves in the evaluator',
  unknown.map(diagnostic => diagnostic.message).join(' | '))

check(typeof debug.parseProgram === 'function' && typeof debug.evaluateProgram === 'function',
  'diagnostic global exposes parseProgram + evaluateProgram')

console.log(failures.length === 0 ? '\nprobe-client: PASS' : `\nprobe-client: FAIL (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
