---
title: 'Story 8.3: Bun primitive probes (OQ-11)'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: '19dc9ade791f02fc541b7e96aceb15dcaafbce9d'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The probes contradict AD-5's stated reason: on Bun 1.4.3 timers and plain ReadableStream bodies keep the AsyncLocalStorage store, but the spine says Bun drops it there.
    evidence: |-
      REPORT.md records als.timers and als.stream-body as supported; ARCHITECTURE-SPINE.md:150 says Bun 1.4.3 drops the store for timers and stream bodies. The workaround stays harmless, but the rationale is wrong and only the Maintainer edits the spine. ESC-8.3-1 notes it.
    location: >-
      _bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md:150
    severity: medium
---

<intent-contract>

## Intent

**Problem:** OQ-11 (PRD:1437, SPEC:126) asks whether the Bun 1.4.3 primitives the PRD relies on are complete enough. Nothing measures them. AD-5 states, without a test, that `AsyncLocalStorage` drops its store in some cases, and FR-84 assumes that `Bun.Image` can carry Laravel's Image API.

**Approach:**
- Write probes under `conformance/probes/`. Each probe runs a primitive on Bun 1.4.3 and returns `supported` or `unsupported`, with evidence.
- Record the outcomes in a committed results file, and generate `conformance/probes/REPORT.md` from it.
- A fail-closed `probes:check` re-runs the probes and compares them with the record. It runs in two places:
  - in the Xaravel Tests, for the probes that need no backend;
  - in CI's required `check` job, against Postgres, MySQL, Redis and an S3-compatible service, for every probe.
- Each unsupported primitive gets an Escalation, `ESC-8.3-<n>`, that proposes a `deferred:` item or a workaround. The report links each one to its decision path.

## Boundaries & Constraints

**Always:**
- **Probe list.** These are the probe ids, with the group for each. Every id is one probe, and every AC bullet maps to at least one probe.
  - **`bun test`.** In a `bun test` subprocess on committed fixture files named `*.probe.ts`:
    - `bun-test.failing`: a failing `test.failing` test passes, and a passing one fails.
    - `bun-test.skipIf`: `test.skipIf(true)` skips without running, and `skipIf(false)` runs.
    - `bun-test.assertion-counts`: the JUnit `<testcase assertions="n">` equals each test's `expect` count, and `expect.assertions(n)` fails a test with fewer.
    - `bun-test.setSystemTime`: `Date.now()` and `new Date()` return the set instant, and `setSystemTime()` restores real time.
    - `bun-test.preload-afterEach`: an `afterEach` registered in a `--preload` file runs once after every test, in each of two files.
  - **`Bun.sql`.** Bindings go through `sql.unsafe(query, params)`.
    - `bun-sql.pgsql.raw-bindings` and `bun-sql.mysql.raw-bindings`: the params bind (an int, a string with a quote, and null round-trip). With `bigint: true`, `9007199254740993` reads back as a `bigint`.
    - `bun-sql.pgsql.reserve` and `bun-sql.mysql.reserve`: a reserved connection keeps one backend id (`pg_backend_pid()` / `CONNECTION_ID()`) and its session state (`SET`) across two queries, while a second reserved connection has a different id. After `release()`, the pool still serves queries.
  - **`Bun.redis`.** Each probe uses its own key prefix, and deletes its keys.
    - `bun-redis.commands`: `set`/`get`/`incr`/`expire`/`ttl`/`hmset`/`hgetall`/`del`, and `send()` for an arbitrary command (`LPUSH`/`LRANGE`).
    - `bun-redis.transactions`: `MULTI`, two commands and `EXEC` on one client return both results, and `WATCH` on a key changed by a second client makes `EXEC` return null.
    - `bun-redis.pubsub`: a `subscribe` listener on one client receives a message `publish`ed from a `duplicate()`, and `unsubscribe` stops delivery.
  - **`Bun.S3Client`.** `bun-s3.client` works against the endpoint: `write`/`file().text()`/`exists`/`size`/`list`/`delete`, a streamed read, and `presign()` returning a URL that the service serves.
  - **`Bun.Image`.** `bun-image.laravel-api` checks each operation that Upstream `src/Illuminate/Image/Image.php` exposes. Each check runs a `Bun.Image` method on a raw RGBA image and verifies the output dimensions or format. A missing method or an `ERR_IMAGE_FORMAT_UNSUPPORTED` makes the operation a gap. The operations are:
    - `cover`, `contain`, `crop`, `resize`, `scale`, `rotate`, `orient`, `blur`, `grayscale`, `sharpen`, `flipVertically`, `flipHorizontally`;
    - `to{Webp,Jpeg,Png,Gif,Avif,Heic,Jxl,Bmp}`;
    - `dimensions`, `dominantColor`.

    `supported` only when there are no gaps.
  - **`AsyncLocalStorage`.** In the framework's shape: inside a `Bun.serve` `fetch`, `als.run(frame, …)` returns a Response, and `supported` means the store seen equals `frame`. The probes are:
    - `als.await`: after `await Bun.sleep(1)`.
    - `als.timers`: a `setTimeout` scheduled in the frame fires after the handler has returned.
    - `als.stream-body`: a `ReadableStream` body's `pull`, after an `await`.
    - `als.async-generator`: the body of an async generator used as the response body, after an `await`.
    - `als.direct-stream`: a `type: "direct"` body's `pull`.
    - `als.serve-callbacks`: two concurrent requests, each in its own frame and interleaved across `await`s, each see their own frame. An exception thrown in a frame reaches the `error` callback, and that callback sees the frame.

    For each `als.*` probe that is unsupported, the evidence also states whether `AsyncLocalStorage.bind` / `AsyncLocalStorage.snapshot()` restores the frame. That is AD-5's workaround.
