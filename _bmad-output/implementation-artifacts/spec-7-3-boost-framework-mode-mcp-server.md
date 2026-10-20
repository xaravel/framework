---
title: 'Story 7.3: Boost framework-mode MCP server'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'acae9ea99cf656489822e9d4cf1a9dce6cbaad81'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-1-conformance-aggregator.md'
  - '{project-root}/stories/7.3.md'
warnings: ['oversized']
deferred:
  - summary: >-
      .mcp.json is not a Protected Path, so any Story could repoint or add an MCP server without Maintainer review.
    evidence: |-
      conformance/protected-paths lists /.claude/ and /AGENTS.md but not /.mcp.json; editing that list is outside this Story's remit.
    location: >-
      .mcp.json
    severity: medium
  - summary: >-
      dataPath checks containment lexically and follows symlinks; tool error-message parity with computeReport is untested.
    evidence: |-
      readFileSync/readdirSync follow symlinks under conformance/, stories/, decisions/. Story 7.4 AC2 (only those paths, attempts outside refused) is the covering target.
    location: >-
      tools/boost-framework/src/data.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Framework Agents have to parse the Inventory, Expectations shards, manifests and Escalation files by hand to find their work. FR-109 and UJ-4 ask for a read-only MCP server inside the monorepo that answers these questions.

**Approach:** Build `tools/boost-framework` as a stdio MCP server on `@modelcontextprotocol/server` 2.3.1, its only dependency. It offers six read-only tools over `conformance/`, `stories/` and `decisions/`. The repo's `.mcp.json` registers it, so every worktree session gets it.

## Boundaries & Constraints

**Always:**
- **Dependency.** `tools/boost-framework/package.json` `dependencies` is exactly `{"@modelcontextprotocol/server": "2.3.1"}` (exact pin). It has no other dependency fields, and its other generated fields stay as XT-conformance-7/8 require. Input schemas use the SDK's `fromJsonSchema`, so the code needs no direct `zod` import.
- **Data scope (spine l.106).** Every data file is read from `<root>/conformance/`, `<root>/stories/` or `<root>/decisions/`, through one helper that throws on any other path. `<root>` defaults to the repo root holding the server file (`import.meta.dir/../../..`), not the cwd; `--root <dir>` overrides it. Story 7.4 hardens and proves the refusal; this Story only routes every read through the helper.
- **Imports.** The workspace imports only `@modelcontextprotocol/server`, `@modelcontextprotocol/server/stdio`, `node:*` and its own files. It is its own composite tsc project (scaffold-generated, `rootDir: .`), so it cannot import `tools/*`. Where it mirrors another tool's rule, an XT test compares it with that tool on the real repo and on a fixture.
- **Fresh reads.** Each call reads the files again. There is no cache, so edits made in the worktree show up at once.
- **Tools.** Each tool returns `{content: [{type: "text", text: JSON.stringify(value)}], structuredContent: value}`, where `value` is an object. Each has `annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false}` and an input schema with `additionalProperties: false`.
  - `inventory.get {id?: string, glob?: string, limit?: integer 1..1000 = 100}`. Exactly one of `id` and `glob` is required; otherwise the call is a tool error. It reads every `conformance/inventory/*.jsonl` except `oracle-nondeterminism.jsonl`. The glob uses the harness's `--id` semantics: `*` matches any run, `?` matches one character, everything else is literal, and the whole id must match. It returns `{entries, total, truncated}`, sorted by id in code-unit order. Each entry is `{id, component, kind, backends, hash, oracle, assertions, source: {path, start, end}}`, where `path` is `conformance/upstream/<inventory source path>` and `start`/`end` are integers parsed from `<path>:<start>-<end>`. An unknown id gives `entries: []`.
  - `expectations.status {id: string, variant?: string}`. It returns `{id, inInventory, lines}`. `lines` holds every Expectations line with exactly this `id` (and `variant`, when given), as `{variant, status, reason, adapted, escalation, shard}` sorted by variant. Missing fields are `null`. Dataset rows are separate ids (`X#<key>`).
  - `conformance.rate {component?: string}`. It returns `{scope: "overall" | <component>, bucket}`, where `bucket` is 7.1's `Bucket` (same fields, the same key order, the same numbers as `computeReport(root).overall` / `.components[c]`), or `null` for a Component with no pairs. It also returns `components`: the sorted names that have a bucket. The alpha-gate figure is not included: it needs the package table, which is outside the data scope. The tool's description points to `bun run conformance:report`.
  - `story.tests {story: string}` (Story ID such as `7.3`). It reads `stories/<id>.md` frontmatter with `Bun.YAML.parse` and returns `{story, epic, component, title, status, testIds, xaravelTestIds}`. `status` is the manifest's value. A missing or invalid manifest is a tool error that names the path.
  - `divergence.get {id: string}` (`DIV-<n>` or `DIV-<n>.<k>`). It reads `decisions/DIV-<n>.md`. It returns `{id, path, exists, frontmatter, clauses}`, plus `text` (the whole file) when `id` has no clause part. A clause starts at a line whose first token, after an optional list marker (`-`, `*`, `<d>.`), heading `#`s or `**`, is `DIV-<n>.<k>`. It runs until the next clause start or the next heading, and is returned as `{id, text}`. With `.<k>`, `clauses` holds only that clause. A missing record gives `exists: false, frontmatter: null, clauses: []` and a note that Story 8.1 writes the records. A malformed id is a tool error.
  - `escalations.open {story?: string}`. It returns `{escalations}`: each `conformance/escalations/ESC-*.md` whose status is `open`, as `{id, path, trigger, testIds, proposed}`, sorted by id. When `story` is given, only `ESC-<story>-<n>` ids are returned. Status follows `escalationStatus`: an Escalation is decided only when `decisions/<id>.md` has `decision` `approved`/`rejected`, an `escalation_sha256` equal to the SHA-256 of the Escalation text (CRLF normalised to LF), and a body line that is neither blank nor a heading. Otherwise it is open. An unparseable Escalation is listed as open with `trigger: null`.
