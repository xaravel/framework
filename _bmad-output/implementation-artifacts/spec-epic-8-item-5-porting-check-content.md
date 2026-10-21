---
title: 'Epic 8 action item 5: porting:check requires content in the five rulebook sections'
type: 'bugfix'
created: '2026-10-20'
baseline_revision: 'df42790838673c23caa46af11bf13e0d9959446f'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-retro-2026-10-20.md'
  - '{project-root}/docs/ops/porting.md'
warnings: []
deferred:
  - summary: >-
      porting:check still passes with Frame slots (AD-5), APP_KEY forms (AD-23), Promise.all allow-list (AD-6) and PCRE conversion (DIV-10) emptied to bare headings.
    evidence: |-
      The S5 probe emptied every section but Construct mapping and DIV-12; this item adds SECTION_CONTENT for the five sections the action item names, so the other four are still checked only by XT-conformance-153's own assertions, not by the CI gate. Found by the blind and intent-alignment review layers.
    location: >-
      tools/porting/porting.ts SECTION_CONTENT
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `porting:check` checks only that the `## Idiom table`, `## Test-adaptation rules`, `## Mechanical expression rule`, `## By-reference parameters` and `## Exceptions` headings exist (`tools/porting/porting.ts` `checkPorting`; XT-conformance-153). A `PORTING.md` with those five sections emptied still prints `PORTING OK`, exit 0 (finding S5).

**Approach:** Add a per-section content rule, `SECTION_CONTENT`, for those five sections. Each section, from its heading to the next `#`/`##` heading, must hold (a) at least one content line of the kind it is written in (table data row, `- ` rule line, or prose paragraph line) and (b) a fixed anchor phrase that states the section's core rule. Each problem is a separate violation. Extend XT-conformance-153 with failing cases that empty a section and that drop an anchor.

## Boundaries & Constraints

**Always:** Change only `tools/porting/porting.ts` (the rule, its header comment), `conformance/tests/xaravel/porting.test.ts` (XT-conformance-153 failing cases added; no existing assertion removed or weakened), and `docs/ops/porting.md` (the Rules list). The real `PORTING.md` passes unchanged. `report.sections` keeps meaning headings present (11). Kinds and anchors:

| Section | Kind (≥1 line) | Anchor |
| --- | --- | --- |
| `## Idiom table` | table data row (not header, not separator) | `The parity rule` |
| `## Test-adaptation rules` | rule line (`- `) | `Never weaken an expected value` |
| `## Mechanical expression rule` | table data row | `syntax-directed` |
| `## By-reference parameters` | prose line (non-blank, not a table, bullet, fence or heading line) | `` `Ref<T>` `` |
| `## Exceptions` | rule line | `` `registerClass('<FQCN>', X)` `` |

A missing section is reported only by the existing `missing section` rule (no content violations for it). Content is read outside code fences.

