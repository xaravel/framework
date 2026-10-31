---
title: 'epic-16-retro-item-2: show the Fidelity Review the data providers, dependency manifests and indirectly-run files it lacked'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_revision: 'bf23e0a24c709072894ba896e494a53b7450249d'
review_loop_iteration: 0
followup_review_recommended: false
unit: epic-16-retro-item-2-fidelity-evidence-providers-deps-indirect
context:
  - '{project-root}/decisions/MAINT-2026-10-16-unattended-orchestrator.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-16-retro-2026-10-31.md'
  - '{project-root}/conformance/review/fidelity.md'
  - '{project-root}/docs/ops/fidelity-review.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Fidelity Review prompt left out three kinds of evidence its reviewers asked for in Epic 16 (retro findings E1, E2, E3; action item `epic-16-retro-item-2-fidelity-evidence-providers-deps-indirect`). E1: an Inventory row shows only its test method's lines, so a `#[DataProvider]` test's provider methods and the test-class helpers it calls (`TypeTest::validSchemasProvider`, `makeValidator`, `assertValidOnJsonSchema`) never reach F-1. E2: a Xaravel Test citing `AD-2.<k>` (the dependency set) gets neither its package's `package.json` nor Upstream's `composer.json`. E3: a test that runs another Story's test files in a child `bun test`, chosen through `stories/<id>.md`, and a changed `*.probe.php`, which loads Upstream sources, show neither those files nor those sources.

**Approach:** Add each as evidence (h) entries in `wholeFileEvidence` (the "whole files" section, which already handles the prompt budget, dedupe and omission notes), under the 2026-10-21 amendment's "supply an existing item in more cases". Test each case in XT-conformance-161 and say what the prompt now carries in the evidence notes of `conformance/review/fidelity.md` and in `docs/ops/fidelity-review.md`.

## Boundaries & Constraints

**Always:**
- Edit only `tools/fidelity-review/fidelity-review.ts`, `conformance/tests/xaravel/fidelity-review.test.ts`, `conformance/review/fidelity.md` (the **Whole files** evidence-note paragraph, above the checklist items), `docs/ops/fidelity-review.md`, and this spec / sprint status.
- New entries only add evidence; every existing (h) entry, its reason text and its relative order for existing inputs stays as it is. New parameters default so that existing callers and tests see no change.
- New entries go in tier 1 of `wholeFileEvidence` (evidence no other section shows) and pass through the existing budget, `shown`, size-cap and omission rules; a changed file outside the scope (`inScope`) brings no evidence (ESC-9.10-3).
- New cases go into the existing `XT-conformance-161` block; no new XT id, no Expectations or consequence line.

**Never:**
- Change a checklist item's **Check.** (F-1..F-10), the verdict rule or schema, the standing-reject rule, reviewer/CLI selection, `story:check`'s approvals clause, or remove/narrow any evidence (amendment 2026-10-21).
- Touch `packages/**`, `conformance/expectations/**`, `AGENTS.md`, or any other tool.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| E1 provider + helpers | Inventory rows `TypeTest::test_produces_valid_json_schemas#0..` (source lines 89-92, `#[DataProvider('validSchemasProvider')]` on line 88) | One (h) entry `conformance/upstream/framework/tests/JsonSchema/TypeTest.php § <methods>` holding, in file order, `validSchemasProvider`, `assertValidOnJsonSchema` and `makeValidator` (helpers reached transitively), reason naming the Inventory tests | A test with no provider or helper adds no entry; several rows of one file share one entry; an `@dataProvider name` docblock tag counts too |
| E1 file already whole | The same Upstream test file is already listed in (h) | No excerpt entry | — |
| E2 AD-2 cite | A changed `packages/<c>/tests/**` test file whose text cites `AD-2.<k>` | (h) shows `packages/<c>/package.json` and the snapshot `composer.json` whose `name` is `illuminate/<c>`, reason `… AD-2 …, cited by <test>` | No such composer.json: an entry with null text and a note saying none names `illuminate/<c>` |
| E3a child bun test | A changed test that names `stories/<id>.md` (literal path or `"stories", "<id>.md"` path segments) and spawns `bun … test` | (h) shows the manifest and each test file it selects: the Ported Test file of each `test_ids` row (`packages/<component>/tests/ported/<source sub-path>.test.ts`) and each test file under `packages/<component>/tests/` declaring an `xaravel_test_ids` id, reason `run by <test> in a child bun test, selected by stories/<id>.md` | No spawn of `bun test`, or an unreadable manifest: nothing added |
| E3b probe sources | A changed, in-scope `*.probe.php` | (h) shows each Upstream snapshot source of a class it imports (`use`) or names fully qualified, then, one level further, those sources' own imports and same-namespace classes they reference, reason `loaded by <probe>` | A class with no snapshot file is skipped |

