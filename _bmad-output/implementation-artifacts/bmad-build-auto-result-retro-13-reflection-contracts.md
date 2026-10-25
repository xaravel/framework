---
status: blocked
---

# BMad Build Auto Result

Status: blocked
Blocking condition: action item `epic-13-item-2-reflection-contracts` needs a change outside the components its `action` names, so under the 2026-10-22 amendment of `decisions/MAINT-2026-10-16-unattended-orchestrator.md` ("Outside the scope") it waits for the Maintainer.

## Why

The run stopped in planning (step 2), before any code was written. Two questions are open:

1. **The token table needs `packages/contracts`.** ESC-13.1-7 and the item's `action` say the table is "written by `contract(...)`". But `contract()` is defined only in `packages/contracts/src/Contract.ts:208`, and it makes no call into the runtime that could record the token. Its only runtime import is `isContractToken` (line 33), and it builds a frozen object and returns it (lines 215-237).
   - The runtime cannot import contracts: `packages/contracts/package.json` depends on `@xaravel/runtime`, so the table can only be filled by `contract()` calling a new runtime export, such as `registerContractToken(token)`.
   - That is a one-call edit in `packages/contracts`, a component the `action` does not name. The Fidelity Review's `--item` scope comes from the `packages/<c>` names in `action` (`readActionItem`, `tools/fidelity-review/fidelity-review.ts:1171`), so it would leave the edit out of review. The `ownership` check's `planning scope:` violation for it is not one the amendment allows.
   - The orchestrator may not edit the item's `action` to add `packages/contracts`.
2. **The reasons.ts part would merge unreviewed.** The `--item` review keeps only files under the named components (`inItemScope`, line 1225). It drops `tools/expectations/reasons.ts` and its test `conformance/tests/xaravel/skip-reasons.test.ts` (XT-conformance-92/250) as `outOfScopeFiles` (lines 4206-4210). `--stale-test` cannot add them, since it accepts only `packages/<c>/tests/**`. The ESC-13.1-10 change would therefore reach `main` with no Fidelity Review. Earlier tools-only items merged without one (epic 10 item 3, #350), but this item is a mixed one, and the amendment's rule is that it merges once `status --item` prints `current`.

## What the Maintainer could rule

- Add `packages/contracts` to the item's scope (by amending its `action`, or with a ruling that lets this item edit `packages/contracts/src/Contract.ts` and its tests), so `contract()` registers each token in a runtime table.
- Say whether the `tools/expectations/reasons.ts` part may merge with the runtime and assert parts' `current` review and no review of its own, or split it off as its own item, reviewed the way #350 was.

## Planning notes for the resumed run

- **Runtime.**
  - The token table and `interface_exists` go in `packages/runtime/src/registry/registry.ts`.
  - The registry is process-wide, with per-test maps. Story 13.1's `IA` / `IB` tokens are test-local, so the table needs a test-frame scope or must tolerate re-declaration.
  - `reflectionTarget` (`src/php/reflectionTargets.ts:28`) gains the token lookup.
  - `ReflectionEnum` and `enum_exists` read `static backingType` (spine AD-26, line 523).
  - Next free id: XT-runtime-48. The new exports must also be documented (XT-runtime-37).
- **Assert.**
  - `classOrInterface` (`packages/assert/src/Framework/Constraints.ts:299`) throws `UnknownClassOrInterfaceException` for every string today.
  - Assert may not import the runtime (spine line 72), so the lookup must go through a `globalThis` protocol the runtime installs, such as `Symbol.for('xaravel.class.lookup')`, which nothing in `src` installs yet.
  - PHPUnit's check is `!class_exists($expected) && !interface_exists($expected)` (vendored `Assert.php:1867`).
  - Next free id: XT-assert-102.
- **reasons.ts.**
  - The blocked-by branch is in `checkLine` (lines 245-258); its header comment is at lines 17-18. It reads only `phase` from `tools/scaffold/packages.jsonl`.
  - A Component's Epic can come from `readManifests` (`tools/ownership/ownership.ts:373`).
  - Several packages (`ai`, `boost-framework`, `create-xaravel`, `mcp`) have no Story yet, so the rule must fail closed for them.
  - The docs row to update is `conformance/README.md:23`. Next free id: XT-conformance-268.
