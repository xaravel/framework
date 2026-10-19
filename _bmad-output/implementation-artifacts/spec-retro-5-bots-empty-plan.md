---
title: 'Retro 5 item 4: skip the bots open job on an empty plan, fail clearly without the App'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: 'b99e5890fed3de5561a34df28c911af93a6e0050'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Every `bots` run on `main` fails in job `open`, step "Get the xaravel-bot App token" (Epic 5 retro finding S2, action item `epic-5-retro-item-4-bots-empty-plan`). `open` runs whenever `detect` or `collect` succeeded (`.github/workflows/bots.yml:145`), even when the plan has no proposals, and the App, `vars.XARAVEL_BOT_APP_ID` and `secrets.XARAVEL_BOT_APP_KEY` do not exist yet (a Maintainer step, `docs/ops/bots.md`).

**Approach:** `detect` and `collect` count the plan's proposals after writing it and expose the count as a job output `proposals`. `open` runs only when a successful producer reported a non-zero count. Before minting the token, a new `open` step fails with an `::error::` naming `vars.XARAVEL_BOT_APP_ID`, `secrets.XARAVEL_BOT_APP_KEY` and `docs/ops/bots.md` when either is unset.

## Boundaries & Constraints

**Always:** The App key never enters a step's `env` or `run` as a value; the configuration check sees only `secrets.XARAVEL_BOT_APP_KEY != ''` (a boolean). Secrets stay only in `open` (XT-conformance-125 asserts it). `open` keeps its environment, concurrency, permissions, checkout and token step. `apply`'s own empty-plan handling (`BOTS applied=0 …`) stays.

**Never:** Touch `packages/**`, `conformance/expectations/**` or `tools/bots/bots.ts` behavior. Remove or weaken an existing assertion beyond updating the exact `open.if` string to the new condition. Skip silently when the plan is non-empty and the App is missing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty plan | `detect` or `collect` succeeds with `proposals: []` | producer output `proposals=0`; `open` skipped; run green | none |
| Non-empty plan, App configured | producer output `proposals>=1`, var and secret set | `open` runs: check step passes, token minted, `apply` runs | none |
| Non-empty plan, App missing | var or secret unset | check step prints `::error::` naming `vars.XARAVEL_BOT_APP_ID`, `secrets.XARAVEL_BOT_APP_KEY`, `docs/ops/bots.md`, exits 1 before the token step | job fails |
| Producer failed | `detect`/`collect` failure or skipped | `open` skipped as today | none |

</intent-contract>

## Code Map

- `.github/workflows/bots.yml:1-25` -- header comment describing `detect`, `collect`, `open`; add the empty-plan skip and the configuration check.
- `.github/workflows/bots.yml:91-95` (detect), `:133-140` (collect) -- plan written to `.cache/bots/plan.json` then uploaded; add a counting step with `id: count` writing `proposals=<n>` to `$GITHUB_OUTPUT` (`bun -e` reading `.proposals.length`; bun is set up in every job, `jq` is not in the devcontainer), and job `outputs.proposals`.
- `.github/workflows/bots.yml:143-178` (open) -- `if:` at `:145`; add the configuration-check step immediately before "Get the xaravel-bot App token".
- `tools/bots/bots.ts:117-123,809` -- `Plan` shape `{ref, sha, run, proposals: []}` written as JSON by `writePlan`; read-only.
- `conformance/tests/xaravel/bots.test.ts:246-256` -- `Workflow` type and `botsWorkflow()`; extend the job type with `outputs`, step `id`/`name`.
- `conformance/tests/xaravel/bots.test.ts:619-646` (XT-conformance-125) -- bots.yml shape assertions; `open.if` exact string at `:632` must change; add assertions here.
- `conformance/tests/xaravel/bots.test.ts:706-722` (XT-conformance-189) -- collect shape; add the count step assertion.
- `docs/ops/bots.md:66-84` -- CI table row for `open` and the live-setup section; `docs/ops/ci.md:79-81` Bots paragraph.

## Tasks & Acceptance

**Execution:**
- `.github/workflows/bots.yml` -- add `outputs: { proposals: ${{ steps.count.outputs.proposals }} }` to `detect` and `collect`, each with a "Count the plan's proposals" step (`id: count`) after the plan is written; change `open.if` to `always() && ((needs.detect.result == 'success' && needs.detect.outputs.proposals != '0') || (needs.collect.result == 'success' && needs.collect.outputs.proposals != '0'))`; add step "Check the xaravel-bot App is configured" before the token step with `env: APP_ID: ${{ vars.XARAVEL_BOT_APP_ID }}`, `HAS_KEY: ${{ secrets.XARAVEL_BOT_APP_KEY != '' }}`; update the header comment.
- `conformance/tests/xaravel/bots.test.ts` -- XT-conformance-125: new `open.if`; count step and output in `detect`; check step precedes the token step, its env carries no raw secret, and executing its `run` with bash exits 1 with the `::error::` text when `APP_ID` is empty or `HAS_KEY=false`, and exits 0 when both are set. Execute the count step's `run` against an empty and a one-proposal plan and assert the `$GITHUB_OUTPUT` line. XT-conformance-189: count step and output in `collect`.
- `docs/ops/bots.md`, `docs/ops/ci.md` -- state that `open` runs only for a non-empty plan and fails clearly when the App is not configured.

