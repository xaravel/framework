---
title: 'Story 3.3: Fixture signature verification in CI'
type: 'feature'
created: '2026-10-17'
baseline_revision: '0a4974e07c14ca09f7d46c45aeed51064370ef95'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'stories/3.3.md'
  - 'docs/ops/oracle.md'
warnings: [oversized]
deferred:
  - summary: >-
      The fixture verification step lives in the advisory `check` job, so a forged fixture shows a red check but is not merge-blocked until `check` is a required check.
    evidence: |-
      .github/rulesets/main.json requires only audit, ownership and protected-paths; making check required is Epic 1 retro item 2 (waiting on the Maintainer).
    location: >-
      .github/rulesets/main.json
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Story 3.2 signs Oracle fixtures, but nothing checks the committed ones. `conformance/fixtures/` is unowned and unprotected by design (AD-15), so without a CI check anyone could hand-edit an expected value and every Differential Test would trust it.

**Approach:** A verifier, `bun run oracle:verify-fixtures` (`tools/oracle/verify.ts`), checks every committed fixture: Ed25519 signature against `conformance/oracle/oracle.pub` (via Story 3.2's `verifyFixture`), file name equal to its `sha256`, and that `sha256` naming a committed request in its Component's request file. It fails naming each bad file. CI's `check` job runs it on every PR, merge-queue run and push to `main`.

## Boundaries & Constraints

**Always:**
- A fixture is `conformance/fixtures/<component>/<sha256>.json`. Its request is the line with that `sha256` in `conformance/oracle/requests/<component>.jsonl` (read with `readCommittedRequests`, which already validates each request's own hash). `conformance/fixtures/generators/` (generator reference files, never signed) is skipped.
- Violations, one line each on stderr, all prefixed with the file's repo-relative path: signature or form problems from `verifyFixture`; a file name that is not `<64 hex>.json` or differs from the fixture's `sha256`; no committed request with that `sha256` in the Component's file (or no request file for the Component); a request listed in `conformance/oracle/nondeterminism.jsonl` (listed requests get no fixture, ESC-3.2-1); any other file or directory under `conformance/fixtures/` outside `generators/`.
- Fail closed: missing or invalid `oracle.pub`, unreadable request files or listing → exit 1 naming the cause. No `conformance/fixtures/` directory, or no fixtures, passes (fixtures land through the Maintainer-run steps). Exit 0 pass, 1 violations, 2 usage. Success prints `Oracle fixtures OK: <n> fixtures verify against conformance/oracle/oracle.pub.`
- CLI shape of the other tools: `main(argv)`, `UsageError` → 2, `--root <dir>`. Pure Bun, no Docker, no PHP, no network.
- `CODEOWNERS` keeps `/conformance/fixtures/` with no owner, and `protected-paths codeowners --check` still passes.

**Never:** No change to the spine, SPEC, PRD or `epics.md`. No new dependency. No change to the fixture format, signing or `fixtures.ts` generation. No edit of `conformance/protected-paths`, `.github/CODEOWNERS`, `tools/protected-paths/`, `tools/ownership/` or their workflows. No handling of `conformance/oracle-requests/` (Story 3.4 extends the lookup). No staleness check against the Pin or image (deferred).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | fixtures signed with the key of `oracle.pub`, each for a committed request | exit 0, count printed | none |
| Hand-edited output | one fixture's `output` changed | exit 1, `<path>: the signature does not verify` | others still reported |
| Forged with another key | valid signature from a different key | exit 1 naming the file | — |
| Wrong request hash | fixture `sha256` not in the Component's requests, or file name ≠ `sha256` | exit 1 naming the file | — |
| Listed random request | fixture for a `nondeterminism.jsonl` request | exit 1 naming the file | — |
| Stray entry | `README`, non-hex name, nested dir, Component without request file | exit 1 naming it | — |
| No fixtures | `conformance/fixtures/` missing or only `generators/` | exit 0, `0 fixtures` | — |
| No pub | `oracle.pub` missing or not Ed25519 | exit 1 naming it | — |

</intent-contract>

## Code Map

- `tools/oracle/fixtures.ts` -- reuse `verifyFixture(text, publicKey, sha256)` (118, returns problems), `readPublicKey` (96), `readCommittedRequests` (216), `readNondeterminism` (308), `FIXTURES_DIR`, `GENERATORS`, `PUBLIC_KEY_FILE`, `NONDETERMINISM_FILE`. Its `main`/`parseOptions`/`UsageError` are the CLI model. Do not change its behaviour.
- `tools/oracle/request.ts` -- `compareUnits` for sorted output.
- `package.json` -- add script `oracle:verify-fixtures` = `bun tools/oracle/verify.ts` (Protected; Epic 1–8 Story).
- `.github/workflows/ci.yml` -- `check` job: add step `Verify the Oracle fixtures` running `bun run oracle:verify-fixtures` right after `Install from the lockfile` (moved there in review so an earlier failing step cannot hide a bad fixture); mention it in the header comment. `check` runs on `pull_request`, `merge_group`, `push`; read-only permissions, so `workflows:check` stays clean.
- `.github/CODEOWNERS:8` -- `/conformance/fixtures/` already has no owner; `conformance/protected-paths` has `!/conformance/fixtures/`. Read-only.
- `tools/protected-paths/protected-paths.ts` -- `main(["codeowners","--check","--root",dir])` is Story 1.4's drift check; `parseList`/`isProtected`/`activePhases` exported.
- `conformance/tests/xaravel/oracle-fixtures.test.ts` -- test model: `fixtureRoot`, `keyPair`, `REQUESTS`, `cli` spawn helper; copy the minimum needed (schema, request files, test `oracle.pub`) into a new test file rather than importing test helpers.
- `conformance/oracle/oracle.pub` -- committed; fingerprint `f5c4d31c…` in `docs/ops/oracle.md`. No fixtures are committed yet.
- `docs/ops/oracle.md` -- Fixtures section (148–227): add "Verification in CI" subsection.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/verify.ts` -- new CLI: `verifyFixtures(root): { count, violations }` and `main(argv)` per the Boundaries; header comment like the other tools.
- `package.json` -- `oracle:verify-fixtures` script.
- `.github/workflows/ci.yml` -- verification step in `check`, header comment updated.
- `conformance/tests/xaravel/oracle-verify.test.ts` -- XT-conformance-74 (temp root with test key: valid fixtures pass; wrong key, bad name, unknown sha256, wrong Component, listed request, stray file/dir, missing pub each fail naming the file; no fixtures passes; the committed repo verifies; `ci.yml`'s `check` job runs the script on pull_request), XT-conformance-75 (sign a fixture, hand-edit its output in the file, the CLI exits 1 naming that file; the unedited one is not named), XT-conformance-76 (CODEOWNERS' last rule matching a `conformance/fixtures/…` path has no owner, `isProtected` is false for it, and `codeowners --check` on the repo exits 0).
- `docs/ops/oracle.md` -- verification subsection: command, what fails, CI job.

**Acceptance Criteria:**
- Given any fixture under `conformance/fixtures/`, when CI runs, then a signature that doesn't verify against `oracle.pub`, or a request hash that doesn't match its request, fails the build and names the file.
- Given a hand-edited fixture output (fixture test), when CI runs, then it fails.
- Given `CODEOWNERS`, when inspected, then `conformance/fixtures/` has no owner, and the check from Story 1.4 still passes.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 22 findings — high 0, medium 1, low 13, false 6, maybe-false 2
- findings:
  - `[medium]` `[defer]` (blind) `check` is advisory, so a red verification does not block a merge — pre-existing: `check` is not in `.github/rulesets/main.json`'s required checks; making it required is Epic 1 retro item 2, waiting on the Maintainer. The step fails the build as the AC says.
  - `[false]` `[reject]` (blind) the verifier trusts the PR's own `oracle.pub` — `oracle.pub` is a Protected Path; the required `protected-paths` check blocks a PR that replaces it, and the docs fingerprint is not itself protected, so pinning to it adds nothing.
  - `[low]` `[reject]` (blind) `verifyFixture` called without its `sha256` argument, JSON parsed twice — no observable defect; the name check gives its own message.
  - `[low]` `[patch]` (blind) `count` included non-fixture file names — now counts only `<sha256>.json` names.
  - `[low]` `[patch]` (blind) stray README / nested-directory messages unpinned — exact lines now asserted.
  - `[low]` `[patch]` (blind) "sorted by path" not asserted — grouped with the ordering fix below.
  - `[low]` `[reject]` (blind) untested branches (fixtures dir is a file, symlink, unreadable file, generators as a file) — each fails loudly; none is reachable from a normal git checkout.
  - `[false]` `[reject]` (blind) a `readdirSync` failure does not name the path — Bun's EACCES/ENOENT messages carry the path (`scandir '<path>'`).
  - `[low]` `[patch]` (blind) command missing from the docs table; "no key" ambiguous — row added, "no private key".
  - `[false]` `[reject]` (blind) batch stray handling and verifier disagree — a non-fixture file under `conformance/fixtures/` failing the check is the intended, loud outcome.
  - `[low]` `[reject]` (edge) dangling `conformance/fixtures` symlink passes with 0 fixtures — then no fixture exists for any test to trust; nothing is forged.
  - `[low]` `[patch]` (edge) violations not in path order (`view-x` vs `view/…`) — final list now sorted with `compareUnits`, asserted in XT-74.
  - `[low]` `[patch]` (edge) `--root ""` verified the cwd — now a usage error (exit 2).
  - `[maybe-false]` `[reject]` (edge) `process.exit` may truncate piped stderr — would be low; same pattern as every other tool, and Bun flushes synchronous stderr writes.
  - `[low]` `[patch]` (edge, claim) "sorted by path" docstring — same ordering fix.
  - `[low]` `[patch]` (verification) no test asserts the sort — same ordering fix.
  - `[medium]` `[defer]` (intent) merge gating — same root as the first row; deferred there.
  - `[low]` `[patch]` (intent) verify step ran last, so an earlier failing step hid the bad file — moved right after the install, XT-33 step order updated.
  - `[false]` `[reject]` (intent) fixtures for `conformance/oracle-requests/` would fail — Story 3.4 extends the lookup (epics.md: 3.4 reuses 3.3's verification); the one lookup function is the seam.
  - `[maybe-false]` `[reject]` (intent) never run against a real Oracle-signed fixture — none exist until the Maintainer-run batch; the fixtures under test are signed by Story 3.2's own `signFixture`. If wrong, low.
  - `[false]` `[reject]` (intent) `generators/` not verified — AD-15 protects it by path and it is never signed.
  - `[false]` `[reject]` (intent) checks beyond the ACs (listed requests, strays, wrong Component) — in the spec's Boundaries; the listing rule is ESC-3.2-1's ruling.

## Design Notes

A separate `verify.ts` keeps the pure, Docker-free check apart from `fixtures.ts`'s batch, which needs PHP or the image. Story 3.4 will add `conformance/oracle-requests/*.jsonl` to the request lookup; keep the lookup in one function so that extension is one place.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle-verify.test.ts` -- all pass
- `bun run oracle:verify-fixtures` -- exit 0 on the repo
- `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run protected-paths:codeowners --check`, `bun test` -- clean

## Auto Run Result

Run 2026-10-17. Status: done.

- **Summary.** `bun run oracle:verify-fixtures` (`tools/oracle/verify.ts`) checks every committed fixture under `conformance/fixtures/` (except `generators/`): its Ed25519 signature against `conformance/oracle/oracle.pub` (Story 3.2's `verifyFixture`), its file name equal to its `sha256`, that `sha256` naming a committed request in its Component's request file, and that the request is not listed in `nondeterminism.jsonl`. Stray files and directories fail too. Each violation is one stderr line starting with the file's path, sorted by path. Missing or invalid `oracle.pub`, request files or listing fail closed. CI's `check` job runs it first, right after the install, on every PR, merge-queue run and push to `main`.
- **Files.**
  - `tools/oracle/verify.ts` -- the verifier and CLI; `committedRequests` is the one lookup Story 3.4 extends.
  - `package.json` -- `oracle:verify-fixtures` script.
  - `.github/workflows/ci.yml` -- `Verify the Oracle fixtures` step in `check`, header comment.
  - `conformance/tests/xaravel/oracle-verify.test.ts` -- XT-conformance-74, 75, 76.
  - `conformance/tests/xaravel/repository-policy.test.ts` -- XT-conformance-33's pinned `check` step list gains the new step (an assertion added, none removed).
  - `docs/ops/oracle.md` -- command table row and "Verification in CI" subsection.
- **Review.** 22 findings: 6 patch entries applied (all low: path-order sort, fixture count, `--root ""`, step position, pinned stray messages, docs row), 1 deferred (medium: `check` is advisory until the Maintainer makes it required, Epic 1 retro item 2), the rest rejected with reasons in the triage log.
- **Follow-up review: not recommended.** Patched entries: 0 high, 0 medium, 6 low.
- **Verification.** `bun test` 100 pass (oracle-verify 7 pass); `oracle:verify-fixtures` on the repo exit 0 (0 fixtures, none committed yet); `typecheck`, `lint`, `workflows:check`, `protected-paths:codeowners --check`, `scaffold:check`, `graph:check`, `escalations:check`, `ownership:check` clean.
- **Residual risks.** No real Oracle-signed fixture exists yet (Maintainer-run batch, Story 3.2), so the check has only run on test-signed fixtures. A red `check` does not block a merge until `check` is required.
