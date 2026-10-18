# Identities and repository rulesets

Framework Agents push as a separate GitHub account, the **agent identity**. Repository rulesets let that identity create, update or delete only `story/*` branches. Everything else reaches `main` through a PR and the merge queue (AD-16, AD-28). The Maintainer stays the only org admin. Only org admins can bypass a ruleset.

The rulesets are committed under `.github/rulesets/`:

| File | Ruleset | What it does |
| --- | --- | --- |
| `main.json` | Protect main | Guards the default branch. It blocks deletion and force pushes, requires linear history, PRs with Code Owner review and squash merges only, the `protected-paths`, `ownership`, `audit` and `fixtures` checks, and the merge queue. |
| `agent-push.json` | Agent pushes | Restricts `creation`, `update` and `deletion` on every branch except `story/**`, `main` (guarded by `main.json`) and `gh-readonly-queue/**` (the merge queue's own branches). It is committed as `"enforcement": "disabled"` through Phase 0 ([decisions/MAINT-2026-10-17-epic-1-items.md](../../decisions/MAINT-2026-10-17-epic-1-items.md), Epic 1 items 9 and 12): no non-admin identity pushes yet, and GitHub did not honour its `gh-readonly-queue/**` exclusion, so it blocked the merge queue. It is re-enabled at the Epic 8 checkpoint. |
| `agent-tags.json` | Agent tags | Restricts `creation`, `update` and `deletion` on every tag. |

Each ruleset has exactly one bypass actor, `OrganizationAdmin`. CI never holds an admin token.

## One-time setup (Maintainer)

1. **Create the agent account.** Use a separate GitHub user, such as `xaravel-agent`. Never use the Maintainer's own account. Do not make it an org owner. Keep it out of every team that has admin rights.
2. **Give it `write` on the repository.** Go to the repository's Settings → Collaborators and teams, add the account, and choose the **Write** role. `triage` also passes the check, but it cannot push. Never give it **Maintain** or **Admin**.
3. **Give it one credential.** Pick one of these:
   - **SSH key.** Generate a key on the agent host (`ssh-keygen -t ed25519 -C xaravel-agent`). Add the public key to the agent account under Settings → SSH and GPG keys, and point the host's git remote at `git@github.com:xaravel/framework.git`.
   - **Fine-grained personal access token.** Create it on the agent account with access to `xaravel/framework` only. Grant *Contents: read and write*, *Pull requests: read and write* and *Metadata: read*, set an expiry, and store it only on the agent host.

   Never give the agent account npm credentials, an `APP_KEY`, or a token for any other account (AD-18).
4. **Apply the rulesets.** From a checkout of `main`, using the Maintainer's admin token:

   ```sh
   GH_TOKEN="$(gh auth token)" bun run ruleset:apply
   ```

   `apply` matches each committed ruleset to the live one by name. It updates the live ruleset when one exists and creates it otherwise. `apply` and `verify` refuse two committed files with the same ruleset name, and `apply` matches every name and checks the policy of `main.json` before it writes anything, so an ambiguous live name or a policy violation writes nothing. Run it again whenever a file under `.github/rulesets/` changes on `main`.

## Secrets

CI holds only these secrets. Each lives in one GitHub environment, so only the job that names that environment can read it:

| Secret | Environment | Job | What it is |
| --- | --- | --- | --- |
| `ORACLE_SIGNING_KEY` | `oracle`, restricted to the `main` branch | `oracle.yml#oracle`, `oracle.yml#story` | The Ed25519 private key (PKCS#8 PEM) that signs Oracle fixtures. Its public half is `conformance/oracle/oracle.pub`, and its fingerprint is in [oracle.md](oracle.md#fixture-format-and-signature). |
| `XARAVEL_ORACLE_APP_KEY` | `oracle`, restricted to the `main` branch | `oracle.yml#story` | The private key of the `xaravel-oracle` GitHub App ([below](#the-xaravel-oracle-github-app)). Only the pinned `actions/create-github-app-token` step reads it, to mint a short-lived installation token. |

The App's ID is the repository variable `XARAVEL_ORACLE_APP_ID` (not a secret).

The Maintainer generates the Oracle key pair off the agent host, stores the private key only as this secret, and commits the public key ([oracle.md](oracle.md#maintainer-run-steps)). The agent account never sees it, and no tool writes it to disk.

## The `xaravel-oracle` GitHub App

The Oracle commits signed fixtures for a Story's per-Story requests to the Story branch, and comments on the Story PR, as the GitHub App `xaravel-oracle` ([oracle.md](oracle.md#per-story-requests-bun-run-oraclestory)), never as a person or the agent account. Its commits are the App's bot user's. Only `oracle.yml#story`, running main's code under `pull_request_target`, mints its token.

One-time setup (Maintainer):

1. Create a GitHub App owned by the organisation, named `xaravel-oracle`, with no webhook. Give it the repository permissions *Contents: read and write*, *Pull requests: read and write* and *Metadata: read*, and nothing else.
2. Install it on `xaravel/framework` only.
3. Generate a private key for it on a Maintainer machine. Store it as the secret `XARAVEL_ORACLE_APP_KEY` of the environment `oracle`, then delete the downloaded file. Store the App ID as the repository variable `XARAVEL_ORACLE_APP_ID`.
4. Do not add the App as a ruleset bypass actor. It pushes only to `story/*` branches, which the rulesets leave open; `main` stays reachable only through PRs.

## Bootstrapping

The PR that first added `tools/ruleset/` and the `merge_group` triggers (Story 1.7) couldn't pass the merge queue. Its merge group checked out a base commit that didn't have that tool yet, so the `protected-paths` and `ownership` checks failed there. An org admin merged that one PR with the bypass. After that, queue runs work. A later PR that moves or renames `tools/ruleset/ruleset.ts`, or changes how the workflows call `merge-group-pr`, needs the same bypass, because the merge group runs the base commit's copy of the tool.

## Checking the setup

Run the identity check. Without `--agent`, any token that can read the repository works. With `--agent`, the token must also read the org's members and have push access to the repository:

```sh
GH_TOKEN="$(gh auth token)" bun run ruleset:identity --agent <login>
```

It reads the rules active on the probe refs `planning/probe`, `bot/probe` and `release/probe`; each must have `creation` and `update`. `main` must have `pull_request`, and `story/probe` must have none of `creation`, `update` and `pull_request`. It also checks that the live **Agent tags** ruleset is active and excludes no tags. With `--agent`, it checks that the login's repository role is `write` or `triage` and that the login is not an org admin. To read the role, `--agent` also calls `GET /repos/<repo>/collaborators/<login>/permission`, which needs a token with push access to the repository. It exits 0 when everything holds. Otherwise it exits 1 and prints one `identity:` line per problem.

To confirm the committed rulesets match the live ones, run:

```sh
GH_TOKEN="$(gh auth token)" bun run ruleset:verify
```

`verify` prints a `ruleset drift:` line for each difference and a `missing ruleset:` line for each committed ruleset with no live counterpart. It prints a `policy:` line when `main.json` is not active or does not apply to exactly the default branch, when a required check is missing or not pinned to GitHub Actions, when a rule it needs (deletion, force-push, PR with Code Owner review, linear history or the merge queue) is missing, when a bypass actor is not `OrganizationAdmin`, or when the org has an admin other than the Maintainer.

Without `GH_TOKEN` (unset or empty), `verify`, `apply` and `identity` never contact GitHub. Once the committed rulesets pass their local checks, each exits 1 with `Ruleset check failed: GH_TOKEN is not set, so the live rulesets cannot be read; run with GH_TOKEN="$(gh auth token)" (AD-16)`.

The workflow permissions check, `bun run workflows:check`, fails when `.github/workflows` is missing or holds no workflows.

As a final check, push a throwaway branch as the agent. A `planning/…` push must be rejected, and a `story/…` push must succeed.
