---
title: 'Epic 8 retro item 8: probes:check tests the recorded workarounds'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: '6bbe4549e5ab159d8d96f82d9595334cf48d5b33'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      An unsupported probe whose decisions/<ESC>.md validly rejects its Escalation passes probes:check.
    evidence: |-
      escalationProblems flags only decisionStatus "open"; DECISIONS is approved | rejected. The spec settles "not open", and before this change no decision was checked at all, so a rejected-decision rule is a new policy for the Maintainer or a later item, not a fix to this change.
    location: >-
      conformance/probes/probes.ts:1142
    severity: medium
  - summary: >-
      als.concurrent-requests treats a non-interleaved run (scheduling noise on a loaded runner) as unsupported, which probes:check reports as drift.
    evidence: |-
      The interleave logic is unchanged from the old combined probe, where an unsupported record masked it; now the probe is recorded supported. Local runs: interleaved 3 of 3, and CI ran the old combined probe with interleaved: yes. Settle by watching the CI check job's Probe the Bun primitives step over several runs.
    location: >-
      conformance/probes/probes.ts:870
    severity: medium (unverified)
  - summary: >-
      No test drives alsProbe or probeServeCallbacks to a failed workaround, so the producer side of workaround false is checked only by reading the code.
    evidence: |-
      XT-conformance-155 checks live outcomes (always true on Bun 1.4.3) and checkProbes on hand-built maps; the evidence-text pin "restores the frame: yes" still catches a real failure in bun test. Closing it needs a scenario-injection seam.
    location: >-
      conformance/probes/probes.test.ts:181
    severity: low
---

<intent-contract>

## Intent

**Problem:** `probes:check` compares only a probe's status with the record (Epic 8 retro finding L4, action item `epic-8-retro-item-8-probe-workarounds`). An `unsupported` ALS probe reports "restores the frame: yes/no" only in evidence text, so a workaround the ESC-8.3 rulings rest on can stop working and the check stays green. `als.serve-callbacks` folds concurrent-request isolation into the same unsupported probe, so a Bun that leaked frames between requests would stay green. `escalationProblems` checks the Escalation but not that `decisions/<ESC>.md` exists.

**Approach:** Give each registry probe an optional `workaround` (its description, or null) and each live result a `workaround` outcome (`true` restores, `false` fails, `null` not tried). `check` reports a violation when a probe with a workaround is live `unsupported` and its outcome is not `true`. Split a new backend-free probe `als.concurrent-requests` (no workaround) out of `als.serve-callbacks`, which keeps its id and Escalation and now checks only the `error` callback. Require `decisions/<ESC>.md` to exist and decide its Escalation (`decisionStatus` not `open`) for every unsupported probe.

## Boundaries & Constraints

**Always:** Every existing violation and message stays. Fail closed: a probe with a workaround that throws or times out (outcome `null`) while unsupported is a violation. `run --json` includes the `workaround` field. Regenerate `REPORT.md`; record `als.concurrent-requests` in `results.json` from a live run (it must be `supported`, escalation null). Update the header comment of `probes.ts` and `docs/ops/probes.md` (probe list, violations, Unsupported probes and re-recording sections: a new unsupported probe fails the check until its Escalation is ruled).

**Never:** Edit any `conformance/escalations/ESC-8.3-*.md` or `decisions/ESC-8.3-*.md` (decisions bind the Escalation by SHA-256), the spine, PRD, SPEC, `epics.md` or `AGENTS.md`. Never remove or weaken an existing test assertion; counts that were literal 20 become derived from `EXPECTED_IDS.length` and the ID list gains the new probe.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Workaround holds | `als.direct-stream` live unsupported, workaround `true`, recorded unsupported with ruled ESC | no violation | — |
| Workaround fails | same, live workaround `false` | `als.direct-stream: unsupported and its workaround (AsyncLocalStorage.bind on pull) does not hold: <evidence>` | exit 1 |
| Probe threw | probe with workaround, live unsupported, workaround `null` | same violation as above | exit 1 |
| No workaround declared | `bun-image.laravel-api` unsupported, workaround `null` | no workaround violation | — |
| Concurrent leak | `als.concurrent-requests` live unsupported, recorded supported | existing `live unsupported, recorded supported` drift violation | exit 1 |
| Decision missing | unsupported probe's ESC file exists, `decisions/<ESC>.md` absent | `<id>: <ESC> has no decision (decisions/<ESC>.md does not exist)` | exit 1 |
| Decision does not bind | decision file invalid or stale | `<id>: <ESC> has no decision (decisions/<ESC>.md does not decide it)` | exit 1 |

