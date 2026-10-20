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

Every data file is read through one helper, `dataPath(root, rel)` in `src/data.ts`. It resolves `rel` under `<root>` and throws `DataScopeError` unless the result lies inside `<root>/conformance/`, `<root>/stories/` or `<root>/decisions/` (`DATA_DIRS`; spine l.106). It checks twice:

- **lexically**: `rel` is a non-empty relative string without NUL, and it resolves under `<root>` into one of the three directories;
- **on the real path** (`inScope(root, abs)`, `src/scope.ts`, Story 7.4): the real path of `abs` must lie inside, or equal, `realpath(root)/<d>` for some `d` in `DATA_DIRS`. The real path of a path that does not exist is the real path of its nearest existing ancestor plus the remaining segments (a remaining `..` is refused). A dangling symlink, a non-string or a relative path is out of scope.

So a symlink under a data directory that points outside the scope (a file, a whole directory, or a file elsewhere in the repository such as `tools/`) is refused, and so is a dangling one. A symlink that stays inside the scope (for example `stories/9.7.md` to `conformance/m.md`) is read. A refused read comes back as a tool error whose text starts with `refused:`.

Nothing is cached. Each call reads the files again, so edits made in the worktree show up at once.

## Read-only, enforced (Story 7.4)

No tool writes files, runs commands or touches git, and the server process cannot either: it locks itself down before its data layer loads.

### Entry order

`src/server.ts` is the `.mcp.json` entry. Its static imports are only `./lockdown` (and, through it, `./scope`) and `node:path`, so when its module graph links no `node:fs` named import is bound yet. `main()` parses the arguments (the `--root` check uses `node:fs` from `process.getBuiltinModule`, inside `src/scope.ts`), calls `lockdown(root)`, and only then runs `await import("./mcp")`, which loads the SDK, the tools and the data layer, and connects over stdio. The order matters because Bun binds `node:fs` named imports when a module graph links: a patch made later does not reach a module that was already linked, while a module imported after the patch binds to the patched functions.

`createServer`, `callTool`, `TOOL_ANNOTATIONS`, `SERVER_NAME` and `SERVER_VERSION` live in `src/mcp.ts`; `src/index.ts` re-exports them as before, plus `lockdown`, `ReadOnlyError` and `inScope`.

### Lockdown

`lockdown(root)` (`src/lockdown.ts`) takes the live module objects from `process.getBuiltinModule` and replaces their exports. What it refuses:

- **`node:fs` reads.** `readFileSync`, `readdirSync`, `statSync`, `lstatSync`, `existsSync` and `realpathSync` (and `realpathSync.native`) are wrapped. Each throws `DataScopeError` unless `inScope(root, firstArg)` holds, then calls the original. So a file descriptor, a relative path, `/etc/hosts`, `<root>/AGENTS.md` or a symlink out of scope is refused even by code that skips `dataPath`. A call whose options carry a `flag` other than `"r"` (such as `readFileSync(path, {flag: "w"})`, which would truncate the file) throws `ReadOnlyError`.
- **Everything else in `node:fs` and `node:fs/promises`.** Every other function export whose name starts with a lowercase letter throws `ReadOnlyError: refused: <module>.<name> (framework mode is read-only)`. That covers the async reads, `openSync`, `opendirSync`, `createReadStream`/`createWriteStream`, `watch` and every write. It is a whitelist, so a function this file does not know refuses by default. The stream classes (`ReadStream`, `WriteStream` and the like) are left in place: they open through `fs.open`, which refuses, so a stream only emits a `ReadOnlyError` (XT-boost-5 checks this).
- **Processes, workers, native code and databases.** Every function export of `node:child_process`, `node:worker_threads`, `bun:sqlite` (a `Database` creates its file) and `bun:ffi` refuses. So do `globalThis.Worker` (a worker is a fresh realm with an unpatched `node:fs`), `fetch` (it reads `file:` URLs) and `WebSocket`.
- **`Bun` members.** `spawn`, `spawnSync`, `$`, `write`, `file`, `mmap`, `openInEditor`, `build`, `Glob`, `s3`, `S3Client`, `sql`, `SQL`, `connect`, `listen`, `serve` and `udpSocket` refuse.
- **A second call.** `lockdown` runs once per process, and a second call throws. The flag is set only after every patch is in place, so a failure midway does not report the process as locked down.

Bun builds `process.stdin`, `process.stdout` and `process.stderr` lazily from `Bun.file(<fd>)`, and a stream built after the lockdown would fall back to the refused `fs.write`. `lockdown` therefore builds the three streams first, on the originals. They are the JSON-RPC channel, over file descriptors that are already open; no new file can be opened afterwards.

"Opens" means `readFileSync` and `readdirSync`, the only opening calls lockdown lets through. `stat`, `lstat`, `exists` and `realpath` are scope-checked too. The process necessarily loads its own code and the SDK; module loading is native and goes through no `fs` export, so it is outside the runtime file access this guarantee is about.

