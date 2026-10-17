# Releases

Every Xaravel package ships at one lockstep version, the `version` in the root `package.json` (AD-18). Only CI publishes, from `.github/workflows/release.yml`, and only after the Maintainer approves the run. Agents never publish, never hold npm credentials, and never push tags (the "Agent tags" ruleset, `docs/ops/identities.md`).

The tool is `tools/release/release.ts`:

| Command | What it does |
| --- | --- |
| `bun run release:stamp` | Copies the root version into every workspace's `package.json`, private ones included, then refreshes `bun.lock` (`bun install --lockfile-only`) so it carries the new versions. Only `version` changes. Running it twice changes nothing. |
| `bun run release:check` | Fails when any workspace's version, or any `bun.lock` workspace entry's version, differs from the root's, or when a public package's `package.json` lacks the `repository` that provenance needs. CI runs it as the `versions` job of `release-checks.yml`. |
| `bun run release:authority` | Fails when any workflow other than job `release` of `release.yml` holds `id-token: write` (or `write-all`) or runs `npm`, `bun`, `pnpm` or `yarn publish`. CI runs it as the `release-authority` job. |
| `release.ts gate --tag <t> --repo <owner/name> --sha <commit>` | Decides whether a pushed tag publishes, and writes the reason to the run's step summary. |
| `release.ts pack --out <dir>` | Runs `bun pm pack` in each public package. It fails if a packed manifest still holds `workspace:`, depends on another workspace at anything but the root version, or lacks `repository.url` `git+https://github.com/xaravel/framework.git` with `repository.directory` set to the package's directory (npm provenance needs both). |
| `release.ts notes --tag <t>` | Prints the release notes. They state `Baseline Pin: laravel/framework <pin>`, read from `conformance/baseline-pin`. |

Public packages are the workspaces without `private: true`: every `@xaravel/*` package and `create-xaravel`. `skeleton` and `tools/boost-framework` are private and are never published.

## Cutting a release

**Before the first release.** The first stamp away from `0.0.0` fails XT-conformance-1 (`conformance/tests/xaravel/root-baseline.test.ts:28`) and XT-conformance-7 (`conformance/tests/xaravel/scaffold.test.ts:228`), because both pin the version to `0.0.0`. Changing those expected values needs the Maintainer's ruling first; never weaken them to make a release pass.

1. **Stamp.** On a `planning/release-v0.<n>.<p>` branch, set the root `package.json` `version` to `0.<n>.<p>`, run `bun run release:stamp`, and commit the stamped manifests together with the refreshed `bun.lock`. `bun pm pack` takes internal dependency versions from the lockfile, so a stale `bun.lock` would publish dependencies on the previous version; the `versions` check fails on one. Open a PR. The `versions` check fails if any package was missed.
2. **Merge.** The PR merges through the merge queue like any other change.
3. **Tag (Maintainer).** From the merged commit on `main`:

   ```sh
   git tag v0.<n>.<p> <merge-commit>
   git push origin v0.<n>.<p>
   ```

4. **Approve (Maintainer).** The `release` workflow's `gate` job runs on every tag. It publishes only when the tag matches `v0.<n>.<p>` (no leading zeros, no pre-release suffix) and equals `v` + the root version, when the tagged commit is on `main` (the GitHub API's compare `main...<sha>` reports `identical` or `behind`; a commit that never merged to `main` is refused, as is any API failure), and when the live `release` environment requires approval and every required reviewer is the Maintainer. Otherwise it writes `publish=false` and the reason (also shown in the run's summary), and the `release` job is skipped. When it decides to publish, the `release` job waits for approval in the `release` environment. Approve it in the run's page.
5. **Publish (CI).** The `release` job checks the versions again, packs each public package with `bun pm pack`, publishes each tarball with `npm publish "$tgz" --provenance --access public` through trusted publishing, and creates the GitHub release with the generated notes.

A failed run publishes whatever packages it reached before failing. Re-running the job is safe and finishes the remaining packages: before each `npm publish` it asks `npm view <name>@<version>` and skips a version npm already has, and it skips `gh release create` when the tag already has a GitHub release. If the cause needs a code change, fix it and release a new patch version instead; npm never accepts the same version twice.

## One-time setup (Maintainer)

### The `release` environment

GitHub creates a missing environment on first use, with no protection. `gate` refuses to publish until the environment exists and names the Maintainer as a required reviewer, so set it up before the first tag:

1. Go to the repository's Settings → Environments → New environment, and name it `release`.
2. Under **Required reviewers**, add the Maintainer's own account (`@edanisko`) and no one else. Do not add a team or a second user: `gate` refuses to publish unless every required reviewer is the Maintainer. Leave **Prevent self-review** off, since the Maintainer is the only reviewer.
3. Under **Deployment branches and tags**, choose **Selected branches and tags** and add the tag rule `v0.*`.
4. Turn off **Allow administrators to bypass configured protection rules**. `gate` refuses to publish unless the API reports `can_admins_bypass: false`; otherwise an administrator could deploy without the Maintainer's approval.
5. Add no environment secrets. Publishing uses OIDC; there is no `NPM_TOKEN` or `NODE_AUTH_TOKEN`.

### Required checks

`versions` and `release-authority` (`release-checks.yml`) are not yet required checks on `main`, so a version drift or a second publishing workflow turns a PR red but can still merge. The Maintainer adds both to the required status checks in `.github/rulesets/main.json` (and `REQUIRED_CHECKS` in `tools/ruleset/ruleset.ts`), then runs `bun run ruleset:apply`.

### Trusted publishing, per package

Each public package needs a trusted publisher on npmjs.com. For every package name (each `@xaravel/*` and `create-xaravel`), open the package's Settings → Trusted Publisher → GitHub Actions and enter:

- Organization or user: `xaravel`
- Repository: `framework`
- Workflow filename: `release.yml`
- Environment: `release`

Then, under Publishing access, choose **Require two-factor authentication and disallow tokens**, so only the trusted publisher can publish.

### Bootstrap publish of a new package name

npm attaches a trusted publisher only to a package that already exists. So every new `@xaravel/*` name, and `create-xaravel`, needs a one-time bootstrap publish by the Maintainer before CI can publish it. Agents never do this.

Bootstrap at the current root version, before the next release is stamped (for the first release, the scaffolded `0.0.0`). The next tagged release then publishes a newer version, so CI never tries to publish a version npm already has.

1. On the Maintainer's own machine, from a clean checkout of `main`, log in to npm with the account that owns the `@xaravel` scope (`npm login`, with two-factor authentication).
2. Pack the package with Bun, so `workspace:` ranges are rewritten:

   ```sh
   bun tools/release/release.ts pack --out /tmp/xaravel-bootstrap
   ```

3. Publish only the new package's tarball, by hand: `npm publish /tmp/xaravel-bootstrap/<tarball>.tgz --access public`. This first version has no provenance; every later version is published by CI with provenance.
4. Configure its trusted publisher and publishing access as above, then log out (`npm logout`) and delete the local tarballs.

Never store the npm token in the repository, in a GitHub secret, or on an agent host (AD-18).