- **CLI.** `bun --no-env-file tools/boost-framework/src/server.ts [--root <dir>]` follows 7.1: a header usage comment and `main(argv)`. A bad flag prints usage to stderr and exits 2. Nothing but JSON-RPC goes to stdout.
- **Registration.** `.mcp.json` at the repo root is `{"mcpServers": {"boost-framework": {"command": "bun", "args": ["--no-env-file", "tools/boost-framework/src/server.ts"]}}}`, and it is tracked by git.

**Never:**
- Add a second dependency, a devDependency, or `zod`/`ajv` imports. Never edit `tools/scaffold/`, the generated `tsconfig.json`, `tools/ownership/`, `conformance/protected-paths`, `.github/rulesets/*`, any Inventory or Expectations data, `AGENTS.md`, or `.claude/`.
- Write files, run child processes or touch git from the server. Never expose a tool that does any of these.
- Import a graded package (`packages/*`) or any `tools/*` module into the workspace.
- Use `bun:test` `expect`-only shortcuts that weaken an existing test. The new XT file may use `expect`, as the other `conformance/tests/xaravel` files do.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| tools/list | stdio initialize + `tools/list` | exactly the 6 names, sorted; each `readOnlyHint: true`, object input schema | — |
| inventory by id | fixture entry `source: "framework/tests/A/BTest.php:11-18"`, `assertions: {assertSame: 2}` | `source: {path: "conformance/upstream/framework/tests/A/BTest.php", start: 11, end: 18}`, the assertions map | — |
| inventory glob | `glob: "*BTest::*"`, `limit: 1`, 2 matches | 1 entry, `total: 2`, `truncated: true` | — |
| inventory both/neither | `{}` or `{id, glob}` | — | `isError: true`, names the rule |
| bad args | `{nope: 1}` | — | SDK input-validation tool error |
| expectations | id with `none` and `sqlite` lines | 2 lines sorted by variant, each with its shard path | unknown id gives `lines: []`, `inInventory: false` |
| rate | fixture with pass, fail-known, skip and quarantined lines | overall and per-Component buckets deep-equal `computeReport` | unknown Component gives `bucket: null` |
| story | `stories/9.9.md` with test_ids | its ids and component | missing manifest gives a tool error |
| divergence | `decisions/DIV-3.md` with clauses `DIV-3.1`, `DIV-3.2`; ask `DIV-3`, `DIV-3.2`, `DIV-4` | both clauses / only `DIV-3.2` / `exists: false` | `DIV-x` gives a tool error |
| escalations | one open ESC, one with a bound decision, one with a stale decision | the open and the stale one | — |
| real repo | the repository | rate == `computeReport`, open set == `escalationStatus`, story ids == `readManifests`, every Inventory `source` parses | — |
| .mcp.json | spawn its command from the repo root | initialize succeeds; 6 tools | — |
| bad flag | `--nope` | usage on stderr | exit 2 |

