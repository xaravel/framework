---
title: 'Story 7.4: Framework mode is read-only'
type: 'feature'
created: '2026-10-19'
baseline_revision: '57164bbcd546ba1704faf9fa7e9a06f5bacf18ac'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-3-boost-framework-mode-mcp-server.md'
  - '{project-root}/stories/7.4.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 7.3's server reads only through `dataPath`, but that check is lexical. It follows symlinks out of the data scope, and nothing stops the process itself from writing files or spawning commands. FR-109 asks that framework mode can never become a path around the guardrails.

**Approach:** Harden `dataPath` with a real-path check. Lock down the server process before its data layer loads, so every write, spawn and out-of-scope read throws. Prove all three ACs in XT-boost-4..6, over stdio and in a locked-down subprocess.

## Boundaries & Constraints

**Always:**
- **Scope rule (`src/scope.ts`, new).** `inScope(root, abs)` holds when `abs` is an absolute string path, and its real path lies inside, or equals, `realpath(root)/<d>` for some `d` in `DATA_DIRS`. The real path of a path that does not exist is the real path of its nearest existing ancestor, plus the remaining segments. A dangling symlink, a non-string, or a relative path is out of scope. `scope.ts` takes `realpathSync`/`lstatSync` through `process.getBuiltinModule("node:fs")` when it is evaluated, before any lockdown, and never ESM-imports `node:fs`. `DATA_DIRS` moves here; `data.ts` re-exports it.
- **`dataPath`.** It keeps its lexical checks, then also requires `inScope`. Otherwise it throws `DataScopeError`, with the same message shape.
- **Lockdown (`src/lockdown.ts`, new).** `lockdown(root)` gets `node:fs`, `node:fs/promises` and `node:child_process` through `process.getBuiltinModule`, and replaces exports on the live module objects:
  - On `node:fs` and its `promises`: `readFileSync`, `readdirSync`, `statSync`, `lstatSync`, `existsSync` and `realpathSync` (and `realpathSync.native`) are wrapped. A wrapper throws `DataScopeError` unless `inScope(root, firstArg)` holds, then calls the original. Every other function export whose name starts with a lowercase letter throws `ReadOnlyError: refused: <module>.<name> (framework mode is read-only)`. That includes async reads, `openSync`, `opendirSync`, streams, `watch` and every write.
  - Every function export of `node:child_process` refuses.
  - `Bun.spawn`, `spawnSync`, `$`, `write`, `file`, `mmap` and `openInEditor` refuse.
  - It runs once; a second call throws.
- **Entry order.** `server.ts` is the `.mcp.json` entry. Its static imports are only `./lockdown` (and through it `./scope`) and `node:path`. Its `--root` check uses `process.getBuiltinModule("node:fs")`. `main()` parses the args, calls `lockdown(root)`, then `await import("./mcp")` and connects. `createServer`, `callTool`, `TOOL_ANNOTATIONS`, `SERVER_NAME` and `SERVER_VERSION` move to `src/mcp.ts`. `index.ts` re-exports the same names as before, plus `lockdown`, `ReadOnlyError` and `inScope`. Reason: Bun binds `node:fs` named imports when the module graph links, so a later patch does not reach them (verified by probe).
- **Static guard (XT-boost-4).** A scanner over every `src/*.ts` file except `scope.ts` and `lockdown.ts` runs on Bun.Transpiler output, so comments are stripped. Its rules:
  - Specifiers are only `@modelcontextprotocol/server`, `@modelcontextprotocol/server/stdio`, `node:path`, `node:crypto`, relative paths, and `node:fs` in `data.ts` only.
  - `node:fs` is imported as named imports only, drawn from the six read functions.
  - `Bun` appears only as `Bun.YAML.parse(`. `process` appears only as `process.argv`, `process.stderr.write(` and `process.exit(`.
  - `require`, `globalThis`, `eval`, `Function`, `getBuiltinModule`, `import.meta.require` and a non-relative `import(` never appear.
  - The scanner must flag each evasion probe: `Bun["spawn"]`, an alias `const B = Bun`, `globalThis.Bun.write`, `require("child_process")`, `import("node:child_process")`, `import cp from "child_process"`, `import { writeFileSync } from "node:fs"`, `import * as fs from "node:fs"`, `process.getBuiltinModule(...)`, `process["binding"]`, `eval(...)`, `new Function(...)` and `import.meta.require(...)`.
- XT-boost-1..3 keep passing unchanged. `.mcp.json` is unchanged.

