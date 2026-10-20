---
test_ids:
  - XT-conformance-159
trigger: open-question
proposed: >-
  Rule OQ-12 as: yes. A security-relevant Upstream release, meaning one whose
  release notes or a GitHub Security Advisory for `laravel/framework` (or a
  package the Oracle locks) name a security fix, may trigger an out-of-cycle
  pin bump during a Phase. It goes through the normal pin-bump flow
  (`bun run pin:bump <tag>`, the regenerated locks, Oracle image, Inventory
  and fixtures, the diff-mode Expectations update, and Maintainer review of
  the Infrastructure PR), with nothing skipped. The only change is that the
  freeze-point refusal (`pin:bump` refuses while an epic is `in-progress`)
  gets a Maintainer-only override that names the advisory, recorded in the
  pin-bump PR. That override is a later Infrastructure Story. Releases that
  are not security-relevant still wait for a Phase boundary.
evidence: >-
  PRD OQ-12: "Laravel ships 13.x minors weekly, and security fixes can't wait
  for a Phase boundary. Do security-relevant Upstream changes allow an
  out-of-cycle pin bump? Resolve by: the end of Phase 0, before the first pin
  bump." tools/pin-bump/pin-bump.ts (Story 2.8, decisions/ESC-2.8-1.md)
  "refuses first, in every mode, while any `epic-<N>` key under
  `development_status` in sprint status is `in-progress`: the Pin moves only
  at a freeze point".
---

# ESC-8.4-2: OQ-12, an out-of-cycle pin bump for security releases

Covers PRD OQ-12, Story 8.4, XT-conformance-159.

Laravel ships a 13.x minor almost every week. Xaravel moves its Baseline Pin only at a freeze point, and `pin:bump` enforces that by refusing while any epic is in progress. A security fix in Upstream would then wait for the current Phase to end, and in the meantime Xaravel's ported code and its Oracle would keep the vulnerable behaviour.

The proposal keeps every gate of the pin-bump flow. The new Pin's Oracle image, Inventory and fixtures are regenerated, the Expectations diff is reviewed, and the Maintainer approves the Infrastructure PR. The only change is to *when* a bump may run: a release that fixes a security issue may run it mid-Phase. Two things stay with the Maintainer, so an agent cannot use the override to pull in ordinary minors:

- deciding that a release is security-relevant;
- authorising the override.

If this is approved, a follow-up Infrastructure Story adds the override to `tools/pin-bump/pin-bump.ts` and documents it in `docs/ops/upstream.md`. Until then, an urgent bump would need a separate Escalation.

The ruling belongs to the Maintainer, who writes `decisions/OQ-12.md`. This Escalation stays open until then.
