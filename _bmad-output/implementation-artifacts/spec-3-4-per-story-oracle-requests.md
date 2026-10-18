---
title: 'Story 3.4: Per-Story Oracle requests'
type: 'feature'
created: '2026-10-17'
baseline_revision: 'd9dce1dad1c937316da9b38d4125e995ea485065'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'stories/3.4.md'
  - 'docs/ops/oracle.md'
  - 'docs/ops/identities.md'
warnings: [oversized]
deferred:
  - summary: >-
      The story job's commit and failure paths (blob/tree/commit/ref PATCH, 404 read, unchanged tree, path refusal) are verified only by their YAML text, never executed.
    evidence: |-
      XT-conformance-77/78 assert toContain on the step's run text; no test runs the script against a stand-in gh. Closing it means moving the script into a testable tools/oracle command.
    location: >-
      .github/workflows/oracle.yml story job
    severity: medium
  - summary: >-
      evaluate.php's XT-ID branch (and every evaluate.php test) runs only where PHP 8.5.11 and /tmp/xaravel-inv/framework exist, never in CI.
    evidence: |-
      phpTest skips without the local install; ci.yml's php-fixtures job runs only php-scripts.test.ts. Pre-existing for the batch's evaluate.php tests.
    location: >-
      .github/workflows/ci.yml
    severity: medium
  - summary: >-
      A Story may delete a batch fixture of its own Component, and the verifier never requires a fixture for every non-listed request.
    evidence: |-
      allowedPath accepts any conformance/fixtures/<c>/<sha>.json change; verifyFixtures checks only existing files. Settle by checking whether the Epic 4/5 grader fails (not passes) a Differential Test whose fixture is missing.
    location: >-
      tools/ownership/ownership.ts allowedPath; tools/oracle/verify.ts
    severity: medium (unverified)
  - summary: >-
      A nondeterministic per-Story request can merge with no fixture and no record when the story job is not a required check.
    evidence: |-
      The job fails on it, but required checks are Epic 1 retro item 2 (waiting on the Maintainer); the batch writes an ESC-bot Escalation, the story job does not.
    location: >-
      .github/rulesets/main.json
    severity: medium
  - summary: >-
      Pest Test IDs, and XT validation-message requests, have no Upstream class context in evaluate.php, so they evaluate to an error output that is signed as the fixture.
    evidence: |-
      testTarget throws for Pest IDs (fatal output); BareTestCase has no getIlluminateArrayTranslator(). The batch signs error outputs the same way. Settle by deciding whether the image installs the Pest suites or the judge rejects such requests.
    location: >-
      tools/oracle/evaluate.php testTarget
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The Oracle batch covers only the mechanically extracted Differential set. A Story that needs expected values for inputs the batch missed (an Xaravel Differential suite, a missed dataset) has no way to get signed fixtures without the Maintainer (FR-6, AD-15, spine line 351).

**Approach:** A Story commits `conformance/oracle-requests/<story-id>.jsonl`. A new `story` job in `oracle.yml` runs on the Story PR under `pull_request_target`, from main's code only. It validates each request against the schema and the base manifest's `test_ids` / `xaravel_test_ids`, evaluates the accepted ones twice in the Oracle image, signs them, commits the fixtures to the Story branch as the `xaravel-oracle` GitHub App, and comments the rejections. Story 3.3's verifier learns the per-Story request files, so CI verifies those fixtures and fails an unowned committed request.

## Boundaries & Constraints

