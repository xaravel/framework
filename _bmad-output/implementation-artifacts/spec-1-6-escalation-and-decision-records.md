---
title: 'Story 1.6: Escalation and decision records'
type: 'feature'
created: '2026-10-17'
baseline_revision: '748358d030f656c3d41f7b53f201625c0f980020'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/stories/1.6.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The default-root assertion for `escalationStatus` (XT-28) and the live `check` run would pass under any root.
    evidence: |-
      With no committed Escalation, an unknown ID throws and `check` reports 0 records under any directory, so a wrong `repoRoot()` goes unnoticed. Add an assertion on a real ID when the first Escalation lands or Epic 5 adds the caller.
    location: >-
      conformance/tests/xaravel/escalations.test.ts XT-conformance-28
    severity: low
  - summary: >-
      XT-conformance-26..29 run in no CI workflow, so a regression in the escalation check can merge green.
    evidence: |-
      `.github/workflows/` holds protected-paths.yml, ownership.yml and escalations.yml; none runs `bun test`. Same deferral as Story 1.5; closed by the harness (Epic 5) and required checks (Story 1.7).
    location: >-
      .github/workflows/
    severity: medium
---

<intent-contract>

## Intent

**Problem:** FR-114 Escalations and their rulings have no defined file format, no validator, and no library function that later checks (Expectations `php-only` / `quarantined` rules, Epic 5) can ask "is this Escalation approved?" (AD-16).

**Approach:** Add `tools/escalations/escalations.ts`: an Escalation ID parser, validators for `conformance/escalations/ESC-<id>.md` and `decisions/ESC-<id>.md`, the `escalationStatus(id, root?)` library function, a repo-wide `check` and a PR-scoped `pr` check, plus a workflow. XT-conformance-26..29 cover the four ACs.

## Boundaries & Constraints

