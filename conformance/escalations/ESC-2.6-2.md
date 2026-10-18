---
test_ids:
  - XT-conformance-56
trigger: open-question
proposed: >-
  Add Upstream's DynamoDB service to the framework `none` and
  `queue-sync@none` baseline legs: start amazon/dynamodb-local:2.0.0 as a
  job service and set DYNAMODB_CACHE_TABLE, DYNAMODB_ENDPOINT,
  AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY as Upstream's linux_tests job
  does, so a test that Upstream runs against that service is recorded with
  Upstream's own outcome. Add memcached and MySQL to those legs too, with
  Upstream's DB_PORT and DB_USERNAME, so the leg's service set matches
  Upstream's and a later Pin cannot introduce a service-caused skip
  silently. Re-run the baseline and commit the regenerated `oracle` and
  `assertions` values through the normal artifact flow. The Maintainer
  chooses this, or one of the alternatives below.
evidence: >-
  Upstream's linux_tests job
  (conformance/upstream/framework/.github/workflows/tests.yml:27-48,79-86)
  starts memcached, mysql, redis and dynamodb-local, and runs PHPUnit with
  DB_PORT, DB_USERNAME, DYNAMODB_CACHE_TABLE, DYNAMODB_ENDPOINT,
  AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY set. baseline.yml's leg job
  (.github/workflows/baseline.yml:100-114) starts only postgres and redis,
  and Story 2.6's intent fixes `none` as "no extra env". At the Baseline Pin
  this already changes recorded outcomes: the four
  Illuminate\Tests\Integration\Cache\DynamoDbStoreTest IDs carry
  #[RequiresEnv('DYNAMODB_CACHE_TABLE')]
  (framework/tests/Integration/Cache/DynamoDbStoreTest.php:13), are tagged
  `backends: ["none"]`, and are recorded `"oracle":{"none":"skip"}` with
  empty assertions in conformance/inventory/cache.jsonl, although Upstream
  runs them. Story 5.2's `upstream-skip` check will read those skips as
  Upstream's own, so a Ported Test could carry a skip that Laravel does not
  have, and the FR-113 floor for those IDs is empty. The Memcached
  integration tests (MemcachedIntegrationTestCase and its two siblings) are
  abstract at the Pin and produce no IDs, and no none-tagged ID was found
  whose skip is caused by the missing MySQL service, so today the measurable
  effect is the four DynamoDB IDs. Story 2.6's spec recorded this as a
  deferral that "needs a Maintainer ruling"
  (_bmad-output/implementation-artifacts/spec-2-6-upstream-baseline-run-assertion-kinds-and-oracle-outcomes.md:23-28),
  and the Epic 2 retrospective (finding S4, action item 6) asks for this
  Escalation. No Story's ACs cover it.
---

# ESC-2.6-2: Upstream services missing from the `none` baseline leg

Story 2.6's baseline runs each Upstream test once per Variant and records the outcome and assertion multiset as the Oracle. The `none` leg runs without services that Upstream's own CI starts for its single PHPUnit run: memcached, MySQL and DynamoDB Local. A test that needs one of them is skipped in the baseline but runs Upstream. The baseline then records a skip that Laravel does not have, and Story 5.2's `upstream-skip` check would accept the same skip in a Ported Test. At the Pin this affects the four `DynamoDbStoreTest` IDs.

The options:

1. **Add Upstream's services to the `none` legs (proposed).** The leg starts DynamoDB Local, memcached and MySQL with Upstream's env, so the recorded outcomes are Upstream's. This makes the Oracle more faithful and strengthens the grader: the four IDs get a real outcome and an assertion floor. It needs a Protected Path change to `.github/workflows/baseline.yml` and an amendment to Story 2.6's "`none` is no extra env" intent, so it is an Infrastructure change the Maintainer approves. It adds roughly a minute of service start-up to two legs and nothing at Xaravel run time.
2. **Tag those tests with their service.** Story 2.4's backend derivation gives `RequiresEnv('DYNAMODB_…')` tests a `dynamodb` backend, and the baseline runs them on a matching leg. This keeps `none` service-free but adds Variant vocabulary that `conformance/variants` (Story 5.1) must absorb, and Upstream has no such Variant.
3. **Leave the skips as recorded and note them.** The baseline keeps `skip` for the four IDs and a findings note says the skip is service-caused. This leaves Story 5.2 accepting a skip that Upstream does not have, which weakens the grader.

Option 1 adds no divergence and no skip, and needs no `adapted:` marker. It changes what the Oracle environment contains, and option 3 weakens the grader, so the choice belongs to the Maintainer under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. Story 2.6 is `done`; this Escalation blocks no Story, and Story 5.2 should not ship its `upstream-skip` check before it is ruled.
