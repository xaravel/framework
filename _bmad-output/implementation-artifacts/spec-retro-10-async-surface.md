---
title: 'Epic 10 item 4: a Pipeline is a declared thenable in the async-surface tool'
type: 'feature'
created: '2026-10-23'
status: 'blocked'
baseline_revision: 'ce7d5177'
---

# Epic 10 item 4: a Pipeline is a declared thenable in the async-surface tool

Action item `epic-10-item-4-async-surface` (decisions/ESC-10.2-2.md, decisions/ESC-10.2-6.md).

## Investigation

- **The list.** The thenable list the tool reads today is `THENABLE_TYPES` in `tools/lint-rules/thenables.ts`, shared with lint's `xaravel/no-async-thenable-return`. XT-conformance-133 (`conformance/tests/xaravel/lint-signatures.test.ts:142`) pins its exact short-name set, so adding the two Pipeline FQCNs also updates that expected set (`Pipeline` added; nothing removed).
- **The list alone is not enough.** A type name is a thenable only when `registeredFqcn` resolves it to a module that calls `registerClass('<FQCN>', X)`. `Illuminate\Contracts\Pipeline\Pipeline` is a contract token (`contract(...)`), never passed to `registerClass` (ESC-10.1-3). And `send`, `through` and `via` in `packages/contracts/src/pipeline/Pipeline.ts` return `this`, which the walk does not resolve at all. For those methods to get thenable lines, as the ruling says they do, the resolver must also recognise a contract token's FQCN and treat `this` in a thenable class or interface as that thenable.
- **ESC-10.2-6's half.** The tool does not check a tag's reason: `TAG_VALUE` (`tools/async-surface/async-surface.ts:107`) accepts `callback` on any method. Per the ruling's "if" clause, nothing changes there.

## Blocking condition

The item's own outcome is a change under `packages/contracts/`. `Pipeline.send`, `through` and `via` already exist on `main`, so once the tool sees a Pipeline as a thenable, `bun run async-surface --all --check` (the required `ci` job, `.github/workflows/ci.yml:191`) reports drift in `packages/contracts/async-surface.json` until three `thenable` lines are committed there.

- This item's branch is `planning/retro-10-*`. The item names no `packages/<component>`, so under the MAINT ruling's 2026-10-22 amendment that file is out of its scope (`planning scope:`), and the item cannot merge with it.
- Without the file, CI fails, and the item cannot merge either.
- ESC-10.2-2 gives "its `async-surface.json` lines" to Story 10.2. That Story's branch may change only `packages/contracts/**` (Epic 10 is past Phase 0), so it cannot carry the tool change.

Options for the Maintainer:

1. Let this item regenerate `packages/contracts/async-surface.json` (name `packages/contracts` for it, so the 2026-10-22 route applies with its Fidelity Review).
2. Let Story 10.2's PR carry this tool change, and drop the item.
3. Another sequencing, for example a one-PR exception for the generated file.

## Auto Run Result

Status: blocked
Blocking condition: scope. The tool change and the `packages/contracts/async-surface.json` lines it produces must land together, and no branch may carry both: a `planning/retro-10-*` branch may not change `packages/contracts/`, and Story 10.2's branch may not change `tools/`. The orchestrator set the item `in-progress` and added it to epic 10's `waiting_on_maintainer` in `retro-gates.yaml`. No code was changed.
