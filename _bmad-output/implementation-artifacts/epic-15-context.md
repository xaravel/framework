# Epic 15 Context: Config & environment

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Port Laravel's `illuminate/config` Repository as `@xaravel/config`, so App Developers read configuration exactly as in Laravel: dot-notation `get`, `set`, `push` and `prepend`, plus typed getters. The Epic also ports phpdotenv's `.env` grammar, so the same `.env` file gives the same values in Xaravel and in PHP Laravel. Bun's built-in `.env` autoload is switched off, so only Xaravel's loader ever reads env files. This is a Phase 1 core Component. Foundation bootstrap, the `env()` helper and `config:cache` all build on it later.

## Stories

- Story 15.1: Config Repository
- Story 15.2: phpdotenv grammar port
- Story 15.3: Bun's `.env` autoload neutralised

## Requirements & Constraints

- **Scope boundaries.** This Epic owns the Repository and the env parser. Do not build these here:
  - `env()` / `Env`, a Support helper (Epic 20);
  - which env file loads (`.env.<APP_ENV>`) and its precedence, Foundation bootstrap (Epic 51);
  - `config:cache` and the `{ "$class": "<FQCN>" }` rehydration form (Epic 55).
- **Repository (15.1).**
  - Every Test ID in `tests/Config/RepositoryTest.php` passes, or carries a valid Skip Reason other than `not-ported-yet`. The tests cover typed getters and their exceptions, `ArrayAccess` and `Macroable`.
  - A config value holding a class or an FQCN string is returned exactly as stored (XT-config-2).
- **Runtime config writes are frame-scoped (XT-config-1).**
  - Every write (`set`, `push`, `prepend`, `offsetSet`, `offsetUnset`) goes to the frame overlay over the constructor's base items. Reads fall back from the overlay to the base.
  - A write in one unit is invisible to a concurrent unit (prove it with `interleave`). A write with no active frame throws `ScopeFrameException`.
  - The sealed-Application form (`config([...])` on a sealed app) and the pre-sealed base write wait for the Story that adds the `sealed` state. Do not simulate an Application here.
- **phpdotenv grammar (15.2).** The parser matches Oracle fixtures from phpdotenv at the Pin, for both parsed values and error messages. The fixtures cover:
  - unquoted, single-quoted and double-quoted values, and escape sequences;
  - `${VAR}` interpolation, including nested and undefined variables;
  - multiline quoted values and `export` prefixes;
  - comments, empty values, whitespace and invalid lines.
- **Repository modes (15.2).** Immutable and mutable modes follow phpdotenv's precedence: real environment variables win by default (XT-config-4).
- **Oracle inputs.** phpdotenv is outside the Test Inventory, so Oracle Differential Xaravel Tests grade it. Their inputs go in `conformance/oracle-requests/<story-id>.jsonl`.
- **Bun autoload off (15.3).**
  - Fixture app with `.env`, `.env.local` and `.env.production`. Run an entry script with the root or Skeleton `bunfig.toml` (`env = false`) and `--no-env-file`.
  - `process.env` holds none of those files' values until Xaravel's loader runs.
  - The entry-script lint fails any entry script that lacks `--no-env-file`.
- **Epic close (in 15.3).**
  - `bun run api-surface:gate config` passes with zero unexplained members.
  - The package docs mirror Laravel's config page and have a Divergences section.
  - Every public API has a docblock, and `async-surface.json` is present.
  - The README records why each phpdotenv-related dependency exists. Dependency policy: a Bun built-in first, then a maintained npm package, then our own code.
  - `LICENSE` keeps Laravel's MIT notice.
  - Any `blocked-by:config` lines elsewhere are re-verified.
- **Xaravel Tests.** Use `xaravelTest('XT-config-<n>', ...)` with the IDs each manifest assigns: 1..2 for 15.1, 3..4 for 15.2, 5..7 for 15.3. Declare `config` consequence ids (FR-20, AD-2, AD-6) where tested. Citing another Component's ids is allowed.

## Technical Decisions

