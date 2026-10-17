# Intelligent UI — independent verification log

Verifier: the `verifier` teammate. I authored none of the files under `src/**`, `index.js`,
`client.js`, `package.json`, `cordis.patch.yml`, `locale/**`; my write scope is
`test/programs/**`, `test/e2e/**`, and this file. No implementation file was edited to make a
test pass. Harness-side mistakes found during the work are recorded in §6 rather than hidden.

Authority for every expectation: `docs/INTERFACES.md` (frozen v1), read in full before any
test was written. Where the document defers ("argument order as in the reference spec") the
reference is `/tmp/oiui-ref/` (upstream data, reference only).

> **Historical snapshot.** This log records the Phase A/B verification as taken on Node
> **v22.22.1** (suite snapshots of 84 and 92 tests, `client.js` 315,120 B). Those numbers are
> intentionally left as they were measured. The current gate is Node 24 plus `npm run check`
> — strict `client.js` build, `node --check client.js`, `probe-client`, then `node --test` —
> and the suite count is whatever `node --test` prints (it grows with every added test —
> 106 before the release/packaging checks were added). The release workflow (`.github/workflows/publish.yml`) re-runs that gate
> on the tag before publishing, and `.github/workflows/ci.yml` runs it on every push to main
> and every pull request. `docs/INTERFACES.md` §9 is the current authority for the gate.

---

## 1. How to reproduce

| Purpose | Command |
| --- | --- |
| Full suite (language unit tests + corpus + host) | `node --test` |
| Verifier suite only | `node --test "test/e2e/*.test.mjs"` |
| Strict client build | `node scripts/build-client.mjs` (strict is the default) |
| Syntax-check the built artifact | `node --check client.js` |
| Built-artifact probe (Lead-owned) | `node scripts/probe-client.mjs` |
| Full gate (what CI and the release job run) | `npm run check` |
| Raw evidence dump (JSON on stdout) | `node test/e2e/report.mjs` |

Node under test for the pinned runs in this log: **v22.22.1** (historical; the current
gate runs on Node 24).

> **F1 is fixed (Lead, 2026-10-16).** `package.json` now has `"test": "node --test"`,
> `"build": "node scripts/build-client.mjs --strict"` and
> `"check": "node scripts/build-client.mjs --strict && node --check client.js && node --test"`;
> `docs/INTERFACES.md` §9.1 now names `node --test` and documents the broken
> `node --test test/` form. On Node v22.22.1 that form fails because the directory argument is
> resolved as a module: `Error: Cannot find module '.../test'` / `code: 'MODULE_NOT_FOUND'`
> (reproduced in an unrelated scratch directory). Verified by reading `package.json` and §9.1
> at 2026-10-16T07:27:51Z.

## 2. Snapshot under test

Timestamp of the pinned run: **2026-10-16T07:24:12Z**. Builders were still writing while this
work ran, so the result below belongs to these hashes:

```
8df6d253d52d570dbf44985d6e7801ed  index.js
c8ab95b267d89c914f5417bf350da828  src/lang/index.js
3bfe884d94aadaf777666fc7cfcb234f  src/lang/parse.js
86978952a8f1dcf569efc77581f9aabe  src/lang/evaluate.js
dadbf86bb6c6e563d3c02e6a53cfcb17  src/lang/functions.js
3aa60c15af848c9d7269f511f314a543  src/lang/signatures.js
fe0eb63a8872da54550dee3f1b904ae3  src/lang/spec.js
ec222e7ae3358c8d9d58bb7da16f4ec6  src/lang/tokenize.js
55cecc134c29ac80570d954839c8f398  test/e2e/corpus.test.mjs
4b2abe1c495deee94d86775080dae14c  test/e2e/contract.test.mjs
21229c7b0fcfd0228cab9b727c4a643b  test/e2e/host.test.mjs
```

Corpus: 28 `.oui` fixtures, 24 341 bytes total. Reported counts at this snapshot:
`COMPONENT_SIGNATURES` = 48, `FUNCTION_SIGNATURES` = 73 (72 + `@Each`),
`FUNCTIONS` keys = 72.

## 3. Phase A criteria

