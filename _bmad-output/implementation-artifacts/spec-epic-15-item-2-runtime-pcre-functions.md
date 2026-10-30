---
title: 'Runtime PCRE functions phpdotenv calls: preg_match, preg_match_all, preg_split, preg_replace_callback, preg_last_error, preg_last_error_msg'
type: feature
created: '2026-10-30'
status: done
baseline_revision: 287788bef81e75febe1af35a82dc4e371aeae3c7
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/ESC-15.2-1.md
  - decisions/MAINT-2026-10-30-story-15-2.md
  - conformance/escalations/ESC-15.2-5.md
  - PORTING.md
warnings: [oversized]
deferred:
  - summary: >-
      preg_last_error() reads 0 outside a Scope Frame, so phpdotenv's Validator idiom (@preg_match($regex, '') === false && preg_last_error() === PREG_INTERNAL_ERROR) misses an invalid allowedRegexValues pattern when Dotenv loads outside a frame.
    evidence: |-
      The slot records only inside a frame by design (AD-5, as jsonLastError.ts). Whether phpdotenv's load runs
      inside a frame is decided by Story 15.2's port (Validator.php:144); it settles this by asserting an invalid
      allowedRegexValues pattern throws phpdotenv's exception where Dotenv loads. Carry it into Story 15.2's spec.
    location: >-
      packages/runtime/src/php/pcreFunctions.ts (record)
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Story 15.2 ports vlucas/phpdotenv v5.7.0, which calls `preg_match`, `preg_match_all`, `preg_split`, `preg_replace_callback` (with `$limit`), `preg_last_error` and `preg_last_error_msg` (ESC-15.2-1 part f). `@xaravel/runtime/php` exports none of them.

**Approach:** Export them from `@xaravel/runtime/php` under their PHP names with PHP 8.5.11 behaviour, taking a PHP pattern string converted by PORTING.md § PCRE conversion (DIV-10.1), with XT-runtime cases against a PHP probe. A pattern form the rule does not cover raises a new Escalation, not an invented conversion.

## Boundaries & Constraints

**Always:** scope `packages/runtime/**` and this item's records; PHP's results for every phpdotenv pattern; sync only (AD-6); `preg_last_error` state in a Scope Frame slot (AD-5).

**Never:** convert a pattern form PORTING.md does not list; change PORTING.md, a DIV, the grader or Expectations; implement item 1's builtins.

</intent-contract>

## Code Map

