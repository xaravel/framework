---
title: 'API-surface diff: DIV-12 renames, option pairs with neither form, and the AD-26 options overload in addition to the positional form (retro 6 item 14)'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: '843eb201ecf54eaa797fa55fe068ac7e3aa828d6'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/ops/api-surface.md'
  - '{project-root}/decisions/MAINT-2026-10-19-epic-6-items.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 6 retro finding S2 (`_bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md`), routed to this action item by the Maintainer's ruling on item 9 (`decisions/MAINT-2026-10-19-epic-6-items.md`). The API-surface diff (`tools/api-surface/api-surface.ts`) (a) only suppresses a `model-config` method, so the decided DIV-12 renames (`fillable` → `setFillable`, `touches` → `isTouching`, PRD §5.2 DIV-12, spine AD-7) surface as `extra` needing a hand-written addition; (b) marks both forms of an `option-pair` not expected, so a port that drops both is invisible; (c) accepts the AD-26 options object *instead of* the positional form, because `bestFailures` returns `[]` as soon as any signature passes, while AD-26 says such a function "also accepts" the options object.

**Approach:** Add a fixed DIV-12 rename table to the diff and match a `model-config` method with a decided rename under its new name. Satisfy an `option-pair` on a non-trait declaration by either Xaravel form, and report one `missing` when neither exists. For a member with two or more optional non-variadic Upstream parameters, require a positional signature and an options-form signature separately, and report each failing form.

## Boundaries & Constraints

**Always:** Keep every other mapping and finding unchanged. Every new failure is a counted item, explained only by an existing `exceptions.jsonl` line. Update the fixture, the Xaravel Tests and `docs/ops/api-surface.md` in place to the stricter rules. Never relax an existing expectation except where the stricter rule changes the expected text.

**Never:** Touch `conformance/api-surface/*.jsonl`, `conformance/scans/div12-pairs.jsonl`, `conformance/expectations/**`, `AGENTS.md`, the PRD, the spine, the SPEC or `epics.md`. Never invent rename targets beyond the two that DIV-12 decides. Never drop a check to make the fixture pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rename matched | `model-config` pair `fillable`, Upstream method `fillable(array $fillable)`, TS `setFillable(fillable: string[])` | no item for it; counted as matched; no `extra setFillable` | none |
| Rename absent | same, TS lacks `setFillable` | `missing method X::fillable: expected as setFillable (DIV-12)` | explained only by an exceptions line |
| Rename mis-signed | TS `setFillable()` | `mismatch method X::fillable: parameter 1 (fillable) is missing` | as any mismatch |
| Other model-config | `model-config` pair `booted` | `div12 method …::booted: model-config` (unchanged) | none |
| Option pair, a form present | class (not trait), TS has property or method `middleware` | every pair record `div12 …: option-pair`; the TS member is not `extra` | none |
| Option pair, neither form | class, TS has no `middleware` | one `missing <kind> X::middleware: option pair: neither form is declared (DIV-12, AD-26)` on the first record, `div12` for the other | counted |
| Option pair on a trait | Upstream declaration `kind: trait` | `div12` for both (AD-26: base classes declare neither) | none |
| Both forms | ≥2 optional params, TS has positional and options overloads | matched | none |
| Options only | only `f(a, options?)` | `mismatch`: the positional failures | counted |
| Positional only | only `f(a, b?, c?)` | `mismatch: options overload: parameter 2 is not an options object with keys b, c` (each options failure prefixed `options overload: `) | counted |
| One optional | 1 optional param | positional only, as today | none |

</intent-contract>

## Code Map

- `tools/api-surface/api-surface.ts:885-897` -- `signatureFailures`: today picks the fewer of the positional and options failures per signature. Split it so that a member's positional failures and options failures are each the best over its signatures.
- `tools/api-surface/api-surface.ts:847-883` -- `optionsFailures`: reuse unchanged.
- `tools/api-surface/api-surface.ts:917-930` -- `bestFailures`: reuse unchanged.
- `tools/api-surface/api-surface.ts:972-992` -- the `notExpected` map built from DIV-12 pairs (classification keyed by owner, kind and name). Reuse it to find `model-config` and `option-pair` records.
- `tools/api-surface/api-surface.ts:1011-1072` -- the per-declaration member loop: the `div12` branch, the candidate lookup by mapped `name`, the `mismatch` and matched branches, the `unmatched` → `renamed` / `missing` pass (it maps with `memberName`; a renamed record must use its target), and `extras`.
- `tools/api-surface/api-surface.ts:1084-1093` -- functions also use `signatureFailures` + `bestFailures`; they get the same both-forms rule.
- `tools/api-surface/api-surface.ts:1-46` -- the header comment; update it for the new rules.
- `tools/api-surface/fixtures/demo/src/Model.ts`, `demo.jsonl`, `additions.jsonl` -- fixture: `setFillable` becomes a matched rename (the `setFillable` additions line goes away, or it would be `stale`). Upstream `Demo\Model::fillable` gets a `fillable` array parameter. The Model gets a `middleware` form.
- `tools/api-surface/fixtures/demo/src/Repository.ts:53-61`, `helpers.ts` -- `many`, `pull` and `helperFn` have two optional params each. Give each both overloads so that they stay matched.
- `conformance/tests/xaravel/api-surface-diff.test.ts:73-97` (DETAILS, SUMMARY), `:172-188` (options cases), `:413-434` (gate output) -- update to the new rules and add the matrix cases.
- `docs/ops/api-surface.md:32-33` -- the DIV-12 and options-form rules.

