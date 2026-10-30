---
decision: approved
decided_by: Maintainer
date: 2026-10-30
escalation_sha256: "1a9d9ba3a04b58fca41ad72b8a196fc43094bab99951fb2de8e8dcc694fc8603"
---

# ESC-15.3-2: approved, option 1 (48 class-level additions for the libraries `@xaravel/config` owns)

The Maintainer approved option 1 on 2026-10-30, in the Maintainer's session, on the orchestrator's and the monitor's recommendation. Under XT-conformance-82, as amended on 2026-10-29, each `additions.jsonl` line comes from a Maintainer ruling. This is the ruling for these lines.

ESC-15.2-4 made `@xaravel/config` own vlucas/phpdotenv v5.7.0, phpoption/phpoption 1.10.0 and graham-campbell/result-type 1.2.0 under their original FQCNs. The Upstream export `conformance/api-surface/config.jsonl` covers only `illuminate/config`, so the gate reports the 48 ported classes as `extra`. `conformance/api-surface/additions.jsonl` gains one `member: null` line per class, each citing `FR-20` (FR-20.1, phpdotenv's grammar; FR-20.2, its repository precedence), the 48 lines the Escalation lists. `bun run api-surface:gate config` then reports 0 unexplained. Story 15.3 writes XT-config-7, the Epic-close checks, once these lines and ESC-15.3-1's check are on `main`.