</intent-contract>

## Code Map

- `tools/boost-framework/` -- scaffolded by Story 1.2: `package.json` (Story-owned), a generated `tsconfig.json` (composite, `rootDir: .`, `include: src/**, tests/**`; `checkTsconfigs` regenerates it, so it is never edited by hand), `src/index.ts` (`export {};`), and `README.md` ("## Dependencies / None.", Story-owned).
- `tools/scaffold/packages.jsonl:5` -- the row: kind `grader`, phase 0, private. `tools/graph/graph.ts:97` exempts relative and `node:` imports, and requires every bare import to be in `dependencies`.
- `conformance/tests/xaravel/scaffold.test.ts:221-266` (XT-7) and `:270-305` (XT-8) -- the manifest fields that must stay. The `exports` value stays `{".": "./src/index.ts"}`.
- `tools/conformance-report/report.ts:52-63,86-150,178-300` -- `Bucket`, `emptyBucket` / `add` / `finish`, and `computeReport`, the definitions this Story mirrors. `kindOf` takes the text before the first `:`; `adapted` counts as present when the field is non-null; buckets exist only for Components with lines, and their names are sorted by `compareUnits` (code-unit order).
- `tools/pin-bump/pin-bump.ts:311-322,365-395` -- the Inventory file filter (skips `oracle-nondeterminism.jsonl`) and the Expectations walk (every `*.jsonl` under `conformance/expectations/`).
- `tools/escalations/escalations.ts:192-372` -- frontmatter via `Bun.YAML.parse`, `parseEscalation`, `parseDecision`, `escalationDigest`, `escalationStatus` (the rule to mirror).
- `tools/ownership/ownership.ts:137-148,222-305` -- `Manifest` and `parseManifest` (`test_ids`, `xaravel_test_ids`, `component`, `epic`, `status`).
- `conformance/harness/select.ts:40` -- `globToRegExp`, the glob semantics to match.
- `conformance/harness/xaravel.ts:37` -- XT files must be under `conformance/tests/xaravel/` (or `packages/*/tests/xaravel/`). `tools/boost-framework/tests/` is not scanned.
- `packages/assert/src/declarations/xaravelTest.ts:15` -- `xaravelTest(id, consequence, fn, timeout?)`.
- `conformance/tests/xaravel/dashboard.test.ts:1-60` -- fixture-root and temp-dir helpers to copy.
- SDK spike (verified): `new McpServer({name, version})`, `registerTool(name, {description, inputSchema: fromJsonSchema(json), annotations}, handler)`, `await server.connect(new StdioServerTransport())` from `@modelcontextprotocol/server/stdio`. The handshake is newline-delimited JSON-RPC (`initialize` with `protocolVersion: "2025-06-18"`, then `notifications/initialized`). Responses can arrive out of order, so the client matches them by `id`. Invalid args come back as `isError: true`, "Input validation error: …".

## Tasks & Acceptance