**Always:**
- Tool `tools/oracle/story.ts` (`bun run oracle:story`): `check <story-id>` and `generate <story-id>`, both with `--root`, `--requests <file>` (default `<root>/conformance/oracle-requests/<id>.jsonl`), `--report <file>` (markdown comment body); `generate` adds `--out <dir>` (default `<root>/conformance/fixtures`), `--image <ref> | --local <dir> [--php <bin>]`, key only from env `ORACLE_SIGNING_KEY` (checked against `oracle.pub` via `signingKey`). Exit 0 all accepted, 1 any rejection or failure, 2 usage. Same CLI shape as the other tools.
- The manifest is `stories/<id>.md` under `--root` (in CI: main's checkout, never the PR's). Missing or invalid manifest fails closed.
- A request line is rejected, with a reason naming `<file>:<line>`, when: malformed / not canonical / schema error / wrong `sha256` (Story 3.1's `validateRequest` + `renderRequest`); its `id` is not in the manifest's `test_ids` ∪ `xaravel_test_ids` (`id <id> is not owned by Story <id>`); its `sha256` repeats an earlier line; its `sha256` is a batch request (`conformance/oracle/requests/`); it is listed in `nondeterminism.jsonl`. Other lines still run. A file that does not end with LF rejects nothing extra: its last line is judged as is, plus one file-level problem.
- `generate` evaluates the accepted requests twice with evaluate.php (image: `runInImage` with the file mounted read-only; same mounts/command shape as the batch), and a request whose two outputs differ gets no fixture and is rejected (`differs between two evaluations`). Each other request gets `<out>/<component>/<sha256>.json` (manifest `component`), signed exactly as the batch (`signFixture`/`renderFixture`). It writes only those files.
- `evaluate.php`: an Xaravel Test ID (`XT-<component>-<n>`) has no Upstream class, so it runs bound to a bare `PHPUnit\Framework\TestCase` in the global namespace (`blade-render`: the bare Testbench case). PHPUnit IDs unchanged.
- Verifier (`verify.ts` `committedRequests`): also reads every `conformance/oracle-requests/*.jsonl` with its manifest; each rejection above (except determinism) is a violation line prefixed `<path>:<line>`; a file without a manifest is a violation. Accepted requests are valid fixture sources for the manifest's Component directory. A request in two per-Story files is a violation.
- Batch (`fixtures.ts`): never deletes a fixture whose `sha256` is an accepted per-Story request of that Component directory. Otherwise unchanged.
- Ownership `allowedPath`: also allows `conformance/fixtures/<component>/<64 hex>.json` for the Story's own Component (spine 351: the Oracle commits them to the Story branch; they are protected by signature).
- Workflow job `oracle.yml#story`: trigger `pull_request_target` (types opened, synchronize, reopened; paths `conformance/oracle-requests/**`); runs only for same-repo `story/*` heads; checks out the base commit with `persist-credentials: false`; never checks out, installs or runs PR code; reads the PR's request file from the API at the head SHA as data; GITHUB_TOKEN read-only (`contents: read`, `packages: read`, `pull-requests: read`); `environment: oracle`; pulls the image `ghcr.io/<owner>/xaravel-oracle:<tag>` (tag from main's `oracle:tag`); App token from `actions/create-github-app-token` (pinned SHA) with `vars.XARAVEL_ORACLE_APP_ID` / `secrets.XARAVEL_ORACLE_APP_KEY`; commits only `conformance/fixtures/` changes to the head branch as the App's bot user, pushing to the exact head SHA's branch (fast-forward only); comments the report when a request was rejected or a commit was made; fails when any request was rejected. `workflows:check` stays clean.

**Never:** No change to the fixture format, the signature, the batch's evaluation or its request files. No new dependency. No edit of `conformance/protected-paths`, `.github/CODEOWNERS`, `tools/protected-paths/`, `.github/workflows/ownership.yml`, the ruleset files, the spine, SPEC, PRD or `epics.md`. No re-signing of per-Story fixtures by the batch and no staleness check against the Pin (deferred, as in 3.3). No live App creation or secret handling (Maintainer-run steps, documented).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | 2 owned requests (PHPUnit ID, XT ID) | 2 signed fixtures under `<component>/`, exit 0, report lists them | — |
| Unowned ID | 1 owned + 1 unowned | owned gets fixture; unowned named in stderr and report; exit 1 | others still run |
| Bad line | malformed / wrong hash / batch duplicate / repeated / listed | each named with reason, not evaluated | exit 1 |
| Nondeterministic | outputs differ between passes | no fixture, rejected `differs between two evaluations` | exit 1 |
| No manifest / no key / pub mismatch | — | exit 1 naming the cause, nothing written | fail closed |
| Verifier, story fixture | committed story file + its fixture | verifies; unowned committed request → violation; fixture in another Component dir → violation | — |
| Batch rerun | story fixture in `support/` | kept | — |

</intent-contract>

## Code Map