**Never:**
- Edit `.mcp.json`, `conformance/protected-paths`, `tools/scaffold/`, the generated `tsconfig.json`, `AGENTS.md`, `.claude/`, any Inventory or Expectations data, or XT-boost-1..3's assertions. Never add a dependency.
- Make tools depend on lockdown: `createServer` used in-process (tests) still relies on `dataPath`.
- Hash or stat `.git/index` or atimes in the snapshot. `git status` itself rewrites the index.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| tool list | initialize + tools/list | exactly the 6 names, each `readOnlyHint: true, destructiveHint: false, openWorldHint: false`; capabilities offer tools only | — |
| static guard | real `src/` | clean | each evasion probe flagged |
| dataPath lexical | `../x`, `/etc/hosts`, `conformance/../AGENTS.md`, `tools/x`, `conformance-x/a`, `a\0b`, `.` | — | `DataScopeError` |
| dataPath symlink | `stories/9.8.md` → outside file; `conformance/escalations` → outside dir; `conformance/inventory/z.jsonl` → `<root>/tools/x`; `decisions/DIV-7.md` dangling | — | `DataScopeError` |
| in-scope symlink | `stories/9.7.md` → `<root>/conformance/m.md` | allowed | — |
| tools over symlinks | `story.tests 9.8`, `divergence.get DIV-7`, `escalations.open`, `inventory.get` on the symlink fixtures | — | `isError`, text starts `refused:` |
| lockdown probe | subprocess: `lockdown(fix)`, then write/append/mkdir/rm/rename/copy/symlink/open/createWriteStream/fs.promises.writeFile/fs.writeFile/child_process/Bun.spawn/$/write/file, a dynamic `import("node:fs")` write, a read of `<fix>/AGENTS.md`, `/etc/hosts`, a relative path, fd 0, an outside symlink | each refused (`ReadOnlyError` or `DataScopeError`), no file created | in-scope `readFileSync` succeeds |
| opened paths | server with a test `--preload` recorder, every tool called | every recorded open is `readFileSync`/`readdirSync` on a path inside `<fix>/{conformance,stories,decisions}` | — |
| worktree unchanged (fixture) | git-repo fixture (commit + one modified + one untracked file), server cwd = fixture, every tool with valid, invalid and refused args | snapshot (path, kind, mode, size, mtimeMs, sha256 or link target; `.git/` included) equal before and after | — |
| worktree unchanged (real repo) | default root, every tool | `git status --porcelain -uall`, `HEAD`, `for-each-ref`, `stash list` and a stat snapshot of the three dirs are equal | — |
| lockdown twice | `lockdown` called again | — | throws |

</intent-contract>

## Code Map

