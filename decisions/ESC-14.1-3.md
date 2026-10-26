---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "9c3d3e19df1388a60bed55f0ea583349988ea5c4890316927d2b8df121dbd2d8"
---

# ESC-14.1-3: approved, option 1, higher-order collection messages are written as `__get` / `__call`

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session, with the monitor's agreement. All four Story 14.1 Escalations were ruled together. The route is in `decisions/MAINT-2026-10-25-story-14-1.md`.

`decisions/DIV-12.md` gains **DIV-12.16**. `$collection->name` becomes `collection.__get('name')`, and the proxy's `$proxy->key` and `$proxy->method(...)` become `proxy.__get('key')` and `proxy.__call('method', [args])`. That is DIV-12.10's form, with Upstream's behaviour and exceptions. It also decides Story 14.5's higher-order tests.
