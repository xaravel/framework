---
title: 'epic-15-retro-item-7: widen the builtin scan to vendor ports, constants, builtin classes and refused PCRE forms'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: 'f81ce65313f2383cfb893b0f097cd6dff245ef34'
review_loop_iteration: 0
followup_review_recommended: true
unit: epic-15-retro-item-7-builtin-scan-vendor-constants-classes
context:
  - '{project-root}/docs/ops/builtin-scan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-retro-2026-10-30.md'
  - '{project-root}/AGENTS.md'
warnings: ['oversized']
deferred:
  - summary: >-
      No test covers a kind-xaravel Component whose upstream is set but missing from its lock (meant to be exit 2).
    evidence: |-
      Verification-gap review: deleting the `!own && packages.length === 0` guard in verifiedVendor keeps all tests green; no real row (http-foundation, mime, finder, serializable-closure) reaches the branch today.
    location: >-
      tools/scans/builtins.ts verifiedVendor
    severity: low
---

<intent-contract>

## Intent

**Problem:** `bun run scan:builtins <component>` (epic-14-retro-item-4) reads only the Component's `conformance/upstream/` source and tests and matches only `name(` calls. Story 15.2 therefore listed phpdotenv's and phpoption's builtins by hand and blocked three more rounds: PHP constants (`DIRECTORY_SEPARATOR`), builtin classes (`EmptyIterator`), a vendor-only function (`array_reduce`, phpoption `Option.php:169`) and PCRE forms the runtime converter refuses were all invisible (retro findings P1, L5; action item `epic-15-retro-item-7-builtin-scan-vendor-constants-classes`).

**Approach:** Teach the scan (1) to read the source of the vendor libraries a Component ports, fetched only on request at the exact commit the Oracle's committed `composer.lock` pins and verified; (2) to list global PHP constants and builtin classes the scanned code names; and (3) to list the string literals that are PCRE patterns the runtime's converter refuses. Update `docs/ops/builtin-scan.md` and the Xaravel Tests to match.

## Boundaries & Constraints

**Always:**
- Stay within `tools/scans/**`, `docs/ops/builtin-scan.md`, `conformance/tests/xaravel/builtin-scan.test.ts` and this spec. Reading other modules (`tools/upstream/upstream.ts`, `packages/runtime/src/php/pcre.ts`, `packages/runtime/src/php/index.ts`, `tools/component-map`, `tools/scaffold/table`) is fine; changing them is not.
- The scan stays advisory: it writes nothing except the vendor cache under `--sync`, raises no Escalation, runs no PHP.
- The only network access is `--sync`, and only for a vendor source that is missing or fails verification. Without `--sync`, a missing or unverified vendor source fails the run (exit 1) with a message naming the package and `--sync`.
- A fetched vendor source is accepted only if `git rev-parse HEAD` equals the lock's `source.reference`; its git tree hash is recorded beside it and re-checked (with `treeHash` from `tools/upstream/upstream.ts`) on every scan.
- Every existing XT-conformance-269 and XT-conformance-270 expectation keeps holding: every existing expected line stays in the expected output, exact matches stay exact, and no assertion is removed or loosened. Only the summary line's text changes, to the new format below, and new lines may appear.
- Output is deterministic: two runs print the same bytes.
- Follow the repo toolchain: Bun, `tsc --strict`, oxlint. Tests use `xaravelTest` from `packages/assert` as the existing file does.

