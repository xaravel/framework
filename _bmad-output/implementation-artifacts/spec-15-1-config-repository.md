---
title: 'Story 15.1: Config Repository'
type: 'feature'
created: '2026-10-29'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/decisions/ESC-11.1-2.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/config` is an empty scaffold (`src/index.ts` is `export {};`), so nothing can read configuration the way Laravel's `Illuminate\Config\Repository` does, and the 33 Test IDs of `framework/tests/Config/RepositoryTest.php` are `not-ported-yet`.

**Approach:** Port `Repository.php` line for line as `packages/config/src/Repository.ts` over `Arr` from `@xaravel/collections`, with its base items from the constructor and every write going to a frame overlay keyed by the Repository (AD-5), and port `RepositoryTest.php` plus XT-config-1/2.

## Boundaries & Constraints

**Always:**
- Keep Upstream's method names, argument order, defaults and exception messages, byte for byte (`Configuration value for key [%s] must be a string, %s given.` with `gettype`).
- `get`/`getMany`/`has`/`all`/typed getters read the innermost visible items: the frame overlay if this frame chain has written, else the base. `set`/`push`/`prepend`/`offsetSet`/`offsetUnset` copy the visible items with PHP value semantics (`valueCopy`), apply `Arr.set` through a `Ref`, and store the copy in `frameOverlay(this)`; the base is never mutated after construction. A write with no active frame throws `ScopeFrameException` (as `frameOverlay` does), per the ESC-11.1-2 precedent, until the ruling on ESC-15.1-2.
- The class implements `@xaravel/contracts/config` `Repository` (brand getter, aliased import) and runtime `ArrayAccess` (brand getter, `offsetExists/Get/Set/Unset`), ends with `registerClass("Illuminate\\Config\\Repository", Repository)`, returns `null` never `undefined`, stays sync.
- Ported Tests follow PORTING.md: `portedTest` with a `RepositoryTest extends TestCase` case, PHP arrays by DIV-9.2's shape rule, PCRE patterns marked `// adapted:DIV-10.1`, ArrayAccess reads `// adapted:DIV-12.6`, writes/isset/unset `// adapted:DIV-12.17`, each recorded on its Expectations line.

