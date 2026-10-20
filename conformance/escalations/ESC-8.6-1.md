---
test_ids:
  - XT-conformance-163
  - XT-conformance-164
  - XT-conformance-165
trigger: protected-path
proposed: >-
  The Maintainer adds a section "Story loop and stop rules" to `AGENTS.md`,
  after the closing `<!-- /bmad:context -->` marker so that a
  `bmad-project-context` refresh does not overwrite it, with the text below
  (or their own wording of it). Story 8.6 then resumes on `story/8.6`: it adds
  XT-conformance-163..165, which read `AGENTS.md` and check that the section
  sits outside the managed block, describes the loop in order, lists every
  FR-114 trigger, says an Escalation stops only its own Test IDs, and forbids
  stubbing another Component in favour of `blocked-by:<component>`.
evidence: >-
  Story 8.6's acceptance criteria (epics.md, Story 8.6) name `AGENTS.md` as
  the place for the Framework Agent's operating instructions: it is the file
  every agent session loads, and a `CLAUDE.md` would stop Claude Code reading
  it. `AGENTS.md` is a Protected Path (AD-16), and both AGENTS.md's own policy
  and the orchestrator ruling (decisions/MAINT-2026-10-16-unattended-orchestrator.md,
  "Exception") say it changes only when the Maintainer asks. No Story PR may
  carry the edit, and the orchestrator may not merge one that does. Writing
  the instructions anywhere else would fail the first criterion, and adding
  the tests before the text exists would leave them failing.
---

# ESC-8.6-1: the Story loop and stop rules go in `AGENTS.md`

Covers FR-114, UJ-4, NFR-10, Story 8.6, XT-conformance-163..165.

Story 8.6 is a text change to `AGENTS.md` plus three Xaravel Tests that pin it. The text is the whole of the Story's value, and only the Maintainer may write it. This Escalation carries a draft so the Maintainer can apply it in one edit.

## Proposed section

Append after `<!-- /bmad:context -->`:

```markdown
## Story loop and stop rules

Work a Story in this order (FR-114, UJ-4):

1. Read the Story manifest `stories/<story-id>.md`, `PORTING.md`, and the Divergence Records (`decisions/DIV-<n>.md`) that its Test IDs touch.
2. Translate the Upstream tests named by the manifest's `test_ids` into Ported Tests, following `PORTING.md`.
3. Run `bun run harness --fast --story <story-id>` to see where you start.
4. Implement in `packages/<component>/**` only.
5. Update your own Expectations lines, and no one else's.
6. Run the full Story tests: `bun run harness --story <story-id>`, then `bun run story:check <story-id>`. A fast run never counts.
7. Open the PR from `story/<story-id>`.

Stop work on a Test ID and raise an Escalation in `conformance/escalations/` instead of guessing when:

- a new Intentional Divergence, or a change to one, seems needed (`divergence`);
- the work would change a Protected Path (`protected-path`);
- an Upstream test looks wrong but the Oracle passes it (`upstream-test-wrong`);
- a test is inconsistent across 3 repeated runs; it is Quarantined (`flaky`);
- you would propose a `php-only` Skip Reason (`php-only`);
- an open question in PRD §9 blocks the work (`open-question`);
- a Contract you need is missing, or differs, after Phase 1 (`contract`).

An Escalation stops work on its own Test IDs only. Carry on with the Story's other Test IDs.

Never stub, fake or partially implement another Component to make a test pass. A test that needs a Component from a later Phase is marked `blocked-by:<component>` and left for that Component's Story.
```

## What the Maintainer is asked to decide

1. **Apply the section**, as drafted or reworded. The trigger slugs in parentheses match `TRIGGERS` in `tools/escalations/escalations.ts`, so an agent can copy them into an Escalation's `trigger`.
2. **Confirm the tests may pin the text.** XT-conformance-163..165 would read `AGENTS.md` and check for the loop steps in order, all seven triggers, the "its own Test IDs only" rule and `blocked-by:<component>`. A later Maintainer edit that drops one of these would fail them, which is the point, but it does make the wording a test fixture.

After the ruling, the orchestrator resumes Story 8.6 on `story/8.6` with the tests only; the Story never edits `AGENTS.md` itself. Stories 8.7 and 8.8 follow 8.6 in Epic 8, so the epic waits on this ruling.

This Escalation stays open until the Maintainer rules.
