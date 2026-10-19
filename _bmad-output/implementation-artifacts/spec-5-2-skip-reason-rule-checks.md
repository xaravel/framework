---
title: 'Story 5.2: Skip Reason rule checks'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'c15925c0b8ad72544989a97cb9d6a7789fd8b932'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-variant-vocabulary-and-expectations-file.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 5.1's `expectations:check` validates only shape and coverage; nothing checks an Expectations line's `status`, its Skip Reason against the FR-3 rule, or its `escalation`, so an agent could raise conformance by mislabelling a test (FR-3, SM-C1). The `deferred-items` and `non-goals` lists the rules need do not exist, and the FR-3 precedence order is documented nowhere in `conformance/`.

**Approach:** Add `tools/expectations/reasons.ts` (`bun run expectations:reasons`), which validates every line's status, reason and escalation against its rule; transcribe the Protected `conformance/deferred-items` (PRD §7.2) and `conformance/non-goals` (PRD §7.1); document the rules and the precedence order in `conformance/README.md`; run the check in CI's required `check` job; cover each AC with XT-conformance-92..100.

## Boundaries & Constraints

**Always:**
- Status vocabulary: `pass`, `fail-known`, `skip`, `quarantined` (PRD §3). Anything else is `unknown status`. `skip` needs a reason; any other status needs `reason: null`.
- Skip Reason vocabulary and rules, one violation per broken line, naming `<shard>:<line>`, the id, variant and rule:
  - `not-ported-yet`: always valid.
  - `blocked-by:<c>`: `<c>` is a `name` in `tools/scaffold/packages.jsonl` and its `phase` is greater than the `phase` of the row named by the line's Inventory `component`.
  - `intentional-divergence:DIV-<n>`: `<n>` matches `[1-9][0-9]*` and `decisions/DIV-<n>.md` exists.
  - `php-only`: `escalation` names an Escalation whose `escalationStatus` is `approved` and whose `test_ids` lists the line's `id`.
  - `upstream-skip`: the Inventory entry's `oracle[<variant>]` is `skip` or `fail` (absent is a violation).
  - `deferred:<item>`: `<item>` is a member of `conformance/deferred-items`.
  - `out-of-scope:<NG-N>`: `<NG-N>` is a member of `conformance/non-goals`.
  - Anything else, including an empty or prefix-only reason (`blocked-by:`), is `unknown reason`.
- `quarantined`: `escalation` names an Escalation whose status is `open` and whose `test_ids` lists the `id`.
- On every line, a non-null `escalation` must be a known Escalation (`escalationStatus` throws ⇒ violation, never a crash). `escalation` is required only for `php-only` and `quarantined`.
- `conformance/deferred-items` and `conformance/non-goals` use the `conformance/variants` file format: UTF-8, LF, `#` comments and blank lines ignored, members sorted (`compareUnits`) and unique. Members: deferred-items `[a-z0-9]+(-[a-z0-9]+)*`; non-goals `NG-[1-9][0-9]*`. A bad member is a violation naming file:line. Header comment names its PRD section and that it is Protected.
- `deferred-items` members, each with a comment quoting its §7.2 bullet: `ai-sdk`, `beanstalkd`, `boost-agent-skills`, `boost-docs-search`, `boost-record-rule`, `browser-tests`, `email-spoof`, `foundation-cloud`, `laravel-14-resync`, `mail-transports`, `mariadb-driver`, `mysql-driver`, `redis-cluster`, `sqlsrv-driver`, `sqs`, `windows`. Slugs already in `epics.md` are used verbatim. `non-goals`: `NG-1`..`NG-7`, each with its §7.1 title as a comment.
- CLI follows `tools/expectations/expectations.ts`: `bun tools/expectations/reasons.ts [check] [--root <dir>]`, exit 0 / 1 / 2, violations on stderr, success `Skip Reasons OK: <n> line(s) checked.` Read lines with `readExpectations` and the Inventory with `readWorkingInventory` (pin-bump); package rows with `readTable`; Escalations with `escalationStatus` and `parseEscalation`. Don't fork them.
- `conformance/README.md` documents the status and Skip Reason vocabulary, each rule, and the FR-3 precedence order as a numbered list: 1 `upstream-skip`; 2 `intentional-divergence`, `blocked-by`, `not-ported-yet`; 3 `php-only` / `deferred` / `out-of-scope`; plus "when in doubt, pick the reason that counts against conformance".
- Xaravel Tests in `conformance/tests/xaravel/skip-reasons.test.ts`, `bun:test`, hermetic `mkdtemp` fixture roots; the real repo is only read. One `XT-conformance-<n>` per AC, in manifest order.
- Raise `conformance/escalations/ESC-5.2-1.md` (`trigger: contract`, `test_ids: [XT-conformance-100]`): AC 9's "reviewers' checklist (Epic 8) references it" needs Story 8.5's `conformance/review/fidelity.md` to cite `conformance/README.md`'s precedence section; 8.5's AC says only "its precedence is right". AC 9 ships conditional on it.

