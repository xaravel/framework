# Devcontainer

`.devcontainer/` is Xaravel's optional Linux reference environment (Story 5.10; AD-17, AD-28, NFR-1, NFR-7). It brings up the decided toolchain and the alpha backends with nothing on the host but Docker: Bun at `.bun-version`, the repository's locked dependencies, `redis-server` at CI's Redis version, and a Postgres sidecar from CI's image. Every harness command, tool and done check also runs natively on macOS and Linux; see [The native path](#the-native-path).

## What is in it

| File | What it does |
| --- | --- |
| `.devcontainer/Dockerfile` | The workspace image. Its base is CI's Redis image (`ARG REDIS_IMAGE=redis:8.10.2`), so `redis-server` on `PATH` is CI's build. Bun is copied from `oven/bun:${BUN_VERSION}` (`ARG BUN_VERSION=1.4.3`), with `bunx` beside it. It adds `git` and `ca-certificates`, and a non-root user `xaravel` whose UID and GID are the build args `XARAVEL_UID` and `XARAVEL_GID` (default 1000; an existing group with that GID is reused). The build fails when either is `0` |
| `.devcontainer/start.sh` | The workspace's command: `bun install --frozen-lockfile --ignore-scripts` (CI's install), then `/tmp/xaravel-ready`, then it idles. The workspace is healthy once the install has finished |
| `.devcontainer/compose.yaml` | The `workspace` service (with `init: true`, so PID 1 forwards SIGTERM and reaps the harness's `redis-server`) and the `postgres` sidecar (`postgres:18`, user and password `postgres`, data on a tmpfs, healthy once `pg_isready -h 127.0.0.1` answers over TCP, which initdb's temporary server does not) |
| `.devcontainer/devcontainer.json` | The devcontainer CLI's entry: the Compose file, `service: workspace`, `workspaceFolder: /workspaces/xaravel`, `remoteUser: xaravel`, `updateRemoteUserUID: true` |

The checkout is bind-mounted at `/workspaces/xaravel`. `.cache/` and `node_modules/` are named volumes (`xaravel-cache`, `xaravel-node-modules`), not host bind mounts, so the harness's Redis unix socket (`/workspaces/xaravel/.cache/redis.sock`) and its I/O work, and Linux binaries never land in the host's `node_modules/`. The workspace env sets `PGHOST=postgres`, `PGPORT=5432`, `PGUSER=postgres` and `PGPASSWORD=postgres`, and never `CI`, `REDIS_HOST`, `REDIS_PORT` or `XARAVEL_REDIS_SERVER`: the harness starts the worktree's own `redis-server` on `.cache/redis.sock`, as it does natively ([harness.md](harness.md#backend-isolation)).

Every base image (`oven/bun`, `redis`, `postgres`) is multi-arch, and nothing pins a platform, so the container runs on linux/amd64 and linux/arm64. CI builds and runs only linux-x64: arm64 is unverified in CI and rests on the multi-arch base images.

## Starting it

Every checkout needs its own Compose project name, so two checkouts on one machine never share containers or the named volumes. Every example below sets it: `-p <name>` for `docker compose`, and `COMPOSE_PROJECT_NAME` for the devcontainer CLI. Pick a name per checkout, such as `xaravel-main`.

**On a Linux Docker Engine host, create the nested mount points first.** `.cache/` and `node_modules/` are named volumes mounted inside the bind-mounted checkout. If those directories do not exist in the checkout, the engine creates them as root, and they stay root-owned in your host checkout. Run this once, before the first `up`:

```sh
mkdir -p .cache node_modules
```

With the devcontainer CLI (or an editor that reads `devcontainer.json`):

```sh
mkdir -p .cache node_modules
export XARAVEL_UID="$(id -u)" XARAVEL_GID="$(id -g)" COMPOSE_PROJECT_NAME=xaravel-main
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . bun run harness
```

With plain `docker compose` and no Node on the host, from the repository root:

```sh
mkdir -p .cache node_modules
export XARAVEL_UID="$(id -u)" XARAVEL_GID="$(id -g)"
docker compose -p xaravel-main -f .devcontainer/compose.yaml up --build --detach --wait
docker compose -p xaravel-main -f .devcontainer/compose.yaml exec workspace bash
```

`XARAVEL_UID` and `XARAVEL_GID` make the container's user own the bind-mounted checkout and the `.cache/` and `node_modules/` volumes. Without them the user is 1000:1000. The devcontainer CLI's `updateRemoteUserUID` also remaps the user to the host's ids, but it does not change the volumes' ownership, so export both variables with the devcontainer CLI too.

