---
decision: approved
decided_by: Maintainer
date: 2026-10-27
escalation_sha256: "9270a5d9e662581bb9269c5dbc86ca2ce77fda564d9eb8afa637e68592e13859"
---

# ESC-14.6-7: approved, a runtime offset-reference seam, without PHP's notice (DIV-9.17)

The Maintainer ruled on 2026-10-27, in the Maintainer's session, on the monitor's recommendation. The route is in `decisions/MAINT-2026-10-27-story-14-6-third.md`.

`@xaravel/runtime` publishes a seam that takes a reference to an `ArrayAccess` object's offset and writes through it as PHP does:

- the builtin `ArrayObject`, and a subclass that keeps its `offsetGet`, writes through to the object, keeping its handle;
- an object whose `offsetGet` is userland (every Laravel `ArrayAccess` class: none declares `&offsetGet`) writes nothing, and the caller's result is PHP's;
- PHP's notice `Indirect modification of overloaded element of <class> has no effect` is not raised, because the runtime has no PHP error reporting yet. DIV-9.17 records this, and closes when the runtime gains it.

XT-runtime cases compare it with the pinned PHP probe in the Escalation: a builtin root, an overriding subclass, a root leaf and the null-key cases. `Arr.push`, and `Arr.set` keeping an `ArrayAccess` root's handle, stay Story 14.6's own work in `packages/collections`, through this seam. This is action item `epic-14-item-14-runtime-arrayaccess-offset-reference`.
