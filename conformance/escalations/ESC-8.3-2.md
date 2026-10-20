---
test_ids:
  - XT-conformance-156
trigger: open-question
proposed: >-
  Workaround (recommended): the HTTP kernel catches every exception inside the
  request's frame, as Laravel's `Kernel::handle` does, and renders it there
  through the exception handler, so `Bun.serve`'s `error` callback is never
  the framework's exception path. As a last resort for an error that escapes
  the frame anyway, the frame's `AsyncLocalStorage.snapshot()` is attached to
  the error before it propagates, and the `error` callback runs its handling
  inside that snapshot. AD-5 does not list `Bun.serve` callbacks among the
  cases it wraps, so this needs the Maintainer's ruling; no `deferred:` item,
  skip or divergence is proposed.
evidence: >-
  `bun run probes:run` on Bun 1.4.3 (conformance/probes/probes.ts):
  `als.serve-callbacks: unsupported: two concurrent requests see their own
  frame after each await: /a [true,true,true], /b [true,true,true]; the
  error callback sees undefined; an AsyncLocalStorage.snapshot() taken in the
  frame and carried on the error restores the frame: yes`.
---

# ESC-8.3-2: `Bun.serve`'s `error` callback runs outside the request's frame

Covers the probe `als.serve-callbacks` (Story 8.3, OQ-11).

Two concurrent requests, each in its own `als.run` frame and interleaved across `await`s, each keep their own frame: that half of the probe passes. The other half fails: when a handler running in a frame throws, `Bun.serve` calls its `error` callback with `AsyncLocalStorage.getStore()` returning `undefined`, so any framework code reached from that callback (the exception handler, logging context, the current request) would resolve against the default Application instead of the request's frame (AD-5).

AD-5 decides the `bind` / `snapshot` workaround for stream bodies, async-generator bodies, `type: "direct"` streams and timers. It does not name the `error` callback, and the callback receives only the error, so a plain `bind` cannot know which frame to restore. The proposal keeps exception handling inside the frame, as Upstream's kernel already does, and carries a snapshot on the error only as a fallback. The probe shows the fallback restores the frame. Because the fix is outside AD-5's list, this Escalation stays open for the Maintainer.
