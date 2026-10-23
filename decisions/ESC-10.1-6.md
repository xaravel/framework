---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "32fb07ffed7f44bebf0ba0fb1bc44dc947eb7b6774a5a6a20e7624a1ec52e49a"
---

# ESC-10.1-6: approved, option 1 (tokens record their parents; doubles carry every brand in the chain)

Option 1 is approved. In PHP, a mock of an interface is an instance of every interface it extends, and Xaravel's doubles do the same. Option 2, which would document the difference, is not taken: code that catches `instanceof ContainerExceptionInterface` would miss a double that PHP catches.

## The change

- **Tokens.**
  - `contract<T, B>(fqcn, members, parents?)` takes an optional list of parent tokens.
  - It keeps them as a frozen array at `Symbol.for('xaravel.contract.parents')`.
  - The PSR tokens, and the tokens Story 10.2 generates, pass their Upstream parents.
  - This half is Story 10.1's, in `packages/contracts`.
- **Doubles.**
  - PHPUnit's `Generator` (`packages/assert`) and Mockery's `DoubleTarget` (`packages/mockery`) define the brand of every contract in the target's parents' closure on the double's prototype, as well as the target's own.
  - They read the parents from the token's `Symbol.for('xaravel.contract.parents')`. A token without that key has no parents, so the behaviour is as today.
  - The graders import no graded package, so this half works with any token that carries the key. Its tests use stand-in tokens.

## The route

The doubles half is outside Story 10.1's component, so it becomes action item **`epic-10-item-2-double-parent-brands`** (owner orchestrator):
- It goes on the retro-item route of the MAINT-2026-10-16 amendment of 2026-10-22, with scope `packages/assert` and `packages/mockery`.
- It gets the Fidelity Review in `--item` mode, with Xaravel Tests for a double of a child contract in each package.
- Step D runs before Story work, so the item lands first. Story 10.1 then adds the parents to its tokens and resumes XT-contracts-4.

**Enabling change.** That amendment said "A new item is added only by a retrospective". It now also allows a Maintainer ruling, as ESC-10.1-4 already did for `epic-10-item-1-psr-api-surface`.

## Changes in this ruling's PR

- **`decisions/MAINT-2026-10-16-unattended-orchestrator.md`:** the one-line change above.
- **Sprint status:**
  - adds the action item, `open`;
  - Story 10.1 is `in-progress`.
- **Story 10.1's spec:** `in-progress`, with the ruling in its run log.

## Rationale

- **The fix follows PHP:** the double is an instance of the whole interface chain.
- **The grader gets stricter, not weaker.** No assertion, expected value or skip changes.
- **The work stays within each package's own scope:** the token half in `contracts`, the doubles half in `assert` and `mockery`.

This ruling clears ESC-10.1-6 for XT-contracts-4, after the action item.