- `tools/oracle/fixtures.ts` -- reuse `signingKey` (171), `signFixture`/`renderFixture` (80–88), `readNondeterminism` (308), `readCommittedRequests` (216, batch only), `parsePass` (364), `UsageError`/`parseOptions` CLI model. `evaluateOnce` (334) is private and hard-wired to `REQUESTS_DIR`: generalise it to take the request directory + file names (batch behaviour byte-identical). Stray-deletion loops at 571 and 584–593: skip accepted per-Story shas.
- `tools/oracle/request.ts` -- `validateRequest` (348), `renderRequest` (161), `readSchema` (195), `compareUnits`, `REQUESTS_DIR`. `parseRequests` throws on the first bad line, so per-line judgement needs its own loop.
- `tools/oracle/verify.ts` -- `committedRequests` (43) is the one lookup to extend; `verifyFixtures` (100) uses `components`/`requests`; keep existing message texts for batch-only cases (XT-74 pins them).
- `tools/oracle/evaluate.php` -- `testTarget` (250), `BareTestbenchCase` (410).
- `tools/ownership/ownership.ts` -- `parseManifest` (118, returns `{manifest, violations}`), `STORIES_DIR`, `allowedPath` (319) + header comment (34–38).
- `tools/oracle/oracle.ts` -- `runInImage`, `IMAGE_UPSTREAM_DIR`, `PHP_VERSION`; `tools/inventory/inventory.ts` `oracleImage`, `checkLocalCopy`, `ImageRunner`.
- `.github/workflows/oracle.yml` -- add `pull_request_target` trigger + `story` job; header comment. `build`/`oracle`/`determinism` `if:`s already exclude the new event.
- `tools/workflow-permissions/workflow-permissions.ts` -- read-only scopes pass without allow-list change.
- `conformance/tests/xaravel/oracle-fixtures.test.ts` -- test model to copy (`keyPair`, stand-in runner, `phpTest` with `/tmp/xaravel-inv/framework`).
- `docs/ops/oracle.md` -- add "Per-Story requests" section; `docs/ops/identities.md` -- App and its secret in the Secrets table, Maintainer setup steps.
- `package.json` -- script `oracle:story`.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/story-requests.ts` -- pure reader/judge: `judgeStoryRequests(text, file, manifest, schema, batch, listed)` → `{accepted, rejections}`; `readStoryRequestFiles(root, …)` for all committed files. No import of fixtures.ts (no cycle).
- `tools/oracle/story.ts` -- CLI `check` / `generate` per Boundaries, report rendering.
- `tools/oracle/fixtures.ts` -- generalised `evaluateOnce`, export it; keep per-Story fixtures.
- `tools/oracle/verify.ts` -- per-Story files in the lookup.
- `tools/oracle/evaluate.php` -- XT IDs on the bare case.
- `tools/ownership/ownership.ts` -- `allowedPath` fixture rule, comment.
- `.github/workflows/oracle.yml` -- `story` job.
- `package.json`, `docs/ops/oracle.md`, `docs/ops/identities.md`.
- `conformance/tests/xaravel/oracle-story.test.ts` -- XT-conformance-77 (generate: owned PHPUnit + XT requests → signed fixtures in the manifest Component that verify with oracle.pub; image mounts/command; key from env only; determinism rejection; real-PHP run of an XT `php-expr` request through evaluate.php when the local install exists; `oracle.yml#story` shape: trigger, guards, base checkout, no PR code run, read-only token, environment, pinned App token action, commit step, fail on rejection), XT-conformance-78 (unowned / malformed / batch duplicate / repeated / listed lines rejected with reasons on stderr and in the report, others still written, exit 1; `check` mode same judgement without evaluating; workflow comments the report with the App token), XT-conformance-79 (story-generated fixtures pass `verifyFixtures` on a root with the committed file; unowned committed request, missing manifest, wrong Component dir each a violation; batch rerun keeps story fixtures; `allowedPath` accepts own-Component fixture paths only; `bun run oracle:verify-fixtures` on the repo still exits 0).

