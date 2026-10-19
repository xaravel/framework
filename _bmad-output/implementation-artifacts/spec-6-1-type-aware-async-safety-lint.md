---
title: 'Story 6.1: Type-aware async-safety lint'
type: 'feature'
created: '2026-10-19'
baseline_revision: '631367e07137b2c2dd357785bd8d7505fd8181c7'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/AGENTS.md'
warnings: [oversized]
deferred:
  - summary: >-
      no-misused-promises checksConditionals (a truthy Promise in a condition, the authorization-bypass case AD-6 names) is on only by default; nothing pins it or fails a config that sets it false.
    evidence: |-
      The spine and epics.md name only checksVoidReturn, so the config is spine-exact. A root config with checksConditionals: false passes lint:disables. Pinning it needs a ruling on the config the spine fixes, or Story 6.3's async-signature rules.
    location: >-
      tools/lint-rules/disables.ts SPINE_RULE_OPTIONS; routed to the Maintainer as conformance/escalations/ESC-6.1-1.md item 1
    severity: medium
  - summary: >-
      checkThenables fires only for a then typed as PromiseLike; nothing makes AD-6 thenables (Builder, Relation, PendingRequest) declare PromiseLike, so a hand-rolled then floats silently.
    evidence: |-
      Planning probe: a class with then<T>(onF: (v) => T): T was not reported when unawaited; implements PromiseLike<...> was. Belongs to Story 6.3 (async signatures) or Story 10.5 (the thenable list in @xaravel/contracts/async).
    location: >-
      docs/ops/lint.md; routed to the Maintainer as conformance/escalations/ESC-6.1-1.md item 2
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `.oxlintrc.json` only enables the `correctness` category, so `no-misused-promises` is off, `no-floating-promises` runs without `checkThenables`, and nothing stops an `oxlint-disable` comment from switching the async-safety rules off (NFR-3, AD-6, AD-16.4). Story 6.1 makes the three spine rules errors with the spine's options and makes CI fail on any disable of a rule the spine names.

**Approach:** Set the three type-aware rules at the top level of `.oxlintrc.json` with their options, so they apply to every linted path (packages, their tests, the Skeleton and any future compiled-view snapshot). Add `tools/lint-rules/disables.ts`, a scan over the files oxlint lints that fails on a disable directive naming a spine rule (or naming none), and on a config that lowers a spine rule below `error`. Chain it into `bun run lint`, which CI's required `check` job already runs. Prove all three ACs with XT-conformance-129..131 over committed fixtures.

## Boundaries & Constraints

**Always:**
- oxlint 1.88.0 and oxlint-tsgolint 7.0.2004, run through `bun --bun oxlint --type-aware`; no ESLint, Node or other parser.
- Rule config is exactly: `typescript/no-floating-promises` `["error", {"checkThenables": true}]`, `typescript/await-thenable` `"error"`, `typescript/no-misused-promises` `["error", {"checksVoidReturn": true}]`, in the top-level `rules` (not an override), with no override or ignore pattern that excludes `packages/`, `skeleton/` or their `.ts` files.
- `unicorn/no-thenable` is turned `"off"`: AD-6 makes Builders, Relations and `PendingRequest` thenable by design, and the passing fixture (an awaited thenable builder) must lint clean.
- The spine's rule list lives in one exported constant (`SPINE_RULES`) in `tools/lint-rules/disables.ts`, so Stories 6.2/6.3 append their custom rule names there.
- Directive matching follows oxlint: `oxlint-disable`, `oxlint-disable-line`, `oxlint-disable-next-line` and the `eslint-` spellings, in `//` or `/* */` comments whose text starts with the directive; rule names compare by their last `/` segment (`no-floating-promises`, `typescript/…`, `@typescript-eslint/…`); a directive with no rule list disables every rule and is a violation; text after ` -- ` is a description.
- Only real comments count: the scan tokenizes strings, template literals (with `${}` nesting) and regex literals so a directive inside a string never matches.
- Scanned files = `git ls-files -co --exclude-standard` under the root with oxlint's extensions (`.ts .tsx .mts .cts .js .jsx .mjs .cjs`), minus the root `.oxlintrc.json` `ignorePatterns`.
- Each violation prints `<path>:<line>:<col>: <message> (AD-16)`; exit 1 on any, 0 on none, 2 on a usage error.
- Committed fixtures live in `tools/lint-rules/fixtures/async-safety/`, which `.oxlintrc.json` ignores so `bun run lint` stays green; tests copy them to temp roots and lint them with the repo's real `.oxlintrc.json`, run from the repo root (oxlint finds tsgolint from the cwd).

