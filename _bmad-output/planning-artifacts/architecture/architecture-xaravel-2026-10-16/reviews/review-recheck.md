---
review: recheck
target: ../ARCHITECTURE-SPINE.md (revised: AD-1..AD-18 amended in place, AD-19..AD-28 added)
against: review-adversarial.md, review-rubric.md, review-reconcile-prd.md, review-laravel-parity.md, review-verification.md (all written against the earlier AD-1..AD-18 draft)
date: '2026-10-16'
---

# Recheck review: revised Architecture Spine (Xaravel)

## Verdict

The revision closes nearly every critical and high finding (71 of 83 closed, 12 partial, 0 open). However, it introduces about 20 new internal contradictions. At least five of them would make two parallel units build incompatibly, or would stop a Story from merging. The worst are:

- `fillable` / `touches` is a field in AD-7 but a method in AD-26.
- AD-22's Symfony owners create a Session ↔ Http dependency cycle and Phase inversions.
- AD-15 says Oracle-bot fixture commits are accepted, but AD-16's CODEOWNERS review blocks them.
- AD-6 says `async-surface.json` records a root per method, but the file is generated from `.d.ts`, which carries no call graph.
- AD-26 puts `Facade.shouldReceive` in Support, but AD-2 does not let a graded package depend on Mockery at runtime.

**Counts (critical + high, 83 findings):** CLOSED 71 · PARTIAL 12 · OPEN 0.

How the findings were counted:

- **Verification review.** That review gives no critical or high labels. Its five "Top issues" are counted as high (V-1..V-5).
- **Adversarial review.** The 9 critical and 22 high findings are all counted.
- **Rubric review.** C1..C4 and H1..H17 are counted.
- **Reconcile review.** R-01 (critical) and the 13 high findings are counted.
- **Laravel-parity review.** F-01..F-12 are counted.

---

## 1. Critical and high findings: status

### Adversarial (ADV)

