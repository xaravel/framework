---
title: 'Retro 3 item 1: isolate the evaluator child stdout from the line protocol'
type: 'bugfix'
created: '2026-10-18'
status: 'done'
baseline_revision: 'f03cff352fd85abfefd5c862bc233aa283ba71ab'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      The noisy-request assertions in XT-conformance-71 skip in CI, so a regression of the stdout isolation would not be caught there.
    evidence: |-
      phpTest skips without /tmp/xaravel-inv/framework; no workflow runs oracle-fixtures.test.ts with XARAVEL_PHP_FIXTURES=require. Covered by action item epic-3-retro-item-3-real-php-oracle-tests-in-ci.
    location: >-
      conformance/tests/xaravel/oracle-fixtures.test.ts:344
    severity: medium
  - summary: >-
      The forked child inherits fd 3, so deliberately hostile request code can still write a forged protocol line.
    evidence: |-
      PHP cannot close an inherited raw fd without FFI; request code is arbitrary PHP under the same uid (also able to reach /proc/<ppid>/fd). Belongs to retro finding R4 (per-Story request provenance), action item epic-3-retro-item-9-target-epic-3-deferrals.
    location: >-
      tools/oracle/evaluate.php
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `tools/oracle/evaluate.php` forks one child per request, and the child inherits the parent's fd 1, which carries the line-per-request protocol that `parsePass` (`tools/oracle/fixtures.ts:393`) reads. Any `echo`, `print`, `var_dump`, displayed notice, or `dump()` (Symfony VarDumper writes to `php://stdout` in CLI) from Upstream code or a request's `setup`/`exprs` lands in that stream, aborting the batch or injecting forged protocol lines (Epic 3 retrospective, finding R1; action item `epic-3-retro-item-1-evaluator-stdout-buffer`).

**Approach:** In the forked child, before it evaluates anything, point fd 1 at `/dev/null` (close `STDOUT`, reopen `/dev/null` so it takes fd 1) and start a discarding output buffer, so neither the PHP output layer nor direct writes to `php://stdout` reach the parent's stdout. Only the parent writes protocol lines.

## Boundaries & Constraints

**Always:** Child answers still travel only over the socket pair; the parent alone writes to stdout. Discarded child output is not recorded in fixtures (the output schema and every signed fixture stay byte-identical). stderr is left as is. Keep the header comment accurate.

**Never:** Change the output line format, `parsePass`, `fixtures.ts`, the request schema, or any committed fixture. Do not weaken or remove existing assertions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Quiet request | request with no output | unchanged output line | none |
| Noisy request | `setup` echoes, prints, writes a forged `{"sha256":…}` line to `php://stdout`, and raises a displayed notice; `exprs: ["1"]` | stdout has exactly one line per request, in order; the noisy one's output is `{error:null, results:[{value:{int:"1"}}]}` | none |
| Noisy request that dies | output then a fatal error | the existing `fatal` stage answer, no stray stdout | existing shutdown handler |

</intent-contract>

## Code Map