</intent-contract>

## Code Map

- `conformance/probes/probes.ts` -- the probes and check. `LiveResult`/`Probe` types `:88-102`; `alsProbe` `:785-792` (returns `wrapped.same`); `probeServeCallbacks` `:852-925` (split: concurrent half into `probeConcurrentRequests`, error half stays); `PROBES` `:942-963`; `runProbe` `:966-989` (thread `workaround`, `null` on throw/timeout/not-run); `escalationProblems` `:1085-1105` (add decision check, reuse `decisionStatus` from `tools/escalations/escalations.ts:351`, `DECISIONS_DIR` const at `:65`); `checkProbes` `:1120-1185`; `liveLines`/`main` JSON output `:1236-1260`. Header comment `:1-57` lists violations.
- `conformance/probes/probes.test.ts` -- XT-conformance-155/156. `EXPECTED_IDS` `:42-63`; `unsupportedEvidenceHolds` `:81-95` (serve-callbacks now only `restores the frame: yes`; add `als.concurrent-requests` nowhere since it is supported); `fixture()` `:113-129` must also copy `decisions/ESC-8.3-*.md`; hard-coded `20` at `:238-240`; XT-156 pure-check list `:330-352`.
- `conformance/probes/results.json`, `conformance/probes/REPORT.md` -- record and generated report.
- `docs/ops/probes.md` -- probe table `:12`, Unsupported probes and Re-recording sections.
- `tools/escalations/escalations.ts` -- read-only; `decisionStatus(id, escalationText, decisionText)`.

## Tasks & Acceptance

**Execution:**
- `conformance/probes/probes.ts` -- add `workaround: string | null` to `Probe` and `workaround: boolean | null` to `LiveResult`; probe `run` returns an optional `workaround` outcome; `alsProbe` and the error-callback probe report it; add `als.concurrent-requests` before `als.serve-callbacks`; add the workaround and decision violations; update header -- L4.
- `conformance/probes/probes.test.ts` -- extend XT-155 (registry has the new id; each probe with a workaround that is live unsupported has outcome `true`; a live map with a failed and a `null` workaround yields the violation) and XT-156 (missing and stale decision violations; fixture copies decisions) -- prove each matrix row.
- `conformance/probes/results.json`, `REPORT.md` -- `bun run probes:record` is impossible without backends; add the new row by hand from a live run, then `bun run probes:generate`.
- `docs/ops/probes.md` -- document the split, the new violations and the ruling requirement.

**Acceptance Criteria:**
- Given the committed repo on Bun 1.4.3, when `bun run probes:check` runs, then it exits 0 and prints 21 probe lines with `als.concurrent-requests: supported`.
- Given every matrix row, when `checkProbes` runs on a fixture root, then it reports exactly the violation listed.

## Verification

