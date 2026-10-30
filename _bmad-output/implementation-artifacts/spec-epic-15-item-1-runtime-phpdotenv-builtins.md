---
title: 'Runtime builtins phpdotenv calls: strings, ctype, mbstring, function_exists, class_exists, filter_var'
type: feature
created: '2026-10-30'
status: done
baseline_revision: 5d2523fc2c2212f8268c5b1838f9991a56862207
review_loop_iteration: 0
followup_review_recommended: false
context:
  - decisions/ESC-15.2-1.md
  - decisions/MAINT-2026-10-30-story-15-2.md
  - decisions/MAINT-2026-10-26-runtime-builtins.md
  - packages/runtime/docs/php-functions.md
  - AGENTS.md
warnings: [oversized]
deferred:
  - summary: >-
      class_exists reports a trait as a class until some mixin call has composed it, and a frozen trait stays a class.
    evidence: |-
      The Class Registry holds a trait as a plain registered class (AD-26); the only trait mark is the one mixin sets
      when it composes the trait. A stable answer needs a declaration-time trait mark, which is outside this item's
      intent. Documented under Not ported in packages/runtime/docs/php-functions.md.
    location: >-
      packages/runtime/src/php/classExistence.ts:74
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Story 15.2 ports vlucas/phpdotenv v5.7.0 (the Pin), which calls PHP builtins `@xaravel/runtime/php` does not export (ESC-15.2-1 parts a-e). The monitor approved adding them to `packages/runtime` (`decisions/ESC-15.2-1.md`, action item `epic-15-item-1-runtime-phpdotenv-builtins`).

**Approach:** Export from `@xaravel/runtime/php` and the package root, under their PHP names, ports of PHP 8.5.11 in coercive typing mode: `strpos`, `str_replace`, `ltrim`, `rtrim`, `ord`, `strtok`, `addcslashes`, `stripcslashes` (`ext/standard/string.c`); `ctype_space`, `ctype_digit` (`ext/ctype`); `mb_strlen`, `mb_substr`, `mb_strpos`, `mb_convert_encoding`, `mb_list_encodings`, `mb_encoding_aliases` (`ext/mbstring`); `function_exists` over the PHP function-name resolver registry; `class_exists` over the Class Registry; `filter_var` with `FILTER_DEFAULT`, `FILTER_VALIDATE_BOOLEAN` (alias `FILTER_VALIDATE_BOOL`), `FILTER_VALIDATE_INT` and the `FILTER_NULL_ON_FAILURE` flag, plus those constants. Each new function is a resolver registry entry with PHP's `ReflectionFunction` counts. Every result is checked against a committed PHP 8.5.11 probe.

## Boundaries & Constraints

**Always:**
- Follow `packages/runtime/docs/php-functions.md` § Common rules: PHP's values, exception classes and messages; arguments coerced as PHP's parameters (`stringParameter`, `intParameter`, `nullableIntParameter` in `phpArguments.ts`), PHP's `TypeError` for what PHP rejects; an `undefined` optional argument is omitted. Null is the only absent value (AD-9); PHP's `false` stays `false`. Sync only (AD-6).
- A PHP string is its UTF-8 bytes: the byte functions (`strpos` offsets, `ltrim`/`rtrim`, `ord`, `strtok`, `addcslashes`, `stripcslashes`) work on UTF-8 bytes as `trim` and `substr` do; a result that splits a UTF-8 sequence, or an input with a lone surrogate, throws the JS `TypeError` naming the limit, through the existing `wellFormed`/`decodeResult`. The `mb_*` functions count code points.
- `ltrim`/`rtrim`/`addcslashes` reuse the existing private `charmask` (PHP's `php_charmask`, `..` ranges, malformed ranges as PHP). Default `ltrim`/`rtrim` list is `" \n\r\t\v\0"`.
- `str_replace` takes string or array `search`/`replace`/`subject` as PHP does, counts replacements into a by-reference `count` (`Ref`), skips an empty search string, and returns an array subject through `arrayFromEntries` with keys kept (an array element is left unchanged, any other scalar element converted to string).
- `strtok`'s remembered string and position live in a Scope Frame slot (AD-5), as `jsonLastError.ts` holds its code: outside a frame the two-argument form returns its first token but records nothing, so a later one-argument call returns `false`.
- mbstring: an `$encoding` of null, `UTF-8` or any of its PHP aliases (case-insensitive) is UTF-8. A name that is not a PHP encoding throws PHP's `ValueError` (`<fn>(): Argument #<n> ($encoding) must be a valid encoding, "<name>" given`; `mb_convert_encoding`'s `$from_encoding` says `contains invalid encoding "<name>"`). A valid encoding other than UTF-8 throws a JS `TypeError` naming the limit (no non-UTF-8 string exists in the runtime). `mb_list_encodings()` and `mb_encoding_aliases()` return PHP 8.5.11's exact lists (79 encodings), held as a frozen table generated from PHP. `mb_convert_encoding` from and to UTF-8 returns its string (or array, copied, keys and values) unchanged, since a runtime string is always well-formed.
- `ctype_*`: a string is tested byte-wise in the C locale (empty is false); an int from -128 to 255 is that character (negative +256); any other int is its decimal string; any other type is false. PHP's deprecation notice is not raised (DIV-9.17).
- `function_exists($function)`: true when `phpFunction`'s registry holds the name (one leading `\` dropped, ASCII case-insensitive); PHP's `TypeError` for a non-string. `class_exists($class, $autoload = true)`: true for a registered class or enum (PHP counts an enum), false for a contract token (interface), a trait, or nothing registered; nothing is autoloaded (AD-10.4), as `interfaceExists` reads.
- `filter_var($value, $filter = FILTER_DEFAULT, $options = 0)`: `$options` an int of flags or an array with `flags` and, for `FILTER_VALIDATE_INT`, `options` `min_range`/`max_range`/`default`. A scalar (or `__toString` object) is filtered as its string; an array or other object fails. Failure is `false`, or `null` under `FILTER_NULL_ON_FAILURE`, except PHP's own exceptions to that (`filter_var(null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)` is `false`).
- Document every new export in a runtime `docs/` file (XT-runtime-37 reads them) and add one entry per function to `PHP_FUNCTIONS`.
- Scope: `packages/runtime/**` and this item's records under `_bmad-output/implementation-artifacts/`.

