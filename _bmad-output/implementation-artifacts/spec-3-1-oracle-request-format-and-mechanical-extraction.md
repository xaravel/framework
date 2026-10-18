---
title: 'Story 3.1: Oracle request format and mechanical extraction'
type: 'feature'
created: '2026-10-17'
status: 'blocked'
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'stories/3.1.md'
  - 'conformance/escalations/ESC-3.1-1.md'
---

# Story 3.1: Oracle request format and mechanical extraction

Planning stopped at an intent gap before a Ready-for-Development spec was written. This file keeps the investigation so a resumed run starts from it once ESC-3.1-1 is decided.

## Intent gap

The ACs (epics.md:1879-1891) fix the required request fields and the output path, but no planning document says:

- which Inventory Test IDs are Differential. The Inventory `kind` is only `unit` or `integration`, and the component map marks nothing;
- what `input` holds for each `kind`;
- what the "canonical request" that `sha256` hashes is.

The Upstream test shapes differ by family, so each reading gives different request files and a different contract for Stories 3.2 and 3.4. ESC-3.1-1 sets out three options and proposes option 1: typed inputs per kind, and a closed Differential set listed per family.

## Code Map

- `tools/inventory/lister.php` -- `export()` (312-365) is the deterministic dataset serializer, `methodTokens` (246) brace-matches a method body from `PhpToken::tokenize`, and `providedData()` (447-500) evaluates providers. The extractor's `bindings` come from here.
- `tools/inventory/inventory.ts` -- the CLI shape to copy: `main(argv)` (854), exported `UsageError` (800), strict flags and `--root` (805-852), `generate --check` drift with `firstDifference` (687, 751-775), `compareUnits` (167), `parseInventory` (476), `readSuiteInventory` (616), image vs `--local` mode (589, 659) with `checkLocalCopy` (559).
- `tools/oracle/oracle.ts` -- `runInImage` (720), `imageTag`, `IMAGE_UPSTREAM_DIR` (60). Docker is reached only through this file.
- `tools/ruleset/ruleset.ts:85` -- the private deep key-sorting `canonical()`, the only canonical-JSON precedent.
- `tools/upstream/upstream.ts` -- `upstreamPath` / `readUpstream` (381/404), path-escape-safe reads of the snapshot.
- `tools/component-map/component-map.ts` -- `readMap`, `componentForTest`, to choose `<component>.jsonl`.
- `conformance/protected-paths` -- `conformance/oracle/requests/` is Protected under `/conformance/`; `!/conformance/oracle-requests/` (Story 3.4) is not. Keep the two names apart.
- No `tools/lib` exists. The Epic 2 retro (epic-2-retro-2026-10-17.md:93-101) suggests creating one when Epic 3's tools start.
- Upstream shapes (in `conformance/upstream/framework/tests/`):
  - `Support/SupportStrTest.php`: about 600 pure `assertSame(<literal>, Str::m(<literals>))`, and 9 data providers.
  - `Support/SupportStringableTest.php`: about 375 `(string) $this->stringable('<lit>')->m(...)`.
  - `Database/DatabaseQueryBuilderTest.php`: always builder setup on a Mockery connection; the helpers are at 8067-8159.
  - `Database/*SchemaGrammarTest.php`: a Blueprint over a mocked connection.
  - `View/Blade/*`: 298 `compileString('<blade>')` calls that assert compiled PHP; real renders are in `Integration/View/BladeTest.php`.
  - `Validation/ValidationValidatorTest.php`: 168 `messages()->first` assertions, after `getIlluminateArrayTranslator()` / `addLines` / `new Validator`.
  - `Support/SupportCarbonTest.php`: `setTestNow` then `toDateTimeString()`.

## XT ID collision (resolve when resuming)

`conformance/tests/xaravel/php-scripts.test.ts:176-299` already uses XT-conformance-68..74 for the Epic 2 retro's PHP-script tests. Those IDs are allocated to Stories 3.1 (68-70), 3.2 (71-73) and 3.3 (74). Story 2.1 set the precedent (`story-manifests.md:18`): the Story that owns an ID renames the off-manifest probe. On resume, rename the seven tests to the next free IDs, XT-conformance-173..179, update `spec-retro-2-execute-php-scripts.md:154` and `story-manifests.md:18`, and keep the manifests unchanged.

## Auto Run Result

Status: blocked
Blocking condition: intent gap. The request `input` per kind, the canonical form behind `sha256`, and the set of Differential Test IDs are undefined in the PRD, the spine and `epics.md`, and the Upstream shapes admit several readings with different outputs. Raised as `conformance/escalations/ESC-3.1-1.md`.
