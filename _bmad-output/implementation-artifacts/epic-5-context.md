# Epic 5 Context: Harness, Expectations File, Ratchet & CI pipeline

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make every Story's result measurable the same way locally and in CI. This epic delivers the sharded Expectations File and its closed Variant vocabulary, CI checks that validate each Skip Reason against its rule, and one agent-operable harness: full and seeded fast modes, filters, greppable output, not-run handling and assertion-floor checks. It also delivers per-worktree backend isolation so parallel agents never share databases or Redis, the Ratchet and Expectations line-ownership checks, the AD-28 CI pipeline (per-PR, merge queue, nightly matrix), the quarantine and promotion bots, and a computed Story done check. After this epic, "done" is computed rather than claimed, and conformance can only move honestly.

## Stories

- Story 5.1: Variant vocabulary and Expectations File
- Story 5.2: Skip Reason rule checks
- Story 5.3: Harness runner and greppable report
- Story 5.4: Fast mode, seeds and filters
- Story 5.5: Backend isolation per worktree
- Story 5.6: Ratchet and Expectations line ownership
- Story 5.7: CI pipeline: PR checks, merge queue and nightly matrix
- Story 5.8: Promotion and quarantine bots
- Story 5.9: Xaravel Test coverage check and the Story done check

## Requirements & Constraints

- **Kind:** Conformance System, a Xaravel Component. Every acceptance criterion is verified by an `XT-conformance-<n>` Xaravel Test, declared as `xaravelTest('XT-conformance-<n>', '<FR consequence>', fn)`. Xaravel Tests never count toward the Conformance Rate.
- **Expectations:** exactly one status per Test ID x Backend Variant: `pass`, `fail-known`, `skip` or `quarantined`. A `skip` needs a reason from the closed vocabulary. `fail-known` counts as not passing and blocks Epic acceptance. A `pass` may carry `adapted: DIV-<n>.<clause>`.
- **Skip Reason rules (CI-enforced):**
  - `blocked-by:<c>`: `<c>` is in a later Phase.
  - `intentional-divergence:DIV-<n>`: the Divergence Record exists.
  - `php-only`: it has an approved Escalation.
  - `upstream-skip`: the Oracle skips or fails the test at the Pin.
  - `deferred:<item>`: the item is a listed post-alpha item.
  - `out-of-scope:<NG-N>`: it names a Non-Goal.
  - `quarantined`: it has an open Escalation.
  - `not-ported-yet`: always valid, but never satisfies done.
  - Precedence when several reasons apply: `upstream-skip` → `intentional-divergence` → `blocked-by` → `not-ported-yet` → `php-only` / `deferred` / `out-of-scope`.
- **Denominator:** the Conformance Rate is always computed over the full Test ID x Variant set, including unported tests. Applicable Test IDs exclude `php-only`, `upstream-skip`, `deferred` and `out-of-scope`.
- **Ratchet:** any unexpected failure *or* unexpected pass fails CI. A Story changes Expectations only for its own Test IDs. Moving an entry from `pass` to anything else needs an approved Escalation.
- **Assertion floor:** a test with zero assertions fails. The multiset of assertion kinds must be at least the Inventory's `assertions` unless the DIV clause in `adapted` allows fewer. The report shows both counts.
- **Harness output:** short and greppable, one line per differing Test ID x variant, then a summary line. Locally, variants whose backend isn't running are `NOT-RUN`: never failures, never recorded. In CI every alpha variant must actually run.
- **Fast mode:** prints the seed it used, samples deterministically, says in the report that it is a sample, and never satisfies the done check.
- **Determinism and isolation:** tests need no network unless backend-tagged. Assertion counts must never mix between concurrently declared tests. A late assertion fails its test. JS intrinsics are frozen before any Ported Test loads.
- **Story done definition (computed):**
  - every assigned Test ID x Variant passes, or has a valid reason other than `not-ported-yet`;
  - every assigned Xaravel Test passes;
  - at least two approvals from distinct reviewer identities;
  - no open Escalations;
  - the last CI run was a full run.

  A manifest with no assigned tests fails.
- **Benchmarks:** run nightly for information only and never fail a job.
- **Agent operability:** every Story runs unattended in its own git worktree, with machine-readable Test IDs, commands and acceptance check.

## Technical Decisions

- **Data files:** JSONL, UTF-8, LF, sorted, one record per line.
  - Expectations are sharded to mirror Ported Test files: `conformance/expectations/<component>/<Upstream test path>.jsonl`, fields `id`, `variant`, `status`, `reason`, `adapted`, `escalation`. Each `(id, variant)` appears exactly once across shards. Initial lines are `skip` / `not-ported-yet`; `laravel/ai` lines are `deferred:ai-sdk`.
  - The Inventory is `conformance/inventory/<component>.jsonl` (`id`, `component`, `kind`, `backends`, `hash`, `assertions`, `oracle`, `source`). `oracle` maps each variant to the baseline Upstream outcome.
  - `conformance/variants` is a closed vocabulary: `none`, `sqlite`, `pgsql`, `redis`, `<driver>@<backend>`.
  - Tests never declare their variants; they come from the Inventory's `backends`.
- **Harness:** runs `bun test` once per variant with the Protected root `bunfig.toml`, setting `XARAVEL_VARIANT`. It fails if any package-level `bunfig.toml` exists.
  - **Grader isolation:** the harness, `@xaravel/assert` and `@xaravel/mockery` import no graded package. They detect values by `Symbol.for` brand and open frames only through the runtime's global protocol.
  - **Frames:** the harness opens the test frame first. Discarding it resets all per-test state.
