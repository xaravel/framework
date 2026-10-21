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

Epic 5 retro item 7 (ESC-5.9-1 part 2) refined the converted Xaravel Tests' citations, in `conformance/tests/xaravel` and `packages/{assert,mockery}/tests/xaravel`, from bare FRs and ADs (`(FR-3, AD-15)`) to the bullets each test's assertions verify (`(FR-4.1, FR-4.2)`). A bare token stays where no bullet fits. Mapping a test to its bullets is judgment, and the Fidelity Review checks each mapping. `bun run xt:coverage conformance` still exits 1: consequences whose Stories are not built yet, such as the dashboard, `PORTING.md` and the Fidelity Review, stay uncovered. That is correct: coverage is computed, not claimed.

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
| `tests` | in a full `bun run harness --story <id>` run (never fast), each Test ID × Variant line of `test_ids` (a listed `X` also takes its dataset rows `X#<key>`, as ownership's `covers` does) either has status `pass` and does not differ, or is a `skip` whose reason is not `not-ported-yet` and that `checkLine` accepts. `fail-known`, `quarantined`, any difference (a run-level `ERROR` line included), a NOT-RUN Variant and an ID with no Expectations line for itself or a row all fail. The harness runs get the env without `GH_TOKEN` and `GITHUB_TOKEN`. With no `test_ids` it passes as `none assigned`. |
| `xaravel-tests` | every `xaravel_test_ids` entry passes in a Xaravel run filtered to those IDs. A skip fails, and so does an ID that no test declares or an `ERROR [xaravel]` line. |
| `fixtures` | every assigned ID (`test_ids` ∪ `xaravel_test_ids`), or row `X#<key>` of an assigned `X`, that is the `id` of a committed request (`conformance/oracle/requests/` or an accepted `conformance/oracle-requests/<story>.jsonl`, minus the requests listed in `conformance/oracle/nondeterminism.jsonl`) has `conformance/fixtures/<component>/<sha256>.json`, and `verifyFixture` accepts it against `conformance/oracle/oracle.pub`. A fixture whose `output.error` is not null (an evaluation error at any stage: `bindings`, `setUp`, `setup`, `tearDown`, `fatal` or `timeout`) also fails, naming the stage, unless the ID's Inventory `oracle` map is non-empty and every outcome in it is `fail`, that is, Upstream itself fails there. An Xaravel Test ID has no Inventory entry, so an error fixture always fails it. |
| `api-surface` | the manifest's `api_surface_gate` agrees with the Story's acceptance criteria in `epics.md` (see [The `api_surface_gate` field](#the-api_surface_gate-field)), and, when it names a Component `<c>`, `bun --no-env-file tools/api-surface/api-surface.ts --gate --root <root> <c>` exits 0 (`PASS api-surface: api-surface:gate <c>: 0 unexplained`). With no criterion and no field it passes as `no api-surface:gate acceptance criterion`. A disagreement fails with the cross-check's line as its item, and the gate is not run. Gate exit 1 fails with the count lines as the detail and each unexplained item and citation problem the gate printed as an item. Any other exit, exit 1 with no count line (a tool failure), a spawn error or a missing `epics.md` fails as `cannot check`, with the gate's stderr as items. The gate gets the env without `GH_TOKEN` and `GITHUB_TOKEN`. |
| `approvals` | the Story's spec (the one `_bmad-output/implementation-artifacts/spec-<a>-<b>-*.md`) records two `pass` Fidelity Review verdicts for the head tree: the git tree of `HEAD` without its bookkeeping, which is sprint status, the Story's spec and the `status:` line of each `stories/*.md` manifest (`reviewTree(root, "head", spec)`, [fidelity-review.md](fidelity-review.md#the-reviewed-tree), ESC-8.5-1, ESC-8.8-1). Each counted record's `prior` must answer the findings of the latest reject before it. For each reviewer slot, 1 and 2, the slot's standing reject for that tree counts when it has one (a later `pass` on the same tree never overrides it), else the last record for that tree, so two records from one slot are one verdict. Reviewer 1 must have run on the other agent CLI from the loop's, or have recorded why it fell back. It passes as `2 pass verdicts for tree <t> (reviewer 1: <cli>/<model>, reviewer 2: <cli>/<model>)`. Otherwise it fails with one item per slot (`reviewer <n>: <verdict> at tree <t>` or `reviewer <n>: none for tree <t>`) and the cross-model rule when that is what fails. No spec, two specs, a malformed record or no `HEAD` commit fails as `cannot check` or names the record. It reads no GitHub review and needs no `GH_TOKEN`. |
| `escalations` | no `conformance/escalations/ESC-<id>-<n>.md` is `open` (`escalationStatus`). |
| `full-run` | among the PR head's workflow runs (`/actions/runs?head_sha=`), the latest one named `ratchet` has a job `ratchet` that concluded `success`, and its log (`/actions/jobs/<id>/logs`, timestamps removed) shows the `ratchet story` step passed a full run of the Story's `test_ids` (ESC-5.9-2). That step is the log's last `STORY ref=` line; its SUMMARY is the last `SUMMARY ` line after the `RATCHET ` line that precedes it (the end of the `run --scope` step) and must satisfy `isFullRun`. The clause passes on the Ratchet's own verdict, `STORY ref=<r> failures=0 passes=0 warnings=<w>`, so a warned difference the Story may not fix never fails it and SUMMARY's `differ` is not read; it passes on `STORY ref=<r> skipped: no test_ids` too, since the Story has nothing of its own to run. The conclusion is checked first: a job that concluded anything else fails with `the ratchet job concluded <conclusion>, not success`, and one that has not finished (no conclusion yet) with `the ratchet job has not finished`. Then it fails closed: `the log has no STORY line from the ratchet story step`; `<STORY line> is not a Story verdict` (`skipped: not a Story ref`, or malformed); `the ratchet story step printed no SUMMARY line`; `<SUMMARY> was a fast run`; and `<STORY line> failed` when `failures` or `passes` is not 0. The merge queue's unfiltered Ratchet stays the gate for the whole suite. |

Only `full-run` reads GitHub. It finds the PR from `--pr`, else the most recently updated PR whose head is `story/<id>`, in any state; a `--pr` whose head is not `story/<id>` fails it. It uses `GITHUB_API_URL` (default `https://api.github.com`), the token in `GH_TOKEN`, and the repository in `GITHUB_REPOSITORY`, else the root's `origin` remote. With no `GH_TOKEN`, `full-run` fails with `cannot check: GH_TOKEN is not set`; it never passes silently. An API error fails it with `cannot check: <error>`.

Exit codes: 0 when every clause passes, 1 when any fails, 2 on a usage error. A local run reads the GitHub API only; it writes nothing there:

```sh
GH_TOKEN=$(gh auth token) bun run story:check 5.8
```

`approvals` is fed by the Fidelity Review layer of `bmad-build-auto`'s review step, which records the verdicts in the spec ([fidelity-review.md](fidelity-review.md)). Bookkeeping (the spec itself, sprint status, a manifest's `status:` line) is outside the reviewed tree, so committing it never makes a verdict stale; any other change after the review does, a manifest's `test_ids` or a planning artifact such as `epics.md` included, until the layer runs again.

### The `api_surface_gate` field

Epic 6 retro S4 (Maintainer ruling on item 8, `decisions/MAINT-2026-10-19-epic-6-items.md`): an acceptance criterion that says "`api-surface:gate <c>` passes" is checked, not taken on the agent's word. A Story manifest's optional `api_surface_gate: <c>` names the Component whose [API-surface gate](api-surface.md) the Story must pass. When present it must be a kebab-case component name, else `invalid manifest: stories/<id>.md: api_surface_gate must be a kebab-case component name when present, got …`.

`gateCriteria` (`tools/ownership/ownership.ts`) reads `_bmad-output/planning-artifacts/epics.md` and finds each exact phrase `` `api-surface:gate <c>` passes `` whose `<c>` is kebab-case (so the `<component>` and `<c>` placeholders of Story 6.5 are not criteria), under the `### Story X.Y:` heading it follows. Any other heading of level 1 to 3 ends the Story's section. `bun tools/ownership/ownership.ts manifests` (the CI `ownership` workflow's `manifests` job, and XT-conformance-22) cross-checks every manifest against them (`checkApiSurfaceGates`), with one `api-surface gate:` violation per problem:

- a Story with a criterion whose manifest lacks the field or names another component: ``api-surface gate: stories/<id>.md must carry api_surface_gate: <c> (epics.md:<n> says `api-surface:gate <c>` passes), got …``;
- a manifest whose field has no criterion for its Story: ``… carries api_surface_gate: <x> but epics.md has no `api-surface:gate <x>` passes acceptance criterion for Story <id>``;
- a Story with criteria for two components (the field holds one), and a criterion under no Story heading;
- `epics.md` missing or unreadable: `api-surface gate: cannot check: …`, which fails closed.

The `ownership` workflow's `manifests` job runs on the PR's base commit, so it does not see a PR's own manifest or `epics.md` changes. The PR head is checked by XT-conformance-22 in `ci.yml`'s required test run.

A criterion whose Story has no manifest yet is not a violation: it prints ``note: Story <id> has an `api-surface:gate <c>` passes acceptance criterion (epics.md:<n>) but no stories/<id>.md; …`` on stderr. Such a Story has no assigned tests yet, and sprint planning writes its manifest. It cannot be worked or accepted meanwhile: ownership rejects a `story/<id>` PR with `missing manifest`, and `story:check`'s `manifest` clause fails. Once the manifest exists, the field is required. `story:check`'s `api-surface` clause runs the same cross-check for its own Story, then the gate.

## Oracle requests from Xaravel Tests (Epic 3 retro R6)

`tools/oracle/evaluate.php` binds an Xaravel Test ID request to a bare `PHPUnit\Framework\TestCase`, which has no `setUp()` of its own. Story 5.9 closes the gaps that left:

- a `date-format` request applies its `now` through `Illuminate\Support\Carbon::setTestNow(<now>)`, and resets it after the request, so it no longer runs on the real clock;
- the bare TestCase has Upstream's `getIlluminateArrayTranslator()` (an `en` `Translator` over an `ArrayLoader`), so a `validation-message` request evaluates instead of failing at `setup`;
- a request whose `id` is a Pest Test ID (`<suite>/tests/<file>.php::<description>`) (a suite of `PEST_SUITES` in `tools/inventory/inventory.ts`) can only end in a `fatal` error. The per-Story judge rejects it with a reason that names it, and `evaluateOnce` (the batch, `oracle:story` and `oracle:recheck`) refuses a request file holding one before it evaluates anything, so none is ever signed.
