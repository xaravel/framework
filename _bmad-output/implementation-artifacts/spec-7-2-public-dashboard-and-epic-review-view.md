---
title: 'Story 7.2: Public dashboard and Epic review view'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: '9fcda04d7faf786ecb9ee40a8fabfad4bdba4288'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-1-conformance-aggregator.md'
  - '{project-root}/stories/7.2.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 7.1 computes `report.json` and appends `history.jsonl` to `dashboard-data`, but nothing shows them. FR-5 and UJ-5 need a public page with the rates, history and every item that needs a decision, plus a per-Epic review view, so the Maintainer can accept or return an Epic on evidence.

**Approach:** Add a static-site builder, `tools/conformance-report/site.ts` (`bun run conformance:site`). It renders `index.html` and one `epics/<N>.html` per Epic from 7.1's `report.json`, the history, the Escalation and decision records, the Expectations File, the API-surface diff and git history. Add `tools/conformance-report/publish.ts` (`bun run conformance:publish`), which commits the built directory to a `gh-pages` branch with the same plumbing 7.1 uses. Both run in the existing `dashboard` job.

GitHub Pages serves the `gh-pages` branch ("Deploy from a branch"). The job's existing `contents: write` is enough for this. `actions/deploy-pages` is not an option: it needs `id-token: write`, which AD-18 and `release.ts` `authorityViolations` (XT-conformance-38) allow only in `release.yml#release`.

## Boundaries & Constraints

**Always:**
- **One definition per number.** Every rate, count and alpha figure is read from `report.json` (`Report`, 7.1); the site never recomputes them.
  - The full rate shows its denominator as `<passing> / <pairs> pairs`.
  - The alpha figure is in the same section, shown as `<passing> / <applicable> applicable Test IDs`, with the target and `met`. It sits beside the full rate, never in its place (FR-5.1, FR-5.2).
  - A `null` rate renders as `n/a`.
- **index.html shows:**
  - the overall bucket, and a per-Component table: pairs, passing, rate, `fail-known`, quarantined, adapted;
  - Skip Reason counts: all seven kinds from `REASON_KINDS`, plus a `reasonsDetail` table;
  - Divergences. There is a row for `DIV-1`..`DIV-12`, plus any other `DIV-<n>` that a reason names. Each row has the pair count whose reason is `intentional-divergence:DIV-<n>`. When `decisions/DIV-<n>.md` exists, the row links to it at `https://github.com/<repo>/blob/<commit>/decisions/DIV-<n>.md`; otherwise it shows `no record yet` and no link (Epic 8 writes the records).
  - Open Escalations. These are every `conformance/escalations/ESC-*.md` whose `escalationStatus` is `open`, each with its trigger and Test IDs (`test_ids`), linked the same way.
  - Quarantined tests: every Expectations line with `status: quarantined`, as `id`, `variant`, `escalation`.
  - The API-surface diff per Component, as `countsOf` columns: upstream, matched, missing, renamed, extra, unexplained.
  - The history chart.
  - A link to each Epic's review page.
- **History chart (FR-5.4).** `historySeries(records)` splits the records, in file order, into series. A new series starts at every record whose (pin.tag, pin.commit) differs from the previous record's, even if that pin was used earlier. Each change is also a marker carrying the new pin tag.
  - Each point holds `commit`, `rate` (overall passing / pairs, or null) and `alpha` (passing / applicable, or null).
  - `renderHistoryChart` draws an inline SVG. Each series is a separate `<polyline>` for overall and for alpha, so lines never join across a pin change. Each marker is a vertical `<line>` with a `<text>` label holding the tag.
- **Epic review view (UJ-5).** `epicReview(root, epic, report)` covers the Epic's Stories, which are the manifests with `epic: <N>` (`readManifests` + `applySprintStatus`). It returns:
  - its Components (sorted), each with its `report.components` bucket, or null, rendered as `no Test IDs in the Inventory`;
  - `began`: the parent of the oldest commit reachable from HEAD whose subject starts with `<story-id>: ` for one of its Stories, or null when no such commit exists;
  - `ended`: the later, in the `--topo-order` commit list, of the Epic's newest Story commit and the newest commit that added the Epic's retrospective document (`_bmad-output/implementation-artifacts/epic-<N>-retro-*.md`, `git log -M --diff-filter=A`); null exactly when `began` is null (corrected from `began..HEAD` by Epic 7 retro item 5, `spec-retro-7-bound-review-range`);
  - the Divergence Records (`decisions/DIV-*.md`) and Escalations (`conformance/escalations/ESC-*.md`) added in `began..ended` (`git log --diff-filter=A`) and still present at HEAD, each Escalation with its Test IDs and status. When `began` is null, both lists are empty;
  - per Story: id, status, commit count, distinct files changed, and lines added and deleted. These are summed with `--numstat` over the Story's commits (subject prefix `<story-id>: `).
  - Its page puts the `fail-known` count and the open Escalations first, flagged as blocking acceptance.
