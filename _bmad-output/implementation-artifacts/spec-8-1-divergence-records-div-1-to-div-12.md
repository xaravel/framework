---
title: 'Story 8.1: Divergence Records DIV-1 to DIV-12'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: '032d1ef86b4c31c300a62849a5426ec7766d525a'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md'
warnings: ['oversized']
deferred:
  - summary: >-
      divergence:check does not check that an Expectations line's adapted marker and its Ported Test's comment markers cite the same clause (PRD §5.1).
    evidence: |-
      PRD §5.1: "Adapted tests are marked adapted:DIV-<n>.<clause> in the Expectations File, and each changed assertion line carries the same marker." The check validates each side alone. No Story 8.1 AC asks for the cross-check, and no Ported Test exists yet. No Story's ACs cover it yet (8.5's Fidelity Review checks each marker against its DIV's rule), so it needs an action item or an Escalation, not a silent deferral.
    location: >-
      tools/divergence/divergence.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** PRD §5.1 requires every adapted Ported Test to cite `adapted:DIV-<n>.<k>`, but no Divergence Record exists. Without records, a marker cites nothing, the harness's assertion-floor waiver (ESC-5.3-2) has nothing to read, and nothing rejects a marker that names a clause that does not exist.

**Approach:**
- Write `decisions/DIV-1.md` to `decisions/DIV-12.md` from PRD §5.2 and the spine ADs each DIV cites. Each record has a rationale, a behaviour section and numbered adaptation clauses.
- Add the clauses that approved Escalation rulings assign to "Story 8.1's DIV records".
- Add a fail-closed check, `bun run divergence:check`. It validates the records, then every `adapted` marker in Expectations shards and in Ported Test comments against them. Run it in CI's required `check` job.

## Boundaries & Constraints

**Always:**
- Record content follows PRD §5.2 (`prd.md:1207-1268`) and the cited ADs in `ARCHITECTURE-SPINE.md`: AD-6 (DIV-1), AD-8 (DIV-2), AD-4 (DIV-3), AD-14 (DIV-4), AD-9 (DIV-9), AD-5/AD-25/AD-13 (DIV-11), AD-26 (DIV-12). It adds no behaviour those sources do not state.
- **Record shape:**
  - YAML frontmatter with `div: <n>`, `title: "<PRD title>"`, `cites: [...]` (the AD/FR ids it follows; `[]` when none), `sources: [...]` (the `decisions/ESC-*.md` rulings whose clauses it carries; `[]` when none) and `fewer_assertions: []`.
  - Then `# DIV-<n>: <title>`, `## Rationale`, `## Behaviour` and `## Adaptation clauses`.
  - Each clause is one list item `- **DIV-<n>.<k>** <text>` with numeric `<k>`, numbered 1..m with no gaps. Continuation lines are indented, and no heading appears inside the clause list. This keeps Boost's `divergenceClauses` and the harness's `waiverFor` agreeing.
- **Required content:**
  - DIV-11 has a clause containing the exact text `no pcntl; job timeouts are enforced by the supervisor process`.
  - DIV-12 has clauses for `collection.get(0)`, the Model renames `setFillable` / `isTouching`, and no dynamic wheres or finders (`whereEmail()` is not supported; use `where('email', v)`).
- **Escalation-owed clauses, wording taken from each ruling:**
  - DIV-6: ESC-4.6-1 (3) Mockery `alias:`/`overload:`, ESC-4.6-1 (4) run-time method visibility, ESC-4.7-1 (2) PHP run-time types and reflection in test doubles, and ESC-4.8-1 (3) PHP final, visibility and reflection in Double's doubles.
  - DIV-9, as JS value-model and message-only differences: ESC-4.3-1 (9) closure equality, (10) a JS `Error` through `ExceptionComparator` (closed by Stories 9.10/9.11), (13) the exception export without `string`/`file`/`line`/`trace`, ESC-4.4-2 (3) the wrong-class message ending in JS stack frames, and ESC-4.7-1 (3) the test-double notices and deprecations.
