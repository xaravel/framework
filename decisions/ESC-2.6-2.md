---
decision: approved
decided_by: Maintainer
date: 2026-10-17
escalation_sha256: ca4044453a25ae80c2d4ffbc11be01d1c51ce1180d1fca3e7952a93b54fea9e7
---

# ESC-2.6-2: approved, option 1 (add Upstream's services to the `none` legs)

The Maintainer approved option 1 in the Maintainer's session on 2026-10-17 ("Option 1: add the services (Recommended)").

The framework `none` and `queue-sync@none` baseline legs start the services Upstream's `linux_tests` job starts: DynamoDB Local (`amazon/dynamodb-local:2.0.0`), memcached and MySQL. They also set Upstream's env (`DYNAMODB_CACHE_TABLE`, `DYNAMODB_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DB_PORT`, `DB_USERNAME`). Story 2.6's "`none` is no extra env" intent is amended to match. The baseline is then re-run, and the regenerated `oracle` and `assertions` values are committed through the normal artifact flow.

Rationale:

- **The Oracle stays faithful.** The recorded outcomes are Upstream's own, so the four `DynamoDbStoreTest` IDs get Upstream's real outcome and an assertion floor, not a service-caused `skip`.
- **The grader gets stronger.** Story 5.2's `upstream-skip` check never accepts a skip that Laravel does not have.
- **The cost is small.** It adds about a minute of service start-up to two CI legs and nothing at Xaravel run time.

This is an Infrastructure change to `.github/workflows/baseline.yml` (a Protected Path), approved by this ruling.
