---
title: 'API-surface diff: AD-26 options key types, no union standing for the options object, and the mapped name of a reserved-word parameter (epic-10-retro-item-5, parts 1 and 2)'
type: 'bugfix'
created: '2026-10-24'
status: 'done'
baseline_revision: '3fdff7ef723ac4940f4d61c3d62b214e4d2ee197'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/ops/api-surface.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-retro-2026-10-24.md'
warnings: [oversized]
deferred:
  - summary: >-
      A dropped interface `extends` is still invisible to the API-surface diff (epic-10-retro-item-5, part 3).
    evidence: |-
      The Upstream export lists declared members only (XT-conformance-198) and its declaration record carries no parents
      (schema.json#/$defs/declaration has only `stubbed`); the Upstream snapshot is not committed (.gitignore:33) and is
      not synced where the gate runs. Reporting a dropped parent needs the export to carry parents: tools/oracle/api-surface.php,
      schema.json and every regenerated conformance/api-surface/*.jsonl, outside this item's tools/api-surface scope.
      Waits on the Maintainer for that route.
    location: >-
      tools/api-surface/api-surface.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Epic 10 retro finding S6 (`epic-10-retro-2026-10-24.md`, action item `epic-10-retro-item-5-api-surface-blind-spots`). The API-surface diff (`tools/api-surface/api-surface.ts`) has blind spots the gate every later Component closes on cannot see: (1) the AD-26 options form checks the key names and `?` but not the key types, and accepts the options object as one member of a union (`options?: { b?: X } | string`); (2) a parameter whose Upstream name is an ECMAScript reserved word takes any name, so a port that swaps `defaultValue` and `className`, or names `$default` `fallback`, passes; (3) a dropped interface `extends` is invisible.

**Approach:** (1) Give each options-object key the positional check's type rule (nullability against the Upstream parameter's PHP type), and accept an options parameter only when its type is itself a type literal or names an interface / type alias that is one, never a union. (2) Map a reserved-word parameter to a decided Xaravel name: a fixed table for the names Epic 10 ported (`default` → `defaultValue`, `class` → `className`, `arguments` → `args`), and for any other reserved word the word followed by a capitalised descriptive suffix (`packageName`, `newValue`). (3) is out of scope here; see Boundaries.

## Boundaries & Constraints

**Always:** Keep every other mapping and finding unchanged. Every new failure is a counted `mismatch`. Update the header comment, the Xaravel Tests and `docs/ops/api-surface.md` in place to the stricter rules; an existing expectation changes only where the stricter rule changes its text. `bun run api-surface:gate contracts` must still pass; a real mismatch it now finds is not fixed here (it needs `packages/contracts`, which this item may not change) and stops the run as `blocked` for an Escalation.

**Never:** Touch `packages/**`, `conformance/api-surface/*.jsonl`, `conformance/api-surface/schema.json`, `tools/oracle/**`, `conformance/scans/**`, `conformance/expectations/**`, `AGENTS.md`, `PORTING.md`, the PRD, the spine, the SPEC or `epics.md`. Never add a citation line. Never edit the item's `action`, `owner` or `epic`.

**Part 3 is not done here (waits on the Maintainer).** Upstream's interface parents are in no input the tool reads: the export lists declared members only (XT-conformance-198), its declaration record has only `stubbed` (`schema.json#/$defs/declaration`), and the Upstream snapshot is not committed (`.gitignore:33`) and is not synced where the gate runs (`api-surface.yml`, `story:check`). Walking the TS `extends` alone has nothing Upstream to compare with. Reporting a dropped parent needs the export to carry each declaration's parents: a change to `tools/oracle/api-surface.php`, `schema.json` and every regenerated `conformance/api-surface/*.jsonl`, outside this item's `tools/api-surface` scope. The item stays `in-progress` and waits on the Maintainer for that route.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Key nullable as Upstream | Upstream `b: ?string` optional; key `b?: string \| null` | matched | none |
| Key not nullable | Upstream `b: ?string`; key `b?: string` | `options overload: parameter N key b is not nullable` | counted mismatch |
| Key nullable, Upstream not | Upstream `b: string`; key `b?: string \| null` | `options overload: parameter N key b is nullable, Upstream string` | counted |
| Untyped Upstream | Upstream `type: null`; any key type | no type failure (as positional) | none |
| Method-signature key | key `b?(): void` with Upstream `b: callable` | not nullable, so matched | none |
| Union options | `options?: { b?: X; c?: Y } \| string` or `Opts \| null` | `options overload: parameter N is a union, not an options object with keys b, c (AD-26)` | counted |
| Alias of a union | `type Opts = { … } \| string` | not an options object (as today: only a type-literal alias is read) | counted |
| Reserved, table name | Upstream `$default`; TS `defaultValue` | matched | none |
| Reserved, wrong name | Upstream `$default`; TS `fallback` (or `className`) | `parameter N is fallback, Upstream default (reserved word: expected defaultValue)` | counted |
| Reserved, no table entry | Upstream `$package`; TS `packageName` | matched; TS `pkg` → `parameter N is pkg, Upstream package (reserved word: expected package<Name>)` | counted |
| Options key of a reserved name | Upstream optional `$default`, `$x`; key `default?` | matched: object keys may be reserved words, keys stay `camel()` | none |

</intent-contract>

## Code Map

- `tools/api-surface/api-surface.ts:195-202` -- `RESERVED`: keep; add an exported `RESERVED_PARAMETER_NAMES` map (`default` → `defaultValue`, `class` → `className`, `arguments` → `args`) and a helper that returns the expected-name failure for a reserved word (table entry exact; otherwise `^<word>[A-Z]`).
- `tools/api-surface/api-surface.ts:820-826` -- `paramFailures`' name check: today skips reserved words; apply the helper.
- `tools/api-surface/api-surface.ts:565-581` -- `LiteralKey` / `literalKeys`: add the key's type (`typeAnnotation` of a property signature; a method signature counts as a non-null function type).
- `tools/api-surface/api-surface.ts:895-913` -- `literalKeyLists`: stop flattening unions; a union is reported by `optionsFailures`.
- `tools/api-surface/api-surface.ts:947-986` -- `optionsFailures`: the union failure, then per matched key the nullability rule of `paramFailures` (only when the Upstream parameter's `type` is not null).
- `tools/api-surface/api-surface.ts:1-60` -- the header comment.
- `conformance/tests/xaravel/api-surface-diff.test.ts:150` (reserved "any name" case), `:173` (`Opts | null` passes) -- updated to the stricter rules; new XT-conformance-265 for the matrix. The diff's tests live in this file; `api-surface.test.ts` tests the Upstream export, so the item's tests go here.
- `docs/ops/api-surface.md:42` (options form), `:50` (reserved word) -- the new rules, and the dropped-parent limit stated as still open.
- `_bmad-output/implementation-artifacts/story-manifests.md:19` -- record XT-conformance-265 as this item's off-manifest ID; the next free ID becomes 266.

## Tasks & Acceptance

**Execution:**
- `tools/api-surface/api-surface.ts` -- the table, the reserved-name rule, key types, union refusal, header comment.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- update the two changed expectations; add XT-conformance-265 with one `single(...)` case per matrix row, including a function and a variadic tail.
- `docs/ops/api-surface.md` -- document both rules and the open dropped-parent limit.
- `_bmad-output/implementation-artifacts/story-manifests.md` -- the off-manifest ID note.

**Acceptance Criteria:**
- Given the repo, when `bun run api-surface:gate contracts` runs, then it exits 0 with 0 unexplained.
- Given the demo fixture, when the api-surface tests run, then every test passes, XT-conformance-137's DETAILS and SUMMARY unchanged.
- Given the repo, when `bun run typecheck`, `bun run lint` and `bun run harness --xaravel` run, then all pass with no differences.

## Spec Change Log

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 17 findings — high 0, medium 2, low 11, false 4, maybe-false 0 (the verification-gap layer reported none; the intent-alignment divergences are triaged as findings)
- findings:
  - `[medium]` `[patch]` (edge) the union failure fires for a positional-only signature whose options-position parameter is `X | null`, blaming a union for a missing options overload — the union failure now fires only when a union member is a type literal or names a typeKeys entry; XT-conformance-265 case added.
  - `[low]` `[patch]` (edge) a type-literal getter key `get c(): string | null` is read as not nullable — getter and setter keys now read their return / parameter type; a method key stays not nullable; case added.
  - `[medium]` `[patch]` (blind 1) the same union misfire — fixed with edge row 1.
  - `[low]` `[patch]` (blind 2) "key types" means nullability only, unstated — docs and header now say an options key's base type is not compared, as a positional parameter's is not.
  - `[low]` `[patch]` (blind 3) an aliased nullable key (`Maybe<T>`) gives a false `not nullable`, as a positional parameter does — the syntactic limit is now documented; resolving aliases would add a new resolver for a shape no ported contract uses.
  - `[low]` `[patch]` (blind 4) the docs cite "PORTING.md's renaming convention", which PORTING.md lacks — the docs and header now cite the names Epic 10 ported (spec-10-1/10-2/10-3) held in `RESERVED_PARAMETER_NAMES`. The rule itself is what the retro's action asks for ("check a reserved-word parameter's mapped name"); the 21 contracts parameters already follow it.
  - `[false]` `[reject]` (blind 5) sprint status and the retro document are not updated — the orchestrator records the item's status and the part-3 wait after this build (iteration step D), outside the reviewed diff.
  - `[low]` `[reject]` (blind 6) the fixture edit is missing from the Code Map and hides the new rules from the CLI run — the fix would edit this spec; the rules are pinned case by case in XT-conformance-265 through `diffComponent`, the same code the CLI runs.
  - `[low]` `[reject]` (blind 7) `Opts | null` and an alias of a union get different messages — the alias case keeps the pre-existing message and both are counted mismatches; unifying needs alias resolution.
  - `[low]` `[patch]` (blind 8) XT-conformance-265 lacks the positional-only nullable case — added with edge row 1; the other suggested cases (untyped key, `| undefined`, base-type difference) pin behaviour the docs now state and were not added.
  - `[false]` `[reject]` (blind 9) spec matrix and Verification gaps — fixes would edit this spec; the counts come from the jq scan over `conformance/api-surface/*.jsonl` run at planning.
  - `[low]` `[patch]` (intent A) key base types not compared — same root as blind 2.
  - `[false]` `[reject]` (intent B) `| null` refused, stricter than one reading — the Design Notes choose it: AD-26's single options object, AD-9's absent value is the parameter's `?`.
  - `[low]` `[patch]` (intent C) the mapping is created by the tool — same root as blind 4.
  - `[low]` `[defer]` (intent D) the dropped-parent check is not done — pre-existing blind spot the change does not cause; Upstream parents are in no input the tool reads, so it waits on the Maintainer (Boundaries).
  - `[false]` `[reject]` (intent E) tests in `api-surface-diff.test.ts`, not `api-surface.test.ts` — `api-surface.test.ts` tests the Upstream export; the diff's tests live in `api-surface-diff.test.ts` (Code Map).
  - `[low]` `[reject]` (intent F) docs, manifest note and spec beyond the two named locations — the docs describe the tool's rules (LESSONS epic 8), and the ID note is the off-manifest registry.

## Design Notes

- **Why a prefix rule beyond the table.** Of the 14 reserved words among Upstream parameter names (437 `default`, 165 `arguments`, 64 `class`, then `package`, `function`, `new`, `for`, `with`, `break`, `var`, `throw`, `in`, `catch`, `case`), only three have been ported, under the names Epic 10's specs set (spec-10-1 and 10-2: `default` → `defaultValue`; spec-10-3: `arguments` → `args`, `class` → `className`). Two of those three are the word plus a capitalised suffix; that shape is the rule for the rest, so a later port still gets a checked, descriptive name without a tool change, and `args` is the table's one exception.
- **Why no union, even `| null`.** AD-26's options object is "a single options object"; a union lets a non-object stand in its place, and AD-9's absent value is expressed by the parameter's `?`.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/api-surface-diff.test.ts` -- expected: all pass
- `bun run api-surface:gate contracts` -- expected: exit 0, 0 unexplained
- `bun run typecheck` -- expected: exit 0
- `bun run lint` -- expected: exit 0
- `bun run harness --xaravel` -- expected: SUMMARY with no differences

## Auto Run Result

Status: done (parts 1 and 2 of epic-10-retro-item-5; part 3 deferred, waiting on the Maintainer)

**Summary.** The API-surface diff now:
- checks each AD-26 options key's nullability against the Upstream parameter's PHP type, as a positional parameter's is. Getter and setter keys read their own types, and a method key is not nullable.
- refuses a union standing for the options object (`| null` included) with `parameter N is a union, not an options object with keys … (AD-26)`, only when a union member is an options literal or names one. Any other union gets the existing message.
- maps a reserved-word parameter to a decided name: `RESERVED_PARAMETER_NAMES` (`default` → `defaultValue`, `class` → `className`, `arguments` → `args`), otherwise the word plus a capitalised suffix.

**Files changed.**
- `tools/api-surface/api-surface.ts`: the rules and the header comment.
- `tools/api-surface/fixtures/demo/src/Repository.ts`: `get`'s `defaultValue`, and `pull`'s options type is no longer a union, so XT-conformance-137's DETAILS and SUMMARY stay unchanged.
- `conformance/tests/xaravel/api-surface-diff.test.ts`: two stricter expectations, plus XT-conformance-265, one case per matrix row and per review fix.
- `docs/ops/api-surface.md`: the rules and limits, including the open dropped-parent limit.
- `_bmad-output/implementation-artifacts/story-manifests.md`: XT-conformance-265 is this item's off-manifest ID.

**Review.** 17 findings: 8 patched (2 medium, 6 low), 1 deferred (the dropped parent, part 3), 8 rejected (reasons are in the triage log). Follow-up review: false. Two medium findings shared one root cause and one fix (the union misfire), and XT-conformance-265 pins that fix.

**Verification.**
- `bun test conformance/tests/xaravel/api-surface-diff.test.ts`: 5 pass.
- `bun run api-surface:gate contracts`: 0 unexplained.
- `bun run typecheck`: ok.
- `bun run lint`: ok.
- `bun run harness --xaravel`: 360 passed, 0 failed, 5 skipped, differ=0.

**Residual risks.**
- Nullability is read syntactically, so an aliased nullable key or parameter counts as not nullable.
- Base key types are not compared.
- Part 3 (dropped interface `extends`) needs Upstream parents in the export. That route is the Maintainer's.
