---
title: 'Story 10.4: Container alias table and canonical tokens'
type: 'feature'
created: '2026-10-24'
status: 'blocked'
baseline_revision: 'a02d058c0463f814522c232ec31c0e4f5f8158d1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/conformance/escalations/ESC-10.4-1.md'
  - '{project-root}/AGENTS.md'
warnings:
  - oversized
deferred:
  - summary: >-
      XT-contracts-11 and -12 assert ESC-10.4-1 Option 1, which has no ruling yet.
    evidence: |-
      AD-1.4 does not say which token is canonical for a service with no contract (12 core keys, 15 provider bindings) or with sibling contracts (encrypter, mailer, queue, router, ChannelManager). Both Fidelity reviewers reject on the missing ruling. Settled by a decision on ESC-10.4-1.
    location: >-
      packages/contracts/src/aliases/canonical.ts
    severity: medium
  - summary: >-
      The Fidelity Review prompt lacks the Upstream sources XT-contracts-10 parses, and reviewer 1's F-2 reject rests on that alone.
    evidence: |-
      Application.php's registerCoreContainerAliases, the *ServiceProvider.php files and Container::alias are not in the prompt at tree 56738407bb01eca2c349e6d66167ad3a7225c137. F-2 is a core item, so the 2026-10-24 evidence-gap ruling does not accept it. Settled by the tool change ESC-10.4-2 proposes.
    location: >-
      tools/fidelity-review/fidelity-review.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `@xaravel/contracts/aliases` does not exist. The Container (Epic 17), facades and providers need Upstream's container aliases as data, and one canonical token per service, so that `app('cache')`, `app(CacheManager)` and `app(Cache\Factory)` resolve to one instance (AD-1.4).

**Approach:** Port `Application::registerCoreContainerAliases`, each service provider's string bindings, and the providers' class-to-class `alias()` calls verbatim as frozen data. Derive the services from that data, give each one canonical token by AD-1's rule as completed by ESC-10.4-1's Option 1, and export `canonicalToken(abstract)` and `validateAliasTable(table)`. ESC-10.4-1 waits on a ruling. The Story builds Option 1 and ends `blocked` on it if it is still open, with everything built.

## Boundaries & Constraints

