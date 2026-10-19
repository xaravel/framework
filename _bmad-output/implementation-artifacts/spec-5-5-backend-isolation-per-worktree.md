---
title: 'Story 5.5: Backend isolation per worktree'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'c62f8bbe09417af9020d4223249ad3ff1be86f76'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-4-fast-mode-seeds-and-filters.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `bun run harness` (Stories 5.3, 5.4) uses whatever Postgres and Redis the environment points at, and nothing stops two runners in one worktree. Parallel agents on one machine would share databases and a Redis server, and corrupt each other's runs (AD-17, FR-9, NFR-10).

**Approach:** Add `conformance/harness/isolation.ts` and call it from `runHarness`. At start the harness derives a worktree key and takes `.cache/harness.lock`. Each backend is then prepared before its Variants run: Postgres databases named for the key are recreated, SQLite gets a directory under `.cache/`, and locally Redis gets its own `redis-server` on a unix socket in `.cache/`. The runs learn these through env variables.

## Boundaries & Constraints

**Always:**
- **Worktree** (AC 1). The root must be the top level of a git worktree: `git -C <root> rev-parse --path-format=absolute --show-toplevel --absolute-git-dir`, compared with the realpath of the root. Otherwise a precondition fails (exit 1): `<root> is not the top level of a git worktree (AD-17)`.
  - **Creation id.** Git records no creation id, so the harness makes one. It is the 32 lowercase hex characters in `<git-dir>/xaravel-worktree-id`. The first run creates the file with an exclusive create (`wx`) from 16 random bytes; a lost race re-reads it. A malformed file fails a precondition. `git worktree remove` deletes the git dir, so a new worktree at the same path gets a new id.
  - **Key.** `worktreeKey(path, id)` is the first 8 hex characters of SHA-256 over `<realpath of the top level>\n<id>`.
- **Lock** (AC 4). It is taken right after the bunfig checks and released in `finally`. `.cache/harness.lock` is created with `wx` and holds one JSON line: `{pid, host, started, command}`.
  - If it exists, and names a live pid on this host or another host, the harness fails a precondition (exit 1) with `.cache/harness.lock is held by pid <pid> on <host> since <started>: <command>`.
  - If its pid is on this host and not alive (`process.kill(pid, 0)` throws `ESRCH`), it is stale: the harness removes it and retries once. An unreadable lock counts as held, with `unknown` for each field.
- **Child env.** Each run also gets `XARAVEL_WORKTREE_KEY=<key>`, `XARAVEL_CACHE_DIR=<root>/.cache`, `XARAVEL_SQLITE_DIR=<root>/.cache/sqlite` and `XARAVEL_PG_DATABASE=xaravel_test_<key>`. It gets `XARAVEL_REDIS_SOCKET=<socket>` when the harness started Redis.
- **Backend preparation** replaces the per-backend `probe` call. It runs once per backend, the first time a run Variant needs it.
  - **sqlite** (AC 2): a full run (not `--fast`) removes and recreates `.cache/sqlite/`. A fast run only creates it. It is always reachable.
  - **pgsql** (AC 1): probe as before. If Postgres is reachable, run `recreateDatabases(admin, key)`: list the databases, drop every name `ownsDatabase(key, name)` accepts (sorted), then create `xaravel_test_<key>`. A fast run only creates `xaravel_test_<key>` when it is missing. A failure makes the Variant NOT-RUN, with why `Postgres database reset failed: <message>`.
    - The admin is `postgresAdmin(env)`: `Bun.SQL` against the maintenance database `PGDATABASE` (default `postgres`), with `PGHOST` (a `/` path is a socket directory: `path: <dir>/.s.PGSQL.<port>`), `PGPORT`, `PGUSER` (default `USER`, else `postgres`) and `PGPASSWORD`. It is closed after use. `HarnessOptions.postgres` (internal, like `bunArgs`) replaces the factory.
  - **`ownsDatabase(key, name)`** is true for `xaravel_test_<key>`, and for `xaravel_test_<key>_<suffix>` with suffix `^[a-z0-9_]+$`. `drop` throws on any other name. Names are double-quoted only after this check.
  - **redis** (AC 3). With `CI=true`, probe `REDIS_HOST`/`REDIS_PORT` as before: each job's service is its server. Locally, start `<bin> --port 0 --unixsocket <root>/.cache/redis.sock --unixsocketperm 700 --save "" --appendonly no --dir <root>/.cache/redis`, with stdin ignored and output piped.
    - `<bin>` is `XARAVEL_REDIS_SERVER` if set, else `Bun.which("redis-server")` on the env's `PATH`.
    - The Variant is reachable once a unix-socket connect succeeds within 5 s. Otherwise it is NOT-RUN with why:
      - `redis-server not found on PATH (AD-17)`, or `redis-server not found at <path> (AD-17)`;
      - `redis-server exited <code>: <last stderr/stdout line>`;
      - `redis-server did not listen on <socket> within 5000 ms`;
      - `socket path <socket> is longer than 103 bytes`.
    - A leftover socket is removed before the start, which is safe because the lock is held. The server is killed (SIGTERM, then awaited) in `finally`.