- `fewer_assertions` is `[]` in every record. A record that lists a clause must quote the item (`["2"]`), and the item must name an existing clause. Each record says that adding an item needs an approved Escalation (ESC-5.3-2, FR-113).
- **The check** lives at `tools/divergence/divergence.ts`, as `check [--root <dir>]`. It follows `tools/expectations/reasons.ts`: a header comment documenting usage, rules, output and exit codes; violations on stderr; exit 0 pass, 1 any violation or failure (fail closed), 2 usage error.
- The clause parser and frontmatter parser are imported from `tools/boost-framework/src/tools.ts` (`divergenceClauses`) and `tools/boost-framework/src/data.ts` (`parseFrontmatter`). The tool does not copy them, so "clause exists" means one thing across Boost, the check and the dashboard.

**Never:**
- Don't add a DIV-13 or any divergence outside DIV-1..12.
- Don't put a non-empty `fewer_assertions` anywhere (that waives the grader).
- Don't edit `AGENTS.md`, `CLAUDE.md`, the PRD, the spine, SPEC, `epics.md`, `tools/boost-framework/**`, `conformance/harness/**`, `tools/protected-paths/**`, `tools/ownership/**` or any `conformance/expectations/**` shard.
- Don't use `expect` in Ported Tests; there are none here. The XTs use `xaravelTest` with `bun:test`'s `expect`, as existing XTs do.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Real repo | DIV-1..12 as written, no non-null `adapted`, no Ported Tests | stdout `Divergence OK: 12 record(s), <c> clause(s); <e> Expectations marker(s), <p> assertion marker(s) checked.` | exit 0 |
| Missing record | `decisions/DIV-7.md` absent | `decisions/DIV-7.md: missing Divergence Record` | exit 1 |
| Record shape | no `## Rationale` / `## Behaviour` / `## Adaptation clauses`, zero clauses, clause numbers not 1..m, duplicate `<k>`, bad YAML, `div` ≠ n | one violation per problem naming the file | exit 1 |
| Stray record | `decisions/DIV-13.md`, `DIV-02.md` or `div-5.md` (any `decisions/` name matching `/^div/i` that is not `DIV-<1..12>.md`) | `<file>: not a Divergence Record name (DIV-1..DIV-12)` | exit 1 |
| fewer_assertions | not a list, an unquoted number item, or an item naming a missing clause | violation naming record and item | exit 1 |
| Expectations marker | shard line `adapted: "DIV-3.9"` where DIV-3 has 4 clauses | `<shard>:<line>: <id> × <variant>: adapted DIV-3.9: clause does not exist` | exit 1 |
| Malformed marker | `adapted: "DIV-6"`, `"DIV-3.x"`, `"DIV-3.0"` | `... adapted <v>: not DIV-<n>.<k>` | exit 1 |
| Comment marker | `packages/x/tests/ported/A.test.ts` line with `// adapted:DIV-12.99` | `<file>:<line>: adapted:DIV-12.99: clause does not exist` | exit 1 |
| Comment marker ok | `// adapted:DIV-12.1` | counted, no violation | exit 0 |
| Unreadable shard | malformed JSON in a shard | violation pointing at `bun run expectations:check` | exit 1 |
| Usage | unknown flag, or `--root` with no value | usage message on stderr | exit 2 |

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md:1186-1268` -- §5.1 adapting rules and §5.2 DIV-1..12 text. This is the record content source; each DIV's bold title is the record `title`.
- `_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md` -- AD-4:119, AD-5:140, AD-6:167, AD-8:225, AD-9:240, AD-13:309, AD-14:320, AD-25:499, AD-26:512. Read each before writing the record that cites it.
- `decisions/ESC-4.3-1.md:18-22`, `ESC-4.4-2.md:14`, `ESC-4.6-1.md:14-15`, `ESC-4.7-1.md:13-14`, `ESC-4.8-1.md:14`, `ESC-5.3-2.md:12` -- rulings that owe clauses, and the `fewer_assertions` contract.
- `tools/boost-framework/src/tools.ts:397-426` -- `CLAUSE_START` and the exported `divergenceClauses(n, body)`, which the check reuses. Clause text runs to the next clause start or heading. `tools/boost-framework/src/data.ts:189` -- `parseFrontmatter`.
- `conformance/harness/harness.ts:285-320` -- `frontmatterOf` and `waiverFor`. Adapted regex `/^DIV-([1-9][0-9]*)\.([^\s.][^\s]*)$/`; `fewer_assertions` items are compared as strings. Read-only.
- `conformance/harness/harness.ts:174,276` -- `PORTED_GLOB` and `portedTestFiles(root)`, which find Ported Tests. None exist today.
- `tools/pin-bump/pin-bump.ts:341,365` -- `Shard` and `readExpectations(root)`, which read every shard. They throw on malformed JSON; `tools/expectations/reasons.ts:324-330` shows how to report that.
- `tools/expectations/reasons.ts` -- template for CLI shape (`parseArgs` :346-361), output and header comment. `UsageError` comes from `tools/expectations/expectations.ts:82`.
- `conformance/tests/xaravel/boost-framework.test.ts:474-480,1190-1225` -- XT-boost-1 real-repo record check: every `decisions/` name matching `/^div/i` must be `DIV-<n>.md` with at least one clause. It must stay green.
- `tools/conformance-report/site.ts:277-289,559-569` -- the dashboard links existing records; no change needed.
- `conformance/tests/xaravel/skip-reasons.test.ts:11-20,63-82,300` -- XT fixture pattern: `mkdtempSync`, `writeFileSync` map, spawn `[process.execPath, CLI, "--root", dir]`, plus a real-repo assertion.
- `conformance/xaravel-consequences/conformance.jsonl:30,32,47,61,62` -- FR-8.1, FR-8.3, FR-113.2, AD-15.1, AD-15.2, the consequence ids to cite.
- `.github/workflows/ci.yml:109-146` -- the `check` job. Add the step after `expectations:reasons` (:129-130) and update the header comment (:12-19). `docs/ops/ci.md:9` lists the job's commands.
- `package.json:71` -- add `"divergence:check": "bun --no-env-file tools/divergence/divergence.ts check"` next to `expectations:reasons`.
- `conformance/README.md:9` -- mentions `adapted: DIV-<n>.<clause>`. `docs/ops/expectations.md:48-51` and `docs/ops/harness.md:122` are the doc templates and the waiver.
- `stories/8.1.md` -- manifest; `status` moves to `done` with the sprint key (lesson, epic 1).

## Tasks & Acceptance

**Execution:**
- `decisions/DIV-1.md` … `decisions/DIV-12.md` -- write the twelve records in the shape above, from the PRD text and the ADs. Every PRD sub-bullet becomes behaviour text, and each test-adaptation rule becomes a numbered clause. Clauses the PRD implies:
  - DIV-1: await IO terminals; use the async companions; `instanceof LazyCollection` → `AsyncLazyCollection`.
  - DIV-2: `$m->rel()` → `m.related('rel')`; lazy property access → `await m.related('rel')`.
  - DIV-3: `inject({...})` for autowired parameters.
  - DIV-4: closure state passed as arguments.
  - DIV-5: PHP-output asserts become rendered-output or TS-snapshot tests.
  - DIV-6: `php-only` needs an approved Escalation, plus the ESC clauses.
  - DIV-7: explicit registration in place of reflection discovery.
  - DIV-8: async test bodies and awaited predicate assertions.
  - DIV-9: null, arrays, integers/`IntegerOverflowException`, the float marker, brands, php-props, plus the ESC clauses.
  - DIV-10: PCRE-only tests are skipped as `intentional-divergence:DIV-10`; the conversion rule lives in `PORTING.md` (Story 8.2).
  - DIV-11: Scope Frames, `ScopeFrameException`, frame-held writes, and the pcntl/supervisor clause with timeout tests on a spawned fixture app.
  - DIV-12: one clause per PRD bullet.
- `tools/divergence/divergence.ts` -- the check. Export a pure `checkDivergence(root): { violations: string[]; records: number; clauses: number; expectationMarkers: number; assertionMarkers: number }` and the CLI. Rules:
  - **Records:**
    - `DIV-1..12` each exist.
    - No stray `/^div/i` names in `decisions/`.
    - Frontmatter parses, `div` equals n, and `title` is a non-empty string.
    - `## Rationale`, `## Behaviour` and `## Adaptation clauses` are present.
    - Clauses come from `divergenceClauses`, are numbered 1..m, and have no duplicates.
    - `fewer_assertions` is an absent or empty list, or a list of quoted strings naming existing clauses.
  - **Expectations:** every non-null `adapted` must be a string `DIV-<n>.<k>` (`/^DIV-([1-9]\d*)\.([1-9]\d*)$/`) naming an existing clause.
  - **Ported Tests:** every `adapted:` comment token (`/\/\/.*?\badapted:(\S+)/`, on any line) must name an existing clause, with the same regex.
