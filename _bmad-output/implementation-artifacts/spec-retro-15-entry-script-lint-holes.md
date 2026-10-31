---
title: 'Close the entry-script lint holes (epic-15-retro-item-4)'
type: 'bugfix'
created: '2026-10-30'
status: 'done'
baseline_revision: '161372b58375225f67a00f9327d52c706bfd85c3'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/ESC-15.3-1.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-retro-2026-10-30.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `tools/entry-scripts/entry-scripts.ts` (ESC-15.3-1, FR-20.2) splits a script on whitespace and checks only a leading `bun` word, so it reports compliant for `bunx foo`, `env A=1 bun test`, `exec bun test`, `time bun test`, `(bun test)`, `echo $(bun x.ts)`, `./node_modules/.bin/bun test`, `/usr/bin/bun t.ts` and `A='x y' bun test` (retro L1). It reads only the root, `skeleton/` and `packages/*` `package.json`. Probed on Bun 1.4.3: `--no-env-file` does not reach a package bin's child process (`bunx pr`, `bun --no-env-file x pr`, `bun --no-env-file --bun pr`, `bun --no-env-file run pr` all autoload `.env`), and the root `bunfig.toml` `env = false` is read only from the cwd, so it covers root scripts but not a workspace package's scripts (cwd = package dir).

