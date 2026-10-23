---
status: in-progress
---

# Story 10.1: Token, brand and `contract<T>()` mechanism

## Auto Run Result

Status: blocked
Blocking condition: prerequisite not landed. `decisions/ESC-9.1-3.md` (Maintainer, 2026-10-21) requires a `CONSEQUENCE_SOURCES` row and a generated `conformance/xaravel-consequences/contracts.jsonl` "before that Component's first Story with Xaravel Tests" (action item `epic-9-item-1-consequence-rows`). Story 10.1 is the first `contracts` Story and its manifest lists XT-contracts-1..4, so it cannot start until that row lands. The row itself waits on the Maintainer's reading of the ESC-9.1-3 rule: see the five questions in `spec-retro-9-consequence-rows.md` (the saved literal-reading attempt is `retro-9-consequence-rows-attempt.patch`).

Stopped at step 1, before planning: no spec, code or tests were written. The compiled `epic-10-context.md` is kept for the resumed run.

Also noted for the resumed run: `epics.md` lists five acceptance criteria for Story 10.1, including "a test double reads a contract token's method names at `Symbol.for('xaravel.contract.methods')`" (ESC-4.5-1 item 3, ESC-4.7-1 item 5). The manifest `stories/10.1.md` maps only four (XT-contracts-1..4) and has no row for that criterion. Every new contracts subpath also needs an approved `SUBPATH_EXPORTS` entry in `conformance/tests/xaravel/scaffold.test.ts` (ESC-9.1-1).

### Resumed run, 2026-10-22

Status: blocked
Blocking condition: two Escalations, both waiting on the Maintainer. Together they cover all four of this Story's Test IDs.

- `conformance/escalations/ESC-10.1-1.md` (XT-contracts-1, -2, -3, trigger `contract`). AD-1's `readonly [Token]: true` brand key and `x instanceof Token` cannot type-check on one binding under TypeScript 7.0.2. A `unique symbol` token enforces the brand but fails TS2359 as an `instanceof` operand. A `unique symbol & { [Symbol.hasInstance] }` token compiles for `instanceof` but degrades the key to a `symbol` index signature, so a missing brand is not caught. The recommended fix types the compile-time key as `Token.brand`, which changes AD-1's wording. The same Escalation asks which test covers the method-metadata criterion (it has no XT row in `stories/10.1.md`) and where the parameter names live.
- `conformance/escalations/ESC-10.1-2.md` (XT-contracts-4, trigger `protected-path`). `./psr` needs a `SUBPATH_EXPORTS` entry in the Protected `conformance/tests/xaravel/scaffold.test.ts` (ESC-9.1-1).

The resumed run stopped at step 2, before the plan was written: no code or tests were written. The probes were run outside the repository, under `/tmp`. The ruling decides the token's type shape, and every task in the plan depends on it. The compiled `epic-10-context.md` is still valid for the next run.

### Maintainer rulings, 2026-10-22

- `decisions/ESC-10.1-1.md`: option 1. The compile-time brand key is `Token.brand`, a per-contract `unique symbol` whose value is `Symbol.for('<FQCN>')`. The interface requires `readonly [Token.brand]: true`. The token's `Symbol.hasInstance` reads the brand, and its `Symbol.toPrimitive` returns the key. Generators emit `get [Token.brand]()`. The fourth criterion is XT-contracts-18, now in the manifest. Parameter names go at `Symbol.for('xaravel.contract.parameters')`, a frozen `{ <method>: [<param>, …] }` record.
- `decisions/ESC-10.1-2.md`: option 1. `SUBPATH_EXPORTS` lists every `@xaravel/contracts` subpath Epic 10 builds, `psr` included.

Resume at step 2 (plan) for XT-contracts-1..4 and XT-contracts-18. `epic-10-context.md` is updated to the ruling.
