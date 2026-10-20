---
test_ids:
  - XT-boost-4
trigger: protected-path
proposed: >-
  Make `.mcp.json` a Protected Path: add `/.mcp.json` to AD-16's list in the
  architecture spine (beside `AGENTS.md` and `.claude/`, the agent tooling)
  and to `conformance/protected-paths`, then regenerate `.github/CODEOWNERS`
  with `bun run protected-paths:codeowners`. Both files are Protected, so the
  change is the Maintainer's, as an Infrastructure change.
evidence: >-
  `.mcp.json` registers the Boost framework-mode server for every agent
  session started in a worktree (Story 7.3, XT-boost-3). Story 7.4 makes that
  server read-only by construction: src/server.ts locks the process down
  before it loads its data layer, and XT-boost-4..6 prove it. The guarantee
  holds only for the command `.mcp.json` names. `conformance/protected-paths`
  lists `/AGENTS.md` and `/.claude/` but not `/.mcp.json`, so any Story PR can
  repoint `boost-framework` at another script, or register a second server,
  without Maintainer Code Owner review, and framework mode would then be a
  path around the guardrails that FR-109 forbids. Story 7.3 deferred this
  finding because editing the list is outside a Story's remit; Story 7.4's
  spec raises it here. XT-boost-3 (Story 7.3) pins the file's content, so an
  edit fails that test, but that is an indirect gate: the protected-paths
  check does not fire and no Code Owner review is requested.
---

# ESC-7.4-1: `.mcp.json` is not a Protected Path

Story 7.4 hardens Boost framework mode: the server reads only `conformance/`, `stories/` and `decisions/` (checked on real paths), and its process refuses every write, spawn and out-of-scope read. That property is worth what the registration is worth. Agents get the server through the repository's `.mcp.json`, and that file is not on AD-16's list.

A Story branch can change `.mcp.json` freely. Today the only thing that notices is XT-boost-3, which compares the file with its expected content. That catches an edit, but it is not a review gate: the protected-paths check does not fire, and no Code Owner review is requested.

The options:

1. **Protect `.mcp.json` (proposed).** Add `/.mcp.json` to AD-16's agent-tooling bullet and to `conformance/protected-paths`, and regenerate `CODEOWNERS`. Every change to the registration then needs the Maintainer's review, as `.claude/` changes do.
2. **Keep it unprotected.** Rely on XT-boost-3 failing on any change. Changing that test needs review (`conformance/tests/` is Protected), so the gate exists, but only as long as the Xaravel Tests stay a required check and the test keeps its exact comparison.

Option 1 adds one line to each list and changes no behaviour. The spine edit is the Maintainer's, so this Story does not make it.
