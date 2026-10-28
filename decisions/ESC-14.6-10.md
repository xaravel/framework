---
decision: rejected
decided_by: Maintainer
date: 2026-10-28
escalation_sha256: "0a45373883753cceffe62f6d4afe4f094fec7dcb1cbb2fe3a2ff78108c338ea2"
---

# ESC-14.6-10: rejected, no runtime reference-lifetime protocol; Arr's traversal references are ported by value

The Maintainer ruled on 2026-10-28, in the Maintainer's session, on the monitor's recommendation. The route is in `decisions/MAINT-2026-10-28-story-14-6-sixth.md`.

**The problem.** `Arr::set` and `Arr::push` walk the array with `$array = &$array[$key]`. PHP references are refcounted, so once the function returns no level stays shared, and a later copy is independent. The runtime's `Ref` cells never expire, so a `referenceAt`-based port leaves levels shared, and copying then changing the copy also changes the original (the Escalation's pinned matrix).

**Why not a lifetime protocol.** A release protocol for rebinding, return and exceptions would be a new AD-9-level mechanism in a garbage-collected runtime, and every by-reference port would have to follow it. These references never leave their function, so PHP's observable results do not depend on them surviving.

**The ruling.** PORTING.md's § By-reference parameters gains a construct rule: a reference assignment that only walks into a structure and never outlives its function takes no `Ref<T>` cell. The port walks the path by value and writes each level as PHP does, through `offsetAssign` and `offsetReference`, eagerly, so the writes PHP keeps before an error are kept. Results, caller values and errors match PHP, and no level stays shared after return. A reference that outlives its function keeps the `Ref<T>` rule. Collections ports `Arr.set` and `Arr.push` this way, in Story 14.6. The runtime does not change.
