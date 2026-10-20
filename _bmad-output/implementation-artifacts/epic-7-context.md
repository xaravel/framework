# Epic 7 Context: Conformance dashboard & Boost framework mode

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make conformance visible and queryable. Epic 7 builds three things. The first is one aggregator that computes the Conformance Rate and the alpha-gate figure from the Test Inventory and the Expectations File. The second is a public GitHub Pages dashboard with an Epic review view, so the Maintainer can accept an Epic or send it back on evidence alone. The third is a read-only MCP server, Boost framework mode, so Framework Agents can look up their Test IDs, statuses, DIVs and Escalations without parsing JSONL. It is Phase 0 work: every later Story's agent relies on framework mode, and every Epic review relies on the dashboard.

## Stories

- Story 7.1: Conformance aggregator
- Story 7.2: Public dashboard and Epic review view
- Story 7.3: Boost framework-mode MCP server
- Story 7.4: Framework mode is read-only

## Requirements & Constraints

- **Kind and verification.** This Epic covers the Conformance System and Boost in framework mode. Each acceptance criterion is verified by an `XT-conformance-<n>` or `XT-boost-<n>` Xaravel Test, declared with `xaravelTest(...)`. Xaravel Tests never count toward the Conformance Rate.
- **One definition per number.** The aggregator is the only place figures are computed. The dashboard and the MCP `conformance.rate` tool must show the same values.
- **Conformance Rate.** It is passing Test ID × Backend Variant pairs divided by all pairs, per Component and overall. The denominator always includes every pair, `not-ported-yet` included, and is never shrunk.
- **Report contents.** Per Component and overall, the report gives counts per status (`pass`, `fail-known`, `skip`, `quarantined`) and per Skip Reason, plus the `adapted` count. `fail-known` is counted separately from skips.
- **Alpha-gate figure (SM-1).** It is passing pairs divided by Applicable Test IDs, for the Phase 1–8 Components, on every alpha Variant.
  - **Applicable** means the Skip Reason is not `php-only`, `upstream-skip`, `deferred:*` or `out-of-scope:*`.
  - **Count as not passing:** `quarantined`, `fail-known` and `intentional-divergence` (divergences cost conformance).
  - **Alpha Variants:** SQLite, Postgres, Redis, and the sync, database and redis queue drivers. Which Variants are alpha comes from SM-1 and the CI pipeline, not from `conformance/variants`.
  - **Target:** at least 90%, with no `not-ported-yet` or `blocked-by` left for those Components.
- **Skip Reason vocabulary.** The values are `not-ported-yet`, `blocked-by:<component>`, `intentional-divergence:<DIV-N>`, `php-only`, `upstream-skip`, `deferred:<item>` and `out-of-scope:<NG-N>`. Group counts by reason kind.
- **History.** Every push to `main` appends a history record, keyed by commit and Baseline Pin, to the dashboard's data branch. The history chart marks each Baseline Pin change and starts a new series after it. The rate must never fall between Phase boundaries under the same Pin.
- **Dashboard contents.** The dashboard shows:
  - the overall and per-Component rates, with the alpha-gate figure beside them;
  - counts per Skip Reason;
  - each DIV ID, linked to its Divergence Record;
  - open Escalations with their Test IDs (an Escalation is open until `decisions/ESC-*.md` exists);
  - Quarantined tests;
  - the API-surface diff per Component (missing, renamed and extra members).
- **Epic review view.** For one Epic it shows:
  - the Component's rate and its Skip Reason counts;
  - the Divergence Records and Escalations added since the Epic began;
  - the diff summary, as files and lines per Story.

  `fail-known` entries and open Escalations block Epic acceptance, so the view must make them obvious.
- **Framework-mode tools.** Over stdio, the server offers `inventory.get` (by Test ID or glob), `expectations.status` (Test ID × Variant), `conformance.rate` (by Component or overall), `story.tests`, `divergence.get` (DIV ID to its record and numbered clauses) and `escalations.open`. `inventory.get` returns the `source` path and line range in `conformance/upstream/`, plus the Upstream assertion multiset.
- **Read-only, enforced.**
  - No tool writes files, runs commands or changes git state.
  - The process opens only paths under `conformance/`, `stories/` and `decisions/`, read-only, and refuses anything outside them.
  - A test calls every tool and proves the worktree is unchanged afterwards.
- **Registration.** The repo's `.mcp.json` registers the server, so it is available in any agent worktree session.

## Technical Decisions

- **Workspace and dependency.** Boost framework mode is the private workspace `tools/boost-framework`, which is not published. Its only dependency is `@modelcontextprotocol/server` 2.3.1, used directly; it does not wait for `@xaravel/mcp`.
- **Protected Paths.** `tools/`, `.github/`, the root `package.json` and `conformance/` (except `expectations/`, `escalations/`, `oracle-requests/` and `fixtures/`) are Protected. This work goes through Maintainer Code Owner review. Note that `.mcp.json` is not in the Protected list.
- **Data model.** All data files are JSONL: UTF-8, LF line endings, sorted, one record per line.
  - **Inventory:** `conformance/inventory/<component>.jsonl`, with fields `id`, `component`, `kind`, `backends`, `hash`, `assertions`, `oracle` and `source`.
  - **Expectations:** sharded at `conformance/expectations/<component>/<ported test path>.jsonl`, with fields `id`, `variant`, `status`, `reason`, `adapted` and `escalation`. Each `(id, variant)` appears exactly once across all shards.
  - **Escalations:** `conformance/escalations/ESC-<story-id>-<n>.md`, with frontmatter `test_ids`, `proposed` and `evidence`. Rulings are `decisions/ESC-*.md` with `decision: approved | rejected`.
  - **Stories:** `stories/<story-id>.md`, with `test_ids:` and `component:`.
  - **API-surface diff:** the Upstream members are in `conformance/api-surface/<c>.jsonl`, with `additions.jsonl` and `exceptions.jsonl` beside them.
- **CI and publishing.** The dashboard publishes to GitHub Pages from `main`. Workflows default to `permissions: contents: read`, and only the dashboard job gets write scopes (Pages and the data branch). Branch protection requires linear history.
- **Toolchain.** Bun 1.4.3, `tsc --strict` 7.0.2, and type-aware oxlint (no floating Promises). Encode framework values with `jsonEncode`. The tool code must still pass the Epic 6 lint rules.
- **Grader isolation.** The aggregator and the server read conformance data only; they import no graded package.

## UX & Interaction Patterns

- The Maintainer's flow is: open the dashboard for a Component, read the rate, Skip Reason counts, new Divergence Records and diff summary, then accept the Epic or send specific Test IDs back.
- The full denominator is always shown, with the alpha-gate figure next to the full rate, never in its place.
- The agent's flow is: query `story.tests`, then `inventory.get` and `expectations.status`, then read the relevant `divergence.get` records, instead of reading raw JSONL.

## Cross-Story Dependencies

- Stories 7.2 and 7.3's `conformance.rate` both consume Story 7.1's `report.json` and its definitions, so neither re-derives the rates.
- Story 7.4 hardens and tests the server built in 7.3.
- **From earlier Epics:**
  - the Test Inventory and Upstream snapshot (Epic 2);
  - the API-surface export (Epic 3);
  - the Expectations File, the Variant vocabulary, the Skip Reason checks and the CI pipeline (Epic 5);
  - the API-surface diff and gate (Epic 6).
- **Forward:** Epic 8 creates the Divergence Records and `PORTING.md`, so `divergence.get` and the dashboard's DIV links must handle an empty or partial `decisions/` set. Every later Epic's review relies on the Epic review view.
