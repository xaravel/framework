# Fidelity Review

Every Story is reviewed against Upstream by two reviewer agents, separate from the implementer (FR-111, AD-15.8, Story 8.5). Since [ESC-8.5-1](../../decisions/ESC-8.5-1.md) the review runs in the loop, in `bmad-build-auto`'s review step, not in GitHub Actions. Each verdict is recorded in the Story's spec, bound to the tree it reviewed, and `story:check`'s `approvals` clause counts them ([done-check.md](done-check.md)). No workflow calls a model, and there are no reviewer Apps, environment or API key ([identities.md](identities.md#the-fidelity-review-has-no-identity)).

## What runs

`bmad-build-auto`'s review step has a layer `fidelity-review` (`_bmad/custom/bmad-build-auto.toml`). It runs only when the work is a Story with a manifest `stories/<id>.md`, alongside the four adversarial layers, and runs:

```sh
bun run fidelity:review review --story <id> --spec <spec file> --loop-cli <claude|codex>
```

`tools/fidelity-review/fidelity-review.ts` builds one prompt and runs two reviewer subprocesses on it, in parallel:

| Reviewer | CLI |
| --- | --- |
| 1 | the other CLI from the loop's: Codex (`codex exec`) for a `claude -p` loop, Claude (`claude -p`) for a Codex loop. When that CLI is unavailable, the loop's CLI, with the reason recorded. |
| 2 | the loop's CLI. |

The loop's CLI is `--loop-cli`, else the env var `XARAVEL_LOOP_CLI`, else `claude` when `CLAUDECODE` is set (Claude Code sets it). Otherwise the command is a usage error (exit 2).