**Execution:**
- `tools/boost-framework/package.json`, `bun.lock` -- add the exact `@modelcontextprotocol/server` 2.3.1 dependency (already done with `bun add --exact`). It must pass `bun install --frozen-lockfile`.
- `tools/boost-framework/src/data.ts` -- create it: `DATA_DIRS`, `dataPath(root, rel)` (throws `DataScopeError` outside the three dirs), and readers for the Inventory, Expectations, manifests, Escalations and decisions, plus frontmatter parsing.
- `tools/boost-framework/src/tools.ts` -- create it: the six pure handlers `(root, args) => value`, throwing `ToolError` for tool errors, plus `TOOL_DEFINITIONS` (name, description, JSON input schema).
- `tools/boost-framework/src/server.ts` -- create it: `createServer(root)`, which registers every definition with the annotations and maps `ToolError` to `isError` results; `main(argv)`; and the stdio connect.
- `tools/boost-framework/src/index.ts` -- re-export the public surface (`createServer`, the handlers, `TOOL_DEFINITIONS`, `DATA_DIRS`).
- `.mcp.json` -- create the registration.
- `conformance/tests/xaravel/boost-framework.test.ts` -- create it. It has a raw stdio JSON-RPC client (spawn, initialize, call, matched by id, then kill) and covers every matrix row:
  - `XT-boost-1`: the dependency, tools/list, each tool over stdio on a fixture, and the real-repo cross-checks;
  - `XT-boost-2`: `inventory.get`'s source path and line range, and the assertion multiset, on the fixture and on real Inventory entries (every `source` parses; a sample's assertions equal the file's);
  - `XT-boost-3`: `.mcp.json` is tracked, and its command, spawned from the root, serves the six tools.
- `tools/boost-framework/README.md` -- update the Dependencies line, and add usage and the tool list.
- `tools/boost-framework/docs/framework-mode.md` -- add the tools, the data scope, the mirrored rules and their cross-checks, how agents enable `.mcp.json` servers, and the limits.