What stays open (see Limits): `node:net`, `node:http`, `node:https`, `node:dgram`, `node:tls` and the other network modules; `process.binding` and `process.dlopen`; and the window between a scope check and the read it guards.

### Static guard

XT-boost-4 walks `src/` recursively and requires exactly the seven files `data.ts`, `index.ts`, `lockdown.ts`, `mcp.ts`, `scope.ts`, `server.ts` and `tools.ts` (no subdirectory, no other file). It scans each file except `scope.ts` and `lockdown.ts` on Bun.Transpiler output, so comments do not count:

- The only specifiers allowed are `@modelcontextprotocol/server`, `@modelcontextprotocol/server/stdio`, `node:path` and `node:crypto`. A relative specifier must be `./<name>` (optionally `.ts`) naming one of the seven files, so there is no `..`, no subdirectory and no other extension. `node:fs` is allowed in `data.ts` only, as named imports drawn from the six read functions. A dynamic `import(` must take a literal relative specifier that meets the same rule.
- `Bun` appears only as `Bun.YAML.parse(`, and `process` only as `process.argv`, `process.stderr.write(` and `process.exit(`.
- These never appear: `require`, `globalThis`, `self`, `global`, `window`, `Reflect`, `Worker`, `fetch`, `WebSocket`, `eval`, `Function`, `getBuiltinModule`, `import.meta.require`, or a computed member built from string pieces (`x["a" + "b"]`). `constructor` appears only as a class constructor declaration.

It is tested against evasion probes, each of which it must flag:

- `Bun["spawn"]`, `const B = Bun`, `globalThis.Bun.write`, `self["B" + "un"]`, `self["pro" + "cess"].binding`, `self.Bun`, `window.Bun` and `global.x`;
- `require("child_process")`, `import("node:child_process")`, `import.meta.require(...)`, and a default or namespace import;
- `writeFileSync` from `node:fs`, and `node:fs` outside `data.ts`;
- `process.getBuiltinModule`, `process["binding"]`, `eval`, `new Function` and `(() => {}).constructor(...)`, directly or through computed pieces;
- `Reflect.get`, `new Worker`, `fetch` and `new WebSocket`;
- `import("../../../package.json")`, `../package.json`, `./sub/x`, `./nope` and `./data.js`.

The guard is lexical, so it is a tripwire for code review, not a proof. The lockdown is what holds at runtime.

### What the tests prove

- **XT-boost-4** checks:
  - the tool list: exactly six tools, each `readOnlyHint: true`, `destructiveHint: false` and `openWorldHint: false`, with tools as the only capability;
  - the static guard;
  - the entry order.
- **XT-boost-5** checks:
  - `dataPath`'s lexical and real-path refusals;
  - the tools over symlink fixtures: each comes back `refused:`.
  - a locked-down subprocess:
    - every write, write-flag read, stream, spawn, worker, `fetch`, `WebSocket`, `Bun.Glob`, `Bun.build`, `bun:sqlite` and `bun:ffi` call is refused;
    - so is every out-of-scope read, stat and realpath, and a second `lockdown`;
    - no file is created and the in-scope file is unchanged.
  - a `--preload` recorder. Before lockdown it turns every function export that lockdown replaces (on the `node:fs`, `node:fs/promises`, `node:child_process`, `node:worker_threads`, `bun:sqlite` and `bun:ffi` modules, and the three globals) into an accessor. The getter logs each call that reaches an original. The setter wraps lockdown's replacement in a logger of each call that throws. So both allowed calls and refusals are recorded. It shows that:
    - a full tool run on a clean fixture makes no call other than the six reads, and every open is inside the three directories;
    - that run hits no refusal, apart from the recorder's own canary write, which proves the process is already locked down at the first tool call;
    - on the symlink fixture, nothing reaches lockdown, so the `refused:` errors come from `dataPath`.

    `Bun`'s members are not configurable, so refusals of `Bun.*` are not observable this way; the static guard keeps `Bun` out of `src/` except `Bun.YAML.parse`.
  - `callTool` reports a `ReadOnlyError` as `refused: ...`, never as `internal error:`.
- **XT-boost-6** calls every tool, with valid, invalid and refused arguments, and checks two things:
  - a git fixture is byte-for-byte unchanged: every path's kind, mode, size, mtime, and content or link target, `.git/` included except `.git/index`;
  - the real repository's `git status`, `HEAD`, refs, stash list and data directories are unchanged.

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
- Lockdown is defence in depth inside one Bun process, not a sandbox. It leaves these open:
  - the network modules: `node:net`, `node:http`, `node:https`, `node:http2`, `node:dgram`, `node:tls` and `node:dns`. No tool uses them, and the static guard rejects their specifiers in `src/`;
  - `process.binding` and `process.dlopen` (native addons);
  - a time-of-check to time-of-use window: a symlink swapped between `inScope` and the read it guards is followed;
  - an in-process `createServer` (outside `src/server.ts`), which is not locked down and relies on `dataPath` alone;
  - an in-process `main()`, which locks down the process that calls it (a test runner included), for good.
- Module loading reads the server's own code and the SDK outside the data scope; it is native and goes through no `fs` export.
