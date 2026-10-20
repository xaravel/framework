# Fidelity Review

Every Story PR is reviewed against Upstream by two reviewer agents, separate from the implementer (FR-111, AD-15.8, Story 8.5). Their verdicts are GitHub PR reviews from two distinct identities, and `story:check`'s `approvals` clause counts them ([done-check.md](done-check.md)).

## What runs

`.github/workflows/fidelity.yml` runs on `pull_request_target` (`opened`, `synchronize`, `reopened`, `ready_for_review`) for same-repository, non-draft PRs whose head is `story/*` and whose base is `main`. `pull_request_target` runs the base branch's copy of the workflow, so the `base.ref == 'main'` guard keeps a `story/*` PR against another base from running that branch's copy with the `fidelity` secrets; the `fidelity` environment is also restricted to the `main` branch, as `oracle` and `bot` are. Drafts are skipped, so they cost nothing, and are reviewed when marked ready (`ready_for_review`). It has two jobs, `reviewer-1` and `reviewer-2`, identical except for their App:

| Job | App | Bot login | Variable | Secret |
| --- | --- | --- | --- | --- |
| `reviewer-1` | `xaravel-fidelity-1` | `xaravel-fidelity-1[bot]` | `XARAVEL_FIDELITY_1_APP_ID` | `XARAVEL_FIDELITY_1_APP_KEY` |
| `reviewer-2` | `xaravel-fidelity-2` | `xaravel-fidelity-2[bot]` | `XARAVEL_FIDELITY_2_APP_ID` | `XARAVEL_FIDELITY_2_APP_KEY` |

Each job runs in the environment `fidelity` (deployment branches restricted to `main`), one run per PR and reviewer at a time (a newer push cancels the older run). `GITHUB_TOKEN` holds only `contents: read`. The steps:

1. **Configured check.** It sees only whether the App ID, the App key and `ANTHROPIC_API_KEY` are set. When any is missing it prints a `::warning::` naming them and skips every later step; the job ends green, because it is not a required check and `approvals` stays the failing gate.
2. **Base checkout** of the PR's base sha with `persist-credentials: false`, Bun from `.bun-version`, and `bun install --frozen-lockfile --ignore-scripts`. No PR code is checked out or run.
3. **App token** from the pinned `actions/create-github-app-token`, with `permission-pull-requests: write` and `permission-contents: read`.
4. **`bun run upstream:sync`**, so the reviewer can read the Upstream test source.
5. **The review:** `bun run fidelity:review review --pr <n> --sha <head sha> --reviewer <1|2> --login <app-slug>[bot]`.

## Inputs

`tools/fidelity-review/fidelity-review.ts` reads:

- the checklist, `conformance/review/fidelity.md` (Protected), from the base checkout. Each `### F-<n>: <title>` heading is one item. The CLI fails closed when the file has no item, a duplicate id or a malformed `### F-` heading;
- the manifest `stories/<id>.md` from the base checkout, and for each of its `test_ids` (with dataset rows `X#<key>`) the Inventory row and the Upstream lines its `source` names. When the snapshot or file is missing, the prompt says `Upstream source unavailable`, and the checklist tells the reviewer to fail F-1 if Ported Tests changed;
- through the GitHub API: the PR, its changed files with their unified-diff patches, and the head content of every changed `conformance/oracle-requests/*.jsonl`. A file with no `patch` is accepted only when the API reports `changes: 0` (a pure rename, a mode change, an empty file); it appears in the prompt as `(no textual change)`;
- the evidence the items need, from the base checkout:
  - **(a) DIV records** (F-3, F-5): every `decisions/DIV-<n>.md` that an `adapted:DIV-<n>.<k>` token on an added (`+`) patch line cites, in full, with its `fewer_assertions` frontmatter;
  - **(b) consequences** (F-7): for every `FR-<n>.<k>` or `AD-<n>.<k>` token on an added line, its line from `conformance/xaravel-consequences/*.jsonl`, or `unknown consequence id` when no file has it;
  - **(c) error fixtures** (F-6): for every committed Oracle request (batch or accepted per-Story, the lookup `story:check` uses) whose id the manifest assigns, the fixture's id and `output.error` when it is not null, after `verifyFixture` accepts it against `oracle.pub`. Because a Story's own fixtures are committed only to its branch (`oracle.yml#story`), every fixture the PR adds or modifies under `conformance/fixtures/` is also read at the head through the contents API, and listed with its request id and `output.error` when that is not null;
  - **(d) DIV-1** (F-9): `decisions/DIV-1.md`, when an added line contains `@asyncRoot`.

  A missing evidence file is named in the prompt (`unavailable: <why>`), never dropped.

