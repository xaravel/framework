---
decision: approved
decided_by: Maintainer
date: 2026-10-30
escalation_sha256: "a363692f6b98f6961119c43e7a717e4d8b4f6632295acae8372ca0cdc65bc93b"
---

# ESC-15.1-1: approved, option 1 (the scaffold declares a transitive Upstream use; config uses `@xaravel/macroable`)

The Maintainer approved option 1 on 2026-10-30, in the Maintainer's session, on the orchestrator's and the monitor's recommendation. The monitor built it as an Infrastructure change in this ruling's PR, because `tools/` and `bun.lock` are Protected.

- **The field.** The scaffold's package table gains an optional `uses` list (`UPSTREAM_USES` in `tools/scaffold/table.ts`), each entry a `package` and a `reason`: a workspace dependency the package's Upstream source uses directly but reaches only through another package's `require`. It is validated strictly: the package must be a known row reachable through the row's own require chain, not already a direct require, not the row itself, not duplicated, with a non-empty reason, and no cycle. So every edge still traces to Upstream's composer graph (AD-2).
- **The edge.** `config` uses `illuminate/macroable`: "Illuminate\\Config\\Repository uses Illuminate\\Support\\Traits\\Macroable, reached through illuminate/collections' require". `packages/config/package.json`, its `tsconfig.json` and `README.md`, and `bun.lock` gain `@xaravel/macroable`.
- **Tests.** XT-conformance-271, with XT-6 and XT-8 updated.

Story 15.1 then mixes Macroable into `Repository` and ports `RepositoryTest::testItIsMacroable`. Option 2 (a re-export from collections) was not taken.
