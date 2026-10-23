---
status: blocked
---

# BMad Build Auto Result

Status: blocked
Blocking condition: path outside the item's scope. The action of `epic-9-retro-item-3-scope-registry-gaps` asks for Oracle rows for XT-runtime-18, 20, 23 and the class-name lookups of XT-runtime-12..14 (finding S2). On the route of the MAINT-2026-10-16 amendment of 2026-10-22 (`planning/retro-9-*`, scope `allowedPath` for `runtime`) no signed fixture can be produced:

- Fixtures are signed only by the `story` job of `.github/workflows/oracle.yml`, which runs only for a head branch `story/<epic>.<story>` (`oracle.yml:259-262`, `:289-293`) and reads `conformance/oracle-requests/<story-id>.jsonl`. The signing key exists only in the GitHub `oracle` environment (`docs/ops/oracle.md`).
- Every Oracle tool rejects a request file named for an action item: `STORY_FILE = /^([1-9]\d*\.[1-9]\d*)\.jsonl$/` (`tools/oracle/story-requests.ts:55`), so `oracle:verify-fixtures` (a required check) would fail too.
- The request ids are owned by the manifests of done Stories 9.4 (XT-runtime-12..14), 9.5 (18, 20) and 9.6 (23).

Taking the rows means either reopening `story/9.4`, `story/9.5`, `story/9.6` for Oracle requests, or teaching `oracle.yml` and `tools/oracle/` item ids. `/.github/` and `/tools/` are Protected Paths outside this item's scope, and reusing done Stories' branches departs from AGENTS.md's branching rule, so the route is the Maintainer's call.

The rest of the item (L1-L5, L15, L16) is in scope and was investigated, not built: the Fidelity Review reads the scope from the whole `action`, so a partial build would be reviewed against the missing Oracle rows. If the Maintainer splits S2 off (or rules a route for it), the investigation notes below let the next run start at planning.

## Investigation notes (for the next run)

- L1: `packages/runtime/src/scope/interleave.ts:28-30` opens each unit with `runInRootFrame` (no parent); test-class reads (`installTestFrameAccess`, `scope.ts:450-478`) walk only `parent`. Fix sketch: a private `origin` on the unit `Store`, set to the opener's store, followed only by the test-class read.
- L2: `registry.ts:279` writes the test brand as a configurable data property on the class. Readers in assert and mockery read `Symbol.for("xaravel.class.fqcn")` directly, so the fix inside runtime is an own accessor that resolves through the live test frames (precedent: `packages/assert/src/Framework/Exception/RuntimeExceptionParent.ts:65`).
- L3: `frameSlot` `get`/`set` (`scope.ts:264-278`) have no `ended` check; `writeOwner` (`scope.ts:343-344`) throws `Cannot write ${what} to the ${kind} frame after it has ended`.
- L4: no process-wide record of keys held by live test frames; needs a scope-to-registry end hook or a live-map set.
- L5: specs (spec-9-3 Default app row, AD-5.3) support the fallback code; fix the docblocks at `scope.ts:113`, `:125`.
- L15: `packages/runtime/docs/traits-and-inject.md:158-164`; `mixin.ts:213` constructs the trait at `mixin()` time; methods copied by descriptor lose `#private` brands.
- L16: PHP 8.5 gives `must be of type int, float given` for an out-of-int64 integer; `throwableArguments.ts` reports `int`.
- Next XT id: XT-runtime-38.
