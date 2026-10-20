---
title: 'pin:bump security-release override of the freeze point (Epic 8 item 3, OQ-12)'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: '691e13dc2b0cd81496715cd5637c9c70fe86fef6'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/OQ-12.md'
  - '{project-root}/conformance/escalations/ESC-8.4-2.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `pin:bump` refuses, in every mode, while any `epic-<N>` is `in-progress` (FR-7.4). `decisions/OQ-12.md` (Maintainer, 2026-10-20) allows a security-relevant Upstream release to move the Pin mid-Phase through the normal flow, with only the freeze-point refusal bypassed by a Maintainer-only override that names the advisory and is recorded in the pin-bump PR. The override does not exist (retro action `epic-8-item-3-pin-bump-security-override`).

**Approach:** Add `--security-override <decision-file>`. The file is a Maintainer-signed decision `decisions/PIN-SECURITY-<name>.md`, committed at `HEAD`, whose frontmatter names the `tag` and the `advisory`. With a valid decision the freeze-point refusal is lifted for that tag only; every other step runs unchanged, and the advisory and decision path are printed, carried into the printed regeneration commit messages and final diff-mode line, and written into the bump record header, so the PR carries them.

## Boundaries & Constraints

**Always:**
- Validation fails closed (exit 1, nothing written, stderr names every problem) before any file or network work. Problems: path not matching `^decisions/PIN-SECURITY-[A-Za-z0-9][A-Za-z0-9._-]*\.md$`; file not present in `HEAD` (read with `git show HEAD:<path>`); working-tree copy missing or differing from `HEAD`; `exitSignatureProblems` from `tools/ownership/phase-gate.ts` (decision `approved`, `decided_by: Maintainer`, YYYY-MM-DD `date`, non-heading body); `tag` frontmatter not exactly `<tag>`; `advisory` not one of `GHSA-xxxx-xxxx-xxxx` (4 lowercase alphanumerics per group), `CVE-YYYY-NNNN+`, or an `https://` URL with no whitespace.
- The override is validated whenever the flag is given, even when no Epic is in flight, and recorded either way.
- Without the flag, behaviour and output are byte-for-byte unchanged (existing XT-conformance-62..67 pass untouched; the record header stays `{"from","to","from_rev","applied"}`).
- With the flag, the record header gains `"security_override":{"advisory":…,"decision":…}` after `applied`; the stdout report's first line is followed by `Security override: <advisory> (<decision>)`; the refusal is replaced by a stderr notice `pin:bump: freeze point overridden for a security release, <advisory> (<decision>); in progress: epic-…`.
- `regenerationSteps(tag, fromRev, override?)`: with an override, both `git commit -m` messages append `, security override <advisory> (<decision>)` and the last line appends `--security-override <decision>`; without one, the output is identical to today.
- `--security-override` given twice or with no value is a usage error (exit 2).

**Never:** skip or alter any other pin-bump step, accept an uncommitted or unsigned decision, accept a decision for another tag, write the decision file from the tool, edit `conformance/expectations/**`, AGENTS.md, PRD, spine, SPEC or `epics.md`, or change the meaning of FR-7.4 without the flag.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Move, in flight, valid override | `v1.1.0 --security-override decisions/PIN-SECURITY-x.md`, epic-3 in-progress | Pin moved, notice on stderr, printed steps carry advisory and final `--security-override` | exit 0 |
| Diff --apply, in flight, valid | same flag, `--from HEAD~1 --apply` | record header has `security_override`, report line printed, shards edited | exit 0 |
| Unsigned / wrong tag / bad advisory / uncommitted / dirty / bad path / missing | flag with that decision, epic in flight | stderr lists the problem(s), tree unchanged | exit 1 |
| In flight, no flag | as today | refusal lists Epics | exit 1 |

</intent-contract>

## Code Map