**Never:** No change to `PORTING.md`, `AGENTS.md`, `conformance/expectations/**`, the other six sections' rules, the CLI usage or exit codes, or the `PORTING OK` line's format. No new XT id.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Real repo | committed `PORTING.md` | `PORTING OK`, exit 0, `violations` empty | — |
| Section emptied | body of `## By-reference parameters` deleted | `PORTING.md: section "## By-reference parameters" has no prose line` and `... lacks "`Ref<T>`"`; exit 1 | — |
| Table rows removed | Idiom table data rows deleted, header kept | `PORTING.md: section "## Idiom table" has no table row`; exit 1 | — |
| Anchor removed | `syntax-directed` reworded | `PORTING.md: section "## Mechanical expression rule" lacks "syntax-directed"`; exit 1 | — |
| Anchor only in a code fence | anchor text moved inside ``` fence | `lacks` violation | — |
| Section missing | heading renamed | only `missing section` for it | — |

</intent-contract>

## Code Map

- `tools/porting/porting.ts` -- `REQUIRED_SECTIONS` (l.57), `headings()` (fence-aware), `tableCells`/`isSeparator`, `checkPorting` section loop builds `located: Map<heading, lineIndex>` (~l.433); add the content check after the `duplicate section` loop, using `located`. Header comment Rules list (l.15-40).
- `conformance/tests/xaravel/porting.test.ts` -- XT-conformance-153 `failing` array (~l.190): `[files, expectedStderrSubstring]` run through the CLI with `fixture()`. Add cases there; also assert the real-repo `violations` stays `[]` (already present).
- `docs/ops/porting.md` -- Rules bullets (l.16 onward); add one bullet describing the content rule and its messages.

## Tasks & Acceptance

**Execution:**
- `tools/porting/porting.ts` -- export `SECTION_CONTENT` (heading → `{ kind: "table" | "rule" | "prose", anchor }`); in `checkPorting`, for each located section scan lines to the next `#`/`##` heading outside fences, count lines of its kind, test the anchor on non-fence text; push `PORTING.md: section "<h>" has no <table row|rule line|prose line>` and `PORTING.md: section "<h>" lacks "<anchor>"`; document in the header comment -- closes S5.
- `conformance/tests/xaravel/porting.test.ts` -- add failing cases: each of the five sections emptied (body removed up to the next heading) yields its `has no` and `lacks` messages; Idiom table rows removed with header kept yields `has no table row`; Mechanical anchor reworded yields `lacks`; anchor inside a fence yields `lacks` -- the XT-153 case the action item asks for.
- `docs/ops/porting.md` -- add the content rule to the Rules list.

