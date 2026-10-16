// Raw-evidence generator for docs/VERIFICATION.md (not a test file).
//   node test/e2e/report.mjs            -> JSON summary on stdout, exit 0
//   node test/e2e/report.mjs            -> exit 2 with a JSON reason while src/lang is absent
// Prints parse/eval diagnostics for every fixture so the verification log can quote it.
import { fileURLToPath } from 'node:url'
import {
  LANG_ENTRY,
  collectCalls,
  describeDiagnostics,
  errorCount,
  expectSync,
  isElementDescriptor,
  loadLang,
  programFiles,
  readProgram,
} from './lib.mjs'

async function main() {
  const { lang, block } = await loadLang()
  if (!lang) {
    process.stdout.write(JSON.stringify({ blocked: true, reason: block, langEntry: LANG_ENTRY }, null, 2) + '\n')
    process.exitCode = 2
    return
  }

  const report = {
    generatedAt: new Date().toISOString(),
    langEntry: LANG_ENTRY,
    componentSignatures: lang.COMPONENT_SIGNATURES.length,
    functionSignatures: lang.FUNCTION_SIGNATURES.length,
    functionTableNames: Object.keys(lang.FUNCTIONS).length,
    programs: [],
  }

  for (const file of programFiles()) {
    const { text, bytes } = readProgram(file)
    const parse = expectSync(lang.parseProgram(text), `parseProgram(${file})`)
    const evaluate = expectSync(lang.evaluateProgram(parse), `evaluateProgram(${file})`)
    const calls = collectCalls(parse)
    report.programs.push({
      file,
      bytes,
      parseOk: parse.ok,
      rootName: parse.rootName,
      statements: parse.statements.length,
      parseErrors: errorCount(parse.diagnostics),
      parseDiagnostics: describeDiagnostics(parse.diagnostics),
      evalOk: evaluate.ok,
      evalDiagnostics: describeDiagnostics(evaluate.diagnostics),
      rootIsElementDescriptor: isElementDescriptor(evaluate.root),
      stateDefaults: Object.keys(evaluate.stateDefaults ?? {}),
      callNames: [...new Set(calls.map((c) => c.bare))].sort(),
    })
  }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
