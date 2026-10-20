# Boost framework mode

Boost framework mode is a read-only MCP server inside the Xaravel monorepo (Story 7.3; FR-109, UJ-4). Framework Agents use it to look up their Test IDs, statuses, Conformance Rates, Divergence Records and Escalations, so they don't have to parse the Inventory, the Expectations shards, the manifests or the Escalation files by hand.

The usual flow is: `story.tests` for your Story, then `inventory.get` and `expectations.status` for each Test ID, then `divergence.get` for any DIV a line cites, and `escalations.open` to see what is still waiting on the Maintainer.

## Running it

```sh
bun --no-env-file tools/boost-framework/src/server.ts [--root <dir>]
```

- It speaks newline-delimited JSON-RPC (MCP) over stdio. Nothing but JSON-RPC goes to stdout.
- `<root>` defaults to the repository that holds the server file (`tools/boost-framework/src/../../..`), not the cwd. `--root <dir>` reads another checkout, such as a test fixture.
- A bad flag prints the usage to stderr and exits 2.
- Its only dependency is `@modelcontextprotocol/server` 2.3.1 (exact pin). The code imports only that package, `@modelcontextprotocol/server/stdio`, `node:*` and its own files. Input schemas are plain JSON Schema, wrapped with the SDK's `fromJsonSchema`.

### Registration

The repository's `.mcp.json` (tracked by git) registers the server:

```json
{ "mcpServers": { "boost-framework": { "command": "bun", "args": ["--no-env-file", "tools/boost-framework/src/server.ts"] } } }
```

The command is relative to the repository root, so every worktree runs its own copy of the server over its own files.

Whether a client starts project-scoped servers is a client setting, and this repository does not set it. In Claude Code, a project `.mcp.json` server needs approval once per project:

- interactively, approve `boost-framework` at the prompt, or later through `/mcp`;
- for unattended sessions, approve it in the user's or the session's own settings, with `"enabledMcpjsonServers": ["boost-framework"]` (or `"enableAllProjectMcpServers": true`).

`claude mcp list` shows whether it is connected. Story 7.3 does not edit `.claude/`, so the approval stays with whoever runs the session.

## Tools

Every tool:

- returns `{content: [{type: "text", text: JSON.stringify(value)}], structuredContent: value}`, where `value` is an object;
- has `annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false}`;
- has an object input schema with `additionalProperties: false`. Arguments that fail the schema come back from the SDK as a tool error (`isError: true`, "Input validation error: …"). The tool's own errors also come back as `isError: true`, with a message that names the rule or the file.

Results are sorted in code-unit order (`compareUnits`).

### `inventory.get {id?, glob?, limit?}`

Exactly one of `id` and `glob` is required. `limit` is an integer from 1 to 1000 (default 100).

- It reads every `conformance/inventory/*.jsonl` except `oracle-nondeterminism.jsonl`.
- The glob has the harness's `--id` semantics: `*` matches any run, `?` matches one character, everything else is literal, and the whole id must match.
- It returns `{entries, total, truncated}`, sorted by id. `total` counts every match; `truncated` is true when `total > limit`.
- Each entry is `{id, component, kind, backends, hash, oracle, assertions, source: {path, start, end}}`. `assertions` is the Upstream assertion multiset (`null` when the Oracle recorded none). `source.path` is `conformance/upstream/<path>` and `start`/`end` are the line range of the Inventory's `<path>:<start>-<end>`.
- An unknown id gives `entries: []`. A dataset row is its own id, `X#<key>`.

The Upstream snapshot under `conformance/upstream/` is synced locally (`bun run upstream:sync`), not committed. The tool returns the path; open the file there to read the test.

### `expectations.status {id, variant?}`

It returns `{id, inInventory, lines}`. `lines` holds every Expectations line with exactly this `id` (and `variant`, when given), as `{variant, status, reason, adapted, escalation, shard}`, sorted by variant. A missing field is `null`; `shard` is the repo-relative shard path. An unknown id gives `lines: []` and `inInventory: false`.

### `conformance.rate {component?}`

It returns `{scope, bucket, components}`:

- `scope` is `"overall"` or the Component asked for.
- `bucket` is Story 7.1's `Bucket` (`pairs`, `passing`, `rate`, `statuses`, `failKnown`, `reasons`, `reasonsDetail`, `adapted`), with the same keys in the same order and the same numbers as `computeReport(root).overall` or `.components[<component>]`. It is `null` for a Component with no pairs.
- `components` lists, sorted, the Components that have a bucket.

The SM-1 alpha-gate figure is not included: it needs the package table (`tools/scaffold/packages.jsonl`), which is outside the data scope. Run `bun run conformance:report`, or see the dashboard, for it. Bad Expectations data (malformed JSON, an unknown Test ID, status or Skip Reason, or a duplicate pair) is a tool error that names the shard (and the line, for a line that does not parse).

