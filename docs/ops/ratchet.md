# The Ratchet and line ownership

The Ratchet keeps conformance from moving dishonestly (FR-3, AD-2, AD-15, AD-16, AD-28; Stories 5.6 and 5.7). It has two halves:

- the `ratchet` check, a required check on `main`, which runs the [harness](harness.md) and fails on any result that differs from the [Expectations File](expectations.md) in a way the run is accountable for;
- the line rules of the ownership check, which stop a PR from rewriting Expectations lines or `portedTest` blocks it does not own, or demoting a `pass` without an approved Escalation.

## The `ratchet` command

```sh
bun run ratchet run [--root <dir>] --ref <head-ref> [--scope <file>]
bun run ratchet scope --base <dir> --head <dir> --out <file>
bun run ratchet story [--root <dir>] --ref <head-ref>
bun run ratchet overlay --base <dir> --head <dir>
```

The script is `bun --no-env-file tools/ratchet/ratchet.ts`. Exit codes: 0 when nothing fails (warnings never do); 1 when there is an unexpected failure or an owned unexpected pass, when the harness fails a precondition, when the Story manifests or the scope file cannot be read, or on any other failure; 2 on a usage error (an unknown or repeated flag, a missing value, `run` or `story` without `--ref`, `scope` without all three flags).

`run` runs the harness over the root in full mode (no filter, no sample), or over a scope (below), and classifies each difference it counted:

| Line (stdout) | When | Counts as |
| --- | --- | --- |
| `UNEXPECTED-FAILURE <difference>` | every difference except an unexpected pass: `FAIL`, `FLOOR`, `SKIPPED`, `MISSING`, `UNKNOWN`, `ERROR`, and with `CI=true` the `NOT-RUN` of an alpha Variant | a failure, on every ref |
| `UNEXPECTED-PASS <id> [<variant>] …` | an unexpected pass whose Test ID the run's own Story owns: the ref is `story/<id>` and open Story `<id>` owns it | a failure |
| `WARNING UNEXPECTED-PASS … (owned by open Story <s>; fails that Story's next run)` | an unexpected pass owned by another open Story | a warning |
| `WARNING UNEXPECTED-PASS … (owned by no open Story)` | an unexpected pass no open Story owns (on `main`, every unexpected pass is one of these two warnings) | a warning |

When the harness exits non-zero but counted no difference at all, `run` adds `UNEXPECTED-FAILURE harness exited <n> with no counted difference` and counts it as a failure (fail closed). The last line is `RATCHET ref=<ref> scope=<mode> failures=<f> passes=<p> warnings=<w>`, where `<mode>` is the scope's, `full` without `--scope`. Under `GITHUB_ACTIONS=true` each warning is also printed as a `::warning::` annotation. The harness's own report (its NOT-RUN, difference and SUMMARY lines) and its diagnostics go to stderr. A harness precondition failure prints no `RATCHET` line.

A Story is open when its effective status (sprint status through `sprint_key`, as `ownership:check` reads it) is not `done`. It owns a Test ID `X#k` (a dataset row) when its `test_ids` list `X#k` or `X`.

An unowned or foreign unexpected pass is a warning on PR runs too, not only on `main`. The ownership rules forbid a Story from editing a line outside its `test_ids`, so failing its run would leave the PR no legal fix. The owner's next run fails. On `main`, the promotion bot ([bots.md](bots.md)) opens a `bot/promote-…` PR for a pass no open Story owns, once it has passed on every rerun, and the quarantine bot quarantines a line whose result is inconsistent across reruns.

## The scope (Story 5.7)

