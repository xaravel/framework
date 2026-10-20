---
decision: approved
decided_by: Maintainer
date: 2026-10-20
escalation_sha256: "7e3e641121184c1da14d882f55de17f34c729fd41a6143b3c62ab3a4866b638c"
---

# ESC-8.6-1: approved, the "Story loop and stop rules" section is in `AGENTS.md`

The Maintainer added the Escalation's proposed section to `AGENTS.md` as drafted, after the `<!-- /bmad:context -->` marker so a `bmad-project-context` refresh does not overwrite it.

1. **The section is applied as drafted.** It sets out the seven-step Story loop, the seven FR-114 stop triggers (their slugs match `TRIGGERS` in `tools/escalations/escalations.ts`), the rule that an Escalation stops only its own Test IDs, and the ban on stubbing another Component in favour of `blocked-by:<component>`.
2. **The tests may pin the text.** XT-conformance-163..165 may read `AGENTS.md` and check that the section sits outside the managed block, lists the loop steps in order, names every trigger, and keeps the "its own Test IDs only" and `blocked-by:<component>` rules. A later Maintainer edit that drops one of these should fail them.

Story 8.6 resumes on `story/8.6` with the tests only. The Story never edits `AGENTS.md` itself.

Rationale: the section only spells out rules already implied by `AGENTS.md`'s Policy section, AD-16 and FR-114, in the one file every agent session loads. Pinning it in tests keeps the Framework Agent's stop rules from being dropped silently.
