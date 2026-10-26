---
decision: approved
decided_by: Maintainer
date: 2026-10-26
escalation_sha256: "ecc846139c73c9379696f95d37dd3b1c30daac02dd0e676db892e7f1ed79e457"
---

# ESC-14.2-3: approved, option 1, Enumerable members that read a PHP value or the argument count keep only the positional form (DIV-12.20)

The Maintainer approved the orchestrator's recommended option on 2026-10-26, in the Maintainer's session, with the monitor's agreement. The route is in `decisions/MAINT-2026-10-26-story-14-2.md`.

`decisions/DIV-12.md` gains **DIV-12.20**, on DIV-12.13's reasoning. These members keep only the positional form, and a lone object argument is always the PHP value, as PHP reads it: `contains`, `doesntContain`, `doesntContainStrict`, `every`, `some`, `partition`, `where`, `firstWhere`, `hasSole`, `hasMany`, `sole`, `firstOrFail`, `first`, `last`, `when`, `unless`. `conformance/api-surface/exceptions.jsonl` exempts each of them from the options form on `Collection`, `LazyCollection`, `Enumerable` and `EnumeratesValues`, wherever Upstream gives the member two or more optional parameters. Option 2 would have left `contains({ a: 1 })` and `first(default)` ambiguous, and an options object hides the omitted arguments that `func_num_args()` reads.
