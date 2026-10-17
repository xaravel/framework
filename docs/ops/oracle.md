# The Oracle image

The Oracle is real PHP Laravel at the Baseline Pin, in a container. Later Stories draw expected values from it (FR-6, OQ-9). It is built from `conformance/oracle/Dockerfile` and the committed locks in `conformance/oracle/locks/`. The tool is `tools/oracle/oracle.ts`. Contributors need neither Docker nor PHP: only `oracle:build`, `oracle:verify-image`, the Inventory's image mode (`bun run inventory`, through `runInImage`; see [inventory.md](inventory.md)) and the baseline run's image mode (`bun run baseline run`, through `runInImageNetworked`; see [baseline.md](baseline.md)) call `docker`, and `bun test` never does. `runInImage` runs with `--network none` and read-only mounts. `runInImageNetworked` runs with `--network host` (to reach the CI's Postgres and Redis services), `--env` variables, read-only tool mounts and one read-write output mount.

## What the image holds

- PHP 8.5.11: `php:8.5.11-cli-trixie`, pinned by digest, plus the `gmp` extension (and `ftp` if the base lacks it), which the locks need. For the baseline run ([baseline.md](baseline.md)) it also has Upstream's Linux CI extension set (`conformance/upstream/framework/.github/workflows/tests.yml`), so no Upstream test records a skip the image caused:
  - `pdo_mysql`, `pdo_pgsql`, `intl`, `zip`, `pcntl` and `gd` (with freetype, jpeg and webp), built with `docker-php-ext-install`;
  - the PECL extensions igbinary 3.2.17RC1, msgpack 3.0.1, redis 6.3.0, memcached 3.4.0 and imagick 3.8.1. Each source is downloaded from `https://pecl.php.net/get/<name>-<version>.tgz` and checked against its pinned SHA-256 before it is built. igbinary and msgpack are built first, and redis is configured as Upstream's CI configures it: `--enable-redis-igbinary --enable-redis-msgpack --enable-redis-lzf --with-liblzf --enable-redis-zstd --with-libzstd --enable-redis-lz4 --with-liblz4`.

  The build fails unless `php -m` lists every extension.
- Composer 2.10.3, copied from the digest-pinned `composer:2.10.3` image.
- A non-root user, `oracle` (uid and gid 1001, the GitHub runner's user). It is the image's `USER` and owns `/oracle/upstream`, which is writable by it as a CI checkout is (the snapshot is copied in read-only), so Upstream's tests never run as root (the baseline run, [baseline.md](baseline.md)). Root is used only for the build steps.
- The Upstream snapshot at `/oracle/upstream/{framework,ai,mcp,boost}/`, copied unmodified from `conformance/upstream/`. Each directory has its dev dependencies installed into its own `vendor/` from its own lock: PHPUnit, Mockery and Orchestra Testbench Core for `laravel/framework`, and Pest, PHPUnit, Mockery and Orchestra Testbench for `laravel/ai`, `laravel/mcp` and `laravel/boost`.

There is one lock per snapshot because Composer installs dev dependencies only for a root package, and Pest is only in the ai, mcp and boost dev dependencies. The image build runs only `composer install`, never `composer update`. `Dockerfile.dockerignore` admits only `conformance/upstream/` and `conformance/oracle/locks/` into the build context.

## The tag

The image tag is `<framework Pin>-<lockhash>`, for example `v13.37.0-924c1faf964b`. `<lockhash>` is the first 12 hex characters of the SHA-256 of the four locks' bytes, in pin order (framework, ai, mcp, boost). `bun run oracle:tag` prints it, offline. CI publishes the image as `ghcr.io/<owner>/xaravel-oracle:<tag>`.

## Commands

| Command | What it does |
| --- | --- |
| `bun run oracle:check` | Checks each lock against its snapshot, offline. The check fails if a lock is missing, if its `content-hash` is not Composer's hash of the snapshot's `composer.json`, or if it was not resolved for PHP 8.5.11. It also fails if another Upstream package in the lock is not at its own Pin tag and commit, or if a test tool is missing. It also checks the Dockerfile statically: both bases pinned by digest, no `composer update`, and its `for pair in …` root-version list equal to the Pin. On success it prints the tag. |
| `bun run oracle:tag` | Prints the image tag, offline. |
| `bun run oracle:lock` | Regenerates the four locks. Needs PHP, Composer and the network. |
| `bun run oracle:verify-image <image>` | Checks a built image. Each `/oracle/upstream/<name>/vendor/composer/installed.json` must hold exactly its lock's names, versions and references. Each `composer.json` must equal the snapshot's, and `php --version` must report 8.5.11. Prints the sorted package set, or every difference. |
| `bun run oracle:build <image>` | Runs `oracle:check`, builds the image tagged `<image>`, then builds it again with `--no-cache`. It verifies both builds and fails with the diff if their package sets differ. |

## Regenerating the locks

Regenerate the locks after an Upstream tag moves in `conformance/baseline-pin` (`oracle:check` then reports a content-hash or Pin mismatch), or to take newer dependency releases:

1. `bun run upstream:sync` and `bun run upstream:check`.
2. If a tag moved, update the `for pair in …` list in `conformance/oracle/Dockerfile` to `<name>:<tag without v>` for each snapshot, in pin order.
3. `bun run oracle:lock`. For each snapshot it copies `composer.json` into a temp directory. It sets the platform PHP to 8.5.11 in a temp `COMPOSER_HOME`, so `composer.json` stays byte-identical and the lock's `content-hash` stays valid. Then it runs `composer update --no-install --no-scripts --no-plugins --ignore-platform-req=ext-*`. `COMPOSER_ROOT_VERSION` is the snapshot's own tag without the `v`, and `--with <repo>:<tag>` is passed for each other Upstream package. Extension requirements are checked when the image installs. `--composer <bin>` picks another Composer binary. When it finishes, it runs the check and prints the new tag.
4. `bun run oracle:check`, `bun test`, then open a PR. The locks are a Protected Path. The PR's `oracle / build` job builds the image twice and verifies it.

## Building locally

With Docker (BuildKit) installed and the snapshot synced:

```sh
bun run oracle:build "xaravel-oracle:$(bun tools/oracle/oracle.ts tag)"
```

If `GITHUB_TOKEN` is set, `oracle:build` passes it to the build as the BuildKit secret `github_token`, which raises GitHub's download rate limit for Composer. The token is visible only while `composer install` runs. It is never in a build argument, an `ENV` or a layer.

## Publishing (`.github/workflows/oracle.yml`)

- `build` runs on a pull request to `main` that touches `conformance/baseline-pin`, `conformance/oracle/**`, `tools/oracle/**`, `tools/upstream/**` or the workflow itself. It syncs and checks the snapshot, then runs `oracle:check` and `oracle:build`. It has no write scope and never logs in or pushes.
- `oracle` runs on a push to `main` that touches the same paths, or on a manual `workflow_dispatch` from `main`. It does the same, then logs in to GHCR with the job's token and pushes `ghcr.io/<owner>/xaravel-oracle:<tag>`. It is the only job that holds `packages: write`, logs in to GHCR or pushes. The workflow permissions check (`bun run workflows:check`) allows a write scope only in `oracle.yml#oracle`.
