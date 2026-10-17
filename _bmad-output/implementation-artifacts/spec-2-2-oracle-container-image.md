---
title: 'Story 2.2: Oracle container image'
type: 'feature'
created: '2026-10-17'
baseline_revision: 'a6b404397ddb292155fafc5e8e3dff3af86bb22c'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.2.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nothing can run PHP Laravel at the Pin. There is no image, no locked dependency set and no publishing job, so no later Story can draw expected values from real PHP (FR-6, OQ-9).

**Approach:** Commit one `composer.lock` per Upstream snapshot, each resolved for PHP 8.5.11 with its dev dependencies and with any other Upstream package pinned to its own Pin tag. `conformance/oracle/Dockerfile` copies the snapshot and the locks onto a digest-pinned `php:8.5.11-cli` and runs `composer install` from the locks. A `tools/oracle/oracle.ts` tool checks the locks against the snapshot offline, computes the image tag, verifies a built image against the locks and builds twice to compare. `.github/workflows/oracle.yml` builds and verifies the image on PRs, and its `oracle` job, the only one with `packages: write`, pushes it to GHCR from `main`.

## Boundaries & Constraints

**Always:**
- Each of the four snapshots gets its own lock, at `conformance/oracle/locks/<name>/composer.lock`. Pest exists only in the ai, mcp and boost dev dependencies, and Composer installs dev dependencies only for a root package. So the AC's "a committed `composer.lock`" holding PHPUnit, Pest, Mockery and Testbench can only mean one lock per snapshot.
- A lock's `content-hash` equals Composer's hash of the snapshot's unmodified `composer.json`, so `composer install` treats it as current. The snapshot is never edited, and the platform PHP version comes from a temporary `COMPOSER_HOME`, not from `composer.json`.
- When a lock contains another Upstream package (`laravel/framework`, `laravel/mcp`, …), its version equals that package's Pin tag.
- The image tag is `<framework tag>-<lockhash>`. `<lockhash>` is the first 12 hex characters of the SHA-256 of the four locks, taken in pin order.
- Base images are pinned by digest. The image build runs only `composer install`, never `composer update`.
- `oracle:check` and `oracle:tag` need neither Docker nor the network. Only `oracle:build` and `oracle:verify-image` call `docker`.
- Only `oracle.yml#oracle` holds `packages: write`. It runs only on a push to `main` or on `workflow_dispatch`. It is the only job that logs in to GHCR or pushes.

**Never:**
- Edit the snapshot, `ci.yml`, any existing test's expected values, or `tools/workflow-permissions/`.
- Make `bun test`, the `check` job or any non-`oracle:*` script need Docker or PHP.
- Touch any Story 2.3+ surface: component map, Inventory, baseline run (services, the pgsql and redis extensions), `pin:bump`.
- Put a token in an image layer. The GitHub token reaches Composer only through a BuildKit secret mount.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Locks current | the snapshot and four locks match | `oracle:check` prints the tag and exits 0 | — |
| Drifted lock | a snapshot `composer.json` changed (pin moved) | exit 1 naming the lock, with expected and actual content-hash and `run bun run oracle:lock` | — |
| Missing lock or snapshot | the file or dir is absent | exit 1 naming it, with the hint `oracle:lock` or `upstream:sync` | no fetch |
| Off-pin Upstream package | the ai lock holds `laravel/framework` v13.36.0 | exit 1 naming the package, the lock and the pinned tag | — |
| Missing tool | the framework lock lacks `mockery/mockery`, or the mcp lock lacks `pestphp/pest` | exit 1 naming the lock and the package | — |
| Image verified | each `installed.json` holds exactly the lock's name, version and reference set, and `php --version` reports 8.5.11 | `verify-image` prints the sorted package set and exits 0 | — |
| Image differs | an extra, missing or other-version package, or another PHP | exit 1 listing each difference | — |
| Two builds differ | the package sets of builds A and B differ | `build` exits 1 with the diff | — |
| No Docker | `docker` absent from `PATH` | `verify-image` and `build` exit 1 with a clear message; `check` and `tag` are unaffected | — |

</intent-contract>

## Code Map

