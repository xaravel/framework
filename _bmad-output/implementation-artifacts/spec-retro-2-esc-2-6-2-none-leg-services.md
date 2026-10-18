---
title: 'Retro epic 2 item 10: Upstream services on the framework none and queue-sync@none baseline legs (ESC-2.6-2)'
type: 'feature'
created: '2026-10-17'
status: 'in-progress'
baseline_revision: '7c207ea3383b6d234591d6be5e0418cf178dc860'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/ESC-2.6-2.md'
  - '{project-root}/conformance/escalations/ESC-2.6-2.md'
  - '{project-root}/docs/ops/baseline.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The baseline's framework `none` and `queue-sync@none` legs run without the memcached, MySQL and DynamoDB Local services that Upstream's `linux_tests` job starts, so the four `Illuminate\Tests\Integration\Cache\DynamoDbStoreTest` IDs are recorded `"oracle":{"none":"skip"}` with empty assertions although Upstream runs them (ESC-2.6-2, approved option 1).

**Approach:** Start Upstream's three services on exactly those two framework legs, give those legs Upstream's `linux_tests` env on top of the variant env, amend the Story 2.6 `none` wording in `docs/ops/baseline.md`, then regenerate the Inventory's `oracle`/`assertions` through the normal artifact flow (CI run → download `inventory` artifact → commit → second run's `merge` diff is clean).

## Boundaries & Constraints

**Always:** Service env is Upstream's `linux_tests` env (`tests.yml:79-86`): `DB_PORT` (MySQL's port), `DB_USERNAME=root`, `DYNAMODB_CACHE_TABLE=laravel_dynamodb_test`, `DYNAMODB_ENDPOINT=http://localhost:8888`, `AWS_ACCESS_KEY_ID=randomKey`, `AWS_SECRET_ACCESS_KEY=randomSecret`. Service images are Upstream's: `memcached:1.6-alpine` (11211), `mysql:9.7` (`MYSQL_ALLOW_EMPTY_PASSWORD: yes`, `MYSQL_DATABASE: forge`, mysqladmin-ping health check), `amazon/dynamodb-local:2.0.0` (host 8888 → 8000). MySQL is mapped to a fixed host port 3306 so `DB_PORT=3306` is deterministic. The env is applied in both image and local mode from one constant in `tools/baseline/baseline.ts`. Committed `oracle`/`assertions` values are exactly the CI `inventory` artifact.

**Never:** Hand-edit Inventory values; add entries to `oracle-nondeterminism.jsonl`; change other legs' services or env (pgsql, sqlite, redis, queue-database@sqlite, queue-redis@redis, Pest suites); change `VARIANT_ENV`'s meaning for any variant; edit `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or their workflows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Service leg | `run --suite framework --variant none` (or `queue-sync@none`) | runner env = variant env + service env | — |
| Other framework leg | `--variant pgsql` etc. | env = variant env only (pgsql keeps `DB_PORT=5432`, `DB_USERNAME=forge`) | — |
| Pest leg on none | `--suite ai --variant none` | env = `{}` | — |
| CI after regeneration | baseline workflow on the branch | four DynamoDbStoreTest IDs have `oracle.none` ≠ `skip` and non-empty assertions; `merge` diff clean | non-determinism → investigate, do not commit around it |

</intent-contract>

## Code Map

- `tools/baseline/baseline.ts:70-85` -- `VARIANT_ENV`, `SQLITE_VARIANTS`; add the service env constant, the service-leg list and a `legEnv(suite, variant)` helper next to them.
- `tools/baseline/baseline.ts:619-640` -- `run()`: local mode `Object.assign(env, VARIANT_ENV[variant])` and image mode `env: VARIANT_ENV[variant]!`; both switch to `legEnv`.
- `tools/oracle/oracle.ts:744-776` -- `networkedRunArgs`/`runInImageNetworked`: `--network host`, so `localhost:8888`/`127.0.0.1:3306` reach job services. Read-only.
- `.github/workflows/baseline.yml:84-114` -- `leg` matrix and `services`; add `services: true` on the two legs and three services whose `image` is empty (GitHub skips an empty-image service) on other legs.
- `conformance/tests/xaravel/baseline.test.ts:182-200,377-390` -- XT-conformance-56 asserts `VARIANT_ENV` and the services list; extend it for the new constant, `legEnv` and conditional services.
- `docs/ops/baseline.md` -- Variants table, "In image mode", local-mode paragraph, the workflow `leg` bullet.
- `conformance/inventory/cache.jsonl:389-392` -- the four DynamoDB IDs (regenerated, not hand-edited).
- `conformance/upstream/framework/.github/workflows/tests.yml:27-48,79-86` -- Upstream's services and env (evidence).

## Tasks & Acceptance

**Execution:**
- `tools/baseline/baseline.ts` -- add exported `SERVICE_ENV`, `SERVICE_LEGS` (framework on `none` and `queue-sync@none`) and `legEnv`; use `legEnv` in `run()` for both modes; update header comment -- one source of truth for the leg env.
- `.github/workflows/baseline.yml` -- add `services: true` to the two matrix legs; add `memcached`, `mysql`, `dynamodb` services with `image: ${{ matrix.leg.services && '<image>' || '' }}`; update header comment -- start Upstream's services only where ruled.
- `conformance/tests/xaravel/baseline.test.ts` -- in XT-conformance-56 assert `SERVICE_ENV`, `SERVICE_LEGS`, `legEnv` for a service leg, a non-service framework leg and a Pest none leg, the workflow's five services and that exactly the two legs set `services: true`.
- `docs/ops/baseline.md` -- document the service env and services, amend "`none` is no extra env" per ESC-2.6-2, note local mode needs the services for those legs.
- `conformance/inventory/*.jsonl` -- after the CI run, replace with the run's `inventory` artifact and commit.

**Acceptance Criteria:**
- Given the branch, when `bun test conformance/tests/xaravel/baseline.test.ts`, `tsc` and oxlint run, then all pass.
- Given the regenerated Inventory committed, when the `baseline` workflow runs again, then every job passes, including `merge`'s `git diff --exit-code`, and the four `DynamoDbStoreTest` IDs record a non-skip Upstream outcome with non-empty assertions.

## Spec Change Log

## Review Triage Log

## Design Notes

A per-leg env (not a change to `VARIANT_ENV.none`) keeps the Pest suites' `none` legs unchanged, as the ruling covers only the framework legs. GitHub Actions does not start a service whose `image` evaluates to an empty string, which is the standard way to make job services conditional on a matrix value.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/baseline.test.ts` -- expected: pass
- `bun run typecheck` (or the repo's `tsc` script) and `bun run lint` -- expected: clean
- `gh pr checks <n>` after regeneration -- expected: `baseline` green