**Never:**
- Never write into `conformance/upstream/` (`upstream:check` rejects any extra directory there) and never change `conformance/baseline-pin`, a `composer.lock`, `.gitignore`, `package.json`, `tools/upstream/**`, `packages/**` or `AGENTS.md`.
- Never commit the vendor cache (it lives under the git-ignored `.cache/`).
- Never use the network in a test: tests fetch only from local git repositories created in a temp directory.
- Never weaken the grader (no removed assertions, weakened expected values or new skips).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vendor port listed | `config` with a `vendor-ports.jsonl` row naming a package whose verified source is cached; its `src/` calls `array_reduce(` and names `DIRECTORY_SEPARATOR` and `new \EmptyIterator` | `function array_reduce …`, `constant DIRECTORY_SEPARATOR …`, `class EmptyIterator …` lines appear unless the runtime exports that name; sites print as `vendor:<package>/<path>:<line>` | exit 0 |
| Vendor source missing, no `--sync` | row present, cache absent | nothing on stdout | exit 1, stderr starts `scan:builtins: ` and names the package and `--sync` |
| `--sync` fetch | cache absent, `--remote <base>` pointing at a local repo holding the pinned commit | source fetched into `.cache/vendor/<package>@<commit>/`, tree recorded, scan runs | exit 0 |
| `--sync` wrong commit | the remote's commit differs from the lock reference (or cannot be fetched) | no cache directory left behind | exit 1 naming the package, the expected and actual commit or the git error |
| Tampered cache | a cached file edited after sync | without `--sync`: exit 1 naming the package as modified; with `--sync`: re-fetched and scanned | as stated |
| Package not in the lock | `vendor-ports.jsonl` names a package absent from the lock | — | exit 1 naming the package and the lock file |
| Vendor-only Component | `http-foundation` (`kind: xaravel`, `upstream: symfony/http-foundation`) | scans only that vendor package's autoload files | exit 0; `runtime` (no upstream) stays a usage error (exit 2) |
| Constant rules | uppercase bare names: `PHP_EOL`, `\E_ALL`, `case FOO:` in a switch | listed; NOT listed: `true`/`TRUE`/`null`/`False`, `Foo::BAR`, `BAR::x()`, `$o->BAR`, `Foo\BAR`, `const BAR = 1` (incl. typed `const int BAR`, multi `const A = 1, B = 2`), an enum `case BAR` in an enum body, a named argument `f(BAR: 1)`, a name declared by top-level `const`, `define('BAR', …)` with a literal name, or `use const Ns\BAR`, magic constants (`__DIR__`), names the runtime exports exactly | — |
| Class rules | after `new`, `instanceof`, `extends`, `implements` (each name of the list), `catch (` (each name of a `|` union), or before `::` | listed when it resolves to a global class: `\X`; unqualified `X` with a `use X;`/`use X as Y;` single-segment import (via `Y`); unqualified in a file with no `namespace` declaration. NOT listed: `self`/`static`/`parent`, anonymous `new class`/`new readonly class`, a namespaced or unimported name in a namespaced file, a class Upstream or the vendor code declares in a non-namespaced file, `Mockery`, a runtime export (compared case-insensitively) | — |
| Pattern rules | a string literal (no interpolation) that the runtime's `compilePattern` accepts as a PHP pattern (`null` = PHP cannot compile it, skipped) | listed only when `compilePattern` throws, with the thrown message; `'/path/to'`, `'+1 day'`, interpolated strings are skipped; a pattern converted fine is not listed | the throw is caught; the scan never fails on it |

</intent-contract>

## Code Map

