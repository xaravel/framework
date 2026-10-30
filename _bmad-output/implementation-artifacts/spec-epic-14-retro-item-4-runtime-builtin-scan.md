---
title: 'Runtime builtin scan for an Upstream Component epic (epic-14-retro-item-4)'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_revision: e00c7e027326384b3b0f71e9d84be84132abdad8
review_loop_iteration: 0
followup_review_recommended: false
context:
  - _bmad-output/implementation-artifacts/epic-14-retro-2026-10-29.md
  - docs/ops/scans.md
warnings: []
deferred:
  - summary: >-
      Nothing agents read in the Story loop (AGENTS.md) points to docs/ops/builtin-scan.md, and the doc does not name the test_ids the one-round Escalation carries.
    evidence: |-
      AGENTS.md is the Story loop's only text and changes only when the Maintainer asks; the scan is reachable through docs/ops/scans.md only.
    location: >-
      docs/ops/builtin-scan.md
    severity: medium
  - summary: >-
      Declared function names and use-function imports are matched by short name across all namespaces, so a namespaced Upstream function with a builtin's name hides that builtin.
    evidence: |-
      scanBuiltins keeps one lowercased declared set; documented under Limits in docs/ops/builtin-scan.md.
    location: >-
      tools/scans/builtins.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epic 14 found the PHP builtins its Upstream Component needed from `@xaravel/runtime/php` one blocked Story round at a time (finding P1: 38 Escalations, 16 builtin action items). Nothing lists them up front.

**Approach:** Add `tools/scans/builtins.ts` (`bun run scan:builtins <component>`). It reads the Component's Upstream `src/` and its mapped test files from the snapshot, lists every PHP function and construct they call by name that Upstream does not declare itself, subtracts what `@xaravel/runtime/php` already exports, and prints the rest. A Xaravel Test covers it, and `docs/ops/builtin-scan.md` places it in the Story loop.

## Boundaries & Constraints

**Always:** Read only `conformance/upstream/`, `conformance/component-map` and the runtime's export list; run no PHP, fetch nothing, write nothing. Reuse the scans' lexer (`tools/scans/php.ts`), the component map (`readMap`, `componentForTest`, `testFiles`) and the package table. Deterministic, sorted output. Exit 0 on a listing, 1 on a failure (missing snapshot, lexer error), 2 on a usage error (missing or unknown Component, bad flag).

**Never:** Touch `packages/**`, `conformance/expectations/**`, `AGENTS.md`, `PORTING.md`, the item's `action`/`owner`/`epic`. No committed scan output (it is an advisory report for a Story to raise from, not grader data). No Escalation is raised by the tool.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Missing builtin | `src` calls `str_pad($x, 3)` and `\ucfirst($y)`; runtime exports neither | `function str_pad calls=1 strings=0 first=<file>:<line>` and `function ucfirst …` | none |
| Exported builtin | calls `count(`, `json_encode(`, `serialize(`, `is_numeric(` | not listed: exported as `count`, `jsonEncode`, `phpSerialize`, `isNumeric` | none |
| Not a builtin call | `$a->str_pad(`, `A::str_pad(`, `new Foo(`, `function str_pad(` (method), `Foo\bar(`, `if (`, `fn (` | not listed | none |
| Upstream-declared function | `helpers.php` declares `collect`/`value` (also inside `if (! function_exists(...)) {}`); a file has `use function Foo\{bar}` | not listed | none |
| Vendor test globals | Pest `test(`/`expect(`, Mockery `mock(` | not listed (documented fixed list) | none |
| String callable | `array_map('ucfirst', $x)` where `ucfirst` is called by name somewhere in the snapshot | counted in `strings=` | none |
| Construct | `isset(`, `empty(`, `clone $x`, `match (`, `yield from`, `array(` | `construct <name> calls=<n> first=… helper=<export or none>`; a construct whose helper is exported is not listed | none |
| Bad input | no Component arg; unknown Component; no snapshot | usage line / `scan:builtins: …` | exit 2 / 2 / 1 |

</intent-contract>

## Code Map

