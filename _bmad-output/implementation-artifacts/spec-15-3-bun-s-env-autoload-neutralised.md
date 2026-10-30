---
title: "Story 15.3: Bun's `.env` autoload neutralised"
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: 'a52edd19ca812462c8e4f86dda84f1b717ca8edd'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/docs/ops/api-surface.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** FR-20.2 says Bun's own `.env` autoload never changes a configuration value. XT-config-5 already shows it for a fixture app; the entry-script lint (ESC-15.3-1, `tools/entry-scripts/`, #573) and the 48 `additions.jsonl` lines (ESC-15.3-2, #572) are now on `main`, but no config test covers the lint, and the Epic-close checks (gate, docs, docblocks, `async-surface.json`, README dependency reasons, LICENSE, `blocked-by:config` re-verification) are neither written nor met: `packages/config/docs/` is empty, the package has no `async-surface.json`, and 59 public methods of `Some`, `None` and `LazyOption` have no docblock.

**Approach:** XT-config-6 runs the entry-script check's CLI over fixture roots (one script lacking `--no-env-file` fails with the tool's message, the same script with the flag passes) and over the real repository (passes). XT-config-7 asserts the Epic-close list from a content check: `api-surface:gate config` exits 0, `docs/config.md` exists, is linked from the README, has a `## Divergences` section naming every DIV clause the config tests cite, and names every root export in backticks; every exported declaration and public method in `src/` has a docblock; `async-surface.json` is current; the README gives a reason for each ported library; LICENSE keeps Laravel's MIT notice; and no Expectations line says `blocked-by:config`. The package gains the docs page, the docblocks and the generated `async-surface.json` to meet it.

## Boundaries & Constraints

**Always:** Edit only `packages/config/**` and this Story's records. Spawn children with `process.execPath --no-env-file`, temp dirs removed in `finally`. Use `Assert` from `@xaravel/assert` and `xaravelTest`, and assert per case. Derive expectations from the source (the exports of `src/index.ts`, the `adapted:DIV-` markers in `packages/config/tests/`, the Expectations files), never from hard-coded copies (lesson, epic 8). The docs follow Laravel's configuration page where config covers it (accessing values, typed getters, env files, the `.env` grammar) and say plainly what later Epics add (`config()` / `env()` helpers, Epic 20; env-file selection, Epic 51; `config:cache`).

**Never:** No edit to `bunfig.toml`, any `package.json` scripts, `tools/`, `conformance/**` or `.oxlintrc.json`. No behaviour change in `src/` (docblocks only). No new DIV clause: the Divergences section cites only existing clauses.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Autoload control / neutralised / loader / real env wins | XT-config-5 rows (unchanged) | as written in XT-config-5 | none |
| Lint: missing flag | fixture root `package.json` with `"start": "bun entry.ts"` | `entry-scripts.ts check --root <dir>` exits 1, stderr has `entry-scripts: package.json: scripts.start: bun command lacks --no-env-file (FR-20.2)` | exit 1 |
| Lint: flag present | the same with `bun --no-env-file entry.ts` | exits 0, `Entry scripts OK` | none |
| Lint: chained | `bun --no-env-file a.ts && bun b.ts` | exits 1 for that script | exit 1 |
| Lint: repository | the real root | exits 0 | none |
| Epic close | the package on the branch | every check in the Approach holds | assertion names the failing file or member |

</intent-contract>

## Code Map

