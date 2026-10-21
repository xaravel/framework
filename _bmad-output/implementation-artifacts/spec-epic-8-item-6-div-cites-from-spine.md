---
title: 'Epic 8 retro item 6: DIV cites from the spine Binds lines'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: 'efdde9198a25ddd5b70df01ed0722a6bde6c9626'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The architecture spine's `Binds:` lines bind DIV records to ADs, but the records' `cites` frontmatter disagrees (DIV-5, DIV-7, DIV-8 have `cites: []`; DIV-1 and DIV-3 lack AD-1; DIV-4 lacks AD-24; DIV-12 lacks AD-7), and `divergence.test.ts` hard-codes `EXPECTED_CITES` copied from the records, so XT-conformance-149's "AD cites" check is vacuous (Epic 8 retro finding S6, action item `epic-8-retro-item-6-div-cites-from-spine`).

**Approach:** Add the missing AD ids to each record's `cites` frontmatter, and replace `EXPECTED_CITES` with a parse of the spine: each `### AD-<n>` section's `- **Binds:**` line yields the DIVs it binds; a record must cite every AD that binds it, and may cite an extra AD only when that AD's section names the DIV (AD-13 names DIV-11 in its Tests rule).

## Boundaries & Constraints

**Always:** Edit only the `cites:` line of `decisions/DIV-*.md` frontmatter; keep each record's existing cites and their order, appending the missing ones in AD-number order. The test reads the spine at test time; no expected AD list for a DIV is written in the test.

**Never:** Change any clause, rationale, behaviour section, title, `sources` or `fewer_assertions`. Never edit the spine, PRD, SPEC, `epics.md`, `AGENTS.md` or `tools/divergence/`. Never drop AD-13 from DIV-11 (XT-conformance-150 requires it).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bound DIV | AD-11 Binds lists DIV-5 | DIV-5 `cites` must contain AD-11 | Test fails if missing |
| Unbound DIV | DIV-6, DIV-10 bound by no AD | `cites` may be `[]` (or only ADs whose section names the DIV) | — |
| Extra cite named in section | DIV-11 cites AD-13; AD-13 section text names DIV-11 | Accepted | — |
| Extra cite not in spine | A record cites an AD whose section never names the DIV | Test fails | — |
| Spine parse found nothing | Heading or Binds format changed | Test fails (sanity: 28 AD sections, every one with a Binds line, at least one DIV binding) | — |

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md` -- read-only source. Sections `### AD-<n> — <title>` (lines 74–549), each with `- **Binds:** ...` as its first bullet. DIV bindings today: AD-1 DIV-1, DIV-3; AD-4 DIV-3; AD-5 DIV-11; AD-6 DIV-1, DIV-8; AD-7 DIV-12; AD-8 DIV-2; AD-9 DIV-9; AD-10 DIV-7; AD-11 DIV-5; AD-14 DIV-4; AD-24 DIV-4; AD-25 DIV-11; AD-26 DIV-12. AD-13's Tests bullet (line 318) names DIV-11.
- `decisions/DIV-1.md`..`DIV-12.md` -- frontmatter line 4 `cites: [...]`. Targets: DIV-1 `["AD-6","AD-1"]`, DIV-3 `["AD-4","AD-1"]`, DIV-4 `["AD-14","AD-24"]`, DIV-5 `["AD-11"]`, DIV-7 `["AD-10"]`, DIV-8 `["AD-6"]`, DIV-12 `["AD-26","AD-7"]`; DIV-2, 6, 9, 10, 11 unchanged.
- `conformance/tests/xaravel/divergence.test.ts:73-86` -- `EXPECTED_CITES` constant to remove; `:125` the assertion using it; `:16` `PRD` path constant pattern to follow for a `SPINE` constant.
- `tools/divergence/divergence.ts:108` -- checks only that `cites` is a list of strings; unchanged.

## Tasks & Acceptance

**Execution:**
- `decisions/DIV-{1,3,4,5,7,8,12}.md` -- edit the `cites:` frontmatter line in place to the targets above -- align records with the spine.
- `conformance/tests/xaravel/divergence.test.ts` -- replace `EXPECTED_CITES` with a `spineBindings()` helper that parses AD sections into `{ binds: Set<DIV n>, names: Set<DIV n> }` per AD; in XT-conformance-149 assert each record's `cites` contains every AD binding it, every cite names an AD section whose text names that DIV, cites has no duplicates, plus the parse sanity checks -- derive expectations from the source contract. Put the comparison in a pure helper (e.g. `citeProblems(n, cites, bindings)` returning problem strings) and, inside XT-conformance-149, exercise each I/O matrix row on synthetic inputs (missing bound AD, extra AD the section names, extra AD it does not name, duplicate cite) plus the sanity checks on the real spine.

