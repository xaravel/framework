---
test_ids:
  - XT-config-3
  - XT-config-4
trigger: contract
proposed: >-
  Option 1 (recommended): a Maintainer- or monitor-approved runtime item
  (`packages/runtime` only, as for epic-14-item-1 and -2 and
  decisions/MAINT-2026-10-26-runtime-builtins.md) exports the PHP builtins
  vlucas/phpdotenv v5.7.0 calls that `@xaravel/runtime/php` lacks, each under
  its PHP name and behaviour with XT-runtime cases against PHP's results:
  (a) strings: `strpos`, `str_replace`, `ltrim` and `rtrim` (with PHP's
  character-list and `..` range forms), `ord`, `strtok`, `addcslashes`
  (with the `"\0..\37\177"` range form), `stripcslashes`; (b) ctype:
  `ctype_space`, `ctype_digit`; (c) mbstring over UTF-8: `mb_strlen`,
  `mb_substr`, `mb_strpos`, `mb_convert_encoding`, `mb_list_encodings`,
  `mb_encoding_aliases`; (d) `function_exists`, `class_exists` (the latter
  over the class Registry, also listed by `scan:builtins collections`);
  (e) `filter_var` with `FILTER_VALIDATE_BOOLEAN` / `FILTER_VALIDATE_INT`
  and `FILTER_NULL_ON_FAILURE`, as Validator.php uses them; (f) PCRE:
  `preg_match`, `preg_match_all`, `preg_split`, `preg_replace_callback`
  (with `$limit`), `preg_last_error`, `preg_last_error_msg`, taking a PHP
  pattern string converted by PORTING.md's § PCRE conversion rule (DIV-10.1,
  no new clause; phpdotenv's patterns use only `A`, `u`, `\p{…}`, `\A`, `\z`
  and `(?|…)`, and the branch-reset group is the one form the item must
  check has a `RegExp` equivalent or rewrite as PORTING.md allows);
  (g) `getenv` and `putenv` over `process.env` (ESC-15.2-2 settles where
  `$_ENV` / `$_SERVER` live). Story 15.2 then ports phpdotenv in
  `packages/config` over these. Option 2: `packages/config` writes
  module-private versions; it builds, but it is the second implementation
  PORTING.md (§ Idiom table, "Nothing else re-implements them") and AD-19
  forbid, and Support's Str (Epic 18) needs most of the same functions.
evidence: >-
  Every name above was checked against the exports of
  packages/runtime/src/php/index.ts and packages/runtime/src/index.ts with
  `tools/scans/builtins.ts`'s `norm` rule (lowercase, `_` dropped, optional
  `php` prefix) on 2026-10-30; none is exported. First call sites in
  vlucas/phpdotenv v5.7.0 (the Pin, conformance/oracle/locks/framework/composer.lock:5452):
  Parser/EntryParser.php:99 ctype_space, :100 ltrim, :282 stripcslashes,
  :312 strtok, :322 addcslashes, :348 ord; Parser/Lines.php:118 str_replace;
  Util/Str.php:45 mb_convert_encoding, :75 mb_list_encodings, :80
  mb_encoding_aliases, :101 mb_strpos, :115 mb_substr, :127 mb_strlen;
  Util/Regex.php:50 preg_match_all, :65 preg_replace_callback, :79
  preg_split, :96 preg_last_error_msg; Validator.php:87 ctype_digit, :108
  filter_var, :144 preg_match and preg_last_error;
  Repository/Adapter/PutenvAdapter.php:44 function_exists, :56 strpos, :61
  getenv, :80 putenv; Repository/RepositoryBuilder.php:122 class_exists;
  Store/File/Reader.php:73 file_get_contents (ESC-15.2-3). `bun run
  scan:builtins` reads only conformance/upstream/, which holds no
  phpdotenv, so this list was made by hand from the source at the tag.
---

# ESC-15.2-1: PHP builtins phpdotenv needs that the runtime lacks

The phpdotenv port needs about 27 PHP builtins that `@xaravel/runtime/php` does not export: string, ctype, mbstring, `filter_var`, PCRE, `getenv`/`putenv`, `function_exists` and `class_exists`. Following the Epic 14 lesson, they are raised in one round before building. Option 1 adds them to the runtime under their PHP names, with XT-runtime cases. Option 2 copies them into `packages/config`, which PORTING.md and AD-19 forbid.