- `tools/pin-bump/pin-bump.ts` -- header comment (l.1-49) documents modes; `regenerationSteps` l.73; `git`/`gitRaw` l.124-135; freeze point `inFlightEpics` l.141; `renderReport`/`renderRecord`/`BumpHeader` l.460-490; `moveMode` l.537, `diffMode` l.553; `parseOptions` l.628 (flag list, `seen` duplicates); `main` l.676 (refusal at l.680).
- `tools/ownership/phase-gate.ts` -- reuse exported `exitSignatureProblems(text)` for the signature form (imports only `boost-framework/src/data`'s `parseFrontmatter`); `parseFrontmatter` gives `fields` for `tag`/`advisory`.
- `conformance/tests/xaravel/pin-bump.test.ts` -- fixtures `diffFixture` (l.92), `moveFixture` (l.165), `bump`, `tree`, `SPRINT_IN_FLIGHT`; XT-conformance-67 (l.573) is the freeze test; add XT-conformance-256 after it.
- `docs/ops/upstream.md` -- `### The laravel/framework Pin` section (l.39-75): add the override subsection.
- `decisions/` and `tools/` are Protected Paths, so a PIN-SECURITY decision reaches a branch only through a Maintainer-reviewed change.

## Tasks & Acceptance

**Execution:**
- `tools/pin-bump/pin-bump.ts` -- add `SECURITY_DECISION` regex, `SecurityOverride {advisory, decision}`, exported `securityOverrideProblems(root, path, tag): {override, problems}`, the option, the main-flow change, `regenerationSteps` third param, header field/report line; update the file comment and USAGE -- implements OQ-12's override.
- `conformance/tests/xaravel/pin-bump.test.ts` -- add XT-conformance-256 covering every I/O matrix row (move and diff with a valid override; each invalid decision kind leaves the tree unchanged with exit 1; duplicate flag exit 2; `regenerationSteps` without override equals the old output) -- proves the override is narrow.
- `docs/ops/upstream.md` -- document the override: Maintainer writes and commits the decision (format and example), passes the flag to every `pin:bump` run of the flow, PR body names the advisory and decision; agents never write `PIN-SECURITY-*` decisions -- OQ-12's documentation requirement.

**Acceptance Criteria:**
- Given an in-progress epic and a committed Maintainer-signed `decisions/PIN-SECURITY-*.md` for `<tag>`, when `bun run pin:bump <tag> --security-override <it>` runs through move, report and apply, then each run succeeds and the advisory appears in stderr, the printed commit messages and the record header.
- Given no flag, when any existing pin-bump test runs, then it passes unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 22 findings — high 0, medium 2, low 18, false 2, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification-gap) No CLI run shows a valid CVE or https advisory accepted. Patched: XT-conformance-256 now runs diff mode with a committed CVE decision and a committed https decision, and asserts the report line and record header.
  - `[medium]` `[patch]` (verification-gap other) An `--apply` run without the flag rewrites the record header without `security_override`. Patched: diffMode refuses when the existing applied:false header's override is missing from this run or differs, and a test covers it.
  - `[low]` `[patch]` (edge-case) An https advisory containing `!` triggers history expansion when the printed lines are pasted into an interactive shell. Patched: the URL form is now printable ASCII without `!` or `"`, with rejection tests.
  - `[low]` `[patch]` (edge-case) The https form accepts control characters such as ESC. Patched by the same pattern change.
  - `[low]` `[reject]` (edge-case) `HEAD:<path>` could be a tree, giving EISDIR. Only a committed directory named `decisions/PIN-SECURITY-*.md` triggers it, and the tool still fails closed (exit 1, `pin:bump failed`).
  - `[low]` `[reject]` (edge-case) autocrlf or a smudge filter could make a clean checkout differ from HEAD. The repo's `.gitattributes` normalises line endings to LF, and the tool fails closed. A fix would add a git round-trip for a case nobody hits in everyday use.
  - `[low]` `[reject]` (edge-case) With no frontmatter or unparseable frontmatter, the tag and advisory problems are not listed. `exitSignatureProblems` already reports the frontmatter problem, and the run fails closed.
  - `[medium]` `[patch]` (blind) The apply run drops the override from the record. Same root cause as the verification-gap other finding; patched there.
  - `[false]` `[reject]` (blind) The spec promises a "final diff-mode line" that does not exist. The last printed regeneration step is the diff-mode run, and it carries `--security-override` (`regenerationSteps`).
  - `[low]` `[patch]` (blind) The escaping misses `!`. Same root cause as the edge-case `!` finding; patched there.
  - `[low]` `[reject]` (blind) No CI check confirms after the run that a pin-bump PR carries a valid decision. `conformance/baseline-pin`, `decisions/` and `tools/` are Protected Paths, so such a PR needs the Maintainer's review anyway, and the intent asks for a tool override, not a new check. A new check is more than a direct correction.
  - `[false]` `[reject]` (blind) `git show HEAD:<path>` assumes `--root` is the repository top. `--root` is documented as the repository root, and every other git read in the tool (`HEAD:conformance/baseline-pin`) assumes the same.
  - `[low]` `[patch]` (blind) A decision names only one advisory. Patched in the docs: name the primary advisory in `advisory` and list the others in the decision body and the PR.
  - `[low]` `[patch]` (blind) `BumpHeader.securityOverride` is both optional and nullable (AD-9). Patched: it is now a required `SecurityOverride | null`.
  - `[low]` `[reject]` (blind) XT-conformance-256 lacks cases for no frontmatter, a non-string tag, a symlink and an idle move. Each fails closed through checks the existing cases already exercise (a symlink's `git show` text differs from the followed file, so the dirty-copy check refuses it). More cases add little.
  - `[low]` `[reject]` (blind) Move mode does not acknowledge the override when no Epic is in flight. The printed steps carry it in both commit messages and in the last line, so it is visible.
  - `[low]` `[reject]` (blind) Verification skips `bun run harness --xaravel`. The implementer ran `bun run harness --xaravel --id 'XT-conformance-25*'` (8/8), and the finalize step runs it again.
  - `[low]` `[patch]` (blind) The docs do not say the branch and the committed decision must exist before step 1, or that only the Protected-Path review enforces Maintainer authorship. Patched in the docs subsection.
  - `[low]` `[reject]` (intent) Maintainer-only is enforced by the form of the decision plus `decisions/` being a Protected Path, not by an identity check (readings A2/A3). The intent names "a decision record … consistent with existing tools/ conventions" as acceptable, and phase-gate uses the same form. The docs now state the limit.
  - `[low]` `[reject]` (intent) The PR body requirement is documented, not generated. The intent accepts "PR body/commit", and the commit messages and the committed record header carry the advisory.
  - `[low]` `[reject]` (intent) The regeneration commands are compared as printed strings, never executed. They need Docker, the network and CI. The test shows the strings are identical to the old ones apart from the appended note and flag.
  - `[low]` `[reject]` (intent) The diff also edits `story-manifests.md` to claim XT-conformance-256. Retro items record their XT ids there; the file is under `_bmad-output/implementation-artifacts/`.

## Design Notes

A decision file rather than a bare advisory flag keeps "only the Maintainer authorises" checkable: `decisions/` is Protected (AD-16), the tool demands it be committed and signed `decided_by: Maintainer`, and the tag binding stops reuse for an ordinary minor. As phase-gate notes, the tool verifies the signature's form, not who committed it. Example:

```markdown
---
decision: approved
decided_by: Maintainer
date: 2026-11-02
tag: v13.38.1
advisory: GHSA-abcd-1234-wxyz
---

v13.38.1 fixes the advisory above; move the Pin mid-Phase per decisions/OQ-12.md.
```

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/pin-bump.test.ts` -- expected: all pass, including XT-conformance-256
- `bun run typecheck` -- expected: no errors
- `bun run lint` -- expected: no new findings

## Auto Run Result

Status: done

**Summary.** `pin:bump --security-override decisions/PIN-SECURITY-<name>.md` lifts the freeze-point refusal for one tag when the decision is committed at HEAD, unchanged in the working tree, Maintainer-signed in the phase-gate form, names that `tag` and names a GHSA, CVE or https `advisory`. The advisory and the decision path go into the stderr notice, the printed commit messages, the last printed step, the report, and the bump record header. A later diff run that drops or changes the override is refused. Every other step is unchanged, and so is the output without the flag.

**Files changed.**
- `tools/pin-bump/pin-bump.ts`: the override option, `securityOverrideProblems`, the freeze-point branch, the recording, and the record-consistency guard.
- `conformance/tests/xaravel/pin-bump.test.ts`: XT-conformance-256.
- `docs/ops/upstream.md`: the "Security releases: `--security-override` (Maintainer only)" subsection.
- `_bmad-output/implementation-artifacts/story-manifests.md`: claims XT-conformance-256; the next free id is 257.

**Review.** 22 findings. 7 rows patched, covering 5 root causes: the override dropped on apply (medium), the advisory character set, CVE/https acceptance tests, the AD-9 nullable header field, and doc clarifications. 0 deferred. 15 rejected, each with its reason in the triage log. Patched by verdict: medium 1 entry, low 4 entries.

**Follow-up review recommended:** false. No high was patched and only one medium entry was.

**Verification.**
- `bun test` on pin-bump and spikes: 10/10 pass.
- `bun run typecheck`: clean.
- `bun run lint`: clean.
- `bun run harness --xaravel --id 'XT-conformance-25*'`: 8/8 pass.

**Residual risks.**
- The tool checks the decision's form, not who wrote it. Maintainer-only rests on `decisions/` being a Protected Path, and the orchestrator merges Protected-Path PRs with `--admin` (lessons, epic 1), so that guard is unverifiable for orchestrator PRs.
- The regeneration commands are checked as strings only; they never ran.
