---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "726a9c6aca864f81029e05ff614f1cf07345ded32d6f76f92f30d9961f28e355"
---

# ESC-10.2-1: approved, option 1 (tokens carry Upstream constants; the API-surface tool reads a contract's static side)

Option 1 is approved. Option 2, a citation under a new DIV clause, is not taken: PHP reads these members from the interface, and Xaravel can do the same.

## The change

- **Constants.**
  - `contract<T, B>(fqcn, members, parents, statics?)` takes an optional record of the contract's Upstream constants.
  - The token keeps them as frozen own properties, so `Filesystem.VISIBILITY_PUBLIC === 'public'`, as PHP's `Filesystem::VISIBILITY_PUBLIC` is.
- **Static methods.**
  - A contract with a static interface method also exports `interface <X>Static` in the same file, for example `interface ShouldBeDiscoveredStatic { shouldBeDiscovered(): boolean }`.
  - An implementing class satisfies it on its constructor side (`L satisfies ShouldBeDiscoveredStatic`).
- **The tool.** `tools/api-surface/api-surface.ts` counts the members of a token's constant record and of `<X>Static` as that FQCN's static members, so the three rows here and `PasswordBroker`'s five constants in Story 10.3 are checked like every other member.

## The route

- **The tool half** is action item **`epic-10-item-3-api-surface-statics`** (owner orchestrator), an approved Infrastructure change:
  - done on a planning branch, with tests;
  - limited to the API-surface tool, with no committed rows, schema or citation file changed;
  - landing before Story work resumes (step D).
- **The token half** is Story 10.2's (`packages/contracts`), which then fills in the three members and resumes XT-contracts-5 and -7.
