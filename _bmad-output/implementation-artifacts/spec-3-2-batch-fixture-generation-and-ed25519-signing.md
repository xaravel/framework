---
title: 'Story 3.2: Batch fixture generation and Ed25519 signing'
type: 'feature'
created: '2026-10-17'
status: 'done'
baseline_revision: 'fc2eeaf5c6d3d3746f7478558fe5efd3ab9174f9'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'stories/3.2.md'
  - 'conformance/escalations/ESC-3.2-1.md'
  - 'docs/ops/oracle.md'
  - 'decisions/ESC-3.2-1.md'
warnings: [oversized]
deferred:
  - summary: >-
      Maintainer-run: generate the Ed25519 key pair off the agent host, store ORACLE_SIGNING_KEY in environment `oracle` (main only), commit conformance/oracle/oracle.pub with its fingerprint in docs/ops/oracle.md, run oracle.yml and commit the fixtures artifact.
    evidence: |-
      The intent forbids an agent-generated key. Until this is done the `oracle` job's batch step fails after the image push, and no fixtures are committed.
    location: >-
      docs/ops/oracle.md (Maintainer-run steps)
    severity: high
  - summary: >-
      The nightly determinism job never compares fresh outputs with the committed fixtures, so drift against the current Oracle goes unnoticed.
    evidence: |-
      oracle.yml `determinism` compares two fresh passes only; Story 3.3 verifies signatures only.
    location: >-
      .github/workflows/oracle.yml
    severity: medium
  - summary: >-
      The fixture signature covers only output and request hash, not the Pin, image tag or evaluator, so a fixture from an older Pin still verifies.
    evidence: |-
      fixtureMessage is the domain prefix + canonicalJson({output, sha256}); unverified whether Story 3.3 detects staleness another way.
    location: >-
      tools/oracle/fixtures.ts fixtureMessage
    severity: medium (unverified)
  - summary: >-
      ESC-bot-<n> numbers can collide between failing runs whose Escalations are not yet committed.
    evidence: |-
      nextBotEscalation reads only the checked-out conformance/escalations/; depends on how Story 5.8's bots commit records.
    location: >-
      tools/oracle/fixtures.ts nextBotEscalation
    severity: medium (unverified)
  - summary: >-
      Image-mode byte equality with local mode, and the committed listing's 23 differences on the image, are unverified until the first oracle.yml run.
    evidence: |-
      No Docker on the agent host; only the stand-in runner exercises image mode.
    location: >-
      tools/oracle/fixtures.ts evaluateOnce
    severity: medium (unverified)
  - summary: >-
      No CI job runs oracle-fixtures.test.ts's real-PHP evaluator test, and stages setUp/bindings/tearDown/fatal/timeout and several encodings have no real-PHP test.
    evidence: |-
      ci.yml php-fixtures runs only php-scripts.test.ts and has no /tmp/xaravel-inv install; adding it is a .github/workflows/ci.yml change.
    location: >-
      .github/workflows/ci.yml
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 3.1 commits 1,857 Oracle requests, but nothing evaluates them in real PHP or produces expected values that a Differential Test can trust (FR-6, AD-15). Fixtures must be reproducible and unforgeable without CODEOWNERS on `conformance/fixtures/`.

