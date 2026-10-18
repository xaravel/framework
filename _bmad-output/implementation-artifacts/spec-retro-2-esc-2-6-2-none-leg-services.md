---
title: 'Retro epic 2 item 10: Upstream services on the framework none and queue-sync@none baseline legs (ESC-2.6-2)'
type: 'feature'
created: '2026-10-17'
status: 'done'
baseline_revision: '7c207ea3383b6d234591d6be5e0418cf178dc860'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/ESC-2.6-2.md'
  - '{project-root}/conformance/escalations/ESC-2.6-2.md'
  - '{project-root}/docs/ops/baseline.md'
warnings: []
deferred:
  - summary: >-
      run() has no test that it passes legEnv to the runner, so local mode could silently lose SERVICE_ENV.
    evidence: |-
      baseline.test.ts never calls run(); only the pure legEnv is tested. CI's merge diff covers image mode only. Testing needs a spawn/runInImageNetworked seam in run(), which has never had a test.
    location: >-
      tools/baseline/baseline.ts:661
    severity: low
  - summary: >-
      queue-sync@none gets linux_tests services by the ruling, but Upstream's queues.yml sync job starts none; the seven DynamoBatchTest IDs now pass there.
    evidence: |-
      decisions/ESC-2.6-2.md names queue-sync@none explicitly, so this follows the ruling. Whether that Variant mirrors linux_tests or queues.yml's sync job is a Maintainer question, not this change's.
    location: >-
      tools/baseline/baseline.ts SERVICE_LEGS
    severity: medium (unverified)
  - summary: >-
      sprint-planning/scope-8.json notes DynamoBatchTest as likely a skip, but the Oracle now records pass on queue-sync@none.
    evidence: |-
      _bmad-output/implementation-artifacts/sprint-planning/scope-8.json:205; a pre-existing planning note that this change made stale.
    location: >-
      _bmad-output/implementation-artifacts/sprint-planning/scope-8.json:205
    severity: low
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

### 2026-10-17 — Review pass
- verdicts: 18 findings — high 0, medium 1, low 14, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) docs say four IDs change; the Inventory changed 12 — docs paragraph now names all 12 by test class and variant.
  - `[low]` `[defer]` (blind) scope-8.json DynamoBatchTest note is stale — pre-existing planning artifact; deferred.
  - `[low]` `[patch]` (blind) docs claim the legs start "that job's services" though Upstream also runs redis:7.0 — clause added noting redis 8.10.2 and Postgres 18.
  - `[false]` `[reject]` (blind) Protected Paths beyond baseline.yml lack approval — the MAINT ruling's 2026-10-17 amendment approves orchestrator PRs touching Protected Paths.
  - `[false]` `[reject]` (blind) no health check on dynamodb/memcached races the tests — each leg runs oracle:build (minutes) before the runner; both attempts of both CI runs agreed with no non-determinism.
  - `[low]` `[reject]` (blind) SERVICE_ENV applies in local mode where a local MySQL may answer — that is Upstream's env and docs say local service legs are not the Oracle; a guard adds complexity for a rare case.
  - `[low]` `[defer]` (blind) run() wiring untested — same root cause as the verification-gap finding; deferred.
  - `[low]` `[reject]` (blind) legEnv silently overwrites colliding keys — no service leg has colliding keys; a guard adds code for a hypothetical.
  - `[low]` `[patch]` (blind) Variants table's queue row omits queue-sync@none's service env, and the paragraph mixes unrelated sentences — parenthetical added, sentences moved back.
  - `[low]` `[reject]` (blind) spec lacks run provenance and status — the fix edits this build's spec; run IDs go in Auto Run Result.
  - `[low]` `[reject]` (blind) spec Code Map line ranges stale — the fix edits this build's spec.
  - `[false]` `[reject]` (edge) dynamodb/memcached need health checks — duplicate of the blind finding; same refutation.
  - `[low]` `[patch]` (edge) docs' four-ID claim — duplicate; fixed by the docs patch.
  - `[low]` `[patch]` (edge) eight extra flipped IDs unchecked against AC — they are CI artifact output under the ruling (all skip→pass); docs now name them, and the status issue report lists them for the Maintainer.
  - `[low]` `[defer]` (verification-gap) local-mode run() → legEnv has no test — filed disposition defer; recorded in `deferred`.
  - `[low]` `[patch]` (verification-gap other) spec/docs understate the change — duplicate; fixed by the docs patch.
  - `[medium]` `[defer]` (intent) queue-sync@none mirrors linux_tests rather than Upstream's sync job — the ruling names that leg; Maintainer question, deferred and reported.
  - `[low]` `[patch]` (intent) no test asserts the four DynamoDbStoreTest IDs are non-skip — XT-conformance-56 now asserts it on the committed Inventory.

## Design Notes

A per-leg env (not a change to `VARIANT_ENV.none`) keeps the Pest suites' `none` legs unchanged, as the ruling covers only the framework legs. GitHub Actions does not start a service whose `image` evaluates to an empty string, which is the standard way to make job services conditional on a matrix value.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/baseline.test.ts` -- expected: pass
- `bun run typecheck` (or the repo's `tsc` script) and `bun run lint` -- expected: clean
- `gh pr checks <n>` after regeneration -- expected: `baseline` green

## Auto Run Result

Status: done

**Summary:** The framework `none` and `queue-sync@none` baseline legs now start Upstream's `linux_tests` services (memcached 1.6-alpine, MySQL 9.7 on host port 3306, DynamoDB Local 2.0.0 on 8888) and run with Upstream's env (`SERVICE_ENV`, applied through `legEnv` in image and local mode). The Inventory was regenerated from baseline run 39100441817's `inventory` artifact. Run 39101389150 then passed every job, including `merge`'s `git diff --exit-code`.

**Files changed:**
- `tools/baseline/baseline.ts`: adds `SERVICE_ENV`, `SERVICE_LEGS` and `legEnv`, and `run()` uses `legEnv`.
- `.github/workflows/baseline.yml`: `services: true` on the two legs, plus three services whose image is empty on every other leg.
- `conformance/tests/xaravel/baseline.test.ts`: XT-conformance-56 asserts the env, the legs, the workflow services, and that the four DynamoDbStoreTest IDs are not `skip`.
- `docs/ops/baseline.md`: amends the ESC-2.6-2 wording on the `none` leg and documents the service legs and the 12 changed IDs.
- `conformance/inventory/{auth,cache,queue}.jsonl`: the CI artifact, unedited. 12 IDs went from skip to pass: 4 `Cache\DynamoDbStoreTest` on `none`, 7 `Queue\DynamoBatchTest` on `queue-sync@none`, and 1 `Auth\ApiAuthenticationWithEloquentTest` on `none` (MySQL).

**Review:**
- 18 findings: 6 patched (all low), 4 deferred (1 medium unverified, 3 low), 8 rejected. The Review Triage Log gives the reason for each.
- Follow-up review recommended: false, since no patched entry was high or medium.

**Verification:** `bun test` (112 pass), `bun run typecheck` and `bun run lint` are clean. CI baseline runs 39100441817 (expected merge diff only) and 39101389150 (green).

**Residual risks:**
- The ruling applies the services to `queue-sync@none`, but Upstream's queues.yml `sync` job has none. This is a deferred Maintainer question.
- Nothing tests that local-mode `run()` is wired to `legEnv`.