**Never:**
- No change to `expectations:check`, `tools/pin-bump/`, `tools/escalations/`, `tools/scaffold/`, the Inventory, any shard or any `packages/**`.
- No mechanical precedence enforcement (e.g. forcing `upstream-skip` where the Oracle skips): AC 9 asks for documentation, and every committed line is `not-ported-yet` by design.
- No `adapted` validation, Ratchet or line ownership (5.3/5.6/Epic 8); no `conformance/review/` file (Story 8.5).
- No `memcached`, `apc`, `dynamodb`, `ably`, `mercure` in deferred-items: `epics.md` routes those to Maintainer Escalations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Real repo | committed shards, lists | `Skip Reasons OK: 23291 line(s) checked.` | exit 0 |
| blocked-by | `support` (Phase 2) line `blocked-by:database` (4) / `blocked-by:runtime` (1) / `blocked-by:support` / `blocked-by:nope` | first ok; others fail | exit 1 |
| DIV | `intentional-divergence:DIV-3` with / without `decisions/DIV-3.md`; `DIV-03` | ok / fail / fail | exit 1 |
| php-only | approved ESC listing id / open ESC / approved ESC not listing id / null / unknown ESC | ok / fail ×4 | exit 1 |
| upstream-skip | oracle `skip` / `fail` / `pass` / absent variant | ok / ok / fail / fail | exit 1 |
| deferred / out-of-scope | `deferred:ai-sdk` / `deferred:memcached`; `out-of-scope:NG-1` / `NG-99` | ok / fail; ok / fail | exit 1 |
| unknown | `skip` with `null`, `""`, `bogus`, `blocked-by:`; `pass` with a reason; status `flaky` | one violation each | exit 1 |
| quarantined | open ESC listing id / approved ESC / null | ok / fail / fail | exit 1 |
| bad lists | unsorted, duplicate, `NG-x`, `Ai_SDK` | violation naming file:line | exit 1 |

</intent-contract>

## Code Map

- `tools/expectations/expectations.ts:1-60,64-80,127-160,429-459` -- header/CLI/exit-code style, `ExpectationLine`, `parseVariants` (list-file format to mirror; `textLines`-style strict decoding).
- `tools/pin-bump/pin-bump.ts:316,341-393` -- `readWorkingInventory`, `readExpectations` (`Shard{path, lines}`; throws on malformed line — catch and report as violation).
- `tools/escalations/escalations.ts:92-110,210-272,332-357` -- `ESCALATIONS_DIR`, `parseEscalationId`, `parseEscalation` (`testIds`), `escalationStatus(id, root)` (throws on unknown/malformed).
- `tools/scaffold/table.ts:17-27,269` + `tools/scaffold/scaffold.ts:16` -- `PackageRow.phase`, `readTable`, `TABLE_PATH`. Every Inventory component has a row (checked; `oracle-nondeterminism.jsonl` is not an Inventory file).
- `tools/inventory/inventory.ts:118,167` -- `InventoryEntry.oracle` (`Record<variant, "pass"|"skip"|"fail">`), `compareUnits`.
- PRD `prd.md:142-149,222-245,1313-1321,1338-1352` -- rules, precedence, Non-Goals, post-alpha list. `epics.md:2219-2261` -- the ACs; `:2834` 8.5 checklist; slug sources `:4982,5722,7389,7951,8471,1735,5936`.
- `.github/workflows/ci.yml:111-112` -- add `Check the Skip Reasons` / `bun run expectations:reasons` after `Check the Expectations File`.
- `conformance/tests/xaravel/repository-policy.test.ts:794-806` -- pinned `check` step list; add the new run line with a `// Story 5.2` comment.
- `conformance/tests/xaravel/expectations.test.ts:1-60` -- fixture-root helper style to copy.
- `docs/ops/expectations.md` -- add a Skip Reasons section pointing to `conformance/README.md`.

## Tasks & Acceptance

