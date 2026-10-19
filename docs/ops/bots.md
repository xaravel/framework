# Bots: quarantine, promotion and Oracle Escalations

Story 5.8 (FR-3, AD-16, AD-28). Three commands in `tools/bots/bots.ts` (`bun run bots …`), run by `.github/workflows/bots.yml`. A bot only ever opens a `bot/*` PR to `main`; it never merges one.

## `detect`

```sh
bun tools/bots/bots.ts detect --root <dir> --ref <ref> --out <plan.json> [--runs <k>]
```

1. Runs the harness over the root in full (`runHarness(root, {env})`, every Variant; `CI=true` in the workflow) and takes every difference with a concrete Test ID as a candidate key `<id> [<variant>]`, sorted.
2. Over 50 candidates it proposes nothing and prints `BOTS-CAP <n> candidates exceed 50; no proposals`: a mass failure is not flakiness, and the Ratchet stays red.
3. Reruns the candidate IDs `k` times (default 3) with `--id` filters. A key's observations are the first run's difference kind, then for each rerun `match`, `unexpected-pass`, `unexpected-failure`, or `missing` when the rerun has no result for it.
4. Classifies each key:

| Observations | Line | Proposal |
| --- | --- | --- |
| a `match` and a difference (mixed) | `pass` or `fail-known` | quarantine |
| mixed | any other status | none (`BOT-NONE … mixed results on a <status> line`) |
| `unexpected-pass` on every run | no open Story owns the Test ID | promotion |
| `unexpected-pass` on every run | an open Story owns it | none (`BOT-NONE … owned by open Story <s>`); that Story's next run fails |
| `unexpected-failure` on every run | any | none (`BOT-NONE … consistent failure`): a real failure, the Ratchet stays red |
| anything else | any | none |

It writes the plan and prints one `BOT-QUARANTINE <id> [<v>] runs=<o1,o2,…>`, `BOT-PROMOTE <id> [<v>]` or `BOT-NONE <id> [<v>] <why>` line per key, then `BOTS ref=<r> quarantine=<q> promote=<p> none=<n>`. The harness report goes to stderr. It exits 0, 1 on a thrown error (a harness precondition failure, unreadable manifests), 2 on a usage error.

The plan (`.cache/bots/plan.json`):

```json
{"ref":"main","sha":"<head>","run":"<run url|local>","proposals":[
  {"kind":"quarantine","shard":"conformance/expectations/…","id":"…","variant":"none","before":"<line text>","after":{…},"observations":["unexpected-failure","match","match","unexpected-failure"]},
  {"kind":"promotion","changes":[{"shard":"…","id":"…","variant":"…","before":"…","after":{…}}]},
  {"kind":"escalation","file":"ESC-bot-1.md","text":"…","source":"<url>"}]}
```

## `collect`

```sh
bun tools/bots/bots.ts collect --from <dir> --source <run url> --out <plan.json>
```

Reads every `ESC-bot-*.md` under `<dir>` at any depth (the `oracle-escalation` and `oracle-determinism` artifacts of an `oracle` run). Each must pass `parseEscalation`; otherwise it exits 1 naming the file. A missing `<dir>` holds nothing. It writes one `escalation` proposal per file.

## `apply`

```sh
GH_TOKEN=<xaravel-bot token> bun tools/bots/bots.ts apply --plan <plan.json> --repo <owner/name>
```

Based on `main`'s tip, one branch per proposal:

| Proposal | Branch | Change |
| --- | --- | --- |
| quarantine | `bot/quarantine-<sha8(<id> [<variant>])>` | the line becomes `quarantined`, `reason` null, `escalation` a new `ESC-bot-<n>`; adds `conformance/escalations/ESC-bot-<n>.md` (`trigger: flaky`; the evidence holds the observations, the ref, head sha and run URL, and the full previous line to restore) |
| promotion | `bot/promote-<sha8(sorted keys)>` | each line becomes `pass`, `reason` null, `escalation` kept |
| escalation | `bot/oracle-esc-<sha8(file text)>` | adds the Oracle's file as `conformance/escalations/ESC-bot-<n>.md`, every whole-word `ESC-bot-<old>` in it (the heading included) rewritten |

