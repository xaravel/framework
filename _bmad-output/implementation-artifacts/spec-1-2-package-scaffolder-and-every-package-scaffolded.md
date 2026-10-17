---
title: 'Story 1.2: Package scaffolder and every package scaffolded'
type: 'chore'
created: '2026-10-16'
status: 'done'
baseline_revision: '3a41cef6b579a6f861a569395129bb82d91564af'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/stories/1.2.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A guarded `import()` of an optional peer may not type-check, because peers are never project references and resolve outside `rootDir: src`.
    evidence: |-
      Not probed: no package imports a peer yet. Settle it with a scratch package that does `await import("@xaravel/filesystem")` under `tsc -b`; referencing peers directly would create cycles (support <-> filesystem).
    location: >-
      tools/scaffold/scaffold.ts (generateTsconfig)
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** No package exists, so no Phase 1+ Story has a `packages/<component>/` to work in, and nothing records each package's Phase and Upstream edges.

**Approach:** Commit a package table `tools/scaffold/packages.jsonl`, generated from Upstream `composer.json` at the Pin (and from Foundation's imports). Add `bun run scaffold`, which creates each package from that table and generates its `tsconfig.json` and the root project references. Add `--check`, which fails naming any package whose `tsconfig.json` drifts. Verify with XT-conformance-6..10 under plain `bun test`.

## Boundaries & Constraints

**Always:**
- One row per package: the 37 Upstream components that have a `composer.json` at `v13.37.0` (directory = kebab-case component name, so `JsonSchema` → `json-schema`), plus `foundation`, `runtime`, `http-foundation`, `mime`, `finder`, `serializable-closure`, `htmx`, `testbench`, `framework`, `mcp`, `boost`, `ai`, `assert`, `mockery` (all `packages/<name>`), `create-xaravel` (dir `installer`) and `boost-framework` (dir `tools/boost-framework`, `private: true`). 53 rows, sorted by `name`, LF, one JSON object per line.
- Row fields: `name`, `dir`, `npm`, `phase` (0..9, PRD §7.3), `kind` (`upstream` | `xaravel` | `grader` | `distribution`), `upstream` (e.g. `illuminate/support`, or `null`), `private`, `require`, `suggest` (sorted `illuminate/*` names only).
- `require`/`suggest` come verbatim from Upstream `composer.json` `require`/`suggest` keys filtered to `illuminate/*`. Foundation: every `Illuminate\<Ns>\` reference in `src/Illuminate/Foundation/**/*.php`, mapped to its component. Components with Phase ≤ 6 (Foundation's Phase) go in `require`, later ones in `suggest` (AD-2: later Components are reached by FQCN, never statically). Rows with no Upstream `composer.json` at the Pin (Xaravel-only, grader, distribution, mcp, boost, ai) have empty lists.
- Generated `package.json`: `name` = `npm`, `version` `0.0.0`, `description`, `license: MIT`, `type: module`, `engines.bun: ">=1.4"`, `exports: {".": "./src/index.ts"}`, no `default` export condition, no `sideEffects` key. `dependencies`: each `require` mapped `illuminate/<x>` → `@xaravel/<x>`: `workspace:*`, plus `@xaravel/runtime` and `@xaravel/contracts` for every `upstream`/`xaravel` row (never a self-edge; `runtime` gets none; grader and distribution rows get none). `peerDependencies`: each `suggest` → `workspace:*`, with `peerDependenciesMeta.<pkg>.optional: true`.
- Generated `tsconfig.json` is derived from that package's current `package.json` (so a Story that edits its `package.json` then reruns `bun run scaffold` stays consistent). It extends the base via a relative path, sets `composite`, `noEmit: false`, `emitDeclarationOnly`, `rootDir: "src"`, `outDir` and `tsBuildInfoFile` under root `.cache/tsc/<name>`, `types: ["bun"]`, `include: ["src/**/*.ts"]`, and `references` = its workspace `dependencies` only (peers are never referenced), sorted.
- `bun run scaffold` is idempotent. It creates `package.json`, `README.md`, `LICENSE`, `src/index.ts` (`export {};`) and `.gitkeep` in `tests/ported/`, `tests/xaravel/`, `docs/` only when missing. It always rewrites the package `tsconfig.json` and the root `tsconfig.json` `references`.
- `README.md`: the package name, "Part of Xaravel, a TypeScript port of Laravel", the Upstream it ports, the non-affiliation statement, and a `## Dependencies` section (AD-22). `LICENSE` is a copy of the root `LICENSE`.
- Tests are hermetic: XT-10 scaffolds into a temp root and never edits the repo's files.

**Never:**
- No per-package `bunfig.toml` (the spine forbids it; this resolves Story 1.1's deferral). No `experimentalDecorators`. Never touch `AGENTS.md` or `skeleton/` beyond what exists.
- No network in tests. Out of scope: the graph check (1.3), the tests' own `tsc` project (Epic 4/5), the meta-package's dependency list (61.1), boost-framework's `@modelcontextprotocol/server` dependency (7.3), and Upstream pins for mcp/boost/ai (Epic 2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh scaffold | table, no `packages/` | all 53 packages created; root `tsc -b` exits 0 | — |
| Re-run | everything scaffolded | no file changes | — |
| Edited package.json | a Story added a dep | rerun keeps the package.json, regenerates the tsconfig with the new reference | — |
| Drift | one package tsconfig hand-edited | `scaffold --check` exits 1, names the package | lists every drifted package |
| Missing tsconfig | package without tsconfig.json | `--check` exits 1 naming it | — |
| Table regen | `--upstream <checkout>` of the Pin | `table.ts` output equals the committed table | exits 1 with a diff summary |

</intent-contract>

## Code Map

- `package.json` -- root; add scripts `scaffold` (`bun tools/scaffold/scaffold.ts`), `scaffold:check` (`... --check`), `scaffold:table` (`bun tools/scaffold/table.ts`); change `typecheck` to `bun --bun tsc -b`.
- `tsconfig.json` -- root; keeps `include: ["conformance/**/*.ts"]`, gains `tools/scaffold/**/*.ts` and the generated `references`. Probe: TS 7.0.2 `tsc -b` builds a non-composite `noEmit` root with references, provided each composite project has its own `tsBuildInfoFile` (otherwise TS6377).
- `installer/package.json` -- existing placeholder `create-xaravel`; the scaffolder keeps it and adds the rest.
- Upstream at the Pin: `git clone --depth 1 --branch v13.37.0 https://github.com/laravel/framework` (HEAD `685f8d6c2ab4547287500bc80ccdf2ca12635109`); 37 `src/Illuminate/*/composer.json`; Foundation has none.
- `conformance/tests/xaravel/root-baseline.test.ts` -- test style to match (`bun:test`, title starts with Test ID and states the rule).
- `stories/1.2.md` -- XT-conformance-6..10, one per acceptance criterion in order.

## Tasks & Acceptance

**Execution:**
- `tools/scaffold/table.ts` -- `--upstream <dir>` prints the table built from an Upstream checkout plus the static row list (names, dirs, phases, kinds); `--check` compares it with the committed file.
- `tools/scaffold/packages.jsonl` -- generated by `table.ts` from the Pin checkout.
- `tools/scaffold/scaffold.ts` -- exports `scaffold(root)` and `checkTsconfigs(root)`; CLI `[--root <dir>] [--check]`.
- `packages/*/**`, `installer/**`, `tools/boost-framework/**`, root `tsconfig.json`, `bun.lock` -- produced by `bun run scaffold` and `bun install`.
- `conformance/tests/xaravel/scaffold.test.ts` -- XT-conformance-6..10. (6) table shape, 53 rows, sorted, field types, phases, Foundation's row non-empty, and an equality check against `table.ts` output when `XARAVEL_UPSTREAM` points at a Pin checkout. (7) every row's dir has the generated files and fields, Installer is `create-xaravel`, boost-framework is private, no `sideEffects`/`default`. (8) dependencies and optional peers match the table, runtime/contracts edges. (9) root `tsc -b` exits 0, and each tsconfig's `references` equal its workspace deps. (10) a temp root scaffolded and then drifted fails `--check` with the package name.

**Acceptance Criteria:**
- Given `tools/scaffold/packages.jsonl`, when inspected, then it has the 53 rows with Phase and the Pin's `illuminate/*` `require`/`suggest`, and Foundation's row comes from its imports (XT-conformance-6).
- Given the table, when `bun run scaffold` runs, then each package has the `package.json`, generated `tsconfig.json`, directories, `README.md` and `LICENSE` above, the Installer is `create-xaravel`, and boost-framework is private (XT-conformance-7).
- Given the scaffolded packages, when dependencies are inspected, then each `require` is `workspace:*`, each `suggest` is an optional peer, and runtime/contracts edges are present (XT-conformance-8).
- Given the scaffolded repo, when root `tsc -b` runs, then every package builds as its own project reference with `types` and references limited as above (XT-conformance-9).
- Given a package whose `tsconfig.json` differs from its generated form, when `bun run scaffold:check` runs, then it fails and names the package (XT-conformance-10).

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 37 findings — high 0, medium 4, low 19, false 10, maybe-false 4
- findings:
  - `[medium]` `[patch]` (intent) Pin fidelity of the table is checked only when `XARAVEL_UPSTREAM` is set — XT-6 gains a hermetic fixture-tree check of `buildTable` (composer filtering, Foundation Phase split) and of `table.ts --check` failing with a diff; the full Pin equality stays env-gated because tests may not use the network (Epic 2 brings the snapshot).
  - `[low]` `[patch]` (intent) auth lists `@xaravel/queue` as both dependency and optional peer — peers now exclude anything already a dependency; XT-8 asserts disjointness.
  - `[false]` `[reject]` (intent) Foundation Phase split is an added rule — it is AD-2's own rule ("statically imports only Components of its own or earlier Phases"), recorded in the spec.
  - `[false]` `[reject]` (intent) runtime/contracts edges made mandatory — AD-10 requires every class file to call `registerClass` from runtime, so every graded package needs the edge; the permission is unchanged for 1.3.
  - `[false]` `[reject]` (intent) `types` kept at `["bun"]`, limit placed in `references` — `@types/bun` is the only ambient type package in the repo; workspace types are reached only through references, so the limit holds.
  - `[false]` `[reject]` (intent) fresh scaffold exercised only in a temp root — that is the hermetic surface; idempotence against the real repo is in Verification (`bun run scaffold && git status`).
  - `[false]` `[reject]` (intent, blind) Installer placeholder's `private` dropped / hand-edited — the file is `generatePackageJson` output (XT-7 compares it); `create-xaravel` is a published npm name per the spine, and only boost-framework is private.
  - `[false]` `[reject]` (intent, blind) Protected Paths and `component: conformance` scope — every Epic 1 Story is a Maintainer-approved Infrastructure Story (epic context; MAINT-2026-10-16).
  - `[medium]` `[patch]` (verification-gap) generated package.json/README/LICENSE never asserted on scaffolder output — XT-7/XT-8 per-row checks are factored into a helper and also run on the XT-10 temp root.
  - `[medium]` `[patch]` (verification-gap) root references write and drift check unexercised — XT-10 strips the temp root references, asserts `--check` names `(root tsconfig.json references)` and that `scaffold` restores them.
  - `[medium]` `[patch]` (verification-gap) table derivation never runs by default — grouped with the first row (same fix).
  - `[low]` `[patch]` (verification-gap other) auth dependency/peer overlap — grouped with the auth row.
  - `[false]` `[reject]` (verification-gap other) XT-9 writes `.cache/tsc` in the repo — gitignored build output, not a repo file; the hermetic rule covers tracked files.
  - `[low]` `[patch]` (edge-case) auth overlap — grouped with the auth row.
  - `[low]` `[patch]` (edge-case) a non-Foundation component without composer.json would get Foundation's edges — `buildTable` now throws unless the dir is `Foundation`.
  - `[maybe-false]` `[reject]` (edge-case) grouped `use` / namespace-only references inflate Foundation edges — at the Pin, every component reached through a namespace prefix is also referenced by an exact symbol; settling needs a per-reference audit, and if true it is low (an extra declared edge is allowed by 1.3's rule).
  - `[false]` `[reject]` (edge-case, blind) comments/docblocks become edges — stripping comments and strings at the Pin leaves the same component set (scratch script, no comment-only component).
  - `[low]` `[reject]` (edge-case, blind) checkout not verified to be at the Pin — `--check` against the committed table catches a different version's composer data; a pin record is Story 2.1's.
  - `[low]` `[patch]` (edge-case, blind) `--check` catch hides the cause — the entry now carries the error message.
  - `[low]` `[reject]` (edge-case) root tsconfig missing or JSONC — the root tsconfig is generated strict JSON; a loud crash on a hand-broken file is correct.
  - `[low]` `[reject]` (edge-case) no cycle check before writing tsconfigs — `tsc -b` already fails loudly on a reference cycle (TS6202 seen during implementation); the graph check is Story 1.3.
  - `[low]` `[reject]` (edge-case) empty `baseline-pin` gives "Laravel ." — the pin file is Protected and tested by XT-4.
  - `[low]` `[reject]` (edge-case) test TypeError on unknown dependency — a loud failure naming the line.
  - `[low]` `[patch]` (edge-case claim) XT-8 does not assert disjointness — grouped with the auth row.
  - `[low]` `[reject]` (blind) Symfony and laravel/* `require` entries dropped — the AC fixes the table to `illuminate/*` lists; AD-2 lets each Phase 3+ Story add its edge to its own `package.json`, and `scaffold` regenerates the tsconfig from it.
  - `[low]` `[patch]` (blind) AD-2's `@xaravel/support` optional peer on `@xaravel/mockery` missing — added for the support row; `testing`→mockery stays a permission for Epic 57.
  - `[low]` `[patch]` (blind) auth overlap — grouped with the auth row.
  - `[false]` `[reject]` (blind) Installer hand-edited — duplicate of the intent row above; same refutation.
  - `[low]` `[reject]` (blind) `create-xaravel` has no `bin` — every package is an empty `0.0.0` stub; publishing needs a Maintainer-approved tag (Story 1.8), and the `bin` is Story 61.5's.
  - `[low]` `[patch]` (blind) mcp/ai/boost READMEs claim the framework Pin — only `illuminate/*` rows name it now.
  - `[low]` `[patch]` (blind) `upstream` null for third-party ports — set for http-foundation, mime, finder, serializable-closure.
  - `[maybe-false]` `[defer]` (blind) a guarded `import()` of an unreferenced optional peer may not type-check under `rootDir: src` — needs a probe once a Story writes one; medium if true.
  - `[low]` `[patch]` (blind) `--check` ignores a `packages/` dir with no row — now reported.
  - `[maybe-false]` `[reject]` (blind) README dependency section goes stale after a Story edit — READMEs are Story-owned after scaffolding (AD-2); if true, low.
  - `[maybe-false]` `[reject]` (blind) Foundation namespace-prefix fallback inflates edges — same as the edge-case row; low if true.
  - `[false]` `[reject]` (blind) XT-8 checks presence only — intended: later Stories add edges (AD-2).
  - `[low]` `[patch]` (blind) branch `story/1-2-…` does not match the manifest's `story/1.2` — branch renamed to `story/1.2`, as Story 1.1 used.

## Design Notes

The directory is `json-schema`, not the spine diagram's `jsonschema`, because the spine's naming rule ("kebab-case of the Upstream component name") and `epics.md` (`@xaravel/json-schema`) agree on it. `skeleton/` is the app, not a package (FR-10), so it gets no row. Its placeholder stays. Foundation's console and testing slices (Phase 7) add their Phase-7 edges by editing `packages/foundation/package.json`, which AD-2 allows after scaffolding.

## Verification

**Commands:**
- `bun run scaffold && git status --porcelain` -- expected: second run produces no changes
- `XARAVEL_UPSTREAM=/tmp/xar-up/fw bun test` -- expected: all pass
- `bun run typecheck` / `bun run lint` / `bun run scaffold:check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** Every package now exists. `tools/scaffold/packages.jsonl` (53 rows) records each package's Phase, kind, Upstream and `illuminate/*` `require`/`suggest` lists. The lists are generated by `tools/scaffold/table.ts` from Upstream `composer.json` at `v13.37.0` (`685f8d6c2ab4547287500bc80ccdf2ca12635109`); Foundation's lists come from its PHP imports, split by Phase. `bun run scaffold` creates each package's files once and regenerates every `tsconfig.json` and the root project references. `bun run scaffold:check` fails, naming the package, on drift. XT-conformance-6..10 run under plain `bun test`.

**Files changed.**
- `tools/scaffold/table.ts` -- builds and checks the package table from an Upstream checkout.
- `tools/scaffold/packages.jsonl` -- the committed package table.
- `tools/scaffold/scaffold.ts` -- scaffolder and tsconfig drift check.
- `packages/*/**` (51), `installer/**`, `tools/boost-framework/**` -- scaffolded packages (`package.json`, `tsconfig.json`, `README.md`, `LICENSE`, `src/index.ts`, `tests/ported/`, `tests/xaravel/`, `docs/`).
- `package.json` -- `scaffold`, `scaffold:check`, `scaffold:table` scripts; `typecheck` is now `tsc -b`.
- `tsconfig.json` -- includes `tools/scaffold`, plus the 53 generated references.
- `bun.lock` -- new workspaces.
- `conformance/tests/xaravel/scaffold.test.ts` -- XT-conformance-6..10.

**Review findings.** 37 findings. 14 were patched: the hermetic table-derivation fixture; manifest, README and root-reference checks on the scaffolded temp root; disjoint dependencies and peers (auth/queue); support's optional mockery peer; Pin wording in READMEs; third-party `upstream` values; a guard for a missing composer.json; error causes and unlisted dirs in `--check`; and the branch renamed to `story/1.2`. One was deferred: peer-import typing, unverified. The other 22 were rejected, each with its reason in the Review Triage Log.

**Follow-up review recommendation:** false. Patched entries: high 0, medium 3 (grouped into 2 root causes: hermetic scaffolder-output checks, and hermetic table derivation), low 11. The patched behaviour is now asserted by the tests that the review said were missing.

**Verification.** `bun run scaffold` twice produces no changes. `XARAVEL_UPSTREAM=/tmp/xar-up/fw bun test` gives 10 pass, 0 fail, and plain `bun test` also gives 10 pass. `bun run typecheck` (`tsc -b`, 53 projects), `bun run lint`, `bun run scaffold:check`, `table.ts --upstream <Pin> --check` and `bun install --frozen-lockfile` all exit 0.

**Residual risks.**
- The full Pin-equality check of the table runs only when `XARAVEL_UPSTREAM` is set. Epic 2's snapshot should become its default source.
- Symfony and `laravel/*` ports get no automatic edges. Each Phase 3+ Story adds its own edge in its `package.json`.
- The deferred peer-import typing question.
