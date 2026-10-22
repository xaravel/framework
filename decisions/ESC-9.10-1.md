---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-22
escalation_sha256: "3b8bf321edbd32b085b0cbe035a3b54c32714c750a51efd153b9e05c3e9ef446"
---

# ESC-9.10-1: approved, option 1 (the review shows a spread-called helper, an imported test helper and a docblock's decision)

`tools/fidelity-review/fidelity-review.ts` supplies three existing evidence items in more cases:

- **Evidence (e), spread calls.** `usesName` counts a name after a spread (`...inherited()`) as a use. Its lookbehind still rejects member access (`env.inherited`). So `usedDeclarations` now carries `inherited`, which `child()` spreads, for XT-runtime-1.
- **Evidence (e), imported test helpers.** A touched Xaravel Test's entry also lists, in full and with that module's `path:lines`, every declaration it uses (to the same fixed point as ESC-9.9-4, through its own-file helpers too) that its file binds from a repository test module (`importedDeclarations`). The binding may be a relative named import, or the dynamic-import idiom `const { X } = (await import(PATH)) as …` whose `PATH` resolves through `join`/`resolve` of `import.meta.dir`, a `const` of the file and string literals. Inside that module, the declarations it uses and the names it imports are followed the same way. A namespace import, a non-test module, a path the tool cannot resolve, and a name the module does not declare stay unlisted. The prompt names such a declaration by its own path, under a heading that says it comes from an imported module.
- **Evidence (f), docblock citations.** (f) also carries each decision record cited in a docblock that evidence (g) lists for an added or modified `packages/*/src/` file: a declaration's or an `@asyncRoot` tag's docblock, on an unchanged line too (`sourceDocComments`, `sourceDocTexts`).

`conformance/tests/xaravel/fidelity-review.test.ts` tests each new case: a spread use and a member access that is not a use; static, renamed and dynamic imports followed through a module and into its own import; a namespace import, a non-test module, an undeclared name and an unresolvable path left out; the real XT-runtime-1 (`inherited`) and XT-runtime-22 (`BrandedArray` from `packages/assert/tests/xaravel/oracle-values.ts`); the prompt's path and heading; the entry `xaravelTestEvidence` builds; and docblock citations, including the real `registry.ts` citing `decisions/ESC-9.4-1.md`, while a test file adds none. The wording of evidence (e) and (f) changes to match, in the evidence notes of `conformance/review/fidelity.md` (above the checklist items; no Check changes) and in `docs/ops/fidelity-review.md`. The (f) heading now says what the section carries.

The rejects this answers are both reviewers' rejects of Story 9.10. At tree `731e2f1e1b46da1e19449b048a3d39ce405d6701`, reviewer 1 (codex, gpt-6.1-sol) rejected F-7 ("Provide the full BrandedArray declaration used by XT-runtime-22", "Provide the inherited() helper called transitively through child() by XT-runtime-1") and F-9 ("Supply decisions/ESC-9.4-1.md, cited by the retained resolveClassAsync docblock"). At tree `a1d55531d1fc5231be8fe9552dfdd282519def95`, both reviewers (codex, gpt-6.1-sol; claude, claude-opus-5-5) rejected P-4, P-5 and P-6 on the same three points. Run against the Story's branch with `--base 6837b0675db1977c0917e3e0ade582fb1b9d7b2e`, the tool now gives XT-runtime-1 `inherited` and XT-runtime-22 `BrandedArray` (from `oracle-values.ts`), and (f) now includes `decisions/ESC-9.4-1.md`.

**The re-run's base.** Story 9.10 re-runs its Fidelity Review on the changed tree with `--base 6837b0675db1977c0917e3e0ade582fb1b9d7b2e`. This ruling changes the tree, so the standing-reject rule (ESC-8.8-1) lets the review run. The new review must address the reject's findings.

Rationale:

- **The evidence exists, but the tool never showed it.** All three pieces are in the repository on `main`. The tool missed them because of a lookbehind that read the spread's last `.` as member access, an (e) that looked only in the test's own file, and an (f) that read citations only from added lines and touched tests. The 2026-10-21 amendment lets the orchestrator close that kind of gap.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes, and no evidence is removed or narrowed. No assertion, expected value, skip or `adapted:` marker changes, and no divergence is added.
- **Option 1 over option 2.** Option 2 would cite the decision on a touched line and inline the helpers into the tests. It answers this Story only, and it restructures passing tests to fit the prompt.

This ruling clears XT-runtime-35, 36 and 37, the Test IDs ESC-9.10-1 stops. Story 9.10 is unblocked.
