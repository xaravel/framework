---
decision: approved
decided_by: Maintainer
date: 2026-10-24
scope: Epic 10 retrospective items 1, 2 (and its item 10), 4, 5 (part 3), 6 and 7
---

# Maintainer rulings: Epic 10 items 1, 2, 4, 5, 6 and 7

The Maintainer gave these rulings on 2026-10-24 in the Maintainer's session, accepting each recommendation. Finding codes are those of `_bmad-output/implementation-artifacts/epic-10-retro-2026-10-24.md`.

## Item 1: the Phase 1 exit waits for Phase 1's end (S1)

`decisions/PHASE-1-EXIT.md` is the acceptance decision for all of Phase 1, Epics 9 to 16 (`epics.md`, `### Phase 1: Foundations`), not for Epic 10. The Maintainer signs it after Epic 16's retrospective, as `PHASE-0-EXIT.md` was signed after Epic 8's. Until then `packages/contracts/**` is not Protected, so Epic 10 items 3 and 4 and Epics 11 to 16 can still change contracts through their own PRs.

Story 10.6's second AC ties protection to that file being merged, not to the epic's close, and XT-contracts-17 proves the mechanism. S1 is accepted as "activates at the Phase 1 exit, by design". `epic-10-retro-item-1-phase-1-exit` stays `open` and in `waiting_on_maintainer`. It does not block Epic 11, because the gate is `blocked: false`.

## Item 2: a contract token is its class-string to PHP (L1, L2)

As a PHP value, a contract token is its Upstream FQCN string, as PHP's `Arrayable::class` is. AD-9 gains a **Contract tokens** clause and AD-23's codecs line names it:

- `jsonEncode`, `phpSerialize` and `phpVarExport` (`packages/runtime`) write a token as its FQCN string.
- `@xaravel/assert` reads a token as that string in its exporter and in its `==` / `===`. So `assertSame(Arrayable, 'Illuminate\Contracts\Support\Arrayable')` passes, as in PHP, and a failing `assertSame(Arrayable, Jsonable)` prints two class names. This is a grader change, approved here. It removes no assertion: it makes the grader compare as PHP does.
- JS coercion is unchanged. `Symbol.toPrimitive` still gives the brand key for every hint (AD-1, ESC-10.1-1), because a computed key such as `get [Arrayable]()` coerces with the same `string` hint as a template literal, so one hook cannot serve both. In `packages/*/src`, string-coercing a token (template literal, `String(token)`, `+` with a string) is a lint error, and messages name a token with `fqcn(token)`.

The orchestrator builds this as new action item `epic-10-retro-item-10-token-class-string`, after item 4. Runtime then uses runtime's `isContractToken`, and assert uses its grader-side copy (item 4, AD-15). Its scope is `packages/runtime` and `packages/assert` (`packages/mockery` too, if Mockery prints a token), with XT cases for each encoder, the exporter and `assertSame`. This ruling also approves its one change outside `packages/`: the lint rule in `tools/lint-rules/`, with its tests. That is the only `tools/` change item 10 may make.

### Item 10's route (added 2026-10-24, after #392)

