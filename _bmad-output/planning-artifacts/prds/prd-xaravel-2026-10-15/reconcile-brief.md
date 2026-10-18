# Reconciliation: Brief → PRD (Xaravel)

- **Inputs:** `briefs/brief-xaravel-2026-10-15/brief.md`, `addendum.md`, `.memlog.md`
- **Target:** `prds/prd-xaravel-2026-10-15/prd.md`, `addendum.md`, with the PRD `.memlog.md` decisions taking precedence
- **Date:** 2026-10-15
- **Excluded as intentionally superseded:** Hono (dropped; FR-27 forbids third-party HTTP frameworks), `@hono/mcp`, hono/jsx as a second engine (the confirmed decision is Blade-only), post-alpha major-mirroring as a firm policy (PRD memlog: "post-alpha release policy decided later" → OQ-2), Auth+Queue moved into the alpha (PRD memlog).

Severity: **H** = contradiction or a gap that will mislead unattended agents or break a gate; **M** = meaningful content dropped or weakened; **L** = minor or nice-to-have.

---

## Gaps

### G-1 [H] Boost and MCP are in the alpha gate but sequenced after it
- **Source:** brief.md "What Makes This Different" #3 ("The agents building Xaravel use it first"); brief addendum "AI layer" ("Strategic: the same tool serves the agents building Xaravel and the agents building apps on it").
- **Issue:** §7.2 requires Boost FR-105–107 and FR-110 at the alpha. But Boost is built on MCP (FR-104), and §7.3 puts AI, MCP and "Boost (full)" in Phase 9, which §7.2 lists as post-alpha. FR-109 (framework mode, the "agents building Xaravel use it first" piece) is in no phase and not in the alpha. SM-2 also claims FR-109 validates it from Phase 2. The brief's "first" ordering is lost.
- **PRD location:** §7.2, §7.3 (Phase 0 / Phase 9), FR-109, SM-2.
- **Fix:** Add a "Boost (framework mode) + minimal MCP server" item to Phase 0 or 1 so Framework Agents use it from the start. Move the app-introspection Boost and MCP core into a pre-alpha Phase, or take FR-105–107 out of the alpha gate.

### G-2 [H] The 90% alpha gate conflicts with integration tests being locked until Phase 9
- **Source:** brief addendum "Structural prerequisites" ("Testbench equivalent gates all 2,809 integration tests → unit tests first, integration unlock after Foundation + Testbench"); "Design notes → Testbench is not a test runner" ("built during Phase 9, with a minimal version earlier if integration tests are pulled forward").
- **Issue:** SM-1 requires ≥90% of Phase 1–8 Test IDs *passing* at the alpha. The Testbench, Foundation (full), the Testing toolkit and the "integration-test unlock" are all Phase 9, which is post-alpha. Integration tests are about 21% of all methods and concentrated in the Phase 1–8 Components (Database, Queue, Http and others), so 90% passing can't be reached. The brief's "minimal Testbench earlier" fallback is dropped.
- **PRD location:** SM-1, §7.2, §7.3, FR-101.
- **Fix:** Add a minimal Testbench (FR-101 subset) to Phase 0 or the first Phase that needs it, or restate SM-1 as "≥90% of Phase 1–8 *unit* Test IDs pass; integration Test IDs pass or are `blocked-by:testbench`".

### G-3 [H] The dogfood app reaches production at the alpha without the app Testing toolkit
- **Source:** brief.md "Success Criteria → Dogfooding" ("as the first milestone after the HTTP and Blade phases"); brief memlog line 43 (confirmed "first-app milestone after HTTP+Blade phases").
- **Issue:** (a) The brief's intermediate milestone, the first real app after Phases 6–7, is gone. SM-3 only checks the app at the alpha. The PRD memlog moved Auth and Queue into the alpha but didn't drop the earlier milestone. (b) HTTP tests, database testing and fakes (FR-96–99) are in Phase 9, post-alpha. FR-60 also requires "the Skeleton's test suite passes against both SQLite and Postgres", so the alpha Skeleton and the dogfood app have no supported way to test themselves.
- **PRD location:** SM-3, §7.2, §7.3 Phase 9, FR-60.
- **Fix:** Add SM-3a "first htmx app runs on Xaravel (dev) after Phase 7", or record in the memlog that the milestone is superseded. Move FR-96/98/99 (or a core subset) into the pre-alpha Phases.

