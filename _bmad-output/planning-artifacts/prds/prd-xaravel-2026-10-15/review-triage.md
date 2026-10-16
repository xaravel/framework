# Review triage: MEDIUM and LOW findings (PRD Xaravel)

Date: 2026-10-15. Scope: every MEDIUM and LOW finding (and unrated mechanical notes) in `review-rubric.md`, `review-adversarial.md`, `reconcile-brief.md` and `reconcile-research.md`. CRITICAL and HIGH findings were handled earlier (see `.memlog.md` and the addendum's "Review-pass rationale").

**Decisions:** AUTOFIX = applied to `prd.md` / `addendum.md`. DEFER = needs a product decision or architecture/epics detail; not edited. ALREADY-FIXED = superseded by the critical/high pass. IGNORE = wrong or style-only. "(partial)" means part was fixed and the rest is deferred, as stated.

**Counts (88 rows):** AUTOFIX 53 · DEFER 22 · ALREADY-FIXED 12 · IGNORE 1. Partial AUTOFIX rows also defer a remainder (listed in the row).

**Integrity after edits:** FR-1 to FR-116 unique and contiguous (one new FR: FR-116 PHPUnit-style matchers, in §4.1). No dangling FR or OQ references. 5 `[ASSUMPTION]` tags (FR-40, FR-42, §7.3, SM-1, OQ-9), unchanged.

## review-rubric.md (RUB)

IDs: section initials + order. DR = Decision-readiness, ST = Substance, SC = Strategic coherence, DN = Done-ness, SH = Scope honesty, DU = Downstream usability, MN = Mechanical notes.

| Finding | Decision | What changed / why deferred (owner) |
|---|---|---|
| RUB-DR1 [M] Unflagged tensions; stale NOTE FOR PM | ALREADY-FIXED | Addendum note removed; §7.2/§7.3/SM-1 conflicts resolved in the critical/high pass. |
| RUB-DR2 [M] OQs lack resolve-by gates; OQ-1 not open | AUTOFIX | §9: Maintainer named as owner of all OQs; each OQ has a "Resolve by" gate taken from §7.3 (Phase 0 spikes, Phase 6/7 starts, alpha, first publish). OQ-1 kept in §9, marked optional, with a gate. OQ-8 notes that FR-78 now fixes the required behaviour. |
| RUB-DR3 [M] Full-framework bet has no re-scope checkpoint; alpha on 13.x or 14? | DEFER | Maintainer: re-scope decision rule (for example an SM-2 threshold) and which Laravel major the alpha targets. Same as RES-G25, BRF-G12. |
| RUB-ST1 [L] Vision's "easiest to build on" claim unearned | AUTOFIX | §1 reworded as an aim ("The aim is for it to be…"). |
| RUB-ST2 [L] FR-14 consequence is a finished chore | AUTOFIX | FR-14 consequence now testable: every Package publishes under `@xaravel` (org registered 2026-10-15), and the Installer publishes as `create-xaravel`. |
| RUB-SC5 [L] SM-4 has no target; SM-5 unit makes no sense | AUTOFIX | SM-4 labelled tracking only, with no target before the alpha. SM-5: "Pin bumped to the latest 13.x tag at every Phase boundary". |
| RUB-DN5 [M] `fail-known` has no defined role | AUTOFIX | §3 Expectations File: `fail-known` counts as not passing and doesn't satisfy the done definition or the Global rules. FR-3: it blocks Epic acceptance and the dashboard counts it separately. No waiver was added (that would be a new decision; the Escalation path already exists). |
| RUB-DN6 [M] Mockery and PHPUnit matchers have no boundary; matchers have no FR | AUTOFIX | New **FR-116 PHPUnit-style matchers** (§4.1, Phase 0): covers every assertion used at the Pin via a scan run with FR-1; `assertSame` = PHP `===`, `assertEquals` = PHP `==`, `expectException` ends the test, `createMock` goes through Mockery; each rule has its own Xaravel Tests. FR-100: covers every Upstream Mockery API (same scan), delivered in Phase 0. §7.2 and §7.3 Phase 0 reference FR-116. |
| RUB-DN7 [M] FR-88 capture rule vs JS module scope | AUTOFIX (partial) | FR-88: a rebuilt closure reaches only its arguments and the Class Registry, with no ambient globals or imports (the brief's "module registry", expressed in the Glossary term). **Deferred (architecture):** the detection method (free-identifier analysis) and the allowlist. |
| RUB-DN8 [M] Xaravel-only FRs without testable consequences | AUTOFIX (partial) | Consequences added to FR-37 (boolean accessors, `requestType()` values, `tag#id` target, `expectsJson()` false), FR-43 (SSE/multipart flush, WebSocket 101), FR-73 (app booted in REPL, Promises awaited, Phase 7, Xaravel Tests) and FR-108 (offline, installed-version docs). FR-102 already had consequences. **Deferred (architecture):** the FR-106 output contract. |
| RUB-DN9 [M] "Full set" lists compete with the Global rule (FR-71, FR-44) | AUTOFIX | FR-71: "every `make:*` and stub-backed command in Upstream at the Baseline Pin", adding `channel` and the `*:table` generators. FR-44: "every Blade directive in Upstream at the Baseline Pin, including…". |
| RUB-DN10 [M] NFR-4 and NFR-9 have no bounds or gates | DEFER | NFR-4 concurrency load and interleaving harness → architecture. Docs for every alpha Component as an alpha criterion → Maintainer. |
| RUB-DN11 [L] "Changed Test IDs" and fast-mode sample undefined | AUTOFIX | FR-7: a Test ID is changed when its Upstream body or dataset values differ between pins. FR-9: the sample comes from a printed seed (NFR-7). |
| RUB-SH1 [M] Integration-test gating has no Skip Reason or re-activation | ALREADY-FIXED | Testbench is in Phase 7; Global rule: `blocked-by` entries are cleared by re-verification Stories. |
| RUB-SH2 [M] `php-only` / `out-of-scope` need no evidence | AUTOFIX | `php-only` already needs an approved Escalation. New: §7.1 Non-Goals numbered NG-1 to NG-7; §3 and FR-3 require `out-of-scope:<NG-N>`. |
| RUB-SH3 [L] FR-84 `Bun.Image` premise untagged | AUTOFIX | OQ-11 spike now also checks `Bun.Image`, `Bun.S3Client`, `Bun.redis` and `Bun.sql` raw bindings. |
| RUB-DU1 [M] No FR → Component → Package → Phase map | DEFER | Epics: build the table during epic creation. (Class Registry ownership fixed: added to the Glossary list of Xaravel Components and to §7.3 Phase 1.) |
| RUB-DU2 [M] Parity rule has no category for additions | AUTOFIX | §5.1: Xaravel-only additions are allowed only where an FR specifies them (examples FR-37, 41, 52, 63, 96). |
| RUB-DU3 [M] DIV-1 sync/async split for state loaded once (session, `old()`, `Auth.user()`) | DEFER | Architecture: enumerate the async surface per interface. This overlaps adversarial **H5**, which still looks unaddressed in the PRD (see the note at the end). |
| RUB-MN1 Phase "nine groups" | ALREADY-FIXED | §3 now says ten groups, Phase 0 to 9. |
| RUB-MN2 Lowercase "components" collides with Component | AUTOFIX | FR-45 retitled "Blade components", FR-47 says "Blade components". Glossary entry **Blade component** added. |
| RUB-MN3 "Package developers" undefined | AUTOFIX | FR-101: "App Developers who write reusable libraries for Xaravel". |
| RUB-MN4 "public alpha" not in Glossary | AUTOFIX | Glossary entry **Public alpha** added (§7.2). |
| RUB-MN5 Stale addendum refs (CLI pending OQ-1; NOTE FOR PM) | ALREADY-FIXED | Addendum row says "CLI name kept (NFR-8)"; note removed. |
| RUB-MN6 Rename §10 "Confirmed Assumptions"; FR-41 entry is phrased as a rationale | IGNORE | Style only. §10 is already split into pending and confirmed. |
| RUB-MN7 UJ-2/UJ-3 lack a "Persona + context" line | AUTOFIX | Line added to each. |
| RUB-MN8 SM-1 "Validates: FR-1 to FR-5" | AUTOFIX | "Validates: the thesis (§1), measured through FR-1 to FR-5". |

## review-adversarial.md (ADV)

| Finding | Decision | What changed / why deferred (owner) |
|---|---|---|
| ADV-M1 Terms inconsistent with the Glossary | AUTOFIX | "Nine groups" was already fixed. Package Glossary entry names the exceptions (`create-xaravel`; Contracts inside each Package); FR-10 aligned. Fragment = `@fragment` only, `<hx-partial>` described as an htmx response element; FR-39 reworded. FR-46: Oracle-generated expected values, but a Xaravel Test that isn't counted in the Conformance Rate. FR-100: delivered in Phase 0. |
| ADV-M2 Dangling refs and stale addendum text | AUTOFIX | FR-10 "as adjusted in the addendum" now names the adjustment (Contracts). §0 now says "Component-to-Package mapping" instead of "package list". DIV-3: architecture owns the declaration shape. Stale addendum text was already fixed. |
| ADV-M3 FRs on packages outside the Test Inventory have no oracle (phpdotenv, prompts, tinker, Carbon, Inflector, …) | DEFER | Architecture: an API-surface parity check (PHP signatures at the Pin vs exported `.d.ts`) and/or per-library Differential Test obligations. |
| ADV-M4 FR-106 "read-only queries" vs FR-110 opt-in | AUTOFIX (partial) | FR-106: read-only queries are available "once enabled (FR-110)". **Deferred (architecture):** how read-only is enforced (read-only transaction or role vs SQL parsing). |
| ADV-M5 FR-88 capture detection not implementable as stated | AUTOFIX (partial) | Same as RUB-DN7. |
| ADV-M6 FR-28 parses the body before `ValidatePostSize` | AUTOFIX | FR-28: the `ValidatePostSize` limit is enforced before the body is buffered and parsed. Streaming opt-out deferred (RES-G27). |
| ADV-M7 htmx behaviour changes aren't DIVs, but §5.1 says other differences are bugs | AUTOFIX | §5.1: htmx Requests are handled by the htmx Integration (FR-35, FR-40 to FR-42); non-htmx requests keep Upstream behaviour exactly. |
| ADV-M8 No precedence when several Skip Reasons apply | DEFER | Maintainer: the precedence order. It moves Test IDs in or out of Applicable Test IDs (`deferred-backend` vs `blocked-by`), so it affects the SM-1 gate. |
| ADV-M9 FRs with no Phase or a contradictory Phase | AUTOFIX (partial) | FR-73 → Phase 7 with Console. Matchers → FR-116. FR-102 (post-alpha), FR-71 (Phase 7) and FR-81 (handled by the Global `blocked-by` rule) were already fixed. **Deferred (epics):** the FR → Phase table (RUB-DU1). |
| ADV-M10 "Done" doesn't say where it is measured or what it includes | AUTOFIX (partial) | §3 Story done definition: CI passes on the Story's change, with a full (not fast-mode) run of its assigned tests and the NFR-3 lint. Fidelity Review was already included. **Deferred (Maintainer):** whether NFR-9 docs are part of done (RUB-DN10). |
| ADV-M11 FR-63 `automaticallyEagerLoadRelationships()` contradicts DIV-2 | DEFER | Architecture: define its Xaravel semantics. If that needs a new DIV, raise an Escalation to the Maintainer (FR-114). |
| ADV-M12 Who publishes releases, with what credentials; "Phase completes" undefined | AUTOFIX (partial) | FR-13: a Phase is complete when the Maintainer has accepted all its Epics and no `blocked-by` entry points at it. **Deferred (Maintainer):** whether agents may hold npm or GitHub release tokens, or only a Maintainer-triggered workflow publishes. |
| ADV-M13 Class Registry misses never-imported modules; key format undefined | DEFER | Architecture: boot-time module loading (tie to DIV-7 discovery) and the registry key format (FQCN strings stored in the DB and in payloads). |
| ADV-M14 One shared Expectations File with parallel agents | DEFER | Architecture: one file per Component, or a structured merge. FR-4 (edits only to a Story's own Test IDs) already prevents silent cross-Story reverts in CI. |
| ADV-M15 FR-78 rests on open OQ-8 | AUTOFIX | FR-78: passwords over 72 bytes hash and verify as PHP does (no runtime pre-hash), proven by Differential Tests. OQ-8 kept as the spike that confirms how. |
| ADV-L1 SM-4 and SM-5 not measurable | AUTOFIX | Same as RUB-SC5. |
| ADV-L2 "Never" claims need a stated load (FR-27, FR-55, NFR-4) | DEFER | Architecture: concurrency test load and interleaving method (with RUB-DN10). |
| ADV-L3 Bun built-ins named without a check | AUTOFIX | Same as RUB-SH3 (OQ-11 extended). |
| ADV-L4 Test counts use two units | AUTOFIX | §7.4 Size: the brief counts methods, the Test Inventory counts datasets, and sizing and SM-1 arithmetic use the inventory's unit. |

## reconcile-brief.md (BRF)

| Finding | Decision | What changed / why deferred (owner) |
|---|---|---|
| BRF-G4 [M] SM-1 "never decreases" vs pin bumps | ALREADY-FIXED | SM-1 target is per Baseline Pin, and a pin bump starts a new series. |
| BRF-G5 [M] CSP nonce hook missing | ALREADY-FIXED | FR-49 consequence. |
| BRF-G6 [M] Smaller htmx 4 must-haves | AUTOFIX (partial) | FR-37: `tag#id` and `expectsJson()` false (`Accept: text/html`). FR-38: no helpers for the removed `After-Swap`/`After-Settle` headers. OOB-after-main-swap ordering → IGNORE (client-side htmx behaviour). **Deferred (epics/docs):** guidance on htmx's 60 s default timeout for long requests. |
| BRF-G7 [M] Route model binding and method injection have no DIV | ALREADY-FIXED | DIV-3 covers both. |
| BRF-G8 [M] Boost candidate surface partly dropped | DEFER | Maintainer: whether FR-106 adds the CLI command list and an eval (tinker) tool that is off by default (FR-110 already mentions "eval tools"), and whether FR-105 adds record-rule project rules and per-Package skills. The brief lists these only as candidates. |
| BRF-G9 [M] Research open checks not in OQs | AUTOFIX | OQ-11 (added in the high pass) extended with `Bun.sql` raw bindings, `Bun.redis` completeness and the other Bun built-ins. The stale `@hono/mcp` clause was removed from OQ-11 (Hono is dropped). PHPUnit `--list-tests-xml` → architecture, as part of RES-G26. |
| BRF-G10 [M] No Risks section | ALREADY-FIXED | §7.4. The competitive threats (Adonis, Guren) were not added: positioning only. |
| BRF-G11 [M] Moat note and framing dropped | ALREADY-FIXED | First risk in §7.4. |
| BRF-G12 [M] Long-term vision and Laravel 14 criterion weakened | AUTOFIX (partial) | §1: a "Long term (2–3 years)" line from the brief. **Deferred (Maintainer):** a Laravel 14 success metric (SM-5b) and the alpha's target major (with RUB-DR3, RES-G25). |
| BRF-G13 [M] Class Registry and the `PORTING.md` pilot are not sequenced | AUTOFIX | §7.3: Phase 0 adds the `PORTING.md` pilot on Support/Collections; Phase 1 adds the Class Registry ("first Epic", per the brief). FR-8: pilot and revision before Phase 1. |
| BRF-G14 [L] Worker rebuilds closures with registry-only access | AUTOFIX | FR-88 consequence (see RUB-DN7). |
| BRF-G15 [L] Generator stubs blurred with Oracle diffs | AUTOFIX | FR-6: generator output is no longer Oracle-generated. FR-71: each generator Ported Test asserts against a reviewed TS reference file, one per Upstream stub. |
| BRF-G16 [L] Eloquent Collections not explicit | AUTOFIX (partial) | FR-62: Eloquent Collection methods, with IO methods returning Promises (DIV-1). **Deferred (architecture):** `cursor()`/`lazy()` as AsyncIterable vs `LazyCollection` (RES-G10). |
| BRF-G17 [L] PCRE, `email:spoof`, unsanitised `Bun.markdown` | AUTOFIX (partial) | FR-24: `Str.markdown` honours `html_input` / `allow_unsafe_links`, with XSS tests. **Deferred (Maintainer):** PCRE dialect and `email:spoof` as DIV candidates (RES-G21, G22). |
| BRF-G18 [L] Worktree per Story; upstream JUnit baseline | AUTOFIX | NFR-10: each Story runs in its own git worktree (brief). Upstream baseline was already fixed (`upstream-skip` confirmed by the Oracle). |
| BRF-Aside Stale PRD addendum | ALREADY-FIXED | Addendum updated in the high pass. |

## reconcile-research.md (RES)

| Finding | Decision | What changed / why deferred (owner) |
|---|---|---|
| RES-G6 [M-H] PHPUnit-compat assertion semantics undefined | AUTOFIX | FR-116 (see RUB-DN6). |
| RES-G7 [M-H] PHP value model: int/float, copy vs reference, `null`/`undefined`, BIGINT, `collection[0]`, marker interfaces (`ShouldQueue`…) | DEFER | Maintainer: a new DIV-9 "PHP value model" plus §5.1 rules. Marker interfaces are public API (FR-85, FR-91, FR-95). Architecture proposes the options. |
| RES-G8 [M-H] DIV-3 parameter-name binding | ALREADY-FIXED | Route model binding and method injection are in DIV-3. **Deferred (architecture):** carry parameter names for `make(…, params)` / `needs('$name')`; DIV-3's shape is owned by architecture. |
| RES-G9 [M] ALS scope and Bun ALS reliability | AUTOFIX (partial) | OQ-11 spike adds `AsyncLocalStorage` propagation across `await`, timers, streams and `Bun.serve` callbacks. **Deferred (architecture):** which state is per async context (query log, `DB.listen`, `afterCommit`, facade cache). Some of it is app-global in Laravel, so it shouldn't be added to NFR-4 blindly. |
| RES-G10 [M] DIV-1 API-surface consequences (async companions, `cursor` AsyncIterable, sync accessors) | DEFER | Architecture: enumerate them in DIV-1's Divergence Record (overlaps adversarial H5). |
| RES-G11 [M] Oracle can't produce generator or Blade expected values; Blade expression language | AUTOFIX (partial) | FR-6 / FR-71 as in BRF-G15. FR-48 and FR-8: PHP expressions in test inputs are translated by a mechanical rule in `PORTING.md`. **Deferred (Maintainer):** the expression language inside `{{ }}` / `@if()` (TS/JS; keep `$`-prefixed variables or not). This is App Developer API. |
| RES-G12 [M] FR-71 misses `*:table` and other stubs | AUTOFIX | Same as RUB-DN9. |
| RES-G13 [M] Job timeouts can't preempt synchronous code | DEFER | Architecture: Worker/process isolation vs cooperative timeouts, and a pcntl test-adaptation rule. If the timeouts are cooperative, that is a DIV → Maintainer. |
| RES-G14 [M] bcrypt research answers OQ-8 | AUTOFIX | FR-78 (see ADV-M15). **Deferred (architecture):** behaviour of `hashing.argon.threads`. |
| RES-G15 [M] Markdown sanitisation and parity | AUTOFIX (partial) | FR-24 options consequence. **Deferred (Maintainer):** whether Markdown HTML must match league/commonmark via the Oracle, or is a DIV. |
| RES-G16 [M] Bun-specific runtime constraints | AUTOFIX (partial) | FR-20: env-file selection (`.env.<APP_ENV>`) and precedence match Laravel; Bun's `.env` auto-load doesn't change the result. **Deferred:** pinning an exact Bun patch version in CI → architecture; the supported OS list → Maintainer. |
| RES-G17 [L-M] Redis version and Pub/Sub status | DEFER | Architecture: minimum Redis server version (Bun.redis needs 7.2+) and Pub/Sub status. The "required backend down fails CI" part is already fixed in FR-9. |
| RES-G18 [M] htmx response layer: Vary, `expectsJson`, removed headers, `@htmx` directive, `hx-delete` | AUTOFIX (partial) | FR-42: `Vary: HX-Request, HX-Request-Type`. FR-37: `expectsJson()` false. FR-38: no helpers for removed headers. CSP nonce was already fixed (FR-49). **Deferred (epics):** an `@htmx` config directive and Skeleton/docs guidance for `hx-delete` forms. |
| RES-G19 [M] `PreventRequestForgery` missing; `QUERY` CSRF classification | AUTOFIX (partial) | FR-31 lists `PreventRequestForgery`. **Deferred (architecture):** follow Upstream's classification of `QUERY` at the Pin; if Upstream has none, escalate (FR-114). |
| RES-G20 [M] Parity scope for Symfony/Carbon/Monolog surfaces Laravel exposes | DEFER | Maintainer: whether §5.1 parity extends to these surfaces "as far as Upstream tests and docs use them". Decide together with OQ-3. |
| RES-G21 [M] No regex dialect for user patterns | DEFER | Maintainer: PCRE subset translation vs a DIV, and the error for unsupported constructs. |
| RES-G22 [L-M] `email:spoof`; `email:dns` needs a network tag | DEFER | Maintainer: approximate `email:spoof` or make it a DIV. Architecture: a `network` backend tag and how it interacts with Backend Variants and SM-1. |
| RES-G23 [M] Closure serialization is broader than DIV-4 says | AUTOFIX (partial) | DIV-4 covers every closure-serializing API, including `Bus.chain`/`Bus.batch` callbacks and `Concurrency.run`. **Deferred (architecture):** `route:cache` with closure routes (reject or exclude). |
| RES-G24 [M] Typed model fields shadow Proxy attribute access | DEFER | Architecture: detect at boot, and `make:model` emits `declare` fields. This depends on the model implementation chosen. |
| RES-G25 [M] Laravel 14 likely ships before the alpha | DEFER | Maintainer (with RUB-DR3): the alpha's target major, and whether FR-7 may cross a major. |
| RES-G26 [L-M] How inventory data is produced; planning tags | AUTOFIX (partial) | FR-1: `#[TestWith]` datasets counted. **Deferred (architecture):** dataset IDs from the Oracle's PHPUnit run, cross-checked with an AST pass, plus feature tags (overlaps adversarial H10). |
| RES-G27 [L] Body capture has no limit and no streaming opt-out | AUTOFIX (partial) | FR-28 limit (see ADV-M6). **Deferred (architecture):** per-route streaming-body opt-out. |
| RES-G28 [L] Small idioms (real-time facades, dynamic finders, `Uri` normalisation, ParallelTesting, Faker names) | DEFER | Architecture: one line each in `PORTING.md` or a Divergence Record. A new DIV goes through FR-114 to the Maintainer. |
| RES-G29 [L] Dashboard enabled-set rate; smoke apps | ALREADY-FIXED | FR-5 shows the SM-1 Applicable figure next to the full rate. **Deferred (epics):** optional CI smoke apps from Phase 8. |
| RES-Note `laravel/ai`, `mcp`, `boost` unsized | DEFER | Epics: a short research spike before Phase 8 planning. |
| RES-Covered NFR-7 misses `Sleep`/`Once`/`Lottery` resets | AUTOFIX | NFR-7 list extended. |

## Note for the parent: HIGH items that still look unaddressed

These are outside this triage (they are HIGH), but no matching text was found in `prd.md`:

- **ADV-H4:** PHP loose comparison ported vs `php-only` (DIV-6 scope), and by-reference / exception-class mapping in `PORTING.md`.
- **ADV-H5:** DIV-1 doesn't enumerate the async surface (session reads, `array` cache, Collection callbacks).
- **ADV-H6:** adapted Ported Tests aren't marked (`adapted:<DIV-N>`); snapshot first-write sign-off.
- **ADV-H9:** partly addressed here (FR-7 now defines "changed"). Still open: resetting a changed ID's status, and freezing at a Phase boundary.
- **ADV-H10:** inventory checked against the Oracle's PHPUnit list; a test-directory → Component mapping table.
