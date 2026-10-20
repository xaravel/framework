---
title: 'Epic 8 action item 1: the Fidelity Review runs in the loop'
type: 'refactor'
created: '2026-10-20'
baseline_revision: 'ccc06c5a8592f6ae7537825e54d3de2c1f4c3bfe'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/ESC-8.5-1.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-5-fidelity-review-workflow.md'
warnings: ['oversized']
deferred:
  - summary: >-
      `conformance/review/fidelity.md`'s intro and `epics.md`'s AD-15 summary (line 449) still describe GitHub App reviewers, and the checklist text goes verbatim into every reviewer's prompt.
    evidence: |-
      ESC-8.5-1 says the checklist "stays as it is", and the orchestrator may not edit epics.md (iteration.md waiting test); both need the Maintainer.
    location: >-
      conformance/review/fidelity.md:3, _bmad-output/planning-artifacts/epics.md:449
    severity: low
  - summary: >-
      The `fidelity-review` review layer lives in `_bmad/custom/bmad-build-auto.toml`, which is not a Protected Path, so a change can weaken it without Code Owner review.
    evidence: |-
      `conformance/protected-paths` lists `/.claude/` but not `/_bmad/`; changing the Protected list is a Maintainer decision (AD-16).
    location: >-
      conformance/protected-paths, _bmad/custom/bmad-build-auto.toml
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The Maintainer rejected ESC-8.5-1: no reviewer GitHub Apps, no `fidelity` environment, no model call from GitHub Actions. Story 8.5's Fidelity Review posts PR reviews from `.github/workflows/fidelity.yml` through the Anthropic Messages API, and `story:check`'s `approvals` clause counts GitHub PR approvals, so no Story can pass `approvals` and Story 8.7 is waiting on this rebuild (ESC-8.7-1).

**Approach:** Per `decisions/ESC-8.5-1.md` and the amended AD-15.8 / FR-111.5 / Story 8.5 ACs:
- `bun run fidelity:review review` runs two fresh-context reviewer agents as subprocesses of the agent CLIs: reviewer 1 on the *other* CLI from the loop's (Codex for a `claude -p` loop, Claude for a Codex loop), falling back to the loop's CLI with a recorded reason when the other is unavailable; reviewer 2 on the loop's own CLI. Each gets only the prompt the tool builds (checklist, diff, the evidence the checklist names), and answers with a schema-validated verdict.
- Each verdict (`pass` or `reject`, with per-item results and findings, the CLI, model and fallback reason) is appended to the Story's spec, bound to the reviewed tree.
- `story:check`'s `approvals` clause passes only with two `pass` verdicts (reviewers 1 and 2) recorded for the head tree. It no longer reads GitHub PR reviews.
- `bmad-build-auto`'s review step runs it as a review layer for Story work; a `reject` returns its findings to triage (back to the implementer), and Finalize re-runs it when the tree changed after the layer ran.
- `fidelity.yml`, the App-token steps and the Messages API path are retired. `conformance/review/fidelity.md` is not changed.

## Boundaries & Constraints

