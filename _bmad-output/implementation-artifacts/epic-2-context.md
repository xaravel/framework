# Epic 2 Context: Upstream snapshot, Oracle image, Test Inventory & pin bump

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give the Maintainer the complete conformance denominator: every Upstream test case at the Baseline Pin, with a stable Test ID, its Component, its backends, its Upstream assertion kinds and its Oracle outcome. All of it is generated from a read-only, verifiable Upstream snapshot and a reproducible PHP Oracle container. The Maintainer can also move the Pin at a freeze point and get the Inventory diff back as backlog. Every later Story's test scope, the assertion floor, the `upstream-skip` check and the Ratchet depend on this data, so it has to be exact and reproducible.

## Stories

- Story 2.1: Upstream snapshot and Pin record
- Story 2.2: Oracle container image
- Story 2.3: Test-directory → Component map
- Story 2.4: PHPUnit Test Inventory for `laravel/framework`
- Story 2.5: Pest Test Inventory for `laravel/ai`, `laravel/mcp` and `laravel/boost`
- Story 2.6: Upstream baseline run: assertion kinds and Oracle outcomes
- Story 2.7: Inventory determinism and runner-listing cross-check
- Story 2.8: Baseline Pin bump tool

## Requirements & Constraints

- **Kind.** This is Conformance System work (a Xaravel Component, `component: conformance`). Each acceptance criterion is verified by an `XT-conformance-<n>` Xaravel Test that declares the FR consequence it checks. The harness arrives only in Epic 5, so these tests run under plain `bun test` until Epic 5 moves them onto `xaravelTest`. Nearly everything Epic 2 writes (`conformance/upstream/`, `baseline-pin`, `inventory/`, `component-map`, `oracle/`, `tools/`, `.github/`) is a Protected Path, so these are Maintainer-approved Infrastructure Stories.
- **Upstream scope.** Upstream is `laravel/framework` plus `laravel/ai`, `laravel/mcp` and `laravel/boost`, all at the Baseline Pin. The framework Pin is `v13.37.0`, already in `conformance/baseline-pin`. The planning docs give no tags for the other three. The epic says only "Maintainer-recorded tags". The product brief's research addendum lists versions found during research (`laravel/ai` 1.2.3, `laravel/mcp` 1.0.2, `laravel/boost` 2.10.3, the last as a dev dependency), but it does not state them as pins. Get the Maintainer to confirm them. Do not assume them.
- **Inventory completeness.**
  - Every Upstream test case gets exactly one Test ID. Each data-provider, `#[TestWith]` or Pest `with()` dataset is its own entry, including datasets computed at runtime. An unnamed dataset uses its numeric index.
  - The set of IDs must equal what the runners actually list inside the Oracle (`phpunit --list-tests` or JUnit output, and Pest's equivalent). CI checks this.
- **Test ID forms.**
  - PHPUnit: `<FQCN>::<method>#<dataset>`.
  - Pest: `<test-file-path>::<describe> > … > <test name>#<dataset>`.
- **Determinism.** Regenerating the Inventory for the same Pin must be byte-identical; a nightly job checks this. Repeated baseline runs must give identical `assertions`, and any difference is reported as an Oracle non-determinism finding. Two image builds from the same commit must produce the same installed package set.
- **Offline.** Tools read Upstream source only from `conformance/upstream/` and never fetch. Contributors need neither Docker nor PHP. Only the Oracle and Inventory jobs need the image.
- **Pin moves.** The Pin moves only at a freeze point: no new Epics start, and in-flight Epics finish or pause. The bump tool refuses while any Epic is in progress. OQ-12 (out-of-cycle security bumps) is still open, for the Maintainer to decide at the end of Phase 0.

## Technical Decisions

- **Snapshot.** `bun run upstream:sync` checks out each repository into read-only `conformance/upstream/{framework,ai,mcp,boost}/`, at the tag in `conformance/baseline-pin`. The file also records a tree hash for each directory. A CI snapshot check fails on a hash mismatch or any local modification. The Inventory's `source` field is a path into the snapshot plus a line range.
- **Oracle image.** It is built from `conformance/oracle/Dockerfile` and a committed `composer.lock`, and contains:
  - PHP 8.5.11;
  - the snapshot with its dev dependencies (PHPUnit, Pest, Mockery, Orchestra Testbench).

  It is pushed to GHCR, tagged with the Pin and the lockfile hash. Only the Oracle job may push it, and only the Oracle, dashboard and release jobs get write scopes. Oracle secrets stay scoped to the Oracle job. Every workflow defaults to `permissions: contents: read`.
- **Inventory record.** The Inventory is `conformance/inventory/<component>.jsonl`. Each line has the fields `id`, `component`, `kind` (unit or integration), `backends`, `source`, `hash`, `assertions` (a multiset of executed PHPUnit assertion kinds) and `oracle` (pass, skip or fail per Backend Variant).
  - `hash` covers the test method body, normalised for whitespace and comments, plus the dataset values. FR-7 uses it to detect "changed" tests.
  - The `upstream-skip` check later relies on `oracle`, and the FR-113 assertion floor relies on `assertions`.
- **Backends and Variants.**
  - `backends` comes from `#[RequiresDatabase]`, the `tests/Integration/Database/<Engine>` directories, `InteractsWithRedis` and the queue-driver suites. Everything else is `none`.
  - Variants are a closed vocabulary in `conformance/variants`: `none`, `sqlite`, `pgsql`, `redis` and `<driver>@<backend>` (for example `queue-database@pgsql`). Tests never declare a Variant; it always comes from the Inventory.
  - The baseline run uses SQLite, Postgres 18 and Redis 8.10.2 services.
- **Component map.** `conformance/component-map` (Protected) maps every Upstream test file to exactly one Component. An unmapped or doubly mapped file fails validation. It includes the anatomy-research hand remaps listed in Story 2.3, such as Collections ← `SupportArrTest`, and Foundation (deferred) ← `tests/Foundation/Cloud/**` tagged `deferred:foundation-cloud`. It also records, for each Component, the FQCN namespaces and container aliases it owns, which `BlockedByComponentError` uses. All `laravel/ai` entries are Component `ai`, and their Expectations default to `deferred:ai-sdk` (set in Epic 5).
- **Pin bump.** `bun run pin:bump <tag>`:
  - reports added, changed (same ID, different `hash`) and removed IDs;
  - resets changed IDs' Expectations to `skip` / `not-ported-yet`, keeping a link to the previous Ported Test;
  - treats a new ID with an unchanged hash as a rename, which inherits the old status and history while the old ID is retired;
  - retires removed IDs;
  - writes added and changed IDs as backlog Story stubs, grouped by Component.
- **Data files.** JSONL, UTF-8, LF line endings, sorted, one record per line. Encode framework values with `jsonEncode`, not `JSON.stringify`.
- **Stack.** Bun 1.4.3 (`.bun-version`; engines `>=1.4`), TypeScript 7.0.2 with `tsc --strict`, and oxlint 1.88.0 with oxlint-tsgolint 7.0.2004. The Oracle uses PHP 8.5.11. CI uses PostgreSQL 18 and Redis 8.10.2 (7.2 is the minimum supported). Never use Node, npm, pnpm, Jest, Vitest, ESLint or Prettier.

## Cross-Story Dependencies

- Story 2.1's snapshot feeds everything else. Story 2.2's image needs it, and Stories 2.4 and 2.5 need both. Story 2.3's map supplies the `component` field for Stories 2.4 and 2.5. Story 2.6 adds `assertions` and `oracle` to the Inventory entries from Stories 2.4 and 2.5. Story 2.7 verifies the output of Stories 2.4 to 2.6. Story 2.8 needs the Inventory `hash`, and it edits Expectations, which exist only once Epic 5 lands.
- From Epic 1: Story 1.2's scaffolder needed Upstream `composer.json` data, which now comes from the snapshot. The protected-paths, ownership and escalation checks from Epic 1 govern every PR here.
- Later epics:
  - Epic 3 uses the image and snapshot for request extraction, signed fixtures, API-surface export and Upstream scans.
  - Epic 4's matcher coverage report uses the assertion kinds.
  - Epic 5's Expectations, Variants, Skip Reason rules and Ratchet are keyed on the Inventory, and the nightly Oracle determinism re-check runs under AD-28.
  - Sprint planning resolves Phase 1–8 Story selectors to exact Test IDs using this Inventory.