**Acceptance Criteria:**
- Given `tools/boost-framework`, whose only dependency is `@modelcontextprotocol/server` 2.3.1, when an agent connects over stdio, then it offers `inventory.get`, `expectations.status`, `conformance.rate`, `story.tests`, `divergence.get` and `escalations.open` (XT-boost-1).
- Given a Test ID, when `inventory.get` is called, then it returns the source path and line range in `conformance/upstream/` and the Upstream assertion multiset (XT-boost-2).
- Given the repo's `.mcp.json`, when an agent session starts in a worktree, then the server is registered for it (XT-boost-3). Whether Claude Code trusts project servers is a client setting. It is documented and not set by this Story.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 35 findings — high 0, medium 3, low 26, false 6, maybe-false 0
- findings:
  - **Intent-alignment layer**
    - `[low]` `[reject]` AC1 is exercised by a hand-written JSON-RPC client, not a real agent. Newline-delimited JSON-RPC over stdio is the MCP stdio transport, and every client speaks it. Adding a client SDK would add a second dependency, which AC1 forbids.
    - `[low]` `[reject]` AC2 reads the Inventory, not the Upstream snapshot. The snapshot is gitignored, and the Inventory's `source` and `assertions` are derived from it by `inventory` (Epic 2). The line range is checked against the file wherever the snapshot is synced.
    - `[low]` `[reject]` AC3 is checked on the file and its command, not on a live session. A worktree checks out the tracked `.mcp.json`. Client trust (approving project servers) is a client setting, so it is documented.
    - `[false]` `[reject]` Result shapes go beyond the AC. They are fixed in the intent contract, and the tests check that contract.
    - `[false]` `[reject]` Protected Paths and Story write scope. The MAINT ruling (second amendment) approves every path for Epic 1–8 Stories.
  - **Verification-gap layer**
    - `[medium]` `[patch]` The mirrored `rejected` branch and the rationale rule were unexercised. Added fixtures `ESC-9.9-5` (rejected, excluded) and `ESC-9.9-6` (heading-only body, listed), both cross-checked against `escalationStatus`.
    - `[medium]` `[patch]` The heading, numbered and bare clause forms were untested. The fixture `DIV-3.md` now has `## DIV-3.3`, `1. DIV-3.4` and `DIV-3.5:`, and all five clauses are asserted.
    - `[low]` `[defer]` Bad-data tool errors from `conformance.rate` are unverified. Only error-message parity is at stake; Story 7.4's refusal and error tests cover the server's failure paths.
    - `[low]` `[patch]` The import guard regex missed side-effect and dynamic imports. It now matches both, and refuses a non-literal `import(`.
    - `[low]` `[reject]` `--root` validation is untested. The branches are three lines and fail loudly with usage.
  - **Blind layer**
    - `[false]` `[reject]` The matrix says 2 glob matches and the test says 3. The matrix row describes a two-entry state; the test fixture also has a dataset row `B2#first` that the glob matches. Behaviour agrees with the rule in both.
    - `[medium]` `[defer]` `.mcp.json` is not a Protected Path, so a Story could repoint the server. The fix edits `conformance/protected-paths`, which this Story may not change to suit itself. Deferred for an Infrastructure change.
    - `[low]` `[patch]` The README claimed "anywhere in the repository". It now says the repository root or a worktree's root.
    - `[low]` `[patch]` The 7.3 manifest status was `backlog`. It is set to `done` with the sprint status at finalization.
    - `[low]` `[reject]` There is no batch query. Not in the AC; it adds surface, and each call takes under a second on the real repo.
    - `[low]` `[reject]` One bad line fails unrelated tools. A loud failure that names the file and line matches `computeReport` and the CI checks.
    - `[low]` `[patch]` The clause parser stops at `#` lines in fences and at other DIV ids. Documented under Limits as the form Story 8.1 must write; fence tracking would add a branch for records that do not exist yet.
    - `[medium]` `[patch]` Escalation edge cases (rejected, rationale). Same root cause as the verification-gap rejected/rationale row. The CRLF, `ESC-bot` and malformed-name parts are low and rejected: `escalations:check` validates names in CI.
    - `[low]` `[reject]` Bot Escalations cannot be filtered. Not asked for; the unfiltered list includes them.
    - `[low]` `[patch]` The test client hangs when the server dies. It now drains stderr and rejects pending calls on exit, with the stderr text.
    - `[low]` `[patch]` Import guard gaps. Same as the verification-gap row.
    - `[low]` `[defer]` The data-scope helper follows symlinks. Story 7.4 AC2 (opens only those paths; attempts outside are refused) covers it.
    - `[low]` `[reject]` No `outputSchema`. Not asked for; the shapes are documented and asserted.
    - `[low]` `[reject]` CLI loose ends (`--help`, repeated `--root`, fixed version). The server is private and started by `.mcp.json`; fixing these adds branches for rare manual use.
  - **Edge-case layer**
    - `[low]` `[patch]` `conformance.rate {component: "constructor"}` returned a prototype member. Now uses `Object.hasOwn`, with an assertion.
    - `[low]` `[reject]` Inventory strictness (CRLF, key order) is not mirrored. `inventory:check` and `expectations:check` keep `main` valid; adding the checks duplicates them.
    - `[low]` `[reject]` A non-string `component` gives a misleading error. Same CI guard as the previous row.
    - `[low]` `[reject]` A manifest path that is a directory gives "internal error". It needs a deliberately malformed tree; the error still names the cause.
    - `[low]` `[reject]` A broken symlink in a data directory. Same as the previous row; 7.4 owns path hardening.
    - `[low]` `[patch]` Fenced code truncates a clause. Same as the blind clause row (documented limit).
    - `[low]` `[reject]` A duplicate clause id returns two clauses. Story 8.1's record validation owns clause uniqueness.
    - `[low]` `[patch]` The test client hangs. Same as the blind row.
    - `[low]` `[patch]` The docs claimed the same message as `computeReport`. Corrected: it is a tool error that names the shard and line.
    - `[false]` `[reject]` `story.tests` accepts invalid manifests. `ownership:check` (CI, required) rejects them, so `main` holds none. The spec asks for an error only for a missing or unparseable manifest.
    - `[false]` `[reject]` The rate is reported where `computeReport` would throw. It needs data that the CI checks refuse on `main`. On the real repo and the fixture the two are asserted equal.

## Design Notes

