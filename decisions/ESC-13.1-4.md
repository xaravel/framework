---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "b04641d22de71979c18602418ba502a15075459727cd98b4292f1310f5af1fe8"
---

# ESC-13.1-4: approved, option 1, `@attribute(X, ...args)` and PHP's `Attribute` class in the runtime

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session. All six Story 13.1 Escalations were ruled together. The shared route is in `decisions/MAINT-2026-10-25-story-13-1.md`.

`decisions/DIV-12.md` gains **DIV-12.15**. `#[X(args)]` becomes `@attribute(X, ...args)`, recorded in `Symbol.metadata` in source order. `@xaravel/runtime/php` defines `Attribute`, and `ReflectionClass.getAttributes` / `newInstance()` read it. An attribute class stays a plain class, so `instanceof` and `fqcn()` hold. Option 2 would break class identity without a Proxy (AD-7).