| # | Criterion (contract §) | Verdict | Evidence |
| --- | --- | --- | --- |
| A1 | ≥16 programs exercising every component group, `$`-binding flows, `@Each`, charts, SVG and the adversarial edges | **PASS** | 28 fixtures; category list in §4.4; 48/48 components exercised (`corpus.test.mjs` coverage test) |
| A2 | Per program: expected parse diagnostics | **PASS** | §4.4; error programs 18/25 are `ok:false` with ≥1 error, the 26 clean programs have none |
| A3 | Per program: `root` is an element descriptor | **PASS** | 26/28 `rootIsElementDescriptor:true`; `16-edge-empty`/`17-edge-missing-root` must be `null` and are |
| A4 | `parseProgram`/`evaluateProgram` never throw | **PASS** | 28 fixtures + 25 hostile inputs in `contract.test.mjs`; host `execute` over 13 hostile/typed inputs |
| A5 | Purity: the caller's `options.state` object is not mutated | **PASS** | JSON before/after comparison plus a frozen-state call, for all 28 fixtures |
| A6 | `stateDefaults` present and covers every declared `$name` | **PASS** | 14 fixtures declare state; no missing keys (report `stateDefaults`) |
| A7 | Every component name used exists in `COMPONENT_SIGNATURES` | **PASS** | all call names classified; unknown names appear only in fixture 19 (by design) |
| A8 | §6.4 `COMPONENT_SIGNATURES` is exactly the 48 frozen names with frozen positional args and required counts | **PASS** | `contract.test.mjs`; `args` objects `{name,type,required}` as §5.5 shows |
| A9 | §5.4 `FUNCTION_SIGNATURES` = 72 + `@Each`; `FUNCTIONS` = exactly the 72 | **PASS** | 73/72; no extra or missing names |
| A10 | §5.2 AST node shapes and `Statement` fields (`kind/name/state/expr/line`) | **PASS** | 16-line program exercising every tag; line numbers exact |
| A11 | §5.3 bindings stay descriptors only as direct component/action arguments | **PASS** | direct arg is `{kind:'binding'}`; `$x` in `$x + ""` is unwrapped to `"5"` |
| A12 | §5.3 `@Each` unwraps, skips `null`, concatenates, shadows statements | **PASS** | `it = "shadowed"` is shadowed by the loop variable; `[1,null,3]` → 2 children |
| A13 | §5.3 cycle and unknown-statement reference are error diagnostics, value `null`, no hang | **PASS** | `<1 ms` on the cycle fixture; both evaluate the reference to `null` |
| A14 | §5.2 named arguments produce an error diagnostic | **PASS** | `ok:false`, message names the problem (fixture 25, inline probes) |
| A15 | 200-statement program parses and evaluates | **PASS** | exactly 200 statements, `root` descriptor, no diagnostics |
| A16 | Deep nesting survives the parser | **PASS** | 30 nested `Col` levels, expression depth 31 measured |
| A17 | Non-ASCII text and string escapes survive verbatim | **PASS** | 日本語/한국어/Ελληνικά/🚀/ZWJ family; `\n`, `\"`, `\\`, `\t` compared byte-for-byte in the AST |
| A18 | §5.5 `systemPromptSectionText()` teaches every v1 name; `EXAMPLES` are 2 valid programs | **PASS** | all 48 components, all 72 `@`-functions, `@Each`, all 6 action steps present |
| A19 | §8 host half: `inject`, tool name/parameters/output, prompt section name+order | **PASS** | `intelligent_ui`, `tool:intelligent-ui`, order 5500, `parameters.required=['program']` |
| A20 | §8 `execute` returns the flat canonical value and never throws | **PASS** | exactly `{ok,summary,statements,stateVariables,diagnostics}`; 20 malformed/typed inputs |
| A21 | §8 fatal cases are `ok:false`: parse error, missing root, unknown name, too large | **PASS** | all five cases plus empty program |
| A22 | §8 row config `prompt`, `maxProgramBytes`, `maxDiagnostics` | **PASS** | `prompt:false` registers no section; size limit and diagnostic cap honoured |
| A23 | §9.1 `node --test` runs the whole suite | **PASS (was FAIL, fixed)** | `# tests 84 / # pass 84`; §1 records the Lead's fix (`scripts.test` = `node --test`) and the exact old failure |

No product-code FAIL was found in the pinned snapshot.

## 4. Raw evidence

### 4.1 Full suite

```
$ node --test
# tests 84
# suites 3
# pass 84
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 239.905354
```

### 4.2 Verifier suite only

