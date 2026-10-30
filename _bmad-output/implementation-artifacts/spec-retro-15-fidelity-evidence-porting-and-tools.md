---
title: 'Fidelity Review shows the PORTING.md sections a change cites and the source of the tools a changed test runs (epic-15-retro-item-3)'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: '72d5e4c44441c90c3b94a7a93b55ee00d5928258'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/MAINT-2026-10-16-unattended-orchestrator.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-retro-2026-10-30.md'
warnings: []
deferred:
  - summary: >-
      docs/ops/fidelity-review.md states WHOLE_FILE_CAP as 60,000 and the prompt cap as 600,000; the code has 200,000 and 1,000,000.
    evidence: |-
      Pre-existing mismatch, not caused by this change and already deferred by spec-retro-14-fidelity-evidence-gaps.md; it matters for whether a large tool such as api-surface.ts (102,602 characters) reads as shown in full.
    location: >-
      docs/ops/fidelity-review.md (h) bullet
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epic 15's Fidelity Reviews noted two recurring evidence gaps (retro E2, E3). E2: item 2 (#565) cites and applies `PORTING.md § PCRE conversion`, but the prompt never showed that section, so both reviewers could not confirm XT-runtime-135's "every listed form". E3: Story 15.3's XT-config-7 (#574) asserts on the exit status and output of `tools/async-surface/async-surface.ts` (spawned through `join(REPO, "tools", "async-surface", "async-surface.ts")`) and `bun run api-surface:gate`, but the prompt never showed those tools' source.

**Approach:** Add two evidence cases to (h) in `tools/fidelity-review/fidelity-review.ts`, within the 2026-10-21 amendment's "What it may change": (E2) each `PORTING.md` section a changed file cites — `PORTING.md § <heading>`, `PORTING.md's § <heading>`, `PORTING.md's <heading>` (case-insensitive heading-name prefix, longest wins) or `PORTING.md:<line>` (the section holding that line) — at tier 0 beside the cited decision records, as the section's text with entry path `PORTING.md § <full heading>`, reason `cited by <file>`; (E3) each repository TypeScript file a changed test file runs — an array-literal element that resolves (through `pathExpression`, or as a root-relative literal) to an existing non-test `.ts` file the test does not import, or the first `.ts` path in the root `package.json` script a `["run", "<script>"]` pair or a `"bun run <script>"` literal names — at tier 1 with reason `run by <test>` or ``run by <test> as `bun run <script>` ``.

## Boundaries & Constraints

**Always:** Every new entry goes through the existing budget, cap and `shown` handling, and is named as omitted for size when it does not fit. A changed target follows the same scope rule as `readData` (ESC-9.10-3). Dedupe through `listed`; a section is not added when `PORTING.md` itself is a listed changed file. Header comment and docblocks describe the new cases. Wording: one sentence in the **Whole files** evidence note of `conformance/review/fidelity.md` (above the checklist), and the (h) bullet of `docs/ops/fidelity-review.md`.

**Never:** Change an F-1..F-10 **Check.** paragraph, the verdict rule, schema, standing-reject rule, reviewer/CLI selection or the `story:check` approvals clause. Never remove or narrow evidence an existing case shows, change an existing heading or none-text, or edit an existing assertion. No `packages/**`, `AGENTS.md`, Expectations or other Protected Path edits beyond the four files named here and this item's records.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| E2 § citation | changed file says `PORTING.md § PCRE conversion lists …` | entry `PORTING.md § PCRE conversion (DIV-10)` at tier 0, text = that `##` section up to the next `##` | — |
| E2 's / line | `PORTING.md's idiom table`; `PORTING.md:243` | `Idiom table` section; the section holding line 243 | line past EOF or no heading match: no entry |
| E2 no match | `PORTING.md's spread row` | no entry | — |
| E2 PORTING changed | `PORTING.md` is a listed changed file | no section entries | — |
| E3 array path | changed test `bun([join(REPO, "tools", "t", "t.ts"), "--check"])` | `tools/t/t.ts` tier 1, `run by <test>` | missing file: no entry |
| E3 imported | the same path is a `fileImports` target | stays `imported by …`, no `run by` entry | — |
| E3 bun run | `["run", "gate:x", "a"]` or `"bun run gate:x"`, root script `bun --no-env-file tools/g/g.ts --gate` | `tools/g/g.ts` tier 1, ``run by <test> as `bun run gate:x` `` | unknown script / no package.json: no entry |
| E3 real | `packages/config/tests/xaravel/epic-close.test.ts` changed | entries for `tools/async-surface/async-surface.ts` and `tools/api-surface/api-surface.ts` | — |