- **Results.** `HarnessResult.worktree` is `{path, key}` once known, and null before that. The report format and SUMMARY don't change.
- **Existing tests.** In the 5.3/5.4 suites, `makeRoot` runs `git init -q`. Their `env()` sets `XARAVEL_REDIS_SERVER` to a missing path. `treeDigest` skips `.cache` and `.git`. XT-102's two local Redis NOT-RUN lines become the `not found at` form. Its reachable-Postgres case passes a no-op `postgres` admin. These follow AD-17, which Story 5.3 deferred here; no other assertion changes.
- **Xaravel Tests.** `conformance/tests/xaravel/harness-isolation.test.ts`, XT-conformance-110..114 (manifest order), on hermetic git roots.
  - Postgres uses an in-memory recording admin, and runs live too when one is reachable at the default env.
  - Redis uses a fake `redis-server`: a bun script that records its argv, serves `PING` and `FLUSHDB` on the socket, and exits on SIGTERM. A real `redis-server` on `PATH` is also exercised.

**Never:**
- No change to compare, selection, report formats, the Inventory, shards, `tools/**`, `packages/**`, CI workflows (5.7) or `AGENTS.md`.
- Never drop a database that `ownsDatabase` rejects. Never inject a Redis key prefix. Never write outside `<root>/.cache/` and `<git-dir>/xaravel-worktree-id`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Key | same worktree, two runs | same key; `worktree.key` = sha256(path\nid)[0..8] | non-git root → exit 1 |
| New worktree, same path | remove + re-add worktree | new id, new key | — |
| PG full run | dbs `xaravel_test_K`, `xaravel_test_K_a`, `xaravel_test_Kx`, `xaravel_test_O`, `app` | drops K, K_a; creates K; others untouched | reset error → NOT-RUN |
| PG fast run | K absent | creates K; drops nothing | — |
| SQLite | stale `.cache/sqlite/old.db`, full run | old gone; test's db in `.cache/sqlite/` | — |
| Redis local | fake server | argv has `--save ""`, `--appendonly no`, socket in `.cache/`; FLUSHDB ok; stopped after | missing bin → NOT-RUN |
| Redis CI | `CI=true` | no launch; probes REDIS_HOST/PORT | — |
| Lock held | live pid in lock | exit 1, message names pid/host/command | — |
| Stale lock | dead pid, same host | taken over; run proceeds; lock removed after | — |
| Parallel | two worktrees concurrently, shared PG | different keys; each drops only its own | — |

</intent-contract>

## Code Map