**Commands:**
- `bun test conformance/probes` -- expected: XT-conformance-155 and 156 pass.
- `bun run probes:check` -- expected: `PROBES OK: 9 supported, 4 unsupported, 8 not run (of 21).`
- `bun run typecheck && bun run lint && bun run escalations:check` -- expected: exit 0.
- `bun run harness --xaravel` -- expected: `differ=0`.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 24 findings — high 0, medium 3, low 12, false 4, maybe-false 5
- findings:
  - `[medium]` `[defer]` (blind) A rejected decision passes the ruling check — real, but the spec and intent ask for existence/"not open"; rejected handling is a new policy, deferred.
  - `[low]` `[reject]` (blind) Probe `workaround` text is not tied to the decision's wording — matching free text adds parsing complexity for no observed harm; the live outcome is what L4 asked to enforce.
  - `[low]` `[patch]` (blind) `als.await`/`timers`/`stream-body` workarounds are labelled ESC-8.3 rulings though AD-5, not ESC-8.3-1, covers them — reworded the `probes.ts` header and `Probe.workaround` docstring and the docs paragraph.
  - `[low]` `[patch]` (blind) ESC-8.3-2's quoted evidence predates the split — added a docs note that the bound Escalation keeps the combined output.
  - `[low]` `[reject]` (blind) Timeout path untested — it shares the catch branch the throw test covers; an injectable timeout is more than a direct correction.
  - `[maybe-false]` `[reject]` (blind) "for another id" decision branch untested from probes — that branch is `decisionStatus`'s own; if real only low.
  - `[low]` `[reject]` (blind) No test asserts `run --json` carries `workaround` — the whole object is serialised; a CLI test is more than a direct correction for a cosmetic output.
  - `[low]` `[reject]` (blind) `ProbeOutcome.workaround` optional — fails closed with a "does not hold" message; making it required touches every probe.
  - `[false]` `[reject]` (blind) serve-callbacks evidence pin weakened — it never pinned "undefined"; the removed concurrency clauses moved to `als.concurrent-requests`, whose `supported` status needs the exact `[true,true,true]` strings and interleaving.
  - `[maybe-false]` `[defer]` (blind) Concurrent probe can flake on scheduling — grouped with the edge-case finding below.
  - `[low]` `[reject]` (blind) Verification section omits the full harness and probes:generate — fix edits the spec; `bun run harness --xaravel` and generate were run (below).
  - `[low]` `[reject]` (blind) Code Map line numbers stale — fix edits the spec.
  - `[low]` `[reject]` (blind) Redundant decision-existence loop in XT-156 — harmless duplicate assertion on the real repo.
  - `[maybe-false]` `[defer]` (edge) Rejected decision passes — same as the first row.
  - `[maybe-false]` `[defer]` (edge) Non-interleaved run is reported as drift — settle by observing CI runs; deferred medium (unverified).
  - `[low]` `[reject]` (edge) Uncleared 1 s `Bun.sleep` race timer — at most 1 s at exit; pattern pre-existing.
  - `[false]` `[reject]` (edge) Two violations for recorded-supported plus failed workaround — both are accurate and name different facts.
  - `[false]` `[reject]` (edge) Concurrent evidence not pinned — `supported` requires the exact concurrent string and interleaving.
  - `[low]` `[patch]` (edge) ESC-8.3-2 quoted output differs from live evidence — same docs note as above.
  - `[medium]` `[defer]` (verification-gap) No test sees a producer report `workaround: false` — filed disposition defer; the evidence-text pin still catches it.
  - `[low]` `[reject]` (intent) ESC-8.3-2's primary remedy (kernel catches in frame) is not probed — that is framework code a later epic writes; the probe tests the fallback it can.
  - `[low]` `[patch]` (intent) The split is not reflected in the Escalation trail — same docs note.
  - `[false]` `[reject]` (intent) Clause C is stricter than literal — the spec chose "decides it" deliberately and documents the consequence.
  - `[maybe-false]` `[reject]` (intent) Workaround check skips a recorded-unsupported probe that is live not-run — no backend probe declares a workaround, so it cannot occur today; if real only low.

## Auto Run Result

Status: done

**Summary.** `probes:check` now enforces the recorded workarounds (Epic 8 retro finding L4). Each probe may declare a `workaround`, and each live result carries its outcome (`true`/`false`/`null`). A probe with a workaround that is live unsupported fails the check unless the outcome is `true`, which also covers a probe that threw or timed out. A new probe `als.concurrent-requests`, recorded supported, now carries the concurrent-request isolation check that used to sit inside `als.serve-callbacks`. `als.serve-callbacks` keeps its id and ESC-8.3-2 and checks only the `error` callback. An unsupported probe's `decisions/<ESC>.md` must exist and decide its Escalation.

**Files.**
- `conformance/probes/probes.ts` -- the workaround field and outcome, the split probe, and the decision and workaround violations; header comment updated.
- `conformance/probes/probes.test.ts` -- XT-conformance-155/156 cover every matrix row; the fixture copies decisions; counts are derived from `EXPECTED_IDS`.
- `conformance/probes/results.json`, `conformance/probes/REPORT.md` -- the new row; the report regenerated.
- `docs/ops/probes.md` -- the split, the new violations, the workaround section, the ruling requirement and the ESC-8.3-2 evidence note.

**Review.** 24 findings. 4 patched, all low and all doc wording. 3 deferred: the rejected decision, interleave flakiness, and the producer-side `false` test. 17 rejected, with reasons in the triage log.

**Follow-up review recommended:** false. No high or medium findings were patched (patched: high 0, medium 0, low 4).

**Verification.**
- `bun test conformance/probes`: 2 pass.
- `bun run probes:check`: `PROBES OK: 9 supported, 4 unsupported, 8 not run (of 21).`
- `typecheck`, `lint`, `lint:disables` and `escalations:check`: exit 0.
- `bun run harness --xaravel`: 289/289, `differ=0`.

**Residual risks.** `als.concurrent-requests` depends on timing to interleave, so a loaded CI runner could make it flaky (deferred). The 8 backend rows were not re-run locally.