- `tools/oracle/evaluate.php:430-457` -- `runChild()`; the `$pid === 0` branch is where the child must detach fd 1 before `evaluate()` and before the shutdown handler can write anything.
- `tools/oracle/evaluate.php:1-66` -- header comment; step 3 describes the per-request fork and should say child stdout is discarded.
- `tools/oracle/evaluate.php:503-525` -- parent loop; writes protocol lines to its own `php://stdout` (unchanged).
- `tools/oracle/fixtures.ts:393-418` -- `parsePass`, the consumer (read-only).
- `conformance/tests/xaravel/oracle-fixtures.test.ts:358-403` -- XT-conformance-71, the real-PHP evaluator test (runs locally against `/tmp/xaravel-inv/framework` with PHP 8.5.11 + pcntl; skips otherwise). Its `extra` requests are the place to add a noisy request.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/evaluate.php` -- in the child branch of `runChild()`, close `STDOUT`, open `/dev/null` for writing and keep the handle alive, then `ob_start()` with a callback that discards; update the header comment -- isolates the protocol stream from request and Upstream output.
- `conformance/tests/xaravel/oracle-fixtures.test.ts` -- add a noisy `extra` request to XT-conformance-71 (echo, print, a forged protocol line via `fopen('php://stdout','w')`, a displayed `E_USER_NOTICE` with `display_errors=1`) and a noisy fatal `extra` request (echo, then a compile error such as `eval('class NoisyFatal { abstract function f(); }');`) whose output must be `{error:{stage:"fatal",…}, results:[]}`; assert the noisy line is in order with `{error:null, results:[{value:{int:"1"}}]}`, while the existing assertions keep passing -- proves the matrix.

**Acceptance Criteria:**
- Given the noisy request in a batch, when `evaluate.php` runs, then stdout holds exactly one JSON line per request in input order and no forged line.
- Given the existing committed requests, when `bun run oracle:verify-fixtures` runs, then all fixtures still verify (no fixture bytes change).

## Spec Change Log

- 2026-10-18, implementation: the prescribed `fclose(STDOUT)` in the child broke every `blade-render` request (`setUp` stage: "The StreamOutput class needs a stream as its first argument."): Symfony's `ConsoleOutput`, built by Testbench, writes to the `\STDOUT` constant, which a closed resource invalidates, and PHP has no `dup2()`. Approach changed, intent unchanged: `evaluate.php` re-runs itself once at startup (`proc_open([PHP_BINARY, ...$argv])`, marker env `XARAVEL_EVALUATE_PROTOCOL_FD=3`, removed from the environment again in the inner process) with fd 1 on `/dev/null` and the real stdout on fd 3; the protocol writer opens `php://fd/3`. The child still starts a discarding output buffer, via the named function `discardOutput` rather than a closure, because a closure takes an object id and shifted Carbon's `constructedObjectId` in recorded values. Over all 1857 committed requests run locally, old and new outputs differ only in requests listed in `nondeterminism.jsonl`, the same set that differs between two runs of the old script.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 33 findings — high 0, medium 5, low 15, false 3, maybe-false 0 (10 rejected as fixes to this spec or as duplicates rendered `low`)
- findings:
  - (blind) `[low]` `[reject]` Spec body (Approach, Code Map, Tasks, Design Notes) still describes the abandoned `fclose(STDOUT)` approach — real, but the fix is editing this build's spec; the Spec Change Log records the switch.
  - (blind) `[low]` `[reject]` Preset `XARAVEL_EVALUATE_PROTOCOL_FD=3` in the caller's env skips the re-exec — no caller sets it (`fixtures.ts` evaluateOnce, oracle.yml); fix needs a new guard.
  - (blind) `[low]` `[reject]` Re-exec drops outer `-d`/`-c`/`-n` interpreter options — every caller runs plain `php` (`fixtures.ts:364-372`); fix needs forwarding logic.
  - (blind) `[low]` `[reject]` Killing only the outer pid orphans the inner run — image runs are `docker run --rm` (container teardown kills all); fix needs signal forwarding.
  - (blind) `[low]` `[patch]` Outer exit collapses a signalled inner death to exit 1 with empty stderr — patched: stderr reason on nonzero inner exit.
  - (blind) `[medium]` `[patch]` Discarding buffer has no chunk size, unbounded child memory on heavy output — patched: `ob_start('discardOutput', 4096)`.
  - (blind) `[low]` `[patch]` New test never asserts `'before the fatal'` absent and leaves the fatal message unchecked — patched: noise list extended, message asserted to contain `NoisyFatal`.
  - (blind) `[low]` `[reject]` Parent-side bootstrap output now goes to /dev/null silently — `log_errors` still reports to stderr; the change intends stdout to carry only protocol.
  - (blind) `[low]` `[defer]` Image mode and the 1857-request comparison have no Verification command — same root as the verification-gap finding below.
  - (blind) `[false]` `[reject]` Spec metadata `review_loop_iteration: 0` with empty triage log is inconsistent — it was read before the first review pass; consistent at that time.
  - (edge) `[medium]` `[patch]` Unchunked buffer at evaluate.php child — duplicate of the blind finding; same patch.
  - (edge) `[low]` `[patch]` Signalled inner exit gives empty stderr — duplicate; same patch.
  - (edge) `[low]` `[reject]` CLI ini options lost — duplicate of blind finding; same reason.
  - (edge) `[low]` `[reject]` Preset env marker — duplicate of blind finding; same reason.
  - (edge) `[low]` `[reject]` STDIN/STDOUT constants undefined when fd 0/1 closed — every caller (Bun spawn `stdin: "ignore"` = /dev/null, docker run) leaves them open; the test run passed under spawnSync.
  - (edge) `[low]` `[reject]` Empty `PHP_BINARY` — not reachable with the CLI binary in the image or locally; needs a new guard.
  - (edge) `[low]` `[patch]` Missing `proc_open` blamed on pcntl/posix — patched: message names only the function for proc_open.
  - (edge) `[low]` `[reject]` Orphaned inner on outer SIGTERM — duplicate; same reason.
  - (edge) `[low]` `[patch]` `'before the fatal'` never asserted — duplicate; same patch.
  - (edge) `[false]` `[reject]` claim: intent Approach says close STDOUT — the intent's outcome (fd 1 on /dev/null, discarding buffer) holds; mechanism change is logged in the Spec Change Log; fix would be a spec edit.
  - (edge) `[false]` `[reject]` claim: Tasks describe close STDOUT — same; fix is a spec edit.
  - (edge) `[medium]` `[patch]` claim: comments say only the parent/protocol writer reaches stdout, but children inherit fd 3 — patched: comments reworded to claim isolation from accidental output only.
  - (verification-gap) `[medium]` `[defer]` The new noisy-request assertions never run in CI (XT-conformance-71 skips without the local install) — pre-verified; already covered by action item `epic-3-retro-item-3-real-php-oracle-tests-in-ci`.
  - (verification-gap other) `[low]` `[reject]` Preset env marker — duplicate; same reason.
  - (verification-gap other) `[low]` `[reject]` Exit status collapse loses diagnostics — the stderr reason patch covers the contract; the exact code is not consumed (`fixtures.ts:359` checks nonzero only).
  - (intent) `[low]` `[reject]` Reading R-A (literal `ob_start()` only) — the diff includes `ob_start` and implements the outcome reading R-B, which subsumes it.
  - (intent) `[medium]` `[defer]` Reading R-C: the forked child inherits fd 3, so deliberately hostile request code can still write a forged protocol line — pre-existing class: request code is arbitrary PHP under the same uid (it can also reach the parent via /proc/<ppid>/fd), which is retro finding R4, deferred into action item 9 (per-Story request provenance).
  - (intent) `[low]` `[reject]` Reading R-D broad scope — the diff covers the broad form; no divergence.
  - (intent) `[low]` `[reject]` Reading R-E consumer-side hardening — excluded by the intent (fix in evaluate.php).
  - (intent) `[medium]` `[defer]` Image path never exercised by the new test — same root as the verification-gap finding; retro item 3.
  - (intent) `[low]` `[reject]` Mechanism reaches beyond "buffer the child stdout" (re-exec, proc_open, fd 3) — required because `fclose(STDOUT)` breaks Testbench (Spec Change Log); outcome matches intent.
  - (intent) `[low]` `[reject]` Spec artifact still describes the abandoned approach — duplicate; fix is a spec edit.
  - (intent) `[low]` `[reject]` Scope bookkeeping — no divergence found.