`scope` compares the file contents of two trees (the top-level `.git` and every `node_modules` at any depth are skipped, so an installed tree compares equal to a fresh checkout, and so is either tree when it is nested inside the other, as CI's `pr/` is inside the base checkout; symlinks compare by target) and writes `{"mode":"full"|"components"|"none","components":[…],"reason":"…"}` to `--out`. Each changed path counts as:

| Changed path | Effect |
| --- | --- |
| `packages/<p>/**` | changes package `p` |
| `conformance/expectations/<c>/**`, `conformance/fixtures/<c>/**` | changes Component `c` |
| `docs/`, `_bmad-output/`, `stories/`, `conformance/escalations/`, `conformance/oracle-requests/`, `.github/`, any root `*.md` except `AGENTS.md` | nothing graded: the manifests are read from the base and the workflows run from it |
| anything else (`tools/`, the harness, `decisions/`, whose `DIV-<n>.md` the harness reads for assertion-floor waivers, `bunfig.toml`, `package.json`, `AGENTS.md`, …) | mode `full`; `reason` names the first such path in sorted order |

Otherwise `components` is the AD-2 reverse-dependency closure of the changed packages (`reverseClosure` in `tools/graph/graph.ts`: every package that reaches a changed one over any `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies` edge, the changed ones included, read from both trees so an edge the PR adds or removes still counts), plus the changed Components, intersected with the directory names under the head's `conformance/expectations/`. When that is empty the mode is `none`. Two cases are `full` instead, naming the path: a changed Component's data (`conformance/expectations/<c>/` or `conformance/fixtures/<c>/`) whose Component has no Expectations directory in the head, such as a deleted one; and a package in the closure with `packages/<p>/tests/ported/` in the head but no Expectations directory, whose Ported Tests only a full run reports as `UNKNOWN`.

`run --scope <file>` then grades only those Components (`runHarness(root, {components})`, the harness's `--component` selection; the UNKNOWN check still uses the whole Expectations File). In `none` mode it runs no harness and prints `RATCHET ref=<r> scope=none failures=0 passes=0 warnings=0`, exit 0. In `full` mode it is the full run.

Scope compares the base tip with the PR head, not git history: when `main` has moved on since the PR branched, the difference includes `main`'s own changes, which only widens the scope. It runs before the overlay, so a PR that edits a grader package (which the overlay then restores) still widens the scope.

## The Story's tests (Story 5.7)

`story` runs the harness over the `test_ids` of the Story a `story/<epic>.<story>` ref names (`harness --story <id>`), in full, never as a sample, with the inherited environment (in CI, `CI=true` makes every alpha Variant run). It prints the harness's report on stdout (diagnostics on stderr), then classifies the harness's differences exactly as `run` does: the same lines from the table above, the same `::warning::` annotations under `GITHUB_ACTIONS=true`, and the same fail-closed rules (unreadable Story manifests, a harness precondition failure, a non-zero harness exit with no counted difference). Its last line is the verdict

```text
STORY ref=<ref> failures=<f> passes=<p> warnings=<w>
```

and it exits 1 only when `failures + passes > 0`, not on the harness's code, so a run whose only differences are warned passes exits 0 (ESC-5.9-2). A harness precondition failure or unreadable manifests exit 1 with no `STORY` line. The done check's `full-run` clause reads this line ([done-check.md](done-check.md)). Exactly two cases skip, with exit 0:

- `STORY ref=<r> skipped: not a Story ref`, for any other ref;
- `STORY ref=<r> skipped: no test_ids`, for a manifest whose `test_ids` is empty (a Conformance System Story with only Xaravel Tests).

A missing or invalid manifest exits 1. The scope grades what a PR could break; `story` makes sure the Story's own Test IDs ran on every Variant even when they sit outside it.

## The overlay

`overlay` makes the head tree's grader the base's. For every file present in either tree that the base's `conformance/protected-paths` matches (with the base's active Phases), and for the base's sprint status (`_bmad-output/implementation-artifacts/sprint-status.yaml`, which decides which Stories are open), the head's copy becomes the base's: it is copied over, or deleted when the base has none. Symlinks are never followed: a head symlink at such a path, or at one of its parent directories, is removed before the base's file is written. The top-level `.git` and `node_modules` are skipped; a nested `node_modules` under a Protected Path is restored like any other file. Everything else in the head stays the PR's code.

So the harness, `tools/`, `@xaravel/assert` and `@xaravel/mockery`, `stories/`, the root `bunfig.toml`, `package.json` and `bun.lock` are the base's at the start of every PR run, as are its Story manifest and whether its Story is open. The overlay runs once, before the PR's tests: code those tests run in-process has write access to `pr/` and is not contained, as with any test runner. The Ratchet's outcome comparison and review guard that.

## CI (`.github/workflows/ratchet.yml`)

Job `ratchet` runs on `pull_request_target` into `main` (opened, synchronize, reopened, ready_for_review), in the merge queue (`merge_group`) and on push to `main`, with `contents: read` and `pull-requests: read`, no secrets, and `persist-credentials: false` on every checkout. [CI pipeline](ci.md) maps it into the whole AD-28 pipeline.

Only a same-repository PR's code runs. The PR checkout and every PR step below require `github.event.pull_request.head.repo.full_name == github.repository`, as `oracle.yml` does; without that guard a fork PR would skip first-time-contributor approval and run its own code in the base branch's cache scope. A fork PR fails closed: `ratchet` is a required check and a skipped required check counts as passing, so instead of skipping, the step "Refuse a fork PR" runs right after the base checkout, prints an `::error::` naming the fork (read through env only) and exits 1, before any PR code is fetched. Push the branch to this repository and open a new PR from it.

On a same-repository PR:

1. It checks out the base commit at `.` and the PR head at `pr/`.
2. `bun tools/ratchet/ratchet.ts scope --base . --head pr --out "$RUNNER_TEMP/ratchet-scope.json"`, before anything changes `pr/`.
3. `overlay --base . --head pr`, then `bun install --frozen-lockfile --ignore-scripts` in `pr/`.
4. `run --root pr --ref <head ref> --scope "$RUNNER_TEMP/ratchet-scope.json"`.
5. `story --root pr --ref <head ref>`.

The head ref reaches the shell only through env.

In the merge queue GitHub runs the workflow from the merge group commit, so the PR's own copy runs; its trust rests on the `pull_request_target` run of the base copy having gated the PR first, as in `ownership.yml`. The job checks out the group commit (`github.sha`), installs from its lockfile, takes the PR number from the queue ref (`bun tools/ruleset/ruleset.ts merge-group-pr`), reads the PR's head branch with `gh pr view <n> --json headRefName` (`GH_TOKEN: github.token`, the job's only use of `pull-requests: read`), and runs the full `run --root . --ref <head ref>`, so the Story's own unexpected passes still fail. The group commit holds every PR queued ahead of this one too, but it is graded under this PR's ref, so an unexpected pass owned by an earlier queued PR's Story is only a warning there. On push to `main` it installs and runs the full `run --root . --ref main`.

`CI=true` makes every alpha Variant run: the job has `postgres:18` and `redis:8.10.2` services, and sets `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `REDIS_HOST` and `REDIS_PORT` as the harness reads them. An unreachable alpha Variant is an unexpected failure. No step passes `--fast`.

The PR run executes PR code from a workflow and tool the PR cannot change (AD-28). Its safety rests on five things: the same-repository guard, `contents: read`, no secrets, `persist-credentials: false`, and the overlay. Because `pull_request_target` uses the base's copy of the workflow, a PR that changes this workflow is graded by the old copy: Story 5.7's scope and story steps first run on the PR after it merged.

## Line ownership

`bun tools/ownership/ownership.ts pr` (the `ownership` check) adds these rules to its path rules. They diff the PR head against its merge base (the compare API's `merge_base_commit`) over the changed files and each renamed file's previous name, reading content through the contents API. They compare only Expectations lines and the text of `portedTest` blocks: code outside a block (helpers, imports, setup) is not compared, and the Ratchet catches the outcome changes it causes.

- **Expectations lines** of `conformance/expectations/**/*.jsonl`, keyed by `(id, variant)` across all changed shards combined. A line moved unchanged between shards is no change; a line whose text differs, appears or disappears is changed. On a `story/<id>` branch each changed line's Test ID must be owned by that Story:
  `unowned expectation: <id> [<variant>] changes in <shard>, but Story <id>'s test_ids do not list it (AD-16)`
- **`portedTest` blocks** of `packages/*/tests/ported/**/*.test.ts`, keyed by id across all changed files combined (`tools/ownership/ported-blocks.ts`). The scanner skips strings, template literals, comments and regular expressions. An id resolves when it is a string literal, or a template whose every `${X}` is a top-level `const X = "<literal>"` declared once in the file. On a `story/<id>` branch each changed block's id `X` must be owned: `test_ids` lists `X` or one of its rows `X#<key>`. A Story listing any row `X#k` may change the block of `X`, since no manifest splits one test's rows across Stories:
  `unowned ported test: <id> at <file>:<line> changes, but Story <id>'s test_ids do not list it (AD-16)`
  A `portedTest` whose id does not resolve, including one that is aliased or not called directly, fails closed:
  `unresolved ported test id: <file>:<line> has a portedTest whose id is not a string literal or a template of top-level string constants; failing closed (AD-16)`
- **Pass demotion**, on every branch except `bot/*` (bounded instead by the bot rules below) and `planning/*` (which may not change Expectations at all): a key whose merge-base lines include `pass` and whose head lines do not, because the status changed or the line was removed, needs an approved Escalation listing its Test ID (or `X` for a row `X#<key>`):
  `pass demoted: <id> [<variant>] changes from pass to <status|removed> in <shard> with no approved Escalation listing it (AD-16)`
  An Escalation counts when `conformance/escalations/ESC-<id>.md` lists the Test ID (on the base, or in the PR head when the PR adds or changes it) and `decisions/ESC-<id>.md` on the base is `approved` and bound to that exact text by its `escalation_sha256`.

Everything fails closed: content the API cannot return, a changed file missing on the side the file list says it exists on, an unparsable Expectations line or an unbalanced Ported Test file is a violation, never a pass:

```
unreadable content: <path> at <sha> could not be read; failing closed (AD-16)
unparsable expectation: <path>:<line> at <sha> is not an Expectations line with a string id, variant and status; failing closed (AD-16)
unparsable ported test file: <path> at <sha>: <problem>; failing closed (AD-16)
```

### Bot PRs (Story 5.8)

A `bot/*` PR may change only `conformance/expectations/**` and `conformance/escalations/ESC-bot-<n>.md` (the path rule, `bot scope:`). On top of that:

- **Identity.** Its author (`GET /pulls/<n>` `user`) must be the `xaravel-bot` App, `{type: "Bot", login: "xaravel-bot[bot]"}`:
  `bot identity: <ref> was opened by <login> (type <type>), not the xaravel-bot App (xaravel-bot[bot]); only its bot/* PRs are exempt (AD-16)`
- **Status values only** (`botValueProblems`). Each changed `.jsonl` shard is read at the merge base and the head. A bot changes only a line's status triple, `status`, `reason` and `escalation`: no shard is added, removed or renamed, each shard keeps the same keys in the same order, and `id`, `variant`, `adapted` (and any other field) stay. A changed line's status must be `pass` (a promotion: `reason` null, `escalation` unchanged) or `quarantined` (a quarantine of a `pass` or `fail-known` line: `reason` null, `escalation` an `ESC-bot-<n>` whose file the same PR adds). Any other file under `conformance/expectations/` is a violation, and so is an `ESC-bot-<n>.md` the PR modifies, removes or renames: a bot only adds one. Each problem is one `bot value: …` line, and unreadable content fails closed as above.

The pass-demotion rule does not apply to `bot/*`: a quarantine moves a `pass` line to `quarantined` under its own new Escalation.

The check reads content only for the files these rules judge, and fetches the merge base only when a file has a base side to read.