- `tools/scans/php.ts` -- `tokenize`, `codeIndexes`, `phpFiles`, `ScanError`; names keep their `\`; strings carry `value`.
- `tools/component-map/component-map.ts` -- `readMap`, `componentForTest`, `testFiles(root, repo)`; framework Component dirs are `framework/src/Illuminate/<Dir>` with `kebab(Dir)`; `ai`/`mcp`/`boost` own `<repo>/src`.
- `tools/scaffold/table.ts` -- `kebab`; `tools/upstream/upstream.ts` -- `UPSTREAM_DIR`, `upstreamPath`.
- `tools/scans/facades.ts` -- `UsageError` pattern and CLI style to mirror.
- `packages/runtime/src/php/index.ts` -- read-only; its runtime export names are the "already exports" set (dynamic import in `main`).
- `conformance/tests/xaravel/scans.test.ts` -- test style (`xaravelTest`, `withSnapshot` temp roots, `REAL` guard); next free ID `XT-conformance-269`.
- `package.json` -- scripts block, next to `scan:test-api`.

## Tasks & Acceptance

**Execution:**
- `tools/scans/builtins.ts` -- scan, coverage rule, report, CLI -- the action's tool.
- `package.json` -- add `"scan:builtins": "bun --no-env-file tools/scans/builtins.ts"`.
- `conformance/tests/xaravel/builtin-scan.test.ts` -- XT-conformance-269 (matrix rows on a temp snapshot, through `main`), XT-conformance-270 (real snapshot, `collections`: the output parses and names none of the runtime's exports; skipped without a snapshot like the other snapshot tests).
- `docs/ops/builtin-scan.md` -- what it lists, the rules and limits, and when to run it in the Story loop; link it from `docs/ops/scans.md`.

**Acceptance Criteria:**
- Given a synced snapshot, when `bun run scan:builtins collections` runs, then it exits 0 and every listed name is neither a runtime export nor (after the documented normalisation) one of its camel/`php`-prefixed exports.
- Given the docs, when an agent reads `docs/ops/builtin-scan.md`, then it says to run the scan before an Upstream Component epic's first Story and raise every listed name in one round.

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
- verdicts: 31 findings — high 0, medium 5, low 15, false 5, maybe-false 0 (6 descriptive intent-alignment notes)
- findings:
  - `medium` `patch` (blind) A global `use function tap;` hid that name everywhere — only namespace-qualified imports now count as declared; fixture `use function str_repeat;` stays listed.
  - `low` `defer` (blind) Declarations and imports match by short name across namespaces — documented as a Limit; a namespace-aware resolver is more than a direct correction.
  - `low` `patch` (blind) Partial snapshot failed via `upstreamPath` before the existence check — `requireDir` now fails with the upstream:sync hint; dead check removed.
  - `low` `patch` (blind) `strings=` counted literals inside `array(...)`/`isset`/`if`/`match` parens — a string now counts only inside a call paren; fixture cases added.
  - `low` `patch` (blind) Docs' `first=` description mismatched the code — docs now say first call site, or first string site on a `calls=0` line.
  - `medium` `defer` (blind) Nothing agents read (AGENTS.md Story loop) points to the scan, and the doc does not say which `test_ids` the one-round Escalation carries — AGENTS.md changes only on the Maintainer's request (agent-context file); recorded as residual risk.
  - `low` `patch` (blind) `docs/ops/scans.md` intro and Commands table not updated — intro reworded, Commands row added.
  - `medium` `patch` (blind) Untested paths (ai branch, mixed `use` groups, `&`, readonly anonymous class, construct helper filtering, missing repo) — ai, `&`, readonly class, helper filtering and missing-map cases added.
  - `false` `reject` (blind) XT-conformance-270 passes silently without a snapshot — it follows the repository's `REAL` guard convention in `scans.test.ts`; CI's component-map workflow syncs the snapshot.
  - `low` `patch` (blind) Non-call-like constructs counted as names (`case Exit`, `print:` named arg, `Exit::X`, `new Print`) — `NOT_CONSTRUCT_AFTER` and `::`/`:` guards added; the "variable follows" guard was not applied because `clone $x`, `print $x` are real constructs and reserved words cannot be type names.
  - `low` `reject` (blind) A lexer error in any repository fails the run — fail-closed is the scans' convention; documented as a Limit.
  - `false` `reject` (blind) `--no-env-file` inconsistent with other `scan:*` scripts — several neighbouring scripts (`api-surface`, `async-surface`, `divergence:check`) use it; harmless and correct.
  - `medium` `patch` (verification-gap) The "every repository's src/ declares functions" path was never exercised — unscanned `Support/helpers.php` declaring `class_basename` added to XT-269; XT-270 asserts its absence on the real snapshot.
  - `medium` `patch` (verification-gap) ai/mcp/boost branch never run — ai fixture and exact listing assertion added.
  - `low` `patch` (edge) `in CONSTRUCT_HELPERS` matched Object.prototype keys — `Object.hasOwn`.
  - `false` `reject` (edge) Constructs after `new`/`instanceof`/type position — reserved words cannot be class names; the reachable cases (`case`, `::`, named arg) were patched above.
  - `low` `patch` (edge) `new readonly class {}` bodies not seen as class bodies — `class` followed by `{`/`(` is anonymous.
  - `low` `defer` (edge) Namespaced declarations/imports hide same-named builtins — same as the blind short-name finding; documented Limit.
  - `low` `patch` (edge) `&` dropped real calls after bitwise/by-ref `&` — `&` blocks a call only after `function`/`fn`.
  - `low` `patch` (edge) Strings inside `array(...)`/control parens — same fix as the blind finding.
  - `false` `reject` (edge) Map test path without `/` — `parseMap` rejects any path that does not start with a repository name.
  - `low` `patch` (edge) Missing `<ai|mcp|boost>/src` gave raw ENOENT — `requireDir` hint.
  - `low` `patch` (edge) `readMap` before `sourceDir` gave exit 1 for an unknown Component — reordered; test added.
  - `false` `reject` (edge) Illuminate row with no directory exits 1 — a snapshot that lacks a table Component's directory is a snapshot failure, which exit 1 is for.
  - `medium` `patch` (edge) Upstream test helpers in `tests/Pest.php` listed for ai — declarations are now read from every repository's `tests/` too; ai fixture asserts none listed.
  - `low` `defer` (edge) Imports such as `Laravel\Prompts\select` share a short name with possible builtins — same short-name Limit.
  - (intent) R1 and R3(a) implemented; recall not shown by a test — measured instead: against the runtime exports at 4cdb11c1^ (before Story 14.1), the collections listing names 100 of the 108 PHP-named exports Epic 14 added; the 8 not listed are operator helpers (`plus`, `divide`, `identical`, `keyed`) or snake_case aliases of camelCase exports that already existed.
  - (intent) Docs not wired into AGENTS.md — see the deferred row above.
  - (intent) R4 (orchestrator runs the scan at epic start) not implemented — the action names "an epic's first Story", not the orchestrator.
  - (intent) Constructs with `helper=none` always listed, `strings=` can over-count — documented; the listing is triaged before raising.
  - (intent) Scope additions (reading every repository's src/ and tests/, construct helpers) support the action's wording.

## Design Notes

Coverage rule: a PHP name is exported when some runtime export `e` satisfies `norm(e) === norm(name)` or `norm(e) === "php" + norm(name)`, where `norm` lowercases and drops `_` (PHP function names are case-insensitive). Constructs map to helpers by a fixed table: `match`→`unhandledMatch`, `yield from`→`yieldFrom`, `empty`→`toBool`; the test asserts each helper is a real export. A name is a call when the next code token is `(` and the previous is not `->`, `?->`, `::`, `function`, `fn`, `new`, `const`, `&`. A named `function` is a method when it sits inside a class-like body (the `{` after `class|interface|trait|enum`, anonymous classes included).

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/builtin-scan.test.ts` -- expected: pass
- `bun run scan:builtins collections` -- expected: exit 0, a listing and a summary line
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run harness --xaravel` -- expected: no differences

## Auto Run Result

Status: done

- **Change:** `bun run scan:builtins <component>` (`tools/scans/builtins.ts`) lists the PHP functions and constructs an Upstream Component's `src/` and mapped tests call by name that Upstream does not declare and `@xaravel/runtime/php` does not export. It is covered by XT-conformance-269 (mini snapshot, every matrix row, the ai branch, exit codes) and XT-conformance-270 (real `collections` snapshot), and documented in `docs/ops/builtin-scan.md` with a pointer and Commands row in `docs/ops/scans.md`.
- **Files:** `tools/scans/builtins.ts` (new scan); `conformance/tests/xaravel/builtin-scan.test.ts` (two Xaravel Tests); `docs/ops/builtin-scan.md` (rules, limits, where it sits in the Story loop); `docs/ops/scans.md` (intro, Commands row); `package.json` (`scan:builtins`).
- **Review:** 16 findings patched (5 medium, 11 low), 3 deferred (see frontmatter; 2 entries), 5 rejected as false, 1 low rejected (fail-closed lexer errors are the scans' convention). Follow-up review recommended: false. The patched mediums are test-coverage and narrowly scoped filter fixes, each now pinned by an exact-output assertion.
- **Verification:** `bun test conformance/tests/xaravel/builtin-scan.test.ts` pass; `bun run typecheck` and `bun run lint` clean; `bun run harness --xaravel` 496 tests, 0 failed, differ=0; `bun run scan:builtins collections` exits 0 (9 functions, 4 constructs). Recall check: with the runtime exports from before Story 14.1 (4cdb11c1^), the collections listing names 100 of the 108 PHP-named exports Epic 14 added.
- **Residual risks:** the doc is not linked from AGENTS.md (Maintainer-only); `strings=` can count a non-callable string argument that names a called function (`contains('date')`); short-name matching across namespaces.