```
$ node --test "test/e2e/*.test.mjs"
1..3
# tests 51
# suites 3
# pass 51
# fail 0
# duration_ms 251.662578
```

51 = 14 language-contract + 33 corpus + 4 host checks. `lib.mjs` and `report.mjs` are helpers,
not tests; note that a bare `node --test` does collect them as (trivially passing) test files.

### 4.3 Corpus report (`node test/e2e/report.mjs`)

```
components 48 functionSignatures 73 FUNCTIONS 72 programs 28
programs with eval diagnostics:
  18-edge-unbalanced.oui  | error@1: expected "]" to close the array | error@1: expected ")" to close the argument list
  21-edge-cycle.oui       | error@2: circular reference: "a" eventually refers to itself
  25-edge-named-args.oui  | error@1: named arguments (name: value) are not supported: every argument is positional
  28-edge-unknown-ref.oui | error@1: unknown reference "nope": no statement defines it
rootIsElementDescriptor: 26/28 (the other two have no root statement, by design)
parseClean: 26/28 (18 and 25 are the intentional error fixtures)
```

`stateDefaults` coverage: `03-inputs` name+notes+region+mode+volume+agree+plan+when,
`04-media-data` rows, `06-play` known+total, `07-bindings` name+score+active+tier,
`08-each` hungry+items, `09-charts` year+mix, `10-functions-math` values+people,
`11-functions-collections` cart+rows, `12-functions-text` label, `13-functions-date`
start+end, `14-functions-data` sales+prices, `15-op-precedence` a+b+c+flag+text,
`22-edge-200-statements` seed, `27-kitchen-sink` name+on+answer+level+when+step.

### 4.4 Per-program results

| File | bytes | parse.ok | rootName | stmts | parse diag | eval.ok | root element | eval diag |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `01-text.oui` | 986 | true | root | 11 | clean | true | yes | clean |
| `02-layout.oui` | 1016 | true | root | 8 | clean | true | yes | clean |
| `03-inputs.oui` | 1401 | true | root | 22 | clean | true | yes | clean |
| `04-media-data.oui` | 826 | true | root | 7 | clean | true | yes | clean |
| `05-svg-drawing.oui` | 707 | true | root | 7 | clean | true | yes | clean |
| `06-play.oui` | 644 | true | root | 9 | clean | true | yes | clean |
| `07-bindings.oui` | 997 | true | root | 9 | clean | true | yes | clean |
| `08-each.oui` | 1293 | true | root | 11 | clean | true | yes | clean |
| `09-charts.oui` | 1187 | true | root | 12 | clean | true | yes | clean |
| `10-functions-math.oui` | 1392 | true | root | 11 | clean | true | yes | clean |
| `11-functions-collections.oui` | 1540 | true | root | 10 | clean | true | yes | clean |
| `12-functions-text.oui` | 1077 | true | root | 8 | clean | true | yes | clean |
| `13-functions-date.oui` | 794 | true | root | 8 | clean | true | yes | clean |
| `14-functions-data.oui` | 1912 | true | root | 11 | clean | true | yes | clean |
| `15-op-precedence.oui` | 948 | true | root | 15 | clean | true | yes | clean |
| `16-edge-empty.oui` | 0 | true | null | 0 | clean | true | no (root null) | clean |
| `17-edge-missing-root.oui` | 57 | true | null | 2 | clean | true | no (root null) | clean |
| `18-edge-unbalanced.oui` | 66 | false | root | 1 | 2 err | false | yes | error@1: expected "]" to close the array ; error@1: expected ")" to close the argument list |
| `19-edge-unknown-component.oui` | 179 | true | root | 1 | clean | true | yes | clean |
| `20-edge-unknown-function.oui` | 104 | true | root | 1 | clean | true | yes | clean |
| `21-edge-cycle.oui` | 88 | true | root | 3 | clean | false | yes | error@2: circular reference: "a" eventually refers to itself |
| `22-edge-200-statements.oui` | 3727 | true | root | 200 | clean | true | yes | clean |
| `23-edge-nonascii.oui` | 455 | true | root | 6 | clean | true | yes | clean |
| `24-edge-deep-nesting.oui` | 359 | true | root | 2 | clean | true | yes | clean |
| `25-edge-named-args.oui` | 68 | false | root | 1 | 2 err | false | yes | error@1: named arguments (name: value) are not supported: every argument is positional |
| `26-edge-strings.oui` | 132 | true | root | 4 | clean | true | yes | clean |
| `27-kitchen-sink.oui` | 2309 | true | root | 17 | clean | true | yes | clean |
| `28-edge-unknown-ref.oui` | 77 | true | root | 1 | clean | false | yes | error@1: unknown reference "nope": no statement defines it |

