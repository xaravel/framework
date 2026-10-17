---
title: 'Story 1.3: Dependency-graph check'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_revision: '0c31c82ab024267a73e64b8824aae357032e2bef'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/stories/1.3.md'
warnings: ['oversized']
deferred:
  - summary: >-
      AD-2's meta-package rule (every optional peer becomes a real dependency of @xaravel/framework) collides with the grader-edge rule for @xaravel/support's optional @xaravel/mockery peer.
    evidence: |-
      packages/support/package.json declares @xaravel/mockery as an optional peer (AD-2 grader exception). AD-2 Meta-package says @xaravel/framework lists every optional peer as a real dependency; the graph check reports any graded package listing a grader package in dependencies, except testing -> mockery. Story 61.1 must either exclude grader peers from the meta-package or raise an Escalation.
    location: >-
      tools/graph/graph.ts (allowedGraderEdge)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Nothing enforces AD-2's package edges. A package can import something it doesn't declare, two packages can depend on each other, Foundation can depend on a later-Phase Component, and a graded package can take the grader at runtime. CI has no check that catches any of these.

**Approach:** Add `tools/graph/graph.ts`, which exports `checkGraph(root): string[]` (one line per violation) and a CLI `bun run graph:check` that prints the violations and exits 1 if there are any. It reads the package table `tools/scaffold/packages.jsonl` under `root`, each row's `package.json`, and the package's source files. XT-conformance-11..16 drive it against hermetic fixture roots and against the repo itself.

## Boundaries & Constraints