## Tasks & Acceptance

**Execution:**
- `tools/api-surface/api-surface.ts` -- add an exported `DIV12_RENAMES` map (`fillable` → `setFillable`, `touches` → `isTouching`, citing PRD DIV-12). Apply the rename, option-pair and both-forms rules from the matrix, and update the header comment.
- `tools/api-surface/fixtures/**` -- make the fixture follow the new rules, as the Code Map says.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- update DETAILS, SUMMARY and the gate expectations. Add one inline `single(...)`/`diffComponent` case for each matrix row in `matrixEdgeCases`, with `div12` input pairs where needed.
- `docs/ops/api-surface.md` -- document the rename table, the option-pair rule (trait exemption) and the both-forms rule.

**Acceptance Criteria:**
- Given the demo fixture, when `bun test conformance/tests/xaravel/api-surface-diff.test.ts` runs, then XT-conformance-137 and its siblings pass, with `setFillable` matched as Upstream `fillable` and no `extra setFillable`.
- Given the repo, when `bunx tsc -b` (the repo typecheck script) and `bun run lint` run, then both pass.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 15, false 7, maybe-false 2
- findings:
  - `[low]` `[patch]` (verification-gap) renamed-against-target path untested — added a `setfillable` → `renamed` case.
  - `[low]` `[reject]` (verification-gap) every real component reports 0 matched members, so the new rules are fixture-only today — true, and the same as the V1 re-check the Maintainer's ruling already routes to Story 10.6; there is nothing to change here.
  - `[low]` `[reject]` (intent) the rename target is hard-coded, not read from the pair list (spine AD-7 wording) — `div12-pairs.jsonl` has no target field, and the intent names the two renames explicitly; adding a field would change scan data this item may not touch.
  - `[maybe-false]` `[reject]` (intent) the trait-only exemption is the diff's own line under AD-26's "base classes declare neither" — in the 13 real option pairs, every default-providing `declaredIn` that declares only one side is a trait (`Queueable`, `HasAttributes`), and the other declarers are concrete; if true, it would only be low (a counted item, explainable by an exceptions line). The docs state the rule.
  - `[low]` `[reject]` (intent) one union-typed signature does not satisfy both forms — ports use overloads (docs), and the fix would add complexity for an unlikely shape.
  - `[false]` `[reject]` (edge) a form inherited from a base/mixin gives a false `missing` — an option-pair record sits on the class that declares it (export by declaring class), so that class itself must declare a form; the walk was already documented as syntactic.
  - `[false]` `[reject]` (edge) abstract base / interface declarers get a counted `missing` — no interface carries a property record, and no real option-pair declarer is a non-trait abstract base.
  - `[low]` `[patch]` (edge) a trait that declares a form gets `extra`, contrary to the spec claim — that is the intended reading (AD-26: base declares neither); documented and tested.
  - `[low]` `[patch]` (edge) the return failure is duplicated across both forms — prefixed duplicates of positional failures are dropped; tested.
  - `[low]` `[reject]` (edge) implementation defaults are skipped when the impl's parameter names differ from the overloads' — this was already the behaviour for every overloaded member, not caused by this change; it is skipped only when the porter renames the impl's parameters.
  - `[false]` `[reject]` (edge) a rename target collides with another Upstream member's mapped name — no Upstream record names `setFillable` or `isTouching` (grep over `conformance/api-surface/*.jsonl`).
  - `[false]` `[reject]` (edge, claim) matrix "Positional only" text is incomplete — the matrix row is an example; the test asserts the full output, and the prefix rule covers the rest.
  - `[false]` `[reject]` (edge, claim) "not extra" is false on traits — the matrix row is scoped to "class (not trait)".
  - `[low]` `[patch]` (blind) duplicate return failure — same as the edge row above; fixed there.
  - `[low]` `[reject]` (blind) positional best may score the options overload — the details point at the closest signature, and the item is still counted; fixing it needs shape-classification logic.
  - `[low]` `[reject]` (blind) an option pair is satisfied by a member of any shape (e.g. static) — DIV-12 accepts either form, and a static form is unlikely; checking it would add branches.
  - `[maybe-false]` `[reject]` (blind) one exceptions line for `fillable` explains both the missing rename and a property mismatch — citation lines had no kind before this change, so this is not caused by it; if true it would be low.
  - `[low]` `[patch]` (blind) `helperFn` fixture's options overload is declaration-only — the implementation now unpacks the options.
  - `[low]` `[patch]` (blind) missing rename tests (touches, declaredIn owner, old name) — added.
  - `[low]` `[patch]` (blind) option-pair and both-forms edges untested (method-only record, trait with a form, static with both forms) — added.
  - `[false]` `[reject]` (blind) the trait exemption is narrower than AD-26 — duplicate of the intent row; real data has no counter-case.
  - `[false]` `[reject]` (blind) Acceptance and Verification disagree on the typecheck command — `bun run typecheck` runs `tsc -b` (package.json); a fix would edit the spec.
  - `[low]` `[reject]` (blind) spec metadata stale (status, line ranges) — the status is set by the workflow; a fix would edit the spec.
  - `[low]` `[patch]` (blind) header comment splice and ambiguous docs wording — rewrapped and reworded.