Component coverage (48/48, from the corpus coverage test):

```
Col@01 Title@01 Caption@01 Row@01 Label@01 Badge@01 Spacer@01 Link@01 Text@01 Quote@01
List@01 ListItem@01 Code@01 Divider@02 Box@02 Grid@02 Card@02 Carousel@02 Popover@02
Button@02 Form@03 Input@03 TextArea@03 Select@03 SegmentedControl@03 Slider@03 Checkbox@03
RadioGroup@03 DatePicker@03 Timer@03 Pressable@03 IconButton@03 Icon@04 Image@04 Table@04
Chart@04 Svg@05 Rect@05 Path@05 G@05 Circle@05 Ellipse@05 Polyline@05 Line@05 Polygon@05
SvgText@05 Flashcard@06 Celebration@06
```

Categories present: layout, text, drawing, inputs, media-data, play, bindings, each, charts,
functions-math, functions-collections, functions-text, functions-date, functions-data,
operators, kitchen-sink, edge-empty, edge-missing-root, edge-unbalanced,
edge-unknown-component, edge-unknown-function, edge-unknown-ref, edge-cycle,
edge-200-statements, edge-nonascii, edge-deep-nesting, edge-named-args, edge-strings.

## 5. Contract checks that are *not* expressible as a program result

- §6.1 the 400-node / 20-level renderer caps live in the client half; they are only
  observable in a browser (§7, Phase B).
- §5.3 "lazy, memoized per statement" has no observable output beyond the cycle case; cycle
  termination (`<1 ms`) is the proxy used instead. Laziness itself is **not verified**.
- §5.4 argument order is only pinned by the reference text; I probe the shapes my corpus uses
  and let an evaluation diagnostic show a mismatch. The 10/11/12/13/14 fixtures are
  diagnostic-clean at this snapshot, which is evidence the reference argument order holds for
  every function those fixtures call.

## 6. Findings, advisories and harness corrections

### F1 — tooling, needs the Lead (see §1)
`node --test test/` fails on Node v22.22.1 (`MODULE_NOT_FOUND`). `package.json`
`scripts.test` and `docs/INTERFACES.md` §9.1 both use that command.

### A1 — duplicate diagnostics for one named argument (advisory, owner `src/lang/parse.js`)
Fixture `25-edge-named-args.oui` has one named argument and receives the identical error
twice:

```
error@1: named arguments (name: value) are not supported: every argument is positional
error@1: named arguments (name: value) are not supported: every argument is positional
```

The host caps diagnostics at 24, so this only costs budget. Contract only requires *an* error
diagnostic, so this is a PASS with a note.

### A2 — missing-argument policy is unpinned (advisory, owner `src/lang/functions.js`)
`INTERFACES.md` does not say what a built-in does when required arguments are absent.
Observed: `callFunction('Count', [])` → `0`, `callFunction('Format', [])` → `""`. Wrong-typed
arguments do follow §5.3 (`Count(42)` → `null`, `Sum("x")` → `null`), which is what the
harness asserts.

### A3 — `null` coercion in `+` is unpinned (advisory, owner `src/lang/evaluate.js`)
`null + ""` evaluates to `""`; plain JavaScript and the reference's display idiom
(`$n + ""`) would give `"null"`. The document only says "`+` concatenates when either side is
a string", so the harness does not fail on this; it passes `null` directly instead of through
`+`.

### A4 — empty program and missing root (verified, no action)
An empty file and a program without `root` both parse to `ok:true, rootName:null` with no
diagnostics; `index.js` then makes "missing root" fatal (`ok:false`). That matches §5.2
(`ok` = no error diagnostics) plus §8 (missing root is fatal at the host), and both are
asserted.

