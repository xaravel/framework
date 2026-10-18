---
title: 'Story 3.5: API-surface export'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '0ca99c25f08a29f73d3479e6cf34a0626e52be57'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'stories/3.5.md'
  - 'docs/ops/oracle.md'
warnings: [oversized]
deferred:
  - summary: >-
      The pin-bump regeneration chain regenerates neither the Oracle requests (Story 3.1) nor the API surface (this Story), so after a Pin move both go stale until someone runs them by hand.
    evidence: |-
      tools/pin-bump/pin-bump.ts regenerationSteps runs oracle:lock, oracle:build and inventory only; Story 74.1 has no written ACs yet. Cross-story, so it belongs to the Epic 3 retrospective, together with Stories 3.6 and 3.7's scan outputs.
    location: >-
      tools/pin-bump/pin-bump.ts regenerationSteps
    severity: low
  - summary: >-
      The committed surface was generated with --local; that the Oracle image gives byte-identical output (same PHP, extensions, vendor) is unverified until oracle.yml#build runs --check in the image.
    evidence: |-
      No Docker on the agent host. Settled by this PR's own oracle.yml build job (it touches tools/oracle/**), or by the first nightly determinism run. --local does not check the PHP version.
    location: >-
      tools/oracle/api-surface.ts runOnce
    severity: medium (unverified)
  - summary: >-
      A class the static declaredClasses scan misses, or a helper file Composer never loads, would be left out of the surface silently.
    evidence: |-
      At the Pin all 9 helper/functions files yield functions and the component-map check ties declaredClasses to the map. Settle with a post-load cross-check of get_declared_classes()/interfaces/traits under src/ against the list.
    location: >-
      tools/oracle/api-surface.php
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Story 6.5 diffs each package's `.d.ts` against Laravel's public API (AD-15, PRD §5.1), but no committed data records that API. `additions.jsonl` and `exceptions.jsonl`, which explain intended differences, do not exist either.

**Approach:** `bun run oracle:api-surface` runs `tools/oracle/api-surface.php` (PHP Reflection) in the Oracle image, twice for each Upstream repository. It compares the two passes, assigns every declaration to its Component, and writes `conformance/api-surface/<component>.jsonl`. `conformance/api-surface/schema.json` defines the line formats, including the citation that `additions.jsonl` and `exceptions.jsonl` (both committed empty) require.

## Boundaries & Constraints

**Always:**
- Input set: the FQCNs `declaredClasses(root)` (tools/component-map) lists for each repository (framework, ai, mcp, boost), plus every user function whose file is under that repository's `src/`. A class's Component is `componentForFqcn`. A function's Component is the Component of its source directory: `kebab(<Dir>)` for `framework/src/Illuminate/<Dir>/…`, or the repository name for ai/mcp/boost. A Component missing from the map fails the run.
- The PHP script is `php api-surface.php <autoload.php> <src dir> <classes file>`. It writes one JSON line per record to stdout. Records:
  - A declaration line for each class, interface, trait or enum: `{"fqcn","kind","member":null,"stubbed":[…]}`.
  - Members, public and declared by the class itself (trait-imported members count, inherited ones do not):
    - `method`: `{"fqcn","kind","member","static","parameters","returns","nullable"}`;
    - `property`: `{"fqcn","kind","member","static","type","nullable"}`;
    - `constant` and enum `case`: `{"fqcn","kind","member","static":true}`.
  - A `function` line: `{"fqcn","kind":"function","member":null,"static":false,"parameters","returns","nullable"}`. PHP adds `file` (relative to `src/`), which the TS side uses to assign the Component and then drops.
  - A parameter: `{"name","type","nullable","default","optional","variadic","byRef"}`.
  - `type` and `returns` are PHP's type string, or null when untyped. `nullable` is `allowsNull()`; untyped counts as nullable.
  - `default` is null when there is none. Otherwise it is PHP source: a constant name (an unqualified global constant loses the namespace fallback prefix), `new …` as Reflection prints it, `\Enum::Case`, or a compact literal (`null`, `true`, `0`, `'x'`, `[]`, `['*']`, `['a' => 1]`).