- `PORTING.md:241-271` -- the conversion rule (read-only): delimiters, flags `i m s u`, `(?P<n>`, `\A`, `\z`, the four ESC-15.2-5 forms, and the PCRE-only list that throws.
- `decisions/ESC-15.2-5.md`, `conformance/escalations/ESC-15.2-5.md` -- the ruling and its PHP 8.5.11 probes, which the new probe repeats.
- `packages/runtime/src/php/jsonLastError.ts` -- the Scope Frame slot pattern for `preg_last_error`: record only inside a frame, swallow `ScopeFrameException`, read `0`/`No error` outside.
- `packages/runtime/src/php/stringFunctions.ts:30,38` -- private `wellFormed` (lone surrogate → JS TypeError limit) and `decodeResult` (bytes → string, split sequence → TypeError limit); export them for the new module rather than copying (lessons: one implementation). `utf8` from `mangle.ts`.
- `packages/runtime/src/php/phpArguments.ts` -- `stringParameter`, `intParameter`, `arrayParameter`; `callables.ts:121` `callableParameter` for `preg_replace_callback`; `Ref.ts` for `$matches`/`$count`; `casts.ts` `toPhpString`, `arrayEntries`; `PhpArray`/`arrayFromEntries` for results with string and int keys.
- `packages/runtime/src/php/phpFunctions.ts:224` -- `PHP_FUNCTIONS` `entry(name, fn, required, total, variadic, byRef0Based)`; add six entries (`preg_match` by-ref index 2, `preg_match_all` 2, `preg_replace_callback` 4).
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` -- export the functions and `PREG_*` constants from both.
- `packages/runtime/docs/php-functions.md` -- new section (XT-runtime-37 reads docs for every export).
- `packages/runtime/tests/xaravel/php-phpdotenv-builtins.{probe.php,probe.txt,test.ts}` -- the probe/test pattern to copy (`out`, `attempt`, `each_call`, label map recomputed through the export).
- `packages/runtime/tests/xaravel/php-set-functions.{probe.php,probe.txt,test.ts}` -- `$registry`/`$exports` lists and the registry count (123) go stale; update and regenerate.
- phpdotenv v5.7.0 call sites (`/tmp/xorch-dotenv/src`, the Pin): `Parser/Lexer.php:13,43,49` (bracket delimiters, `A`, byte `$offset`, `[^\S\r\n]`, `\#`, `\$`), `Parser/EntryParser.php:142,146,218` (`\p{Ll}\p{Lu}\p{M}\p{N}` with `u`, branch reset, `\s`), `Parser/Lines.php:118` (`preg_match_all` of a zero-width lookahead), `Parser/Parser.php:25` (`preg_split`), `Loader/Resolver.php:69` (`preg_replace_callback` with `$limit`), `Validator.php:144` (`@preg_match($regex, '') === false && preg_last_error() === PREG_INTERNAL_ERROR`), `Util/Regex.php:37-96`.
- Last Xaravel Test ID is XT-runtime-134; new tests are XT-runtime-135..138.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/pcre.ts` (new) -- the PHP-pattern converter (delimiter and modifier parse, tokenizer, emitter, branch-reset renumbering, byte/`u` modes) and the match core (one match at a byte offset, the global iteration with PHP's empty-match retry).
- `packages/runtime/src/php/pcreFunctions.ts` (new) -- `preg_match`, `preg_match_all`, `preg_split`, `preg_replace_callback`, `preg_last_error`, `preg_last_error_msg`, the `PREG_*` constants and the frame slot.
- `packages/runtime/src/php/stringFunctions.ts` -- export `wellFormed`/`decodeResult` unchanged.
- `packages/runtime/src/php/phpFunctions.ts`, `src/php/index.ts`, `src/index.ts`, `docs/php-functions.md` -- registry entries, exports, docs.
- `packages/runtime/tests/xaravel/php-pcre-functions.probe.php`, `.probe.txt` -- PHP 8.5.11 results for every AC row, each phpdotenv pattern on the inputs below, and the six `ReflectionFunction` counts.
- `packages/runtime/tests/xaravel/php-pcre-functions.test.ts` -- XT-runtime-135 (preg_match, conversion forms, modifiers, errors), XT-runtime-136 (preg_match_all and preg_split, flags, empty matches), XT-runtime-137 (preg_replace_callback), XT-runtime-138 (preg_last_error state across two concurrent frames and outside a frame, registry counts, root/subpath identity, the `Xaravel-only` limit TypeErrors).
- `packages/runtime/tests/xaravel/php-set-functions.*` -- the lists and count the new exports make stale.

**Acceptance Criteria:**
- Given each phpdotenv pattern above with its call shape, when run on subjects that include ASCII, `é`, U+00A0, U+FEFF, `\r\n`, a backslash, quotes, `#`, `$`, `${A.B}` and a 1001-byte run, then the result, `$matches` and `preg_last_error()` equal the PHP probe's. The Lexer loop (match at each byte offset with `A`) gives PHP's token list for a whole sample `.env`.
- Given the ESC-15.2-5 probes (`(a)A` at offsets 0 and 1, branch reset on `'ab'`, `"ab"`, `ab`, `[^\S\r\n]` on U+00A0, `\s/u` on U+FEFF, `^.{2}$` on `é`), then each equals PHP.
- Given `preg_match` with `PREG_OFFSET_CAPTURE` and `PREG_UNMATCHED_AS_NULL`, a byte `$offset` (also negative, and past the end), named groups (name and number keys) and unmatched trailing and middle groups, then `$matches` and the result equal PHP's.
- Given `preg_match_all` (`PREG_PATTERN_ORDER`, `PREG_SET_ORDER`, with `OFFSET_CAPTURE`/`UNMATCHED_AS_NULL`), `preg_split` (`limit` -1, 0, 1, 2; `NO_EMPTY`, `DELIM_CAPTURE`, `OFFSET_CAPTURE`) and `preg_replace_callback` (`limit`, `$count`, string and array `pattern`/`subject` with keys kept, callback result converted to string), including patterns that match empty (`/x*/`, `/x*?/`, `/a|/`, a lookahead), then each equals PHP.
- Given a pattern PHP cannot compile (no ending delimiter, alphanumeric or backslash delimiter, unknown modifier, unbalanced `(`), a `u` subject offset inside a UTF-8 sequence, then the function returns PHP's `false` (`preg_split` and `preg_replace_callback` likewise PHP's failure value) with no warning (DIV-9.17) and `preg_last_error()`/`preg_last_error_msg()` give PHP's code and message (1 `Internal error`, 5 …offset…); a later successful call resets them to 0 / `No error`.
- Given a form outside the rule (each item in PORTING's PCRE-only list, the modifiers `x U J n r`, a backreference, `\w \W \d \D \b \B` and POSIX classes with `u`, a non-ASCII pattern character with `i` and no `u`), then the call throws a JS `TypeError` naming the limit and records no error code (`Xaravel-only`).
- Given `phpFunction("<name>")` for each new function, too few or too many arguments throw PHP's `ArgumentCountError` with PHP's counts; a non-`Ref` by-reference argument is rejected as the registry does.
- Given the full suite, `bun run harness` reports zero differences and `bun run typecheck` and `bun run lint` exit 0; `bun run fidelity:review status --item epic-15-item-2-runtime-pcre-functions --spec _bmad-output/implementation-artifacts/spec-epic-15-item-2-runtime-pcre-functions.md` prints `current`.

## Spec Change Log

- 2026-10-30, planning, blocker (divergence). Before building, every pattern phpdotenv v5.7.0 passes to `preg_*` was checked against PORTING.md § PCRE conversion, with PHP 8.5.11 and Bun 1.4.3. Four forms are not covered, and each gives a result different from PHP's if converted literally: the `A` modifier (Lexer.php:43), the branch-reset group `(?|…)` (EntryParser.php:218, which `RegExp` rejects), byte matching without `u` (the Lexer's `{1,1000}` and byte `$offset`), and `\s`/`\S` (ASCII in PCRE without `u`, without U+FEFF with `u`; Unicode with U+00A0 and U+FEFF in JS). The evidence is in `conformance/escalations/ESC-15.2-5.md`. Extending the rule changes DIV-10.1's conversion in a Protected Path, so the orchestrator may not rule on it.
- 2026-10-30, resumption (no Intent change). The Maintainer approved ESC-15.2-5 option 1 (`decisions/ESC-15.2-5.md`, #563), and PORTING.md § PCRE conversion now lists the four forms. The spec returned to `draft` over baseline `287788bef81e75febe1af35a82dc4e371aeae3c7` and was planned; nothing had been built before.
- 2026-10-30, implementation, evidence over the Design Notes' wording (no Intent change). (1) A byte-mode capture that splits a UTF-8 sequence: thrown at once, the Lexer AC fails, since group 9 of phpdotenv's Lexer pattern (`([^…]|\(|\)){1,1000}`) keeps the last single byte of `é`, which PHP holds and phpdotenv never reads. The limit is kept but thrown on read: in a list (`$matches`, `preg_split` pieces, offset pairs) such a slot is an accessor that throws the JS `TypeError` when read and is replaced on assignment; in a keyed array (named groups) it throws at once. Documented in `docs/php-functions.md` and tested (`Xaravel-only`). (2) The probe showed more forms where JS and PCRE differ, now thrown as the limit, never converted silently: a capture inside a repeated group or a repeated group that can match empty (JS resets the capture each repetition: `(a|)+`, `(a*)*`, `(?:(a)|b)+`), a capture inside a lookbehind, `\p` under `i`, properties other than general categories, non-ASCII group names, and octal escapes `\1`-`\9`. phpdotenv's patterns use none of them. (3) The emitted JS also uses the `d` flag, for capture indices.

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 29 findings — high 0, medium 5, low 18, false 5, maybe-false 1
- findings:
  - `[low]` `[patch]` blind: `\l \L \u \U` throw the limit where PHP fails to compile — PHP 8.5.11 gives false, code 1 for each (probed); routed to the compile failure, probe rows added.
  - `[low]` `[patch]` blind: top-level `[:alpha:]` matches where PHP fails — confirmed (runtime 1, PHP false/1); PCRE2's POSIX-syntax check at a class opening, probe rows.
  - `[low]` `[patch]` blind: non-ASCII group names — confirmed: PHP fails without `u`, accepts with `u`; compile failure without `u`, converted with `u`.
  - `[low]` `[patch]` blind: lone `\E` throws the limit, PHP treats it as a no-op — confirmed (`/a\E/` is 1); emits nothing now.
  - `[medium]` `[patch]` blind: not-empty retry is quadratic — the per-offset retry is the Design Notes' technique; the patch removes the per-retry `codePoints()` prefix scan (one offset table per call). The per-offset compile stays (residual risk).
  - `[medium]` `[patch]` blind: each call compiles twice and the Lexer loop is slow (747 ms on 10.8 kB) — the validating compile is now reused; the per-call subject encoding stays, as no module cache is allowed (AD-5); residual risk.
  - `[maybe-false]` `[defer]` blind: the Validator idiom fails silently outside a frame — the slot records only inside a frame by design (as `jsonLastError`); whether phpdotenv loads outside a frame is Story 15.2's to settle. Deferred, medium (unverified).
  - `[low]` `[patch]` blind: named group in `PREG_PATTERN_ORDER` holds a lazy slot though docs say keyed arrays throw at once — confirmed; now throws at once, with assertions (grouped with verification-gap 2).
  - `[low]` `[patch]` blind: docs miss `preg_match_all`'s flags ValueError and `limit` 0 — docs updated.
  - `[low]` `[patch]` blind: Not ported list misses `PREG_GREP_INVERT` and the `PCRE_*` constants — docs updated.
  - `[false]` `[reject]` edge: `\x` with no hex digit is NUL in PCRE — PHP 8.5.11 fails to compile `/a\x/` and `/[\x]/` (false, code 1), as the port does.
  - `[low]` `[patch]` edge: `\x{000000041}` fails in the port, PHP matches "A" — confirmed; leading zeros stripped before the 8-digit check.
  - `[low]` `[patch]` edge: top-level POSIX class syntax — same as blind 2.
  - `[low]` `[patch]` edge: `[[:<:]]`/`[[:>:]]` return false where PHP compiles them — confirmed (`/[[:<:]]a/` is 1 in PHP); a silent divergence, so it now throws the limit (not listed by PORTING).
  - `[low]` `[patch]` edge: `\p{}` throws the limit where PHP fails to compile — confirmed; compile failure now.
  - `[low]` `[reject]` edge: a JS `SyntaxError` on emitted source reads as PHP's compile failure — the Design Notes choose this; the emitter writes only what it parsed, and the probe rows would expose a converter bug as a result mismatch. Fix would add a second error path for a hypothetical bug.
  - `[medium]` `[patch]` edge: quadratic retry — same as blind 5.
  - `[low]` `[patch]` edge: named group pattern-order lazy slot — same as blind 8.
  - `[medium]` `[patch]` edge: a callback result with a lone surrogate records `PREG_INTERNAL_ERROR` — confirmed (also Fidelity reviewer 1); the limit is thrown outside the error-recording path, asserted in a seeded frame.
  - `[low]` `[patch]` edge: keyed match array with a split capture in `preg_replace_callback` throws with the count unwritten after recording 0 — same root as the previous row; limit throws record nothing.
  - `[low]` `[patch]` edge: array `$pattern` records 0 before a later pattern throws the limit — confirmed; every pattern compiles before any replacement.
  - `[low]` `[patch]` verification-gap 1: phpdotenv's `Lines` call shape (no `$matches`) never runs on `"é"` — `phpdotenv.occurrences` label added, runner without a Ref.
  - `[low]` `[patch]` verification-gap 2: default-order `preg_match_all` split capture untested — assertions added in XT-runtime-138.
  - `[low]` `[patch]` verification-gap 3: `pm`/`pma` replace recorded null flags/offset with 0 — runners pass the recorded arguments through.
  - `[false]` `[reject]` intent: unlisted forms converted (POSIX classes, `{,n}`, `\a`, `\e`, octal, `(?'n'`, `D S X`) — PORTING.md:243 converts any feature with a direct `RegExp` form mechanically; the bullets name spelling changes, and the PCRE-only list (and any form without a direct form) throws. The Design Notes named these forms.
  - `[false]` `[reject]` intent: no Escalation raised for the new gaps — the intent's Escalation is for a form phpdotenv needs; each new gap is a PCRE-only form that throws the limit, as PORTING.md:259 requires, and no phpdotenv pattern uses one.
  - `[false]` `[reject]` intent: tests exercise the runtime surface, not phpdotenv's call sites — the intent asks for XT-runtime cases against a PHP probe; the port is Story 15.2's.
  - `[medium]` `[patch]` fidelity reviewer 1 F-7: XT-runtime-138 does not check that a limit records no error code — same as edge 9; seeded-frame assertions added.
  - `[false]` `[reject]` fidelity reviewer 2 F-7 _(missing evidence)_: PORTING.md § PCRE conversion not in the prompt — the section (PORTING.md:241-271) lists every form XT-runtime-135 names; a missing-evidence-only reject outside F-2/F-3/F-8, noted as an evidence gap (`decisions/MAINT-2026-10-24-evidence-gaps.md`).

### 2026-10-30 — Review pass (Finalize re-check: Fidelity Review on the patched tree 55855123b5389facda7fb22667b40dca695a76d6)
- verdicts: 2 findings — high 0, medium 0, low 0, false 0, maybe-false 2
- findings:
  - `[maybe-false]` `[reject]` fidelity reviewer 1 F-7 _(missing evidence)_: PORTING.md § PCRE conversion is not in the prompt, so XT-runtime-135's "every listed form" cannot be confirmed — settled by showing PORTING.md:241-271 to the reviewers; the forms are there, so if true it would be low. Noted as an evidence gap; the review exits 0 and `status` prints `current`.
  - `[maybe-false]` `[reject]` fidelity reviewer 2 F-7 _(missing evidence)_: the same gap, also asking whether POSIX classes, `\p{^L}`, `{,n}`, bounded lookbehinds and Unicode group names come from the rule — settled the same way (PORTING.md:243, direct `RegExp` forms). Noted as an evidence gap.

## Design Notes

**Converter.** Parse PHP's way: skip leading whitespace; the delimiter is any non-alphanumeric, non-backslash, non-NUL byte, and `( [ { <` close with their pair, nesting counted; the modifiers follow. Unknown modifier letters, a missing end delimiter and a bad delimiter are PHP compile failures (`false`, code 1). Accepted modifiers: `i m s u A D`, plus `S` and `X`, which change nothing in PHP 8.5 (`preg_match('/a/X','a')` is 1). `x U J n r` throw the limit. Then tokenize the body and emit JS per token, never by string replacement: an identity escape of a non-alphanumeric (`\#`, `\$`) becomes the literal (escaped where JS needs it), a `{` or `}` that is not a quantifier becomes `\{`/`\}`, `\xHH`/`\x{H…}` become `\x`/`\u{…}`, `(?P<n>` becomes `(?<n>`, `\A` becomes `(?<![\s\S])` and `\z` becomes `(?![\s\S])` (the rule's `^`/`$` with no `m`, written so `m` cannot change them). Emitted JS always uses the `u` flag; the subject is a byte string (one code unit per byte) without `u` and the UTF-16 string with `u`, and every offset in and out is converted to bytes.