**Always:**
- **Data, verbatim** (AD-1.4). `src/aliases/table.ts` exports three frozen constants. FQCNs have no leading `\`, and `self::class` is `Illuminate\Foundation\Application`.
  - `CORE_CONTAINER_ALIASES: Readonly<Record<string, readonly string[]>>` holds the 40 keys of `registerCoreContainerAliases`, keys and aliases in Upstream order.
  - `PROVIDER_BINDINGS: Readonly<Record<string, string>>` maps each string abstract that a `*ServiceProvider.php` binds with `singleton`, `bind` or `scoped`, and that is not a core key, to the FQCN of the class its closure builds. There are 15, in provider file path order, then line order: `memcached.connector`, `db.factory`, `db.transactions`, `migration.repository`, `migrator`, `migration.creator`, `composer`, `pipeline`, `queue.worker`, `queue.listener`, `queue.routes`, `translation.loader`, `validation.presence`, `view.finder` and `view.engine.resolver`. Read each FQCN from the closure through the file's `use` lines. Out of scope, as no provider binding: `Application`'s path, env and cache-flag instances, `Router::setRoutes`, the `instance('routes', …)` side effect inside the `url` closure, the testing traits' keys, and the Laravel Cloud `queue.failer` override.
  - `PROVIDER_ALIASES: readonly (readonly [abstract: string, alias: string])[]` holds the providers' `alias(X::class, Y::class)` calls in file and line order: Broadcasting (1), Bus (2), Notifications (2).
- **Services.** A service is a core key with its aliases, a provider binding's key with its one FQCN, or a provider alias chain keyed by its first abstract FQCN. Bus's two calls chain `Bus\Dispatcher` → `Contracts\Bus\Dispatcher` → `QueueingDispatcher` into one service. A **contract alias** is an alias FQCN for which `@xaravel/contracts` exports a token. Find it by walking the subpath modules' exports for frozen objects with an own `CLASS_FQCN`.
- **Canonical rule** (ESC-10.4-1, Option 1).
  - The canonical token is the contract alias that no other contract alias of the service has in its `CONTRACT_PARENTS` closure.
  - When several qualify, the first in Upstream order wins.
  - When the service has no contract alias, its string key is canonical.
- **`canonicalToken(abstract)`**. An abstract is a string, a contract token or a class.
  - A string is a key or an alias FQCN, and a leading `\` is accepted.
  - A token or class goes through runtime `fqcn()`, which throws for an unregistered class (AD-10).
  - It returns the service's canonical token: a `ContractToken` object, or the key string.
  - An abstract that is in no service is returned unchanged, as Upstream's `getAlias` does.
  - It never returns `undefined`.
- **`aliasResolver(table)`** returns the `canonicalToken` function of any table of the same three-part shape. `canonicalToken` is the resolver of the real table. Building a resolver runs `validateAliasTable(table)`, so importing `aliases` validates the real table.
- **`validateAliasTable(table)`** throws runtime `LogicException` naming the alias in brackets:
  - `[<alias>] is aliased to itself.` (Upstream `Container::alias`'s message);
  - `[<alias>] is aliased by two services, [<a>] and [<b>].`;
  - `[<alias>] names a contract that @xaravel/contracts does not export.`, for an FQCN under `Illuminate\Contracts\`, `Psr\Container\`, `Psr\SimpleCache\` or `Psr\Log\` with no token;
  - `[<alias>] has no canonical contract.`, for every alias of a service with neither a contract alias nor a string key.
- `package.json` gains `"./aliases": "./src/aliases/index.ts"`. The README lists the subpath.
- Tests use `xaravelTest`, `Assert` and the `support/contract-namespaces.ts` helpers. Expected data is derived from the Upstream PHP sources under `upstreamOrWarn` (`XARAVEL_UPSTREAM=require`), plus a literal canonical table, copied from Design Notes, that runs without the snapshot. Consequence strings cite AD-1.3 and AD-1.4, and ESC-10.4-1 for -11 and -12.

**Never:**
- Edit outside these paths: `packages/contracts/**`, this spec, `stories/10.4.md`'s `status:` line, sprint status and `_bmad-output/implementation-artifacts/`, and `conformance/escalations/ESC-10.4-*.md`.
- Import any package other than `@xaravel/runtime` from `src/`.
- Register a class under an Upstream implementation FQCN in a test, such as a fake `CacheManager`. That would stub another Component. Use `aliasResolver` with an `App\…` test table and `registerTestClass` instead.
- Change `Contract.ts`, an existing contract, or another Story's tests.
- Cite `exceptions.jsonl` or `additions.jsonl`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| verbatim (XT-10) | Upstream `registerCoreContainerAliases`, provider files | the three constants equal the parsed data, in order, and are frozen | none |
| string key (XT-11) | `canonicalToken('cache')` | the `Cache\Factory` token | none |
| class FQCN (XT-11) | `'Illuminate\\Cache\\CacheManager'`, `'\\Illuminate\\Cache\\CacheManager'` | the `Cache\Factory` token | none |
| another contract (XT-11) | the `Psr\Container\ContainerInterface` token | the `Foundation\Application` token | none |
| class argument (XT-11) | `aliasResolver(t)(Probe)`, with `Probe` registered as `App\Probe`, an alias of `App\Contract` in `t` | `App\Contract`'s token | an unregistered class throws `fqcn()`'s TypeError |
| siblings (XT-11) | `'mailer'`, the `MailQueue` token | the `Mail\Mailer` token | none |
| no contract (XT-11) | `'blade.compiler'`, the BladeCompiler FQCN, `'migrator'` | `'blade.compiler'`, `'blade.compiler'`, `'migrator'` | none |
| unknown (XT-11) | `'nope'`, an unaliased token | unchanged | none |
| invalid (XT-12) | a class-alias set with no contract; an alias under two keys; a self alias; an unexported `Illuminate\Contracts\X` | `LogicException` naming the alias | the real table validates |

</intent-contract>

## Code Map

- `packages/contracts/src/Contract.ts` -- `CLASS_FQCN`, `CONTRACT_PARENTS` and `ContractToken`. Read-only.
- `packages/contracts/src/index.ts` and `src/<sub>/index.ts` (41 `exports` subpaths) -- the token sources. `aliases` imports each `index.ts` relatively.
- `packages/runtime/src/registry/registry.ts:108` `fqcn`, `:332` `registerTestClass`; `@xaravel/runtime/php` `LogicException`.
- `packages/contracts/tests/xaravel/support/contract-namespaces.ts` -- `REPO`, `upstreamOrWarn`, `closure(token)` (the parents closure) and `upstreamPath`.
- `packages/contracts/tests/xaravel/web.test.ts:206` -- the `xaravelTest` form.
- `conformance/upstream/framework/src/Illuminate/Foundation/Application.php` `registerCoreContainerAliases`; `*/*ServiceProvider.php` (`Database/DatabaseServiceProvider.php:60,79`, `Database/MigrationServiceProvider.php:61,80,96`, `Cache/CacheServiceProvider.php:30`, `Translation/TranslationServiceProvider.php:42`, `Validation/ValidationServiceProvider.php:52`, `View/ViewServiceProvider.php:84,117`, `Queue/QueueServiceProvider.php:242,291,303`, `Pipeline/PipelineServiceProvider.php:23`, `Foundation/Providers/ComposerServiceProvider.php:18`; aliases at `Broadcasting/BroadcastServiceProvider.php:25`, `Bus/BusServiceProvider.php:31,35`, `Notifications/NotificationServiceProvider.php:36,40`).
- `conformance/tests/xaravel/scaffold.test.ts:228` -- `SUBPATH_EXPORTS` already lists `aliases`. Read-only.
- `tools/api-surface/api-surface.ts` -- only Upstream FQCN names are compared, so the new functions and constants must report 0 extra. Verify this. Read-only.

## Tasks & Acceptance

**Execution:**
- `packages/contracts/src/aliases/table.ts` -- the three verbatim constants -- AD-1.4.
- `packages/contracts/src/aliases/canonical.ts` -- the token index, services, `validateAliasTable`, `aliasResolver`, `canonicalToken` -- AD-1.4, ESC-10.4-1.
- `packages/contracts/src/aliases/index.ts` -- the re-exports.
- `packages/contracts/package.json`, `README.md` -- the `./aliases` subpath.
- `packages/contracts/tests/xaravel/aliases.test.ts` -- XT-contracts-10, -11 and -12, covering every matrix row.

**Acceptance Criteria:**
- Given the package, when `bun run harness --xaravel --id 'XT-contracts-*'` runs, then XT-contracts-1..12 and -18 pass.
- Given the package, when `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run escalations:check`, `bun run async-surface --all --check`, `bun run api-surface --details contracts` (0 unexplained) and the full `bun run harness` run, then each passes with no differences.

## Spec Change Log

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 25 findings — high 0, medium 10, low 13, false 2, maybe-false 0
- findings:
  - **Blind Hunter** (12 findings):
    - `[low]` `patch` The test's `TOKENS` walks 34 modules with no frozen check, while `canonical.ts` walks 41, so the Upstream-derived expectation is not independent. — The test now builds its tokens from every `package.json` `exports` entry with the same frozen, own-string-FQCN test.
    - `[medium]` `patch` Nothing ties `MODULES` to `package.json` `exports`, so a later subpath would make importing `aliases` throw, or a service fall back to its key, unnoticed. — XT-contracts-11 now resolves a probe table for every exported token, so a token the index misses fails the test.
    - `[low]` `reject` `aliasResolver` and `validateAliasTable` take a second `tokens` parameter the spec does not name. — The intent contract's own class-argument row needs `App\Contract`'s token, which nothing else can supply. The fix is a spec edit, and the README and docblocks document the parameter.
    - `[low]` `reject` "has no canonical contract" names only the first alias. — The spec's message names one alias, and a throw can report one. The first alias in table order is deterministic.
    - `[medium]` `patch` `upstreamBindings` takes the first `new X` to the end of the file, so a closure without `new` takes the next binding's class unnoticed. — The search now stops at the next registration call (`$this->app->` then `singleton`, `bind`, `scoped`, `instance`, `alias` or `extend`; `queue.worker` calls `isDownForMaintenance()` first), and fails naming the file and key when no `new` is found.
    - `[low]` `patch` The coverage check only adds three literal lengths. — It now compares the union of `CANONICAL`, `OWN_KEYS` and `BINDING_KEYS` with the service keys, and checks that they do not overlap.
    - `[low]` `reject` Provider alias chains depend on input order. — At the Pin, Bus's calls come in chain order. A misordered table fails loudly with "aliased by two services" rather than resolving wrongly, and a union-find adds complexity no caller needs.
    - `[low]` `reject` Two tokens with one FQCN are not caught. — Every exported token has a unique FQCN (XT-contracts-5 and -8 check this). An application passing a duplicate is unlikely, and the guard adds a branch.
    - `[low]` `reject` The test casts a token `as never`. — The cast is test-only, because the support file's structural `Token` type is not an `Abstract`. It hides no runtime mismatch.
    - `[low]` `patch` Missing tests: idempotence, a duplicate alias inside one service, and a provider binding under `Illuminate\Contracts\` with no token. — Idempotence is now asserted for every service key. The duplicate inside one service is harmless, as Upstream re-records it. The unexported-prefix check runs one code path for all three parts, and XT-contracts-12 covers it.
    - `[false]` `reject` The Story's state is inconsistent: `in-review`, and ACs that need XT-11/-12 while they are blocked. — The spec says the Story ends `blocked` on ESC-10.4-1, and the HALT sets the manifest and sprint status. Mid-review status is expected.
    - `[low]` `patch` The tests compare framework constants with `JSON.stringify` (AD-23). — They now compare through `Assert`.
  - **Edge Case Hunter** (5 findings):
    - `[low]` `reject` A chain link before its abstract's call throws "aliased by two services". — Same as the Blind Hunter order row.
    - `[false]` `reject` Contracts whose parents closures contain each other leave no most specific contract. — `contract()` takes only existing frozen tokens as parents, so a cycle cannot be built, and PHP forbids cyclic interface inheritance.
    - `[medium]` `patch` An unbounded `new` search in the binding parser. — Same fix as the Blind Hunter parser row.
    - `[low]` `patch` A key bound twice silently overwrites in the parser. — The parser now asserts that a key is bound once.
    - `[low]` `patch` The test `TOKENS` omits seven subpaths. — Same fix as the Blind Hunter `TOKENS` row.
  - **Verification Gap** (0 findings).
  - **Intent Alignment** (1 finding):
    - `[medium]` `defer` AC2 and AC3 are implemented as ESC-10.4-1 Option 1 (string-key fallback, first-sibling tie-break, a narrower "no canonical contract"), which AD-1.4 does not decide; the So-that's one-instance behaviour is the Container's (Epic 17). — Waits on ESC-10.4-1. The container surface is Epic 17's and is not stubbed here.
  - **Fidelity Review** (tree 56738407…; 7 findings):
    - `[medium]` `defer` Reviewer 1, F-2: the prompt lacks `registerCoreContainerAliases`, the provider sources and `Container::alias` _(missing evidence, on a core item)_. — Raised as ESC-10.4-2: a tool evidence gap under the 2026-10-21 amendment.
    - `[medium]` `defer` Reviewer 1, F-2: there is no approved ruling for Option 1 _(missing evidence)_. — Waits on ESC-10.4-1.
    - `[medium]` `patch` Reviewer 1, F-7: the provider sources are missing, and `upstreamBindings` does not bound the closure _(missing evidence)_. — The parser is bounded (Blind Hunter parser row). The sources part is ESC-10.4-2.
    - `[medium]` `defer` Reviewer 1, F-7: no decision resolves the AD-1.4 gaps _(missing evidence)_. — Waits on ESC-10.4-1.
    - `[medium]` `defer` Reviewer 2, F-7: XT-11 and -12 assert Option 1 with no ruling _(missing evidence)_. — Waits on ESC-10.4-1.
    - `[low]` `patch` Reviewer 2, F-7: XT-contracts-10 and -12 cite AD-1.3 without checking it _(defect)_. — AD-1.3 is removed from those two consequence strings. XT-contracts-11 keeps it.
    - `[medium]` `defer` Reviewer 2, F-7: the prompt lacks `Application.php` and the provider sources _(missing evidence)_. — ESC-10.4-2.

## Design Notes

**Canonical table** (Option 1). Contract names are relative to `Illuminate\Contracts\`.

| Service | Canonical |
|---|---|
| app | Foundation\Application |
| auth | Auth\Factory |
| auth.driver | Auth\Guard |
| auth.password | Auth\PasswordBrokerFactory |
| auth.password.broker | Auth\PasswordBroker |
| cache | Cache\Factory |
| cache.store | Cache\Repository |
| config | Config\Repository |
| cookie | Cookie\QueueingFactory |
| encrypter | Encryption\Encrypter |
| events | Events\Dispatcher |
| filesystem | Filesystem\Factory |
| filesystem.disk | Filesystem\Filesystem |
| filesystem.cloud | Filesystem\Cloud |
| hash.driver | Hashing\Hasher |
| log | Psr\Log\LoggerInterface |
| mail.manager | Mail\Factory |
| mailer | Mail\Mailer |
| queue | Queue\Factory |
| queue.connection | Queue\Queue |
| redis | Redis\Factory |
| redis.connection | Redis\Connection |
| router | Routing\Registrar |
| session.store | Session\Session |
| translator | Translation\Translator |
| url | Routing\UrlGenerator |
| validator | Validation\Factory |
| view | View\Factory |
| Illuminate\Broadcasting\BroadcastManager | Broadcasting\Factory |
| Illuminate\Bus\Dispatcher | Bus\QueueingDispatcher |
| Illuminate\Notifications\ChannelManager | Notifications\Dispatcher |

Every other core key (12) and all 15 provider bindings are their own canonical key.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-contracts-*'` -- expected: 13 of 13 pass.
- `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run escalations:check`, `bun run async-surface --all --check` -- expected: each exits 0.
- `bun run api-surface --details contracts` -- expected: 765 matched, 0 unexplained, no detail line.
- `bun run harness` -- expected: no differences.
- `bun run fidelity:review review --story 10.4` -- expected: two `pass` verdicts, or rejects routed to Escalations.