- A type that fails to autoload (`Class|Interface|Trait "X" not found`) is defined as an empty stub of that kind, the load is retried, and X is listed in the declaration line's `stubbed`. At the Pin this applies only to `Illuminate\Testing\ParallelRunner` (ParaTest's `RunnerInterface`). Any other load failure, or a class whose file is not under `src/`, makes the script exit 1.
- TS re-renders each line in the key order above with `renderJson` (tools/oracle/request.ts), validates it against `schema.json#/$defs/surface`, and sorts by `fqcn`, then kind rank (declaration/function, case, constant, property, method), then `member`, using `compareUnits`. Output is LF-terminated, one file per Component that has lines. Write mode deletes any other `*.jsonl` in `conformance/api-surface/` except `additions.jsonl` and `exceptions.jsonl`.
- Two passes per repository. If their stdout differs, nothing is written, stderr gets `api surface not deterministic: <repo> (first difference at line <n>)`, and the exit code is 1.
- `--check` builds the files in memory and compares them with the committed files, one `api surface drift: <file> …` line per difference. It also validates the citation files. It writes nothing.
- Citation files: each line is `{"component","fqcn","member","citation"}`, with `member` a string or null. Every line requires `citation`: `additions.jsonl` takes `FR-<n>` or `DIV-<1..12>[.<clause>]`, and `exceptions.jsonl` takes `DIV-…` or `deferred:<item>` (spine AD-15). Lines are sorted and have no duplicates. `checkCitations(root)` returns the problems found.
- CLI shape as `tools/oracle/extract.ts`: `main(argv)`, `UsageError` exits 2, `--root`, `--check`, `--image <ref>` (default `oracleImage(root)`) | `--local <dir> [--php <bin>]`. `<dir>` holds locked installs `framework/ ai/ mcp/ boost/`, whose sources equal the snapshot. In the image the repositories are `IMAGE_UPSTREAM_DIR/<repo>`; the script and the class lists are mounted read-only through `runInImage`.