- `tools/upstream/upstream.ts` -- reuse `UPSTREAM_REPOS`, `readPin(root)` (tags), `frameworkTag(root)`, `upstreamPath(root, name, rel)` and `UPSTREAM_DIR`. Copy the CLI pattern from `main()`/`parseOptions` (`UsageError` → 2, other failures → 1) and the header-comment style.
- `conformance/tests/xaravel/upstream.test.ts` -- the fake-binary-on-`PATH` technique (XT-41) and the fixture style to reuse for a fake `docker` and a fake `composer`.
- `tools/workflow-permissions/workflow-permissions.ts:19` -- `ALLOWED_WRITE_JOBS` already lists `oracle.yml#oracle`; the new workflow needs no change there. `workflows:check` parses every workflow and so covers `oracle.yml`.
- `conformance/tests/xaravel/repository-policy.test.ts:749` and `upstream.test.ts:181` -- these pin the exact `ci.yml` jobs and the `upstream` job's steps, so the Oracle checks go in `oracle.yml`, not `ci.yml`.
- `.github/workflows/ci.yml` -- the job pattern to copy: pinned `actions/checkout@3d3c42e…` with `persist-credentials: false`, `oven-sh/setup-bun@0c5077e…` and top-level `permissions: contents: read`.
- Probe at planning time (2026-10-17): Homebrew PHP 8.5.11 and Composer 2.10.3 resolve all four locks. This needs `COMPOSER_ROOT_VERSION` set to the root's own tag without the `v`, and `--with <pkg>:<ver>` for the other Upstream packages. The results: framework 72+73 packages (phpunit 13.4.3, mockery 1.6.15, testbench-core v11.6.0); ai, mcp and boost on framework v13.37.0, mcp v1.0.2, pest v4.7.8 and testbench v11.3.0. Extensions the locks need beyond the official image: `gmp`, and `ftp` if it is absent. Digests: `php:8.5.11-cli-trixie@sha256:01a109229f4465bc9ef042d9198f09a4d9da7775a825dbd8572dcdbd8756c4d3` and `composer:2.10.3@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac`.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/oracle.ts` -- new. Exports `ORACLE_DIR`, `LOCKS_DIR`, `IMAGE_NAME`, `PHP_VERSION`, `REQUIRED_PACKAGES`, `contentHash(composerJsonText)`, `lockPath(root, name)`, `checkLocks(root)`, `lockHash(root)`, `imageTag(root)`, `expectedPackages(lockText)`, `installedPackages(installedJsonText)`, `lock(root, {composer})`, `verifyImage(root, image)` and `build(root, image)`, plus a CLI with `check`, `tag`, `lock [--composer <bin>]`, `verify-image <image>`, `build <image>` and `--root`.
- `conformance/oracle/locks/{framework,ai,mcp,boost}/composer.lock` -- generated with `bun run oracle:lock`.
- `conformance/oracle/Dockerfile` and `conformance/oracle/Dockerfile.dockerignore` -- the image. The build context is the repo root, and the ignore file admits only the snapshot and the locks.
- `.github/workflows/oracle.yml` -- path-filtered `pull_request` (→ job `build`: sync, check, `oracle:check`, `oracle:build`) plus `push` to `main` and `workflow_dispatch` (→ job `oracle`: the same, then a GHCR login and push of `ghcr.io/<owner>/xaravel-oracle:<tag>`).
- `package.json` -- `oracle:check`, `oracle:tag`, `oracle:lock`, `oracle:verify-image`, `oracle:build`. `tsconfig.json` -- include `tools/oracle/**/*.ts`.
- `conformance/tests/xaravel/oracle.test.ts` -- XT-conformance-42, 43 and 44, covering the matrix with fixtures, a fake `docker` and a fake `composer`. It also runs `contentHash` against the real locks when a snapshot exists.
- `docs/ops/oracle.md` -- an operator note on the image contents, the tag, regenerating the locks, building locally and the publishing job.

