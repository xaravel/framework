---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "b34fb40c298570017bf14fd2b9575197c122d359b83204d7884e3954f79357cd"
---

# ESC-10.2-2: approved, option 1 (keep `Pipeline::then()`; a Pipeline is a declared thenable)

Option 1 is approved. Option 2, renaming the method under a new DIV-12 pair, is not taken. It would add a divergence, and Xaravel already has thenables by design (Builders, `Pending*`).

## The change

- **The name.** `Illuminate\Contracts\Pipeline\Pipeline` keeps Upstream's `then(destination)`.
- **The thenable list.** The interface and its implementation `Illuminate\Pipeline\Pipeline` join the thenable type list that `tools/async-surface/` reads today and Story 10.5 moves into `@xaravel/contracts/async`. So `send()`, `through()` and `via()` get `thenable` lines in `async-surface.json`, and lint's `await-thenable` and `return-await` rules see a Pipeline as a thenable.
- **The contract.** It declares both `then` overloads: `then(destination)` and the `PromiseLike` form `then(onFulfilled, onRejected)`.
- **Implementations.**
  - They declare `implements PromiseLike` (ESC-6.1-1).
  - When awaited, so called with a resolve function rather than a pipeline destination, a pipeline runs with an identity destination and settles with its result: `await pipeline.send(x).through(p)` equals `await pipeline.send(x).through(p).then((v) => v)`.
  - That behaviour is the Pipeline Story's to build.

## The route

- **The list half** is action item **`epic-10-item-4-async-surface`** (owner orchestrator), an approved Infrastructure change to `tools/async-surface/` with tests. It also carries ESC-10.2-6's tool half, if the tool checks a tag's reason.
- **The contract half** (the overloads and its `async-surface.json` lines) is Story 10.2's.

## Route amended (2026-10-23, after #351)

The tool change and the `packages/contracts/async-surface.json` lines it produces must land in one change, or CI's `async-surface --all --check` fails on drift. A tools-only item cannot carry the package file, and Story 10.2's branch cannot carry `tools/`. So action item `epic-10-item-4-async-surface` now also names `packages/contracts`:
- It goes on the retro-item route of the MAINT-2026-10-16 amendment of 2026-10-22, with its `--item` Fidelity Review.
- Its only `packages/contracts` change is the regenerated `async-surface.json`.
- The contract's `then` overloads stay Story 10.2's.
- **An exception for this item only.** This ruling approves the `tools/async-surface/` change and its tests as part of the item. The amendment's "Outside the scope" rule does not apply to it, because the tool and its generated file cannot land apart. The Fidelity Review covers the item's `packages/contracts` change. The tool change gets the other review layers, and merges under the first amendment like any orchestrator Infrastructure change.
