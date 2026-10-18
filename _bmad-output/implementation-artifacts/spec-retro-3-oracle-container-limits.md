---
title: 'Retro 3 item 5: resource limits on Oracle container runs'
type: 'bugfix'
created: '2026-10-18'
status: 'done'
baseline_revision: '7504b4a1b3fd03d80dfa6ded87a62f7be96699d5'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      runInImage containers have no wall-clock limit; a busy loop runs until the job's timeout-minutes.
    evidence: |-
      Bun.spawnSync in runInImage passes no timeout; --cpus only throttles. evaluate.php has a per-request TIMEOUT_SECONDS, other callers do not. Pre-existing, outside R3.
    location: >-
      tools/oracle/oracle.ts runInImage
    severity: low
  - summary: >-
      runInImage lacks --read-only, --cap-drop ALL and --security-opt no-new-privileges next to the same Story-supplied-PHP threat.
    evidence: |-
      Pre-existing; R3 named only memory, pids and CPU. The image already runs as USER 1001:1001.
    location: >-
      tools/oracle/oracle.ts runInImage
    severity: low
---

<intent-contract>

## Intent

**Problem:** `runInImage` (`tools/oracle/oracle.ts:720-731`) runs `docker run --rm --network none` with no `--memory`, `--pids-limit` or `--cpus`. It runs Story-supplied PHP (per-Story Oracle requests through `evaluate.php`) inside a CI job that holds `ORACLE_SIGNING_KEY` and the App key, so a request can exhaust the runner's memory, processes or CPU (Epic 3 retrospective, finding R3; action item `epic-3-retro-item-5-oracle-container-limits`).

**Approach:** Give every `runInImage` container fixed limits: `--memory 4g --memory-swap 4g` (no swap beyond the memory cap), `--pids-limit 512` and `--cpus 2`, held in one exported constant so tests and docs name the same values. When the container dies of the memory cap (exit 137), the thrown error says the limit may have been hit.

## Boundaries & Constraints

**Always:** The limits apply to every `runInImage` call (Inventory, extract, fixtures, per-Story, API surface, cross-check); they are fixed, not caller-configurable. Argument order stays `run --rm --network none <limits> <mounts> image command`. Docs in `docs/ops/oracle.md` describe the limits next to `--network none`. Keep the header comment in `oracle.ts` accurate.

