---
title: 'Story 1.8: Lockstep release workflow with provenance'
type: 'feature'
created: '2026-10-17'
baseline_revision: '12b1e25223ad4c41d6afe2f938b1038cba3d149a'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/stories/1.8.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Make `versions` and `release-authority` required checks on main.
    evidence: |-
      `.github/rulesets/main.json` requires only `protected-paths`, `ownership` and `audit`, so a version drift or a second publishing workflow goes red but can merge. Adding them is a live ruleset apply (Maintainer).
    location: >-
      .github/rulesets/main.json; tools/ruleset/ruleset.ts REQUIRED_CHECKS
    severity: medium
  - summary: >-
      XT-conformance-7 and the root-baseline test assert version `0.0.0`, so the first release stamp breaks them.
    evidence: |-
      `conformance/tests/xaravel/scaffold.test.ts:228` and `root-baseline.test.ts:28` pin `"0.0.0"` on the repository root. A `release:stamp` to 0.1.0 makes both fail. Changing an expected value in an existing test needs the Maintainer's ruling (grader).
    location: >-
      conformance/tests/xaravel/scaffold.test.ts:228; conformance/tests/xaravel/root-baseline.test.ts:28
    severity: medium
  - summary: >-
      The live release surface is unverified: the `release` environment, the npm Trusted Publishers, the bootstrap publishes and a real provenance publish.
    evidence: |-
      All are Maintainer steps in `docs/ops/release.md`; the repo has no environments (2026-10-17). `gate` refuses until the environment exists, so nothing can publish unprotected meanwhile. Settled by the Maintainer's setup and a first `v0.<n>.<p>` tag.
    location: >-
      docs/ops/release.md
    severity: medium
  - summary: >-
      No CI workflow runs `bun test`, so XT-34..38 gate only locally.
    evidence: |-
      Pre-existing across Epic 1; the harness and the CI pipeline arrive in Epic 5 (Story 5.7).
    location: >-
      .github/workflows/
    severity: low
  - summary: >-
      The publish loop's re-run skip and the `gh release view` guard are verified only as YAML text.
    evidence: |-
      No test executes the shell in release.yml. Closing it means moving the loop into `release.ts` behind an injectable npm command.
    location: >-
      .github/workflows/release.yml Publish with provenance
    severity: medium
  - summary: >-
      A release can end half-published when one public package was never bootstrapped or has no Trusted Publisher.
    evidence: |-
      The publish loop goes package by package, so packages before the failing one stay on npm at the new version. A pre-check that every public name exists on npm before the first publish would stop it early; it needs the live npm setup (retro epic-1 item 13).
    location: >-
      .github/workflows/release.yml
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Nothing yet stamps one version into every package, gates publishing on an approved `v0.<n>.<p>` tag, or stops another workflow from publishing. AD-18, FR-13 and NFR-11 require all of that before agents run unattended.

**Approach:** Add one tool, `tools/release/release.ts`, with a library and a CLI. Its commands are `stamp`, `check`, `gate`, `notes`, `pack` and `authority`. Add `.github/workflows/release.yml` (a `gate` job, then a `release` job in the protected `release` environment that packs with `bun pm pack` and runs `npm publish <tgz> --provenance`). Add `.github/workflows/release-checks.yml` with `versions` and `release-authority` jobs on every PR. Document the process in `docs/ops/release.md`.

## Boundaries & Constraints

**Always:**
- The root `package.json` `version` is the single source. Workspaces come from the root `workspaces` globs (`packages/*`, `skeleton`, `installer`, `tools/*`): every directory that matches and holds a `package.json`. `stamp` and `check` cover every workspace, private ones included. Public packages are the workspaces without `private: true`; only they are packed and published.
- `stamp` rewrites only the `version` value and keeps key order, 2-space indent and the trailing newline (`JSON.stringify(x, null, 2) + "\n"`; package.json is plain data, not a framework value, so AD-23 does not apply). It is idempotent.
- Tag rule: publish only when the tag matches `^v0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$` and equals `v` + the root version. Otherwise `gate` writes `publish=false` and a one-line reason, and exits 0. Its exit codes are 0 (decided), 1 (internal failure: fail closed, nothing published), 2 (usage).
- `gate` also fails closed when the live `release` environment lacks a `required_reviewers` protection rule naming the Maintainer (`MAINTAINER` from `tools/protected-paths/protected-paths.ts`). It reads `GET /repos/<repo>/environments/release` through `GITHUB_API_URL` (default `https://api.github.com`), with the token in `GH_TOKEN` and the repo from `--repo`. A 404, any other non-2xx, or no token gives `publish=false` with the reason.
- `pack --out <dir>` runs `bun pm pack --destination <dir>` in each public package, in sorted order. It reads each tarball's `package/package.json` with `tar -xzOf` and fails, naming the package and field, when any string value anywhere in it contains `workspace:`.
- `notes --tag <t>` prints Markdown that names the version and states `Baseline Pin: laravel/framework <pin>`, with `<pin>` read (trimmed) from `conformance/baseline-pin`, and lists the published package names. A missing or empty pin file is a failure.
- `authority [--root <dir>]` parses every `.github/workflows/*.y{a,}ml`. `id-token: write` (top-level or job-level, or `write-all`) and any `run` step that matches `\b(npm|bun|pnpm|yarn)\s+publish\b` are allowed only in job `release` of `.github/workflows/release.yml`. Each violation is one `release authority: <file> …` line. A missing or empty workflows directory is a violation.
- Workflows: top-level `permissions: contents: read`. In `release.yml` only the `release` job has write scopes (`contents: write`, `id-token: write`), which already passes `workflows:check`. Actions are pinned by SHA, with `persist-credentials: false`. `release.yml` triggers on `push: tags: ['**']`, so every tag gets an explanation. The npm CLI is used only in the `release` job: `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` with `registry-url: https://registry.npmjs.org`, then `npm install -g npm@11.5.1`.
- Tool style matches `tools/escalations/escalations.ts`: a header comment, `UsageError`, a `main(argv)` that returns the exit code, `import.meta.main`.