- A branch that already exists prints `BOT-SKIP <branch> exists`. While an open PR whose head starts with `bot/oracle-esc-` (or `bot/promote-`) exists, a new escalation (or promotion) proposal waits: `BOT-SKIP <branch> pending`, so a recurring Oracle failure or a new unowned pass does not open an overlapping PR. A planned `before` line that is no longer in `main`'s shard prints `BOT-SKIP <branch> stale`.
- It rebuilds each line from `before` (never trusting the plan's `after`) and replaces exactly that line with `serialiseLine`; every other byte of the shard is kept.
- Each new `ESC-bot-<n>` is one past the highest on `main`'s `conformance/escalations/` and in the files of every open PR whose head starts with `bot/`. Two concurrent runs can still collide; the second PR then fails `escalations:check`, loudly.
- Before any write it runs the ownership check's `botValueProblems` and `parseEscalation` on the change, and refuses (`BOT-REFUSE <branch> …`) on any problem.
- It writes through the Git data API (blobs, a tree on `main`'s, a commit, the ref), opens a PR with the evidence, and prints `BOT-PR <url>`. When the PR cannot be opened it deletes the branch it just created, so the next run retries. It exits 1 if any write failed (`BOT-FAIL <branch> …`), otherwise 0.

## The workflow (`bots.yml`)

| Job | Runs when | Holds | Does |
| --- | --- | --- | --- |
| `detect` | a `ratchet` or `nightly` run on `main` from `push`, `schedule` or `workflow_dispatch` completes, or a manual dispatch from `main` | `contents: read`; no secret, no environment | Postgres 18 and Redis 8.10.2 services, `CI=true`; checks out the run's `head_sha`, runs `detect`, uploads `bot-plan` |
| `collect` | an `oracle` run on `main` from `push`, `schedule` or `workflow_dispatch` completes | `contents: read`, `actions: read` | checks out that run's `head_sha`, lists its artifacts and downloads `oracle-escalation` and `oracle-determinism` when present (an absent one is not an error; any API or download error fails the job), runs `collect`, uploads `bot-plan` |
| `open` | `detect` or `collect` succeeded | `contents: read`, `actions: read`; environment `bot`; concurrency group `bots-open`, one run at a time | checks out `main`, downloads `bot-plan`, mints the `xaravel-bot` token and runs `apply`. It runs no test and no harness |

`detect` runs graded code, so it never sees the App key; `open` runs only `main`'s `tools/bots` on a plan it re-validates. `workflow_run` always runs the default branch's `bots.yml`.

## The ownership check on bot PRs

A `bot/*` PR passes only when it comes from the `xaravel-bot` App and changes only status values ([ratchet.md](ratchet.md#bot-prs-story-58)). The check's OK line is `Ownership OK: PR #<n>: <ref> passed the bot rules (path, identity, status-only values).`

## Live-only paths and the Maintainer's steps

`bots.yml`, App-token PR creation and `workflow_run` chaining have never run live. The tests (XT-conformance-123..125, 189) run the tools against a fake GitHub API and check the YAML. Before the first live run the Maintainer:

1. Creates and installs the `xaravel-bot` App, the `bot` environment, the `XARAVEL_BOT_APP_ID` variable and the `XARAVEL_BOT_APP_KEY` secret ([identities.md](identities.md#the-xaravel-bot-github-app)).
2. Rules on [ESC-5.8-1](../../conformance/escalations/ESC-5.8-1.md): once `agent-push` is re-enabled at the Epic 8 checkpoint, it would block the App from creating `bot/*` branches.
3. Supervises the first run (a manual `workflow_dispatch` of `bots`) and reviews the PRs it opens.
