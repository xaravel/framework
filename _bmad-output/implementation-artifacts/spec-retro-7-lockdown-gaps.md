---
title: 'Retro 7 item 1: close the framework-mode lockdown gaps'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: '84c3e534ad25503595e7b431523c133f85dc5a43'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/tools/boost-framework/docs/framework-mode.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-retro-2026-10-19.md'
warnings: []
deferred:
  - summary: >-
      Bun.fetch (file: reads, network) and Bun.WebView stay open after lockdown.
    evidence: |-
      Bun 1.4.3 makes Bun.fetch, Bun.WebView and globalThis.Bun non-writable and non-configurable, so no in-process patch can replace them. Pinned by the `open Bun.fetch file://` probe in XT-boost-5; the retro already asks the Maintainer whether to move to an OS sandbox.
    location: >-
      tools/boost-framework/src/lockdown.ts BUN_OPEN
    severity: medium
  - summary: >-
      Text imports of extensionless files (import("/etc/hosts", {with: {type: "text"}})) still read out-of-scope files.
    evidence: |-
      Bun's runtime plugin onResolve/onLoad never see extensionless specifiers (probed). Pinned by the `open text import /etc/hosts` probe; listed in docs/framework-mode.md § Limits.
    location: >-
      tools/boost-framework/docs/framework-mode.md § Limits
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `lockdown(root)` refuses a fixed list of `Bun` members, so after lockdown `Bun.Archive.write` writes a tar, `new Bun.FileSystemRouter({dir})` lists out-of-scope directories, `node:sqlite`'s `DatabaseSync` creates a file, `import(<file>, {with: {type: "text"}})` and `require(<root>/package.json)` read out-of-scope files, and `Bun.secrets`, `Bun.redis`, `Bun.Terminal` and `Bun.WebView` stay untouched (finding L1, action item 1). `spec-7-4:171` and `docs/framework-mode.md` § Limits claim more than holds.

**Approach:** Turn `Bun` into an allowlist: every writable member not on a named keep list (`YAML` and the other pure parsers, the hashers, pure helpers, the stdio file refs and plain values) refuses, a function by a refusing stand-in and an object (`redis`, `s3`, `secrets`, `FFI`, ...) by a proxy whose every property read throws `ReadOnlyError`. Members Bun makes non-writable and non-configurable (`fetch`, `WebView`, `dns`, `plugin`, ...) cannot be replaced: lockdown names them in a known-open list, throws if a non-writable member is on neither list (a Bun upgrade fails loudly), and the docs list them as open. Refuse every function of `node:sqlite`. Register a runtime `Bun.plugin` whose `onResolve` refuses, with `DataScopeError`, a module specifier with a non-code extension whose path lies outside the data scope.

## Boundaries & Constraints

