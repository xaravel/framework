---
title: 'Retro epic 2 item 3: the GHCR token never reaches Composer plugin or script code in the Oracle build'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: 'f481affe0892faef41a8de41dc6270644e7a1ee6'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/ops/oracle.md'
warnings: []
deferred:
  - summary: >-
      Oracle test outcomes on the two-pass image are argued equal to the single-pass image, not measured.
    evidence: |-
      The PR's oracle / build job verifies the installed package set against the locks and the Pest manifest in ai, mcp and boost, but no baseline run compares test outcomes on the new tag. Settle with the next baseline run on the new image; if any outcome differs, raise an Escalation.
    location: >-
      conformance/oracle/Dockerfile
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The Oracle build mounts the `github_token` BuildKit secret (on main, the `oracle` job's token, which holds `packages: write`) and exports it as `COMPOSER_AUTH` in the same `RUN` that runs `composer install --no-progress --prefer-dist` without `--no-plugins`/`--no-scripts` (`conformance/oracle/Dockerfile:92-107`). Composer plugins (`pestphp/pest-plugin` in ai, mcp and boost) and root scripts (`post-autoload-dump` runs `testbench package:purge-skeleton`/`package:discover` in ai and mcp) execute third-party code while the token is readable (Epic 2 retro finding R3, action item `epic-2-retro-item-3-oracle-build-token-isolation`).

**Approach:** Split the install into two `RUN`s. The first mounts the secret and runs `composer install --no-progress --prefer-dist --no-plugins --no-scripts` per snapshot: it only downloads and extracts the locked packages. The second has no secret mount and no `COMPOSER_AUTH`, and runs the original `composer install --no-progress --prefer-dist` per snapshot over the populated `vendor/`: nothing is downloaded, plugins activate, autoload is regenerated and `post-autoload-dump` scripts run, as in the single-pass install. `oracle:check` statically enforces the split, and `oracle:verify-image` checks each Pest suite's `vendor/pest-plugins.json` exists, so a build where plugins never ran fails.

## Boundaries & Constraints

**Always:** The installed package set, the snapshot's `composer.json`, the root versions and the Pest plugin manifest stay what the single-pass install produced; the second pass uses the same flags as the original install. The token file and `COMPOSER_AUTH` exist only in the first `RUN`. Every doc and comment that describes when the token is visible is updated.

**Never:** No `--no-plugins` or `--no-scripts` on the token-less pass. No change to the locks, `oracle.yml` jobs, triggers or permissions, `conformance/protected-paths`, or the build arguments. No weakened or removed test assertion. If the image's installed set or Oracle outcomes would change, raise an Escalation instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Committed Dockerfile | Two-pass install | `oracle:check` passes | No error expected |
| Plugins under the token | The secret-mounting `RUN` runs `composer install` without `--no-plugins` or `--no-scripts` | `oracle:check` fails naming the secret `RUN` and the missing flag | exit 1 |
| No token-less pass | No `RUN` without the secret runs `composer install` without those flags | `oracle:check` fails: plugins and scripts would never run | exit 1 |
| Token-less pass mounts the secret | Both installs in one secret `RUN` | Fails as "plugins under the token" | exit 1 |
| Pest manifest missing | An ai/mcp/boost image lacks `vendor/pest-plugins.json` | `verify-image` reports it for that snapshot | exit 1 |

</intent-contract>

## Code Map

- `conformance/oracle/Dockerfile:15-18,83-107` -- header comment on the token; the `ARG XARAVEL_ROOT_VERSIONS` + secret `RUN` with the `for pair in $XARAVEL_ROOT_VERSIONS;` loop. The `ARG` stays in scope for the second `RUN`; `rm -rf` of composer home/cache, the `oracle` user and `chown` move to the second `RUN`.
- `tools/oracle/oracle.ts:463-512` -- `checkDockerfile(root)`: strips `#` lines, checks FROM digests, no `composer update`, the `ARG`, the `:?` guard, and every `for pair in X;` loop is `$XARAVEL_ROOT_VERSIONS` (two loops still pass). Add the two RUN rules here.
- `tools/oracle/oracle.ts:720-768` -- `verifyImage`: reads `installed.json` and `composer.json` per snapshot via `readImageFile`. Add the `vendor/pest-plugins.json` read for snapshots whose lock holds `pestphp/pest-plugin`.
- `conformance/tests/xaravel/oracle.test.ts:207-215` -- fake docker image writer (`putImage`-style); add `vendor/pest-plugins.json` for Pest suites. `:242-262` static Dockerfile assertions; `:420-440` bad-Dockerfile `check` cases (the `.replace("composer install --no-progress", …)` hits the first install only — keep it working); `:500-515` verify-image failure cases.
- `docs/ops/oracle.md:16,55` -- install description and "token is visible only while composer install runs".

## Tasks & Acceptance

**Execution:**
- `conformance/oracle/Dockerfile` -- split the install into a secret `RUN` (`--no-plugins --no-scripts`) and a token-less `RUN` (original flags, then cleanup, user and chown); update the header and inline comments.
- `tools/oracle/oracle.ts` -- in `checkDockerfile`, join continuation lines into instructions; fail when a `RUN` mounting `id=github_token` runs `composer install` without both `--no-plugins` and `--no-scripts`, and when no `RUN` without the mount runs `composer install` without them. In `verifyImage`, require `vendor/pest-plugins.json` for each snapshot whose lock holds `pestphp/pest-plugin`. Update the doc comments.
- `conformance/tests/xaravel/oracle.test.ts` -- assert the committed Dockerfile has both passes; add `check` cases for each I/O row; the fake image gets the Pest manifest and a missing manifest fails `verify-image`.
- `docs/ops/oracle.md` -- describe the two passes and that the token is readable only in the download pass, which runs no package code.

**Acceptance Criteria:**
- Given the committed repository, when `bun run oracle:check` runs, then it passes; when the PR's `oracle / build` job runs, then both builds verify against the locks with every Pest manifest present.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 21 findings — high 0, medium 5, low 9, false 4, maybe-false 3
- findings:
  - `[medium]` `[patch]` (blind) Composer cache and home are left in the download pass's layer, because the `rm -rf` moved to the second RUN — the download-pass RUN now also ends with `rm -rf /tmp/composer-home /tmp/composer-cache`.
  - `[medium]` `[patch]` (blind) `chown -R`/`chmod -R` in the second RUN copies every vendor file from the earlier layer up into a new one, roughly doubling vendor — the user is created and the full chown/chmod run at the end of the download pass; the second pass fixes only the files it wrote (`find ! -user 1001`, `find ! -perm -u+w`).
  - `[low]` `[reject]` (blind) Nothing enforces "nothing is downloaded" in the token-less pass (`COMPOSER_DISABLE_NETWORK`) — a download there carries no token, so the security property holds either way, and `verify-image` still compares the installed set with the lock; disabling the network risks breaking a script that resolves something, for no defect seen.
  - `[medium]` `[patch]` (blind) `checkDockerfile` checks only `composer install` under the secret, so `dump-autoload`, `run-script`, `composer -n install` or `composer i` would run package code with the token and pass — every `composer` command in a token-bearing RUN must now carry both flags; a `dump-autoload` test case was added.
  - `[low]` `[patch]` (blind) The token-less pass is recognised only by not mounting `id=github_token`; another secret or `COMPOSER_AUTH` there passes — any RUN with `--mount=type=secret` or `COMPOSER_AUTH` is now token-bearing; a test case was added. The ordering part (full pass before the download pass) is rejected: it has no token effect and the CI build would show it.
  - `[low]` `[reject]` (blind) `verify-image` checks that plugins ran, not that root scripts ran — the static check already fails a `--no-scripts` on the token-less pass; checking Testbench's cache output needs knowledge of per-suite artefacts for a case nothing produces.
  - `[low]` `[reject]` (blind) `verify-image` checks the Pest manifest exists, not its content — the plugin writes the file only when it runs, which is what the check is for; parsing it adds a branch for a state nothing produces.
  - `[low]` `[patch]` (blind) The dockerignore sentence landed at the end of docs list item 2 — moved to its own paragraph.
  - `[low]` `[patch]` (blind) The `check` paragraph of the `oracle.ts` header comment is badly reflowed — rewrapped.
  - `[maybe-false]` `[reject]` (blind) `dockerInstructions` ignores heredoc `RUN <<EOF` bodies, so a heredoc secret RUN would pass — the committed Dockerfile uses no heredoc; if it did, the "no token-less pass" rule would still fire unless both passes were heredocs. It would only be low, so rejected; settle by adding a heredoc RUN.
  - `[low]` `[reject]` (blind) The fake image's manifest is chosen from fixture packages while `verifyImage` decides from the lock — the fixture writes each lock from the same `defaultPackages`, so they agree; a confusing failure would arise only in a future fixture edit.
  - `[false]` `[reject]` (blind) The spec file is not in the diff — it is withheld from the blind layer by design and is committed with the change.
  - `[medium]` `[patch]` (edge) Other Composer subcommands in the secret RUN are not flagged — same root cause and fix as the blind `dump-autoload` row.
  - `[maybe-false]` `[reject]` (edge) Heredoc RUN bodies are not parsed — same as the blind heredoc row.
  - `[false]` `[reject]` (edge) The full pass could be in another stage or before the secret RUN — the only other stage is `composer`, which the final stage only copies a binary from; order is not a token issue (blind ordering row).
  - `[low]` `[patch]` (edge) A token-less RUN with another secret or `COMPOSER_AUTH` passes — same fix as the blind token-less row.
  - `[medium]` `[patch]` (edge) Removed same-RUN cache cleanup leaves the cache in a layer — same fix as the blind cache row.
  - `[low]` `[patch]` (edge) Comment "`oracle:check` enforces the split" overclaims while only `composer install` and `id=github_token` are checked — the two check patches above make the claim hold; the comments and docs now name the wider rule.
  - `[false]` `[reject]` (intent) Reading B (read-only token, separate push) is not implemented — the intent offers either option; option 1 is implemented and the `oracle.yml` scope is unchanged by design.
  - `[maybe-false]` `[defer]` (intent) Oracle outcomes are argued equal, not measured — the CI build verifies the installed set and the Pest manifest, but no baseline run compares test outcomes on the new image. If outcomes differed it would be medium; settle with the next baseline run on the new tag.
  - `[false]` `[reject]` (intent) The second pass is `composer install`, not literally `dump-autoload` — the intent names `dump-autoload` as an example; a second install fires the same `post-autoload-dump` events plus the install events the original single pass fired.

## Design Notes

Composer loads already-installed plugins at startup, so the second `composer install` over a complete `vendor/` activates `pestphp/pest-plugin` (it subscribes to `post-autoload-dump` and writes `vendor/pest-plugins.json`) and runs the root `post-autoload-dump` scripts, exactly the events the single pass fires after installing. No lock holds a `composer-installer`-type plugin and framework disables `php-http/discovery`, so `--no-plugins` in the first pass changes no install path.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle.test.ts` -- expected: all pass.
- `bun test`, `bun run typecheck`, `bun run lint` -- expected: clean.
- `bun run oracle:check` -- expected: passes; `bun run oracle:tag` prints a new tag (the Dockerfile is hashed).
- CI `oracle / build` on the PR -- expected: green (no local Docker on the orchestrator host).

## Auto Run Result

Status: done

**Summary:** The Oracle build installs Composer packages in two passes. The download pass mounts the `github_token` secret and runs `composer install --no-progress --prefer-dist --no-plugins --no-scripts`, so no plugin or script code runs while the token is readable. It then clears the Composer home and cache, creates the `oracle` user and hands it `/oracle/upstream` in the same layer. The token-less pass runs the original `composer install --no-progress --prefer-dist` over the populated `vendor/`, which activates `pestphp/pest-plugin` and runs the root `post-autoload-dump` scripts. It fixes ownership only for the files it wrote. `oracle:check` now treats any `RUN` with a secret mount or `COMPOSER_AUTH` as carrying the token, requires both flags on every `composer` command there, and requires a token-less flagless `composer install`. `oracle:verify-image` requires `vendor/pest-plugins.json` for each suite whose lock holds `pestphp/pest-plugin`. The image tag moves to `v13.37.0-ae83566512c9`.

**Files changed:**
- `conformance/oracle/Dockerfile`: the two install passes, with the cleanup and the user setup placed to keep layers small.
- `tools/oracle/oracle.ts`: `dockerInstructions`, the two-pass rules in `checkDockerfile`, and the Pest manifest check in `verifyImage`; header and doc comments.
- `conformance/tests/xaravel/oracle.test.ts`: static two-pass assertions, `check` cases for every I/O row plus `dump-autoload` and `COMPOSER_AUTH` cases, the fake image's Pest manifest and a missing-manifest case. No assertion removed or weakened.
- `docs/ops/oracle.md`: the two passes, the widened check, and when the token is readable.

**Review:** 21 findings (high 0, medium 5, low 9, false 4, maybe-false 3). Patched entries: 3 medium (cache left in a layer, chown copying vendor up, other Composer commands under the token) and 3 low (other secret or `COMPOSER_AUTH` in the token-less pass, a misplaced docs sentence, a badly wrapped header comment). 1 deferred: Oracle test outcomes are argued equal, not measured. Rejected, with reasons in the triage log: no network block on the token-less pass, no root-scripts artefact check, no manifest content check, heredoc `RUN`s, fixture/lock drift, the spec missing from the diff, stage and order, reading B of the intent, and literal `dump-autoload`.

**Follow-up review recommended:** true. Three medium entries were patched, and none of the patched Dockerfile behaviour (the `find`-based ownership fix, the cache cleanup, the plugins activating in the second pass) can be built on this host, which has no Docker. The PR's `oracle / build` job is the first real build.

**Verification:**
- `bun test`: 69 pass, 0 fail.
- `bun run typecheck` and `bun run lint`: clean.
- `bun run oracle:check`: passes; tag `v13.37.0-ae83566512c9`.
- No local Docker, so the image was not built here.

**Residual risks:**
- If the token-less pass downloads anything, it does so unauthenticated (no token risk, only rate limits).
- Oracle test outcomes on the new image are not compared with the old image until the next baseline run (deferred).