**Never:**
- Change another component, the grader, Expectations, divergences, `PORTING.md`, the architecture, or the item's `action`/`owner`/`epic`.
- Add `getenv`, `putenv` or any PCRE function (ESC-15.2-2; item `epic-15-item-2-runtime-pcre-functions`).
- Raise PHP's warnings, notices or deprecations (DIV-9.17); change any existing export's behaviour, or remove one.
- Support a filter, flag or option the Approach does not list silently: one throws a JS `TypeError` naming the limit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| strpos | `strpos("a=\"b", '="')`, `("héllo","l")`, `("abc","d")`, `("abc","",1)`, `("abc","c",-1)` | 1, 3 (bytes), false, 1, 2 | `("abc","a",4)` → `ValueError` `strpos(): Argument #3 ($offset) must be contained in argument #1 ($haystack)` |
| str_replace | `('\\\\','',…)`, array search/replace, shorter replace array, array subject with int and nested array, `$count` | PHP's strings, arrays and count | TypeError for an object without `__toString` |
| ltrim/rtrim | phpdotenv's `" \t\n\r\v\f"`, `rtrim("/a//", "/")`, ranges `"a..c"`, malformed `"..a"` | PHP's results | none |
| ord/strtok | `ord("")`, `ord("é")`, `strtok("\n\nab\ncd","\n")` then `strtok("\n")` twice, only delimiters | 0, 195, "ab", "cd", false, false | none |
| addcslashes/stripcslashes | `addcslashes("a\0\x1f\x7f\n\"", "\0..\37\177")`, letter range `"A..Z"`; `stripcslashes('\f\n\x41\101\q\\')` | PHP's escapes (`\a\b\t\n\v\f\r`, else 3-digit octal) and decodes | a decode giving invalid UTF-8 (`'\xff'`) throws the JS TypeError limit |
| ctype | `ctype_space(" \x0b")`, `("")`, `(32)`, `(1000)`, `(-96)`, `(null)`; `ctype_digit("012")`, `(5)`, `(53)`, `("1.5")` | PHP's booleans | none |
| mbstring | `mb_strlen("héllo")`, `mb_substr("héllo",1,3)`, negative start/length, `mb_strpos("héllo","l",0,"UTF-8")`, empty needle, `"utf8"` alias | 5, "éll", PHP's, 2 | invalid name → ValueError; `"ISO-8859-1"` → JS TypeError limit; bad offset → ValueError |
| encodings | `mb_list_encodings()`, `mb_encoding_aliases("UTF-8")`, every listed encoding's aliases | PHP's lists | `mb_encoding_aliases("nope")` → ValueError |
| exists | `function_exists("strlen")`, `"\\STRLEN"`, `"apache_getenv"`, `"minus"`; `class_exists` of a class, enum, contract token, `"\\stdClass"`, unknown | true, true, false, false; true, true, false, true, false | non-string → TypeError |
| filter_var | BOOLEAN on `"1" "true" " Yes " "on" "off" "no" "0" "" "maybe" null true false 1 [1]`, with and without `FILTER_NULL_ON_FAILURE`; INT on `"12" " 12 " "012" "-0" "+5" "9223372036854775808" 1.0 "1e3"`, min/max/default; DEFAULT on `5`, `1.5`, `[1]` | PHP's results | unsupported filter/flag → JS TypeError limit |