- **CLI conventions.** Follow 7.1: a header usage comment, `main(argv)`, `--root`, exit 0/1/2, and HTML-escape every interpolated string.
  - `site.ts` takes `--root`, `--report` (default `DEFAULT_OUT`), `--history <file>` (absent means an empty history), `--out` (default `.cache/conformance/site`), `--repo <owner/name>` (default `$GITHUB_REPOSITORY`; when it is unset, links render as plain text) and `--api-surface <json file>`, a precomputed `ComponentDiff[]`. When `--api-surface` is absent, the site calls `diffComponents(root, componentsOf(root))`.
  - The output also holds `.nojekyll`, `report.json` and `history.jsonl`.
- **publish.ts** takes `--root`, `--dir`, `--remote` (default `origin`) and `--branch` (default `gh-pages`).
  - It builds one commit whose tree is exactly the files of `--dir`, with the remote tip as its parent, or as an orphan when the branch is missing.
  - When the tip already has the identical tree, it is a no-op (`unchanged`, exit 0).
  - It never forces a push, and on `REJECTED` it retries up to `PUSH_RETRIES`.
  - It never touches the caller's HEAD, index or working tree. To do this it reuses helpers exported from `history.ts`.
- **history.ts** gains `--history-out <file>`, which writes the branch's full `history.jsonl` after the append (or the existing content when the record is already there). `AppendResult` gains `content`.
- **Workflow** (`dashboard.yml`):
  - Checkout gets `fetch-depth: 0` (the Epic view needs full history) and keeps `persist-credentials: false`.
  - The steps run in this order: install, report, history (`--history-out .cache/conformance/history.jsonl`), site (`--history … --repo "$GITHUB_REPOSITORY"`, no token), publish.
  - Only the history and publish steps get `GH_TOKEN`.
  - Job permissions stay exactly `{contents: write}`, and no new actions are added.

**Never:**
- Add `id-token: write` or `pages: write`, or use `actions/deploy-pages` / `upload-pages-artifact`.
- Edit `tools/workflow-permissions/`, `tools/release/`, `conformance/protected-paths`, `tools/ownership/`, `.github/rulesets/*`, or any Expectations or Inventory data.
- Import a graded package (`packages/*`) into the tools.
- Enable or configure GitHub Pages from the agent. That is a Maintainer live step; it is documented, not run.
- Commit the built site to `main`.
- Shrink the denominator, or merge `fail-known` into skips.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full page | fixture report (pass, fail-known, quarantined, divergence skip), one open and one decided ESC, `decisions/DIV-3.md` present, api-surface JSON | index shows `p / n pairs`, alpha in same section, 7 kinds, DIV-3 linked, DIV-4 `no record yet`, only the open ESC with its Test IDs, quarantined id×variant, api-surface counts | exit 0, prints `conformance:site: wrote <n> pages to <dir>` |
| No repo | `GITHUB_REPOSITORY` unset, no `--repo` | names rendered without `<a href` | — |
| Escaping | a Test ID containing `<b>` | rendered as `&lt;b&gt;` | — |
| Pin change | 3 records on pin A, 2 on B, 1 on A | 3 series (3, 2, 1 points), 2 markers labelled B and A | — |
| Empty history | no `--history` | chart says `no history yet` | — |
| Epic review | fixture git repo: `1.1: a`, `planning: x`, `1.2: b` adding `decisions/DIV-1.md` and an ESC; an earlier ESC before `1.1` | began = parent of `1.1`; ended = the later of `1.2: b` and the newest `epic-1-retro-*.md` add; DIV-1 and the later ESC listed, the earlier ESC and any added after `ended` not (retro 7 item 5); per-Story files and +/- lines exact | — |
| Epic not begun | Epic whose Stories have no commits | began null, empty lists, Stories listed with 0 commits | — |
| Publish new | bare remote without `gh-pages` | orphan commit; tree equals the dir | exit 0, `created` |
| Publish same | same dir again | no new commit | exit 0, `unchanged` |
| Publish changed | one file removed, one changed | new commit on the old tip; the removed file is absent | exit 0, `updated` |
| Bad flag | `--nope` | usage | exit 2 |
| Missing report | no `report.json` | — | exit 1, names the path |