**Why mirror instead of import.** The spine (l.106) limits framework mode to reading `conformance/`, `stories/` and `decisions/`. 7.1's `report.json` lives in `.cache/` and is often stale or missing in a worktree. The workspace's generated composite tsconfig rejects imports from `tools/` (verified: TS6059/TS6307). So the server recomputes 7.1's Bucket from the same files, and XT-boost-1 asserts deep equality with `computeReport` on the real repo and on a fixture. A change to either side then fails CI. The alpha figure needs `tools/scaffold/packages.jsonl`, so it stays on the dashboard.

**Contract with 7.4 and 8.1.** 7.4 tests the `dataPath` refusal and the "no write, no command" property; every read already goes through `dataPath`. 8.1 writes the DIV records; the clause rule above is the form `divergence.get` reads, and docs name it for 8.1.

## Verification

**Commands:**
- `bun install --frozen-lockfile` -- expected: no changes.
- `bun run harness --xaravel --id 'XT-boost-*'` -- expected: 3 pass.
- `bun run typecheck && bun run lint && bun run graph:check && bun run scaffold:check` -- expected: clean.
- `bun run harness --xaravel` -- expected: no differences.

## Auto Run Result

Status: done

**Summary.** `tools/boost-framework` is now a stdio MCP server on `@modelcontextprotocol/server` 2.3.1, its only dependency, pinned exactly. It offers six read-only tools:
- `inventory.get`: by id or glob, returning the `conformance/upstream/` source path, the line range and the assertion multiset;
- `expectations.status`;
- `conformance.rate`: 7.1's Bucket, recomputed from the same files;
- `story.tests`;
- `divergence.get`: a record and its `DIV-<n>.<k>` clauses; it handles a missing record;
- `escalations.open`: follows `escalationStatus`, including digest binding.

Every read goes through `dataPath`, which allows only `conformance/`, `stories/` and `decisions/`. The repo's tracked `.mcp.json` registers the server as `boost-framework`.

**Files.**
- `tools/boost-framework/src/data.ts`: the data-scope helper and the readers.
- `tools/boost-framework/src/tools.ts`: the six handlers and their JSON input schemas.
- `tools/boost-framework/src/server.ts`: `createServer`, the CLI and the stdio connect.
- `tools/boost-framework/src/index.ts`: the public re-exports.
- `tools/boost-framework/package.json`, `bun.lock`: the exact SDK pin.
- `tools/boost-framework/README.md`, `tools/boost-framework/docs/framework-mode.md`: usage, the tools, the data scope, the mirrored rules, client approval and the limits.
- `.mcp.json`: the registration.
- `conformance/tests/xaravel/boost-framework.test.ts`: XT-boost-1..3, with a raw stdio JSON-RPC client.

**Review.** 35 findings: 3 medium, 26 low and 6 false.
- 15 rows patched: 2 medium entries (3 rows) and the rest low.
- 3 deferred: `.mcp.json` is not a Protected Path (medium); symlink-following in `dataPath`, which goes to Story 7.4; error-message parity.
- 17 rejected, each with its reason in the triage log.

**Follow-up review recommended: true.** Two medium entries were patched. Both are test-coverage patches, for the `rejected`/rationale Escalation rules and the clause forms. No fresh review layer has read the new fixtures or the reworked `StdioClient`.

**Verification.**
- `bun install --frozen-lockfile`: no changes.
- `typecheck`, `lint`, `graph:check`, `scaffold:check`, `workflows:check` and `ownership:check`: clean.
- `bun run harness --xaravel --id 'XT-boost-*'`: 3/3 pass.
- `bun run harness --xaravel`: 261/261 pass, differ 0.

**Residual risks.**
- Claude Code starts project `.mcp.json` servers only after approval (`/mcp`, or `enabledMcpjsonServers`). This Story documents that and does not set it.
- `conformance.rate` mirrors `computeReport` instead of importing it. The composite tsconfig and the spine's data scope rule out the import. Equality is asserted on a fixture and on the real repo.
- No DIV records exist yet, so the clause parser is proven only on fixtures until Story 8.1.
- `.mcp.json` is not Protected (deferred).
