# Sprint Change Proposal: the devcontainer as an optional reference environment

- **Date:** 2026-10-19
- **Requested by:** Ed (Maintainer)
- **Mode:** Batch
- **Scope:** Minor (direct adjustment)
- **Status:** approved by the Maintainer, 2026-10-19; applied in the PR that adds this file

## 1. Issue summary

On 2026-10-19 the Maintainer added Story 5.10 (#158): a devcontainer, so that the harness runs every alpha Variant locally with only Docker on the host. Before that, nothing in the repo provisioned Postgres or Redis.
- Locally, the `pgsql` and Redis Variants are `NOT-RUN`, and only CI exercises them.
- The orchestrator host `m1` has no Postgres, no Redis and no Docker.
- Story 5.5's isolation code was checked against a fake `redis-server` and an in-memory Postgres stand-in.

The Story was added straight to `epics.md`, with no architecture decision, and it leaves open how far the container reaches. The open questions are:
- Is it optional or required?
- What happens to the Oracle's own Docker use?
- Does the orchestrator move into it?
- Is Linux the reference platform?
- How are the later database engines handled?
- What about AD-17 worktree keys inside and outside the container?

The Maintainer asked for this review before the loop reaches 5.10, which is last in Epic 5. The loop is on 5.6 now.

**Issue type:** a new requirement from the stakeholder.

## 2. Impact analysis

### Requirements already bind the answer: optional, never required

| Source | What it says |
| --- | --- |
| PRD OQ-9 (resolved) | The Oracle runs in Docker on GitHub Actions, "so contributors and agents need neither Docker nor PHP". |
| `epics.md` Story 2.2 AC | "Given a contributor without Docker, when they run any harness command, then nothing requires the image." |
| PRD NFR-1 | macOS and Linux are supported on x64 and arm64, and CI runs on both. |
| AD-28 (nightly) | macOS jobs install Postgres and Redis natively. |
| PRD §FR-9 (line 300) | "On a developer machine, tests whose backend isn't running are reported as not run." |

A required container would contradict OQ-9 and Story 2.2, and it would make Linux the only local platform, against NFR-1. The devcontainer can therefore only be an **optional reference environment**. Requiring it would need a PRD change, and nobody has asked for one.

### Epic impact
- **Epic 5:** it can still be completed as planned, once Story 5.10 is adjusted (§4.2). No other Epic 5 Story changes.
- **Story 5.7 (CI, nightly matrix):** this is an overlap, not a conflict. The nightly run already covers Linux, so 5.10's CI job needs to be only one Linux build and one harness run.
- **Later epics:** none needs to change.
  - The MySQL, MariaDB and SQL Server drivers, memcached, Beanstalkd and DynamoDB are post-alpha (`deferred:*`, PRD §7.2).
  - A sidecar for each is added by the Phase 9 Story that brings its driver, which is a policy line in the AD.
  - SQL Server's image is amd64-only, so its sidecar is an optional Compose profile.
- **Order:** unchanged. 5.10 stays last in Epic 5.

### Artifact conflicts
- **PRD:** no conflict while the container stays optional. No edit needed.
- **Architecture spine:** no AD covers the development environment. AD-17 and the Stack table are where it belongs.
  - A new AD-29 would also force an `AGENTS.md` edit, because `AGENTS.md` names "AD-1..AD-28".
  - So the proposal amends AD-17 instead of adding AD-29.
- **Technical risks found during review:**
  1. **Unix sockets and I/O on macOS bind mounts.** AD-17 puts the Redis socket in the worktree's `.cache/`. Creating a unix socket on a bind mount shared from macOS into the Linux VM is unreliable, and bind-mount I/O is slow for a run of more than 22k tests. The workspace, or at least `.cache/`, must be on a container volume.
  2. **The Docker socket.** Only the Oracle and Inventory jobs need Docker, and they run in CI or on the host. Mounting the host's Docker socket into the container gives it root on the host, so the container gets none.
  3. **Worktree keys.** The key includes the worktree path. A worktree used both inside and outside the container gets two keys and two sets of `xaravel_test_*` databases. That is wasteful but safe, because AD-17's names never collide. Documenting it is enough.
- **Secondary artifacts:**
  - `AGENTS.md` "Running and verifying": once 5.10 lands, the Maintainer adds a line pointing to the container. It is a Protected Path, so this is a follow-up.
  - CI: one new job, owned by 5.10.
  - Docs: `docs/ops/devcontainer.md`, owned by 5.10.
- **UX:** not applicable.

### Orchestrator
No change now (Maintainer decision, 2026-10-19). Moving the loop on `m1` into the container is a separate, later decision. It needs:
- Docker on `m1`;
- Claude auth and `gh` credentials inside the container;
- a plan for worktrees.

It is recorded as a deferred decision (§5).

## 3. Recommended approach

**Option 1, direct adjustment**, is viable, with low effort and low risk.
- Amend AD-17 with an optional reference-environment rule, and add one Stack row.
- Revise Story 5.10's acceptance criteria to match. One criterion is added: the container is never required.
- Nothing is rolled back (option 2 is not viable, since nothing built depends on 5.10) and the MVP stays as it is (option 3 is not needed).

**Rationale:** the PRD already decides "optional". Writing that into the architecture stops a later Story or agent from treating the container as the only way to run, which is the ripple the Maintainer was worried about. The edits fix the three technical risks before the loop builds 5.10.

**Timeline:** no change. 5.10 is still several hours of loop time away.

## 4. Detailed change proposals

### 4.1 Architecture spine (`ARCHITECTURE-SPINE.md`)

**AD-17, `Binds` line**

OLD:
```
- **Binds:** FR-9, NFR-7, NFR-10
```
NEW:
```
- **Binds:** FR-9, NFR-1, NFR-7, NFR-10
```

**AD-17, new last rule bullet** (after "One runner per worktree")

NEW:
```
  - **Reference environment (optional).** `.devcontainer/` is the Linux reference environment: Bun at `.bun-version`, `redis-server` at CI's Redis version inside the workspace (for the rule above), and a Postgres sidecar from CI's image. It is never required: every harness, tool and done check runs natively on macOS and Linux (NFR-1, PRD OQ-9, Story 2.2), where a backend that isn't running is `NOT-RUN`. Its pins are the Stack table's and CI's, checked mechanically. The workspace, or at least `.cache/`, lives on a container volume, not a host bind mount, so the Redis socket and the harness's I/O work. The container gets no Docker socket: the Oracle and Inventory jobs run in CI or on the host. A post-alpha engine (MySQL, MariaDB, SQL Server, memcached, Beanstalkd, DynamoDB Local) gets its sidecar from the Phase 9 Story that brings its driver; an amd64-only image is an optional Compose profile. A worktree used both inside and outside the container has two keys, and so two sets of databases.
```

**Stack table, new row** (after the Redis row)

NEW:
```
| Dev container (optional, AD-17) | `.devcontainer/`; images and versions as above |
```

**Frontmatter:** `updated: '2026-10-16'` becomes `updated: '2026-10-19'`.

Rationale: this records the decision where the backend rules already live, keeps "AD-1..AD-28" in `AGENTS.md` accurate, and turns each risk in §2 into a rule.

### 4.2 Story 5.10 (`epics.md`)

**Story statement**

OLD:
```
So that the harness runs every alpha Variant the same way everywhere, with nothing installed on the host but Docker (AD-17, AD-28, NFR-7).
```
NEW:
```
So that the harness can run every alpha Variant the same way everywhere, with nothing installed on the host but Docker, while running natively stays fully supported (AD-17, AD-28, NFR-1, NFR-7).
```

**AC 1: the container**

OLD:
```
**Then** the workspace container runs as a non-root user on linux/arm64 and linux/amd64, with Bun at `.bun-version`, the repo's locked dependencies installed by `bun install --frozen-lockfile`, and `redis-server` at the Redis version CI uses on `PATH`
**And** Postgres runs as a sidecar from the same image CI uses, reachable from the workspace through the `PG*` variables the harness reads.
```
NEW:
```
**Then** the workspace container runs as a non-root user on linux/arm64 and linux/amd64, with Bun at `.bun-version`, the repo's locked dependencies installed by `bun install --frozen-lockfile`, and `redis-server` at the Redis version CI uses on `PATH`
**And** Postgres runs as a sidecar from the same image CI uses, reachable from the workspace through the `PG*` variables the harness reads
**And** the workspace, or at least its `.cache/`, is on a container volume rather than a host bind mount, and the container has no Docker socket (AD-17).
```

**AC 4: CI**

OLD:
```
**Given** a PR that changes `.devcontainer/**`, and the nightly run
**When** CI runs
**Then** it builds the image and runs `bun run harness` inside it.
```
NEW:
```
**Given** a PR that changes `.devcontainer/**`, and the nightly run
**When** CI runs
**Then** one linux-x64 job builds the image and runs `bun run harness` inside it; the nightly matrix of Story 5.7 is not duplicated.
```

**New AC 6: never required** (after the docs AC)

NEW:
```
**Given** a machine without Docker
**When** any harness command, tool or `story:check` runs natively on macOS or Linux
**Then** nothing requires the container: a backend that isn't running is `NOT-RUN`, as before (PRD OQ-9, Story 2.2, NFR-1).
```

**AC 5: docs.** The text after "headless," gains: "that a worktree used both inside and outside the container has two AD-17 keys, and that the Oracle and Inventory tools run on the host or in CI".

Rationale: each edit closes a risk from §2, and AC 6 makes "optional" testable.

### 4.3 Story manifest (`stories/5.10.md`)

- Add `XT-conformance-195` for the new AC 6.
- Row: `| XT-conformance-195 | a machine without Docker |`

### 4.4 PRD

No change.

## 5. Implementation handoff

- **Scope:** Minor.
- **Maintainer (this session, now):** approve this proposal. Claude then applies §4.1–4.3 on `planning/devcontainer-course-correction` and opens one PR. The spine and `epics.md` are Protected, so the Maintainer merges it.
- **Orchestrator:** builds Story 5.10 from the revised text, in its turn after 5.9.
- **Maintainer, after 5.10 merges:** add the devcontainer line to `AGENTS.md` "Running and verifying".
- **Deferred decision (Maintainer):** whether the orchestrator on `m1` runs inside the container. Revisit after 5.10 lands and `m1` has Docker.

**Success criteria:**
- The PR merges before the loop starts 5.10.
- 5.10's spec carries AC 6, the volume rule and the no-socket rule.
- `bun run harness` inside the container shows no `NOT-RUN` alpha Variant.
- A native run without Docker still works.