**Never:** a stored npm token or `NODE_AUTH_TOKEN` secret (trusted publishing only); a live write to GitHub or npm from this Story (environment setup, trusted-publisher config and the bootstrap publish are the Maintainer's documented steps); running `npm publish` locally; Node, npm or pnpm anywhere outside the `release` job; editing `tools/protected-paths/`, `tools/ownership/` or their workflows; editing the ruleset to make the new checks required (that is a live apply, so it is deferred to the Maintainer).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| stamp | root 0.1.0, packages 0.0.0 | every workspace `version` becomes 0.1.0; other bytes unchanged; a second run changes nothing | — |
| check drift | one package at 0.0.1 | exit 1, `version mismatch: <dir>/package.json has 0.0.1, root has 0.1.0` | — |
| gate ok | tag `v0.1.0`, root 0.1.0, env protected by the Maintainer | `publish=true` | — |
| gate bad tag | `v1.0.0`, `v0.1`, `v0.01.0`, `v0.1.0-rc.1`, `foo` | `publish=false`, reason names the pattern | exit 0 |
| gate mismatch | `v0.2.0` vs root 0.1.0 | `publish=false`, reason names both | exit 0 |
| gate env | 404, no Maintainer reviewer, HTTP 500, no token | `publish=false`, reason | exit 0 |
| pack leak | packed manifest keeps `workspace:*` | exit 1 naming the package and the field | — |
| authority | `id-token: write` or `npm publish` in another workflow or job | exit 1, one line each | — |

</intent-contract>

## Code Map

- `package.json` -- root `version` 0.0.0 and `workspaces`. Add the scripts `release:stamp`, `release:check` and `release:authority`.
- `tsconfig.json` `include` -- add `tools/release/**/*.ts`.
- `packages/*/package.json`, `installer/package.json` (public, `create-xaravel`), `skeleton` and `tools/boost-framework` (private) -- the workspaces. Verified locally: `bun pm pack` in `packages/support` rewrites `workspace:*` to `0.0.0`.
- `tools/escalations/escalations.ts` -- the CLI style to copy. `tools/workflow-permissions/workflow-permissions.ts` -- the `Bun.YAML.parse` workflow walk and `writeGrants` logic to mirror in `authority`. `ALLOWED_WRITE_JOBS` already includes `release`.
- `tools/protected-paths/protected-paths.ts:31` -- `MAINTAINER` ("@edanisko"); strip the `@` to compare logins.
- `conformance/tests/xaravel/escalations.test.ts:70-140` -- the `runCli` (stripped env) and `Bun.serve` fake API (`Bearer test-token`) patterns.
- `conformance/tests/xaravel/repository-policy.test.ts:681` -- XT-33 pins `ci.yml` to exactly the `audit` and `workflow-permissions` jobs, so the new checks go in a new workflow file and `ci.yml` stays unchanged. `:572` -- XT-31 runs `workflows:check` on the repo root, so it must pass on the new workflows.
- `conformance/baseline-pin` -- `v13.37.0`.
- Live (2026-10-17): the repo is public and has no environments yet.

- **Attempt 1** of this spec is saved at `/tmp/xaravel-1.8-attempt1.patch` (`git apply` it from the repo root). The review accepted its design; reuse it and apply the amendments in the Spec Change Log rather than starting from nothing.
- `bun.lock` -- records each workspace's `version`. Verified: after `stamp` alone, `bun install --frozen-lockfile` still passes, but `bun pm pack` rewrites `workspace:*` from the **lockfile** (`@xaravel/support@0.1.0` packed with `@xaravel/collections: 0.0.0`). After `bun install --lockfile-only`, pack writes 0.1.0. `Bun.JSONC.parse(text).workspaces[<dir>].version` reads it.
- `tools/scaffold/scaffold.ts:97` `generatePackageJson` -- the scaffold template; new public packages must get the same `repository` field (after `license`). `conformance/tests/xaravel/scaffold.test.ts` checks manifest fields one by one, so an added key does not break it.
- No workspace `package.json` has a `repository` field today. `npm publish --provenance` rejects a manifest whose `repository.url` does not match the building repo.

## Tasks & Acceptance

**Execution:**
- `tools/release/release.ts` -- exports `PUBLISH_TAG`, `workspaces(root)`, `versionMismatches(root)`, `stamp(root)`, `tagDecision(tag, version)`, `environmentDecision(json)`, `releaseNotes({version, pin, packages})`, `manifestLeaks(name, manifest)`, `authorityViolations(files)`, `checkAuthority(root)`, plus the CLI. `gate` takes `--tag`, `--repo` and `[--github-output <file>]`; it appends `publish=…` and `reason=…` lines to that file and prints the reason.
- `.github/workflows/release.yml` -- the `gate` job, then the `release` job (`needs: gate`, `if: needs.gate.outputs.publish == 'true'`, `environment: release`, `concurrency: release`). The `release` job runs: checkout, setup-bun, a frozen `--ignore-scripts` install, `release.ts check`, setup-node with npm 11.5.1, `release.ts pack --out dist`, `npm publish "$tgz" --provenance --access public` for each tarball, then `release.ts notes` into `gh release create "$TAG" --verify-tag --notes-file`. `GH_TOKEN` is `github.token`.
- `.github/workflows/release-checks.yml` -- the `versions` (`release.ts check`) and `release-authority` (`release.ts authority`) jobs, on `pull_request`, `merge_group` and `push` to main.
- `docs/ops/release.md` -- how to cut a release (`release:stamp`, a PR, then the Maintainer tags), the one-time `release` environment setup (required reviewer: the Maintainer, deployment tags `v0.*`), trusted-publisher setup per package, the one-time bootstrap publish of a new `@xaravel/*` name by the Maintainer, and that agents never publish.
- `package.json`, `tsconfig.json` -- the scripts and the include.
- `conformance/tests/xaravel/release.test.ts`:
  - XT-34: stamp and check on a fixture workspace; byte-exact, idempotent; the CLI exits 1 on drift; the repo passes `check`.
  - XT-35: `tagDecision`/`environmentDecision` ok rows; `gate` against the fake API writes `publish=true`; `pack` on a fixture with `workspace:*` deps produces tarballs without `workspace:`, and `manifestLeaks` flags a leak; `release.yml`'s `release` job has `environment: release`, `id-token: write`, the `if` on the gate output, and runs `bun pm pack` (via `pack`) and `npm publish "$tgz" --provenance`.
  - XT-36: bad and mismatched tag rows, environment 404/500/no reviewer/no token through `gate`, each with `publish=false`, exit 0 and a reason; `release.yml` triggers on every tag.
  - XT-37: `notes` contains `Baseline Pin: laravel/framework v13.37.0` read from the file (a fixture pin proves it reads the file); a missing pin fails.
  - XT-38: `authority` rows (another workflow with `id-token: write`, `npm publish`, `bun publish`, `write-all`, a non-`release` job in `release.yml`); the repo root passes; `release-checks.yml` runs `authority`; `docs/ops/release.md` documents the bootstrap publish.

- Amendments from review pass 1 (see the Spec Change Log):
  - `tools/release/release.ts` `stamp` -- after rewriting manifests, runs `bun install --lockfile-only` in the root (only when a manifest changed) so `bun.lock` carries the new versions.
  - `check` -- also fails, one `version mismatch: bun.lock workspace <dir> has <v>, root has <r>` line each, when a `bun.lock` workspace entry with a `version` differs from the root version.
  - `pack` -- also fails when a packed manifest (a) has a dependency, peer or optional dependency on another workspace's name whose range is not exactly the root version (`pack: <name> packed package.json field dependencies.<dep> is "<v>"; internal dependencies must be the root version <r> (AD-18)`), or (b) lacks `repository.url` `git+https://github.com/xaravel/framework.git` and `repository.directory` equal to its workspace dir (provenance).
  - Every public workspace `package.json` (`packages/*`, `installer`) -- add `"repository": {"type": "git", "url": "git+https://github.com/xaravel/framework.git", "directory": "<dir>"}` right after `license`. `generatePackageJson` adds the same for non-private rows.
  - `environmentDecision` -- publish only when there is at least one required reviewer and **every** required reviewer is the Maintainer as a `User`; another user or a team refuses with a reason.
  - `PUBLISH_COMMAND` -- also matches flags between the tool and the verb (`npm -w x publish`, `pnpm -r publish`, `npm --registry=r publish`) within one shell command; `published`/`publisher` still don't match.
  - `release.yml`:
    - setup-node gets `node-version: '24'`.
    - The npm install is `npm install -g --ignore-scripts npm@11.5.1`.
    - The gate step also appends the decision line to `$GITHUB_STEP_SUMMARY`.
    - The publish loop is safe to re-run: before each `npm publish`, it reads the tarball's name and version (`tar -xzOf "$tgz" package/package.json`) and skips the tarball, with a log line, when `npm view "<name>@<version>" version` already returns that version.
    - `gh release create` is skipped when `gh release view "$TAG"` succeeds.
  - `docs/ops/release.md` -- step 1 commits the refreshed `bun.lock` with the stamped manifests. The failed-run paragraph says re-running the job is safe and finishes the remaining packages.
  - Tests:
    - XT-34: stamp refreshes `bun.lock` on a fixture, and `check` flags a stale lock entry.
    - XT-35: `gate` on the repo root uses `v` + the root version (not a literal `v0.0.0`). A CLI `pack` run on a fixture whose packed manifest keeps a `workspace:` string (e.g. `description`) exits 1 naming the package and the field. Fixtures for the internal-version and `repository` rules exit 1. Assert the `npm view` skip and the `gh release view` guard in `release.yml`.
    - XT-36: a second reviewer or a team refuses.
    - XT-38: the flag-between rows.

**Acceptance Criteria:**
- Given the root `package.json` version, when `bun run release:stamp` runs, then every package's `version` equals it, and `release:check` (the `versions` job) fails CI when any package differs (XT-conformance-34).
- Given a pushed tag that matches `v0.<n>.<p>` and equals the root version, when the release workflow runs in its protected `release` environment, then each public package is packed with `bun pm pack` and published with `npm publish <tgz> --provenance`, and no packed manifest contains `workspace:` (XT-conformance-35).
- Given a tag that doesn't match or doesn't equal the root version, when the workflow triggers, then it exits without publishing and explains why (XT-conformance-36).
- Given the generated release notes, when inspected, then they state the Baseline Pin from `conformance/baseline-pin` (XT-conformance-37).
- Given every other workflow, when the release-authority check runs, then none has `id-token: write` or runs `npm publish`, the check fails if one does, and `docs/ops/release.md` documents the bootstrap publish (XT-conformance-38).

## Spec Change Log

### 2026-10-17 — Review pass 1 (bad_spec loopback)
- **Triggering findings:**
  - (a) After `release:stamp`, `bun pm pack` rewrites `workspace:*` from the stale `bun.lock`. It publishes `@xaravel/support@0.1.0` depending on `@xaravel/collections@0.0.0`, and `manifestLeaks` does not notice (verified locally).
  - (b) No public manifest has `repository`, so `npm publish --provenance` rejects every tarball.
  - (c) A partly failed release can't be re-run: the published versions fail `npm publish` again.
- **Amended:**
  - Code Map: attempt patch, `bun.lock`, scaffold, `repository`.
  - Tasks: the "Amendments from review pass 1" block, which also carries this pass's patch findings.
- **Known-bad states avoided:**
  - a lockstep release whose internal dependencies point at the previous version;
  - a release that fails at its first publish;
  - a half-published version that can't be completed.
- **KEEP:**
  - attempt 1's whole design and every test it has (`/tmp/xaravel-1.8-attempt1.patch`);
  - the `gate` job, and the environment check that fails closed;
  - the separate `release-checks.yml`, with `ci.yml` untouched;
  - the tool's CLI style and exit codes;
  - XT-34..38 structure, the fixtures and the fake API;
  - the docs layout.

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 40 findings — high 2, medium 11, low 21, false 6, maybe-false 0
- findings:
  - Blind Hunter
    - `[high]` `[bad_spec]` No `repository` field, so `npm publish --provenance` rejects every tarball. — Confirmed: no workspace manifest has one. Amendment: add the field to every public manifest and the scaffold template, and have `pack` check it.
    - `[high]` `[bad_spec]` `release:stamp` leaves `bun.lock` stale. — The claimed `--frozen-lockfile` failure did not happen. The real harm is worse and was verified: `bun pm pack` takes the internal dependency versions from the lockfile (0.0.0). Amendment: `stamp` refreshes the lock, `check` compares the lock, and `pack` checks internal ranges.
    - `[low]` `[reject]` `gate` does not check that the tag is on `main`. — Only org admins can push tags (Agent tags ruleset), and the Maintainer approves the run. The fix adds a fetch and an ancestry guard.
    - `[low]` `[reject]` `gate` ignores `deployment_branch_policy` and environment secrets. — Approval is the guarantee that matters, and it is checked. The extra guards add branches for settings the Maintainer controls.
    - `[medium]` `[patch]` `PUBLISH_COMMAND` misses flags between the tool and `publish`. — Folded into the amendment: the regex allows flags within one command. `uses:` actions and composite actions are rejected as low, with the Edge Case rows.
    - `[medium]` `[bad_spec]` A partly failed release can't be re-run. — Amendment: the publish loop skips versions that `npm view` already has, and `gh release create` is guarded. The publish-order part is false: npm does not resolve dependencies at publish time.
    - `[medium]` `[patch]` setup-node has no `node-version`. — Folded in: `node-version: '24'`.
    - `[low]` `[reject]` `pack` checks neither `LICENSE`, a null `name` nor a `files` allowlist. — Beyond AD-18; `LICENSE` is scaffolded into every package (XT-7). Adding them is new surface for an unlikely failure.
    - `[low]` `[reject]` `stamp` reformats the whole file. — The spec fixes the `JSON.stringify(…, 2)` form, every manifest is already in it (scaffold), and XT-34 shows byte-exact output on that form.
    - `[low]` `[reject]` `check` does not validate the root version's shape. — `gate` refuses a non-`v0` version at tag time and nothing is published. The fix is a new guard.
    - `[false]` `[reject]` The stamp PR conflicts with the Protected Path policy. — The `ownership` check applies only to `story/*`. The root `package.json`/`bun.lock` need the Maintainer's review, and the Maintainer is the one releasing.
    - `[low]` `[patch]` A refused tag gives no visible signal. — Folded in: the gate step appends the decision to `$GITHUB_STEP_SUMMARY` (one line).
    - `[false]` `[reject]` The spec file is missing from the diff. — Deliberate: it is the claims file, handed to the Edge Case layer only.
    - `[low]` `[reject]` No `npm publish --dry-run` test. — It would need npm and the network in `bun test`; the YAML assertions pin the command.
    - `[low]` `[reject]` The release job has no `timeout-minutes`. — The default 6-hour cap applies; cosmetic.
    - `[low]` `[patch]` `npm install -g` runs lifecycle scripts. — Folded in: `--ignore-scripts`.
  - Edge Case Hunter
    - `[medium]` `[patch]` Other required reviewers besides the Maintainer can approve. — Folded in: every required reviewer must be the Maintainer as a `User`.
    - `[low]` `[reject]` `gate` exits 1 without outputs when the root is unreadable. — It fails closed: `release` is skipped, and stderr gives the reason.
    - `[low]` `[reject]` The tag is not checked to be on `main`. — Same claim as the Blind Hunter row; same reason.
    - `[medium]` `[patch]` `npm -w x publish`, `pnpm -r publish` and similar evade the regex. — Grouped with the Blind Hunter regex row. `npm pub`, `npx` and actions are rejected as low: the fix adds a growing deny-list for an unlikely bypass of a check that only the Maintainer-reviewed `.github/` can change.
    - `[low]` `[reject]` Composite actions under `.github/actions` are not scanned. — None exist; `.github/` is a Protected Path.
    - `[low]` `[reject]` A `description` holding `workspace:` is a false leak. — The spec fixes the "any string" scan; such a description is unlikely.
    - `[low]` `[reject]` An empty `--out ""`/`--root ""` resolves to the cwd. — Only the workflow and the docs call it, with fixed values.
    - `[medium]` `[patch]` setup-node has no `node-version`. — Grouped with the Blind Hunter row.
    - `[low]` `[reject]` The environment check is not re-run in the release job. — GitHub enforces the environment's protection itself at job start.
    - `[medium]` `[patch]` XT-35 runs `gate` with a literal `v0.0.0` against the repo root, so it breaks at the first stamp. — Folded in: use `v` + the root version.
    - `[false]` `[reject]` Duplicate tarball names (`@a/b-c` vs `a-b-c`). — No two workspace names in the repo map to the same file name. Bun names `@xaravel/x` as `xaravel-x-<v>.tgz` and the Installer as `create-xaravel-<v>.tgz`.
    - `[low]` `[reject]` The stamp byte-exact claim. — Same as the Blind Hunter stamp row.
  - Verification Gap
    - `[medium]` `[patch]` `pack`'s leak wiring is never run on a leaking manifest. — Folded in: a CLI `pack` case with a `workspace:` string in the packed manifest, which must exit 1.
    - `[low]` `[reject]` The authority check scans only `run:`, not `uses:`. — Same as the Edge Case regex reject.
    - `[low]` `[defer]` No CI runs `bun test`, and the new checks are not required. — Pre-existing (Epic 5) and a Maintainer ruleset decision; both deferred.
  - Intent Alignment
    - `[medium]` `[defer]` Environment approval is verified only against a fake. — Live setup is the Maintainer's; deferred (live surface).
    - `[medium]` `[defer]` Provenance publishing is only string-checked. — Same root; deferred.
    - `[low]` `[reject]` `workspace:` leaks are tested on a fixture, not on the real packages. — The release job runs `pack` on the real packages and fails closed. The implementer also packed all 52 real packages locally, with no leak.
    - `[medium]` `[defer]` `versions`/`release-authority` don't gate merge. — Deferred: ruleset apply (Maintainer).
    - `[low]` `[patch]` A bad tag's run is green, with the reason only in the logs. — Grouped with the Blind Hunter step-summary row.
    - `[low]` `[reject]` Authority stops at `run:` strings. — Same as the Edge Case reject.
    - `[false]` `[reject]` The notes are checked only through the CLI. — The intent's surface is the generated notes, and the CLI generates exactly what `gh release create` receives.
    - `[false]` `[reject]` The docs are checked by substring. — They are inspected, and the bootstrap section exists.
    - `[false]` `[reject]` The spec is not in the diff. — Same as the Blind Hunter row.

### 2026-10-17 — Review pass (loop 1 re-derivation)
- verdicts: 38 findings — high 0, medium 10, low 23, false 5, maybe-false 0
- findings:
  - Blind Hunter
    - `[low]` `[reject]` `gate` does not check that the tag is on `main`. — carried: only org admins push tags and the Maintainer approves the run.
    - `[low]` `[reject]` The release job does not prove CI passed on the tagged SHA. — A tag on a `main` commit already passed the merge queue (same root as the tag-on-main row). Adding a check-runs guard is new surface.
    - `[medium]` `[patch]` `environmentDecision` ignores `can_admins_bypass` (true by default), so admins can deploy without the reviewer's approval. — `gate` now refuses unless it is `false`; the docs say to turn the bypass off. Test added.
    - `[low]` `[reject]` The environment's `v0.*` tag rule is not checked. — carried: approval is the checked guarantee.
    - `[low]` `[reject]` No pre-check that every name exists on npm, so a missing bootstrap leaves a partial release. — The re-run is now safe: bootstrap the name, then re-run and the loop finishes. The guard is new surface.
    - `[false]` `[reject]` The docs give no recovery for a partial release. — The amended doc says a re-run is safe and finishes the remaining packages.
    - `[low]` `[reject]` The release-authority check misses `uses:`, `npx`, line continuations and composite actions. — carried: a growing deny-list over `.github/`, which is Maintainer-reviewed.
    - `[low]` `[patch]` Nothing tracks the Maintainer step that makes the new checks required. — The docs' one-time setup names it (`main.json` + `ruleset:apply`). The ruleset change itself stays deferred.
    - `[medium]` `[patch]` The first stamp breaks XT-1/XT-7, and the docs don't warn. — A doc note was added under "Cutting a release". The test change stays deferred (Maintainer ruling).
    - `[low]` `[reject]` The scaffolder hard-codes `0.0.0`. — `release:check` flags a new package and `release:stamp` fixes it; it is part of the existing scaffold contract (XT-7).
    - `[low]` `[reject]` `pack` checks neither `LICENSE` nor a `files` allowlist. — carried.
    - `[low]` `[reject]` `check`/`stamp` accept any root version shape. — carried.
    - `[low]` `[reject]` `stamp` re-serializes manifests. — carried.
    - `[low]` `[reject]` `concurrency: release` cancels an older pending run when a third tag is pushed. — It needs two releases pending approval at once, which is unlikely. Changing the group changes the tested design.
  - Edge Case Hunter
    - `[medium]` `[patch]` `can_admins_bypass` and the tag rule are unchecked. — Grouped with the Blind Hunter bypass row. The tag-rule part was rejected as carried.
    - `[low]` `[reject]` Environment reviewers can change between `gate` and `release`. — carried: GitHub enforces the protection at job start.
    - `[low]` `[reject]` A tag on a commit not on `main`. — carried.
    - `[low]` `[reject]` Concurrency drops a pending run. — Grouped with the Blind Hunter row.
    - `[low]` `[patch]` `stamp` is a no-op when only `bun.lock` is stale, while `check` says to run it. — `stamp` now also refreshes the lock when it holds a stale workspace version. Test added.
    - `[low]` `[reject]` A public package could depend on a private workspace. — None does. `graph:check` and the scaffold table decide the edges; the guard is new surface.
    - `[low]` `[reject]` A public workspace has no name. — carried.
    - `[low]` `[reject]` A publish through `uses:`. — carried.
    - `[low]` `[reject]` `npm \` + newline `publish`, `npx`. — carried.
  - Verification Gap
    - `[medium]` `[patch]` The scaffolder's `repository` field is never asserted. — An assertion was added to `assertPackagesGenerated`, for public and private rows.
    - `[medium]` `[patch]` The `repository` contract is checked only at release time. — `check` (the `versions` job) now reports `repositoryProblems` for source manifests. Test added.
    - `[medium]` `[defer]` The publish loop's re-run skip is pinned only by source text. — Executing it needs the loop moved into `release.ts` behind an injectable npm. Deferred.
    - `[medium]` `[defer]` The first stamp breaks two tests. — carried (deferred item).
    - `[low]` `[reject]` Authority covers only `run:`. — carried.
  - Intent Alignment
    - `[medium]` `[defer]` "Fails CI" is not a required check. — carried.
    - `[medium]` `[defer]` Environment approval is verified against a fake only. — carried (live surface).
    - `[medium]` `[defer]` `npm publish --provenance` is only string-checked. — carried (live surface).
    - `[low]` `[reject]` `pack` is tested on fixtures, not on the real packages. — carried.
    - `[false]` `[reject]` "Exits" is a green run. — The intent says "exits without publishing and explains why", not "fails". The reason is now in the step summary.
    - `[false]` `[reject]` The notes are checked only through the CLI. — carried.
    - `[low]` `[reject]` Authority is a regex heuristic. — carried.
    - `[false]` `[reject]` The tests use `expect` from `bun:test`. — The AGENTS.md rule binds Ported Tests; Epic 1 Xaravel Tests run on plain `bun test` until Epic 5 (epic context).
    - `[false]` `[reject]` The spec is not in the diff. — carried.
    - `[low]` `[reject]` A `v0.0.0` tag after the bootstrap would skip every package and create only a GitHub release. — Harmless and idempotent; the docs say the first CI release is a newer version.

### 2026-10-17 — Follow-up review pass
Scoped to the Story's squash commit (`f6450b9`, excluding `_bmad-output/` and the one-field `repository` additions to `packages/*/package.json` and `installer/package.json`), because `followup_review_recommended` was `true` (retro epic-1 item 11, finding R9). Findings were verified against `main` at `09f2efd`, which includes retro item 7 (#36). This pass covers the `can_admins_bypass` refusal and the source-manifest `repository` rule that the last pass had not reviewed.
- verdicts: 40 findings — high 0, medium 5, low 21, false 13, maybe-false 1
- findings:
  - Verification Gap
    - `[medium]` `[defer]` The publish loop's re-run skips are checked only as YAML text. — carried: the existing deferred item.
    - `[low]` `[patch]` `notes` refusing a mismatched or non-v0 tag is untested. — XT-37 now runs `notes --tag v0.2.0` and `v1.0.0` on a 0.1.0 fixture and asserts exit 1, no stdout, and the tag in stderr.
    - `[low]` `[reject]` (other) `authority` ignores `uses:` publish actions. — A `uses:` action can only publish with a stored token, which the Never list bans and the repo has none of, or with `id-token: write`, which `authority` already confines to the release job.
  - Edge Case Hunter
    - `[medium]` `[patch]` An internal `gate` failure writes no `publish=false` or reason, contradicting the `release.yml` header. — `gateCommand` now records `publish=false` and `reason=gate failed: …` in the output and stdout before failing with exit 1; XT-36 asserts both on an unreadable root.
    - `[medium]` `[patch]` A non-v0 tag on a commit with a broken root `package.json` fails with no explanation. — Same root cause and fix as the row above: the failure is now recorded.
    - `[false]` `[reject]` `stamp` re-serializes the whole file. — The intent mandates `JSON.stringify(x, null, 2) + "\n"`, and the scaffolder writes every manifest in that form; `scaffold:check` holds it.
    - `[low]` `[reject]` A manifest with no `version` gets it appended last. — The scaffolder writes `version` in every manifest; unlikely.
    - `[low]` `[reject]` A failed lockfile refresh leaves manifests stamped. — It exits 1 with the error, and a stamp is a local, reviewed PR change; rerunning fixes it.
    - `[low]` `[reject]` Negation globs in `workspaces`. — The root has none; adding one is a Protected `package.json` change.
    - `[low]` `[reject]` `pack()` with a relative `out`. — The CLI resolves `--out` (`release.ts:622`); no library caller passes a relative path.
    - `[false]` `[reject]` `bun pm pack` prints a relative path. — XT-36 packs real fixtures and the repo pack produced 52 tarballs; the path resolves.
    - `[low]` `[reject]` `uses:` publish actions and composite actions evade `authority`. — Same reason as the verification-gap row.
    - `[low]` `[reject]` A line continuation splits `npm \ publish`. — Publishing still needs OIDC (`id-token: write`, confined) or a token (banned); the regex is a backstop, not the gate.
    - `[low]` `[reject]` A quoted or variable tool name evades `authority`. — Same reason.
    - `[low]` `[reject]` `prevent_self_review: true` would leave the release waiting forever. — A visible pending deployment, fixed in the Maintainer's environment settings; `docs/ops/release.md` owns that setup.
    - `[low]` `[reject]` `deployment_branch_policy` is not verified. — Defence in depth only: the release job runs only after `gate` accepts the tag pattern, the root version and (since #36) the tag commit being on `main`.
    - `[false]` `[reject]` A matching tag on a commit off `main` publishes. — Fixed by retro item 7 (#36): `gate` refuses a tag whose commit is not reachable from `main`.
    - `[low]` `[reject]` Zero tarballs leave `dist/*.tgz` unexpanded. — There are 52 public packages; the step fails loudly anyway.
    - `[low]` `[reject]` `npm view … || true` hides transient errors. — The following `npm publish` then fails loudly; nothing is published wrongly.
  - Blind Hunter
    - `[medium]` `[patch]` `gate` writes nothing when it errors. — Same root cause as the edge row; patched there.
    - `[false]` `[reject]` Nothing checks where the tag points. — Fixed by #36.
    - `[low]` `[reject]` `gate` does not check the deployment-tag policy. — Same as the edge row.
    - `[low]` `[reject]` The publish-command check is easy to get around. — Same reason as the `uses:` rows; `my-npm publish` false positives fail closed.
    - `[medium]` `[defer]` A run can leave a release half-published when a package was never bootstrapped. — Needs a live npm pre-check; part of the Maintainer's release setup (retro item 13). Recorded in `deferred`.
    - `[low]` `[reject]` `pack` allows a dependency on a private workspace. — `graph:check` governs package dependencies, and no public package depends on a private one.
    - `[low]` `[reject]` No check on tarball contents or `LICENSE`. — `bun pm pack` includes `LICENSE`, and `scaffold:check` holds each package's `LICENSE`.
    - `[low]` `[reject]` `stamp` rewrites whole files; the root version shape is unchecked. — The first is false (see the edge row); a malformed root version is refused by `gate`.
    - `[false]` `[reject]` The doc's two gaps are untracked. — Both are tracked: retro items 2 and 13, and this spec's `deferred`.
    - `[low]` `[reject]` Node and npm are used with no cited exception. — The intent allows them in the `release` job only, and `authority` plus XT-38 enforce that; a comment adds nothing.
    - `[maybe-false]` `[reject]` The bootstrap steps run `pack` with no `bun install` first. — Would be settled by a bootstrap dry run on a clean clone; if true, it is low (a doc step the Maintainer runs once, and `pack` fails loudly).
    - `[low]` `[reject]` `concurrency: release` replaces a pending run. — Needs two release tags pushed while one awaits approval; the Maintainer pushes both.
    - `[low]` `[reject]` `check`'s success line names only versions. — Cosmetic.
  - Intent Alignment
    - `[false]` `[reject]` `gate` refuses a Maintainer-plus-other reviewer and `can_admins_bypass` true. — The intent's purpose is guaranteed Maintainer approval; the stricter reading is the safe one.
    - `[false]` `[reject]` `stamp` writes `bun.lock`. — carried: the pass-1 bad_spec fix for a stale lock packing old versions.
    - `[false]` `[reject]` `check` enforces `repository`. — carried: provenance needs it (pass-1 bad_spec).
    - `[false]` `[reject]` `pack` has extra failure classes. — Each fails closed on a manifest that would publish wrongly.
    - `[false]` `[reject]` `notes` validates the tag. — Consistent with `gate`; now tested (see the patch row).
    - `[false]` `[reject]` The docs tell the Maintainer to run `npm publish` locally. — The intent names the bootstrap publish as the Maintainer's documented step; the Never binds the agent.
    - `[false]` `[reject]` The workflows are checked only statically. — carried: the deferred live-surface and publish-loop items.
    - `[false]` `[reject]` The fake API writes its own environment schema. — carried: the deferred live-surface item; the first live `gate` run settles it.

## Design Notes

**Why the gate checks the environment.** GitHub creates a missing environment on first use, with no protection. A tag pushed before the Maintainer sets up `release` would then publish without approval. The `gate` job reads the environment first and refuses, so the approval requirement holds even before the setup is done.

**Why a separate workflow file.** XT-33 pins `ci.yml`'s job set exactly. A new `release-checks.yml` adds the checks without changing an existing assertion.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/release.test.ts` -- all XT-34..38 pass.
- `bun test` -- the whole suite passes.
- `bun run typecheck` and `bun run lint` -- clean.
- `bun run release:check`, `bun run release:authority`, `bun run workflows:check` -- OK on the repo root.

## Auto Run Result

Status: done

**Summary.** The lockstep release pipeline (AD-18, FR-13, NFR-11):
- `tools/release/release.ts` provides `stamp`, `check`, `gate`, `notes`, `pack` and `authority`.
- `.github/workflows/release.yml` runs a `gate` job on every tag. A `release` job follows in the protected `release` environment: it runs `bun pm pack`, then `npm publish <tgz> --provenance` through OIDC trusted publishing, then creates the GitHub release with notes stating the Baseline Pin. Re-runs are safe.
- `.github/workflows/release-checks.yml` adds the `versions` and `release-authority` PR checks.
- `docs/ops/release.md` documents the procedure, the one-time Maintainer setup and the bootstrap publish.

**Files changed.**
- `tools/release/release.ts` -- new release tool.
- `.github/workflows/release.yml` -- new tag-triggered release workflow.
- `.github/workflows/release-checks.yml` -- new `versions` and `release-authority` checks.
- `docs/ops/release.md` -- release procedure and Maintainer setup.
- `conformance/tests/xaravel/release.test.ts` -- XT-conformance-34..38.
- `conformance/tests/xaravel/scaffold.test.ts` -- an added `repository` assertion in XT-7/XT-10 (no existing assertion changed).
- `tools/scaffold/scaffold.ts` -- public manifests get `repository`.
- `packages/*/package.json` and `installer/package.json` -- the `repository` field, which provenance needs.
- `package.json` -- the `release:*` scripts.
- `tsconfig.json` -- includes `tools/release`.

**Review.** Pass 1 had 40 findings: 3 went to bad_spec (stale `bun.lock` packing old internal versions, no `repository`, an unsafe re-run) and 7 patches were folded into the re-derivation. Pass 2 had 38 findings: 6 patches applied, 0 high, 4 medium and 2 low. The new deferred item is the publish-loop shell, which is never executed by a test. Every rejected finding and its reason is in the Review Triage Log.

**Follow-up review: recommended.** Pass 2 patched four medium entries. The `can_admins_bypass` refusal and `check`'s source-manifest `repository` rule were added after the last review pass and have not been reviewed themselves.

**Verification.**
- `bun test`: 38 pass, 0 fail.
- `bun run typecheck` and `bun run lint`: clean.
- `release:check`, `release:authority`, `workflows:check`, `scaffold:check`, `graph:check` and `bun install --frozen-lockfile`: all OK.
- On a scratch copy stamped to 0.1.0: `stamp`, `check`, `pack` (52 tarballs, internal dependencies at 0.1.0, `repository` present) and `notes` (`Baseline Pin: laravel/framework v13.37.0`).

**Residual risks.** See `deferred`:
- The new checks are not required on `main`.
- The first stamp away from 0.0.0 breaks XT-1 and XT-7 until the Maintainer rules on them.
- The live environment, the Trusted Publishers and the bootstrap publish are Maintainer steps; `gate` refuses until they are done.
- The workflow shell has never run on Actions.
- No `bun test` in CI until Epic 5.

### Follow-up review (2026-10-17)

Run for retro epic-1 item 11 (finding R9), scoped to `f6450b9` and verified against `main` at `09f2efd`. 40 findings: 5 medium, 21 low, 13 false, 1 maybe-false.
- Patched (medium 1 entry from 3 rows, low 1):
  - `tools/release/release.ts`: `gate` records `publish=false` and `reason=gate failed: …` before an internal failure exits 1, as the `release.yml` header promises.
  - `conformance/tests/xaravel/release.test.ts`: XT-36 asserts that record on an unreadable root; XT-37 asserts `notes` refuses a mismatched and a non-v0 tag.
- Deferred: a partial publish when a package was never bootstrapped (Maintainer release setup, retro item 13).
- Rejected: the rest, with reasons in the Review Triage Log; two were already fixed on `main` by retro item 7.
- **Follow-up review recommendation:** false. No high was patched, so the work has converged.
- Verification: `bun test` 39 pass, 0 fail; `typecheck`, `lint`, `graph:check`, `scaffold:check`, `release:check` and `release:authority` exit 0.
- Residual risks: unchanged from the first pass's `deferred` list.
