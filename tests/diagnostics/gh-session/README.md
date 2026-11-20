# Finite GH/WebKit refusal diagnosis

Dedicated branch `agent/diagnostyka-gh-sesja` only. Never merge or publish this branch. All data must come from the exact ephemeral fictional fixture account. This is diagnostic evidence, not an application fix or a release gate.

Two independent paths are evaluated: the standard feature CI runs the original full 88-case WebKit set with only the approved `a32e54…` error-helper addition; this dedicated workflow runs exactly the original GH 390 case ten times with retries disabled. Its native application files remain the original `be8` bytes. The two existing fixture boot fixes on feature `d54` are outside this WebKit selection. No additional full88 diagnostic job is launched.

## Scope and finite command

The workflow uses Node 24, `npm ci`, the unchanged original WebKit installation step, one worker from the unchanged WebKit configuration, the original per-case 240000 ms and configuration 120000 ms budgets, and a 50-minute job budget. The exact substring `--grep` has no new regex anchors:

```bash
npm run test:e2e -- --config playwright.lab-chart-webkit.config.mjs --project home-workspace-webkit --grep 'home A2: native GH portal cancels purely and saves/imports the original therapy point · 390' --repeat-each 10 --retries 0
```

Original actions, validations, pure-cancel checks, portal acknowledgement, patient Vault save and F5 round-trip checks remain. No assertion, retry budget, timeout, source guard or original test is weakened. The added failure-only helper is byte-identical to the approved `a32e54…` proposal and rethrows the original assertion error even if diagnostic capture fails.

## Native asset and observer

The diagnostic route applies only to the exact local origin, `/index.html` frame, and `/vilda_data_import_export.js?v=126`. Before fulfilling, it verifies the original native response hash `0e805…`; it serves the approved refusal-only clone `5db984…` without editing that native file on disk.

The clone adds 19 sites only after original refusal branches, terminal catches/fallthrough or the existing adapter-false ELSE. There are no added observer calls, detail allocations or JSON work on a completely successful native write path. Original short circuit operands are never re-evaluated for attribution. Reverse source identity and Acorn 8.17.0 canonical AST `78e8…` are checked. The three helper declarations still change source load/parse/JIT layout: observer effect remains possible.

RAM logging is reset/enabled inside the existing original pre-click `frame.evaluate`; the critical save segment retains exactly one such round trip. The late harvest before the original F5 happens only after the original session and encrypted patient acknowledgement checks, so it adds later timing. The helper does not wrap/invoke the writer to inspect it and does not add authority decisions or capture tickets, adapters, leases or opaque tokens.

Each evidence filename and payload includes `project`, `repeatEachIndex` and `retry`. Before-F5 evidence verifies the fulfilled route, RAM enable, and hash of the current public writer function source obtained with `Function.prototype.toString.call`, without invoking it. Invalid capture makes this diagnostic case fail after evidence attachment. An empty refusal log with those checks satisfied is expected on a successful path; it does not prove every native guard passed, because the observer is best effort and capped at 200 entries. After F5, document-local RAM and enable flags are expected to disappear. Read the before-F5 evidence or failure-time afterEach evidence rather than treating post-F5 emptiness as a refusal.

Full read-only public payload/main-session JSON retains timestamps, key order and native metadata only when the fixture label is exactly `Fikcyjny sejf testu panelu siatek`. It is not the private candidate collected inside a native writer. No `getCurrentDecision` or `canWriteSession` call is added by hooks; the original test's own acknowledgement assertion stays intact.

## Preparation and restoration

```bash
node tests/diagnostics/gh-session/prepare.mjs prepare refusal
# run the finite command above
node tests/diagnostics/gh-session/prepare.mjs restore refusal
```

Actual preparation requires the exact push-only branch/environment, clean checkout, `be8` ancestry and an ADD-only diagnostic-file whitelist relative to `be8`. Source, configuration, normal workflow and diagnostic hashes are frozen. The original full88 order, unique target and ten repetitions are collected before and after the temporary test patch. There are no new test definitions.

Only `tests/e2e/home-workspace-growth.spec.mjs` is patched ephemerally. Its original bytes and every tracked file mode/type/hash are recorded outside checkout. Restoration verifies that no other tracked file changed, restores the exact original growth spec and requires complete tracked snapshot equality plus a clean checkout. The workflow uses explicit `pipefail` to preserve the test exit code and `always()` for restoration/artifact upload. A hard runner/job timeout or cancellation may prevent those best-effort steps from finishing; do not claim restoration without its proof artifact.

`preview native` and `preview refusal` generate external proof files and collect original tests without modifying checkout or running Git, browsers, fixtures or a static server:

```bash
node /path/to/diagnostic/files/tests/diagnostics/gh-session/prepare.mjs preview refusal /path/to/be8-checkout /tmp/new-external-output
```

Preview does not patch/collect the generated harness inside the checkout. That final comparison is required by actual `prepare`, performed only after the owner has reviewed and committed these diagnostic files. `native` is preview-only: the full native cohort is the separate normal CI, not a duplicated diagnostic job.

A successful stress run without refusals is bounded evidence only. The original failed `be8` run remains part of the record; the exact native refusal cause is unknown until an original failing condition is observed and supported. This branch cannot authorize release or prove that a runtime issue was fixed.