**Acceptance Criteria:**
- Given a Story PR that adds `conformance/oracle-requests/<story-id>.jsonl`, when the Oracle workflow runs on the PR, then it validates every request against the schema and the Story's `test_ids` / `xaravel_test_ids`, runs them in the Oracle image, and commits signed fixtures to the Story branch as the `xaravel-oracle` GitHub App.
- Given a request whose ID is not owned by the Story, when the workflow runs, then it rejects that request and comments with the reason.
- Given the committed fixtures, when Story 3.3's check runs, then they verify.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 25 findings — high 0, medium 6, low 16, false 0, maybe-false 3
- findings:
  - `[low]` `[patch]` (verification) temp request dir/file chmod for image user 1001 untested — stand-in now asserts the mount dir and file are other-readable at call time.
  - `[medium]` `[defer]` (verification) the `story` job's commit step is verified only by its YAML text — closing it means moving the script into a testable tool; live path is Maintainer-run (Design Notes).
  - `[medium]` `[defer]` (verification) evaluate.php's XT branch runs only where the local install exists, never in CI — pre-existing: the batch's evaluate.php tests share the precondition; CI's `php-fixtures` job runs only php-scripts.test.ts.
  - `[low]` `[patch]` (verification, other) comment step runs after a failed pull with no token and no report — `if:` now also needs `generate.outputs.status != ''` and a non-empty App token.
  - `[medium]` `[patch]` (blind) `generate` ignores other Stories' files, so it signs a request already accepted elsewhere and verify then fails — `story.ts` now rejects such a line naming the other file.
  - `[low]` `[reject]` (blind) which of two files owns a shared request depends on name sort — the PR still fails either way (only the message names the other file), and with the patch above generate already rejects the newcomer; reordering semantics is more than a direct fix.
  - `[low]` `[patch]` (blind) old fixtures stay after a request line changes — verify names the stale file and the Story may delete it (allowed path); docs now say so.
  - `[maybe-false]` `[defer]` (blind) `allowedPath` lets a Story delete a batch fixture of its Component and the verifier never requires completeness — would be medium; settle by checking whether the Epic 4/5 grader fails (not passes) a Differential Test with no fixture.
  - `[low]` `[reject]` (blind) a later `oracle:extract` or listing entry can make a merged per-Story line a violation on main — rare (a Story requests what the batch later extracts), and the fix (tolerate or prune across tools) is not a direct correction.
  - `[medium]` `[defer]` (blind) a nondeterministic per-Story request can merge without record if the `story` check is not required — pre-existing gating: required checks are Epic 1 retro item 2, waiting on the Maintainer; the job itself fails.
  - `[low]` `[patch]` (blind) comment step breaks after an earlier failure — same root and fix as the verification "other" row.
  - `[low]` `[patch]` (blind) every rerun with rejections posts a new comment — now `gh pr comment --edit-last --create-if-none`.
  - `[low]` `[reject]` (blind) the App's commit triggers a full re-evaluation where a flaky request could fail — a request that differs across runs but not within one is rare; skipping verified fixtures adds a branch.
  - `[medium]` `[defer]` (blind) workflow failure paths (404, skipped generate, path refusal, unchanged tree) untested — same root as the commit-step deferral.
  - `[low]` `[reject]` (blind) unused `file` parameter, duplicated `STORY_ID` regex, recomputed total — cosmetic; no caller diverges today.
  - `[low]` `[reject]` (blind) verifier and generator read the manifest from different commits — Story PRs cannot edit `stories/`; a manifest change on main is a Maintainer action that can re-run the job.
  - `[low]` `[patch]` (edge) force-push to an ancestor during the run lets the `force: false` PATCH fast-forward over it — commit step now checks the ref still equals the head SHA before the PATCH.
  - `[low]` `[patch]` (edge) comment step after a failed pull — same group as above.
  - `[medium]` `[patch]` (edge) generate does not check other Story files — same group as the blind row.
  - `[low]` `[reject]` (edge) name-sort ownership flip — same as the blind row.
  - `[maybe-false]` `[defer]` (edge) a Pest Test ID evaluates to a fatal error that is signed as its fixture — the batch signs error outputs too; would be medium; settle by deciding whether the image should install the Pest suites or the judge should reject non-PHPUnit, non-XT IDs.
  - `[maybe-false]` `[defer]` (edge) an XT `validation-message` request has no `getIlluminateArrayTranslator()` on the bare case and signs a setup error — same root as the Pest row (no Upstream class to supply context); would be medium.
  - `[low]` `[patch]` (edge) a manifest with `component: generators` would write into the Protected generators dir — `story.ts` now fails closed.
  - `[low]` `[patch]` (edge) duplicate comments on rerun — same as the blind row.
  - `[low]` `[reject]` (intent) acceptance lives on the live GitHub surface; the diff exercises the tool in-process and the workflow statically — reading R2 is the one the spec and the Maintainer-run steps (lessons, epic 1) call for; reported as unverified live, not as met.

## Design Notes

`pull_request_target` runs main's copy of the workflow and tools, so a PR cannot change the code that holds the signing key; the PR contributes only its request file, read through the API as data, and the manifest comes from main (as `ownership.yml` does). Request PHP runs only inside the networkless container; the key stays on the host. A request can still make PHP compute anything, which is why Fidelity Review checks each request against Upstream (spine 351).

