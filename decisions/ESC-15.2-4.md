---
decision: approved
decided_by: Maintainer
date: 2026-10-30
escalation_sha256: "c02dd87a430068840d3d21871406657502ca35ba3919ca517e0854e48986e647"
---

# ESC-15.2-4: approved, option 1 (`@xaravel/config` owns PhpOption and ResultType)

The Maintainer approved option 1 on 2026-10-30, in the Maintainer's session, on the orchestrator's and the monitor's recommendation.

- `@xaravel/config` owns `phpoption/phpoption` 1.10.0 (`PhpOption\Option`, `Some`, `None`, `LazyOption`) and `graham-campbell/result-type` 1.2.0 (`GrahamCampbell\ResultType\Result`, `Success`, `Error`) beside `vlucas/phpdotenv`, under AD-22's rule for a library not in its table (the earliest-Phase package that requires it: phpdotenv requires both, and config is Phase 1). Each is ported in full, registered under its FQCN, and exported from `@xaravel/config`'s root entry, with no new subpath. That is Story 15.2's own work, in `packages/config`.
- Story 20.2 (Support's `env()` and `Env`) gains a named acceptance criterion in `epics.md`: `@xaravel/support` declares a dependency on `@xaravel/config` for `Dotenv\Repository\RepositoryBuilder` and `PhpOption\Option`, although illuminate/support's composer.json does not require illuminate/config, as AD-22's "below every consumer" case. The scaffold's `uses` field (ESC-15.1-1) accepts only a package reachable through the row's own requires, so that edge gets its own Infrastructure ruling before Story 20.2.
