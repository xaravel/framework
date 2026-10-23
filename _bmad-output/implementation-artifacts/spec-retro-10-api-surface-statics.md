---
title: 'Epic 10 item 3: the API-surface tool counts a contract''s static members'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '7811a217c70465acb39a82010903ae19f8e4ec7a'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** A PHP interface can declare constants and static methods (`Filesystem::VISIBILITY_PUBLIC`, `ShouldBeDiscovered::shouldBeDiscovered()`, `PasswordBroker`'s five constants), but `tools/api-surface/api-surface.ts` reads a contract's members only from the same-named `interface`/`class` in the `.d.ts`, which cannot hold a static member. So those `static: true` rows are always `missing` or `mismatch` (ESC-10.2-1; action item `epic-10-item-3-api-surface-statics`).

**Approach:** As the Maintainer ruled (decisions/ESC-10.2-1.md, option 1), for a contract-token registration the tool also counts as static members of that FQCN (a) the keys of the token's statics record, the 4th argument of its `contract(fqcn, members, parents, statics)` call, read from the source, and (b) the members of every `interface`/`class` named `<X>Static` in the same file's `.d.ts`, where `X` is the token's local name.

## Boundaries & Constraints

**Always:** A statics constant is a static property member (type unchecked, as constants are today); a `<X>Static` member keeps its role (method or property) and is static. Both are compared and reported like every other member (missing, extra, mismatch, renamed). Only contract-token registrations get static sides; a `registerClass` registration is unchanged. A statics argument the walk cannot read (not an object literal after unwrapping parentheses, `as`, `satisfies`; a spread; a computed key) is a tool failure naming the file and FQCN, never silently empty. Update the header comment of `api-surface.ts` and `docs/ops/api-surface.md` to say what is now counted.

**Never:** Change any committed `conformance/api-surface/*.jsonl` row, `schema.json`, `additions.jsonl`, `exceptions.jsonl`, or any `packages/**` file. Never remove or weaken an existing assertion. No type-aware resolution (the walk stays syntactic).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Constants | `contract("X\\F", {}, [], { A: "a", "B": "b" })`; Upstream constants A, B static | both matched, no items | — |
| `as const` / `satisfies` | statics `{ A: "a" } as const` | A counted | — |
| Static method | `.d.ts` has `interface FStatic { s(): boolean }`; Upstream static method `s` | matched | — |
| Static extra | `FStatic` declares `t()` not Upstream | `extra method X\F::t` | — |
| Static missing | Upstream static constant `C`, no statics key | `missing constant X\F::C` | — |
| Instance vs static | Upstream non-static method `s` only in `FStatic` | `mismatch … is static, Upstream not static` | — |
| No statics | `contract("X\\F")` with 1–3 args | unchanged behaviour | — |
| registerClass | class `A` registered, file has `interface AStatic` | `AStatic` ignored | — |
| Unreadable statics | 4th arg an identifier, spread or computed key | — | throws `…statics of X\F…must be an object literal…` naming the file |

</intent-contract>

## Code Map

- `tools/api-surface/api-surface.ts:451` -- `contractFqcn(init)`: finds the `contract(...)` call (recursively) or a qualifying `Symbol.for`. Extend so the caller also gets the `contract` call node (or return its statics keys).
- `:495` -- `interface Registration { fqcn, file, local }`: add the token's static constant names (null for a `registerClass`).
- `:522` -- `parsePackage`: contract tokens collected at `:532-541`; registerClass wins at `:550-554`.
- `:342` -- `collectMembers(decl, members)`: `isStatic = member["static"] === true`; add a way to force static for `<X>Static` bodies.
- `:602` -- `classMembers(statements, local)`: merge `<local>Static` (forced static) for contract registrations and add the statics constants as `{ static: true, property: { type: null, optional: false } }` entries (merge with an existing static entry of the same name).
- `:1076` -- `diffComponent` calls `classMembers(...)` per registration; matching at `:1084-1108` already honours `static` (`staticFailures` `:786`, `propertyFailures` `:926`).
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- pure `diffComponent` tests over inline texts (pattern at `:384-396`); `xaravelTest` from `packages/assert`. Next free id: `XT-conformance-262`.
- `docs/ops/api-surface.md:21-31` (How it works 2–3, Parity mappings) and `:95` (Limits) -- wording to update.
- `packages/contracts/src/Contract.ts:97` -- read-only: `contract()` today takes 3 args; Story 10.2 adds `statics?`. `packages/contracts/src/filesystem/Filesystem.ts` -- read-only example (interface + same-named token).

## Tasks & Acceptance

**Execution:**
- `tools/api-surface/api-surface.ts` -- read a contract call's 4th argument into the registration's static constants (unwrap parens/`as`/`satisfies`; throw on anything else); in member collection, for a contract registration, merge members of `<local>Static` declarations as static and add the constants as static properties; update the header comment.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- add `XT-conformance-262` exercising every I/O matrix row through `diffComponent`.
- `docs/ops/api-surface.md` -- describe the contract static side in How it works and Parity mappings.

**Acceptance Criteria:**
- Given main's tree, when `bun run api-surface --all` runs before and after the change, then every component's summary line is identical (no contract uses statics yet).
- Given the change, when `bun test conformance/tests/xaravel/api-surface-diff.test.ts`, `bun run typecheck` and `bun run lint` run, then all pass.
- Given the diff, when `git diff --stat main` is inspected, then only the three files above and this spec (plus sprint status) changed.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 30 findings — high 0, medium 2, low 21, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) The diff also changes `story-manifests.md`, outside the spec's AC file list — the fix edits this build's spec; the change is the repository's XT ID bookkeeping, done the same way for epic-10-item-1 (#338).
  - `[false]` `[reject]` (blind) Sprint status still has the item `open` and the spec is untracked — the orchestrator sets the item `done` with SPS and commits the spec after this run, as its step D says.
  - `[low]` `[patch]` (blind) A number key passes and a bigint key is reported as "a computed key" — patched: only an identifier or string key is accepted; any other key fails with `found an unsupported key`.
  - `[medium]` `[patch]` (blind) A token's statics fail the run even when a same-FQCN `registerClass` replaces it — patched: statics are read only for tokens that register; test added.
  - `[low]` `[patch]` (blind) An explicit `undefined` statics argument throws — patched: `undefined` means no statics; test changed to expect none.
  - `[low]` `[patch]` (blind) Limits omit that `<X>Static` is read only by exact name in the same `.d.ts` and without `extends` — patched in docs.
  - `[low]` `[patch]` (blind) Doc says a registerClass "has no static side", header says "beyond its own `static` members" — patched: doc uses the header's wording.
  - `[low]` `[patch]` (blind) The statics-key plus `<X>Static` method merge is untested — patched: case added (same root as the verification-gap finding).
  - `[low]` `[reject]` (blind) An unmatched statics key is reported `extra property`, a missing one `missing constant` — the renderer's existing extra kinds are method/property for every declaration; changing it adds a branch for a cosmetic label.
  - `[low]` `[patch]` (blind) The manifests sentence says "Epic 10 action item 3" beside "Epic 10 retro action item 1" — patched.
  - `[low]` `[patch]` (blind) `token!` non-null assertion — patched with the registerClass fix (token tested directly).
  - `[false]` `[reject]` (blind) No record that `api-surface --all` was unchanged — it was run before and after with identical output; recorded under Auto Run Result.
  - `[medium]` `[patch]` (edge) Same as the blind registerClass finding — patched with it.
  - `[low]` `[patch]` (edge) `<const>{…}` and `{…}!` are not unwrapped — patched: both unwrapped, with tests.
  - `[low]` `[patch]` (edge) Bigint key reported as computed — same root as the blind key finding; patched with it.
  - `[low]` `[patch]` (edge) `contract(fqcn, ...rest)` leaves statics silently empty — patched: a spread among the first four arguments fails.
  - `[low]` `[reject]` (edge) A `class <X>Static` with a constructor yields a static `constructor` member — no contract declares `<X>Static` as a class with a constructor (the ruling names an interface); guarding it adds a branch for an unseen case.
  - `[low]` `[patch]` (edge) Statics key and `<X>Static` method of one name make one member with both roles — this is intended (PHP allows a constant and a method of one name); now tested and passes.
  - `[low]` `[reject]` (edge) Another contract named `<X>Static` in the same file — no Upstream contract is named `<X>Static`; a guard adds a branch for an unseen case.
  - `[false]` `[reject]` (edge) `contract()` takes 3 parameters, so statics fail tsc — the ruling gives the token half (`statics?`) to Story 10.2; this item is the tool half.
  - `[false]` `[reject]` (edge) story-manifests.md breaks the AC — same as the first blind row; rejected there.
  - `[low]` `[patch]` (verification-gap) The method-merge branch is untested — patched: test case added.
  - `[low]` `[patch]` (verification-gap, other) Shadowed token's statics stop the run — same as the registerClass finding; patched.
  - `[false]` `[reject]` (verification-gap, other) `contract()` has no 4th parameter yet — Story 10.2's half, by the ruling.
  - `[low]` `[reject]` (intent) The tool reads the record syntactically and fails on a named record, constraining Story 10.2 — the intent names "contract() statics argument"; a loud failure is the repository's rule for syntactic checks (lessons, epic 6), and the limit is documented.
  - `[low]` `[reject]` (intent) `<X>Static` also accepted as a class — harmless widening matching how a contract's own members come from an interface or class; no Upstream row is affected.
  - `[low]` `[reject]` (intent) `Symbol.for` tokens also get a `<X>Static` side — a `Symbol.for` token is a contract (AD-1) and the ruling's `<X>Static` rule is per contract, not per `contract()` call.
  - `[false]` `[reject]` (intent) Off-allowlist `story-manifests.md` — the ID allocation record under `_bmad-output/implementation-artifacts/` is bookkeeping every item records; same as the first row.
  - `[false]` `[reject]` (intent) Untracked spec — committed at finalize.
  - `[low]` `[reject]` (intent) Tests are synthetic; nothing runs on real contracts — no contract has statics until Story 10.2, whose XT-contracts-7 checks the real rows through this tool.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/api-surface-diff.test.ts` -- expected: pass, including XT-conformance-262
- `bun run api-surface --all` -- expected: summary lines identical to the run on main
- `bun run typecheck && bun run lint` -- expected: clean

## Auto Run Result

Status: done

**Summary.** `tools/api-surface/api-surface.ts` now gives a contract token a static side (ESC-10.2-1, option 1): the keys of its `contract(fqcn, members, parents, statics)` statics record (read from the source, after parentheses, `as`, `satisfies`, `<T>` and `!`; `undefined` or no argument means none) are static constants, and every member of a same-file `class`/`interface` `<X>Static` is static in its own role. A statics argument the walk cannot read (identifier, spread, computed or non-string key, method or accessor) fails the run naming the file and FQCN. A token replaced by a same-FQCN `registerClass` has its statics ignored and never read.

**Files changed.**
- `tools/api-surface/api-surface.ts` -- `contractToken` (was `contractFqcn`) returns the call; `staticsKeys`; `Registration.statics`; `collectMembers(…, forceStatic)`; `classMembers` merges `<X>Static` and the constants; header comment.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- `XT-conformance-262`, every I/O matrix row plus the review cases.
- `docs/ops/api-surface.md` -- How it works step 3, Parity mappings, Limits.
- `_bmad-output/implementation-artifacts/story-manifests.md` -- records XT-conformance-262 (off-manifest, this item); next free ID 263.

**Review.** 30 findings: 15 patched (one medium group: a replaced token's statics still failing the run; the rest low), 0 deferred, 15 rejected with reasons in the Review Triage Log. The Fidelity Review layer did not run: the item names no `packages/<component>` (MAINT-2026-10-16, amendment 2026-10-22).

**Follow-up review recommended:** false (first pass; 0 high and 1 medium entry patched).

**Verification.**
- `bun test conformance/tests/xaravel/api-surface-diff.test.ts` -- 4 pass, 0 fail, 285 expects (XT-conformance-262 included).
- `bun run typecheck`, `bun run lint` -- clean.
- `bun run api-surface --all` -- exit 0, summary lines byte-identical to the run on the baseline (no contract uses statics on main).

**Residual risks.** The new path has no real input until Story 10.2 adds `statics?` to `contract()` and writes the `<X>Static` declarations; XT-contracts-7 then checks the real rows through it.
