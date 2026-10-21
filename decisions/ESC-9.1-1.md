---
decision: approved
decided_by: Maintainer
date: 2026-10-21
escalation_sha256: "a9af02610cfde2c06ce9d3b11b80ad28c32e24d877bc271e9e141c078310b672"
---

# ESC-9.1-1: approved, a package may export the subpaths the spine names for it

Option 1. A package's `exports` map is `{ ".": "./src/index.ts" }` plus only the subpaths the spine names for that package, each mapped to `./src/<sub>/index.ts`. XT-conformance-7 lists them once, in `SUBPATH_EXPORTS` in `conformance/tests/xaravel/scaffold.test.ts`, which this ruling's PR adds. For `@xaravel/runtime` they are `./scope` (AD-5), `./registry` (AD-10) and `./php` (AD-23). Each subpath is added to `packages/runtime/package.json` by the Story that builds it, starting with `./scope` in Story 9.1. Every other package keeps the root-only map. A later package that needs a spine-named subpath (for example `@xaravel/contracts/<namespace>`) gets its entry in `SUBPATH_EXPORTS` through the same kind of Maintainer-approved change. The import paths in AD-5, `AGENTS.md` and `PORTING.md` stay as written.