Features with a direct `RegExp` form that JS spells differently are emitted in PCRE's meaning (the rule's mechanical conversion, PORTING.md:243): `.` is `[^\n]` (without `s`); `$` with no `m`/`D` is `(?=\n?(?![\s\S]))`, with `D` `(?![\s\S])`; with `m`, `^` is `(?<![\s\S])|(?<=\n)` and `$` is `(?=\n|(?![\s\S]))`; without `u`, `\s` is `[\t\n\v\f\r ]` and `\S` its complement (also inside a class); with `u`, `\s` is PHP 8.5.11's (PCRE2 10.49, UCP) set, measured over every code point: `[\t\n\v\f\r \x85\xA0 ᠎ -     　]` (no U+FEFF; U+0085 and U+180E included, unlike JS), and `\S` its complement; the probe re-checks the whole set. Without `u`, `\d \w \b` already mean ASCII in JS `u` mode and pass through.

Thrown as the limit (JS `TypeError` naming the form): PORTING's PCRE-only list; backreferences in any spelling (PCRE fails an unset group's backreference, JS matches empty, so no exact form exists); with `u`, `\w \W \d \D \b \B` and POSIX classes (PHP's UCP makes them Unicode); without `u`, `i` with a non-ASCII pattern character or a class range reaching above 0x7F (PCRE's C tables fold ASCII only). A converted body JS still rejects is a PHP compile failure (code 1).

