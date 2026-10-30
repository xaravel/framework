---
test_ids:
  - Illuminate\Tests\Config\RepositoryTest::testItIsMacroable
trigger: protected-path
proposed: >-
  Option 1 (recommended): an Infrastructure change lets a package list a
  workspace dependency its Upstream source uses directly but reaches only
  transitively, and lists `@xaravel/macroable` for `config`: `tools/scaffold`
  (`table.ts` or `packages.jsonl`) gains the edge with its reason
  ("Illuminate\Config\Repository uses Illuminate\Support\Traits\Macroable,
  reached through illuminate/collections' require"), `bun run scaffold`
  regenerates `packages/config/package.json` and `tsconfig.json`, and
  `bun.lock` is refreshed. The graph stays acyclic (macroable has no
  workspace edges) and every edge still traces to Upstream's composer graph.
  Story 15.1 then mixes Macroable into `Repository` and ports
  testItIsMacroable. Option 2: `@xaravel/collections` re-exports `Macroable`;
  this adds a member to collections' public surface that
  `Illuminate\Support\Collection`'s namespace does not have, and changes
  another Component from a Story.
evidence: >-
  conformance/upstream/framework/src/Illuminate/Config/Repository.php has
  `use Illuminate\Support\Traits\Macroable;` and `use Macroable;`, and
  RepositoryTest::testItIsMacroable calls `$this->repository->macro(...)`.
  Upstream Config/composer.json requires only illuminate/collections and
  illuminate/contracts; illuminate/collections requires illuminate/macroable.
  tools/scaffold/packages.jsonl row `config` has
  `"require":["illuminate/collections","illuminate/contracts"]`, and
  tools/scaffold/scaffold.ts:67-116 derives `dependencies` from that list
  only, so `scaffold:check` and bun.lock (packages/config lists collections,
  contracts and runtime) both reject a hand-added `@xaravel/macroable`.
  AD-2's CI check fails a static import of a package not in `dependencies`
  (tools/graph/graph.ts). `tools/` and `/bun.lock` are Protected Paths, and
  a Story from Epic 9 on may edit only `packages/config/**`.
---

# ESC-15.1-1: `@xaravel/config` cannot import Macroable

Upstream's `Repository` uses the `Macroable` trait, but `illuminate/config` reaches `illuminate/macroable` only through `illuminate/collections`, and the scaffold derives each package's `dependencies` from its own composer `require`. Listing `@xaravel/macroable` for `config` therefore needs a Protected change to `tools/scaffold` and `bun.lock`. Option 1 makes that change for a directly used, transitively required Upstream edge; Option 2 re-exports `Macroable` from collections. Only `testItIsMacroable` waits on this; the other 32 Repository Test IDs do not use Macroable.
