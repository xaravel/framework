---
title: 'Retro 5 item 12: harden the bots proposal bookkeeping'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: '50a8e77289ec07244246fcc931b3ac651e8b8fdb'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 5 retro findings C5/C6 (action item `epic-5-retro-item-12-bots-proposal-bookkeeping`) in `bots.ts apply`: (1) any existing `bot/*` branch skips its proposal forever, even when its PR was closed unmerged; (2) while any `bot/oracle-esc-*` PR is open, every new escalation proposal is dropped as `pending`, even one about different Test IDs; (3) `ESC-bot-<n>` numbering lists `conformance/escalations` through the contents API, capped at 1,000 entries; (4) nothing stops a write over an `ESC-bot-<n>.md` that already exists.

**Approach:** (1) Skip only while the branch is the head of an open PR (`BOT-SKIP <branch> open`); a leftover branch with no open PR is force-moved to the new commit and gets a new PR. (2) An escalation proposal waits (`pending`) only when every one of its `test_ids` is already in an `ESC-bot-<n>.md` that an open `bot/oracle-esc-*` PR adds (or that this run already opened); otherwise it is queued behind them: it opens its own PR, numbered past theirs. Promotions keep today's `pending` rule. (3) List the directory by walking the Git trees API from main's commit (root → `conformance` → `escalations`), failing on `truncated`. (4) Before writing, fetch main's current tip and refuse (`BOT-REFUSE <branch> <path> already exists on main`) when an added `ESC-bot-<n>.md` exists there.

## Boundaries & Constraints