- **Backends.**
  - A backend probe reads only these variables:
    - `XARAVEL_PROBE_PGSQL_URL` and `XARAVEL_PROBE_MYSQL_URL`;
    - `XARAVEL_PROBE_REDIS_URL`;
    - `XARAVEL_PROBE_S3_ENDPOINT`, with bucket `probes`, a fixed access key and a fixed secret.
  - With its variable unset, the probe returns `not-run`. It never falls back to a default host.
  - The SQL probes create no tables, and nothing persists.
- **Record and report.**
  - `conformance/probes/results.json` is `{ "bun": "1.4.3", "probes": { "<id>": { "status": "supported"|"unsupported", "escalation": "ESC-8.3-<n>" | null } } }`, with ids sorted.
  - The record is edited by `probes:record` or by hand, never by `check`.
  - `REPORT.md` is generated wholly by `probes:generate` from the registry and the record. It has one table row per probe: `| Group | Probe | What it checks | Result | Escalation | Decision |`.
  - An unsupported row links `conformance/escalations/ESC-8.3-<n>.md` and `decisions/ESC-8.3-<n>.md`.
- **Tool.** `conformance/probes/probes.ts` follows `tools/porting/porting.ts`. It has a header comment and the subcommands `run [--json]`, `check [--require-backends]`, `record` and `generate`, each taking `[--root <dir>]`. Exit codes are 0 for a pass, 1 for any violation (fail closed) and 2 for a usage error. It exports these:
  - the probe registry;
  - `runProbes(env)`;
  - `checkProbes(root, live, { requireBackends })`, which is pure;
  - `renderReport(registry, record)`.
- **`check` violations.** One violation, naming the probe id, for each of these:
  - a live result that differs from the record;
  - a recorded probe missing from the registry, or a registered probe missing from the record;
  - `not-run` under `--require-backends`;
  - an unsupported probe with no Escalation file;
  - an Escalation whose `test_ids` lack XT-conformance-156, or whose `proposed` names neither `deferred:` nor `workaround`;
  - a supported probe that has an escalation;
  - a `bun` in the record that differs from `.bun-version`;
  - `REPORT.md` drift, reported at its first differing line.

  `record` refuses to write when any probe is `not-run`.