**Volumes keep their first ownership.** A named volume copies its ownership from the image only when it is first created. After changing `XARAVEL_UID` or `XARAVEL_GID`, delete the volumes and rebuild:

```sh
docker compose -p xaravel-main -f .devcontainer/compose.yaml down -v
docker compose -p xaravel-main -f .devcontainer/compose.yaml up --build --detach --wait
```

Stop it with `docker compose -p xaravel-main -f .devcontainer/compose.yaml down` (`down -v` also deletes the volumes).

## Running the harness

Inside the workspace, the commands are the native ones:

```sh
bun run harness
bun run devcontainer:pins
bun run devcontainer:pins runtime
```

From the host:

```sh
set -o pipefail
docker compose -p xaravel-main -f .devcontainer/compose.yaml exec -T workspace bun run harness 2>&1 | tee /tmp/xaravel-harness.txt \
  && docker compose -p xaravel-main -f .devcontainer/compose.yaml exec -T workspace bun run devcontainer:alpha < /tmp/xaravel-harness.txt
```

As in CI, stderr is merged into the report, and `pipefail` keeps the command's own exit status through `tee`: here the alpha gate runs only when the harness exited 0. CI runs the Ratchet over the full harness instead ([below](#ci-devcontaineryml)), so an unexpected pass the Ratchet only warns about does not fail it; locally the bare harness exits 1 on it. The CI-equivalent run is `docker compose -p xaravel-main -f .devcontainer/compose.yaml exec -T workspace bun run ratchet run --ref <branch> 2>&1 | tee /tmp/xaravel-harness.txt`, then the same alpha gate.

A full `bun run harness` there runs every alpha Variant: SQLite in `.cache/`, Postgres in the sidecar as the worktree's `xaravel_test_<key>` databases, and Redis as the worktree's own `redis-server` on `.cache/redis.sock`. The container sets no `CI`, so a Variant whose backend is unreachable prints `NOT-RUN` and does not fail. `bun run devcontainer:alpha` reads the report on stdin and fails when any alpha Variant is `NOT-RUN` or there is no `SUMMARY` line. Non-alpha Variants (MySQL, MariaDB, SQL Server, Beanstalkd …) have no sidecar until Phase 9, so they stay `NOT-RUN`, and the `SUMMARY` line's `not-run=` is not 0.

The in-container `bun run harness` runs Ported Tests only. The PHP-fixture Xaravel Tests (`bun run harness --xaravel`) need PHP and Composer, which the image does not have; run them on the host.

`bun run devcontainer:pins runtime` checks the running workspace: it fails when it runs as root, when `Bun.version` differs from `.bun-version`, or when `redis-server --version` does not report the tag of the Dockerfile's `ARG REDIS_IMAGE`.

**Mount a main checkout, not a `git worktree`.** The harness needs `git` and a real `.git` directory at the root (`worktreeOf`). A linked `git worktree` checkout's `.git` is a file that points at a host path, which does not exist inside the container, so the harness refuses it there.

**Two AD-17 keys.** The worktree key hashes the worktree's path, which is `/workspaces/xaravel` inside the container and the host path outside it. A worktree used both inside and outside the container therefore has two keys, and so two sets of `xaravel_test_<key>` databases. That is safe: each run only drops its own key's databases. The host's and the container's `.cache/` are separate too.

## A headless agent session

Claude Code is not installed in the image, and no credential is in it. Run an agent session headless through `docker compose exec`, and pass credentials at run time only, from the host's environment:

```sh
docker compose -p xaravel-main -f .devcontainer/compose.yaml exec -T -e ANTHROPIC_API_KEY workspace <agent command>
```

`-e NAME` with no value forwards the host's variable for that one process; it is never written to the image, the Compose file or a file in the checkout. Install the agent's CLI inside the running container yourself. Anything installed for an agent session, outside the checkout and the `.cache/` and `node_modules/` volumes, is lost when the container is recreated (`up --build`, `down`, or a Compose file change), so reinstall it then. Whether the orchestrator runs inside the container is a separate, deferred decision.

## The Oracle and Inventory tools

The container gets no Docker socket. The Oracle and Inventory tools, which build and run the PHP Oracle image and so need Docker, run on the host or in CI (`oracle.yml`, `inventory.yml`), never inside the container.

