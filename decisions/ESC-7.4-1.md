---
decision: approved
decided_by: Maintainer
date: 2026-10-20
escalation_sha256: "3f1a006cb5b6e7006e7da761ce4f82b4c53a918a4c5be5c6b02080ad93806297"
---

# ESC-7.4-1: approved, `.mcp.json` is a Protected Path

Option 1. `/.mcp.json` is added to `conformance/protected-paths` and to AD-16's agent-tooling bullet, and `.github/CODEOWNERS` is regenerated. Changing which MCP servers agent sessions load now needs the Maintainer's Code Owner review, as `.claude/` does. Story 7.4's read-only guarantee for Boost framework mode holds only for the command `.mcp.json` names, so the registration gets the same protection as the server. The protected-paths tests that pin the list and the `CODEOWNERS` line numbers are updated to include the new entry. No check is loosened.