</intent-contract>

## Code Map

- `tools/conformance-report/report.ts`:
  - `Report`, `Bucket`, `AlphaGate` (l.52-84);
  - `REASON_KINDS` (l.40), `DEFAULT_OUT` (l.50), `serialiseReport` (l.302);
  - the CLI pattern (l.334).
- `tools/conformance-report/history.ts`:
  - `git` / `gitOk` / `fetchTip` / `BOT` are private (l.81-130); export them for publish;
  - `buildCommit` shows the temp-index plumbing (l.133);
  - `REJECTED` and `PUSH_RETRIES`; `HistoryRecord` (l.42); `AppendResult` (l.50);
  - `readReport` (l.218); export it for site.ts.
- `tools/escalations/escalations.ts`:
  - `ESCALATIONS_DIR`, `DECISIONS_DIR`;
  - `parseEscalation(file, text)` returns `{escalation: {id: {id}, testIds, trigger} | null}`;
  - `escalationStatus(id, root)`. There is no list function: `readdirSync` the directory.
- `tools/ownership/ownership.ts`:
  - `readManifests(root)` (l.306) and `applySprintStatus(root, manifests)` (l.330);
  - `Manifest {storyId, epic, component, status}` (l.137).
- `tools/api-surface/api-surface.ts`:
  - `ComponentDiff` (l.136), `countsOf` (l.1128), `componentsOf` (l.1274);
  - `diffComponents(root, comps)` (l.1287) runs `tsc -b` and throws on failure.
- `tools/pin-bump/pin-bump.ts:365`: `readExpectations(root)` returns untyped shards `{path, lines}`. Quarantined lines are `status: "quarantined"` with an `escalation`.
- `tools/expectations/reasons.ts:19,143`: how `intentional-divergence:DIV-<n>` maps to `decisions/DIV-<n>.md`.
- `conformance/tests/xaravel/conformance-report.test.ts`:
  - the fixture root, bare-remote and `cli()` helpers;
  - XT-145's workflow block (l.408-439) asserts `runs.length === 3`, one `github.token` step, checkout `with` equal to `{persist-credentials: false}`, and the "Story 7.2 adds…" comment. Update those assertions to the new job shape without loosening the rest.
- `conformance/tests/xaravel/release.test.ts:741` (`checkAuthority`) and `repository-policy.test.ts:636` (`checkWorkflows`) must still pass on the real repo.
- `conformance/xaravel-consequences/conformance.jsonl`: `FR-5.1`..`FR-5.5` tokens. Tests cite them in the `xaravelTest` description.
- `docs/ops/conformance-report.md`: 7.1's doc, extended with the site and publish. `docs/ops/identities.md`: the agent-push exclude note, extended with `gh-pages`.

## Tasks & Acceptance

**Execution:**
- `tools/conformance-report/history.ts`: export `git`, `gitOk`, `fetchTip`, `BOT`, `HistoryError` (already exported) and `readReport`. Add `content` to `AppendResult` and the `--history-out` flag. Behaviour is otherwise unchanged.
- `tools/conformance-report/site.ts`: create it. Export:
  - `historySeries`, `renderHistoryChart`, `epicReview`, `buildSite(input): Map<string, string>` (pure over its inputs) and `main`;
  - `readHistory(file)`, which parses JSONL, exits 1 on a malformed line and names its line number.
