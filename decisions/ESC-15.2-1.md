---
decision: approved
decided_by: monitor
date: 2026-10-30
escalation_sha256: "3e75ca68f8d89e911f83c5c4f49cc58fbb57e15f1397a6faaa611e319a9aff3a"
---

# ESC-15.2-1: approved, option 1 (the runtime exports the PHP builtins phpdotenv calls), except part (g)

The monitor approved the orchestrator's recommended option on 2026-10-30 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md`, as the 2026-10-30 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md` requires for a `contract` Escalation. It adds PHP builtins to `packages/runtime` only, under their PHP names and with PHP 8.5.11 behaviour checked against PHP, with no new DIV clause, expected value or grader change. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-30-story-15-2.md`.

- **Approved, parts (a)–(e):** `strpos`, `str_replace`, `ltrim` and `rtrim` (with PHP's character list and `..` ranges), `ord`, `strtok`, `addcslashes` (with ranges such as `"\\0..\\37\\177"`), `stripcslashes`; `ctype_space`, `ctype_digit`; `mb_strlen`, `mb_substr`, `mb_strpos`, `mb_convert_encoding`, `mb_list_encodings` and `mb_encoding_aliases` over UTF-8; `function_exists`; `class_exists` over the Class Registry; `filter_var` with `FILTER_VALIDATE_BOOLEAN`, `FILTER_VALIDATE_INT` and `FILTER_NULL_ON_FAILURE`, as `Validator.php` uses them. Action item `epic-15-item-1-runtime-phpdotenv-builtins`.
- **Approved, part (f):** `preg_match`, `preg_match_all`, `preg_split`, `preg_replace_callback` (with `$limit`), `preg_last_error` and `preg_last_error_msg`, taking a PHP pattern string converted by PORTING.md § PCRE conversion under the existing DIV-10.1. If a pattern phpdotenv uses, the branch-reset group `(?|…)` among them, has no conversion that rule allows, the item raises a new Escalation for that form and does not invent one. Action item `epic-15-item-2-runtime-pcre-functions`.
- **Not ruled here, part (g):** `getenv` and `putenv` depend on where PHP's process environment lives, which is ESC-15.2-2, a Maintainer question.

Notices and warnings these builtins raise in PHP are not raised (DIV-9.17). Their results and exceptions follow PHP.
