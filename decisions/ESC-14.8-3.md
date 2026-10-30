---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-29
escalation_sha256: "87cce690eca263693f89dafbf15160aed6791c88b6f11f7374e8ea9593a9afa4"
---

# ESC-14.8-3: approved, option 1 ((h) shows the source of a name a changed line imports from another workspace package)

`tools/fidelity-review/fidelity-review.ts` now gives the reviewers the existing source of another Component's export that a change imports:

- **Which imports.** `packageImports` reads each `import { … } from "@xaravel/<component>[/<subpath>]"` (and `export { … } from`) statement of a changed TypeScript file that touches a changed line (every statement of an added file). A package's imports of itself are left out: its own source is the Story's.
- **How a name is resolved.** The package is found by name in `packages/*/package.json` (`workspacePackages`), and the specifier through its `exports` map (a string, or the `bun`, `import` or `default` condition). From that entry file, `declaringFile` finds the file that declares the name: a direct declaration; a local `export { x }` of a binding the file imports, followed to that import; a named re-export, with `as`; `export * as`; or `export *`. Relative and package specifiers are both followed.
- **Where it goes.** Each declaring file is an (h) entry headed `declares <names>, which <file> imports from <specifier>`. It comes after the other imports and before the other changed files, whose diff is above, within the existing whole-file budget, cap and omission rules. A name it does not find is an entry named `<specifier> { <names> }`, with why it is unavailable: no such package, no such `exports` entry, or no such export.

`conformance/tests/xaravel/fidelity-review.test.ts` (XT-conformance-161) tests each case on a fixture workspace:

- a direct export through a conditional `exports` subpath;
- a barrel re-export with `as` (`sum as array_sum`), where a commented-out re-export is ignored;
- a star re-export;
- a barrel's local re-export of a name it imports;
- a name the package does not export, a subpath its `exports` map lacks and an unknown package, each with its reason;
- only the multi-line statement holding the changed lines counts;
- the package's own import adds nothing;
- the (h) entries and their order.

It also checks the real case: the `@xaravel/runtime/php` import line of `SupportLazyCollectionIsLazyTest.test.ts` resolves `array_sum` to `packages/runtime/src/php/arithmetic.ts`.

The **Whole files** evidence note in `conformance/review/fidelity.md` now says what the prompt carries; no item's **Check.** changes. `docs/ops/fidelity-review.md` describes the new (h) entries.

The reject this answers is reviewer 1's F-8 reject (codex, gpt-6.1-sol) at tree `92950b0dd8f5c8d205c904cfb4685c8306647232` (base `7ac1bdfd`) of Story 14.8. Its one `missing-evidence` finding is on `SupportLazyCollectionIsLazyTest.test.ts`: "Supply the Runtime array_sum export and implementation, with evidence of its separately landed Oracle-verified contract." Run on that change, (h) now shows `packages/runtime/src/php/arithmetic.ts` in full, with its PHP 8.5.11 `array_sum` docblock and body. The landing records were already in (h): `decisions/ESC-14.8-2.md` and `decisions/MAINT-2026-10-29-story-14-8.md`, which the Story's spec cites.

**The re-run.** Story 14.8 re-runs its Fidelity Review on a changed tree with its spec's base. This ruling changes the tree, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings.

Rationale:

- **The evidence exists, but the tool never showed it.** `array_sum` is implemented at `packages/runtime/src/php/arithmetic.ts:65` and exported from `packages/runtime/src/php/index.ts:203`, landed by action item `epic-14-item-17-runtime-array-sum` (#527). `fileImports` followed only relative specifiers. The 2026-10-21 amendment lets the orchestrator close that kind of gap.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes. No evidence is removed or narrowed: relative imports, cited records and changed files keep their places. Only changed files outside the Story's scope, the last entries, can now yield room to the new entries. No assertion, expected value, skip, Skip Reason rule or `adapted:` marker changes, and no divergence is added.
- **Option 1 over option 2.** A comment in the Ported Test does not show the reviewers the implementation, so it cannot answer the finding.
- **It is general.** Any Story whose test or source newly imports another Component's export now shows that export's source, so the next Story that relies on a newly landed runtime helper does not meet the same gap.

This ruling clears ESC-14.8-3, Story 14.8's last open Escalation. Story 14.8 is unblocked.