**Acceptance Criteria:**
- Given `bots.yml`, when the XTs parse it, then `open` is conditioned on a non-zero `proposals` output from a successful producer, and the configuration check runs before the token step.
- Given the repo, when `bun run test`, `bun run typecheck` and `bun run lint` run, then they pass.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 10, false 7, maybe-false 0 (verification-gap reported none; intent-alignment is descriptive, rows below are its divergences)
- findings:
  - `[low]` `[reject]` (edge) Count step could write a non-integer — `JSON.parse`/`.proposals.length` throws on a malformed plan and `set -e` fails the step; `detect`/`collect` always write `proposals: []` (`bots.ts:221,360`). A guard adds a branch for an unreachable case.
  - `[false]` `[reject]` (edge) `outputs.proposals` empty on a successful producer — the count step runs unconditionally in a successful job, so the output is always set.
  - `[low]` `[reject]` (edge) Whitespace-only `vars.XARAVEL_BOT_APP_ID` passes the check — a Maintainer setup typo; the token step then fails loudly. Not worth a new branch.
  - `[low]` `[patch]` (edge, blind) Order assertion passes trivially when the plan-writing step is not found — now asserts the writer index `>= 0` first.
  - `[low]` `[patch]` (edge, blind) Missing count step crashes with TypeError — now asserts `count >= 0` before indexing (same root cause as above).
  - `[low]` `[reject]` (edge) `bun` not on PATH in the test — `bun test` runs with bun on PATH locally and in CI (setup-bun); unlikely.
  - `[low]` `[patch]` (edge, blind) `runStep` uses `bash -e`, not GitHub's shell — now `bash --noprofile --norc -eo pipefail -c`.
  - `[low]` `[reject]` (blind) Count step bypasses `parsePlan` and is duplicated — `apply` re-validates through `parsePlan` before any write; a new subcommand adds surface for no observed harm.
  - `[false]` `[reject]` (blind) Count failure loses the plan artifact — a count failure means the plan file is missing or not JSON, which `detect`/`collect` exit non-zero for first; nothing diagnosable is lost.
  - `[false]` `[reject]` (blind) BOTS-CAP now ends green and silent — before this change the cap also ended with an empty plan and `apply` printing `applied=0` (when it got that far); the `BOTS-CAP` line in the detect log is unchanged. Not caused by this change.
  - `[low]` `[patch]` (blind) `detect`/`collect` rows in `docs/ops/bots.md` did not list the new `proposals` output — added.
  - `[low]` `[reject]` (blind) No test for a missing or malformed plan in the count step — such a plan fails loudly; unreachable from the producers.
  - `[false]` `[reject]` (blind) Spec Verification/frontmatter unfinished — the fix edits this build's spec; results are recorded under Auto Run Result at finalize.
  - `[false]` `[reject]` (blind) Spec should require `bun run harness` — edits the spec; XT-conformance-125/189 run under `bun test`, which the harness wraps, and verification ran the full `bun run test`.
  - `[low]` `[patch]` (blind) `docs/ops/ci.md` did not say a red `open` is expected until the App exists — added a sentence linking bots.md's live-steps section.
  - `[false]` `[reject]` (intent) R3: an empty plan with no App reports nothing — the intent puts the check in `open` before the token step and asks `open` to skip on an empty plan; this is the chosen reading, not a gap.
  - `[false]` `[reject]` (intent) R1: nothing shows the observed failures go away — checked: runs 39268681327 and 39249232330 logged `BOTS ref=main quarantine=0 promote=0 none=0`, an empty plan, so `open` is now skipped for them. The `if:` is still pinned only as a string (residual risk below).

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/bots.test.ts` -- expected: pass
- `bun run test && bun run typecheck && bun run lint` -- expected: pass

## Auto Run Result

Status: done

- **Change:** `detect` and `collect` count their plan's proposals into the job output `proposals`; `open` runs only for a successful producer with a non-zero count, and fails with a clear `::error::` naming `vars.XARAVEL_BOT_APP_ID`, `secrets.XARAVEL_BOT_APP_KEY` and `docs/ops/bots.md` before the token step when the App is not configured. The count uses `bun -e`, not `jq`, because the devcontainer image has no `jq`.
- **Files:** `.github/workflows/bots.yml` (count steps, outputs, `open.if`, configuration check, header comment); `conformance/tests/xaravel/bots.test.ts` (XT-conformance-125/189 pin the new shape and execute the count and check scripts with GitHub's bash flags); `docs/ops/bots.md`, `docs/ops/ci.md`.
- **Review:** 5 patched rows (all low, 4 entries), 0 deferred, 5 low and 7 false rejected, reasons in the triage log.
- **Follow-up review:** false; no high or medium patched.
- **Verification:** `bun test conformance/tests/xaravel/bots.test.ts` 4 pass; `bun run test` 237 pass 0 fail; `bun run typecheck` exit 0; `bun run lint` exit 0.
- **Residual risk:** GitHub's evaluation of `open.if` and of `secrets.X != ''` in `env` is checked only by string shape; the next `bots` run on `main` should be green with `open` skipped.
