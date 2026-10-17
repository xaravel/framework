---
title: 'ruleset:verify fails fast with no token (retro epic-1 item 8)'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: '924debec9183ca02ccf97a6f2deaf314ec3ac716'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `client()` builds an `Api` with a `null` token when `GH_TOKEN` is unset or empty (`tools/ruleset/ruleset.ts:559-562`), so `verify` sends unauthenticated requests. GitHub answers them with partial public data, and `verify` reports false drift (`bypass_actors … live missing`, `org admins are []`) instead of saying it has no credentials (retro finding D8).

**Approach:** `client()` refuses to build an `Api` without a token: it throws, and `main`'s existing fail-closed handler prints one `Ruleset check failed: GH_TOKEN is not set, so the live rulesets cannot be read; run with GH_TOKEN="$(gh auth token)" (AD-16)` line and exits 1. No HTTP request is sent. Because `verify`, `apply` and `identity` all call `client()`, all three fail the same way.

## Boundaries & Constraints

**Always:** Treat an empty `GH_TOKEN` as unset (as today). Exit 1 (fail closed, as the header comment says for "any failure"), not 2. Send zero requests when the token is missing. Keep every existing message, exit code and the `merge-group-pr` command (which needs no token) unchanged. Update the header comment line about `GH_TOKEN` to say it is required for `verify`, `apply` and `identity`, and `docs/ops/identities.md` near the `verify` paragraph to say a missing token exits 1 with that message. XT-conformance-30 keeps every existing case.

**Never:** No change to `Api`'s nullable token parameter's semantics beyond what `client()` passes, to the policy or identity logic, to the workflows, to `tools/protected-paths/`, `tools/ownership/`, `AGENTS.md`, the spine, SPEC, PRD or `epics.md`. Do not fall back to `gh auth token` or `GITHUB_TOKEN` automatically.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token set | `GH_TOKEN=test-token` | unchanged behaviour | — |
| No token, verify | `GH_TOKEN` unset or `""` | stderr exactly the no-token line, no request reaches the API | exit 1 |
| No token, apply | same, valid committed rulesets | same line, no request, no write | exit 1 |
| No token, identity | same | same line, no request | exit 1 |
| merge-group-pr | no token | unchanged | exit 0/1 as today |

</intent-contract>

## Code Map

- `tools/ruleset/ruleset.ts` -- header comment line 23 (`token GH_TOKEN`); `client()` 559-562 (the fix); `verify` 575, `apply` 650-ish (calls `client()` after its local policy check), `identity` (calls `client()` first); `main` 708-733 catch prints `Ruleset check failed: <message> (AD-16)` and returns 1.
- `conformance/tests/xaravel/repository-policy.test.ts` -- `run` 82-91 (spawns with only `PATH` plus given env, so `GH_TOKEN: ""` reads as unset); `FakeGitHub` 93-105 (add a request counter); `runRuleset` 108-176 (count every request before the auth check); XT-conformance-30 401 case at 413-415 (place the no-token cases beside it).
- `docs/ops/identities.md:46-52` -- the `verify` paragraph.

## Tasks & Acceptance

**Execution:**
- `tools/ruleset/ruleset.ts` -- `client()` throws the no-token error when `GH_TOKEN` is unset or empty; update the header comment -- closes D8.
- `conformance/tests/xaravel/repository-policy.test.ts` -- add a `requests` counter to the fake; in XT-conformance-30, run `verify`, `apply --root <valid dir>` and `identity` with token `""` and assert exit 1, the exact stderr line, and zero requests.
- `docs/ops/identities.md` -- one sentence: without `GH_TOKEN`, `verify`, `apply` and `identity` exit 1 with `GH_TOKEN is not set` and contact nothing.

