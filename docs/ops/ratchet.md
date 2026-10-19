# The Ratchet and line ownership

The Ratchet keeps conformance from moving dishonestly (FR-3, AD-15, AD-16, AD-28; Story 5.6). It has two halves:

- the `ratchet` check, which runs the full [harness](harness.md) and fails on any result that differs from the [Expectations File](expectations.md) in a way the run is accountable for;
- the line rules of the ownership check, which stop a PR from rewriting Expectations lines or `portedTest` blocks it does not own, or demoting a `pass` without an approved Escalation.

## The `ratchet` command

```sh
bun run ratchet run [--root <dir>] --ref <head-ref>
bun run ratchet overlay --base <dir> --head <dir>
```

The script is `bun tools/ratchet/ratchet.ts`. Exit codes: 0 when nothing fails (warnings never do); 1 when there is an unexpected failure or an owned unexpected pass, when the harness fails a precondition, or when the Story manifests cannot be read; 2 on a usage error (an unknown or repeated flag, a missing value, `run` without `--ref`).

`run` runs the harness over the root in full mode (no filter, no sample) and classifies each difference it counted:

| Line (stdout) | When | Counts as |
| --- | --- | --- |
| `UNEXPECTED-FAILURE <difference>` | every difference except an unexpected pass: `FAIL`, `FLOOR`, `SKIPPED`, `MISSING`, `UNKNOWN`, `ERROR`, and with `CI=true` the `NOT-RUN` of an alpha Variant | a failure, on every ref |
| `UNEXPECTED-PASS <id> [<variant>] …` | an unexpected pass whose Test ID the run's own Story owns: the ref is `story/<id>` and open Story `<id>` owns it | a failure |
| `WARNING UNEXPECTED-PASS … (owned by open Story <s>; fails that Story's next run)` | an unexpected pass owned by another open Story | a warning |
| `WARNING UNEXPECTED-PASS … (owned by no open Story)` | an unexpected pass no open Story owns (on `main`, every unexpected pass is one of these two warnings) | a warning |

When the harness exits non-zero but counted no difference at all, `run` adds `UNEXPECTED-FAILURE harness exited <n> with no counted difference` and counts it as a failure (fail closed). The last line is `RATCHET ref=<ref> failures=<f> passes=<p> warnings=<w>`. Under `GITHUB_ACTIONS=true` each warning is also printed as a `::warning::` annotation. The harness's own report (its NOT-RUN, difference and SUMMARY lines) and its diagnostics go to stderr. A harness precondition failure prints no `RATCHET` line.

A Story is open when its effective status (sprint status through `sprint_key`, as `ownership:check` reads it) is not `done`. It owns a Test ID `X#k` (a dataset row) when its `test_ids` list `X#k` or `X`.

An unowned or foreign unexpected pass is a warning on PR runs too, not only on `main`. The ownership rules forbid a Story from editing a line outside its `test_ids`, so failing its run would leave the PR no legal fix. The owner's next run fails, and Story 5.8's promotion bot handles passes no open Story owns.

## The overlay

`overlay` makes the head tree's grader the base's. For every file present in either tree that the base's `conformance/protected-paths` matches (with the base's active Phases), and for the base's sprint status (`_bmad-output/implementation-artifacts/sprint-status.yaml`, which decides which Stories are open), the head's copy becomes the base's: it is copied over, or deleted when the base has none. Symlinks are never followed: a head symlink at such a path, or at one of its parent directories, is removed before the base's file is written. The top-level `.git` and `node_modules` are skipped; a nested `node_modules` under a Protected Path is restored like any other file. Everything else in the head stays the PR's code.

So the harness, `tools/`, `@xaravel/assert` and `@xaravel/mockery`, `stories/`, the root `bunfig.toml`, `package.json` and `bun.lock` are the base's at the start of every PR run, as are its Story manifest and whether its Story is open. The overlay runs once, before the PR's tests: code those tests run in-process has write access to `pr/` and is not contained, as with any test runner. The Ratchet's outcome comparison and review guard that.

## CI (`.github/workflows/ratchet.yml`)