**Acceptance Criteria:**
- Given the current spine and records, when `bun test conformance/tests/xaravel/divergence.test.ts` runs, then it passes.
- Given a record missing an AD whose Binds line names it (e.g. DIV-5 `cites: []`), when the test runs, then XT-conformance-149 fails.
- Given the edits, when `git diff decisions/` is inspected, then only `cites:` lines changed.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 14 findings — high 0, medium 0, low 12, false 2, maybe-false 0
- findings:
  - `[low]` `[patch]` (edge) A Binds line in range notation `DIV-a..DIV-b` drops the middle DIVs from `binds` — no such line exists today; patched: the spine parse now fails loudly on a DIV range in a Binds line.
  - `[low]` `[patch]` (edge) Duplicate `### AD-n` headings overwrite each other and the 28-key check still passes — patched: a duplicate AD heading fails the parse.
  - `[low]` `[patch]` (blind) `divNumbers` misses DIV ranges — same root cause as the edge range finding; patched with it.
  - `[low]` `[reject]` (blind) The "some section binds a DIV" sanity check is too weak to catch a partial parse — every AD section must already have a `- **Binds:**` line, so a format change fails; a DIV moved to a continuation line is unlikely and the fix would hard-code a binding count copied from the data, which the item set out to remove.
  - `[low]` `[reject]` (blind) The "section names the DIV" allowance accepts any passing mention (DIV-7 could cite AD-4) — real but low: such an AD does discuss the DIV, cites are reference metadata, and the rule is the intent contract's resolution for DIV-11/AD-13 (spine line 683); tightening it adds a second rule for one case. Binds-required cites, the item's target, are enforced exactly.
  - `[low]` `[reject]` (blind) The newly added cites have no mention in the record bodies — the intent forbids changing rationale or behaviour sections; out of scope by the intent.
  - `[low]` `[reject]` (blind) The spec does not say `decisions/` and `conformance/tests/` are Protected Paths — fix edits this build's spec; the orchestrator's PR handling covers the expected `protected-paths` result.
  - `[false]` `[reject]` (blind) Sprint status still lists the action item open — the orchestrator sets it done with SPS after this run, as the intent says.
  - `[low]` `[patch]` (blind) A duplicate cite repeats the section check's message — patched: `continue` after recording the duplicate, with a synthetic duplicate-unknown case.
  - `[low]` `[patch]` (blind) No synthetic case for a DIV bound by two ADs that cites one — patched: added.
  - `[low]` `[reject]` (blind) The spec's Code Map line numbers will go stale — fix edits this build's spec.
  - `[low]` `[reject]` (blind) Appended cites leave mixed order (`["AD-6", "AD-1"]`) — the intent contract keeps existing order and appends; sorting would rewrite unchanged cites, and the test does not depend on order.
  - `[low]` `[patch]` (blind) The test header does not say XT-conformance-149 now reads the spine — patched: header sentence added.
  - `[false]` `[reject]` (intent) The test enforces Binds ⊆ cites ⊆ section mentions rather than an exact Binds-derived list — descriptive; the exact reading would drop DIV-11's AD-13, which XT-conformance-150 requires; the diff implements the intent contract's stated rule (same matter as the "names" allowance row).

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/divergence.test.ts` -- expected: all pass
- `bun run divergence:check` (or `bun tools/divergence/divergence.ts check`) -- expected: exit 0
- `bunx tsc --noEmit -p .` and `bunx oxlint conformance/tests/xaravel/divergence.test.ts` -- expected: clean
- Mutation probe in a temp copy: setting DIV-5 `cites: []` makes the test fail.

## Auto Run Result

Status: done

**Summary.** The seven DIV records whose `cites` disagreed with the spine now cite every AD whose `Binds:` line binds them, and XT-conformance-149 derives the required cites from the spine's AD sections instead of the hard-coded `EXPECTED_CITES` list (Epic 8 retro finding S6, item 6).

**Files changed.**
- `decisions/DIV-1.md`, `DIV-3.md` -- `cites` gains AD-1.
- `decisions/DIV-4.md` -- `cites` gains AD-24.
- `decisions/DIV-5.md`, `DIV-7.md`, `DIV-8.md` -- `cites` becomes AD-11, AD-10, AD-6.
- `decisions/DIV-12.md` -- `cites` gains AD-7.
- `conformance/tests/xaravel/divergence.test.ts` -- `spineBindings`, `divNumbers` and `citeProblems` replace `EXPECTED_CITES`; parse sanity checks and synthetic cases for each matrix row.

**Review.** 14 findings: 5 patched (all low: DIV-range guard, duplicate AD heading guard, duplicate-cite dedupe, two-binding synthetic case, header comment), 0 deferred, 9 rejected with reasons in the triage log (two false; seven low, excluded by the intent, spec-only edits, or not worth the added rule). Patched by verdict: high 0, medium 0, low 5. Follow-up review recommended: false.

**Verification.** `bun test conformance/tests/xaravel/divergence.test.ts` 4 pass, 0 fail; `bun run divergence:check` OK (12 records, 39 clauses); `tsc --noEmit -p .` exit 0; `oxlint` on the test clean; `bun run lint` ok. Mutation probes (by the implementer and the verification-gap reviewer, in a copy): DIV-5 `cites: []` fails with "missing AD-11"; an unnamed extra AD fails. `git diff decisions/` changes only `cites:` lines.

**Residual risks.** An extra cite is accepted whenever the AD's section text names the DIV (the rule that keeps DIV-11's AD-13), so a loosely related cite can pass; the required, Binds-derived cites are enforced exactly. The new cites have no matching mention in the record bodies, which this item was not allowed to change.
