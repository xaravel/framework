---
title: "Adversarial review: PRD Xaravel"
reviewed: prd.md, addendum.md (2026-10-15)
stance: hostile literal-minded build agent + skeptical staff engineer
---

# Adversarial Review: PRD Xaravel

## Verdict

The conformance idea is sound: a full-upstream denominator, a Ratchet, and a fixed Skip Reason list. As written, though, the PRD is **not safe to hand to unattended agents.** There are three problems:

1. **The acceptance rule can be gamed.** Any Skip Reason except `not-ported-yet` counts as "done", and nothing checks it.
2. **The verifier is not protected.** No rule controls who may change the Expectations File, the harness, the matchers, Mockery or the Oracle fixtures.
3. **The Phase plan contradicts the alpha gate.** Foundation, Testing, Testbench, MCP and Boost all sit in Phase 9, after the alpha, yet earlier Phases and the alpha depend on them.

Fix these before running architecture or epics.

**Counts:** 7 critical, 13 high, 15 medium, 4 low.

---

## Critical

### C1. Foundation sits in Phase 9 (post-alpha), but Phases 6–7 and the alpha need it

§7.3 puts "Foundation (full)" and "Testing" in Phase 9, and §7.2 puts Phase 9 "After the alpha". But much of what Phases 6–8 and the alpha deliver lives in Upstream `src/Illuminate/Foundation` or `src/Illuminate/Testing`:

- FR-18 `bootstrap/app.ts` `withRouting`/`withMiddleware`/`withExceptions` (Foundation `ApplicationBuilder`).
- FR-27 `bun artisan serve` (Foundation `ServeCommand`).
- FR-31 `TrimStrings`, `ConvertEmptyStringsToNull`, `ValidatePostSize`, `PreventRequestsDuringMaintenance` (Foundation HTTP middleware).
- FR-32 CSRF (`VerifyCsrfToken` / `PreventRequestForgery` is Foundation).
- FR-35 the exception handler.
- FR-51 `FormRequest` (Foundation\Http), which UJ-2 needs.
- FR-71 `make:*` generators. The brief addendum says Foundation 1,152 "incl. generators", and UJ-1 step 3 (`make:model Invoice -mfc`) is the alpha's headline journey.
- FR-20/30/47 `config:cache`, `route:cache`, `view:cache`.
- FR-96–99 TestResponse, `RefreshDatabase`, fakes. FR-60 needs these, because it requires "The Skeleton's test suite passes against both SQLite and Postgres in CI" at alpha.

"Foundation (full)" implies that a partial Foundation comes earlier, but the PRD never says which parts. An agent on the Phase 6 HTTP Epic must either build Foundation pieces outside its Epic (scope creep, with no Test IDs assigned) or mark them `blocked-by:foundation` and ship an HTTP layer with no kernel. The Phase 7 Skeleton cannot exist without an Application.

**Fix:** split Foundation into named slices, each assigned to a Phase (for example: Foundation/Application+Configuration → Phase 2/6; Foundation/Http middleware+FormRequest → Phase 6; Foundation/Console+generators → Phase 7; Foundation/Testing → Phase 6–7). Do the same for Testing. Map every FR to exactly one Phase in a table.

### C2. The SM-1 alpha gate (90% pass) is likely unreachable with Testbench in Phase 9, and that creates pressure to mislabel

- SM-1 alpha gate: "at least 90% of Test IDs in Phase 1–8 Components pass".
- The brief addendum: "Testbench equivalent gates all 2,809 integration tests → … integration unlock after Foundation + Testbench". §7.2 and §7.3 place Testbench and the "integration-test unlock" in Phase 9, post-alpha.
- From the brief's method counts, Phase 1–8 Components hold 11,961 of the 13,544 methods. Phase 9 holds Foundation 1,152 + Testing 431 = 1,583.
- If more than about 1,200 of the Phase 1–8 methods are integration tests, the cap is below 90% even before backends and DIV skips. That is likely, given Database (3,703), Queue, Http and Routing integration suites and "267+ upstream integration files" on Testbench.
- An agent facing an unreachable gate has one lever: reclassify. It can relabel an integration test as a unit test, or rewrite it so it doesn't boot Testbench. Both are SM-C1 violations that nothing mechanical catches.

