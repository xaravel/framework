---
test_ids:
  - XT-macroable-2
trigger: contract
proposed: >-
  Option 1 (recommended): `@xaravel/runtime/scope` exposes the kinds of the
  active frame chain, for example `frameKinds(): readonly string[]`
  (innermost first, unit and narrow frames, origins not followed), or a
  predicate `insideFrameKind(kinds)`, made by a runtime Story or a
  retrospective action item, as the Maintainer routes it. Macroable then
  throws `ScopeFrameException` for a write anywhere under a `request`,
  `job` or `command` frame, and XT-macroable-2 gains the nested case.
  Option 2: the kernels that open `request`, `job` and `command` frames
  (Http, Queue, Console) set a runtime-declared slot that marks a
  base-only-write barrier, which children read through `frameSlot`; this
  spreads the rule over three later Components.
evidence: >-
  The Story spec's write routing says a write "inside a unit frame whose
  kind is `request`, `job` or `command`, or a child of one, throws
  `ScopeFrameException`" (DIV-11.2). `currentFrame()`
  (packages/runtime/src/scope/scope.ts:113-115) returns only the innermost
  frame's `{kind, app}`, so a `unit` frame nested in a `request` frame, or
  a narrow frame inside one, shows its own kind. No other export reads the
  parent chain's kinds: `frameSlot`, `frameOverlay` and `frameStatic` read
  values, and a value read through the chain is set only by code that owns
  the parent frame. Story 11.1 may not change `@xaravel/runtime`. So
  Macroable throws for the three kinds when they are the innermost frame,
  which XT-macroable-2 checks directly and under a `test` frame, and a
  write from a frame nested inside one is held by that nested unit and
  discarded when it ends, instead of throwing.
---

# ESC-11.1-3: a child frame of a request, job or command frame cannot be recognised

DIV-11.2 forbids macro registration inside a request, job or command, including in units nested inside one. The runtime exposes only the innermost frame's kind, so Macroable recognises those three kinds only when they are the innermost frame. Option 1 adds a read of the frame chain's kinds to `@xaravel/runtime/scope`; Option 2 has the kernels mark their frames with a slot. XT-macroable-2 covers the innermost case and passes; the nested case waits on this ruling.