</intent-contract>

## Code Map

- `tools/fidelity-review/fidelity-review.ts:1054` -- `wholeFileEvidence(root, files, shown, budget, inScope, upstreamTests)`: tiers 0..4; `add(tier, path, reason)` dedupes via `listed`; synthetic labels (`PORTING.md § …`) are pushed directly with `listed.add`. Add a 7th optional parameter for the Inventory rows' `{ path, from, to }` ranges.
- `tools/fidelity-review/fidelity-review.ts:1964` -- `withWholeFiles`: builds `upstreamTests` from `input.inventory` rows via `parseSource`; pass the ranges too.
- `tools/fidelity-review/fidelity-review.ts:3013` -- `phpMethodBodies(text, methods)`: reuse for the E1 excerpt text and for scanning helper bodies.
- `tools/fidelity-review/fidelity-review.ts:2071` -- `inventoryContext`, `parseSource`, `readWorkingInventory` (from `tools/pin-bump/pin-bump`): Inventory rows and `source` (`<name>/<rel>:<a>-<b>`).
- `tools/fidelity-review/fidelity-review.ts:160` -- `parseManifest` (from `tools/ownership/ownership`) gives `component`, `testIds`, `xaravelTestIds`.
- `tools/fidelity-review/fidelity-review.ts:3254` -- `upstreamCounterpart` / `UPSTREAM_SNAPSHOT_DIR`; `isTestPath:3282`, `TS_FILE`, `wholeFileLang` (splits on ` § `).
- `conformance/upstream/framework/tests/JsonSchema/TypeTest.php:88-95,160,343,458-488` -- the real E1 case.
- `packages/json-schema/tests/xaravel/round-trip.test.ts:57-70,148` and `round-trip.probe.php` -- the real E3 cases; `serializer.test.ts:8`, `epic-close.test.ts:232` -- the real E2 case.
- `conformance/tests/xaravel/fidelity-review.test.ts:389` -- XT-conformance-161, the evidence block; `wholeFileEvidence` cases near `:1700` show the fixture-root pattern (`tempDir`, `write`).
- `conformance/review/fidelity.md:17` -- the **Whole files** evidence note; `docs/ops/fidelity-review.md` `## Inputs` -- the ops description of (h).

## Tasks & Acceptance

