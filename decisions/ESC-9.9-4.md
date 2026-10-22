---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-21
escalation_sha256: "cc2dc7de0dd2fc6dac1f26341b4d3e3d8dbeb9626d22cefa82fd7e4bc0dcc0ba"
---

# ESC-9.9-4: approved, option 1 (evidence (e) carries the declarations each Xaravel Test uses from its own file)

`tools/fidelity-review/fidelity-review.ts` supplies an existing evidence item in more cases:

- **Evidence (e).** Each Xaravel Test (e) includes now also carries, in full and with its `path:lines`, every declaration in the test's own file that it uses by name, and every one those use, to a fixed point, in file order (`usedDeclarations`). That covers the helpers it calls and the class or trait fixtures they or it name. A declaration several included tests use is shown in full at its first use and named as `shown above` after that, so the prompt does not repeat it. Imported helpers and setup units such as `registerClass(…)` are not listed. The diff and the import-following rules that choose which tests (e) includes do not change.

`conformance/tests/xaravel/fidelity-review.test.ts` tests the new case: the fixed point through another helper, class fixtures named through `extends mixin(…)` and through a helper, an import that is not listed, a test that uses no declaration, the real XT-runtime-31 (it gets `checkComposition`, `checkDefaultLimits` and `SetsName`), and a shared helper shown once. `conformance/review/fidelity.md` (F-7) and `docs/ops/fidelity-review.md` say what the prompt now carries.

The reject this answers is reviewer 1's (codex, gpt-6.1-sol) F-7 reject at tree `fc517f78e9585cd0072af8c3353a9c463810b181` (base `4a3cd9f`) of Story 9.9: "Supply the complete checkComposition and checkDefaultLimits helpers and their relevant fixture definitions, including SetsName, so the trait composition, default handling and private-property setup claimed by XT-runtime-31 can be verified." Reviewer 2's F-7 note says the same about `SetsName`. All of it is in `packages/runtime/tests/xaravel/traits.test.ts` on `main`. With this change the prompt shows it.

**The re-run's base.** Story 9.9 re-runs its Fidelity Review on the changed tree with `--base a5ecf3905763930a6d18c518924c7e12afa3e303`, the parent of the Story's first PR (#290). #290 and #293 merged the Story's code while it was blocked, before any Fidelity Review ran, and the spec's `baseline_revision` now points after them, so the default base would leave them out. The tree changes with this ruling, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings.

Rationale:

- **The evidence exists, but the tool never showed it.** (e) printed only the `xaravelTest(…)` unit, so a test whose body is two helper calls showed the reviewers nothing they could check, even when the change edits one of those helpers. That is the gap the 2026-10-21 amendment lets the orchestrator close.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes, and no evidence is removed or narrowed. No assertion, expected value, skip or `adapted:` marker changes, and no divergence is added.
- **Option 1 over option 2.** Option 2 narrows what F-7 judges, which the amendment does not let the orchestrator do, and it would leave every helper-based Xaravel Test unverifiable. Inlining the helpers into the test, the only in-Story route, would restructure a passing test only to fit the prompt.

This ruling clears XT-runtime-31, the only Test ID ESC-9.9-4 stops. Story 9.9 is unblocked.