The orchestrator stopped item 10 (#392) for two scope questions and asked one about behaviour. All three are approved as the orchestrator recommended:

1. **XT-contracts-11 and XT-contracts-19 are re-pinned to token identity.** `aliases.test.ts` and `hardening.test.ts` in `packages/contracts/tests/xaravel/` used `assertSame(token, fqcnString)` to check that a resolver returns a token, not a string. Under this item's ruling that check passes for the string too, as PHP's would. Each such check becomes a JS identity check: the result is `===` the token object and its `typeof` is not `"string"`. The property each test pins stays as strict, and no other assertion changes. This is the item's one change in `packages/contracts`, and it falls outside the stale-test rule (`MAINT-2026-10-24-stale-cross-scope-tests.md`), because the check itself changes.
2. **`.oxlintrc.json` enables the new lint rule.** That is the only change allowed in that Protected file.
3. **Mockery's `with(token)` follows Upstream Mockery.** A token is its class-string, so `with(Arrayable)` matches as Mockery 1.6's `Expectation::_matchArg` matches `with(Arrayable::class)`: identical or loosely equal values, the FQCN string itself, and an object that is an `instanceof` that class. The orchestrator confirms this against the Mockery source at the version the Oracle installs. Any difference stops the item with an Escalation.

Item 10 leaves `waiting_on_maintainer`. Its status stays `in-progress`, and the orchestrator resumes it.

## Item 4: two contract-token predicates, pinned equal (L7, L8)

The orchestrator raised this item on 2026-10-24 (#383). As written, it puts one `isContractToken` in `packages/runtime` and has assert and Mockery import it. AD-15's Grader isolation forbids that: the grader imports no graded package, not even `@xaravel/runtime` (ESC-10.1-6). AD-15 does not change. The route is the orchestrator's recommendation:

- `packages/runtime` exports `isContractToken` beside `tokenFqcn`. Runtime and `packages/contracts` use it, in place of their own predicates.
- `@xaravel/assert` keeps one grader-side copy with the same definition: a frozen non-function object whose own `CLASS_FQCN` property is a non-writable string. `@xaravel/mockery` uses assert's copy. Both are found by their `Symbol.for` keys, so neither side imports the other.
- One XT test feeds both predicates the same set of genuine, forged and malformed tokens and asserts they agree. Every predicate besides these two goes, including the one in `aliases.test.ts`.
- The rest of the item stands: one `CONTRACT_PARENTS` declaration on each side of the isolation line, and the same brand-getter descriptor and nameless-token display in both doubles. No assertion is removed or weakened.

The item leaves `waiting_on_maintainer`. Its status stays `in-progress`, and the orchestrator resumes it.

## Item 5, part 3: the gate sees declaration parents (S6)

The orchestrator did parts 1 and 2 (#385). Part 3 cannot be done in `tools/api-surface` alone. The Upstream export lists declared members only, its declaration record has no parents, and the Upstream snapshot is not present where the gate runs. The route is the orchestrator's recommendation, approved as this item's one exception to the Protected Paths:

- `tools/oracle/api-surface.php` exports each declaration's parents: an interface's `extends`, and a class's parent and `implements`.
- `conformance/api-surface/schema.json` adds that field.
- The Oracle regenerates every `conformance/api-surface/*.jsonl`. The regeneration may add only the new field: any other changed row is reported and stops the item, as an Escalation.
- The diff in `tools/api-surface` compares a declaration's walked TS heritage with the exported parents, and reports a dropped or extra parent.
- Tests go in `conformance/tests/xaravel/api-surface-diff.test.ts`. `api-surface:gate contracts` still passes, or an Escalation is raised for any real mismatch it finds.

These three paths (`tools/oracle/api-surface.php`, `conformance/api-surface/schema.json`, `conformance/api-surface/*.jsonl`) are the only Protected Paths the item may change, and only for this. The item leaves `waiting_on_maintainer`. Its status stays `in-progress`, and the orchestrator resumes it.

## Item 6: the planning text follows Epic 10's rulings (S2, S3)

Done in this PR:
- AD-1's alias-table clause gives ESC-10.4-1's two cases: among unrelated contracts, the first in Upstream's order; for a service with no contract, its Upstream string key.
- Story 10.4's ACs in `epics.md` say `canonicalToken` returns the canonical abstract under AD-1, and list ESC-10.4-1 (c)'s four validation failures.
- AD-25's summary in `epics.md` and Story 10.5's AC give the corrected hook order (ESC-10.5-1), as the spine already does.

## Item 7: three tool defects (P3)

Done in this PR:
- **(a) A waiver's subject is a quoted string.** `fidelityWaivers` (`tools/fidelity-review/fidelity-review.ts`) grants nothing for a subject that is not a YAML string. An unquoted `subject: 9.10` is the number 9.1, and before this change it waived Story 9.1. `parseDecision` (`tools/escalations/escalations.ts`) reports such a waiver as an invalid decision, along with an empty or non-`F-<n>` items list, so `escalations:check` in the required `check` job refuses it before it merges. Tests: XT-conformance-27 and XT-conformance-162.
- **(b) No code change.** `review` reports `current` without running a reviewer only when both reviewers already have records for the unchanged reviewed tree, and those records count. Running them again on that tree is what ESC-8.8-1 forbids. `decisions/MAINT-2026-10-23-fidelity-waivers.md` rule 4 now says so, and XT-conformance-162 already pins it.
- **(c) CI's `check` job runs `upstream:check` after `upstream:sync`.** `sync` already checks the commit, the tree and the checkout's hash. `check` also refuses stray directories in the snapshot root, and needs no network. XT-conformance-33 pins the step.
