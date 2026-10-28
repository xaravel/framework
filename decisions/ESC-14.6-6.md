---
decision: approved
decided_by: monitor
date: 2026-10-27
escalation_sha256: "1a0b0abd23a863dbf637345f1573751bd78f9d7b663079982fc175d67911fc9c"
---

# ESC-14.6-6: approved, contract tokens stay PHP class-name strings through the runtime's copies and type checks

The monitor approved the orchestrator's recommended option on 2026-10-27 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` (and its amendment for PHP language constructs). It corrects PHP builtins and construct helpers in `packages/runtime` only, so that they follow PHP 8.5.11 for the value PORTING.md maps `C::class` to, checked against PHP, with no DIV clause, expected value or grader change. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-27-story-14-6-third.md`.

In PHP, `Stringable::class` is the string `"Stringable"`. The runtime already answers `is_string` that way for a contract token. Its other shared paths now agree:

- `valueCopy` returns a contract token unchanged, alone or nested in an array, and never copies it as an array;
- `bindPhpArguments` and `phpReturn` keep it, and normalize it to its class-name string where PHP's declared type is `string`;
- the shared type classification (`phpType`, and through it `gettype`, `is_array` and the type names in PHP's `TypeError` and exception messages) reads it as `string`.

XT-runtime cases compare direct, selected, nested and default tokens with PHP. Class constructors are out of scope, and so is the grader's own copy of the type rules in `packages/assert`. Collections adds no copy or type workaround of its own. This is action item `epic-14-item-13-runtime-class-string-tokens`.
