---
decision: approved
decided_by: Maintainer
date: 2026-10-20
escalation_sha256: "17fe5666a8b4a63106e41c1f2d7bd6c2470a610155b22e0a5cb14d5e32fe743d"
---

# ESC-8.3-2: approved, exceptions are handled inside the request's frame

The HTTP kernel catches every exception inside the request's frame and renders it there through the exception handler, as Laravel's `Kernel::handle` does, so `Bun.serve`'s `error` callback is never the framework's exception path. An error that escapes the frame anyway carries the frame's `AsyncLocalStorage.snapshot()`, and the `error` callback handles it inside that snapshot (the probe showed this restores the frame). AD-5's list of cases it wraps now names the `error` callback. It matches Upstream's design and adds no cost on the request path.
