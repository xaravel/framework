---
decision: approved
decided_by: Maintainer
date: 2026-10-22
escalation_sha256: "5abdae91aaa0f3bd88718a62c416e2a45f10c4d29d36b7e101742d25eacb3760"
---

# ESC-9.10-3: approved, option 2 (the review's evidence (e) is scoped to the Story's own change)

## Why

Story 9.10's prompt was over the 600,000-character cap because its review diff held other PRs' files. While the Story was blocked, ruling and tool PRs merged into its base range: #303's `fidelity-review.test.ts` alone was 118 KB of section (e). Those PRs were reviewed on their own. The Story's review should judge the Story's change. Raising the cap (option 1) treats the symptom, and the range grows again with each PR that merges while a Story waits.

## The rule

`tools/fidelity-review/fidelity-review.ts` scopes evidence (e) to the Story, with `inStoryScope`:
- A touched Xaravel Test is the Story's when its file is a path the Story may edit (`allowedPath`, the ownership rule), or when it declares an Xaravel Test id the Story's manifest assigns. The second case covers an Infrastructure Story, whose tests live under `conformance/tests/`.
- (e) shows only those tests. It names every other touched test file in one line, as left out and why. Nothing is dropped silently.
- Evidence (h), whole files (MAINT-2026-10-22-fidelity-whole-files), puts changed files outside the Story's scope last, marked so, and reserves room for every entry's heading and note. It can no longer push a prompt over the cap. Before this ruling it could, and the review would then stop.
- The diff, sections (a), (b), (c), (d), (f) and (g), every checklist item's Check, the verdict rule and `PROMPT_CAP` are unchanged.

`conformance/review/fidelity.md` adds a "Story scope" evidence note above the items. `docs/ops/fidelity-review.md` describes the rule.

**Measured on Story 9.10** (base `c870bc2`, as the Escalation sets):
- Without the scoping, the prompt is 649,214 characters, over the cap.
- With it, the prompt is 556,892 characters, of which (e) is 197,101, and only `conformance/tests/xaravel/fidelity-review.test.ts` is left out.
- With (h) filled, the prompt is 585,409 characters.

## Next

Story 9.10 re-runs its Fidelity Review with `--base c870bc261d2bcea7b12296896c8650f52e124573`, after landing ESC-9.10-2. Option 1, raising the cap to 700,000, is not taken. A cap change stays the Maintainer's, under MAINT-2026-10-22-fidelity-whole-files.

## Rationale

- **No review of the Story is weakened.** Every test the Story owns is still shown in full. A test it does not own is named, and that test's own PR carried its review.
- **It fixes the cause.** A blocked Story no longer inherits the review load of every PR merged while it waited.

This ruling clears ESC-9.10-3 for XT-runtime-35, 36 and 37.