### A5 — moving tree during verification
An earlier run of the same command caught `test/lang.test.mjs` (lang-core's own suite) with 4
failures: "references are hoisted", "callFunction reports unknown names and bad arguments",
"list built-ins", "aggregation built-ins". Re-running minutes later at 07:22:44Z was fully
green, and the hoisting case reproduced cleanly by hand. This is recorded as a mid-edit
artifact, **not** as a defect claim; the Lead's release gate should re-run the suite after all
writers stop.

### H1 — harness corrections made during Phase A (my files only)
For the record, the following were my mistakes, fixed in `test/e2e/**` and `test/programs/**`:
§5.5 encodes `COMPONENT_SIGNATURES.args` as `{name,type,required}` objects (§6.1's string form
belongs to the registry entry) — the check now accepts either and compares names + required
count; four null-value assertions conflated the cycle/unknown cases with `+` coercion; two
fixtures used wrong argument shapes (`@MixColor` wants hex colours, `@MovingAvg`/`@Bucket`
want rows+field(+window/unit)); one fixture had a misplaced `)`; one expectation assumed the
program default while the purity probe passes an overriding state object.

## 7. Explicitly not verified

- Everything below is deferred to Phase B, gated on the Lead confirming the bundle is
  installed:
  - `window.__DSH_INTELLIGENT_UI__` exists and reports 48 components.
  - The chat row actually renders after a real `intelligent_ui` tool call (screenshot).
  - At least one control changes visible output; no `slot entry crashed` in the console.
  - Surfaces/text use host theme tokens and the light/dark behaviour holds.
  - Static manifest re-checks: `dsh.bundle.patch`, `dsh.client`, every export resolves to a
    real file, `icon.svg` valid and < 256 KiB, `locale/en.json` + `locale/zh.json` carry
    `meta.title` and `meta.description`, `client.js` contains all 48 component names.
    (The 48-component registry and the taught-@function set are already covered statically by
    the pre-flight probe in §8.1; the live page still has to confirm them at runtime.)
  - §7's 400-node / 20-level runtime caps.
- §5.3 memoization/laziness (see §5 above).
- The reference gallery programs themselves were not run end-to-end; only the parts of the
  language that `INTERFACES.md` supports were modelled into fixtures.

## 8. Phase B result

_Pending — the bundle is not yet confirmed installed (Lead: client-shell, components-b and
lang-core are still finishing). This section will be filled with the live-GUI evidence and a
PASS/FAIL verdict per Phase B criterion._

### 8.1 Pre-flight: built-artifact probe (Lead-owned, not a Phase B substitute)

Before Phase B opens I ran the Lead's `scripts/probe-client.mjs` once, to have its output in
the evidence pack and to catch a regression early. It is **not** a substitute for the live-page
checks: it evaluates `client.js` outside the browser with a React shim.

Snapshot: 2026-10-16T07:27:51Z, `client.js` md5 `f8ed1cd9ed90228f75e6e7bea61aa546`,
`scripts/probe-client.mjs` md5 `d980903eacc0aca26cca4aa5699f93dd`. The tree was still moving
(this is the pre-Phase-B artifact), so this is a snapshot, not a release verdict.

```
$ node scripts/probe-client.mjs
ok   client.js registers a __ModuleLoader__ handoff
ok   module id matches the package name — @my-dsh/dsh-intelligent-ui
ok   factory returns a plugin with apply()
ok   plugin.inject declares slots + locale — ["slots","locale"]
ok   registers a toolview for key "intelligent_ui"
ok   injects into "tool.call.toolview"
ok   toolview entry has a component
ok   every taught component is implemented
ok   every implemented component is taught (no silent extras)
     components: 48 registered / 48 taught
ok   the bundled language core teaches the same @functions as the host
     functions : 73 bundled / 73 taught
ok   every taught @function resolves in the evaluator
ok   diagnostic global exposes parseProgram + evaluateProgram

probe-client: PASS
```

This is cited as pre-flight evidence for pre-loading the scoring in Phase B §8.2; the Phase B
verdict still depends on the live page.

### 8.2 Phase B result — SUPERVISOR RERUN (Lead, after the verifier stalled mid-Phase B)

The verifier completed Phase A and began Phase B (its capture files are in `/tmp/phaseB-*.png`
and `/tmp/iui-palette-*.png`) but stopped before writing this section, so the Lead finished
Phase B on the frozen build and records the raw evidence here. Verifier-owned Phase A results
above stand unchanged.

Frozen build: install `application: applied`, no warnings (bundle linked from the workspace);
`client.js` 315120 B. `client.js` embeds a build timestamp in its banner, so its md5 changes on
every rebuild — pin the source hashes instead: `base.css` a03b5883d01daf7fce98bde3be748256,
`index.js` 8df6d253d52d570dbf44985d6e7801ed, `parse.js` 0f0ddb3a76bd0ff1484dcc5f0c084462,
`evaluate.js` 984ee10d7ad88a29d67048582421bb7b, `30-render.js` d1ca02233d552eba361026e44599da5c.

| # | Criterion | Verdict | Raw evidence |
|---|---|---|---|
| B1 | Slot registration live | PASS | `Slots.listSubTree` → `tool.call.toolview` occupant `{"registrant":"Kb","key":"intelligent_ui","active":true}` |
| B2 | Tool registered and callable | PASS | tool list contains `intelligent_ui`; two real calls returned `Rendered "…" in the user's chat: 11 statement(s), state: people, days, budget, pace, booked, bookedAll` and `… 8 statement(s), state: people, nights, currency` |
| B3 | Row renders in the live GUI | PASS | `document.querySelectorAll('.iui-root').length === 1` per call (2 after both); `.iui-lt-title` reads `["One day in San Francisco","$180","0 / 5"]`; table `6 tr`, slider `1`, buttons `8`, SVG rects `10`, `.iui-notice`/`.iui-error` `0` |
| B4 | Interactive recompute | PASS | slider `180→400` ⇒ title `$180→$400`; Pressable click ⇒ `0 / 5 → 1 / 5` and `iui-is-selected`; number input `2→4` ⇒ sentence `for 2 people → for 4 people`; splitter slider `3→6` ⇒ `$494.67 → $247.33`; `@Reset()` ⇒ `$180 / 0 / 5`, slider value `180`, `0` selected |
| B5 | Replay stability | PASS | after `navigate_page reload`, both rows rebuild from the session log (`2 × .iui-root`) with no new model call |
| B6 | Table `@Each` array-template path | PASS | cells `Flights｜1｜$420｜$420`, `Hotel nights｜4｜$180｜$720`, `Food｜4｜$65｜$260`, `Museums｜3｜$28｜$84` (5 tr / 16 td) — this path rendered one cell per row before task-7 |
| B7 | Accessible names | PASS | 8/8 controls in a probe render carry unique `id` + `name` + `label[for]`; the page-level "form field should have an id or name" audit fell 46 → 1, and that 1 is the host composer |
| B8 | Console clean of our defects | PASS | only `issue: form field … (count: 1)` and `error: 404 (2×)` remain; the 404s are `GET /open-in-app/icon/filemanager` from the shipped `ui-open-in-app` plugin (confirmed in the network log), not ours |
| B9 | Dark theme palette | PASS (numeric) | host switches via `body[data-ds-dark-theme]`; with it set, all 22 `--iui-c-*` switch (chart1 `#4f7df3→#7a9dfb`, brand-soft `#e8f0ff→#1b2740`, shadow → rgba(0,0,0,.4)); Badge text contrast `1.10:1 → 14.24:1`; after `removeAttribute` the read-back is byte-identical to light |
| B10 | Narrow viewport | PASS | at `390x844x2,mobile,touch`: row width 263 px, `scrollWidth 263`, table wrapper `261/263`, no horizontal page scroll (`scrollWidth 390`) |
| B11 | Static manifest | PASS | `dsh.bundle.patch` + `dsh.client.platform=web` + inject list present; `.`/`./client`/`./icon`/`./locale/*.json` all resolve; `icon.svg` 880 B and well-formed; both locales carry `meta.title`+`meta.description`; host `index.js` imports only `./src/lang` |
| B12 | Automated suite on the frozen tree | PASS | `node --test` 92 pass / 0 fail; `build-client.mjs --strict` 315120 B exit 0; `node --check client.js` OK; `probe-client.mjs` PASS (48/48 components, 73/73 functions) |

State restored after testing: colour-scheme emulation back to `auto`, viewport back to `1544x869x1`,
the temporary `body[data-ds-dark-theme]` attribute and all injected inline styles removed, the two
`file://` evidence tabs the verifier opened closed, both demo rows reset to their defaults, and the
host theme setting never touched.

NOT VERIFIED, and reported as such: a rendered dark-mode screenshot (the row sits ~2750 px above
the viewport in a virtualized chat and the attribute flip could not be combined with a capture in
that harness); real-device touch behaviour; and the contrast numbers above are computed, not
measured from pixels.

---

## 2026-10-17 optimization pass (post-v1.0.4, Lead-run)

Three parallel read-only audits (language core, client half, host/build/release) preceded this
work; every change below was implemented in the same repository and re-verified. `node --test`
went 106 → 143 tests, all green; `probe-client.mjs` PASS; `node scripts/build-client.mjs` is
byte-idempotent; the committed `client.js` is 282,382 B (was 317,325 B).

| Area | Change | Measured evidence |
| --- | --- | --- |
| Evaluator cost | `Intl.NumberFormat`/`DateTimeFormat` cached per options shape (cap 64) in `src/lang/functions.js` and `utilFormatNumber` | 300-row dashboard (Table + 2 Charts + 2 `@Format`/row) evaluation **10.27 ms → 0.85 ms** (12×); 200 rows of `@FormatDate(…,"long")` 8.05 ms → 0.48 ms |
| Sparse data | `null`/`''` is *missing*, not `0`, in Sum/Avg/Min/Max/Stats/GroupBy/Pivot/Bucket/MovingAvg/Histogram and in `@Filter` ordering | `Min([null,5,9])` was `0`, now `5`; `@Filter` no longer matches rows whose field is absent |
| DOM containment | Table/List/Chart rows are capped and charged against a 2,000-host-node output budget; truncation is a localized notice | `Table` over `@Range(0,5000)`: **15,015 → 1,517** DOM elements with one truncation notice; corpus rendering unchanged (24 ok / 4 designed error programs) |
| Focus stability | React keys derive from `component:source-line|occurrence` instead of a global node counter | a search `Input` after a filtered `@Each` keeps the same DOM node when the list shrinks |
| Console noise | diagnostics deduped per row + program | one unknown component inside `@Each(30)`: **30 warnings per render → 1** |
| Security | `@OpenUrl` and `Image` use the shared URL allowlist (`http(s)/mailto/tel/`root-relative`/`#`, plus `data:image/` for images); `referrerPolicy="no-referrer"` | `@OpenUrl("javascript:alert(1)")` and an `Image("javascript:…")` no longer reach `window.open`/`<img>` |
| Error recovery | error boundary resets when the program text changes | a transient component throw no longer bricks the row for its lifetime |
| A11y | Badge never paints text and background the same token (dot + `label-primary` text on tints); `:focus-visible` ring on inputs; Chart `role="img"` summary; localized carousel/popover/notice copy | `Badge("x","muted")` was 1.00:1, now readable; 8/8 control ids and `label[for]` unchanged |
| Correctness | `stateDefaults` independent of `options.state`; enum arguments (`@Format` kind, `@Duration` style, `@Top`/`@Sort` dir) validated with diagnostics; `@Unique` Set fast-path; `@Pivot` label collisions | `@Top(rows,"v",2,"ascending")` was descending; `@Unique` 8k numbers 21 ms → 1.1 ms |
| Host robustness | `checkNames`/`walkNode` iterative | a 5,000-term flat expression used to throw `RangeError` inside `tool.execute`; now canonical |
| Build | lexer-aware import/export transform (no silent line loss inside template literals), strict by default, no partial writes, byte-idempotent rebuilds, standalone comments stripped from the artifact, exported helpers under test | `client.js` 317,325 → 282,382 B; `test/build.test.mjs` (13 tests) covers transform edge cases, CLI strictness and idempotence |
| Release/CI | new `ci.yml`; probe + `node --check` gate before publish; serialized releases; `npm@11` pinned; prerelease `--tag next`; market-index engines read from the tagged manifest | `test/release.test.mjs` (14 tests) asserts the gates and the published file set (`npm pack --dry-run`: 16 files / 122.8 kB packed, was 30 / 175.9 kB) |
| Prompt | system-prompt section rebalanced (7,902 → 8,381 chars) teaching the rules that caused real failures: `//` comments, ASCII identifiers, `null` placeholders, boolean `&&`/`||`, loop variable without `$`, the 60 KB cap, Chart-vs-`@Format` percent units, and the enum truth | every taught name still resolves in the evaluator (probe) |

Not verified here: real-browser timings and the live GUI refresh (the running profile still holds
1.0.3; reinstall per README 开发/升级 section), and `javascript:`/`data:` semantics of
`window.open` inside the user's own Chrome.
