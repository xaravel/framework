---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "1cf667189a525db69bd6c2fb65ec5817dd7b525bcefb8cbb56f386a648f7163e"
---

# ESC-14.1-1: approved, option 1, the runtime exports its PHP-array helpers

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session, with the monitor's agreement. All four Story 14.1 Escalations were ruled together. The route is in `decisions/MAINT-2026-10-25-story-14-1.md`.

`@xaravel/runtime/php` exports `arrayEntries`, `arrayFromEntries`, `normalizeKey`, and PHP's `gettype` / `get_debug_type`. Collection stores its items as a `PhpArray`, reads input through `arrayEntries`, and returns `all()` / `toArray()` through `arrayFromEntries`. Keys then normalise and order exactly as `jsonEncode` and the grader already do. A private copy in `packages/collections` (option 2) would be a second implementation of the runtime's PHP-array rules, which drifted twice before (the Epic 4 and Epic 9 lessons). The runtime half is action item `epic-14-item-1-runtime-php-types`.
