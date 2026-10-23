---
title: 'Retro item epic-10-item-1: the PSR interfaces join the committed API surface'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '1d028b0fb3fcf45d7046acf9e1e5bd0d06cf22c1'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      api-surface:gate recognises a raw Symbol.for token only for Illuminate\ and Laravel\ FQCNs, so a PSR token written that way would read as missing.
    evidence: |-
      Intent-alignment audit: isLaravelFqcn / contractFqcn in tools/api-surface/api-surface.ts (around lines 438-480); contract('<FQCN>') and registerClass are recognised for any FQCN. Not changed by this item; Story 10.1 should write its PSR tokens through contract().
    location: >-
      tools/api-surface/api-surface.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 10.1's `@xaravel/contracts/psr` tokens must take their method and parameter names from the committed API surface (ESC-10.1-1 (b)), but `oracle:api-surface` exports only Laravel's own `src/`, so no `Psr\` row exists (ESC-10.1-4, approved option 1; action item `epic-10-item-1-psr-api-surface`).

**Approach:** After the four Upstream repositories, `tools/oracle/api-surface.ts` runs `api-surface.php` twice more for each of `psr/container`, `psr/log` and `psr/simple-cache`, in a new interfaces-only mode, against the framework install's `vendor/<package>/<psr-4 dir>`. The version and PSR-4 directory come from the committed `conformance/oracle/locks/framework/composer.lock`; the PHP checks the installed version equals it. `componentForFqcn` maps `Psr\Container\`, `Psr\Log\`, `Psr\SimpleCache\` to `contracts`, so the rows land in `conformance/api-surface/contracts.jsonl`.

## Boundaries & Constraints

**Always:** Export every interface the package's source declares (tokenizer), and only interfaces: `psr/log`'s classes and traits (`AbstractLogger`, `NullLogger`, `LogLevel`, `LoggerTrait`, `LoggerAwareTrait`, `InvalidArgumentException`) are not exported, as the ruling says "every interface". A listed name that loads as a non-interface, a missing package in the lock, a lock PSR-4 prefix other than the expected namespace, or an installed version other than the lock's fails the run (exit 1, nothing written). Both passes must be byte-identical, as for the repositories. Regenerate `contracts.jsonl` with the real exporter (`--local`), never by hand; only `Psr\` rows are added to it. Keep every existing assertion in the touched tests; extend expected values only where the new passes change them.

**Never:** Edit another Component's rows, `conformance/api-surface/schema.json`, `additions.jsonl`, `exceptions.jsonl`, `conformance/component-map` (hand-signed data), `packages/**`, `conformance/expectations/**`, or the item's `action`/`owner`/`epic`. Export anything under `Psr\` outside the three namespaces. Export functions in interfaces mode.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Export | Oracle image or `--local` framework install with psr/container 2.0.2, psr/log 3.0.2, psr/simple-cache 3.0.0 | `contracts.jsonl` gains the 8 PSR interfaces with their methods, sorted with the existing rows | none |
| Version drift | installed version differs from the lock | exit 1: `api-surface: psr/log is installed at <v>, the lock pins <w>` | nothing written |
| Not an interface | interfaces mode, a tokenized interface name loads as a class (impossible in practice; fixture) | exit 1 naming it | nothing written |
| Lock gap | lock lacks the package, or its PSR-4 prefix differs | `API surface export failed: …` naming the package | nothing written |
| Map | `componentForFqcn(map, "Psr\\Log\\LoggerInterface")` | `contracts`; `Psr\\Clock\\ClockInterface` stays null | — |

</intent-contract>

## Code Map

- `tools/oracle/api-surface.php` -- argv parse (fixed 4 args today), `load`, `missedClasses`, main loop; add `--interfaces <package> <version>` mode: class list = tokenizer interfaces under src (sorted), each must be `isInterface()`, version via `Composer\InstalledVersions::getPrettyVersion`, functions and the class-list cross-check skipped (the list is derived from the same scan).
- `tools/oracle/api-surface.ts` -- `runOnce` (image + local command), `parsePass` (repo-typed; function component), `buildSurface` (loop over `UPSTREAM_REPOS`); add `PSR_PACKAGES`, a lock reader, and PSR passes after the repos. Header comment documents it.
- `tools/component-map/component-map.ts:279` -- `componentForFqcn`; add exported `PSR_NAMESPACES` fallback after the map lookup. `checkFqcns` iterates snapshot classes only, so it is unaffected.
- `conformance/oracle/locks/framework/composer.lock` -- read-only source of version and `autoload.psr-4` dir.
- `conformance/tests/xaravel/api-surface.test.ts` -- `withRoot` fixture (copy the lock into it or write a minimal one), `standIn` (asserts command shape per repo), XT-conformance-80 call list and counts, `runFixture`; `php-fixtures/api-surface/` has `autoload.php` + `src/`.
- `conformance/tests/xaravel/component-map.test.ts:306` -- `componentForFqcn` against the real map.
- `docs/ops/oracle.md` "API surface" -- command table and record sections describe passes; add the PSR passes.
- `decisions/ESC-10.1-4.md` -- the ruling (scope, versions, limits).

## Tasks & Acceptance

**Execution:**
- `tools/oracle/api-surface.php` -- interfaces mode as in the Code Map -- the PSR packages are not Laravel source and have classes that must not be exported.
- `tools/oracle/api-surface.ts` -- `PSR_PACKAGES` (`psr/container`→`Psr\Container\`, `psr/log`→`Psr\Log\`, `psr/simple-cache`→`Psr\SimpleCache\`), `psrPins(root)` reading the lock, two passes each after the repos in image and `--local` mode, lines through `parsePass` with a PSR label; fail on any function line from a PSR pass.
- `tools/component-map/component-map.ts` -- `PSR_NAMESPACES` and the fallback in `componentForFqcn`.
- `conformance/api-surface/contracts.jsonl` -- regenerate with `bun run oracle:api-surface --local <dir>` on locked installs of the four repos.
- `conformance/tests/xaravel/api-surface.test.ts` -- fixture root gets the lock and a `contracts` map record; stand-in answers PSR passes; XT-conformance-80 call list and counts extended; new `XT-conformance-260` (stand-in: PSR passes, version and prefix from the lock, lock gaps and a PSR function line fail and write nothing) and `XT-conformance-261` (real PHP: interfaces mode on a fixture package with an interface, a class and a trait exports only the interface; version mismatch fails).
- `conformance/tests/xaravel/component-map.test.ts` -- assert the three PSR namespaces map to `contracts` and `Psr\Clock\` does not.
- `docs/ops/oracle.md` -- document the PSR passes.

**Acceptance Criteria:**
- Given the committed `contracts.jsonl`, when XT-conformance-199 runs, then it passes and the file's `Psr\` rows are exactly the 8 interfaces with their members.
- Given the branch, when `bun test conformance/tests/xaravel/api-surface.test.ts conformance/tests/xaravel/component-map.test.ts` runs with `XARAVEL_PHP_FIXTURES=require`, then all pass.
- Given the branch, when `oracle.yml`'s build job runs `bun run oracle:api-surface --check` in the image, then it reports no drift.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 22 findings — high 0, medium 2, low 15, false 5, maybe-false 0; layers: blind-hunter 13, edge-case-hunter 4, verification-gap 0, intent-alignment 5 (fidelity-review skipped: the item names no `packages/<component>`)
- findings:
  - `[medium]` `[patch]` (blind) A PSR pass that prints nothing succeeds, so a regenerate silently drops that package's rows — api-surface.php now fails `<package> declares no interface under <src>`, with a case in XT-conformance-261.
  - `[low]` `[reject]` (blind) TS accepts a non-interface declaration from a PSR pass — PHP's `isInterface()` check (tested in XT-conformance-261) already fails it before any output; a second guard adds a branch for a state the script cannot print.
  - `[low]` `[reject]` (blind) An array-valued PSR-4 directory gives a self-contradictory message — the run still fails closed; Composer's psr packages use one directory, and a fix needs a new branch.
  - `[low]` `[reject]` (blind) A malformed lock gives a bare `SyntaxError` — `main` prints it as `API surface export failed: …` and exits 1; `oracle:check` validates the lock first in CI.
  - `[low]` `[reject]` (blind) The `packages-dev` path is untested — no psr package is a dev dependency in the lock; the test would guard an unreached state.
  - `[low]` `[patch]` (blind) The PSR namespaces are listed in both `PSR_PACKAGES` and `PSR_NAMESPACES` — XT-conformance-260 now asserts they agree.
  - `[low]` `[patch]` (blind) The api-surface.ts header comment omits the PSR fallback — one clause added.
  - `[low]` `[patch]` (blind) docs/ops/oracle.md's regenerate rule misses a framework lock change — added.
  - `[low]` `[reject]` (blind) The usage test in XT-conformance-261 is thin — the exit-2 path is covered; extra arg-shape cases add no named risk.
  - `[low]` `[patch]` (blind) story-manifests.md puts the new IDs before the Maintainer-attached sentence — moved after it and marked off-manifest, owned by the action item.
  - `[false]` `[reject]` (blind) Sprint-status bookkeeping is missing — the orchestrator sets the item `done` with SPS in the same PR after the build; the spec is untracked only until finalize commits it.
  - `[low]` `[patch]` (blind) No note on why the other PSR packages are left out — `PSR_NAMESPACES` comment now cites AD-22 and ESC-10.1-4.
  - `[low]` `[patch]` (blind) Broken sentence in the api-surface.test.ts header — fixed.
  - `[medium]` grouped with the first row (edge) An empty PSR-4 dir drops the rows — same patch.
  - `[low]` grouped with the second row (edge) TS accepts non-interface PSR rows — rejected as there.
  - `[low]` grouped with the fourth row (edge) Malformed lock — rejected as there.
  - `[low]` grouped with the third row (edge) Array PSR-4 dir message — rejected as there.
  - `[false]` `[reject]` (intent) R1 vs R2: interfaces only vs every class-like of the three namespaces — the ruling decides it: "every interface in `Psr\Container`, `Psr\SimpleCache` and `Psr\Log`", and AD-22 says "interfaces".
  - `[false]` `[reject]` (intent) No test runs the real exporter on the real psr sources — `oracle.yml` runs `oracle:api-surface --check` in the image on this PR, and `--check --local` on locked installs of the committed locks passed here (21366 lines, byte-identical).
  - `[low]` `[defer]` (intent) The gate's raw `Symbol.for` recognizer accepts only `Illuminate\`/`Laravel\` FQCNs, so PSR tokens written that way would read as missing — not caused by this change (tools/api-surface is outside the item); deferred to Story 10.1, whose PSR tokens use `contract('<FQCN>')`, which the gate recognises for any FQCN.
  - `[false]` `[reject]` (intent) M2: the mapping is not in conformance/component-map — the item names `componentForFqcn`, and the map is hand-signed data drift-checked against composer.json PSR-4, which would reject a `Psr\` namespace.
  - `[false]` `[reject]` (intent) The version check runs only on the fixture — the `--local` check above ran it against real `Composer\InstalledVersions` for all three packages.
  - (verification-gap) no gaps filed.

## Verification

**Commands:**
- `XARAVEL_PHP_FIXTURES=require bun test conformance/tests/xaravel/api-surface.test.ts conformance/tests/xaravel/component-map.test.ts` -- expected: pass
- `bun run oracle:api-surface --check --local <dir>` -- expected: `API surface check OK`
- `bun run typecheck && bun run lint && bun run harness --xaravel` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** `bun run oracle:api-surface` now runs two interfaces-mode passes for each of psr/container, psr/log and psr/simple-cache after the four Upstream repositories. Each pass reads the framework install's `vendor/<package>/<psr-4 dir>`. The versions and directories come from `conformance/oracle/locks/framework/composer.lock`, and the PHP checks them against `Composer\InstalledVersions`. `componentForFqcn` gives the three namespaces to `contracts`, so `conformance/api-surface/contracts.jsonl` gains the 8 PSR interfaces and their methods (28 lines). No other row changes.

**Files.**
- `tools/oracle/api-surface.php`: `--interfaces <package> <version>` mode, which checks the version, exports interfaces only and fails when none is found.
- `tools/oracle/api-surface.ts`: `FRAMEWORK_LOCK`, `PSR_PACKAGES`, `psrPins`, and the PSR passes in image and `--local` mode.
- `tools/component-map/component-map.ts`: the `PSR_NAMESPACES` fallback in `componentForFqcn`.
- `conformance/api-surface/contracts.jsonl`: regenerated with `--local`.
- `conformance/tests/xaravel/api-surface.test.ts`:
  - XT-conformance-80 and -199 are extended.
  - New XT-conformance-260 (stand-in, lock-driven passes and their failures).
  - New XT-conformance-261 (real PHP interfaces mode).
- `conformance/tests/xaravel/php-fixtures/api-surface-psr/`: the fixture package.
- `conformance/tests/xaravel/component-map.test.ts`: the PSR mapping.
- `docs/ops/oracle.md`: the PSR passes.
- `_bmad-output/implementation-artifacts/story-manifests.md`: the off-manifest IDs 260-261.

**Review.**
- 22 findings in all.
- 7 patched: 1 medium (an empty PSR pass is now an error) and 6 low (the namespace lists are tied together, two comments and a doc trigger fixed, the manifest note moved, a broken sentence fixed).
- 1 deferred: the gate's `Symbol.for` recogniser, to Story 10.1.
- 14 rejected, with the reasons in the triage log.
- The Fidelity Review was skipped: the item names no `packages/<component>`.

**Follow-up review:** false. One medium and no high finding was patched.

**Verification.**
- `XARAVEL_PHP_FIXTURES=require bun test` on the two test files: 13 pass.
- `bun run oracle:api-surface --check --local /tmp/xaravel-psr-local` (locked installs of the four committed locks): OK, 21366 lines byte-identical.
- `bun run typecheck` and `bun run lint` are clean.
- `bun run harness --xaravel`: 340 tests, 335 passed, 0 failed, 5 skipped.

**Residual risk.** Image mode is unverified locally (no Docker here). The `oracle.yml` build job's `oracle:api-surface --check` on the PR is the proof.