## Fidelity Review

### Reviewer 1: reject at tree 56738407bb01eca2c349e6d66167ad3a7225c137

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `a02d058c0463f814522c232ec31c0e4f5f8158d1`, on 2026-10-24T09:16:25.392Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds none. |
| F-2: No expected value is weakened | fail | The new tests use exact comparisons, but their Upstream-derived expected data and proposed canonical-token exceptions cannot be confirmed from the supplied evidence. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are added, changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The three test bodies cover freezing, canonical resolution and validation failures, but evidence needed to confirm their declared Upstream fidelity and canonical rules is absent. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the contracts manifest and AD-1.4 with the diff: the alias data and token resolver belong to contracts, and no other Component's service implementation or fake is introduced. |
| F-9: Every `@asyncRoot` tag is true | pass | All declarations in the three changed source files are synchronous data or computation; none performs IO or invokes an async callback, so no asyncRoot tag is required. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

- **F-2** `packages/contracts/tests/xaravel/aliases.test.ts`: Supply the pinned Application::registerCoreContainerAliases, relevant service-provider sources, and Container::alias source so the expected alias data and self-alias exception message can be compared with Upstream. _(missing evidence)_
- **F-2** `decisions/ESC-10.4-1.md`: Supply an approved ruling for Option 1. Only the escalation proposal is present; it does not establish authorization for string-key fallbacks and sibling-contract selection used as expected values. _(missing evidence)_
- **F-7** `packages/contracts/tests/xaravel/aliases.test.ts`: Provide the pinned Application and service-provider sources consumed by XT-contracts-10 and XT-contracts-11. Without them, the regex extraction cannot be checked for complete coverage or correct binding-to-class association; upstreamBindings searches for the next new expression without bounding the binding closure. _(missing evidence)_
- **F-7** `decisions/ESC-10.4-1.md`: Provide the approved decision resolving the AD-1.4 gaps relied on by XT-contracts-11 and XT-contracts-12. The supplied escalation explicitly says those tests remain blocked on the ruling. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"56738407bb01eca2c349e6d66167ad3a7225c137","base":"a02d058c0463f814522c232ec31c0e4f5f8158d1","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T09:16:25.392Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds none.","findings":[]},{"id":"F-2","result":"fail","note":"The new tests use exact comparisons, but their Upstream-derived expected data and proposed canonical-token exceptions cannot be confirmed from the supplied evidence.","findings":[{"path":"packages/contracts/tests/xaravel/aliases.test.ts","detail":"Supply the pinned Application::registerCoreContainerAliases, relevant service-provider sources, and Container::alias source so the expected alias data and self-alias exception message can be compared with Upstream.","kind":"missing-evidence"},{"path":"decisions/ESC-10.4-1.md","detail":"Supply an approved ruling for Option 1. Only the escalation proposal is present; it does not establish authorization for string-key fallbacks and sibling-contract selection used as expected values.","kind":"missing-evidence"}]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are added, changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"fail","note":"The three test bodies cover freezing, canonical resolution and validation failures, but evidence needed to confirm their declared Upstream fidelity and canonical rules is absent.","findings":[{"path":"packages/contracts/tests/xaravel/aliases.test.ts","detail":"Provide the pinned Application and service-provider sources consumed by XT-contracts-10 and XT-contracts-11. Without them, the regex extraction cannot be checked for complete coverage or correct binding-to-class association; upstreamBindings searches for the next new expression without bounding the binding closure.","kind":"missing-evidence"},{"path":"decisions/ESC-10.4-1.md","detail":"Provide the approved decision resolving the AD-1.4 gaps relied on by XT-contracts-11 and XT-contracts-12. The supplied escalation explicitly says those tests remain blocked on the ruling.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Compared the contracts manifest and AD-1.4 with the diff: the alias data and token resolver belong to contracts, and no other Component's service implementation or fake is introduced.","findings":[]},{"id":"F-9","result":"pass","note":"All declarations in the three changed source files are synchronous data or computation; none performs IO or invokes an async callback, so no asyncRoot tag is required.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 56738407bb01eca2c349e6d66167ad3a7225c137

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `a02d058c0463f814522c232ec31c0e4f5f8158d1`, on 2026-10-24T09:16:25.392Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty. The change adds only Xaravel Tests (XT-contracts-10/11/12), so there is no Ported Test to compare with Upstream assertions. |
| F-2: No expected value is weakened | pass | There are no Ported Tests. In the added Xaravel Tests every expected value is an exact assertSame: literal tokens, keys, exact LogicException messages and an exact TypeError message. Nothing is loosened to a substring, a pattern or a minimum. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no Ported Tests, so there are no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker, and there is no Expectations adapted field (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | There are no assigned Oracle requests or fixtures, and no error fixtures (evidence (c)). |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared each consequence string with its body and with AD-1.3 and AD-1.4. XT-contracts-11 checks key, FQCN, leading-backslash, token and registered-class resolution, the unchanged return for unknown abstracts, and the fqcn() TypeError. XT-contracts-12 checks the four LogicException messages; the self-alias message matches the one quoted from Upstream Container::alias. There are three problems. First, the canonical rules both tests assert come from ESC-10.4-1 Option 1, which has no decision record. Second, XT-contracts-10 and XT-contracts-12 cite AD-1.3 without testing it. Third, the Upstream sources behind XT-contracts-10's verbatim check are not in the prompt. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change edits only packages/contracts (the aliases subpath, README, package.json) and adds an escalation file. AD-1.4 puts the alias table and canonical tokens in @​xaravel/contracts/aliases. Nothing stubs or fakes another Component; the Container (Epic 17) is not implemented here. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in canonical.ts, index.ts or table.ts. Every new export (validateAliasTable, aliasResolver, canonicalToken, the constants) is sync and does no IO, so no tag is missing. runInRootFrame is a dual helper used only in the test. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/aliases.test.ts`: XT-contracts-11 and XT-contracts-12 assert ESC-10.4-1 Option 1: the first sibling in Upstream order is canonical, a service with no contract keeps its string key, and a service with neither a contract nor a string key fails with 'has no canonical contract'. decisions/ESC-10.4-1.md does not exist, and the escalation says itself that it blocks these two tests. Without that ruling, AD-1.4 says the canonical token is 'the most specific contract it is aliased to'. The string-key results asserted for 27 services ('blade.compiler', 'migrator', …) and the sibling tie-break therefore do not verify the AD-1.4 bullet they cite. Get ESC-10.4-1 decided, or change the expectations. _(missing evidence)_
- **F-7** `packages/contracts/tests/xaravel/aliases.test.ts`: XT-contracts-10 (the verbatim frozen data) and XT-contracts-12 (validation failures) both cite AD-1.3, which says the container accepts string | token | class abstracts exactly as Upstream does. Neither body checks that; only XT-contracts-11 does. Remove AD-1.3 from those two consequence strings, or add a check for it.
- **F-7** `packages/contracts/tests/xaravel/aliases.test.ts`: XT-contracts-10 checks CORE_CONTAINER_ALIASES, PROVIDER_BINDINGS and PROVIDER_ALIASES against Upstream through computed paths: readdirSync over Illuminate/**/ *ServiceProvider.php and upstreamPath('Illuminate\Foundation\Application'). The prompt does not include Foundation/Application.php registerCoreContainerAliases or the provider sources. So I cannot confirm the 40 keys and their order, the 15 bindings with the class each closure builds (the first 'new X' after the call), or the 5 alias calls. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"56738407bb01eca2c349e6d66167ad3a7225c137","base":"a02d058c0463f814522c232ec31c0e4f5f8158d1","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T09:16:25.392Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty. The change adds only Xaravel Tests (XT-contracts-10/11/12), so there is no Ported Test to compare with Upstream assertions.","findings":[]},{"id":"F-2","result":"pass","note":"There are no Ported Tests. In the added Xaravel Tests every expected value is an exact assertSame: literal tokens, keys, exact LogicException messages and an exact TypeError message. Nothing is loosened to a substring, a pattern or a minimum.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no Ported Tests, so there are no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker, and there is no Expectations adapted field (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"There are no assigned Oracle requests or fixtures, and no error fixtures (evidence (c)).","findings":[]},{"id":"F-7","result":"fail","note":"I compared each consequence string with its body and with AD-1.3 and AD-1.4. XT-contracts-11 checks key, FQCN, leading-backslash, token and registered-class resolution, the unchanged return for unknown abstracts, and the fqcn() TypeError. XT-contracts-12 checks the four LogicException messages; the self-alias message matches the one quoted from Upstream Container::alias. There are three problems. First, the canonical rules both tests assert come from ESC-10.4-1 Option 1, which has no decision record. Second, XT-contracts-10 and XT-contracts-12 cite AD-1.3 without testing it. Third, the Upstream sources behind XT-contracts-10's verbatim check are not in the prompt.","findings":[{"path":"packages/contracts/tests/xaravel/aliases.test.ts","detail":"XT-contracts-11 and XT-contracts-12 assert ESC-10.4-1 Option 1: the first sibling in Upstream order is canonical, a service with no contract keeps its string key, and a service with neither a contract nor a string key fails with 'has no canonical contract'. decisions/ESC-10.4-1.md does not exist, and the escalation says itself that it blocks these two tests. Without that ruling, AD-1.4 says the canonical token is 'the most specific contract it is aliased to'. The string-key results asserted for 27 services ('blade.compiler', 'migrator', …) and the sibling tie-break therefore do not verify the AD-1.4 bullet they cite. Get ESC-10.4-1 decided, or change the expectations.","kind":"missing-evidence"},{"path":"packages/contracts/tests/xaravel/aliases.test.ts","detail":"XT-contracts-10 (the verbatim frozen data) and XT-contracts-12 (validation failures) both cite AD-1.3, which says the container accepts string | token | class abstracts exactly as Upstream does. Neither body checks that; only XT-contracts-11 does. Remove AD-1.3 from those two consequence strings, or add a check for it.","kind":"defect"},{"path":"packages/contracts/tests/xaravel/aliases.test.ts","detail":"XT-contracts-10 checks CORE_CONTAINER_ALIASES, PROVIDER_BINDINGS and PROVIDER_ALIASES against Upstream through computed paths: readdirSync over Illuminate/**/ *ServiceProvider.php and upstreamPath('Illuminate\\Foundation\\Application'). The prompt does not include Foundation/Application.php registerCoreContainerAliases or the provider sources. So I cannot confirm the 40 keys and their order, the 15 bindings with the class each closure builds (the first 'new X' after the call), or the 5 alias calls.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"The change edits only packages/contracts (the aliases subpath, README, package.json) and adds an escalation file. AD-1.4 puts the alias table and canonical tokens in @xaravel/contracts/aliases. Nothing stubs or fakes another Component; the Container (Epic 17) is not implemented here.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in canonical.ts, index.ts or table.ts. Every new export (validateAliasTable, aliasResolver, canonicalToken, the constants) is sync and does no IO, so no tag is missing. runInRootFrame is a dual helper used only in the test.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: blocked
Blocking condition: ESC-10.4-1 (contract: the canonical token of a service with no contract, or with sibling contracts; AD-1.4) and ESC-10.4-2 (protected-path: the Fidelity Review prompt lacks the Upstream sources XT-contracts-10 parses). Both are classes the orchestrator may rule on (MAINT-2026-10-16; the 2026-10-21 amendment for ESC-10.4-2). The Fidelity Review rejects at tree 56738407bb01eca2c349e6d66167ad3a7225c137 stand until then, and the review re-runs on the changed tree when the Story resumes.

**What was built** (ESC-10.4-1 Option 1)
- `packages/contracts/src/aliases/table.ts`: `CORE_CONTAINER_ALIASES` (40 keys), `PROVIDER_BINDINGS` (15) and `PROVIDER_ALIASES` (5), copied from Upstream as frozen data.
- `packages/contracts/src/aliases/canonical.ts`: the token index (41 subpaths), the services, `validateAliasTable`, `aliasResolver(table, tokens?)` and `canonicalToken`. Importing the subpath validates the real table.
- `packages/contracts/src/aliases/index.ts`, `package.json` (`./aliases`), `README.md`.
- `packages/contracts/tests/xaravel/aliases.test.ts`: XT-contracts-10, -11 and -12.
- `conformance/escalations/ESC-10.4-1.md` and `ESC-10.4-2.md`.

**Review**
- 25 findings: 0 high, 10 medium, 13 low, 2 false.
- Patched: 2 medium and 7 low, all in the test file:
  - the token list is now derived from `exports`, and the index is checked against it;
  - the binding parser is bounded and fails loudly;
  - the coverage check compares sets;
  - idempotence is tested;
  - comparisons go through `Assert`, not `JSON.stringify`;
  - AD-1.3 is no longer cited where it is not checked.
- Deferred, waiting on the two Escalations: 7 medium (6 Fidelity Review findings and the intent-alignment finding).
- Rejected: 6 low and 2 false, each with its reason in the triage log.
- Follow-up review recommended: no. No high finding was patched, and the two patched mediums are test-oracle hardening.

**Verification** (on the patched tree)
- `XARAVEL_UPSTREAM=require bun run harness --xaravel --id 'XT-contracts-*'`: 13 of 13 pass.
- `typecheck`, `lint`, `registration:check`, `escalations:check` and `async-surface --all --check`: each exits 0.
- `api-surface --details contracts`: 765 matched, 0 extra, 0 unexplained.
- `bun run harness`: XARAVEL 358 tests (353 passed, 5 skipped); 11 Variants (4 run, 7 NOT-RUN); differ=0.
- Fidelity Review: both reviewers reject at tree 56738407. Every finding but one waits on ESC-10.4-1 or ESC-10.4-2. That one, AD-1.3 cited without a check, is patched.

**Residual risks**
- If ESC-10.4-1 is ruled other than Option 1, `canonical.ts` and XT-contracts-11/-12 change.
- The one-instance behaviour of the So-that is the Container's (Epic 17), and nothing here exercises it.
