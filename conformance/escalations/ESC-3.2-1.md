---
test_ids:
  - XT-conformance-72
trigger: open-question
proposed: >-
  Record the requests whose two evaluations differ in a committed findings
  file, as decisions/ESC-2.6-1.md does for the baseline. The file is
  `conformance/oracle/nondeterminism.jsonl` (Protected by `/conformance/`),
  one sorted line per request: `{"sha256","id","reason"}`, where `reason`
  names the random or time source (for example "Str::uuid() is random").
  The batch still evaluates every committed request twice. A listed request
  gets no fixture, and its Test ID stays an ordinary Ported Test that asserts
  Upstream's own assertions. Any difference in a request that is not listed
  fails the job and opens an Escalation, as the AC says. A listed `sha256`
  that is no longer a committed request, or that gives identical outputs in
  both evaluations, also fails the run, so the file cannot go stale. The
  first version lists the 23 requests below. Nothing is seeded or pinned:
  Upstream runs exactly as Upstream runs.
evidence: >-
  Story 3.2's AC (epics.md:1906-1908) wants identical outputs from two batch
  runs on the same Pin and requests, and fixtures for "every extracted
  request" (epics.md:1896). Evaluating all 1,857 committed requests
  (conformance/oracle/requests/*.jsonl) twice with the Story's evaluator
  (the prototype `_bmad-output/implementation-artifacts/spec-3-2-prototype/evaluate.php`, as `php evaluate.php /tmp/xaravel-inv/framework 8.5.11
  <all requests>`, run 2026-10-17 on PHP 8.5.11 against the locked local
  install) gives identical outputs for 1,834 and different outputs for 23
  (full hashes in
  _bmad-output/implementation-artifacts/spec-3-2-prototype/nondeterministic-requests.txt).
  All 23 are in support.jsonl, and each depends on a random or time source
  that Upstream does not fix: Str::uuid(), Str::uuid7(), Str::orderedUuid(),
  Str::ulid(), Str::random() with a random_int length, and the random IV of
  Encrypter::encrypt(). They are SupportStrTest::testItCanFreezeUlids
  (24fde491…, 7f342fb6…, e9dcc163…), testItCanFreezeUlidsInAClosure
  (dc3dc632…), testItCanFreezeUuids (0bb6af87…, 1af46771…, 7a4b9901…),
  testItCanFreezeUuidsInAClosure (e1b51a69…),
  testItCanSpecifyASequenceOfUlidsToUtilise (09d22817…, 5c9802c8…,
  86d57421…, 94735202…, a711111a…),
  testItCanSpecifyASequenceOfUuidsToUtilise (597a52b4…, 6bb701af…,
  af795680…, b6e18318…, c9de1226…), testRandom (57c65aa0…),
  testRandomStringFactoryCanBeSet (a0b81268…), testResetFactoryState
  (80b796e6…), testUuid (9fde4bd3…), and
  SupportStringableTest::testEncryptAndDecrypt (f94c45d3…). Other requests
  of the same methods are deterministic, for example testRandom's
  `strlen(Str::random())` (335d6990…), so the split is per request, not per
  Test ID. decisions/ESC-3.1-1.md says a body involving randomness yields no
  request, but Story 3.1's readability rules (docs/ops/oracle.md, Readability
  rules) have no randomness rule, so the extractor emitted them. Under the AC
  as written, the batch therefore always fails on the committed requests, and
  no fixture can be produced until this is ruled.
---

# ESC-3.2-1: requests whose Oracle output is random

Story 3.2's batch evaluates every committed Oracle request twice and must get identical outputs. On the committed requests, 23 of 1,857 differ between the two evaluations because Upstream's code under test is random or time-based (UUIDs, ULIDs, random strings, an encryption IV). Story 3.1's approved ruling (ESC-3.1-1) says randomness yields no request, but the extractor has no rule that detects it, so these requests were committed. As the AC stands, the batch fails every time and produces no fixtures. The Story cannot choose how to exclude them: the AC asks for a fixture for every extracted request.

The options:

1. **A findings file of known non-deterministic requests (proposed).** The details are in `proposed` above. It follows the Maintainer's ruling on the same problem in the baseline (`decisions/ESC-2.6-1.md`): Upstream runs unseeded, only the listed requests are exempt, and any new difference still fails the job and opens an Escalation. The split is exact, per request, because it comes from running Upstream rather than from a guess. A listed request gets no fixture, so its Test ID stays an ordinary Ported Test with Upstream's own assertions.
2. **A static randomness rule in the extractor.** Story 3.1's family modules treat a body that calls a random or time source (`Str::uuid`, `Str::ulid`, `Str::random`, `random_int`, `encrypt`, …) as unreadable, and the requests are regenerated. This keeps "every extracted request gets a fixture" literally true, but the list of sources is hand-written and can miss one, and it also drops deterministic requests of the same bodies, such as `strlen(Str::random())`.
3. **Pin the randomness in the Oracle.** The evaluator fixes Str's UUID, ULID and random-string factories and seeds PHP's generators, as `tools/inventory/lister.php`'s `pinRandomness` does for dataset export. Every request then gets a fixture, but the expected values are no longer what Laravel produces. ESC-2.6-1 rejected seeding for this reason.

Option 1 removes no assertion, weakens no expected value, adds no skip, no `adapted:` marker and no divergence, and costs nothing at Xaravel run time: fixtures are generated once per Pin. Nothing in the spine, the SPEC or `epics.md` changes. Story 3.2's spec is `_bmad-output/implementation-artifacts/spec-3-2-batch-fixture-generation-and-ed25519-signing.md`.