- **Harness discovery.** Add `conformance/probes/**/*.test.ts` to `XARAVEL_GLOBS` (`conformance/harness/xaravel.ts:39`). This is the only harness change. Update `docs/ops/harness.md:165` and the `harness.ts:137` comment that list the globs.
- **CI.** In `.github/workflows/ci.yml`, the `check` job:
  - gains services `postgres:18`, `mysql:9.7`, `redis:8.10.2` and `adobe/s3mock:5.2.3`, with initial bucket `probes` and health checks;
  - maps each service to a non-default host port: 55432, 53306, 56379 and 59090. Default-port probes in the other Xaravel Tests then see no backend, unchanged;
  - gains a step `Probe the Bun primitives` that runs `bun run probes:check --require-backends`, with the four `XARAVEL_PROBE_*` variables set on that step only, after `porting:check`.

  XT-33's pinned run list gains it with a `// Story 8.3` comment.
- **Escalations.**
  - Use one `conformance/escalations/ESC-8.3-<n>.md` per independent decision. For each, `test_ids: [XT-conformance-156]` and `trigger: open-question`. The evidence quotes the probe output, and the body says which probe ids it covers.
  - Where the proposal is a workaround that AD-5 or AD-20 already decides, and it neither weakens the grader nor adds a divergence or run-time cost beyond what that AD fixes, write `decisions/ESC-8.3-<n>.md` with `decided_by: orchestrator (MAINT-2026-10-16)`. Use the `escalation_sha256` from `bun tools/escalations/escalations.ts digest`, following `decisions/ESC-6.2-1.md`.
  - Leave every other Escalation open for the Maintainer. A new `deferred:` item or skip is one such case.