- `package.json` -- add the `divergence:check` script.
- `.github/workflows/ci.yml` -- add the `check` job step `- name: Check the Divergence Records and adapted markers` / `run: bun run divergence:check`, and add it to the header comment.
- `conformance/tests/xaravel/divergence.test.ts` -- the four XTs below, with temp-dir fixtures and real-repo assertions.
- `docs/ops/divergence.md` -- the new tool's doc: usage, rules, output, exit codes, the record shape and how to add a clause (append only; never renumber). Link it from `conformance/README.md` (next to the `adapted` mention) and from `docs/ops/ci.md:9`.
- `stories/8.1.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml` -- the orchestrator sets `done` after review.

**Acceptance Criteria:**
- **XT-conformance-149.** Consequence cites `FR-8.1`, `FR-8.3` and `FR-113.2`.
  - Given the real repo, when it is validated, then `checkDivergence(root)` reports no violations and 12 records.
  - Each record's frontmatter `title` equals the bold title of its PRD §5.2 bullet, parsed from `prd.md` (`**DIV-<n> <Title>.**`).
  - Its `cites` equal the AD set listed above (`[]` allowed for DIV-5/6/7/8/10), and every `sources` file exists.
  - The ESC-owed phrases appear in a DIV-6 or DIV-9 clause: `alias:`, `overload:`, `visibility`, `test doubles`, `Double`, closure equality, `ExceptionComparator`, `trace` and `stack frames`.
  - Every `fewer_assertions` is `[]`.
  - A fixture missing a section, with clause gaps, a stray `DIV-13.md`, or `fewer_assertions: [2]` fails with exit 1.