**Acceptance Criteria:**
- Given `conformance/oracle/Dockerfile` and the committed locks, when the image builds, then it contains PHP 8.5.11 and the snapshot with its dev dependencies, including PHPUnit, Pest, Mockery and Orchestra Testbench, and two builds from the same commit produce the same installed package set. The test checks the Dockerfile and locks statically, and `verify-image` and `build` against a fake `docker`. CI's `oracle:build` builds twice for real (XT-conformance-42).
- Given the image, when CI publishes it, then it is pushed to GHCR tagged `<Pin>-<lockhash>`, and only `oracle.yml#oracle` holds `packages: write` or pushes (XT-conformance-43).
- Given a contributor without Docker, when they run `bun test`, `oracle:check`, `oracle:tag` or any non-`oracle:` script, then nothing calls `docker`, which a recording fake `docker` on `PATH` proves (XT-conformance-44).

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 34 findings — high 0, medium 0, low 26, false 8, maybe-false 0
- findings:
  - `[low]` `[patch]` verification-gap: verify-image's composer.json equality is never exercised on a mismatch — added a differing and an absent image composer.json case.
  - `[low]` `[patch]` verification-gap: oracle:lock's `--no-scripts`, `--no-plugins` and `--ignore-platform-req=ext-*` are unasserted — XT-42 now asserts all three on every composer call.
  - `[low]` `[patch]` verification-gap (other): the `build` job's `$(… tag)` inside an argument escapes `set -e` — the tag is assigned to a variable first.
  - `[low]` `[reject]` intent: no real image build is shown in the diff — the PR's path-filtered `oracle / build` job builds twice for real and is green before merge; bun test stays Docker-free by AC3.
  - `[false]` `[reject]` intent: four locks vs "a committed composer.lock" — Composer installs dev dependencies only for the root, and Pest is only in ai, mcp and boost's require-dev, so one lock cannot hold the AC's tools; the intent contract records this.
  - `[low]` `[reject]` intent: the tag carries only the framework Pin, so moving only ai or boost with an identical composer.json and identical resolution keeps the tag — Pin moves are freeze-point events through `oracle:lock`, which re-resolves; the tag form is fixed by the intent contract. Residual risk.
  - `[low]` `[reject]` intent: "only the Oracle job can push" is enforced at workflow level, not registry ACL, and the spine's PR-time Oracle job (Story 3.2) will share `oracle.yml#oracle` — the one-write-job allow-list predates this Story (1.7), registry ACLs are not repository state, and Story 3.2 owns extending the job.
  - `[false]` `[reject]` intent: AC3 names "any harness command", which does not exist — the harness lands in Epic 5; XT-44 covers every current entry point and the static scan proves no non-oracle tool reaches docker.
  - `[false]` `[reject]` intent: tests use `expect` from bun:test — these are Xaravel Tests, not Ported Tests; the auditor itself says it is no divergence.
  - `[false]` `[reject]` blind: the two-build check proves almost nothing — the AC asks for the same installed package set, which is exactly what installed.json name/version/reference comparison verifies.
  - `[low]` `[patch]` blind: build() prints its success line even when the builds differ — now printed only with no problems; tested.
  - `[low]` `[patch]` blind: the docker scan skips every `upstream` dir, including tools/upstream — skips only conformance/upstream.
  - `[low]` `[reject]` blind: the image build runs Composer scripts and plugins but lock does not — deliberate: lock runs on the Maintainer host and executes no third-party code; the image needs the Pest plugin and Testbench discovery for later runs.
  - `[false]` `[reject]` blind: verify-image checks no PHP extensions — `composer install` checks the lock's platform requirements and fails the build on a missing gmp or ftp.
  - `[low]` `[reject]` blind: verify-image byte-checks only composer.json, not the whole snapshot — CI runs upstream:check on the same tree right before the build and the ignore file admits the whole snapshot; tree-hashing the image adds a new mechanism.
  - `[low]` `[reject]` blind: apt packages are unpinned — the AC is about the installed (Composer) package set; residual risk recorded.
  - `[low]` `[reject]` blind: a published tag can be overwritten by a rerun — skipping existing tags would stop a Dockerfile fix from publishing; reruns are Maintainer-initiated. Residual risk.
  - `[low]` `[patch]` blind: no OCI source label, so the GHCR package is not linked to the repository — added `org.opencontainers.image.source` and `licenses` labels; asserted.
  - `[low]` `[reject]` blind: oracle:lock is not atomic — Maintainer-run, and oracle:check flags any mixed set before commit; the fix restructures the command.
  - `[low]` `[reject]` blind: -0.0 and >2^53 integers encode differently from PHP — no Upstream composer.json holds such values; a mismatch fails loudly as "not current".
  - `[false]` `[reject]` blind: lockHash has no separators — each lock is a complete JSON document that checkLocks parses before any tag is computed, so a byte shift between files yields invalid JSON and fails first.
  - `[low]` `[reject]` blind: the real-lock parity test is skipped in the plain check job — oracle.yml runs oracle:check whenever an Oracle input changes.
  - `[low]` `[patch]` blind: path filters miss package.json, bun.lock and .bun-version — added to both filters (merge_group not added: the check is not required).
  - `[low]` `[reject]` edge: small floats encode as 0.00001, not 1.0e-5 — same as the number-encoding row.
  - `[low]` `[reject]` edge: integers between 2^53 and PHP_INT_MAX — same as the number-encoding row.
  - `[low]` `[reject]` edge: a malformed snapshot composer.json aborts the check without the file name — the snapshot is tree-hash verified, and the check fails loudly.
  - `[low]` `[patch]` edge: verify-image passes silently when the local snapshot composer.json is missing — now a problem with the sync hint; tested.
  - `[low]` `[reject]` edge: oracle:lock leaves a half-regenerated set on failure — same as the blind atomicity row.
  - `[false]` `[reject]` edge: duplicate package names collapse in the Map — Composer never writes a package twice in a lock or installed.json.
  - `[low]` `[reject]` edge: an existing GHCR tag is overwritten on a tools-only push — same as the blind overwrite row.
  - `[low]` `[patch]` edge: package.json or .bun-version changes do not trigger the workflow — same fix as the blind path-filter row.
  - `[low]` `[reject]` edge: workflow_dispatch from a non-main branch is green with nothing built — a Maintainer action whose run plainly shows both jobs skipped.
  - `[low]` `[reject]` edge: the --no-cache rebuild leaves a dangling image locally — CI runners are ephemeral; local builds are rare.
  - `[false]` `[reject]` edge: only nine scripts run against the fake docker — the static scan proves no non-oracle script reaches a docker caller; the runtime list is a supplement.

