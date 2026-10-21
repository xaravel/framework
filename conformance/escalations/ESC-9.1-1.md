---
test_ids:
  - XT-runtime-1
trigger: protected-path
proposed: >-
  Option 1 (recommended): a Maintainer-approved Infrastructure change to the
  Protected test XT-conformance-7 (conformance/tests/xaravel/scaffold.test.ts)
  so that a package's `exports` is `{ ".": "./src/index.ts" }` plus only the
  subpaths the spine names for it, listed once in the test (for
  `@xaravel/runtime`: `./scope` from AD-5, and later `./registry` from AD-10 and
  `./php` from AD-23, each `./src/<sub>/index.ts`). Every other package keeps
  the exact root-only map. Story 9.1 then adds `"./scope"` to
  packages/runtime/package.json. Option 2: keep the root-only map, export the
  scope primitives from `@xaravel/runtime`, and amend AD-5, AGENTS.md:40 and
  PORTING.md:170 to name `@xaravel/runtime` instead of `@xaravel/runtime/scope`
  (a spine and AGENTS.md change, also the Maintainer's).
evidence: >-
  Story 9.1's first acceptance criterion (epics.md:2981-2984, XT-runtime-1)
  and AD-5's Primitive rule (ARCHITECTURE-SPINE.md:150) require the module
  `@xaravel/runtime/scope` to export `currentFrame()`, `runInFrame(kind, fn)`
  and `frameSlot(key, init)`. Bun enforces package `exports`, so that
  specifier resolves only with an `"./scope"` entry in
  packages/runtime/package.json. XT-conformance-7 asserts for every package
  `expect(manifest.exports).toEqual({ ".": "./src/index.ts" })`
  (conformance/tests/xaravel/scaffold.test.ts:240, run on the real tree at
  :316-317), and conformance/ is a Protected Path. The Epic 4 retro hit the
  same wall with a `./php` subpath on @xaravel/assert and fell back to root
  exports (spec-retro-4-one-php-value-layer.md).
---

# ESC-9.1-1: `@xaravel/runtime/scope` needs a subpath export that XT-conformance-7 forbids

AD-5, `AGENTS.md`, `PORTING.md` and Story 9.1 all name the import path `@xaravel/runtime/scope`. Bun resolves a package subpath only through the package's `exports` map, and the Protected scaffold test XT-conformance-7 pins every package's map to the root entry alone. Story 9.1 cannot meet its first acceptance criterion without changing a Protected Path, which a Phase 1 Story may not do.

The same conflict will recur for `@xaravel/runtime/registry` (AD-10, Story 9.4) and `@xaravel/runtime/php` (AD-23, Stories 9.5-9.8), so the ruling should settle the subpath rule for the whole runtime package at once.

Work on XT-runtime-1 stops here. Story 9.1's other Test IDs share the module whose import path this decides, and ESC-9.1-2, so the Story is blocked until both are ruled.
