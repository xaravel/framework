# Epic 15 Context: Config & environment

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Port Laravel's `illuminate/config` Repository as `@xaravel/config`, so App Developers read configuration exactly as in Laravel: dot-notation `get`, `set`, `push` and `prepend`, plus typed getters. The Epic also ports phpdotenv's `.env` grammar, so the same `.env` file gives the same values in Xaravel and in PHP Laravel. Bun's built-in `.env` autoload is switched off, so only Xaravel's loader ever reads env files. This is a Phase 1 core Component. Foundation bootstrap, the `env()` helper and `config:cache` all build on it later.

## Stories

- Story 15.1: Config Repository
- Story 15.2: phpdotenv grammar port
- Story 15.3: Bun's `.env` autoload neutralised

## Requirements & Constraints

- **Scope boundaries.**
  - This Epic owns the Repository and the env parser.
  - `env()` itself is a Support helper (Epic 20).
  - Which env file loads (`.env.<APP_ENV>`) and its precedence is Foundation bootstrap (Epic 51).
  - `config:cache` is a Foundation command (Epic 55).
  - Do not build those here.
- **Repository (15.1).**
  - Every Test ID in `tests/Config/RepositoryTest.php` passes, or carries a valid Skip Reason other than `not-ported-yet`.
  - The tests cover typed getters and their exceptions, `ArrayAccess`, and `Macroable`.
- **Runtime config writes are frame-scoped.**
  - A `config([...])` write on a sealed Application inside a unit frame goes to that frame's overlay.
  - A concurrent unit still sees the base value. Prove this with `interleave` (XT-config-1).
- **Classes in config.** A config value that holds a class or an FQCN string is returned exactly as stored (XT-config-2). The `{ "$class": "<FQCN>" }` rehydration form belongs to `config:cache`, not here.
- **phpdotenv grammar (15.2).** The parser must match Oracle fixtures from phpdotenv at the Pin, both for parsed values and for error messages. The fixtures cover:
  - unquoted, single-quoted and double-quoted values, and escape sequences;
  - `${VAR}` interpolation, including nested and undefined variables;
  - multiline quoted values and `export` prefixes;
  - inline and full-line comments, empty values and whitespace;
  - invalid lines.
- **Repository modes (15.2).** Immutable and mutable modes follow phpdotenv's precedence: by default, real environment variables win.
- **Oracle inputs.** phpdotenv is outside the Test Inventory, so it is graded by Oracle Differential Xaravel Tests. Their inputs go in `conformance/oracle-requests/<story-id>.jsonl`.
- **Bun autoload off (15.3).**
  - Fixture app: `.env`, `.env.local` and `.env.production`. Run an entry script with the root or Skeleton `bunfig.toml` (`env = false`) and `--no-env-file`. `process.env` must hold none of those files' values until Xaravel's loader runs.
  - The entry-script lint fails an entry script that lacks `--no-env-file`.
- **Epic close (in 15.3).**
  - `bun run api-surface:gate config` passes with zero unexplained members.
  - The package docs mirror Laravel's config page and include a Divergences section.
  - Every public API has a docblock.
  - The README records the reason for any phpdotenv-related dependency (dependency policy: a Bun built-in first, then a maintained npm package, then our own code).
  - `async-surface.json` is present.
  - `LICENSE` keeps Laravel's MIT notice.
  - Any `blocked-by:config` lines elsewhere are re-verified.
- **Xaravel Tests.** Use `xaravelTest('XT-config-<n>', '<FR consequence>', fn)` with the IDs that each Story manifest assigns: XT-config-1..2 for 15.1, 3..4 for 15.2 and 5..7 for 15.3.

## Technical Decisions

- **Ownership.**
  - `@xaravel/config` is the single owner of the `vlucas/phpdotenv` port, and it registers phpdotenv symbols under their original FQCNs. A CI scan rejects duplicate FQCNs.
  - Package edges mirror Upstream `composer.json`. A missing edge or primitive in another package is a `contract` Escalation, not an edit to that package.
- **Sync only.** Config is explicitly not an async root. The Repository and the parser stay sync, and never return `T | Promise<T>`.
- **Frame state.**
  - Writes after `sealed` go to the innermost unit frame's overlay. Writes before `sealed` go to the Application's base. A write with no active frame throws `ScopeFrameException`.
  - Inside a test frame, a config write lands in the nearest enclosing test frame.
  - Never keep per-request state in singleton fields or module variables.
- **PHP value model.**
  - `null` is the only absent value; never return `undefined`.
  - Config arrays follow the PHP array model: a list is a JS `Array`, a string-keyed map is a plain object, and any other array is a `PhpArray`.
  - Use `jsonEncode` / `phpSerialize`, never `JSON.stringify`.
  - Loose comparison and key normalisation come from `@xaravel/runtime`. Never re-implement PHP builtins in the package.
- **PHP constructs.**
  - `ArrayAccess` maps to `offsetGet` / `offsetSet` / `offsetExists` / `offsetUnset`, and test index access is adapted under DIV-12.
  - Macroable comes from `@xaravel/macroable` through `mixin`.
  - Each exception is a same-named `Error` subclass with Upstream's message.
- **Layout and identity.**
  - Files are `src/<Upstream sub-path>/<ClassName>.ts`, one public class per file, named exports only.
  - Each class file ends with `registerClass('<FQCN>', X)`, and identity uses `fqcn()`.
- **Env loading.** Bun's `.env` autoload is off: `env = false` at the top level of the root and Skeleton `bunfig.toml`, plus `--no-env-file` in every entry script. Only Xaravel's phpdotenv-grammar loader reads env files. The root `bunfig.toml` is a Protected Path, so a change to it needs an Escalation.
- **Tests.**
  - Ported Tests use only `portedTest(...)` and `@xaravel/assert`.
  - Mark each changed assertion with `// adapted:DIV-<n>.<k>`, citing an existing clause. A new or changed divergence is an Escalation.
- **Builtin scan.** Before the first Story, run `bun run scan:builtins config` and raise every missing runtime builtin in one `contract` Escalation round.

## Cross-Story Dependencies

- 15.2 and 15.3 sit in the same package as 15.1, and the Epic-close gate is in 15.3.
- Upstream Epics are used as they are: Runtime (9), Contracts (10), Macroable (11) and Collections (14). If a test needs a later Component, mark it `blocked-by:<c>`, and only if the harness raises `BlockedByComponentError`.
- Later consumers:
  - Support's `env()` helper (Epic 20) reads through this parser and repository.
  - Foundation bootstrap (Epic 51) selects env files and applies precedence.
  - `config:cache` (Epic 55) handles `$class` rehydration.
  - Testbench's `WithConfig` / `WithEnv` hooks build on this Epic.