**Approach:** A PHP evaluator runs each committed request in the Oracle image (or a locked local install), in its own forked process, per the evaluation contract in `docs/ops/oracle.md`. `bun run oracle:fixtures` runs it twice, compares the two passes, signs each output with Ed25519 (key from the job's secret only), and writes `conformance/fixtures/<component>/<sha256>.json`. A difference fails the run and writes an Escalation. `oracle.yml#oracle` runs the batch after publishing the image and nightly.

## Boundaries & Constraints

**Always:**
- Evaluation follows `docs/ops/oracle.md` "Evaluation contract per kind" exactly. Each request runs in a `pcntl_fork` child (no static state leaks), with a 60 s limit. PHPUnit's configuration `Registry` is initialised from `phpunit.xml.dist` as `phpunit` does (Testbench's `tearDown()` reads it). `setup`/`exprs` run with `eval` in the Test ID's namespace inside a closure bound to the test instance, between `setUpBeforeClass()`+`setUp()` and `tearDown()`+`tearDownAfterClass()`.
- Output per request: `{"error":null|{"stage","class","message"},"results":[…]}`; a result is `{"value":<enc>}` or `{"throws":{"class","message"}}`. Value encoding is lossless and fixed: null/bool/string as JSON (non-UTF-8 → `{"bytes":b64}`), `{"int":"<dec>"}`, `{"float":"<var_export>"}`, `{"array":[[key,value],…]}`, `{"enum":"C::Case"}`, `{"mock":"<mocked class>"}` for Mockery mocks, `{"object":"C","properties":[[name,scope,value],…]}` from the `(array)` cast (no magic methods), `{"recursion":"C"}`, `{"resource":"type"}`. The framework directory in any string becomes `{root}` (as lister.php's export does), so image and local runs give the same bytes.
- Fixture file: one compact line + LF, keys `sha256`, `output`, `signature`, `output` in canonical JSON (`tools/oracle/request.ts` `canonicalJson`). `signature` = base64 Ed25519 over the UTF-8 bytes of `xaravel-oracle-fixture-v1\n` + `canonicalJson({output, sha256})`. Ed25519 is deterministic, so two runs give identical files.
- Signing happens in Bun (`node:crypto`), never in the PHP container. The private key is read only from env `ORACLE_SIGNING_KEY` (PKCS#8 PEM). The run fails unless its public key equals `conformance/oracle/oracle.pub` (SPKI PEM). The fingerprint is the lowercase hex SHA-256 of the SPKI DER, printed by `bun run oracle:fixtures fingerprint` and recorded in `docs/ops/oracle.md`.
- Determinism (ESC-3.2-1, option 1): both passes are compared per `sha256` (canonical JSON of `output`). `conformance/oracle/nondeterminism.jsonl` lists the known random requests, one line `{"sha256","id","reason"}` (keys in that order, compact, LF, sorted by `id` then `sha256`, no duplicates, each `id` equal to the committed request's). A listed request gets no fixture. A difference in an unlisted request writes no fixture, writes `conformance/escalations/ESC-bot-<n>.md` (next free `n`; `trigger: open-question`; `test_ids` = the differing requests' ids; `evidence` lists each id, sha256 and both output digests) and exits 1. A listed `sha256` that is not a committed request, whose `id` differs, or whose two outputs are identical fails the run (exit 1, no fixtures, no Escalation). `--determinism` does the same comparison without a key and writes no fixtures. The first `nondeterminism.jsonl` holds the 23 requests of `spec-3-2-prototype/nondeterministic-requests.txt`, each with its random source as `reason`.
- Write mode replaces `conformance/fixtures/<component>/*.json` for the Components it writes, deleting stray `*.json` there; it never touches `conformance/fixtures/generators/`.
- CLI shape of `tools/oracle/extract.ts`: `main(argv)`, `UsageError` → 2, `--root`, `--image <ref>` | `--local <dir> [--php <bin>]`; Docker only through `runInImage`. XT tests use `bun:test` and the PHP guard of `php-scripts.test.ts`.

**Never:** No change to the spine, SPEC, PRD or `epics.md`. No new npm dependency. No private key committed, generated by an agent, or written to disk by the tool. No seeding or pinning of Upstream randomness. No per-PR fixture commits or `conformance/oracle-requests/` handling (Story 3.4); no CI verification of committed fixtures (Story 3.3). No edit of `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or their workflows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | committed requests, key matching `oracle.pub` | one fixture per request (per ruling), signature verifies with `oracle.pub` | none |
| Random request | output differs between passes and is not in `nondeterminism.jsonl` | no fixture written, `ESC-bot-<n>.md` written | exit 1, each differing id on stderr |
| Listed random request | differs, listed | no fixture for it; the rest written | none |
| Stale listing | listed `sha256` not committed, wrong `id`, or identical outputs | nothing written | exit 1 naming the line |
| Wrong key | `ORACLE_SIGNING_KEY` public half ≠ `oracle.pub` | nothing written | exit 1 `signing key does not match conformance/oracle/oracle.pub` |
| No key / no pub | env unset, or `oracle.pub` missing | nothing written | exit 1 naming what is missing |
| Expr throws | `Str::of(…)->x()` throws | result `{"throws":{…}}`, later exprs still run | none |
| Stage error | `setUp`/bindings/setup throws, fatal error, timeout | `error.stage` set, `results` empty (tearDown: results kept) | none |

</intent-contract>

## Code Map

- `_bmad-output/implementation-artifacts/spec-3-2-prototype/evaluate.php` -- working prototype of the evaluator (this run): bootstrap copied from `tools/inventory/lister.php:160-199`, Registry init, `Encoder`, `withTestCase`, `evalBody`, `runChild` (fork + socket pair + timeout). Evaluates all 1,857 requests in ~41 s locally. On resume, write `tools/oracle/evaluate.php` from it with the Write tool and `git rm` the prototype directory (never `mv` a tracked file).
- `_bmad-output/implementation-artifacts/spec-3-2-prototype/nondeterministic-requests.txt` -- the 23 differing requests (sha256, id); seeds ESC-3.2-1's ruling.
- `tools/oracle/request.ts` -- `canonicalJson` (132), `parseRequests` (363), `readSchema` (195), `REQUESTS_DIR` (33), `compareUnits` (94).
- `tools/oracle/extract.ts` -- CLI model: options parsing, `--local`/`--image`, `runInImage` mounts, `--check` drift output.
- `tools/oracle/oracle.ts` -- `runInImage` (720), `IMAGE_UPSTREAM_DIR` (60), `PHP_VERSION` (58), `imageTag` (619).
- `tools/escalations/escalations.ts` -- Escalation frontmatter rules (`ESC-bot-<n>`, triggers); validate generated records with its `check`.
- `tools/workflow-permissions/workflow-permissions.ts:19` -- `ALLOWED_WRITE_JOBS` already holds `oracle.yml#oracle`.
- `.github/workflows/oracle.yml` -- `oracle` job (push/dispatch on main): add the batch after the push, env `ORACLE_SIGNING_KEY: ${{ secrets.ORACLE_SIGNING_KEY }}` in GitHub environment `oracle`, upload `conformance/fixtures/` (and any `ESC-bot-*.md`) as artifact; add `schedule` (nightly) running `--determinism`.
- `conformance/protected-paths` -- `/conformance/` already protects `conformance/oracle/oracle.pub`; `!/conformance/fixtures/` keeps fixtures unprotected. `.github/CODEOWNERS:8` lists `/conformance/fixtures/` with no owner.
- `docs/ops/oracle.md` -- add "Fixtures" section: command, modes, output encoding, fixture format, signing, fingerprint, determinism, Maintainer-run steps.
- `docs/ops/identities.md` -- add the `oracle` environment secret `ORACLE_SIGNING_KEY` to the identity/secret table.
- Observed outputs: 111 `throws` results and 4 `fatal` stages (Blade compile errors such as "Cannot 'break' 2 levels") on the committed requests; largest line ~360 KB after Mockery elision; ~1 MB total.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/evaluate.php` -- finish the prototype; apply the ESC-3.2-1 ruling where it touches evaluation.
- `tools/oracle/fixtures.ts` + `package.json` script `oracle:fixtures` -- CLI: modes write (default, `--out <dir>` overrides `conformance/fixtures`), `--determinism`, `fingerprint`; runs evaluate.php twice (image: tools + requests mounted read-only; local: local php), compares, signs, writes or reports, writes the Escalation on difference. Exports `fixtureMessage` and `verifyFixture` for Story 3.3.
- `conformance/oracle/nondeterminism.jsonl` -- the 23 requests with reasons, per the ESC-3.2-1 ruling; `git rm` the prototype directory.
- `.github/workflows/oracle.yml` -- batch step, artifact upload, nightly schedule, environment `oracle`.
- `conformance/tests/xaravel/oracle-fixtures.test.ts` -- XT-conformance-71 (fixture root with a few requests and a fake runner + a test key pair generated in the test: files written at the right paths with the right keys, signatures verify with the pub, wrong/no key fails, strays deleted, generators untouched; a real PHP part under the guard evaluates one request of each kind against `/tmp/xaravel-inv/framework` when present), XT-conformance-72 (a runner whose second pass differs → exit 1, no fixtures, valid `ESC-bot-<n>.md`; identical passes → identical bytes across two runs), XT-conformance-73 (`oracle.pub` path is Protected per `conformance/protected-paths`; when `oracle.pub` exists, `docs/ops/oracle.md` records its fingerprint).
- `docs/ops/oracle.md`, `docs/ops/identities.md` -- as in the Code Map.

**Acceptance Criteria:**
- Given the extracted requests, when the Oracle batch job runs, then it writes `conformance/fixtures/<component>/<sha256>.json` with the request hash, the output and an Ed25519 signature over both, and the private key exists only as a secret of `oracle.yml#oracle`.
- Given the same Pin and requests, when the batch runs twice (as the nightly re-check does), then outputs are identical, and any difference fails the job and writes an Escalation.
- Given `conformance/oracle/oracle.pub`, when inspected, then it is a Protected Path and its fingerprint is in `docs/ops/oracle.md`.

**Maintainer-run steps (not agent steps):** generate the Ed25519 key pair off the agent host; store the private key as secret `ORACLE_SIGNING_KEY` of GitHub environment `oracle` (restricted to `main`); commit `conformance/oracle/oracle.pub` and its fingerprint in `docs/ops/oracle.md`; run `oracle.yml` from `main` and commit the fixtures artifact through a PR.

## Design Notes

Fixtures are named by request `sha256` (ESC-3.1-1), since a Test ID has several requests and its `#`, spaces and backslashes cannot be file names. The signed message has a domain prefix so a fixture signature cannot be replayed as any other signed object. Mockery mocks are encoded by the class they mock: their internals (ReflectionMethod graphs) are Mockery's, not Laravel's, and took the output from 9.3 MB to 1 MB.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle-fixtures.test.ts` -- all pass
- `ORACLE_SIGNING_KEY=<test key> bun run oracle:fixtures --local /tmp/xaravel-inv/framework --out <tmp>` with a matching test `oracle.pub` in a temp root -- exit 0, fixtures verify
- `bun run oracle:fixtures --determinism --local /tmp/xaravel-inv/framework` -- exit 0 with the 23 listed requests exempt
- `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `escalations:check`, `bun test` -- clean

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 39 findings — high 0, medium 12, low 17, false 6, maybe-false 4
- findings:
  - `[low]` `[defer]` (intent) evaluator stages setUp/bindings/tearDown/fatal/timeout and encodings bytes/enum/mock/object/recursion/resource have no real-PHP test — exercised by the 2026-10-17 full run (1,857 requests, 4 fatal, 111 throws) but not pinned; deferred.
  - `[false]` `[reject]` (intent) batch logic tested only against a stand-in — the real run is the Verification commands (determinism and write over all 1,857, run this pass); the stand-in pins the TS logic as XT tests should.
  - `[false]` `[reject]` (intent) signature not verified with the committed `oracle.pub` — the key is a Maintainer-run step by intent ("No private key … generated by an agent"); XT-73's fingerprint check activates when the file lands.
  - `[false]` `[reject]` (intent) nightly runs a separate keyless `determinism` job instead of `oracle` — epics.md says "as the nightly re-check does"; a keyless job holds no write scope or secret, which AD-18/least-privilege prefers.
  - `[medium]` `[patch]` (intent/edge/blind/verification) PHP guard fails under `require` only when php is missing — gate changed to any unmet reason.
  - `[low]` `[patch]` (intent/edge) stale listing + unlisted difference still wrote an Escalation — Escalation now skipped when the listing is stale.
  - `[false]` `[reject]` (intent) extra surface (`--out`, `verifyFixture`, `deps`, Secrets table, uploads) — named in the spec's Tasks/Code Map.
  - `[medium]` `[patch]` (edge/blind) fixtures of a removed Component never deleted — non-Component subdirectories of `<out>` (except `generators/`) are now cleaned.
  - `[low]` `[reject]` (edge) a `*.json` directory under a Component dir makes rmSync throw — no tool creates one; fails loudly.
  - `[low]` `[reject]` (edge/blind) writes not atomic — the batch writes a CI artifact; a failed run is rerun, and a guard adds complexity.
  - `[low]` `[patch]` (edge, claim) Escalation written alongside a stale listing contradicts the spec — same fix as above.
  - `[low]` `[reject]` (edge) a writeEscalation failure hides the differing ids — it validates its own fixed template; unreachable in practice.
  - `[low]` `[patch]` (edge) non-canonical base64 / wrong-length signature passes the format check — now requires round-trip base64 and 64 bytes.
  - `[medium]` `[patch]` (edge/blind) `verifyFixture` throws on a bad public-key string — now returns it as a problem.
  - `[false]` `[reject]` (edge) CRLF in evaluate.php stdout — evaluate.php writes "\n" only; a stray line fails loudly by count.
  - `[low]` `[reject]` (edge) evaluate.php collapses a repeated file argument — fixtures.ts never passes one.
  - `[low]` `[reject]` (edge) no overall timeout in local mode — each child has its 60 s limit; CI jobs have timeouts.
  - `[low]` `[patch]` (edge) failed batch would upload the checkout's fixtures — fixtures upload now `if: success()`, Escalations `if: always()`.
  - `[low]` `[reject]` (edge) test TypeError when a kind has no unlisted request — the committed set has all five; fails loudly.
  - `[low]` `[patch]` (edge/blind/verification) docs say `determinism` runs with `--image <ref>` — docs corrected.
  - `[medium]` `[defer]` (blind) nightly never compares fresh outputs with committed fixtures — not in this Story's AC (two-pass identity); Story 3.3/3.4 own fixture verification.
  - `[maybe-false]` `[defer]` (blind) signature does not bind Pin/image/evaluator — would be medium if true; settles once Story 3.3 decides how a stale fixture is detected.
  - `[medium]` `[patch]` (blind/verification) `oracle` job fails until the Maintainer key exists, undocumented — documented in Maintainer-run steps; fail-closed kept.
  - `[maybe-false]` `[defer]` (blind) ESC-bot numbers collide across uncommitted runs — medium if true; depends on how Story 5.8's bots commit records.
  - `[low]` `[reject]` (blind) `--out` resolved against cwd can delete foreign `*.json` — same convention as extract.ts; operator-chosen path.
  - `[medium]` `[patch]` (blind/verification) `--local` mode untested — test with a fake php added.
  - `[low]` `[reject]` (blind) spec still names the deleted prototype paths — fix is a spec edit.
  - `[medium]` `[patch]` (verification) real-PHP test passes one file, multi-file loop unexecuted — split over two files.
  - `[medium]` `[patch]` (verification) parsePass guards unpinned — stand-in cases for missing, misattributed and malformed lines added.
  - `[low]` `[patch]` (verification) `{root}` check vacuous — now asserts a framework path renders as `{root}/…`.
  - `[medium]` `[patch]` (blind, dup) guard require gate — counted above; same fix.
  - `[medium]` `[patch]` (verification, dup) `oracle` job fails before key — same fix.
  - `[medium]` `[patch]` (edge, dup) removed-Component cleanup — same fix.
  - `[low]` `[patch]` (blind, dup) docs `--image` mismatch — same fix.
  - `[medium]` `[patch]` (blind, dup) verifyFixture throws — same fix.
  - `[maybe-false]` `[defer]` (intent) committed listing is not re-checked to differ in CI — the nightly `--determinism` does exactly that (stale identical lines fail); unverified until it runs on the image.
  - `[maybe-false]` `[defer]` (intent) image vs local byte equality unverified — no Docker on the agent host; first `oracle` run settles it.
  - `[low]` `[defer]` (verification) evaluate.php regressions surface only on main — follows from the php-fixtures CI job not running this file; adding it is a `.github/workflows/ci.yml` change.
  - `[false]` `[reject]` (intent) R4/R5 readings — R4a is implemented as intended; R5 covered by the guard patch.

## Auto Run Result

Run 2026-10-17. Status: blocked. Blocking condition: intent gap, raised as `conformance/escalations/ESC-3.2-1.md`.

- **What happened.** Planning prototyped the evaluator (`spec-3-2-prototype/evaluate.php`) and ran all 1,857 committed requests twice on PHP 8.5.11 against the locked local install. 1,834 give identical outputs; 23 (all in `support.jsonl`: random UUIDs, ULIDs, random strings, an encryption IV) differ. The AC wants identical outputs and fixtures for every extracted request, so as written the batch can never pass, and excluding requests is a choice the AC does not make. ESC-3.1-1 says randomness yields no request, but Story 3.1's extractor has no rule for it.
- **Proposed.** ESC-3.2-1 option 1: a Protected findings file of the 23 non-deterministic requests (as ESC-2.6-1 did for the baseline); listed requests get no fixture and stay ordinary Ported Tests; any new difference still fails and escalates.
- **On resume.** Implement the Tasks above with the ruling applied. The Maintainer-run key steps above are needed before a live batch run, independently of the ruling; plan them as deferrals that name the Maintainer, not as agent steps.

Run 2026-10-18 (resume after ESC-3.2-1, option 1). Status: done.

- **Summary.** `bun run oracle:fixtures` evaluates every committed Oracle request twice with `tools/oracle/evaluate.php` (Oracle image via `runInImage`, or `--local`), compares the passes, applies `conformance/oracle/nondeterminism.jsonl` (23 random requests, per the ruling), signs each output with Ed25519 from `ORACLE_SIGNING_KEY` checked against `oracle.pub`, and writes `conformance/fixtures/<component>/<sha256>.json`. An unlisted difference writes `ESC-bot-<n>.md` and fails. `--determinism` and `fingerprint` modes. `oracle.yml#oracle` runs the batch after the push in environment `oracle`; a keyless nightly `determinism` job re-checks.
- **Files.** `tools/oracle/evaluate.php` (from the prototype; several request files), `tools/oracle/fixtures.ts` (batch, signing, `verifyFixture` for Story 3.3), `conformance/oracle/nondeterminism.jsonl`, `package.json` (`oracle:fixtures`), `.github/workflows/oracle.yml` (batch step, uploads, nightly job), `conformance/tests/xaravel/oracle-fixtures.test.ts` (XT-conformance-71..73), `conformance/tests/xaravel/oracle.test.ts` (XT-conformance-43 for the new workflow shape), `docs/ops/oracle.md` (Fixtures), `docs/ops/identities.md` (Secrets). Prototype directory removed.
- **Review.** 39 findings: 11 patches (8 medium, 3 low, plus duplicates), 6 deferred (frontmatter), the rest rejected with reasons in the triage log.
- **Follow-up review: recommended.** Eight medium entries were patched (parsePass/`--local` tests, removed-Component cleanup, `verifyFixture` contract, PHP guard, docs), and the patched cleanup and `verifyFixture` code was not re-reviewed.
- **Verification.** `bun test` 93 pass (the real-PHP evaluator test ran); `typecheck`, `lint`, `workflows:check`, `escalations:check`, `scaffold:check`, `graph:check`, `ownership:check` clean; `oracle:fixtures --determinism --local /tmp/xaravel-inv/framework`: 1,857 requests, 1,834 identical, 23 listed differ; write mode in a temp root with a throwaway key: 1,834 fixtures, all verify (key deleted).
- **Residual risks.** No fixtures exist until the Maintainer-run key steps are done; until then the `oracle` job fails after the image push. Image mode was never run (no Docker on the agent host).
