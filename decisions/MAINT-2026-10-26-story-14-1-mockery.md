---
decision: approved
decided_by: Maintainer
date: 2026-10-26
scope: Story 14.1 (Enumerable core), ESC-14.1-11
---

# Maintainer ruling: Story 14.1, Mockery mocks of contract tokens

The Maintainer gave this ruling on 2026-10-26 in the Maintainer's session. It approves the orchestrator's recommended option on ESC-14.1-11 (#463), with the monitor's agreement. Story 14.1's earlier rounds are `decisions/MAINT-2026-10-25-story-14-1.md`, `decisions/MAINT-2026-10-25-story-14-1-second.md` and `decisions/MAINT-2026-10-26-story-14-1-third.md`.

`packages/mockery` is a grader path, so the runtime-builtins standing rule (`decisions/MAINT-2026-10-26-runtime-builtins.md`) does not cover this change. The Maintainer ruled it directly. The change makes the grader more faithful to PHP. It does not weaken it.

## The route

1. **Infrastructure first.** Action item `epic-14-item-4-mockery-contract-token-targets` makes the change, as one Maintainer-approved Infrastructure change.
   - **Scope:** `packages/mockery`. `packages/assert` is in scope only to export an existing `ContractParents` helper, with no behaviour change.
   - **What it builds:**
     - `Container.parseArguments` recognises a contract token target (`isContractToken`), so a frozen token object is no longer read as a PHP array of quick definitions.
     - The generated mock class defines the token's brand and every parent brand (`defineContractBrand` over `contractParentBrands`), as the JMac generator does.
     - The expectation chain and the token's method names work as for a class target.
   - **Tests:** XT-mockery cases.
     - `Mockery.mock(<contracts token>)` and `Mockery.mock(<runtime PHP-interface token>)` are `instanceof` the token and its parents.
     - A class, string or symbol target is unchanged.
     - A plain PHP-array argument is still read as quick definitions.
   - **Limits:** no other Mockery or grader behaviour changes, and no assertion is weakened.
   - The loop takes action items before Stories, so this lands first.
2. **Then Story 14.1.** Its four ESC-14.1-11 Test IDs port as Upstream wrote them. The Story then re-runs its done check and the Fidelity Review.