- **XT-conformance-150.** Given DIV-11, when its clauses are read through `divergenceClauses`, then one clause contains `no pcntl; job timeouts are enforced by the supervisor process` and cites AD-13. Consequence cites `FR-8.3`.
- **XT-conformance-151.** Given DIV-12, when its clauses are read, then the clauses contain `collection.get(0)`, `setFillable`, `isTouching`, `whereEmail()` and `where('email', v)`. Consequence cites `FR-8.3`.
- **XT-conformance-152.** Consequence cites `AD-15.1` and `AD-15.2`.
  - Given fixture roots with all twelve minimal records, when the CLI runs:
    - an Expectations `adapted` or a `// adapted:` comment naming a missing clause exits 1, with the matrix's message;
    - a malformed marker exits 1;
    - valid markers exit 0 and are counted;
    - a bad flag exits 2.
  - The real repo exits 0, and `ci.yml`'s `check` job has the `bun run divergence:check` step.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 30 findings — high 0, medium 12, low 14, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) The records add text beyond the PRD §5.2 bullets (DIV-2 `resolveRelationUsing`, DIV-4 `allowed-identifiers.json`, DIV-3 metadata) — each comes from the AD the record cites (spine AD-8, AD-14, AD-4:137), which the spec names as a source.
  - `[medium]` `[patch]` (intent) The comment-marker check reads AC (d)'s "assertion line" broadly, and it misses block comments — patched with the marker-parsing group: every `adapted:` in a `//` or `/* */` comment is checked.
  - `[low]` `[reject]` (intent) The harness's `waiverFor` accepts unquoted numbers that `divergence:check` rejects — both run in the required `check` job, so a numeric item cannot reach `main`, and every record has `fewer_assertions: []`; the harness is Story 5.3's.
  - `[low]` `[patch]` (intent) `epic-8-context.md` puts the ESC-4.7-1 notices clause under DIV-6, but the records put it in DIV-9 — the context file now lists it under DIV-9.
  - `[medium]` `[patch]` (verification-gap) Only the first `adapted:` on a line is checked — every occurrence in the comment is now checked.
  - `[low]` `[reject]` (verification-gap) The documented clause shape (list item, inside `## Adaptation clauses`) is not enforced — the records are Protected and Maintainer-reviewed, and the guard would add a section-slicing branch for a case no record has.
  - `[low]` `[reject]` (verification-gap) XT-boost-1's "no records yet" branch is now dead — it is harmless, and it lives in Story 7.3's Protected test.
  - `[medium]` `[patch]` (edge) `// adapted: DIV-99.1` (with a space) and `/* adapted:… */` are never counted, so the check fails open — the spaced and block forms are now matched, and a token that does not parse is a violation.
  - `[low]` `[reject]` (edge) Trailing punctuation (`adapted:DIV-12.1,`) fails — the check fails closed on a non-canonical marker, and AGENTS.md fixes the exact form.
  - `[medium]` `[patch]` (edge) A second marker on the same line goes unchecked — same fix as the first-marker finding.
  - `[low]` `[reject]` (edge) `//` inside a string literal, or `not-adapted:`, could be read as a marker — it fails closed, and neither shape exists in any test.
  - `[low]` `[reject]` (edge) Clauses outside `## Adaptation clauses` count as clauses — same reasoning as the verification-gap clause-shape row.
  - `[low]` `[reject]` (edge) A `sources` item may be any existing path — the real-repo XT-149 pins the `decisions/ESC-*.md` pattern, and records are Maintainer-reviewed.
  - `[low]` `[reject]` (edge) One malformed shard hides marker violations in the other shards — the check still exits 1 and points at `expectations:check`, which names the bad shard; a second run then checks the rest.
  - `[medium]` `[patch]` (edge) A non-null `adapted` on a non-`pass` line passes every gate — added the violation `only a pass line may carry adapted`, plus a fixture case; `reasons.ts`'s header now points at `divergence:check`.
  - `[low]` `[reject]` (edge) Duplicate `fewer_assertions` items are not flagged — a duplicate has no effect on the harness's Set, and every list is empty.
  - `[false]` `[reject]` (edge) DIV-12 has 7 clauses for 8 PRD bullets — PRD §5.2 DIV-12 has 7 bullets (`prd.md:1262-1268`); the pair-list sentence comes from AD-26, not a bullet.
  - `[medium]` `[patch]` (edge) The docs claim "every" comment token is checked, but only the first is — the check and the docs now agree that every token is checked.
  - `[medium]` `[patch]` (blind) XT-149 cites FR-8.1 (the Phase 1 gate, Story 8.8), which it does not verify — dropped from the consequence.
  - `[medium]` `[patch]` (blind) Spaced, block-comment or second markers are skipped — the marker-parsing group fix.
  - `[medium]` `[defer]` (blind) An Expectations `adapted` and its Ported Test's comment markers are never cross-checked (PRD §5.1 "the same marker") — not in Story 8.1's ACs, and there are no Ported Tests yet; added to `deferred`.
  - `[medium]` `[patch]` (blind) Nothing restricts `adapted` to `pass` lines — same fix as the edge finding.
  - `[low]` `[patch]` (blind) XT-149 pools the DIV-6 and DIV-9 text when checking the ESC-owed clauses — each ruling's citation is now checked against its own record.
  - `[low]` `[patch]` (blind) DIV-6.2 reads as if ESC-4.6-1 approves the skips by category — DIV-6.2 and 6.3 now say the skip is made under DIV-6.1, with an approved Escalation listing each Test ID.
  - `[medium]` `[patch]` (blind) DIV-6.3 and DIV-9.7–9.11 state facts, not test-adaptation rules (FR-8.3) — each now says what happens to a Ported Test: a skip under 6.1, an Escalation, or no adaptation.
  - `[low]` `[patch]` (blind) There is no rule for "closing" DIV-9.8 under append-only numbering — added: a closed clause stays, says which Story closed it, and that Story removes its markers. The rule is in the record and in the docs.
  - `[medium]` `[patch]` (blind) DIV-11 leaves out AD-13's scope (`--timeout > 0`, not `--once` under testing, one job per child, SIGTERM forwarded, in-process `Worker` unchanged) — added to Behaviour, and DIV-11.4 says in-process `Worker` tests are not adapted.
  - `[low]` `[patch]` (blind) `epic-8-context.md` disagrees with the records on where the notices clause goes — same fix as the intent row.
  - `[false]` `[reject]` (blind) The checker accepts a missing `fewer_assertions` and does not validate `cites` ids or ESC citations against `sources` — the spec's Tasks allow "an absent or empty list", and the real-repo XT-149 pins `cites` and `sources` exactly.
  - `[false]` `[reject]` (blind) The manifest still says `backlog`, and DIV-11.4 spans three lines — the orchestrator sets the manifest to `done` with the sprint key at the end of the Story; DIV-11.4 is a single line after the DIV-11 patch.