## Secrets and env files

No secret, credential or `APP_KEY` is baked into the image. The build context is `.devcontainer/` alone, so no repository file, a `.env` included, enters the image, and no Compose `env_file` is used. Bun's `.env` autoload stays off: the root `bunfig.toml` disables it and the scripts run `bun --no-env-file`; env files are read only by Xaravel's loader.

## The pin check (`bun run devcontainer:pins`)

```sh
bun run devcontainer:pins [--root <dir>]
```

The script is `bun --no-env-file tools/devcontainer/pins.ts check`. It only reads files, so it runs natively too. It compares:

- Bun: `.bun-version`, the Dockerfile's `ARG BUN_VERSION` and the spine's Stack-table Bun row;
- Postgres: the Compose `postgres` image and every `postgres` service image in `.github/workflows/*.yml`, against `baseline.yml`'s (which must have one), whose tag must equal the spine's PostgreSQL row;
- Redis: the Dockerfile's `ARG REDIS_IMAGE` and every `redis` service image in the workflows, against `baseline.yml`'s (which must have one), whose tag must equal the spine's Redis row.

It prints `devcontainer pins: ok` and exits 0, or prints one `devcontainer pins: <Bun|Postgres|Redis> …` line per mismatch, naming the file and both values, and exits 1. It fails closed: a missing source is a `… not found` line, a workflow, `compose.yaml` or `devcontainer.json` that does not parse is a `<file> could not be parsed` line, and a `BUN_VERSION` or `REDIS_IMAGE` set in the Compose `workspace.build.args` or in `devcontainer.json` (which would override the Dockerfile's pin) is a violation; each exits 1. A usage error exits 2.

## CI (`devcontainer.yml`)

One job, `devcontainer`, on `ubuntu-24.04` (linux-x64), on PRs that change `.devcontainer/**`, `tools/devcontainer/**`, `conformance/harness/**`, `package.json`, `bun.lock`, `.bun-version` or the workflow, nightly, and on dispatch. It creates `.cache/` and `node_modules/` in the checkout, builds the image with the runner's ids, starts it with `docker compose up --wait`, runs `bun run devcontainer:pins`, `bun run devcontainer:pins runtime` and the Ratchet over a full harness run, `bun run ratchet run --ref <ref>` (no `--fast`, `--seed` or `--scope`; `<ref>` is the PR's head branch, `github.head_ref`, on a PR, else `github.ref_name`, `main` on the schedule as in [nightly](ci.md#nightly-nightlyyml); it is used only for Story ownership, while the tree graded is the checkout), inside the workspace, with `-e GITHUB_ACTIONS=true` on that `exec` so each warning is also a `::warning::` annotation. The Ratchet's verdict, not the raw harness exit, judges the run: an unexpected pass it only warns about (`WARNING UNEXPECTED-PASS …`) does not fail the job, and every other difference, or a harness that prints no `SUMMARY`, does, as does any other case where the Ratchet fails closed (unreadable manifests, a harness exit with no counted difference, an unexpected pass owned by this ref's own Story). Unlike the required `ratchet` job, this job does not overlay the base branch's manifests and sprint status, so Story ownership comes from the PR's own copies; the job is advisory, so that is acceptable. The job fails unless the Ratchet exits 0 and `bun run devcontainer:alpha` finds no alpha Variant `NOT-RUN` in the merged output, where the Ratchet writes the harness report to stderr (`devcontainer alpha: not-run=0 over <n> alpha variant(s)`). The container sets no `CI`, so the Ratchet does not fail an alpha `NOT-RUN` itself; the alpha gate does. It does not duplicate the nightly matrix ([ci.md](ci.md#nightly-nightlyyml)). It is `contents: read`, uses no secret, and uses no action but the pinned checkout.

## The native path

The container is never required. The harness, `story:check` and the pin checks never need Docker, and no harness or `story:check` code path references `.devcontainer/`; only the pin check reads its files. The Oracle and Inventory tools do need Docker, and they run on the host or in CI, never in the container. Natively, on macOS or Linux, a backend that isn't running is `NOT-RUN`, which is not a failure locally ([harness.md](harness.md#backends-and-not-run)). Install Postgres 18 and Redis to run those Variants natively.

Post-alpha engines (MySQL, MariaDB, SQL Server, memcached, Beanstalkd, DynamoDB Local) get their sidecars from the Phase 9 Story that brings their driver; an amd64-only image goes in an optional Compose profile.