**Acceptance Criteria:**
- Given `GH_TOKEN` unset, when `bun run ruleset:verify` runs, then it exits 1 with the single no-token line on stderr and prints no `ruleset drift:` or `policy:` line.
- Given `GH_TOKEN` set, when the existing XT-conformance-30/32 cases run, then they pass unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 18 findings — high 0, medium 4, low 13, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) The unset-`GH_TOKEN` path is untested; `runRuleset` always sets `GH_TOKEN`, so only `""` runs — `runRuleset` now takes `token: string | null` and omits the key for `null`; the no-token cases run for both.
  - `[medium]` `[patch]` (blind) "Unset" case never tested, only the empty string — same root cause as the verification-gap row; same fix.
  - `[low]` `[patch]` (blind) `docs/ops/identities.md` says each command exits 1 with the no-token line unconditionally, but `verify` reads committed files and `apply` checks policy first — reworded: no command contacts GitHub without the token, and the line prints once the committed rulesets pass their local checks.
  - `[low]` `[patch]` (blind) The `identity` no-token case sits under XT-conformance-30 though `identity` is XT-conformance-32 — moved into XT-conformance-32.
  - `[low]` `[reject]` (blind) The message ("live rulesets cannot be read") fits only `verify` — the exact line is fixed in this spec's intent contract; the fix is a spec edit.
  - `[low]` `[reject]` (blind) The `apply` and `identity` doc sections do not mention the token rule — both already show `GH_TOKEN="$(gh auth token)"` in their commands; placement nicety.
  - `[low]` `[reject]` (blind) A whitespace-only token is not treated as missing — it sends a malformed header and fails closed with HTTP 401 (already tested for a wrong token); rare, and the fix adds a new normalisation rule.
  - `[low]` `[reject]` (blind) `USAGE` does not mention `GH_TOKEN` — the header comment and `docs/ops/identities.md` state it; nicety that adds surface.
  - `[low]` `[reject]` (blind) The message is spelled out in code, test and doc — the test pins the code's text exactly; the doc copy drifting is cosmetic.
  - `[low]` `[reject]` (edge) Whitespace-only or newline token passes the guard — same as the blind whitespace row; fails closed with HTTP 401.
  - `[low]` `[patch]` (edge) `apply` with no token and a policy-violating `main.json` prints policy lines, not the token line — no request is sent, so behaviour is correct; the doc claim was the defect, fixed with the doc rewording above.
  - `[low]` `[patch]` (edge) `verify` with unreadable committed files reports the file error first — same root cause and fix as the doc rewording row.
  - `[medium]` `[patch]` (edge) The fully unset case is untested — same root cause as the verification-gap row; same fix.
  - `[low]` `[reject]` (edge) `Api`'s null-token branch is now unreachable from `client()` — the exported `Api` keeps its nullable constructor; narrowing it changes the public signature for no user-facing gain.
  - `[low]` `[patch]` (edge, claim) The doc claims each command exits 1 with the token line — same as the doc rewording row; same fix.
  - `[medium]` `[patch]` (intent) The tests exercise `GH_TOKEN=""`, not the `env -u` reproduction — same root cause as the verification-gap row; same fix. The `env -u GH_TOKEN bun run ruleset:verify` reproduction was also run by hand (exit 1, the no-token line only).
  - `[low]` `[patch]` (intent) Order-dependent paths mean the token line is not always the only output — same root cause as the doc rewording row.
  - `[false]` `[reject]` (intent) An authenticated but under-privileged token is not handled (reading R5) — the intent's trigger is "when GH_TOKEN is unset"; a present token is outside it.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/repository-policy.test.ts` -- expected: all pass
- `env -u GH_TOKEN bun run ruleset:verify` -- expected: exit 1, the no-token line only
- `bun test`, `bun run typecheck`, `bun run lint` -- expected: pass

## Auto Run Result

Status: done

**Summary:** `client()` in `tools/ruleset/ruleset.ts` now refuses to build an `Api` when `GH_TOKEN` is unset or empty. `verify`, `apply` and `identity` exit 1 with `Ruleset check failed: GH_TOKEN is not set, so the live rulesets cannot be read; run with GH_TOKEN="$(gh auth token)" (AD-16)` and send no request, instead of reporting false drift from unauthenticated data (retro finding D8).

**Files changed:**
- `tools/ruleset/ruleset.ts` -- `client()` throws without a token; the header comment states the requirement.
- `conformance/tests/xaravel/repository-policy.test.ts` -- the fake counts requests; `runRuleset` accepts a `null` token (key omitted); XT-conformance-30 covers `verify` and `apply`, XT-conformance-32 covers `identity`, each with `""` and unset: exit 1, exact stderr, empty stdout, zero requests, no writes.
- `docs/ops/identities.md` -- one sentence on the no-token behaviour.

**Review findings:** 18 findings. Three root causes patched: the unset case is now tested (medium), the doc wording is corrected (low), and the `identity` case moved to XT-conformance-32 (low). Nothing deferred. Rejected: the message wording (fixed by the intent contract), doc placement, whitespace-only token (fails closed with HTTP 401), `USAGE` text, the message copied in three places, the dead `Api` null branch, and the under-privileged-token reading (false: outside the intent). The reasons are in the triage log.

**Follow-up review:** false. Patched entries: high 0, medium 1, low 2.

**Verification:** `bun test` 38 pass, 0 fail. `bun run typecheck` and `bun run lint` are clean. `env -u GH_TOKEN bun run ruleset:verify` exits 1 and prints only the no-token line. `GH_TOKEN="$(gh auth token)" bun run ruleset:verify` reaches the live API and reports one real drift: `agent-push.json enforcement: committed "active", live "disabled"`. That drift is the Maintainer's deliberate disable, tracked by `epic-1-retro-item-9-agent-pushes-merge-queue`.

**Residual risks:** a whitespace-only token still reaches the API and fails with HTTP 401 rather than the no-token line.