**Never:**
- No change to another Story's assertions beyond updating the pinned `lint` script string in `repository-policy.test.ts` to the new chained command.
- No custom identity/value/test-hygiene rules (Story 6.2/6.3), no `async-surface.json` (6.4).
- Never write into tracked paths while testing; temp roots only (epic 4 lesson).
- No JSONC comments in `.oxlintrc.json` (tests `JSON.parse` it); rationale goes in `docs/ops/lint.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| floating thenable | unawaited `q().where()` on a `PromiseLike` builder | oxlint error naming `no-floating-promises` | exit 1 |
| await plain | `await x` on a number | error naming `await-thenable` | exit 1 |
| misused promise | async arrow passed to a `() => void` param | error naming `no-misused-promises` | exit 1 |
| passing fixture | awaited builder, awaited Promise, sync callback | no diagnostics | exit 0 |
| disable named | `// oxlint-disable-next-line typescript/no-floating-promises` | `path:line:col: … disables no-floating-promises (AD-16)` | exit 1 |
| blanket disable | `/* eslint-disable */` | violation naming every rule disabled | exit 1 |
| other rule | `// oxlint-disable-next-line no-console` | no violation | exit 0 |
| directive in string | `const s = "// oxlint-disable"` | no violation | exit 0 |
| nested config | `sub/.oxlintrc.json` sets `no-misused-promises` to `off`/`warn` | violation naming the config file and rule | exit 1 |
| root config weakened | root drops a spine rule or its option | violation naming `.oxlintrc.json` | exit 1 |

</intent-contract>

## Code Map

- `.oxlintrc.json` -- root lint config (Protected); today `categories.correctness: error` and `ignorePatterns`. Add `rules` and the fixtures ignore.
- `package.json` `scripts.lint` -- `bun --bun oxlint --type-aware`; becomes `bun --bun oxlint --type-aware && bun run lint:disables`, plus new `lint:disables`.
- `.github/workflows/ci.yml` `check` job -- already runs `bun run lint` (required check); no edit needed, cite in docs.
- `conformance/tests/xaravel/repository-policy.test.ts:836` -- pins `scripts.lint`; update to the chained string.
- `conformance/tests/xaravel/root-baseline.test.ts:132` (XT-conformance-4) and `upstream.test.ts:175` -- read `.oxlintrc.json`; keep `correctness: error` and `conformance/upstream/**` in ignorePatterns.
- `tools/lint-rules/singletons.json` -- existing Story 3.6 output; leave untouched.
- `tsconfig.json` `include` -- add `tools/lint-rules/**/*.ts` (fixtures must typecheck too).
- `conformance/tests/xaravel/devcontainer.test.ts` -- style reference: header comment, `xaravelTest` from `packages/assert/src/index`, temp dirs cleaned in `afterAll`.
- `conformance/xaravel-consequences/conformance.jsonl` -- cite `AD-16.4` (disabling lint) and `AD-28.1` (lint per PR) in consequence strings.
- Probe evidence: oxlint run from repo root on files under `/tmp` with `-c <tmp>/.oxlintrc.json` applies type-aware rules (tsgolint found via cwd); `checkThenables` fires only for a `then` typed as `PromiseLike`; `checksVoidReturn: false` silences the misused case, so option tests are meaningful; plain `oxlint` prints nothing on success in a non-TTY, so tests pass `--format unix`.

## Tasks & Acceptance

