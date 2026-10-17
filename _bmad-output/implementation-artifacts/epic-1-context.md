# Epic 1 Context: Monorepo, guardrails & release pipeline

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stand up the `xaravel/framework` repository as a pinned Bun workspace with every package scaffolded, and wrap it in guardrails: dependency-graph, protected-path, edit-ownership and escalation checks, a hardened `main` ruleset, least-privilege workflows and a lockstep release pipeline that only CI can run. When the epic is done, the Maintainer can hand the repo to unattended Framework Agents. Those agents can push only `story/*` branches, cannot alter the grader or their own checks, and can never publish. Every later Epic builds on this baseline.

## Stories

- Story 1.1: Root workspace and repository baseline
- Story 1.2: Package scaffolder and every package scaffolded
- Story 1.3: Dependency-graph check
- Story 1.4: Protected Paths and the protected-paths check
- Story 1.5: Story manifests and edit-ownership check
- Story 1.6: Escalation and decision records
- Story 1.7: Repository ruleset, workflow permissions and dependency audit
- Story 1.8: Lockstep release workflow with provenance

## Requirements & Constraints

- **Infrastructure Stories.** Every Story in this epic is a Maintainer-approved Infrastructure Story and may touch Protected Paths. Approval is the Maintainer's Code Owner review, not a label.
- **Component and tests.** Every Story uses `component: conformance`. Each acceptance criterion (one Given block) gets at least one Xaravel Test `XT-conformance-<n>`, which declares the FR consequence or AD rule it verifies. IDs are allocated in the Story manifests and must not be renumbered. The harness does not exist until Epic 5, so these tests run under plain `bun test` for now. Epic 5 moves them onto `xaravelTest`.
- **Bun only.** Bun 1.4.3 is pinned in `.bun-version`. Every package declares `engines.bun >= 1.4`. ESM only, TypeScript strict. Node compatibility is not promised or tested. Never use Node, npm, pnpm, Jest, Vitest, ESLint or Prettier. The one exception is the npm CLI (>= 11.5.1), which is allowed in the release job only.
- **Packaging.** Every package publishes as `@xaravel/<name>`, except the Installer, which is `create-xaravel`. `tools/boost-framework` is a private workspace. All packages share one lockstep version, starting at `0.0.0`.
- **Legal.** `LICENSE` is MIT and carries both Laravel's copyright notice and Xaravel's, in the root and in every package. The README describes the project as "a TypeScript port of Laravel" and says it is not affiliated with or endorsed by Laravel Holdings Inc. No Laravel logo. The name is always Xaravel, never Jaravel.
- **Security.** A root `SECURITY.md` sets out a disclosure process. `bun audit` runs on every PR and fails on a high or critical advisory. Never commit secrets or an `APP_KEY`. Agents never hold publish credentials.
- **Agent operability.** A Story's scope, Test IDs and acceptance check must be machine-readable, and its checks must run unattended.

## Technical Decisions

- **Root config (Protected).**
  - `tsconfig.base.json`: `strict: true`, ESM resolution. No tsconfig anywhere may set `experimentalDecorators`, because Bun would silently switch to legacy decorators.
  - Root `bunfig.toml`: `env = false` at the top level, so Bun's `.env` autoload is off.
  - `.gitattributes`: LF endings for `*.jsonl` and `*.ts`.
  - `.oxlintrc.json`: a baseline config.
  - `conformance/baseline-pin`: contains `v13.37.0`.
  - Workspaces: `packages/*`, `skeleton`, `installer`, `tools/*`.
- **Package edges.** Upstream `composer.json` `require` entries for `illuminate/*` become `workspace:*` dependencies. `suggest` entries become optional peerDependencies. Every package may also depend on `@xaravel/runtime` and `@xaravel/contracts`. Foundation has no Upstream `composer.json`, so its edges come from its code imports. Foundation may import only Components of its own or earlier Phases.
- **Grader isolation.** Graded packages may take `@xaravel/assert` and `@xaravel/mockery` only as devDependencies. There are two exceptions: `@xaravel/testing` may depend on mockery at runtime, and `@xaravel/support` takes mockery as an optional peer.
- **Test edges.** Test files form their own `tsc` project. Their dev edges to grader packages and to same-or-earlier-Phase packages are excluded from the cycle check.
- **Graph check.** It fails on cycles and on undeclared static imports. A declared but unused dependency is fine.
- **Scaffolding.** Each package is scaffolded from the committed table `tools/scaffold/packages.jsonl`, which records Phase, `require` and `suggest`. Each package gets:
  - a `package.json` with named exports only and no `sideEffects: false`, because class files self-register;
  - a generated `tsconfig.json` that extends the base config;
  - `src/`, `tests/ported/`, `tests/xaravel/`, `docs/`, `README.md` and `LICENSE`.

  Each package is its own `tsc -b` project reference, with `types` limited to its dependencies. CI fails, naming the package, if a package `tsconfig.json` differs from its generated form. After scaffolding, Stories may edit their own package's `package.json`.