The live path (App, its secret, environment rule for `pull_request_target`, a real run) is Maintainer-run; tests verify the job's shape and the tool end to end with a stand-in runner and a test key. Report it as unverified live.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle-story.test.ts` -- all pass (PHP part runs with the local install)
- `bun test` -- all pass
- `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run oracle:verify-fixtures`, `bun run ownership:check`, `bun run protected-paths:codeowners --check` -- clean

## Auto Run Result

Run 2026-10-17. Status: done.

- **Summary.** A Story commits `conformance/oracle-requests/<story-id>.jsonl`. The new `oracle.yml#story` job runs on its PR under `pull_request_target`, using main's code only. It reads the request file through the API as data and judges each line against the schema and the base manifest's `test_ids` / `xaravel_test_ids` (`bun run oracle:story`). It evaluates the accepted lines twice in the pulled Oracle image and signs them with `ORACLE_SIGNING_KEY`. As the `xaravel-oracle` App it commits the fixtures to the Story branch (fast-forward from the head SHA only) and comments the report. Any rejection fails the job. Story 3.3's verifier now also reads per-Story files: an unowned or invalid committed request is a CI violation, and accepted ones are valid fixture sources in the manifest's Component. The batch keeps per-Story fixtures. evaluate.php runs `XT-` IDs on a bare PHPUnit TestCase. Ownership allows a Story's own-Component fixture paths (spine "New inputs").
- **Files.**
  - `tools/oracle/story-requests.ts`: per-line judge and reader for committed per-Story files.
  - `tools/oracle/story.ts`: `check` / `generate` CLI and markdown report.
  - `tools/oracle/fixtures.ts`: `evaluateOnce` generalised and exported; the batch keeps per-Story fixtures.
  - `tools/oracle/verify.ts`: per-Story files added to the lookup.
  - `tools/oracle/evaluate.php`: `XT-` IDs bound to `BareTestCase`.
  - `tools/ownership/ownership.ts`: `allowedPath` accepts `conformance/fixtures/<own c>/<sha>.json`.
  - `.github/workflows/oracle.yml`: `pull_request_target` trigger and the `story` job.
  - `package.json`: the `oracle:story` script.
  - `docs/ops/oracle.md`, `docs/ops/identities.md`: the per-Story section, the App secret and variable, and Maintainer steps.
  - `conformance/tests/xaravel/oracle-story.test.ts`: XT-conformance-77/78/79.
  - `conformance/tests/xaravel/oracle.test.ts`: XT-conformance-43's pinned workflow shape now expects the new trigger, the `story` job and its secrets. No assertion was removed without an exact replacement, and the other jobs' `if:`s are asserted to exclude the new event.
- **Review.** 25 findings:
  - 10 rows patched (7 entries). One entry is medium: generate now rejects a request already accepted in another Story's file. The six low entries: a comment-step guard, `--edit-last`, the ref check before the PATCH, failing closed on a `generators` Component, the mount-mode test, and the docs sentence on stale fixtures.
  - 6 rows deferred (5 items in frontmatter).
  - 9 rows rejected; each reason is in the triage log.
- **Follow-up review: not recommended.** Patched entries: 0 high, 1 medium, 6 low.
- **Verification.** `bun test`: 112 pass, 0 fail. `oracle-story.test.ts`: 12 pass, and its real-PHP tests ran against `/tmp/xaravel-inv/framework`. `typecheck`, `lint`, `workflows:check`, `oracle:verify-fixtures` (1834 OK), `ownership:check`, `protected-paths:codeowners --check`, `scaffold:check`, `graph:check` and `escalations:check` are clean.
- **Residual risks.**
  - **The live path has not run.** It needs these Maintainer-run steps: create and install the `xaravel-oracle` App, and add `XARAVEL_ORACLE_APP_ID` and `XARAVEL_ORACLE_APP_KEY` to the `oracle` environment. It also needs confirmation that the environment's main-only rule admits a `pull_request_target` run, and a first real Story PR.
  - **The commit step and the evaluate.php XT path are not checked in CI.** The commit step is checked only statically. The XT path runs only where the local install exists.
  - **The action input.** `actions/create-github-app-token` v3.3.0 marks `app-id` deprecated in favour of `client-id`, so runs will show a warning.
