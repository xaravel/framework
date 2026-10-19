# Xaravel Test coverage and the Story done check

Story 5.9 makes "done" computed rather than claimed (FR-111, FR-114, FR-115, AD-15, AD-16, AD-28). It adds two commands: `bun run xt:coverage`, which lists what no passing Xaravel Test covers, and `bun run story:check`, which checks a Story against the PRD §3 done definition. Both run the Xaravel Tests through the [harness's Xaravel run](harness.md#the-xaravel-run).

## Consequence files

`conformance/xaravel-consequences/<component>.jsonl` (Protected) lists the testable consequences of a Xaravel Component. `bun run xt:consequences` (`tools/xt-coverage/consequences.ts`) generates each file from the PRD and the architecture spine. Nobody edits them by hand. `bun run xt:consequences --check` writes nothing, and fails naming each file that differs from what it would write.

The IDs are mechanical:

| ID | Is |
| --- | --- |
| `FR-<n>.<k>` | the k-th (1-based) top-level bullet of FR-n's `**Consequences (testable):**` list in the PRD |
| `AD-<n>.<k>` | the k-th top-level bullet of AD-n's `**Rule:**` list in the spine |

A bullet's text is the bullet without its `- ` marker, with its nested lines, whitespace collapsed to single spaces. Each line is `{"id","text"}`, written with `JSON.stringify` and ending in LF. Every FR line (by n, then k) comes before every AD line (by n, then k). A PRD edit that adds, removes or reorders a bullet renumbers the IDs after it, and `--check` catches the drift.

The generator's map (`CONSEQUENCE_SOURCES`) has one row per Component. Today it has one row: `conformance` takes FR-1..9 and FR-111..116, and AD-15, 16, 17, 21 and 28 (the spine's Capability Map row for the Conformance System). The other Xaravel Components (htmx, boost, skeleton, installer, …) get their rows from [ESC-5.9-1](../../conformance/escalations/ESC-5.9-1.md).

## `bun run xt:coverage <component>`

```sh
bun run xt:coverage <component> [--root <dir>]
```

It runs the harness with `--xaravel` (every Xaravel Test, unfiltered) and prints one line per consequence that no passing Xaravel Test declares, in file order, then a summary line:

```
UNCOVERED <id>: <text>
XT-COVERAGE <component> consequences=<n> covered=<c> uncovered=<u>
```

An Xaravel Test declares consequence `X` when its consequence string (the second argument of `xaravelTest`) holds `X` as a whole token, matching `(?<![\w.-])(FR|AD)-\d+\.\d+(?![\w.])`. A bare `FR-3` declares nothing, and a cited ID the file does not hold prints `xt:coverage: warning: <xt id> declares <id>, which is not in <file>` on stderr. A consequence is covered when at least one test that passed in the run declares it. The test may be in any Component's directory, since the Conformance System spans `conformance/`, `packages/assert` and `packages/mockery`. A failing, late or skipped test covers nothing.

Exit codes: 0 when nothing is uncovered, 1 when something is, 2 on a usage error. A Component with no file fails with `xt:coverage: conformance/xaravel-consequences/<c>.jsonl does not exist`. The harness's own lines go to stderr.

The converted Xaravel Tests (every Xaravel Test in `conformance/tests/xaravel` and `packages/{assert,mockery}/tests/xaravel` (231 at merge)) cite FRs, not bullets (`(FR-3, AD-15)`), so `bun run xt:coverage conformance` fails today and lists nearly every consequence. That is correct: coverage is computed, not claimed. Mapping each test to the bullets it verifies is judgment that the Fidelity Review must check, and ESC-5.9-1 routes that work.

## `bun run story:check <story-id>`

```sh
bun run story:check <story-id> [--pr <n>] [--root <dir>]
```

It prints one line per clause, in this order, with each failing item on its own indented line (at most 20, then `  … <m> more`), and ends with the verdict:

```
PASS|FAIL <clause>: <detail>
  <failing item>
STORY-CHECK <story-id> pass|fail
```

