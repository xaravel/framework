# Bun primitive probes (OQ-11)

Story 8.3 answers PRD OQ-11: are the Bun 1.4.3 primitives the PRD relies on complete enough? Each probe in `conformance/probes/probes.ts` runs one primitive and returns `supported` or `unsupported`, with evidence. The outcomes are recorded in `conformance/probes/results.json`, and `conformance/probes/REPORT.md` is generated from the registry and that record.

| Group | Probes | Backend |
| --- | --- | --- |
| `bun test` | `bun-test.failing`, `bun-test.skipIf`, `bun-test.assertion-counts`, `bun-test.setSystemTime`, `bun-test.preload-afterEach` | none; each runs committed `conformance/probes/fixtures/*.probe.ts` files in a `bun test` subprocess and reads its junit report |
| `Bun.sql` | `bun-sql.pgsql.raw-bindings`, `bun-sql.pgsql.reserve`, `bun-sql.mysql.raw-bindings`, `bun-sql.mysql.reserve` | Postgres, MySQL |
| `Bun.redis` | `bun-redis.commands`, `bun-redis.transactions`, `bun-redis.pubsub` | Redis |
| `Bun.S3Client` | `bun-s3.client` | an S3-compatible service |
| `Bun.Image` | `bun-image.laravel-api` | none (runs with `Bun.Image.backend = "bun"`, the portable backend, so the result does not depend on the host's OS codecs) |
| `AsyncLocalStorage` | `als.await`, `als.timers`, `als.stream-body`, `als.async-generator`, `als.direct-stream`, `als.serve-callbacks` | none; each serves a request with `Bun.serve` and runs its handler in `als.run(frame, …)` |

The fixtures are named `*.probe.ts`, never `*.test.ts`: some fail on purpose, and `bun run test` must not collect them.

## Commands

| Command | What it does |
| --- | --- |
| `bun run probes:run [--json]` | Runs every probe and prints `<id>: <status>: <evidence>` (or JSON). Writes nothing. |
| `bun run probes:check [--require-backends]` | Re-runs the probes and compares them with the record, the Escalations and `REPORT.md`. Prints `PROBES OK: <s> supported, <u> unsupported, <n> not run (of <t>).` or one violation per line, exit 1. A backend probe without its variable is `not run`; with `--require-backends` that is a violation. |
| `bun run probes:record` | Rewrites `results.json` from a live run, keeping each still-unsupported probe's Escalation. Refuses, writing nothing, when any probe is not run. |
| `bun run probes:generate` | Rewrites `REPORT.md` from the registry and the record. |

Each takes `--root <dir>`. Exit codes: 0 pass, 1 any violation or failure, 2 a usage error.

## Backend variables

A backend probe reads only its variable, and returns `not-run` when it is unset. It never falls back to a default host.

| Variable | Probes | Example |
| --- | --- | --- |
| `XARAVEL_PROBE_PGSQL_URL` | `bun-sql.pgsql.*` | `postgres://probes:probes@127.0.0.1:55432/probes` |
| `XARAVEL_PROBE_MYSQL_URL` | `bun-sql.mysql.*` | `mysql://root@127.0.0.1:53306/probes` |
| `XARAVEL_PROBE_REDIS_URL` | `bun-redis.*` | `redis://127.0.0.1:56379` |
| `XARAVEL_PROBE_S3_ENDPOINT` | `bun-s3.client` | `http://127.0.0.1:59090` |

The S3 probe uses bucket `probes`, access key `xaravel-probe` and secret `xaravel-probe-secret`, which S3Mock accepts. The SQL probes create no tables; each Redis probe uses its own `xaravel-probe:<probe>:<uuid>:` key prefix and deletes its keys; the S3 probe deletes its object.

## Where they run

- **The Xaravel Tests.** `conformance/probes/probes.test.ts` (XT-conformance-155 and 156) runs under `bun run harness --xaravel`, which discovers `conformance/probes/**/*.test.ts`. It runs the backend-free probes live and compares each with the record; backend probes are `not-run` there and only their recorded rows are checked.
- **CI.** The required `check` job in `.github/workflows/ci.yml` runs `bun run probes:check --require-backends` in the step `Probe the Bun primitives`, after `porting:check`. The job has four services, each on a non-default host port so that the harness's default-port backend probes in the other Xaravel Tests still find nothing:

  | Service | Image | Host port |
  | --- | --- | --- |
  | `postgres` | `postgres:18` (database, user and password `probes`) | 55432 |
  | `mysql` | `mysql:9.7` (empty root password, database `probes`) | 53306 |
  | `redis` | `redis:8.10.2` | 56379 |
  | `s3` | `adobe/s3mock:5.2.3` (initial bucket `probes`) | 59090 |

  The four `XARAVEL_PROBE_*` variables are set on that step only.

## Unsupported probes

Every unsupported probe names an Escalation `conformance/escalations/ESC-8.3-<n>.md` that cites XT-conformance-156, has `trigger: open-question`, quotes the probe's output and proposes a `deferred:` item or a workaround. `REPORT.md` links the Escalation and `decisions/ESC-8.3-<n>.md`, which exists once the Escalation is ruled on. A supported probe names no Escalation.

## Re-recording after a Bun bump

1. Update `.bun-version`. `probes:check` fails until the record's `bun` matches it.
2. Run the probes against all four backends: either push and read the `check` job's `Probe the Bun primitives` output, or run the four services locally (for example in the devcontainer) with the variables above and run `bun run probes:run`.
3. With every backend available, run `bun run probes:record`; otherwise edit `results.json` by hand from the CI output. A backend row is recorded only from a run against that backend, never from documentation or memory.
4. For a probe that became unsupported, raise an Escalation and set its `escalation`. For one that became supported, set `escalation` to `null`, and revisit its Escalation.
5. Run `bun run probes:generate` and commit `results.json` and `REPORT.md`.
