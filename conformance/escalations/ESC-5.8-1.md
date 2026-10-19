---
test_ids:
  - XT-conformance-123
  - XT-conformance-124
trigger: open-question
proposed: >-
  Allow the xaravel-bot GitHub App as an `Integration` bypass actor on the
  `agent-push` ruleset (.github/rulesets/agent-push.json), with
  `bypass_mode: always`, and teach tools/ruleset to accept exactly that one
  extra actor on that one ruleset (by App ID) while every other ruleset keeps
  `OrganizationAdmin` as its only bypass actor. The ownership check's identity
  rule (Story 5.8) still fails any bot/* PR not opened by the App.
evidence: >-
  Story 5.8's bots push bot/* branches as the xaravel-bot App
  (.github/workflows/bots.yml, job `open`). `agent-push.json` restricts
  creation, update and deletion on every branch except story/**, main and
  gh-readonly-queue/**, so it covers bot/*; `ruleset:identity` even probes
  `bot/probe` for those rules. The ruleset is committed disabled through
  Phase 0 (decisions/MAINT-2026-10-17-epic-1-items.md) and is re-enabled at
  the Epic 8 checkpoint, after which the App could not create a bot/* branch.
  tools/ruleset allows only `OrganizationAdmin` as a bypass actor, and
  Story 5.8 may not change tools/ruleset or the ruleset files, so the choice
  is the Maintainer's.
---

# ESC-5.8-1: how the xaravel-bot App gets past the agent-push ruleset

The quarantine and promotion bots, and the Oracle Escalation collector, create `bot/*` branches and open PRs as the `xaravel-bot` GitHub App ([docs/ops/bots.md](../../docs/ops/bots.md)). Today nothing stops them: `agent-push` is disabled. Once it is re-enabled at the Epic 8 checkpoint, it restricts creating any branch outside `story/**`, so the App's pushes would be rejected.

The options:

1. **Bypass actor (proposed).** Add the App as an `Integration` bypass actor on `agent-push` only, and let `tools/ruleset` accept that one actor there (`verify` and `apply` today reject any actor but `OrganizationAdmin`). The App can then create `bot/*` branches; it still cannot reach `main` except through a PR and the merge queue, because `main.json` keeps `OrganizationAdmin` as its only bypass. The ownership identity rule keeps a human from using a `bot/*` branch to dodge the Story rules.
2. **Exclude `bot/**` from `agent-push`.** Simpler, but then the agent account can also push `bot/*` branches; only the ownership identity rule would stop such a PR, and only at review time.

Option 1 keeps the push-time guard for every identity but the App. Until a ruling, the App is not a bypass actor, and `docs/ops/identities.md` says so.
