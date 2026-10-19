---
title: 'Story 5.8: Promotion and quarantine bots'
type: 'feature'
created: '2026-10-19'
baseline_revision: '8e70111d8bac7023ff9f65fc727735c221939510'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/AGENTS.md'
warnings: [oversized]
deferred:
  - summary: >-
      The bot identity rule checks only the PR's opener, not who authored the commits on the bot branch.
    evidence: |-
      botRules reads pull.user only. While agent-push is disabled (all of Phase 0), any identity with push access can add commits to an open bot/* PR, within the value rule. Settling this needs a live check of how App-created Git-data commits attribute their author (GET /pulls/<n>/commits).
    location: >-
      tools/ownership/ownership.ts botRules
    severity: medium (unverified)
  - summary: >-
      bots.yml, App-token minting, workflow_run chaining, the artifact handoff and real bot PR creation have never run live.
    evidence: |-
      The tests cover tools/bots against a fake GitHub API, plus the YAML shape. The first live run needs the Maintainer to create the xaravel-bot App, the bot environment, its variable and secret, and to rule on ESC-5.8-1 before agent-push is re-enabled.
    location: >-
      .github/workflows/bots.yml
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:**
- A flaky test on `main` turns the Ratchet red for every agent, and nothing quarantines it.
- An unexpected pass that no open Story owns stays a warning forever, and nothing promotes it.
- The ownership check exempts `bot/*` PRs by path only. It does not check the values they change or the identity that opened them.
- The `ESC-bot-<n>.md` files the Oracle `oracle` and `determinism` jobs write are only uploaded as workflow artifacts (Epic 3 retro S6).

**Approach:**
- Add a `tools/bots` tool with three commands:
  - `detect` runs the harness on `main`, reruns each differing Test ID × Variant 3 times, and writes a plan of quarantines and promotions.
  - `collect` turns the Oracle's Escalation artifacts into a plan.
  - `apply` turns a plan into `bot/*` branches and PRs through the GitHub API, as the `xaravel-bot` App.
- A new `bots.yml` workflow runs `detect` and `collect` without secrets, and runs `apply` in a separate job that holds the App token.
- `tools/ownership` gains the value-level bot rule (status-only line changes) and the App-identity rule.

## Boundaries & Constraints

**Always:**
- This is Maintainer-approved Phase 0 Infrastructure work. It may edit `tools/`, `.github/`, `conformance/tests/`, `conformance/README.md`, `docs/ops/`, root `package.json`, `tsconfig.json`, `bun.lock`, its own Escalations and `_bmad-output/implementation-artifacts/`.
- **"Status values" means a line's status triple: `status`, `reason`, `escalation`.** A bot never adds, removes or moves a line, and never changes `id`, `variant` or `adapted`.
  - A **promotion** sets `status: "pass"` and `reason: null`, and keeps `escalation`.
  - A **quarantine** sets `status: "quarantined"`, `reason: null`, and `escalation` to the `ESC-bot-<n>` that the same PR adds.
- **Detect.** `bun tools/bots/bots.ts detect --root <dir> --ref <r> --out <file> [--runs <k>]` (default `--runs 3`):
  1. Runs `runHarness(root, {env})` in full and takes every Difference with a concrete id (not `-`).
  2. Reruns those ids `k` times with `runHarness(root, {env, ids:[…]})`. A glob that matches extra ids is harmless, because only candidate keys are read.
  3. A key's observations are the first run plus each rerun. Each observation is `match` or the rerun Difference's kind; a key missing from a run's results is `missing`.
  4. Classifies each key:
     - **Mixed** (both `match` and a difference): quarantine, when the line's status is `pass` or `fail-known`. Any other status gets no proposal; print it.
     - **Unexpected pass on every run**, and no open Story owns the id (`openManifests`): promote. If an open Story owns it, make no proposal.
     - **Unexpected failure on every run:** no proposal. This is a real failure, and the Ratchet stays red.
  5. Writes the plan JSON (shape in Design Notes). Prints `BOT-QUARANTINE <id> [<v>] runs=<o1,o2,…>`, `BOT-PROMOTE <id> [<v>]` and `BOT-NONE <id> [<v>] <why>` lines, then `BOTS ref=<r> quarantine=<q> promote=<p> none=<n>`.
  6. Exits 0. It exits 1 only on a thrown error and 2 on a usage error.
  7. It caps candidates at 50 keys, sorted by key. Above the cap it proposes nothing and prints `BOTS-CAP <n> candidates exceed 50; no proposals`: a mass failure is not flakiness.
- **Collect.** `bots.ts collect --from <dir> --source <url> --out <file>` reads each `ESC-bot-*.md` under `<dir>`, at any depth. Each file must pass `parseEscalation`; otherwise exit 1 naming it. It writes a plan with one `escalation` proposal per file.
- **Apply.** `bots.ts apply --plan <file> --repo <owner/name>` uses `GH_TOKEN` and `GITHUB_API_URL`, with the `GitHub` client from `tools/protected-paths`.
  - **Base:** `main`'s tip sha.
  - **Branch per proposal:**
    - quarantine: `bot/quarantine-<sha8(id [variant])>`, one per key;
    - promotion: one branch `bot/promote-<sha8(sorted keys)>` per run;
    - Escalations: `bot/oracle-esc-<sha8(file text)>`.
    - If the branch already exists, skip it with `BOT-SKIP <branch> exists`.
  - **Line check:** it reads the shard at the base and requires the planned `before` line text. Otherwise it skips with `BOT-SKIP <branch> stale`.
  - **Escalation numbering:** each new `ESC-bot-<n>` is renumbered to one past the maximum over the base's `conformance/escalations/` and the files of every open PR whose head starts with `bot/`. It rewrites the frontmatter-free `# ESC-bot-<old>:` heading and the quarantined line's `escalation` to match.
  - **Self-check:** before any write, it runs ownership's exported bot value rule on the proposed change, and refuses on any violation.
  - **Write:** it writes through the Git data API (blobs, a tree with `base_tree`, a commit, then creating the ref). It opens a PR to `main` whose body gives the evidence, then prints `BOT-PR <url>`.
  - **Exit:** 0, or 1 if any write failed.
- **Shard text** is rebuilt by replacing exactly the one line with `serialiseLine(...)` (`tools/expectations/expectations.ts:173`). Every other byte is kept.
- **Quarantine Escalation:** `trigger: flaky`, `test_ids: [<id>]`, `proposed` (fix the cause, then return the line to its previous status), and `evidence`. The evidence is each observation, plus the ref, the head sha and the run URL (`$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID`, or `local`). It must pass `parseEscalation`.
- **Ownership (`tools/ownership/ownership.ts`):**
  - `OwnershipPrInput` gains `author?: {login: string; type: string} | null`. `pr()` fills it from `GET /pulls/<n>` `user`.
  - On `bot/*`, after the existing path rule, add:
    - `bot identity:` unless the author is `{type: "Bot", login: BOT_LOGIN}`, where `BOT_LOGIN = "xaravel-bot[bot]"` is exported.
    - The value rule, exported as `botValueProblems(base, head, addedBotEscalations)`. It works over the changed shards' parsed lines and reports `bot value: …` violations for:
      - a shard added, removed or renamed;
      - a key set that differs between base and head;
      - a changed `id`, `variant` or `adapted`;
      - a new status outside `pass` and `quarantined`;
      - a non-null `reason`;
      - an `escalation` that changed under `pass`;
      - under `quarantined`, an `escalation` that is not an `ESC-bot-<n>` this PR adds.
  - `contentReads` returns the base and head reads of the changed `conformance/expectations/**` shards for `bot/` refs. Unreadable content fails closed, as today.
  - Update the OK text at :949 to `passed the bot rules (path, identity, status-only values)`.
- **`bots.yml`** (new), `name: bots`, top-level `permissions: contents: read`, actions pinned to the SHAs already used:
  - **Triggers:**
    - `workflow_run` of `ratchet`, `nightly` and `oracle`, `types: [completed]`, `branches: [main]`;
    - `workflow_dispatch`.
  - **Job `detect`:**
    - Runs if the event is dispatch, or a `ratchet`/`nightly` run whose `event` is `push`, `schedule` or `workflow_dispatch`.
    - Holds no secret, no environment and `contents: read` only.
    - Has `ratchet.yml`'s `postgres:18` and `redis:8.10.2` services and env, plus `CI=true`.
    - Checks out `workflow_run.head_sha` (or `github.sha`) and runs `bun install --frozen-lockfile`, then `bots.ts detect --root . --ref main --out .cache/bots/plan.json`.
    - Uploads the artifact `bot-plan`.
  - **Job `collect`:**
    - Runs if it is an `oracle` run whose `event` is `push` or `schedule`.
    - Permissions are `contents: read` and `actions: read`.
    - Runs `gh run download <workflow_run.id> -n oracle-escalation -n oracle-determinism -D .cache/bots/esc`, with `GH_TOKEN: github.token`. A missing artifact is not an error.
    - Then `collect`, and uploads `bot-plan`.
  - **Job `open`:**
    - `needs: [detect, collect]`, `if: always() && (needs.detect.result == 'success' || needs.collect.result == 'success')`, `environment: bot`, `contents: read` and `actions: read`.
    - Checks out `main` with `persist-credentials: false` and installs.
    - Runs `gh run download ${{ github.run_id }} -n bot-plan` with `github.token`.
    - Mints the token with `actions/create-github-app-token` (the oracle.yml pin), with `app-id: ${{ vars.XARAVEL_BOT_APP_ID }}`, `private-key: ${{ secrets.XARAVEL_BOT_APP_KEY }}`, `permission-contents: write` and `permission-pull-requests: write`.
    - Runs `bots.ts apply` with that token as `GH_TOKEN`.
    - It never runs a test or the harness.
- **Tests** use `bun:test`, named `XT-conformance-<n>: … (AD-16, AD-28)`, in `conformance/tests/xaravel/bots.test.ts`:
  - **XT-conformance-123 (AC1):**
    - A real-harness fixture root (the `ratchet.test.ts` pattern), whose Ported Test alternates pass and fail through a counter file under the root, gives a quarantine proposal. `apply`, against a `Bun.serve` fake GitHub, then creates a `bot/quarantine-…` branch whose shard line is `quarantined` with `escalation` `ESC-bot-<n>`, plus a valid flaky `ESC-bot-<n>.md`. The fake has an open bot PR holding `ESC-bot-<n-1>`, which proves the renumbering.
    - A test that fails consistently gives no proposal.
  - **XT-conformance-124 (AC2):** an unowned `skip` line that passes on every run gives a `bot/promote-…` PR with `pass`/`null`. A pass owned by an open manifest gives none.
  - **XT-conformance-125 (AC3):** `evaluatePr` on `bot/*`:
    - a promotion and a quarantine change give no violations;
    - each of these is a violation: an added or removed line, `adapted` changed, a reason left set, status `skip`, a quarantine without its ESC in the PR, a non-App author, and a non-expectations path (the existing path rule);
    - `runPr` through the fake API reads `user`;
    - plus `bots.yml` shape: no `secrets.` outside `open`, `open` runs no harness, `detect` holds no environment.
  - **XT-conformance-189 (AC4):** `collect` over a dir holding an `ESC-bot-1.md` from `renderEscalation`, then `apply`, commits it renumbered on a `bot/oracle-esc-…` branch with its heading rewritten. An invalid file exits 1. Also checks the `bots.yml` `collect` job's trigger and download step. Record 189 in `story-manifests.md`; the next free ID is 190.
- **Existing assertions may only gain.** Where an existing input or expected text must change, mark it `// Story 5.8: <why>`. This applies to:
  - XT-181's OK text and its `author` inputs;
  - XT-117's `bot/promote` case. It becomes a pass→quarantined change with its ESC, which keeps the demotion exemption. A new pass→skip bot case must now fail with `bot value:`.

**Never:**
- No edit to `oracle.yml`, `ratchet.yml`, `nightly.yml`, the ruleset files, `tools/ruleset/`, `tools/protected-paths/`, `conformance/protected-paths`, `ownership.yml`, `stories/*.md`, `AGENTS.md` or Expectations data.
- No write scope on `GITHUB_TOKEN`, so `ALLOWED_WRITE_JOBS` is unchanged. No App token in a job that runs tests.
- No auto-merge of bot PRs.
- No `--fast` or `--seed` in any workflow.
- No new dependency.
- No live App creation or ruleset change: those are Maintainer steps (ESC-5.8-1 and docs).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Flaky pass line | `pass` line; runs fail,pass,pass,fail | quarantine proposal; apply → branch, line quarantined + ESC-bot-n (flaky) | — |
| Consistent failure | `pass` line; fails 4/4 | `BOT-NONE … consistent failure` | ratchet stays red |
| Unowned pass | `skip/not-ported-yet`; passes 4/4; no open manifest lists it | promotion PR `pass`,`reason:null` | — |
| Owned pass | same, owned by open Story | `BOT-NONE … owned by open Story X` | — |
| Flaky fail-known | `fail-known`; pass,fail,pass,pass | quarantine | — |
| Over cap | 51 candidates | `BOTS-CAP …`, empty plan, exit 0 | — |
| Branch exists | rerun of same plan | `BOT-SKIP <branch> exists` | exit 0 |
| Stale line | main's line ≠ planned `before` | `BOT-SKIP <branch> stale` | exit 0 |
| Oracle ESC | artifact `ESC-bot-1.md`; main has ESC-bot-1 | PR adds `ESC-bot-2.md`, heading rewritten | invalid file → exit 1 |
| Human bot/* PR | author `someone`, valid status change | `bot identity:` violation | check fails |
| Bot edits reason only | `skip` line, reason changed | `bot value:` violation | check fails |

</intent-contract>

## Code Map

- `tools/ratchet/ratchet.ts` -- `openManifests(root)` :170, `classify` :144, private `ownersOf` :130 (export it for owner lookup), `runRatchet` :197. Reuse rather than re-derive ownership.
- `conformance/harness/harness.ts` -- `runHarness(root, HarnessOptions)` :408, with options `{env, ids, components, story}`. `HarnessResult {code,out,err,results,differences}` :171. `--id` globs match whole (`*`, `?`).
- `conformance/harness/compare.ts` -- `Difference {id, variant, kind, text, detail}` :86, `Result` :72, `matches()` :201. Differences with id `-` are ERROR or NOT-RUN rows.
- `tools/expectations/expectations.ts` -- `serialiseLine` :173, `ExpectationLine` :68. `tools/expectations/reasons.ts` -- `checkLine` :278. A quarantined line needs an open Escalation listing the id (:198, :308).
- `tools/pin-bump/pin-bump.ts` -- `readExpectations(root)` :365, which returns shards and lines and can be used for the `before` line lookup.
- `tools/escalations/escalations.ts` -- `parseEscalation(file, text)` :221, `parseEscalationId` :209, `TRIGGERS` :95. A bot branch may raise only `ESC-bot-<n>` (:545).
- `tools/oracle/fixtures.ts` -- `nextBotEscalation(root)` :488 (local only) and `renderEscalation(id, differences)` :503, which has a `# ${id}: …` heading and is used to build the AC4 test input.
- `tools/ownership/ownership.ts` -- `OwnershipPrInput` :147-162, `BOT_BRANCH` :177, `botAllowedPath` :443, `contentReads` :493 (returns `[]` for bot/ today), `reader` :563, `expectationLines` :593, `evaluatePr` :775 (bot branch :788-798), `pr()` :884-953 (OK text :949), and the header comments :37-102.
- `tools/protected-paths/protected-paths.ts` -- the `GitHub` client (env `GITHUB_API_URL`, `GH_TOKEN`). Extend it only through new methods there if needed; it is a Protected Path but in scope as Infra. Prefer the client's generic request method if one exists.
- `.github/workflows/oracle.yml` -- the App-token step pin :344-352, the Git data API commit pattern :353-397, and the artifact names `oracle-escalation` (:206-212, `if: always()`) and `oracle-determinism` (:250-256, `if: failure()`). Read only.
- `.github/workflows/ratchet.yml` -- services, env and checkout/setup-bun pins to copy. Read only.
- `tools/workflow-permissions/workflow-permissions.ts` -- `{contents: read}` at top level; job-level read scopes are allowed. `ALLOWED_WRITE_JOBS` :19 is unchanged.
- `tools/bench/{package.json,tsconfig.json}` -- the workspace template for `tools/bots`; run `bun install` afterwards.
- Tests: `conformance/tests/xaravel/ratchet.test.ts:43-60` (`makeRoot`, `inventory`, `shard`, `manifest`, the STUB Ported Test); `ownership.test.ts:112` (`runPr` fake API) and :541-600 (XT-181); `ownership-lines.test.ts:76` (`judge`) and :218-236 (XT-117); `oracle-fixtures.test.ts` (`renderEscalation` usage). Workflow-pinning tests: `ci-pipeline.test.ts:172` (no `--fast`), `oracle.test.ts:781` (no `packages: write` or ghcr), and `repository-policy.test.ts:529`.
- Docs: `docs/ops/ratchet.md:32,96`, `conformance/README.md:54`, `docs/ops/identities.md` (the App table, setup steps), `docs/ops/oracle.md:65-67,232`, `docs/ops/ci.md`.

## Tasks & Acceptance

**Execution:**
- `tools/ratchet/ratchet.ts` -- export `ownersOf` (no behavior change).
- `tools/ownership/ownership.ts` -- `author`, `BOT_LOGIN`, `botValueProblems`, `contentReads` for bot shards, the bot identity and value rules in `evaluatePr`, `pr()` reading `user`, and the header comments and OK text.
- `tools/bots/{bots.ts,package.json,tsconfig.json}`, root `package.json` (script `bots`), `bun.lock` -- `detect`, `collect`, `apply` and the plan types.
- `.github/workflows/bots.yml` -- the `detect`, `collect` and `open` jobs.
- `conformance/tests/xaravel/bots.test.ts` -- XT-123, -124, -125 (bot parts and workflow shape) and -189.
- `conformance/tests/xaravel/ownership.test.ts`, `ownership-lines.test.ts` -- the marked XT-181 and XT-117 updates, plus the new identity and value assertions.
- `conformance/escalations/ESC-5.8-1.md` -- `trigger: open-question`, `test_ids: [XT-conformance-123, XT-conformance-124]`. The `agent-push` ruleset, re-enabled at the Epic 8 checkpoint, would block the `xaravel-bot` App from creating `bot/*`, and `tools/ruleset` allows only `OrganizationAdmin` bypass. Options: (1) allow the App as an `Integration` bypass actor on agent-push; (2) exclude `bot/**` from agent-push and rely on the ownership identity rule. Proposed: (1).
- `docs/ops/bots.md` (new), `identities.md` (the `xaravel-bot` App: Contents rw, Pull requests rw; environment `bot` restricted to `main`; `XARAVEL_BOT_APP_ID` variable and `XARAVEL_BOT_APP_KEY` secret; not a bypass actor until ESC-5.8-1 is ruled), `ratchet.md`, `oracle.md`, `ci.md`, `conformance/README.md` -- docs, plus the Maintainer live steps.
- `_bmad-output/implementation-artifacts/story-manifests.md` -- record XT-conformance-189; the next free ID is 190.

**Acceptance Criteria:**
- Given a test that fails on `main` and then passes on rerun, or gives inconsistent results across 3 runs, when the quarantine bot runs, then it pushes a `bot/*` branch that sets the entry to `quarantined` and opens `ESC-bot-<n>` with the run evidence (XT-conformance-123).
- Given an unowned unexpected pass on `main`, when the promotion bot runs, then it opens a PR setting that entry to `pass` (XT-conformance-124).
- Given a bot PR that changes only Expectations status values, when the ownership check runs, then it is exempt; a bot PR that changes anything else, or is not from the bot App, fails the check (XT-conformance-125).
- Given an `ESC-bot-<n>.md` written by `oracle.yml`'s batch or nightly `determinism` job, when that run finishes, then `bots.yml` commits it to `conformance/escalations/` through a `bot/*` PR (XT-conformance-189).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 39 findings — high 0, medium 14, low 18, false 2, maybe-false 5
- findings:
  - **Blind Hunter**
    - `[medium]` `[patch]` A failed `POST /pulls` after the ref is created leaves an orphan branch that every later run skips as `exists`. Fixed: `apply` deletes the ref when the PR call fails; tested.
    - `[low]` `[patch]` `bots.yml` has no concurrency group, so overlapping runs pick the same `ESC-bot-<n>`. Fixed: `open` has `concurrency: bots-open`.
    - `[medium]` `[patch]` `gh run download … || echo` swallows auth and API errors, dropping Oracle Escalations silently. Fixed: collect lists the run's artifacts and downloads only those present; any download error fails the step.
    - `[low]` `[reject]` `apply` accepts any proposal kind from the plan of `detect`, which runs graded code. `detect` runs merged `main` code only. A forged proposal can still only open a PR that must pass the value rule, `parseEscalation`, the Ratchet and a human merge. Fixing it needs a new flag and per-job artifacts.
    - `[medium]` `[reject]` `detect` ignores the triggering run and reruns the harness on Linux only, so flakes seen only on a nightly macOS or arm64 leg are never quarantined. The fix changes the spec's design; listed as a residual risk.
    - `[medium]` `[patch]` Deduping by branch name re-proposes a recurring Oracle Escalation nightly, and opens overlapping promotion PRs. Fixed: `apply` skips with `BOT-SKIP … pending` while an open `bot/oracle-esc-*` or `bot/promote-*` PR exists; tested.
    - `[maybe-false]` `[defer]` The identity rule checks the PR's opener but not its commit authors, so an identity that can push to `bot/*` could add commits. Whether App-created commits map to the bot user via the API is unverified live; medium if true.
    - `[low]` `[patch]` A quarantine drops the line's previous reason and escalation, and the evidence records only the status. Fixed: the evidence holds the full `before` line.
    - `[false]` `[reject]` A promotion keeping an old `escalation` under `pass` is rejected by CI. `checkLine` accepts a `pass` with an existing escalation, and a quarantine's ESC lists the id, so `expectations:check` passes.
    - `[low]` `[reject]` The `/contents` listing caps at 1,000 Escalations. There are 25 today, and the fix (the trees API) adds complexity.
    - `[low]` `[patch]` `collect`'s `plan.sha` names the bots run's tip. Fixed: collect checks out `workflow_run.head_sha`, which `headSha` prefers.
    - `[medium]` `[patch]` `BOT-REFUSE` and `BOT-FAIL` are untested. Fixed: tests added (see the Verification Gap rows).
    - `[low]` `[patch]` The new XT-117 bot pass→skip case asserted only a prefix. Fixed: it asserts the exact messages.
    - `[low]` `[patch]` A dispatch from a non-main branch is labelled `main`. Fixed: the dispatch case of `detect` requires `refs/heads/main`.
    - `[low]` `[reject]` `BOT_LOGIN` is hard-coded to the slug `xaravel-bot`. The App's name is a documented Maintainer setup step, and a config indirection adds surface.
  - **Edge Case Hunter**
    - `[low]` `[patch]` No concurrency group. Same fix as the Blind Hunter row.
    - `[low]` `[reject]` The 1,000-entry listing cap. Same as the Blind Hunter row.
    - `[low]` `[reject]` A branch left behind by a closed, unmerged PR blocks re-proposal. The repository deletes merged head branches. A closed one is a Maintainer's rejection, and keeping it closed is acceptable.
    - `[medium]` `[patch]` An orphan ref when `/pulls` fails. Same fix as the Blind Hunter row.
    - `[medium]` `[patch]` A merged identical Oracle Escalation is proposed again. Grouped with the dedupe fix (`pending` skip).
    - `[medium]` `[patch]` Overlapping promotion PRs. Grouped with the dedupe fix.
    - `[low]` `[reject]` One stale change skips a whole promotion. Lines rarely move in the minutes between `detect` and `apply`, and the next run retries.
    - `[low]` `[patch]` Quarantining a `fail-known` line loses its reason and escalation. Same fix as the Blind Hunter row.
    - `[low]` `[reject]` A forged plan from `detect`. Same as the Blind Hunter row.
    - `[medium]` `[patch]` `gh run download` errors are swallowed. Same fix as the Blind Hunter row.
    - `[low]` `[patch]` Renumbering rewrote only the heading. Fixed: every whole-word occurrence of the old id is replaced.
    - `[medium]` `[patch]` A bot PR may modify, remove or rename an existing `ESC-bot-<n>.md`. Fixed: such a file is a `bot value:` violation; tested.
    - `[false]` `[reject]` A quarantine backed by an added ESC whose `test_ids` omit the id passes. `checkLine` (`reasons.ts:198`, run by `expectations:check` in CI) requires the open Escalation to list the id.
    - `[low]` `[patch]` `collect` ignores `workflow_dispatch` Oracle runs, though the `oracle` job runs on dispatch. Fixed: dispatch is accepted.
    - `[medium]` `[patch]` Existing ESC-bot edits are allowed. Same root cause and fix as the ESC-bot row above.
  - **Verification Gap**
    - `[medium]` `[patch]` A multi-line promotion was never applied. Fixed: XT-124 promotes two lines in one shard.
    - `[medium]` `[patch]` The `missing` observation was never produced. Fixed: a fake-harness case in XT-123.
    - `[low]` `[patch]` The `git rev-parse` path of `headSha` was never taken. Fixed: a committed fixture root.
    - `[medium]` `[patch]` `BOT-REFUSE` was untested. Fixed: a test in XT-125.
  - **Intent Alignment** (descriptive)
    - `[maybe-false]` `[reject]` "Fails on main" read as `detect`'s own run, not the triggering run. The AC holds for a failure `detect` observes on `main`; nightly-leg flakes are a residual risk.
    - `[maybe-false]` `[reject]` "Inconsistent" means a match plus a difference over 1 + 3 runs, and only `pass`/`fail-known` lines are quarantined. Recorded design.
    - `[maybe-false]` `[reject]` AC3 is read as the status triple, plus `pass`/`quarantined` only, plus identity. Recorded in Design Notes; the literal reading contradicts AC1 and AC2.
    - `[low]` `[patch]` AC4 dispatch runs are not collected. Same fix as the Edge Case row.
    - `[maybe-false]` `[defer]` Live paths are untested: `workflow_run`, App-token minting, real PRs, and the `agent-push` ruleset (ESC-5.8-1). Medium if broken; the first supervised dispatch settles it.

## Design Notes

- **Why the status triple.** Taken literally, "only `status` values" makes both bots impossible:
  - `checkLine` rejects a `quarantined` line without an open `escalation`;
  - it rejects a `pass` line with a non-null `reason`.

  The triple is the narrowest rule that lets them work. `id`, `variant` and `adapted` stay frozen, and line set and order cannot change.
- **Plan shape** (`.cache/bots/plan.json`):

  ```json
  {"ref":"main","sha":"<head>","run":"<url|local>","proposals":[
    {"kind":"quarantine","shard":"conformance/expectations/support/x.jsonl","id":"…","variant":"none","before":"<line text>","after":{…line…},"observations":["unexpected-failure","match","match","unexpected-failure"]},
    {"kind":"promotion","changes":[{"shard":"…","id":"…","variant":"…","before":"…","after":{…}}]},
    {"kind":"escalation","file":"ESC-bot-1.md","text":"…","source":"<url>"}]}
  ```

- **Trust split.** `detect` runs graded code and holds no secret. `open` holds the App token and runs only `main`'s `tools/bots`, on a plan it re-validates (the before-line check and the ownership value rule). `workflow_run` always runs the default branch's `bots.yml`.
- **Live-only.** `bots.yml`, App-token PR creation and `workflow_run` chaining have never run live. The tests cover the tools against a fake API and the YAML shape. The first live run needs the Maintainer's App setup (epic 3 lesson).
- **ESC numbering** races between concurrent bot runs are narrowed by scanning open `bot/*` PRs. A collision fails `escalations:check` on the second PR, which is loud, not silent.

## Verification

**Commands:**
- `bun install --frozen-lockfile --ignore-scripts` -- expected: no change after the first `bun install`.
- `bun test` -- expected: all pass, including XT-123..125, XT-189, XT-117 and XT-181.
- `bun run typecheck && bun run lint && bun run graph:check && bun run scaffold:check && bun run workflows:check && bun run escalations:check && bun run expectations:check && bun run ownership:check` -- expected: OK.
- `bun run harness` -- expected: `SUMMARY … differ=0`.
- `bun tools/bots/bots.ts detect --root . --ref main --out /tmp/plan.json` -- expected: `BOTS ref=main quarantine=0 promote=0 none=0`, exit 0.

## Auto Run Result

Status: done

**Summary.** Adds the quarantine and promotion bots and the Oracle Escalation collector, and makes the ownership check bound `bot/*` PRs by value and identity.
- `tools/bots/bots.ts`:
  - `detect` runs the harness on `main` and reruns each differing key 3 times. Mixed results on a `pass` or `fail-known` line become a quarantine. A consistent pass that no open Story owns becomes a promotion.
  - `collect` turns the Oracle's `ESC-bot-*.md` artifacts into a plan.
  - `apply` writes `bot/*` branches and PRs through the Git data API as the `xaravel-bot` App. It renumbers each ESC-bot past `main` and the open bot PRs, and checks the before-line and the ownership value rule before any write.
- `bots.yml` chains the bots after `ratchet`, `nightly` and `oracle` runs on `main`. Graded code runs only in jobs with no secret.
- `tools/ownership`:
  - a `bot/*` PR must come from `xaravel-bot[bot]`;
  - it may change only the status triple of existing lines, to `pass` or `quarantined`;
  - it may only add ESC-bot files, never edit them.

**Files changed.**
- `tools/bots/{bots.ts,package.json,tsconfig.json}`: new; detect, collect and apply.
- `tools/ownership/ownership.ts`: `author`, `BOT_LOGIN`, `botValueProblems`, and the bot identity and value rules.
- `tools/ratchet/ratchet.ts`: `ownersOf` is exported.
- `.github/workflows/bots.yml`: new; the `detect`, `collect` and `open` jobs.
- `conformance/tests/xaravel/bots.test.ts`: new; XT-123, -124, -125 and -189.
- `ownership.test.ts` and `ownership-lines.test.ts`: the marked `// Story 5.8` updates to XT-23, XT-117 and XT-181. They only tighten.
- `conformance/escalations/ESC-5.8-1.md`: how the bot App gets past the `agent-push` ruleset once it is re-enabled. Waiting on the Maintainer.
- Docs: `docs/ops/bots.md` (new), plus `identities.md`, `ratchet.md`, `oracle.md`, `ci.md` and `conformance/README.md`.
- `package.json`, `bun.lock`: the `bots` script and workspace.
- `story-manifests.md`: XT-189 recorded; the next free ID is 190.

**Review.** One pass with 39 findings:
- Patched entries, by verdict: 0 high, 8 medium, 9 low.
  - Orphan refs are deleted.
  - A `pending` skip stops overlapping Oracle-ESC and promotion PRs.
  - A failed download in `collect` fails the step.
  - Bot PRs may not edit existing ESC-bot files.
  - A quarantine is allowed only from `pass` or `fail-known`.
  - The evidence holds the full before-line.
  - Renumbering replaces every whole-word id.
  - Concurrency, the dispatch-on-main gate, `collect`'s `head_sha` checkout and Oracle dispatch runs.
  - Tests for BOT-REFUSE, BOT-FAIL, multi-line promotion, the `missing` observation, `headSha`, and exact XT-117 messages.
- 2 deferred (in frontmatter): commit-author identity, and live-only paths.
- Rejected, with reasons in the triage log: a forged detect plan (low; human merge and value rule bound it), Linux-only detection (spec design; residual risk), stale Escalation links on promotion (false), the 1,000-entry listing cap, a closed branch blocking re-proposal, a stale change skipping a whole promotion, the hard-coded `BOT_LOGIN`, a quarantine ESC not listing its id (false; `expectations:check` covers it), and three descriptive intent rows.

**Follow-up review recommended: true.** This pass patched several medium findings in `apply`'s write and dedupe paths and in the ownership bot rules. Unverified risk: the new `pending` and ref-delete paths in `apply`, and the ESC-bot status rule in `botRules`, have only the tests written in this same pass. A second pass over `apply`'s idempotency (exists, pending and stale) and the bot rules is worthwhile.

**Verification (2026-10-19).**
- `bun install --frozen-lockfile --ignore-scripts`: no changes.
- `bun test`: 226 pass, 0 fail.
- `typecheck`, `lint`, `graph:check`, `scaffold:check`, `workflows:check`, `escalations:check`, `expectations:check` and `ownership:check`: all OK.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`.
- `bots.ts detect --root . --ref main`: `BOTS ref=main quarantine=0 promote=0 none=0`.

**Residual risks.**
- `bots.yml`, App-token minting, `workflow_run` chaining and real PR creation have never run live. The Maintainer must:
  - create the `xaravel-bot` App, the `bot` environment, `XARAVEL_BOT_APP_ID` and `XARAVEL_BOT_APP_KEY`;
  - rule on ESC-5.8-1 before `agent-push` is re-enabled;
  - supervise a first `workflow_dispatch`.
- AC1, AC2 and AC4 depend live on that setup.
- `detect` reruns on Linux only, so a flake seen only on a nightly macOS or arm64 leg is not quarantined.
- The identity rule checks the PR's opener, not its commit authors.
