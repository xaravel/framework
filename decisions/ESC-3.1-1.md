---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-17
escalation_sha256: "d3d4d5d695b358e3f030820817d9cea60afb93a92bac29bd58fc7ccfa032387b"
---

# ESC-3.1-1: approved, option 1 (typed inputs per kind, closed Differential set per family)

Story 3.1 is built as the Escalation's `proposed` text describes:

- A request has exactly the keys `id`, `kind`, `input` and `sha256`, in that order. `sha256` is the lowercase hex SHA-256 of the canonical JSON of `{id, kind, input}`: keys sorted by UTF-16 code unit at every depth, no whitespace, UTF-8, `/` unescaped, the same rule as `canonical()` in `tools/ruleset/ruleset.ts`. Story 3.2 names fixtures by that hash.
- The Differential set is closed and listed in each family's extractor module under `tools/oracle/extract/`: Str (SupportStrTest, SupportStringableTest), the SQL grammars (DatabaseQueryBuilderTest and the five Database*SchemaGrammarTest files), Blade (`compileString('<literal>')` inputs under `tests/View/Blade/` and the `Blade::render(...)` calls in `tests/Integration/View/BladeTest.php`), validation messages (the ValidationValidatorTest methods asserting on `messages()` or `errors()`) and date formatting (SupportCarbonTest). A Test ID × dataset from those files is Differential exactly when its extractor captures at least one input from its body; every other one stays an ordinary Ported Test, and a missed dataset goes through Story 3.4.
- `input` per kind is the typed shape the Escalation lists for `php-expr`, `sql-grammar`, `blade-render`, `validation-message` and `date-format`. A body the extractor cannot read into its kind's input yields no request.
- Bodies are read statically from `conformance/upstream/`; dataset rows come from lister.php's `export()` in the Oracle image, or locally with `--local`. Two runs give the same bytes.

Rationale:

- **No planning document changes.** The ACs of Story 3.1 fix the four fields, the output path and "one request per Differential Test ID × dataset"; this ruling fills in what they leave open. The spine, the SPEC and `epics.md` stay as they are.
- **The grader is not weakened.** No assertion is removed, no expected value weakened, no skip added and no `adapted:` marker introduced. A Test ID that yields no request is not skipped: it stays an ordinary Ported Test asserting Upstream's literal expected values. Blade's rendered-HTML expected values are what DIV-5 already specifies.
- **Faithful, and no run-time cost.** Requests are data generated once per Pin, closer to AD-15's "extracted mechanically" than verbatim PHP snippets (option 2), and unlike option 3 they give DIV-5 its rendered HTML and can serve Story 3.4's per-Story inputs.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or move Xaravel away from a faithful port.