**Execution:**
- `tools/fidelity-review/fidelity-review.ts` -- add exported pure `phpTestSupportMethods(text, ranges)` (E1: provider names from attributes/docblock above each range, `$this->`/`self::`/`static::` calls, closed transitively over methods the file declares, excluding the ranges' own methods; file order), `upstreamComposerFor(root, component)` (E2), `manifestTestFiles(root, manifestPath)` (E3a) and `probeSources(root, path, text)` (E3b); wire them into `wholeFileEvidence` tier 1 and `withWholeFiles`; update the docblocks.
- `conformance/tests/xaravel/fidelity-review.test.ts` -- in XT-conformance-161: a fixture case and a real-repo case for each of E1, E2, E3a, E3b, including the no-op and dedupe edges in the matrix, and that existing outputs are unchanged when the new inputs are absent.
- `conformance/review/fidelity.md` -- extend the **Whole files** evidence note (not a Check) with the new entries and cite `epic-16-retro-item-2`.
- `docs/ops/fidelity-review.md` -- describe the same under Inputs.

**Acceptance Criteria:**
- Given Story 16.1's Inventory rows, when `withWholeFiles` builds (h), then the prompt holds `TypeTest.php`'s `validSchemasProvider`, `invalidSchemasProvider`, `makeValidator`, `assertValidOnJsonSchema` and `assertNotValidOnJsonSchema` bodies.
- Given a change to `packages/json-schema/tests/xaravel/serializer.test.ts`, when (h) is built, then it holds `packages/json-schema/package.json` and `conformance/upstream/framework/src/Illuminate/JsonSchema/composer.json`.
- Given a change to `round-trip.test.ts` and `round-trip.probe.php`, when (h) is built, then it holds `stories/16.1.md`, Story 16.1's Ported Test files and `serializer.test.ts`, and `JsonSchema.php`, `Serializer.php` and `Deserializer.php` from the snapshot.
- Given the change, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then they report no difference and no error.

## Spec Change Log

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 34 findings — high 0, medium 1, low 29, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification-gap) probeSources' aliased/group imports and `instanceof` untested — added an alias, a group import and an `instanceof` reference to the E3b fixture.
  - `[false]` `[reject]` (intent) E1 lands in (h), not beside the Inventory row — the intent asks the methods be supplied with each row; one `<file> § <methods>` entry naming the rows reaches the prompt, and the real-case test shows it in `buildPrompt`'s output.
  - `[low]` `[reject]` (intent) E1 covers only same-file helpers; inherited TestCase helpers are not shown — rare in Upstream tests (traits are covered by ESC-14.6-4); following parent classes adds a resolver.
  - `[false]` `[reject]` (intent) E2 needs `AD-2.<k>`, not a bare `AD-2` — the action says "an AD-2 token" and consequence tokens are `AD-<n>.<k>`; both retro cases are numbered clauses.
  - `[false]` `[reject]` (intent) E2/E3 cases call `wholeFileEvidence` directly, not through `withWholeFiles` — `withWholeFiles` passes `files` and `inScope` unchanged to it; the budget path is the existing tested one.
  - `[low]` `[reject]` (intent) E3b follows one level, not the full autoload closure — matches the spec's stated depth; a closure risks the budget for distant sources.
  - `[medium]` `[patch]` (blind, edge) E3a skips every selected test file when the named manifest is itself changed — now only the manifest's own entry is skipped; fixture case added.
  - `[low]` `[reject]` (blind) `manifestTestFiles` looks only under `packages/<component>/tests/`, so `XT-conformance-*` ids in `conformance/tests/xaravel/` are not found — no child-run test replays a conformance Story; widening means another search root.
  - `[low]` `[patch]` (blind, edge) XT ids match any quoted literal, not a declaration — now matches `xaravelTest(` + quoted id; fixture adds a file that only quotes the id.
  - `[low]` `[reject]` (blind, edge) spawn and manifest detection are not linked, miss `$\`bun test\``, aliased binaries, computed manifest paths and match `bun run test` — syntactic detection by design; a false positive only adds evidence, a miss leaves today's behaviour.
  - `[low]` `[reject]` (blind) new tier-1 entries can crowd out the Story's changed code — E3a/E3b trigger only for replay tests and probes; omitted files are named, and the 1,000,000 cap left ample room in the real 16.2 case.
  - `[low]` `[reject]` (blind, edge) E3b drops namespace-relative qualified names (`new Types\X`, `implements Contracts\Foo`) and trait `use` in class bodies — the probe's direct classes are shown; adding qualified-name resolution is more than a direct fix for a rare gap.
  - `[low]` `[reject]` (blind, edge) E1 misses multi-line attributes, `DataProviderExternal`, callable helpers and blank-line-separated attributes — none occurs in the Upstream tests reviewed so far; each adds parsing branches.
  - `[low]` `[reject]` (blind) E1 label and reason are uncapped — dozens of names are a few hundred characters against a 1,000,000 cap.
  - `[low]` `[reject]` (blind) E1 is skipped when the Upstream test file is listed only by name — no (h) path lists an Upstream test file itself today, so the branch is not reached.
  - `[false]` `[reject]` (blind) the spec's matrix order for E1 is wrong — fix would edit this build's spec; the code and test use file order.
  - `[low]` `[reject]` (blind) the spec lists sprint status but the diff has none — fix edits this build's spec; sprint status changes when the item is set done.
  - `[low]` `[patch]` (blind) docs typo "one one or two" — corrected.
  - `[low]` `[reject]` (blind) E2 triggers on non-test TS files under `packages/<c>/tests/` — every TS file there is a test or its helper; extra evidence only.
  - `[low]` `[reject]` (blind) `upstreamComposerFor` lists `src` twice and is not memoised — cost is a directory listing per citing test; correctness unaffected.
  - `[low]` `[reject]` (blind) a component with no `illuminate/<c>` package gets an "unavailable" note — the note states the true reason, which is what a reviewer needs.
  - `[low]` `[reject]` (blind) untested: two runners on one manifest, string-only probe class, `#` comment lines, a changed Upstream source, E1 vs trait pass order — each is dedupe or ordering already exercised by existing (h) cases.
  - `[low]` `[patch]` (edge) an unreadable candidate file throws out of `manifestTestFiles` — read now guarded, reading as "".
  - `[low]` `[reject]` (edge) a missing Ported Test file is dropped without a note — the manifest is shown, so the reviewer sees what was selected; adding notes adds branches.
  - `[low]` `[reject]` (edge) PSR-4 prefixes of non-framework packages are not read — probes so far load framework sources only.
  - `[low]` `[reject]` (edge) inherited provider/helper dropped with no note — as the intent row above.
  - `[low]` `[reject]` (edge) an unreadable Upstream test file gives no E1 note — the Inventory section already reports an unreadable source.
  - `[low]` `[reject]` (edge) a changed package.json stays in tier 4 — its diff is above in full; it is not lost.
  - `[low]` `[reject]` (edge, claim) docs imply all selected files come with a changed manifest — fixed by the E3a patch above, so the claim now holds.
  - `[low]` `[reject]` (edge, claim) docs say "PSR-4 path" — the path given is exactly the one the code builds.
  - `[low]` `[reject]` (edge) the `bun run test` array is a false positive — only adds evidence.
  - `[low]` `[reject]` (edge) computed manifest paths are missed with no note — matches today's behaviour for that test; no reviewer asked for it.
  - `[low]` `[reject]` (blind) the `methodName:` named-argument form is untested — one alternation of an already-tested regex.
  - `[low]` `[reject]` (blind) E3b depth is not `WHOLE_FILE_DEPTH` — same value (one level past direct) in effect; stated in the docs.

