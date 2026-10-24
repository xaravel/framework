---
decision: approved
decided_by: Maintainer
date: 2026-10-24
escalation_sha256: "a6393dd8f38b06ba8269a3d7cc8d4e31d298db27a1a09a582c99cf2aad403669"
---

# ESC-10.3-1: approved, option 1 (`View\Factory::make()` stays sync, and `render()` awaits the creators)

Option 1 is approved, with a new clause, **DIV-1.5**, in `decisions/DIV-1.md`.

- Option 2 is not taken. Making `make()` and `file()` async would change AD-11's `view(...)` and `{!! view(...) !!}` and the `view()` helper across the spine.
- Option 3 is not taken. Sync-only creators would diverge from Upstream more widely, since Upstream creators are ordinary event listeners and DIV-1 lets those be async.

## The rule

- **`make()` and `file()` stay sync.** `Illuminate\Contracts\View\Factory::make()` and `file()` return the View, as AD-11 assumes. They take no `@asyncRoot` tag and get no `async-surface.json` line.
- **Creators start at once and finish before render.**
  - When the `creating: <name>` event has listeners, the factory starts its dispatch at once, in Upstream's order.
  - The View keeps the dispatch.
  - `render()` awaits it before the composers and the template run.
- **What still holds:**
  - A creator runs before every composer and before the render.
  - An awaited render sees everything a creator set.
- **What differs (DIV-1.5):** data an async creator sets is not visible to code that reads the View synchronously between `make()` and `render()`. A Ported Test that does so awaits `render()` first, marked `adapted:DIV-1.5`.
- **This is the one seam this ruling covers.** AD-6's "async on any path is async on all paths" still applies everywhere else, and view loading stays sync as AD-6 lists it.

## The route

Story 10.3 already ports `View\Factory` in this shape. It resumes XT-contracts-8's `View\Factory` rows against DIV-1.5. Its `thenable` row waits on `epic-10-item-6-structural-thenables` (ESC-10.3-2).