**Fix:** move a minimal Testbench (FR-101 consequences) to Phase 2–4, as the brief already allows ("minimal version earlier if integration tests are pulled forward"). Or state the gate as unit and integration rates separately, with a computed reachable ceiling. Also count the gate in Test IDs (datasets), not methods (see L4).

### C3. "Done" is vacuous wherever there are no Test IDs

The Story definition (§3) is: "done when all of its assigned Test IDs pass, or carry a Skip Reason other than `not-ported-yet`." The Global rule (§4) covers only Upstream Components. Many Components and FRs have **zero** Test IDs:

- The whole Conformance System (FR-1–9).
- The Installer and Skeleton (FR-15–17).
- htmx (FR-37–43).
- Mockery (FR-100) and Testbench (FR-101).
- Boost (FR-105–110, apart from the ported `laravel/boost` tests "where they apply").
- Tinker (FR-73), browser tests (FR-102) and the PHPUnit-style matchers.

A literal agent's Story for "FR-42 Full page versus partial rendering" has an empty Test ID list, so it is done on creation. Xaravel Tests have no Expectations File entry, no tracking, no required coverage per FR, and the same agent writes the tests and the code. Several of these FRs have no "Consequences (testable)" at all: FR-42, FR-43, FR-73, FR-106, FR-108 and FR-109.

**Fix:** add an FR that every Xaravel-Component FR has acceptance tests. They are written against the FR's consequences, labelled `XT-<FR>-<n>`, tracked in the Expectations File with the same Ratchet, and drafted in a Story that comes *before* the implementation Story (or by a separate agent). Redefine Story done as "all assigned Test IDs **and** assigned XT IDs pass …". Add consequences to every FR that has none.

### C4. Any Skip Reason except `not-ported-yet` satisfies acceptance, and only one of them is validated

FR-3 checks only that a Skip Reason is in the vocabulary, and that `intentional-divergence:<DIV-N>` points to an existing record. Each remaining reason is a free pass:

- **`blocked-by:<component>`.** Nothing checks that `<component>` exists, is a real dependency of the test, is not yet accepted, or sits in the same or a later Phase. An agent can write `blocked-by:support` on a Collections test it can't make pass.
- **`php-only`.** It needs no record and no justification. DIV-6 covers "PHP's type juggling", which can describe almost any loose-comparison test (see H4).
- **`out-of-scope:<non-goal>`.** No non-goal vocabulary exists. §7.1 is prose, and one of its items is "Cutting scope to a minimal v1." An agent can invent `out-of-scope:legacy-api`.
- **`backend-unavailable:<backend>`.** See H7.

Meanwhile SM-C1 says "Don't raise SM-1 by skipping tests". That is a counter-metric with no enforcement. The Glossary says Epic acceptance is the Maintainer's job, but an Epic like Database with 3,703+ IDs cannot be reviewed one ID at a time.