## Design Notes

Composer's content-hash (Composer 2 `Locker::getContentHash`): take the keys `name`, `version`, `require`, `require-dev`, `conflict`, `replace`, `provide`, `minimum-stability`, `prefer-stable`, `repositories` and `extra` present in `composer.json`, plus `config.platform` if it is set, `ksort` them, and take `md5(json_encode(...))` with flags 0. So `/` is escaped as `\/`, non-ASCII becomes `\uXXXX`, and an empty object decodes to a PHP array and encodes as `[]`. The implementation emulates this locally and is proven against the four real locks that Composer wrote.

## Verification

**Commands:**
- `bun test` -- expected: all pass, including XT-42..44
- `bun run typecheck`, `bun run lint`, `bun run workflows:check` -- expected: clean
- `bun run oracle:check` -- expected: four locks current; it prints the tag
- PR CI `oracle / build` -- expected: two builds, both matching the locks

## Auto Run Result

Status: done

**Summary:** The Oracle image now has every input it needs, plus a pipeline that builds, verifies and publishes it.
- **Locks:** each Upstream snapshot has its own committed lock, resolved for PHP 8.5.11 with its dev dependencies. In the ai, mcp and boost locks, `laravel/framework` and `laravel/mcp` are pinned to their Pin tags.
- **Dockerfile:** `conformance/oracle/Dockerfile` copies the snapshot and the locks onto a digest-pinned `php:8.5.11-cli-trixie` and runs only `composer install`.
- **Tool:** `tools/oracle/oracle.ts`:
  - checks the locks against the snapshot offline, using an emulation of Composer's content-hash;
  - computes the tag `v13.37.0-924c1faf964b`;
  - regenerates the locks;
  - verifies a built image against the locks and PHP 8.5.11;
  - builds twice (the second time with `--no-cache`) and compares the installed package sets.
- **Workflow:** `.github/workflows/oracle.yml` builds and verifies the image on PRs that touch the Oracle's inputs. Its `oracle` job, the only one with `packages: write`, pushes `ghcr.io/<owner>/xaravel-oracle:<tag>` from `main`.

**Files changed:**
- `tools/oracle/oracle.ts`: new. Lock check, content-hash, tag, lock, verify-image, build, and the CLI.
- `conformance/oracle/locks/{framework,ai,mcp,boost}/composer.lock`: new, generated by `bun run oracle:lock` (Homebrew PHP 8.5.11, Composer 2.10.3).
- `conformance/oracle/Dockerfile` and `Dockerfile.dockerignore`: new. The image and its cut-down build context.
- `.github/workflows/oracle.yml`: new. The PR `build` job and the publishing `oracle` job.
- `package.json`: five `oracle:*` scripts. `tsconfig.json`: includes `tools/oracle`.
- `conformance/tests/xaravel/oracle.test.ts`: new. XT-conformance-42, 43 and 44.
- `docs/ops/oracle.md`: new operator note.

**Review:** 34 findings: 0 high, 0 medium, 26 low, 8 false.
- **Patched (8 low):**
  - tests for the composer.json mismatch, an absent composer.json and a missing snapshot;
  - assertions on the lock flags;
  - the success line now prints only on success;
  - the docker scan path;
  - the `tag` capture in the `build` job;
  - path filters for `package.json`, `bun.lock` and `.bun-version`;
  - the OCI source and licenses labels.
- **Deferred:** none.
- **Rejected:** each one has its reason in the Review Triage Log.

**Follow-up review recommendation:** false. Only low entries were patched (8 low, 0 medium, 0 high).

**Verification:**
- `bun test`: 45 pass, 0 fail.
- `typecheck`, `lint`, `workflows:check`, `oracle:check` (4 locks current), `scaffold:check`, `graph:check` and `ownership:check`: clean.
- Locally on PHP 8.5.11, `composer install` from the ai and framework locks succeeded, and the installed ai set matched its lock.
- No real Docker build has run on this host, which has no Docker. The PR's `oracle / build` job is the first real two-build check.

**Residual risks:**
- The Dockerfile has not been built yet. The apt step, the `ftp` probe, Composer scripts and plugins in the build, and the secret mount are all unproven until the `oracle / build` check passes.
- apt packages are not pinned beyond the base digest, and a rerun on `main` overwrites the same tag.
- The tag carries only the framework Pin. If only ai or boost moved, and their composer.json and resolution stayed identical, the tag would not change.
- The Dockerfile repeats the Pin tags in its `for pair` list. `oracle:check` fails on drift, and Story 2.8 must update the list.