- `tools/conformance-report/publish.ts`: create it. Export `publishSite({root, remote, branch, dir})`, which returns `{outcome: "created"|"updated"|"unchanged", tip, attempts}`, and `main`.
- `package.json`: add `conformance:site` and `conformance:publish` (`bun --no-env-file tools/conformance-report/<x>.ts`). `tsconfig.json` already includes `tools/conformance-report/*.ts`.
- `.github/workflows/dashboard.yml`: apply the Workflow rules, and rewrite the header comment to say the job publishes to `gh-pages`.
- `conformance/tests/xaravel/dashboard.test.ts`: create it, covering every matrix row.
  - `XT-conformance-146` (FR-5, FR-5.1, FR-5.2, FR-5.3, FR-5.5): the index contents, publish created/unchanged/updated with the caller unchanged, and the workflow shape. That means push to main; the token only in history and publish; permissions `{contents: write}`; `checkWorkflows` and `checkAuthority` clean; `fetch-depth: 0`; the step order.
  - `XT-conformance-147` (FR-5.4): series and markers, and the SVG polylines and labels.
  - `XT-conformance-148` (UJ-5 via FR-5): the Epic review view on a fixture git repo, and the rendered `epics/<N>.html`.
- `conformance/tests/xaravel/conformance-report.test.ts`: update XT-145's workflow block to the new step shape (the history step is found by its last line; the token is on exactly two steps, history and publish) and add a `--history-out` check.
- `docs/ops/conformance-report.md`: add the site, publish and Epic view, and the Maintainer live step: Settings → Pages → Deploy from branch `gh-pages` `/`, or `gh api -X POST repos/<repo>/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'`. Also add the limits.
- `docs/ops/identities.md`: the agent-push exclude must also cover `refs/heads/gh-pages`.

**Acceptance Criteria:**
- Given a push to `main`, when the dashboard workflow runs, then `gh-pages` holds an index with the full-denominator rates beside the alpha figure, Skip Reason counts, DIV links, open Escalations with Test IDs, Quarantined tests and the per-Component API-surface diff (XT-conformance-146). Pages serving it is verified only after the Maintainer enables Pages and the first run on `main`.
- Given the history records, when the chart renders, then every Baseline Pin change has a marker and starts a new series (XT-conformance-147).
- Given an Epic ID, when `epics/<N>.html` is opened, then it shows the Components' rates and Skip Reason counts, the DIV records and Escalations added since the Epic began, and files and lines per Story (XT-conformance-148).

## Spec Change Log