**Approach:** Replace the whitespace split with a small quote-aware shell reader: split on unquoted `&&`, `||`, `;`, `|`, `&`, newlines and `(`/`)`; read `'…'`, `"…"`, `\`; read `$( … )` and backtick substitutions as nested scripts; then, per simple command, skip `NAME=value` assignments and the wrappers `env` (with its options and assignments), `exec`, `time`, `command`, `nohup`, recurse into `sh|bash|zsh|dash -c <string>`, and treat a word whose basename is `bun` or `bunx` as Bun. Report bin launches (`bunx`, `bun x`, and a `bun` target that is not a builtin subcommand, a file path or a script of the same `package.json`) as unable to carry the flag outside the root `package.json`; in the root they are covered by `bunfig.toml` `env = false`, which an XT case proves by running them. Read every root `workspaces` glob's `package.json` too, except under `node_modules/` or a `fixtures/` segment.

## Boundaries & Constraints

**Always:** Keep the existing exports, the existing violation message and XT-conformance-272 passing unchanged. Fail closed: a script the reader cannot parse (unterminated quote or substitution) or an unreadable `workspaces` value is a violation. Violations are sorted per file in file order and stable. New cases go in a new `XT-conformance-273` in `conformance/tests/xaravel/entry-scripts.test.ts`. Update the tool header, `docs/ops/ci.md`'s `entry-scripts:check` paragraph, and the retro finding L1 note.

**Never:** Edit or remove an existing assertion; edit `packages/**`, `AGENTS.md`, `bunfig.toml`, Expectations, decision records or another tool. No new dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| wrappers/prefixes | `env A=1 bun test`, `env -i -u X bun t.ts`, `exec bun test`, `time -p bun test`, `command bun t.ts`, `nohup bun t.ts`, `A='x y' bun test`, `A="a;b" bun test` | lacks flag | each reported as `bun command lacks --no-env-file` |
| path / subshell | `./node_modules/.bin/bun test`, `/usr/bin/bun t.ts`, `(bun test)`, `{ bun test; }`, `echo $(bun x.ts)`, ``echo `bun x.ts` ``, `echo "$(bun x.ts)"`, `sh -c 'bun t.ts'`, `bun --no-env-file a.ts & bun b.ts` | lacks flag | reported |
| quoted text | `echo "bun t.ts; bun u.ts"`, `echo 'bun x'`, `2>&1 bun --no-env-file t.ts` | not a bun command / passes | none |
| bin forms, package | `packages/a`: `bunx tsc`, `bun --no-env-file x tsc`, `bun --no-env-file --bun tsc`, `bun --no-env-file run tsc` | `scripts.<name>: bunx or a package bin cannot carry --no-env-file; Bun's .env autoload reaches its child process (FR-20.2)` | violation |
| bin forms, root | same scripts in root `package.json` | pass (`bunfig.toml` `env = false`) | none |
| not bins | `bun --no-env-file run other` (script `other` exists), `bun --no-env-file test`, `bun --no-env-file src/x.ts`, `bun --no-env-file x.mjs` | pass | none |
| unparseable | `bun "a.ts`, `echo $(bun a.ts` | `scripts.<name>: cannot be read as a shell command: <reason>` | violation |
| workspaces | root `workspaces: ["tools/*"]` with `tools/t/package.json` `bun t.ts`; `tools/t/fixtures/x/package.json`; `workspaces: {packages: [...]}`; `workspaces: 3` | `tools/t` reported; fixture skipped; object form read; non-array is a violation | fail closed |

</intent-contract>

## Code Map

- `tools/entry-scripts/entry-scripts.ts` -- whole tool: `splitCommands` (:42), `bunArguments` (:50), `lacksFlag` (:60), `packageFiles` (:82), `checkPackageJson` (:99, root iff `file === "package.json"`). Keep every export's signature.
- `conformance/tests/xaravel/entry-scripts.test.ts` -- XT-conformance-272 (read-only); its `withRoot`/`run` helpers are reused by XT-conformance-273. 272 asserts `lacksFlag("bunx tsc") === false` and `"echo bun"` false: bin forms are a separate violation, not `lacksFlag`.
- `package.json` -- root `workspaces` (`packages/*`, `skeleton`, `installer`, `tools/*`); root scripts use `bun --no-env-file --bun tsc|oxlint` (bin forms, covered at root). No other workspace has `scripts` today.
- `packages/config/tests/xaravel/env-autoload.test.ts:158` -- runs the CLI over a fixture and the repo; must stay green (read-only).
- `docs/ops/ci.md:21` -- the check's description.

## Tasks & Acceptance

**Execution:**
- `tools/entry-scripts/entry-scripts.ts` -- add the shell reader and per-command analysis, the bin-form and parse-error violations, workspace discovery; update the header comment.
- `conformance/tests/xaravel/entry-scripts.test.ts` -- add XT-conformance-273 covering every matrix row, plus a real run in a temp root with a fake `node_modules/.bin` bin and a `.env`: with root `bunfig.toml` `env = false`, `bunx`/`bun --no-env-file --bun <bin>` see no `.env` key; in a workspace package dir they do.
- `docs/ops/ci.md` -- describe the forms read, the bin rule and why root bin launches pass.

**Acceptance Criteria:**
- Given the repository, when `bun run entry-scripts:check` runs, then it exits 0.
- Given each matrix input, when the check runs over a fixture root, then it prints exactly the expected lines and exit code.

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 37 findings — high 0, medium 13, low 17, false 7, maybe-false 0 (4 lows rejected)
- findings:
  - (blind) `[low]` `[reject]` `bun i`/`a`/`rm` and `audit`… need the flag though their long forms are exempt — pre-existing (they lacked it before too) and XT-conformance-272 asserts the exact PM_SUBCOMMANDS list; widening it means editing a grader assertion; fails loud, not open.
  - (blind) `[medium]` `[patch]` root bin exemption trusts `bunfig.toml` without reading it — patched: exemption only when the root `bunfig.toml` has a top-level `env = false`.
  - (blind) `[medium]` `[patch]` a root script that `cd`s or passes `--cwd` keeps the exemption — patched: such a script's bin launches are violations in the root too.
  - (blind) `[medium]` `[patch]` other wrappers and expansion-built heads pass silently — patched: an expansion head fails closed; the unlisted wrappers are documented as limits.
  - (blind) `[low]` `[patch]` exported functions throw an unexported ShellReadError — patched: exported and documented.
  - (blind) `[low]` `[patch]` ci.md under-describes the fail-closed reasons and reader forms — patched.
  - (blind) `[low]` `[patch]` FILE_TARGET reads `index.html`/`data.json` as bins — patched: any `.ext` target is a file.
  - (blind) `[low]` `[patch]` the Bun probe never runs `bunx` — patched: run when `bunx` sits beside the Bun executable.
  - (blind) `[medium]` `[patch]` the probe uses the real HOME, so a global bunfig can flip it — patched: HOME is the temp dir.
  - (blind) `[low]` `[patch]` workspace `!` exclusions untested — patched: a `!` glob case.
  - (blind) `[false]` `[reject]` spec missing from the diff, no registry entry for XT-conformance-273 — the spec is excluded from the reviewed diff by design (claims file); Xaravel Test IDs have no registry (XT-conformance-272 has none); item status changes through SPS.
  - (edge) `[medium]` `[patch]` backslash-newline makes an empty head word — patched.
  - (edge) `[medium]` `[patch]` substitutions inside `${…}`/`$((…))` missed — patched: bodies read as nested scripts.
  - (edge) `[medium]` `[patch]` unlisted wrappers (timeout, xargs…) — same root cause as blind 4; documented limits plus expansion-head fail-closed.
  - (edge) `[medium]` `[patch]` `time -o/-f` value read as head — patched.
  - (edge) `[low]` `[patch]` `bash -O opt -c` misses -c — patched.
  - (edge) `[low]` `[patch]` `function f { … }` misread — patched.
  - (edge) `[medium]` `[patch]` `$BUN t.ts` passes — same as blind 4; patched fail-closed.
  - (edge) `[low]` `[patch]` `workspaces: {packages: null}` read as [] — patched: fails closed.
  - (edge) `[medium]` `[patch]` probe HOME — same as blind 9.
  - (edge) `[low]` `[patch]` `/usr/bin/env bun` shebang depends on PATH name — patched: shebang is `process.execPath`.
  - (edge) `[medium]` `[patch]` root `cd`/`--cwd` — same as blind 3.
  - (edge) `[low]` `[patch]` ShellReadError not exported — same as blind 5.
  - (verification-gap) `[medium]` `[patch]` `env -S`, `bun exec`, `<( )`, `|&` never run in a test — patched: rows added.
  - (verification-gap) `[low]` `[patch]` `command -v`, `--filter`, `!` globs, other fail-closed reasons untested (filed defer) — cheap to cover, so patched: rows added.
  - (verification-gap other) `[medium]` `[patch]` `${ … $( ) }` fails open — same as edge 2.
  - (verification-gap other) `[low]` `[reject]` `case … in a)` fails with a misleading `unmatched )` — fails closed; no script uses `case`; handling it adds a parser branch.
  - (verification-gap other) `[low]` `[reject]` wrappers outside the list — same as blind 4, documented as a limit.
  - (intent) `[false]` `[reject]` bunx not reported by `lacksFlag` — XT-conformance-272 asserts `lacksFlag("bunx tsc") === false`; bunx is its own rule at the check surface, which is the surface the intent's "report it" names.
  - (intent) `[low]` `[patch]` the root exemption is proved on a fixture bunfig, not the real one — patched with blind 2: the tool now reads the real root `bunfig.toml`.
  - (intent) `[low]` `[reject]` `fixtures/` matched by literal segment, not by role — the repo's fixture directories are all named `fixtures/`; widening would guess at names.
  - (intent) `[false]` `[reject]` one XT ID instead of one per form — the action asks for cases, and each form is its own assertion row.
  - (intent) `[low]` `[patch]` L1's literal `time bun test` not asserted — patched: row added.
  - (intent) `[false]` `[reject]` docs and the retro note are outside the named surfaces — the docs are the action's "document" arm; the retro note records the fix under its finding as step D requires.
  - (intent) `[false]` `[reject]` no weakening found — informational; XT-conformance-272 unchanged.
  - (intent) `[false]` `[reject]` new fail-closed violations are new surface — stricter only; the spec's Always rule asks to fail closed.
  - (intent) `[false]` `[reject]` `splitCommands` now throws — `ShellReadError` is exported and documented (blind 5); the only callers are the CLI and tests.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-conformance-27*'` -- expected: no difference
- `bun run entry-scripts:check && bun run typecheck && bun run lint` -- expected: success

## Auto Run Result

Status: done

- **Change:** `entry-scripts:check` reads each script with a quote-aware shell reader. It recognises `env`/`exec`/`time`/`command`/`nohup` wrappers, `NAME=value` prefixes with quoted values, a path-qualified `bun`, subshells, groups, `$( )`, backticks, `${…}`/`$((…))` bodies, `sh -c`, `env -S` and `bun exec`. It fails closed on scripts it cannot read and on expansion-built command names. It reports `bunx` and package-bin launches, which cannot pass `--no-env-file` on (probed on Bun 1.4.3). They are exempt only in the root `package.json`, and only when the root `bunfig.toml` has a top-level `env = false` and the script does not `cd`/`pushd` or pass `--cwd`. It reads every root `workspaces` glob's `package.json`, except under `node_modules/` or `fixtures/`.
- **Files:**
  - `tools/entry-scripts/entry-scripts.ts`: the reader, rules 1 and 2, workspace discovery and the bunfig check.
  - `conformance/tests/xaravel/entry-scripts.test.ts`: the new XT-conformance-273, including a real Bun probe. `withRoot` now writes the repository's `env = false` `bunfig.toml` by default; no XT-conformance-272 assertion changed.
  - `docs/ops/ci.md`: the check's paragraph.
  - `epic-15-retro-2026-10-30.md`: the L1 "Fixed" note.
- **Review:** 37 findings. 26 were patched (13 medium, 13 low) and none deferred. 11 were rejected: 7 false, and 4 lows (the `bun i` aliases are pinned by XT-conformance-272's PM list; `case` fails closed; unlisted wrappers are a documented limit; the `fixtures/` segment matches the repo's convention). See the triage log.
- **Follow-up review recommended:** true, because 13 medium entries were patched. The unverified risk is the patched rule-2 logic (the `cd`/`--cwd` detection and the bunfig top-level parse), which no second reviewer has read.
- **Verification:**
  - `bun run harness --xaravel`: 522 passed, 0 failed, 5 skipped, no difference.
  - `bun run entry-scripts:check`: OK, 79 commands in 57 files.
  - `bun run typecheck` and `bun run lint`: clean.
- **Residual risks:**
  - The reader approximates POSIX shell and does not look through `nice`, `timeout`, `xargs`, `sudo`, `stdbuf`, `cross-env`, `concurrently` or `sh <file>`.
  - An expansion-built head such as `$npm_execpath` fails closed.
