---
test_ids:
  - XT-config-3
  - XT-config-4
trigger: contract
proposed: >-
  Option 1 (recommended): `@xaravel/config` owns `phpoption/phpoption`
  1.10.0 (`PhpOption\Option`, `Some`, `None`, `LazyOption`) and
  `graham-campbell/result-type` 1.2.0 (`GrahamCampbell\ResultType\Result`,
  `Success`, `Error`) beside `vlucas/phpdotenv`, under AD-22's rule for a
  library not in the table ("the earliest-Phase package that requires it":
  phpdotenv requires both, and config is Phase 1). Each is ported in full,
  registered under its FQCN, and exported from `@xaravel/config`'s root
  entry, with no new subpath. The ruling also adds a named AC to Story
  20.2 (Support's `env()` and `Env`): `@xaravel/support` declares a
  dependency on `@xaravel/config` for `Dotenv\Repository\RepositoryBuilder`
  and `PhpOption\Option`, though illuminate/support's composer.json does
  not require illuminate/config, recorded as AD-22's "below every
  consumer" case. Option 2: a separate neutral package (for example
  `@xaravel/option`) owns PhpOption and ResultType below both config and
  support. It needs a new package (tools/scaffold, Protected) and an AD-22
  table row.
evidence: >-
  vlucas/phpdotenv v5.7.0 composer.json requires
  `graham-campbell/result-type ^1.2` and `phpoption/phpoption ^1.10`, and
  every parser, loader, store and adapter class uses them (for example
  Parser/EntryParser.php imports Result, Success, Error, Some and None).
  The Oracle lock pins them at result-type v1.2.0 (composer.lock:586) and
  phpoption 1.10.0 (:2196). AD-22 (ARCHITECTURE-SPINE.md:446-470) names
  `@xaravel/config` the phpdotenv owner but has no row for either
  library; a library not in the table goes to the earliest-Phase package
  that requires it, "and it must sit below every consumer in the graph. If
  that isn't possible, the case goes to an Escalation."
  conformance/upstream/framework/src/Illuminate/Support/Env.php (Epic 20)
  uses `PhpOption\Option` and `Dotenv\Repository\RepositoryBuilder`, but
  illuminate/support's composer.json (conformance/upstream/framework/src/Illuminate/Support/composer.json:16-30)
  does not require illuminate/config, and AD-2.4 fails a static import of
  a package the composer edges do not list.
---

# ESC-15.2-4: who owns PhpOption and ResultType

phpdotenv is built on `PhpOption` and `GrahamCampbell\ResultType`, and AD-22's table has no row for either. Its fallback rule gives them to `@xaravel/config`, but Support's `Env` (Epic 20) uses `PhpOption\Option` and phpdotenv's `RepositoryBuilder`, and illuminate/support's composer edges do not reach config. Option 1 keeps them in config and adds a named AC to Story 20.2 for the support → config edge. Option 2 creates a neutral package below both.