- `conformance/harness/harness.ts:463-611` -- `runHarness`. Add the worktree and lock after the stray-bunfig check (:477-480). Replace the `probes` map (:552-558) with backend preparation, and add the `finally` that stops Redis and releases the lock. `HarnessOptions`/`HarnessResult` are at :213-246, and the header comment at :96-188 (its line "nothing is written under the root" must change).
- `conformance/harness/harness.ts:376-404` -- `runVariant` builds `childEnv`. Pass the isolation env in through a new parameter.
- `conformance/harness/backends.ts:70-95` -- `probe`, reused for pgsql and for CI redis; `tryConnect` is private. `isolation.ts` needs its own unix-socket connect wait, or `tryConnect` can be exported.
- `conformance/tests/xaravel/harness.test.ts:85-140,425-491` -- `makeRoot`, `treeDigest`, `env`, and XT-102's local Redis lines and reachable-Postgres case.
- `conformance/tests/xaravel/harness-select.test.ts:83-109` -- `makeRoot` and `env`.
- `node_modules/.bun/bun-types@1.4.3/node_modules/bun-types/sql.d.ts:204-380` -- `Bun.SQL` options: `hostname`, `port`, `username`, `password`, `database`, `path` (unix socket), and `unsafe()` for DDL.
- `docs/ops/harness.md` -- add a "Backend isolation" section, and adjust "Backends and NOT-RUN" for local Redis.
- `.gitignore` -- `.cache/` is already ignored. `strayBunfigs` already skips `.cache`.

## Tasks & Acceptance

**Execution:**
- `conformance/harness/isolation.ts` -- `worktreeOf`, `creationId`, `worktreeKey`, `acquireLock`, `ownsDatabase`, `PgAdmin` + `postgresAdmin` + `recreateDatabases`, `startRedis`, `prepareSqlite`.
- `conformance/harness/harness.ts` -- integrate, add the env, the `worktree` result and the `postgres` option, and update the header.
- `conformance/tests/xaravel/harness-isolation.test.ts` -- XT-110..114 covering the matrix.
- `conformance/tests/xaravel/harness.test.ts`, `harness-select.test.ts` -- the fixture changes listed under Existing tests.
- `docs/ops/harness.md` -- the isolation section.