</intent-contract>

## Code Map

- `packages/runtime/src/php/stringFunctions.ts` -- `wellFormed`, `decodeResult`, private `charmask` (php_charmask), `trim` (mode 3 of `php_trim_int`): add `ltrim`/`rtrim` on the same loop, and `strpos`, `str_replace`, `ord`, `strtok`, `addcslashes`, `stripcslashes`. `utf8` and `LONE_SURROGATE` come from `mangle.ts`; `arrayEntries`/`toPhpString` from `casts.ts`.
- `packages/runtime/src/php/jsonLastError.ts` -- the Scope Frame slot pattern (`frameSlot`, `currentFrame`, `ScopeFrameException`) to copy for `strtok`'s state.
- `packages/runtime/src/php/classExistence.ts` -- `interfaceExists`/`enumExists` over `lookUpName`/`isContractToken`; add `class_exists`. Check how a trait is told apart (`traits/`, `classLookup.ts`).
- `packages/runtime/src/php/phpFunctions.ts` -- `PHP_FUNCTIONS` registry (`entry(name, fn, required, total, variadic, byRef)`) and `phpFunction`; add `function_exists` here (it reads the registry) and one entry per new function, counts from PHP's `ReflectionFunction`.
- New `packages/runtime/src/php/ctypeFunctions.ts`, `mbstringFunctions.ts` (with its generated encoding table), `filterFunctions.ts`.
- `packages/runtime/src/php/index.ts:198` and `packages/runtime/src/index.ts` -- export every new function and constant from both (the same objects).
- `packages/runtime/docs/php-functions.md` -- add a section for these functions, with the limits above.
- `packages/runtime/tests/xaravel/php-minus.{probe.php,probe.txt,test.ts}` -- the probe/test pattern to copy (`out(label, value)`, `attempt`, a `cases` map recomputed through the export, key-set equality).
- `packages/runtime/tests/xaravel/php-set-functions.probe.php:73,75` and `.test.ts:691` -- `$registry`, `$exports` and the registry count (104) go stale with the new exports; update them and regenerate the record from PHP (same component).
- Phpdotenv call sites (for the matrix): `Parser/EntryParser.php:99-100,251,282,312,322,348`, `Parser/Lines.php:89,95,118`, `Util/Str.php:45-127`, `Validator.php:87,108`, `Repository/Adapter/ApacheAdapter.php:46`, `RepositoryBuilder.php:122`, `Store/File/Paths.php:38`.
- Last Xaravel Test ID is XT-runtime-130; new tests start at XT-runtime-131.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/stringFunctions.ts` -- add the eight string functions.
- `packages/runtime/src/php/ctypeFunctions.ts`, `mbstringFunctions.ts`, `filterFunctions.ts` -- new modules for the ctype, mbstring and filter functions and the `FILTER_*` constants.
- `packages/runtime/src/php/classExistence.ts`, `phpFunctions.ts` -- `class_exists`, `function_exists`, registry entries.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` -- exports.
- `packages/runtime/docs/php-functions.md` -- the new section.
- `packages/runtime/tests/xaravel/php-phpdotenv-builtins.probe.php` and `.probe.txt` -- PHP 8.5.11 results for every matrix row, plus each new function's `ReflectionFunction` counts and the full encoding table.
- `packages/runtime/tests/xaravel/php-phpdotenv-builtins.test.ts` -- XT-runtime-131 (strings), XT-runtime-132 (ctype and filter_var), XT-runtime-133 (mbstring, encoding table), XT-runtime-134 (function_exists, class_exists, registry counts, root/subpath identity, strtok frame state across two concurrent frames).
- `packages/runtime/tests/xaravel/php-set-functions.{probe.php,probe.txt,test.ts}` -- the lists and count the new exports make stale.