## Design Notes

E1 renders once per Upstream test file, not per row: `TypeTest` has 172 dataset rows on two methods, so per-row repetition would spend the budget for nothing. The label `<file> § <m1>, <m2>, …` follows the `PORTING.md § <heading>` precedent, so `wholeFileLang` fences it as PHP. Helpers reached only through another helper still count (`assertValidOnJsonSchema` → `makeValidator`).

E3b resolves classes by the snapshot's PSR-4 layout (`conformance/upstream/<name>/src/<FQCN as path>.php`), as `upstreamSourcesNamed` does; a same-namespace reference has no `use` line (`JsonSchema::fromArray` → `Deserializer`), so the second level also checks `new X`, `X::`, `instanceof X`, `extends X`, `implements X` against the source's own namespace directory.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/fidelity-review.test.ts` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: no errors
- `bun run harness` -- expected: no differences (run alone, keep output on failure)

## Auto Run Result

Status: done

**Summary.** Evidence (h) of the Fidelity Review prompt now carries what Epic 16's reviewers found missing (E1–E3): the data providers and test-class helpers of each Inventory row's Upstream test (one `<file> § <methods>` excerpt per file); `packages/<c>/package.json` and Upstream's `illuminate/<c>` `composer.json` for a changed test citing an `AD-2.<k>` clause; the Story manifest and the test files a changed test runs in a child `bun test` through it; and the Upstream sources a changed `*.probe.php` loads, one level past its direct classes.

**Files changed.**
- `tools/fidelity-review/fidelity-review.ts` -- `phpTestSupportMethods`, `upstreamComposerFor`, `manifestTestFiles`, `probeSources`; wired into `wholeFileEvidence` tier 1 and `withWholeFiles`.
- `conformance/tests/xaravel/fidelity-review.test.ts` -- fixture and real-repo cases for E1, E2, E3a and E3b in XT-conformance-161.
- `conformance/review/fidelity.md` -- the **Whole files** evidence note (no Check changed).
- `docs/ops/fidelity-review.md` -- the (h) description under Inputs.

**Review.** 34 findings: 5 patched (1 medium: E3a dropped the selected files when the manifest was itself changed; 4 low: declaration-only XT matching, guarded read, docs typo, alias/group/`instanceof` probe tests); 0 deferred; 29 rejected (4 false, 25 low heuristic limits), each with its reason in the triage log. Fidelity Review layer skipped: the item changes `tools/` only and names no `packages/<component>`.

**Follow-up review:** false (one medium and four low patches; no high).

**Verification.** `bun test conformance/tests/xaravel/fidelity-review.test.ts`: 3 pass, 0 fail. `bun run typecheck`, `bun run lint`: clean. `bun run harness` (alone): exit 0, `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, `XARAVEL tests=546 passed=541 failed=0 skipped=5`.

**Residual risks.** Detection is syntactic: inherited or external providers, computed manifest paths, other spawn shapes and namespace-relative qualified names in probe sources are not picked up. The real-repo cases need the synced `conformance/upstream` snapshot, as the existing trait cases do.
