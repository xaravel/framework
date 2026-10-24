---
test_ids:
  - XT-contracts-8
trigger: protected-path
proposed: >-
  Option 1 (recommended): the async-surface tool (`tools/async-surface/`,
  a Protected Path) also counts a structural type whose header comment
  names a thenable FQCN as that thenable: a type name that resolves to a
  `packages/contracts/src/structural/<Name>.ts` whose first line is
  `// <FQCN>, …` with `<FQCN>` on the thenable list. Then
  `Console\Kernel.queue` gets the line
  `{"method":"Kernel.queue","file":"src/console/Kernel.ts","thenable":"Illuminate\\Foundation\\Bus\\PendingDispatch"}`,
  and Story 10.2's `Bus\QueueingDispatcher.batch` (structural
  `PendingBatch`) gets its missing one too. XT-contracts-8 then asserts
  the line instead of checking the return type. Option 2: leave the tool
  as it is and amend the Story 10.3 spec's matrix row: a contract method
  that returns a structural thenable has no `thenable` line until the
  implementing package's class, registered under the FQCN, declares it.
evidence: >-
  The Story 10.3 spec's async matrix row says "`Console\Kernel.queue` has
  a `thenable` line", and its Design Notes say `queue` "returns a
  thenable `PendingDispatch`, so it gets a `thenable` line and no tag".
  The contract returns the structural `PendingDispatch`
  (`packages/contracts/src/structural/PendingDispatch.ts`, AD-1.2), which
  is a type with no runtime value. The async-surface tool reports a
  thenable only when the return type "resolves ... to the FQCN a source
  module registers with `registerClass`", or a contract token
  (`tools/async-surface/async-surface.ts` header, `registeredFqcn` in
  `tools/lint-rules/thenables.ts`). A structural type can be neither: a
  `registerClass` needs a class, and a `contract()` token under
  `Illuminate\Foundation\Bus\PendingDispatch` would be a fake token for a
  class (ESC-10.1-3) and an `extra` class in the API-surface diff, which
  XT-contracts-9 forbids. So `bun run async-surface contracts` writes no
  line for `Kernel.queue`, as it writes none for Story 10.2's
  `QueueingDispatcher.batch`, which returns the structural `PendingBatch`
  (`Illuminate\Bus\PendingBatch`, also on the thenable list). The same
  gap hides a third return: Upstream's
  `Database\Eloquent\SupportsPartialRelations::getOneOfManySubQuery()`
  returns `\Illuminate\Database\Eloquent\Builder`, which is on
  THENABLE_TYPES, while the port returns the empty
  `Database\Eloquent\Builder` contract token, a FQCN not on the list. And
  `tools/lint-rules/thenables.ts` (`registeredFqcn`) resolves types the
  same way, so lint's thenable rule (`xaravel/no-async-thenable-return`)
  misses an unawaited `kernel.queue(...)` too. The fix is in `tools/`, which a Story
  may not edit (AD-16).
---

# ESC-10.3-2: A contract method that returns a structural thenable gets no `thenable` line

`Console\Kernel::queue()` returns `Illuminate\Foundation\Bus\PendingDispatch`, which is on AD-6's thenable list. The contract ports it as the structural `PendingDispatch` (AD-1.2). The async-surface tool only recognises a thenable through a registered class or a contract token, so it writes no `thenable` line for `queue`, though the Story spec expects one. The same gap already exists for Story 10.2's `Bus\QueueingDispatcher::batch()`, hides `SupportsPartialRelations::getOneOfManySubQuery()`'s Eloquent builder (ported as the contract token), and lint's thenable rules share it.

The fix, Option 1, is in the async-surface tool, a Protected Path. Until it is ruled, XT-contracts-8 checks that `queue` is sync and returns the structural `PendingDispatch`, whose header names `Illuminate\Foundation\Bus\PendingDispatch`, and that no file of the 20 subpaths has a `thenable` line. This stops XT-contracts-8's `thenable` row only. The rest of the Story is built and verified.
