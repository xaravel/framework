---
decision: approved
decided_by: Maintainer
date: 2026-10-30
escalation_sha256: "130fa293eeed4448e321cfbc4c2d3a2e37c655390d0b46746e2c7c7a7b12364c"
---

# ESC-15.2-3: approved, option 1 (phpdotenv's file read stays sync)

The Maintainer approved option 1 on 2026-10-30, in the Maintainer's session, on the orchestrator's and the monitor's recommendation.

AD-6 says config is sync. `@xaravel/runtime/php` exports `file_get_contents` for a local path as a sync read (`fs.readFileSync`), returning `false` on a missing or unreadable file as PHP's `@` form does, with no warning raised (DIV-9.17). `Dotenv\Store\File\Reader` ports over it. It runs once at boot (Foundation's `LoadEnvironmentVariables`, Epic 51), the loaded-once case AD-6 keeps sync. It is not `Filesystem` IO, so no async root is added. Action item `epic-15-item-3-runtime-process-environment`.
