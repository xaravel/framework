---
decision: approved
decided_by: Maintainer
date: 2026-10-30
escalation_sha256: "8475a238928a4a44c566c4e2ddb95e196687f5a8ca965a189b0e8738c4d0b5ad"
---

# ESC-15.2-2: approved, option 1 (the runtime owns PHP's process environment)

The Maintainer approved option 1 on 2026-10-30, in the Maintainer's session, on the orchestrator's and the monitor's recommendation. The route is in `decisions/MAINT-2026-10-30-story-15-2.md`.

- `@xaravel/runtime/php` exports `getenv` and `putenv`, reading and writing `process.env` (ESC-15.2-1 part (g)).
- `$_SERVER` and `$_ENV` are two process-wide string-keyed arrays the runtime exports (`superglobals.server` and `superglobals.env`, or names the item chooses in that spirit). They are seeded once at module load from `process.env`, as the PHP CLI seeds them under the Oracle image's `variables_order`, and are never re-read after. The item records that value: the image sets none, and PHP's built-in default with no php.ini is `EGPCS`, which fills both.
- This is boot-time process state, not per-request state, so AD-5's frame slots do not apply. A later Http Story that needs request `$_SERVER` keys builds its own bag (Symfony's `ServerBag`, AD-22's http-foundation row).
- phpdotenv's `ServerConstAdapter`, `EnvConstAdapter` and `PutenvAdapter` port line for line over them, and XT-config-4 checks the precedence against Oracle fixtures.

Action item `epic-15-item-3-runtime-process-environment`.
