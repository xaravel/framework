---
test_ids:
  - XT-conformance-156
trigger: open-question
proposed: >-
  Workaround, as AD-5 already decides: `@xaravel/runtime/scope` wraps every
  async-generator response body and every `type: "direct"` stream body created
  inside a frame with `AsyncLocalStorage.snapshot()` / `AsyncLocalStorage.bind`.
  For an async generator the snapshot, taken in the frame, wraps each `next()`
  and `return()` of the iterator Bun pulls, because the body runs inside
  `next()`; binding the generator function alone does not help. For a
  `type: "direct"` stream, `pull` is bound. No `deferred:` item, no skip and
  no new divergence.
evidence: >-
  `bun run probes:run` on Bun 1.4.3 (conformance/probes/probes.ts), inside
  `als.run(frame, ...)` in a `Bun.serve` fetch:
  `als.async-generator: unsupported: the store in the async generator body
  after an await is undefined, not the frame; an AsyncLocalStorage.snapshot()
  taken in the frame around each next() restores the frame: yes` and
  `als.direct-stream: unsupported: the store in the type: "direct" pull is
  undefined, not the frame; AsyncLocalStorage.bind on pull restores the frame:
  yes`. The same run reports `als.await`, `als.timers` and `als.stream-body`
  supported: the store survives an await, a setTimeout callback and a
  ReadableStream `pull` after an await.
---

# ESC-8.3-1: `AsyncLocalStorage` loses the frame in async-generator and `type: "direct"` bodies

Covers the probes `als.async-generator` and `als.direct-stream` (Story 8.3, OQ-11).

On Bun 1.4.3, a response body that is an async generator, or a `ReadableStream` of `type: "direct"`, runs without the store of the `als.run` frame that created it. Both are the cases the PRD's OQ-11 already names ("`AsyncLocalStorage` is lost in async-generator and `type: "direct"` stream bodies"), and AD-5 already decides the fix: the scope primitive wraps them with `AsyncLocalStorage.bind` / `snapshot`. The probe confirms that the fix works on 1.4.3, and records one detail the implementation needs: the snapshot must wrap the iterator's `next()`, not the generator function.

For the Maintainer's information, not a change this Escalation asks for: AD-5 also lists plain stream bodies and timers as cases where Bun drops the store. On Bun 1.4.3 the probes `als.timers` and `als.stream-body` keep the frame. Wrapping them as AD-5 says stays harmless; if a later Bun bump makes `als.async-generator` or `als.direct-stream` supported, `probes:check` fails and the record and this Escalation are revisited.
