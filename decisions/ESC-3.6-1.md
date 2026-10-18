---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-18
escalation_sha256: "7191e66f21ab1d65b036ab8509d9e3d8fd5d5585dbb61dac58a19c70872b59a1"
---

# ESC-3.6-1: approved, option 1 (amend the class and boot-reachability rules)

Story 3.6 is rebuilt from the saved attempt (`_bmad-output/implementation-artifacts/spec-3-6-attempt.patch`) with both static rules amended exactly as the Escalation's `proposed` text states:

- **Singleton `class` inference.** A closure builds X when every return expression at its own depth is `new X(...)`; `(new X(...))` followed by a `->m(...)` chain where each m is declared in X's indexed hierarchy and its body ends `return $this;`; `tap(new X(...), ...)`; or `$v`, when the closure's only assignment to `$v` at its own depth is `new X(...)`. A one-argument `singleton(X::class)` gives `class` only when X is a non-abstract indexed class. Every other shape stays null, stays listed in `bindings`, and is printed by the run for review.
- **Boot-reachability.** Only calls at the top level of a provider's `register()` / `boot()` count, plus provider methods reached from those by top-level `$this->m(`. Calls inside closures (rebinding, resolving, booted and listener callbacks) do not count. In C's methods, writes inside a nested closure are runtime writes. Writes include pre-increment and pre-decrement, list or array destructuring, `&`, the by-reference built-ins the Escalation lists applied to `$this->P`, and `ClassName::$P` / `parent::$P` for ClassName in C's analysed set. Method names compare case-insensitively; self-calls do not block reachability; a helper called only from `__construct` counts as construction.
- **CI.** `scans.test.ts` runs in the ci.yml `upstream` job after the sync, so the real-snapshot assertions run in CI.

The Story spec's intent contract (Boundaries) is amended in place to these rules when the Story is rebuilt.

Rationale:

- **It restores what the AC and AD-5 ask for.** The AC asks for every class bound with `singleton()`; the narrow rule left out Translator, Redirector, CookieJar and the Event Dispatcher, which AD-5 names as state the singleton lint must catch. The broad rule listed `UrlGenerator::$request`, which AD-5 names as per-unit frame state, as boot-only, so the AD-5 guard would throw on a legitimate per-request write.
- **It stays static.** Option 2 would move the scan into the Oracle image and still could not answer the boot-only question; the epic wants contributors to need neither Docker nor PHP. Option 3 contradicts AD-5 and `--check`'s ban on hand edits.
- **Unresolved bindings stay visible.** Bindings the rule cannot classify stay null and are printed, so nothing is silently dropped.
- **The grader is not weakened.** No Upstream assertion is removed, no expected value weakened, no skip added and no `adapted:` marker introduced. Running `scans.test.ts` in CI strengthens the check.
- **No planning document changes and no run-time cost.** The spine, the SPEC and `epics.md` stay as they are. The scans run at build time only.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or make Xaravel slower or less faithful to Laravel on Bun.