**Never:** Change `runInImageNetworked`/`networkedRunArgs` (the baseline run executes Upstream's own suite, not Story input, and has its own sizing), `dockerOutput`, `readImageFile`, `oracle.yml`, any fixture, or any caller. Never weaken or remove an existing assertion; extend the expected args instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal run | `runInImage("img:1", mounts, ["echo","hello","world"])` with fake docker | stdout returned; docker args are `run --rm --network none --memory 4g --memory-swap 4g --pids-limit 512 --cpus 2 --volume … img:1 echo hello world` | none |
| Failing run | fake docker exits 2 | unchanged message `php x in img:1 failed (exit 2): …` | throws |
| Memory cap hit | docker exits 137 | message includes `exit 137` and names the 4g memory limit as a likely cause | throws |
| No docker | docker not on PATH | unchanged message | throws |

</intent-contract>

## Code Map

- `tools/oracle/oracle.ts:714-731` -- `runInImage` and its doc comment; add the limits after `--network none`, and the exit-137 hint in the thrown error.
- `tools/oracle/oracle.ts:39-43` -- header comment describing `runInImage` (no network, read-only mounts); add the limits.
- `tools/oracle/oracle.ts:66` -- `IMAGE_USER`, the neighbouring exported constant; the new limits constant sits near it.
- `conformance/tests/xaravel/oracle.test.ts:857-866` -- fake-docker assertions on `runInImage` args and errors; extend the expected args and add an exit-137 case (check how the fake docker in this file chooses its exit code; extend the fake only if it cannot already exit 137).
- `docs/ops/oracle.md:3` -- says `runInImage` runs with `--network none` and read-only mounts; add the limits.
- Callers (read-only): `tools/oracle/{fixtures,extract,story,api-surface}.ts`, `tools/inventory/{inventory,cross-check}.ts`.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/oracle.ts` -- export `IMAGE_RUN_LIMITS` (the six argv entries), splice it into `runInImage` args after `--network none`, append the memory-limit hint when exit code is 137, update doc and header comments -- bounds Story-supplied PHP.
- `conformance/tests/xaravel/oracle.test.ts` -- update the expected `runInImage` args to the literal limit flags; add an exit-137 assertion -- proves the matrix.
- `docs/ops/oracle.md` -- document the limits and the reason (Story-supplied PHP next to secrets).

**Acceptance Criteria:**
- Given any `runInImage` call, when it spawns docker, then the argv carries `--memory 4g --memory-swap 4g --pids-limit 512 --cpus 2` before the first `--volume`.
- Given this PR, when the `oracle.yml` `build` job runs `oracle:api-surface --check` and `oracle:extract --check` in the image (both through `runInImage`), then both pass under the limits.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 20 findings — high 0, medium 1, low 13, false 6, maybe-false 0
- findings:
  - (verification-gap) `[medium]` `[patch]` Non-137 failures are asserted by substring only, so a hint leaking onto every failure would pass — patched: exact message assertion for exit 2.
  - (verification-gap other) `[low]` `[patch]` Hint hardcodes `4g` apart from `IMAGE_RUN_LIMITS` — patched: memory value derived from the constant.
  - (edge) `[low]` `[patch]` Hint names a stale limit after the constant changes — duplicate of the hardcoded-4g row; same patch.
  - (edge) `[low]` `[reject]` `--cpus 2` is rejected on a host with fewer than 2 CPUs — CI runners have 4 vCPU and contributor Docker hosts rarely have 1; fix needs a host probe.
  - (edge) `[low]` `[reject]` Limits silently ignored without cgroup accounting — GitHub runners use cgroup v2 with memory/pids controllers; detection would add a stderr parser.
  - (edge) `[low]` `[patch]` Exit 137 can be a non-OOM SIGKILL — patched: hint reworded as "a SIGKILL, possibly the memory limit".
  - (edge) `[low]` `[reject]` No hint when the pids cap is hit — rare, and a hint needs a new stderr-matching branch.
  - (edge claim) `[false]` `[reject]` Spec says "six argv entries" but the constant has eight — real text slip, but the fix is a spec edit.
  - (blind) `[low]` `[patch]` Hardcoded `4g` — duplicate; same patch.
  - (blind) `[low]` `[patch]` Message repeats "exit 137" and reads badly with empty stderr; fake always writes stderr — patched: reworded hint, added an empty-stderr 137 case.
  - (blind) `[low]` `[patch]` Docs state the OOM cause as fact — patched: oracle.md wording softened.
  - (blind) `[low]` `[reject]` Pids/CPU caps fail with no diagnosis — duplicate of the pids-hint row; same reason.
  - (blind) `[low]` `[defer]` No wall-clock bound on a `runInImage` container — pre-existing; the intent names memory, pids and CPU only; jobs have `timeout-minutes` and evaluate.php a per-request timeout.
  - (blind) `[low]` `[patch]` `docs/ops/inventory.md:16` and `docs/ops/baseline.md:30` describe `runInImage` without the limits — patched: both mention the limits.
  - (blind) `[false]` `[reject]` CI acceptance misses inventory, cross-check and baseline-lister workloads — `inventory.yml` and `baseline.yml` both trigger on `tools/oracle/**`, so they run under the limits on this PR.
  - (blind) `[false]` `[reject]` Callers' argv not asserted to carry the limits — every caller's default runner is `runInImage`; there is no other path to add the flags or skip them.
  - (blind) `[low]` `[defer]` Other container hardening (`--read-only`, `--cap-drop ALL`, `no-new-privileges`) missing — pre-existing and outside the intent. `--user` is false: the image's `USER 1001:1001` (Dockerfile:150) already applies.
  - (blind) `[false]` `[reject]` Sprint status not updated — the orchestrator sets the action item done after this build, in the same PR.
  - (intent) `[false]` `[reject]` No real-container evidence of the caps — CI's `oracle.yml`, `inventory.yml` and `baseline.yml` run the image on this PR; Docker is unavailable locally.
  - (intent) `[false]` `[reject]` `runInImageNetworked` left unlimited (reading C) — the intent names `runInImage`; the baseline runner executes Upstream's suite, not Story input.

## Design Notes

Sizing: GitHub's `ubuntu-latest` runner has 4 vCPU and 16 GB. The heaviest `runInImage` workload is PHPUnit `--list-tests` over the framework suite with `memory_limit=-1`, and the `evaluate.php` batch, which forks one child at a time; both fit well under 4 GB and use a handful of processes. `--memory-swap` equal to `--memory` stops Docker's default of doubling the cap with swap. Values are a ceiling against abuse, not tuning.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle.test.ts` -- expected: all pass.
- `bun test` -- expected: all pass.
- `bun run typecheck && bun run lint` -- expected: clean.
- CI `oracle.yml` on the PR -- expected: green (Docker is not available locally).

## Auto Run Result

Status: done

**Summary:** Every `runInImage` container (Inventory, extract, fixtures, per-Story, API surface, cross-check, baseline lister) now runs with `IMAGE_RUN_LIMITS`: `--memory 4g --memory-swap 4g --pids-limit 512 --cpus 2`, after `--network none`. An exit-137 failure adds that it is a SIGKILL, possibly at the 4g memory limit; other failure messages are unchanged.

**Files changed:**
- `tools/oracle/oracle.ts` -- `MEMORY_LIMIT`, exported `IMAGE_RUN_LIMITS`, limits spliced into `runInImage`, exit-137 hint, comments.
- `conformance/tests/xaravel/oracle.test.ts` -- XT-conformance-44 expects the limit flags, matches the exit-2 message exactly, and checks exit 137 with and without stderr (fake docker gains `exit <code> [stderr...]`).
- `docs/ops/oracle.md`, `docs/ops/inventory.md`, `docs/ops/baseline.md` -- describe the limits.

**Review:** 20 findings. Patched 5 entries (1 medium: exact non-137 message assertion; 4 low: memory value from one constant, hint wording and empty-stderr case, softened docs, inventory/baseline docs). Deferred 2 low (no wall-clock bound; no `--read-only`/`--cap-drop`/`no-new-privileges`). Rejected the rest with reasons in the triage log (unlikely hosts with fewer than 2 CPUs or without cgroups, pids hint, spec-text slip, CI already runs `inventory.yml`/`baseline.yml`/`oracle.yml` on `tools/oracle/**`, sprint status handled by the orchestrator, `runInImageNetworked` out of intent).

**Follow-up review recommended:** false (no high patched, one medium patched; patched counts: high 0, medium 1, low 4).

**Verification:** `bun test conformance/tests/xaravel/oracle.test.ts` 3 pass; `bun test` 128 pass, 0 fail; `bun run typecheck` and `bun run lint` clean.

**Residual risks:** Docker is not available locally, so the limits are proven against real workloads only by the PR's `oracle.yml`, `inventory.yml` and `baseline.yml` runs; the 4g/512/2 sizing is an estimate until then.