| ID | Sev | Status | Closed by / remaining gap |
| --- | --- | --- | --- |
| ADV-01 | crit | CLOSED | AD-19 (scope primitive in `@xaravel/runtime`), AD-2 (every package may depend on runtime), AD-5/AD-15 (global `Symbol.for('xaravel.scope.run')` protocol for the grader) |
| ADV-02 | crit | CLOSED | AD-5 lifecycle (`registering → booting → sealed`, boot before any unit frame, lazy bootstrap forbidden, singleton cached at registration level, deferred providers under a mutex). New contradiction: see C-5. |
| ADV-03 | crit | CLOSED | AD-5 narrow frames (`DB.transaction` declares only the lease and the transaction level) |
| ADV-04 | crit | CLOSED | AD-5 child units: when the parent is a test frame, the child holds only the request, route and nonce |
| ADV-05 | crit | CLOSED | AD-20 connection leases. Ambiguity: see C-14. |
| ADV-06 | crit | CLOSED | AD-6 callback-async clause (Gate/`can`/Validator async), AD-11 thenable guard on conditions, lint over compiled views and the Skeleton |
| ADV-07 | crit | CLOSED | AD-5 frame slots for per-unit services, `this.<field>` lint, Protected `boot-only-state`. Enforceability concern: see C-18. |
| ADV-08 | crit | CLOSED | AD-9 arrays (Array / plain object / `PhpArray`, value copy), AD-15 matchers detect it by `Symbol.for` brand |
| ADV-09 | crit | PARTIAL | AD-1 string abstracts and alias table close the identity half. Still open: AD-26 types a facade's static surface "from the root's contract", but Router, DatabaseManager, BladeCompiler, Vite and Schema have no full contract. Support (Phase 2) cannot type-import Phase 4–6 packages, because AD-2 limits `types` to dependencies. |
| ADV-10 | high | CLOSED | AD-1 canonical token. Mechanism gap: see C-16. |
| ADV-11 | high | CLOSED | AD-23 (single `phpSerialize`/`jsonEncode` in runtime) |
| ADV-12 | high | CLOSED | AD-24 (Laravel envelope, `ModelIdentifier`, two-phase restore) |
| ADV-13 | high | CLOSED | AD-23 JSON methods (`toJson`/`jsonSerialize`/`toJSON`) |
| ADV-14 | high | CLOSED | AD-10 `fqcn()` identity, `constructor.name` lint |
| ADV-15 | high | CLOSED | AD-19 / AD-10 (Registry in runtime, per-file `registerClass`, `registerTestClass`, duplicate-key policy, workbench map) |
| ADV-16 | high | CLOSED | AD-9 prototype-getter brands and `hasBrand`, AD-7 symbol keys go straight to the target |
| ADV-17 | high | CLOSED | AD-9 `normalizeRow` with lossless hints |
| ADV-18 | high | CLOSED | AD-6 `afterResolvingAsync` |
| ADV-19 | high | CLOSED | AD-2 Foundation rule (FQCN strings, package discovery) |
| ADV-20 | high | CLOSED | AD-25 hook order and frame-scoped resets. Ordering ambiguity: see C-6. |
| ADV-21 | high | CLOSED | AD-13 (supervisor only in the `queue:work` entry, one job per child) |
| ADV-22 | high | PARTIAL | AD-22 adds the ownership rule and table. Still open: the table leaves out psr/log, psr/http-message, symfony/finder, routing, uid, var-dumper, error-handler, brick/math, egulias/email-validator, guzzle, flysystem, league/uri, fruitcake/php-cors and termwind. Two of its owners are placed after their consumers (C-2). |
| ADV-23 | high | CLOSED | AD-12 seams (Route/FormRequest macros, `prepareResponseUsing`, `renderTargetResolver`, `lastRenderedView`, `Vary` on every response through the seams) |
| ADV-24 | high | CLOSED | AD-11 `RenderContext` ABI, full-render fragment capture, closed-fragment direct call |
| ADV-25 | high | CLOSED | AD-5 end-of-unit rule, frameless write throws, ALS bind for streams, WebSocket child units |
| ADV-26 | high | CLOSED | AD-6 async roots, iff-on-all-paths, dual helpers, sync logger, fake predicates. Contract return types are fixed in Phase 1 because `@xaravel/contracts` is Protected. |
| ADV-27 | high | CLOSED | AD-6 destructor terminals (microtask start, frame-tracked, exactly once) |
| ADV-28 | high | CLOSED | AD-5 (`DatabaseTransactionsManager` as a frame slot), AD-20 `afterCommit` rule |
| ADV-29 | high | CLOSED | AD-17 (`redis-server` per worktree, `flushdb` allowed, no prefix) |
| ADV-30 | high | CLOSED | AD-15/AD-16 (base-branch manifest, variants from Inventory, verified `blocked-by`, `portedTest` block ownership, assert-only, kind-multiset floor, per-line `adapted`) |
| ADV-31 | high | PARTIAL | AD-15/AD-16/AD-28 add ESC naming, the merge queue, unexpected-pass rules and slicing. Still open: (a) Oracle-bot fixture commits collide with CODEOWNERS (C-3); (b) `oracle-requests/` is not Protected, so agents choose their own Differential inputs, which ADV-31 asked to protect; (c) GitHub's server-side merge and the merge queue never run a custom `.gitattributes` merge driver, so adjacent-line Expectations conflicts still evict PRs. |

### Rubric (C/H)

