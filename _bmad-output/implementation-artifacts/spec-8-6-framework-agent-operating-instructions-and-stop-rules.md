---
title: 'Story 8.6: Framework Agent operating instructions and stop rules'
type: 'feature'
created: '2026-10-20'
baseline_revision: '66b88333f74991cd50fac23c5829868d81d83bd5'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 8.6's ACs require `AGENTS.md` to hold the Framework Agent's Story loop and FR-114 stop rules outside the `bmad:context` block, with no `CLAUDE.md`. The Maintainer added the section under ESC-8.6-1 (`decisions/ESC-8.6-1.md`), but nothing pins it, so a later edit or a `bmad-project-context` refresh could drop it without anyone noticing.

**Approach:** Add XT-conformance-163..165 in one new test file. They read the real `AGENTS.md` and the repository's tracked files, and check each AC through a pure checker. The tests also run that checker on mutated copies of the text, so each test shows it fails when the rule it guards is dropped.

## Boundaries & Constraints

**Always:**
- The ID-to-AC mapping follows `stories/8.6.md`. XT-conformance-163 is AC1: the loop, outside the managed block, and no `CLAUDE.md`. XT-conformance-164 is AC2: every FR-114 trigger, and an Escalation stops only its own Test IDs. XT-conformance-165 is AC3: no stubbing, and `blocked-by:<component>`.
- Derive the trigger list from `TRIGGERS` in `tools/escalations/escalations.ts`, and check that its length equals the number of FR-114 trigger bullets in the PRD. Adding a trigger on either side then fails the test.
- Check the real repository read-only. Mutations run on in-memory strings only.
- Fail closed. A missing marker, section, file or `git` failure is a violation, never a skip.
- Fix the stale source line in `stories/8.6.md` (2788 to 2901), and set its `status` and the sprint-status key to `done` when finished.

**Never:**
- Edit `AGENTS.md` (Maintainer-only, ESC-8.6-1), or create a `CLAUDE.md`.
- Add a new tool under `tools/`, a package script or a CI job. The tests are the deliverable.
- Pin exact whole-section wording. Check the required elements (order, slugs, the two rules), so that the Maintainer can still reword the prose.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Real repo | current `AGENTS.md`, tracked files | no violations for each XT | — |
| Section inside block | section moved before `<!-- /bmad:context -->` | violation "outside the managed block" | test asserts the violation |
| Markers missing/duplicated | no open or close marker, or two of either | violation naming the marker | — |
| Section missing | heading removed | violation "section missing"; every other check reports against an empty section | — |
| Loop step dropped or reordered | swap steps 3 and 4, or delete step 5 | violation naming the step expected at that position | — |
| Trigger dropped | `(\`flaky\`)` removed | violation naming `flaky` | — |
| Own-IDs / carry-on rule dropped | sentence removed | violation | — |
| Stub rule or `blocked-by:<component>` dropped | sentence removed | violation | — |
| `CLAUDE.md` present | a tracked path whose basename is `CLAUDE.md` (any case), at any depth, or one at the repo root | violation naming the path | `git ls-files` non-zero exit is a violation |

</intent-contract>

## Code Map

- `AGENTS.md:1,45`: the `<!-- bmad:context -->` and `<!-- /bmad:context -->` markers. `:47` has `## Story loop and stop rules`, which runs to EOF (to the next `## ` heading in general): seven numbered steps, seven trigger bullets each ending `(\`<slug>\`)`, the own-Test-IDs paragraph and the stub paragraph. Read-only.
- `tools/escalations/escalations.ts:95`: `export const TRIGGERS` (7 slugs). Import it.
- `_bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md:343-353`: `#### FR-114`, the trigger bullets (`- ` lines) between the heading and `**Consequences (testable):**`. That is 7 bullets.
- `conformance/xaravel-consequences/conformance.jsonl:50`: `FR-114.2` ("The agent goes on with other assigned Test IDs"). Cite it in XT-conformance-164's consequence string. 163 and 165 have no matching consequence id, so cite them bare as `(FR-114, UJ-4, NFR-10)`; a bare id declares nothing (`tools/xt-coverage/consequences.ts:60`).
- `conformance/tests/xaravel/porting.test.ts`, `repository-policy.test.ts`: the file-header comment, the `root = resolve(import.meta.dir, "..", "..", "..")` and `xaravelTest` import patterns. `expect` from `bun:test` is allowed in Xaravel Tests.
- `packages/assert/src/index` → `xaravelTest(id, consequence, fn)`. The harness discovers `conformance/tests/xaravel/**/*.test.ts`. `tsconfig.json` already includes `conformance/**/*.ts`.
- `stories/8.6.md`: the `Source:` line says 2788 and should say 2901. Set `status` there.

## Tasks & Acceptance