</intent-contract>

## Code Map

- `tools/fidelity-review/fidelity-review.ts:39-110` -- header comment; (h) described at :76-95.
- `tools/fidelity-review/fidelity-review.ts:763` -- `wholeFileLang`: give `PORTING.md § …` labels the `markdown` fence (take the extension of the part before ` § `).
- `tools/fidelity-review/fidelity-review.ts:1047-1333` -- `wholeFileEvidence`: `add` (:1065), cited records at tier 0 (:1109-1122), `readData` (:1088) and its loop (:1123-1127) — add the E3 loop after it, before the imports frontier (:1205), excluding `fileImports` targets.
- `tools/fidelity-review/fidelity-review.ts:2413` -- `pathExpression`; `fileConsts` :2443; `testUnits`; `topLevelSplit` :2485 for array elements.
- `tools/fidelity-review/fidelity-review.ts:3019` -- `isTestPath`.
- `PORTING.md` -- `##` headings at :7..:273, e.g. `## PCRE conversion (DIV-10)` :241.
- `package.json:22-24` -- `async-surface`, `api-surface:gate` scripts.
- `packages/config/tests/xaravel/epic-close.test.ts:156,204,253` -- the E3 real case.
- `conformance/tests/xaravel/fidelity-review.test.ts:1541-1628` -- XT-conformance-161 (h) cases with `tempDir`/`write`; add the new expects after :1628.
- `conformance/review/fidelity.md` -- **Whole files** evidence note.
- `docs/ops/fidelity-review.md` -- (h) input bullet.

## Tasks & Acceptance

**Execution:**
- `tools/fidelity-review/fidelity-review.ts` -- export `portingSections(text, porting)` and `scriptRuns(path, text, exists, read)` helpers; wire both into `wholeFileEvidence`; update header comment and docblocks.
- `conformance/tests/xaravel/fidelity-review.test.ts` -- add expects inside XT-conformance-161 for every matrix row (temp roots), plus real-repo cases for item 2's `pcre.ts` citation and `epic-close.test.ts`; no existing assertion changed.
- `conformance/review/fidelity.md`, `docs/ops/fidelity-review.md` -- one sentence each, as in Boundaries.

