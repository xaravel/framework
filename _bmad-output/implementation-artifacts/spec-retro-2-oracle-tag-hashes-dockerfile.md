---
title: 'Retro epic 2 item 1: the Oracle image tag hashes the Dockerfile'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: '0610054f1b28a860b4c136743cd0ff277290d5f9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/ops/oracle.md'
warnings: []
deferred:
  - summary: >-
      Hashed Oracle inputs have no LF line-ending rule, so a CRLF checkout may compute a tag CI never published.
    evidence: |-
      .gitattributes sets eol=lf only for *.jsonl and *.ts; locks, Dockerfile and dockerignore are hashed as raw bytes. Pre-existing for the locks. Settle by checking a core.autocrlf=true checkout.
    location: >-
      .gitattributes
    severity: medium (unverified)
  - summary: >-
      oracle.yml#oracle pushes unconditionally, and reruns on unhashed paths, so floating apt packages (retro R4) can change content under an existing tag.
    evidence: |-
      oracle.yml push triggers include tools/**, package.json, bun.lock, .bun-version; docker push has no existence check; Dockerfile apt-get install is unpinned. Deferred with retro finding R4.
    location: >-
      .github/workflows/oracle.yml
    severity: low
---

<intent-contract>

## Intent

**Problem:** The Oracle image tag is `<framework Pin>-<lockhash>`, where the hash covers only the four locks (`tools/oracle/oracle.ts:480-496`). Story 2.6 changed `conformance/oracle/Dockerfile` without touching the locks, so `oracle.yml#oracle` pushes different image content over an existing GHCR tag, and a local `inventory` or `baseline` run can reuse a stale cached `xaravel-oracle:<tag>` (Epic 2 retro finding R1, action item `epic-2-retro-item-1-oracle-tag-hashes-dockerfile`).

**Approach:** Hash every image build input that the tag does not already name: the four locks in pin order, then `conformance/oracle/Dockerfile`, then `conformance/oracle/Dockerfile.dockerignore`. Each input is framed by its repository-relative path and byte length, so no byte can move across a file boundary unnoticed. The tag stays `<framework Pin>-<12 hex>`; only the hashed set changes.

## Boundaries & Constraints

**Always:** `oracle:tag` stays offline, never calls docker, and is deterministic for identical bytes. A missing Dockerfile or dockerignore makes the hash throw with the file named, as a missing lock already does. Every doc and comment that states the tag formula is updated to match.

**Never:** No change to the Dockerfile, the dockerignore, the locks, `oracle.yml` triggers or permissions, `conformance/protected-paths`, or the build arguments. No hashing of the Upstream snapshot (its framework tag is in the tag and every snapshot tag is pinned by `checkDockerfile`'s `for pair in` rule). No weakening of an existing test assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dockerfile changes | One byte of `Dockerfile` changes, locks unchanged | `imageTag` changes; restoring the byte restores the tag | No error expected |
| dockerignore changes | `Dockerfile.dockerignore` changes | `imageTag` changes | No error expected |
| Lock changes | A lock changes | `imageTag` changes (as before) | No error expected |
| Missing Dockerfile | `Dockerfile` absent | `imageHash` throws naming `conformance/oracle/Dockerfile` | Error, exit 1 from `oracle:tag` |

</intent-contract>

## Code Map

- `tools/oracle/oracle.ts:13` -- header comment states the tag formula `<framework tag>-<lockhash>`.
- `tools/oracle/oracle.ts:480-496` -- `lockHash(root)` and `imageTag(root)`. Replace `lockHash` with `imageHash(root)` over locks + Dockerfile + dockerignore; `DOCKERFILE` constant already names the Dockerfile path (used by `checkDockerfile`, :455-477).
- `tools/oracle/oracle.ts:831,836,848` -- CLI `check`/`tag`/`lock` print `imageTag`; unchanged.
- `tools/inventory/inventory.ts:51,589` -- consumes `imageTag`; unchanged.
- `conformance/tests/xaravel/oracle.test.ts:19-21,300-314,567-569` -- imports `lockHash`; XT-conformance-42 recomputes the hash and checks a lock change moves the tag; XT-conformance-43 checks `<Pin>-<lockhash>`. Fixture (`:90-101`) already copies the real Dockerfile and dockerignore.
- `docs/ops/oracle.md:20` -- "The tag" section; `.github/workflows/oracle.yml:10` -- header comment.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/oracle.ts` -- rename `lockHash` to `imageHash`; hash, in order, each lock then the Dockerfile then the dockerignore, each as `<relative path>\0<byte length>\0<bytes>`; throw on a missing Dockerfile or dockerignore; update the header and doc comments to `<framework tag>-<imagehash>`.
- `conformance/tests/xaravel/oracle.test.ts` -- switch to `imageHash`; recompute the expected hash with the new framing; assert a Dockerfile edit and a dockerignore edit each move the tag and restoring them restores it; assert a missing Dockerfile throws naming it; update the XT-conformance-43 comment.
- `docs/ops/oracle.md`, `.github/workflows/oracle.yml` -- state the new formula and that a Dockerfile change gets a new tag.

**Acceptance Criteria:**
- Given the committed repository, when `bun run oracle:tag` runs, then it prints `v13.37.0-<12 hex>` without calling docker.
- Given the fixture, when only the Dockerfile or only the dockerignore changes, then `imageTag` differs from before.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 14 findings — high 0, medium 1, low 8, false 4, maybe-false 1
- findings:
  - `[medium]` `[patch]` (blind) Docs and workflow header claim "CI never pushes different image content over an existing tag", false while apt floats and the push is unconditional — reworded docs/ops/oracle.md, the oracle.yml header and the imageHash comment to claim only that a lock, Dockerfile or dockerignore change gets a new tag.
  - `[low]` `[patch]` (blind) Missing-dockerignore path untested — added the same throw / `tag` exit-1 / restore assertions as the missing-Dockerfile block.
  - `[low]` `[reject]` (blind) Fixture edits in XT-conformance-42 are not restored in `finally` — only matters after an assertion already failed; try/finally adds structure for a failure-path diagnostic.
  - `[low]` `[reject]` (blind) Hashed-input list repeated in imageHash, the test and three fixture lists — fixture file lists are the existing pattern; exporting a list adds public surface, and the test's independent literal list is intentional.
  - `[low]` `[reject]` (blind) Expected-hash test mirrors the implementation and the doc example tag is unverified — the test still pins order and framing independently of the code; the doc example was already an unchecked literal before this change.
  - `[maybe-false]` `[defer]` (blind) CRLF checkout (`core.autocrlf`) changes hashed bytes so a local tag differs from CI's — pre-existing for the locks; settle by checking `.gitattributes` coverage of `conformance/oracle/**` on a Windows checkout. If real, medium.
  - `[low]` `[patch]` (blind) New missing-file error gives no recovery hint — appended "restore it from git".
  - `[false]` `[reject]` (blind) Spec does not account for existing images going stale — the old tag is simply no longer referenced; a new tag forces a rebuild, which is the intended outcome. Older specs are historical records.
  - `[low]` `[reject]` (blind) Tuple-style "moved" assertion hides the actual tag — cosmetic; it matches the file's labelled-tuple assertion style.
  - `[low]` `[defer]` (edge) Push job reruns on unhashed paths (tools/**, package.json) and overwrites the tag unconditionally — pre-existing behaviour of oracle.yml; with R4 apt drift it can change content. Deferred with R4.
  - `[low]` `[patch]` (edge) Doc claim that tag identity means byte-identical image — same root cause as the first row; fixed by the same rewording.
  - `[false]` `[reject]` (edge) Dockerfile path being a directory gives EISDIR instead of "is missing" — a raw EISDIR still fails loudly and names the path; the situation is not reachable from the committed repo.
  - `[false]` `[reject]` (edge) imageHash comment claims "every build input" while the snapshot is not hashed — the comment is reworded by the first row's patch; the snapshot exclusion is a scoped decision recorded in the intent.
  - `[false]` `[reject]` (intent) Diff narrows "an image change always gets a new tag" to locks + Dockerfile + dockerignore — the intent names exactly those files; the narrowing is recorded in the spec and docs.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle.test.ts` -- expected: all pass.
- `bun test` -- expected: no new failures.
- `bun run typecheck` and `bun run lint` -- expected: clean.
- `bun run oracle:tag` -- expected: one tag line, different from `v13.37.0-924c1faf964b`.

## Auto Run Result

Status: done

**Summary:** `tools/oracle/oracle.ts` `lockHash` is now `imageHash`. It hashes the four locks in pin order, then `conformance/oracle/Dockerfile`, then `Dockerfile.dockerignore`, each framed as `<path>\0<length>\0<bytes>`, and throws with a recovery hint if either Docker file is missing. A Dockerfile or dockerignore change now gets a new Oracle image tag. The committed tree's tag moves from `v13.37.0-924c1faf964b` to `v13.37.0-7a508f1c8287`.

**Files changed:**
- `tools/oracle/oracle.ts`: `imageHash` replaces `lockHash`, and the header and doc comments are updated.
- `conformance/tests/xaravel/oracle.test.ts`: the test recomputes the exact digest. It checks that a Dockerfile edit and a dockerignore edit each move the tag and that restoring them restores it, and that a missing Dockerfile or dockerignore makes `imageHash` throw and `tag` exit 1.
- `conformance/tests/xaravel/{inventory,inventory-checks,pest-inventory}.test.ts`: the fixtures now also copy the Dockerfile and dockerignore, because `imageTag` needs them. These are setup changes only; no assertion changed.
- `docs/ops/oracle.md` and `.github/workflows/oracle.yml` (header comment only): both state the new formula.

**Review:** 14 findings. 3 entries patched: 1 medium (doc overclaim, grouped with 1 low from the edge-case layer), plus 2 low (an untested missing-dockerignore path, and a missing recovery hint). 2 deferred: CRLF hashing (unverified), and the unconditional push together with R4. The other 8 were rejected with reasons in the triage log.

**Follow-up review recommended:** false. One medium was patched and no high.

**Verification:**
- `bun test`: 69 pass, 0 fail.
- `bun run typecheck`: clean.
- `bun run lint`: clean.
- `bun run oracle:tag`: `v13.37.0-7a508f1c8287`.

**Residual risks:**
- The next `oracle.yml` push to main publishes the new tag. Local caches under the old tag go unused.
- Upstream snapshot content and apt packages remain outside the hash (R4 is deferred).