**Acceptance Criteria:**
- Given the committed repo, when `bun run porting:check` runs, then it prints `PORTING OK: 17 construct row(s) decided, 11 section(s), …` and exits 0.
- Given a `PORTING.md` with any one of the five sections emptied, when `porting:check` runs, then it exits 1 and names that section.
- Given the full Xaravel suite, when `bun test conformance/tests/xaravel/porting.test.ts` runs, then XT-conformance-153 and -154 pass.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 22 findings — high 0, medium 2, low 17, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) Prose kind's exclusions (table, bullet) unpinned; "any non-blank line" keeps XT-153 green — added a By-reference case with only a bullet and a table, asserting `has no prose line` and no `lacks`.
  - `[low]` `[reject]` (edge) Thematic break, HTML comment, blockquote or indented code counts as a prose line — PORTING.md uses none of these in the five sections; the fix adds four guards for an unlikely edit.
  - `[low]` `[reject]` (edge) Anchor inside an indented code block or HTML comment counts — same as above; unlikely, and the fix adds filtering branches.
  - `[low]` `[reject]` (edge) An all-empty-cell row counts as a table data row — a deliberate placeholder row is unlikely; adds a guard.
  - `[low]` `[reject]` (edge) A header row with no separator counts as data — that is not a Markdown table; unlikely in a reviewed rulebook.
  - `[low]` `[reject]` (edge) An anchor wrapped across a line break gives a false `lacks` — fails loudly with the anchor named; every anchor sits on one line today.
  - `[low]` `[reject]` (edge) Mixed ```/~~~ fences flip fence state — the same rule `headings()` already uses; no mixed fences in PORTING.md.
  - `[low]` `[patch]` (edge) Test helpers build a wrong fixture silently when `indexOf` returns -1 — added `toBeGreaterThan(-1)` checks.
  - `[medium]` `[defer]` (blind) Frame slots, APP_KEY forms, Promise.all allow-list and PCRE conversion can still be emptied with PORTING OK — real, but the action item and S5 name only the five sections (S5: "for five required sections"); the four are outside this item. Deferred.
  - `[low]` `[reject]` (blind) Prose kind accepts non-prose lines — same root cause as the edge-hunter prose finding; rejected on the same grounds.
  - `[low]` `[reject]` (blind) Rule kind counts only `- ` bullets — documented as `- ` rule lines; a `* ` rewrite fails loudly, never passes wrongly.
  - `[low]` `[patch]` (blind) Fence case tested only for prose — added an Exceptions body inside a fence, asserting `has no rule line`.
  - `[low]` `[patch]` (blind) Single-cause cases do not assert that the other message is absent — added `not.toContain` for both.
  - `[low]` `[patch]` (blind) The test's separator regex rejects alignment colons, unlike `isSeparator` — the regex now accepts `:?-{3,}:?`.
  - `[low]` `[reject]` (blind) One stub line and the anchor satisfy a section — this is the floor the intent asks for ("rows or rule lines plus an anchor phrase").
  - `[low]` `[patch]` (blind) Anchors are load-bearing but not discoverable from the revising guidance — docs/ops/porting.md now says that rewording an anchor needs the matching `SECTION_CONTENT` change.
  - `[low]` `[patch]` (blind) "One violation each" is ambiguous; the duplicate-section behaviour is unstated — reworded in docs/ops/porting.md.
  - `[low]` `[reject]` (blind) Spec Code Map line numbers are stale and its logs are empty — the fix edits this build's spec.
  - `[false]` `[reject]` (intent) Scope "every required section" vs five — the same as the deferred four-section finding; the intent names five. Logged against that entry.
  - `[false]` `[reject]` (intent) A prose kind departs from "rows or rule lines" — the real By-reference section is one paragraph, and the intent forbids changing PORTING.md; prose is the only kind that passes it unchanged.
  - `[false]` `[reject]` (intent) The anchor is independent of the kind line — the intent says "rows or rule lines plus an anchor phrase", which are two independent conditions.
  - `[low]` `[reject]` (intent) Only the Idiom table has a case that keeps the anchor but loses its kind lines — for both rule sections the anchor sits in a bullet, so the case cannot be built; the new By-reference bullet-and-table case covers prose.

## Verification

**Commands:**
- `bun run porting:check` -- expected: `PORTING OK`, exit 0
- `bun test conformance/tests/xaravel/porting.test.ts` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: clean

## Auto Run Result

Status: done

**Summary.** `porting:check` now requires content in the five rulebook sections named by Epic 8 retro action item 5 (finding S5). Each section needs at least one line of its kind (a table data row, a `- ` rule line, or a prose line) and a fixed anchor phrase, both read outside code fences, with one violation per missing item. The committed `PORTING.md` passes unchanged.

**Files changed.**
- `tools/porting/porting.ts`: `SECTION_CONTENT`, `sectionBody`, `countKind`, the content loop in `checkPorting`, and the header comment.
- `conformance/tests/xaravel/porting.test.ts`: XT-conformance-153 failing cases:
  - each of the five sections emptied;
  - Idiom table rows removed;
  - the Mechanical anchor reworded;
  - an anchor that appears only inside a fence;
  - a By-reference body with only a bullet and a table;
  - the Exceptions body inside a fence;
  - a renamed section with no content violations.
- `docs/ops/porting.md`: the rule bullet, plus an anchor note in "Revising the rule".

**Review.**
- 22 findings across 4 layers. The Fidelity Review was skipped because this is not a Story.
- 8 patched: 1 medium, 7 low. They are test cases and docs wording only.
- 1 deferred: the four other sections (Frame slots, APP_KEY forms, Promise.all allow-list, PCRE conversion) still have no content check in the gate. Their content is asserted only by XT-conformance-153.
- 13 rejected, with reasons in the Review Triage Log: unlikely Markdown shapes whose fix adds guards, a fix that would edit this spec, and readings the intent settles.

**Follow-up review recommended:** false. One medium entry was patched and no high.

**Verification.**
- `bun run porting:check` prints PORTING OK (17 constructs, 11 sections, 1516 pairs, 20 fixtures).
- `bun test conformance/tests/xaravel/porting.test.ts`: 2 pass, 457 expect calls.
- `bun run typecheck` and `bun run lint` are clean.
- The implementer's mutation checks confirmed that the new cases fail when the rule is weakened.

**Residual risk.** The anchors are fixed strings, so a reword of `PORTING.md` must update `SECTION_CONTENT` in the same change. The docs now say this.