**Acceptance Criteria:**
- Given the matrix inputs, when `wholeFileEvidence` runs, then each row's entries (path, reason, text) appear and nothing else changes.
- Given the full tool, when `bun test conformance/tests/xaravel/fidelity-review.test.ts` runs, then all tests pass.
- Given the repository, when `bun run typecheck`, `bun run lint` and `bun run harness --xaravel` run, then they report no new failures.

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- layers: blind-hunter, edge-case-hunter, verification-gap, intent-alignment; fidelity-review skipped (the item's `action` names no `packages/<component>`; MAINT-2026-10-16 amendment 2026-10-22).
- verdicts: 30 findings — high 0, medium 2, low 13, false 6, maybe-false 2, plus 7 intent-alignment observations triaged as reject
- findings:
  - `[medium]` `[patch]` (blind) every array literal is taken as a spawn list — confirmed by a scan of the repo's tests: `toEqual([…])`, `expect([…])` and `for … of [ … ]` in fidelity-review.test.ts gave `run by` entries; arrays that are direct arguments of `expect(`/`.to<Matcher>(`/`assert…(` or follow `of`/`in` are now skipped, with tests.
  - `[low]` `[reject]` (blind) a citation that names no section adds no `unavailable` entry — the citing text is shown in the changed file itself; an unavailable entry is new surface for a case with nothing to show.
  - `[low]` `[patch]` (blind) a citation wrapped across `//` comment lines resolves to nothing (`Container.ts:15-16` shape) — `named` strips leading comment markers; test added.
  - `[low]` `[reject]` (blind) `../PORTING.md § X` and `#anchor` forms not recognised — a Markdown link's text (`[PORTING.md § …]`) still matches; no anchor-only citation exists in the repo.
  - `[low]` `[reject]` (blind) `PORTING.md:<line>` may drift — the entry's heading names the section shown, so the reviewer sees which section it is; marking staleness needs history the tool does not read.
  - `[low]` `[patch]` (blind) the two docs list the citation forms differently; fidelity.md subject-verb agreement — fidelity.md now lists the `'s §` form and reads "comes".
  - `[low]` `[patch]` (blind) `changed; run by` reason undocumented and untested — same root cause as the edge-case dead-branch row; the prefix is removed.
  - `[low]` `[reject]` (blind) script forms not followed (chained tools, workspace scripts, `--cwd`, mid-string `bun run`) — none occurs in the repo's tests (scan above); each adds a branch for an unobserved form.
  - `[low]` `[reject]` (blind) fence tracking ignores marker kind and length — PORTING.md has no nested or mixed fences; unlikely and needs a fence parser.
  - `[false]` `[reject]` (blind) duplicate headings collide — PORTING.md's `##` headings are unique today; a duplicate would also break its own `§` citations.
  - `[low]` `[reject]` (blind) header comment lines exceed the wrap width — cosmetic; the header already mixes widths.
  - `[false]` `[reject]` (blind) the spec records no verification and stale Code Map lines — the fix is an edit of this build's spec.
  - `[low]` `[patch]` (edge) the `changed; ` prefix is dead: a changed in-scope `.ts` tool is listed at tier 2 before the loop — prefix dropped; test asserts it stays `changed`.
  - `[low]` `[patch]` (edge) `PORTING.md:<count+1>` maps to the last section because of the trailing empty split element — line count excludes it; test added.
  - `[low]` `[patch]` (edge) wrapped `//` citation — duplicate of the blind row above, same patch.
  - `[false]` `[reject]` (edge) duplicate headings / mixed fences — as the blind rows above.
  - `[maybe-false]` `[reject]` (edge) a regex literal with a quote or `[` corrupts the array scanner — the scan of every repo test file gave no spurious or missing entry attributable to it; if true it would only be low (a missed or extra entry).
  - `[medium]` `[patch]` (edge, merged with blind data-array row) data arrays treated as spawn lists — patched there.
  - `[low]` `[reject]` (edge) a `./tools/x.ts` literal resolves against the test's directory — no test in the repo spawns a `./`-prefixed root path; `pathExpression` treats `./` as relative everywhere else.
  - `[low]` `[reject]` (edge) a spawn through an imported `REPO` constant is missed — no test in the repo imports `REPO` for a spawn (grep); `readData` has the same reach.
  - `[medium]` `[patch]` (edge, `bun run` mentioned in text) — confirmed: the backtick `bun run upstream:sync` in a `//` comment (contracts tests :9) pulled `tools/upstream/upstream.ts` into tier 1 for every contracts test; literals are now matched in code with comments removed, test added. Flags before the script name: `[low]` `[reject]`, no such call in the repo.
  - `[maybe-false]` `[reject]` (edge) `bun run x` inside an assertion message string — a message rarely starts with `bun run`; the repo scan found none; if true only low.
  - `[low]` `[patch]` (verification-gap) the in-scope changed tool case is unasserted — the branch was dead (edge row); test now asserts the tier-2 `changed` result.
  - `[low]` `[patch]` (verification-gap) only changed test files bring run targets, unasserted — test added for a changed non-test file holding a spawn array.
  - `[false]` `[reject]` (intent) R2b "applies" without citing — a change that applies a section without naming it cannot be detected from text; #565 cites it, and the matrix row is met.
  - `[false]` `[reject]` (intent) R3b non-test checks — the recorded gap (XT-config-7) is a test; a check script is itself a changed file shown whole.
  - `[low]` `[reject]` (intent) R3c a run tool's own imports are not followed — the recorded finding asked for `async-surface.ts` and `api-surface:gate`'s source, both now shown in full; following a tool's import tree would add up to several hundred kB at tier 1.
  - `[false]` `[reject]` (intent) real-cap prompt reruns of #565/#574 not reproduced — needs the reviewer CLIs; the real-repo cases show each mechanism, and the next counted review will show it.
  - `[low]` `[reject]` (intent) heuristic boundaries — recorded in the docblocks; scanned against every test in the repo.
  - `[low]` `[defer]` (intent) docs/ops/fidelity-review.md states `WHOLE_FILE_CAP` 60,000 and the cap 600,000; code has 200,000 and 1,000,000 — pre-existing, already deferred by spec-retro-14-fidelity-evidence-gaps.md.
  - `[false]` `[reject]` (intent) constraint compliance — observation that the change complies; no defect.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/fidelity-review.test.ts` -- expected: 0 fail
- `bun run typecheck` -- expected: exit 0
- `bun run lint` -- expected: exit 0
- `bun run harness --xaravel` -- expected: SUMMARY with no differences (NOT-RUN variants allowed)

## Auto Run Result

Status: done

**Summary.** `bun run fidelity:review` now supplies the two kinds of evidence Epic 15's reviews found missing (retro E2, E3), within the 2026-10-21 amendment's "What it may change":
- E2: each `PORTING.md` `##` section a changed file cites (`PORTING.md § <heading>`, `PORTING.md's § <heading>`, `PORTING.md's <heading>`, `PORTING.md:<line>`, including citations wrapped onto the next `//` or `*` comment line) is shown in (h) at tier 0 beside the cited records, headed `PORTING.md § <full heading>` (`portingSections`). `pcre.ts` now brings `PORTING.md § PCRE conversion (DIV-10)`.
- E3: each repository `.ts` tool a changed test file runs and does not import is shown in (h) at tier 1, headed `run by <test>` or ``run by <test> as `bun run <script>` `` (`scriptRuns`). It finds spawn argument arrays (not arrays an assertion or a loop takes as data) and `bun run <script>` string literals (not comments, not a quote inside another literal), resolved through the root `package.json`. `epic-close.test.ts` now brings `tools/async-surface/async-surface.ts` and `tools/api-surface/api-surface.ts`.

**Files.**
- `tools/fidelity-review/fidelity-review.ts`: `portingSections`, `scriptRuns` and their helpers, the (h) wiring, Markdown fence for section entries, header comment and docblocks.
- `conformance/tests/xaravel/fidelity-review.test.ts`: new expects in XT-conformance-161 for every matrix row, the review patches and the two real-repo cases. No existing assertion changed.
- `conformance/review/fidelity.md`: one sentence in the **Whole files** evidence note. No Check paragraph changed.
- `docs/ops/fidelity-review.md`: one sentence in the (h) bullet.

**Review.** 30 findings from four layers (Fidelity Review skipped: the item's `action` names no `packages/<component>`). 10 rows patched: data arrays taken as spawn lists (medium), `bun run` mentions in comments and inside other literals (medium), the dead `changed; run by` branch, the `PORTING.md:<count+1>` off-by-one, wrapped comment citations, the fidelity.md wording, and tests for each. 1 deferred: the pre-existing cap numbers in the ops doc. The rest rejected, each with its reason in the triage log.

**Follow-up review recommended: true.** Two medium entries were patched on this first pass. The named risk is the heuristic scanners' precision over real tests: a scan of every test file in the repository after the patches shows only real tool runs except one, `tools/expectations/reasons.ts` for `fidelity-review.test.ts`, from a regex literal at :964 that the scanner does not parse.

**Verification.** `bun test conformance/tests/xaravel/fidelity-review.test.ts`: 3 pass, 0 fail. `bun run typecheck` and `bun run lint`: exit 0. `bun run harness --xaravel`: tests=526 passed=521 failed=0 skipped=5, `SUMMARY … differ=0`.

**Residual risks.** Regex literals are not parsed by the array and literal scanners (one known extra entry above). A run tool's own imports are not followed. A citation that names no `PORTING.md` heading adds nothing.