**Branch reset.** `(?|A|B)` compiles as `(?:A|B)` with each alternative's groups as their own JS groups; a group-number map sends JS group k to PHP number n, the start number for each alternative being the reset's opening number, and the next number after the group is the highest any alternative reached. A PHP number reads the one JS group of it that participated. Named groups inside a branch reset throw the limit. Nested resets use the same map recursively.

**Matching.** One core: match at byte offset p, sticky (`y`) for `A` and for PHP's empty-match retry, else a forward search. Iteration (`preg_match_all`, `preg_split`, `preg_replace_callback`) ports `php_pcre.c`: after an empty match at p, retry at p anchored and not-empty; if that fails, advance one byte (one code point with `u`). The not-empty retry may be a second compiled pattern that rejects a match ending at p (for example `(?:body)(?<!(?<![\s\S])[\s\S]{p})`, built per p). With `u`, an offset not at a code-point start is error 5; a lone surrogate in a subject or pattern throws the runtime's existing limit via `wellFormed`. Captures in byte mode are decoded with `decodeResult` (a split sequence throws its limit). No module cache: compile per call (AD-5); the Lexer's cost is one compile per token.

**Results.** `$matches` as PHP builds it: numbered keys, a named group under its name then its number; without `UNMATCHED_AS_NULL` trailing unmatched groups are dropped and middle ones are `""` (`[-1]` offset under `OFFSET_CAPTURE`); with it every group is present as `null`. `preg_replace_callback` passes the same array and converts the callback's result with `toPhpString`. `preg_last_error` is a Scope Frame slot set by every call (0 on success), as `jsonLastError.ts`.

## Verification

**Commands:**
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-pcre-functions.probe.php | diff - php-pcre-functions.probe.txt` -- expected: no output; the same for `php-set-functions`.
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: zero differences.
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run harness` -- expected: zero differences (NOT-RUN Variants allowed).
- `bun run fidelity:review status --item epic-15-item-2-runtime-pcre-functions --spec _bmad-output/implementation-artifacts/spec-epic-15-item-2-runtime-pcre-functions.md` -- expected: `current`.

## Auto Run Result

Status: done
Earlier run: blocked on ESC-15.2-5 (`divergence`) before building; the Maintainer approved option 1 (`decisions/ESC-15.2-5.md`), and this run resumed from the Intent.

**Summary.** `@xaravel/runtime/php` (and the package root) now export `preg_match`, `preg_match_all`, `preg_split`, `preg_replace_callback`, `preg_last_error`, `preg_last_error_msg` and the `PREG_*` constants, with PHP 8.5.11 behaviour. A tokenizing converter turns the PHP pattern string into a `RegExp` under PORTING.md § PCRE conversion, including the four ESC-15.2-5 forms: `A` → sticky, branch reset renumbered, byte matching without `u`, and PCRE's `\s`. Forms with no exact `RegExp` form throw the JS `TypeError` limit. Compile failures return PHP's `false` with error 1 and no warning (DIV-9.17). The last error lives in a Scope Frame slot. Six registry entries were added (123 → 129).

