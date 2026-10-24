---
decision: approved
decided_by: Maintainer
date: 2026-10-24
scope: retrospective action items from epic 9 on; Epic 10 item 9 (one thenable list)
---

# Maintainer ruling: a retro item may update another component's test that its own change makes stale

The Maintainer gave this ruling on 2026-10-24 in the Maintainer's session.

## Why

An item that removes a duplicate often leaves a test elsewhere pinning the duplicate. Epic 10 item 9 (#390) is one: it removes the lint plugin's own copy of the thenable list (`tools/lint-rules/thenables.ts`), and XT-contracts-13 in `packages/contracts` pins the two lists equal by parsing that file. The item's `action` names only `tools/lint-rules`, so the 2026-10-22 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md` keeps the change out of `packages/contracts`, and the item waits. The design is not in doubt; only the scope is. Waiting on a one-line ruling each time keeps the loop idle (see `decisions/MAINT-2026-10-24-evidence-gaps.md` for the same pattern with evidence).

## The rule

From epic 9 on, an action item may also change a test file under `packages/<c>/tests/**` for a component `<c>` its `action` does not name, when all of these hold:

1. **Its own change made the test stale.** The test pins the thing the item removes or moves (a copy, a path, a file the test parses), and fails or pins nothing once the item lands.
2. **The test is pointed at the new single source, nothing else.** It asserts the same property against what replaces the old thing. No assertion is removed or weakened, no expected value changes, and no skip or `adapted:` marker is added. A test may gain assertions.
3. **Nothing else in `<c>` changes.** Source, Expectations lines, `async-surface.json` and other non-test files of `<c>` stay out of scope, as before.
4. **The usual checks apply.** The item's Fidelity Review runs with `--item <id> --stale-test <path>` for each such test, so the test is in the item's scope and the reviewers see it with this rule (F-2, F-3). Its PR body lists each such test with one line on why it went stale.

Protected Paths are unchanged. `--stale-test` refuses a Protected Path, which today includes `conformance/**`, `packages/assert/**` and `packages/mockery/**` (and `packages/contracts/**` after the Phase 1 exit), and any path not under `packages/<c>/tests/`. Such a test, or anything that fails 1 to 3, still needs a ruling: the orchestrator treats the item as waiting on the Maintainer, as before.

`tools/orchestrator/iteration.md` step D, and its expected-`ownership` note, apply this rule.

## Epic 10 item 9

`epic-10-retro-item-9-one-thenable-list` resumes under this rule. The lint plugin reads its thenable list from `@xaravel/contracts/async`, and `tools/lint-rules/thenables.ts` keeps no copy. XT-contracts-13 is re-pinned to assert that the plugin's list is the contracts module's array, the same 26 FQCNs in the same order, read from that one source rather than by parsing a second list. The item leaves `waiting_on_maintainer` and stays `in-progress`.
