---
decision: rejected
decided_by: Maintainer
date: 2026-10-27
escalation_sha256: "80ae021d74af7aaa2634ff8701f1e4e2777de3a625d9c871d5d0c8dc09338bd9"
---

# ESC-14.6-2: rejected, PHP DateTime is not added to the runtime now; the two Test IDs wait for the Dates epic

The Maintainer rejected the recommended option on 2026-10-27, in the Maintainer's session. The monitor disagreed with it, so under `decisions/MAINT-2026-10-26-runtime-builtins.md` it went to the Maintainer.

**Why not now.** Both tests construct `new DateTime` only to check that `Arr::accessible` and `Arr::arrayable` return `false` for it. PHP's `DateTime` is the base of Carbon. Dates are planned as a Support epic, the Carbon port built on Temporal (FR-25, PRD open question OQ-4). Where `DateTime` lives and how it behaves is that epic's decision. Building a runtime `DateTime` for these two assertions would pre-empt it, or ship a partial class.

**Route.** The two Test IDs become `blocked-by:support`. Support is Phase 2, a later Phase than collections, so the reason is valid. They port, unchanged, when the Dates epic provides `DateTime`. The Story changes their Expectations lines. `Arr::accessible` and `Arr::arrayable` are implemented now for every other case.