| ID | Sev | Status | Closed by / remaining gap |
| --- | --- | --- | --- |
| C1 | crit | CLOSED | AD-19 L0 `@xaravel/runtime`, AD-2 allowance |
| C2 | crit | CLOSED | AD-9 Arrays |
| C3 | crit | PARTIAL | AD-22 exists, but its table is incomplete and has Phase/cycle inversions (C-2) |
| C4 | crit | CLOSED | AD-16 (ruleset with `pull_request_target`, CODEOWNERS, base-branch manifest, `story/*` identity, default read permissions) |
| H1 | high | CLOSED | AD-1 brand plus `Symbol.hasInstance` on every contract |
| H2 | high | PARTIAL | AD-26 table plus FR-8 CI gate. Still unmapped: Macroable / typed macros (declaration-merging pattern), real-time facades and dynamic finders. The old Deferred row that held them was removed without a replacement. |
| H3 | high | CLOSED | AD-3 (directory vs namespace split, helpers, decorator homes) |
| H4 | high | PARTIAL | AD-15 API-surface diff, run in the AD-28 merge queue. Still open: where the `xaravel-addition:` and `deferred:` allowlists live and who may write them; how the diff gates while a package is half-built (every unported member is "missing"). |
| H5 | high | CLOSED | AD-6 destructor terminals, `checkThenables: true` |
| H6 | high | CLOSED | AD-6 loaded-once auth |
| H7 | high | CLOSED | AD-11 Variables [ADOPTED] |
| H8 | high | CLOSED | AD-25 (Pest-style `this`), AD-15 `portedTest(id, { case, dataset })` |
| H9 | high | CLOSED | AD-16 list (expectations excluded; lint config, tsconfigs, bunfigs, `package.json`, `bun.lock`, stories added), `oxlint-disable` ban, AD-15 freeze and the package-bunfig ban |
| H10 | high | CLOSED | AD-15 (variants from the Inventory, Protected generator references, Fidelity verdicts as ≥2 PR-review identities) |
| H11 | high | PARTIAL | AD-6 names the tooling (`tools/lint-rules`, oxc-parser, `NotPromise`, `checksVoidReturn`). Still open: the iff rule depends on a per-line "root it reaches", which a `.d.ts` walk cannot compute (C-4). There is no mechanical iff check. |
| H12 | high | CLOSED | AD-28 |
| H13 | high | PARTIAL | AD-15 per-Story test files, AD-21 method-group split. Still open: the `.gitattributes` key-merge driver does not run in GitHub merges or the merge queue, and its local `git config` is not specified (see ADV-31 (c)). |
| H14 | high | CLOSED | AD-14 (`@xaravel/serializable-closure` in Phase 3, facades and helpers allowed). New Phase inversion: C-7. |
| H15 | high | CLOSED | AD-17 |
| H16 | high | CLOSED | AD-20 |
| H17 | high | PARTIAL | AD-15 `oracle-requests/` plus the `xaravel-oracle` App. Still open: the target branch, the trigger and how the App's commit passes AD-16's CODEOWNERS rule (C-3); the request format, which matters for security under `pull_request_target`. |

### Reconcile-PRD (R)

| ID | Sev | Status | Closed by / remaining gap |
| --- | --- | --- | --- |
| R-01 | crit | CLOSED | AD-16 list and seed comment (expectations not Protected) |
| R-02 | high | CLOSED | AD-16 Story manifest (Protected `stories/`, base-branch read) |
| R-03 | high | CLOSED | AD-1 container keys (`string | token | class`) |
| R-04 | high | CLOSED | AD-5 singleton caching and overlay list; DIV-11 in Source Amendments |
| R-05 | high | CLOSED | AD-9 Arrays |
| R-06 | high | CLOSED | AD-14 (facades and helpers free; classes by FQCN and models as `ModelIdentifier` arguments) |
| R-07 | high | CLOSED | AD-11 Variables |
| R-08 | high | CLOSED | AD-2 Boost framework mode (`tools/boost-framework`, MCP SDK only) |
| R-09 | high | CLOSED | AD-5 global run protocol, AD-15 grader isolation |
| R-10 | high | CLOSED | AD-15 Upstream snapshot, seed `conformance/upstream/` |
| R-11 | high | CLOSED | AD-15 API-surface parity plus Oracle Differential Xaravel Tests for non-Inventory libraries |
| R-12 | high | CLOSED | AD-6 loaded-once state |
| R-13 | high | PARTIAL | AD-15 new inputs through the App. CODEOWNERS conflict (C-3). |
| R-14 | high | CLOSED | Source Amendments DIV-1; AD-6 async roots; Fidelity rejects lines that name no root. The generator cannot supply the root (C-4), a contradiction the revision introduced. |
| R-17 | high | CLOSED | Source Amendments "DIV-2, FR-63, §5.1, addendum" |

