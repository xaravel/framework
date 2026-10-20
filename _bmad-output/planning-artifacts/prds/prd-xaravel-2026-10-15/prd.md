---
title: "PRD: Xaravel"
status: final
created: 2026-10-15
updated: 2026-10-16
---

# PRD: Xaravel

## 0. Document Purpose

This PRD defines **what** Xaravel must do: a port of Laravel 13's server framework to TypeScript on Bun, built for htmx 4. It is the top of a BMAD chain. Architecture, Epics, Stories and **unattended AI build agents** all work from it, so every requirement is written to be testable and every domain noun is defined once in the §3 Glossary. Use those terms exactly.

It builds on the final product brief and does not repeat it. The brief and its research are at `../../briefs/brief-xaravel-2026-10-15/`:

- `brief.md`
- `addendum.md`, which has the phase order with test counts, the dependency replacement map and the htmx 4 header list
- `research/laravel-anatomy.md`
- `research/deps-map.md`
- `research/porting-strategy.md`

Implementation detail for this PRD lives in its own `addendum.md`: repository layout, the Component-to-Package mapping, and API mapping examples.

**Structure:**

- **§4 Features.** These group the Functional Requirements (FR-N), which are numbered globally.
- **§5 Public API Contract.** Defines parity and lists every Intentional Divergence (DIV-N).
- **§6 Cross-Cutting NFRs** (NFR-N).
- **§7 Scope.** Non-Goals (NG-N), the public alpha scope, the Phases, and risks.
- **§8 Success Metrics** (SM-N).
- **§9 Open Questions** (OQ-N).
- **§10 Assumptions Index.** Lists the assumptions made while drafting, all confirmed by the Maintainer.

## 1. Vision

Xaravel is Laravel, written in TypeScript and running on Bun. A Laravel developer opens a Xaravel app and finds everything where they expect it:

- `routes/web.ts`
- controllers and form requests
- Blade views
- Eloquent models and relationships
- migrations and factories
- queues, mail, notifications and auth
- a CLI that scaffolds all of it

The difference is that the language is TypeScript, the runtime is Bun, and the front end is htmx 4, served as HTML fragments rendered on the server.

Xaravel earns the claim "it's Laravel" by measuring it. Laravel's own test suite is the specification. Every Upstream test is inventoried, ported to `bun test`, and tracked on a public conformance dashboard whose denominator is the whole Upstream suite. Where TypeScript forces a difference (async IO, erased types, closures that can't be serialized), the difference is deliberate, documented, and tested on its own terms.

Xaravel is built by AI agents running unattended in BMAD cycles and reviewed by the Maintainer one Epic at a time. It ships with **Xaravel Boost**, an MCP server that lets agents look inside a Xaravel app or the framework itself. The aim is for it to be the framework that agents find easiest to build on.

Long term (2–3 years), Xaravel tracks Laravel releases within weeks once the port is complete, and an App Developer can describe an htmx app and have it scaffolded, tested and running on Bun, the Laravel way.

## 2. Target User

### 2.1 Jobs To Be Done