## Design Notes

- **Trait exemption.** AD-26 says that for option pairs "base classes declare neither, and the framework reads `option(this, name)`". The Upstream export lists a member on its declaring class, and in the pair list the providers of defaults are traits (`Illuminate\Bus\Queueable::$middleware`, `Eloquent\Concerns\HasAttributes::casts`). Concrete classes that set the option (`DatabaseNotification::$casts`, `CallQueuedListener::uniqueId`, `BroadcastEvent::middleware()`) must keep it in some form. So a `trait` declaration is exempt from the "neither form" check.
- **Why the rename table is in the tool.** `div12-pairs.jsonl` holds no target name, and DIV-12 decides exactly two. Any other `model-config` method stays `div12`, and its new name is still cited.
- The `options overload: ` prefix keeps a positional failure and an options failure apart in one `mismatch` details string.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/api-surface-diff.test.ts conformance/tests/xaravel/api-surface.test.ts` -- expected: all pass
- `bun run typecheck` -- expected: exit 0 (check `package.json` for the script name)
- `bun run lint` -- expected: exit 0
- `bun run harness --xaravel` -- expected: SUMMARY with no differences

## Auto Run Result

Status: done

**Summary.** The API-surface diff now:
- matches a `model-config` method that has a decided DIV-12 rename (`DIV12_RENAMES`: `fillable` → `setFillable`, `touches` → `isTouching`) under its new name, signature-checked, or reports `missing … expected as <name> (DIV-12)`;
- lets either Xaravel form satisfy an `option-pair` on a non-trait declaration, and reports one counted `missing` when neither form exists (traits are exempt; a form a trait declares is `extra`);
- requires a positional signature and an AD-26 options-form signature separately for any member with two or more optional non-variadic parameters. Options failures are prefixed `options overload: `, and a duplicate of a positional failure is dropped.

**Files changed.**
- `tools/api-surface/api-surface.ts`: the rename table, the option-pair rule, the both-forms rule and the header comment.
- `tools/api-surface/fixtures/**`: `setFillable` is now a matched rename (its additions line removed); the Model has a `middleware` property; `many`, `pull` and `helperFn` have both overloads.
- `conformance/tests/xaravel/api-surface-diff.test.ts`: the new DETAILS and SUMMARY, the gate output, and one inline case per matrix row plus the review edges.
- `docs/ops/api-surface.md`: the new rules.

**Review.** 24 findings: 8 patched (all low), 16 rejected (reasons are in the triage log), 0 deferred. Patched counts by verdict: high 0, medium 0, low 8. A follow-up review is not recommended: nothing high or medium was patched.

**Verification.**
- The api-surface tests: 9 pass.
- `bun run typecheck`: ok.
- `bun run lint`: ok.
- `bun run harness --xaravel`: 265/265, differ=0.

**Residual risks.**
- The rules have run only on fixtures. No real package registers a class yet, so the first real check is Story 10.6's gate (the V1 ruling).
- Under the both-forms rule, about 1,500 Upstream methods and functions will each need two overloads, or an exceptions line.