**Fix:**
- Make every non-`not-ported-yet` skip carry a machine-checked justification. `blocked-by` must name a Package that is not yet accepted and that appears in the test's import graph or in the Component dependency map. `php-only` must cite an entry in a closed `php-only` catalogue inside the DIV-6 record. `out-of-scope` must name an enumerated `NG-n` ID.
- Cap the share of new skips in each Story (for example, >5% of the Story's IDs or >N in absolute terms flags the Story for Maintainer review). Show skips added per Epic on the UJ-5 dashboard.

### C5. The verifier and the Expectations File have no rules on who may change them

- FR-4: "Changes to the Expectations File appear in the change under review." Every file in a git diff "appears", so this consequence holds trivially.
- The Glossary calls the file "machine-maintained", but UJ-4 step 3 has the implementing agent update it. So the agent being graded edits its own grade sheet.
- The same agent can move a passing Test ID that belongs to an *already accepted* Epic to `fail-known` or `blocked-by:x` in the same PR. The Ratchet stays green.
- No paths are protected from Framework Agents:
  - the Test Inventory generator and its output
  - the harness and the Ratchet CI config
  - `conformance/upstream/` (the addendum calls it "read-only", but nothing enforces it)
  - the Oracle fixtures
  - the PHPUnit-style matchers and `@xaravel/mockery`
  - lint config (NFR-3)
  - `PORTING.md` and the Divergence Records (`decisions/`)
  - the sprint queue and Story→Test ID mapping
- The "two adversarial reviewers" (UJ-4) and "the adversarial fidelity review" (SM-C1) are the main anti-gaming control, and **no FR defines them**: what they check, their inputs, whether they block, or what happens when they disagree.

**Fix:** add FRs for each of these.
- **Expectations transition rules.** `not-ported-yet`→anything and `fail-known`→`pass` are allowed. Any `pass`→non-pass change, and any change to a Test ID owned by another Epic, needs a Maintainer-approval label, and CI fails without it.
- **Protected paths.** A CODEOWNERS-style list. CI rejects Story PRs that touch them.
- **Fidelity review.** Its inputs (the upstream test source next to the Ported Test), its checklist (assertion parity, no removed assertions, no widened matchers, no mocks of the unit under test), and that it blocks.
- **Ownership of new DIV-N.** Only the Maintainer may add one, and an agent that needs one must stop (C7).

### C6. Test fidelity and verifier integrity cannot be checked mechanically

- **FR-2 checks only the label.** A Ported Test containing `expect(true).toBe(true)` with the right Test ID passes FR-2, the Ratchet and the Conformance Rate.
- **Mockery and the matchers are the verifier.** `@xaravel/mockery` and the PHPUnit-style matchers (Phase 0) are used by 226+ upstream test files. Suppose Mockery doesn't enforce `once()` or `with()`, or `toPhpEqual` is too lenient. Then thousands of Ported Tests pass without testing anything.
- **FR-100 has one consequence** ("Unmet expectations fail the test when it finishes"). The matchers have no FR at all.
- **The brief cites the lesson and the PRD drops it.** The brief's own prior art says "the verifier must be near-perfect" (Carlini).

**Fix:**
- Require mechanical fidelity checks in CI. The assertion count of each Ported Test must be ≥ the upstream assertion count, or carry a DIV-referenced annotation. Also run a mutation-testing sample per Epic, as a check that tests catch broken behaviour.
- Give Mockery and the matchers their own conformance spec in Phase 0: either port `mockery/mockery`'s own tests, or write a negative-test suite proving that each matcher and expectation *fails* when it should.
- Make these protected paths (C5).

### C7. There is no escalation or stop protocol, and NFR-10 claims none is needed

NFR-10 says "nothing needs a human except Epic review". But the PRD contains decisions that only a human can make, and gives the agent no way to raise them:

- **Open Questions that block FRs:**
  - OQ-4 (Temporal) blocks FR-25 "before Phase 2", with no owner and no Phase 0 deliverable.
  - OQ-5 blocks FR-17.
  - OQ-7 (`QUERY` verb) blocks FR-30's only consequence.
  - OQ-8 blocks the FR-78 consequence.
  - OQ-9 (Oracle hosting) blocks FR-6, which is Phase 0 and is needed by Phase 1 (FR-23 "matches the Oracle").
- **Situations with no Skip Reason or rule:**
  - An upstream test is wrong.
  - An upstream test is flaky, or depends on time, timezone, locale or filesystem. NFR-7 demands determinism.
  - Upstream itself skips the test (`markTestSkipped`, `#[RequiresPhpExtension]`).
  - A test needs a new Intentional Divergence.
  - A Story needs edits to another Epic's Component.
  - An agent has failed N times.

Without rules, an agent picks the nearest Skip Reason (`php-only`, `blocked-by`) or quietly weakens the test.

**Fix:**
- Add an FR "Agent stop conditions". It lists the triggers (new DIV needed, upstream test believed wrong, flaky after K reruns, cross-Component edit, unresolved OQ, retry budget exhausted) and a `needs-maintainer:<reason>` Story state that parks the Story without counting it as done.
- Add the Skip Reasons `upstream-skipped` and `upstream-defect:<issue-link>`. `upstream-defect` needs Maintainer approval.
- Resolve, or give an owner and a Phase-0 spike Story to, OQ-4, OQ-7, OQ-8 and OQ-9.

---

## High

### H1. Epic slices conflict with the Global rule

- §3 Epic: "one Component, or one slice of a large Component".
- §4 Global rule: "*every Test ID of that Component* is passing, or carries a Skip Reason other than `not-ported-yet`, before its Epic is accepted."
- So a slice Epic ("Eloquent relationships", "Support (core)") can be accepted only if every other Test ID in the Component also carries a non-`not-ported-yet` reason. The only way to get there is to mislabel the rest of the Component (for example, `blocked-by:database` on its own Component).
- §7.3 Phase 4 says "grammars, then Eloquent, then Migrations", which is sequential inside a Phase. That contradicts "Components within a Phase run in parallel" and the "slice" model.

**Fix:** define the slice as the unit, with an explicit set of Test IDs. Have FR-1 tag each entry with its slice, and apply the Global rule per slice.

### H2. The htmx Integration (Phase 6) depends on Blade (Phase 7)

- FR-39 Fragment responses, FR-40 "re-renders the current form Fragment", FR-35 "HTML error Fragment" and FR-42 partial rendering all need View/Blade and `@fragment` (FR-44), which are Phase 7.
- FR-32's `@csrf` and FR-17's base layout need Blade too.
- htmx is a Xaravel Component without Test IDs (C3), so `blocked-by` doesn't even apply. The agent will either build a mini-renderer or stub it.

**Fix:** move the Fragment-dependent htmx FRs (FR-35 htmx path, FR-39, FR-40, FR-42) to Phase 7, or split the htmx Component into htmx-core (Phase 6: FR-37, FR-38, FR-41) and htmx-view (Phase 7).

### H3. Boost and MCP are in the alpha scope and in post-alpha Phase 9 at the same time

- §7.2 alpha requires "Boost's app introspection and test-run tools (FR-105 to FR-107, FR-110)".
- §7.2 "After the alpha" and §7.3 Phase 9 list "MCP, and Boost in full".
- §4.19 says Boost "is built on FR-104" (MCP, Phase 9). FR-107 depends on the Testing toolkit (Phase 9).
- SM-2 says it "Validates … FR-109" from Phase 2 onwards, but FR-109 (Boost framework mode) cannot exist before Phase 9.
- UJ-6 is an alpha-era journey that needs Boost.

**Fix:** name a "Boost (alpha)" slice and a minimal MCP slice, and put them in Phase 7–8. Or drop Boost from the alpha. Remove FR-109 from SM-2, or build FR-109 in Phase 0.

### H4. DIV-6 "type juggling" overlaps FR-23 PHP semantics, and there is no path to a new DIV

- DIV-6 marks "Behaviour tied to … PHP's type juggling" as `php-only`.
- FR-23 requires PHP array semantics and Oracle-matching list/assoc behaviour.
- Laravel Collections (`where`, `contains`, `search`, `unique` non-strict), Arr and Validation (numeric strings) rely on loose comparison throughout. Is `collect([1]).contains('1')` true (ported) or `php-only` (skipped)? A Phase 1 agent decides on its own, and the easy choice is to skip.
- §5.1: "Any other difference is a bug." That leaves no route for real TypeScript limits that aren't DIVs: by-reference parameters (`Arr::set(&$array)`, `preg_match`-style outputs), PHP array value-copy semantics, `__get`/`__call` magic, `static` late binding, PHP exception classes (`InvalidArgumentException`, `TypeError` messages) asserted by tests.
- The agent's only outlets are a fake implementation or a mislabel.

**Fix:**
- Say explicitly that PHP loose comparison is *ported* (with a `phpLooseEquals` helper), and that `php-only` is limited to an enumerated catalogue (extensions, OPcache, `php.ini`, engine internals).
- Add a DIV request process (C5, C7).
- Require `PORTING.md` to cover by-reference parameters, value-copy semantics and exception class mapping.

### H5. DIV-1's scope is ambiguous and can force the "sync core" async

- "Callbacks may be async and are awaited in order." For which APIs? If this holds for Collections `map`/`each`/`filter`, Collections must return Promises, which breaks "Everything that works in memory stays synchronous" and FR-23's Upstream tests.
- "Methods that do IO return Promises: … cache, sessions". Is `session('key')` async, even though Laravel's StartSession loads the session once and the reads after that are in memory? Is the `array` cache store async? FR-28 makes request input sync "because the body is parsed once". The same reasoning applies to sessions, but the PRD doesn't say so.

**Fix:** have DIV-1 enumerate the async surface by interface (for example: Store contracts async, `Session` reads sync after StartSession, Collections callbacks sync-only and passing an async callback is a type error). Make the line between async and sync machine-checkable (lint rule or `.d.ts` review).

### H6. Adapting a test and skipping it as a divergence are both allowed, with no rule for choosing

- DIV-2 says tests are "adapted to `await load()`". DIV-5 says tests are "replaced by … Differential Tests and TS snapshots". DIV-8 makes tests async.
- Adapted tests then count as **passing** in the Conformance Rate.
- `intentional-divergence:<DIV-N>` is also a Skip Reason. Nothing says when to adapt and when to skip.
- Nothing marks an adapted test as adapted. So "adaptation" can drift arbitrarily far from upstream and still get full credit.
- FR-48 replaces generated-PHP assertions with "snapshot tests on the JS output". A snapshot generated by the implementation under test proves nothing on first write.

**Fix:**
- Require that every adapted Ported Test carries `adapted:<DIV-N>`. Restrict adaptations to the transformations named in that DIV's test-adaptation rule.
- Show "pass (verbatim)" and "pass (adapted)" separately on the dashboard.
- Allow `intentional-divergence` skips only when the DIV record says the behaviour has no equivalent.
- Snapshots need Maintainer or reviewer sign-off when first created, and are protected afterwards.

### H7. Backend unavailability can silently skip Postgres and Redis in CI

- FR-9: tests "that need an unavailable backend report `backend-unavailable:<backend>` and are never counted as failures."
- No requirement says CI provides SQLite, Postgres or Redis. If the CI Postgres service is misconfigured, every Postgres test reports "unavailable" and the Ratchet stays green. FR-60 and UJ-3 depend on Postgres in CI.
- FR-9 treats `backend-unavailable` as a **runtime outcome**, while FR-3 treats it as a **stored** Expectations status. If it is stored, the test never runs even where the backend exists.

**Fix:**
- Specify a CI backend matrix: SQLite, Postgres and Redis are required through the alpha; MySQL, MariaDB and SQL Server after the alpha.
- In CI, an unavailable *required* backend fails the run.
- `backend-unavailable` is a runtime-only result, allowed locally. The stored status for those tests is their real expected status.

### H8. `blocked-by` tests have no un-blocking lifecycle and are never re-run

- When the blocking Component's Epic is accepted, nothing turns its `blocked-by:X` Test IDs back into work. The owning Epic is already accepted, so these IDs belong to no one and stay skipped forever. The Conformance Rate understates the work left while acceptance overstates how complete things are.
- Skipped tests are not executed. So the Ratchet's "unexpected pass" check never fires for them, and a stale `php-only` or `blocked-by` entry for a test that now passes hides that functionality works.

**Fix:**
- On acceptance of Component X, automatically reset `blocked-by:X` to `not-ported-yet` and create Stories, owned by the original Component.
- Add a CI job, nightly or per Phase, that runs every non-`not-ported-yet` skip and reports the ones that pass.

### H9. The Baseline Pin bump is underspecified and conflicts with SM-1

- FR-7 "changed Test IDs". A Test ID (`FQCN::method#dataset`) doesn't change when the test body changes, so "changed" requires a content hash. FR-1 doesn't record one.
- It is undefined what happens to an existing Ported Test, and its `pass` status, when the upstream body changes. Without a reset, stale ports keep passing against the old spec.
- A renamed test becomes removed + added, and its history is lost.
- "The Baseline Pin cannot change while any Epic is in progress." UJ-5 says accepted Epics unlock dependents one by one, so Phases overlap. There may never be a moment with no Epic in progress, so the pin can never move, which contradicts SM-5.
- SM-1's target, "it never decreases at a Phase boundary", conflicts with a bump at that same boundary, which adds `not-ported-yet` IDs to the denominator.

**Fix:**
- FR-1 records a normalised hash of each test body. On a bump, changed IDs reset to `not-ported-yet` and keep a link to the old port.
- Define "Phase boundary" as a freeze point: no new Epics start, and in-flight Epics finish or pause.
- Measure SM-1 at a fixed pin, before the bump.

### H10. The denominator is built by agents and never checked

- FR-1 requires that "each data-provider dataset [is] counted separately". Laravel data providers are often computed at runtime (methods, generators, `#[DataProvider]` with loops). Counting them correctly means *running* PHPUnit, not parsing source.
- Mapping an upstream test to a Component is undefined. `tests/Integration/*`, `tests/Foundation/*` and `tests/Support/*` don't map 1:1 to `src/Illuminate/<Name>`, yet the Component tag decides Epic acceptance.
- A Phase 0 agent writes the inventory tool, so a wrong denominator inflates every rate and nothing would notice.

**Fix:**
- FR-1 consequence: the inventory must equal the output of `phpunit --list-tests` (or an equivalent) run inside the Oracle at the pin, and CI checks this.
- Publish a written test-directory→Component mapping table as a Phase 0 deliverable, with Maintainer sign-off.

### H11. Oracle fixtures can be hand-edited, and how they are generated is undefined

- FR-6 doesn't say whether Differential Test expected values are committed fixtures or generated at test time.
- If they are generated at test time, every run needs Docker and the Oracle. That conflicts with NFR-7 ("need no network unless tagged with a backend") and depends on OQ-9.
- If they are committed, an agent can edit a fixture to match its own output.

**Fix:**
- Fixtures are committed and protected (C5). Only an Oracle-generation job writes them.
- CI regenerates them on a schedule and on any fixture diff, and fails on any byte difference. FR-6's "identical expected values" makes this possible.
- Resolve OQ-9 in Phase 0.

### H12. The htmx FRs rely on selectors the framework cannot know

- FR-40: "re-renders the *current form* Fragment". How does the framework know which view and Fragment the form came from on a POST? Is it a request header, a route convention, or an explicit `.fragment()` on the Form Request?
- FR-42: "a partial request gets only the *content area*, or the *requested Fragment*". "Content area" is undefined. No htmx 4 request header names a Fragment (`HX-Target` is an element id).
- FR-35: "an HTML error Fragment". Which template, and what about debug mode in `local`?
- Each of these will be invented by the implementing agent, and its own Xaravel Tests will confirm whatever it invented.

**Fix:**
- Specify the mechanism. One option: the Form Request declares `fragment = 'form'`, or the view rendered by the GET route is recorded in the session and reused. Another: a Fragment named after `HX-Target`, with a fallback rule.
- Define "content area" as a named section (for example `@section('content')`).
- Give each case an acceptance test in the FR.

### H13. FR-77 hides a PHP `serialize`/`unserialize` port

- "Payloads encrypted by PHP Laravel … decrypt in Xaravel, and the reverse. This includes encrypted cookies and sessions."
- Laravel's `encrypt()` serializes with PHP `serialize()` by default. Session payloads are PHP-serialized arrays, and file and database session formats must match too.
- Meeting FR-77 therefore needs a PHP serialize/unserialize implementation in both directions, plus session storage-format compatibility. No FR, Component, Phase or DIV names this work.
- An agent will meet it with `encryptString` round-trips only, which passes a narrow reading and still logs every user out on migration.

**Fix:** add an FR for a PHP serialization codec (owner: Support or Encryption, Phase 3). Add Differential Tests against the Oracle for cookies, sessions and `encrypt()` of non-string values. Name which session drivers must interoperate.

---

## Medium

### M1. Terms used inconsistently with the Glossary

- §3 Phase is "one of nine groups", but §7.3 adds Phase 0, and SM-2 cites "Phases 0–1".
- **Component and Package do not line up.** The Glossary and FR-10 say "Each Component is published as `@xaravel/<component>`". But the addendum says Contracts (a Phase 1 Component) is "not shipped as one monolithic contracts package". The Installer is `create-xaravel`, not `@xaravel/installer`.
- **Fragment** is defined as "declared with `@fragment` or `<hx-partial>`". But `<hx-partial>` is an htmx 4 response element, and FR-39 treats it as different from Fragments ("`<hx-partial>` and out-of-band Fragments").
- FR-46 calls an Oracle-compared XSS suite a "Xaravel Test". By the Glossary, an Oracle-derived test is a Differential Test, which is a Ported Test. So it is unclear whether it counts in the Conformance Rate.
- §4.17 places `@xaravel/mockery` under the Testing Toolkit (Phase 9), but §7.3 puts it in Phase 0.

### M2. References that point to nothing, and stale text in the addendum

- FR-10 says "mirroring Upstream's `composer.json` `require` lists *as adjusted in the addendum*", but the addendum contains no adjustments.
- §0 says the addendum holds "the package list", but it has none.
- The addendum still has "[NOTE FOR PM] … Decide during epic planning whether to pull Auth forward". §7.2 has already decided this, so an epics agent may reopen it.
- The addendum mapping table still says "CLI name pending OQ-1", but §10 confirms `bun artisan`.
- "DIV-3 (shape TBD in architecture)" is fine, but the PRD should say that architecture owns it.

### M3. FRs specify behaviour of packages that aren't in the Test Inventory, so there is no oracle

- phpdotenv grammar (FR-20).
- laravel/prompts behaviour (FR-70).
- laravel/tinker (FR-73).
- Carbon (FR-25).
- Doctrine Inflector (FR-24).
- laravel/serializable-closure (FR-88).
- Pest 4 browser API (FR-102).
- Symfony HttpFoundation, Routing and Console (OQ-3).
- "every Laravel 13 method" (FR-23) and "every Laravel 13 rule" (FR-50): the upstream tests don't cover every public method.

Agents will implement only what is tested. Add either Differential Test obligations for each, or an API-surface parity check: extract the public method signatures from PHP at the pin, and diff them against the exported `.d.ts`.

### M4. FR-106 contradicts FR-110 on queries

FR-106 lists "read-only queries" among the default App Agent capabilities. FR-110 says "Query, eval and write tools must be enabled explicitly." The PRD also doesn't say how "read-only" is enforced: a read-only transaction or role, or parsing the SQL.

### M5. FR-88 / DIV-4 capture detection can't be fully implemented as stated

"A closure that captures outer variables fails at dispatch time." Telling captured variables apart from module imports and globals from `fn.toString()` needs a free-identifier analysis with an allowlist. That analysis has unavoidable false negatives. Specify the allowed free identifiers, and which closures may be rejected even though they would work.

### M6. FR-28 parses the body before the pipeline, which defeats `ValidatePostSize`

FR-28 says "the body is parsed once before the middleware pipeline". Then FR-31's `ValidatePostSize` runs after a possibly huge body has already been buffered and parsed (a DoS risk). Streamed uploads are undefined. State that the declared and actual size limits are enforced before parsing.

### M7. The htmx behaviour changes are not Intentional Divergences, but §5.1 says other differences are bugs

FR-35 (error Fragment), FR-40 (422 instead of a redirect) and FR-41 (200 + `HX-Location` instead of 302) change Laravel's behaviour for some requests. None is a DIV. A literal agent porting a redirect or validation Upstream test could "fix" the htmx path as a bug. Either add a DIV for htmx Request handling or exempt htmx Requests explicitly in §5.1.

### M8. No order of precedence when several Skip Reasons apply

Example: a MySQL integration test whose driver is post-alpha could be `blocked-by:mysql-driver` or `backend-unavailable:mysql`. A test that needs Phase 9 Foundation *and* a DIV is another case. The choice changes ownership and the dashboard counts. Define a precedence order.

### M9. FRs with no Phase or a contradictory Phase

- FR-102 (browser tests) and FR-73 (tinker) have no Phase.
- FR-71 generators: brief says Phase 9, but UJ-1 is an alpha journey.
- "PHPUnit-style matchers" (Phase 0) have no FR.
- FR-81 Context is "carried into queued jobs" (Queue, Phase 8), but Context ships with Log (Phase 3).
- Add an FR→Phase→Component table so the epics workflow doesn't have to guess.

### M10. "Done" doesn't say where it is measured or what else it includes

- UJ-4 runs "the harness in fast mode" (a sample). The PRD doesn't require the full run for the Story's IDs in CI.
- Done doesn't include NFR-3 lint, NFR-9 docs, or the fidelity review passing.
- Who sets "done", and against which CI run?

### M11. FR-63 `automaticallyEagerLoadRelationships()` contradicts DIV-2

In Laravel, this eager-loads lazily *on property access*. Under DIV-2, property access is synchronous and throws, so the auto-load would need IO from a sync getter. An agent will stub it. Define its Xaravel semantics (for example, eager-load hints applied at the next `await` on a collection), or mark it as a DIV.

### M12. Who publishes releases, and with what credentials?

- FR-13 "A 0.x release is published when each Phase completes". "Phase completes" is undefined (are all Epics accepted?).
- Nothing says whether unattended agents may run `npm publish` or hold npm or GitHub release tokens.
- Add a guardrail: only the Maintainer, or a Maintainer-triggered workflow, publishes.

### M13. FR-22 Class Registry misses classes whose modules were never imported

- "Registered automatically when their module loads". A queue worker or a morph-map lookup for a class whose module was never imported fails. FR-22 makes it throw, but nothing requires the module to be loaded first.
- Registry key format is undefined: JS class names are not namespaced, while Laravel stores FQCNs such as `App\Models\User` in the database and in payloads.
- Tie this to DIV-7 discovery and specify the key format.

### M14. One shared Expectations File with parallel agents

"Components within a Phase run in parallel" and every Story edits the Expectations File. With one file, merge conflicts or last-writer-wins can silently revert another Story's statuses. Require one file per Component, or a structured merge with conflict detection.

### M15. FR-78 is stated as a fact, but depends on unresolved OQ-8

"Bcrypt `$2y$` hashes produced by PHP Laravel verify in Xaravel (see OQ-8)." This is a requirement that rests on an unanswered question. If Bun's bcrypt breaks for inputs over 72 bytes, the agent has no fallback rule. State the required behaviour for passwords over 72 bytes (match PHP's truncation).

---

## Low

### L1. SM-4 and SM-5 aren't measurable as written

SM-5 says "never more than one Phase behind the latest Laravel 13.x". A Phase is not a unit of release lag, and Laravel 14 (around Q1 2027) freezes 13.x. SM-4 has no target.

### L2. The "never" claims need a stated load

FR-27, FR-55 and NFR-4 say isolation holds "never" or "even while other requests run concurrently". Specify the concurrency test's load and interleaving method, so that "never" means a reproducible test.

### L3. Bun built-ins are named without checking they exist

FR-84 depends on "`Bun.Image`", and FR-59, FR-76 and FR-53 depend on Bun built-ins at "Bun 1.4". Confirm in a Phase 0 spike that each one exists and is complete enough, the same way OQ-4 does for Temporal.

### L4. Test counts use two different units

The brief's counts are test *methods* (13,544). The Test Inventory counts *datasets* (~16–18k, estimated). SM-1's 90% and any per-Phase sizing must use the inventory's unit, or Epic sizing and the gate math (C2) will be off by 20–30%.
