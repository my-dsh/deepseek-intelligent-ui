/**
 * Barrel for the language core. The host half imports only from here; the browser build
 * excludes this file and concatenates the other `src/lang/*.js` modules instead.
 *
 * @module src/lang
 */

export { parseProgram } from './parse.js'
export { evaluateProgram } from './evaluate.js'
export { FUNCTIONS, callFunction } from './functions.js'
export { COMPONENT_SIGNATURES, FUNCTION_SIGNATURES } from './signatures.js'
export { systemPromptSectionText, EXAMPLES } from './spec.js'
