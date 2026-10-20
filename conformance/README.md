# Conformance data

This directory holds the Conformance System's data: the Test Inventory (`inventory/`), the Expectations File (`expectations/`), the Variant vocabulary (`variants`), Escalations (`escalations/`), Oracle requests and fixtures, and the lists the Skip Reason rules read (`deferred-items`, `non-goals`). Everything here is Protected (AD-16) except `expectations/`, `escalations/`, `oracle-requests/` and `fixtures/`. Operator docs are in [`docs/ops/expectations.md`](../docs/ops/expectations.md).

## Statuses

Every Expectations line has exactly one `status` (PRD §3, FR-3):

- `pass`: the test passes. It may carry `adapted: DIV-<n>.<clause>`, which must name an existing clause of `decisions/DIV-<n>.md`; `bun run divergence:check` checks it ([`docs/ops/divergence.md`](../docs/ops/divergence.md)).
- `fail-known`: the test fails and is known to. It counts as not passing and blocks Epic acceptance.
- `skip`: the test is not run. It needs a Skip Reason from the vocabulary below.
- `quarantined`: the test is inconsistent across runs. It counts as not passing and needs an open Escalation.

Any other status fails. Only `skip` has a `reason`; every other status has `reason: null`.

## Skip Reasons and their rules

`bun run expectations:reasons` (`tools/expectations/reasons.ts`) checks every line against these rules, and CI runs it in the required `check` job. Each broken line is one violation naming the shard and line, the Test ID, the Variant and the rule.

| Skip Reason | Valid only when |
| --- | --- |
| `not-ported-yet` | always; but it never satisfies a Story's done check. |
| `blocked-by:<c>` | `<c>` is a `name` in `tools/scaffold/packages.jsonl`, in a later `phase` than the test's Inventory `component`. |
| `intentional-divergence:DIV-<n>` | `decisions/DIV-<n>.md` exists (`<n>` a positive integer, no leading zeros). |
| `php-only` | `escalation` names an approved Escalation with `trigger: php-only` whose `test_ids` lists the Test ID. |
| `upstream-skip` | the Inventory's `oracle` outcome for the line's Variant is `skip` or `fail`. |
| `deferred:<item>` | `<item>` is listed in `conformance/deferred-items` (PRD §7.2, post-alpha). |
| `out-of-scope:<NG-N>` | `<NG-N>` is listed in `conformance/non-goals` (PRD §7.1). |

A `skip` with no reason, an empty reason, a bare prefix such as `blocked-by:`, or any other value is an `unknown reason`. A `quarantined` line needs an `escalation` naming an open Escalation whose `test_ids` lists the Test ID. On any line, a non-null `escalation` must name an Escalation that exists in `conformance/escalations/`.

The check confirms that a reason is well-formed and that the record it names exists; whether a listed `deferred:` item, `blocked-by` Component or Non-Goal actually applies to the test is a review question (Fidelity Review), like precedence.

`deferred-items` and `non-goals` use the `variants` format: UTF-8, LF, one member per line, sorted by UTF-16 code units and unique; `#` comment lines and blank lines are ignored. Each member's comment quotes the PRD line it comes from.

## Precedence

When more than one Skip Reason could apply, the line records exactly one, chosen in this order (FR-3):

1. `upstream-skip`, because the Oracle confirms it.
2. A reason that keeps the test in the SM-1 denominator: `intentional-divergence`, then `blocked-by`, then `not-ported-yet`.
3. Only if none of those fits, a reason that excludes it: `php-only`, `deferred` or `out-of-scope`.

When in doubt, pick the reason that counts against conformance.

The check does not enforce this order: whether a reason is the right one is a review question. The Epic 8 reviewers' checklist is meant to cite this section ([ESC-5.2-1](escalations/ESC-5.2-1.md)).

## Ratchet

Conformance only moves honestly (FR-3, AD-16, Story 5.6). Operator docs are in [`docs/ops/ratchet.md`](../docs/ops/ratchet.md).

- **The `ratchet` check** (`bun run ratchet run --ref <ref>`, `.github/workflows/ratchet.yml`) runs the full harness. Every unexpected failure fails it on every ref. An unexpected pass fails it only on the branch of the open Story that owns the Test ID; any other unexpected pass is a warning, and the owner's next run fails.
- **Line ownership** (`bun tools/ownership/ownership.ts pr`): a `story/<id>` PR may change only Expectations lines and `portedTest` blocks of its own `test_ids`. The rules compare only Expectations lines and the text of `portedTest` blocks; code outside a block (helpers, imports, setup) is not compared, and the Ratchet catches the outcome changes it causes. A Story listing any row `X#k` may change the block of `X`: no manifest splits one test's rows across Stories.
- **Pass demotion:** moving a line from `pass` to any other status, or removing it, needs an approved Escalation listing its Test ID. `bot/*` branches are exempt, and so are `planning/*` branches, which may not change Expectations at all.
- **Bot PRs** (Story 5.8, [`docs/ops/bots.md`](../docs/ops/bots.md)): a `bot/*` PR must come from the `xaravel-bot` App and may change only Expectations status values: a promotion sets `pass` with `reason` null; a quarantine sets `quarantined` with `reason` null and an `ESC-bot-<n>` the same PR adds. It never adds, removes or moves a line, or changes `id`, `variant` or `adapted`.

## Xaravel Test coverage and the done check

"Done" is computed, not claimed (FR-115, Story 5.9). Operator docs are in [`docs/ops/done-check.md`](../docs/ops/done-check.md).

- **Consequence files** (`xaravel-consequences/<component>.jsonl`, Protected) list a Xaravel Component's testable consequences as `FR-<n>.<k>` (the k-th bullet of FR-n's consequences in the PRD) and `AD-<n>.<k>` (the k-th bullet of AD-n's rule in the spine). `bun run xt:consequences` generates them, and `--check` fails on drift; nobody edits them by hand.
- **Coverage** (`bun run xt:coverage <component>`): every consequence that no passing `xaravelTest` declares as a whole token in its consequence string is listed as `UNCOVERED`. A Xaravel Component's Epic is accepted only when none is.
- **Every Xaravel Test runs under the harness.** A full `bun run harness` ends with the Xaravel run (`XARAVEL tests=… passed=… failed=… skipped=…`); every test in a `tests/xaravel/` file must be an `xaravelTest`, and a plain `test()` there is an `UNDECLARED` difference.
- **The done check** (`bun run story:check <story-id>`) reports PASS or FAIL for `manifest`, `tests`, `xaravel-tests`, `fixtures`, `approvals`, `escalations` and `full-run`, and passes only when all seven do.
