---
title: 'Epic 10 action item 3: harden contract() and the alias table'
type: 'bugfix'
created: '2026-10-24'
baseline_revision: '4e10e1705833007ca7a37d4ecf7463b213e99d97'
action_item: 'epic-10-retro-item-3-harden-contract-and-aliases'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-retro-2026-10-24.md'
  - '{project-root}/decisions/MAINT-2026-10-16-unattended-orchestrator.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 10's retrospective found five hardening gaps in `packages/contracts` (findings L3–L6, L9):
- **L3.** `validateAliasTable` looks table entries up as written, and its contract-prefix test is case-sensitive, while `aliasResolver` strips a leading `\` from queries. `{s: ["\\Illuminate\\Contracts\\Nope"]}` and `{s: ["illuminate\\contracts\\nope"]}` are accepted.
- **L4.** An extra token passed to `validateAliasTable` / `aliasResolver` silently replaces the package's token of the same FQCN, and a frozen object with an FQCN and no parents throws a raw `TypeError` from the parents walk.
- **L5.** `contract()` accepts members `count` and `Count` (PHP method names are case-insensitive), duplicate parents `[A, A]`, a parent with the child's own FQCN, and a member also listed as a builtin.
- **L6.** `canonicalToken` on a non-abstract value throws `fqcn()`'s error, as its JSDoc says, but no XT pins it.
- **L9.** `class X { static [brand] = true }` gives `X instanceof Arrayable === true`, while `hasBrand(X, Arrayable)` reads the prototype and says `false`; nothing decides or tests the case.

**Approach:**
- **L3.** Strip one leading `\` from every table name (core key, core alias, binding key and target, provider abstract and alias) before services are built, as queries are; match `CONTRACT_PREFIXES` case-insensitively.
- **L4.** Check each extra token before it is used: it must be a contract token (frozen non-function object, own string `CLASS_FQCN`, function `Symbol.hasInstance`, and a `CONTRACT_PARENTS` list of such tokens, recursively), else `TypeError`; its FQCN must not equal, case-insensitively, an FQCN `@xaravel/contracts` exports or another extra token's, else `LogicException`. The same object listed twice is not a collision.
- **L5.** `contract()` throws a `TypeError` for two members equal case-insensitively, a parent listed twice (same token, or FQCNs equal case-insensitively), a parent whose FQCN equals the contract's own case-insensitively, and a member whose name equals a listed builtin case-insensitively.
- **L6.** A test only.
- **L9.** Decision: keep `instanceof` as XT-contracts-1 states it ("an object or function" carrying the brand). A function value carrying the brand as an own or inherited property is accepted, so a class with a static brand passes `instanceof` as a value, while `hasBrand(X, …)` (class question, reads the prototype) and `new X() instanceof …` stay `false`. Document it in `Contract.ts` and pin it in a test. Rationale: a JS function cannot be told apart from a class at runtime, changing it would change XT-contracts-1's stated behaviour, and PHP has no class-as-value to compare against.

## Boundaries & Constraints

**Always:** Edit only `packages/contracts/**` and this item's records under `_bmad-output/implementation-artifacts/`. Keep every existing XT-contracts-1..18 assertion and every Ported Test as it is. Error classes follow the file: `TypeError` for a bad `contract()` argument or a non-token, `LogicException` (from `@xaravel/runtime/php`) for alias-table logic errors. Messages name the offending name. `null` only, no `undefined` returns (AD-9). Every package contract still builds (`bun test` imports them all).

**Never:** Change another component, `conformance/expectations/**`, a Protected tool, the item's `action`/`owner`/`epic`. Remove or weaken an assertion. Make `aliasResolver` lookups case-insensitive (Upstream's alias keys are case-sensitive strings); only the prefix test is.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| L3 backslash | `validateAliasTable({CORE_CONTAINER_ALIASES:{s:["\\Illuminate\\Contracts\\Nope"]},…})` | throws | `LogicException` `[Illuminate\Contracts\Nope] names a contract that @xaravel/contracts does not export.` |
| L3 case | same with `illuminate\contracts\nope` | throws | `LogicException` naming `illuminate\contracts\nope` |
| L3 resolve | core alias `\Illuminate\Contracts\Support\Arrayable` under key `s` | `aliasResolver(t)("Illuminate\\Contracts\\Support\\Arrayable") === Arrayable` | none |
| L4 collision | extra `contract("Illuminate\\Contracts\\Support\\Arrayable")`, or case variant | throws | `LogicException` naming the FQCN |
| L4 extra twice | two distinct extra tokens, same FQCN / same object twice | throws / accepted | `LogicException` / none |
| L4 non-token | `Object.freeze({[CLASS_FQCN]: "App\\X"})` | throws | `TypeError` naming the index, never a raw property error |
| L5 members | `{count: [], Count: []}` | throws | `TypeError` |
| L5 parents | `[A, A]`; parent FQCN = own FQCN (any case) | throws | `TypeError` |
| L5 builtin | members `{count: []}`, builtins `["count"]` | throws | `TypeError` |
| L6 | `canonicalToken({} as never)`, `canonicalToken(42 as never)` | throws `fqcn()`'s error | as `fqcn()` |
| L9 | `class X { static [Arrayable.brand] = true }` | `X instanceof Arrayable` true; `hasBrand(X, Arrayable)` false; `new X() instanceof Arrayable` false | none |

</intent-contract>

## Code Map

- `packages/contracts/src/Contract.ts:62` `copyMembers`, `:84` `copyParents`, `:123` `copyBuiltins`, `:154` `contract()`, `:182` `Symbol.hasInstance` -- L5 checks go in `contract()` after the copies (need `name`, parents' `CLASS_FQCN`, builtins); L9 doc at the module comment / `contract()` JSDoc.
- `packages/contracts/src/Contract.ts:72` `isContractToken` -- the weaker parent check; keep as is.
- `packages/contracts/src/aliases/canonical.ts:129` `CONTRACT_PREFIXES`, `:132` `isToken`, `:136` `TOKENS`, `:166` `servicesOf`, `:205` `canonicalIndex` -- L3 normalisation in `servicesOf` (one `bare()` helper used at each input), case-insensitive prefix in `canonicalIndex`; L4 checks replace the bare `tokens.set` loop.
- `packages/contracts/src/aliases/canonical.ts:247-272` -- JSDoc of `validateAliasTable` / `aliasResolver` / `canonicalToken`; extend with the new throws.
- `packages/contracts/tests/xaravel/aliases.test.ts`, `contract.test.ts` -- existing XT-contracts-1, -10..-12, -18: read-only; style reference (`xaravelTest`, `Assert`, `typeErrorOf` in `tests/xaravel/support/contract-namespaces.ts`).
- `packages/runtime/src/php/hasBrand.ts:28` -- read-only: reads a class's prototype.

## Tasks & Acceptance

**Execution:**
- `packages/contracts/src/Contract.ts` -- add the L5 checks; document L9 -- findings L5, L9.
- `packages/contracts/src/aliases/canonical.ts` -- L3 normalisation and case-insensitive prefix; L4 extra-token validation; JSDoc -- findings L3, L4.
- `packages/contracts/tests/xaravel/hardening.test.ts` -- new Xaravel Test `XT-contracts-19`, one row per matrix line, each L3/L4/L5 row failing on the baseline; L6 and L9 rows pin current behaviour -- findings L3–L6, L9.

**Acceptance Criteria:**
- Given the baseline, when XT-contracts-19 runs, then its L3, L4 and L5 rows fail; after the change all its rows pass and XT-contracts-1..18 still pass unchanged.
- Given the change, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then the harness reports no difference and both others exit 0.
- Given the reviewed head tree, when `bun run fidelity:review status --item epic-10-retro-item-3-harden-contract-and-aliases --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 30 findings — high 0, medium 5, low 17, false 8, maybe-false 0 (intent-alignment observations with no defect are logged as false)
- findings:
  - `[low]` `[patch]` (blind) `packages/contracts/README.md` aliases paragraph omits the new behaviour — README sentences added.
  - `[medium]` `[patch]` (blind) a package token passed as an extra now throws, though harmless — one identity rule: a known FQCN must be the same object; the package's own token is accepted.
  - `[low]` `[patch]` (blind) a case variant of an exported FQCN in a table gets "does not export" — new LogicException naming both spellings.
  - `[low]` `[reject]` (blind) `App\X` and `\App\X` keys now collapse and throw "aliased by two services, [App\X] and [App\X]" — the throw is correct; only the wording is odd, and two spellings of one key in a table are unlikely.
  - `[medium]` `[patch]` (blind) `toLowerCase()` folds Unicode, PHP folds ASCII only — ASCII-only fold helper used at every fold site.
  - `[false]` `[reject]` (blind) duplicate builtins not refused — `copyBuiltins` already refuses an exact duplicate and an unknown spelling such as `Count` (`Contract.ts` `copyBuiltins`).
  - `[low]` `[reject]` (blind) one xaravelTest cannot show each row failing on the baseline — the implementer's probe ran each row on the baseline; per-row evidence is a process note, not a defect.
  - `[low]` `[reject]` (blind) `logicMessage` copied from `aliases.test.ts` — test helper of a few lines; moving it touches another XT file for no behaviour.
  - `[low]` `[patch]` (blind) L9 does not assert `hasBrand` on the subclass — row added; `hasBrand(StaticBrand)` and the instance were already asserted.
  - `[low]` `[reject]` (blind) the extra-token TypeError gives no reason — names the index, which locates the bad value; detailing each sub-check adds branches for rare hand-built objects.
  - `[false]` `[reject]` (blind) `isDeepToken` reports a cycle as valid — a token joins `checking` only after passing its own checks, and `parentsClosure` guards loops; nothing invalid is accepted.
  - `[low]` `[patch]` (blind) `checkDeclaration` JSDoc lags the code on case folding — JSDoc reworded.
  - `[medium]` `[patch]` (edge) an extra token's parent that twins a package token is accepted (two identities for one brand) — covered by the identity rule above.
  - `[low]` `[reject]` (edge) a hand-built extra token with a `\`-prefixed or malformed FQCN is accepted — `contract()` cannot make one; a guard for adversarial hand-built objects is not worth it.
  - `[low]` `[reject]` (edge) a table name starting with two `\` passes — queries strip exactly one `\` too ("as queries are"), so table and query stay consistent; such a name is not an FQCN.
  - `[low]` `[reject]` (edge) a throwing getter at `CLASS_FQCN` escapes raw — frozen tokens from `contract()` have data properties; adversarial input only.
  - `[low]` `[reject]` (edge) an ancestor (not a direct parent) with the contract's own FQCN is accepted — needs a second token object of the same name built by hand; rare, and the fix is a closure walk.
  - `[medium]` `[patch]` (edge) Unicode folding — same root cause as the blind fold finding; same fix.
  - `[low]` `[patch]` (edge) the comment says the builtin rule is what PHP refuses, but PHP allows redeclaring a built-in parent's method — comment reworded as the token's representation rule (the action requires the rule).
  - `[low]` `[patch]` (verification-gap) no row strips `\` from a core key — rows added (also Fidelity F-7).
  - `[low]` `[patch]` (verification-gap) no non-token row with `Symbol.hasInstance` and no `CONTRACT_PARENTS` — row added against a table that aliases `App\X`.
  - `[false]` `[reject]` (verification-gap, other) `isDeepToken` cycle note — no bad token accepted, as above.
  - `[low]` `[patch]` (intent a) case variant of an exported contract rejected with a misleading message — same as the blind case-variant finding.
  - `[medium]` `[patch]` (intent b) twin reachable through an extra token's parents — same as the edge twin finding.
  - `[false]` `[reject]` (intent c) the change sits in `canonicalIndex`, shared by `aliasResolver` — intended: the resolver must read the table as the validator does.
  - `[false]` `[reject]` (intent d) builtins inherited through parents are not compared — the action names "a member also listed as a builtin", the contract's own list; inherited builtins are the parents' tokens.
  - `[false]` `[reject]` (intent e) the L9 decision has no decision record — the retro offers "document the case with a test", which is done in `Contract.ts` and XT-contracts-19.
  - `[false]` `[reject]` (intent f) one XT id for all cases — "XT cases for each" is met by one row per case, as Epic 9 item 3 did.
  - `[false]` `[reject]` (intent g/h) additions beyond the intent and unshown baseline failures — consistent with the intent; baseline probe recorded by the implementer.
  - `[low]` `[patch]` (fidelity-review, reviewer 2 F-7 at tree e474221) no assertion uses a core key with a leading `\` — rows added; the reviewed tree changes, so the layer runs again.

### 2026-10-24 — Review pass (Fidelity re-check after patches)
- verdicts: 0 findings — Fidelity Review at tree 3913b9a5bb3aa6637a08d3158718cfba984a98bd: reviewer 1 pass, reviewer 2 pass; `status --item` prints `current`.

## Verification

**Commands:**
- `bun test packages/contracts` -- expected: all pass
- `bun run harness` -- expected: no differences, `SUMMARY` line, exit 0
- `bun run typecheck` and `bun run lint` -- expected: exit 0
- `bun run fidelity:review status --item epic-10-retro-item-3-harden-contract-and-aliases --spec _bmad-output/implementation-artifacts/spec-retro-10-harden-contract-and-aliases.md` -- expected: `current`

## Fidelity Review

### Reviewer 1: pass at tree e474221fba18ad81118706b81102ad0d86ee837f

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4e10e1705833007ca7a37d4ecf7463b213e99d97`, on 2026-10-24T20:30:50.136Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds no Ported Tests, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | The diff adds exact assertions in XT-contracts-19 and changes no existing expected values or exception expectations. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, and no Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-contracts-19 checks its declared normalization, prefix matching, token validation and collisions, declaration rejection, fqcn error propagation, and static-brand behavior. Its helpers preserve exact error-class and message checks; it cites no FR or AD consequence tokens. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to the authorized contracts component. Token and alias validation implement that component's behavior without stubbing another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared both changed source files and their declaration inventories with AD-6 and DIV-1: they contain no async tags, IO operations, or callbacks requiring an async surface. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"e474221fba18ad81118706b81102ad0d86ee837f","base":"4e10e1705833007ca7a37d4ecf7463b213e99d97","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T20:30:50.136Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds no Ported Tests, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds exact assertions in XT-contracts-19 and changes no existing expected values or exception expectations.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, and no Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied upon by this item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-contracts-19 checks its declared normalization, prefix matching, token validation and collisions, declaration rejection, fqcn error propagation, and static-brand behavior. Its helpers preserve exact error-class and message checks; it cites no FR or AD consequence tokens.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files belong to the authorized contracts component. Token and alias validation implement that component's behavior without stubbing another component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared both changed source files and their declaration inventories with AD-6 and DIV-1: they contain no async tags, IO operations, or callbacks requiring an async surface.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree e474221fba18ad81118706b81102ad0d86ee837f

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4e10e1705833007ca7a37d4ecf7463b213e99d97`, on 2026-10-24T20:30:50.136Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; the only test added is Xaravel Test XT-contracts-19. |
| F-2: No expected value is weakened | n/a | No Ported Test with an Upstream expected value is touched. I checked XT-contracts-19's own expected values against the changed code (exact assertSame message strings, token identity) and found none loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion count applies; no adapted marker is added. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): there are no assigned Oracle fixtures and no error fixtures, base or changed. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I traced each block of XT-contracts-19 against Contract.ts (checkDeclaration) and canonical.ts (bare, withExtraTokens, isDeepToken, FOLDED_PREFIXES). Every assertion's expected value matches the code: the leading-\ cases for core aliases, provider aliases and bindings, case-insensitive prefixes, package-token collision in any case, two extra tokens of one FQCN, every non-token value (including bad parents), case-insensitive duplicate members, duplicate and self parents, member-vs-builtin clashes, canonicalToken on {} and 42 matching fqcn()'s error, and the static-brand instanceof/hasBrand split. The consequence cites no FR/AD token. It claims, however, that validateAliasTable drops one leading \ from *every* table name, and the body never puts a leading \ on a CORE_CONTAINER_ALIASES key. Core aliases, binding keys and values, and provider alias abstracts and names are covered; core keys, which servicesOf normalises with open(bare(key), true), are not. The body checks less than the string declares. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/contracts (src/Contract.ts, src/aliases/canonical.ts, tests/xaravel/hardening.test.ts), the component the item lists. The test calls fqcn() and hasBrand() from @​xaravel/runtime only as real imports to compare against; nothing stubs, fakes or partially implements another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): neither changed file holds an @​asyncRoot tag. The new functions (checkDeclaration, bare, isDeepToken, withExtraTokens) and the constants FOLDED_PREFIXES and FOLDED_TOKENS are internal, synchronous, do no IO and take no callback. The existing exports (contract, validateAliasTable, aliasResolver, canonicalToken) stay sync, as AD-6 and DIV-1 require; no tag is missing or untrue. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/hardening.test.ts`: XT-contracts-19 claims validateAliasTable drops one leading \ from every table name, but no assertion uses a CORE_CONTAINER_ALIASES key with a leading \. Add one, for example aliasResolver(table({ CORE_CONTAINER_ALIASES: { "\\Illuminate\\Contracts\\Support\\Arrayable": ["x"] } }))("x") resolving to support.Arrayable, or a self-alias/shared-alias case keyed by a backslashed core key. Without it, removing bare(key) in servicesOf's core-key loop goes undetected. Alternatively, narrow the consequence string to the names actually tested.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"e474221fba18ad81118706b81102ad0d86ee837f","base":"4e10e1705833007ca7a37d4ecf7463b213e99d97","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T20:30:50.136Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; the only test added is Xaravel Test XT-contracts-19.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test with an Upstream expected value is touched. I checked XT-contracts-19's own expected values against the changed code (exact assertSame message strings, token identity) and found none loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion count applies; no adapted marker is added.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): there are no assigned Oracle fixtures and no error fixtures, base or changed.","findings":[]},{"id":"F-7","result":"fail","note":"I traced each block of XT-contracts-19 against Contract.ts (checkDeclaration) and canonical.ts (bare, withExtraTokens, isDeepToken, FOLDED_PREFIXES). Every assertion's expected value matches the code: the leading-\\ cases for core aliases, provider aliases and bindings, case-insensitive prefixes, package-token collision in any case, two extra tokens of one FQCN, every non-token value (including bad parents), case-insensitive duplicate members, duplicate and self parents, member-vs-builtin clashes, canonicalToken on {} and 42 matching fqcn()'s error, and the static-brand instanceof/hasBrand split. The consequence cites no FR/AD token. It claims, however, that validateAliasTable drops one leading \\ from *every* table name, and the body never puts a leading \\ on a CORE_CONTAINER_ALIASES key. Core aliases, binding keys and values, and provider alias abstracts and names are covered; core keys, which servicesOf normalises with open(bare(key), true), are not. The body checks less than the string declares.","findings":[{"path":"packages/contracts/tests/xaravel/hardening.test.ts","detail":"XT-contracts-19 claims validateAliasTable drops one leading \\ from every table name, but no assertion uses a CORE_CONTAINER_ALIASES key with a leading \\. Add one, for example aliasResolver(table({ CORE_CONTAINER_ALIASES: { \"\\\\Illuminate\\\\Contracts\\\\Support\\\\Arrayable\": [\"x\"] } }))(\"x\") resolving to support.Arrayable, or a self-alias/shared-alias case keyed by a backslashed core key. Without it, removing bare(key) in servicesOf's core-key loop goes undetected. Alternatively, narrow the consequence string to the names actually tested.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/contracts (src/Contract.ts, src/aliases/canonical.ts, tests/xaravel/hardening.test.ts), the component the item lists. The test calls fqcn() and hasBrand() from @xaravel/runtime only as real imports to compare against; nothing stubs, fakes or partially implements another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): neither changed file holds an @asyncRoot tag. The new functions (checkDeclaration, bare, isDeepToken, withExtraTokens) and the constants FOLDED_PREFIXES and FOLDED_TOKENS are internal, synchronous, do no IO and take no callback. The existing exports (contract, validateAliasTable, aliasResolver, canonicalToken) stay sync, as AD-6 and DIV-1 require; no tag is missing or untrue.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 3913b9a5bb3aa6637a08d3158718cfba984a98bd

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4e10e1705833007ca7a37d4ecf7463b213e99d97`, on 2026-10-24T20:36:50.908Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The diff adds exact assertions in XT-contracts-19; no existing expected value or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-contracts-19 checks the declared normalization, token validation and identity collisions, declaration rejection, fqcn error propagation, and static-brand behavior. The added backslashed core-key assertions cover P-1. Its consequence cites no FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to the contracts component. The validation and alias-token changes implement its assigned behavior without implementing another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared both changed source files and their declarations with AD-6 and DIV-1: they contain no asyncRoot tags, IO, or async callback execution requiring a tag; their exports remain synchronous. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/contracts/tests/xaravel/hardening.test.ts`: XT-contracts-19 claims validateAliasTable drops one leading \ from every table name, but no assertion uses a CORE_CONTAINER_ALIASES key with a leading \. Add one, for example aliasResolver(table({ CORE_CONTAINER_ALIASES: { "\\Illuminate\\Contracts\\Support\\Arrayable": ["x"] } }))("x") resolving to support.Arrayable, or a self-alias/shared-alias case keyed by a backslashed core key. Without it, removing bare(key) in servicesOf's core-key loop goes undetected. Alternatively, narrow the consequence string to the names actually tested. **fixed**: XT-contracts-19 now asserts that a backslashed CORE_CONTAINER_ALIASES contract key resolves x to support.Arrayable, and checks a backslashed core-key self-alias. Removing bare(key) would be detected.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"3913b9a5bb3aa6637a08d3158718cfba984a98bd","base":"4e10e1705833007ca7a37d4ecf7463b213e99d97","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T20:36:50.908Z","items":[{"id":"F-1","result":"n/a","note":"The change adds no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds exact assertions in XT-contracts-19; no existing expected value or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-contracts-19 checks the declared normalization, token validation and identity collisions, declaration rejection, fqcn error propagation, and static-brand behavior. The added backslashed core-key assertions cover P-1. Its consequence cites no FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files belong to the contracts component. The validation and alias-token changes implement its assigned behavior without implementing another component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared both changed source files and their declarations with AD-6 and DIV-1: they contain no asyncRoot tags, IO, or async callback execution requiring a tag; their exports remain synchronous.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/hardening.test.ts","detail":"XT-contracts-19 claims validateAliasTable drops one leading \\ from every table name, but no assertion uses a CORE_CONTAINER_ALIASES key with a leading \\. Add one, for example aliasResolver(table({ CORE_CONTAINER_ALIASES: { \"\\\\Illuminate\\\\Contracts\\\\Support\\\\Arrayable\": [\"x\"] } }))(\"x\") resolving to support.Arrayable, or a self-alias/shared-alias case keyed by a backslashed core key. Without it, removing bare(key) in servicesOf's core-key loop goes undetected. Alternatively, narrow the consequence string to the names actually tested.","fixed":true,"note":"XT-contracts-19 now asserts that a backslashed CORE_CONTAINER_ALIASES contract key resolves x to support.Arrayable, and checks a backslashed core-key self-alias. Removing bare(key) would be detected."}]}
```

### Reviewer 2: pass at tree 3913b9a5bb3aa6637a08d3158718cfba984a98bd

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4e10e1705833007ca7a37d4ecf7463b213e99d97`, on 2026-10-24T20:36:50.908Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test. The only test it touches is the Xaravel Test XT-contracts-19. |
| F-2: No expected value is weakened | pass | XT-contracts-19 is a new Xaravel Test with no Upstream counterpart. All its checks are exact assertSame, assertTrue or assertFalse calls on full messages and identities: no substring or pattern match, and no expected value loosened to fit the output. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there are no Upstream assertions to count and no adapted markers. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker and no Expectations adapted field changes (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No assigned Oracle fixture exists, and none that is an error (evidence (c)). |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each claim in the consequence string is checked against the body, with the code traced by hand. (1) A leading \ is dropped from every table name: core key (the \App\Thing self-alias and the \Illuminate\...\Arrayable key resolving x), core alias (\Illuminate\Contracts\Nope), provider-binding key and value (bareBinding), provider-alias abstract and name. (2) The prefix test ignores case (illuminate\contracts\nope, PSR\LOG\Nope). (3) A case variant of an exported FQCN is refused with the stated message. (4) An extra non-token throws a TypeError naming its index, covering 8 shapes plus the parentless case. (5) An extra-token collision throws a LogicException, for the package twin in two cases, a twin reached through a parent, and two extras; the same object twice is accepted. (6) contract() rejects duplicate members ignoring ASCII case only (the é/É case passes), duplicate or self parents, and a member also listed as a builtin. Each expected message matches the code exactly. (7) canonicalToken on {} and 42 throws fqcn()'s error class and message. (8) A static brand passes instanceof as a value, while hasBrand and instances do not. The string cites no FR or AD id. |
| F-8: No stub, fake or partial implementation of another Component | pass | Only packages/contracts changes: Contract.ts, aliases/canonical.ts, the README and a test. It adds no stub or partial behaviour of another component; fqcn and hasBrand are imported from runtime, not reimplemented. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in either changed source file. The new export foldCase and the new helpers (checkDeclaration, bare, isDeepToken, withExtraTokens) are sync, do no IO and take no callback, so no tag is needed. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/contracts/tests/xaravel/hardening.test.ts`: XT-contracts-19 claims validateAliasTable drops one leading \ from every table name, but no assertion uses a CORE_CONTAINER_ALIASES key with a leading \. Add one, for example aliasResolver(table({ CORE_CONTAINER_ALIASES: { "\\Illuminate\\Contracts\\Support\\Arrayable": ["x"] } }))("x") resolving to support.Arrayable, or a self-alias/shared-alias case keyed by a backslashed core key. Without it, removing bare(key) in servicesOf's core-key loop goes undetected. Alternatively, narrow the consequence string to the names actually tested. **fixed**: XT-contracts-19 now includes aliasResolver(table({ CORE_CONTAINER_ALIASES: { "\\Illuminate\\Contracts\\Support\\Arrayable": ["x"] } }))("x") resolving to support.Arrayable. It also includes a self-alias case keyed by the backslashed core key "\\App\\Thing" that expects "[App\\Thing] is aliased to itself.". Removing bare(key) in servicesOf's core loop would break both, so the change is now detected.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"3913b9a5bb3aa6637a08d3158718cfba984a98bd","base":"4e10e1705833007ca7a37d4ecf7463b213e99d97","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T20:36:50.908Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test. The only test it touches is the Xaravel Test XT-contracts-19.","findings":[]},{"id":"F-2","result":"pass","note":"XT-contracts-19 is a new Xaravel Test with no Upstream counterpart. All its checks are exact assertSame, assertTrue or assertFalse calls on full messages and identities: no substring or pattern match, and no expected value loosened to fit the output.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there are no Upstream assertions to count and no adapted markers.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker and no Expectations adapted field changes (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"No assigned Oracle fixture exists, and none that is an error (evidence (c)).","findings":[]},{"id":"F-7","result":"pass","note":"Each claim in the consequence string is checked against the body, with the code traced by hand. (1) A leading \\ is dropped from every table name: core key (the \\App\\Thing self-alias and the \\Illuminate\\...\\Arrayable key resolving x), core alias (\\Illuminate\\Contracts\\Nope), provider-binding key and value (bareBinding), provider-alias abstract and name. (2) The prefix test ignores case (illuminate\\contracts\\nope, PSR\\LOG\\Nope). (3) A case variant of an exported FQCN is refused with the stated message. (4) An extra non-token throws a TypeError naming its index, covering 8 shapes plus the parentless case. (5) An extra-token collision throws a LogicException, for the package twin in two cases, a twin reached through a parent, and two extras; the same object twice is accepted. (6) contract() rejects duplicate members ignoring ASCII case only (the é/É case passes), duplicate or self parents, and a member also listed as a builtin. Each expected message matches the code exactly. (7) canonicalToken on {} and 42 throws fqcn()'s error class and message. (8) A static brand passes instanceof as a value, while hasBrand and instances do not. The string cites no FR or AD id.","findings":[]},{"id":"F-8","result":"pass","note":"Only packages/contracts changes: Contract.ts, aliases/canonical.ts, the README and a test. It adds no stub or partial behaviour of another component; fqcn and hasBrand are imported from runtime, not reimplemented.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in either changed source file. The new export foldCase and the new helpers (checkDeclaration, bare, isDeepToken, withExtraTokens) are sync, do no IO and take no callback, so no tag is needed.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/hardening.test.ts","detail":"XT-contracts-19 claims validateAliasTable drops one leading \\ from every table name, but no assertion uses a CORE_CONTAINER_ALIASES key with a leading \\. Add one, for example aliasResolver(table({ CORE_CONTAINER_ALIASES: { \"\\\\Illuminate\\\\Contracts\\\\Support\\\\Arrayable\": [\"x\"] } }))(\"x\") resolving to support.Arrayable, or a self-alias/shared-alias case keyed by a backslashed core key. Without it, removing bare(key) in servicesOf's core-key loop goes undetected. Alternatively, narrow the consequence string to the names actually tested.","fixed":true,"note":"XT-contracts-19 now includes aliasResolver(table({ CORE_CONTAINER_ALIASES: { \"\\\\Illuminate\\\\Contracts\\\\Support\\\\Arrayable\": [\"x\"] } }))(\"x\") resolving to support.Arrayable. It also includes a self-alias case keyed by the backslashed core key \"\\\\App\\\\Thing\" that expects \"[App\\\\Thing] is aliased to itself.\". Removing bare(key) in servicesOf's core loop would break both, so the change is now detected."}]}
```

## Auto Run Result

Status: done

**Summary.** Epic 10 action item 3 (findings L3–L6, L9): the alias table reads names as queries are (one leading `\` dropped, contract prefix matched ignoring ASCII case, a case variant of an exported contract refused with its own message); extra tokens must be contract tokens all the way down, and every token they reach must be the one object known for its FQCN (the package's own token is accepted); `contract()` refuses duplicate members, duplicate or self parents (ASCII case-insensitive) and a member also listed as a builtin; L6 and L9 are pinned, L9 kept as XT-contracts-1 states it and documented.

**Files.**
- `packages/contracts/src/Contract.ts` — `checkDeclaration`, `foldCase` (ASCII-only, not in `index.ts`), L9 and rule comments.
- `packages/contracts/src/aliases/canonical.ts` — `bare()`, folded prefixes, case-variant message, `isDeepToken`, `withExtraTokens` identity rule, JSDoc.
- `packages/contracts/README.md` — the aliases paragraph states the new behaviour.
- `packages/contracts/tests/xaravel/hardening.test.ts` — new XT-contracts-19, one row per matrix line plus the review rows.

**Review.** Pass 1: 30 findings (medium 5, low 17, false 8). Patched: the extra-token identity rule (medium; blind, edge, intent b), ASCII fold (medium; blind, edge), case-variant message, comments and JSDoc, README, and test rows for core-key `\`, a parentless non-token, the package token as an extra, a twin parent, `é`/`É`, subclass `hasBrand` (low; incl. Fidelity F-7). Rejected with reasons in the triage log: collapsed-key wording, test-helper reuse, TypeError detail, hand-built malformed or getter tokens, double `\`, ancestor self-cycle (low), and the false findings. Nothing deferred. Pass 2: Fidelity Review `current`.

**Follow-up review recommended: true** — two medium entries were patched on the first pass (identity rule, ASCII fold); the new rows were reasoned, not shown, to fail when each fix is reverted.

**Verification.** `bun test packages/contracts` 19/19; `bun run typecheck` and `bun run lint` exit 0; `bun run harness` exit 0, `differ=0` (4 Variants run, 7 NOT-RUN with no local backend). One earlier harness run, straight after typecheck and lint and before the patches, reported 4 Xaravel Test failures that did not recur in three later runs; their names were not captured.

**Residual risks.** Error wording is new where the spec gave none; the one-off harness failure above is unexplained.
