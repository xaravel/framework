# Identities and repository rulesets

Framework Agents push as a separate GitHub account, the **agent identity**. Repository rulesets let that identity create, update or delete only `story/*` branches. Everything else reaches `main` through a PR and the merge queue (AD-16, AD-28). The Maintainer stays the only org admin. Only org admins can bypass a ruleset.

The rulesets are committed under `.github/rulesets/`:

| File | Ruleset | What it does |
| --- | --- | --- |
| `main.json` | Protect main | Guards the default branch. It blocks deletion and force pushes, requires linear history, PRs with Code Owner review and squash merges only, the `protected-paths`, `ownership` and `audit` checks, and the merge queue. |
| `agent-push.json` | Agent pushes | Restricts `creation`, `update` and `deletion` on every branch except `story/**`, `main` (guarded by `main.json`) and `gh-readonly-queue/**` (the merge queue's own branches). |
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

   `apply` matches each committed ruleset to the live one by name. It updates the live ruleset when one exists and creates it otherwise. Run it again whenever a file under `.github/rulesets/` changes on `main`.

## Checking the setup

Run the identity check, with any token that can read the repository and the org's members:

```sh
GH_TOKEN="$(gh auth token)" bun run ruleset:identity --agent <login>
```

It reads the rules active on the probe refs `planning/probe`, `bot/probe` and `release/probe`; each must have `creation` and `update`. `main` must have `pull_request`, and `story/probe` must have none of the three. It also checks that the live **Agent tags** ruleset is active. With `--agent`, it checks that the login's repository role is `write` or `triage` and that the login is not an org admin. It exits 0 when everything holds. Otherwise it exits 1 and prints one `identity:` line per problem.

To confirm the committed rulesets match the live ones, run:

```sh
GH_TOKEN="$(gh auth token)" bun run ruleset:verify
```

`verify` prints a `ruleset drift:` line for each difference and a `missing ruleset:` line for each committed ruleset with no live counterpart. It prints a `policy:` line when a required check, linear history or the merge queue is missing, when a bypass actor is not `OrganizationAdmin`, or when the org has an admin other than the Maintainer.

As a final check, push a throwaway branch as the agent. A `planning/…` push must be rejected, and a `story/…` push must succeed.
