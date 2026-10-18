---
decision: approved
decided_by: Maintainer
date: 2026-10-18
scope: docs/ops/identities.md#the-xaravel-oracle-github-app
---

# Maintainer record: the `xaravel-oracle` GitHub App is set up

On 2026-10-18 the Maintainer did the one-time setup in `docs/ops/identities.md` and `docs/ops/oracle.md` (Maintainer-run steps for per-Story requests):

- created the organisation-owned GitHub App `xaravel-oracle` (App ID 5370517), with no webhook and only *Contents: read and write*, *Pull requests: read and write* and *Metadata: read*;
- installed it on `xaravel/framework` only (selected repositories);
- stored its private key as the secret `XARAVEL_ORACLE_APP_KEY` of the environment `oracle`, and its App ID as the repository variable `XARAVEL_ORACLE_APP_ID`;
- did not add it as a ruleset bypass actor.

This completes the setup half of Epic 3 retrospective action item 7 (`epic-3-retro-item-7-oracle-app-and-live-smoke`). Story 4.1, blocked on the App, goes back to `ready-for-dev`. Its PR is the supervised first per-Story Oracle run, the other half of item 7. The item stays `in-progress` until `oracle.yml#story` has committed signed fixtures for `conformance/oracle-requests/4.1.jsonl` to that PR and `oracle:verify-fixtures` accepts them. If that run fails, the orchestrator marks 4.1 `blocked` with the run's error and leaves item 7 waiting on the Maintainer.