| Clause | Passes when |
| --- | --- |
| `manifest` | `stories/<id>.md` parses with no violation (`parseManifest`). A manifest with no assigned tests (both `test_ids` and `xaravel_test_ids` empty) fails, and so does every clause that needs the manifest. |
| `tests` | in a full `bun run harness --story <id>` run (never fast), each Test ID × Variant line of `test_ids` either has status `pass` and does not differ, or is a `skip` whose reason is not `not-ported-yet` and that `checkLine` accepts. `fail-known`, `quarantined`, any difference (a run-level `ERROR` line included), a NOT-RUN Variant and an ID with no Expectations line all fail. The harness runs get the env without `GH_TOKEN` and `GITHUB_TOKEN`. With no `test_ids` it passes as `none assigned`. |
| `xaravel-tests` | every `xaravel_test_ids` entry passes in a Xaravel run filtered to those IDs. A skip fails, and so does an ID that no test declares or an `ERROR [xaravel]` line. |
| `fixtures` | every assigned ID (`test_ids` ∪ `xaravel_test_ids`) that is the `id` of a committed request (`conformance/oracle/requests/` or an accepted `conformance/oracle-requests/<story>.jsonl`, minus the requests listed in `conformance/oracle/nondeterminism.jsonl`) has `conformance/fixtures/<component>/<sha256>.json`, and `verifyFixture` accepts it against `conformance/oracle/oracle.pub`. A fixture whose `output.error` is not null (an evaluation error at any stage: `bindings`, `setUp`, `setup`, `tearDown`, `fatal` or `timeout`) also fails, naming the stage, unless the ID's Inventory `oracle` map is non-empty and every outcome in it is `fail`, that is, Upstream itself fails there. An Xaravel Test ID has no Inventory entry, so an error fixture always fails it. |
| `approvals` | the PR (`--pr`, else the most recently updated PR whose head is `story/<id>`, in any state) has at least two distinct `APPROVED` logins. Each reviewer counts by their latest `APPROVED`, `CHANGES_REQUESTED` or `DISMISSED` review, only when that review was given on the PR head commit (`commit_id`); the PR author never counts. A `--pr` whose head is not `story/<id>` fails this clause and `full-run`. |
| `escalations` | no `conformance/escalations/ESC-<id>-<n>.md` is `open` (`escalationStatus`). |
| `full-run` | among the PR head's workflow runs (`/actions/runs?head_sha=`), the latest one named `ratchet` has a job `ratchet` that concluded `success` and whose log (`/actions/jobs/<id>/logs`) ends in a `SUMMARY ` line that, with its timestamp removed, satisfies `isFullRun` and reads `differ=0`. The conclusion is checked first: a job that concluded anything else fails with `the ratchet job concluded <conclusion>, not success`, and one that has not finished (no conclusion yet) with `the ratchet job has not finished`. A fast run fails with `… was a fast run`, and one that differed with `… differed`. |

The GitHub clauses use `GITHUB_API_URL` (default `https://api.github.com`), the token in `GH_TOKEN`, and the repository in `GITHUB_REPOSITORY`, else the root's `origin` remote. With no `GH_TOKEN`, `approvals` and `full-run` both fail with `cannot check: GH_TOKEN is not set`. They never pass silently. An API error fails the clause with `cannot check: <error>`.

Exit codes: 0 when every clause passes, 1 when any fails, 2 on a usage error. A local run reads the GitHub API only; it writes nothing there:

```sh
GH_TOKEN=$(gh auth token) bun run story:check 5.8
```

While the orchestrator opens PRs as the Maintainer, `approvals` fails for every Story, because the author never counts as a reviewer (Epic 1 retro item 12 waiver).

## Oracle requests from Xaravel Tests (Epic 3 retro R6)

`tools/oracle/evaluate.php` binds an Xaravel Test ID request to a bare `PHPUnit\Framework\TestCase`, which has no `setUp()` of its own. Story 5.9 closes the gaps that left:

- a `date-format` request applies its `now` through `Illuminate\Support\Carbon::setTestNow(<now>)`, and resets it after the request, so it no longer runs on the real clock;
- the bare TestCase has Upstream's `getIlluminateArrayTranslator()` (an `en` `Translator` over an `ArrayLoader`), so a `validation-message` request evaluates instead of failing at `setup`;
- a request whose `id` is a Pest Test ID (`<suite>/tests/<file>.php::<description>`) (a suite of `PEST_SUITES` in `tools/inventory/inventory.ts`) can only end in a `fatal` error. The per-Story judge rejects it with a reason that names it, and `evaluateOnce` (the batch, `oracle:story` and `oracle:recheck`) refuses a request file holding one before it evaluates anything, so none is ever signed.