### Laravel parity (F)

| ID | Sev | Status | Closed by / remaining gap |
| --- | --- | --- | --- |
| F-01 | crit | CLOSED | AD-7 blueprint harvest, Laravel construction order, `attributes` config, constant defaults, cast-value defaults. Ambiguity about "after construction": see C-13. |
| F-02 | crit | PARTIAL | AD-26 option pairs and DIV-12, AD-7 `@attribute` accessor, no Request `__get`. Still open: `fillable` and `touches` are both AD-7 configuration fields and AD-26 "framework method plus state" names (C-1). |
| F-03 | crit | CLOSED | AD-5 child units and embedded kernel; AD-20 lease inheritance |
| F-04 | high | CLOSED | AD-6 authenticated user resolved once per frame |
| F-05 | high | CLOSED | AD-5 narrow frames |
| F-06 | high | PARTIAL | AD-25 fresh app per test, DIV-11. Still open: how a facade, helper or Registry miss finds *its* Application when several apps exist in one process (per-test apps, Testbench, concurrent tests). There is no `frame.app` / `setFacadeApplication` rule, and overlays are not keyed per app. |
| F-07 | high | CLOSED | AD-1 strings, `contract<T>()`, abstract-class tokens |
| F-08 | high | CLOSED | AD-4 function form `inject(map, fn)` plus contextual descriptors |
| F-09 | high | CLOSED | AD-10 PSR-4 map with three roots and async miss import |
| F-10 | high | CLOSED | AD-9 prototype brands, AD-7 symbol keys go to the target |
| F-11 | high | CLOSED | AD-9 `normalizeRow`, `castsBigint`, `integers: 'bigint'`, exact-digit JSON |
| F-12 | high | CLOSED | AD-14 allowed free identifiers |

### Verification (V, the "Top issues" table counted as high)

| ID | Status | Closed by / remaining gap |
| --- | --- | --- |
| V-1 `checkThenables` | CLOSED | AD-6 Enforcement |
| V-2 ALS lost in streams | CLOSED | AD-5 Primitive (`bind`/`snapshot` for stream and generator bodies, direct streams, timers) |
| V-3 release toolchain | CLOSED | AD-18 (`bun pm pack` → `npm publish --provenance`, npm ≥ 11.5.1, bootstrap publish). Not stated: Node ≥ 22.14 in the release job; public repo and packages required for provenance. |
| V-4 `env = false` | CLOSED | Conventions "Config and env" (top-level key plus `--no-env-file` in every entry script) |
| V-5 polyfill / macOS services / PG 19 date | CLOSED | AD-4 `(Symbol as any).metadata ??=` plus the `experimentalDecorators` ban; AD-28 native PG/Redis on macOS; Deferred PG 19 on 2026-11-19 |

### Medium and low findings still OPEN that could let two parallel units diverge