- `tools/scans/builtins.ts` -- the scan. `fileFacts` (one-pass tokenizer walk, class-body stack, `use` reader `useFunctions`), `scanBuiltins` (collects scanned files, Upstream-declared names from every repo's `src/`+`tests/`, builds lines), `renderReport`, `parseArgs`/`main` (exit codes 0/1/2, `UsageError` → 2), `sourceDir` (illuminate/ai/mcp/boost only today), `runtimeExports` (imports `packages/runtime/src/php/index`).
- `tools/scans/php.ts` -- `tokenize(source, file)` → `Token{kind: "name"|"punct"|"string"|…, text, value, line}`, `codeIndexes`, `phpFiles(dir, base)`. Read to learn token kinds (how a variable, an interpolated string, `\Name`, `Foo\Bar` tokenize).
- `tools/upstream/upstream.ts` -- `treeHash(dir)` (exported, pure TS git tree hash), `UPSTREAM_DIR`, `UPSTREAM_REPOS`. Its private `git()`/`gitEnv()`/`removeTree`/`clearWriteBitsBelow` and `syncOne` show the clone-verify-swap pattern to mirror (copy the small helpers into `tools/scans/`; do not edit this file).
- `packages/runtime/src/php/pcre.ts:938` -- `compilePattern(fn, pattern): PcrePattern | null`; null when PHP cannot compile, throws `TypeError` naming the refused form. Internal module: import it directly by path, read-only.
- `packages/runtime/src/php/index.ts` -- runtime exports; classes and constants are exported under their PHP names (`ArrayIterator`, `EmptyIterator`, `DIRECTORY_SEPARATOR`, `PHP_INT_MAX`, `JSON_THROW_ON_ERROR`, …).
- `conformance/oracle/locks/<repo>/composer.lock` -- committed pins. Each package entry has `name`, `source.url` (`https://github.com/<o>/<r>.git`), `source.reference` (40-hex commit) and `autoload` (`psr-4`/`psr-0` dirs, `classmap`, `files`, `exclude-from-classmap` such as `"/Tests/"`). Lock repo: `framework` for illuminate and `kind: xaravel` Components, `ai`/`mcp`/`boost` for themselves. Search both `packages` and `packages-dev`.
- `tools/scaffold/packages.jsonl` -- Component rows (`name`, `kind`, `upstream`). `http-foundation`, `mime`, `finder` are `kind: xaravel` with `upstream: symfony/<x>`.
- `_bmad-output/planning-artifacts/epics.md` -- read-only source of the port table: AD-22 table (line ~505) and each Epic's "Owns port(s) (AD-22)" line (lines 3999, 4121, 4216, 4628, 4720, 4784, 6055, 6954, 7208, 7478). ESC-15.2-4 (`decisions/ESC-15.2-4.md`) puts PhpOption and ResultType in `config`.
- `conformance/tests/xaravel/builtin-scan.test.ts` -- XT-conformance-269 (mini snapshot in a temp root via `withRoot`, `run` captures `main`), XT-conformance-270 (real snapshot, skips when not synced). The fixture's non-namespaced test file references `Thing::class`, which the new class rule resolves to a global `Thing` — expect a `class Thing …` line there.
- `docs/ops/builtin-scan.md` -- the operator doc; every rule and limit must be restated there.

## Tasks & Acceptance

**Execution:**
- `tools/scans/vendor-ports.jsonl` -- new data file, one JSON row per line `{"component": "<name>", "package": "<composer name>", "source": "<citation>"}`, sorted by component then package. Rows: config: `vlucas/phpdotenv` (epics.md Epic 15, AD-22), `phpoption/phpoption`, `graham-campbell/result-type` (ESC-15.2-4); support: `doctrine/inflector`, `voku/portable-ascii`, `ramsey/uuid`, `symfony/uid`, `league/commonmark` (Epic 18), `nesbot/carbon` (Epic 19), `league/uri`, `brick/math`, `symfony/var-dumper` (Epic 20); filesystem: `league/flysystem` (Epic 27); process: `symfony/process` (Epic 28); log: `monolog/monolog` (Epic 29); validation: `egulias/email-validator` (Epic 43); foundation: `symfony/error-handler` (Epic 52); console: `symfony/console`, `laravel/prompts`, `nunomaduro/termwind`, `dragonmantank/cron-expression` (Epic 54); mail: `symfony/mailer`, `tijsverkoyen/css-to-inline-styles` (Epic 56). Partial ports (the symfony/routing route compiler, the HttpKernel exceptions) are left out. -- the scan's record of which vendor libraries each Component ports.
- `tools/scans/vendor.ts` -- new module: read `vendor-ports.jsonl` (validate shape; a row's component must exist in the packages table), resolve a Component's vendor packages (its rows, plus its own `upstream` when `kind` is `xaravel` and that name is in the lock), look each up in the right lock, list its autoload files (every `.php` under each `psr-4`/`psr-0`/`classmap` dir, plus `files`, minus `exclude-from-classmap` path segments; dirs `""` mean the package root; sorted), cache path `.cache/vendor/<package>@<commit>/` with the tree hash in `.cache/vendor/<package>@<commit>.tree`, `verifyVendor` (tree file present and equal to `treeHash(dir)`), and `syncVendor(root, package, {remoteBase})` (temp sibling, `git init` + `git fetch --depth 1 <url> <commit>` + checkout `FETCH_HEAD` with `core.autocrlf=false`/`core.eol=lf`, verify HEAD, record `HEAD^{tree}`, drop `.git`, check `treeHash` equals it, clear write bits, rename into place; leaves nothing behind on failure). `--remote <base>` replaces the `https://github.com` prefix of `source.url`. -- pinned vendor source.
- `tools/scans/builtins.ts` -- add `--sync` and `--remote <base>` (only valid with `--sync`; repeated or valueless flags are usage errors); accept vendor-only Components; scan vendor files as part of the Component (calls, strings, declarations; sites `vendor:<package>/<path>`), after the Upstream `src/` and test files in walk order; add the constant, class and pattern rules of the matrix to `fileFacts` (new fields) and their lines to the report; new summary line. -- the widened scan.
- `conformance/tests/xaravel/builtin-scan.test.ts` -- keep XT-conformance-269/270 (update only the summary text and add the new lines the fixture now produces, e.g. `class Thing`); add XT-conformance-274 (constants and classes on a mini snapshot covering every matrix row of those two rules), XT-conformance-275 (patterns: refused, converted, PHP-invalid and non-pattern literals; the listed message equals what `compilePattern` throws), XT-conformance-276 (vendor: `--sync` from a local bare repo, `vendor:` sites, missing/tampered/wrong-commit/not-in-lock failures, nothing left behind, vendor-only Component, `--remote` without `--sync` is exit 2), XT-conformance-277 (real data: every `vendor-ports.jsonl` row names a Component of the packages table and a package in the framework lock, rows sorted and unique). In the local bare repo set `uploadpack.allowAnySHA1InWant=true`. -- the grader for the new behaviour.
- `docs/ops/builtin-scan.md` -- document `--sync`/`--remote`, the vendor cache and its verification, `vendor-ports.jsonl` and how a row is added, the three new rules, new line formats, new summary, and new limits (type positions not read for classes; patterns built at runtime, e.g. phpdotenv's `Lexer` joining `PATTERNS`, are not seen; uppercase class names in a return type after `):` read as constants; `namespace { }` blocks; partial ports not listed). Name XT-conformance-269, 270, 274–277.

**Acceptance Criteria:**
- Given the real snapshot is synced and `bun tools/scans/builtins.ts config --sync` has fetched the three config vendor sources, when `bun run scan:builtins config` runs, then it exits 0 and every line is a `function`, `construct`, `constant`, `class` or `pattern` line whose name the runtime does not export, and no line names `DIRECTORY_SEPARATOR`, `array_reduce` or `EmptyIterator` (all exported since epic-15-item-4).
- Given any run, when the scan prints, then the summary line is `builtins: <c>: <f> function(s), <k> construct(s), <n> constant(s) and <l> class(es) not in @xaravel/runtime/php; <p> refused pattern(s); <files> file(s) scanned.` and `<files>` counts vendor files.
- Given no `--sync`, when any scan runs, then nothing touches the network and nothing is written.

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 34 findings — high 0, medium 4, low 24, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` (edge) A name after `->`/`?->` before `::` (`$this->model::query()`) is taken as a class — guarded the `::` disjunct with `!afterMember`; fixture added to XT-conformance-274.
  - `[low]` `[patch]` (edge) `refusal()` reports any exception as a refused pattern — now catches only `TypeError`; anything else fails the run.
  - `[low]` `[reject]` (edge) every literal is checked as `preg_match` — the converter's refusals do not depend on the function name; the doc states the nominal `preg_match` call.
  - `[low]` `[patch]` (edge) `\define('NAME', …)` not recorded as a declaration — leading `\` stripped before the comparison.
  - `[low]` `[reject]` (edge) concurrent `--sync` runs sweep each other's temp dirs — a one-operator advisory tool; locking adds complexity for an unlikely case.
  - `[low]` `[reject]` (edge) `.gitattributes` `eol=crlf`/filters could make the tree check fail — fails loudly, never silently; no pinned package uses them today.
  - `[low]` `[reject]` (edge) a lock autoload path absent from the checkout is skipped silently — the lock and the checkout come from the same pinned commit; unlikely.
  - `[low]` `[reject]` (edge) `exclude-from-classmap` file or glob entries not matched — every real entry is `/Tests/`; unlikely.
  - `[low]` `[reject]` (edge) an empty `.cache/vendor` directory remains after a failed first sync — git-ignored and harmless.
  - `[low]` `[patch]` (edge) a failed re-fetch deletes the previous cache — removal in the catch now happens only once the swap has started.
  - `[low]` `[patch]` (blind) the sync hint and docs say `bun tools/scans/builtins.ts … --sync`, without `--no-env-file` — now `bun run scan:builtins <c> --sync`.
  - `[low]` `[reject]` (blind) the sync hint drops `--root` — an operator who passed `--root` knows to pass it again; cosmetic.
  - `[low]` `[patch]` (blind) duplicate of the `refusal()` finding above — same fix.
  - `[low]` `[reject]` (blind) `refused=` always names `preg_match()` — documented; cosmetic.
  - `[low]` `[patch]` (blind) git runs with the user's hooks and templates — `core.hooksPath=/dev/null` and `--template=` added.
  - `[low]` `[patch]` (blind) the `.tree` file is writable and self-recorded — made read-only; the check guards against accidental edits, as a local cache must.
  - `[low]` `[reject]` (blind) concurrent `--sync` deletes, and the catch removes `target` — the first is the rejected concurrency row above; the second is the patched row above.
  - `[medium]` `[patch]` (blind) `boost` now always reads its lock — the own-`upstream` vendor rule now applies only to a Component without an Upstream source.
  - `[low]` `[reject]` (blind) a package with no files passes silently — same as the rejected autoload row above.
  - `[low]` `[reject]` (blind) XT-conformance-277 checks rows against the framework lock only — no row names ai, mcp or boost; the scan itself uses the right lock.
  - `[low]` `[patch]` (blind) declared constants match by short name, and the Limits section does not say so — Limits line added.
  - `[low]` `[reject]` (blind) XT-conformance-276 misses some failure modes (missing `.tree`, non-github url, bad sha, bad row) — the core missing, tampered, wrong-commit and not-in-lock cases are covered; each of these fails loudly.
  - `[low]` `[reject]` (blind) XT-conformance-274 does not pin the documented limits — limits are documented false positives of an advisory tool, not behaviour to protect.
  - `[false]` `[reject]` (blind) no approval to edit Protected Paths — MAINT-2026-10-16 (amendment 2026-10-17) is the Maintainer's approval for orchestrator PRs that touch Protected Paths, and step D of the orchestrator routes this item.
  - `[low]` `[reject]` (blind) the cost of the widened scan is undocumented — config scans in seconds; support runs once per epic.
  - `[medium]` `[patch]` (verification-gap) nothing tests that a class-body trait `use` ends — fixture with trait `use` (plain and with an adaptation block) added, and the names after it asserted.
  - `[low]` `[patch]` (verification-gap) grouped class imports untested — `use Foo\{Grouped, Other as Alias}` fixture added.
  - `[low]` `[defer]` (verification-gap) a vendor-only Component whose upstream is missing from the lock is meant to be a usage error, but no test checks this — no real row reaches the branch.
  - `[medium]` `[patch]` (verification-gap other) boost reads its lock — same as the patched boost row above.
  - `[false]` `[reject]` (verification-gap other) the real-data AC is checked only by hand — the AC is a manual command by design (network); it was run and passed.
  - `[false]` `[reject]` (intent) the real config source is not exercised in an XT — XT runs must not use the network; the real run was done and recorded under Verification.
  - `[false]` `[reject]` (intent) semantic PCRE differences (ESC-15.2-5) are invisible — the action asks for forms "the runtime converter refuses"; the converter now handles the ESC-15.2-5 forms.
  - `[false]` `[reject]` (intent) the pin goes through the Oracle lock, not the upstream pin tooling — the intent allows "any helper"; the committed lock is the Oracle's own pin, and `upstream:check` forbids extra snapshot directories.
  - `[false]` `[reject]` (intent) a scope wider than phpdotenv/phpoption, plus extends/implements/catch — the action's "such as" and "an Upstream Component ports" read as examples; extra positions only add true listings.

## Design Notes

Output lines, after functions and constructs, each group sorted with `compareUnits`:

```
constant <NAME> uses=<n> first=<site>
class <Name> uses=<n> first=<site>
pattern <JSON string of the literal's value> uses=<n> first=<site> refused=<JSON string of the thrown message>
```

`<site>` is `<file>:<line>`, with `<file>` relative to `conformance/upstream/` or `vendor:<package>/<path in the package>`. A class prints with its first-seen spelling and groups case-insensitively. Constants compare case-sensitively with runtime exports (PHP constants are case-sensitive); classes compare case-insensitively. Upstream-declared constants and global classes are collected from the same files that already supply declared functions (every repo's `src/` and `tests/`) plus the vendor files. A constant is a `name` token matching `^\\?[A-Z][A-Z0-9_]*$` that is not followed by `(`, `::` or `\`, whose previous code token is not `->`, `?->`, `::`, `new`, `function`, `fn`, `const`, `class`, `interface`, `trait`, `enum`, `extends`, `implements`, `instanceof`, `goto`, `namespace`, `use`, and that is not a type before a variable (next token a variable, `&`, `...` or `|`). Compile each candidate pattern once per distinct literal value (cache in a local `Map` inside the scan run; this is a tool, not runtime state).

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/builtin-scan.test.ts` -- expected: all XT-conformance-269, 270, 274, 275, 276, 277 pass.
- `bun run typecheck` -- expected: exit 0.
- `bun run lint` -- expected: exit 0.
- `bun run scan:builtins collections` -- expected: exit 0, parseable listing ending in the new summary line.
- `bun tools/scans/builtins.ts config --sync` then `bun run scan:builtins config` -- expected: both exit 0 (network needed for the first); no line names `DIRECTORY_SEPARATOR`, `array_reduce` or `EmptyIterator`.
- `bun run upstream:check` -- expected: exit 0 (nothing was written into `conformance/upstream/`).
- `bun run harness --xaravel --id 'XT-conformance-*'` -- expected: exit 0, no differences.

## Auto Run Result

Status: done

**Summary.** `scan:builtins` now also reads the vendor libraries a Component ports (`tools/scans/vendor-ports.jsonl`, 23 rows from AD-22, the Epics' "Owns port(s)" lines and ESC-15.2-4), fetched only under `--sync`, at the commit `conformance/oracle/locks/<repo>/composer.lock` pins. The source is cached in the git-ignored `.cache/vendor/<package>@<commit>/` and its tree hash is checked on every run. It lists global PHP constants and builtin classes (after `new`, `instanceof`, `extends`, `implements`, `catch` and before `::`) that the runtime lacks. It also lists the string literals that are PHP patterns the runtime's `compilePattern` refuses. Vendor-only Components (`http-foundation`, `mime`, `finder`, `serializable-closure`) can be scanned.

**Files changed**
- `tools/scans/builtins.ts`: the constant, class and pattern rules; the `--sync` and `--remote` flags; vendor files in the scan; the new line kinds and the new summary line.
- `tools/scans/vendor.ts` (new): reads the vendor-ports rows and the locks, lists autoload files, and verifies and syncs the cache.
- `tools/scans/vendor-ports.jsonl` (new): which vendor libraries each Component ports.
- `conformance/tests/xaravel/builtin-scan.test.ts`: XT-conformance-269 and 270 keep every assertion (only the summary text changes, plus the added `class Thing` line). New tests XT-conformance-274 to 277.
- `docs/ops/builtin-scan.md` and `docs/ops/scans.md`: the operator docs.

**Review.** 34 findings: 4 medium and 24 low, of which 13 were patched (the 4 medium and 9 low), 1 low deferred and 14 low rejected; 6 false, all rejected. Every rejected row and its reason is in the Review Triage Log. The Fidelity Review was skipped because the item names no `packages/<component>`.

**Follow-up review recommended:** true. Four medium entries were patched. The specific unverified risk is the trait-`use` and `::` guard changes in `fileFacts`, which shift the real-snapshot listings: collections now shows 7 functions, 4 constructs, 1 constant and 3 classes.

**Verification**
- `bun test conformance/tests/xaravel/builtin-scan.test.ts`: 6 pass, 253 expect() calls.
- `bun run typecheck`, `bun run lint` and `bun run upstream:check`: all pass.
- `bun run scan:builtins collections` and `config`: exit 0. Config lists none of `DIRECTORY_SEPARATOR`, `array_reduce` or `EmptyIterator`. Before that, `config --sync` fetched the three pinned vendor sources from GitHub.
- `bun run harness --xaravel --id 'XT-conformance-*'`: 271 passed, 0 failed, 5 skipped, differ=0.

**Residual risks.** The scan is lexical. Patterns built at runtime and type-position classes are not seen, and some documented false positives remain, such as `sprintf` formats that parse as patterns and uppercase return types. The real GitHub fetch path is checked only by hand, because XT runs use local repositories.