**Acceptance Criteria:**
- Given each matrix input, when the function is called through `@xaravel/runtime/php`, then its JSON-encoded result, or the exception class and message, equals the PHP 8.5.11 probe's record.
- Given `phpFunction("<name>")` for each new function, when called with too few or too many arguments, then it throws PHP's `ArgumentCountError` with PHP's counts.
- Given the full suite, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then the harness reports zero differences and all three exit 0.
- Given the finished item, when `bun run fidelity:review status --item epic-15-item-1-runtime-phpdotenv-builtins --spec _bmad-output/implementation-artifacts/spec-epic-15-item-1-runtime-phpdotenv-builtins.md` runs, then it prints `current`.

## Spec Change Log

- 2026-10-30, implementation, evidence over the Boundaries' wording (no Intent change). (1) `str_replace` with an array `subject`: the Boundaries say an array element is left unchanged; PHP 8.5.11 converts every element to string (`str_replace('a', 'b', [['a']])` is `['Arrby']`, and an object element without `__toString` throws `Error`). The port follows PHP and the probe records it (`str_replace` label). (2) ctype: the host's PHP runs in Darwin's `C.UTF-8` LC_CTYPE, where byte 0xA0 is a space (`ctype_space(-96)` is true there); the Boundaries name the C locale, the Oracle's glibc default, so the probe calls `setlocale(LC_CTYPE, 'C')` first and the port is ASCII-only. (3) `class_exists` and a trait: the Class Registry holds a trait as a plain registered class (AD-26), so `mixin` now marks each class it composes with the non-enumerable `Symbol.for('xaravel.traits.trait')`, which `class_exists` reads; a trait no `mixin` call has composed reads as a class (documented under Not ported). (4) `mb_convert_encoding`: PHP drops an object element of an array input and skips empty names in a `from_encoding` list; the port does the same, as the probe records.
- 2026-10-30, implementation, blocker (Protected Path). Exporting `function_exists` makes XT-conformance-269 (`conformance/tests/xaravel/builtin-scan.test.ts:164`, a Protected Path) stale: its fixture `helpers.php` calls `function_exists('collect')` as a builtin `@xaravel/runtime/php` does not export, and the scan reads the live exports, so the expected listing loses the `function function_exists …` line and the summary says 5 functions, not 6. `MAINT-2026-10-24-stale-cross-scope-tests` excludes `conformance/**`, so the item does not edit it; it needs a Maintainer ruling (e.g. swap the fixture's `function_exists` for a builtin the runtime still lacks). The Fidelity Review is not run until then, as the fix changes the reviewed tree.
- 2026-10-30, resumption (no Intent change). The Maintainer ruled the blocker in `decisions/MAINT-2026-10-30-story-15-2.md` (#563): XT-conformance-269's fixture builtins are now `defined` and `soundex`. The item left `waiting_on_maintainer`, the saved attempt patch was applied on `planning/retro-15-phpdotenv-builtins` over baseline `5d2523fc2c2212f8268c5b1838f9991a56862207`, and XT-conformance-269 and XT-runtime-* (131/131) pass with it. The patch file is deleted in this PR.

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 27 findings — high 0, medium 4, low 16, false 6, maybe-false 1 (Fidelity Review: 0 findings, two passes at tree 04917799)
- findings:
  - `[false]` `[reject]` blind: strtok progress lost after a nested unit frame — the intent prescribes a Scope Frame slot as `jsonLastError.ts` holds its code (AD-5); per-frame write-to-innermost is that slot's defined semantics, shared with `json_last_error`.
  - `[low]` `[patch]` blind: strtok records its position before `decodeResult` can throw — reordered: decode, then record.
  - `[medium]` `[defer]` blind: class_exists answer for a trait depends on whether `mixin` has composed it yet, and a frozen trait is never marked — the Class Registry has no trait concept (AD-26), so a stable answer needs a declaration-time trait mark outside this item's intent; documented under Not ported; deferred.
  - `[low]` `[reject]` blind: the TRAIT symbol is defined in two modules — both use `Symbol.for("xaravel.traits.trait")`, the global registry key being the shared contract; importing `traits/` from `php/` couples the modules for no behaviour gain.
  - `[low]` `[reject]` blind: function_exists repeats phpFunction's name handling — `phpFunction` also resolves `Class::method` strings, so reusing it would change function_exists's answers; not a direct correction.
  - `[low]` `[reject]` blind: small helpers (isArray, asciiLower, wellFormed) copied across new modules — no named divergence today; consolidating is a refactor across existing modules, not a direct correction.
  - `[medium]` `[patch]` blind: filter_var returns the caller's `default` object itself — now returned through `valueCopy`, with an XT-runtime-132 assertion.
  - `[false]` `[reject]` blind: filter_var rejects FILTER_REQUIRE_SCALAR and other flags — the intent's Never says a flag it does not list throws the JS TypeError limit.
  - `[low]` `[reject]` blind: ctype returns false for a non-PHP JS value where filter_var/mb_convert_encoding throw — a JS symbol is no PHP value; no PHP caller can reach it.
  - `[low]` `[patch]` blind: the ENCODINGS table names no generator command — the regenerating `php -r` command is now in its header comment.
  - `[low]` `[reject]` blind: mb_strlen/mb_strpos build code-point arrays — linear and correct; a rewrite adds complexity with no measured cost at phpdotenv's input sizes.
  - `[low]` `[reject]` blind: several implicit guarantees untested (extending a marked class, Layer unmarked, surrogate vs encoding precedence) — the mixin-base and trait-user cases are covered by the verification-gap patch below; the rest are unlikely in everyday use and need new fixtures.
  - `[low]` `[reject]` edge: a frozen trait is never marked — same root as the deferred trait entry above; traits are never frozen in the framework.
  - `[low]` `[reject]` edge: unknown filter id with a badly typed `$options` throws the limit before PHP's TypeError — only for an unported filter, which throws either way.
  - `[maybe-false]` `[reject]` edge: a double-quoted `from_encoding` list is accepted by PHP — unprobed recollection of `php_mb_parse_encoding_list`; would settle by a PHP probe; if true only low (no phpdotenv call passes one).
  - `[low]` `[reject]` edge: lone-surrogate TypeError precedes PHP's argument TypeError in mb_convert_encoding — error-order only, on input no PHP string can carry.
  - `[low]` `[reject]` edge: str_replace's non-Ref `count` error precedes PHP's argument TypeError — error-order only, on a JS calling error.
  - `[low]` `[patch]` verification-gap: filter_var's Closure failure branch untested — Closure inputs added to the probe and XT-runtime-132, probe regenerated from PHP.
  - `[medium]` `[patch]` verification-gap: nothing checks class_exists stays true for a trait-using class or a mixin base — XT-runtime-134 now registers both and asserts true.
  - `[false]` `[reject]` intent: str_replace converts nested array elements — PHP 8.5.11 does (`['Arrby']`), recorded by the probe and Spec Change Log (1).
  - `[false]` `[reject]` intent: mb_convert_encoding drops object elements — PHP does, recorded by the probe and Spec Change Log (4).
  - `[medium]` `[defer]` intent: class_exists false for a trait only once composed — same root as the deferred trait entry.
  - `[low]` `[reject]` intent: mixin's trait mark changes an existing export — a non-enumerable own symbol, not copied by `mixin` (`getOwnPropertyNames`); no existing caller observes it (Spec Change Log 3).
  - `[false]` `[reject]` intent: filter_var accepts `default` for BOOLEAN and DEFAULT — PHP applies `default` to every filter and the probe records it; this follows PHP, not an invented option.
  - `[low]` `[reject]` intent: new mbstring/ctype modules do not reuse `wellFormed` — same as the helpers entry above.
  - `[false]` `[reject]` intent: the probe ran on host PHP — it forces `LC_CTYPE=C`, the Oracle's glibc default (Spec Change Log 2); every other result is locale-free.
  - `[low]` `[reject]` intent: extra internal exports and contract-token handling in ctype — internal, test-only helpers; no conflict with the intent.

## Design Notes

The table for `mb_list_encodings`/`mb_encoding_aliases` is data, not logic: generate it once from PHP 8.5.11 (`foreach (mb_list_encodings() as $e) [$e, mb_encoding_aliases($e)]`) into the module as a frozen literal, and let the probe re-check it in full, so a drift fails the test. Encoding names match case-insensitively against names and aliases, as mbstring's `mbfl_name2encoding` does; probe `"utf8"`, `"UTF8"`, `"utf-8"`.

## Verification

**Commands:**
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-phpdotenv-builtins.probe.php | diff - php-phpdotenv-builtins.probe.txt` -- expected: no output; the same for `php-set-functions`.
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: zero differences.
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run harness` -- expected: zero differences (NOT-RUN Variants allowed).
- `bun run fidelity:review status --item epic-15-item-1-runtime-phpdotenv-builtins --spec _bmad-output/implementation-artifacts/spec-epic-15-item-1-runtime-phpdotenv-builtins.md` -- expected: `current`.

## Auto Run Result

Status: done
Resumed after the Maintainer's ruling on XT-conformance-269 (`decisions/MAINT-2026-10-30-story-15-2.md`). All 19 builtins, the `FILTER_*` constants, 19 registry entries (104 -> 123), the docs section, the PHP 8.5.11 probe and XT-runtime-131..134 are in `packages/runtime`. One runtime change outside the new functions: `src/traits/mixin.ts` marks a composed trait with a non-enumerable `Symbol.for('xaravel.traits.trait')` so `class_exists` returns false for it (Spec Change Log item 3). Verified: both probes diff clean against PHP 8.5.11; `bun run typecheck` and `bun run lint` exit 0; `bun run harness` reports `differ=0` (7 Variants NOT-RUN). The Fidelity Review passed on both reviewers, and `fidelity:review status` prints `current`. The saved attempt patch is deleted.

**Files changed.**
- `packages/runtime/src/php/stringFunctions.ts`: strpos, str_replace, ltrim, rtrim, ord, strtok (Scope Frame slot), addcslashes, stripcslashes; `trim` shares `trimBytes`.
- `packages/runtime/src/php/ctypeFunctions.ts`, `mbstringFunctions.ts` (the 79-row encoding table and its regeneration command), `filterFunctions.ts` (`FILTER_*` constants): new modules.
- `packages/runtime/src/php/classExistence.ts`: class_exists. `phpFunctions.ts`: function_exists and 19 registry entries.
- `packages/runtime/src/traits/mixin.ts`: the trait mark.
- `packages/runtime/src/php/index.ts`, `src/index.ts`: exports. `docs/php-functions.md`: the new section.
- `packages/runtime/tests/xaravel/php-phpdotenv-builtins.*`: XT-runtime-131..134 and the PHP 8.5.11 probe. `php-set-functions.*`: the registry lists and count.

**Review.** One pass, 27 findings (Review Triage Log): 5 patched (medium 2: filter_var's `default` returned through `valueCopy`; class_exists true for a trait-using class and a mixin base, now asserted. Low 3: strtok decodes before it records; Closure inputs to filter_var probed; the ENCODINGS regeneration command), 1 deferred (medium: a trait reads as a class until `mixin` composes it), 21 rejected with their reasons in the log. Follow-up review recommended: false. Two medium entries were patched, but each now has a covering assertion and the Fidelity Review re-ran on the patched tree (two passes, tree `8bbb598c7857ac425972f90dae48d06718d49633`), so no unverified risk remains to name.

**Verification after the patches.** Both probes diff clean against PHP 8.5.11; `bun run typecheck` and `bun run lint` exit 0; `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, Xaravel Tests 509, 504 passed, 0 failed, 5 skipped; `fidelity:review status --item epic-15-item-1-runtime-phpdotenv-builtins` prints `current`.

**Residual risks.** The deferred trait case; phpdotenv's own call sites are first exercised by Story 15.2.

## Fidelity Review

### Reviewer 1: pass at tree 04917799304eaad3701d106754b54ca622ecccc4

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `5d2523fc2c2212f8268c5b1838f9991a56862207`, on 2026-10-30T14:15:32.380Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or modifies no Ported Test and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Probe expectations retain exact serialized comparisons, including exception classes and messages. The registry count changes from 104 to 123 to include the 19 added functions; existing entries remain checked. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no changed Ported Tests whose assertion counts require comparison with Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or changed to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixture. PHP probe error strings are not Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched Xaravel Tests and their helpers with their consequence strings and PHP probes. Exact probe comparisons cover the declared results and errors; additional assertions cover representation limits, exports, registry metadata and concurrent strtok frame isolation. |
| F-8: No stub, fake or partial implementation of another Component | pass | All shown changes stay within packages/runtime, the action item's component. The added builtins implement runtime behavior authorized by ESC-15.2-1; no other component is stubbed or faked. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. The added functions are synchronous computations or registry/frame operations, accept no async callbacks and require no async-root tags; no tags are retained in these files. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"04917799304eaad3701d106754b54ca622ecccc4","base":"5d2523fc2c2212f8268c5b1838f9991a56862207","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T14:15:32.380Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or modifies no Ported Test and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Probe expectations retain exact serialized comparisons, including exception classes and messages. The registry count changes from 104 to 123 to include the 19 added functions; existing entries remain checked.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no changed Ported Tests whose assertion counts require comparison with Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or changed to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixture. PHP probe error strings are not Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched Xaravel Tests and their helpers with their consequence strings and PHP probes. Exact probe comparisons cover the declared results and errors; additional assertions cover representation limits, exports, registry metadata and concurrent strtok frame isolation.","findings":[]},{"id":"F-8","result":"pass","note":"All shown changes stay within packages/runtime, the action item's component. The added builtins implement runtime behavior authorized by ESC-15.2-1; no other component is stubbed or faked.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. The added functions are synchronous computations or registry/frame operations, accept no async callbacks and require no async-root tags; no tags are retained in these files.","findings":[]},{"id":"F-10","result":"n/a","note":"The change modifies no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 04917799304eaad3701d106754b54ca622ecccc4

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `5d2523fc2c2212f8268c5b1838f9991a56862207`, on 2026-10-30T14:15:32.380Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests added or changed; the change adds Xaravel Tests only. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values; Xaravel Tests compare against PHP-probed records. The php-set-functions count change 104 to 123 matches 19 added registry entries. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests; no Upstream assertions to count. XT-runtime-83/84/85 lost no assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines added. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers or Expectations adapted fields added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures are relied on; the tests use a PHP probe record instead. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-131..134 each recompute the probe labels their consequence names and add Xaravel-only assertions for the JS TypeError limits. XT-runtime-134's AD-5 citation is tested by the concurrent-frame strtok assertions. Registry count 123 matches. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes are in packages/runtime, the Component the action item names. The runtime change in mixin.ts only adds a trait mark that class_exists reads; ESC-15.2-1 approves the builtins. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags in the changed files. All the new functions are synchronous, do no IO, take no async callbacks, and no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request files changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"04917799304eaad3701d106754b54ca622ecccc4","base":"5d2523fc2c2212f8268c5b1838f9991a56862207","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T14:15:32.380Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests added or changed; the change adds Xaravel Tests only.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values; Xaravel Tests compare against PHP-probed records. The php-set-functions count change 104 to 123 matches 19 added registry entries.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests; no Upstream assertions to count. XT-runtime-83/84/85 lost no assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines added.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers or Expectations adapted fields added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures are relied on; the tests use a PHP probe record instead.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-131..134 each recompute the probe labels their consequence names and add Xaravel-only assertions for the JS TypeError limits. XT-runtime-134's AD-5 citation is tested by the concurrent-frame strtok assertions. Registry count 123 matches.","findings":[]},{"id":"F-8","result":"pass","note":"All changes are in packages/runtime, the Component the action item names. The runtime change in mixin.ts only adds a trait mark that class_exists reads; ESC-15.2-1 approves the builtins.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags in the changed files. All the new functions are synchronous, do no IO, take no async callbacks, and no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request files changed.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 8bbb598c7857ac425972f90dae48d06718d49633

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `5d2523fc2c2212f8268c5b1838f9991a56862207`, on 2026-10-30T14:32:00.169Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or modifies no Ported Test and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared changed expectations with the PHP probes and prior assertions. Comparisons remain exact; the registry count increases from 104 to 123 for the 19 added functions, preserving existing entries. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-131–134 and the affected XT-runtime-83–85 bodies with their consequences and PHP probe cases. Exact recorded results, exception messages, registry metadata, export identity and concurrent strtok state are asserted as declared. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the runtime action-item scope and ESC-15.2-1 parts a–e. All changes remain in packages/runtime and introduce no substitute implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source declarations and tag inventory with AD-6 and DIV-1. The added functions are synchronous computations or registry/frame-slot lookups; none performs async-root IO or accepts an async callback requiring a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"8bbb598c7857ac425972f90dae48d06718d49633","base":"5d2523fc2c2212f8268c5b1838f9991a56862207","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T14:32:00.169Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or modifies no Ported Test and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed expectations with the PHP probes and prior assertions. Comparisons remain exact; the registry count increases from 104 to 123 for the 19 added functions, preserving existing entries.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this change.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-131–134 and the affected XT-runtime-83–85 bodies with their consequences and PHP probe cases. Exact recorded results, exception messages, registry metadata, export identity and concurrent strtok state are asserted as declared.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the runtime action-item scope and ESC-15.2-1 parts a–e. All changes remain in packages/runtime and introduce no substitute implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source declarations and tag inventory with AD-6 and DIV-1. The added functions are synchronous computations or registry/frame-slot lookups; none performs async-root IO or accepts an async callback requiring a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 8bbb598c7857ac425972f90dae48d06718d49633

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `5d2523fc2c2212f8268c5b1838f9991a56862207`, on 2026-10-30T14:32:00.169Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test; the prompt says it assigns no Ported Test IDs. Only Xaravel Tests in packages/runtime/tests/xaravel are touched. |
| F-2: No expected value is weakened | pass | No Ported Test is changed. In the touched Xaravel Test XT-runtime-84 (php-set-functions.test.ts), the registry count changes from 104 to 123 with an exact assertSame. That is the 19 entries this item adds to PHP_FUNCTIONS (104+19), not a looser check. The php-set-functions.probe.txt rows resolver.reflection, resolver.counts and resolver.exports keep every earlier entry and only gain the new functions' rows. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test is touched. In the changed php-set-functions.test.ts only the count literal and its comment change; no assertion is removed. The new php-phpdotenv-builtins.test.ts only adds assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip; evidence (i) says no added skip lines exist. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted:DIV marker and no Expectations adapted field is added. DIV-9.2 and DIV-9.17 are cited only in docblocks and messages (Ref for count; notices not raised), not as adaptation markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, base or changed, and no assigned Oracle request; the Xaravel Tests rely on a PHP probe record, not on Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-131: the probe labels cover strpos/str_replace/ltrim/rtrim/ord/strtok/addcslashes/stripcslashes results and PHP errors; the Ref count, the split-UTF-8 and lone-surrogate JS TypeErrors are asserted. XT-runtime-132: ctype labels, filter_var labels for DEFAULT/BOOLEAN/INT with NULL_ON_FAILURE, min/max/default, the filter_var.arguments TypeErrors, and the JS TypeError limit loop. XT-runtime-133: mb_* labels, the 79-encoding table, aliases and mime names, the encodings.resolve check against PHP's resolution, the ValueError labels and the non-UTF-8 JS TypeError loop. XT-runtime-134: function_exists and class_exists labels, reflection counts and ArgumentCountErrors, root/subpath identity, and strtok outside a frame, in a narrow frame, frame lifetime and two concurrent frames. The bare AD-5 citation names the Scope Frame slot rules (AD-5.7) the strtok part tests. No FR-/AD-<n>.<k> token is cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/runtime (src/php, src/traits/mixin.ts, src/index.ts, docs, tests/xaravel). No code from another component, and no stub or fake of another component, is added. The trait mark in mixin.ts is runtime's own AD-26 trait machinery, which class_exists reads. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed source file. Every new export (string, ctype, filter, mbstring, function_exists, class_exists, the FILTER_* constants) is synchronous and does no Driver IO. strtok reads and writes a frame slot synchronously and takes no callback, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"8bbb598c7857ac425972f90dae48d06718d49633","base":"5d2523fc2c2212f8268c5b1838f9991a56862207","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T14:32:00.169Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test; the prompt says it assigns no Ported Test IDs. Only Xaravel Tests in packages/runtime/tests/xaravel are touched.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is changed. In the touched Xaravel Test XT-runtime-84 (php-set-functions.test.ts), the registry count changes from 104 to 123 with an exact assertSame. That is the 19 entries this item adds to PHP_FUNCTIONS (104+19), not a looser check. The php-set-functions.probe.txt rows resolver.reflection, resolver.counts and resolver.exports keep every earlier entry and only gain the new functions' rows.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test is touched. In the changed php-set-functions.test.ts only the count literal and its comment change; no assertion is removed. The new php-phpdotenv-builtins.test.ts only adds assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip; evidence (i) says no added skip lines exist.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted:DIV marker and no Expectations adapted field is added. DIV-9.2 and DIV-9.17 are cited only in docblocks and messages (Ref for count; notices not raised), not as adaptation markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, base or changed, and no assigned Oracle request; the Xaravel Tests rely on a PHP probe record, not on Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-131: the probe labels cover strpos/str_replace/ltrim/rtrim/ord/strtok/addcslashes/stripcslashes results and PHP errors; the Ref count, the split-UTF-8 and lone-surrogate JS TypeErrors are asserted. XT-runtime-132: ctype labels, filter_var labels for DEFAULT/BOOLEAN/INT with NULL_ON_FAILURE, min/max/default, the filter_var.arguments TypeErrors, and the JS TypeError limit loop. XT-runtime-133: mb_* labels, the 79-encoding table, aliases and mime names, the encodings.resolve check against PHP's resolution, the ValueError labels and the non-UTF-8 JS TypeError loop. XT-runtime-134: function_exists and class_exists labels, reflection counts and ArgumentCountErrors, root/subpath identity, and strtok outside a frame, in a narrow frame, frame lifetime and two concurrent frames. The bare AD-5 citation names the Scope Frame slot rules (AD-5.7) the strtok part tests. No FR-/AD-<n>.<k> token is cited.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/runtime (src/php, src/traits/mixin.ts, src/index.ts, docs, tests/xaravel). No code from another component, and no stub or fake of another component, is added. The trait mark in mixin.ts is runtime's own AD-26 trait machinery, which class_exists reads.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed source file. Every new export (string, ctype, filter, mbstring, function_exists, class_exists, the FILTER_* constants) is synchronous and does no Driver IO. strtok reads and writes a frame slot synchronously and takes no callback, so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
