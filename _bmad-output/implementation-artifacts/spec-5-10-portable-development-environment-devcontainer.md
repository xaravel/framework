---
title: 'Story 5.10: Portable development environment (devcontainer)'
type: 'feature'
created: '2026-10-19'
baseline_revision: '46dccedc9d35230d4dc541738eb764cd8a407fdf'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/AGENTS.md'
warnings: [oversized]
deferred:
  - summary: >-
      devcontainer.yml's PR paths filter misses inputs that can break the in-container run (conformance/harness/**, bun.lock, package.json, .bun-version, tools/inventory/inventory.ts, baseline.yml).
    evidence: |-
      The intent contract fixes the trigger list to .devcontainer/**, the workflow and tools/devcontainer/**. Pin drift is still caught on every PR by XT-conformance-192 in ci.yml's harness --xaravel; harness or lockfile breakage inside the container shows only in the nightly devcontainer run.
    location: >-
      .github/workflows/devcontainer.yml on.pull_request.paths
    severity: medium
  - summary: >-
      The devcontainer CLI launch path and linux/arm64 are never exercised by CI; only docker compose on linux-x64 runs.
    evidence: |-
      AC4 asks for one linux-x64 job. arm64 rests on the multi-arch base images (oven/bun, redis, postgres); docs/ops/devcontainer.md says it is unverified.
    location: >-
      .github/workflows/devcontainer.yml
    severity: medium
  - summary: >-
      .devcontainer/ is not a Protected Path, though it defines the reference environment's pins.
    evidence: |-
      Adding it needs an edit to conformance/protected-paths (and the generated CODEOWNERS), which the MAINT ruling forbids the orchestrator unless a Story requires it. The pin check still fails any drift. Raise at the Epic 5 retrospective.
    location: >-
      conformance/protected-paths
    severity: medium
  - summary: >-
      Container images (CI services and the devcontainer) are pinned by tag, not digest; postgres:18 floats across minor releases.
    evidence: |-
      Pre-existing in ratchet.yml, nightly.yml and baseline.yml; the devcontainer mirrors CI's tags so the pin check compares like with like.
    location: >-
      .devcontainer/compose.yaml, .github/workflows/*.yml
    severity: low
---

<intent-contract>

## Intent

**Problem:** Running every alpha Variant locally needs Postgres 18, Redis 8.10.2 and Bun 1.4.3 set up by hand. No single definition brings them up the same way on every machine, and nothing checks that such a definition stays pinned to CI's versions (AD-17 reference environment, AD-28, NFR-1, NFR-7).

**Approach:** Add `.devcontainer/` with three files: a JSON `devcontainer.json`, a Compose file with a `workspace` service and a `postgres` sidecar, and a workspace Dockerfile built on CI's Redis image with Bun copied from `oven/bun:<.bun-version>`. Add a `devcontainer:pins` check, one `devcontainer.yml` workflow that builds the image and runs `bun run harness` inside it, `docs/ops/devcontainer.md`, and XT-conformance-190..195.

## Boundaries & Constraints

**Always:**
- The workspace runs as a non-root user. The UID and GID are build args, `XARAVEL_UID` and `XARAVEL_GID`, default 1000, so a bind-mounted checkout stays writable.
- Every base image is multi-arch (`oven/bun`, `redis`, `postgres`). Nothing pins `platform:` or an arch-specific URL.
- `redis-server` comes from the base image `${REDIS_IMAGE}`, which is exactly CI's `redis:8.10.2`. Postgres is exactly CI's `postgres:18` image.
- `.cache/` and `node_modules/` are named volumes. No Docker socket is mounted. No `env_file`, `APP_KEY` or secret appears anywhere in `.devcontainer/`. The build context is `.devcontainer/`, so no repository file (`.env*` included) enters the image.
- On start, the workspace runs `bun install --frozen-lockfile --ignore-scripts`, CI's install command. Healthy means the install finished.
- The workspace env sets `PGHOST=postgres`, `PGPORT=5432`, and `PGUSER`/`PGPASSWORD` equal to the sidecar's `POSTGRES_USER`/`POSTGRES_PASSWORD`. It never sets `CI`, `REDIS_HOST`, `REDIS_PORT` or `XARAVEL_REDIS_SERVER`. `CI=true` would make `startRedis` probe instead of starting the worktree's own server (`isolation.ts:427`).
- The pin check fails closed and names the file and both values for each mismatch. It compares:
  - the Bun pin: `.bun-version`, the Dockerfile's `ARG BUN_VERSION` and the spine's Stack-table Bun row;
  - the Postgres image: the Compose `postgres` image and every `postgres` service image in `.github/workflows/*.yml` (`baseline.yml` must have one). Its tag must equal the spine's PostgreSQL row;
  - the Redis image: the Dockerfile's `ARG REDIS_IMAGE` and every `redis` service image in the workflows (`baseline.yml` must have one). Its tag must equal the spine's Redis row.
- The `devcontainer.yml` workflow:
  - triggers on `pull_request` (paths `.devcontainer/**`, the workflow itself and `tools/devcontainer/**`), on a nightly `schedule` and on `workflow_dispatch`;
  - runs one job, `devcontainer`, on `ubuntu-24.04`, with no matrix;
  - has `permissions: contents: read` and `persist-credentials: false`, and uses no action other than the pinned checkout;
  - runs the pin check and `bun run harness` (no `--fast`) inside the container, and fails unless the `SUMMARY` line has `not-run=0` and the harness exited 0.
- Native runs stay unchanged. No harness, tool or `story:check` code path references Docker or `.devcontainer/`. The one exception is the pin check, which only reads files.

**Never:**
- Change `nightly.yml`, `ci.yml` or any other existing workflow's jobs. Existing tests pin their job keys.
- Edit `AGENTS.md`. The Maintainer adds the devcontainer line after merge.
- Bake credentials into the image, or install Claude Code in it.
- Make the container required anywhere.
- Weaken any existing test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pins agree | real repo | `devcontainer:pins` exits 0, prints `devcontainer pins: ok` | — |
| Bun drift | temp root, `ARG BUN_VERSION=1.4.2` vs `.bun-version` 1.4.3 | exit 1, `devcontainer pins: Bun …` line naming both | fail closed |
| Postgres drift | Compose `postgres:17` vs baseline `postgres:18` | exit 1, line naming the Compose file and baseline.yml | — |
| Redis drift | spine row 8.10.1 vs `redis:8.10.2` | exit 1, line naming the spine | — |
| Missing source | no `baseline.yml` redis service, or no Stack row | exit 1, `… not found` | fail closed |
| No Docker | hermetic root, PATH without `docker`/`redis-server`, Postgres closed | harness exit 0, `NOT-RUN [pgsql]`, `NOT-RUN [redis]`, `none` runs | — |

</intent-contract>

## Code Map

- `conformance/harness/isolation.ts`:
  - `startRedis` :427-502. With `CI=true` it only probes. Otherwise it uses `XARAVEL_REDIS_SERVER`, else `redis-server` from PATH, on the socket `<root>/.cache/redis.sock`, which must fit in `MAX_SOCKET_BYTES` = 103.
  - `postgresAdmin` :284 reads `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`.
  - `worktreeOf` :65 needs `git` and a real `.git` directory. A `git worktree` checkout's `.git` file points at a host path, so it does not work when mounted.
- `conformance/harness/harness.ts:560-600`: a Variant runs only when it has lines. NOT-RUN lines print as `NOT-RUN [<v>] <n> line(s): <why>`, and the summary as `SUMMARY variants=… run=… not-run=… checked=… differ=…`.
- `conformance/harness/backends.ts:70-95`: `probe`.
- Pin sources:
  - `.bun-version` is `1.4.3`.
  - `.github/workflows/baseline.yml` L106-116 has `image: postgres:18` and `image: redis:8.10.2`. `ratchet.yml` L60/72 and `nightly.yml` L48-69 use the same images.
  - Spine `ARCHITECTURE-SPINE.md` L581-597, the Stack table: L585 `| Bun (exact CI pin, `.bun-version`) | 1.4.3 (engines `>=1.4`) |`, L592 `| PostgreSQL (CI) | 18 |`, L593 `| Redis (CI; minimum supported 7.2) | 8.10.2 |`.
- Workflow conventions (copy from `nightly.yml` L1-35):
  - Header comment, `permissions: contents: read`.
  - Checkout `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `persist-credentials: false`.
  - `tools/workflow-permissions` checks the permissions.
- Tests:
  - `conformance/tests/xaravel/ci-pipeline.test.ts` gives the `workflow()` helper (`Bun.YAML.parse`) and `makeRoot`.
  - `harness-isolation.test.ts` :30-120 gives the hermetic `makeRoot`, `env()` and `closedPort` used for XT-195, with `runHarness` from `conformance/harness/harness.ts`.
  - Pinned job-key tests that must keep passing: `ci-pipeline.test.ts:400` (nightly) and `repository-policy.test.ts:773` (ci).
- `xt:coverage`: dotted citations such as `AD-17.6` (the devcontainer bullet) and `AD-28.3` count as covered.
- Ratchet `NO_EFFECT` (`tools/ratchet/ratchet.ts:286`): a `.devcontainer/` change makes the PR Ratchet full. That is expected.
- Root `package.json` scripts follow the pattern `"story:check": "bun --no-env-file tools/story-check/story-check.ts"`. `tsconfig.json` `include` lists each `tools/<x>/**/*.ts`.
- Docs: `docs/ops/ci.md` (workflow table), `docs/ops/harness.md` (Backend isolation L50-105).

## Tasks & Acceptance

**Execution:**
- `.devcontainer/Dockerfile`:
  - `ARG BUN_VERSION=1.4.3` and `ARG REDIS_IMAGE=redis:8.10.2`; `FROM oven/bun:${BUN_VERSION} AS bun`; `FROM ${REDIS_IMAGE}`.
  - Install `git` and `ca-certificates`.
  - Copy `bun` and symlink `bunx`.
  - Create user `xaravel` with the UID and GID from `XARAVEL_UID`/`XARAVEL_GID`, reusing the group if the GID already exists.
  - Run `git config --system safe.directory /workspaces/xaravel`.
  - Pre-create `/workspaces/xaravel/{.cache,node_modules}` owned by the user, so the named volumes copy that ownership.
  - Copy `start.sh`, clear the `ENTRYPOINT`, `USER xaravel`, and `CMD` the start script.
- `.devcontainer/start.sh`: `bun install --frozen-lockfile --ignore-scripts`, then touch `/tmp/xaravel-ready`, then `exec sleep infinity`.
- `.devcontainer/compose.yaml`:
  - `workspace`: build context `.` with the UID/GID args; bind-mount `..` at `/workspaces/xaravel`; volumes `xaravel-cache` (`.cache`) and `xaravel-node-modules` (`node_modules`); the PG env; `depends_on: postgres: condition: service_healthy`; a healthcheck on `/tmp/xaravel-ready`.
  - `postgres`: `image: postgres:18`, user and password `postgres`, a `pg_isready` healthcheck, and a tmpfs data dir.
- `.devcontainer/devcontainer.json`: plain JSON with `dockerComposeFile`, `service: workspace`, `workspaceFolder: /workspaces/xaravel`, `remoteUser: xaravel` and `updateRemoteUserUID: true`. No mounts.
- `tools/devcontainer/pins.ts`: a pure `checkPins(root): string[]`, plus a CLI `check [--root <dir>]` with exit codes 0, 1 or 2. Add a header comment.
- `package.json`: add the script `"devcontainer:pins": "bun --no-env-file tools/devcontainer/pins.ts check"`. `tsconfig.json`: add `tools/devcontainer/**/*.ts`.
- `tools/devcontainer/alpha.ts`: a pure `alphaNotRun(report: string): string[]` that returns one violation per `NOT-RUN [<v>]` line whose `<v>` is in `ALPHA_VARIANTS` (imported from `tools/inventory/inventory.ts`), or a violation if there is no `SUMMARY` line. Its CLI reads the harness report on stdin. It exits 1 when there are violations and prints them, and otherwise exits 0 with `devcontainer alpha: not-run=0 over <n> alpha variant(s)`. Add the root script `"devcontainer:alpha": "bun --no-env-file tools/devcontainer/alpha.ts"`. Non-alpha Variants (mysql, mariadb, sqlsrv, beanstalkd …) have no backend in the container and stay `NOT-RUN`, as epics.md AC2 allows.
- `tools/devcontainer/pins.ts` gets a `runtime` subcommand, run inside the container. It fails unless `process.getuid() !== 0`, `Bun.version` equals `.bun-version`, and `redis-server --version` (from PATH) reports the Redis image's tag. Each condition has a pure helper so it can be tested natively.
- The `check` subcommand of `pins.ts` also fails closed in three cases:
  - any workflow YAML fails to parse (`<file> could not be parsed`);
  - `compose.yaml` `workspace.build.args`, or `devcontainer.json`, sets `BUN_VERSION` or `REDIS_IMAGE`;
  - a source is missing.
- `.github/workflows/devcontainer.yml`: as in Always. Steps:
  - `mkdir -p .cache node_modules`, so the nested volume mount points exist under the runner's ownership;
  - build and `up --wait`, with `XARAVEL_UID`/`XARAVEL_GID` set from `id`;
  - `exec -T workspace bun run devcontainer:pins` and `exec -T workspace bun run devcontainer:pins runtime`;
  - `exec -T workspace bun run harness`, teed to a file. Fail if the harness exit is non-zero. Then pipe the file into `exec -T workspace bun run devcontainer:alpha`, which must exit 0;
  - dump the logs on failure and `down -v` always.
- `.devcontainer/Dockerfile`: the build fails with a clear message when `XARAVEL_UID` or `XARAVEL_GID` is `0`. Use `COPY start.sh …` then `RUN chmod 0755`, not `COPY --chmod`. The legacy builder rejects `--chmod`.
- `.devcontainer/compose.yaml`: `workspace` gets `init: true`. The Postgres healthcheck is `pg_isready -h 127.0.0.1 -U postgres`, because the init-time server listens only on the socket.
- `conformance/tests/xaravel/devcontainer.test.ts`: XT-conformance-190..195 (below).
- `docs/ops/devcontainer.md` covers:
  - starting with the devcontainer CLI or `docker compose`;
  - running the harness;
  - a headless agent session through `docker compose exec`, with credentials passed at run time;
  - two AD-17 keys for a worktree used both inside and outside the container;
  - mounting a main checkout, not a `git worktree`;
  - the Oracle and Inventory tools running on the host or in CI, with no Docker socket;
  - no secret or `APP_KEY` in the image, and `.env` autoload off;
  - the native path, which is never required;
  - arm64 being unverified in CI;
  - running `mkdir -p .cache node_modules` before the first `up` on a Linux Docker Engine host, so the nested mount points are not created root-owned in the checkout;
  - running `down -v` after changing `XARAVEL_UID`/`XARAVEL_GID`, because volumes keep their first ownership;
  - a distinct `-p <name>` per checkout, shown in every command example;
  - anything installed for an agent session being lost when the container is recreated.

  Also correct the native-path claim: the harness, `story:check` and the pin checks never need Docker, but the Oracle and Inventory tools do, and they run on the host or in CI. Say that the in-container `bun run harness` runs Ported Tests only; PHP-fixture Xaravel Tests need PHP on the host.
- Docs links: `docs/ops/ci.md` gets a row for the workflow, `docs/ops/harness.md` a link.

**Acceptance Criteria:**
- **AC1 (XT-conformance-190).** Given `.devcontainer/`, when the Compose file, Dockerfile and `devcontainer.json` are read, then:
  - the workspace's final `USER` is non-root, and the Dockerfile's last `FROM` is `${REDIS_IMAGE}`;
  - the start script runs the frozen-lockfile install;
  - the Postgres image equals `baseline.yml`'s;
  - `.cache` is a named volume, no volume or mount names `docker.sock`, and there is no `platform:`.
- **AC2 (XT-conformance-191).** Given the container's env and the workflow, when they are inspected:
  - the PG env matches the sidecar, and none of `CI`, `REDIS_*` or `XARAVEL_REDIS_SERVER` is set;
  - `/workspaces/xaravel/.cache/redis.sock` fits in 103 bytes;
  - the harness step runs `bun run harness` without `--fast` and pipes its report to `devcontainer:alpha`;
  - `alphaNotRun`, and the CLI on stdin, pass a report whose only `NOT-RUN` lines are non-alpha (`mysql`, `sqlsrv`, `queue-beanstalkd@beanstalkd`). They fail naming the Variant for an alpha `NOT-RUN` (`redis`, `pgsql`, `queue-redis@redis`), and fail on a report with no `SUMMARY`;
  - the runtime helpers fail for uid 0, a different Bun version and a different `redis-server --version`.

  The live proof is the workflow's own run on this PR.
- **AC3 (XT-conformance-192).** Given `devcontainer:pins`, when it runs on the real root, it passes. When it runs on temp roots with Bun, Postgres or Redis drift in each source, it exits 1 naming the source. Each missing source also exits 1 with its `… not found` line: `.bun-version`, the compose file, the compose `postgres` service, `ARG REDIS_IMAGE` alone, `ARG BUN_VERSION`, the Dockerfile, the Bun, PostgreSQL and Redis Stack rows, and `baseline.yml` or its services. So do a workflow that does not parse and a `build.args` override.
- **AC4 (XT-conformance-193).** Given `devcontainer.yml`, then:
  - its triggers are as in Always;
  - it has exactly one job, `devcontainer`, on `ubuntu-24.04`, with no matrix;
  - `workflows:check` passes;
  - `nightly.yml`'s jobs are still `linux`, `macos` and `bench`.
- **AC5 (XT-conformance-194).** Given `docs/ops/devcontainer.md`, then it states each required topic, and no `.devcontainer/` file contains `APP_KEY`, `env_file` or `.env`.
- **AC6 (XT-conformance-195).** Given a machine without Docker:
  - a hermetic harness run with no `docker` or `redis-server` on PATH and Postgres down exits 0, with pgsql and redis `NOT-RUN`;
  - `devcontainer:pins` passes with that PATH;
  - no file under `conformance/harness/` or `tools/story-check/`, and no root script other than `devcontainer:pins`, mentions `docker` or `.devcontainer`.

## Spec Change Log

### 2026-10-19 — Loopback 1 (review_loop_iteration 1)

- **Trigger:** Intent Alignment (a), high. The full harness prints `NOT-RUN` for the non-alpha Variants that have Expectations lines: mysql, mariadb, sqlsrv and queue-beanstalkd@beanstalkd. A native run on the baseline confirmed it with `SUMMARY variants=11 run=4 not-run=7`. So a `not-run=0` gate on the `SUMMARY` line can never pass in the container. epics.md AC2 asks only that "no alpha Variant is `NOT-RUN`".
- **The contract text:** the intent contract's Always bullet ("fails unless the `SUMMARY` line has `not-run=0`") paraphrased epics.md AC2 too strictly. It is left untouched, because the contract is read-only during review. This build implements epics.md AC2: no `NOT-RUN` for any Variant in `ALPHA_VARIANTS`. The PR body states the discrepancy.
- **Amended:** Tasks (`alpha.ts`, the `runtime` pin subcommand, the fail-closed pin cases, workflow steps, Dockerfile and compose fixes, docs topics), AC2, AC3, AC5 and Design Notes.
- **Also amended, Blind Hunter (XT-44):** the test file must not name the container CLI or work around XT-conformance-44. It checks the workflow commands with a pattern that ignores the CLI word, and it runs no fake container CLI. The gate logic is tested through `alpha.ts` directly.
- **Known-bad states avoided:**
  - a CI gate that fails on every run;
  - runtime facts proven only by Dockerfile text;
  - a pin check that fails open on a missing source, an unparseable workflow or a `build.args` override;
  - a test that hides a word from XT-44;
  - root-owned mount points in host checkouts;
  - PID 1 that ignores SIGTERM;
  - a Postgres healthcheck that passes during initdb;
  - a `uid 0` user.
- **KEEP:**
  - Everything else from `/tmp/xaravel-5-10-keep/iter0.patch`. Apply it first with `git apply`, then change only what this entry lists.
  - The base-image design: `FROM ${REDIS_IMAGE}`, with Bun copied from `oven/bun`.
  - The named volumes; the PG env; `start.sh` with its ready file; `devcontainer.json`.
  - The `checkPins` structure and messages; the workflow header and triggers.
  - XT-190, 192, 193 and 195 as they are, apart from the listed changes; the docs structure.

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 32 findings — high 1, medium 11, low 15, false 5, maybe-false 0
- findings:
  - **Intent Alignment**
    - `[high]` `[bad_spec]` AC2: the `not-run=0` gate also counts non-alpha Variants, so it fails in the container. Confirmed natively (`not-run=7`, of which 4 are non-alpha backends with no probe). Amended: `alpha.ts` gate (Change Log, loopback 1).
    - `[medium]` `[bad_spec]` AC1's runtime facts are proven only by text: non-root, the Bun version, `redis-server` on PATH. Amended: the `pins.ts runtime` subcommand runs inside the container in CI.
    - `[low]` `[reject]` `xaravel_test_<key>` and `.cache/redis.sock` are not observed in the container. That is existing Story 5.5 behaviour, covered by XT-110 and 112; the in-container run exercises it live.
    - `[false]` `[reject]` Extra triggers and its own cron. AC4 asks for a run on `.devcontainer/**` PRs and nightly; the extra paths and dispatch do not contradict it, and the nightly matrix is untouched.
    - `[low]` `[reject]` AC6 is shown by grep for `story:check` and the other tools rather than by running them. The harness and pin check are executed; running every tool adds runtime for little gain.
    - `[false]` `[reject]` Out-of-scope edits. These are Epic 5 Infrastructure paths, allowed by the MAINT ruling's second amendment; `AGENTS.md` is untouched.
    - `[false]` `[reject]` PHP-dependent Xaravel Tests might break the in-container `bun run harness`. Without `--xaravel` the harness runs Ported Tests only (`harness.ts` Xaravel run is opt-in, Story 5.9).
  - **Verification Gap**
    - `[medium]` `[bad_spec]` The fail-closed `not found` branches of `checkPins` are untested. Amended: AC3 lists each missing source.
    - `[medium]` `[defer]` The PR paths filter misses `conformance/harness/**`, `bun.lock`, `package.json` and `.bun-version`, so an in-container break shows only nightly. The contract fixes the trigger list; pin drift is still caught on every PR by XT-192 in `ci.yml`'s `harness --xaravel`.
    - `[low]` `[bad_spec]` XT-191 runs the step with plain `bash`, not `-eo pipefail`. Superseded: the gate moves to `alpha.ts`, tested directly.
  - **Edge Case Hunter**
    - `[medium]` `[bad_spec]` A non-baseline workflow that fails to parse yields no images, so the check fails open. Amended: `could not be parsed` fails.
    - `[low]` `[bad_spec]` A `build.args` override of `BUN_VERSION`/`REDIS_IMAGE` passes the pin check. Amended: flagged.
    - `[low]` `[reject]` `tagOf` mis-reads a digest-pinned image. No image is digest-pinned, and it would fail loudly, not silently.
    - `[medium]` `[defer]` Paths filter too narrow. Same root cause as the Verification Gap row.
    - `[medium]` `[bad_spec]` `XARAVEL_UID=0` makes `useradd --non-unique` create a root user. Amended: the build refuses uid or gid 0.
    - `[low]` `[bad_spec]` Volumes keep stale ownership after a UID change. Amended: docs say `down -v`.
    - `[low]` `[bad_spec]` The legacy builder rejects `COPY --chmod`. Amended: `COPY` then `RUN chmod`.
    - `[low]` `[reject]` Services keyed other than `postgres`/`redis` escape the check. No workflow has one, and matching on image prefixes adds branches.
    - `[medium]` `[bad_spec]` The docs say no tool references Docker, but the Oracle tools do. Amended: docs correction.
    - `[low]` `[bad_spec]` The ownership-copy claim ignores later UID changes. Same fix as the volume-ownership row.
  - **Blind Hunter**
    - `[medium]` `[bad_spec]` `containerCli()` reads the CLI name from the workflow to keep the word out of XT-44's scan. That works around a guard. Amended: the test never needs the CLI name, and the gate is tested via `alpha.ts`.
    - `[low]` `[reject]` Compose project names collide across checkouts. The docs already say `-p <name>`; amended docs show it in every example (in the docs task).
    - `[medium]` `[bad_spec]` Nested volume mounts create root-owned `.cache`/`node_modules` in a Linux host checkout. Amended: `mkdir -p` in the workflow and the docs.
    - `[low]` `[bad_spec]` There is no init, so `sleep` as PID 1 ignores SIGTERM and does not reap orphaned `redis-server` processes. Amended: `init: true`.
    - `[medium]` `[bad_spec]` `pg_isready` over the socket passes during initdb's temporary server. Amended: `-h 127.0.0.1`.
    - `[low]` `[bad_spec]` Pin override paths. Same as the Edge Case `build.args` row.
    - `[medium]` `[defer]` Paths filter too narrow. Same as the Verification Gap row.
    - `[low]` `[reject]` No LF rule for `.devcontainer/*`. NFR-1 supports macOS and Linux only; Windows checkouts are not a supported platform.
    - `[false]` `[reject]` The docs overstate PHP-fixture coverage in the container. The in-container `bun run harness` runs no Xaravel Tests; the docs now say so anyway.
    - `[low]` `[bad_spec]` Brittle checks: `/platform/i` on comments, the `.env` substring, the socket patterns, step positions. Amended: XT checks key on `platform:` keys and parsed values, and find steps by name, not position.
    - `[false]` `[reject]` Spec and sprint status disagree. A spec in review and a Story in progress is the normal state mid-run.
    - `[low]` `[bad_spec]` The headless-agent docs suggest a volume that does not exist. Amended: the docs say installs are lost on recreate.

### 2026-10-19 — Review pass (after loopback 1)
- verdicts: 30 findings — high 0, medium 6, low 21, false 3, maybe-false 0
- findings:
  - **Verification Gap**
    - `[medium]` `[patch]` `checkRuntime` and the `check runtime` CLI are never run by a test that can fail. Added a case with a fake `redis-server` on a temp PATH (wrong version) and a `.bun-version` mismatch, each asserting exit 1 and its line.
    - `[medium]` `[patch]` The alpha gate is never tied to real harness output. XT-195 now passes the real `runHarness` report through `alphaNotRun` and asserts the pgsql and redis violations.
    - `[low]` `[patch]` The `devcontainer.json could not be parsed` branch is untested. Added an XT-192 case.
    - `[low]` `[reject]` Strict `JSON.parse` rejects JSONC comments. `devcontainer.json` is documented as plain JSON, and a comment fails closed and loudly.
    - `[low]` `[reject]` A missing `getuid` reports root. That is intentional fail-closed behaviour on a platform that cannot run the container anyway.
  - **Intent Alignment**
    - `[medium]` `[defer]` The devcontainer CLI launch path and linux/arm64 are never exercised. They are live-only: CI runs `docker compose` on x64, and the docs say arm64 is unverified.
    - `[low]` `[reject]` A contributor's in-container `bun run harness` does not fail on an alpha NOT-RUN. This matches native behaviour (NOT-RUN is never a local failure); the docs pipe the report to `devcontainer:alpha`.
    - `[low]` `[reject]` Postgres has no runtime version check. The sidecar is CI's exact image string, the same as CI's own services.
    - `[false]` `[reject]` "The nightly run" is a separate cron. epics.md asks for the job on the nightly run without duplicating 5.7's matrix; a nightly schedule meets that, and `nightly.yml`'s job keys are pinned by XT-121.
    - `[low]` `[reject]` The headless agent command is generic. AC5 asks the doc to explain it; baking an agent into the image is out of scope (no credentials in the image).
    - `[low]` `[reject]` carried: AC6 is shown by a static scan for `story:check` and the other tools.
    - `[false]` `[reject]` Peripheral: `expect` from `bun:test` and the multi-path edits. All existing Xaravel Tests use `expect`, and the paths are Epic 5 Infrastructure scope.
  - **Edge Case Hunter**
    - `[low]` `[reject]` A non-canonical zero UID such as `00` passes the root guard. Nobody passes `00` from `id -u`, and the fix adds arithmetic guards.
    - `[medium]` `[defer]` carried: the PR paths filter is too narrow.
    - `[low]` `[reject]` A `build.dockerfile`/`context` override in compose escapes the pin check. No such key exists, and XT-190 pins `build.context` to `.`.
    - `[low]` `[reject]` carried: `tagOf` and digest pins.
    - `[low]` `[reject]` An alpha Variant with zero Expectations lines is skipped silently. All 7 alpha Variants have lines today (native run: 11 Variants, 4 run plus 7 NOT-RUN); a Variant with no lines has nothing to run.
    - `[low]` `[reject]` Symlinked workflow files are skipped. No workflow is a symlink, and GitHub does not follow them.
    - `[low]` `[reject]` A failed `git init` gives a misleading error later. It is a test-diagnostics nicety, and the failure is still loud.
  - **Blind Hunter**
    - `[medium]` `[defer]` carried: the PR paths filter is too narrow.
    - `[low]` `[reject]` The gate does not prove every alpha Variant ran. Same as the Edge Case zero-lines row.
    - `[low]` `[reject]` `alpha.ts` re-implements the harness's CI alpha rule from text. CI mode cannot be used in the container (it disables `startRedis`), and XT-195 now ties the gate to the real report format.
    - `[medium]` `[defer]` `.devcontainer/` is not a Protected Path. Adding it means editing `conformance/protected-paths`, which the MAINT ruling forbids the orchestrator unless a Story requires it. Routed to the Maintainer.
    - `[low]` `[patch]` XT-190 hardcodes `redis:8.10.2`. It now derives the image from `baseline.yml`. The drift fixtures in XT-192 keep their literals, because they edit copies of known text.
    - `[low]` `[reject]` The runtime check skips Postgres, `git` and inherited env. Postgres is covered as above, a missing `git` fails the harness loudly, and the base images set none of those variables.
    - `[low]` `[defer]` Images are pinned by tag, not digest. This is pre-existing: CI's own services are tag-pinned; the devcontainer only mirrors them.
    - `[low]` `[reject]` carried: services keyed other than `postgres`/`redis`.
    - `[low]` `[patch]` The docs' host harness example masks the exit status behind `tee`. It now mirrors the workflow's status capture.
    - `[low]` `[patch]` The usage headers omit `--no-env-file`. Fixed in both tools.
    - `[false]` `[reject]` The diff omits the spec. The spec is deliberately excluded from the review diff, and the edge-case layer reads it as the claims file.

## Design Notes

- **The base image is CI's Redis image.** That pins `redis-server` to CI's exact build with no glibc or libssl mismatch. The Bun binary only needs glibc, which the Debian-based `redis` image has.
- **No `CI=true` in the container.** The harness then starts its own `redis-server` on `.cache/redis.sock` (AC2 of epics.md). Because NOT-RUN is not a failure without `CI`, the workflow checks it itself with `devcontainer:alpha`, over `ALPHA_VARIANTS` only. Non-alpha backends (MySQL, MariaDB, SQL Server, Beanstalkd …) have no sidecar until Phase 9, so their `NOT-RUN` is expected (AD-17).
- **XT-44.** New `.ts` files must not contain the word that XT-conformance-44 scans for. They do not need it: the tests match workflow commands with a pattern that ignores the CLI word, and they never run a container CLI, real or fake.
- **Live-only parts:** the image build, the run inside the container, and arm64. CI covers the x64 build and run on every `.devcontainer/**` PR, including this one. arm64 rests on the multi-arch base images, and the docs and the review say so.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/devcontainer.test.ts` -- expected: XT-190..195 pass
- `bun run devcontainer:pins` -- expected: exit 0
- `bun run workflows:check && bun run typecheck && bun run lint` -- expected: clean
- `bun run harness --xaravel` -- expected: SUMMARY differ=0
- CI `devcontainer` job on the PR -- expected: green, `devcontainer alpha: not-run=0`

## Auto Run Result

Status: done

**Summary.** `.devcontainer/` is an optional Linux reference environment. It has three parts:
- a non-root workspace image built on CI's `redis:8.10.2`, with Bun copied from `oven/bun:1.4.3`;
- a `postgres:18` sidecar;
- `.cache/` and `node_modules/` on named volumes, with no Docker socket and no secrets.

`devcontainer:pins` checks the image pins against `.bun-version`, the workflows' service images and the spine's Stack table. Its `runtime` mode checks the uid, Bun and `redis-server` inside the container. `devcontainer:alpha` fails a harness report that has an alpha `NOT-RUN`. The `devcontainer.yml` workflow builds the image and runs both inside it.

**Files changed:**
- `.devcontainer/Dockerfile`: the workspace image, with a non-root uid/gid that refuses 0.
- `.devcontainer/compose.yaml`: `workspace` (init, PG env, named volumes, ready healthcheck) and `postgres` (TCP `pg_isready`, tmpfs).
- `.devcontainer/devcontainer.json`: the devcontainer CLI entry, in plain JSON.
- `.devcontainer/start.sh`: the frozen-lockfile install, then the ready file, then idle.
- `tools/devcontainer/pins.ts`: the `check` pin check (fails closed) and the `runtime` check.
- `tools/devcontainer/alpha.ts`: the gate that allows no `NOT-RUN` on an alpha Variant.
- `.github/workflows/devcontainer.yml`: one linux-x64 job on `.devcontainer/**` PRs, nightly and on dispatch.
- `conformance/tests/xaravel/devcontainer.test.ts`: XT-conformance-190..195.
- `docs/ops/devcontainer.md` (new); `docs/ops/ci.md` and `docs/ops/harness.md` (links).
- `package.json`: the `devcontainer:pins` and `devcontainer:alpha` scripts. `tsconfig.json`: includes `tools/devcontainer`.

**Review.**
- Pass 1 had 32 findings: 1 high, 11 medium, 15 low, 5 false. The high one sent the spec back once (loopback 1): the `not-run=0` gate failed because the full harness also reports non-alpha Variants. Its other amendments are recorded in the Spec Change Log.
- Pass 2 had 30 findings: 0 high, 6 medium, 21 low, 3 false. Six patches were applied: 2 medium (the runtime-check test, and the alpha gate tied to real harness output) and 4 low (the unparseable `devcontainer.json` case, the Redis image derived from `baseline.yml`, the docs exit-status example, `--no-env-file` in the usage headers).
- Four items are deferred to the frontmatter: the PR paths filter, the devcontainer CLI path and arm64 being unexercised, `.devcontainer/` not being a Protected Path, and tag-only image pins.
- Every rejected finding and its reason is in the Review Triage Log.

**Contract note.** The intent contract's Always bullet says the workflow requires `SUMMARY … not-run=0`. epics.md AC2 says "no alpha Variant is NOT-RUN". The build follows epics.md, because the non-alpha backends (MySQL, MariaDB, SQL Server, Beanstalkd) have no sidecar until Phase 9. The contract text was left untouched, as it is read-only during review.

**Follow-up review recommended: true.** Two medium entries were patched in the last pass. The named risk: the image build, `up --wait`, and the in-container harness run with every alpha Variant reachable have never run, because there is no Docker on the build host. The first live proof is the `devcontainer` job on this Story's PR.

**Verification:**
- `bun install --frozen-lockfile`: no changes.
- `bun run test`: 237 pass, 0 fail.
- `typecheck` and `lint`: clean.
- `devcontainer:pins`: ok.
- `workflows:check`: 14 workflows OK.
- `bun run harness --xaravel`: 237/237 passed, differ=0.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`. Natively there is no `redis-server` or Postgres; non-alpha Variants are NOT-RUN by design.

**Residual risks:**
- Live-only: the image build, the run inside the container, arm64, and the devcontainer CLI launch path.
- The runtime test case assumes `bun test` does not run as root.