### G-4 [M] SM-1 "never decreases at a Phase boundary" conflicts with pin bumps that happen at Phase boundaries
- **Source:** brief.md "Success Criteria → Conformance rate" ("It only moves forward"); "Versioning" (pin moves at each phase boundary).
- **Issue:** FR-7 adds new Test IDs to the denominator at exactly the moment SM-1 is measured. So the rate can drop at a boundary through no regression. The brief's "only moves forward" is also weaker in the PRD, which checks only at boundaries.
- **PRD location:** SM-1, FR-7.
- **Fix:** Measure SM-1 before the bump and on the same pin ("passing count never decreases; rate never decreases on a fixed Baseline Pin"). Show the bump delta separately on the dashboard.

### G-5 [M] htmx 4 must-have missing: CSP nonce hook
- **Source:** brief addendum "htmx 4 must-haves" ("CSRF in `hx-headers` must be `:inherited`; CSP nonce hook; history navigation re-fetches full page").
- **Issue:** FR-32 covers the inherited CSRF and FR-42 covers history restore. Nothing covers a CSP nonce (htmx 4 inline-script and indicator styles, `@vite` nonce, which Laravel's `Vite::useCspNonce()` provides).
- **PRD location:** §4.7 (new FR or a consequence of FR-17/FR-49).
- **Fix:** Add an FR: "A per-request CSP nonce is available (`csp_nonce()` / `Vite.useCspNonce()`), applied to `@vite` tags and the htmx config meta, and htmx 4 works under a strict CSP."

### G-6 [M] Smaller htmx 4 must-haves are dropped or unstated
- **Source:** brief addendum "htmx 4 must-haves".
- **Issue:** Missing items:
  - `Accept: text/html` handling, needed for `expectsJson()` and error rendering to tell htmx Requests apart.
  - The `HX-Target` `tag#id` format.
  - The removal of the `After-Swap`/`After-Settle` triggers, so agents shouldn't add helpers for them.
  - OOB/partial swaps applying after the main swap.
  - The 60 s default client timeout, which matters for streaming and long requests.
- **PRD location:** FR-37, FR-38, FR-39, FR-43.
- **Fix:** Add one consequence each. For example, FR-38: "No helpers for the removed `HX-Trigger-After-Swap/Settle` headers." FR-37: "`target()` parses `tag#id`." FR-35: "htmx Requests (`Accept: text/html`) never get JSON errors."

### G-7 [M] Implicit route model binding and controller method injection rely on reflection, and no DIV covers them
- **Source:** brief addendum "Structural prerequisites" ("Test-adaptation policy needed where tests assert … PHP reflection (container autowiring, implicit route binding, listener discovery, casts)").
- **Issue:** DIV-3 covers constructor autowiring and DIV-7 covers listener discovery. FR-30 promises "implicit … route model binding", which Laravel resolves from controller *parameter type hints*. TypeScript erases those hints. Controller method injection (`index(Request $r, User $u)`) has the same problem. No DIV or mechanism is stated.
- **PRD location:** FR-30, §5.2 (extend DIV-3 or add DIV-9).
- **Fix:** Extend DIV-3 to cover method and route-parameter injection, for example a per-method `static inject` map or a route-level `.bind('user', User)`, with a test-adaptation rule for the Routing tests.

### G-8 [M] The Boost candidate surface is partly dropped
- **Source:** brief addendum "'Xaravel Boost' candidate surface"; laravel/boost row (tinker off by default, record rule, package hook).
- **Issue:** FR-106 omits the CLI command list, the eval REPL tool (FR-110 mentions "eval tools", but no FR defines one), record-rule/project rules (`.ai/rules/`), and per-module skills. FR-105 also says only "agent skills".
- **PRD location:** FR-105, FR-106, FR-110.
- **Fix:** Add to FR-106: "artisan command list; eval (tinker) tool, off by default." Add to FR-105: "record-rule writes project rules; per-Package skills ship with each Package."

### G-9 [M] Open checks from the research aren't carried into the Open Questions
- **Source:** brief addendum "AI layer" ("Open checks: Bun stdio-transport edge cases (spike); MCP SDK v1 vs v2"); "Test-porting pipeline" ("Unverified: Bun `test.failing` / `test.skipIf` / `setSystemTime`, Bun Redis completeness, Bun.SQL raw bindings, PHPUnit `--list-tests-xml` on 12/13").
- **Issue:** None of these appear in §9. Several sit on the critical path for Phase 0: the Ratchet needs `test.failing` for `fail-known`, FR-1's inventory needs `--list-tests-xml` or php-parser, the test clock needs `setSystemTime`, and FR-104's stdio needs the transport spike. The MCP SDK v1/v2 choice is still open after `@hono/mcp` was dropped.
- **PRD location:** §9.
- **Fix:** Add OQ-11 "Bun test-runner primitives for the Ratchet (Phase 0 spike)", OQ-12 "MCP TS SDK v1 vs v2 and Bun stdio edge cases", and OQ-13 "Bun.SQL raw bindings / Redis completeness".

### G-10 [M] There is no Risks section, so the brief's risks are silently dropped
- **Source:** brief.md "Risks and Unknowns" (size: 275k src / 296k test lines; "the last few percent of conformance takes the longest"; the hard parts: AsyncLocalStorage transaction state, PHP-array semantics, Symfony console, Carbon); brief addendum "Positioning gap" threats (Adonis adding Bun support; Guren adding an htmx mode).
- **Issue:** The PRD turns some risks into FRs (FR-23, FR-55, FR-25), but it has no risk register. The long-tail risk bears directly on the 90% alpha gate. The brief addendum's "prototype ALS transaction state in the first DB epic" sequencing note is also lost.
- **PRD location:** a new §8.5 "Risks" or a section after §9.
- **Fix:** Add a short Risks list: long-tail conformance vs the 90% gate, ALS transaction scoping (prototype in the first Phase 4 Epic), PHP-array semantics, console/Carbon rewrites, and the competitive threats.

### G-11 [M] The honest note about the moat, the problem framing and "why now" are dropped
- **Source:** brief.md "Honest note: the moat is execution and verifiability, not technology. Nobody has done the slow work of passing Laravel's suite."; "The Problem" ("Laravel-*inspired*, not Laravel"; smaller clones "stall" without a way to prove they match); Executive Summary "Why now".
- **Issue:** The PRD Vision keeps "it's Laravel, measured", but drops the candid statement about the moat and the contrast with the alternatives. These shape README/docs tone (NFR-9) and justify SM-C1, which forbids gaming the rate. The PRD says it "does not repeat the brief", but this framing is a positioning commitment for the public launch.
- **PRD location:** §1 Vision (one paragraph) or §2.
- **Fix:** Add two sentences to §1: "The moat is execution and verifiability, not technology. Alternatives such as AdonisJS and Guren are Laravel-inspired, and clones without a conformance proof stall."

### G-12 [M] The long-term vision and Laravel 14 success criterion are weakened
- **Source:** brief.md "Vision" (2–3 years; "tracks Laravel releases within weeks"; "describe an htmx app and have it scaffolded, tested and running on Bun, the Laravel way"); "Success Criteria → Currency" ("ships Xaravel 14 after Laravel 14").
- **Issue:** The PRD Vision has no time horizon, no "within weeks" release tracking, and no describe-to-running-app aspiration. SM-5 covers 13.x pin currency only. No metric covers shipping Xaravel 14. "Within weeks" also conflicts with pin bumps happening only at Phase boundaries, which may be months apart.
- **PRD location:** §1, SM-5, §5.3.
- **Fix:** Add a "Long-term (2–3 yr)" line to §1. Add SM-5b: "a Laravel 14 re-sync Epic is opened within N weeks of the Laravel 14 release." Note that "within weeks" applies after the port is complete.

### G-13 [M] The Class Registry and pilot are not sequenced
- **Source:** brief addendum "Top semantic gaps" ("Class-name string identity … Class registry in Epic 1"); brief.md "How It Gets Built" ("Write `PORTING.md` … and pilot on Support").
- **Issue:** FR-22 exists, but §7.3 doesn't place the Class Registry in any Phase. Phase 0 lists PORTING.md but not the pilot. SM-2 treats Phases 0–1 as calibration, but the brief's pilot was on Support, which is Phase 2.
- **PRD location:** §7.3 Phase 0, FR-8.
- **Fix:** Add "Class Registry" and "PORTING.md pilot (a sample of Support/Collections tests)" to the Phase 0 list. Add an FR-8 consequence: "PORTING.md revised after the pilot, before Phase 1 fan-out."

### G-14 [L] Closure model detail dropped: the worker rebuilds closures with module-registry access only
- **Source:** brief addendum "Design notes → Serialized closures" ("the worker rebuilds the function with access to the app's module registry only"; "Captured-scope closures: unsupported; fail fast").
- **Issue:** FR-88 covers the signature and fail-fast. It doesn't state what the rebuilt function can reach. That is a security and semantics boundary, because the worker evaluates source from the payload.
- **PRD location:** FR-88 / DIV-4.
- **Fix:** Add the consequence "A rebuilt closure can reach only its arguments and the app's module registry, with no ambient globals or imports."

### G-15 [L] The generator-stub test method is blurred with Oracle diffs
- **Source:** brief addendum "Design notes → Blade compiler tests" ("88 `make:*` generator stubs: the expected file is the TS equivalent, reviewed once and snapshotted").
- **Issue:** FR-6 lists "generator output reference files" among the *Oracle* Differential Tests. The Oracle emits PHP, so it can't produce TS generator output. The brief's method was a human-reviewed TS snapshot.
- **PRD location:** FR-6, FR-71, DIV-5.
- **Fix:** Remove generators from FR-6. Add to FR-71: "Each `make:*` Ported Test asserts against a reviewed TS reference file (snapshot), one per Upstream stub."

### G-16 [L] Eloquent Collections from the wish list aren't explicit
- **Source:** brief addendum "Desired feature surface → Eloquent-style ORM: … Collections".
- **Issue:** FR-23 is the Support `Collection`. The Eloquent `Collection` methods (`load`, `loadMissing`, `modelKeys`, `fresh`, `find`, `toQuery`, …), which are async in Xaravel, aren't mentioned. The brief addendum also says `cursor()` is an `AsyncIterable`, and the PRD doesn't say how that fits with the sync `LazyCollection`.
- **PRD location:** §4.11 (new FR-68a or a consequence of FR-62).
- **Fix:** Add "Eloquent Collections: Laravel's model-collection methods. IO methods return Promises. `cursor()`/`lazy()` return `AsyncIterable`-backed lazy collections."

### G-17 [L] Smaller semantic and dependency caveats from the research are dropped
- **Source:** brief addendum "Top semantic gaps" (strings/regex: bytes vs UTF-16, PCRE-only features); "Dependency replacement map" (email validation: "no JS spoof-check equivalent"; `Bun.markdown` "unstable, unsanitised").
- **Issue:** These are likely Intentional Divergences or security notes. FR-50 promises "every rule", including `email:spoof`. FR-89 Markdown mail could hit unsanitised `Bun.markdown`.
- **PRD location:** §5.2 (DIV-6 scope), FR-50, FR-89, NFR-5.
- **Fix:** Name PCRE-only regex and `email:spoof` as DIV-6 candidates. Add to NFR-5: "Markdown rendering is sanitised."

### G-18 [L] Build-process specifics are dropped
- **Source:** brief.md "How It Gets Built → Parallelism" ("one git worktree per story. `bmad-build-auto` runs the loop"); brief addendum "Test-porting pipeline" step 1 ("run real PHPUnit across the DB matrix → JUnit baseline").
- **Issue:** NFR-10 states unattended operability but not the worktree-per-Story isolation. FR-1 inventories tests but doesn't capture which tests pass or skip *upstream* on PHP. Tests that skip upstream shouldn't count against the Conformance Rate.
- **PRD location:** NFR-10, FR-1.
- **Fix:** Add to NFR-10: "each Story runs in its own git worktree." Add to FR-1: "the inventory records each Test ID's upstream PHP result (JUnit baseline) at the Baseline Pin."

### Aside: the PRD addendum is stale against the PRD memlog (not a brief gap)
- PRD `addendum.md` "API mapping examples", last row: "CLI name pending OQ-1". The CLI is confirmed (`bun artisan`), and OQ-1 is now the optional blessing.
- PRD `addendum.md` "Phase-gate note" still asks whether to pull Auth forward. This was decided: Auth and Queue are in the alpha (PRD memlog, line 19).
- **Fix:** Delete the Phase-gate note. Change the row note to "confirmed (§3 CLI)".

---

## Covered well

- **"It's Laravel" and the user's quote:** the §1 Vision and §2.1 JTBD quote Ed verbatim. UJ-1 "generated files read like Laravel", and the §5.1 parity rule ("any other difference is a bug").
- **The conformance system:** Test Inventory, Test IDs, Expectations File, Ratchet (unexpected passes and failures), the fixed Skip Reason vocabulary, the full-inventory denominator, the dashboard, and the Oracle Differential Tests (FR-1–9). It is more rigorous than the brief.
- **Brief design notes:** the Testbench definition (glossary, FR-101), closures (FR-88, DIV-4), the Blade rendered-HTML test approach (FR-48, DIV-5), and the version pin policy (FR-7, §5.3).
- **"Sync core, async edges" and Strict Loading:** DIV-1, DIV-2, FR-54, FR-63, FR-65 (sequential awaited callbacks) and NFR-3 (floating-promise lint).
- **htmx 4 core:** request and response headers (FR-37/38), 422 Fragments (FR-40), `<hx-partial>`/OOB (FR-39), streaming (FR-43), `QUERY` (FR-30, OQ-7), inherited CSRF (FR-32), and history-restore full pages (FR-42). FR-41 HX-Location redirects go further than the brief.
- **Database:** SQLite in dev and Postgres in prod with the same `.env` keys (FR-53, FR-60, UJ-3). All five grammars are ported, with the other drivers later (FR-54).
- **Wish list:** every Basics, Digging Deeper, Security, Database, Testing and AI item maps to an FR. Eloquent is covered except Collections (G-16).
- **Scope:** MongoDB and non-htmx front ends are explicit non-goals, "full scope, sequenced, not cut" is kept (§7.1), and the nine Phases match the brief.
- **Brief open questions parked for the PRD:** Symfony suites (OQ-3), Temporal (OQ-4), and htmx npm pinning (OQ-5). The brief's open checks `QUERY` (OQ-7) and bcrypt (OQ-8) are also carried.
- **Licence:** MIT with Laravel credited (NFR-8). Trademark handling goes beyond the brief.
- **Build-ourselves list:** Mockery (FR-100, Phase 0), the PHPUnit matchers (Phase 0), the console core (FR-69/70), Carbon (FR-25), and the HTTP foundation and router (FR-27–31).
