---
test_ids:
  - XT-conformance-161
trigger: open-question
proposed: >-
  The Maintainer sets up the Fidelity Review's two reviewer identities. Create
  two GitHub Apps owned by the organisation, `xaravel-fidelity-1` and
  `xaravel-fidelity-2`, each with no webhook, the repository permissions
  Pull requests: read and write, Contents: read and Metadata: read and
  nothing else, installed on `xaravel/framework` only and never added as a
  ruleset bypass actor. Create the environment `fidelity`, with its
  deployment branches restricted to `main` as for `oracle` and `bot`, and
  store in it the
  variables `XARAVEL_FIDELITY_1_APP_ID` and `XARAVEL_FIDELITY_2_APP_ID`, the
  secrets `XARAVEL_FIDELITY_1_APP_KEY` and `XARAVEL_FIDELITY_2_APP_KEY` (each
  App's private key) and the secret `ANTHROPIC_API_KEY`. Optionally set the
  variable `XARAVEL_FIDELITY_MODEL` (default `claude-opus-5-5`). Accept the
  model cost: two Messages API calls per push to a Story PR, each with up to
  600,000 characters of prompt. A supervised first run on a real Story PR
  follows before any Story relies on the reviews.
evidence: >-
  FR-111 and AD-15.8 require two reviewer identities, separate from the
  implementer, that post GitHub PR reviews, and `story:check`'s `approvals`
  clause counts approvals by distinct non-author login on the head commit.
  Story 8.5 adds `.github/workflows/fidelity.yml`, whose `reviewer-1` and
  `reviewer-2` jobs mint each App's token with
  `actions/create-github-app-token` and run `bun run fidelity:review`. Until
  the Apps, the environment and the secrets exist, each job prints a
  `::warning::` and posts nothing, so `approvals` keeps failing. Creating
  Apps, environments and secrets, and spending on the model, are Maintainer
  actions that no Story may take.
---

# ESC-8.5-1: create the Fidelity Review Apps and accept the model cost

Covers FR-111, AD-15.8, Story 8.5, XT-conformance-161.

Story 8.5 builds the Fidelity Review: the checklist `conformance/review/fidelity.md`, the CLI `tools/fidelity-review/fidelity-review.ts` and the workflow `.github/workflows/fidelity.yml` ([docs/ops/fidelity-review.md](../../docs/ops/fidelity-review.md)). Nothing posts a review until the Maintainer does the setup above, so the Story's tests prove the reviews only against fake GitHub and Anthropic servers.

What the Maintainer is asked to decide:

1. **Create the two Apps and the `fidelity` environment**, as proposed. Each App gets its own `<slug>[bot]` login, so two Apps give two distinct reviewer identities. Neither can be the PR author, so `approvals` counts both without any change to `story:check`.
2. **Provide `ANTHROPIC_API_KEY`** in the `fidelity` environment, and accept the per-PR cost: each push to a Story PR runs two reviews, one model call each. For a Story with Oracle requests, the fixture commit `oracle.yml#story` pushes to the Story branch is itself a push (`synchronize`), so each implementer push can be reviewed twice.
3. **Supervise the first run** on a real Story PR (Story 8.7's pilot is the first candidate), and compare the two reviews with a human review before relying on them.

Known limits the ruling should take into account:

- **The orchestrator loop does not act on `CHANGES_REQUESTED` yet.** A rejecting review returns the PR to its implementer only as a review on the PR; `tools/orchestrator/` does not read it and re-dispatch the Story. That is a separate change to the orchestrator.
- **Distinct-identity review is not verifiable live yet.** While the orchestrator opens Story PRs as the Maintainer, the author is the Maintainer, and the identity separation between implementer and reviewers cannot be shown on a real PR. It becomes checkable when the agent identity decided at the Epic 8 checkpoint opens the PRs.
- **Prompt injection.** The reviewers read the diff of same-repository PRs. A diff could carry text meant to steer the reviewer. The prompt tells the model to treat the PR as evidence, not instructions, and to fail when unsure, but that is a mitigation, not a guarantee; a human still reviews Protected Path changes as Code Owner.
- **Non-`main` bases and drafts.** Both jobs run only for a non-draft PR whose base is `main` (`base.ref == 'main'`, `draft == false`): `pull_request_target` runs the base branch's copy of the workflow, so a `story/*` PR against another base must not reach the `fidelity` secrets, and the `main` restriction on the environment backs that guard. A draft is reviewed when it is marked ready (`ready_for_review`).
- **Forced tool choice.** Claude Opus 5.5 rejects a forced `tool_choice` with a 400, so the CLI asks with `tool_choice: auto`, a strict tool schema and an instruction to answer only through `submit_verdict`. A response without that call fails closed and posts nothing.

This Escalation stays open until the Maintainer rules.