**Always:**
- **Escalation IDs.** `ESC-<story-id>-<n>` (`<story-id>` matching Story 1.5's `^[1-9]\d*\.[1-9]\d*$`, `<n>` a positive integer without leading zeros), or `ESC-bot-<n>` (no Story ID). `parseEscalationId(id)` returns `{ id, storyId: string | null, n }` or null.
- **Escalation file** `conformance/escalations/<id>.md`: `---`-fenced YAML frontmatter (parsed with `Bun.YAML.parse`, Story 1.5's `frontmatter` approach). Required:
  - `test_ids`: non-empty list of non-empty strings without surrounding whitespace (Test IDs or Xaravel Test IDs);
  - `trigger`: one of the FR-114 trigger slugs, exported as `TRIGGERS`: `divergence` (new or changed DIV), `protected-path`, `upstream-test-wrong` (Oracle passes it), `flaky` (inconsistent over 3 runs; Quarantine), `php-only`, `open-question` (a §9 question blocks the work), `contract` (missing or changed after Phase 1);
  - `proposed`, `evidence`: non-empty strings.
  The stem must be a valid Escalation ID. Each problem is one `invalid escalation:` line naming file and field.
- **Decision file** `decisions/<id>.md`: frontmatter `decision: approved | rejected`, and a rationale: the body after the frontmatter must hold at least one line that is neither blank nor a Markdown heading. Problems are `invalid decision:` lines. Other files in `decisions/` (e.g. `MAINT-*.md`) are not Escalation decisions and are ignored.
- **`escalationStatus(id, root = repo root)`** returns `"open" | "approved" | "rejected"`. It throws on a malformed ID, or when neither the Escalation file nor a decision file exists (unknown Escalation: callers fail closed). It returns `approved` / `rejected` only when `decisions/<id>.md` exists and validates; a missing or invalid decision file yields `open`.
- **`check [--root <dir>]`**: validates every `ESC-*.md` in `conformance/escalations/` and `decisions/` (either directory may be absent); any other `.md` name in `conformance/escalations/` is an `invalid escalation` (bad file name); a decision whose Escalation file is missing is `orphan decision:`.
- **`pr --repo <owner/name> --pr <n>`**: GET `/pulls/<n>` (`head.ref`, `head.sha`, `changed_files`), page `/pulls/<n>/files`. For each non-removed file under `conformance/escalations/`: the stem must be a valid ID, and must belong to the PR's branch: `story/<id>` → `ESC-<id>-<n>`; `bot/*` → `ESC-bot-<n>`; any other branch → `wrong story:` (no Story ID to match). Its content is fetched at `head.sha` through `GitHub.contents` as data and validated. Each non-removed `decisions/ESC-*.md` is fetched and validated the same way. Truncated file list fails closed (Story 1.4 rule).
- Exit codes 0 pass / 1 violations or any failure (fail closed) / 2 usage; violations on stderr, one per line, ending `(AD-16)`. Reuse `GitHub`/`PrFile` from `tools/protected-paths/protected-paths.ts`. Bun and Node builtins only; hermetic tests (temp roots, `Bun.serve` fake API on port 0).
- **Workflow** `.github/workflows/escalations.yml`, mirroring `ownership.yml`: `pull_request_target` job `escalations` runs `pr` (adds `pull-requests: read`), job `escalation-records` runs `check` on PRs and pushes to main; pinned actions, no `bun install`, PR values only through `env`, top-level `permissions: contents: read`.

**Never:**
- Never check out or run PR code; PR file content is data from the API.
- Don't add dashboard display, Epic-acceptance gating or Expectations rules (Epics 5, 7). Don't touch `stories/*.md`, `AGENTS.md`, `conformance/protected-paths` or the other checks' tools.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid escalation | `ESC-9.1-1.md` with all four fields | no violations | — |
| Missing field | no `evidence` | names `evidence` | exit 1 |
| Unknown trigger | `trigger: "boredom"` | names `trigger`, lists slugs | exit 1 |
| Empty test_ids | `test_ids: []` | names `test_ids` | exit 1 |
| Bad name | `conformance/escalations/ESC-9.1-0.md` / `notes.md` | invalid file name | exit 1 |
| Story PR, own ID | `story/9.1` adds `ESC-9.1-2.md` (valid) | pass | — |
| Story PR, other ID | `story/9.1` adds `ESC-9.2-1.md` | `wrong story` | exit 1 |
| Story PR, bot ID | `story/9.1` adds `ESC-bot-1.md` | `wrong story` | exit 1 |
| Bot PR | `bot/quarantine-x` adds `ESC-bot-3.md` | pass | — |
| Bot PR, story ID | `bot/x` adds `ESC-9.1-1.md` | `wrong story` | exit 1 |
| Planning PR adds escalation | `planning/x` adds `ESC-9.1-1.md` | `wrong story` | exit 1 |
| PR content invalid | head content lacks `proposed` | `invalid escalation` | exit 1 |
| Removed escalation | status `removed` | not judged | — |
| Valid decision | `decision: approved` + rationale line | no violations | — |
| Bad decision | `decision: maybe`, or body only `# Ruling` | names field / rationale | exit 1 |
| Status: no decision | escalation only | `open` | — |
| Status: decided | valid decision file | `approved` / `rejected` | — |
| Status: invalid decision | `decision: yes` | `open` | — |
| Status: unknown/malformed | `ESC-9.9-9` absent, `ESC-x` | throws | caller fails closed |
| Orphan decision | `decisions/ESC-9.1-5.md`, no escalation | `orphan decision` | exit 1 |
| Truncated list / API 500 | `changed_files` > files, HTTP 500 | fail closed | exit 1 |

</intent-contract>

## Code Map

- `tools/ownership/ownership.ts` -- pattern to copy: header comment listing violation kinds, `frontmatter()` (private, ~line 94; copy it), `describe()`, `UsageError`, `parseOptions`, `report`, `main(argv)` failing closed, `import.meta.main`. `STORY_ID` regex (line ~78) is private; re-declare the same regex.
- `tools/protected-paths/protected-paths.ts:349` -- `export class GitHub` (`json`, `paged`, `contents(path, ref)` → string | null on 404); `PrFile` at line 44.
- `conformance/tests/xaravel/ownership.test.ts` -- test style: `bun:test` `expect`, titles start with the Test ID and cite the rule/AD, `mkdtempSync` roots, `runCli` via `Bun.spawn`, `runPr` with a `Bun.serve` fake API.
- `.github/workflows/ownership.yml` -- workflow to mirror (pinned SHAs `actions/checkout@3d3c42e…` v7.0.1, `oven-sh/setup-bun@0c5077e…` v2.2.0).
- `package.json` scripts, `tsconfig.json` `include` -- add `escalations:check` and `tools/escalations/**/*.ts`.
- `decisions/MAINT-2026-10-16-unattended-orchestrator.md` -- an existing non-ESC decision file the `check` must ignore; it also fixes the orchestrator's decision shape (`decision`, `decided_by: orchestrator (MAINT-2026-10-16)`, prose body).

## Tasks & Acceptance

**Execution:**
- `tools/escalations/escalations.ts` -- exports `ESCALATIONS_DIR`, `DECISIONS_DIR`, `TRIGGERS`, `parseEscalationId`, `parseEscalation(file, text)`, `parseDecision(file, text)`, `escalationStatus(id, root?)`, `checkRecords(root)`, `evaluatePr(pr)` (pure: head ref, files, changed count, fetched contents) and the CLI.
- `.github/workflows/escalations.yml` -- as specified.
- `package.json`, `tsconfig.json` -- script and include.
- `conformance/tests/xaravel/escalations.test.ts` -- XT-26: escalation validation rows and PR name-matching rows (function and fake-API CLI). XT-27: decision validation rows and `check` CLI on a fixture root and on the repo root. XT-28: `escalationStatus` rows. XT-29: `ESC-bot-<n>` accepted by the ID parser, `check`, status and a `bot/*` PR; rejected on a Story PR.

**Acceptance Criteria:**
- Given `conformance/escalations/ESC-<story-id>-<n>.md`, when validated, then `test_ids`, `trigger` (an FR-114 trigger), `proposed` and `evidence` are required, and a PR whose branch Story ID differs from the file's fails (XT-conformance-26).
- Given `decisions/ESC-<story-id>-<n>.md`, when validated, then `decision: approved | rejected` and a rationale are required (XT-conformance-27).
- Given an Escalation with no matching decision file, when `escalationStatus(id)` is called, then it returns `open`, and `approved`/`rejected` only once a valid decision file exists (XT-conformance-28).
- Given bot-raised Escalations, when validated, then `ESC-bot-<n>` IDs are accepted with no Story ID (XT-conformance-29).

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 37 findings — high 0, medium 1, low 30, false 6, maybe-false 0
- findings:
  - `[low]` `[defer]` (verification-gap) the default-root assertion in XT-28 and the live `check` run would pass under any root, so a wrong `repoRoot()` would go unnoticed — a non-vacuous assertion needs a real committed Escalation; add one when the first lands or Epic 5 adds the caller.
  - `[medium]` `[defer]` (verification-gap other) no workflow runs `bun test`, so XT-conformance-26..29 gate no merge — pre-existing (same deferral as Story 1.5); closed by the harness (Epic 5) and required checks (Story 1.7).
  - `[low]` `[reject]` (verification-gap other) `pr` flags non-`.md`/nested files under `conformance/escalations/` while `check` ignores them — such a file reaching main needs an admin bypass; unlikely, and the spec scopes `check` to `.md` names. Grouped with the blind and edge layout rows.
  - `[false]` `[reject]` (intent 1) the PR rule is tested against a fake, not the live trigger — same stand-in as Stories 1.4/1.5: the workflow mirrors the proven `ownership.yml`, and the fake API exercises the same requests; the first PR after merge is the live test.
  - `[low]` `[reject]` (intent 2) the PR rule also judges modified files and rejects Escalations from non-`story/*`/`bot/*` branches — stricter than the AC's "adds", consistent with AD-16 (only Stories and bots raise Escalations); a Maintainer can still bypass.
  - `[low]` `[reject]` (intent 3) bot acceptance is narrower at PR level — follows AD-16's Bot PRs bullet; the AC's "accepted, with no Story ID" holds for the parser, `check` and status (XT-29).
  - `[low]` `[reject]` (intent 4) trigger slugs are invented — FR-114 lists triggers in prose; a closed vocabulary is needed to validate "one of the FR-114 triggers", and each slug maps one-to-one to an FR-114 bullet in the tool header.
  - `[false]` `[reject]` (intent 5) "Maintainer's rationale" is checked as body text only and a Story PR could add a decision — `decisions/` is a Protected Path (Story 1.4), and `ownership` fails any `story/*` PR touching `decisions/` (not an allowed path); authorship lives in those checks.
  - `[low]` `[patch]` (intent 6) `escalationStatus` answers for an orphan decision while `check` rejects it — grouped with the blind and edge orphan rows; patched.
  - `[low]` `[reject]` (intent 7) no consumer calls `escalationStatus` yet — the Expectations rules are Story 5.2; the AC is met by the library function.
  - `[false]` `[reject]` (intent 8) tests import `expect` from `bun:test` — AGENTS.md forbids it for Ported Tests only; Xaravel Tests run under plain `bun test` until Epic 5, as in Stories 1.1–1.5.
  - `[false]` `[reject]` (blind) a Story PR can approve its own Escalation — `ownership` fails any `story/*` PR that touches `decisions/`, and `protected-paths` covers `decisions/` for every branch.
  - `[low]` `[reject]` (blind) `decided_by` is never checked — the AC requires only `decision` and a rationale; authorship is the Protected Path check's job.
  - `[low]` `[patch]` (blind) `escalationStatus` contradicts `check` on orphan decisions — patched: `escalationStatus` throws "unknown Escalation" whenever the Escalation file is missing.
  - `[low]` `[reject]` (blind) `pr` ignores removals and renames' previous names — for `story/*` PRs `ownership` already fails any removed or renamed path outside the Story's own Escalations; other branches are the Story 1.5 deferral.
  - `[low]` `[patch]` (blind) no cross-file check in the PR, so an orphan decision reaches main — patched: `pr` fetches each decision's Escalation at head and reports `orphan decision`. Grouped with the edge orphan row.
  - `[low]` `[reject]` (blind) a decided Escalation can still be edited — needs a base lookup and an immutability rule no AC asks for; an agent editing its own decided Escalation is unlikely, and the Fidelity Review (Epic 8) reads the diff.
  - `[low]` `[reject]` (blind) `check` and `pr` disagree on file layout — duplicate of the verification-gap other row.
  - `[low]` `[reject]` (blind) bot Escalations may use any trigger — no AC ties `ESC-bot-<n>` to `flaky`; bot behaviour is Story 5.8.
  - `[low]` `[reject]` (blind) `test_ids` content is not format-checked — the Test ID format comes from the Inventory (Epic 2); no AC asks for it.
  - `[low]` `[reject]` (blind) BOM / trailing-space fences and untested YAML-error branches — same as Story 1.5's rejection; the file still fails loudly.
  - `[low]` `[reject]` (blind) some tests read live repo state — deliberate live check, the same pattern as Story 1.4's XT-17/18 and 1.5's XT-22.
  - `[low]` `[reject]` (blind) no example Escalation or decision template — the tool header documents the format and the tests show examples; a README in `conformance/escalations/` would itself be an invalid name under the spec.
  - `[false]` `[reject]` (blind) the diff omits the spec file — deliberate: the spec is the claims file, given to the edge-case layer only.
  - `[low]` `[reject]` (edge) a rename of another Story's Escalation passes — `ownership` checks a rename's `previous_filename` for `story/*` PRs.
  - `[low]` `[reject]` (edge) removing an Escalation that has a decision passes the PR — `ownership` blocks removals outside the Story's own IDs; a Story removing its own decided Escalation is unlikely, and `check` on main reports the orphan.
  - `[low]` `[patch]` (edge) a PR adding a decision with no Escalation at head passes — patched with the blind cross-file row.
  - `[false]` `[reject]` (edge) decision files lack a branch or author check — `decisions/` is Protected and outside every Story's allowed paths, so `protected-paths` and `ownership` cover it.
  - `[low]` `[reject]` (edge) an own-Story PR can modify a decided Escalation — duplicate of the blind immutability row.
  - `[low]` `[reject]` (edge) any author can name a branch `bot/*` — the bot identity check belongs with the bots (Story 5.8) and the ruleset (Story 1.7); `protected-paths` still governs the PR.
  - `[low]` `[reject]` (edge) `check` vs `pr` file-layout mismatch — duplicate of the verification-gap other row.
  - `[low]` `[reject]` (edge) a directory at `decisions/<id>.md` makes `escalationStatus` throw EISDIR — fails loudly, which callers treat as fail-closed; unreachable in practice.
  - `[low]` `[reject]` (edge) an invalid Escalation with a valid decision reports approved — `check` reports the invalid Escalation on main and the PR check rejects it before merge; adding a re-validation branch is not worth it.
  - `[low]` `[reject]` (edge) an HTML-comment-only body passes as rationale — unlikely; decisions are written by hand under the Protected Path review.
  - `[low]` `[reject]` (edge) BOM / trailing-space fence — duplicate of the blind frontmatter row.
  - `[low]` `[reject]` (edge claim) "a PR whose branch Story ID differs fails" does not cover removals/renames — the AC names the PR that *adds* the file; removals and renames of other Stories' files are `ownership`'s job.
  - `[low]` `[patch]` (edge claim) status answers `approved` for an orphan decision — patched with the blind orphan row; an invalid Escalation with a valid decision is rejected as above.

## Design Notes

**Trigger slugs.** FR-114 lists the seven triggers in prose; the frontmatter needs a closed vocabulary, so each gets a kebab-case slug in FR-114 order. The header comment maps slug to FR-114 bullet.

**Unknown IDs throw.** Epic 5 needs `approved` for `php-only` skips and `open` for quarantine. Returning `open` for a non-existent Escalation would let a `quarantined` entry cite a made-up ID, so an unknown ID throws and the caller fails closed.

## Verification

**Commands:**
- `bun test` -- expected: XT-conformance-1..29 pass
- `bun tools/escalations/escalations.ts check` -- expected: exit 0 on the repo root
- `bun run typecheck` / `bun run lint` / `bun run graph:check` / `bun run scaffold:check` / `bun run ownership:check` / `bun tools/protected-paths/protected-paths.ts codeowners --check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** Escalations and their rulings now have a validated file format and a status function.
- `conformance/escalations/ESC-<story-id>-<n>.md` (or `ESC-bot-<n>.md`) needs `test_ids`, an FR-114 `trigger` slug, `proposed` and `evidence`. `decisions/ESC-<id>.md` needs `decision: approved | rejected` and a rationale in its body.
- `escalationStatus(id, root?)` returns `open` until a valid decision file exists, then `approved` or `rejected`. It throws on a malformed ID or a missing Escalation file, so callers fail closed.
- `check` validates every record on a checkout (orphan decisions fail). `pr` judges a PR from API data: a `story/<id>` branch may raise only `ESC-<id>-<n>`, a `bot/*` branch only `ESC-bot-<n>`, other branches none; added or changed records are validated at the head commit, and a decision without its Escalation at head fails.
- The `escalations` workflow runs `pr` on `pull_request_target` and `check` on PRs and pushes to main.

**Files changed.**
- `tools/escalations/escalations.ts`: ID parser, Escalation and decision validators, `escalationStatus`, `checkRecords`, `evaluatePr`, CLI.
- `.github/workflows/escalations.yml`: the `escalations` and `escalation-records` jobs.
- `conformance/tests/xaravel/escalations.test.ts`: XT-conformance-26..29, with a `Bun.serve` fake API.
- `package.json`, `tsconfig.json`: `escalations:check` script and type-check include.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: Story status.

**Review findings.** 37 findings: 1 medium, 30 low, 6 false.
- Patched, 2 entries (5 rows, all low): `escalationStatus` throws for an orphan decision instead of answering; `pr` reports a decision whose Escalation is missing at head.
- Deferred, 2: the vacuous default-root assertion (low); Xaravel Tests run in no CI workflow (medium, pre-existing).
- Rejected, 30, each with its reason in the Review Triage Log. The main ones: decision self-approval, removals and renames (covered by `ownership` and `protected-paths`); immutability of decided Escalations, bot trigger limits and Test ID formats (no AC asks for them); BOM fences, live-repo tests and the live-trigger stand-in (same reasons as Stories 1.4 and 1.5).

**Follow-up review recommendation:** false. This pass patched 0 high, 0 medium and 2 low entries.

**Verification.**
- `bun test`: 29 pass, 0 fail.
- `bun tools/escalations/escalations.ts check`: exit 0 (0 Escalations, 0 decisions; the MAINT decision is ignored).
- `bun run typecheck`, `bun run lint`, `bun run graph:check`, `bun run scaffold:check`, `bun run ownership:check`, `bun tools/protected-paths/protected-paths.ts codeowners --check`: all exit 0.

**Residual risks.**
- The workflow has never run on GitHub; the first PR after merge is the live test.
- This PR touches Protected Paths and is an Infrastructure Story (`component: conformance`), so `protected-paths` and `ownership` show red on it (Story 1.5 deferral).
- The check is not yet required; that is Story 1.7.