### 2026-10-20 — Epic review range bounded at the Epic end (Epic 7 retro item 5, S5/L7)
- Changed: the Divergence Records and Escalations are those added in `began..ended`, not `began..HEAD`. `ended` is the later of the Epic's newest Story commit and the newest commit that added `epic-<N>-retro-*.md`, and it is null when `began` is null. The page shows `Ended at`.
- Why: under `began..HEAD`, every finished Epic's page also listed everything later Epics added (Epic 1's and Epic 2's pages each listed all 31 Escalations; retro S5). The per-Story commit matching and rename counting were undocumented (retro L7). They are now documented in `docs/ops/conformance-report.md`, and the counting itself is unchanged. See `spec-retro-7-bound-review-range`.

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 36 findings — high 0, medium 7, low 23, false 3, maybe-false 3
- findings:
  - **Intent-alignment layer**
    - `[low]` `[reject]` AC1 says "publishes to GitHub Pages", but serving needs the Maintainer to enable Pages. Enabling Pages is a one-time live repository setting, which the lessons say to keep apart from agent-run steps. It is documented in `docs/ops/conformance-report.md` and reported as unverified.
    - `[medium]` `[patch]` The API-surface diff was shown as counts only, but the spine (l.353) asks for the missing, renamed and extra members. Added an `api-surface/<component>.html` page per Component listing every item, linked from the index row.
    - `[medium]` `[patch]` The real-repo site build (no `--api-surface`) was never tested. Grouped with the matching verification-gap row; a real-repo block was added to XT-146.
    - `[low]` `[reject]` AC3 is tested on fixture commit subjects. The fixture uses the real squash-subject shape, and the new real-repo block builds every real Epic page.
    - `[maybe-false]` `[reject]` "the Component" (singular) versus every Component of the Epic. Epic 7 really spans two Components (`conformance`, `boost`), so the plural reading is the one that does not drop data. If it were true, it would be low only.
    - `[maybe-false]` `[reject]` The blocking framing is not asked for. The epic context says `fail-known` and open Escalations block acceptance and "the view must make them obvious". It adds no wrong data.
  - **Verification-gap layer**
    - `[medium]` `[patch]` `--history-out` was checked only on the already-recorded path. XT-145 now passes it on the Pin-change append and asserts the new full content.
    - `[medium]` `[patch]` The site was never built as CI builds it. A real-repo block in XT-146 runs it without `--api-surface` and checks the Epic pages and the API-surface rows.
    - `[low]` `[reject]` The publish retry path is untested. Runs are serialised by the non-cancelling `dashboard` group, and the loop mirrors `history.ts`'s, whose rejection matching is tested. A competing-push harness for a second branch adds test machinery for a rare path.
    - `[low]` `[patch]` A comment in XT-145 said "After an append" over an already-recorded call. Fixed with the `--history-out` row.
  - **Blind layer**
    - `[medium]` `[patch]` The Epic blocking section missed open Escalations from before the Epic began. It now lists every open Escalation of the Epic's Stories, or with Test IDs that intersect the Epic's Test IDs.
    - `[low]` `[patch]` `fail-known` on the Epic page is the whole Component's count. It is now labelled as the Component's count across all Epics.
    - `[low]` `[patch]` An Escalation whose status throws was hidden. It is now listed as open with status `unknown`.
    - `[low]` `[reject]` Manifest violations are ignored. `ownership:check` fails CI on any manifest violation, so `main` cannot hold one.
    - `[low]` `[patch]` A `DIV-<n>` above 12 with no skip pair was never listed. `divRecords` was added to the union.
    - `[low]` `[patch]` The docs' Workflow paragraph contradicted itself on which steps get the token. Fixed.
    - `[low]` `[reject]` Shallow clones are not detected. The workflow's `fetch-depth: 0` is asserted by XT-145, and a guard adds a branch for a local-only misuse.
    - `[low]` `[patch]` `gh-pages` grows without bound. Documented in Limits; changing the publish model (orphan plus force push) would break the spec's "never force".
    - `[low]` `[reject]` The publish retry is untested. Same as the verification-gap row.
    - `[medium]` `[patch]` `--history-out` was untested on append. Same as the verification-gap row.
    - `[medium]` `[patch]` Nothing runs the site build on the real repo. Same as the verification-gap row.
    - `[false]` `[reject]` Quarantine Escalation links are unchecked. `expectations:reasons` (CI) requires a quarantined line's `escalation` to name an open Escalation, so the link target exists on `main`.
    - `[low]` `[patch]` Chart points cannot be identified. A `<circle>` with a `<title>` (commit, Pin, rate) was added per point.
    - `[maybe-false]` `[reject]` `began` is null when the first Story commit is the root commit. The repository's root commit predates every Story, so no real Epic reaches this. If it were true, it would be low.
  - **Edge-case layer**
    - `[low]` `[patch]` A single-point series drew an invisible polyline. Fixed by the per-point circles.
    - `[low]` `[reject]` A null in the middle of a series is interpolated across. A null needs `pairs` or `applicable` to be 0 after it was non-zero, which the denominator rules (never shrunk) exclude.
    - `[low]` `[patch]` A status-throwing Escalation was hidden. Same as the blind row.
    - `[low]` `[patch]` A DIV record added and then deleted was still listed. DIV paths are now kept only when they exist at HEAD, which matches the docs.
    - `[false]` `[reject]` Root-commit `began`. Same as the blind row; no Story commit is a root commit.
    - `[low]` `[patch]` An empty `--dir` would wipe the published site. Publish now refuses a dir without `index.html`.
    - `[low]` `[reject]` `--out` deleting a dir that holds `.nojekyll` and `.git`. It needs a deliberately wrong `--out`, and the guard adds complexity.
    - `[low]` `[reject]` `--api-surface` entries without numeric fields. The input comes from the paired tool; the fix only adds guards.
    - `[low]` `[reject]` Negative or out-of-range history values. `history.jsonl` is written only by `history.ts` from the report.
    - `[low]` `[reject]` Tabs or newlines in site file names. Every file name is generated by `buildSite` from Epic numbers and Component names.
    - `[low]` `[patch]` The docs claim deleted DIV records are not listed. Same as the deleted-DIV row; the code now matches.
    - `[false]` `[reject]` The `began` claim for a root commit. Same as the root-commit rows; it cannot occur on this repository.

## Design Notes

**Why a branch, not `deploy-pages`.** AD-18 keeps `id-token: write` to the release job, and XT-conformance-38 enforces that. A `gh-pages` branch push needs only the `contents: write` the job already holds (spine l.374). The `dashboard-data` branch stays data-only.