- **Ownership.**
  - `@xaravel/config` owns the full ports of `vlucas/phpdotenv`, `phpoption/phpoption` 1.10.0 (`Option`, `Some`, `None`, `LazyOption`) and `graham-campbell/result-type` 1.2.0 (`Result`, `Success`, `Error`).
  - Each class is registered under its original FQCN and exported from the package root entry, with no new subpath. A CI scan rejects duplicate FQCNs.
  - Package edges mirror Upstream `composer.json`. `config` also declares `@xaravel/macroable` through the scaffold's `uses` field, because Repository uses Macroable. Any other missing edge or primitive is a `contract` Escalation, not an edit to another package.
- **PHP builtins come from `@xaravel/runtime/php`.** Never re-implement them in config. The runtime provides:
  - the string, ctype, mb, `filter_var` and `class_exists` functions phpdotenv needs;
  - `preg_*`, with patterns converted by PORTING.md's PCRE rule. That rule covers the `A` modifier as sticky `y`, branch-reset emulation, byte matching without `u`, and PCRE2 `\s` with `u`;
  - `getenv` / `putenv` over `process.env`;
  - `$_SERVER` / `$_ENV` superglobals, seeded once at module load as boot-time process state. They are not frame slots;
  - a sync `file_get_contents`, which returns `false` on a missing file;
  - `DIRECTORY_SEPARATOR`, `array_reduce` and `EmptyIterator`.

  phpdotenv's Server/Env/Putenv adapters and its file `Reader` port line for line over these. A builtin that is still missing is a `contract` Escalation.
- **Sync only.** Config is not an async root. The Repository, the parser and the env-file read stay sync, and never return `T | Promise<T>`.
- **Frame state.** Per-request state never goes in singleton fields or module variables. Inside a test frame, a write lands in the nearest enclosing test frame.
- **PHP value model.**
  - `null` is the only absent value.
  - A list is a JS `Array`, a string-keyed map is a plain object, and any other array is a `PhpArray`.
  - Use `jsonEncode` / `phpSerialize`, never `JSON.stringify`. Loose comparison and key normalisation come from the runtime.
  - Notices and warnings that PHP builtins raise are not raised.
- **PHP constructs.**
  - `ArrayAccess` maps to `offsetGet` / `offsetSet` / `offsetExists` / `offsetUnset`. In tests, an index read `$x[k]` becomes `x.offsetGet(k)`, marked DIV-12.6, with assertions unchanged.
  - Macroable comes from `@xaravel/macroable` through `mixin`.
  - Each exception is a same-named `Error` subclass with Upstream's message.
- **Layout and identity.** Files are `src/<Upstream sub-path>/<ClassName>.ts`, one public class per file, named exports only. Each file ends with `registerClass('<FQCN>', X)`, and identity uses `fqcn()`.
- **Env loading.** Bun's autoload is off: `env = false` at the top level of the root and Skeleton `bunfig.toml`, plus `--no-env-file` in every entry script. The root `bunfig.toml` and `tools/` are Protected Paths, so changing them needs an Escalation.
- **Tests.** Ported Tests use only `portedTest(...)` and `@xaravel/assert`. Mark each changed assertion `// adapted:DIV-<n>.<k>` with an existing clause. A new or changed divergence is an Escalation.

## Cross-Story Dependencies

- All three Stories share `packages/config`, and the Epic-close gate is in 15.3. 15.1 and 15.2 are done, so 15.3 builds on both.
- Upstream Epics are used as they are: Runtime (9), Contracts (10), Macroable (11) and Collections (14). Mark a test `blocked-by:<c>` only when it needs a later Component and the harness raises `BlockedByComponentError`.
- Later consumers:
  - Support's `Env` (Story 20.2) imports `RepositoryBuilder` and `PhpOption\Option` from `@xaravel/config`. Its scaffold edge needs its own Infrastructure ruling first.
  - The Story that adds the Application `sealed` state (17.4 or 51.1) adds config's pre-sealed base write and XT-config-1's full wording.
  - Foundation bootstrap (Epic 51) selects env files. `config:cache` (Epic 55) handles `$class`. Testbench's `WithConfig` / `WithEnv` build on this Epic.