| Finding | Gap in the revised spine |
| --- | --- |
| Rubric M13 / Reconcile R-22 | `testing` is still a **Xaravel Component** in the layer table, the dependency diagram (`xc` node) and the seed, but PRD §4.17 says it is Upstream. This decides which AD-2 edge rule applies and which acceptance rule (Global vs FR-115) applies. It also collides with AD-12's ban on reverse imports from Upstream-mirroring packages (C-11). |
| Rubric M1 / Reconcile R-29 | The public Model state `exists`, `wasRecentlyCreated` and `relations` is neither a configuration property nor stated as a prototype getter. Under AD-7, `model.exists` routes to `getAttribute('exists')`. The Eloquent attributes and persistence Epics will diverge. |
| Rubric M2 | FR-38 `hx*` methods need a `Response` mixin seam, and FR-41 `hxRedirect()` needs a `RedirectResponse` mixin seam. AD-12 lists Request/TestResponse mixins and Redirector/ResponseFactory decoration only, so the htmx agent will edit Http or invent a seam. |
| Rubric M3 / Reconcile R-25 | AD-13 "adapted under AD-13" names no DIV, and no Source Amendment adds one (C-8). |
| Rubric M14 | Whether test files may import devDependencies and later-Phase packages is unstated. Example: Collections tests use `Str`/Carbon from Support. See C-9. |
| Rubric M6 / Reconcile R-23 | NFR-4 concurrency tests have no shared `interleave()` helper, owner or load level, so each package writes its own interleaver with different strength. |
| Rubric M9 | FR-106 producer seams (last-error record, browser-log hook, `Container.getBindings`) are undecided. Phase 3–7 producers ship without them, and the Phase 8 Boost Epic must then edit other packages. |
| Rubric M10 | "Each package's `docs/` mirrors its Laravel doc page" gives no owner for pages that span packages (requests, csrf, http-client), so they are written twice or not at all. |
| Rubric L5 | The HTTP kernel (Phase 6) is built before the production server entry (Deferred to the Phase 7 Skeleton). The kernel-facing `serve` / drain contract is undecided. |
| Rubric L7 / Reconcile R-33 | The `QUERY` CSRF classification is still neither decided nor deferred. Routing (FR-30) and the CSRF middleware can classify it differently. |
| Reconcile R-34 | Redis Pub/Sub on `Bun.redis` (Broadcasting vs Redis) and the untested 7.2 minimum remain silent. |
| Reconcile R-35 | The RES-G28 idioms (real-time facades, dynamic finders, `Uri` normalisation, ParallelTesting, Faker method-name mapping) lost their Deferred row (see H2). |
| Reconcile R-41 | Upstream contracts reference concrete types (Request, Response, Collection). Nothing says the Phase-1 contracts must use structural interfaces, so implementers in Phase 6 can diverge from them. |
| Adversarial ADV-38 | Where the htmx TestResponse assertions live and who builds them is contradictory (C-11). |
| Adversarial ADV-33 | Discovery cache path and provider order (framework defaults, then discovered, then `bootstrap/providers.ts`) are unstated. `dontDiscover` is missing. |
| Rubric L1 | `[ADOPTED]` still marks only some ADs (1, 4, 5, 7, 8, 15, AD-11 Variables, AD-25 App tests), and `status: draft`. Agents may treat the unmarked ADs as provisional. |

---

## 2. Internal contradictions and ambiguities the revision introduced

Ranked by how likely each one is to make parallel units diverge or to block merges.

**C-1 — AD-7 × AD-26: `fillable` and `touches` are both field-config and method-keeps-name.**

- AD-7 lists `fillable` and `touches` as configuration properties, written as fields (`fillable = ['title']`).
- AD-26's "Framework method plus state" row names `fillable()` and says the method keeps the name. Upstream also has `touches($relation)`.
- A subclass field `fillable = [...]` becomes an own property and shadows the prototype method. Then `model.fillable(['a'])` throws, or the framework reads a function as config.
- Result: the Eloquent attributes agent and the guarding/relationships agent will each pick one side.

**C-2 — AD-22 × AD-2 × PRD §7.3: Symfony owners create a cycle and Phase inversions.**

- `symfony/http-foundation` is owned by `@xaravel/http` (Phase 6). Upstream `illuminate/session` requires `symfony/http-foundation`, and `illuminate/http` requires `illuminate/session`. AD-2 says third-party `require` entries follow AD-22, so the edges become Session → Http → Session, a cycle, and CI fails on cycles.
- Validation (Phase 5) also requires `symfony/http-foundation` and `symfony/mime`.
- `symfony/mime` is owned by `@xaravel/mail` (Phase 7), but Http (Phase 6) and Validation (Phase 5) require it.
- Result: an owner must sit at the earliest consumer's Phase and below every consumer in the graph, for example a standalone `@xaravel/symfony-http-foundation` at L1, as the rubric's C3 fix proposed.