- **Protected Paths.** The list `conformance/protected-paths` is itself Protected and is mirrored into `CODEOWNERS` with the Maintainer as owner. It covers:
  - everything in `conformance/` except `expectations/`, `escalations/`, `oracle-requests/` and `fixtures/` (fixtures are protected by signature, and are also excluded from CODEOWNERS);
  - `decisions/`, `PORTING.md`, `stories/`, `.github/` and `tools/`;
  - `packages/assert` and `packages/mockery`, plus `packages/contracts` marked `after-phase:1`;
  - the root `package.json`, `bun.lock`, root `bunfig.toml`, root `tsconfig*.json`, `tsconfig.base.json`, `.oxlintrc.json` and `.gitattributes`;
  - `AGENTS.md` and `**/CLAUDE.md` (no `CLAUDE.md` may exist).
- **Checks a PR cannot change.** The required checks run from default-branch workflows (`pull_request_target`). They read the PR diff as data and never check out PR code.
- **Story manifests.** Manifests are `stories/<story-id>.md`, with frontmatter `story_id`, `epic`, `component`, `status`, and `test_ids` and/or `xaravel_test_ids` (at least one is required). The ownership check:
  - reads the manifest from the base branch, never from the PR;
  - fails when the branch `story/<id>` has no manifest on base;
  - allows only `packages/<component>/**`, `conformance/expectations/<component>/**`, `conformance/oracle-requests/<story-id>.jsonl` and `conformance/escalations/ESC-<story-id>-*.md`;
  - fails when two open Stories list the same Test ID.
- **Bot PRs.** `bot/*` PRs that change only Expectations `status` values are exempt from the ownership check, and bots raise `ESC-bot-<n>` Escalations.
- **Escalations.** An Escalation is `conformance/escalations/ESC-<story-id>-<n>.md`, with frontmatter `test_ids`, `trigger`, `proposed` and `evidence`. The file name must match the Story ID of the PR that adds it. `trigger` is one of:
  - a new or changed divergence is needed;
  - a Protected Path change is needed;
  - an Upstream test looks wrong but the Oracle passes it;
  - the test is flaky over 3 runs (quarantine);
  - a `php-only` skip is proposed;
  - an open question blocks the work;
  - a contract is missing or changed after Phase 1.

  The ruling is `decisions/ESC-<id>.md`, with `decision: approved | rejected` and the Maintainer's rationale. `escalationStatus(id)` returns `open` until the decision file exists. Approvals exist only in the repository.
- **Ruleset and permissions.** The committed ruleset `.github/rulesets/main.json` must match the live one, checked by `bun run ruleset:verify`. It requires:
  - the `protected-paths` and `ownership` checks;
  - linear history;
  - the merge queue;
  - no bypass actor other than the Maintainer.

  Every workflow's top-level permissions are `contents: read`. Write scopes appear only in jobs on the allow-list: oracle, dashboard and release. The agent push identity is limited to `story/*`, which a script verifies, and the setup is documented in `docs/ops/identities.md`. An `oxlint-disable` of any rule the architecture names fails CI.
- **Release.**
  - `bun run release:stamp` copies the root version into every package, and CI fails if any package's version differs.
  - The workflow runs only on a `v0.<n>.<p>` tag that equals the root version, in the protected `release` environment, which needs the Maintainer's approval. Any other tag exits without publishing and says why.
  - For each public package it runs `bun pm pack`, then `npm publish <tgz> --provenance` through trusted publishing (`id-token: write`). No packed manifest may contain `workspace:`.
  - Release notes state the Baseline Pin, read from `conformance/baseline-pin`.
  - No other workflow may have `id-token: write` or run `npm publish`.
  - A new `@xaravel/*` name gets a one-time bootstrap publish by the Maintainer, documented in `docs/ops/release.md`.
- **Data files.** JSONL, UTF-8, LF line endings, sorted, one record per line.

## Cross-Story Dependencies

- Story 1.1's root config and workspace layout come before everything else. Story 1.2's scaffolded packages and package table feed Story 1.3's graph check and Story 1.5's component paths.
- Story 1.4's protected list and checks, Story 1.5's `ownership` check and Story 1.8's release workflow are required or verified by Story 1.7's ruleset and permissions checks. Story 1.6's `escalationStatus` is a library that later checks use.
- Later epics:
  - Story 1.2 needs Upstream `composer.json` data at the Pin, but the read-only Upstream snapshot (`conformance/upstream/`) only arrives later, in Epic 2.
  - Epic 3 relies on Story 1.4's check continuing to pass with `conformance/fixtures/` unowned.
  - Epic 5 delivers the harness and moves Epic 1's tests onto `xaravelTest`. It uses Story 1.6's escalation status, and adds `ratchet` to Story 1.7's required checks.
  - Epic 6 adds the lint rules.
  - Phase 1 (Epic 9 onward) builds into the packages scaffolded here.
