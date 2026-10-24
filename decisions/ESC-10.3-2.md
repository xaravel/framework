---
decision: approved
decided_by: Maintainer
date: 2026-10-24
escalation_sha256: "adbbf439ff173df5c297b170ccb441f764dd3954ae43ce801f904d0ad159f340"
fidelity_waiver:
  subject: "epic-10-item-6-structural-thenables"
  items: [F-7]
---

# ESC-10.3-2: approved, option 1 (a structural type stands for the thenable its header names)

Option 1 is approved. Option 2, leaving the gap until each implementing package registers its class, is not taken. It would leave Story 10.2's `QueueingDispatcher.batch` and Story 10.3's `Console\Kernel.queue` without their `thenable` lines, and lint blind to an unawaited `kernel.queue(...)`, for several Epics.

## The rule

- **Which types count.** A type that resolves to `packages/contracts/src/structural/<Name>.ts` is that file's FQCN when both hold:
  - the file exports `<Name>`;
  - its first line is `// <FQCN>, …` or `// <FQCN> …`, with `<FQCN>` a class name.

  That FQCN is then matched against the thenable list like any registered class. A structural type is a type with no runtime value (AD-1.2), so this is the only way to name its Upstream class. `registerClass` and contract tokens still win for the same name.
- **Where the change goes.** It belongs in the shared resolver, `registeredFqcn` in `tools/lint-rules/thenables.ts`. So the async-surface tool and lint's `xaravel/no-async-thenable-return` rule both gain it.
- **Expected results:**
  - `Console\Kernel.queue` gets `{"method":"Kernel.queue","file":"src/console/Kernel.ts","thenable":"Illuminate\\Foundation\\Bus\\PendingDispatch"}`.
  - `Bus\QueueingDispatcher.batch` gets its `Illuminate\Bus\PendingBatch` line.
- **Out of scope.** The Escalation's third case, `SupportsPartialRelations::getOneOfManySubQuery()` returning the `Database\Eloquent\Builder` contract token, is not covered: that token is an interface, not the thenable class. The `@xaravel/database` port answers it when it registers `Illuminate\Database\Eloquent\Builder`.

## The route

The change is action item **`epic-10-item-6-structural-thenables`**, owner orchestrator, on the item route of the MAINT-2026-10-16 amendment of 2026-10-22, with its Fidelity Review in `--item` mode. A tool change alone would make `async-surface --all --check` and XT-contracts-5 and -8 fail, so the item does all of this in one change:
- the resolver change and its tests;
- the regenerated `packages/contracts/async-surface.json`;
- XT-contracts-5 (Story 10.2) and XT-contracts-8 (Story 10.3) asserting the two new lines. No assertion is removed or weakened.

**An exception for this item only, as for `epic-10-item-4-async-surface` (ESC-10.2-2, route amended).**
- This ruling approves the `tools/lint-rules/thenables.ts` change and its tests as part of the item. The amendment's "Outside the scope" rule does not apply to it, because the resolver, the generated file and the tests that read it cannot land apart.
- The item's `--item` Fidelity Review covers its `packages/contracts` changes.
- The tool change gets the other review layers, and merges under the first amendment like any orchestrator Infrastructure change.

Story 10.3 resumes after the item is done.

## Waiver and clarification (2026-10-24, after #367)

- **F-7 is waived for `epic-10-item-6-structural-thenables`** (`decisions/MAINT-2026-10-23-fidelity-waivers.md`).
  - The item's `--item` Fidelity Review had reviewer 2 pass every item and reviewer 1 reject F-7 only.
  - The reject was for the `contracts.jsonl` rows, Upstream sources and contract files that XT-contracts-5 and -8 read, which the prompt does not carry. That is the evidence gap waived for Story 10.2 (ESC-10.2-9, ESC-10.2-10).
  - A fail on any other item still blocks.
- **A structural file's own methods get no `thenable` line.** An example is `PendingDispatch.onQueue()` returning `this`. The narrowing the item made is confirmed:
  - a structural type is a contract's subset of an Upstream class (AD-1.2);
  - that class's own surface, `then()` included, belongs to the port that registers it (`@xaravel/foundation`, `@xaravel/bus`);
  - only a contract method that returns a structural thenable gets a line.
