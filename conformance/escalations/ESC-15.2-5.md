---
test_ids:
  - XT-config-3
trigger: divergence
proposed: >-
  Option 1 (recommended): extend PORTING.md § PCRE conversion (DIV-10.1,
  no new DIV clause) so the runtime's `preg_*` functions (action item
  `epic-15-item-2-runtime-pcre-functions`) can take every pattern
  vlucas/phpdotenv v5.7.0 uses and give PHP's results: (1) the `A`
  modifier converts to the `RegExp` sticky flag `y`, which anchors each
  match at the start offset as PCRE_ANCHORED does; (2) the branch-reset
  group `(?|…)` is emulated by the runtime's converter: each alternative's
  groups are compiled as separate `RegExp` groups and remapped to the
  shared numbers in the match array PHP returns (for phpdotenv's one use,
  `$matches[1]` is whichever alternative's group matched); (3) a pattern
  without `u` matches the subject's UTF-8 bytes, as PCRE does (the
  subject is converted to a byte string, one code unit per byte, and
  offsets, lengths and quantifier counts are in bytes), and `\s`, `\S`,
  `\d`, `\w` and `\b` keep PCRE's ASCII meanings in it; (4) with `u`,
  `\s` and `\S` are rewritten to PCRE2's UCP whitespace set, which leaves
  out U+FEFF that JavaScript's `\s` includes. Any other PCRE-only form
  stays a JS `TypeError` naming the limit, never a silent conversion.
  Option 2: keep the rule as is; the runtime exports `preg_*` for the
  rule's forms only, and Story 15.2 hand-writes `RegExp`s for phpdotenv's
  patterns under DIV-10.1. That cannot express the branch-reset group
  without renumbering `$matches`, and the Lexer and the `allowedRegexValues`
  validator would see Unicode whitespace and UTF-16 code units where PHP
  sees ASCII whitespace and bytes, so a value holding U+00A0 lexes
  differently from the Oracle.
evidence: >-
  Patterns in vlucas/phpdotenv v5.7.0 (the Pin,
  conformance/oracle/locks/framework/composer.lock:5452, reference
  301c07936b16d88628b126b01d082ba153cf4c40):
  Parser/Lexer.php:43 `'(('.implode(')|(', PATTERNS).'))A'` (bracket
  delimiters, the `A` modifier, matched with a byte `$offset`);
  Parser/EntryParser.php:218
  `~\A(?|([^\s\\\\'"#$]{1,1000})|'([^']*)'|"([^"\\\\$]*)")\z~` (branch
  reset); EntryParser.php:146 `~\A[\p{Ll}\p{Lu}\p{M}\p{N}_.]+\z~u`;
  Parser/Lines.php:118 `/(?=([^\\\\]"))/`; Parser/Parser.php:25
  `/(\r\n|\n|\r)/`; Loader/Resolver.php:70 `/\A\${([a-zA-Z0-9_.]+)}/`;
  Validator.php:144 a user-supplied pattern. PORTING.md § PCRE conversion
  lists the flags `i`, `m`, `s`, `x`, `u` and the forms named groups, `\A`,
  `\z` and delimiters; it does not list `A`, `(?|…)`, byte matching or
  `\s`. Checked on 2026-10-30 with PHP 8.5.11 and Bun 1.4.3:
  `new RegExp("^(?|(a)|b(c))$")` throws "unrecognized character after
  (?", while PHP's EntryParser pattern on `'ab'` gives `[0 => "'ab'", 1 =>
  "ab"]`; `preg_match('/[^\S\r\n]{1,1000}/', "\u{00A0}")` is 0 and the JS
  `/[^\S\r\n]{1,1000}/.test(" ")` is true; `preg_match('/\s/u',
  "\u{FEFF}")` is 0 and `/\s/u.test("﻿")` is true;
  `preg_match('/^.{2}$/', "é")` is 1 and `/^.{2}$/.test("é")` is false;
  `preg_match('(a)A', "ba", $m, 0, 1)` is 1 and at offset 0 is 0, as a
  sticky `/a/y` with `lastIndex` 1 and 0 gives.
---

# ESC-15.2-5: PCRE forms phpdotenv uses that PORTING.md's conversion rule does not cover

Action item `epic-15-item-2-runtime-pcre-functions` exports `preg_match`, `preg_match_all`, `preg_split`, `preg_replace_callback`, `preg_last_error` and `preg_last_error_msg`, taking a PHP pattern converted by PORTING.md § PCRE conversion (DIV-10.1). The item and `decisions/ESC-15.2-1.md` say a form the rule does not cover raises a new Escalation instead of an invented conversion. Four forms phpdotenv v5.7.0 relies on are not covered, and each gives a different result from PHP if converted literally:

1. The `A` (anchored) modifier on the Lexer's pattern. `RegExp`'s sticky flag `y` is its direct form, but the rule does not list it.
2. The branch-reset group `(?|…)` in `EntryParser::parseValue`'s single-quoted and double-quoted fast path. `RegExp` has no form for it, so the converter must emulate it by renumbering groups.
3. Matching without `u`. PCRE matches bytes: the Lexer's `{1,1000}` counts bytes, `$offset` is a byte offset, and `.` takes one byte. `RegExp` works on UTF-16 code units.
4. `\s` and `\S`. Without `u`, PCRE's `\s` is ASCII whitespace; with `u` (PHP sets UCP), it is Unicode whitespace without U+FEFF. JavaScript's `\s` includes U+00A0 and U+FEFF in both modes.

Changing the conversion rule changes a divergence's clause (DIV-10.1, PORTING.md is a Protected Path), so the orchestrator may not rule on it. The item waits on this ruling and has not been built.