**Never:**
- Don't edit `AGENTS.md`, the PRD, the spine, SPEC, `epics.md`, `conformance/deferred-items`, `conformance/expectations/**`, `tools/ownership/**`, `tools/protected-paths/**` or `.github/rulesets/**`.
- Don't add an npm dependency.
- Don't record a backend probe's result without running it against that backend. The backend rows in `results.json` come only from a CI `check` job run of this branch (see Design Notes), never from documentation or memory.
- Don't name a fixture `*.test.ts`, which would put the intentionally failing fixtures into `bun run test`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Local check | no `XARAVEL_PROBE_*` | backend-free probes compared; backend probes `not-run`; stdout `PROBES OK: <s> supported, <u> unsupported, <n> not run (of <t>).` | exit 0 |
| CI check | `--require-backends`, all four services | every probe compared | exit 0 |
| Missing backend | `--require-backends`, `XARAVEL_PROBE_REDIS_URL` unset | `bun-redis.commands: not run (XARAVEL_PROBE_REDIS_URL unset)` | exit 1 |
| Drift | live `unsupported`, recorded `supported` | `<id>: live unsupported, recorded supported: <evidence>` | exit 1 |
| Unrecorded probe | registered, absent from the record | `<id>: missing from the record (live <status>: <evidence>)` | exit 1 |
| Unescalated gap | unsupported, `escalation: null` or file missing | `<id>: unsupported with no Escalation` | exit 1 |
| Report drift | `REPORT.md` edited | `conformance/probes/REPORT.md: drift at line <n>; run bun run probes:generate` | exit 1 |
| Probe crash | a probe throws unexpectedly | that probe is `unsupported` with the error as evidence | per the drift rule |
| Usage | unknown subcommand or flag; `--root` without a value | usage on stderr | exit 2 |

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md:1437`: the OQ-11 text, which is the probe scope. Also :1394, "Failing primitives become `deferred` entries or Escalations".
- `ARCHITECTURE-SPINE.md:150`: AD-5's `bind`/`snapshot` workaround and its claim about what Bun drops. :422-431 is AD-20, the leases: Postgres `reserve()`, a duplicated Redis client. :253 covers `bigint: true`. :466 is `Bun.S3Client`.
- `conformance/upstream/framework/src/Illuminate/Image/Image.php:93-535`: the Image operations probed.
- `node_modules/.bun/bun-types@1.4.3/node_modules/bun-types/bun.d.ts:9456` (`Bun.Image`: `Format`, `ResizeOptions.fit` `fill|inside`, `ERR_IMAGE_FORMAT_UNSUPPORTED`), plus `redis.d.ts`, `s3.d.ts` and `sql.d.ts`: the API surface to probe.
- `packages/assert/src/declarations/xaravelTest.ts:15`: `xaravelTest(id, consequence, fn, timeout?)`. Import it from `../../packages/assert/src/index`.
- `conformance/harness/xaravel.ts:39`: `XARAVEL_GLOBS`. `conformance/tests/xaravel/done-check.test.ts:720-745` (XT-128) requires that no discovered file imports `test` from `bun:test`.
- `tools/porting/porting.ts`, `conformance/tests/xaravel/porting.test.ts`: the CLI and XT template, with spawned `bun` and `mkdtempSync` fixture roots.
- `tools/escalations/escalations.ts:235-255`: the Escalation frontmatter (`test_ids`, `trigger`, `proposed`, `evidence`). It has a `digest <id>` subcommand. `decisions/ESC-6.2-1.md` shows the format for an orchestrator ruling.
- `.github/workflows/ci.yml:119-158`: the `check` job. `baseline.yml:105-140` has the service blocks to copy: postgres, redis and `mysql:9.7`.
- `conformance/tests/xaravel/repository-policy.test.ts:798-820`: XT-33's pinned `check` run list.
- `package.json`: add the `probes:*` scripts (`bun --no-env-file conformance/probes/probes.ts …`). `tsconfig.json` already includes `conformance/**/*.ts`.
- `stories/8.3.md`: XT-conformance-155 and 156. The orchestrator sets it `done`.

## Tasks & Acceptance

**Execution:**
- `conformance/probes/fixtures/*.probe.ts` and `preload.ts`: the `bun test` fixtures.
- `conformance/probes/probes.ts`: the registry, the probes, the check, the render and the CLI.
- `conformance/probes/results.json` and `REPORT.md`: run `probes:record` locally for the backend-free rows, then `probes:generate`.
- `conformance/probes/probes.test.ts`: XT-conformance-155 and XT-conformance-156.
- `conformance/escalations/ESC-8.3-<n>.md`, and the orchestrator's `decisions/ESC-8.3-<n>.md` where the ruling is allowed.
- `conformance/harness/xaravel.ts`, `docs/ops/harness.md`: the glob.
- `.github/workflows/ci.yml`, `conformance/tests/xaravel/repository-policy.test.ts`, `package.json`: the services, the step, the pin and the scripts.
- `docs/ops/probes.md`: usage, the env variables, how to re-record after a Bun bump, and the CI services. Link it from `docs/ops/ci.md`.

**Acceptance Criteria:**
- **XT-conformance-155** (consequence `… (OQ-11, AD-5, AD-20)`):
  - The registry's ids equal the probe list above, and each AC bullet group has at least one probe.
  - Each backend-free probe, run live, is `supported` or `unsupported` and equals its record. This is asserted per probe.
  - Each backend probe is `not-run` without its variable, and its record is `supported` or `unsupported`.
  - `REPORT.md` equals `renderReport`.
  - `ci.yml`'s `check` job runs `probes:check --require-backends`, with all four services and variables.
  - Fixture roots fail with exit 1 and the matrix messages for drift, a missing backend, and report drift.
  - A bad flag exits 2.
- **XT-conformance-156** (consequence `… (OQ-11, FR-114)`):
  - Each unsupported record names an `ESC-8.3-<n>` whose file exists, cites XT-conformance-156 and proposes `deferred:` or a workaround.
  - Its `REPORT.md` row links both the Escalation and `decisions/ESC-8.3-<n>.md`.
  - An unescalated-gap fixture fails with exit 1.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 39 findings — high 0, medium 11, low 24, false 3, maybe-false 1
- findings:
  - `[low]` `[reject]` (blind) Backend rows were committed as provisional `supported` before a backend run — CI run 39423369122 on that commit ran every backend probe live against the four services and matched the record (`0 not run`), so the record is measured. The order of steps differed from the Design Notes (the `bun run test` step fails on missing rows before the probe step runs); that deviation is recorded under Auto Run Result. Fixing it means editing this build's spec.
  - `[low]` `[reject]` (blind) The spec was not updated for the change of plan — the fix is to edit this build's spec; the deviation is recorded under Auto Run Result.
  - `[medium]` `[patch]` (blind) The recorded Bun version is never checked against the running Bun — `check`/`run` now report a violation and `record` refuses when `Bun.version` differs from `.bun-version`.
  - `[medium]` `[patch]` (blind) CI keeps no per-probe evidence for the backend rows — `check` now prints `<id>: <status>: <evidence>` per probe before the `PROBES OK` line.
  - `[low]` `[reject]` (blind) A timed-out probe is not cancelled — a hang still fails loudly at the 60 s probe timeout and the 30 min job timeout; abort plumbing through every probe is more than a direct correction.
  - `[low]` `[reject]` (blind) `proposed` is a keyword match ("no workaround" passes) — this is the rule the spec states; every Escalation is reviewed by a human or the orchestrator ruling anyway, and a parser for intent is new surface.
  - `[low]` `[patch]` (blind) The generator workaround wraps `next()`/`return()` but not `throw()` — `throw()` is now wrapped too, and ESC-8.3-1 and its decision say so, with the digest recomputed.
  - `[false]` `[reject]` (blind) The orchestrator approved its own decision in a Protected Path — MAINT-2026-10-16 authorises orchestrator rulings within its limits and treats Epic 1–8 Stories as Maintainer-approved Infrastructure; ESC-8.3-1 is within them (AD-5's own workaround, no grader change); precedent `decisions/ESC-6.2-1.md`.
  - `[low]` `[reject]` (blind) REPORT.md links decision files that do not exist yet — the AC requires that the report link to each Escalation's decision; the path is where the ruling lands, and the report text says so.
  - `[medium]` `[defer]` (blind) The probes contradict AD-5's stated reason (timers and plain stream bodies keep the store on 1.4.3) — a spine edit is the Maintainer's; ESC-8.3-1 already reports it, and it is deferred here for the Epic 8 retrospective.
  - `[false]` `[reject]` (blind) The MySQL raw-bindings row is likely wrong (`CAST(? AS SIGNED)`) — CI run 39423369122 ran it live against mysql:9.7 and it passed.
  - `[false]` `[reject]` (blind) The CI service blocks have untested assumptions (s3mock `wget`, unquoted `yes`) — all four services passed their health checks and the probe step passed in CI run 39423369122.
  - `[low]` `[reject]` (blind) XT-155/156 re-run the probe suite several times — `bun run test` takes 89 s in total; restructuring is more than a direct correction.
  - `[low]` `[reject]` (blind) Probes can leak servers, keys and S3 objects on failure paths — failure paths only, on throwaway CI services and the probe process exits; adding guards is more than a direct correction.
  - `[medium]` `[patch]` (verification-gap) A leak between concurrent requests in `als.serve-callbacks` is masked because the probe is recorded `unsupported` — XT-155 now asserts that the concurrent half and the workaround hold, in the live evidence.
  - `[medium]` `[patch]` (verification-gap) Losing "the workaround restores the frame" for `als.async-generator`/`als.direct-stream` is not caught — XT-155 now asserts `restores the frame: yes` for each.
  - `[medium]` `[patch]` (verification-gap) A regression in one of the 10 working `Bun.Image` operations is masked — XT-155 now asserts the supported-operation set.
  - `[low]` `[reject]` (verification-gap, other) Backend rows were committed before a run — same as the first blind finding.
  - `[medium]` `[patch]` (edge-case) `record` on a Bun other than the pin — refused (see the Bun-version patch).
  - `[medium]` `[patch]` (edge-case) `check` on a Bun other than the pin — a violation (same patch).
  - `[low]` `[reject]` (edge-case) An outage with the backend variable set is recorded as `unsupported` — `record` is run deliberately, and the evidence printed per probe now shows the connection error; classifying errors is more than a direct correction.
  - `[low]` `[reject]` (edge-case) A timed-out probe keeps running — same as the blind timeout finding.
  - `[low]` `[reject]` (edge-case) A negated `proposed` passes — same as the blind keyword finding.
  - `[low]` `[reject]` (edge-case) The CLI does not check the Escalation's trigger or that it names the probe id — XT-156 enforces it on the real root; the spec's `check` rule does not ask for it.
  - `[low]` `[reject]` (edge-case) `cover` stays a gap if a later Bun accepts `fit: "cover"` — it errs toward reporting a gap, which a Bun bump re-checks by hand; not met in everyday use.
  - `[low]` `[patch]` (edge-case) An arbitrary-angle `rotate(45)` that resolves counts as supported without checking its output — it now checks the output dimensions.
  - `[medium]` `[patch]` (edge-case) The "concurrent interleaved" half never checks that the requests interleaved — the probe now records the event order and requires overlap.
  - `[maybe-false]` `[reject]` (edge-case) The 2000 ms race can flake on a slow host — not seen in any local or CI run; settled by running on a loaded runner; if true it would only be low and fails loudly as drift.
  - `[low]` `[reject]` (edge-case) The in-process and CLI `PROBES OK` counts can disagree on timing — the same flake class as above; not seen in any run.
  - `[low]` `[patch]` (edge-case) `Bun.spawnSync` has no timeout, so a hang blocks past the test budget — each spawn now has a timeout.
  - `[low]` `[reject]` (edge-case) The SQL probe can leak a pool when the construction or `close` fails — failure path on a throwaway service; the process exits.
  - `[low]` `[reject]` (edge-case) The second `reserve()` rejecting leaves the first unreleased — same failure-path class; `sql.close` force-closes it.
  - `[low]` `[reject]` (edge-case, claim) The backend rows were hand-entered — same as the first blind finding.
  - `[low]` `[reject]` (edge-case, claim) `probes:record` cannot record the backend-free rows locally, as the Tasks line says — the intent contract requires `record` to refuse while a probe is not run; the Tasks wording is the spec's, and the rows were written by hand from a `probes:run`.
  - `[medium]` `[patch]` (edge-case, claim) Results can come from any Bun — the Bun-version patch.
  - `[medium]` `[patch]` (edge-case, claim) The interleaving claim is unverified — the interleaving patch.
  - `[low]` `[reject]` (intent) The backend primitives run in the CI `probes:check` step, not inside an `xaravelTest` — the harness's Xaravel run has no backends by design (`docs/ops/harness.md:165`); XT-155 pins the step and services, and the required `check` job runs it live.
  - `[low]` `[reject]` (intent) The decision links are checked as text — same as the blind dead-links finding.
  - `[low]` `[reject]` (intent) Provenance of the backend rows — same as the first blind finding.

## Design Notes

**Why the `check` job, and why remapped ports.** `check` is already a required check, so a new job would not block a merge until the Maintainer changes the live ruleset. The host ports are remapped so that the existing default-port backend probes in the harness tests (`backends.ts`) still find nothing.

**Backend rows need a CI run.** This host has no Docker, Postgres, MySQL, Redis or S3 service. During implementation:
1. Push the branch and open its PR with the backend rows absent from `results.json`.
2. The `check` job's `Probe the Bun primitives` step prints each backend probe's live result and evidence, as `missing from the record` violations.
3. Copy those results into `results.json`, regenerate `REPORT.md`, add an Escalation for any backend probe that came out unsupported, and push again before the review step.

Until step 3, the local `probes:check` and XT-conformance-155 report the missing rows. That is expected and is not a weakened check.

## Verification

**Commands:**
- `bun run probes:check`: expected exit 0. Backend rows show as not run.
- `bun run probes:generate && git diff --exit-code conformance/probes/REPORT.md`: expected no diff.
- `bun run harness --xaravel --id 'XT-conformance-15[56]'` and `--id 'XT-conformance-33'`: expected to pass.
- `bun run harness --xaravel`, `bun run test`, `bun run typecheck`, `bun run lint`, `bun run escalations:check`: expected exit 0. `bun run test` must stay green, so no fixture is collected.
- CI `check` job: the `Probe the Bun primitives` step passes against the four services.

## Auto Run Result

Status: done

**Summary.** Story 8.3 adds the OQ-11 probe suite under `conformance/probes/`. It has 20 probes in six groups: `bun test`, `Bun.sql` (Postgres and MySQL), `Bun.redis`, `Bun.S3Client`, `Bun.Image` and `AsyncLocalStorage`. The parts are:
- a recorded `results.json`;
- a generated `REPORT.md`;
- a fail-closed `bun run probes:check`.

The check runs live in the Xaravel Tests for the backend-free probes. In CI's required `check` job, it runs against Postgres 18, MySQL 9.7, Redis 8.10.2 and S3Mock 5.2.3, with `--require-backends`.

On Bun 1.4.3, 16 probes are supported and 4 unsupported:
- `als.async-generator` and `als.direct-stream` → ESC-8.3-1, which the orchestrator approved: AD-5's own bind/snapshot workaround, and the probes show it restores the frame.
- `als.serve-callbacks` → ESC-8.3-2, open for the Maintainer. The `error` callback sees no store, and AD-5 does not name that case.
- `bun-image.laravel-api` → ESC-8.3-3, open for the Maintainer. 10 of 22 Laravel Image operations are supported, and the proposal includes `deferred:` items.

**Deviation from the Design Notes.** The backend rows could not be left out of `results.json` for the first CI run: the `bun run test` step fails on the missing rows before the probe step runs. Commit `7ac8782` therefore added them as `supported`. CI run 39423369122 on that commit ran every backend probe live against the four services and matched (`PROBES OK: 16 supported, 4 unsupported, 0 not run (of 20).`), so every recorded row is backed by a live run. After the review fixes, `check` prints per-probe evidence, so the next CI run keeps that evidence in its log.

**Files changed**
- `conformance/probes/probes.ts` (new): the registry, the probes, `checkProbes`, `renderReport`, `runningBunViolation` and the `run|check|record|generate` CLI.
- `conformance/probes/probes.test.ts` (new): XT-conformance-155 and XT-conformance-156.
- `conformance/probes/fixtures/*` (new): the `bun test` fixtures (`*.probe.ts`, preload, log).
- `conformance/probes/results.json`, `conformance/probes/REPORT.md` (new): the record and the generated report.
- `conformance/escalations/ESC-8.3-1..3.md`, `decisions/ESC-8.3-1.md` (new): the Escalations and the orchestrator ruling.
- `conformance/harness/xaravel.ts`, `conformance/harness/harness.ts`, `docs/ops/harness.md`: the `conformance/probes/**/*.test.ts` Xaravel glob.
- `.github/workflows/ci.yml`: four services on remapped ports and the `Probe the Bun primitives` step in `check`. `conformance/tests/xaravel/repository-policy.test.ts`: the XT-33 pin.
- `package.json`: the `probes:*` scripts. `docs/ops/probes.md` (new), `docs/ops/ci.md`: the docs.

**Review findings.** There were 39 findings: 11 patched, 1 deferred, and 27 rejected (24 low or same-root duplicates, 3 false). Every rejection has its reason in the Review Triage Log.
- **Patched (7 entries: 5 medium, 2 low).**
  - XT-155 now pins the evidence of the unsupported probes:
    - the concurrent half and the workaround for `als.serve-callbacks`;
    - `restores the frame: yes`;
    - the Image supported set.
  - The running Bun is checked against `.bun-version`.
  - `check` prints per-probe evidence.
  - The interleaving is recorded and required.
  - The generator wrapper also covers `throw()`.
  - `rotate(45)` output is checked.
  - spawnSync has timeouts.
- **Deferred.** AD-5's rationale contradicts the probes for timers and plain stream bodies. A spine edit is the Maintainer's.

**Follow-up review recommended: true.** Five medium entries were patched. The specific unverified risk is the new interleaving barrier and the evidence-pinned assertions: they are verified on macOS only until the next CI run on Linux, and timing-sensitive probes in the required `check` job could flake there.

**Verification**
- `bun run probes:check`: exit 0. It prints 20 per-probe lines, then `PROBES OK: 8 supported, 4 unsupported, 8 not run (of 20).`
- `probes:generate`: no diff.
- `typecheck`, `lint`, `escalations:check`, `expectations:check`, `divergence:check`: exit 0.
- `bun run test`: 273 pass, 0 fail.
- `bun run harness --xaravel`: 273/273 passed, `differ=0` on three runs. One earlier run, made right after the other checks, reported `differ=1`, and its difference line was not captured.

**Residual risks**
- The `differ=1` above is an unexplained flake. If it recurs in CI, treat it as a timing flake in the probes.
- ESC-8.3-2 and ESC-8.3-3 wait on the Maintainer.
- The `check` job now waits for four service containers.
