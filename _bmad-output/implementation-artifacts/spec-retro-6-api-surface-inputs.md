---
title: 'Retro 6 item 2: tighten the API-surface diff inputs'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: '606e03be04fc6c3c6aca61772d799b75f39f2c12'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/ops/api-surface.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `tools/api-surface/api-surface.ts` registers any `Symbol.for('<string>')` in a top-level `const` initializer as a contract FQCN, so runtime brands such as `Symbol.for("xaravel.class.fqcn")` become `extra class` items that can only be explained by an FR/DIV-cited addition (finding A1). The gate checks only that `citation` is a string: an empty or mistyped citation explains an item (`(explained: )`), and the oracle tool's citation validation runs only in the path-filtered, non-required `oracle.yml`. A citation line whose `component` names no component file is ignored and never reported (A2).

**Approach:** Accept a `Symbol.for` argument only when it is a PHP FQCN (Story 6.6's shape) whose first segment is `Illuminate` or `Laravel`. Make a citation line with an unknown component a tool failure in both modes, and have `--gate` run `checkCitations` from `tools/oracle/api-surface.ts` and fail on any problem it reports.

## Boundaries & Constraints

**Always:** Reuse one FQCN-shape test, exported from `tools/registration/registration.ts`, rather than a second regex. A component is known when `conformance/api-surface/<c>.jsonl` exists under `--root` (`componentsOf`), whichever components were selected. Keep report mode's exit 0 on findings; keep existing output lines byte-identical where inputs are valid. Update the file header and `docs/ops/api-surface.md`.

**Never:** No change to `contract('<FQCN>')` handling, the schema, the citation files, `conformance/expectations/**`, `tools/oracle/**`, or any workflow. Do not weaken or remove an XT assertion; where an XT input relied on the old leniency, adapt the input so the same assertion still holds and add assertions for the new behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Brand symbol | `const SLOT = { key: Symbol.for("xaravel.cache.slot") }` | no registration, no `extra class` item | none |
| Non-Laravel FQCN | `const L = { brand: Symbol.for("X\\Lock") }` | no registration | none |
| Laravel contract | `Symbol.for("Illuminate\\Contracts\\Lock")` or `"\\Laravel\\Mcp\\Tool"` | registers `Illuminate\Contracts\Lock` / `Laravel\Mcp\Tool` | none |
| Prefix only | `Symbol.for("Illuminate")`, `"IlluminateX\\A"` | no registration | none |
| Unknown component | exceptions line `component: "nope"` with no `nope.jsonl` | exit 1, stderr `api-surface: conformance/api-surface/exceptions.jsonl:<n>: unknown component nope (no conformance/api-surface/nope.jsonl)` | report and gate mode |
| Invalid citation | additions line `citation: ""`, or unsorted / non-canonical lines | `--gate` prints each `checkCitations` problem as `api-surface:gate citation problem: <problem>` after the component lines, then `api-surface:gate citations: <n> problem(s) (AD-15)`, exits 1 | report mode unchanged |
| Valid citations | committed fixture or repo files | gate output unchanged, no citations line | none |

</intent-contract>

## Code Map

- `tools/api-surface/api-surface.ts:413-443` -- `contractFqcn`: the `Symbol.for` branch to tighten; `contract(...)` branch stays.
- `tools/api-surface/api-surface.ts:1206-1215` -- `readCitations`: add the unknown-component check (needs `root`'s components).
- `tools/api-surface/api-surface.ts:1262-1292` -- `diffComponents`: reads citations; pass known components.
- `tools/api-surface/api-surface.ts:1356-1367` -- gate branch of `main`: append citation problems.
- `tools/api-surface/api-surface.ts:1-39` -- header comment describing the rules.
- `tools/registration/registration.ts:108-109` -- private `FQCN` regex; export an `isFqcn(value)` helper.
- `tools/oracle/api-surface.ts:343-358` -- `checkCitations(root)`: reuse as-is (pure, has an `import.meta.main` guard).
- `conformance/tests/xaravel/api-surface-diff.test.ts:293-305` -- contract case uses `X\\Lock` via `Symbol.for`; move to an `Illuminate\…` FQCN.
- `conformance/tests/xaravel/api-surface-diff.test.ts:386-395` -- XT-138 writes an exceptions line for component `other` with no `other.jsonl`; add that component file so "another component's lines are ignored" still holds.
- `docs/ops/api-surface.md:14,21,58,74` -- tool failures, registrations, citation files, gate output.

## Tasks & Acceptance

**Execution:**
- `tools/registration/registration.ts` -- export `isFqcn(value: string): boolean` over the existing `FQCN` regex and use it in `recogniseRegistration` -- one shape test for both tools.
- `tools/api-surface/api-surface.ts` -- `Symbol.for` registers only when `isFqcn` and the normalised value starts with `Illuminate\` or `Laravel\`; `readCitations` takes the known components and throws on an unknown one; `--gate` runs `checkCitations(root)` and fails on problems; header updated -- findings A1, A2.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- adapt the two inputs above; add cases for every matrix row (unit cases in `matrixEdgeCases`, CLI cases in XT-138) -- coverage of the new rules.
- `docs/ops/api-surface.md` -- document the `Symbol.for` restriction, unknown-component failure and gate citation validation.

**Acceptance Criteria:**
- Given the repository, when `bun run api-surface --all` and `bun run api-surface:gate` on each component run, then they behave as before (repo citation files are empty and valid).
- Given the changes, when `bun test conformance/tests/xaravel/api-surface-diff.test.ts conformance/tests/xaravel/registration*.test.ts`, `tsc` and oxlint run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 23 findings — high 0, medium 1, low 13, false 6, maybe-false 0 (3 intent-alignment observations triaged as false)
- findings:
  - `[medium]` `[patch]` (verification-gap) gate's `checkCitations` throw path (missing schema.json) untested — added an XT-138 case: schema removed, `--gate demo` exits 1 with exact stderr `api-surface: conformance/api-surface/schema.json is missing`.
  - `[low]` `[reject]` (verification-gap other) docs say every citation `component` must name a component file, but `oracle:api-surface --check` does not enforce it — the sentence documents this tool, which does enforce it; `api-surface.yml` runs report mode on every PR, so the failure surfaces there as a warning.
  - `[low]` `[reject]` (edge) blank line before an unknown-component line gives a shifted line number — the same numbering is used by the existing "not a line" error, and a blank line is itself a `checkCitations` problem; a fix means threading raw line numbers through `readJsonl`.
  - `[false]` `[reject]` (edge) a missing schema leaves passing-looking gate lines on stdout before exit 1 — the run fails closed with the reason on stderr; that is correct behaviour.
  - `[false]` `[reject]` (edge) a lowercase `illuminate\…` vendor segment does not register — Upstream FQCNs are `Illuminate`/`Laravel` cased and registration keys keep the case as written (docs/ops/api-surface.md).
  - `[false]` `[reject]` (edge) one stale citation line for any component fails every run — intended: A2 asks for unknown components to be reported, and the spec says "whichever components were selected".
  - `[low]` `[patch]` (blind) header exit-code line still said report mode "always" exits 0 — reworded.
  - `[low]` `[patch]` (blind) docs usage comments and acceptance sentence stale — updated to name the unknown-component failure and citation problems.
  - `[low]` `[patch]` (blind) docs did not say a bad line for component B fails `api-surface:gate A` — sentence added.
  - `[false]` `[reject]` (blind) a wrongly typed citation is a tool failure, not a citation-problem line — it still fails the gate (exit 1), which is what the docs claim.
  - `[low]` `[patch]` (blind) checkCitations-throw path untested — same root cause as the verification-gap finding; same test.
  - `[low]` `[patch]` (blind) unsorted/non-canonical test derived its expectation from `checkCitations` itself — now pins the exact problem lines, count and stdout.
  - `[low]` `[reject]` (blind) unknown component not tested for additions.jsonl or `--all` — one `readCitations` path serves both files and every selection.
  - `[low]` `[reject]` (blind) fixture copies the live schema and hard-codes its citation regex — deliberate: the gate must validate against the real rules; a schema change updating this message is expected.
  - `[low]` `[reject]` (blind) no direct `isFqcn` test — the regex is unchanged and covered through `recogniseRegistration`'s registration tests.
  - `[low]` `[reject]` (blind) `exceptions.jsonl:6` hard-coded — the file is written two lines above; negligible brittleness.
  - `[low]` `[reject]` (blind) no `\Illuminate\…` or lowercase case — the leading-`\` branch is tested with `\Laravel\…`; same code.
  - `[low]` `[reject]` (blind) gate prints `0 unexplained` beside a failing empty citation — the gate fails, as the intent asks; changing explanation semantics would alter report mode, out of the intent.
  - `[low]` `[reject]` (blind) importing `checkCitations` pulls in the oracle tool's imports — no load-time side effects (`import.meta.main` guard); typecheck and every gate run pass.
  - `[false]` `[reject]` (blind) acceptance evidence missing — XT-139 runs `--all` on the repository; the gate was run on all 41 real components (exit 1 from scaffolds' unexplained members as before, empty stderr, no citation lines).
  - `[false]` `[reject]` (intent) no CI workflow runs the gate — the intent names "the gate" (`api-surface:gate`); gate enforcement in CI is retro item 8.
  - `[false]` `[reject]` (intent) `(explained: )` still printed in report mode — the intent asks that such lines fail, which they do under the gate.
  - `[false]` `[reject]` (intent) unknown component is a tool failure rather than a report finding — both readings satisfy "report … instead of silently ignoring"; fail-closed matches the retro's fix-now finding.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/api-surface-diff.test.ts` -- expected: all pass
- `bun test conformance/tests/xaravel` -- expected: no new failures
- `bun run typecheck` (or the repo's `tsc` script) and `bun run lint` -- expected: clean

## Auto Run Result

Status: done

- **Change:** `Symbol.for` registers a contract only for an `Illuminate\…`/`Laravel\…` PHP FQCN (shared `isFqcn` from the registration scan); a citation line naming a component with no `<component>.jsonl` is a tool failure (exit 1) in both modes; `api-surface:gate` runs `checkCitations` and fails on any problem (A1, A2).
- **Files:** `tools/api-surface/api-surface.ts` (rules, header); `tools/registration/registration.ts` (export `isFqcn`); `conformance/tests/xaravel/api-surface-diff.test.ts` (matrix cases; contract input moved to `Illuminate\Contracts\Lock`, an `other.jsonl` added so the "another component" assertion still holds; no assertion removed); `docs/ops/api-surface.md`.
- **Review:** 5 entries patched (1 medium, 4 low), 0 deferred, 18 rejected with reasons in the triage log.
- **Follow-up review:** false (one medium patched, no high).
- **Verification:** `bun test conformance/tests/xaravel` 225 pass, 0 fail; `bun run typecheck` and `bun run lint` clean; gate on all 41 real components unchanged (empty stderr, no citation lines).
- **Residual risk:** no CI workflow runs the gate yet (retro item 8); a mistyped component that matches another existing component still passes.