**Execution:**
- `conformance/deferred-items`, `conformance/non-goals` -- create as above.
- `tools/expectations/reasons.ts` -- `DEFERRED_ITEMS_FILE`, `NON_GOALS_FILE`, `STATUSES`, `parseList`, `checkLine`, `checkReasons(root)`, `main(argv)`; header documenting rules, violations, exit codes.
- `package.json` -- `"expectations:reasons": "bun tools/expectations/reasons.ts check"`.
- `.github/workflows/ci.yml`, `conformance/tests/xaravel/repository-policy.test.ts` -- CI step and its pin.
- `conformance/README.md` -- vocabulary, rules, precedence.
- `docs/ops/expectations.md` -- section.
- `conformance/tests/xaravel/skip-reasons.test.ts` -- XT-conformance-92..99 (matrix rows per AC, plus CLI exit code once; XT-98 also bad-status and bad-list rows; XT-92 or XT-98 asserts the real repo passes and real lists parse with the exact members), XT-conformance-100 (README lists the three precedence steps in order and names every reason).
- `conformance/escalations/ESC-5.2-1.md` -- as above.
- `stories/5.2.md`, sprint status -- `done` at the end (orchestrator bookkeeping).

**Acceptance Criteria:**
- Given a `blocked-by:<c>` entry, when checked, then it fails unless `<c>` is in a later Phase than the test's Component per the package table (XT-conformance-92).
- Given `intentional-divergence:DIV-<n>`, then it fails unless `decisions/DIV-<n>.md` exists (XT-93).
- Given `php-only`, then it fails unless its `escalation` is approved (XT-94).
- Given `upstream-skip`, then it fails unless the Inventory `oracle` for that variant is `skip` or `fail` (XT-95).
- Given `deferred:<item>`, then it fails unless `<item>` is in `conformance/deferred-items` (XT-96).
- Given `out-of-scope:<NG-N>`, then it fails unless `<NG-N>` is in `conformance/non-goals` (XT-97).
- Given a `skip` with no or an unknown reason, then it fails (XT-98).
- Given `quarantined`, then it fails unless its `escalation` is open (XT-99).
- Given the FR-3 precedence rule, when documented in `conformance/README.md`, then it lists the order; the Epic 8 checklist reference is conditional on ESC-5.2-1 (XT-100).
- CI's required `check` job runs `bun run expectations:reasons`.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 23 findings — high 0, medium 1, low 16, false 6, maybe-false 0
- findings:
  - (verification-gap) `[low]` `[patch]` missing-Inventory-id and missing-Component-row branches of `blocked-by` / `upstream-skip` untested — added fixture cases (grouped with the blind untested-branches finding).
  - (edge) `[low]` `[patch]` unguarded `readWorkingInventory` makes `checkReasons` throw and drop list violations — wrapped; reports `conformance/inventory: unreadable`, tested.
  - (edge) `[low]` `[patch]` `--root ""` silently checks the cwd — empty value is a usage error (exit 2), tested.
  - (edge) `[low]` `[reject]` an Escalation on a `pass`/`fail-known`/other skip line need not list the Test ID — the spec requires only that it be known; it grants nothing on those lines (the rules that consume an Escalation, php-only and quarantined, check membership); a misleading trail only, fixing adds a rule.
  - (edge) `[low]` `[reject]` a php-only/quarantined line whose id is not in the Inventory passes this check — `expectations:check`, which runs first in the same CI job, fails it as `unknown:`.
  - (blind) `[medium]` `[patch]` `php-only` accepted any approved Escalation listing the id, whatever its trigger — now also requires `trigger: php-only` (FR-114, DIV-6); tested with an approved `contract` Escalation.
  - (blind) `[low]` `[patch]` a listed `deferred:`/`blocked-by` reason can be unrelated to the test — README now says relevance is a Fidelity Review question; mechanical Variant mapping would add rules the AC does not ask for.
  - (blind) `[low]` `[patch]` unguarded Inventory read — grouped with the edge finding above.
  - (blind) `[low]` `[reject]` an unreadable table or missing list yields many per-line violations — the root-cause violation is reported first and names the file; collapsing needs extra branches for a CI-only failure mode.
  - (blind) `[low]` `[patch]` untested fail-closed branches (BOM, final LF, invalid UTF-8, empty list, malformed shard, non-string escalation, not-in-Inventory, missing Component) — tests added.
  - (blind) `[low]` `[patch]` `non-goals` comments truncate NG-2 and NG-5 — full §7.1 bullets quoted.
  - (blind) `[low]` `[reject]` no test enforces a quote comment above each list member — the member set is pinned exactly and both files are Protected, so a change needs Maintainer review; a provenance parser adds test machinery.
  - (blind) `[false]` `[reject]` `foundation-cloud` leaves "other integrations" without a slug — `epics.md:1735,6860,7770` uses `foundation-cloud` for the whole bullet, whose full text is the comment.
  - (blind) `[false]` `[reject]` XT-100 passes if ESC-5.2-1 is rejected — it asserts status is `open` or `approved`, so a rejection fails it.
  - (blind) `[low]` `[reject]` an unrelated Escalation on non-consuming lines — same as the edge finding.
  - (blind) `[low]` `[reject]` spec hard-codes the 23291 line count — fix edits this build's spec; the test asserts `> 0`.
  - (intent) `[low]` `[reject]` rule checks are exercised on fixtures, the real repo only on `not-ported-yet` — every committed line is `not-ported-yet` by Story 5.1's design; the CLI runs on fixture roots and CI wiring is pinned in `repository-policy.test.ts`.
  - (intent) `[false]` `[reject]` harness reading of `upstream-skip` not addressed — AC 4 names "the Inventory's `oracle` value … (Story 2.6)", which is what is read.
  - (intent) `[false]` `[reject]` AC 9's checklist half moved to ESC-5.2-1 — by design: Story 8.5 owns the checklist; AC 9 is recorded conditional on the Escalation.
  - (intent) `[false]` `[reject]` stricter-than-AC rules (test_ids membership, status vocabulary) — FR-3 and Story 5.1's spec hand status checks to 5.2; membership closes a mislabelling route (SM-C1).
  - (intent) `[low]` `[reject]` the CLI exit-code test sits under XT-92 — cosmetic.
  - (intent) `[low]` `[reject]` XT-98 pins the diff's own slug transcription — the transcription is the AC's deliverable; slugs follow `epics.md`, each comment quotes its PRD bullet.
  - (intent) `[false]` `[reject]` new lists not added to Protected Paths — `/conformance/` in `conformance/protected-paths` covers them; `protected-paths:codeowners` left CODEOWNERS unchanged.