**Never:** No change to the spine, SPEC, PRD or `epics.md`. No new npm dependency. Never edit `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or their workflows. Do not build the `.d.ts` diff, the `api-surface:gate` command or the PR summary (Story 6.5). No entries in the citation files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | four locked installs | `conformance/api-surface/<component>.jsonl`, schema-valid and sorted | exit 0, a count per Component |
| Nondeterminism | second pass differs | nothing written | exit 1, repo and line named |
| Unowned class | `componentForFqcn` gives null | nothing written | exit 1 naming the FQCN |
| Bad PHP line | not JSON, or fails the surface schema | nothing written | exit 1 naming the repo and line |
| Missing parent type | `implements \Missing\I` | stub defined, `"stubbed":["Missing\\I"]` | none |
| Drift | committed file differs, is missing or is stray | stderr drift lines | `--check` exits 1 |
| Bad citation | a line without `citation`, an FR in exceptions, unsorted, duplicate | `checkCitations` problem | `--check` exits 1 |

</intent-contract>

## Code Map

- `/tmp/xaravel-api-proto/api-surface.php` -- working prototype (planning run). It takes `<repo>` instead of `<autoload> <src>`. Write `tools/oracle/api-surface.php` from it. On the Pin it gave 15,949 / 3,615 / 1,065 / 709 lines (framework/ai/mcp/boost), byte-identical on two passes, in about 0.3 s per repository. It needed one stub (ParallelRunner). Local installs are in `/tmp/xaravel-inv/{framework,ai,mcp,boost}`.
- `tools/component-map/component-map.ts` -- `declaredClasses` (449: 2,437 FQCNs; directory and map agree for all of them), `componentForFqcn` (279), `readMap` (215).
- `tools/scaffold/table.ts:91` -- `kebab`.
- `tools/oracle/extract.ts` -- CLI and `--check` model to copy (234–366).
- `tools/oracle/request.ts` -- `renderJson`, `compareUnits`, `schemaErrors` (JSON Schema subset: `$ref`, if/then, pattern, enum; no oneOf).
- `tools/oracle/oracle.ts` -- `runInImage` (720), `IMAGE_UPSTREAM_DIR`; `tools/inventory/inventory.ts` -- `oracleImage` (589), `ImageRunner` (134).
- `.github/workflows/oracle.yml` -- `build` (PR) and `determinism` (nightly) jobs build `xaravel-oracle:<tag>`.
- `conformance/tests/xaravel/oracle.test.ts:665` -- XT-conformance-43 lists each job's run steps; update it for the new step.
- `conformance/protected-paths` -- `/conformance/` already protects `conformance/api-surface/`.
- `.gitignore:32` -- only `php-fixtures/*/vendor/` is ignored, so the fixture's hand-written autoloader must live outside a `vendor/` dir.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/api-surface.php` -- the Reflection exporter, as specified.
- `tools/oracle/api-surface.ts` and `package.json` script `oracle:api-surface` -- the CLI. Export `buildSurface`, `checkCitations`, `parseOptions`, `main` and `UsageError`. Accept an injected runner, as `fixtures.ts` does, so tests can supply a stand-in.
- `conformance/api-surface/schema.json` -- `$defs` `surface`, `parameter`, `addition`, `exception`.
- `conformance/api-surface/additions.jsonl` and `exceptions.jsonl` -- empty, 0 bytes.
- `conformance/api-surface/<component>.jsonl` -- generated with `--local /tmp/xaravel-inv`.
- `.github/workflows/oracle.yml` -- after the image build in `build` and `determinism`, add the step `bun run oracle:api-surface --check`. Update the header comment.
- `conformance/tests/xaravel/oracle.test.ts` -- update XT-conformance-43's step lists.
- `conformance/tests/xaravel/php-fixtures/api-surface/` -- a tiny fixture: `autoload.php` (an spl autoloader over `src/`), and `src/` holding a class with static, nullable, defaulted, `new`, constant-default, variadic and by-ref parameters and a property, an interface, a trait, an enum with cases, a class implementing a missing interface, and a file with one global and one namespaced function.
- `conformance/tests/xaravel/api-surface.test.ts`:
  - XT-conformance-80: stand-in runner in a temp root, giving paths, Components, key order, sort, stray deletion that keeps the citation files, unowned and bad-line failures, and `--check` drift. A real-PHP part under the `php` guard runs the fixture and asserts its exact lines, including `stubbed`. When the committed files exist, they validate against the schema.
  - XT-conformance-81: two runs give identical bytes; a stand-in whose second pass differs exits 1 and writes nothing; the real-PHP fixture run twice gives identical output.
  - XT-conformance-82: both citation files exist, are 0 bytes and are Protected, and `checkCitations` passes. Sample lines are rejected without a citation, with an FR in exceptions, or with `deferred:` in additions; valid ones are accepted.
- `docs/ops/oracle.md` -- an "API surface" section: command, modes, record format, stubs, determinism, citation files, and the drift check in CI.
- `stories/3.5.md` -- set `status: done` at completion.

**Acceptance Criteria:**
- Given the Oracle image, when `bun run oracle:api-surface` runs, then it writes `conformance/api-surface/<component>.jsonl`, with one line per public class, interface, trait or function member: FQCN, member name, static flag, parameter names, defaults and nullability.
- Given the export, when it runs twice on one Pin, then the output is identical.
- Given the Protected `additions.jsonl` and `exceptions.jsonl`, when they are first created, then they are empty, and their schema requires a citation (an FR, a DIV or a `deferred:` item) on every line.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 37 findings reported, in 35 rows (some rows cover several findings) — high 0, medium 3, low 15, false 11, maybe-false 6
- note: the review diff left out the 41 generated `<component>.jsonl` files (5.4 MB). Their shape is pinned by the committed-files test, and their content by `--check`.
- findings:
  - `[maybe-false]` `[defer]` (intent 1) AC1 lives in the image, but only a stand-in and the fixture exercise it; the committed data comes from `--local`. This PR touches `tools/oracle/**`, so its own `oracle.yml#build` runs `--check` in the image and settles it before the merge. Deferred, medium (unverified).
  - `[false]` `[reject]` (intent 2) the generated files are not in the reviewed patch. They are in the change set; they were left out of the review diff for size only.
  - `[low]` `[patch]` (intent 3) inherited members are not recorded, yet the docs say the diff "follows `extends`". Comparing declared members with declared members is coherent, because the port mirrors the hierarchy (AD-3). The docs wording was corrected.
  - `[false]` `[reject]` (intent 4) the record is a superset of the AC fields. The AC fields are all present, and the extras are named in the spec's record format.
  - `[false]` `[reject]` (intent 5) run-to-run determinism on real Upstream is untested. The verification wrote the files and then ran `--check` (a second full run) byte-identical, and the nightly job repeats it.
  - `[false]` `[reject]` (intent 6) citations are stricter than the literal AC. Every accepted citation is one of the AC's three kinds; the per-file split is spine AD-15.
  - `[false]` `[reject]` (intent 7) the manifest has `test_ids: []`. `test_ids` are Upstream Test IDs; XT-conformance-80..82 are in `xaravel_test_ids`.
  - `[medium]` `[patch]` (verification 1, blind 1, edge 13) a PR that changes only the surface files or the component map never runs `--check`. Those paths were added to `oracle.yml` `pull_request` paths (push unchanged), and XT-43 was updated.
  - `[medium]` `[patch]` (verification 2) the real-PHP tests are not run under `XARAVEL_PHP_FIXTURES=require` on PHP 8.5. Added to the `ci.yml` `php-fixtures` command.
  - `[false]` `[reject]` (verification other) the pin-bump regeneration gap. It is already deferred in frontmatter.
  - `[maybe-false]` `[defer]` (blind 2) local and image environments differ (PHP version and extensions unchecked in `--local`). Same settlement as intent 1: the PR's `build` job compares the image with the committed data. Deferred with it.
  - `[low]` `[patch]` (blind 3) the docs' "follows `extends`" claim. Grouped with intent 3. Missing modifiers (abstract, final, readonly) are not AC fields and adding them is new surface, so rejected within the group.
  - `[low]` `[patch]` (blind 4, edge 2) `stubbed` depends on load order. It is now the intersection of the global stub set with each class's parents, interfaces and traits.
  - `[low]` `[patch]` (blind 5, edge 15) enum defaults have two forms. Both are now `Fqcn::Case` without a leading backslash, and the docs and schema were updated.
  - `[low]` `[patch]` (blind 6, edge 7) a nested object default, or a `new` that the regex misses, silently drops its arguments. Both now fail().
  - `[medium]` `[patch]` (blind 7, edge 14) warnings exit 0, and Throwables outside load() end in an unstructured fatal. Added an error handler and a top-level catch that fail().
  - `[maybe-false]` `[defer]` (blind 8) classes the static scan misses, and helper files that are never loaded, vanish silently. At the Pin, the component-map check ties `declaredClasses` to the map, and all 9 helper/functions files gave functions. It would need a post-load cross-check of `get_declared_classes()` under `src/`. Deferred, medium (unverified).
  - `[false]` `[reject]` (blind 9) the spec cites /tmp paths and its status is inconsistent. The fix is a spec edit, and the status is set at finalization.
  - `[low]` `[patch]` (blind 10) the committed-files test passes vacuously, and the generated files' protection is not asserted. It now requires files and asserts protection. A cross-file duplicate/Component check adds complexity for an unlikely defect, so rejected within the group.
  - `[low]` `[patch]` (blind 11) `--local` is untested. Stand-in `--local` tests were added. The other uncovered paths (more than 20 stubs, a non-"not found" load error) fail loudly and are rejected.
  - `[low]` `[reject]` (blind 12, edge 11) write mode is not atomic. Failures happen before any write (everything is built in memory first); a disk error mid-write is unlikely and a rerun fixes it.
  - `[low]` `[patch]` (edge 1) the 20th stub is not re-checked. The loop now re-checks after the last stub.
  - `[false]` `[reject]` (edge 3) a stub causes a compile fatal (readonly, Override). PHP exits non-zero and the TS side fails closed; the Pin has no such case.
  - `[false]` `[reject]` (edge 4) re-including a file that declares functions. The exit is non-zero and fails closed; Upstream class files declare no functions.
  - `[low]` `[patch]` (edge 5) a throwing getDefaultValue. Covered by the top-level catch.
  - `[low]` `[patch]` (edge 6) a non-UTF-8 default throws JsonException. Covered by the top-level catch.
  - `[low]` `[patch]` (edge 8) stderr warnings with exit 0. Covered by the error handler.
  - `[low]` `[patch]` (edge 9) a class and a function with the same FQCN tie. Added a kind tiebreaker.
  - `[low]` `[reject]` (edge 10) astral identifiers fail the schema. Upstream has none, and the run would fail loudly.
  - `[low]` `[reject]` (edge 12) citations are not cross-checked against the surface. Explaining members is Story 6.5's diff; doing it here adds surface.
  - `[maybe-false]` `[defer]` (edge 13 claim) duplicate of verification 1. Patched there.
  - `[maybe-false]` `[defer]` (edge 14 claim) the header's exit-code claim. Patched with blind 7.
  - `[maybe-false]` `[defer]` (edge 15 claim) the enum doc form. Patched with blind 5.
  - `[false]` `[reject]` (blind 1 dup) path filter. Counted at verification 1.
  - `[false]` `[reject]` (edge 2 dup) stubbed order. Counted at blind 4.

## Design Notes

- **Declared members only.** Inherited members are not repeated, so every member has a single home and Story 6.5 can follow `extends`. Declaration lines keep classes that have no public members of their own (for example, exception subclasses) visible to the diff.
- **Stubbing a missing type.** It changes no exported member, because members of the stub are never reported. It also gives the local install and the image the same output.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/api-surface.test.ts conformance/tests/xaravel/oracle.test.ts` -- all pass, and the real-PHP parts run.
- `bun run oracle:api-surface --local /tmp/xaravel-inv`, then `bun run oracle:api-surface --check --local /tmp/xaravel-inv` -- exit 0, and the check is byte-identical.
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run ownership:check` -- clean.

## Auto Run Result

Run 2026-10-18. Status: done.

- **Summary.** `bun run oracle:api-surface` runs `tools/oracle/api-surface.php` (PHP Reflection) twice per Upstream repository, in the Oracle image or against `--local` installs. It compares the passes, validates each line against `conformance/api-surface/schema.json`, assigns it to its Component and writes `conformance/api-surface/<component>.jsonl`: 21,338 lines in 41 files at the Pin. The only stub is `Illuminate\Testing\ParallelRunner`. `--check` reports drift and validates the citation files. `additions.jsonl` and `exceptions.jsonl` are committed empty, and their schema requires a citation on every line: FR or DIV for additions, DIV or `deferred:` for exceptions.
- **Files.**
  - `tools/oracle/api-surface.php`: the exporter.
  - `tools/oracle/api-surface.ts`: the CLI, `buildSurface` and `checkCitations`.
  - `package.json`: the `oracle:api-surface` script.
  - `conformance/api-surface/`: the schema, the two citation files and 41 Component files.
  - `.github/workflows/oracle.yml`: a `--check` step in `build` and `determinism`, and the surface and component-map paths on `pull_request`.
  - `.github/workflows/ci.yml`: `php-fixtures` now runs `api-surface.test.ts` under `require`.
  - `conformance/tests/xaravel/api-surface.test.ts`: XT-conformance-80..82.
  - `conformance/tests/xaravel/php-fixtures/api-surface/`: the fixture.
  - `conformance/tests/xaravel/oracle.test.ts` (XT-43) and `repository-policy.test.ts`: updated for the workflow changes.
  - `docs/ops/oracle.md`: the "API surface" section.
  - `stories/3.5.md`: `status: done`.
- **Review.** 37 findings in one pass. 14 rows were patched (3 medium, 11 low), each in the triage log. 2 maybe-false items were deferred, both medium (unverified): image vs local output, and classes the static scan misses. The rest were rejected, with reasons in the log.
- **Follow-up review: recommended.** Three medium entries were patched: the CI path filter, `php-fixtures` under `require`, and the PHP error handler with its top-level catch. The patched error handling and the order-independent `stubbed` code were not re-reviewed.
- **Verification.**
  - `XARAVEL_PHP_FIXTURES=require bun test` on the api-surface and oracle tests: 9 pass.
  - `bun test`: 120 pass.
  - `typecheck`, `lint`, `workflows:check`, `ownership:check`, `escalations:check` and the CODEOWNERS check: clean.
  - `oracle:api-surface --check --local /tmp/xaravel-inv`: byte-identical, 21,338 lines.
- **Residual risks.** Image mode has never run (no Docker on the agent host). This PR's `oracle.yml#build` job is its first real run, and it fails if the image output differs from the committed local output.