### `story.tests {story}`

`story` is a Story ID such as `7.3`. The tool reads the `stories/<id>.md` frontmatter with `Bun.YAML.parse` and returns `{story, epic, component, title, status, testIds, xaravelTestIds}`. `status` is the manifest's own value; sprint status is not read. A missing or invalid manifest is a tool error that names the path.

### `divergence.get {id}`

`id` is `DIV-<n>` or `DIV-<n>.<k>`; anything else is a tool error. The tool reads `decisions/DIV-<n>.md` and returns `{id, path, exists, frontmatter, clauses}`, plus `text` (the whole file) when `id` has no clause part.

A clause is the form Story 8.1 writes the records in:

- it starts at a line whose first token is `DIV-<n>.<k>`, after an optional list marker (`-`, `*` or `<d>.`), heading `#`s or `**`. Examples: `- **DIV-3.1** …`, `## DIV-3.2 …`, `DIV-3.3: …`;
- it runs until the next clause start or the next heading;
- it is returned as `{id, text}`, with trailing blank lines dropped.

With `DIV-<n>.<k>`, `clauses` holds only that clause. A record that does not exist yet gives `exists: false`, `frontmatter: null`, `clauses: []` and a `note` that Story 8.1 writes the records.

### `escalations.open {story?}`

It returns `{escalations}`: each `conformance/escalations/ESC-*.md` whose status is open, as `{id, path, trigger, testIds, proposed}`, sorted by id. With `story`, only `ESC-<story>-<n>` ids are returned.

Status follows `escalationStatus` (tools/escalations/escalations.ts). An Escalation is decided only when `decisions/<id>.md`:

- has `decision` `approved` or `rejected`;
- has an `escalation_sha256` equal to the SHA-256 of the Escalation's current text (CRLF normalised to LF);
- has a body line that is neither blank nor a heading.

Otherwise it is open, so a decision made on older text (a stale one) leaves it open. An Escalation that does not parse is listed as open with `trigger: null`.

## Data scope

Every data file is read through one helper, `dataPath(root, rel)` in `src/data.ts`. It resolves `rel` under `<root>` and throws `DataScopeError` unless the result lies inside `<root>/conformance/`, `<root>/stories/` or `<root>/decisions/` (`DATA_DIRS`; spine l.106). No tool writes files, runs commands or touches git. Story 7.4 hardens the refusal and proves the read-only property.

Nothing is cached. Each call reads the files again, so edits made in the worktree show up at once.

## Mirrored rules and their cross-checks

The workspace is its own composite tsc project (`rootDir: .`), so it cannot import `tools/*`. Instead it mirrors these rules, and `conformance/tests/xaravel/boost-framework.test.ts` compares each with its source, on a fixture and on the real repository:

| Rule | Source | Cross-check |
| --- | --- | --- |
| The Bucket (`emptyBucket` / `add` / `finish`, Component of a pair, reason kinds) | `tools/conformance-report/report.ts` `computeReport` | XT-boost-1: the overall and per-Component buckets serialise identically (same keys, order and numbers) |
| The Inventory file filter and the Expectations walk | `tools/pin-bump/pin-bump.ts` `readWorkingInventory` / `readExpectations` | XT-boost-2: `inventory.get {glob: "*"}` `total` equals the Inventory size; XT-boost-1: the shard paths and line counts are equal |
| The Escalation status | `tools/escalations/escalations.ts` `escalationStatus` | XT-boost-1: the open set equals `escalationStatus(...) === "open"`, including a stale decision |
| The manifest fields | `tools/ownership/ownership.ts` `readManifests` | XT-boost-1: every manifest's epic, component, status and Test IDs are equal |
| The `--id` glob | `conformance/harness/select.ts` `globToRegExp` | XT-boost-1: the same matches on a set of globs and ids |

A change to either side of a mirror then fails CI.

## Limits

- No alpha-gate figure (see `conformance.rate`).
- `story.tests` does not validate a manifest as strictly as `ownership:check`; it checks the fields it returns. `ownership:check` stays the authority.
- `escalations.open` does not validate the Escalation as `escalations:check` does; an Escalation that fails that check shows `trigger: null` but is still listed while open.
- `divergence.get` reads only the clause form above. Records Story 8.1 writes in another form give their `text` but no `clauses`.
- A clause ends at any heading-shaped line (`#` to `######` then a space, up to 3 spaces of indent), even one inside a fenced code block, so a record must not put `#` lines inside a clause.
- Any line whose first token (after the optional marker) is a `DIV-<n>.<k>` ends the current clause: a new clause starts when `<n>` is the record's own number, and a line citing another record's clause (such as `DIV-4.1 …` in `DIV-3.md`) ends it without starting one. Cite another clause mid-line, never at a line start.
- The read-only guarantee is by construction here; Story 7.4 tests it (every tool called, worktree unchanged) and hardens the path refusal (for example against symlinks).