**"Since the Epic began"** is read from `main`'s squash-merge subjects (`7.1: Conformance aggregator (#209)`). This is the only per-Story marker git has on `main`. A Story with no merged commit adds nothing. The range ends at the Epic's retrospective commit, or its last Story commit, not at HEAD (Epic 7 retro item 5).

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-conformance-14[5678]'` -- expected: all pass.
- `bun run conformance:report && bun run conformance:site --repo xaravel/framework` -- expected: exit 0 and `.cache/conformance/site/index.html` plus `epics/*.html` written.
- `bun run typecheck && bun run lint && bun run workflows:check && bun run release:authority` -- expected: clean.
- `bun run harness --xaravel` -- expected: no differences.

## Auto Run Result

Status: done

**Summary.** `bun run conformance:site` (`tools/conformance-report/site.ts`) renders a static dashboard from Story 7.1's `report.json`, the `dashboard-data` history, the Escalations, the Divergence Records, the Expectations File, the API-surface diff and git history. It writes:
- `index.html`: the full-denominator rates with the alpha figure beside them, Skip Reason counts, DIV links, open Escalations with Test IDs, Quarantined tests, the per-Component API-surface diff and the Pin-segmented history chart;
- one `api-surface/<component>.html` page per Component;
- one `epics/<N>.html` review page per Epic.

`bun run conformance:publish` (`publish.ts`) commits the built site to `gh-pages` with git plumbing. It never forces a push and retries on rejection. The `dashboard` job now runs report, history (`--history-out`), site and publish. It holds only `contents: write`, and the token is given only to the history and publish steps. Publishing from a branch avoids `id-token: write`, which AD-18 reserves for the release job.

**Files.**
- `tools/conformance-report/site.ts`: the site builder and the Epic review view.
- `tools/conformance-report/publish.ts`: the `gh-pages` publish.
- `tools/conformance-report/history.ts`: exports its git helpers and `readReport`, and adds `--history-out` and `AppendResult.content`.
- `.github/workflows/dashboard.yml`: `fetch-depth: 0`, plus the site and publish steps.
- `conformance/tests/xaravel/dashboard.test.ts`: XT-conformance-146, 147 and 148.
- `conformance/tests/xaravel/conformance-report.test.ts`: XT-145's workflow assertions now follow the new job shape, and a check covers `--history-out` on an append.
- `docs/ops/conformance-report.md`: the site, Epic view and publish, the Maintainer live step, and the limits.
- `docs/ops/identities.md`: the agent-push ruleset must also exclude `gh-pages`.
- `package.json`: the `conformance:site` and `conformance:publish` scripts.

**Review.** 36 findings: 7 medium, 23 low, 3 false and 3 maybe-false.
- 19 rows patched, as 11 fixes: 7 medium (5 distinct root causes) and 12 low.
- 0 deferred.
- 17 rejected, each with its reason in the triage log.

**Follow-up review recommended: true.** Two or more medium entries were patched. The specific unverified risk is the patch-pass code: the per-Component API-surface pages and the Epic blocking-section selection (open Escalations by Story prefix or Test-ID overlap). The orchestrator checked them only through their tests and its own read; no fresh review layer has looked at them.

**Verification.**
- `bun run harness --xaravel`: 258/258 pass, differ 0, including XT-conformance-145 to 148. XT-146 includes a real-repo site build without `--api-surface`.
- `typecheck`, `lint`, `workflows:check` and `release:authority` are clean.
- On the real repo, `conformance:report` writes 0/23291 pairs (alpha 0/18395), and `conformance:site` writes 111 pages.

**Residual risks.**
- Pages serves nothing until the Maintainer enables it: Settings → Pages → Deploy from branch `gh-pages` `/`, or the `gh api` call in `docs/ops/conformance-report.md`. The live publish is unverified until the first `dashboard` run on `main`.
- `.github/rulesets/agent-push.json` must exclude `refs/heads/gh-pages` and `refs/heads/dashboard-data` before it is re-enabled (Epic 8 checkpoint).
- `gh-pages` gains one full-site commit for each push that changes the site.
- The publish retry path is not driven by a test.
- The site step runs `tsc -b` for the API-surface diff, so a compile failure on `main` fails the dashboard job.