**Always:**
- **Reviewed tree.** `reviewTree(root, mode)` is the git tree id of the repository state with `_bmad-output/` removed, computed with a temporary index (`GIT_INDEX_FILE`) so the real index is never touched. Mode `worktree` = HEAD plus every tracked change and untracked, non-ignored file (what the reviewers see); mode `head` = the HEAD commit. Bookkeeping under `_bmad-output/` (the spec, sprint status) therefore never invalidates a verdict, and a reviewed working tree committed unchanged has the same id as its head. One exported implementation, used by the tool and by `story:check`.
- **Diff.** The reviewed diff is `git diff-tree -p` between the same `_bmad-output/`-less tree of `--base` (default: the spec's `baseline_revision`) and `reviewTree(root, "worktree")`. Every evidence rule of Story 8.5 (DIV records, consequences, error fixtures, DIV-1, Inventory rows with Upstream lines, changed Oracle request content) is kept, reading the head side from the working tree instead of the GitHub API. Empty diff, prompt over `PROMPT_CAP`, missing manifest, missing or ambiguous spec: exit 1, nothing recorded.
- **CLI selection.** `--loop-cli claude|codex`, else env `XARAVEL_LOOP_CLI`, else `claude` when env `CLAUDECODE` is set; otherwise usage error (exit 2). Reviewer 1 uses the other CLI; reviewer 2 the loop CLI. Binaries: env `XARAVEL_FIDELITY_CLAUDE_BIN` (default `claude`) and `XARAVEL_FIDELITY_CODEX_BIN` (default `codex` on `PATH`, else `~/.local/bin/codex`).
- **Unavailable** means exactly (ESC-8.5-1): not installed (spawn fails / ENOENT), not signed in, or refused because of a usage limit (recognised from the CLI's output; the patterns are named constants and listed in the docs). Only then does reviewer 1 fall back to the loop CLI, recording `fallback: "<other> unavailable: <not installed|not signed in|usage limit>: <≤200-char excerpt>"`. If the CLI a reviewer needs is unavailable with no fallback left, that reviewer fails (exit 1).
- **Isolation.** Each reviewer subprocess runs in a fresh empty temp directory (removed afterwards), with the prompt on stdin, no tools and no project settings: Claude `-p --output-format json --json-schema <schema> --tools "" --setting-sources "" --strict-mcp-config --disable-slash-commands --no-session-persistence --system-prompt <system>` (plus `--model` when `XARAVEL_FIDELITY_CLAUDE_MODEL` is set); Codex `exec --sandbox read-only --skip-git-repo-check --ephemeral --color never -C <tmp> --output-schema <file> -o <file> -` with the system text prepended to the prompt (plus `-m` when `XARAVEL_FIDELITY_CODEX_MODEL` is set). Each attempt has a 15-minute timeout. A malformed answer, timeout or other non-zero exit is retried once on the same CLI, then the reviewer fails closed.
- **Verdict.** The answer must satisfy Story 8.5's `parseVerdict` (every item id exactly once, `pass`/`fail`/`n/a`, non-empty note, findings on every `fail`). Verdict `pass` iff no item is `fail`, else `reject`. Model recorded: Claude from `modelUsage` keys of the JSON result, Codex from a `model:` line in its output, else the configured `-m` value, else `"unknown"`.
- **Record.** Each verdict is appended under a `## Fidelity Review` section of the spec (created at the end of the file if absent; new records go at the end of that section), as a heading `### Reviewer <n>: <pass|reject> at tree <tree>` + a rendered result table and findings (fail items only; `@` neutralised) + one fenced `json` block holding `{"kind":"fidelity-verdict","reviewer","verdict","tree","base","cli","model","loop_cli","fallback","date","items"}`. Records are append-only; the tool never edits an earlier record.
- **Counting** (`fidelityVerdicts(records, tree)`, shared by `fidelity:review status` and `story:check`): per reviewer slot, the last record whose `tree` equals `tree`; passes when slots 1 and 2 are both `pass`, and slot 1's `cli` differs from its `loop_cli` or its `fallback` is non-empty. A malformed record fails the clause, naming it.
- **Spec lookup**: `_bmad-output/implementation-artifacts/spec-<a>-<b>-*.md` for Story `<a>.<b>` (exactly one match, else fail naming the matches), unless `--spec` is given.
- **`story:check` `approvals`**: `PASS approvals: 2 pass verdicts for tree <t> (reviewer 1: <cli>/<model>, reviewer 2: <cli>/<model>)`; else FAIL with one item line per slot (`reviewer <n>: <verdict> at tree <x>` / `none for tree <t>`) and the fallback rule when it is what fails. It needs no `GH_TOKEN`; `full-run` keeps its GitHub path and `--pr`.
- **Exit codes** of `review`: 0 both reviewers recorded `pass`; 1 a `reject` was recorded (findings printed, one line each, `F-<n> <path>: <detail>`), or a reviewer produced no verdict; 2 usage. `status`: 0 and `current` when the counting passes for `reviewTree(root, "worktree")`, else 1 and `stale` / `missing` with the reason.
- **Review step.** `_bmad/custom/bmad-build-auto.toml` adds review layer `fidelity-review` (run only when the work is a Story with `stories/<id>.md`): it runs `bun run fidelity:review review --story <id> --spec {spec_file} --loop-cli <the agent's own CLI>` and reports each printed finding as a review finding; a failure to produce a verdict is reported as one finding. It names its Finalize re-check: `bun run fidelity:review status --story <id> --spec {spec_file}`; when that does not print `current`, run the layer again and triage its findings as a new review pass. `step-04-review.md` Finalize gains one generic paragraph: a layer may name a Finalize re-check; run it before writing `status: done`, and treat a failure as a new review pass.

**Never:**
- Edit `AGENTS.md`, any `CLAUDE.md`, `conformance/review/fidelity.md`, `conformance/expectations/**`, `tools/orchestrator/`, `tools/protected-paths/`, `conformance/protected-paths`, rulesets or any live GitHub setting.
- Call a model API directly, read an API key, or run a reviewer with tools or with the repository as its working directory.
- Remove an assertion's intent: Story 5.9's and 8.5's tests are rewritten to the new design with equal-or-stronger checks, never dropped.
- Count a verdict for a tree other than the head tree, or count two verdicts from the same slot.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Both pass, cross-model | loop `claude`; fake codex and claude answer all pass | two records (r1 `codex`, `fallback: null`; r2 `claude`), same tree; exit 0; `status` → `current`; `story:check` approvals PASS after commit | — |
| Other CLI not installed | codex bin missing | r1 runs on claude, `fallback` starts `codex unavailable: not installed`; exit 0; approvals PASS | — |
| Usage limit / not signed in | fake codex prints a usage-limit or login message, exit 1 | fallback recorded with that reason | — |
| Reject | r1 answers F-2 `fail` with a finding | r1 record `reject`; stdout `F-2 <path>: <detail>`; exit 1; approvals FAIL naming `reviewer 1: reject` | — |
| Malformed answer | missing item id, twice | no record for that reviewer; stderr names the id; exit 1 | fail closed |
| Unclassified failure | fake exits 3 with other text, twice | no fallback, no record; exit 1 | fail closed |
| Stale | verdicts recorded, then a non-`_bmad-output` file changes | `status` → `stale`, exit 1; approvals FAIL `none for tree …` | — |
| Bookkeeping only | verdicts recorded, then the spec / sprint status changes and all is committed | `status` `current`; approvals PASS | — |
| Same CLI twice, no reason | hand-written records r1 and r2 both `claude`, loop `claude`, no fallback | approvals FAIL on the fallback rule | — |
| Usage | no `--story`, or no loop CLI resolvable | usage message; exit 2 | — |

</intent-contract>

## Code Map

- `tools/fidelity-review/fidelity-review.ts` (1068 lines) -- keep: `parseChecklist`, `precedenceSection`, `buildPrompt` (drop `prNumber`/`sha` inputs for `tree`/`base`), evidence (`addedLines`, `gatherEvidence`, `headErrorFixtures`, `consequenceLines`, `errorFixtures`, `readEvidenceFile`), `inventoryContext`, `verdictTool` (its `input_schema` is the CLI output schema; drop `strict`/tool wrapper or reuse `input_schema`), `parseVerdict`, `noMention`, `cell`. Remove: `askModel`, retry/Anthropic constants, `excerpt`, GitHub posting, `decideEvent`/`ReviewEvent` (replace with `pass`/`reject`), the old `runReview`/`parseArgs`/`USAGE`, the `PrFile` import. Rewrite the header comment.
- `tools/protected-paths/protected-paths.ts` -- read-only; no longer imported by the tool.
- `tools/story-check/story-check.ts` -- header comment `approvals` (:49-54), `approvalsClause` (:389-405), `githubClauses` (:531-580) splits so `approvals` is computed from `root` via the tool's exports and `full-run` keeps GitHub; `runStoryCheck` (:701-) wiring; `Review` type removal.
- `tools/ownership/ownership.ts` -- `parseManifest`, `STORIES_DIR` (manifest read, reuse).
- `conformance/tests/xaravel/fidelity-review.test.ts` -- XT-conformance-160 (keep as is except removed API/workflow asserts), 161 and 162 rewritten: temp git repos (`git init`, commit fixture tree with a manifest, spec with `baseline_revision`, checklist copy, README precedence), fake CLIs as executable `#!/bin/sh` scripts or `bun` scripts in a temp dir selected by the `*_BIN` env vars, recording their argv/cwd/stdin to files for assertions.
- `conformance/tests/xaravel/done-check.test.ts` -- XT-conformance-127 (:368-) approvals assertions (:338-345 fake reviews, :376-414, :444-457, :478-504, :623-632): rewrite to verdict records in a temp git root; the GitHub fake stays for `full-run`; `NO_TOKEN` now fails `full-run` only.
- `stories/8.5.md` -- update the AC table text to the amended ACs ("a Story whose implementation passes verification", "a reviewer's verdict"); stays `done`.
- `conformance/xaravel-consequences/conformance.jsonl` -- read-only; FR-111.1-.5, AD-15.8 to cite.
- `.github/workflows/fidelity.yml` -- delete. Check `tools/workflow-permissions/` and any test enumerating workflows still pass.
- `.claude/skills/bmad-build-auto/step-04-review.md` Finalize -- the generic re-check paragraph. `_bmad/custom/bmad-build-auto.toml` -- the `[[workflow.review_layers]]` entry (`id`, `name`, `when`, `instruction`); renderer `_bmad/scripts/render_skill.py` accepts `when` (:92). Re-render to confirm: `uv run --no-cache _bmad/scripts/render_skill.py --project-root . --skill .claude/skills/bmad-build-auto`.
- Docs: `docs/ops/fidelity-review.md` (rewrite: what runs, CLIs, fallback, record format, counting, limits), `docs/ops/identities.md` (remove the fidelity Apps, environment, secrets rows and section; note the reviewers are local CLI subprocesses), `docs/ops/done-check.md` (:60 approvals row, :69 example), `conformance/README.md:64`.
- `package.json:87` -- `fidelity:review` script stays.

## Tasks & Acceptance

**Execution:**
- `tools/fidelity-review/fidelity-review.ts` -- rebuild as above; exports `reviewTree`, `reviewDiff`, `findStorySpec`, `runReviewer`, `classifyUnavailable`, `renderRecord`, `appendRecords`, `parseRecords`, `fidelityVerdicts`, `runFidelity(argv, env)` → `{code, out, err}`; CLI subcommands `review` and `status`.
- `tools/story-check/story-check.ts` -- `approvals` from `fidelityVerdicts(parseRecords(spec), reviewTree(root, "head"))`; `full-run` unchanged.
- `conformance/tests/xaravel/fidelity-review.test.ts` -- XT-160 (FR-111.1, FR-111.4, FR-115.3), XT-161 (FR-111.1, FR-111.2, FR-111.5, AD-15.8), XT-162 (FR-111.3, AD-15.8) covering every matrix row, plus: reviewer argv contains the isolation flags, cwd is not the repo and is removed, stdin holds the diff and checklist; the record JSON round-trips through `parseRecords`; no `fidelity.yml` exists.
- `conformance/tests/xaravel/done-check.test.ts` -- XT-127 approvals cases rewritten (pass with two verdicts; fail with a reject, a stale tree, a same-slot duplicate, the fallback rule, no spec, ambiguous specs).
- `.github/workflows/fidelity.yml` -- delete.
- `_bmad/custom/bmad-build-auto.toml`, `.claude/skills/bmad-build-auto/step-04-review.md` -- the layer and the Finalize paragraph.
- `stories/8.5.md`, docs listed in the Code Map -- update.

**Acceptance Criteria:**
- Given a Story whose implementation passes verification, when the review step runs, then two reviewer subprocesses review the diff in fresh empty directories with no tools, reviewer 1 on the other CLI (or the loop CLI with the recorded reason), and both verdicts are in the spec bound to the reviewed tree.
- Given a `reject`, when the layer reports, then each failed item's findings are printed as review findings for triage, and `story:check` `approvals` fails.
- Given two `pass` verdicts for the head tree, when `bun run story:check <id>` runs, then `approvals` passes without `GH_TOKEN`.
- Given the repo after this change, then no workflow calls a model, `fidelity.yml` is gone, and `bun run workflows:check` passes.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 32 findings — high 0, medium 9, low 17, false 3, maybe-false 3
- findings:
  - `[medium]` `[patch]` (verification-gap) The `~/.local/bin/codex` default and `XARAVEL_FIDELITY_CODEX_MODEL` were untested. Added an XT-161 case with a PATH without codex and a temp HOME.
  - `[low]` `[patch]` (verification-gap) The ambiguous-spec message advised `--spec`, which story:check lacks. It now says to keep exactly one spec.
  - `[low]` `[reject]` (verification-gap) `review --spec` can write verdicts to a spec story:check never reads. The layer passes the build's own spec, which matches the pattern, and a mismatch fails loudly at story:check.
  - `[low]` `[reject]` (intent) The one-shot tool-less reviewer reading. ESC-8.5-1 says the context "holds only the diff, the checklist and the inputs the checklist names", which the tool builds.
  - `[false]` `[reject]` (intent) The gate enforcing the cross-model rule is stricter than the ruling. AD-15.8 and FR-111.5 require it; recording without enforcing would let it lapse silently.
  - `[low]` `[reject]` (intent) "Bound to the reviewed tree" excludes `_bmad-output/`. That is the spec's design: the bookkeeping is written after the review.
  - `[maybe-false]` `[reject]` (intent) The real CLI flags were not exercised. Claude's argv was probed live (`structured_output`, `modelUsage`), and so was codex `exec` with the sandbox, `--ephemeral` and `-C` flags. `--output-schema` remains for Story 8.7's supervised run; if wrong it fails closed (low).
  - `[low]` `[patch]` (intent) The loop wiring was untested. Added XT-161 assertions on the toml layer and the step-04 paragraph.
  - `[medium]` `[patch]` (edge) The timeout killed only the direct child, so a grandchild holding the pipes could hang the run. The reads now race the timer, and the process group is killed; there is a test.
  - `[medium]` `[patch]` (edge) Codex echoes the prompt, so diff text such as "usage limit" misclassified an unrelated failure as unavailable. The prompt is now scrubbed before classification; there is a test.
  - `[low]` `[patch]` (edge) Model text with a newline plus a fence could swallow the record's JSON. `inline()` sanitising, with a round-trip test.
  - `[medium]` `[patch]` (edge) Records were not re-validated against the checklist. `fidelityVerdicts` re-runs `parseVerdict` and checks the verdict; there are tests.
  - `[low]` `[reject]` (edge) One malformed old record blocks approvals. Records are written only by the tool, and failing closed on a hand-edited record is intended.
  - `[low]` `[patch]` (edge) story:check had no `--spec`. Same as the verification-gap row.
  - `[low]` `[reject]` (edge) An arbitrary `--spec` path. Same as the verification-gap row.
  - `[low]` `[reject]` (edge) `status` uses the worktree tree while story:check uses HEAD. Stray untracked files make story:check fail loudly, never pass wrongly.
  - `[low]` `[patch]` (edge) A symbolic `baseline_revision`. The base is now resolved to a commit sha.
  - `[low]` `[patch]` (edge) The worst case exceeded the 60-minute guidance. The layer now says at least 75 minutes.
  - `[medium]` `[patch]` (edge) The Finalize re-check had no bound. Each re-run now increments `review_loop_iteration` and halts past 5.
  - `[low]` `[patch]` (edge) A missing verdict was hidden behind the F-lines. `NO-VERDICT reviewer <n>` lines, which the layer treats as findings.
  - `[maybe-false]` `[patch]` (edge) Codex is not tool-less. The system text and docs are corrected; isolation is the empty cwd, the env allow-list and the instruction.
  - `[medium]` `[reject]` (blind) Verdict records can be forged. ESC-8.5-1 puts the verdicts in the Story's spec, and the loop runs as the Maintainer, so identity separation is unverifiable either way (LESSONS, epic 1). Documented under Limits.
  - `[medium]` `[reject]` (blind) A reject can be re-rolled into a pass on an unchanged tree. The ruling says a reject returns "as review findings do today", which go through triage; the append-only history shows every re-run. Documented under Limits and reported to the Maintainer.
  - `[low]` `[reject]` (blind) The `base` is not checked against the merge-base. It is the same trust class as forgery: the records and the spec are trusted as written.
  - `[maybe-false]` `[reject]` (blind) `approvals` and `full-run` can certify different commits. story:check runs on the Story branch's checkout; whether a stale checkout is met in the loop would need a run with unpushed commits. If real, it is low.
  - `[medium]` `[patch]` (blind) The children inherited the loop's whole env (GH_TOKEN). The env is now allow-listed, with a test.
  - `[low]` `[defer]` (blind) The checklist intro and epics.md:449 are stale. They need the Maintainer (ESC-8.5-1 keeps the checklist; epics.md is planning).
  - `[medium]` `[defer]` (blind) `_bmad/` is not Protected. The Protected list is the Maintainer's (AD-16).
  - `[false]` `[reject]` (blind) The Finalize loop has no bound. Same as the edge row: patched.
  - `[false]` `[reject]` (blind) The timeout does not stop the run. Same as the edge row: patched.
  - `[low]` `[patch]` (blind) `noMention` used a literal U+200B. Restored the `\u200B` escape.
  - `[low]` `[reject]` (blind) The spec append is an unlocked read-modify-write. Runs are sequential in the review step.

## Design Notes

Why exclude `_bmad-output/` from the tree: recording a verdict edits the spec, and finishing the Story edits sprint status; binding to the raw commit would make every verdict stale the moment it is written. Everything a reviewer judges (packages, tests, tools, Expectations, fixtures) is outside `_bmad-output/`.

Why subprocess CLIs rather than the Agent tool for both reviewers: the tool can then pick the other model family, record the CLI and model, and be tested hermetically with fake binaries; a fresh `claude -p` in an empty directory with `--tools ""` is a fresh context that is not the implementer.

## Verification

**Commands:**
- `bun run harness --xaravel --id XT-conformance-160 --id XT-conformance-161 --id XT-conformance-162 --id XT-conformance-127` -- expected: all pass.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run escalations:check`, `bun run harness --xaravel` -- expected: exit 0.
- `uv run --no-cache _bmad/scripts/render_skill.py --project-root . --skill .claude/skills/bmad-build-auto` -- expected: renders; the rendered step-04 lists the `fidelity-review` layer with its `Run only when`.

**Manual checks:**
- One live smoke run is not required here (it costs model calls and Story 8.7 is the supervised first run per ESC-8.7-1); say so in the Auto Run Result.

## Auto Run Result

Status: done

**Summary.** The Fidelity Review now runs in the loop, as ESC-8.5-1 rules.
- **The review.** `bun run fidelity:review review --story <id>` runs two reviewer subprocesses, each in a fresh empty directory. Reviewer 1 runs on the other agent CLI; reviewer 2 runs on the loop's own. Each gets an allow-listed env and a prompt the tool builds: the checklist, the Precedence text, the manifest, Inventory and Upstream lines, the diff from the resolved base, and evidence (a)-(d).
- **Fallback.** When the other CLI is unavailable (not installed, not signed in, or at its usage limit), reviewer 1 falls back to the loop's CLI and records why. Any other failure fails closed.
- **Records.** Verdicts are appended to the Story's spec under `## Fidelity Review`, bound to the repository tree minus `_bmad-output/`.
- **The done check.** `story:check`'s `approvals` clause re-validates each record against the checklist. It needs pass verdicts from reviewers 1 and 2 for the head tree, and reviewer 1 either on the other CLI or with a recorded fallback. It no longer reads GitHub.
- **In bmad-build-auto.** The review layer `fidelity-review` (`_bmad/custom/bmad-build-auto.toml`) runs the review for Story work and names a `status` re-check. step-04 Finalize runs layer re-checks, bounded by `review_loop_iteration`.
- **Retired.** `fidelity.yml` and the Messages API path are gone.

**Files changed**
- `tools/fidelity-review/fidelity-review.ts`: rebuilt (CLI reviewers, tree binding, records, counting, `review`/`status`).
- `tools/story-check/story-check.ts`: `approvals` from spec records; `full-run` unchanged.
- `conformance/tests/xaravel/fidelity-review.test.ts`: XT-conformance-160/161/162 for the new design, with fake CLIs in temp git repos.
- `conformance/tests/xaravel/done-check.test.ts`: XT-conformance-127's approvals cases use verdict records.
- `.github/workflows/fidelity.yml`: deleted.
- `_bmad/custom/bmad-build-auto.toml`: the `fidelity-review` layer.
- `.claude/skills/bmad-build-auto/step-04-review.md`: the Finalize re-check paragraph.
- `docs/ops/fidelity-review.md`, `docs/ops/identities.md`, `docs/ops/done-check.md`, `conformance/README.md`, `stories/8.5.md`: updated to the new design.

**Review findings.** One pass with 32 findings: 15 patched (medium 6, low 8, maybe-false 1), 2 deferred, and 15 rejected, each with its reason in the Review Triage Log. Two verification fixes were made before review:
- a nested `claude -p` is not logged in, because Claude Code strips `CLAUDE_CODE_OAUTH_TOKEN`; the token is now read from `~/.claude-auth-token` into the child's env only;
- the reviewer model defaulted to Sonnet; the layer now passes the loop's model.

**Follow-up review recommended: true.** Six medium entries were patched. The unverified risk is the first live run with real CLIs:
- codex `--output-schema` and `-o`;
- the not-signed-in and usage-limit patterns;
- the process-group kill under real CLI helpers.

Story 8.7 is that supervised run (ESC-8.7-1).

**Verification.**
- `bun run typecheck`, `lint`, `workflows:check` and `escalations:check`: exit 0.
- `bun run test`: 282 pass, 0 fail.
- `bun run harness --xaravel`: 282/282, `differ=0`.
- Live probes: `claude -p` with the reviewer argv returns `structured_output` when the token is supplied, and `codex exec` in read-only mode answers.

**Residual risks**
- The verdict records are trusted as written: a forged record or a re-rolled reject is visible only in the append-only history (Limits in `docs/ops/fidelity-review.md`).
- The checklist intro is stale until the Maintainer allows an edit (deferred).
- `_bmad/` is not Protected (deferred).
