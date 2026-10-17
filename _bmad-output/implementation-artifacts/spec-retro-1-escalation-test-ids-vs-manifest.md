---
title: 'Check an Escalation test_ids against the raising Story manifest (retro epic-1 item 4)'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: '7a1d98362f273982993056c121f3de089557c9bc'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The `escalations pr` check validates an Escalation's fields and that its ID belongs to the PR's branch, but never compares its `test_ids` with the raising Story's manifest (retro finding D4, `tools/escalations/escalations.ts` `parseEscalation`/`evaluatePr`). A Story can therefore escalate (for example, propose a `php-only` skip for) Test IDs another Story owns.

**Approach:** In `evaluatePr`, for every added or changed `ESC-<story-id>-<n>` Escalation that parses, read `stories/<story-id>.md` from the **base checkout** (the `--root`, as `ownership pr` does, AD-16) and report every Escalation Test ID that is not in that manifest's `test_ids` or `xaravel_test_ids`. A missing or invalid manifest fails closed.

## Boundaries & Constraints

**Always:** The manifest comes from the base checkout, never from the PR head (a PR cannot widen its own Story's Test IDs to pass). Reuse `parseManifest` and `STORIES_DIR` from `tools/ownership/ownership.ts`. New violation lines follow the existing `<kind>: <path>: … (AD-16)` shape and are listed in the file's header comment. `pr` accepts `--root <dir>` (default repo root), like `ownership pr`. Existing Xaravel Test assertions keep their expected values; tests only gain fixture manifests.

**Never:** Do not enforce this in `check` (records already on `main`): sprint planning re-resolves manifest `test_ids` after Epic 2, and a merged Escalation must not start failing `main` then. Do not check `ESC-bot-<n>` Escalations (no raising Story). Do not edit `tools/ownership/`, any `stories/*.md`, `.github/workflows/*` or sprint status.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owned IDs | `story/9.1` adds `ESC-9.1-1`, every test_id in base `stories/9.1.md` test_ids or xaravel_test_ids | no violation | — |
| Foreign ID | an Escalation test_id not in the Story's manifest (e.g. owned by Story 9.2) | `unowned test id: conformance/escalations/ESC-9.1-1.md: <id> is not in Story 9.1's test_ids or xaravel_test_ids (stories/9.1.md on the base branch) (AD-16)`, one line per ID | exit 1 |
| No manifest | base has no `stories/9.1.md` | `missing manifest: <path>: Escalation ESC-9.1-1 is raised by Story 9.1, which has no stories/9.1.md on the base branch (AD-16)` | exit 1 (fail closed) |
| Invalid manifest | base `stories/9.1.md` fails `parseManifest` | `missing manifest: <path>: … stories/9.1.md on the base branch is invalid: <first parse violation>` | exit 1 |
| Bot Escalation | `bot/x` adds `ESC-bot-3` | no manifest lookup | — |
| Invalid Escalation | Escalation fails `parseEscalation` | only the existing `invalid escalation:` lines | — |
| Removed Escalation | PR removes `ESC-9.2-1` | not judged | — |

</intent-contract>

## Code Map

- `tools/escalations/escalations.ts` -- `EscalationsPrInput` (add `root: string`, the base checkout), `evaluatePr` escalations loop (after `parseEscalation(path, text)`), header comment violation list and `pr` usage, `pr()` (pass `options.root`), `main` (`pr` allows `--root`), `USAGE`.
- `tools/ownership/ownership.ts` -- read-only: `parseManifest(file, text)`, `STORIES_DIR`, `Manifest.testIds`/`xaravelTestIds`. Its `evaluatePr(root, pr)` is the base-checkout precedent.
- `conformance/tests/xaravel/escalations.test.ts` -- helpers `judge` and `runPr` currently use no root; `runPr` runs the CLI with cwd = repo root, which has no `stories/9.1.md`, so they need a fixture root holding `stories/9.1.md` that lists `escalation()`'s default test_id.
- `.github/workflows/escalations.yml` -- read-only: the `escalations` job checks out the base commit and runs `pr` from the repo root, so the default root already is the base checkout.

## Tasks & Acceptance

**Execution:**
- `tools/escalations/escalations.ts` -- add `root` to `EscalationsPrInput`; in `evaluatePr`, for each parsed non-bot Escalation, load and parse `stories/<storyId>.md` under `root` (cache per Story) and emit `missing manifest:` / `unowned test id:` lines per the matrix; let `pr` take `--root`; document both kinds and `--root` in the header and `USAGE` -- closes D4.
- `conformance/tests/xaravel/escalations.test.ts` -- add a fixture base root with `stories/9.1.md` (owning `escalation()`'s default test_id plus an XT ID); pass it from `judge` and as `--root` from `runPr`; add the matrix cases inside XT-conformance-26 (the Escalation PR rules), covering owned (test_ids and xaravel_test_ids), foreign ID, no manifest, invalid manifest, bot exemption, and the CLI `--root` path -- proves the rule from the CLI surface.

**Acceptance Criteria:**
- Given a `story/9.1` PR adding `ESC-9.1-1` whose test_ids include an ID absent from base `stories/9.1.md`, when `bun tools/escalations/escalations.ts pr --root <base> …` runs, then it exits 1 and stderr has the `unowned test id:` line naming that ID.
- Given the same PR whose head also edits `stories/9.1.md` to add the ID, when the check runs, then it still fails, because only the base manifest counts.
- Given the repository, when `bun test`, `bun run typecheck`, `bun run lint` and `bun run escalations:check` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 13, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) Every manifest has `test_ids: []`, so Upstream Test ID Escalations are blocked until re-planning — only Stories 1.1–8.8 have manifests, and none owns an Upstream Test ID; such a Story escalating one is exactly what D4 forbids. Epic 9+ manifests are written by the post-Epic-2 sprint planning re-run with resolved Test IDs.
  - `[low]` `[reject]` (blind) A changed (not added) Escalation is re-judged after its manifest's `test_ids` change — needs a base-vs-head `test_ids` comparison (new branch logic); unlikely, since Escalations raised before resolution can only name Epic 1–8 XT IDs, which re-planning keeps.
  - `[low]` `[reject]` (blind) An unreadable or directory `stories/<id>.md` throws instead of a `missing manifest:` line — the throw still fails closed (`main` catch, exit 1, "Escalation check failed"); adding a guard is more than a direct correction for an unlikely state.
  - `[low]` `[patch]` (blind) Test comment claims the per-Story manifest cache is observed — reworded to describe what the assertion shows.
  - `[low]` `[patch]` (blind) Duplicate unowned IDs give duplicate lines — loop over `new Set(raised.testIds)`, with an assertion.
  - `[low]` `[reject]` (blind) The workflow header comment does not mention the base `stories/*.md` — `pull_request_target` checks out base, so the default root is right; the tool's header documents it; the workflow is a Protected Path outside this change.
  - `[low]` `[patch]` (blind) `--root` docs invite a local false pass from a PR checkout — header now says the root must be a base-branch checkout.
  - `[low]` `[reject]` (blind) Spec Design Notes snippet and matrix row names differ from code/tests — the fix edits this build's spec.
  - `[low]` `[reject]` (blind) `"unknown error"` fallback untested — unreachable (`parseManifest` returns a null manifest only with violations); negligible.
  - `[low]` `[reject]` (blind) The invalid-manifest line gets `(AD-16)` from the nested ownership message — cosmetic coupling, pinned by an exact test.
  - `[low]` `[reject]` (blind) Manifest `status` is ignored — a Story still owns its Test IDs whatever its status; `story/<id>` for a done Story is not an everyday path.
  - `[low]` `[reject]` (blind) Invalid-manifest and `xaravel_test_ids` cases are tested only through `evaluatePr`, not the CLI — the CLI calls the same `evaluatePr`; `--root` plumbing is covered by four CLI cases.
  - `[false]` `[reject]` (edge) Unreadable manifest throws — duplicate of the blind finding; fails closed with exit 1.
  - `[low]` `[patch]` (edge) Duplicate unowned ID lines — same patch as above.
  - `[low]` `[reject]` (edge) Modified merged Escalation after re-resolution — same as above.
  - `[false]` `[reject]` (edge) Head-manifest test passes trivially — it would fail if `pr` ever read the head manifest (the head copy owns `STR_IS_UUID`), so it guards that regression.
  - `[false]` `[reject]` (verification-gap) No gaps; its "other finding" on empty `test_ids` is the first blind finding — see that refutation.
  - `[false]` `[reject]` (intent) `check` not enforced — deliberate, Design Notes give the reason; descriptive only.
  - `[false]` `[reject]` (intent) Stricter than "owned by another Story" (rejects IDs no Story owns) — the action item says "against the raising Story manifest", which is the subset reading.

## Design Notes

Why `pr` only: `check` runs on `main` and judges records already merged; the manifest's `test_ids` legitimately change when sprint planning resolves Upstream selectors to Test IDs (after Epic 2), so re-checking old Escalations there would break `main` with no PR to fix. The gate that matters is the moment an Escalation is added or changed.

Shape:

```ts
const owned = new Set([...manifest.testIds, ...manifest.xaravelTestIds]);
for (const testId of escalation.testIds) if (!owned.has(testId)) violations.push(`unowned test id: ${path}: ${testId} is not in Story ${id.storyId}'s test_ids or xaravel_test_ids (${file} on the base branch) (AD-16)`);
```

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/escalations.test.ts` -- expected: all pass
- `bun test` -- expected: 0 fail
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run escalations:check` -- expected: `Escalations OK`

## Auto Run Result

Status: done

**Change:** `escalations pr` now checks each added or changed `ESC-<story-id>-<n>` against `stories/<story-id>.md` on the base checkout (`--root`, default the repo root): every Escalation Test ID must be in the manifest's `test_ids` or `xaravel_test_ids` (`unowned test id:`), and a missing or invalid manifest fails closed (`missing manifest:`). Bot Escalations and `check` are unchanged. Closes retro finding D4.

**Files:**
- `tools/escalations/escalations.ts` -- `EscalationsPrInput.root`, the manifest lookup and two violation kinds in `evaluatePr`, `pr --root`, header and USAGE.
- `conformance/tests/xaravel/escalations.test.ts` -- a fixture base root with Story 9.1/9.2 manifests for `judge`/`runPr`; ownership cases in XT-conformance-26 for every matrix row. No existing expected value changed.

**Review:** 19 findings (0 high, 0 medium, 13 low, 6 false). Patched 3 low: deduplicated unowned-ID lines, reworded a test comment, documented that `--root` must be a base-branch checkout. Rejected 16, each with its reason in the Review Triage Log. Nothing deferred.

**Follow-up review recommended:** false (patched: 0 high, 0 medium, 3 low).

**Verification:** `bun test` 38 pass / 0 fail; `bun run typecheck`, `bun run lint` clean; `escalations:check`, `scaffold:check`, `graph:check` OK.

**Residual risk:** until sprint planning writes Epic 9+ manifests with resolved Test IDs, Stories can escalate only Test IDs their manifests list (today only XT IDs), which is the intended rule.