- `tools/boost-framework/src/data.ts:24-76` -- `DATA_DIRS`, `DataScopeError`, `dataPath` (lexical), and readers that all go through it. It imports `existsSync, readdirSync, readFileSync, statSync` from `node:fs`.
- `tools/boost-framework/src/server.ts` -- the entry point today. It statically imports the SDK, `./tools` and `./data` (and so `node:fs`), with `parseArgs`/`main` at l.71-111. Split it into `mcp.ts` and a lockdown-first `server.ts`.
- `tools/boost-framework/src/index.ts:2,22` -- re-exports `callTool, createServer, DEFAULT_ROOT, main, SERVER_NAME, TOOL_ANNOTATIONS` and `DATA_DIRS, DataError, dataPath, DataScopeError`.
- `tools/boost-framework/src/tools.ts:51-58,328,405,494` -- the Story/DIV/ESC ids are regex-validated before any path is built, so a traversal argument never reaches `dataPath`. Refusal comes only from symlinks.
- `conformance/tests/xaravel/boost-framework.test.ts` -- `StdioClient`, `withServer`, `errorText`, `fixture()`, `tempDir` (realpath'd) and `TOOL_NAMES`. XT-boost-1's import guard (l.318-335) accepts `node:*` and relative imports, including a literal dynamic `import("./mcp")`. Add XT-boost-4..6 here, reusing these helpers.
- SDK 2.3.1 imports no `fs` or `child_process` (checked), so a whitelist lockdown does not break it.
- Bun probes (1.4.3): `process.getBuiltinModule` returns the live module object, `fs.promises === node:fs/promises`, and `Bun.spawn` and the others are writable. A patch reaches ESM named imports only if it runs before the importing graph links. A static `import "./lock"` placed first does not help; a dynamic import after the patch does.
- `tools/escalations/escalations.ts:24-70` -- an Escalation may cite the manifest's `xaravel_test_ids`. Triggers include `protected-path`.

## Tasks & Acceptance

**Execution:**
- `tools/boost-framework/src/scope.ts` -- create it: `DATA_DIRS`, `inScope`, and the captured originals.
- `tools/boost-framework/src/data.ts` -- re-export `DATA_DIRS`, and add the `inScope` check to `dataPath`.
- `tools/boost-framework/src/lockdown.ts` -- create it: `ReadOnlyError` and `lockdown(root)`, as the contract says.
- `tools/boost-framework/src/mcp.ts` -- create it, holding the server half moved out of `server.ts`.
- `tools/boost-framework/src/server.ts` -- make it the lockdown-first entry: `DEFAULT_ROOT`, `parseArgs`, `main`.
- `tools/boost-framework/src/index.ts` -- re-export the same names, plus the new ones.
- `conformance/tests/xaravel/boost-framework.test.ts` -- add XT-boost-4 (tool list and the static guard with its evasion probes), XT-boost-5 (dataPath, symlinks over stdio, the lockdown probe, the preload recorder) and XT-boost-6 (the fixture and real-repo snapshots). Every matrix row is covered. Update the header comment.
- `tools/boost-framework/docs/framework-mode.md`, `README.md` -- document the lockdown, the real-path scope, the entry order and the limits: network is not blocked, `process.binding`/`dlopen` are not blocked, there is a TOCTOU window on a symlink swap, and an in-process `createServer` is not locked down.
- `conformance/escalations/ESC-7.4-1.md` -- raise it (trigger `protected-path`, `test_ids: [XT-boost-3]`): `.mcp.json` is not a Protected Path, so any Story could repoint framework mode. Proposed: add `/.mcp.json` to AD-16's list and to `conformance/protected-paths`. This was 7.3's untargeted deferral; a spine edit is the Maintainer's.

**Acceptance Criteria:**
- Given the server's tool list, when it is inspected, then no tool writes files, runs commands or changes git state (XT-boost-4).
- Given the server process, when it opens files, then it opens only paths under `conformance/`, `stories/` and `decisions/`, read-only, and attempts outside those paths are refused (XT-boost-5).
- Given a test that calls every tool, when it compares the worktree before and after, then nothing has changed (XT-boost-6).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 35 findings — high 0, medium 13, low 18, false 4, maybe-false 0, plus 8 descriptive intent-alignment rows (no defect claimed)
- findings:
  - **Blind layer**
    - `[medium]` `[patch]` `readFileSync(path, {flag: "w"})` passes the scoped wrapper and truncates a file in the data dirs. The wrapper now refuses any non-`r` flag, and a probe asserts the file is unchanged.
    - `[medium]` `[patch]` Workers escape the lockdown (fresh realm). Grouped with the edge-case runtime-escape rows: `Worker`, `worker_threads`, `fetch`, `WebSocket` and more `Bun` members are now refused, with probes.
    - `[medium]` `[patch]` Other open routes (`bun:sqlite`, `Bun.build`, `Bun.Glob`, `v8.writeHeapSnapshot`, `process.chdir`) were not refused and not documented. Same group: refused where a patch reaches them, otherwise documented as limits.
    - `[medium]` `[patch]` The docs claimed the guard keeps `fetch`/`node:net` out of `src/`, but no rule matched `fetch`. The guard now bans the identifier, and the docs were corrected.
    - `[medium]` `[patch]` Guard bypass through `self`, `global`, `.constructor(` and `Reflect`. The identifiers are now banned, with evasion probes.
    - `[low]` `[patch]` The claim about the `WriteStream`/`ReadStream` classes was untested. Probes added; the classes are refused if they open files.
    - `[low]` `[patch]` `statSync`, `lstatSync`, `realpathSync`, async-read, bare `fs` and `import.meta.require` probes were missing. Added.
    - `[medium]` `[patch]` The recorder cannot see refused calls. Accessor-trap logging now records refusals, and a clean run asserts zero.
    - `[low]` `[reject]` The spec cites `XT-boost-3` and the Escalation `XT-boost-4`. The Escalation is right: `escalations pr` accepts only this Story's manifest ids. The fix would be a spec edit.
    - `[low]` `[reject]` The spec says `server.ts` uses `getBuiltinModule` and `scope.ts` captures two functions. The code moved the `--root` check into `scope.ts` (`isDirectory`) because the spec's own guard bans `getBuiltinModule` in `server.ts`. The fix would be a spec edit.
    - `[low]` `[patch]` `createServer` lost its default root. The default is restored, computed in `mcp.ts`.
    - `[low]` `[patch]` Half-locked on a partial failure. `locked` is now set only after every patch succeeds.
    - `[low]` `[patch]` The real-repo inventory lookup was brittle. It now uses `readWorkingInventory`.
  - **Edge-case layer**
    - `[medium]` `[patch]` A Worker write after lockdown (probed). Same group as the blind Worker row.
    - `[medium]` `[patch]` `fetch("file:///etc/hosts")` reads out of scope (probed). Same group; `fetch` is refused.
    - `[medium]` `[patch]` `bun:sqlite`, `Bun.build` and `Bun.s3` create files. Same group.
    - `[low]` `[patch]` `Bun.Glob` scans `/etc`. Same group.
    - `[medium]` `[patch]` The guard does not ban `Worker`, `fetch` or `WebSocket`. Same group as the guard-bypass row.
    - `[low]` `[patch]` Only top-level `*.ts` files are scanned. A recursive walk now asserts the exact entry list.
    - `[low]` `[reject]` `scope.ts` and `lockdown.ts` are exempt from the guard. They are the guard itself; XT-boost-5's subprocess probe tests their behaviour, and a static allowlist for them would add a second rule set.
    - `[low]` `[patch]` A relative import of a non-module file (`../../../package.json`) is a native read. Relative specifiers must now be `./<scanned file>`.
    - `[false]` `[reject]` One bad symlink fails the whole listing. Refusing loudly is the intended behaviour (matrix row "tools over symlinks"), the same fail-closed stance as 7.3.
    - `[low]` `[reject]` An in-process `main()` locks the caller. No caller does this; the docs now say so.
    - `[false]` `[reject]` `main` rejects with no diagnostic. A rejection at top-level await is printed by Bun with a non-zero exit, so the failure is loud.
    - `[low]` `[patch]` Half-locked. Same as the blind row.
    - `[low]` `[patch]` The recorder misses `Bun`/`fetch`/`Worker`. Same group as the recorder row: the accessor traps cover every member lockdown replaces.
    - `[low]` `[patch]` `createServer` default. Same as the blind row.
    - `[false]` `[reject]` The Escalation cites the wrong Test ID. `XT-boost-3` is not in 7.4's manifest, so `escalations pr` would reject it; `XT-boost-4` is correct.
    - `[medium]` `[patch]` The guarantee has escapes beyond the documented limits. Same group as the runtime-escape rows.
    - `[low]` `[patch]` The limits list was incomplete. The docs were updated after the fixes.
  - **Verification-gap layer**
    - `[medium]` `[patch]` Guard bypass through `self`. Same group as the blind guard row.
    - `[medium]` `[patch]` The recorder cannot see refusals. Same group as the blind recorder row.
    - `[low]` `[patch]` `callTool` with a `ReadOnlyError` is untested. An in-process assertion was added.
    - `[false]` `[reject]` (other) The Escalation and spec mismatch. Same refutation as above.
    - `[low]` `[patch]` (other) `mcp.ts` claims tests use `createServer` in-process. The comment was corrected, and the default was restored.
  - **Intent-alignment layer** (descriptive; no route needed)
    - R1+R2 implemented, R3 (OS sandbox) declined and documented, R4 (registration) raised as ESC-7.4-1.
    - AC1's behavioural claim rests on the static guard plus the declared hints. Accepted: the tool list's hints and the code backing them are the inspectable surface, and the guard was hardened above.
    - AC2's evidence is on the JS `fs` surface; native module loading is outside it (Design Notes).
    - The recorder's independence is addressed by the recorder patch.
    - AC3's real-repo comparison is git-status + stat level; the fixture comparison is full. Accepted: hashing 121 MB on every run adds cost for no added signal beyond mtime and size.
    - The ESC id mismatch has the same refutation as above.
    - The Story edit boundary versus `tools/**` and `conformance/tests/**`: approved for Phase 0 Stories by the MAINT ruling (second amendment).
    - Lockdown covers only the `.mcp.json` entry. Documented.

## Design Notes

"Opens" means `readFileSync`/`readdirSync`, the only opening calls lockdown lets through. `stat`, `lstat`, `exists` and `realpath` are still scope-checked. The process necessarily loads its own code and the SDK. Module loading is native and goes through no `fs` export, so it is outside the AC's runtime file access, and the docs say so. Lockdown is a whitelist: a new or unknown `fs` function refuses by default.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-boost-*'` -- expected: 6 pass.
- `bun run typecheck && bun run lint && bun run graph:check && bun run scaffold:check && bun run escalations:check && bun run ownership:check` -- expected: clean.
- `bun run harness --xaravel` -- expected: no differences.

## Auto Run Result

Status: done

**Summary.** Framework mode is now read-only at three levels:
- **Real paths.** `dataPath` checks containment on real paths (`inScope`, `src/scope.ts`), so symlinks cannot lead a read out of `conformance/`, `stories/` or `decisions/`.
- **Process lockdown.** The `.mcp.json` entry point (`src/server.ts`) locks the process down before it loads the data layer (`src/lockdown.ts`):
  - every `fs` function except six scope-checked reads refuses, and so does a read carrying a write flag;
  - every function in `child_process`, `worker_threads`, `bun:sqlite` and `bun:ffi` refuses (corrected by retro 7 item 1: `node:sqlite` was left open and now refuses too);
  - so do `Worker`, `fetch` and `WebSocket`, and the `Bun` members `spawn`, `spawnSync`, `$`, `write`, `file`, `mmap`, `openInEditor`, `build`, `Glob`, `s3`, `S3Client`, `sql`, `SQL`, `connect`, `listen`, `serve` and `udpSocket`. (Corrected by retro 7 item 1: this listed fixed set left other `Bun` members, `node:sqlite` and data imports open; the lockdown now treats `Bun` as an allowlist, and docs/framework-mode.md § Limits lists what stays open, among them `Bun.fetch` reading `file:` URLs and text imports of extensionless files.)
- **Tests.** XT-boost-4..6 prove the three ACs:
  - XT-boost-4: the tool list, plus a lexical guard with evasion probes;
  - XT-boost-5: `dataPath` refusals, symlink refusals over stdio, a 54-case lockdown probe (corrected by retro 7 item 1: now 78 cases), and a preload recorder that sees both opens and refusals;
  - XT-boost-6: a full snapshot of a git fixture, and a git-and-stat snapshot of the real repo.

ESC-7.4-1 asks the Maintainer to make `.mcp.json` a Protected Path, which was Story 7.3's deferral that no Story owned.

**Files.**
- `tools/boost-framework/src/scope.ts` (new): `DATA_DIRS`, `DataScopeError`, `inScope`, `isDirectory`, and the captured original `fs` functions.
- `tools/boost-framework/src/lockdown.ts` (new): `lockdown(root)` and `ReadOnlyError`.
- `tools/boost-framework/src/mcp.ts` (new): `createServer`, `callTool`, the constants and `connectStdio`, moved out of `server.ts`.
- `tools/boost-framework/src/server.ts`: the lockdown-first entry point.
- `src/data.ts`: the `inScope` check.
- `src/index.ts`: the re-exports.
- `conformance/tests/xaravel/boost-framework.test.ts`: XT-boost-4..6.
- `tools/boost-framework/docs/framework-mode.md`, `README.md`: the lockdown, the guard and the limits.
- `conformance/escalations/ESC-7.4-1.md`: `.mcp.json` protection.

**Spec deviations, all justified in the triage log:**
- The `--root` check lives in `scope.ts` (`isDirectory`), because the guard bans `getBuiltinModule` in `server.ts`.
- `lockdown` builds the stdio streams before it patches anything. Bun creates them lazily through `Bun.file`.
- ESC-7.4-1 cites `XT-boost-4`. `escalations pr` accepts only this Story's manifest ids.
- Lockdown refuses more than the spec listed (the runtime escapes found in review).

**Review.** 35 findings: 13 medium, 18 low and 4 false, plus 8 descriptive intent-alignment rows.
- 25 rows patched, in 11 fix groups, 5 of them medium.
- 0 deferred.
- Rejected, each with its reason in the triage log:
  - the spec/Escalation id mismatch, twice (the Escalation is right);
  - the spec/code `--root` wording (the fix is a spec edit);
  - the guard files being exempt from the guard (behaviour is probed instead);
  - the one-bad-symlink listing (it fails closed by design);
  - an in-process `main()` (documented);
  - the `main` rejection (it is loud).

**Follow-up review recommended: true.** Five medium entries were patched: the write flag, the runtime escapes, the guard bypasses, the recorder's blindness, and the docs. The reworked accessor-trap recorder and the 21 new probe cases have not been read by a fresh review layer.

**Verification.**
- `typecheck`, `lint`, `graph:check`, `scaffold:check`, `escalations:check` (31 valid) and `ownership:check`: clean.
- `bun run harness --xaravel --id 'XT-boost-*'`: 6/6.
- `bun run harness --xaravel`: 264/264, differ 0.

**Residual risks.**
- Lockdown is defence in depth inside one Bun process, not an OS sandbox. These stay open, and are documented:
  - the network modules;
  - `process.binding`;
  - the window between a symlink check and its read;
  - an in-process `createServer` or `main()`.
- The recorder cannot see refusals of `Bun.*` (those members are non-configurable).
- The static guard is a lexical tripwire.
- ESC-7.4-1 waits on the Maintainer.
