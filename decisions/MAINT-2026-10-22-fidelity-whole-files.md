---
decision: approved
decided_by: Maintainer
date: 2026-10-22
scope: Fidelity Review evidence (h), whole files
---

# Maintainer ruling: the Fidelity Review shows whole files

The Maintainer gave this ruling on 2026-10-22, in the Maintainer's session.

## Why

The Fidelity Review builds its prompt from slices of the repository: the diff's hunks, the body of a touched test, and the decisions cited on added lines. Reviewers are told to fail when unsure. Each slice missed some evidence a correct change relied on, so seven Escalations in Epic 9 stopped a Story only to widen one slice: ESC-9.2-1, ESC-9.2-2, ESC-9.3-2, ESC-9.8-2, ESC-9.9-4, ESC-9.9-5 and ESC-9.10-1. Each cost a block, a tool change and a full re-review.

For Story 9.9, measured from the loop's logs:
- **What the gaps cost:** the two gaps (ESC-9.9-4 and ESC-9.9-5) took four iterations: about 206K output tokens, 22.5M cache-read tokens, about $15.8 API-equivalent and 58 minutes. Two Fidelity Review runs were rejected only for missing evidence.
- **What whole files would have cost:** about 40K to 45K more input tokens per reviewer per run, or about 180K tokens for the Story's two needed runs.

## The rule

`tools/fidelity-review/fidelity-review.ts` adds evidence (h), whole files.

1. **What it shows:**
   - every file the change adds or modifies, in full;
   - every decision and DIV record those files cite anywhere, not only on changed lines;
   - the repository files they import, followed `WHOLE_FILE_DEPTH` (2) levels: relative static imports, re-exports, side-effect imports, literal dynamic imports, and the `join(REPO, …)` dynamic-import idiom.
2. **Order and budget:** (h) fills what the prompt cap (600,000 characters) leaves after every other section, in this order:
   - the cited records and the files changed test files import, which no other section shows;
   - the changed TypeScript and Markdown, whose diff is already in the prompt;
   - the other imports;
   - the other changed files.
3. **Nothing is dropped silently.**
   - A file another section shows in full is named, not repeated.
   - A file longer than `WHOLE_FILE_CAP` (60,000 characters), or one that no longer fits, is named as omitted for size.
   - The prompt tells the reviewers that a named file is not missing.
   - (h) never makes a prompt too large, so it never stops a review.
4. **What (h) does not show:** removed and binary files, Oracle fixtures (they are evidence (c)), lockfiles and package imports.
5. **Nothing else changes:** evidence (a)..(g) stay as they are. No checklist item's Check, the verdict rule, the verdict schema, the standing-reject rule and how reviewers are chosen are unchanged. `conformance/review/fidelity.md` describes (h) in its evidence notes.

## Future evidence gaps

The 2026-10-21 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md` still applies. When a reject asks for evidence the prompt lacks:
- **The orchestrator first widens (h),** for example by following another kind of import, rather than adding a new case-by-case slice.
- **Raising `PROMPT_CAP` or `WHOLE_FILE_CAP` is the Maintainer's call.** If evidence a reviewer needs is omitted for size, the Escalation asks the Maintainer instead.