## Design Notes

- **Placement of the ESC-owed clauses.** ESC-4.6-1, 4.7-1 (2) and 4.8-1 name DIV-6 explicitly. ESC-4.3-1 (9, 10, 13), ESC-4.4-2 (3) and ESC-4.7-1 (3) say only "a clause in Story 8.1's DIV records". Their stated cause is the JS value model, and the effect is message-only, so they go in DIV-9, the PHP value model (AD-9). Each clause cites its ruling, e.g. `(ESC-4.3-1 item 9)`.
- **`fewer_assertions` empty.** Listing a clause waives the harness floor, and that weakens the grader, so it needs an Escalation the Maintainer rules on. An empty list keeps the floor everywhere until a Story proves it needs fewer.
- **Example clause:**

```markdown
## Adaptation clauses

- **DIV-11.4** Job timeouts: no pcntl; job timeouts are enforced by the supervisor process,
  which kills the worker child (AD-13). Upstream timeout tests run against a spawned
  fixture app and are marked `adapted:DIV-11.4`.
```

## Verification

**Commands:**
- `bun run divergence:check` -- expected: exit 0, `Divergence OK: 12 record(s), …`
- `bun run harness --xaravel --id 'XT-conformance-149'` (likewise 150, 151, 152, and `XT-boost-1`) -- expected: pass, no differences
- `bun run harness --xaravel` -- expected: `SUMMARY` with no differences
- `bun run typecheck`, `bun run lint`, `bun run expectations:check`, `bun run expectations:reasons`, `bun run escalations:check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** Story 8.1 writes the twelve Divergence Records, `decisions/DIV-1.md` to `decisions/DIV-12.md`. They follow PRD §5.2 and the ADs each one cites, and carry 39 numbered adaptation clauses, including the clauses that Escalation rulings assigned to this Story (DIV-6.2–6.5, DIV-9.7–9.11). It also adds a fail-closed `divergence:check`, which validates the records and every `adapted` marker in the Expectations File and in Ported Test comments. CI runs it in the required `check` job.

**Files changed**
- `decisions/DIV-1.md` … `DIV-12.md`: the records. Each has frontmatter (`div`, `title`, `cites`, `sources`, `fewer_assertions: []`), Rationale, Behaviour and Adaptation clauses.
- `tools/divergence/divergence.ts`: the `check [--root]` CLI and `checkDivergence(root)`. It reuses Boost's `parseFrontmatter`/`divergenceClauses`, the harness's `portedTestFiles` and pin-bump's `readExpectations`.
- `conformance/tests/xaravel/divergence.test.ts`: XT-conformance-149..152.
- `conformance/tests/xaravel/repository-policy.test.ts`: XT-conformance-33's exact `check`-job step list gains `bun run divergence:check`.
- `package.json` (the `divergence:check` script), `.github/workflows/ci.yml` (the step and its header comment), `tsconfig.json` (include `tools/divergence`).
- `docs/ops/divergence.md` (new), `docs/ops/ci.md` and `conformance/README.md` (links), and the `tools/expectations/reasons.ts` header comment (`adapted` is now checked by `divergence:check`).
- `_bmad-output/implementation-artifacts/epic-8-context.md`: the compiled Epic 8 context.

**Review findings.** 30 in total: 12 medium, 14 low and 4 false.
- **Patched (16 rows):**
  - Comment markers: a spaced marker, a block comment and a second marker on the same line were each skipped; every `adapted:` in a comment is now checked.
  - `adapted` on a line that is not `pass` is now a violation.
  - XT-149 no longer cites FR-8.1, and it checks each ruling's citations against its own record.
  - Clauses DIV-6.2/6.3 and DIV-9.7–9.11 now state test-adaptation rules, and the rule for closing a clause is written down.
  - DIV-11 now carries AD-13's scope.
  - The context file's placement of the notices clause now matches the records.
- **Deferred (1):** the cross-check that an Expectations marker and its Ported Test's markers cite the same clause (PRD §5.1). No Story's ACs cover it yet, so it needs an action item or an Escalation; the details are in `deferred`.
- **Rejected:** each row in the Review Triage Log gives its reason.

**Follow-up review recommended: true.** Eleven medium entries were patched, all medium and none high. The specific risk not yet verified is that the rewritten marker parser in `tools/divergence/divergence.ts` now scans `/* */` comments and every token. Only synthetic fixtures check it, because the repository has no Ported Tests yet. Re-check it when the first Ported Test with a marker lands (Story 8.7's pilot).

**Verification.** All of these pass:
- `bun run divergence:check` prints `Divergence OK: 12 record(s), 39 clause(s); 0 Expectations marker(s), 0 assertion marker(s) checked.`
- `bun run harness --xaravel` reports `XARAVEL tests=269 passed=269 failed=0 skipped=0`, `SUMMARY … differ=0`. That includes XT-conformance-149..152, XT-conformance-33 and XT-boost-1.
- `typecheck`, `lint`, `expectations:check`, `expectations:reasons` and `escalations:check` each exit 0.

**Residual risks**
- Clause wording beyond the PRD text was taken from the cited ADs. The Fidelity Review (Story 8.5) should confirm that no clause adds behaviour.
- The harness's `waiverFor` still accepts unquoted `fewer_assertions` numbers. `divergence:check` rejects them in the same required job.
- The record-shape example in `docs/ops/divergence.md` shows DIV-11.4 in its earlier three-line form, as an illustration of continuation lines.
- Every record is a Protected Path, so this merges under the MAINT ruling as an Infrastructure Story.
