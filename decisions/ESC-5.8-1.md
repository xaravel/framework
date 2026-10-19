---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "1df6b03b103c4eea180ee0556b30281206d45fe5ccfb409d33e1e17435efc2d2"
---

# ESC-5.8-1: approved, option 1 (the xaravel-bot App bypasses Agent pushes only)

The Maintainer approved this in the Maintainer's session on 2026-10-19.

The `xaravel-bot` GitHub App (App ID `5386144`, created and installed on `xaravel/framework` the same day, with the `bot` environment, `XARAVEL_BOT_APP_ID` and `XARAVEL_BOT_APP_KEY`) becomes an `Integration` bypass actor with `bypass_mode: always` on `.github/rulesets/agent-push.json` only. `tools/ruleset` accepts exactly that one extra actor on that one ruleset, matched by App ID; every other ruleset keeps `OrganizationAdmin` as its only bypass actor, and `verify` still reports any other actor as a policy problem. `docs/ops/identities.md` and `docs/ops/bots.md` are updated to match. Epic 5 action item 16 (orchestrator) makes these changes. The live ruleset changes only when the Maintainer runs `ruleset:apply`, at the Epic 8 checkpoint when `Agent pushes` is re-enabled.

Rationale: option 1 keeps the push-time guard on `bot/*` for every identity except the App, while option 2 would let the agent account push `bot/*` branches and rely on the ownership identity rule at review time alone. The App still reaches `main` only through a PR and the merge queue, because `main.json` keeps `OrganizationAdmin` as its only bypass actor, and the ownership check still fails any `bot/*` PR the App did not open.