**Never:**
- No Macroable mixin and no `@xaravel/macroable` import until ESC-15.1-1 is ruled; `testItIsMacroable` stays `not-ported-yet` with `"escalation":"ESC-15.1-1"`.
- No Application, sealed flag, per-Application base store or `config()` helper: those are Container 17.4 / Foundation 51.1 / Support 20 (F-8). No edit outside `packages/config/**`, this Story's Expectations lines and its Escalations.
- No `env()`, env file loading, phpdotenv, `config:cache` or `$class` rehydration (Stories 15.2, 20, 51, 55).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dot get | base `{a:{b:1}}`, `get('a.b')` | `1` | none |
| Key containing a dot | base `{'a.b':'c'}`, `get('a.b')` | `'c'` (Arr.get's exact-key first) | none |
| Missing with closure default | `get('x', () => 'd')` | `'d'` (Arr.get calls `value`) | none |
| Typed getter wrong type | `string('a')` where `a` is `1` | throws `InvalidArgumentException` `Configuration value for key [a] must be a string, integer given.` | throw |
| push/prepend new key | `push('new', 'x')` | `['x']` | none |
| Overlay isolation | unit A `set('k','v')`, concurrent unit B `get('k')` via `interleave` | B sees the base value | none |
| No frame | `set('k','v')` outside any frame | throws `ScopeFrameException` | throw |
| Class value | base `{driver: SomeClass}` / `{driver: fqcn(SomeClass)}` | `get` returns the same constructor / same string | none |

</intent-contract>

## Code Map

- `conformance/upstream/framework/src/Illuminate/Config/Repository.php` -- the source to port (305 lines; `getMany` swaps `[$key,$default]` when `is_numeric($key)`).
- `conformance/upstream/framework/tests/Config/RepositoryTest.php` -- the 33 Upstream tests; `setUp` builds `$this->config` and `$this->repository`.
- `packages/collections/src/Arr.ts` -- `Arr.get` (553, calls `value(default)`), `Arr.has` (582), `Arr.set(Ref, key, value)` (879). Reuse, never re-implement.
- `packages/runtime/src/scope/scope.ts:181-220` -- `frameOverlay(owner).has/get/set` (throws `ScopeFrameException` with no frame); `interleave` in `interleave.ts`; usage example `packages/runtime/tests/xaravel/overlays.test.ts:168-190`.
- `@xaravel/runtime` -- `gettype`, `sprintf`, `is_string`, `is_int`, `is_float`, `is_bool`, `is_array`, `is_numeric`, `array_unshift(Ref, …)`, `arrayAppend`, `arrayEntries`, `valueCopy`, `Ref`, `PhpArray`, `InvalidArgumentException`, `ArrayAccess`, `registerClass`, `fqcn`.
- `packages/contracts/src/config/Repository.ts` -- contract token `Illuminate\Contracts\Config\Repository` (`has`, `get`, `all`, `set`, `prepend`, `push`).
- `packages/collections/src/Collection.ts:192-240,1686-1705` -- brand-getter and ArrayAccess pattern to copy.
- `packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts` -- ported-test shape and imports to copy.
- `packages/collections/tests/xaravel/arr.test.ts` -- `xaravelTest` shape.
- `conformance/expectations/config/framework/tests/Config/RepositoryTest.jsonl` -- 33 lines to update.

## Tasks & Acceptance

**Execution:**
- `packages/config/src/Repository.ts` -- port the class as above, docblock on every public member -- the Story's surface.
- `packages/config/src/index.ts` -- named export `Repository` -- package entry.
- `packages/config/tests/ported/framework/tests/Config/RepositoryTest.test.ts` -- port 32 tests (all but `testItIsMacroable`) -- the Upstream grader.
- `packages/config/tests/xaravel/repository.test.ts` -- XT-config-1 (overlay half: a write in one `interleave` unit is invisible to the other, the base is unchanged, and a write with no frame throws `ScopeFrameException`) and XT-config-2 (class and FQCN string returned as stored); cite whole-token consequence ids (`AD-5.5`, `AD-10.7`) -- the AC's Xaravel Tests.
- `conformance/expectations/config/framework/tests/Config/RepositoryTest.jsonl` -- 32 `pass` lines with their `adapted` clause; `testItIsMacroable` keeps `not-ported-yet` with `ESC-15.1-1` -- the Expectations.

**Acceptance Criteria:**
- Given the test scope `tests/Config/RepositoryTest.php::*`, when `bun run harness --story 15.1` runs, then 32 Test IDs pass with no difference and `testItIsMacroable` waits on ESC-15.1-1.
- Given a write inside one `interleave` unit, when the other unit reads the key, then it sees the base value (XT-config-1; the sealed-Application half waits on ESC-15.1-2).
- Given a class or FQCN string in config, when it is read, then it is returned as stored (XT-config-2).

## Spec Change Log

## Review Triage Log

## Design Notes

Three questions were raised in one round before building (lesson, epic 14), and stop only their own Test IDs:

- **ESC-15.1-1** (`protected-path`): Upstream `Repository` uses `Illuminate\Support\Traits\Macroable`, which `illuminate/config` reaches only through `illuminate/collections`. AD-2.4 fails a static import of an unlisted package, and `tools/scaffold` derives `dependencies` from composer `require`, so listing `@xaravel/macroable` needs a change to `tools/scaffold` and `bun.lock` (Protected). Stops `testItIsMacroable`.
- **ESC-15.1-2** (`contract`): AD-5.4 sends a config write before `sealed` to the Application's base; no sealed state or base seam exists (ESC-11.1-2, Story 17.4's AC). Stops XT-config-1.
- **ESC-15.1-3** (`protected-path`): `tools/xt-coverage/consequences.ts` has no `config` row, which `decisions/MAINT-2026-10-22-consequence-rows.md` requires before the Component's first Story with Xaravel Tests. Stops XT-config-1 and XT-config-2.

The overlay is keyed by the Repository instance: one Repository per Application gives AD-5.3's "keyed by Application and frame" without importing Foundation.

## Verification

**Commands:**
- `bun run scan:builtins config` -- expected: 0 functions; `isset`/`unset` only (DIV-12.17). Run on 2026-10-29: as expected.
- `bun run harness --fast --story 15.1`, then `bun run harness --story 15.1` -- expected: no difference.
- `bun run harness --xaravel --id 'XT-config-*'` -- expected: both pass.
- `bun run typecheck`, `bun run lint`, `bun run expectations:check`, `bun run escalations:check`, `bun run divergence:check`, `git diff --check` -- expected: clean.
- `bun run harness` (full) and `bun run story:check 15.1` -- expected: pass once the Escalations are ruled.

## Auto Run Result

Status: blocked
Blocking condition: intent gap. Three questions were raised in one round before building (lesson, epic 14), and planning stops on them: ESC-15.1-1 (Macroable edge for `config`; stops `testItIsMacroable`), ESC-15.1-2 (no sealed Application; decides how a Repository write with no frame behaves and stops XT-config-1), ESC-15.1-3 (no `config` consequence row; stops XT-config-1 and XT-config-2). The plan above is complete for the other 32 Test IDs. Once the three are ruled, set this spec to `ready-for-dev` and resume at implementation. `bun run scan:builtins config` found no missing runtime builtin.

Rulings (2026-10-29): ESC-15.1-2 and ESC-15.1-3 are approved, option 1 each, by the orchestrator (`decisions/ESC-15.1-2.md`, `decisions/ESC-15.1-3.md`); the `config` consequence row and `conformance/xaravel-consequences/config.jsonl` are on `main`. ESC-15.1-1 changes how AD-2 derives a package's edges, so it waits on the Maintainer and holds only `testItIsMacroable`. Resume at implementation for the other 32 Test IDs and XT-config-1/2.