**Execution:**
- [ ] `conformance/tests/xaravel/agent-instructions.test.ts` -- create. It has:
  - **A header comment** naming Story 8.6, FR-114, UJ-4, NFR-10 and ESC-8.6-1.
  - **Pure exported-in-file helpers:**
    - `storyLoopSection(text)`, which returns `{section, violations}` for the marker and placement checks;
    - `loopViolations(section)`;
    - `triggerViolations(section, triggers)`;
    - `stopRuleViolations(section)`, for the own-IDs and carry-on rules;
    - `stubRuleViolations(section)`;
    - `claudeMdViolations(root)`, which uses `git ls-files -z` and an `existsSync` check of the root `CLAUDE.md`.
  - **Three `xaravelTest`s**, one per matrix row group. Each asserts no violations on the real files, then runs each mutation from the matrix and asserts that its specific violation appears.
  - **The FR-114 count check**, inside XT-conformance-164: the PRD's FR-114 trigger bullet count equals `TRIGGERS.length`, and is non-zero.
- [ ] `stories/8.6.md` -- fix the source line, and set `status: done` at the end -- keeps the manifest in step with sprint status (lesson, epic 1/5).
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `8-6-...: done` at the end.

**Acceptance Criteria:**
- **XT-conformance-163.** Given the repository, when it runs, then it passes only if `AGENTS.md` has exactly one pair of managed-block markers, `## Story loop and stop rules` sits after the close marker, and its numbered list has the seven loop steps in order: manifest + `PORTING.md` + DIVs; translate; `harness --fast --story`; implement; own Expectations lines; full Story tests; open the PR. No `CLAUDE.md` may be tracked or present at the root.
- **XT-conformance-164.** Given the section, when it runs, then every `TRIGGERS` slug appears as `(\`<slug>\`)` on a bullet line. The PRD's FR-114 bullet count must equal `TRIGGERS.length`, and the section must say that an Escalation stops work on its own Test IDs only and that the agent carries on with the other Test IDs.
- **XT-conformance-165.** Given the section, when it runs, then it forbids stubbing, faking or partially implementing another Component, and names `blocked-by:<component>` for a test that needs a later Component.
- Given any matrix mutation, when the matching checker runs on it, then it reports the specific violation, so each test can fail.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 17, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` edge: `triggerViolations` uses `includes` but the message says "ends" — message changed to "names".
  - `[low]` `[reject]` edge: a second numbered list, or an indented or `1)` list, breaks the count — AGENTS.md has one list; a future change fails loudly and visibly, and handling it adds branches.
  - `[false]` `[reject]` edge: heading inside a fenced block elsewhere — AGENTS.md has no fenced block with that heading; a duplicate fails loudly.
  - `[low]` `[reject]` edge: `mutatedSection` locates the heading by substring — test-only helper, the heading text appears once; `mutate` asserts its target exists, so a misplaced mutation fails visibly.
  - `[low]` `[patch]` edge: `String.replace` expands `$` patterns in the replacement — switched to a replacer function.
  - `[low]` `[reject]` edge: an untracked `.claude/CLAUDE.md`, `CLAUDE.local.md` or `Claude.md` is missed — untracked files cannot reach `main`; the tracked scan (any depth, any case) covers what a PR can merge; a tree walk adds cost for no merged-state gain.
  - `[low]` `[reject]` edge: a tracked `CLAUDE.local.md` is not flagged — the policy and the AC name `CLAUDE.md` only; widening it is a Maintainer call.
  - `[low]` `[reject]` edge: `GIT_DIR` set, or `TMPDIR` inside a work tree, makes the not-a-repo case pass git — neither holds in CI or the harness; guarding it adds env plumbing.
  - `[false]` `[reject]` edge: an FR-114 block with no Consequences line counts later bullets — the PRD has the line (prd.md:354), and a miscount fails the equality loudly.
  - `[low]` `[patch]` edge: `/other Test IDs/` matches unrelated sentences — now `/Carry on with [^.]*other Test IDs/i`.
  - `[false]` `[reject]` blind: spec file not in the diff — the spec is the run's claims file, deliberately excluded from the reviewed diff; it is committed with the Story.
  - `[low]` `[reject]` blind: slugs are not paired with their PRD bullets — a shuffle is unlikely, and pairing needs a keyword map (new surface); the count check and per-slug presence hold the AC "list every trigger".
  - `[low]` `[patch]` blind: header claims no prose is pinned — reworded to name the fixed rule phrases ESC-8.6-1 item 2 allows.
  - `[false]` `[reject]` blind: `\bimplement\b` matches the stub sentence's "partially implement" — loop checks read only numbered items, and the stub sentence is not one.
  - `[low]` `[reject]` blind: steps 1, 2, 4 and 7 do not check `packages/<component>/**`, `test_ids` or the branch name — the AC names the steps at the granularity checked; tighter matchers pin more prose than ESC-8.6-1 requires.
  - `[low]` `[patch]` blind: duplicate of edge `/other Test IDs/` — same fix.
  - `[low]` `[patch]` blind: duplicate of edge "ends" vs `includes` — same fix.
  - `[low]` `[patch]` blind: open-after-close marker and duplicate-heading branches never exercised — mutation assertions added.
  - `[low]` `[reject]` blind: untracked nested `CLAUDE.md` missed — same as the edge finding above.
  - `[low]` `[patch]` blind: section swallows text after a later `# ` heading — the section now ends at `/^#{1,2} /`.
  - `[false]` `[reject]` blind: useful instructions (escalation folder, story:check gate, fast-run rule) unguarded — outside the ACs; the ACs' elements are all pinned.
  - `[low]` `[patch]` blind: `markerLines` doc wording and the `REAL` declaration order — fixed.
  - `[false]` `[reject]` blind: Story marked done before the done check — `story:check 8.6` was run: every clause passes except `approvals` (no Fidelity reviewers yet, ESC-8.5-1), recorded under Auto Run Result.
  - `[false]` `[reject]` intent: the ID split differs from the invocation brief — the brief conflicted with the manifest's AC table and epics.md, which the brief itself cites; the diff follows them (FR-115, one AC per test in order). Its other notes (pinned phrases, extra checks, done status) are covered by the rows above or follow the orchestrator's process.

## Design Notes

**Loop step matchers (position i must match matcher i; list items are the lines matching `^\d+\. `):**
1. `stories/<story-id>.md` and `PORTING.md` and `DIV-`
2. `/\btranslate\b/i`
3. `harness --fast --story`
4. `/\bimplement\b/i`
5. `/own Expectations lines/`
6. `/full Story tests/` and `harness --story`
7. `/open the PR/i`

The list must contain exactly seven items. A mismatch reports, for example, `loop step 4 must say implement, got: "Run …"`.

**Rule matchers:**
- Own IDs: `/Escalation stops work on its own Test IDs only/`. Carry on: `/other Test IDs/`.
- Stub rule: `/Never stub, fake or partially implement another Component/` and the literal `` `blocked-by:<component>` ``.

These are fixed phrases on purpose: they are the rules ESC-8.6-1 item 2 allows the tests to pin.

## Verification

**Commands:**
- `bun run harness --xaravel --id XT-conformance-163 --id XT-conformance-164 --id XT-conformance-165` -- expected: all pass.
- `bun run typecheck`, `bun run lint`, `bun run escalations:check`, `bun run test` -- expected: exit 0.
- `bun run harness --story 8.6` and `bun run story:check 8.6` -- expected: passes, except the `approvals` clause. Fidelity reviewers are not configured yet (ESC-8.5-1), so record that result rather than hide it.

## Auto Run Result

Status: done

**Summary.** Story 8.6 pins the `## Story loop and stop rules` section of `AGENTS.md`, which the Maintainer wrote under ESC-8.6-1. The section itself is unchanged. Three Xaravel Tests check it, one per AC in manifest order:
- **XT-conformance-163 (AC1).** It checks:
  - there is exactly one pair of `bmad:context` markers;
  - the section sits after the close marker;
  - its numbered list holds the seven loop steps in order;
  - no `CLAUDE.md` is tracked, at any depth and in any case, and none is present at the root.
- **XT-conformance-164 (AC2).** It checks:
  - every `TRIGGERS` slug appears as ``(`<slug>`)`` on a bullet;
  - the PRD's FR-114 trigger bullet count equals `TRIGGERS.length`;
  - the "Escalation stops work on its own Test IDs only" rule is there;
  - the carry-on rule is there.
- **XT-conformance-165 (AC3).** It checks the no-stub rule and `` `blocked-by:<component>` ``.

Each test also mutates an in-memory copy of the text and asserts the specific violation, so each one can fail. A mutation whose target text is missing fails the test.

**Files changed:**
- `conformance/tests/xaravel/agent-instructions.test.ts` is new: the checkers and the three tests.
- `stories/8.6.md`: the source line now says 2901, and the status is `done`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 8.6 is `done`.

**Review.** The review raised 24 findings: 10 patched (all `low`), 0 deferred and 14 rejected. Each rejection and its reason is in the Review Triage Log. Patched by verdict: high 0, medium 0, low 10, of which 3 were duplicate rows. Follow-up review: `false`.

**Verification:**
- `bun run harness --xaravel --id XT-conformance-163 --id XT-conformance-164 --id XT-conformance-165`: 3 of 3 pass (89 assertions).
- `bun run typecheck`, `bun run lint` and `bun run escalations:check`: exit 0.
- `bun run test`: 282 tests, 0 failures.
- `bun run story:check 8.6`: every clause passes except `approvals`, which reports "0 approval(s) from distinct reviewers other than edanisko; 2 needed". The Fidelity reviewer Apps wait on ESC-8.5-1, the same state Story 8.5 merged in.
- `bun run harness --story 8.6` refuses the manifest with "lists no test_ids", as documented for a manifest with no Ported Test IDs. The spec's Verification line expecting it to pass was wrong. `story:check`'s `tests` clause covers this case ("none assigned").

**Residual risks.**
- The rule checks match fixed phrases, as ESC-8.6-1 item 2 allows. If the Maintainer rewords those sentences, the tests fail by design.
- The `CLAUDE.md` check sees tracked files and the repository root only. Untracked nested files cannot reach `main`.