**Files changed.**
- `packages/runtime/src/php/pcre.ts` (new): the converter and the match core.
- `packages/runtime/src/php/pcreFunctions.ts` (new): the six functions, the constants and the frame slot.
- `packages/runtime/src/php/stringFunctions.ts`: exports `wellFormed`/`decodeResult`.
- `packages/runtime/src/php/phpFunctions.ts`, `src/php/index.ts`, `src/index.ts`: registry entries and exports.
- `packages/runtime/docs/php-functions.md`: a PCRE functions section and its Not-ported items.
- `packages/runtime/tests/xaravel/php-pcre-functions.{probe.php,probe.txt,test.ts}`: XT-runtime-135..138 against PHP 8.5.11.
- `packages/runtime/tests/xaravel/php-set-functions.*`: the registry lists and count.

**Review.** Pass 1 had 29 findings (Review Triage Log).
- Patched, 21 rows in 16 entries: medium 3 entries (the limit recorded as an error code, also Fidelity reviewer 1's F-7; the not-empty retry's prefix scan; the double compile), low 13 (compile failures for `\l \L \u \U [\N]`, top-level POSIX and `\p{}`; `[[:<:]]`/`[[:>:]]` as limits; Unicode group names under `u`; lone `\E`; `\x{0…}`; the named-group lazy slot; array-pattern ordering; three test gaps; docs).
- Deferred 1: preg_last_error outside a frame and phpdotenv's Validator idiom, medium (unverified), for Story 15.2.
- Rejected 7: `\x` without digits (PHP fails too, probed); a JS `SyntaxError` read as a compile failure (Design Notes' choice, low); the three intent-alignment readings (PORTING.md:243 converts direct forms, PCRE-only gaps throw per PORTING.md:259, the call sites are Story 15.2's); and Fidelity reviewer 2's missing-evidence F-7.

Pass 2 was the Finalize re-check: the Fidelity Review ran on tree `55855123b5389facda7fb22667b40dca695a76d6`. Both reviewers' rejects are F-7 missing evidence only (PORTING.md § PCRE conversion is not in the prompt), noted as evidence gaps under `decisions/MAINT-2026-10-24-evidence-gaps.md`. `status` prints `current`.

**Follow-up review recommended: false.** Patched counts by entry verdict: high 0, medium 3, low 13. Three mediums were patched, but each now has covering assertions: seeded-frame limit cases, and the cost changes under the full probe. The Fidelity Review re-ran on the patched tree, so no unverified risk remains to name.