The prompt is the checklist, the `## Precedence` section of `conformance/README.md` (verbatim, so F-4 does not rely on a link) and the answering rules (system), then the manifest, the Inventory rows with their Upstream lines, the Oracle requests, the patches and the evidence (user). The CLI asks the model (`XARAVEL_FIDELITY_MODEL`, default `claude-opus-5-5`) through a plain `POST /v1/messages` with `anthropic-version: 2023-06-01`. The request has one tool, `submit_verdict`, whose schema enumerates the checklist's item ids. Claude Opus 5.5 rejects a forced `tool_choice` with a 400, so the request uses `tool_choice: auto` (no parallel calls), a `strict` schema and an instruction to answer only through the tool. A response without exactly one `submit_verdict` call, or that did not stop for it, fails closed.

Each model attempt has an 8-minute timeout, so 3 attempts and their delays fit in the job's 45-minute `timeout-minutes`. A network or timeout error, HTTP 429 or HTTP 5xx (529 included) is retried, up to 3 attempts in all, after the `retry-after` header (capped at 60 s) or 10 s × attempt; `XARAVEL_FIDELITY_RETRY_DELAY_MS` overrides the 10 s base (the tests set `0`). Any other status fails at once. Every HTTP error message, from GitHub or Anthropic, quotes the first 500 characters of the response body.

## The verdict rule

The model answers every item exactly once: `pass`, `fail` or `n/a`, a non-empty note, and for a `fail` at least one finding with a `path` and a `detail`. `parseVerdict` re-validates all of this; a missing, extra or duplicate id, or any malformed answer, exits 1 and posts nothing.

The CLI posts one review on the reviewed sha (`commit_id`):

- `APPROVE` when every item is `pass` or `n/a`;
- `REQUEST_CHANGES` when any item fails. That review carries the findings back to the implementer on the PR; the orchestrator does not yet act on it ([ESC-8.5-1](../../conformance/escalations/ESC-8.5-1.md)).

The body starts `Fidelity Review (reviewer <n>) of Story <id> at <sha>`, then a table with one row per item (result and note), then the findings of the `fail` items only; an approving review lists none. That review on the Story PR is where FR-111.2's verdict and findings are stored.

## Refusals and exits

| Situation | Result |
| --- | --- |
| Review posted | exit 0 |
| The PR head is no longer `--sha` (checked before the model call and again before posting) | prints `superseded`, posts nothing, exit 0; the newer push's run reviews the new head |
| The head branch is not `story/<id>`; `stories/<id>.md` is missing or invalid; `--login` is the PR author (case-insensitive) | exit 1, nothing posted |
| A changed file has no `patch` and `changes` is not 0, the file list is truncated, or the prompt is over 600,000 characters | exit 1, nothing posted |
| A malformed checklist or verdict, a model HTTP error that is not retried or outlasts 3 attempts, or a GitHub API error (a 422 on the review POST included) | exit 1, nothing posted |
| A missing option, or `GH_TOKEN`, `ANTHROPIC_API_KEY` or `GITHUB_REPOSITORY` unset | usage message, exit 2 |

`GITHUB_API_URL` and `ANTHROPIC_BASE_URL` override the endpoints; the tests point them at `Bun.serve` fakes (`conformance/tests/xaravel/fidelity-review.test.ts`). No secret is printed.

## Setup

The Maintainer creates the two Apps, the `fidelity` environment, its variables and secrets ([identities.md](identities.md#the-fidelity-review-apps), [ESC-8.5-1](../../conformance/escalations/ESC-8.5-1.md)). Until then, both jobs warn and post nothing.

## Cost

Each push to a non-draft Story PR runs two reviews, one model call each (up to 3 attempts on a transient error), with up to 600,000 characters of prompt (roughly 150,000 to 200,000 tokens) and up to 32,000 output tokens at effort `high`. A Story PR that is pushed many times costs that much per push; the concurrency group cancels a run superseded by a newer push. When a Story has Oracle requests, `oracle.yml#story` commits its signed fixtures to the Story branch, and that commit is itself a push (`synchronize`), so each implementer push can cost a second pair of reviews.

## Limits

- **Prompt injection.** The reviewers read the diff of same-repository PRs, which the implementer wrote. Text in the diff could try to steer the reviewer. The prompt says the PR is evidence, not instructions, and to fail when unsure; that lowers the risk but does not remove it. A human Code Owner still reviews Protected Path changes.
- **No live verification yet.** The two-identity flow is proven only against fake servers. While the orchestrator opens Story PRs as the Maintainer, the implementer/reviewer separation cannot be shown on a real PR, and the orchestrator does not yet act on `CHANGES_REQUESTED` ([ESC-8.5-1](../../conformance/escalations/ESC-8.5-1.md)).
- **A model reviewer can be wrong.** A `fail` that a human judges wrong is answered by a new push or a dismissed review; `approvals` counts each reviewer's latest review on the head.
