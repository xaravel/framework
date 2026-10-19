---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-18
escalation_sha256: "5ba52f97b49f1d6d67e498ddc33a6d3166d15a208dd45882067b2cc019f383f6"
---

# ESC-5.1-1: approved, option 1 (list the post-alpha backends as Variants)

`conformance/variants` lists every backend value the committed Inventory uses: the alpha Variants, the AC's two examples (`queue-database@pgsql`, `session-redis@redis`), and `mysql`, `mariadb`, `sqlsrv` and `queue-beanstalkd@beanstalkd`. `expectations:init` writes a line for every Inventory Test ID × backend, `skip` / `not-ported-yet` (`deferred:ai-sdk` for `laravel/ai`), and an Inventory backend outside the vocabulary fails both `expectations:init` and `expectations:check`.

Rationale:

- **It keeps the full denominator.** FR-3 and FR-5 want every Test ID × Backend Variant pair recorded and counted; option 2 would drop about 300 Test IDs from the Expectations File.
- **It is the stricter reading.** The post-alpha pairs start as `not-ported-yet`, which counts against conformance. Moving them to `deferred:<item>` (PRD §7.2) is a later edit that Story 5.2's rule checks validate.
- **The vocabulary stays closed.** AD-15 says Variants come from the Inventory's `backends`; every member is one, and nothing outside the file is accepted.
- **The grader is not weakened.** No Upstream assertion is removed, no expected value weakened, no skip reason other than the AC's added and no `adapted:` marker introduced.
- **No planning document changes and no run-time cost.** The spine, the SPEC and `epics.md` stay as they are; the tools run at build time only.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or make Xaravel slower or less faithful to Laravel on Bun. The Maintainer may overrule it; the status issue reports it.