- **`blocked-by:<c>`:** matches only when the test fails with `BlockedByComponentError(<c>)`, which is raised when a token, alias or FQCN owned by `<c>` (per the component map) is resolved and `<c>` isn't installed. Any other failure under a `blocked-by` expectation is a mismatch.
- **Backend isolation:**
  - **Worktree key:** the first 8 hex characters of SHA-256 over the worktree path plus its git worktree creation id.
  - **Postgres:** databases are named `xaravel_test_<key>[_<name>]` and recreated on every full run. Tests drop only names that match the pattern.
  - **SQLite:** files under `.cache/`.
  - **Redis:** locally, one `redis-server` per worktree on a unix socket in `.cache/` with no persistence. `flushdb` is allowed and no prefix is injected. In CI, each job's service is its server.
  - **Lock:** `.cache/harness.lock` keeps out a second runner; the message names the holder.
- **Story manifest:** `stories/<story-id>.md`, with `test_ids:` and `component:` read from the **base branch**. A Test ID belongs to at most one open Story.
- **Ownership:** a PR changing Expectations lines or `portedTest` blocks outside its `test_ids` fails.
  - **Unowned unexpected pass on `main`:** a warning, and the bot opens a promotion PR.
  - **Owned by another open Story:** it fails only that Story's next run.
  - **Bot PRs:** `bot/*` branches from an App identity are exempt only when they change Expectations `status` values alone.
- **Escalations:** `conformance/escalations/ESC-<story-id>-<n>.md`. One counts as approved only when `decisions/ESC-<story-id>-<n>.md` exists with `decision: approved`. Bot escalations are `ESC-bot-<n>`.
- **Oracle requests:** if a per-Story request (`conformance/oracle-requests/<story-id>.jsonl`) overlaps a batch request or another Story's request, the already-merged file stays valid. The batch skips any request a merged per-Story file holds. Between two per-Story files, the earlier-merged Story owns the request, not the one whose file name sorts first.
- **CI (AD-28):**
  - **Per PR, linux-x64:**
    - lint and typecheck;
    - the protected-paths, ownership and dependency-graph checks;
    - `bun audit`;
    - the Ratchet over the AD-2 reverse-dependency closure of changed packages;
    - a full run of the Story's `test_ids` on every variant, with SQLite, Postgres 18 and Redis 8.10.2 services.
  - **Merge queue:** required on `main`. It runs the full Ratchet on all alpha variants, regenerates `async-surface.json` and runs the API-surface diff.
  - **Nightly:**
    - the full matrix on linux and macOS, x64 and arm64, with Postgres and Redis installed natively on macOS;
    - benchmarks;
    - an Oracle re-evaluation of every committed fixture in the current-Pin image, failing on any stale output.
  - **Required checks:** `protected-paths` and `ratchet` run from `pull_request_target` workflows pinned to the default branch, so a PR can't change its own checks.
  - **Permissions:** workflows default to `contents: read`; history is linear.
- **Quarantine:** triggered when a test fails on `main` then passes on rerun, or is inconsistent across 3 runs. The bot pushes a `bot/*` branch setting `quarantined` and opens `ESC-bot-<n>` with the evidence. ESC files that the Oracle `determinism` job writes are committed the same way through a `bot/*` PR, not only uploaded as workflow artifacts.
- **Coverage:** `conformance/xaravel-consequences/<component>.jsonl` is Protected. `xt:coverage` lists every consequence with no passing `xaravelTest` declaring it.
- **Protected Paths:** `tools/`, `.github/`, `conformance/` (except `expectations/`, `escalations/`, `oracle-requests/` and `fixtures/`), `stories/`, `decisions/`, the root `bunfig.toml` and `package.json`. Epic 5 work in these paths is Maintainer-approved Infrastructure work.
- **Toolchain:** Bun 1.4.3 and `bun test` only. Use `jsonEncode` / `phpSerialize`, never `JSON.stringify`, on framework values.

## Cross-Story Dependencies

- **Within the epic:**
  - 5.1 is the base for everything else: 5.2 validates its lines, and 5.3 compares results against them.
  - 5.3 is the base for 5.4 (fast mode, filters), 5.5 (isolation at harness start) and 5.6 (Ratchet).
  - 5.6 feeds 5.7 (`ratchet` becomes a required check in the Story 1.7 ruleset verification) and 5.8 (bot exemptions and promotion).
  - 5.9 needs 5.3, 5.4 and 5.6. When 5.9 merges, all Epic 1–4 Xaravel Tests run through `xaravelTest` under the harness.
- **Upstream epics:**
  - Epic 1: manifests, the ownership and protected-paths checks, the Escalation formats, the ruleset.
  - Epic 2: Inventory with `backends`, `assertions` and `oracle` outcomes; the component map.
  - Epic 3: Oracle requests, signed fixtures, verification.
  - Epic 4: `portedTest` / `xaravelTest`, assertion counting.
- **Downstream:**
  - The Epic 7 dashboard reads these data files.
  - Epic 8 needs `decisions/DIV-<n>.md` for the `intentional-divergence` check, and its reviewers' checklist references the precedence rule documented in `conformance/README.md`.
  - The `deferred-items` and `non-goals` lists are transcribed from the PRD.
