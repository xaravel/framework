---
decision: approved
decided_by: monitor
date: 2026-10-27
escalation_sha256: "2f294b8cd528f6531bac8e50747af0f90ef6808b67b98f4dc9f69da90996af42"
---

# ESC-14.6-1: approved, the runtime exports array_is_list, array_push, http_build_query, PHP_QUERY_RFC3986 and Randomizer::shuffleArray

The monitor approved the orchestrator's recommended option on 2026-10-27 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` (and its amendment for PHP language constructs). It adds PHP builtins or a construct helper to `packages/runtime` only, with PHP 8.5.11 behaviour checked against PHP, and no DIV clause, expected value or grader change. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-27-story-14-6.md`.

`@xaravel/runtime/php` exports these with PHP's behaviour:

- `array_is_list`;
- `array_push` over a `Ref<array>`, which takes the next integer key as PHP does;
- `http_build_query`, with PHP's encoding of nested arrays, numeric prefixes, separators and `enc_type`;
- `PHP_QUERY_RFC1738` and `PHP_QUERY_RFC3986`;
- `shuffleArray` on the runtime's PHP `Randomizer`.

XT-runtime cases compare each one with PHP. This is action item `epic-14-item-11-runtime-arr-builtins-argument-binder`.