**Always:**
- Packages are the table rows. The package for a row is `<root>/<row.dir>/package.json`, and Phase and kind come from the row. An `@xaravel/*` edge to a name with no table row is a violation.
- **Cycle.** The graph's edges are the workspace `dependencies` between rows. `devDependencies` and `peerDependencies` are never edges, so the scaffolded support ⇄ filesystem peer pair is not a cycle. Each cycle is reported once, as `cycle: @a -> @b -> @a`, rotated so that it starts at its smallest name. A self-dependency counts as a cycle.
- **Undeclared import.** The check scans `src/**` and `tests/**` files with extensions `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs`, using `new Bun.Transpiler({ loader }).scanImports`.
  - In `src/**`, a static import (`import-statement`, `require-call`) must name the package itself or one of its `dependencies`. A `dynamic-import` may also name a `peerDependencies` entry (AD-2's guarded `import()`).
  - In `tests/**`, every import may name `dependencies` or `devDependencies`.
  - Exempt specifiers: relative (`.`), absolute (`/`), `#`-subpath imports, `bun`, `bun:*`, `node:*`, and bare Node builtins (`node:module` `builtinModules`).
  - The package name of a specifier is its first segment, or its first two for `@scope/`.
  - The message gives the repo-relative file, the specifier and the missing package: `undeclared import: packages/a/src/x.ts imports "@xaravel/b/y", but @xaravel/b is not in @xaravel/a dependencies`.
- **Foundation Phase.** Every workspace `dependencies` entry of the `foundation` row must have Phase ≤ Foundation's Phase. Otherwise the check reports `foundation phase: @xaravel/foundation (Phase 6) depends on @xaravel/x (Phase 7); Foundation may depend only on Components of its own or earlier Phases (AD-2)`.
- **Grader edges.** A non-`grader` row may not list a `grader` row in `dependencies`, `peerDependencies` or `optionalDependencies`. There are exactly two exceptions: `@xaravel/testing` may list `@xaravel/mockery` in `dependencies`, and `@xaravel/support` may list `@xaravel/mockery` in `peerDependencies` if `peerDependenciesMeta` marks it `optional: true`. The violation is `grader edge: …`. `devDependencies` on the grader are always allowed.
- **Test-edge Phase.** A workspace `devDependencies` entry must be a `grader` row, or a row whose Phase is ≤ the package's own Phase (AD-2 Tests). Otherwise the check reports `test edge phase: …`.
- A dependency that is declared but never imported is fine.
- The violation list is sorted and deterministic. Tests are hermetic: fixtures go in `mkdtempSync` roots, and the only read of the repo is the final check that the repo passes.

**Never:**
- Don't check type-only imports: Bun drops them from `scanImports`. Undeclared type imports already fail `tsc -b`, because each package project references only its `dependencies`. Probed: an `import type` from `@xaravel/support` in macroable fails with TS2307.
- Don't check unused dependencies or third-party version ranges (AD-22). Don't change `package.json` files or the table. CI wiring is out of scope: `.github/` doesn't exist yet, and Story 1.7 makes the check required.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Repo as committed | 53 scaffolded packages | `[]`, and the CLI exits 0 | — |
| A⇄B | a depends on b, b on a | `cycle: @x/a -> @x/b -> @x/a` | exit 1 |
| Undeclared import | `src/i.ts` imports `@x/b` (subpath too) | names the file, the import and `@x/b` | exit 1 |
| Peer via `import()` | a dynamic import of an optional peer | passes | — |
| Peer via static import | a static import of a peer | undeclared import | exit 1 |
| Foundation later Phase | foundation (6) depends on a Phase-7 row | `foundation phase: …` | exit 1 |
| Grader runtime edge | `dependencies` has `@xaravel/assert` | `grader edge: …` | exit 1 |
| Allowed grader edges | testing → mockery dep; support → mockery optional peer | passes | a non-optional support peer fails |
| Dev edge | tests import an earlier-Phase devDependency that depends back on the package | passes, with no cycle | a later-Phase devDep fails |
| Unused dependency | collections declared, never imported | passes | — |

</intent-contract>

## Code Map

- `tools/scaffold/table.ts:267` -- `readTable(path)` and the `PackageRow` type (`name`, `dir`, `npm`, `phase`, `kind`). Reuse them; don't parse JSONL again.
- `tools/scaffold/scaffold.ts:296` -- the CLI pattern to copy: `main(argv)` with `--root`, and `if (import.meta.main) process.exit(...)`. It also has `TABLE_PATH`.
- `packages/foundation/package.json` -- the real Foundation edges, all ≤ Phase 6, with later Phases as optional peers. `packages/support/package.json` -- the optional mockery peer, and filesystem as a peer, while filesystem depends on support.
- `package.json` -- root scripts. Add `graph:check`.
- `tsconfig.json` -- the root `include` lists `conformance/**/*.ts` and `tools/scaffold/**/*.ts`. Add `tools/graph/**/*.ts` so `tsc -b` type-checks the new tool.
- `conformance/tests/xaravel/scaffold.test.ts` -- the test style: `bun:test` `expect`, a title that starts with the Test ID and states the rule and the AD, and temp roots via `mkdtempSync(join(tmpdir(), …))`.
- `stories/1.3.md` -- XT-conformance-11..16, in AC order.
- `Bun.Transpiler.scanImports` (probed on Bun 1.4.3): it returns `import-statement` for import/export-from/side-effect imports, `dynamic-import`, and `require-call`. It drops `import type`, `export type`, and imports whose every specifier is a type. It ignores comments and strings.

## Tasks & Acceptance

**Execution:**
- `tools/graph/graph.ts` -- create `checkGraph(root)` with the five rules above and the sixth, layer-edge rule below, plus the CLI (`[--root <dir>]`). It prints `Dependency graph OK (<n> packages).` or the violations to stderr. This is the AD-2 CI check. The header comment lists every violation kind the check reports.
  - **Layer edges** (spine § Layers table: runtime "nothing", contracts "runtime", grader "nothing graded"; Stories 4.1 and 9.1 rely on the graph check for these):
    - the `runtime` row lists no workspace row in `dependencies`, `peerDependencies` or `optionalDependencies`;
    - the `contracts` row lists only `@xaravel/runtime` there;
    - a `grader` row lists no non-`grader` row there.
  - Each violation is `layer edge: <npm> lists <dep> in <field>; <the layer's rule> (AD-2)`.
- `package.json` -- add `"graph:check": "bun tools/graph/graph.ts"`.
- `tsconfig.json` -- add `tools/graph/**/*.ts` to `include`.
- `conformance/tests/xaravel/graph.test.ts` -- add a fixture-root helper that writes a table, `package.json` files and source files, then XT-conformance-11..16. Each test also asserts the CLI exit code for one failing and one passing fixture, and the matrix rows that belong to its AC:
  - XT-11: a strongly connected group that holds two cycles (a⇄b and a⇄c) reports both, exactly.
  - XT-12: a static peer import fails, and so does a `src/**` `import()` of a package that is neither a dependency nor a peer (exact "dependencies or peerDependencies" line).
  - XT-13: the layer edges for runtime and contracts.
  - XT-14: a non-optional support peer fails, and a grader row listing a graded row fails (layer edge).
  - XT-15: a later-Phase devDependency fails.
  - XT-16: a row without a `package.json` and an unparseable `src/**` file each give their exact violation line and CLI exit 1. `checkGraph(repoRoot)` is `[]`, and the CLI's package count on the repo equals `readTable(...).length`, never a hard-coded 53.

**Acceptance Criteria:**
- Given a fixture where A depends on B and B on A, when the check runs, then it fails and prints the cycle (XT-conformance-11).
- Given a static import of a package not in the importer's `dependencies`, when the check runs, then it fails, naming the file, the import and the missing dependency (XT-conformance-12).
- Given Foundation depending on a later-Phase package (fixture), when the check runs, then it fails under AD-2 (XT-conformance-13).
- Given a graded package with a runtime dependency on `@xaravel/assert`, when the check runs, then it fails, and only testing → mockery (dependency) and support → mockery (optional peer) pass (XT-conformance-14).
- Given a dev-only edge from test files to an earlier-Phase package, when the check runs, then the edge is excluded from the cycle check and passes (XT-conformance-15).
- Given `@xaravel/collections` declared but not imported, when the check runs, then it passes, and the committed repo passes too (XT-conformance-16).

## Spec Change Log

### 2026-10-16 — loop 1 (bad_spec)
- **Trigger:** the intent-alignment finding that "illegal edges" leaves out the spine's layer table. Story 4.1 ("Given `@xaravel/assert`'s package graph, When the graph check runs, Then it has no dependency on any graded package") and Story 9.1 ("`@xaravel/runtime` … When the graph check runs, Then it has no dependencies") rely on this check, and they can't change it later because `tools/` is Protected.
- **Amended:** Tasks. Added the sixth, layer-edge rule (runtime, contracts, grader) and its tests in XT-13 and XT-14. Also folded in this pass's patch findings: a test for the multi-cycle group, the undeclared `import()`, the missing `package.json` and the unparseable source; a computed package count; and a header comment that lists every violation kind.
- **Known-bad state avoided:** a grader or runtime package that takes a graded dependency would pass `graph:check`, and Stories 4.1 and 9.1 would have no check to cite.
- **KEEP:**
  - Everything in the first attempt, saved at `/tmp/xar13/attempt-1.patch`. Re-apply it as the starting point (`git apply`), then add only the amendments above.
  - From that attempt, keep the Tarjan-then-enumerate `findCycles` and the de-duplicated, sorted violation `Set`.
  - Keep the exact messages already asserted, the `fixture()` / `withFixtures()` / `runCli()` helpers, the `unknown package:` / `missing package.json:` / `unparseable source:` violations, and the CLI pattern.

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 36 findings — high 0, medium 4, low 25, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` (edge) malformed package.json throws — a loud crash, exit 1, on a hand-broken manifest; it can't pass silently, and a guard adds a branch for a case never seen.
  - `[low]` `[reject]` (edge) missing or broken packages.jsonl throws — same: a loud failure. The table is Protected and checked by XT-6.
  - `[low]` `[reject]` (edge) duplicate npm rows — XT-6 asserts unique names and `npm = @xaravel/<name>` for upstream rows; unlikely, and the fix adds a guard.
  - `[low]` `[reject]` (edge) manifest `name` differs from row `npm` — scaffold writes the name, and XT-7 checks the generated manifests; unlikely in everyday use, and the fix adds a new violation kind.
  - `[low]` `[reject]` (edge) cycle through `optionalDependencies` or required peers — the scaffolder never emits `optionalDependencies`, and every generated peer is optional (XT-8); unlikely, and the fix adds branches.
  - `[low]` `[reject]` (edge) Foundation later-Phase via `optionalDependencies` or a required peer — same reason as the row above.
  - `[low]` `[reject]` (edge) `import()` of a non-optional peer passes — all workspace peers are generated optional (XT-8); unlikely, and the fix adds a guard.
  - `[false]` `[reject]` (edge) a src import of an `optionalDependencies` entry is reported undeclared — this is the spec's rule (static `src/**` imports must be `dependencies`), so it is not a defect.
  - `[low]` `[reject]` (edge) symlinked sources skipped — no package uses symlinks; unlikely, and the fix adds a branch.
  - `[low]` `[reject]` (edge) `.jsx` and files outside src/tests not scanned — packages export `./src/index.ts` and there is no JSX; unlikely, and the fix widens the scan surface.
  - `[false]` `[reject]` (edge) plain imports used only as types count — correct: `verbatimModuleSyntax` keeps them at runtime, so they are real edges.
  - `[low]` `[reject]` (edge) URL / `data:` specifiers flagged as packages — Bun packages don't import URLs; unlikely, and a loud false positive.
  - `[false]` `[reject]` (edge) grader rows get the test-edge Phase rule implicitly — AD-2 Tests applies to all test files, so this is deliberate.
  - `[low]` `[bad_spec]` (edge) XT-16 hard-codes 53 packages — folded into the loop-1 amendment (computed count).
  - `[medium]` `[bad_spec]` (verification-gap) an undeclared `src/**` `import()` is untested — folded into the loop-1 amendment (XT-12).
  - `[medium]` `[bad_spec]` (verification-gap) `missing package.json` / `unparseable source` violations are untested — folded into the loop-1 amendment (XT-16).
  - `[medium]` `[bad_spec]` (verification-gap) a group holding several cycles is untested — folded into the loop-1 amendment (XT-11).
  - `[low]` `[reject]` (blind) a relative import escaping the package — for `src/**` the package `tsc` project (`rootDir: src`) rejects a file outside its root; for tests it is unlikely, and the fix needs path resolution plus a new branch.
  - `[low]` `[reject]` (blind) bad input crashes instead of a violation — duplicate of the edge rows: a loud failure.
  - `[low]` `[reject]` (blind) manifest name never compared — duplicate of the edge row; same reason.
  - `[low]` `[reject]` (blind) `optionalDependencies` handled inconsistently — duplicate of the edge row; none exist in the repo.
  - `[low]` `[reject]` (blind) any peer passes `import()` — duplicate of the edge row.
  - `[low]` `[reject]` (blind) bare builtin names (`events`, `buffer`) also exempt npm packages of the same name — the spec exempts bare builtins; shadowing a builtin with an npm package is unlikely, and the fix changes the exemption rule.
  - `[low]` `[reject]` (blind) aliases and non-`workspace:` `@xaravel/*` ranges — the scaffolder writes `workspace:*`; unlikely, and the fix adds branches.
  - `[low]` `[reject]` (blind) files outside src/tests — duplicate of the edge row.
  - `[low]` `[bad_spec]` (blind) hard-coded 53 — grouped with the edge row; folded into the amendment.
  - `[low]` `[bad_spec]` (blind) untested branches — the missing-manifest, unparseable, dynamic-import and multi-cycle cases are folded into the amendment. CLI exit 2 and `require-call` from `.ts` are rejected: trivial argument handling and the same `scanImports` path as `.cjs`.
  - `[low]` `[reject]` (blind) cycle enumeration is exponential on dense groups — any cycle already fails CI and the real graph is acyclic; Johnson's algorithm adds complexity for a case nobody meets.
  - `[low]` `[reject]` (blind) a new `Bun.Transpiler` per file — negligible at 53 near-empty packages.
  - `[low]` `[bad_spec]` (blind) header comment omits violation kinds — folded into the amendment.
  - `[false]` `[reject]` (intent) no CI wiring — Story 5.7's AC runs "the protected-paths, ownership and dependency-graph checks" per PR; this Story's ACs observe the check itself.
  - `[medium]` `[bad_spec]` (intent) "illegal edges" leaves out the spine's layer table (grader → graded, runtime, contracts), which Stories 4.1 and 9.1 rely on — amended Tasks with the layer-edge rule (loop 1).
  - `[false]` `[reject]` (intent) edges not compared with the table's `require`/`suggest` — AD-2 lets Stories edit their `package.json` after scaffolding, and scaffold XT-8 covers the generated edges.
  - `[false]` `[reject]` (intent) type-only imports untested here — they are enforced by `tsc -b` (XT-9, Story 1.2), probed with TS2307; out of this check's design.
  - `[low]` `[bad_spec]` (intent) hard-coded 53 — grouped with the edge row.
  - `[false]` `[reject]` (intent) tests use `expect` from `bun:test` — the AD-15 rule binds Ported Tests; Epic 1's Xaravel Tests run under plain `bun test` until Epic 5 (epic context).

### 2026-10-16 — Review pass (loop 1 re-derivation)
- verdicts: 29 findings — high 0, medium 3, low 18, false 8, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) the scanned extension set is tested only for `.ts`/`.cjs` — added `.mts`, `.tsx` (with JSX) and `.mjs` undeclared-import fixtures to XT-12.
  - `[false]` `[reject]` (verification-gap other) XT-15 doesn't isolate the grader exemption of the test-edge Phase rule — the reviewer itself says it is not a live defect: every grader row is Phase 0, so the result is identical.
  - `[low]` `[reject]` (edge) malformed package.json throws — carried: a loud failure, exit 1.
  - `[low]` `[reject]` (edge) missing or broken packages.jsonl throws — carried: a loud failure, and the table is Protected and checked by XT-6.
  - `[low]` `[reject]` (edge) a crash's exit 1 is indistinguishable from violations — either way CI goes red with the cause on stderr; unlikely to matter, and the fix adds a try/catch path.
  - `[low]` `[reject]` (edge) Foundation later-Phase via optional or required peers — carried: none are generated (XT-8).
  - `[low]` `[reject]` (edge) `import()` of a non-optional peer passes — carried: every workspace peer is generated optional (XT-8).
  - `[low]` `[reject]` (edge) cycle through optionalDependencies — carried: the scaffolder emits none.
  - `[false]` `[reject]` (edge) a src import of an optionalDependencies entry is reported — carried: that is the spec's rule.
  - `[low]` `[reject]` (edge) `require.resolve` not scanned — no package resolves modules by path; unlikely, and the fix adds a regex scan.
  - `[low]` `[reject]` (edge) `.jsx` not scanned — carried: no JSX in any package.
  - `[low]` `[reject]` (edge) bare builtin names shadow npm packages — carried for the hypothetical Node-core collisions; the concrete `ws`/`undici` case is patched below.
  - `[low]` `[reject]` (edge) URL specifiers — carried.
  - `[low]` `[reject]` (edge) duplicate npm rows — carried: XT-6.
  - `[low]` `[reject]` (edge) a manifest field that is an array — the scaffolder writes objects, and a hand-broken manifest is unlikely; the fix adds type guards.
  - `[low]` `[reject]` (edge) symlinked sources — carried.
  - `[medium]` `[patch]` (blind) Bun's `builtinModules` includes `ws` and `undici` (checked on Bun 1.4.3), so undeclared imports of those npm packages pass — removed both from the exemption; XT-12 asserts each is reported.
  - `[medium]` `[defer]` (blind) AD-2's meta-package rule ("`@xaravel/framework` lists every optional peer as a real dependency") collides with grader isolation for support's optional mockery peer — this is a tension inside AD-2 that predates this Story; Story 61.1 settles it, by Escalation if needed (recorded in `deferred`).
  - `[low]` `[reject]` (blind) `conformance/` and `tools/` aren't scanned for graded imports — the harness doesn't exist yet and no such import exists; Story 1.3's ACs cover packages, and the fix widens the scan to non-package trees.
  - `[false]` `[reject]` (blind) a Phase bypass through `dependencies` — AD-2 limits Phase only for Foundation and test-only edges; runtime `dependencies` mirror Upstream `require` by design.
  - `[false]` `[reject]` (blind) the rest of the Layers table is unchecked — the spine says "The tiers are a guide; the per-package edge list in AD-2 is authoritative"; only runtime, contracts and the grader have hard rules that later Stories cite.
  - `[low]` `[reject]` (blind) `withFixtures` leaks temp roots when `fixture()` throws — only on a broken test, in the OS temp dir; negligible.
  - `[low]` `[reject]` (blind) `unparseable source` has no position, and XT-16 asserts Bun's text — Bun is pinned in `.bun-version`, and a pin bump is a Maintainer Infrastructure Story that reruns the suite.
  - `[low]` `[reject]` (blind) untested field variants of the grader exceptions — the misplaced fixture already covers a wrong field for support → mockery and a wrong target for testing; the remaining variants share the same `allowedGraderEdge` comparison.
  - `[low]` `[reject]` (blind) XT-13/14 titles cover more than their ACs — FR-115 needs each AC verified by its test, not each test limited to one AC; Stories 4.1/9.1 cite their own Test IDs.
  - `[false]` `[reject]` (intent) no CI surface — carried: Story 5.7 wires the dependency-graph check per PR.
  - `[false]` `[reject]` (intent) Foundation is checked at the manifest, not the import, surface — the reviewer notes they are equivalent with the undeclared-import rule, which XT-12 enforces.
  - `[false]` `[reject]` (intent) tests use `bun:test` — carried.
  - `[false]` `[reject]` (intent) rules beyond the six ACs — deliberate: loop 1 added the layer rules that Stories 4.1/9.1 cite; the other extras come from AD-2's Tests and peer clauses.

## Design Notes

Peers are not edges in the cycle graph, because they are not static edges (AD-2: a peer is reached only through a token, an alias or a guarded `import()`). The table already holds peers that point backwards, such as support → filesystem (peer) with filesystem → support (dependency). If peers counted, the repo itself would fail.

The test-edge Phase rule is AD-2's "Tests … may import grader packages and any package of the same or an earlier Phase". It is what makes it safe to leave dev edges out of the cycle check.

## Verification

**Commands:**
- `bun test` -- expected: XT-conformance-1..16 pass
- `bun run graph:check` -- expected: exit 0
- `bun run typecheck` / `bun run lint` / `bun run scaffold:check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** AD-2's package edges are now enforced by a check. `bun run graph:check` (`tools/graph/graph.ts`, `checkGraph(root)`) reads the package table, every package's `package.json`, and the imports in its `src/**` and `tests/**` files. It reports, one sorted line each:
- cycles over workspace `dependencies` (dev and peer edges are not edges);
- undeclared static imports, naming the file, the import and the missing package (`import()` may also reach a peer, and tests may also use devDependencies);
- Foundation depending on a later Phase;
- graded packages taking the grader outside devDependencies, except testing → mockery and support → mockery as an optional peer;
- layer edges: runtime may depend on nothing, contracts only on runtime, and the grader on nothing graded;
- later-Phase devDependencies;
- unknown packages, missing manifests and unparseable sources.

The committed repo passes. XT-conformance-11..16 cover each AC with hermetic fixtures, check the CLI exit codes, and also run the check on the real repo.

**Files changed.**
- `tools/graph/graph.ts`: the dependency-graph check and its CLI.
- `conformance/tests/xaravel/graph.test.ts`: XT-conformance-11..16.
- `package.json`: the `graph:check` script.
- `tsconfig.json`: type-checks `tools/graph`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: Story 1.3 marked done.

**Review findings.**
- Pass 1 had 36 findings. 1 medium (the layer table, which Stories 4.1 and 9.1 cite) went back as a `bad_spec` loopback. The 3 medium and 4 low verification-gap and test findings were folded into that amendment. 7 were false and 21 low were rejected, each with its reason in the Review Triage Log.
- Pass 2 had 29 findings. 2 medium were patched: `ws` and `undici` are no longer treated as builtins, and the `.mts`, `.tsx` and `.mjs` scans are now tested. 1 medium was deferred: AD-2's meta-package rule collides with the support → mockery optional peer, which Story 61.1 must settle. 8 were false and 18 low were rejected, with reasons in the log.

**Follow-up review recommendation:** false. This pass patched 2 medium entries, high 0 and low 0. Both are verified by exact-output assertions in XT-12, and Bun 1.4.3's full `builtinModules` list was checked for other npm-named entries (there are none besides `ws` and `undici`), so no unverified risk remains to name.

**Verification.** `bun test` gives 16 pass and 0 fail. `bun run graph:check` prints `Dependency graph OK (53 packages).` `bun run typecheck`, `bun run lint` and `bun run scaffold:check` all exit 0.

**Residual risks.**
- CI wiring is Story 5.7's.
- Type-only imports rely on `tsc -b` project references.
- XT-16 asserts Bun's "Failed to scan imports" text, so it is tied to the pinned Bun.
- The deferred meta-package and grader conflict.