**Always:** Every write stays based on `baseSha` (main's tip read at start). The pre-write `botValueProblems`/`parseEscalation` self-check stays. A PR that cannot be opened still deletes its branch. Exit codes and other output lines unchanged.

**Never:** Touch `packages/**`, `conformance/expectations/**`, `tools/ownership/`, `tools/protected-paths/` or workflows. Remove or weaken an existing assertion beyond updating a skip line to the new `open` wording and the fake API to the new endpoints. Merge or close any PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open PR on branch | branch exists, open PR head = branch | `BOT-SKIP <branch> open`, no write | none |
| Leftover branch | branch exists, no open PR | `PATCH /git/refs/heads/<branch>` `{sha, force:true}`, PR opened, `BOT-PR <url>` | PR failure deletes branch, `BOT-FAIL` |
| Same escalation pending | open `bot/oracle-esc-*` PR adds ESC-bot naming all proposal Test IDs | `BOT-SKIP <branch> pending` | none |
| New escalation while one pending | open PR covers other Test IDs | own PR, `ESC-bot-<n>` past the open PR's | none |
| Large directory | 1,200 `ESC-bot-*.md` on main | next is `ESC-bot-1201` | `truncated: true` throws, exit 1 |
| ESC file appeared on main | main's current tip has the added path | `BOT-REFUSE <branch> conformance/escalations/ESC-bot-<n>.md already exists on main`, no write | failed++, exit 1 |

</intent-contract>

## Code Map

- `tools/bots/bots.ts:34-60` -- header for `apply`; update skip/pending/numbering text.
- `tools/bots/bots.ts:497-532` -- `Writer` (`post`, `delete`); add `patch`.
- `tools/bots/bots.ts:546-595` -- `apply` setup: main tip, `branches` from matching-refs, numbering via contents listing (`:577`), `pulls` loop building `pending`. Replace listing with a trees walk; collect open PR heads and the Test IDs of escalation PRs' added `ESC-bot` files (read with `github.contents(path, pull.head.sha)`, parsed with `parseEscalation`).
- `tools/bots/bots.ts:609-659` -- proposal loop: skip/pending decisions, self-check, `write`.
- `tools/bots/bots.ts:730-760` -- `write`: create vs force-move the ref.
- `tools/protected-paths/protected-paths.ts:374-432` -- `GitHub` (`json`, `paged`, `contents`); read-only.
- `tools/escalations/escalations.ts:114,235` -- `parseEscalation(...).escalation.testIds`; read-only.
- `conformance/tests/xaravel/bots.test.ts:111-235` -- `fakeGitHub`: add `/git/trees/<sha>`, `PATCH` refs, list opened PRs in `/pulls` with `head.sha`, contents at a PR head, a main tip that advances.
- `conformance/tests/xaravel/bots.test.ts:392`, `:746-755` -- XT-123 `again` and XT-189 `busy` cases.
- `docs/ops/bots.md:58-62` -- `apply` rules.

## Tasks & Acceptance

**Execution:**
- `tools/bots/bots.ts` -- implement (1)–(4) per the matrix; update the header.
- `conformance/tests/xaravel/bots.test.ts` -- extend the fake; XT-123: same plan again → `open` skip; leftover branch with no PR → force-moved ref and PR; ESC file appearing on main's new tip → `BOT-REFUSE`, no writes; truncated tree → apply rejects. XT-189: covered escalation → `pending`; uncovered → its own PR as `ESC-bot-3`; 1,200 files on main → `ESC-bot-1201`.
- `docs/ops/bots.md` -- describe the new rules.

**Acceptance Criteria:**
- Given the repo, when `bun test conformance/tests/xaravel/bots.test.ts`, `bun run test`, `bun run typecheck` and `bun run lint` run, then they pass.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 24 findings — high 0, medium 1, low 13, false 6, maybe-false 0 (intent-alignment is descriptive; its rows are its divergences)
- findings:
  - `[low]` `[patch]` (verification-gap) Same-run coverage (`coveredIds.add` after a write) untested — added an XT-189 case: two escalations with the same Test IDs in one plan give `BOT-PR`, then `BOT-SKIP … pending`.
  - `[low]` `[reject]` (verification-gap) `takenOnMain` `BOT-FAIL` branch untested — a thin wrapper over the tested `message(error)`/`failed++` pattern; any regression still shows as a non-zero or visibly wrong run.
  - `[low]` `[reject]` (verification-gap other) An unreadable or unparsable open-PR ESC-bot file adds no coverage, so a duplicate PR opens — fails toward opening rather than losing an escalation, which is the item's point; bot PRs only add files `parseEscalation` already passed.
  - `[low]` `[reject]` (edge) Leftover branch of a merged escalation PR re-proposes a merged escalation — `deleteBranchOnMerge` is on (retro C5), and a merged quarantine or promotion is `stale`; covering it means reading every ESC-bot on main.
  - `[false]` `[reject]` (edge) Partial overlap opens a second PR naming a covered Test ID — the spec's chosen rule: wait only when every Test ID is covered, so a new Test ID is never dropped.
  - `[false]` `[reject]` (edge) Open oracle-esc PR file with status modified/renamed — the ownership bot rule lets a `bot/*` PR only add an ESC-bot file (`ownership.ts:959`).
  - `[false]` `[reject]` (edge) Open PR missing `head.sha` aborts the run — GitHub's pulls API always returns `head.sha` for an open PR.
  - `[medium]` `[patch]` (edge, blind) Fork PR with a `bot/` head ref is trusted for `open`, promotion `pending` and Test ID coverage, so an outsider could suppress proposals — the `/pulls` loop now skips any PR whose `head.repo.full_name` is not the repo; XT-189 tests a fork PR is ignored.
  - `[low]` `[reject]` (edge) Branch deleted between listing and PATCH gives HTTP 422 — the run prints `BOT-FAIL` and the next run takes the POST path; rare.
  - `[low]` `[reject]` (edge, blind) Force-move overwrites a hand-pushed `bot/*` branch — only the xaravel-bot App may own `bot/*` PRs (ownership bot identity rule); adding a history check is a new branch for an unshown case.
  - `[low]` `[patch]` (edge, blind) Stale comment in `write`'s catch ("every later run would skip it as existing") — reworded.
  - `[low]` `[reject]` (blind) Merged escalations no longer deduplicated — same as the edge row above.
  - `[medium]` `[patch]` (blind) Fork PRs trusted — same root cause as the edge row; patched there.
  - `[false]` `[reject]` (blind) Partial overlap undefined — the matrix's "New escalation while one pending" row and the Approach define it.
  - `[low]` `[patch]` (blind) Same-run coverage untested — same as the verification-gap row; patched.
  - `[low]` `[reject]` (blind) Error-path tests (leftover PR failure deletes the branch, `takenOnMain` throwing, missing `head.sha`, unparsable file) — the delete keeps the old behavior; the others are covered by rows above.
  - `[low]` `[patch]` (blind) Stale comment — same as above.
  - `[low]` `[reject]` (blind) Force-move without a history check — same as the edge row.
  - `[low]` `[patch]` (blind) Docs and header said only `BOT-FAIL` exits 1 — now `BOT-FAIL` or `BOT-REFUSE`.
  - `[low]` `[reject]` (blind) Main re-check ignores bot PRs opened mid-run and costs a request per proposal — `open` runs in the `bots-open` concurrency group, one at a time; one GET per escalation is negligible.
  - `[false]` `[reject]` (blind) Code Map line ranges stale / Verification lacks `bun run harness` — fixes edit this spec; XT-123/189 run under `bun run test`.
  - `[low]` `[reject]` (intent) "Queue" read as b1 (numbered queue, wait only on a fully covered duplicate), not a persisted replay queue — the dropped case is the duplicate the 5.8 `pending` rule exists to stop; nothing distinct is lost. Recorded as residual risk.
  - `[low]` `[reject]` (intent) Tests live in `conformance/tests/xaravel/bots.test.ts`, not under `tools/bots/` — no test exists under `tools/`; the repo's bots tests are XT-123..125/189.
  - `[low]` `[reject]` (intent) The 1,200-file test shows the endpoint switch, not the real cap — the fake no longer serves the contents listing, so the test fails if the contents API is used again; the real cap is GitHub's documented limit.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/bots.test.ts` -- expected: pass
- `bun run test && bun run typecheck && bun run lint` -- expected: pass

## Auto Run Result

Status: done

- **Change:** `apply` skips a proposal only while its branch heads an open same-repo PR (`BOT-SKIP <branch> open`); a leftover branch is force-moved and gets a new PR. An escalation waits (`pending`) only when every Test ID is already in an ESC-bot file an open same-repo `bot/oracle-esc-*` PR adds, or this run opened; any other opens its own PR. Main's `conformance/escalations/` is listed through the Git trees API (truncation throws). Before writing, an `ESC-bot-<n>.md` already on main's current tip is refused. Fork PRs are ignored.
- **Files:** `tools/bots/bots.ts` (apply, Writer.patch, header); `conformance/tests/xaravel/bots.test.ts` (fake trees/PATCH/PR heads/advancing main; XT-123 open, leftover, raced, truncated; XT-189 pending, queued, same-run, fork, 1,200 files); `docs/ops/bots.md`.
- **Review:** 5 patched entries (1 medium, 4 low), 0 deferred, 13 rejected low/false and 6 false, reasons in the triage log.
- **Follow-up review:** false; one medium patched, no high.
- **Verification:** `bun test conformance/tests/xaravel/bots.test.ts` 4 pass; `bun run test` 237 pass 0 fail; `bun run typecheck` exit 0; `bun run lint` exit 0.
- **Residual risk:** trees API, PATCH ref and `head.repo.full_name` behavior run only against the fake; a fully covered recurring escalation is still dropped (by design) rather than persisted.