**Always:** Keep the server working: XT-boost-1..6 and every Xaravel Test stay green. `lockdown.ts`'s static specifiers stay `./scope` only and `scope.ts`'s stay `node:path` only (XT-boost-4). Every remaining gap is listed in `docs/framework-mode.md` § Limits: the non-writable `Bun` members, text imports of extensionless files and of code-extension files (Bun's plugin hooks do not see them, and they carry no import-attribute type), and the existing items. Every new probe goes into XT-boost-5's `PROBE` with its expected outcome, and the case count assertion moves with it.

**Never:** Remove or weaken an existing XT-boost assertion. Never touch `packages/**`, `conformance/expectations/**`, `AGENTS.md`, the PRD, spine, SPEC or `epics.md`. Never edit `conformance/protected-paths`, `tools/protected-paths/` or `tools/ownership/`. No OS sandbox (an open question for the Maintainer, retro § open questions).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Archive | `Bun.Archive.write(...)` after lockdown | throws, nothing written | `ReadOnlyError` |
| Router | `new Bun.FileSystemRouter({dir: <root>/tools})` | throws | `ReadOnlyError` |
| Object member | `Bun.secrets.get(...)`, `Bun.redis.get`, `Bun.s3.file` | throws on the property read | `ReadOnlyError` |
| Classes | `new Bun.RedisClient()`, `new Bun.Terminal()` | throws | `ReadOnlyError` |
| node:sqlite | `new DatabaseSync(<scope>/x.db)` via `getBuiltinModule` or `import` | throws, no file | `ReadOnlyError` |
| Text import out of scope | `import(<fix>/AGENTS.md, {with: {type: "text"}})` | rejects | `DataScopeError` |
| require data out of scope | `require(<outside>/data.json)` | throws | `DataScopeError` |
| In-scope data import | `import(<fix>/stories/9.9.md, {with: {type: "text"}})` | reads | No error expected |
| Kept member | `Bun.YAML.parse("a: 1")`, `new Bun.CryptoHasher("sha256")` | work | No error expected |
| Unknown non-writable member | a Bun build adds one | `lockdown` throws naming it | `Error` |

</intent-contract>

## Code Map

- `tools/boost-framework/src/lockdown.ts:49` -- `BUN_REFUSED` fixed list → replace by `BUN_KEPT` allowlist plus `BUN_OPEN` (non-writable members, documented); `:136` the Bun loop. Header comment (l.1-31) lists what refuses; update it.
- `tools/boost-framework/src/lockdown.ts:117-127` -- module loop over `child_process`, `worker_threads`, `bun:sqlite`, `bun:ffi`; add `node:sqlite` (probe: patching `getBuiltinModule("node:sqlite")` reaches `import("node:sqlite")` and its `default`).
- `tools/boost-framework/src/scope.ts` -- `inScope`; add a helper turning a module specifier plus importer into an absolute candidate path (relative, absolute, `file:` URL), using only `node:path`.
- `conformance/tests/xaravel/boost-framework.test.ts:803-883` -- `PROBE` ops; `:1032-1041` expected outcomes, case count (54), created-file list. `:740` guard skips `lockdown.ts`/`scope.ts`.
- `tools/boost-framework/docs/framework-mode.md:150-173,201-207` -- lockdown description and § Limits.
- `_bmad-output/implementation-artifacts/spec-7-4-framework-mode-is-read-only.md:171` -- the over-claim.
- Probes (Bun 1.4.3): `globalThis.Bun` is non-writable and non-configurable; `Bun.fetch`, `WebView`, `dns`, `plugin`, `env`, `Cookie`, `CookieMap`, `JSONL`, `ModuleGraph`, `semver` and the version strings are non-writable; the rest are writable. `Bun.plugin` `onResolve` sees relative and absolute specifiers with an extension, never extensionless ones; `args.with` is not passed.

## Tasks & Acceptance

**Execution:**
- `tools/boost-framework/src/scope.ts` -- add `modulePath(specifier, importer)` -- the plugin's candidate path.
- `tools/boost-framework/src/lockdown.ts` -- Bun allowlist with refusing proxies for objects, the known-open check, `node:sqlite`, the resolve plugin -- closes L1.
- `conformance/tests/xaravel/boost-framework.test.ts` -- add probes: `Bun.Archive.write`, `Bun.FileSystemRouter`, `Bun.secrets.get`, `Bun.redis.get`, `new Bun.RedisClient`, `new Bun.Terminal`, `Bun.s3.file`, `Bun.which`, `node:sqlite DatabaseSync` (both routes), out-of-scope text import, out-of-scope `require` of JSON, in-scope text import, kept `Bun.YAML.parse` and `Bun.CryptoHasher`; assert `Object.keys(results).length` and created files.
- `tools/boost-framework/docs/framework-mode.md` -- describe the allowlist and the resolve hook; list what stays open.
- `_bmad-output/implementation-artifacts/spec-7-4-framework-mode-is-read-only.md` -- correct l.171.

**Acceptance Criteria:**
- Given the locked-down probe subprocess, when it runs each new probe, then every refused case reports its expected error name, the in-scope and kept cases succeed, and no file the probes name is created.
- Given the real server, when XT-boost-1..6 run, then they pass unchanged apart from the extended probe list.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 27 findings — high 3, medium 7, low 9, false 4, maybe-false 4
- findings:
  - `[medium]` `[patch]` (verification-gap) the resolve hook is tested only with absolute specifiers — added probes for root `package.json`, a `file://` URL, a relative import and an in-scope `require` of JSON.
  - `[medium]` `[patch]` (verification-gap) "throws before it patches anything" was not checked — `unknown.ts` now asserts `node:fs.writeFileSync` and `Bun.spawnSync` are still the originals.
  - `[low]` `[patch]` (verification-gap) `require(<root>/package.json)` claimed in the docs but untested — covered by the new probe.
  - `[medium]` `[defer]` (intent-alignment) `Bun.fetch` and `Bun.WebView` stay open though the intent names them — Bun 1.4.3 makes both non-writable and non-configurable, and `globalThis.Bun` too, so no in-process patch can refuse them. The intent's own route ("list whatever stays open") applies. Now pinned by an `open` probe, and left to the Maintainer's OS-sandbox open question (retro § open questions).
  - `[medium]` `[defer]` (intent-alignment) L1's extensionless `import("/etc/hosts", {with: {type: "text"}})` still reads — Bun's plugin hooks never see extensionless specifiers; documented and pinned by an `open` probe.
  - `[low]` `[patch]` (intent-alignment) the `require` probe tested a path outside the root, not `<root>/package.json` — probe added.
  - `[low]` `[patch]` (intent-alignment) no probe recorded the documented-open behaviour — two `open` probes added.
  - `[low]` `[patch]` (intent-alignment) the preload recorder does not observe the new refusals — docs narrowed to the modules it observes.
  - `[false]` `[reject]` (intent-alignment) spec-7-4:171 now describes the pre-fix state — that is the correction asked for; it records what was claimed and points to the fix.
  - `[false]` `[reject]` (intent-alignment) constraints respected — not a defect.
  - `[high]` `[patch]` (edge-case) `AGENTS.md?x.ts` bypassed the hook — the hook strips `?…`/`#…` first; probe added.
  - `[high]` `[patch]` (edge-case, blind) a dotfile (`.env`) counted as extensionless — `extensionOf` uses `dot >= 0`; probe added.
  - `[medium]` `[patch]` (edge-case, blind) a failed `resolveSync` failed open — now throws `DataScopeError`.
  - `[low]` `[reject]` (edge-case) `getBuiltinModule("node:sqlite")` undefined on another Bun build — Bun is pinned at 1.4.3 (`.bun-version`), which has it; a missing module throws loudly rather than opening anything.
  - `[medium]` `[patch]` (edge-case) § Limits omitted query and dotfile bypasses — both now closed, so the claim holds.
  - `[high]` `[patch]` (edge-case) the data-import guarantee was bypassable — same root cause as the two rows above; fixed there.
  - `[medium]` `[patch]` (blind) `Bun.plugin.clearAll()` removes the hook — `clearAll` is writable (probe), now refuses; a later `Bun.plugin(...)` that redirects is listed in § Limits; probe added.
  - `[low]` `[reject]` (blind) `bunMembersToRefuse` ignores `configurable` — every member on Bun 1.4.3 is non-configurable (probe), so the branch never differs; fails closed either way.
  - `[low]` `[patch]` (blind) untested bare/file:/relative/in-scope require paths — covered by the probes above.
  - `[low]` `[patch]` (blind) recorder claim — fixed with the docs row above.
  - `[maybe-false]` `[reject]` (blind) unknown-member test does not check ordering — duplicate of the verification-gap row; patched there.
  - `[low]` `[patch]` (blind) spec-7-4 neighbouring bullet omits `node:sqlite` and says 54 cases — corrected in place.
  - `[maybe-false]` `[defer]` (blind) the open gaps are only documented, not escalated — the intent routes leftovers to § Limits; recorded for the Maintainer on the status issue with the OS-sandbox question.
  - `[false]` `[reject]` (blind) the spec contradicts itself — fix would edit this build's spec.
  - `[maybe-false]` `[reject]` (blind) nothing keeps the allowlists honest — a non-writable member off both lists already throws; a kept member gaining IO is speculative (would be low).
  - `[maybe-false]` `[reject]` (blind) the refusing proxy throws on `then`/inspect symbols — nothing in the server inspects or awaits `Bun` members; would be low.
  - `[false]` `[reject]` (blind) `file:` URLs decoded by hand differ from Bun — a `%2F` or host form only yields a path that is scope-checked after normalisation, so it fails closed, never open.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/boost-framework.test.ts` -- expected: all pass.
- `bun run harness --xaravel` -- expected: no differences.
- `bun run typecheck` and `bun run lint` -- expected: clean.

## Auto Run Result

Status: done

**Summary.** Framework-mode lockdown now treats `Bun` as an allowlist (writable members off `BUN_KEPT` refuse; objects become proxies that throw on any access), refuses `node:sqlite`, and registers a resolve hook that refuses out-of-scope data-extension specifiers (query/fragment stripped, dotfiles included, failed bare resolution refused) and refuses `Bun.plugin.clearAll`. Members Bun makes non-writable (`fetch`, `WebView`, `dns`, `plugin`, ...) are a known-open list; an unknown one makes lockdown throw before patching.

**Files.**
- `tools/boost-framework/src/lockdown.ts` -- allowlist, known-open check, `node:sqlite`, resolve hook, `clearAll`.
- `tools/boost-framework/src/scope.ts` -- `modulePath(specifier, importer)`.
- `conformance/tests/xaravel/boost-framework.test.ts` -- XT-boost-5 probe grows from 54 to 78 cases, two `open` cases pin the documented gaps, plus the unknown-member subprocess.
- `tools/boost-framework/docs/framework-mode.md` -- lockdown description, recorder scope, § Limits.
- `_bmad-output/implementation-artifacts/spec-7-4-framework-mode-is-read-only.md` -- corrected l.170-171 and the case count.

**Review.** 27 findings: 17 patched or covered (3 high, 6 medium, 8 low), 3 deferred into 2 entries (the non-writable `Bun.fetch`/`WebView` and extensionless text imports, which no in-process patch can close), 7 rejected with reasons in the triage log.

**Follow-up review recommended:** true. Three high entries were patched (query bypass, dotfile bypass, the guarantee they share); the unverified risk is further specifier forms that reach a data file under a code-looking name.

**Verification.** `bun test conformance/tests/xaravel/boost-framework.test.ts` 6 pass; `bun run harness --xaravel` 265/265, differ=0; `bun run typecheck` and `bun run lint` clean.

**Residual risks.** `Bun.fetch` file: reads and extensionless text imports stay open (deferred, Maintainer's OS-sandbox question); a Bun upgrade that adds a non-writable member stops the server until the lists are updated.