## Design Notes

A separate command keeps 5.1's fixture-root tests valid (their `ai` lines carry `deferred:ai-sdk` with no `deferred-items` file). The `test_ids` membership rule for `php-only`/`quarantined` stops one Escalation from covering unrelated tests; ESC-bot files use the same format, so Story 5.8's bot is not constrained beyond listing its Test IDs.

## Verification

**Commands:**
- `bun run expectations:reasons` -- expected: `Skip Reasons OK: 23291 line(s) checked.`
- `bun test conformance/tests/xaravel/skip-reasons.test.ts conformance/tests/xaravel/repository-policy.test.ts` -- all pass.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run expectations:check`, `bun run escalations:check`, `bun run protected-paths:codeowners` drift-free -- pass.

## Auto Run Result

Status: done

**Summary.** Added the Skip Reason rule check `bun run expectations:reasons` (`tools/expectations/reasons.ts`): the status vocabulary, each FR-3 Skip Reason rule, `php-only` (approved, `trigger: php-only`, lists the Test ID) and `quarantined` (open, lists the Test ID) Escalations, and known-Escalation checks on every line. Also added the Protected lists `conformance/deferred-items` (PRD §7.2, 16 items) and `conformance/non-goals` (NG-1..NG-7), and `conformance/README.md`, which documents the rules and the FR-3 precedence order. The check runs as a CI step in the required `check` job. XT-conformance-92..100 cover the ACs.

**Files changed.**
- `tools/expectations/reasons.ts` -- the check and its CLI.
- `conformance/deferred-items`, `conformance/non-goals` -- the lists, with each member's PRD text quoted.
- `conformance/README.md` -- statuses, rules, precedence.
- `conformance/escalations/ESC-5.2-1.md` -- asks that Story 8.5's checklist cite the precedence section (AC 9 is conditional on it).
- `conformance/tests/xaravel/skip-reasons.test.ts` -- 13 Xaravel Tests.
- `conformance/tests/xaravel/repository-policy.test.ts`, `.github/workflows/ci.yml`, `package.json` -- the CI step, the test that pins it, and the script.
- `docs/ops/expectations.md` -- a Skip Reasons section.

**Review.** 23 findings: 8 patched (php-only trigger rule [medium]; guarded Inventory read; empty `--root`; a README note that relevance is a review question; full Non-Goal quotes; fail-closed branch tests), 0 deferred, 15 rejected. Each rejection's reason is in the triage log.

**Follow-up review recommended: false.** Patched 1 medium and 7 low, no high.

**Verification.** `expectations:reasons` OK (23,291 lines). `expectations:check` OK. `bun run test`: 184 pass, 0 fail. `typecheck`, `lint` and `escalations:check` pass. `protected-paths:codeowners` makes no CODEOWNERS change.

**Residual risks.** AC 9's checklist half waits on ESC-5.2-1 (open; Story 8.5). The `deferred-items` slugs are the orchestrator's transcription of PRD §7.2 prose, and the Maintainer may rename them. Escalations on lines that don't consume them are not checked for membership.