**C-3 — AD-15 × AD-16: the Oracle App's fixture commits cannot pass CODEOWNERS.**

- AD-15 says "AD-16 accepts fixture-only commits from that App". AD-16's text has no such exception: "A change to a Protected Path needs Maintainer Code Owner review".
- GitHub's "require Code Owner review" applies to the files in the PR diff, whoever authored the commit.
- If the App commits to the Story branch, every Differential Story needs the Maintainer. If it commits to `main`, the App needs ruleset bypass, and AD-28's merge queue and linear history apply to it too.
- The target branch is unstated.

**C-4 — AD-6: the root-per-line rule cannot be generated from `.d.ts`.**

- AD-6 says `async-surface.json` has "one line per async method naming the root it reaches" and is "generated by a `tools/` script that walks the emitted `.d.ts`".
- A `.d.ts` file holds signatures only, not a call graph. It can tell that a method returns a Promise, but not which root that method reaches.
- So either the root is hand-written, and then the merge queue's "regenerates and checks" would drop it or flag drift, or the root cannot be produced at all.
- Result: Fidelity Review's "reject lines that name no root" has nothing to check.

**C-5 — AD-5: deferred-provider loading vs the after-`sealed` write rules.**

- The lifecycle bullet says deferred providers "load into the base under a mutex".
- The after-`sealed` rule says provider registration and `bind`/`singleton` throw inside a non-test frame and go to the overlay inside a test frame.
- A deferred provider is always first triggered by `make()` inside a frame after `sealed`.
- Result: the Container and Foundation agents get opposite answers, both in production (throw vs load) and in shared-app tests (overlay vs base).

**C-6 — AD-5 × AD-25 × AD-15: who opens the test frame, and when.**

- AD-5 says every TestCase "completes boot before it opens any unit frame".
- AD-25's hook order runs `createApplication` and ends with "test frame ends", which implies the frame wraps the whole lifecycle.
- AD-15 says frames are opened only through the runtime protocol by the grader.
- Unstated: whether the harness or the TestCase opens the frame, and whether `createApplication` runs inside it. Same question for the shared-app opt-in.
- This decides where the `RefreshDatabase` lease (AD-20) and `setUp<Trait>` writes land.

**C-7 — AD-14 × AD-27 × AD-2: the Phase-3 closure codec depends on Phase-8 helpers and the meta-package.**

- The allowed-identifier list is "generated from `@xaravel/framework/support/facades` and `helpers`". `@xaravel/framework` is the Distribution meta-package, which depends on everything, including `serializable-closure`. Many helpers (`route`, `view`, `dispatch`, `auth`) arrive in Phases 6–8.
- The worker "rebuilds the closure with … the facades and helpers", so the codec would need them at runtime. That is a cycle through the meta-package.
- Unstated: whether the list is static data generated from Upstream at the Pin, and whether Bus/Queue inject the scope.

**C-8 — AD-13 × AD-15 × §5.1: an adaptation without a DIV.**

- AD-13 says timeout tests are "adapted under AD-13".
- AD-15 requires `// adapted:DIV-<n>.<clause>` markers, and §5.1 allows adaptation only under a DIV.
- No Source Amendment adds a DIV for pcntl or process-level timeouts.
- Result: an agent cannot write a valid marker.

**C-9 — AD-2 × AD-15: the "static import not in `dependencies`" rule vs test imports.**

