---
test_ids:
  - XT-contracts-5
trigger: contract
proposed: >-
  Option 1 (recommended): keep Upstream's name `then(destination)` and
  make the clash explicit and safe. `Illuminate\Contracts\Pipeline\Pipeline`
  joins the thenable type list that Story 10.5 moves into
  `@xaravel/contracts/async` (and the list `tools/async-surface/` reads
  today), so `send()`, `through()` and `via()` get `thenable` lines in
  `async-surface.json` and lint's `await-thenable` / `return-await` rules
  see a Pipeline as a thenable. Implementations declare `implements
  PromiseLike` (ESC-6.1-1) with a `then(onFulfilled, onRejected)` overload
  that, when called by `await` (a destination that is not a pipeline
  destination), runs the pipeline with an identity destination and settles
  with its result, so `await pipeline.send(x).through(p)` equals
  `await pipeline.send(x).through(p).then((v) => v)`. Option 2: rename the
  TypeScript method (for example `thenRun`) under a new DIV-12 pair, so a
  Pipeline is not a thenable; this is a new divergence.
evidence: >-
  `Illuminate\Contracts\Pipeline\Pipeline` declares `then(Closure
  $destination)`, so the port `packages/contracts/src/pipeline/Pipeline.ts`
  has `then(destination: Closure): Promise<unknown>`, and every Pipeline is
  structurally a JavaScript thenable. `send()`, `through()` and `via()`
  return `this`, so `await pipeline.send(x).through(p)` calls
  `then(resolve, reject)`: the pipeline runs with the Promise's `resolve`
  as its destination. AD-6 ("Thenables") requires each sync method that
  returns a thenable to carry a `thenable` line in `async-surface.json`
  and every class with `then` to declare `implements PromiseLike`
  (ESC-6.1-1), but the thenable type list has no Pipeline entry, and the
  contract cannot add one: the list is outside `packages/contracts/src/`
  until Story 10.5, and the behaviour of an awaited Pipeline is not
  Upstream's to copy. Raised by both Story 10.2 Fidelity reviewers (F-9)
  and two code reviewers.
---

# ESC-10.2-2: Upstream's `Pipeline::then()` makes every Pipeline a JavaScript thenable

`Illuminate\Contracts\Pipeline\Pipeline::then(Closure $destination)` keeps its name in the port, so any Pipeline is a thenable. Awaiting a half-built pipeline (`await pipeline.send(x).through(p)`) runs it with the Promise's `resolve` as the destination, and nothing in the async surface or lint knows a Pipeline is a thenable.

The recommended fix, Option 1, keeps the Upstream name, puts Pipeline on the thenable list so the tools and lint treat it as one, and fixes what awaiting one does. It touches the thenable list (Story 10.5's, today in `tools/async-surface/`) and decides a behaviour Upstream does not have, so it needs a ruling. This stops XT-contracts-5. The contract itself is ported with Upstream's `then()`.
