---
title: 'Runtime builtins phpdotenv calls: strings, ctype, mbstring, function_exists, class_exists, filter_var'
type: feature
created: '2026-10-30'
status: blocked
baseline_revision: 56cdd4756ee4406eff89442e63e8337649fefdd3
review_loop_iteration: 0
followup_review_recommended: false
context:
  - decisions/ESC-15.2-1.md
  - decisions/MAINT-2026-10-30-story-15-2.md
  - decisions/MAINT-2026-10-26-runtime-builtins.md
  - packages/runtime/docs/php-functions.md
  - AGENTS.md
warnings: [oversized]
deferred: []
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

## Review Triage Log

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

Status: blocked
Blocking condition: XT-conformance-269 (`conformance/tests/xaravel/builtin-scan.test.ts`, a Protected Path) goes stale once the runtime exports the builtins this item adds, and neither the 2026-10-22 amendment nor `decisions/MAINT-2026-10-24-stale-cross-scope-tests.md` lets the item edit `conformance/**`.

**What went stale.** The test's scan reads `@xaravel/runtime/php`'s live exports. Its `collections` fixture lists `function function_exists calls=1 … helpers.php:3` as a builtin the runtime does not export, and its `ai` fixture lists `function strtok calls=1 … GatewayTest.php:4`; this item exports both, so the expected listings lose those lines and the summaries count one function fewer each (`collections: 5 function(s)`, `ai: 1 function(s)`). Confirmed: `bun run harness --xaravel --id 'XT-conformance-269'` fails with the attempt applied. Proposed fix for the Maintainer: point each fixture at a builtin the runtime still lacks (for example `str_pad`-style names already in the fixture's missing list), so the test keeps asserting the same property with no assertion removed.

**The attempt.** All 19 builtins, the `FILTER_*` constants, 19 registry entries (104 → 123), docs, the PHP 8.5.11 probe and XT-runtime-131..134 were built and checked: both probes diff clean against PHP, `bun run harness --xaravel --id 'XT-runtime-*'` 131/131 pass, `bun run typecheck` and `bun run lint` exit 0, and the full harness's only difference was XT-conformance-269. One runtime change outside the new functions: `src/traits/mixin.ts` marks a composed trait with a non-enumerable `Symbol.for('xaravel.traits.trait')` so `class_exists` returns false for it (Spec Change Log item 3). The Fidelity Review was not run, since the fix changes the reviewed tree. The attempt is saved as `retro-15-phpdotenv-builtins-attempt-1.patch` (apply with `git apply`), and the code is reverted; after a ruling, the item resumes from the patch, applies the approved test change, and runs the full review.