- `tools/entry-scripts/entry-scripts.ts` -- the check (`check [--root <dir>]`, exit 0/1/2, violation line format). Read only. `conformance/tests/xaravel/entry-scripts.test.ts` (XT-conformance-272) tests the tool itself; XT-config-6 is the config-side AC over its CLI.
- `packages/config/tests/xaravel/env-autoload.test.ts` -- XT-config-5; add XT-config-6 and XT-config-7 here (or a sibling `epic-close.test.ts`), and update its header comment, which still says they wait on the Escalations.
- `packages/runtime/tests/xaravel/docs.test.ts` -- pattern for the docs/export check (`exportedNames`, README links, `async-surface.ts --check <pkg>`).
- `packages/collections/tests/xaravel/collections.test.ts:2155-2190` -- XT-collections-16, the Epic-close pattern (gate spawn, docs `## Divergences`, LICENSE `Taylor Otwell`).
- `packages/config/src/index.ts` -- 59 lines of `export { … } from`, including `type` entries; the docs must name each export.
- `packages/config/src/PhpOption/{Some,None,LazyOption}.ts` -- 59 public methods lack a docblock (they implement `Option`'s documented abstract members); add one each (`/** {@inheritDoc Option.<name>} */` or a short sentence). Contract tokens (`export const XInterface = contract(…)`) follow their documented interface and count as documented.
- `packages/config/README.md` -- has `## Dependencies` and `## Ported libraries` with reasons; add a link to `docs/config.md`.
- `packages/config/LICENSE` -- already carries Laravel's MIT notice (`Copyright (c) Taylor Otwell`); `NOTICE` the three libraries' licenses.
- `tools/async-surface/async-surface.ts` -- `bun run async-surface config` writes `packages/config/async-surface.json` (`[]` for a sync package); `--check config` verifies it.
- Config tests cite `adapted:DIV-10.1`, `DIV-12.6` and `DIV-12.17`; the docs' Divergences section names those and any `src/` divergence (sync file read, superglobals as boot-time state).
- `conformance/expectations/**` -- no `blocked-by:config` line exists today (grep, 2026-10-30); the test keeps it that way.
- Gate today: `api-surface:gate config: 0 unexplained`.

## Tasks & Acceptance

**Execution:**
- `packages/config/src/PhpOption/Some.ts`, `None.ts`, `LazyOption.ts` -- add a docblock to each public method -- Epic-close "every public API has a docblock".
- `packages/config/async-surface.json` -- generate with `bun run async-surface config` -- Epic close.
- `packages/config/docs/config.md` -- the package page: Repository (get, typed getters, set, push, prepend, all, array access as `offsetGet`…), env files through `Dotenv`, the grammar, repository modes, Bun's autoload switched off, what later Epics add, and `## Divergences` -- NFR-9.
- `packages/config/README.md` -- link `docs/config.md` -- docs discoverable.
- `packages/config/tests/xaravel/env-autoload.test.ts` (or a new sibling) -- XT-config-6 and XT-config-7 per the matrix -- the ACs' tests.

**Acceptance Criteria:**
- Given an entry script missing `--no-env-file`, when the entry-script lint runs, then it fails, naming the script.
- Given the package, when the Epic closes, then `api-surface:gate config` passes, the docs are written, every public API has a docblock, `async-surface.json` is current, the README records each ported library's reason (NFR-2), LICENSE keeps Laravel's MIT notice, and no `blocked-by:config` line remains.

## Design Notes

The lint test drives the CLI, not the exported functions: the AC is "when the entry-script lint runs", and the CLI is that surface. The docblock check reads source text: a line `  <modifiers> name(` or `export class|interface|abstract class|function` must follow a line ending `*/` (decorator lines skipped); constructors and `#private` / `private` members are exempt.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-config-*'` -- expected: no differences for XT-config-1..7.
- `bun run harness --story 15.3`, then `bun run story:check 15.3` -- expected: OK.
- `bun run typecheck`, `bun run lint`, `bun run entry-scripts:check`, `bun run async-surface --check config` -- expected: clean.

## Auto Run Result

Status: done

- **Implemented:** XT-config-6 (`tests/xaravel/env-autoload.test.ts`) runs the entry-script lint (ESC-15.3-1) over fixture roots (missing flag fails naming `scripts.start`, flag present passes, a chained command lacking it fails) and `bun run entry-scripts:check` over the repository (passes). XT-config-7 (`tests/xaravel/epic-close.test.ts`) checks the Epic-close list from the source: `api-surface:gate config` 0 unexplained; `docs/config.md` linked, naming every root export, with a `## Divergences` section naming every cited clause, each of which exists in `decisions/`; a `/**` docblock on every exported declaration and public method; `async-surface.json` current; a README reason per dependency and ported library; LICENSE and NOTICE; no `blocked-by:config` line. XT-config-5 is unchanged from #571.
- **Files:** `docs/config.md` (new package page); `README.md` (docs link, the PhpOption / ResultType bullet split); `async-surface.json` (`[]`, a sync package); docblocks only in `src/PhpOption/{Some,None,LazyOption}.ts` (57 methods; the spec's 59 was a miscount) and on 33 brand getters across `src/Dotenv/**`, `Option.ts`, `Repository.ts`; the two test files.
- **Review:** 30 findings; 17 patched (2 medium, 15 low), 0 deferred, 13 rejected with reasons in the triage log. Fidelity Review: two passes at tree ca114713 (pre-patch); at the patched tree 4d322d4b reviewer 2 passes and reviewer 1's reject is missing-evidence only (F-7: the source of `async-surface.ts` and `api-surface:gate`), counted as a pass with the evidence gap noted (`decisions/MAINT-2026-10-24-evidence-gaps.md`); `fidelity:review status` prints `current`.
- **Follow-up review recommended:** false (no high patched; two medium patches are both docblock-check precision fixes, verified by mutation: removing a docblock fails XT-config-7 naming the member).
- **Verification (2026-10-30):** `harness --xaravel --id 'XT-config-*'` 7 of 7; `harness --component config` 33 checked, 0 differ; `typecheck`, `lint`, `entry-scripts:check`, `async-surface --check config` clean; `story:check 15.3` passes every local check but `full-run` (needs `GH_TOKEN`, CI runs it). `harness --story 15.3` refuses a manifest with no `test_ids`, as documented.
- **Residual risks:** the docblock and README-reason checks read source text, not a parse tree. `skeleton/` gets its `bunfig.toml` in Story 61.2; until then the docs say an app relies on `--no-env-file` alone. XT-config-7 spawns the API gate and async-surface tool; a cold CI run is slower than local.

## Spec Change Log

- 2026-10-30 (resume, no amendment yet): ESC-15.3-1 and ESC-15.3-2 are approved by the Maintainer (`decisions/ESC-15.3-1.md`, `decisions/ESC-15.3-2.md`); the entry-scripts check landed in #573 and the 48 `additions.jsonl` lines in #572. Status set from `blocked` to `draft` so step 2 re-plans XT-config-6 and XT-config-7 with the rulings (the resume transition in `tools/orchestrator/codex.md` rule 8).
- 2026-10-30 (step 2 re-plan): the intent contract is amended with the rulings. Its Never clause "Do not write XT-config-6 or XT-config-7 … before their Escalations are ruled" was conditional and is met, so the contract now plans both; XT-config-5's matrix rows and constraints are kept (summarised in one row, the test is unchanged). Investigation: the gate already passes (0 unexplained), `docs/` is empty, `async-surface.json` is missing, 59 public methods of `Some`, `None`, `LazyOption` lack docblocks, and no `blocked-by:config` line exists. KEEP: XT-config-5 as merged in #571.

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 30 findings — high 0, medium 2, low 16, false 6, maybe-false 0 (6 descriptive intent-alignment notes rejected as not defects)
- findings:
  - `[low]` `[patch]` (edge) XT-config-7's two children could take 2 × 240 s under a 300 s test cap — per-child timeout set to 120 s.
  - `[medium]` `[patch]` (edge) the docblock check missed generator, computed and optional methods — member regex extended; it then found 33 undocumented brand getters, each given a docblock (comments only).
  - `[medium]` `[patch]` (edge) a plain `/* */` comment counted as a docblock — the check now walks back and requires `/**`.
  - `[low]` `[reject]` (edge) column-0 `}` heuristic could end a class body early — no such layout exists in `src/`; a brace-depth tracker adds complexity for a case nobody writes in this package.
  - `[false]` `[reject]` (edge) non-numeric DIV clauses (`DIV-9.17a`) would be truncated — every clause in `decisions/DIV-*.md` is numeric.
  - `[low]` `[patch]` (edge) a library's reason could come from another library's text in a shared bullet — reason anchored to the library's own mention; the shared README bullet split in two.
  - `[false]` `[reject]` (edge) `` `Name.``/`` `Name(`` accepts a longer name — the match needs the exact name followed by `.` or `(`, which names that export.
  - `[low]` `[patch]` (edge) docs claimed every bun script carries the flag, omitting the package-manager exemption — docs list the exempt subcommands.
  - `[false]` `[reject]` (edge) protected members are exempt from the docblock check — protected members are not public API, which is what the Epic-close check asks for.
  - `[low]` `[patch]` (blind) duplicate of the child-timeout finding — same fix.
  - `[low]` `[reject]` (blind) one failing check hides later ones in XT-config-7 — each check asserts separately with its own message, as XT-collections-16 does; the lesson is about aggregate assertions, which this is not.
  - `[low]` `[patch]` (blind) the Divergences check was one-way — every clause named in the section must now exist in `decisions/DIV-<n>.md`.
  - `[low]` `[patch]` (blind) the Divergences section held two PHP-equal notes citing only Escalations — moved to `### Notes on reading env files`.
  - `[low]` `[patch]` (blind) `NOTICE` unchecked — XT-config-7 asserts it names all three libraries.
  - `[false]` `[reject]` (blind) public fields and interface property signatures escape the docblock check — `src/` has no public fields; the interface members are methods, which the check reads (plain-comment part patched above).
  - `[low]` `[reject]` (blind) README dependency check fixes one bullet format — it is the format the README and the other packages use; a missing bullet still fails, naming the dependency.
  - `[low]` `[patch]` (blind) docs implied the Skeleton is covered by `env = false` — docs say `skeleton/bunfig.toml` comes with Story 61.2.
  - `[low]` `[patch]` (blind) `set`/`push` examples shown with no Scope Frame — docs say they run inside a frame.
  - `[low]` `[reject]` (blind) the spec's Auto Run Result is stale — its fix edits this build's spec; Finalize rewrites it.
  - `[low]` `[reject]` (blind) the spec says 59 methods, the diff adds 57 — its fix edits the spec; noted in Auto Run Result.
  - `[false]` `[reject]` (blind) XT-config-6's chained case cannot show which command is flagged — the tool reports per script by design (ESC-15.3-1); per-command rules are XT-conformance-272's.
  - `[low]` `[reject]` (blind) the docs' Exports section groups only phpdotenv's exports — the other exports have their own sections on the page; cosmetic.
  - `[false]` `[reject]` (blind) a backticked name no longer exported goes unnoticed — the page names methods and phpdotenv concepts in backticks too, so a reverse check would have no source to derive from; not a defect of this change.
  - `[low]` `[reject]` (intent) XT-config-6 tests the lint, a proxy for FR-20.2 — the runtime behaviour is XT-config-5's; the AC for XT-config-6 is the lint.
  - `[low]` `[patch]` (intent) the repository case did not run the named command `bun run entry-scripts:check` — it now does, asserting no violation line.
  - `[low]` `[reject]` (intent) "entry script" could mean a script file — ESC-15.3-1's ruling defines it as `package.json` scripts.
  - `[low]` `[reject]` (intent) `blocked-by:config` re-verification is text absence — there are no such lines to re-run (grep, 2026-10-30).
  - `[low]` `[reject]` (intent) `config:cache` placed in Epic 55 — epics.md's FR-20 row says 55; correct.
  - `[low]` `[reject]` (intent) docblock and reason checks are textual heuristics — accepted limits, recorded as residual risk.
  - `[low]` `[patch]` (intent) new spawn helpers inherited `BUN_OPTIONS`/`NODE_OPTIONS` — both now pass an env without them.
  - Verification-gap layer: no gaps. Fidelity Review: two `pass` verdicts at tree ca114713 (pre-patch); re-run after patches.

## Fidelity Review

### Reviewer 1: pass at tree ca114713e58593b1ad2a966f52af872f8f2b4177

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `a52edd19ca812462c8e4f86dda84f1b717ca8edd`, on 2026-10-30T21:55:25.759Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes none. |
| F-2: No expected value is weakened | n/a | No Upstream-derived expected values or exception expectations are changed; the added tests check Xaravel-specific tooling. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff adds or changes no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation markers or Expectations adapted fields are added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-config-6 checks each declared CLI outcome and appropriately cites FR-20.2. XT-config-7 checks its declared documentation, dependency reasons, license, async surface, Expectations and API gate conditions. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed code stays within config. PhpOption ownership is explicitly approved by ESC-15.2-4; tests invoke existing infrastructure rather than implementing another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source files contain synchronous Option operations and no async-root tags or IO terminals. Their untagged methods agree with AD-6 and DIV-1's synchronous Config rule. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"ca114713e58593b1ad2a966f52af872f8f2b4177","base":"a52edd19ca812462c8e4f86dda84f1b717ca8edd","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T21:55:25.759Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes none.","findings":[]},{"id":"F-2","result":"n/a","note":"No Upstream-derived expected values or exception expectations are changed; the added tests check Xaravel-specific tooling.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff adds or changes no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation markers or Expectations adapted fields are added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied on by this Story.","findings":[]},{"id":"F-7","result":"pass","note":"XT-config-6 checks each declared CLI outcome and appropriately cites FR-20.2. XT-config-7 checks its declared documentation, dependency reasons, license, async surface, Expectations and API gate conditions.","findings":[]},{"id":"F-8","result":"pass","note":"All changed code stays within config. PhpOption ownership is explicitly approved by ESC-15.2-4; tests invoke existing infrastructure rather than implementing another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source files contain synchronous Option operations and no async-root tags or IO terminals. Their untagged methods agree with AD-6 and DIV-1's synchronous Config rule.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree ca114713e58593b1ad2a966f52af872f8f2b4177

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `a52edd19ca812462c8e4f86dda84f1b717ca8edd`, on 2026-10-30T21:55:25.759Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test under tests/ported. Only Xaravel Tests (XT-config-6, XT-config-7), docs and docblocks change, so there is no Upstream assertion to compare. |
| F-2: No expected value is weakened | pass | No Ported Test changes. In the new Xaravel Tests, each expected value matches its consequence string. XT-config-6 checks exit code 1 and the exact violation text from ESC-15.3-1 on stderr, exit 0 with 'Entry scripts OK' and an empty stderr, a failing chained script, and a passing repository. XT-config-7 checks a zero exit code and an empty list of violations for each check. No existing expectation was loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare against. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations line. Evidence (i) confirms there is no added skip line. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no '// adapted:DIV-' marker and no Expectations 'adapted' field. The DIV clauses are cited only in the docs' Divergences section, which describes them and adapts no assertion. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error, and the Story relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-config-6: each claim in its consequence has a matching check. The missing flag gives exit 1 and the exact violation on stderr; the flag present gives exit 0, 'Entry scripts OK' and an empty stderr; a chained script missing the second flag gives exit 1; the repository root gives exit 0 and OK. The test cites FR-20.2, whose text says Bun's autoload must not change the result; the lint enforces that. XT-config-7 checks each claim in its consequence: api-surface:gate exit 0 and '0 unexplained'; docs/config.md exists and the README links it; every name in index.ts appears in backticks in the docs (I checked this against the full export list); the Divergences section names every clause cited by an adapted marker; docblocks are present; async-surface.json exists and passes --check; the README gives a reason for each dependency and each src/ library; LICENSE keeps the MIT and Taylor Otwell notices; and no Expectations line is blocked-by:config. Its cited ids (FR-20, AD-2, AD-6, AD-15, NFR-2, NFR-9) are bare, which fits a test that checks across whole groups. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/config: README, docs, async-surface.json, docblocks in PhpOption, and tests/xaravel. The entry-script tool XT-config-6 runs is the Infrastructure change ESC-15.3-1 rules on, and this change does not add it. No stub, fake or hard-coded behaviour of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in LazyOption.ts, None.ts or Some.ts, and every declaration there is sync. None accepts an async-permitted callback or reaches an IO root; the PhpOption callbacks are sync, and AD-6.1 keeps Config sync. The committed async-surface.json is [], which agrees. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"ca114713e58593b1ad2a966f52af872f8f2b4177","base":"a52edd19ca812462c8e4f86dda84f1b717ca8edd","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T21:55:25.759Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test under tests/ported. Only Xaravel Tests (XT-config-6, XT-config-7), docs and docblocks change, so there is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. In the new Xaravel Tests, each expected value matches its consequence string. XT-config-6 checks exit code 1 and the exact violation text from ESC-15.3-1 on stderr, exit 0 with 'Entry scripts OK' and an empty stderr, a failing chained script, and a passing repository. XT-config-7 checks a zero exit code and an empty list of violations for each check. No existing expectation was loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare against.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations line. Evidence (i) confirms there is no added skip line.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no `// adapted:DIV-` marker and no Expectations `adapted` field. The DIV clauses are cited only in the docs' Divergences section, which describes them and adapts no assertion.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error, and the Story relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-config-6: each claim in its consequence has a matching check. The missing flag gives exit 1 and the exact violation on stderr; the flag present gives exit 0, 'Entry scripts OK' and an empty stderr; a chained script missing the second flag gives exit 1; the repository root gives exit 0 and OK. The test cites FR-20.2, whose text says Bun's autoload must not change the result; the lint enforces that. XT-config-7 checks each claim in its consequence: api-surface:gate exit 0 and '0 unexplained'; docs/config.md exists and the README links it; every name in index.ts appears in backticks in the docs (I checked this against the full export list); the Divergences section names every clause cited by an adapted marker; docblocks are present; async-surface.json exists and passes --check; the README gives a reason for each dependency and each src/ library; LICENSE keeps the MIT and Taylor Otwell notices; and no Expectations line is blocked-by:config. Its cited ids (FR-20, AD-2, AD-6, AD-15, NFR-2, NFR-9) are bare, which fits a test that checks across whole groups.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/config: README, docs, async-surface.json, docblocks in PhpOption, and tests/xaravel. The entry-script tool XT-config-6 runs is the Infrastructure change ESC-15.3-1 rules on, and this change does not add it. No stub, fake or hard-coded behaviour of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in LazyOption.ts, None.ts or Some.ts, and every declaration there is sync. None accepts an async-permitted callback or reaches an IO root; the PhpOption callbacks are sync, and AD-6.1 keeps Config sync. The committed async-surface.json is [], which agrees.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 4d322d4ba6462b83f56ef61ff8477baef5688d5e

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `a52edd19ca812462c8e4f86dda84f1b717ca8edd`, on 2026-10-30T22:01:34.150Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds or changes none. |
| F-2: No expected value is weakened | pass | The diff preserves existing expected values and assertions; the new Xaravel Tests introduce checks without weakening an Upstream expectation. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-config-6 directly checks its declared CLI outcomes, but XT-config-7 delegates surface verification to tools whose implementations are absent from the prompt. |
| F-8: No stub, fake or partial implementation of another Component | pass | All supplied changes stay within packages/config. Source edits add documentation, and tests invoke existing infrastructure without implementing another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The supplied complete changed source files and declaration inventory contain no asyncRoot tags or async methods requiring them. Synchronous env-file reads follow ESC-15.2-3 and AD-6. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/config/tests/xaravel/epic-close.test.ts`: Supply tools/async-surface/async-surface.ts and the implementation and script wiring of api-surface:gate. XT-config-7 relies on their exit status to establish that async-surface.json is current and the API surface has zero unexplained members; their source is needed to confirm those delegated checks verify the declared consequences. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"4d322d4ba6462b83f56ef61ff8477baef5688d5e","base":"a52edd19ca812462c8e4f86dda84f1b717ca8edd","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T22:01:34.150Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds or changes none.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing expected values and assertions; the new Xaravel Tests introduce checks without weakening an Upstream expectation.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"fail","note":"XT-config-6 directly checks its declared CLI outcomes, but XT-config-7 delegates surface verification to tools whose implementations are absent from the prompt.","findings":[{"path":"packages/config/tests/xaravel/epic-close.test.ts","detail":"Supply tools/async-surface/async-surface.ts and the implementation and script wiring of api-surface:gate. XT-config-7 relies on their exit status to establish that async-surface.json is current and the API surface has zero unexplained members; their source is needed to confirm those delegated checks verify the declared consequences.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"All supplied changes stay within packages/config. Source edits add documentation, and tests invoke existing infrastructure without implementing another Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The supplied complete changed source files and declaration inventory contain no asyncRoot tags or async methods requiring them. Synchronous env-file reads follow ESC-15.2-3 and AD-6.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 4d322d4ba6462b83f56ef61ff8477baef5688d5e

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `a52edd19ca812462c8e4f86dda84f1b717ca8edd`, on 2026-10-30T22:01:34.150Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty, and the change adds or modifies no Ported Test. Its only tests are Xaravel Tests (XT-config-6, XT-config-7), so there is no Upstream assertion to compare. |
| F-2: No expected value is weakened | pass | No Ported Test changes, so there is no Upstream expected value to weaken. XT-config-6 is a new test. Its assertStringContainsString on stderr matches its consequence (the violation appears "on stderr"), and its exit codes are exact assertSame checks. XT-config-7 is a new file with exact checks. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or modifies no Expectations line, and evidence (i) confirms there are no new skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-' marker or Expectations 'adapted' field is added. docs/config.md names DIV-12.6, DIV-12.17, DIV-10.1 and DIV-9.17 in prose, and each matches its clause text in (a), but these are documentation, not markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixtures, base or changed, and no assigned Oracle request fixtures. The Story relies on none. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-config-6: the body runs entry-scripts.ts check over fixture roots for the three cases its consequence names. For "bun entry.ts" it asserts exit 1 and the exact violation text on stderr. With the flag it asserts exit 0, "Entry scripts OK" and an empty stderr. For the chained script whose second command lacks the flag it asserts exit 1 and the violation. It also runs 'bun run entry-scripts:check' over the repository and asserts exit 0, OK and no violation line. The cited FR-20.2 (Bun's autoload doesn't change the result) is the consequence the lint enforces, per ESC-15.3-1. XT-config-7: the body checks every clause its consequence names: the api-surface gate (exit 0 and 0 unexplained); docs/config.md exists, is linked from the README and names every src/index.ts export in backticks; the Divergences section names every cited clause and only clauses recorded in decisions/; docblocks; async-surface --check; README reasons for dependencies and ported libraries; LICENSE and NOTICE contents; and no blocked-by:config line. Its citations are bare FR-20/AD-2/AD-6/AD-15 tokens, with no '<n>.<k>' bullet to mismatch. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/config: docs, README, async-surface.json, brand-getter and method docblocks, and its own tests. The source edits add only docblock comments, with no behaviour change and no stub or fake of another Component. The tests invoke Protected tools (entry-scripts, async-surface, api-surface gate) as child processes and do not re-implement them. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any changed src file. Every declared member is synchronous: Option and Some combinators, adapters, Loader, Parser, FileStore (a sync read per ESC-15.2-3) and Repository. AD-6 lists Config as sync, so the committed async-surface.json is [] and no async export lacks a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. The test header records why: Bun's autoload has no PHP counterpart. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"4d322d4ba6462b83f56ef61ff8477baef5688d5e","base":"a52edd19ca812462c8e4f86dda84f1b717ca8edd","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T22:01:34.150Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty, and the change adds or modifies no Ported Test. Its only tests are Xaravel Tests (XT-config-6, XT-config-7), so there is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes, so there is no Upstream expected value to weaken. XT-config-6 is a new test. Its assertStringContainsString on stderr matches its consequence (the violation appears \"on stderr\"), and its exit codes are exact assertSame checks. XT-config-7 is a new file with exact checks.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or modifies no Expectations line, and evidence (i) confirms there are no new skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-` marker or Expectations `adapted` field is added. docs/config.md names DIV-12.6, DIV-12.17, DIV-10.1 and DIV-9.17 in prose, and each matches its clause text in (a), but these are documentation, not markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixtures, base or changed, and no assigned Oracle request fixtures. The Story relies on none.","findings":[]},{"id":"F-7","result":"pass","note":"XT-config-6: the body runs entry-scripts.ts check over fixture roots for the three cases its consequence names. For \"bun entry.ts\" it asserts exit 1 and the exact violation text on stderr. With the flag it asserts exit 0, \"Entry scripts OK\" and an empty stderr. For the chained script whose second command lacks the flag it asserts exit 1 and the violation. It also runs `bun run entry-scripts:check` over the repository and asserts exit 0, OK and no violation line. The cited FR-20.2 (Bun's autoload doesn't change the result) is the consequence the lint enforces, per ESC-15.3-1. XT-config-7: the body checks every clause its consequence names: the api-surface gate (exit 0 and 0 unexplained); docs/config.md exists, is linked from the README and names every src/index.ts export in backticks; the Divergences section names every cited clause and only clauses recorded in decisions/; docblocks; async-surface --check; README reasons for dependencies and ported libraries; LICENSE and NOTICE contents; and no blocked-by:config line. Its citations are bare FR-20/AD-2/AD-6/AD-15 tokens, with no `<n>.<k>` bullet to mismatch.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/config: docs, README, async-surface.json, brand-getter and method docblocks, and its own tests. The source edits add only docblock comments, with no behaviour change and no stub or fake of another Component. The tests invoke Protected tools (entry-scripts, async-surface, api-surface gate) as child processes and do not re-implement them.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any changed src file. Every declared member is synchronous: Option and Some combinators, adapters, Loader, Parser, FileStore (a sync read per ESC-15.2-3) and Repository. AD-6 lists Config as sync, so the committed async-surface.json is [] and no async export lacks a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/. The test header records why: Bun's autoload has no PHP counterpart.","findings":[]}],"prior":[]}
```