The binaries are `XARAVEL_FIDELITY_CLAUDE_BIN` (default `claude` on `PATH`) and `XARAVEL_FIDELITY_CODEX_BIN` (default `codex` on `PATH`, else `~/.local/bin/codex`). `XARAVEL_FIDELITY_CLAUDE_MODEL` and `XARAVEL_FIDELITY_CODEX_MODEL` pick a model (`--model`, `-m`); unset, each CLI uses its own default. With no project settings, `claude -p` defaults to a weaker model than the loop's (`claude-sonnet-5-5` when probed), so the layer prefixes the command with `XARAVEL_FIDELITY_CLAUDE_MODEL=<the loop agent's own model id>` (for example `claude-opus-5-5`) when the loop runs Claude.

Claude Code strips `CLAUDE_CODE_OAUTH_TOKEN` from the env of the commands it runs, so a `claude -p` started from inside the loop is "Not logged in". When the env has no `CLAUDE_CODE_OAUTH_TOKEN` and the file named by `XARAVEL_FIDELITY_CLAUDE_TOKEN_FILE` (default `$HOME/.claude-auth-token`, the file `tools/orchestrator/run.sh` reads) exists, the tool sets `CLAUDE_CODE_OAUTH_TOKEN` to its content, trimmed, in the claude child's env only. The token is never printed or recorded.

### Unavailable and the fallback

A CLI is unavailable only when it is:

- **not installed**: the binary is not found, or cannot be started (`ENOENT`);
- **not signed in**: its output matches `NOT_SIGNED_IN_PATTERNS` (`not logged in`, `please run /login`, `not signed in`, `please log in`/`sign in`, `run codex login`, `401 Unauthorized`, `invalid api key`, `authentication_error`, `OAuth token has expired`);
- **refusing because of a usage limit**: its output matches `USAGE_LIMIT_PATTERNS` (`usage limit`, `limit reached`, `hit your limit`, `credit balance is too low`, `exceeded your current quota`, `insufficient_quota`, `out of credits`).

The patterns are case-insensitive and are checked only on a failed run (a non-zero exit, or Claude's `is_error` result), after every copy of the prompt is removed from the output: Codex echoes its prompt, and the diff could contain those words. Only these three cases send reviewer 1 to the loop's CLI. It records `fallback: "<other> unavailable: <not installed|not signed in|usage limit>: <excerpt>"`, with an excerpt of at most 200 characters of the matching output line. When the CLI a reviewer needs is unavailable and no fallback is left, that reviewer produces no verdict.

### Isolation

Each reviewer is a fresh context that is not the implementer:

- It runs in a new empty temporary directory, never the repository, which is removed afterwards.
- Its env is allow-listed: `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TMPDIR`, `LANG`, `TERM`, `LC_*` and `XDG_*`, plus `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` for Claude and `CODEX_HOME` for Codex. Nothing else in the loop's env (`GH_TOKEN`, …) reaches a reviewer, so a prompt-injected reviewer has no secret to quote into the spec.
- It gets the prompt on stdin and nothing else: no project settings, no session.
  - Claude: `claude -p --output-format json --json-schema <schema> --tools "" --setting-sources "" --strict-mcp-config --disable-slash-commands --no-session-persistence --system-prompt <system>`.
  - Codex: `codex exec --sandbox read-only --skip-git-repo-check --ephemeral --color never -C <tmp> --output-schema <file> -o <file> -`, with the system text prepended to the prompt. The schema and answer files sit in a second temporary directory. Codex is **not** tool-less: it keeps a read-only sandboxed shell. Its isolation is the empty working directory, the env allow-list and the prompt's instruction to use no tool and judge only the material given.
- It answers one JSON object, validated by the CLI against the verdict schema (`verdictSchema`, which enumerates the checklist's item ids) and then by `parseVerdict`.

Each attempt has a 15-minute timeout. The child leads its own process group, and on a timeout the whole group is killed, so a descendant holding its output open cannot keep the attempt alive. A malformed answer, a timeout or any other failure is retried once on the same CLI; after that the reviewer produces no verdict. Nothing calls a model API directly or reads an API key: the CLIs use their own sign-ins.

## Inputs

The tool reads everything from the working tree:

- the checklist, `conformance/review/fidelity.md` (Protected). Each `### F-<n>: <title>` heading is one item. A checklist with no item, a duplicate id or a malformed `### F-` heading fails closed;
- the manifest `stories/<id>.md`, and for each of its `test_ids` (with dataset rows `X#<key>`) the Inventory row and the Upstream lines its `source` names. When the snapshot or file is missing, the prompt says `Upstream source unavailable`, and the checklist tells the reviewer to fail F-1 if Ported Tests changed;
- the spec: `--spec`, else the one `_bmad-output/implementation-artifacts/spec-<a>-<b>-*.md` for Story `<a>.<b>`. No match, or more than one, fails naming them;
- **the diff**: `git diff-tree -p` between the base (`--base`, default the spec's `baseline_revision`, resolved to its commit sha, which is what the record holds) and the reviewed tree, both without `_bmad-output/`. Each file's hunks are shown; a change with no textual hunk (a mode change, an empty or binary file) appears as `(no textual change)`;
- the content of every changed `conformance/oracle-requests/*.jsonl`;
- the evidence the items need:
  - **(a) DIV records** (F-3, F-5): every `decisions/DIV-<n>.md` that an `adapted:DIV-<n>.<k>` token, an Expectations `"adapted":"DIV-<n>.<k>"` field or an `intentional-divergence:DIV-<n>` reason on an added (`+`) line cites, in full, with its `fewer_assertions` frontmatter;
  - **(b) consequences** (F-7): for every `FR-<n>.<k>` or `AD-<n>.<k>` token on an added line, its line from `conformance/xaravel-consequences/*.jsonl`, or `unknown consequence id` when no file has it;
  - **(c) error fixtures** (F-6): for every committed Oracle request whose id the manifest assigns (the lookup `story:check` uses), the fixture's id and `output.error` when it is not null, after `verifyFixture` accepts it against `oracle.pub`; and every fixture the change adds or modifies under `conformance/fixtures/`, with its request id and `output.error` when that is not null;
  - **(d) DIV-1** (F-9): `decisions/DIV-1.md`, when an added line contains `@asyncRoot`.

  A missing evidence file is named in the prompt (`unavailable: <why>`), never dropped.

The system text is the checklist, the `## Precedence` section of `conformance/README.md` (verbatim, so F-4 does not rely on a link) and the answering rules. The user text is the manifest, the Inventory rows with their Upstream lines, the Oracle requests, the patches and the evidence.

## The reviewed tree

A verdict is bound to a git tree id, `reviewTree(root, mode)`: the repository with `_bmad-output/` removed, written through a temporary index (`GIT_INDEX_FILE`), so the real index is never touched.

- Mode `worktree`: `HEAD` plus every tracked change and every untracked, non-ignored file. This is what the reviewers see, and what a verdict records.
- Mode `head`: the `HEAD` commit. `story:check` counts verdicts for this tree.

The spec and sprint status live under `_bmad-output/`, so recording a verdict or finishing the Story never makes a verdict stale, and a reviewed working tree committed unchanged has the same id as its head. Any other change after the review gives a new tree, and the verdicts no longer count until the layer runs again.

## The verdict and its record

Each reviewer answers every item exactly once: `pass`, `fail` or `n/a`, a non-empty note, and for a `fail` at least one finding with a `path` and a `detail`. A missing, extra or duplicate id, or any malformed answer, is a malformed verdict. A verdict is `pass` when no item is `fail`, else `reject`.

Each verdict is appended to the spec, under a `## Fidelity Review` section (created at the end of the file when absent; new records go at the end of the section). A record is:

- a heading `### Reviewer <n>: <pass|reject> at tree <tree>`;
- a line naming the CLI, the model, the loop's CLI, the base, the date and any fallback reason;
- a table with one row per item (result and note), then the findings of the `fail` items only. In this Markdown, model text has every newline replaced by a space and every backtick by `'`, so it cannot open a fence or a heading, and every `@` is followed by U+200B, so it cannot mention anyone;
- one fenced `json` block, `{"kind":"fidelity-verdict","reviewer","verdict","tree","base","cli","model","loop_cli","fallback","date","items"}`. This block is the record; the rest is for reading.

The model is read from Claude's `modelUsage` keys, or Codex's `model:` header line, else the configured model, else `unknown`. Records are append-only: the tool never edits an earlier one.

## Counting

`fidelityVerdicts(records, tree)` is shared by `fidelity:review status` and `story:check`. For each reviewer slot, 1 and 2, it takes the last record whose `tree` is `tree`. It passes when:

- both slots are `pass`, and
- slot 1's `cli` differs from its `loop_cli`, or its `fallback` is non-empty.

Two records from one slot are one verdict, never two. A malformed record (bad JSON, an unknown field value, or a `verdict` that disagrees with its items) fails the count, naming the record's line. Each counted record's items are also re-validated with `parseVerdict` against the root's checklist (every id once, a non-empty note, findings on every `fail`), and its `verdict` must be the one they decide; a record that fails is malformed.

## Exits and output

`review` prints one line per recorded verdict (`reviewer <n>: <pass|reject> (<cli>/<model>)`, plus `; fallback: …`), then one line per finding of a `reject`, `F-<n> <path>: <detail>`, then `NO-VERDICT reviewer <n>: <reason>` for each reviewer that produced no verdict, then `recorded <k> verdict(s) in <spec> for tree <tree>`. Retries and reviewers without a verdict are reported on stderr.

| Situation | Result |
| --- | --- |
| Both reviewers recorded `pass` | exit 0 |
| A `reject` was recorded, or a reviewer produced no verdict (its record is missing; the other reviewer's is still recorded) | exit 1 |
| An empty diff, a prompt over 600,000 characters, a missing or invalid manifest, a missing or ambiguous spec, no base, a malformed checklist, a git error | exit 1, nothing recorded, no reviewer run |
| No `--story`, a bad Story id or option, or no loop CLI | usage message, exit 2 |

`bun run fidelity:review status --story <id> [--spec <file>]` prints `current: …` and exits 0 when the counting passes for `reviewTree(root, "worktree")`. Otherwise it exits 1 and prints `stale: …` (verdicts exist, but none for this tree) or `missing: …` (a verdict is missing, a reject, the cross-model rule, or a malformed record), with one line per slot.

## In the review step

The layer reports each `F-<n> <path>: <detail>` line and each `NO-VERDICT` line as a finding, which triage routes like any other: a `reject` returns the Story to its implementer within the same build.

The layer names a Finalize re-check, `bun run fidelity:review status --story <id> --spec <spec>`. `step-04-review.md` runs it before writing `status: done`. When it does not print `current` (for example because a patch changed the tree after the layer ran), the layer runs again and its findings are triaged as a new review pass. Each such re-run counts as a review loop iteration; past 5 the build halts `blocked`.

## Cost

Each run is two reviewer calls, each with up to 600,000 characters of prompt (roughly 150,000 to 200,000 tokens), and up to four when both are retried, plus one more when reviewer 1 falls back. They are charged to the CLIs' own plans, not to an API key. Every re-run after a tree change costs the same again.

## Limits

- **Prompt injection.** The reviewers read the diff, which the implementer wrote. Text in it could try to steer a reviewer. The prompt says the change is evidence, not instructions, and to fail when unsure; Claude has no tools and Codex only a read-only sandboxed shell it is told not to use. That lowers the risk but does not remove it. A human Code Owner still reviews Protected Path changes.
- **No live run yet.** The tests use fake CLIs. Story 8.7's pilot is the first supervised run ([ESC-8.7-1](../../decisions/ESC-8.7-1.md)); it is also where the 600,000-character cap meets the real models' context windows.
- **The patterns are a guess at the CLIs' wording.** A sign-in or usage-limit message the patterns miss is an unclassified failure: the reviewer is retried once and then produces no verdict, which fails closed. Add the new wording to the pattern constants.
- **The records are trusted as written.** They live in the Story's spec, which is not a Protected Path, and `story:check` counts what is there: an agent could append a forged record. The append-only history in the spec, under version control, is the audit trail.
- **Re-runs are visible.** A `reject` is triaged like any other review finding. A re-run on an unchanged tree is recorded too and counts by its last record per slot, so the history shows every re-run, including one that turned a `reject` into a `pass` without a change.
- **A model reviewer can be wrong.** A `fail` that a human judges wrong is answered by a change and a new review; the last record per slot for the tree counts.