**Acceptance Criteria:**
- Given a worktree, when the harness starts, then its key is SHA-256(path, creation id)[0..8], and a full run drops and recreates exactly the `xaravel_test_<key>[_<name>]` databases (XT-conformance-110).
- Given the SQLite Variant, when tests run, then their database files are under `.cache/` (XT-111).
- Given the Redis Variant locally, then the harness starts one `redis-server` on a unix socket in `.cache/` with no persistence, `flushdb` works, and the server stops afterwards (XT-112).
- Given a held `.cache/harness.lock`, then a second harness exits 1 naming the holder (XT-113).
- Given two worktrees in parallel, when both recreate their databases, then neither touches the other's (XT-114).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 31 findings — high 0, medium 1, low 26, false 1, maybe-false 0, plus 3 descriptive (counted low)
- findings:
  - (verification-gap 1) `[low]` `[patch]` no test runs two Variants on one backend, so losing the per-backend `prepared` map would leak Redis servers and reset databases mid-run unseen — added `redis` + `queue-redis@redis` (one start/stop, one socket) and `pgsql` + `queue-database@pgsql` (one drop/create) cases.
  - (verification-gap 2) `[low]` `[patch]` `XARAVEL_REDIS_SOCKET` absent on non-Redis Variants while Redis runs is unasserted — XT-112 now runs a `sqlite` line beside Redis and asserts the socket is absent there.
  - (verification-gap other) `[low]` `[patch]` stale-lock takeover race: two harnesses can each remove the same stale lock and both run — removal now only when the re-read text still equals the stale text. Grouped with blind 3, edge 1.
  - (edge 1) `[low]` `[patch]` same stale-lock race — grouped above.
  - (edge 2) `[low]` `[patch]` the holder releasing between EEXIST and the read gives "held by pid unknown" for a free lock — ENOENT at that read retries the create. Grouped with edge 15.
  - (edge 3) `[medium]` `[patch]` SIGINT/SIGTERM skips `finally`, orphaning the started `redis-server` and leaving the lock — the CLI now installs signal handlers for the run that stop Redis and release the lock. Grouped with blind 2, edge 4, edge 14.
  - (edge 4) `[medium]` `[patch]` orphaned servers accumulate per killed run — grouped with edge 3; SIGKILL remains the documented exception.
  - (edge 5) `[low]` `[patch]` an inherited `XARAVEL_REDIS_SOCKET` leaks into runs where the harness started no Redis — deleted from the child env first. Grouped with blind 6.
  - (edge 6) `[low]` `[patch]` a relative API root makes the socket path relative while redis-server's cwd is `.cache/redis` — `runHarness` resolves the root.
  - (edge 7) `[low]` `[reject]` a `prepareSqlite` filesystem error aborts as `harness failed:` — still exits 1 with the OS message; needs a broken `.cache`, and a try/catch adds a branch for no everyday case.
  - (edge 8) `[low]` `[reject]` `startRedis` mkdir throw aborts the run — same reasoning as edge 7.
  - (edge 9) `[low]` `[reject]` `.cache` creation failure is `harness failed:` rather than a named precondition — same reasoning.
  - (edge 10) `[low]` `[reject]` an unreadable creation-id file gives a generic message — needs a permission-broken git dir.
  - (edge 11) `[low]` `[reject]` the start wait may overrun 5000 ms by up to one 1 s probe — cosmetic bound.
  - (edge 12) `[low]` `[reject]` `PGDATABASE` set to the worktree's own database makes the reset fail — a misconfiguration; the Variant is NOT-RUN with the server's message.
  - (edge 13) `[low]` `[reject]` backends are prepared for a Variant with no Ported Test files — harmless (an empty reset or a short-lived server), and skipping it adds a branch.
  - (edge 14) `[medium]` `[patch]` claim "stops afterwards" fails on Ctrl-C — grouped with edge 3.
  - (edge 15) `[low]` `[patch]` claim "naming the holder" fails on the ENOENT race — grouped with edge 2.
  - (blind 1) `[low]` `[reject]` Variants sharing a backend share its state within a run — AD-17 resets per full run, not per Variant; Upstream's tests own their teardown (`InteractsWithRedis::tearDownRedis` flushes, database tests migrate/refresh), as in Laravel's own suite; the once-per-backend behavior is now pinned by tests (verification-gap 1).
  - (blind 2) `[medium]` `[patch]` no SIGINT/SIGTERM handling — grouped with edge 3.
  - (blind 3) `[low]` `[patch]` stale-lock race — grouped with verification-gap other.
  - (blind 4) `[low]` `[reject]` a concurrent first-ever run can read a half-written creation id — needs two harnesses' very first runs in one worktree within microseconds; the second fails loudly with "malformed" and succeeds on rerun.
  - (blind 5) `[low]` `[patch]` `worktreeOf` hides git's reason (missing git, `safe.directory`) — the message now carries git's last stderr line.
  - (blind 6) `[low]` `[patch]` inherited socket env — grouped with edge 5.
  - (blind 7) `[low]` `[patch]` CI Redis connection contract undocumented — `docs/ops/harness.md` now says CI Redis Variants use `REDIS_HOST`/`REDIS_PORT` and get no socket.
  - (blind 8) `[low]` `[patch]` `WITH (FORCE)` needs Postgres 13+ — documented (AD-28 targets 18).
  - (blind 9) `[low]` `[reject]` live-Postgres branches run on any reachable default server and silently lose coverage otherwise — they only create and drop fixture-key `xaravel_test_*` names that `ownsDatabase` admits; the lost coverage is recorded as a residual risk, and Story 5.7's CI services make it run.
  - (blind 10) `[low]` `[patch]` XT-113's CLI section waits only 2 s against a 1.5 s sleep, flaky under load — deadline-based wait and a signal-file holder.
  - (blind 11) `[false]` `[reject]` code quality: the in-loop `ownsDatabase` re-check is dead — it is the spec's deliberate second guard before DDL ("`drop` throws on any other name"); the shared timeout constant and the `exited -1` wording name no harm.
  - (blind 12) `[low]` `[reject]` test gaps (finally after a throwing Variant, the real server's process gone, fast-mode stale SQLite) — the finally path is exercised by every precondition-failure test that later reuses the root; the real-server run asserts no persistence files and the next test's start would fail on a held socket; fast mode reusing `.cache/sqlite` is the spec's rule.
  - (intent) `[low]` `[patch]` descriptive: lazy per-backend preparation rather than at start, an injected admin seam, a fake `redis-server`, env vars no package reads yet (Redis and Database packages are Phase 2+), independent repos in XT-114 — all as the spec decided; one concrete defect: XT-111's comment says "outside .cache" while the filter checks inside — the assertion now matches the comment.

## Design Notes

The creation id is a file in the worktree's own git dir, not in `.cache/`. `git clean -dfX` or deleting `.cache` keeps the key stable, and `git worktree remove` followed by `add` at the same path gets a fresh key. That second case is the stale-database risk ADV-47 names. An inode number or birth time would need no write, but both are reused or unreliable across filesystems.

Redis runs per harness invocation rather than as a daemon. The lock makes it one per worktree. Starting it on demand costs about 50 ms and leaves no process behind when an agent dies, except when the harness itself is SIGKILLed, and then the next run removes the leftover socket.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/harness-isolation.test.ts conformance/tests/xaravel/harness.test.ts conformance/tests/xaravel/harness-select.test.ts` -- all pass.
- `bun run harness` twice in a row -- same SUMMARY; `.cache/harness.lock` gone afterwards; a concurrent second run exits 1 naming the first.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run escalations:check`, `bun run expectations:check`, `bun run protected-paths:codeowners` -- all pass.

## Auto Run Result

Status: done

**Summary.** `bun run harness` now isolates each worktree's backends (AD-17), through `conformance/harness/isolation.ts`:
- **Worktree key.** The root must be the top level of a git worktree. The key is the first 8 hex characters of SHA-256 over `<realpath>\n<creation id>`. Git has no creation id, so the harness creates one, the 32 hex characters in `<git-dir>/xaravel-worktree-id`. A new worktree at the same path therefore gets a new key.
- **Lock.** `.cache/harness.lock` keeps out a second runner, and the error names the holder's pid, host, start time and command. A stale lock (a dead pid on this host) is taken over. The lock is released in `finally` and on SIGINT/SIGTERM.
- **Postgres.** On a full run, every `xaravel_test_<key>[_<suffix>]` database is dropped, with `WITH (FORCE)`, and `xaravel_test_<key>` is created. A fast run only creates it when missing. Nothing else is ever dropped, because a double guard admits only test names into DDL. A reset failure makes the Variant NOT-RUN.
- **SQLite.** `.cache/sqlite/` is recreated on a full run.
- **Redis.** Locally, one `redis-server` per run, on `.cache/redis.sock`, started with `--save "" --appendonly no` and stopped afterwards. In CI, the job's service at `REDIS_HOST`/`REDIS_PORT`.
- **Child env.** Every run gets `XARAVEL_WORKTREE_KEY`, `XARAVEL_CACHE_DIR`, `XARAVEL_SQLITE_DIR` and `XARAVEL_PG_DATABASE`. Local Redis Variants also get `XARAVEL_REDIS_SOCKET`.

**Files changed.**
- `conformance/harness/isolation.ts` (new): the worktree, creation id and key, the lock, the Postgres admin and reset, SQLite, the Redis start and stop, and the child env.
- `conformance/harness/harness.ts`: the worktree and lock at start, preparation once per backend in place of the probe, the env, `worktree` in the result, the internal `postgres` and `onCleanup` options, and signal handling in `main`.
- `conformance/harness/backends.ts`: exports `tryConnect`, `Target`, `setting` and `parsePort` for reuse. Behavior is unchanged.
- `conformance/tests/xaravel/harness-isolation.test.ts` (new): XT-conformance-110 to 114.
- `conformance/tests/xaravel/harness.test.ts` and `harness-select.test.ts`: fixture changes only. Roots run `git init`, the env points `XARAVEL_REDIS_SERVER` at a missing path, and `treeDigest` skips `.cache` and `.git`. In XT-105, the local Redis NOT-RUN text changes and the reachable-Postgres case uses a no-op admin. AD-17 behavior that Story 5.3 deferred to this Story.
- `docs/ops/harness.md`: a Backend isolation section, plus local versus CI Redis under NOT-RUN.

**Review.** 31 findings: 1 medium, 26 low, 1 false and 3 descriptive.
- **Patched: 10 entries**, 1 medium and 9 low.
  - The medium: SIGINT/SIGTERM cleanup, so no `redis-server` is orphaned and no lock is left behind.
  - The low ones:
    - the stale-lock race (re-read before removing);
    - ENOENT during the lock read;
    - an inherited `XARAVEL_REDIS_SOCKET` reaching runs;
    - a relative API root;
    - git's stderr in the worktree error;
    - the CI Redis and Postgres 13+ docs;
    - tests for two Variants on one backend and for the socket only on Redis Variants;
    - the XT-113 timing;
    - the XT-111 comment versus its assertion.
- **Deferred:** none.
- **Rejected:** each with its reason in the triage log.
  - The false finding: the "dead" `ownsDatabase` re-check, which is the spec's deliberate second guard.
  - The low ones:
    - filesystem errors that surface as `harness failed:` (edges 7–10);
    - the start wait overrunning by up to 1 s;
    - `PGDATABASE` set to the worktree's own database;
    - preparing backends for an empty run;
    - Variants on one backend sharing state within a run (AD-17 resets per run, and Upstream's tests own their teardown);
    - a creation id half-written during a concurrent first run;
    - live-Postgres branches with no opt-in;
    - the residual test gaps.

**Follow-up review recommended: false.** Patched entries by verdict: high 0, medium 1, low 9.

**Verification.**
- The three harness suites pass: 5 + 6 + 5 tests.
- `bun run test`: 200 pass, 0 fail.
- `typecheck`, `lint`, `escalations:check` and `expectations:check` pass, and `protected-paths:codeowners` causes no drift.
- `bun run harness` twice: the same SUMMARY both times (`variants=11 run=4 not-run=7 checked=21817 differ=0`), and no lock is left afterwards.
- **Live Redis.** A real `redis-server` 8.2.2, built from source in a scratch directory and put on `PATH`, behaved as follows:
  - XT-112's live branch passed;
  - `bun run harness` ran the `redis` and `queue-redis@redis` Variants (`run=6 not-run=5 differ=0`);
  - afterwards, `.cache/redis/` held no `dump.rdb` or AOF, and no socket was left.

**Residual risks.**
- **Postgres has not run live.** No Postgres was available: Homebrew's install hung, and the bottles need its libraries. The `Bun.SQL` admin (socket `path`, the `pg_database` query, `DROP … WITH (FORCE)`, `CREATE DATABASE`) is covered only by the in-memory admin. Its first real run will be on Story 5.7's CI Postgres 18 service, or on a Maintainer machine with Postgres. The live branches in XT-110 and XT-114 run automatically whenever Postgres is reachable at the default env.
- **No package reads the new env yet.** The Database and Redis packages come later, and their Ported Tests must use `XARAVEL_SQLITE_DIR`, `XARAVEL_PG_DATABASE` and `XARAVEL_REDIS_SOCKET`. Nothing here enforces where a test puts its SQLite files.
- **The lock and `bun run test`.** XT-105 runs the harness on the real repository, so it takes the real `.cache/harness.lock` and resets the real `.cache/sqlite/`. Running `bun run test` while `bun run harness` runs in the same checkout fails XT-105 on the lock.
- **SIGKILL.** A SIGKILLed harness leaves its `redis-server` running, which must be stopped by hand. The next run removes the stale socket and lock.
- **Stale-lock takeover.** A tiny window remains between the re-read and the removal.