**Verification.**
- Both probes diff clean against PHP 8.5.11.
- `bun run typecheck` and `bun run lint` exit 0.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`; Xaravel Tests 513, 508 passed, 0 failed, 5 skipped.
- `fidelity:review status --item epic-15-item-2-runtime-pcre-functions` prints `current`.

**Residual risks.**
- **Speed.** Each call encodes the subject and compiles once, and the not-empty retry compiles once per empty match. phpdotenv's Lexer on a large `.env` is slow (about 0.7 s for 10.8 kB before the patches).
- **No backtracking limits.** PCRE's backtrack, recursion and JIT limits are not reproduced.
- **Case folding.** Under `iu` it is JS's simple case folding.
- **Byte-mode split captures** are lazy slots in lists.
- **The deferred Validator idiom outside a frame.**

## Fidelity Review

### Reviewer 1: reject at tree bc28074a4de46afb479ce82423ac2db87a0f6dcc

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `287788bef81e75febe1af35a82dc4e371aeae3c7`, on 2026-10-30T15:59:25.324Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or changes no Ported Tests or assigned Ported Test IDs. |
| F-2: No expected value is weakened | pass | Probe results retain exact comparisons, including exception classes and messages. The registry count increases from 123 to 129 for the six added functions; no existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared the touched Xaravel Test bodies and helpers with their declared consequences. XT-runtime-138 does not verify its full error-state claim for values JS cannot hold. |
| F-8: No stub, fake or partial implementation of another Component | pass | All reviewed changes are within packages/runtime, the authorized component. The PCRE implementation and registry additions implement runtime behavior without stubbing another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed declarations with AD-6 and DIV-1. The new matching, conversion and replacement functions are synchronous, perform no IO, and require no async-root tags; the supplied declaration inventory reports no retained tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-pcre-functions.test.ts`: XT-runtime-138 claims that an unrepresentable value throws without recording an error code, but its unrepresentable-value cases only check the thrown message. Run these cases inside a frame seeded with a known error and assert that the code remains unchanged. In particular, preg_replace_callback with a lone-surrogate callback result currently reaches replaceOne's catch, which records PREG_INTERNAL_ERROR, contradicting this declared consequence.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"bc28074a4de46afb479ce82423ac2db87a0f6dcc","base":"287788bef81e75febe1af35a82dc4e371aeae3c7","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T15:59:25.324Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or changes no Ported Tests or assigned Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Probe results retain exact comparisons, including exception classes and messages. The registry count increases from 123 to 129 for the six added functions; no existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this item.","findings":[]},{"id":"F-7","result":"fail","note":"Compared the touched Xaravel Test bodies and helpers with their declared consequences. XT-runtime-138 does not verify its full error-state claim for values JS cannot hold.","findings":[{"path":"packages/runtime/tests/xaravel/php-pcre-functions.test.ts","detail":"XT-runtime-138 claims that an unrepresentable value throws without recording an error code, but its unrepresentable-value cases only check the thrown message. Run these cases inside a frame seeded with a known error and assert that the code remains unchanged. In particular, preg_replace_callback with a lone-surrogate callback result currently reaches replaceOne's catch, which records PREG_INTERNAL_ERROR, contradicting this declared consequence.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"All reviewed changes are within packages/runtime, the authorized component. The PCRE implementation and registry additions implement runtime behavior without stubbing another component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed declarations with AD-6 and DIV-1. The new matching, conversion and replacement functions are synchronous, perform no IO, and require no async-root tags; the supplied declaration inventory reports no retained tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree bc28074a4de46afb479ce82423ac2db87a0f6dcc

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `287788bef81e75febe1af35a82dc4e371aeae3c7`, on 2026-10-30T15:59:25.324Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The item adds or changes no Ported Test or Expectations line (no Inventory rows assigned); only Xaravel Tests under packages/runtime/tests/xaravel/ are touched. |
| F-2: No expected value is weakened | pass | The only changed expected values are in php-set-functions: the registry count goes from 123 to 129 (6 new preg_* entries), and the probe's $registry/$exports lists and the recorded reflection/counts/exports rows gain the 6 preg_* entries with their PHP 8.5.11 counts. Nothing is loosened: the assertions stay assertSame on exact JSON. The new PCRE tests compare each recorded PHP result exactly, call by call (assertLabels / splitJsonList). |
| F-3: No assertion is removed without a DIV clause | pass | No assertion is removed in any touched test. php-set-functions.test.ts changes only the count literal and its comment; php-pcre-functions.test.ts is new. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted:DIV-<n>.<k> marker or Expectations adapted field is added. DIV-10.1 and DIV-9.2/9.17 are cited only in docs and comments. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item relies on no Oracle fixture. Evidence (c) lists no error fixtures, and the tests use PHP probe output instead. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared each consequence string with its test body. XT-runtime-136 and 137 run every recorded probe call for preg_match_all, preg_split, preg_replace_callback and the phpdotenv Lines/Parser/Resolver patterns. XT-runtime-138 checks the frame-slot behaviour: outside a frame, in a narrow frame, a frame's code not outliving it, and two concurrent frames. It also checks registry counts against reflection, root/subpath identity for the functions and constants, the JS TypeError limit for out-of-rule forms with the code staying 1, and the UTF-8-split and lone-surrogate limits. AD-5 is cited bare, with no bullet named. XT-runtime-135 claims coverage of 'every conversion form PORTING.md § PCRE conversion lists', but PORTING.md is not in the prompt, so that claim cannot be confirmed. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/runtime (src, docs, tests/xaravel). No other Component's behaviour is stubbed or faked. The test fixtures Text and Plain are local probe counterparts registered under XaravelFixture names. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any changed src file. All new exports are synchronous: preg_*, the PREG_* constants, wellFormed and decodeResult. Their callbacks are called synchronously, and none performs IO, so none needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-pcre-functions.test.ts`: XT-runtime-135's consequence claims it covers every conversion form PORTING.md § PCRE conversion lists. The prompt does not include PORTING.md § PCRE conversion, and the diff does not change it, although ESC-15.2-5 says the rule is extended. So I cannot confirm that the probe labels cover every listed form. I also cannot confirm that the converted forms beyond ESC-15.2-5's four (POSIX classes, \p{^L}, {,n} quantifiers, bounded lookbehinds) come from the rule rather than being invented. Supply that PORTING.md section, or narrow the consequence string. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"bc28074a4de46afb479ce82423ac2db87a0f6dcc","base":"287788bef81e75febe1af35a82dc4e371aeae3c7","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T15:59:25.324Z","items":[{"id":"F-1","result":"n/a","note":"The item adds or changes no Ported Test or Expectations line (no Inventory rows assigned); only Xaravel Tests under packages/runtime/tests/xaravel/ are touched.","findings":[]},{"id":"F-2","result":"pass","note":"The only changed expected values are in php-set-functions: the registry count goes from 123 to 129 (6 new preg_* entries), and the probe's $registry/$exports lists and the recorded reflection/counts/exports rows gain the 6 preg_* entries with their PHP 8.5.11 counts. Nothing is loosened: the assertions stay assertSame on exact JSON. The new PCRE tests compare each recorded PHP result exactly, call by call (assertLabels / splitJsonList).","findings":[]},{"id":"F-3","result":"pass","note":"No assertion is removed in any touched test. php-set-functions.test.ts changes only the count literal and its comment; php-pcre-functions.test.ts is new.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted:DIV-<n>.<k> marker or Expectations adapted field is added. DIV-10.1 and DIV-9.2/9.17 are cited only in docs and comments.","findings":[]},{"id":"F-6","result":"n/a","note":"The item relies on no Oracle fixture. Evidence (c) lists no error fixtures, and the tests use PHP probe output instead.","findings":[]},{"id":"F-7","result":"fail","note":"I compared each consequence string with its test body. XT-runtime-136 and 137 run every recorded probe call for preg_match_all, preg_split, preg_replace_callback and the phpdotenv Lines/Parser/Resolver patterns. XT-runtime-138 checks the frame-slot behaviour: outside a frame, in a narrow frame, a frame's code not outliving it, and two concurrent frames. It also checks registry counts against reflection, root/subpath identity for the functions and constants, the JS TypeError limit for out-of-rule forms with the code staying 1, and the UTF-8-split and lone-surrogate limits. AD-5 is cited bare, with no bullet named. XT-runtime-135 claims coverage of 'every conversion form PORTING.md § PCRE conversion lists', but PORTING.md is not in the prompt, so that claim cannot be confirmed.","findings":[{"path":"packages/runtime/tests/xaravel/php-pcre-functions.test.ts","detail":"XT-runtime-135's consequence claims it covers every conversion form PORTING.md § PCRE conversion lists. The prompt does not include PORTING.md § PCRE conversion, and the diff does not change it, although ESC-15.2-5 says the rule is extended. So I cannot confirm that the probe labels cover every listed form. I also cannot confirm that the converted forms beyond ESC-15.2-5's four (POSIX classes, \\p{^L}, {,n} quantifiers, bounded lookbehinds) come from the rule rather than being invented. Supply that PORTING.md section, or narrow the consequence string.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/runtime (src, docs, tests/xaravel). No other Component's behaviour is stubbed or faked. The test fixtures Text and Plain are local probe counterparts registered under XaravelFixture names.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any changed src file. All new exports are synchronous: preg_*, the PREG_* constants, wellFormed and decodeResult. Their callbacks are called synchronously, and none performs IO, so none needs a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 55855123b5389facda7fb22667b40dca695a76d6

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `287788bef81e75febe1af35a82dc4e371aeae3c7`, on 2026-10-30T16:14:26.360Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change assigns and modifies no Ported Tests. |
| F-2: No expected value is weakened | pass | The probe comparisons remain exact. The registry count increases from 123 to 129 for the six added functions; existing expected entries are retained. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The test bodies and PHP probes cover the stated matching, splitting, replacement, registry and frame cases. P-1 is fixed, but XT-runtime-135's exhaustive conversion claim remains unverifiable without the cited PORTING.md section. |
| F-8: No stub, fake or partial implementation of another Component | pass | All shown changes stay within packages/runtime, the action item's declared component. No other component's implementation is stubbed or faked. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source declarations contain no asyncRoot tags. The new functions perform synchronous computation and accept synchronous callbacks, so AD-6 requires no new tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-pcre-functions.test.ts`: P-2 remains unresolved: supply PORTING.md § PCRE conversion, including the ESC-15.2-5 extension, or narrow XT-runtime-135's consequence to the explicitly evidenced forms. The supplied decisions establish four extensions but do not establish the complete rule or authorize every additional converted construct. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-pcre-functions.test.ts`: XT-runtime-138 claims that an unrepresentable value throws without recording an error code, but its unrepresentable-value cases only check the thrown message. Run these cases inside a frame seeded with a known error and assert that the code remains unchanged. In particular, preg_replace_callback with a lone-surrogate callback result currently reaches replaceOne's catch, which records PREG_INTERNAL_ERROR, contradicting this declared consequence. **fixed**: XT-runtime-138 now seeds error 5 inside a frame and checks it survives the listed limit failures. Callback-result wellFormed validation now occurs outside replaceOne's catch, preserving the error code and count Ref.
- **P-2** (reviewer 2, F-7) `packages/runtime/tests/xaravel/php-pcre-functions.test.ts`: XT-runtime-135's consequence claims it covers every conversion form PORTING.md § PCRE conversion lists. The prompt does not include PORTING.md § PCRE conversion, and the diff does not change it, although ESC-15.2-5 says the rule is extended. So I cannot confirm that the probe labels cover every listed form. I also cannot confirm that the converted forms beyond ESC-15.2-5's four (POSIX classes, \p{^L}, {,n} quantifiers, bounded lookbehinds) come from the rule rather than being invented. Supply that PORTING.md section, or narrow the consequence string. **not fixed**: PORTING.md § PCRE conversion is still absent, and XT-runtime-135 still claims coverage of every form it lists. The supplied ESC-15.2-5 decision does not supply the complete section.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"55855123b5389facda7fb22667b40dca695a76d6","base":"287788bef81e75febe1af35a82dc4e371aeae3c7","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T16:14:26.360Z","items":[{"id":"F-1","result":"n/a","note":"The change assigns and modifies no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The probe comparisons remain exact. The registry count increases from 123 to 129 for the six added functions; existing expected entries are retained.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this change.","findings":[]},{"id":"F-7","result":"fail","note":"The test bodies and PHP probes cover the stated matching, splitting, replacement, registry and frame cases. P-1 is fixed, but XT-runtime-135's exhaustive conversion claim remains unverifiable without the cited PORTING.md section.","findings":[{"path":"packages/runtime/tests/xaravel/php-pcre-functions.test.ts","detail":"P-2 remains unresolved: supply PORTING.md § PCRE conversion, including the ESC-15.2-5 extension, or narrow XT-runtime-135's consequence to the explicitly evidenced forms. The supplied decisions establish four extensions but do not establish the complete rule or authorize every additional converted construct.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"All shown changes stay within packages/runtime, the action item's declared component. No other component's implementation is stubbed or faked.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source declarations contain no asyncRoot tags. The new functions perform synchronous computation and accept synchronous callbacks, so AD-6 requires no new tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-pcre-functions.test.ts","detail":"XT-runtime-138 claims that an unrepresentable value throws without recording an error code, but its unrepresentable-value cases only check the thrown message. Run these cases inside a frame seeded with a known error and assert that the code remains unchanged. In particular, preg_replace_callback with a lone-surrogate callback result currently reaches replaceOne's catch, which records PREG_INTERNAL_ERROR, contradicting this declared consequence.","fixed":true,"note":"XT-runtime-138 now seeds error 5 inside a frame and checks it survives the listed limit failures. Callback-result wellFormed validation now occurs outside replaceOne's catch, preserving the error code and count Ref."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/php-pcre-functions.test.ts","detail":"XT-runtime-135's consequence claims it covers every conversion form PORTING.md § PCRE conversion lists. The prompt does not include PORTING.md § PCRE conversion, and the diff does not change it, although ESC-15.2-5 says the rule is extended. So I cannot confirm that the probe labels cover every listed form. I also cannot confirm that the converted forms beyond ESC-15.2-5's four (POSIX classes, \\p{^L}, {,n} quantifiers, bounded lookbehinds) come from the rule rather than being invented. Supply that PORTING.md section, or narrow the consequence string.","fixed":false,"note":"PORTING.md § PCRE conversion is still absent, and XT-runtime-135 still claims coverage of every form it lists. The supplied ESC-15.2-5 decision does not supply the complete section."}]}
```

### Reviewer 2: reject at tree 55855123b5389facda7fb22667b40dca695a76d6

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `287788bef81e75febe1af35a82dc4e371aeae3c7`, on 2026-10-30T16:14:26.360Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line, so it has no Ported Test or Inventory row to compare with Upstream. |
| F-2: No expected value is weakened | pass | The changed expected values are the PHP 8.5.11 probe records. In php-set-functions, the registry count goes from 123 to 129 and the probe records add six preg_* rows. Every comparison is exact (assertSame, and per-call JSON equality in assertLabels). No expectation was loosened. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test changes. The php-set-functions edits only extend the registry lists, counts and probe records with the six new functions. No assertion was removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted:DIV marker and no Expectations adapted field is added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixture is assigned or changed. The tests rely on PHP probe records, not fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-136, XT-runtime-137 and XT-runtime-138 check what their consequence strings claim. XT-runtime-138 now also seeds error 5 and checks no limit changes it, which the code supports. XT-runtime-135 still claims to cover every conversion form PORTING.md § PCRE conversion lists, and that section is neither in the prompt nor changed by the diff. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/runtime, the item's only component. No other Component's behaviour is stubbed or faked. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tag is added or kept in the touched files. preg_replace_callback calls its callback synchronously, as the existing runtime callback functions do. Every new export is synchronous and does no IO, so none needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-pcre-functions.test.ts`: P-2 is still open. XT-runtime-135's consequence claims coverage of every conversion form PORTING.md § PCRE conversion lists, but that section is not in the prompt and the diff does not change PORTING.md, although ESC-15.2-5 says the rule is extended. So two things cannot be confirmed: that the probe labels cover every listed form, and that the converted forms beyond ESC-15.2-5's four (POSIX classes, \p{^L}, {,n} quantifiers, bounded lookbehinds, Unicode group names) come from the rule. Supply the PORTING.md section, or narrow the consequence string to the forms ESC-15.2-5 and DIV-10.1 name. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-pcre-functions.test.ts`: XT-runtime-138 claims that an unrepresentable value throws without recording an error code, but its unrepresentable-value cases only check the thrown message. Run these cases inside a frame seeded with a known error and assert that the code remains unchanged. In particular, preg_replace_callback with a lone-surrogate callback result currently reaches replaceOne's catch, which records PREG_INTERNAL_ERROR, contradicting this declared consequence. **fixed**: XT-runtime-138 now runs each limit case inside a frame seeded with error 5 and asserts the code is still 5 afterwards. The cases include a lone surrogate in a callback result, a split capture in a keyed argument, out-of-rule forms and later out-of-rule array patterns. In replaceOne, wellFormed(fn, result) is outside the try/catch, so the TypeError propagates before any record() call and before count is set, matching the test.
- **P-2** (reviewer 2, F-7) `packages/runtime/tests/xaravel/php-pcre-functions.test.ts`: XT-runtime-135's consequence claims it covers every conversion form PORTING.md § PCRE conversion lists. The prompt does not include PORTING.md § PCRE conversion, and the diff does not change it, although ESC-15.2-5 says the rule is extended. So I cannot confirm that the probe labels cover every listed form. I also cannot confirm that the converted forms beyond ESC-15.2-5's four (POSIX classes, \p{^L}, {,n} quantifiers, bounded lookbehinds) come from the rule rather than being invented. Supply that PORTING.md section, or narrow the consequence string. **not fixed**: The XT-runtime-135 consequence string is unchanged. PORTING.md § PCRE conversion is still not in the prompt, and the diff does not change PORTING.md.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"55855123b5389facda7fb22667b40dca695a76d6","base":"287788bef81e75febe1af35a82dc4e371aeae3c7","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T16:14:26.360Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line, so it has no Ported Test or Inventory row to compare with Upstream.","findings":[]},{"id":"F-2","result":"pass","note":"The changed expected values are the PHP 8.5.11 probe records. In php-set-functions, the registry count goes from 123 to 129 and the probe records add six preg_* rows. Every comparison is exact (assertSame, and per-call JSON equality in assertLabels). No expectation was loosened.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test changes. The php-set-functions edits only extend the registry lists, counts and probe records with the six new functions. No assertion was removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted:DIV marker and no Expectations adapted field is added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixture is assigned or changed. The tests rely on PHP probe records, not fixtures.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-136, XT-runtime-137 and XT-runtime-138 check what their consequence strings claim. XT-runtime-138 now also seeds error 5 and checks no limit changes it, which the code supports. XT-runtime-135 still claims to cover every conversion form PORTING.md § PCRE conversion lists, and that section is neither in the prompt nor changed by the diff.","findings":[{"path":"packages/runtime/tests/xaravel/php-pcre-functions.test.ts","detail":"P-2 is still open. XT-runtime-135's consequence claims coverage of every conversion form PORTING.md § PCRE conversion lists, but that section is not in the prompt and the diff does not change PORTING.md, although ESC-15.2-5 says the rule is extended. So two things cannot be confirmed: that the probe labels cover every listed form, and that the converted forms beyond ESC-15.2-5's four (POSIX classes, \\p{^L}, {,n} quantifiers, bounded lookbehinds, Unicode group names) come from the rule. Supply the PORTING.md section, or narrow the consequence string to the forms ESC-15.2-5 and DIV-10.1 name.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/runtime, the item's only component. No other Component's behaviour is stubbed or faked.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tag is added or kept in the touched files. preg_replace_callback calls its callback synchronously, as the existing runtime callback functions do. Every new export is synchronous and does no IO, so none needs a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-pcre-functions.test.ts","detail":"XT-runtime-138 claims that an unrepresentable value throws without recording an error code, but its unrepresentable-value cases only check the thrown message. Run these cases inside a frame seeded with a known error and assert that the code remains unchanged. In particular, preg_replace_callback with a lone-surrogate callback result currently reaches replaceOne's catch, which records PREG_INTERNAL_ERROR, contradicting this declared consequence.","fixed":true,"note":"XT-runtime-138 now runs each limit case inside a frame seeded with error 5 and asserts the code is still 5 afterwards. The cases include a lone surrogate in a callback result, a split capture in a keyed argument, out-of-rule forms and later out-of-rule array patterns. In replaceOne, wellFormed(fn, result) is outside the try/catch, so the TypeError propagates before any record() call and before count is set, matching the test."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/php-pcre-functions.test.ts","detail":"XT-runtime-135's consequence claims it covers every conversion form PORTING.md § PCRE conversion lists. The prompt does not include PORTING.md § PCRE conversion, and the diff does not change it, although ESC-15.2-5 says the rule is extended. So I cannot confirm that the probe labels cover every listed form. I also cannot confirm that the converted forms beyond ESC-15.2-5's four (POSIX classes, \\p{^L}, {,n} quantifiers, bounded lookbehinds) come from the rule rather than being invented. Supply that PORTING.md section, or narrow the consequence string.","fixed":false,"note":"The XT-runtime-135 consequence string is unchanged. PORTING.md § PCRE conversion is still not in the prompt, and the diff does not change PORTING.md."}]}
```