## Design Notes

`ob_start()` alone is not enough: VarDumper and any `fopen('php://stdout')` write to fd 1 directly, bypassing the output layer. `fclose(STDOUT); $null = fopen('/dev/null', 'wb');` makes `/dev/null` take the lowest free fd, which is 1 when stdin is open; if stdin were closed the reopened handle takes fd 0 and `php://stdout` fails to dup fd 1, which still keeps output out of the parent's stream. Verified by a local prototype (PHP 8.5.11, stdin open and closed).

## Verification

**Commands:**
- `XARAVEL_PHP_FIXTURES=require bun test conformance/tests/xaravel/oracle-fixtures.test.ts` -- expected: all pass, XT-conformance-71 not skipped.
- `bun test` -- expected: all pass.
- `bun run typecheck && bun run lint` -- expected: clean.
- `bun run oracle:verify-fixtures` -- expected: OK.

## Auto Run Result

Status: done

**Summary:** `tools/oracle/evaluate.php` re-runs itself once at startup with fd 1 on `/dev/null` and the real stdout on fd 3; the protocol writer opens `php://fd/3`, and each forked child starts a chunked discarding output buffer. Accidental output from Upstream code or a request (echo, print, displayed errors, `dump()`, writes to `STDOUT` or `php://stdout`) no longer reaches the line protocol `parsePass` reads. Output format and all fixtures unchanged.

**Files changed:**
- `tools/oracle/evaluate.php` -- re-exec with the protocol on fd 3, discarding child buffer, stderr reason on inner failure, header comment.
- `conformance/tests/xaravel/oracle-fixtures.test.ts` -- XT-conformance-71 gains a noisy request and a noisy fatal request with absence and answer assertions.

**Review:** 33 findings. Patched 5 entries (1 medium buffer chunk size, 1 medium comment accuracy, 3 low: exit reason, proc_open message, test gaps). Deferred 2 (CI never runs the real-PHP test: retro item 3; hostile code can still write to inherited fd 3: retro R4 / item 9). Rejected the rest with reasons in the triage log (spec-text edits, unreachable caller conditions, duplicates).

**Follow-up review recommended:** false (no high patched; 2 medium patched, both small and re-verified, no specific unverified risk beyond the deferred image-mode run).

**Verification:** `XARAVEL_PHP_FIXTURES=require bun test conformance/tests/xaravel/oracle-fixtures.test.ts` 9 pass (XT-conformance-71 ran); `bun test` 128 pass, 0 fail; `bun run typecheck` and `bun run lint` clean; `bun run oracle:verify-fixtures` 1834 fixtures OK; `php -l` clean. The implementer compared all 1857 committed requests old vs new locally: differences only in `nondeterminism.jsonl` entries.

**Residual risks:** the Oracle image path (`docker run`) was not run locally (no Docker); the `oracle.yml` build job runs it on this PR's `tools/oracle/**` change.