- **Keep Laravel when moving to TypeScript.** "When I have to write TypeScript, I want to keep Laravel's conventions, API and productivity, so I don't have to relearn how to build a web app." *(This is the Maintainer's own job: "If you're going to make me write TypeScript, the first thing I'm doing is writing Laravel in TypeScript.")*
- **Build server-rendered htmx apps with batteries included.** "When I build an htmx app, I want routing, validation, sessions, an ORM, queues, mail and auth that already work together and already understand htmx, instead of putting middleware together by hand."
- **Trust what I'm adopting.** "Before I bet a project on a young framework, I want hard evidence of how complete and correct it is." The conformance dashboard answers this.
- **Let agents build it, and build on it.** "I want AI agents to build features and fix bugs, in the framework and in my apps, without needing me to rescue them."
- **One stack from development to production.** "I want SQLite on my laptop and Postgres in production, with the same code and the same `.env` keys."

### 2.2 Non-Users

- Teams who want React, Svelte, Vue, Inertia or Livewire front ends. htmx 4 is the only front end.
- Projects that need Node.js or Deno. Xaravel supports Bun only.
- Teams who need MongoDB.
- Teams who need a stable 1.0 API before adoption. Xaravel is 0.x until the public alpha.
- Teams looking to run existing PHP Laravel code unchanged. Xaravel is a port, not a PHP interpreter or compatibility layer.

### 2.3 Key User Journeys

- **UJ-1. Dana starts a new app and recognizes everything.**
  - **Persona + context:** Dana has six years of Laravel and is moving to a TypeScript-only shop.
  - **Path:**
    1. She runs `bun create xaravel invoices` and picks SQLite. The Installer scaffolds the Skeleton, installs dependencies and initialises git.
    2. She runs `bun artisan serve` and sees the welcome page.
    3. She runs `bun artisan make:model Invoice -mfc`, which creates `app/Models/Invoice.ts`, a migration, a factory and a controller.
    4. She runs `bun artisan migrate`.
  - **Climax:** the generated files read like Laravel, with TypeScript syntax.
  - **Edge case:** Bun is older than 1.4. The Installer stops and prints the upgrade command.

- **UJ-2. Dana ships an htmx form with validation.**
  - **Persona + context:** Dana (UJ-1), an App Developer with six years of Laravel, is building her first htmx form in Xaravel.
  - **Path:**
    1. Dana writes a Blade view with `<form hx-post="/invoices">` and an `@fragment('form')`.
    2. She writes a Form Request with rules.
  - **Climax:** an invalid submission comes back as the re-rendered form Fragment with errors and status 422, and htmx swaps it in. A valid one returns the new row Fragment with `HX-Trigger: invoiceCreated`.
  - **Edge case:** the same route hit without htmx falls back to Laravel's redirect-back-with-errors behaviour.

- **UJ-3. Dana deploys to Postgres without changing code.**
  - **Persona + context:** Dana (UJ-1) developed her app on SQLite and now deploys it to production.
  - **Path:**
    1. In production she sets `DB_CONNECTION=pgsql` and the usual `DB_*` keys.
    2. She runs `bun artisan migrate --force`.
    3. She starts `bun artisan queue:work` and the scheduler.
  - **Climax:** the app behaves the same as on SQLite, and the Skeleton's test suite passes against both.

- **UJ-4. A Framework Agent completes a Story unattended.**
  - **Path:**
    1. The agent picks up "Collections: chunking and windowing" from the sprint queue, with its list of Test IDs.
    2. Its Ported Tests start red. The agent reads `PORTING.md` and the relevant Divergence Records, implements, and runs the harness in fast mode.
    3. It updates the Expectations File, and its Fidelity Review, by two adversarial reviewers, checks that the Ported Tests still match Upstream.
  - **Climax:** the Ratchet passes in CI and the Story is marked done with every assigned Test ID passing.
  - **Edge case:** a Test ID depends on an unbuilt Component. The agent marks it `blocked-by:<component>` and does not stub the dependency.

- **UJ-5. Ed reviews a completed Epic.**
  - **Path:**
    1. Ed opens the conformance dashboard for the Component.
    2. He sees the Conformance Rate, the counts per Skip Reason, every new Divergence Record, and the Epic's diff summary.
  - **Climax:** he accepts the Epic, or sends specific Test IDs back with notes.
  - **Resolution:** an accepted Epic unlocks the dependent Epics in the next Phase.

- **UJ-6. An App Agent fixes a bug in Dana's app using Boost.**
  - **Path:** a coding agent in Dana's repo calls Boost to get the last error, the route list (including the routes that return Fragments), the `invoices` schema and the failing test.
  - **Climax:** it fixes the bug and confirms the fix with Boost's test-run tool. It never had to guess the framework's conventions.

- **UJ-7. Ed bumps the Baseline Pin at a Phase boundary.**
  - **Path:**
    1. Ed runs the pin-bump tool against the newest Laravel 13.x tag.
    2. The tool produces a Test Inventory diff: added, changed and removed Test IDs.
  - **Climax:** added and changed Test IDs become backlog Stories automatically, and removed ones are retired from the Expectations File.

## 3. Glossary

- **Upstream:** the PHP source and tests of `laravel/framework`, plus `laravel/ai`, `laravel/mcp` and `laravel/boost`, at the Baseline Pin.
- **Oracle:** PHP Laravel at the Baseline Pin, run to produce expected outputs for Differential Tests.
- **Baseline Pin:** the exact Upstream release tag that Xaravel targets. It is initially `v13.37.0`, and it moves only at Phase boundaries (FR-7).
- **Component:** a unit of the framework.
  - An *Upstream Component* maps 1:1 to an Upstream `src/Illuminate/<Name>` directory or Upstream package.
  - A *Xaravel Component* is one with no Upstream equivalent: Testbench, Mockery, the htmx Integration, Boost, the Installer, the Skeleton, the Conformance System, and `@xaravel/runtime` (which holds the Class Registry, FR-22). The ports of libraries outside the Test Inventory (`@xaravel/http-foundation`, `@xaravel/mime`, `@xaravel/finder`, `@xaravel/serializable-closure`) are also Xaravel Components.
- **Package:** the npm package that publishes one Component, named `@xaravel/<component>`. Exceptions: the Installer publishes as `create-xaravel`. All Contracts ship together in `@xaravel/contracts`, and shared runtime primitives in `@xaravel/runtime` (architecture AD-1, AD-19).
- **Test Inventory:** the full list of Upstream test cases at the Baseline Pin, with each data-provider dataset counted separately.
- **Test ID:** the stable identifier of one Test Inventory entry.
  - PHPUnit tests: `<FQCN>::<method>#<dataset>`.
  - Pest tests (in `laravel/ai`, `laravel/mcp`, `laravel/boost`): `<test-file-path>::<describe> > … > <test name>#<dataset>`.
- **Backend Variant:** one backend a Test ID runs against, such as `sqlite`, `pgsql`, `mysql`, `redis`, or the `sync` / `database` / `redis` queue drivers. Tests needing no backend have the single variant `none`.
- **Ported Test:** a `bun test` translation of exactly one Test ID, labelled with that Test ID.
- **Xaravel Test:** a test for behaviour with no Upstream counterpart, such as the htmx Integration. It has a **Xaravel Test ID** of the form `XT-<component>-<n>` and is not in the Test Inventory.
- **Expectations File:** the machine-maintained record of the expected status of every Test ID × Backend Variant pair. The status is `pass`, `fail-known`, `skip` or `quarantined`. A skip must have a Skip Reason. A `pass` entry may carry an `adapted:DIV-<n>.<clause>` marker when the test was adapted under that clause of the DIV's rule (§5.1). A `fail-known` entry counts as not passing, and it doesn't satisfy a Story's done definition or the Global rules (§4).
- **Skip Reason:** one value from a fixed vocabulary. Each value has a rule CI enforces (FR-3):
  - `not-ported-yet`
  - `blocked-by:<component>`: that Component must sit in a later Phase.
  - `intentional-divergence:<DIV-N>`: that Divergence Record must exist.
  - `php-only`: needs an approved Escalation (FR-114).
  - `upstream-skip`: the Oracle also skips or fails this test at the Baseline Pin, which the harness checks.
  - `deferred:<item>`: only for a backend or feature listed as post-alpha in §7.2.
  - `out-of-scope:<NG-N>`: must name a §7.1 Non-Goal by its ID.
- **Quarantined:** a test whose result isn't consistent across repeated runs. It counts as not passing and always has an open Escalation.
- **Ratchet:** the CI rule that any test result different from the Expectations File fails the build. That covers unexpected failures *and* unexpected passes.
- **Conformance Rate:** passing Test ID × Backend Variant pairs ÷ all pairs, for one Component or overall. The denominator always includes tests that haven't been ported yet.
- **Applicable Test IDs:** Test IDs, excluding those whose Skip Reason is `php-only`, `upstream-skip`, `deferred` or `out-of-scope`. This is the denominator for the alpha gate (SM-1).
- **Fidelity Review:** a check by at least two reviewer agents, independent of the implementing agent. It confirms that Ported Tests match Upstream and that every Skip Reason is justified (FR-111).
- **Protected Path:** a file that Story changes must not touch, such as the harness or the Test Inventory (FR-112).
- **Escalation:** a recorded stop raised by a Framework Agent that needs the Maintainer's decision (FR-114).
- **Intentional Divergence (DIV-N):** a deliberate difference from Upstream API or behaviour, listed in §5.2.
- **Divergence Record:** the decision record for one Intentional Divergence. It states the rationale and the test-adaptation rule.
- **Differential Test:** a Ported Test whose expected value comes from running the same input through the Oracle.
- **Phase:** one of ten groups of work, Phase 0 to Phase 9, ordered by dependency (§7.3).
- **Epic:** a BMAD unit of work covering one Component, or one slice of a large Component, within a Phase.
- **Story:** a BMAD unit within an Epic, with an explicit list of assigned Test IDs and/or Xaravel Test IDs. It is done when:
  - every assigned Test ID × Backend Variant passes, or carries a Skip Reason that is valid under FR-3 and isn't `not-ported-yet`;
  - every assigned Xaravel Test passes;
  - its Fidelity Review has approved it;
  - it has no open Escalations;
  - CI passes on the Story's change, including a full (not fast-mode) run of its assigned tests and the NFR-3 lint.

  A Story with no assigned tests can't be marked done.
- **Framework Agent:** an AI agent that builds Xaravel itself.
- **App Agent:** an AI agent that builds applications on Xaravel.
- **App Developer:** a person who builds applications on Xaravel.
- **Maintainer:** Ed, who owns review and acceptance of Epics.
- **Skeleton:** the starter application, the equivalent of `laravel/laravel`.
- **Installer:** the `create-xaravel` package, invoked as `bun create xaravel <name>`.
- **CLI:** the Artisan-equivalent command runner of a Xaravel app, `bun artisan <command>`. "Artisan" isn't listed as a mark in Laravel's trademark policy, so the name is kept (NFR-8).
- **Testbench:** `@xaravel/testbench`, a skeleton application plus test hooks that integration tests boot into. It is the equivalent of Orchestra Testbench.
- **Boost:** Xaravel Boost, the MCP server for introspecting a Xaravel app or the Xaravel monorepo.
- **htmx Request:** an HTTP request carrying `HX-Request: true`.
- **Blade component:** a reusable template used as an `<x-name>` tag (FR-45). It is not a Component.
- **Fragment:** a named, separately renderable part of a Blade view, declared with `@fragment`. (htmx 4's `<hx-partial>` is a response element that can wrap a Fragment; FR-39.)
- **IO Terminal:** a framework method that performs IO and returns a Promise, such as `get()`, `save()` or `send()`. Methods that are async only because they take an async callback (DIV-1), such as `Gate.allows()`, also return Promises but are not IO Terminals.
- **Strict Loading:** Eloquent behaviour in which reading a relationship that hasn't been loaded throws `LazyLoadingViolationException`.
- **Class Registry:** the runtime map from class-name strings (PHP-style FQCNs) to classes. It is used for morph types, queue payloads and configuration.
- **Contract:** a ported `Illuminate\Contracts\*` interface. Each one ships in `@xaravel/contracts` as a TypeScript interface plus a runtime token with the same name, used for injection and `instanceof` (DIV-3; architecture AD-1).
- **Scope Frame:** the per-unit sandbox in which each request, job, command, scheduled task, test or WebSocket message runs. Writes made during the unit go into its frame and are discarded when it ends (DIV-11; architecture AD-5).
- **Public alpha:** the release that ends the 0.x line, once the criteria in §7.2 are met.

## 4. Features

**Global rules.** Every FR carries these consequences even where they aren't repeated. The consequences listed under each FR are the specific, extra conditions.

- **Upstream Components:** before a Component's last Epic is accepted, every Test ID × Backend Variant of that Component passes, or carries a Skip Reason that is valid under FR-3 and isn't `not-ported-yet`. An Epic that covers only one slice of a Component is accepted against the Test IDs assigned to its Stories.
- **`blocked-by` entries:** a `blocked-by:<component>` entry is cleared by a re-verification Story in the Phase that delivers that Component. The Phase isn't complete while any `blocked-by` entry points at it.
- **Xaravel Components** (htmx Integration, Mockery, Testbench, Boost, Installer, Skeleton, Conformance System, `@xaravel/runtime` and the library ports): every testable consequence of the Component's FRs maps to at least one passing Xaravel Test before its Epic is accepted (FR-115).

### 4.1 Conformance System

**Description:** this is the machinery that makes "it's Laravel" measurable, and it is the work queue for Framework Agents. It covers inventory, translation tracking, the Expectations File, the Ratchet, the dashboard, Differential Tests and pin bumps. It must exist before Phase 1 implementation starts. Realizes UJ-4, UJ-5, UJ-7.

#### FR-1: Test Inventory generation

The Maintainer can generate the Test Inventory for any Baseline Pin.

**Consequences (testable):**
- Every Upstream test case gets exactly one Test ID, with each data-provider or `#[TestWith]` dataset counted separately.
- Regenerating the Test Inventory for the same Baseline Pin gives an identical result.
- Each entry is tagged with its Component, whether it is a unit or an integration test, and any backend it needs: SQLite, Postgres, MySQL, MariaDB, SQL Server, Redis, or none.
- The Test Inventory covers `laravel/framework`, `laravel/ai`, `laravel/mcp` and `laravel/boost`.
- The list of Test IDs, including datasets computed at runtime, matches what the test runner actually runs inside the Oracle at the Baseline Pin (`phpunit --list-tests` or the JUnit output, and Pest's equivalent). CI checks the two match.
- Each entry records a normalised hash of its test body and dataset values (used by FR-7).
- Component tags come from a written mapping of test directories to Components. The mapping is a Phase 0 deliverable, on a Protected Path, signed off by the Maintainer.

#### FR-2: Ported Test traceability

Every Ported Test declares the Test ID it translates.

**Consequences (testable):**
- CI fails if a Ported Test has no Test ID, has one that isn't in the Test Inventory, or shares one with another Ported Test.
- Xaravel Tests are labelled as such and never counted in the Conformance Rate.

#### FR-3: Expectations File and Skip Reasons

The Expectations File records exactly one status for every Test ID × Backend Variant pair.

**Consequences (testable):**
- A `skip` without a Skip Reason from the vocabulary fails CI.
- CI checks every Skip Reason against its rule in §3, and fails on any that breaks it:
  - `blocked-by` must name a Component in a later Phase.
  - `intentional-divergence` must name an existing Divergence Record.
  - `php-only` must reference an approved Escalation.
  - `upstream-skip` must be confirmed by the Oracle.
  - `deferred` must name a backend or feature listed as post-alpha in §7.2.
  - `out-of-scope` must name a §7.1 Non-Goal ID (NG-N).
- A test may be `quarantined` only with an open Escalation.
- When more than one Skip Reason could apply, the Expectations File records exactly one, chosen in this order:
  1. `upstream-skip`, because it is machine-verified.
  2. One that keeps the test in the SM-1 denominator: `intentional-divergence`, then `blocked-by`, then `not-ported-yet`.
  3. Only if none of those fits, one that excludes it: `php-only`, `deferred` or `out-of-scope`.

  When in doubt, the agent picks the reason that counts against conformance.
- A `fail-known` entry blocks Epic acceptance, and the dashboard counts it separately from skips.

#### FR-4: Ratchet

CI enforces the Expectations File.

**Consequences (testable):**
- An unexpected failure fails CI.
- An unexpected pass also fails CI.
- A Story's change may modify Expectations File entries only for the Test IDs assigned to that Story. CI fails any change that touches other entries (FR-112).
- Changing an entry from `pass` to anything else requires an approved Escalation.

#### FR-5: Conformance dashboard

Anyone can view the Conformance Rate per Component and overall on a public page. Realizes UJ-5.

**Consequences (testable):**
- The denominator shown is always the full count of Test ID × Backend Variant pairs.
- The page shows the alpha gate figure (SM-1) next to the full Conformance Rate.
- The page shows counts per Skip Reason, links each Intentional Divergence to its Divergence Record, and lists open Escalations and Quarantined tests.
- It shows the history across commits, with a marker at each Baseline Pin change.
- The dashboard updates on every push to the default branch.

#### FR-6: Differential Tests against the Oracle

For input→output tests, expected values can be generated by running the Oracle. This covers Str, the SQL grammars, Blade rendered HTML, validation messages and date formatting. Generator output is not Oracle-generated, because the Oracle emits PHP; see FR-71.

**Consequences (testable):**
- Generating the expected values twice for the same Baseline Pin gives identical results.
- The Oracle runs in a container, so contributors and agents don't need PHP installed.

#### FR-7: Baseline Pin bump

The Maintainer can move the Baseline Pin to a newer Upstream tag at a Phase boundary. Realizes UJ-7.

**Consequences (testable):**
- The tool outputs a list of added, changed and removed Test IDs. A Test ID counts as changed when its Upstream test body or its dataset values differ between the two pins.
- Added and changed Test IDs become backlog Stories, and removed ones are retired from the Expectations File.
- A changed Test ID is reset to `not-ported-yet`, keeping a link to its previous Ported Test. A renamed test (same hash, new Test ID) carries its status and history over.
- A Phase boundary is a freeze point: no new Epics start, and in-flight Epics either finish or pause. The Baseline Pin can change only at a freeze point.

#### FR-8: Porting rules exist before implementation

Framework Agents work from a `PORTING.md` that holds the idiom table and the test-adaptation rules, and from the Divergence Records for DIV-1 through DIV-12.

**Consequences (testable):**
- Phase 1 Stories are not started until `PORTING.md` and the Divergence Records are merged.
- `PORTING.md` is piloted in Phase 0 on a sample of Support and Collections tests, and revised from the pilot before Phase 1 starts.
- Every Divergence Record states its test-adaptation rule as numbered clauses.
- `PORTING.md` states the mechanical rule for translating PHP expressions in Upstream test inputs, including Blade templates, to TypeScript.

#### FR-9: Agent-operable harness

Framework Agents can run the conformance harness unattended.

**Consequences (testable):**
- The harness has a fast mode that runs a sample, and a filter by Component or Test ID. The sample is chosen from a seed that the harness prints, so the same seed gives the same sample (NFR-7).
- Its output is short and can be grepped, with one line per failing Test ID.
- On a developer machine, tests whose backend isn't running are reported as not run. They don't count as failures and are never recorded in the Expectations File.
- CI runs SQLite, Postgres and Redis as services. In CI, every Backend Variant for an alpha backend must actually run.

#### FR-111: Fidelity Review

Every Story's Ported Tests and Skip Reasons pass a Fidelity Review before the Story is done.

**Consequences (testable):**
- At least two reviewer agents, separate from the implementing agent, compare each Ported Test with its Upstream source. They check:
  - the assertions match the Upstream ones;
  - no expected value has been weakened;
  - no assertion has been removed unless a Divergence Record allows it;
  - every new Skip Reason is justified.
- The review verdict and its findings are stored with the Story.
- A rejected Story goes back to its implementer with the findings.
- The implementing agent doesn't stub, fake or partly implement a Component just to make another Component's tests pass. Reviewers reject changes that do.
- At least one reviewer runs on a different model family from the implementing agent when one is available, so the two do not share blind spots (ESC-8.5-1).

#### FR-112: Protected Paths

Changes made by a Story can't alter the grader.

**Consequences (testable):**
- These paths are protected:
  - the harness and the Ratchet
  - the Test Inventory and the Skip Reason vocabulary
  - the PHPUnit-style matchers and `@xaravel/mockery`
  - Oracle fixtures
  - `PORTING.md` and the Divergence Records
  - CI configuration
  - `@xaravel/contracts`, once Phase 1 is accepted
- CI fails any Story change that touches a Protected Path.
- Protected Paths change only through Infrastructure Stories that the Maintainer approves.
- Infrastructure Stories run in Phase 0, or after an approved Escalation.

#### FR-113: Assertion floor

A Ported Test must really test something.

**Consequences (testable):**
- A Ported Test that runs zero assertions fails.
- A Ported Test's assertion count is at least the Upstream count recorded in the Test Inventory, unless a Divergence Record allows fewer.
- The harness reports both counts for each Test ID.

#### FR-114: Escalation and stop rules

A Framework Agent stops working on a Test ID and raises an Escalation, instead of guessing, when:
- it believes a new Intentional Divergence, or a change to one, is needed;
- it would need to change a Protected Path;
- an Upstream test looks wrong but the Oracle passes it;
- a test is inconsistent across 3 repeated runs, in which case it is Quarantined;
- a `php-only` Skip Reason is proposed;
- an open question in §9 blocks the work;
- it needs a Contract that is missing or different after Phase 1.

**Consequences (testable):**
- Escalations are recorded with the Test IDs, the evidence and the decision the agent proposes, and they appear on the dashboard.
- The agent goes on with other assigned Test IDs.
- An Epic can't be accepted while it has open Escalations.
- The Maintainer's decision is recorded, and becomes a Divergence Record or a Protected Path change where that applies.

#### FR-115: Acceptance for Xaravel Components

Stories for Xaravel Components list their Xaravel Test IDs.

**Consequences (testable):**
- Each Xaravel Test declares which FR consequence it verifies.
- A Xaravel Component's Epic is accepted only when every testable consequence of its FRs is covered by at least one passing Xaravel Test.
- The Fidelity Review checks that each Xaravel Test verifies the behaviour it claims to.

#### FR-116: PHPUnit-style matchers

Ported Tests assert through PHPUnit-style matchers that keep PHPUnit's semantics. They are delivered in Phase 0 with `@xaravel/mockery` (FR-100).

**Consequences (testable):**
- The matchers cover every PHPUnit assertion used by the Upstream test suite at the Baseline Pin. A scan run with FR-1 lists them, and CI reports any that aren't covered.
- `assertSame` follows PHP `===`, including array key order and value types. `assertEquals` follows PHP `==`.
- `expectException` ends the test at the throw, as PHPUnit does.
- PHPUnit `createMock` goes through `@xaravel/mockery`.
- Each of these rules is verified by its own Xaravel Tests.

### 4.2 Packages, Runtime and Distribution

**Description:** Xaravel ships as split packages from a single monorepo, runs only on Bun, and stays 0.x until the public alpha.

#### FR-10: Split packages

Each Component is published as `@xaravel/<component>`.

**Consequences (testable):**
- A Package depends only on the Packages its Component actually needs, mirroring Upstream's `composer.json` `require` lists. Every Package may also depend on `@xaravel/contracts` and `@xaravel/runtime` (addendum; architecture AD-2).
- `@xaravel/collections` and `@xaravel/support` can each be installed and used without the rest of the framework.

#### FR-11: Framework meta-package

App Developers can install `@xaravel/framework` to get every Component.

**Consequences (testable):**
- The Skeleton depends on `@xaravel/framework`.

#### FR-12: Bun-only runtime

Packages target Bun 1.4 or later.

**Consequences (testable):**
- Every Package declares `engines.bun >= 1.4`.
- CI runs on Bun only.
- No Node.js compatibility is promised or tested.

#### FR-13: 0.x versioning

Until the public alpha, every Package is released as `0.x`.

**Consequences (testable):**
- All Packages are released together under one version number.
- Each release's notes state the Baseline Pin it targets.
- A 0.x release is published when each Phase completes. A Phase is complete when the Maintainer has accepted all of its Epics and no `blocked-by` entry points at it (§4).

#### FR-14: Monorepo

All Components, the Skeleton, the Installer, the conformance harness and the docs live in one repository under the `github.com/xaravel` organization, organised as Bun workspaces with one workspace per Package. The repo is `github.com/xaravel/framework`, mirroring `laravel/framework`; `xaravel/xaravel` is reserved for a possible Skeleton mirror.

**Consequences (testable):**
- Every Package publishes under the `@xaravel` npm scope (org registered 2026-10-15), except the Installer, which publishes as `create-xaravel`.

### 4.3 Skeleton and Installer

**Description:** a new app looks like a Laravel app. Realizes UJ-1.

#### FR-15: Installer

App Developers can run `bun create xaravel <name>` to create an app from the Skeleton.

**Consequences (testable):**
- The Installer offers SQLite (the default) or Postgres.
- It installs dependencies, generates `APP_KEY`, initialises git, and prints the next steps.
- If Bun is older than 1.4, it exits with a non-zero code and prints the upgrade command.

#### FR-16: Laravel-shaped Skeleton

The Skeleton uses Laravel's directory structure:

- `app/Http/Controllers`, `app/Models`, `app/Providers`
- `bootstrap/app.ts`
- `config/*.ts`
- `database/{migrations,factories,seeders}`
- `resources/views`
- `routes/{web,console}.ts`
- `storage/`
- `tests/`

**Consequences (testable):**
- `.env.example` uses Laravel's key names for every shared concept: `APP_*`, `DB_*`, `CACHE_STORE`, `QUEUE_CONNECTION`, `SESSION_DRIVER`, `MAIL_*`, `REDIS_*`, `LOG_CHANNEL`.

#### FR-17: htmx-ready Skeleton

The Skeleton ships with htmx 4 already set up.

**Consequences (testable):**
- The base layout loads htmx 4 and sends the CSRF token on every htmx Request (FR-32).
- The welcome page includes one working Fragment example.
- The Skeleton includes htmx auth pages (login, register, password reset) and an authenticated dashboard. These are delivered with Auth in Phase 8 (OQ-10).

### 4.4 Application Foundation and Container

#### FR-18: Application lifecycle

App Developers configure the app in `bootstrap/app.ts` with Laravel's fluent configuration: `withRouting`, `withMiddleware`, `withExceptions`, `withProviders`. Service providers `register` and then `boot` in Laravel's order. Upstream Component: Foundation.

#### FR-19: Service container

App Developers can use `bind`, `singleton`, `scoped`, `instance`, contextual binding (`when().needs().give()`), tagging, `extend`, and `make` with parameters. Upstream Component: Container.

**Consequences (testable):**
- Dependencies are autowired through declared injection tokens (DIV-3).
- `scoped` bindings are isolated per request, even when requests run concurrently.

#### FR-20: Configuration and environment

App Developers read configuration with `config('app.name')`, from `config/*.ts`, and environment values with `env()`.

**Consequences (testable):**
- `.env` parsing matches phpdotenv's grammar: quoting, interpolation, multiline values and `export` prefixes.
- Which environment file loads, including `.env.<APP_ENV>`, and the precedence of real environment variables match Laravel. Bun's own `.env` auto-loading doesn't change the result.
- `config:cache` produces a cached configuration that loads with the same values.

#### FR-21: Facades and global helpers

App Developers can use Laravel's facades and global helpers under the same names:

- Facades such as `Route`, `DB`, `Cache`, `Log` and `Storage`.
- Helpers such as `app`, `config`, `collect`, `now`, `str`, `data_get`, `tap`, `value`, `retry`, `abort`, `redirect`, `view`, `route` and `url`.

**Consequences (testable):**
- A facade resolves its underlying instance for the current unit of work (request, job, command or test).
- Every facade supports `Facade.fake()` / `swap()` where Laravel does.

#### FR-22: Class Registry

The framework resolves class-name strings through the Class Registry. This is how it handles morph maps, queue payloads and class names in configuration.

**Consequences (testable):**
- Resolving an unregistered class name throws an error that names the missing class.
- Models, jobs, events, listeners, notifications, mailables and policies are registered automatically when their module loads.

### 4.5 Support and Collections

#### FR-23: Collections with PHP array semantics

App Developers can use `Collection` and `LazyCollection` with every Laravel 13 method. Upstream Component: Collections.

**Consequences (testable):**
- Key order is always preserved, including integer-like keys.
- Integer-like string keys are normalised the way PHP normalises them.
- List-versus-associative behaviour (for example `values()`, `filter()` keeping keys, `json_encode` shape) matches the Oracle.

#### FR-24: Strings, arrays and helpers

App Developers can use `Str`, `Stringable`, `Arr`, `Fluent`, `Number`, `Uri`, `Benchmark`, `Sleep`, `Lottery`, `Once` and `Pipeline` with Laravel 13 behaviour. Upstream Components: Support, Pipeline.

**Consequences (testable):**
- Pluralization follows Doctrine Inflector's English rules.
- `Str.ascii` / `Str.slug` transliteration matches the Oracle.
- `Str.markdown` / `Str.inlineMarkdown` honour the `html_input` and `allow_unsafe_links` options as Laravel does, verified with XSS payloads like FR-46's.

#### FR-25: Dates

App Developers can use a Carbon-equivalent date API: `now()`, `Date`, PHP `date()` format strings, `diffForHumans`, `startOf*` / `endOf*`, and test-clock control (`setTestNow`, `travelTo`).

**Consequences (testable):**
- Formatting and parsing in Differential Tests match the Oracle.
- The test clock is reset after every test.

#### FR-26: Macros, conditionables and traits

App Developers can `macro()` any class Laravel marks Macroable, use `when()` / `unless()` where Laravel provides Conditionable, and compose traits (as mixins) that run `boot<Trait>` / `initialize<Trait>` the way Laravel does. Upstream Components: Macroable, Conditionable, Reflection.

### 4.6 HTTP Layer

**Description:** HTTP runs directly on `Bun.serve` with Web `Request`/`Response`. The router, middleware pipeline and request/response objects are Laravel's, ported. There is no third-party HTTP framework. Upstream Components: Http, Routing, Cookie, Session.

#### FR-27: HTTP kernel on Bun

App Developers serve the app with `bun artisan serve` in development and with a production server entry point in production.

**Consequences (testable):**
- No third-party HTTP framework appears in any Package's dependencies.
- Concurrent requests never see each other's request, session, auth or container-scoped state.

#### FR-28: Requests

Controllers read input with Laravel's Request API: `input`, `query`, `all`, `only`, `except`, `has`, `filled`, `boolean`, `date`, `file`, `json`, `ip`, `header`, `bearerToken`, `isMethod`, `routeIs`, `expectsJson`, and trusted-proxy handling.

**Consequences (testable):**
- Input accessors are synchronous in controllers and in every middleware except the header-only global middleware that run before the body is read (`ValidatePostSize`, `TrustProxies`, the `HandleCors` preflight, `PreventRequestsDuringMaintenance`). The body is loaded once, after those middleware and before the rest of the pipeline.
- The `ValidatePostSize` limit is enforced before the body is buffered and parsed, so an oversized body is rejected without being read in full.
- Uploaded files are available as `UploadedFile` with `store()` / `storeAs()`.

#### FR-29: Responses

Controllers return views, strings, arrays or models (as JSON), `response()` builders, redirects (`to`, `route`, `back`, `with`), downloads, file responses and streamed responses, and can attach cookies and headers.

#### FR-30: Routing

App Developers can register routes with:

- `Route.get` / `post` / `put` / `patch` / `delete` / `options` / `any` / `match` and **`query`**
- required and optional parameters, and regex constraints
- named routes, groups, prefixes, subdomains and resource controllers
- implicit and explicit route model binding, scoped bindings and `fallback`
- `route:cache`

**Consequences (testable):**
- An htmx `hx-query` request reaches a `Route.query` handler.

#### FR-31: Middleware

App Developers can register global, group and route middleware, with aliases, priority, parameters and terminable middleware.

**Consequences (testable):**
- Laravel's built-in middleware are present and behave as Upstream does:
  - `TrimStrings`, `ConvertEmptyStringsToNull`
  - `HandleCors`, `TrustProxies`, `ValidatePostSize`
  - `ThrottleRequests`
  - `EncryptCookies`, `AddQueuedCookiesToResponse`, `StartSession`, `ShareErrorsFromSession`
  - `SubstituteBindings`
  - `ValidateSignature`
  - `PreventRequestsDuringMaintenance`
  - `PreventRequestForgery` (Laravel 13's origin-based CSRF check), alongside the token check in FR-32

#### FR-32: CSRF protection

State-changing requests are protected by token-based CSRF, with Laravel's semantics.

**Consequences (testable):**
- A request without a valid token returns 419.
- The token is accepted from the `_token` field, `X-CSRF-TOKEN`, or `X-XSRF-TOKEN`.
- `@csrf` and `csrf_token()` are available in Blade.
- An htmx Request carrying the token through inherited `hx-headers` passes.

#### FR-33: Sessions and cookies

App Developers can use sessions with the `file`, `cookie`, `database`, `redis` and `array` drivers, flash data, `regenerate` / `invalidate`, and encrypted cookies.

#### FR-34: URL generation

App Developers can generate URLs with `route()`, `url()`, `asset()`, `action()`, signed URLs and temporary signed URLs.

**Consequences (testable):**
- A tampered signed URL fails `ValidateSignature` with 403.

#### FR-35: Error handling and logging

**Errors:** App Developers customise reporting and rendering in `withExceptions`.

**Logging:** App Developers log through channels: `single`, `daily`, `stack`, `stderr`, `syslog`, `null`, and custom channels. Upstream Component: Log.

**Consequences (testable):**
- In `local`, unhandled exceptions render a debug error page.
- In `production`, they render a generic page.
- JSON requests get JSON errors.
- htmx Requests get an HTML error Fragment with the correct status code.

#### FR-36: Rate limiting

App Developers can define limiters with `RateLimiter.for()` and apply `throttle` middleware. Throttled requests get 429 with `Retry-After`.

### 4.7 htmx 4 Integration (Xaravel Component)

**Description:** htmx support is part of the framework's core. Laravel has no htmx integration, so this feature is verified by Xaravel Tests, not Ported Tests. Realizes UJ-2.

#### FR-37: htmx Request detection

Controllers and middleware can read htmx context:

- `request.htmx()`: is this an htmx Request?
- `isBoosted()`
- `requestType()`: full or partial
- `currentUrl()`
- `isHistoryRestore()`
- `source()`
- `target()`

These come from `HX-Request`, `HX-Request-Type`, `HX-Boosted`, `HX-Current-URL`, `HX-History-Restore-Request`, `HX-Source` and `HX-Target`.

**Consequences (testable):**
- Each accessor reads its header. `htmx()`, `isBoosted()` and `isHistoryRestore()` return booleans, and are `false` when the header is missing.
- `requestType()` returns `full` or `partial`.
- `target()` parses htmx 4's `tag#id` format.
- `expectsJson()` is false for an htmx Request, because htmx 4 sends `Accept: text/html`.

#### FR-38: htmx response helpers

Controllers can set `HX-Trigger`, `HX-Location`, `HX-Redirect`, `HX-Refresh`, `HX-Retarget`, `HX-Reswap`, `HX-Reselect`, `HX-Push-Url` and `HX-Replace-Url` through fluent response methods.

**Consequences (testable):**
- An `HX-Trigger` event with a payload is serialized as JSON that htmx 4 accepts.
- There are no helpers for headers that htmx 4 removed, such as `HX-Trigger-After-Swap` and `HX-Trigger-After-Settle`.

#### FR-39: Fragment responses

Controllers can return one or more named Fragments of a view, for example `view('invoices.index', data).fragment('row')`, instead of the full page.

**Consequences (testable):**
- Only the Fragment's HTML is sent.
- Several Fragments, wrapped in `<hx-partial>` elements or marked out-of-band, can be returned in a single response.

#### FR-40: Validation failure on htmx Requests

When validation fails on an htmx Request, Xaravel re-renders the form Fragment with errors, old input and status 422, instead of redirecting.

The form Fragment is chosen in this order:
1. The Fragment the developer declared with `.fragment(view, name)` on the route or the Form Request.
2. A Fragment whose name matches the `id` in `HX-Target`, in the view the route last rendered.
3. Otherwise, the error bag is returned as a 422 Fragment using the `validation-errors` component.

**Consequences (testable):**
- A non-htmx request to the same route still gets Laravel's redirect-back with errors and old input.

#### FR-41: Redirects on htmx Requests

Controller code is the same as in Laravel: `return redirect().route('invoices.index')`. The framework decides how the redirect is sent:

- **Non-htmx request:** a 302, exactly as in Laravel.
- **htmx Request:** a 200 response with `HX-Location`. htmx fetches the new page, swaps it in and updates the URL, so it feels like navigating without a full reload. A plain 302 would be followed silently by `fetch()` and the whole page would be swapped into the target element.
- **Explicit opt-in:** `redirect().route(...).hxRedirect()` sends `HX-Redirect`, a full browser reload, for cases like logout.

**Consequences (testable):**
- The same controller action returns 302 to a non-htmx request, and 200 with `HX-Location` to an htmx Request.
- Flash data and `with()` values survive both paths.

#### FR-42: Full page versus partial rendering

A boosted or history-restore htmx Request gets the full layout. A partial request (`HX-Request-Type: partial`) gets only the requested Fragment. If it names no Fragment, it gets the layout's `content` section, the `@yield('content')` / `{{ $slot }}` region.

**Consequences (testable):**
- The same route returns the full page to a non-htmx request, to a boosted request and to a history-restore request.
- It returns only the content region to a partial htmx Request.
- Every response that passes through the view or response seams sends `Vary: HX-Request, HX-Request-Type`, whether or not the request is an htmx Request, so a full page and a Fragment never share a cache entry. This header is the only effect the htmx Integration has on a non-htmx request.

#### FR-43: Streaming

Controllers can stream server-sent events, `multipart/mixed` responses (for hx-multipart), and WebSocket upgrades through `Bun.serve`.

**Consequences (testable):**
- Each server-sent event reaches the client when it is written, not when the handler finishes.
- Each part of a `multipart/mixed` response is flushed as it is written.
- A WebSocket upgrade on a route returns status 101 and hands the socket to the route's handler.

### 4.8 Blade

**Description:** Blade's compiler is ported and produces JavaScript render functions instead of PHP. Upstream Component: View. Divergence: DIV-5.

#### FR-44: Directives

Templates support every Blade directive in Upstream at the Baseline Pin, including:

- **Control flow:** `@if` / `@else` / `@unless` / `@isset` / `@empty`, `@switch`, `@for` / `@foreach` / `@forelse` / `@while`, the `$loop` variable.
- **Layouts and includes:** `@include*`, `@each`, `@extends` / `@section` / `@yield` / `@parent`, `@stack` / `@push` / `@prepend`, `@once`.
- **Environment and auth:** `@env` / `@production`, `@auth` / `@guest`, `@can` / `@cannot`.
- **Forms and errors:** `@error`, `@csrf`, `@method`, `@checked` / `@selected` / `@disabled`, `@class` / `@style`.
- **Output:** `@json`, `@js`, `@verbatim`, `@php`-equivalent code blocks (TypeScript, not PHP).
- **Assets and htmx:** `@vite`, `@fragment`.
- **Custom directives:** `Blade.directive()`.

#### FR-45: Blade components

Templates support anonymous and class-based Blade components (not to be confused with a Component, §3):

- `<x-name>` tags with `$attributes` merging
- `@props` and `@aware`
- default and named slots, and dynamic components

#### FR-46: Escaping

`{{ }}` output is HTML-escaped and `{!! !!}` is raw, matching Laravel exactly.

**Consequences (testable):**
- A Xaravel Test suite of XSS payloads produces the same escaped output as the Oracle. Its expected values are generated by the Oracle (FR-6), but it has no Upstream counterpart, so it isn't counted in the Conformance Rate (FR-2).

#### FR-47: Async rendering and caching

Rendering a view returns a Promise. Blade components may await data.

**Consequences (testable):**
- Reading a relationship that isn't loaded during rendering throws (Strict Loading, DIV-2).
- `view:cache` precompiles all templates.

#### FR-48: Blade test adaptation

The View Component's Ported Tests keep every Upstream template input, with PHP expressions translated to TypeScript by the mechanical rule in `PORTING.md` (FR-8).

**Consequences (testable):**
- Assertions on generated PHP are replaced by Differential Tests on rendered HTML, as DIV-5 specifies. Only the Oracle-backed assertions count towards the Conformance Rate.
- Snapshot tests on the JS output are extra regression guards. They are Xaravel Tests and never count as conformance passes.

#### FR-49: Vite integration

`@vite` emits tags from the Vite manifest in production and points at the Vite dev server in development, as Laravel does.

**Consequences (testable):**
- A per-request CSP nonce (`Vite.useCspNonce()`, `csp_nonce()`, `@nonce`) is applied to Vite's tags, to the htmx script tag, and to htmx 4's inline-script configuration. A page served under a strict CSP still runs htmx.

### 4.9 Validation

Upstream Component: Validation.

#### FR-50: Validator

App Developers can validate with every Laravel 13 rule, rule objects, closure rules, conditional rules, nested and array (`*`) rules, custom messages and attributes, and translated messages.

**Consequences (testable):**
- Default error messages match the Oracle.
- The `regex` / `not_regex` rules take JavaScript `RegExp` patterns (DIV-10).
- `email:spoof` (look-alike character detection) comes after the alpha, and its Test IDs are recorded as `deferred:email-spoof` until then.

#### FR-51: Form Requests

App Developers can define Form Requests with `authorize`, `rules`, `messages` and `prepareForValidation`, and call `request.validate()`. Realizes UJ-2.

#### FR-52: Async rules

Rules that perform IO (`exists`, `unique`, and closures that query) are awaited.

**Consequences (testable):**
- `validateSync()` throws when the rule set contains an IO rule.

### 4.10 Database

Upstream Components: Database (Query, Schema, Migrations), Pagination, Redis. Divergence: DIV-1.

#### FR-53: Connections

App Developers configure connections with Laravel's `.env` keys.

**Consequences (testable):**
- SQLite (through `bun:sqlite`) and Postgres (through `Bun.sql`) are supported at the public alpha.
- MySQL, MariaDB and SQL Server drivers come later (§7.2).
- Read/write connection splitting and multiple named connections work.

#### FR-54: Query builder and grammars

App Developers can build queries with Laravel's full query builder API.

**Consequences (testable):**
- Building a query and calling `toSql()` is synchronous.
- IO Terminals return Promises, and builders can be awaited directly.
- Generated SQL matches the Oracle for all five grammars: sqlite, pgsql, mysql, mariadb, sqlsrv.

#### FR-55: Transactions

App Developers can run `DB.transaction(async () => …)`, nested transactions with savepoints, `afterCommit` callbacks and pessimistic locks.

**Consequences (testable):**
- Queries inside a transaction callback use that transaction's connection, even while other requests run concurrently.

#### FR-56: Migrations and schema

App Developers can write migrations with the Schema builder and run `migrate`, `migrate:rollback`, `migrate:fresh`, `migrate:refresh`, `migrate:status` and `schema:dump`.

#### FR-57: Seeding

App Developers can run seeders with `db:seed` and `migrate --seed`.

#### FR-58: Pagination

App Developers can use `paginate`, `simplePaginate` and `cursorPaginate`, with Blade pagination views and JSON serialization.

#### FR-59: Redis

App Developers can use Redis connections through `Bun.redis`. Redis Cluster and Sentinel are not supported at the public alpha.

#### FR-60: Same code on SQLite and Postgres

An app written against SQLite runs on Postgres by changing only `.env`. Realizes UJ-3.

**Consequences (testable):**
- The Skeleton's test suite passes against both SQLite and Postgres in CI.

### 4.11 Eloquent

Upstream Component: Database (Eloquent). Divergences: DIV-1, DIV-2.

#### FR-61: Models

App Developers can define models with Laravel's conventions: table name, primary key, timestamps, `fillable` / `guarded`, dirty tracking, `replicate`, `fresh`, `refresh`, and attribute access as properties.

#### FR-62: Relationships

App Developers can define every Laravel relationship type:

- `hasOne`, `hasMany`, `belongsTo`, `belongsToMany` with pivots
- `hasOneThrough`, `hasManyThrough`
- the polymorphic types and `morphToMany`
- `ofMany`

**Consequences (testable):**
- Eager loading works with `with()`, `load()`, `loadMissing()`, `withCount()` and the other `with*` aggregates.
- Eloquent Collections provide Laravel's model-collection methods (`load`, `loadMissing`, `modelKeys`, `fresh`, `find`, `toQuery`, …). The ones that do IO return Promises (DIV-1).

#### FR-63: Strict Loading by default

Reading a relationship that isn't loaded throws `LazyLoadingViolationException`.

**Consequences (testable):**
- `await model.related('posts')` loads the relationship if it's missing. `model.related('posts')` is the relationship query builder. There is no `relation()` method, and no callable `model.posts()` (DIV-2).
- `Model.automaticallyEagerLoadRelationships()` is available. When it is enabled, awaiting `related(name)` with no chained calls, on a model that came from a collection, eager-loads `name` for the whole collection in one query. Sync reads of the relation on the sibling models then succeed. A sync read of a relation that isn't loaded still throws. (Maintainer decision, 2026-10-16.)

#### FR-64: Casts, accessors and mutators

App Developers can use `Attribute` accessors and mutators, built-in casts (date, datetime, json, array, collection, encrypted, enum, hashed, AsStringable…) and custom casts.

#### FR-65: Model events and observers

Model events and observers run sequentially in registration order and are awaited.

**Consequences (testable):**
- Returning `false` from `saving` cancels the save.

#### FR-66: Serialization and API resources

Models serialize with `toArray` / `toJson` (which returns a string, as in Laravel) and `jsonSerialize`, honouring `hidden`, `visible` and `appends`. JavaScript's `toJSON()` delegates to `jsonSerialize()`, so `JSON.stringify(model)` gives Laravel's shape. `JsonResource` and `ResourceCollection` produce Laravel's response shape.

#### FR-67: Factories

App Developers can define model factories with states, sequences, relationships (`has`, `for`), `recycle`, and fake data from `@faker-js/faker`.

#### FR-68: Scopes, soft deletes and pruning

App Developers can use local and global scopes, `SoftDeletes`, `Prunable` / `MassPrunable`, and a morph map backed by the Class Registry.

### 4.12 Console (CLI)

Upstream Components: Console, Foundation (console commands).

#### FR-69: Commands

App Developers can define commands with Laravel's signature syntax (`{user} {--queue=}`), arguments, options, output styles, tables and progress bars, and run them with `bun artisan <command>`.

#### FR-70: Prompts

Commands can use `text`, `password`, `confirm`, `select`, `multiselect`, `suggest`, `search`, `pause`, `spin`, `table` and `form` prompts, with laravel/prompts behaviour.

**Consequences (testable):**
- Prompts can be tested with `expectsQuestion` / `expectsChoice`.

#### FR-71: Generators

App Developers can generate TypeScript files with every `make:*` and stub-backed command in Upstream at the Baseline Pin. That includes model, controller, request, middleware, migration, factory, seeder, job, event, listener, mail, notification, policy, rule, cast, command, component, view, resource, observer, scope, exception, test, provider, enum, class, interface, trait and channel, and the migration generators that the `database` drivers need (`cache:table`, `session:table`, `queue:table`, `queue:failed-table`, `queue:batches-table`, `notifications:table`).

**Consequences (testable):**
- `stub:publish` lets App Developers customise every stub.
- Each generator's Ported Test asserts against a reviewed TypeScript reference file, one per Upstream stub (DIV-5), not against Oracle output.
- Generated files compile under `tsc --strict`.

#### FR-72: Task scheduling

App Developers can define schedules in `routes/console.ts` using Laravel's frequency API, `withoutOverlapping`, `onOneServer` and `runInBackground`, and run them with `schedule:run` / `schedule:work`.

#### FR-73: REPL

App Developers can open an interactive TypeScript REPL with the app booted, using `bun artisan tinker`. This is in scope, even though Laravel ships tinker as a separate package. It is delivered with Console in Phase 7. It has no Upstream Test IDs, so it is verified by Xaravel Tests.

**Consequences (testable):**
- `bun artisan tinker` boots the app, so facades, helpers, models and `config()` are available in the REPL.
- An expression that returns a Promise is awaited before its result is printed.

### 4.13 Infrastructure Services

Upstream Components: Cache, Events, Filesystem, Encryption, Hashing, Process, Translation, Concurrency, Image, JsonSchema, Support (Context, HTTP client).

#### FR-74: Cache

App Developers can use the `array`, `file`, `database` and `redis` stores, with `remember`, `flexible`, tags, atomic locks, `increment` / `decrement`, and the `memo` driver.

#### FR-75: Events

App Developers can dispatch events to listeners, subscribers and queued listeners, and use `Event.fake()`.

**Consequences (testable):**
- Listeners are discovered from `app/Listeners` at build or boot time, without runtime type reflection (DIV-7).

#### FR-76: File storage

App Developers can use `Storage` disks: `local`, `public`, and `s3` through `Bun.S3Client`. They can stream, upload, generate temporary URLs, set visibility, and use `Storage.fake()`.

#### FR-77: Encryption

App Developers can encrypt and decrypt with `Crypt` using `APP_KEY`, with AES-256-CBC and AES-256-GCM, plus key rotation through `APP_PREVIOUS_KEYS`. For interop, Xaravel includes a codec for PHP's `serialize()` / `unserialize()` format covering scalars, arrays and plain objects. `Crypt::encrypt` and PHP session payloads use that format.

**Consequences (testable):**
- Payloads encrypted by PHP Laravel with the same key decrypt in Xaravel, and the reverse. This includes encrypted cookies and sessions, so a Laravel app can be migrated without logging every user out.

#### FR-78: Hashing

App Developers can hash and verify passwords with bcrypt and argon2id, and use `needsRehash`.

**Consequences (testable):**
- Bcrypt `$2y$` hashes produced by PHP Laravel verify in Xaravel, so a migrated users table keeps working (see OQ-8).
- For passwords longer than 72 bytes, hashing and verification give the same result as PHP. PHP's behaviour applies, never a runtime pre-hash, and Differential Tests prove it.

#### FR-79: HTTP client

App Developers can make outbound requests with `Http`: retries, timeouts, `pool`, macros, middleware, `Http.fake()` and stray-request prevention.

#### FR-80: Processes

App Developers can run processes with `Process` (sync, async, pools, pipes, timeouts) through `Bun.spawn`, and use `Process.fake()`.

#### FR-81: Context

Request-scoped `Context` data is added to log entries and carried into queued jobs.

**Consequences (testable):**
- Context is isolated per request.

#### FR-82: Concurrency

App Developers can run tasks concurrently with `Concurrency.run()`, under the closure rules of DIV-4.

#### FR-83: Localization

App Developers can use language files, `__()`, `trans()`, `trans_choice()` and pluralization, plus JSON translation files.

#### FR-84: Image and JSON Schema

App Developers can use Laravel 13's Image API (through `Bun.Image`) and its JsonSchema builder.

### 4.14 Queues and Bus

Upstream Components: Queue, Bus. Divergence: DIV-4.

#### FR-85: Jobs

App Developers can dispatch job classes with delays, retries, backoff, timeouts, `failed()` handlers and a failed-jobs table.

**Consequences (testable):**
- The `sync`, `database` and `redis` queue drivers are available at the public alpha.
- SQS and Beanstalkd come later.

#### FR-86: Workers

App Developers can run `queue:work` / `queue:listen` with `--queue`, `--tries`, `--max-jobs`, `--max-time` and graceful shutdown on SIGTERM, and use `queue:restart` and `queue:retry`.

#### FR-87: Chains, batches and job middleware

App Developers can use `Bus.chain`, `Bus.batch` (with progress and callbacks), job middleware, unique jobs, rate-limited jobs and `Queue.fake()` / `Bus.fake()`.

#### FR-88: Dispatching closures

App Developers can dispatch closures that receive their data as explicit, serializable arguments.

**Consequences (testable):**
- The payload carries the closure's source and arguments, signed with `APP_KEY`.
- A worker rejects a payload whose signature is invalid.
- A closure that captures outer variables fails at dispatch time with an explanatory error.
- On the worker, a rebuilt closure can use only its arguments, standard JavaScript built-ins, and Laravel's facades and global helpers by their Laravel names. Classes and models in its arguments are restored through the app's Class Registry. It has no access to any other global, or to the dispatching module's imports.

### 4.15 Mail, Notifications and Broadcasting

Upstream Components: Mail, Notifications, Broadcasting.

#### FR-89: Mail

App Developers can send Mailables built from Blade or Markdown templates, with CSS inlining, attachments, queued sending and `Mail.fake()`.

**Consequences (testable):**
- The `smtp`, `log`, `array` and `failover` transports are available at the public alpha. SES, Postmark, Resend and Mailgun come later.
- Markdown mail renders to the same HTML as PHP Laravel (league/commonmark), verified by Differential Tests. If `Bun.markdown` differs, a CommonMark-compliant library is used instead.

#### FR-90: Notifications

App Developers can send notifications through the `mail`, `database` and `broadcast` channels, on-demand and queued, and use `Notification.fake()`.

#### FR-91: Broadcasting

App Developers can broadcast events to channels with authorization callbacks.

**Consequences (testable):**
- The `log` and `null` drivers, plus a Pusher-protocol driver, are available.
- Running a WebSocket server (the equivalent of Reverb) is out of scope.

### 4.16 Security: Authentication, Authorization, Password Reset

Upstream Component: Auth.

#### FR-92: Authentication

App Developers can authenticate users with session guards and the `eloquent` and `database` user providers: `Auth.attempt`, `login`, `logout`, "remember me", the `auth` / `guest` middleware and password confirmation.

#### FR-93: Authorization

App Developers can define gates and policies, check them with `Gate`, `can()`, `@can` and the `can` middleware, and return `Response.deny()` with messages.

**Consequences (testable):**
- Policies resolve by naming convention, or by explicit registration.

#### FR-94: Password reset

App Developers can use the password broker: reset tokens, throttling, reset notifications, and token expiry.

#### FR-95: Email verification

App Developers can require email verification with `MustVerifyEmail`, signed verification URLs, and the `verified` middleware.

### 4.17 Testing Toolkit for App Developers

Upstream Components: Testing, Foundation (testing). Xaravel Components: Mockery, Testbench.

#### FR-96: HTTP tests

App tests are written in a Pest-style form: `uses(TestCase, RefreshDatabase)`, then `test(name, async function () { … })`, with `this` bound to the TestCase. They call `await this.get('/invoices')` and use the TestResponse assertions (`assertOk`, `assertRedirect`, `assertSee`, `assertJson`, `assertSessionHasErrors`, …). HTTP test calls return a thenable response, so assertions chain fluently, for example `await this.post(url, data).assertRedirect(route('x')).assertSessionHas('ok')`. `make:test` generates this form.

**Consequences (testable):**
- htmx assertions are available: `assertHxTrigger`, `assertFragment`, `assertHxLocation`.

#### FR-97: Console tests

App tests can run `this.artisan('cmd')` with `expectsQuestion`, `expectsOutput` and `assertExitCode`.

#### FR-98: Database testing

App tests can use `RefreshDatabase`, `DatabaseTransactions`, factories, `assertDatabaseHas` / `Missing` / `Count` and `assertModelExists`.

#### FR-99: Fakes and time

App tests can fake Bus, Event, Mail, Notification, Queue, Storage, Http, Process and Exceptions, and control time with `travel` / `travelTo` / `freezeTime`.

#### FR-100: Mocking library

App and framework tests can mock with a Mockery-compatible API, for example `mock(X).shouldReceive('m').once().with(1).andReturn(2)`. It ships as `@xaravel/mockery`, and is delivered in Phase 0 (§7.3) because Ported Tests need it.

**Consequences (testable):**
- Unmet expectations fail the test when it finishes.
- It covers every Mockery API used by the Upstream test suite at the Baseline Pin, as listed by the FR-116 scan.

#### FR-101: Testbench

App Developers who write reusable libraries for Xaravel, and the framework's own integration tests, can boot a Testbench app.

**Consequences (testable):**
- The Testbench supports equivalents of `WithConfig`, `WithMigration`, `RequiresDatabase` and `WithEnv`, plus a default `users` migration and `UserFactory`.

#### FR-102: Browser tests

App tests can drive a real browser against the running app, using an API modelled on Pest 4's browser testing: `visit('/login')`, `type`, `click`, `assertSee`, `assertUrlIs`, screenshots, and device emulation. Like Pest 4, it is built on Playwright. For new projects, Laravel 13's docs recommend Pest 4's browser testing over Dusk, which uses ChromeDriver.

**Consequences (testable):**
- Browser tests run headless in CI.
- Pages that use htmx 4 swaps can be asserted after the swap settles.

### 4.18 AI

Upstream packages: `laravel/ai`, `laravel/mcp`.

#### FR-103: AI SDK

App Developers can define Agent classes with tools, structured output, streaming, embeddings, reranking, images and audio, provider failover, and `AI.fake()`, built on the Vercel `ai` SDK.

**Consequences (testable):**
- Conversation memory can be stored in database tables.

#### FR-104: MCP servers

App Developers can define MCP servers with Tools, Resources and Prompts.

**Consequences (testable):**
- Servers can be exposed over HTTP on a Xaravel route (`Mcp.web()`) or over stdio through the CLI (`Mcp.local()`).
- HTTP servers can be protected with a Xaravel auth guard. OAuth through Passport or Sanctum is a later concern (OQ-6).

### 4.19 Xaravel Boost (Xaravel Component)

**Description:** an MCP server that lets agents look inside a Xaravel app, or the Xaravel monorepo itself. It is built on FR-104 and modelled on `laravel/boost`, whose tests are ported where they apply. Realizes UJ-4, UJ-6.

#### FR-105: Installation and agent guidelines

App Developers can run `bun artisan boost:install` to register Boost with their coding agents and write versioned guidelines (`CLAUDE.md` / `AGENTS.md`) and agent skills.

**Consequences (testable):**
- The Skeleton offers to run this during installation.

#### FR-106: App introspection tools

App Agents can query:

- application info: versions, installed Packages, environment
- routes, with Fragment-returning routes marked
- container bindings and config keys
- database connections and schema, plus read-only queries once enabled (FR-110)
- log entries, the last error, and browser logs
- absolute URL generation
- the list of CLI commands, with their signatures

#### FR-107: Test-run tool

App Agents can run the app's tests, or a filtered subset, and receive failures in a structured form: test name, assertion, expected and actual values, and location.

#### FR-108: Documentation search

App Agents can search Xaravel's documentation for the installed version, through a local index shipped with the Package rather than a hosted service.

**Consequences (testable):**
- Search works with no network access.
- Results come from the docs of the installed Xaravel version, not the latest one.

#### FR-109: Framework mode

Inside the Xaravel monorepo, Framework Agents can query:
- the Test Inventory and each Test ID's status in the Expectations File
- the Conformance Rate per Component
- the Test IDs assigned to a Story
- Divergence Records and open Escalations

Realizes UJ-4.

**Consequences (testable):**
- Framework mode is delivered in Phase 0, as a small MCP server built on the MCP TypeScript SDK directly, so it doesn't wait for `@xaravel/mcp` (Phase 8).
- It is read-only. It can't change the Expectations File or any Protected Path.

#### FR-110: Safe by default

Boost tools are read-only by default. Query, eval and write tools must be enabled explicitly, and they are refused when `APP_ENV=production`.

## 5. Public API Contract

### 5.1 Parity rule

A Xaravel API has the same name, arguments, defaults and behaviour as its Laravel 13 counterpart. Where Laravel exposes objects from Symfony, Carbon or Monolog, parity covers only what Laravel's public surface and Upstream tests actually use, not those libraries' full APIs (see OQ-3). Expressions inside Blade templates are TypeScript, translated from PHP by the mechanical rule in `PORTING.md` (FR-48). The only allowed differences are TypeScript syntax and the listed Intentional Divergences:

- `->` and `::` become `.`.
- Methods stay camelCase.
- Database attributes keep their column names, for example `created_at`.

Examples of the mapping are in the addendum. Any other difference is a bug, with two exceptions:

- **Xaravel-only additions** to an Upstream surface are allowed only where an FR or a DIV specifies them, for example the htmx accessors (FR-37), `.hxRedirect()` (FR-41), `validateSync()` (FR-52), `model.related()` (FR-63), the htmx test assertions (FR-96), the async companions (DIV-1) and `inject` (DIV-3).
- **htmx Requests** are handled by the htmx Integration (FR-35, FR-40 to FR-42). For any request that isn't an htmx Request, behaviour stays exactly Upstream's, except for the `Vary` header in FR-42.
- **Named arguments** become one options object keyed by the camelCase parameter names, for example `new Envelope({ subject: 'Hi' })` (architecture AD-26).

**PHP semantics are ported, not skipped.** Where Laravel relies on PHP behaviour, Xaravel reproduces it with explicit helpers. Examples are loose comparison (`collect([1]).contains('1')` is `true`), numeric-string handling, ordered array keys, value-copy semantics and exception classes. `@xaravel/runtime` provides those helpers (architecture AD-19), and `PORTING.md` (FR-8) documents them, along with the TS mapping for by-reference parameters and PHP exception classes.

A TypeScript limitation that no DIV covers is never worked around silently. It goes through an Escalation (FR-114), and the Maintainer either adds a DIV or rejects the difference.

**Adapting versus skipping:**
- A test is **adapted** when its Upstream intent can still be verified under a DIV's test-adaptation rule. Examples: awaiting an IO call (DIV-1, DIV-8), or `await m.related('rel')` in place of lazy access (DIV-2).
- A test is **skipped** as `intentional-divergence` only when the behaviour it tests doesn't exist in Xaravel.
- Adapted tests are marked `adapted:DIV-<n>.<clause>` in the Expectations File, and each changed assertion line carries the same marker. The dashboard counts them separately, and the Fidelity Review checks each one against its DIV's rule.

### 5.2 Intentional Divergences

Each one has a Divergence Record, which must exist before the first Story that depends on it begins (FR-8):

- **DIV-1 Async IO Terminals.** "Sync core, async edges." The async surface is defined by interface, following the rules in the architecture document (AD-6). Each Package commits an `async-surface.json` that lists every Promise-returning public method and the async root it reaches. CI regenerates the list from the type declarations and fails on drift.
  - **Async roots:** the store and driver contracts that perform IO, and only those methods in them where some Upstream driver does IO. They are database statements, cache stores (including `array`, for a uniform interface), session handlers, queue connections, mail transports, filesystem IO, Redis, HTTP-client sending, broadcasting and process runs. `Storage.url()`, hashing, encryption, translation, view loading and Config stay sync.
  - **Async by derivation:** a method is async if it reaches a root, or if it accepts a callback that may be async. The second rule covers gates and policies, listeners and observers, model events, validation closures and rule objects, `Cache.remember`, transactions, binding resolvers, middleware and rate limiters. So `Gate.allows()`, `can()`, `Validator.passes()` / `fails()`, `Event.dispatch()` and model `save()` return Promises. A method that is async on any path is async on all paths.
  - **Sync, loaded once:**
    - The session, after `StartSession` has loaded it. This includes `old()` and `$errors`, and the session is persisted when the response is sent.
    - Request input (FR-28).
    - The authenticated user, after `StartSession` or the `auth:<guard>` middleware has resolved it: `request.user()`, `Auth.user()` / `check()` / `id()`, `@auth`. Reading a guard that was never resolved throws an error pointing to `await Auth.guard(name).authenticate()`.
  - **Also sync:** Collections, `Str`, `Arr`, the container, query building and `toSql()`, model attributes, and Blade compilation.
  - **Dual helpers:** `retry`, `rescue`, `tap`, `value`, `transform`, `once`, `when` / `unless`, `Benchmark.measure` and `Sleep` return a Promise only when given an async callback.
  - **Thenables:** query builders, Relations and pending HTTP requests can be awaited directly.
  - **Self-starting calls:** `dispatch()`, `Bus.chain(…).dispatch()`, `Bus.batch(…).dispatch()`, `broadcast()` and the test `artisan()` call start on their own once the current synchronous code has finished, as Laravel's destructors do. So chained calls such as `.onQueue('emails')` still apply. Awaiting one is optional and never runs it twice. The Scope Frame waits for it before the unit ends, and creating one outside a Scope Frame throws.
  - **Callbacks:** callbacks passed to sync APIs, such as Collection `map` / `each` / `filter`, must be sync. The type system and lint reject async ones. Use the async companions instead: `eachAsync`, `mapAsync`, `filterAsync`, `rejectAsync`, `firstAsync`, `everyAsync`, `containsAsync` and `partitionAsync`. Callbacks passed to async APIs may be async, and are awaited in registration order.
  - **Lazy database collections:** `cursor()` and `lazy()` return an `AsyncLazyCollection`, iterated with `for await`. Adaptation: `instanceof LazyCollection` becomes `instanceof AsyncLazyCollection`.
- **DIV-2 Strict Loading by default.** Relationships must be eager-loaded or explicitly awaited (FR-63).
  - **Definition:** a relationship is defined as a decorated accessor, for example `@hasMany(() => Post) accessor posts!: Collection<Post>`.
  - **Reading:** `model.posts` returns the loaded relation, or throws `LazyLoadingViolationException`.
  - **Building:** `model.related('posts')` is the relationship builder, and awaiting it unchained loads the relation if it is missing.
  - **Adaptation:** Laravel's `$m->rel()` becomes `m.related('rel')`. Tests that rely on lazy loading through property access are adapted to `await m.related('rel')`.
  - **Automatic eager loading:** When it is enabled, awaiting `related(name)` with no chained calls, on a model that came from a collection, eager-loads `name` for the whole collection in one query. Sync reads of the relation on the sibling models then succeed. A sync read of a relation that isn't loaded still throws. (Maintainer decision, 2026-10-16.)
- **DIV-3 Explicit injection tokens.** TypeScript erases parameter types, so autowired dependencies are declared in one form, `inject({ <paramName>: <Spec>, … })` (architecture AD-4).
  - **Where it goes:** it is a decorator on classes (constructor parameters) and methods, and a wrapper for closures, for example `inject({ post: Post }, (post) => …)`.
  - **Keys:** key order is parameter order, and keys are parameter names.
  - **Values:**
    - a token or class;
    - `String`, `Number` or `Boolean`, which coerce as PHP does;
    - `primitive`, which does not coerce;
    - a contextual-attribute descriptor such as `Config('app.timezone')` or `CurrentUser()`;
    - `oneOf(A, B)` for union types.
  - **What uses it:** controller method injection, implicit route model binding (FR-30, matched by name), Form Request resolution, `make(X, { name })` and `needs('$name')`.
  - **No declaration:** an action without `inject` receives route parameters positionally. There is no static `inject` list.
  - **Tokens:** each Contract exports a runtime token under its interface's name. The container also accepts Laravel's string abstracts and aliases (`app('cache')`).
- **DIV-4 Closure serialization.** Only closures with explicit arguments can be queued or run concurrently (FR-88). The rule applies to every API that serializes a closure, including queued closures, `Bus.chain` and `Bus.batch` callbacks (FR-87) and `Concurrency.run` (FR-82).
  - **What the closure can reach:** its arguments, and Laravel's facades and global helpers by their usual names (`Mail`, `Log`, `now`, …).
  - **Arguments:** everything else, including app classes and models, is passed as an argument. Models travel as `ModelIdentifier`, as in `SerializesModels`.
  - **Job classes** are unaffected.
- **DIV-5 Generated code is TypeScript.** Blade compiles to JS, and generators emit TS. Tests that assert PHP output are replaced by tests on rendered output (Differential Tests) and TS snapshots.
- **DIV-6 PHP-only behaviour.** `php-only` is limited to an enumerated catalogue: PHP extensions, OPcache, `php.ini` settings, engine internals (for example `gc_*`, `opcache_*`, `declare(ticks)`), and PHP-runtime reflection with no TypeScript analogue. Type juggling is *not* `php-only`; it is ported (§5.1). Every `php-only` entry needs an approved Escalation (FR-3).
- **DIV-7 Discovery without reflection.** Event listeners, policies and commands are found through file conventions and explicit registration, not runtime type reflection.
- **DIV-8 Async test bodies.** Ported Tests that touch IO become `async`, and Laravel's test helpers return awaitable results. A fake or TestResponse assertion that takes a predicate returns a Promise, because the predicate may be async.
- **DIV-9 PHP value model.** PHP values map to TypeScript by fixed rules, which the architecture document sets out (AD-9):
  - **Null:** `null` is the only PHP null, and `undefined` never escapes a public API.
  - **Arrays:**
    - A PHP list is a JS `Array`.
    - A map whose keys are all non-integer-like strings is a plain object.
    - Any other PHP array is an ordered `PhpArray`, which keeps PHP key order and key normalisation.
    - Public APIs copy values, as PHP does.
  - **Integers:** database integers are read losslessly. A column is *hinted lossless* by an Eloquent `'bigint'` cast, by the query builder's `castsBigint(cols)`, or by the connection setting `integers: 'bigint'`. A hinted column always returns `bigint`. Any other integer column returns a `number` when the value is within ±`Number.MAX_SAFE_INTEGER` (2^53 − 1), and a larger value throws `IntegerOverflowException`, naming the column. JSON output writes a `bigint` as its exact digits.
  - **int/float:** the distinction is preserved where Laravel's behaviour depends on it.
  - **Marker interfaces:** they become brands. `implements ShouldQueue` requires a brand getter, which generators emit, and the framework checks it without instantiating the class.
  - **PHP comparison:** an object that PHP compares with `==` exposes its compared properties through `[Symbol.for('xaravel.php.props')]()`, so the test matchers compare it as PHP does.
- **DIV-10 Regular expressions.** User-supplied patterns, such as the `regex` validation rule and `Str.match` / `Str.replaceMatches`, are JavaScript `RegExp`, not PCRE. `PORTING.md` documents the PCRE features that have no equivalent. Upstream tests that depend on them are skipped as `intentional-divergence:DIV-10`.
- **DIV-11 Long-lived application.** An application boots once and serves many units of work: one per process in production, and a fresh one per test, as in Laravel. This is Laravel Octane's model.
  - **Scope Frames:** each request, job, command, scheduled task, test or WebSocket message runs in a Scope Frame, found through `AsyncLocalStorage`.
  - **What a frame can't change:** after boot, `bind`, `singleton`, routes, macros and `Blade.directive` throw `ScopeFrameException` inside a request, job or command. Inside a test they apply to that test only.
  - **What a frame holds:** runtime writes made during the unit go into the frame and are discarded when it ends. These are `config([...])`, `app().instance()`, facade fakes, locale, auth, session, Context and static setters such as `Model.unguard()`. So concurrent requests never see each other's state.
  - **Singletons and providers:** singletons live for the life of the application. Provider `boot()` must not read per-request state.
  - **Job timeouts:** PHP's pcntl is unavailable, so `queue:work --timeout` is enforced by a supervisor process that kills the worker child. Upstream timeout tests adapt to that.
- **DIV-12 PHP member namespaces and magic members.** PHP lets a property and a method share a name, and resolves some members dynamically (`__get`, `__call`, `ArrayAccess`). JavaScript has one namespace per object, and no such hooks outside a Proxy.
  - **Option pairs** such as `casts` / `casts()`, `middleware`, `backoff`, `tries`, `attachments` and `via` accept either form.
  - **Framework methods that share a name with state** (`delay()`, `afterCommit()`, `subject()`, …) keep the method name. The state is read through Upstream's getters.
  - **Model accessors and scopes** are decorated: `@attribute(...) accessor title`, `@scope static published(query)`.
  - **Model config properties win:** `fillable(arr)` becomes `setFillable(arr)`, and `touches(rel)` becomes `isTouching(rel)`.
  - **Request:** no magic input properties. Use `request.input('title')`, not `request.title`.
  - **Collection index access** is `collection.get(0)`, not `collection[0]`.
  - **Dynamic finders** (`whereEmail()`) are not supported. Use `where('email', v)`.
  - **The full pair list** is generated from Upstream at the Baseline Pin and kept in `PORTING.md`.

### 5.3 Versioning and Deprecation Policy

- **Before the public alpha:** `0.x`, released in lockstep. Any minor release may break the API, and every release notes its Baseline Pin.
- **After the public alpha:** the policy is decided then (OQ-2). The intent is that Xaravel's major version mirrors Laravel's (Xaravel 13 targets Laravel 13).
- **Baseline Pin moves** happen only at Phase boundaries (FR-7). Laravel 14 (expected around Q1 2027) gets its own re-sync Epic.

## 6. Cross-Cutting NFRs

- **NFR-1 Runtime and language:** Bun 1.4 or later, TypeScript `strict`, ESM only. At the public alpha, macOS and Linux are supported on x64 and arm64, and CI runs on both. Windows support is best-effort after the alpha.
- **NFR-2 Dependency policy:** prefer, in this order, a Bun built-in, then a maintained npm package that works on Bun, then writing it ourselves. Every third-party dependency is recorded with a reason in its owning Package's README. Every ported PHP library has exactly one owning Package, listed in the architecture document (AD-22).
- **NFR-3 Async safety:** type-aware lint rules (`no-floating-promises`, `await-thenable`, `no-misused-promises`) run in CI over the framework, the Ported Tests and the Skeleton.
- **NFR-4 Request isolation:** under concurrent load, no request, session, auth, transaction, Context or scoped-container state crosses between requests. Dedicated concurrency tests verify this.
- **NFR-5 Security:**
  - CSRF, output escaping, encryption, signed URLs and signed queue payloads behave the same as in Laravel.
  - The repo publishes a `SECURITY.md` with a disclosure process.
  - CI audits dependencies.
- **NFR-6 Performance:** correctness comes first. A benchmark suite runs and is reported for information only. It never blocks a release before the public alpha.
- **NFR-7 Determinism:** Ported Tests and Xaravel Tests are deterministic and need no network unless tagged with a backend. Test state (clock, fakes, mocks, `Str` factories, and the `Sleep`, `Once` and `Lottery` state that Upstream also resets) resets after each test.
- **NFR-8 Licence, attribution and trademark:**
  - The project is MIT-licensed and non-commercial. The LICENSE keeps Laravel's copyright notice alongside Xaravel's, because ported code is a derivative work.
  - Xaravel follows Laravel's trademark policy (laravel.com/legal/trademark):
    - It is described as "a TypeScript port of Laravel".
    - The README, docs and npm descriptions carry a notice that it is not affiliated with or endorsed by Laravel Holdings Inc.
    - It uses no Laravel logo or artwork, and no domain containing "Laravel".
    - It is not a commercial product or service.
- **NFR-9 Documentation:** each Component has documentation that mirrors Laravel 13's docs structure and calls out every divergence it is subject to. Text adapted from `laravel/docs` (MIT) keeps its copyright notice.
  - Every public API a Story adds has docblocks before the Story is done.
  - User-facing docs for every Component in Phases 1–8 are an alpha requirement (§7.2).
- **NFR-10 Agent operability:** every Story can run unattended, in its own git worktree. Its Test IDs, commands and acceptance check are machine-readable. A human is needed only for Epic review, for Escalations (FR-114) and for Infrastructure Stories that touch Protected Paths (FR-112).
- **NFR-11 Release authority:** only the Maintainer holds npm and GitHub publish rights. Releases are published by CI, with npm provenance, from a tag the Maintainer approves. Framework Agents never receive publish credentials.

## 7. Scope

### 7.1 Non-Goals

Each Non-Goal has an ID, which `out-of-scope:<NG-N>` Skip Reasons name (FR-3).

- **NG-1** MongoDB support.
- **NG-2** Front ends other than htmx: no Inertia, React, Vue, Svelte, Livewire or Alpine starter kits.
- **NG-3** Node.js or Deno support.
- **NG-4** Running PHP code, or being a PHP compatibility layer.
- **NG-5** Laravel's first-party products beyond the framework, AI SDK, MCP and Boost: Sanctum, Passport, Cashier, Horizon, Telescope, Pulse, Reverb, Scout, Socialite, Dusk, Sail, Forge/Vapor/Cloud integrations. These are candidates for later (OQ-6).
- **NG-6** Cutting scope to a minimal v1. Scope is the full framework, delivered in Phases.
- **NG-7** Performance work before the public alpha (NFR-6).

### 7.2 Public Alpha Scope (the "MVP")

The public alpha ends the 0.x line. It requires:

- Phases 0–8 (§7.3) accepted. Everything the alpha requires is scheduled inside those Phases:
  - the Conformance System and agent guardrails (FR-1 to FR-9, FR-111 to FR-115), the PHPUnit-style matchers and Mockery (FR-116, FR-100), and Boost framework mode (FR-109), in Phase 0;
  - the htmx 4 Integration (FR-37 to FR-43) and the core of Foundation, in Phase 6;
  - the Skeleton and Installer (FR-15 to FR-17), the app Testing toolkit (FR-96 to FR-101) and the Testbench, in Phase 7;
  - Auth (FR-92 to FR-95), Queue (FR-85 to FR-88), MCP (FR-104) and Boost's app tools (FR-105 to FR-107, FR-110), in Phase 8.
- SM-1's alpha gate met.
- User-facing docs for every Phase 1–8 Component (NFR-9).
- The Maintainer's own htmx app running in production on Xaravel.

The alpha targets **Laravel 13**, at the newest 13.x Baseline Pin reached by a freeze point. The re-sync to Laravel 14 starts after the alpha. At the end of Phase 4 (Database), the Maintainer reviews progress against this plan. That review may re-sequence work, but it never cuts scope (NG-6).

**After the alpha, as Phase 9 and beyond:**

- The rest of Foundation (Cloud and other integrations).
- The Laravel 14 re-sync Epic.
- The AI SDK (FR-103).
- Boost documentation search (FR-108), and further Boost tools: record-rule and per-Package agent skills.
- `email:spoof` validation.
- Windows support.
- Browser tests (FR-102).
- MySQL, MariaDB and SQL Server drivers.
- Redis Cluster.
- Additional mail transports.
- SQS and Beanstalkd.
- AVIF, HEIC and JPEG XL image output, which needs codecs Bun does not ship on Linux (ESC-8.3-3).

Tests for those backends and features are recorded as `deferred:<item>` until then.

### 7.3 Phases

These are ordered by dependency. Components within a Phase run in parallel. Test counts are in the brief addendum. Foundation is split across Phases by sub-area: HTTP lifecycle, then console, then testing.

0. **Infrastructure:**
   - the Conformance System and agent guardrails (FR-1 to FR-9, FR-111 to FR-115)
   - `PORTING.md` and the Divergence Records, with the `PORTING.md` pilot on Support and Collections tests (FR-8)
   - `@xaravel/mockery` and the PHPUnit-style matchers (FR-100, FR-116)
   - the Oracle, and Boost framework mode (FR-109)
   - spikes that resolve OQ-4, OQ-8 and the rest of OQ-11
   - scans of Upstream at the Pin (DIV-12 name pairs, facade method lists, singleton bindings, closure-allowed names, the public API surface), and scaffolding for every Package (architecture AD-27)
1. **Foundations:** `@xaravel/runtime` first (Scope Frames, the Class Registry (FR-22), PHP value helpers and codecs), then `@xaravel/contracts`, including the Xaravel-only contracts (the alias table, the async thenable list, the view ABI and the test lifecycle), then Macroable, Conditionable, Collections, Reflection, Config and JsonSchema
2. Container, Support (core)
3. Pipeline, Encryption, Hashing, Filesystem, Process, Log, Translation, the shared ports of Symfony HttpFoundation, Mime and Finder (`@xaravel/http-foundation`, `@xaravel/mime`, `@xaravel/finder`), SerializableClosure (before Bus), Bus, Events
4. **Database:** grammars, then Eloquent, then Migrations
5. Pagination, Cache, Redis, Validation
6. **Web layer:**
   - Http, Cookie, Session, Routing
   - View (Blade), because htmx Fragments need it
   - the core of Foundation: application lifecycle, `bootstrap/app.ts`, providers, the HTTP kernel and its middleware, exception handling, Vite
   - the htmx 4 Integration
7. **Developer tooling:**
   - Console, and Foundation's console part (the `make:*` generators)
   - Mail
   - Testing, and Foundation's testing part (the app Testing toolkit)
   - the Testbench, followed by re-verification Stories that unlock the integration tests of Phases 1–7
   - the Skeleton and Installer
8. **App services:**
   - Queue, Concurrency, Broadcasting, Auth, Notifications, Image
   - MCP (FR-104) and Boost's app tools
9. **Post-alpha:** see §7.2.

The dogfood app (SM-3) can start once Phase 7 is accepted.

### 7.4 Risks and Mitigations

- **The moat is execution, not technology.** Others have tried Laravel ports; what's different here is the slow, verified work of passing Laravel's suite. Mitigation: the Conformance System and agent guardrails come first (Phase 0), so progress is honest from day one.
- **Size.** 275k lines of PHP source and about 13.5k test methods, and the last few percent of conformance historically takes the longest. The brief counts test methods; the Test Inventory counts datasets, so it has more entries. All sizing and SM-1 arithmetic use the Test Inventory's unit. Mitigation: SM-1 counts against Applicable Test IDs, and post-alpha work is explicitly phased.
- **Agents gaming the grader.** Mitigation: FR-3, FR-4, FR-111 to FR-114 and the counter-metrics.
- **Hidden async hazards:** state leaking across concurrent requests, and missing `await`s. Mitigation: DIV-1, NFR-3 and NFR-4. Transaction and connection scoping is prototyped in the first Database Epic.
- **Bun gaps** (Temporal, bcrypt, Redis Cluster, test primitives). Mitigation: Phase 0 spikes (OQ-4, OQ-8, OQ-11). `QUERY` support is already confirmed (OQ-7). Failing primitives become `deferred` entries or Escalations.
- **Upstream drift.** Laravel 14 is expected around Q1 2027. Mitigation: FR-7 pin bumps and a re-sync Epic.

## 8. Success Metrics

**Primary**
- **SM-1 Conformance Rate.** This is the overall rate and the rate per Component, published on the dashboard.
  - **Target:** it never decreases between Phase boundaries under the same Baseline Pin. A pin bump starts a new series. The dashboard shows both series and the Test Inventory diff between them.
  - **Alpha gate:** at least 90% of Applicable Test IDs (§3) for the Components in Phases 1–8 pass on every alpha Backend Variant (SQLite, Postgres, Redis, and the sync, database and redis queue drivers).
    - No `not-ported-yet` or `blocked-by` entries remain for those Components.
    - Quarantined tests count as not passing.
    - `intentional-divergence` skips stay in the denominator, so divergences cost conformance.
  - **Validates:** the thesis (§1), measured through FR-1 to FR-5.
- **SM-2 Epic first-pass acceptance.** The share of Epics the Maintainer accepts on first review, with no Test IDs sent back. Every Epic must eventually be accepted; this measures how often a rework round is needed.
  - **Target:** 90% or more from Phase 2 onwards. Phases 0–1 are calibration, used to tune `PORTING.md` and the review prompts, and don't count.
  - **Validates:** FR-8, FR-9, FR-109.
- **SM-3 Dogfood app.** The Maintainer's htmx app runs in production on Xaravel by the public alpha. Validates the features in §7.2.

**Secondary**
- **SM-4 Unattended Story completion.** The share of Stories that reach done with no human intervention. Tracking only: no target is set before the public alpha. Validates NFR-10.
- **SM-5 Pin currency.** The Baseline Pin is bumped to the latest Laravel 13.x tag at every Phase boundary. Validates FR-7.
- **SM-6 Divergence count.** The number of Intentional Divergences and of Test IDs tagged `intentional-divergence`, tracked so that growth is visible. Validates §5.2.

**Counter-metrics (do not optimize)**
- **SM-C1 Skip growth.** Don't raise SM-1 by skipping tests or weakening ported assertions. The Fidelity Review (FR-111), the assertion floor (FR-113) and the Skip Reason rules (FR-3) enforce this. Counterbalances SM-1.
- **SM-C2 Story throughput.** Speed is not a goal. A fast Story that fails review costs more than a slow one that passes. Counterbalances SM-4.
- **SM-C3 Benchmarks.** Don't optimize performance before the alpha (NFR-6).
- **SM-C4 Stars and downloads.** Adoption metrics before the alpha say nothing about readiness.

## 9. Open Questions

Every question is owned by the Maintainer and must be resolved by the gate shown.

1. **OQ-1 Blessing from Laravel Holdings (optional).** Resolved 2026-10-16: the Maintainer emails Taylor Otwell about the project before the first public npm publish.
2. **OQ-2 Post-alpha versioning.** Resolved 2026-10-16: Xaravel leaves 0.x and switches to versions that mirror Laravel's (13.x) once `bun create xaravel` produces a working starter site with auth and a dashboard (OQ-10).
3. **OQ-3 Symfony's test suites.** Resolved 2026-10-16: no. Parity with Symfony covers only what Laravel uses (§5.1). Laravel's suite and Oracle Differential Tests (architecture AD-22) grade the ports. Revisit only if defects keep appearing in Symfony-derived code.
4. **OQ-4 Temporal in Bun 1.4.** On 2026-10-16, Bun 1.4.3 has a global `Temporal`, and daylight-saving arithmetic, month clamping and nanosecond instants all work. The leaning is to build the Carbon port on Temporal. A Phase 0 spike confirms completeness against what Carbon needs (FR-25). *Resolve by: the end of Phase 0.*
5. **OQ-5 htmx 4 on npm.** Resolved 2026-10-16: htmx 4.0.0 was released on 2026-08-28 and is on npm's `next` tag. The Skeleton pins `htmx.org@4.0.0` exactly.
6. **OQ-6 First-party packages.** Which come first after the alpha? Sanctum (API tokens) is the likeliest, and MCP OAuth depends on Sanctum or Passport. *Resolve by: Phase 9 planning.*
7. **OQ-7 `Bun.serve` and `QUERY`.** Resolved 2026-10-16: on Bun 1.4.3, `Bun.serve`'s `fetch` handler accepts `QUERY` requests with a body. Its per-method `routes` map does not match them, so the Router dispatches from `fetch`. How `QUERY` is classified for CSRF follows Upstream at the Pin, or goes to an Escalation.
8. **OQ-8 Bun bcrypt compatibility.** Found 2026-10-16: Bun's bcrypt pre-hashes passwords longer than 72 bytes, while PHP truncates them at 72 bytes, so long passwords hashed by PHP would not verify. Approach (Maintainer: accepted): truncate the UTF-8 input to 72 bytes before calling Bun. PHP `$2y$` hashes verify in Bun. A Phase 0 Differential Test confirms this against the Oracle (FR-78). *Resolve by: the end of Phase 0.*
9. **OQ-9 Hosting the Oracle.** Resolved: the Oracle runs in Docker on GitHub Actions. Its outputs are committed as fixtures on a Protected Path, so contributors and agents need neither Docker nor PHP. *Resolve by: the end of Phase 0 (FR-6).*
10. **OQ-10 Auth scaffolding.** Resolved 2026-10-16: yes. The Skeleton ships htmx auth pages (login, register, password reset) and a dashboard, delivered with Auth in Phase 8 because they depend on it.
11. **OQ-11 Bun primitives and MCP SDK version.** Does `bun test` offer everything the harness needs? That covers `test.failing` / `skipIf`, per-test assertion counts, `setSystemTime`, and preload `afterEach`. Are the Bun built-ins this PRD names complete enough: `Bun.sql` raw bindings, `Bun.redis`, `Bun.S3Client`, `Bun.Image`, and `AsyncLocalStorage` propagation across `await`, timers, streams and `Bun.serve` callbacks? Separately, MCP TypeScript SDK v1 or v2: resolved, v2 (`@modelcontextprotocol/server` 2.3.1). A Phase 0 spike resolves the rest. *Resolve by: the end of Phase 0.* The Maintainer expects Bun to be sufficient. One gap is already mitigated: `AsyncLocalStorage` is lost in async-generator and `type: "direct"` stream bodies (architecture AD-5).
12. **OQ-12 Upstream releases during a Phase.** Laravel ships 13.x minors weekly, and security fixes can't wait for a Phase boundary. Do security-relevant Upstream changes allow an out-of-cycle pin bump? *Resolve by: the end of Phase 0, before the first pin bump.*

## 10. Assumptions Index

**Architecture-driven changes, confirmed by the Maintainer on 2026-10-16** (architecture spine `architecture-xaravel-2026-10-16`, Source Amendments):
- Contracts ship as `@xaravel/contracts`. New packages: `@xaravel/runtime`, `@xaravel/serializable-closure`, `@xaravel/http-foundation`, `@xaravel/mime`, `@xaravel/finder`.
- DIV-1, DIV-2, DIV-3, DIV-4, DIV-8 and DIV-9 were rewritten, and DIV-11 and DIV-12 were added.
- FR-28, FR-42, FR-63, FR-66, FR-88, FR-96, FR-112, FR-114 and NFR-2 were updated, along with the §7.3 Phase placements.
- OQ-5 and OQ-7 are resolved, and so is the MCP SDK part of OQ-11.

**Added in the review pass, confirmed by the Maintainer on 2026-10-15:**
- FR-40: how the form Fragment is chosen when validation fails on an htmx Request (declared, then `HX-Target` id, then the `validation-errors` component).
- FR-42: a partial request without a named Fragment gets the layout's `content` region.
- §7.3: the restructured phase order. Foundation is split across Phases 6 and 7, Blade moves to Phase 6, and Testing and Testbench move to Phase 7. MCP and Boost's app tools move to Phase 8. Boost framework mode moves to Phase 0.
- SM-1: the alpha gate is 90% of Applicable Test IDs on every alpha Backend Variant.
- OQ-9: the Oracle runs in Docker on GitHub Actions, with committed fixtures.

**Confirmed by the Maintainer on 2026-10-15** (see `.memlog.md`):

- §3, FR-69: the CLI command stays `bun artisan`.
- FR-6: the Oracle runs in a container, so no local PHP is needed.
- FR-13: all Packages are released together, and a 0.x release ships at each Phase boundary.
- FR-14: the repo is `xaravel/framework`, and `xaravel/xaravel` is reserved for a Skeleton mirror.
- FR-22: classes register themselves in the Class Registry when their module loads.
- FR-35: htmx Requests get HTML error Fragments.
- FR-41: the `.hxRedirect()` opt-in for a full reload. `HX-Location` as the default for htmx Requests is explained in FR-41 and doesn't change controller code.
- FR-104: MCP over HTTP uses a Xaravel auth guard, and OAuth comes later.
- §7.2: the alpha gate criteria other than Phases 1–8, which are confirmed.
- SM-1: at least 90% of Phase 1–8 Test IDs pass at the alpha.
- SM-2: the target for first-pass Epic acceptance is 90% from Phase 2, with Phases 0–1 as calibration.