Job `ratchet` runs on `pull_request_target` into `main` (opened, synchronize, reopened, ready_for_review) and on push to `main`, with `permissions: contents: read`, no secrets, and `persist-credentials: false` on every checkout:

1. It checks out the base commit at `.` and, on a PR, the PR head at `pr/`.
2. It runs `bun tools/ratchet/ratchet.ts overlay --base . --head pr`, then `bun install --frozen-lockfile --ignore-scripts` in `pr/`.
3. It runs `bun tools/ratchet/ratchet.ts run --root pr --ref <head ref>` (the head ref reaches the shell only through env). On push it installs and runs `--root . --ref main`.

`CI=true` makes every alpha Variant run: the job has `postgres:18` and `redis:8.10.2` services, and sets `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `REDIS_HOST` and `REDIS_PORT` as the harness reads them. An unreachable alpha Variant is an unexpected failure.

The workflow runs PR code from a workflow and tool the PR cannot change (AD-28). Its safety rests on four things: `contents: read`, no secrets, `persist-credentials: false`, and the overlay. Because `pull_request_target` uses the base's copy of the workflow, the job did not run on Story 5.6's own PR; its first live run is the push to `main` after merge. Story 5.7 makes `ratchet` a required check and adds the merge-queue run.

## Line ownership

`bun tools/ownership/ownership.ts pr` (the `ownership` check) adds these rules to its path rules. They diff the PR head against its merge base (the compare API's `merge_base_commit`) over the changed files and each renamed file's previous name, reading content through the contents API. They compare only Expectations lines and the text of `portedTest` blocks: code outside a block (helpers, imports, setup) is not compared, and the Ratchet catches the outcome changes it causes.

- **Expectations lines** of `conformance/expectations/**/*.jsonl`, keyed by `(id, variant)` across all changed shards combined. A line moved unchanged between shards is no change; a line whose text differs, appears or disappears is changed. On a `story/<id>` branch each changed line's Test ID must be owned by that Story:
  `unowned expectation: <id> [<variant>] changes in <shard>, but Story <id>'s test_ids do not list it (AD-16)`
- **`portedTest` blocks** of `packages/*/tests/ported/**/*.test.ts`, keyed by id across all changed files combined (`tools/ownership/ported-blocks.ts`). The scanner skips strings, template literals, comments and regular expressions. An id resolves when it is a string literal, or a template whose every `${X}` is a top-level `const X = "<literal>"` declared once in the file. On a `story/<id>` branch each changed block's id `X` must be owned: `test_ids` lists `X` or one of its rows `X#<key>`. A Story listing any row `X#k` may change the block of `X`, since no manifest splits one test's rows across Stories:
  `unowned ported test: <id> at <file>:<line> changes, but Story <id>'s test_ids do not list it (AD-16)`
  A `portedTest` whose id does not resolve, including one that is aliased or not called directly, fails closed:
  `unresolved ported test id: <file>:<line> has a portedTest whose id is not a string literal or a template of top-level string constants; failing closed (AD-16)`
- **Pass demotion**, on every branch except `bot/*` (Story 5.8 owns the bot rules) and `planning/*` (which may not change Expectations at all): a key whose merge-base lines include `pass` and whose head lines do not, because the status changed or the line was removed, needs an approved Escalation listing its Test ID (or `X` for a row `X#<key>`):
  `pass demoted: <id> [<variant>] changes from pass to <status|removed> in <shard> with no approved Escalation listing it (AD-16)`
  An Escalation counts when `conformance/escalations/ESC-<id>.md` lists the Test ID (on the base, or in the PR head when the PR adds or changes it) and `decisions/ESC-<id>.md` on the base is `approved` and bound to that exact text by its `escalation_sha256`.

Everything fails closed: content the API cannot return, a changed file missing on the side the file list says it exists on, an unparsable Expectations line or an unbalanced Ported Test file is a violation, never a pass:

```
unreadable content: <path> at <sha> could not be read; failing closed (AD-16)
unparsable expectation: <path>:<line> at <sha> is not an Expectations line with a string id, variant and status; failing closed (AD-16)
unparsable ported test file: <path> at <sha>: <problem>; failing closed (AD-16)
```

The check reads content only for the files these rules judge, and fetches the merge base only when a file has a base side to read.