- Ported Tests must import `@xaravel/assert`, which AD-2 makes a devDependency. The CI rule then fails every Ported Test.
- If devDependencies count, Phase-1 tests that need Phase-2 packages (Collections tests use Support's `Str`/Carbon) create a test-time cycle, Support → Collections → Support.
- The per-package `tsc` "types limited to dependencies" has the same issue for test files.

**C-10 — AD-2 × AD-26: `Facade.shouldReceive` / `spy` / `partialMock` need Mockery at runtime.**

- AD-26 puts these on `Facade`, in `@xaravel/support`.
- AD-2 allows only `@xaravel/testing` to depend on `@xaravel/mockery` at runtime. Every other graded package may take the grader only as a devDependency, so it cannot be an optional peer either.
- Result: the Support agent cannot implement them, or must add an illegal edge.

**C-11 — AD-12 × AD-21 × M13: where the htmx TestResponse assertions live.**

- AD-12 says "FR-96 htmx assertions ship in the Phase 7 Testing Epic", and they install as TestResponse mixins from the htmx provider.
- AD-21 limits a Testing Story to `packages/testing/**`. AD-12 forbids Upstream-mirroring packages (Testing, per the PRD) from importing `@xaravel/htmx`.
- Result: neither package may hold the assertions.

**C-12 — AD-16 × AD-21 × AD-2: new packages need Protected edits.**

- AD-2 makes each package a `tsc` project reference, so the first Story of every Component creates `packages/<c>/tsconfig.json` and adds it to the root tsconfig references.
- AD-16 protects "every `tsconfig*.json`" and the root `package.json`. AD-21 lets a Story change only `packages/<c>/**`.
- Unstated: who scaffolds packages, for example a Phase-0 Infrastructure Story that creates every package skeleton.

**C-13 — AD-7: when "after construction" begins.**

- "After construction the `defineProperty` trap stops routing." The base constructor cannot observe when the subclass field initializers finish.
- If "construction" ends when the base constructor returns, the initializers go to the target, which works with the blueprint.
- If it ends with the leaf constructor, the initializers re-route and overwrite filled values, which is the F-01 bug again.
- Separately, "a field that is neither config nor `declare` nor a known default throws": a plain `name: string;` harvests as default `undefined`. The rule does not say whether that is a "known default" (silent `NULL` inserts) or an error (RES-G24).

**C-14 — AD-20: "non-transactional statements may use any idle connection" vs leases.**

- Inside a frame that holds a lease (a `RefreshDatabase` test, or the span between `beginTransaction` and `commit`), a plain `select` on another pooled connection misses uncommitted rows.
- For `:memory:` SQLite, the only connection is never idle while it is leased.
- The rule needs to say: "a frame holding a lease runs every statement on that lease".

**C-15 — AD-19 × AD-1 × AD-23: runtime codecs must recognise contract brands.**

- `jsonEncode` in `@xaravel/runtime` honours `JsonSerializable` / `Arrayable` / `Jsonable`, but runtime has zero dependencies and the tokens live in `@xaravel/contracts`.
- `@xaravel/assert` has the same problem.
- Detection works only if contract tokens are `Symbol.for('<FQCN>')`, which AD-1 does not state. Otherwise the Contracts agent can mint plain `Symbol()` values that runtime and the grader cannot see.

**C-16 — AD-1: the alias table in Protected contracts cannot name concrete classes.**

- AD-1 says concrete-class tokens are aliases of the canonical token. `@xaravel/contracts/aliases` cannot import `CacheManager`.
- The unstated mechanism (class → `fqcn()` → alias lookup in the container) is exactly what the Container and Cache agents must agree on.
- Separately, AD-2's discovery key `"xaravel": { "aliases": {...} }` uses the same word for Laravel's *facade* aliases. A package author may put container aliases there.

**C-17 — AD-26: Collection index syntax vs "no Proxy outside `Model`".**

- The `ArrayAccess` row allows index syntax on `Collection`. The `__call` row says there is no Proxy outside `Model`.
- `collection[0]` cannot work without a Proxy, an Array subclass or own numeric properties.
- Result: the Collections agent must break one of the two rows.

**C-18 — AD-5: the singleton-field lint cannot know which classes are singletons.**

- "Lint rejects any `this.<field>` assignment after construction in a class bound as a singleton."
- Bindings are made in providers, often in other packages, so static lint cannot find "bound as a singleton".
- It needs a marker (a decorator, or the `PORTING.md` list read by the rule). Without one, each package agent decides for itself whether the rule applies.

**C-19 — AD-27 vs AD-19 / AD-5 / AD-10: where "scope" and "registry" live.**

- AD-27 lists "scope, registry" among the Xaravel-only *contracts* in `@xaravel/contracts`.
- AD-19 / AD-5 / AD-10 put both in `@xaravel/runtime`.
- Unclear whether `@xaravel/contracts/scope` exists, as interfaces or a re-export, or not at all.
- Similarly, AD-27 calls "htmx seams" contracts while AD-12 says the host packages own them.

**C-20 — AD-28 × AD-16: bot PRs have no Story.**

- AD-28's auto-quarantine bot "opens an Escalation", but AD-16 names Escalations `ESC-<story-id>-<n>`, and a bot has no story-id.
- Bot quarantine and promotion PRs edit Expectations lines but have no `story/<id>` branch or `test_ids`, so AD-16's ownership check would fail them. No exemption is stated.

**C-21 — AD-6 × AD-5: the logger's async flush vs the end of a unit.**

- AD-6 says channels "flush through their Driver asynchronously".
- AD-5's unit-end rule does not say that a pending flush is a frame `defer` item. A CLI command or job can therefore end, or the process can exit, before logs are written.
- The Log and Foundation kernel agents will choose differently.

**C-22 — AD-18 internal.**

- "No other workflow or credential can publish" vs "A new `@xaravel/*` name gets a one-time bootstrap publish by the Maintainer".
- This is low impact, but the second sentence is an exception to the first and should say so.

**C-23 — Diagram and layer table vs AD-2 and the seed.**

- The `foundation --> app` edge points at the whole L3 tier, including Phase 7–8 Components that AD-2 forbids Foundation to import statically. The note under the diagram defers to AD-2, which softens this.
- The tiers leave out `serializable-closure` (Phase 3), `jsonschema` and `ai`.
- `testing` is in the Xaravel tier (see M13).

---

## 3. Mermaid diagrams

**Diagram 1 (`flowchart BT`, dependency direction): valid.**

- Every label is a quoted string. `@`, `:`, `,` and `/` inside quotes are safe.
- The node IDs (`runtime`, `contracts`, `core`, `infra`, `app`, `foundation`, `xc`, `dist`, `grader`) avoid reserved words (`end`, `subgraph`, `graph`, `style`, `class`, `click`, `default`).
- `grader` is an isolated node, which is legal and matches "no edges to graded packages".
- Content issues only: the `xc` label lists `testing`, and `serializable-closure`, `jsonschema` and `ai` are missing (C-23).

**Diagram 2 (`flowchart LR`, CI flow): valid, with two risky unquoted tokens.**

- **Valid constructs:**
  - `subgraph WT["Agent worktree, branch story/id"]` / `end` and `subgraph GH["GitHub"]` / `end`.
  - Edges from a subgraph ID (`WT -->|push| PR`).
  - Inline node definitions inside an edge (`OR[...] -->|xaravel-oracle app| FX[...]`).
  - Edge labels with hyphens.
  - The `[( … )]` cylinder shape.
- **Risky:**
  - `FX[(conformance/fixtures)]` has an unquoted `/` inside a shape. Mermaid parses it in current versions, but `/` is also a shape delimiter (`[/ … /]`). Quote it: `FX[("conformance/fixtures")]`.
  - `NP[(npm @xaravel)]` has an unquoted `@`. Mermaid ≥ 11.3 uses `@{ … }` for shape metadata. This instance is not followed by `{`, so it is probably safe, but quote it: `NP[("npm @xaravel")]`.
  - `B[(SQLite files, PG db per key, Redis socket per worktree)]`: commas in unquoted text are fine.
- **Content:**
  - The Oracle node has no trigger edge from PR / `oracle-requests`.
  - The PR node omits `bun audit` and the full `test_ids` run that AD-28 lists per PR.