**Execution:**
- `.oxlintrc.json` -- add the three rules and `unicorn/no-thenable: off`; add `tools/lint-rules/fixtures/**` to `ignorePatterns`.
- `tools/lint-rules/fixtures/async-safety/` -- `floating-thenable.ts`, `await-plain.ts`, `misused-void-callback.ts` (each fails one rule) and `passing.ts` (all three patterns done right); shared builder in `builder.ts`.
- `tools/lint-rules/disables.ts` -- `SPINE_RULES`, comment tokenizer, `findDisables(root)`, root and nested config checks, CLI `[--root <dir>]`.
- `package.json` -- `lint` chain and `lint:disables`.
- `tsconfig.json` -- include `tools/lint-rules/**/*.ts`.
- `conformance/tests/xaravel/lint.test.ts` -- XT-conformance-129..131 plus the matrix edge cases.
- `conformance/tests/xaravel/repository-policy.test.ts` -- update the `lint` script pin.
- `docs/ops/lint.md` (new) and `docs/ops/ci.md` -- what lint enforces, the disable rule, why `no-thenable` is off, how 6.2/6.3 extend `SPINE_RULES`.

**Acceptance Criteria:**
- Given `.oxlintrc.json` with oxlint 1.88.0 + oxlint-tsgolint 7.0.2004 pinned in root `devDependencies`, when lint runs with that config over a temp root holding a failing fixture at `packages/demo/src/`, `packages/demo/tests/`, `skeleton/` and `packages/view/tests/__snapshots__/` (compiled-view snapshots, Story 49.1), then each placement fails with each of the three rule names, and the config holds the three rules as errors with `checkThenables: true` and `checksVoidReturn: true` (XT-conformance-129).
- Given the three failing fixtures and the passing fixture, when `bun --bun oxlint --type-aware -c .oxlintrc.json --format unix` runs on them, then each failing fixture fails naming exactly its rule and the passing fixture passes (XT-conformance-130).
- Given an `oxlint-disable` comment for a spine rule, when `bun run lint:disables` (chained into CI's `bun run lint`) runs, then it exits 1 naming `path:line:col`; and the real repository passes (XT-conformance-131).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 34 findings — high 0, medium 9, low 16, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` (intent) XT-129 lints temp copies, not the real tree — the spec puts placements in temp roots on purpose; a probe at real `skeleton/`, `tools/lint-rules/`, `packages/assert/{src,tests}` showed the rule firing, and the ignore check covers real paths after the patch below.
  - `[false]` `[reject]` (intent) `unicorn/no-thenable: off` is unasked — the spec's Always list requires it (AD-6 thenables; the passing fixture needs it).
  - `[false]` `[reject]` (intent) fixtures kept out of the real lint run — the spec's design (2a reading); a green `bun run lint` needs it.
  - `[false]` `[reject]` (intent) CI wiring asserted statically — CI's `check` job runs `bun run lint`; the chained script and the job step are both asserted, and `bun run lint` ran green locally.
  - `[false]` `[reject]` (intent) directive detection differs from oxlint (e.g. `/** oxlint-disable */`) — probe: oxlint ignores the `/**` form (rule still fired), and the scanner also ignores it, so they agree.
  - `[false]` `[reject]` (intent) `SPINE_RULES` narrower than every rule the spine names — the custom rules do not exist yet; Stories 6.2/6.3 append to the exported list, which the spec requires.
  - `[low]` `[reject]` (intent) config violations located by first text match — the path names the right file; the AC's location contract is for comments, which are exact.
  - `[false]` `[reject]` (intent) Protected Paths edited — Story 6.1 is a Phase 0 Infrastructure Story (MAINT-2026-10-16, 2nd amendment).
  - `[medium]` `[patch]` (verification-gap) a nested config's `ignorePatterns` can hide files and the check passes — reviewer reproduced it (oxlint: "No files found to lint"; lint:disables ok). Fixed: ignore check now runs for nested configs relative to their directory.
  - `[low]` `[reject]` (verification-gap) the temp-root oxlint run cannot see `ignorePatterns` — the ignore check (`ignoreMatches`, spot-checked against oxlint on five patterns) covers it; moving the run in-repo would write into the tree.
  - `[low]` `[reject]` (edge) `a++ / 2; // oxlint-disable-line …` mis-lexed as a regex — unlikely in practice; the fix adds tokenizer branches.
  - `[medium]` `[patch]` (edge) a root pattern naming a real package (`packages/http/**`) passes — only four fixed probes. Fixed: patterns are tested against every scanned file under `packages/*/src`, `packages/*/tests`, `skeleton/` plus per-extension probes.
  - `[medium]` `[patch]` (edge) nested `ignorePatterns` — same root cause as the verification-gap row; same fix.
  - `[medium]` `[patch]` (edge) a root `.eslintignore` (read by oxlint by default) can drop paths unchecked. Fixed: its lines get the same check.
  - `[low]` `[reject]` (edge) rules keyed by last segment, `foo/no-floating-promises: error` masks `typescript/…: off` — contrived in the Protected root config; the fix adds plugin-prefix logic.
  - `[low]` `[reject]` (edge) `checksVoidReturn` object form / omitted default — the object form is reported as a failure (correct); the spec requires the explicit option, so omission failing is intended.
  - `[low]` `[reject]` (edge) negated `!pattern` entries — none exist; ordered-negation semantics would add a matcher branch for a contrived case.
  - `[low]` `[reject]` (edge) `overrides` with `plugins`, and overrides of extended configs, not walked — contrived; the Protected root has no overrides and XT-129 asserts that.
  - `[low]` `[reject]` (edge) override violations located at the top-level entry — the path still names the right file; the AC's location contract is for comments, which are exact.
  - `[medium]` `[patch]` (edge, claim) "no ignore pattern excludes packages/ or skeleton/ .ts files" only holds for four probes — same root cause and fix as the real-package row.
  - `[medium]` `[defer]` (blind) `no-misused-promises` `checksConditionals` (truthy-Promise authorization bypass) relies on the default and is not pinned — real but the spine names only `checksVoidReturn`; pinning it changes the spine-exact config. Deferred.
  - `[false]` `[reject]` (blind) `void` escape for `no-floating-promises` — `void` is the rule's documented explicit-ignore marker, not a disable directive; AD-16.4 is about disables.
  - `[low]` `[reject]` (blind) `locate()` first-match locations — duplicate of the edge row; rejected the same way.
  - `[medium]` `[patch]` (blind) nested configs only partly checked (`ignorePatterns`) — same root cause as the verification-gap row; same fix. The non-relative `extends` part is reported as dropping the rules (fails closed), not skipped.
  - `[medium]` `[patch]` (blind) `IGNORE_PROBES` too narrow (`**/*.tsx`, `packages/*/src/Http/**`) — same fix as the real-package row.
  - `[low]` `[reject]` (blind) negated ignore patterns — duplicate of the edge row.
  - `[low]` `[reject]` (blind) the tokenizer can hide a directive after `)`/`}` followed by a regex holding a backtick — rare; `oxc-parser` is not installed (Story 6.4 adds it).
  - `[low]` `[reject]` (blind) coverage proven outside the repo — duplicate of the verification-gap row.
  - `[medium]` `[defer]` (blind) nothing makes framework thenables declare `PromiseLike`, and a hand-rolled `then` is not caught by `checkThenables` (probe confirmed) — belongs to the async-signature rules (Story 6.3) and Contracts (Story 10.5). Deferred.
  - `[false]` `[reject]` (blind) the real-repository check includes untracked files — oxlint lints untracked files too, so the scan matches what `bun run lint` checks.
  - `[low]` `[reject]` (blind) the trailing-comma strip can edit string values — needs a `,]` inside a config string; contrived.
  - `[low]` `[reject]` (blind) `.oxlintrc.jsonc` discovery and last-spelling-wins unverified — checking extra file names can only add failures, never hide one.
  - `[false]` `[reject]` (blind) the status fields disagree — expected mid-run: the spec is `in-review`; the Story's status moves to done after review.
  - `[low]` `[reject]` (blind) the `&&` chain shows only the oxlint failure first — the job still fails; cosmetic.

## Design Notes

Compiled-view snapshots have no location yet; Story 49.1 makes them Xaravel Test snapshots, which land under `packages/view/tests/`. Top-level rules with no narrowing override cover them wherever they land, as long as no ignore pattern excludes them, which XT-conformance-129 asserts.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/lint.test.ts conformance/tests/xaravel/repository-policy.test.ts conformance/tests/xaravel/root-baseline.test.ts` -- expected: all pass
- `bun run lint` -- expected: exit 0
- `bun run typecheck` -- expected: exit 0
- `bun run test` and `bun run harness --xaravel` -- expected: no new failures

## Auto Run Result

Status: done

**Summary.** `.oxlintrc.json` makes `no-floating-promises` (`checkThenables: true`), `await-thenable` and `no-misused-promises` (`checksVoidReturn: true`) top-level errors, and turns `unicorn/no-thenable` off for AD-6 thenables. `tools/lint-rules/disables.ts` (`bun run lint:disables`, chained into `bun run lint`, which CI's required `check` job runs) fails on any `oxlint-`/`eslint-disable` directive that names a spine rule or names no rule. It also fails on any root or nested lint config, or root `.eslintignore`, that drops or weakens a spine rule or ignores files under `packages/*/src`, `packages/*/tests` or `skeleton/`. XT-conformance-129..131 prove the three ACs with committed fixtures linted by the real oxlint.

**Files changed.**
- `.oxlintrc.json`: the three rules, `unicorn/no-thenable: off`, and an ignore for the fixtures.
- `package.json`: `lint` now chains `lint:disables`.
- `tsconfig.json`: includes `tools/lint-rules/**/*.ts`.
- `tools/lint-rules/disables.ts`: the disable and config check.
- `tools/lint-rules/fixtures/async-safety/*.ts`: three failing fixtures, one passing fixture and a shared thenable builder.
- `conformance/tests/xaravel/lint.test.ts`: XT-conformance-129..131.
- `conformance/tests/xaravel/repository-policy.test.ts`: the pinned `lint` string updated.
- `docs/ops/lint.md` (new) and `docs/ops/ci.md`.
- `conformance/escalations/ESC-6.1-1.md`: the two review deferrals, routed to the Maintainer.

**Review.**
- 34 findings: 9 medium, 16 low, 9 false.
- Patched, in 2 medium entries:
  - Ignore coverage: nested `ignorePatterns` are now checked, and patterns are tested against every real file under `packages/*/{src,tests}` and `skeleton/` plus one probe per extension.
  - A root `.eslintignore` is now checked.
- Deferred, 2 medium (ESC-6.1-1):
  - `checksConditionals` is not pinned.
  - Framework thenables are not required to be `PromiseLike`.
- Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended: true.** Two medium entries were patched. The unverified risk: `disables.ts` reimplements oxlint's ignore matching (`ignoreMatches`, relative to each config), and it was only spot-checked against oxlint on a handful of patterns. Negated patterns are not modelled.

**Verification.**
- `bun run lint` exit 0 (`lint disables: ok (362 files)`).
- `bun run typecheck` exit 0.
- `bun run test`: 240 pass, 0 fail.
- `bun run harness --xaravel`: 240 passed, differ=0.
- `escalations:check` and `ownership:check` exit 0.
- One unexplained single failure in the first targeted run of the four lint-related test files did not reproduce in 6 reruns or in the full suite.

**Residual risks.**
- The hand-written tokenizer guesses regex versus division (`a++ / 2`, or a regex after `)` or `}`).
- Compiled-view snapshots have no location yet. They are assumed to be `.ts` under `packages/view/tests/` (Story 49.1).
- `story:check 6.1` will fail `approvals` (Epic 1 retro item 12 waiver) and `escalations` (ESC-6.1-1 open, waiting on the Maintainer).
