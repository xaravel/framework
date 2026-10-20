---
title: 'Story 6.5: API-surface diff'
type: 'feature'
created: '2026-10-19'
baseline_revision: '5541ef69e7132106ddf6f04c17af3f6a4ebf0b41'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/AGENTS.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** AD-15 needs each package's public TypeScript surface diffed against Upstream's export (`conformance/api-surface/<component>.jsonl`, Story 3.5), with explained gaps cited in `additions.jsonl`/`exceptions.jsonl`, a summary on every PR, and a gate command a Component's last Epic is accepted against. Nothing compares the two today. The export also trusts a static class scan: a class it misses vanishes silently (Epic 3 retro S5).

**Approach:** Add `tools/api-surface/api-surface.ts`: it emits the package's declarations with Story 6.4's `tsc -b` helper, maps each `registerClass('<FQCN>', X)` in `src/**/*.ts` to `X`'s `.d.ts` declaration, applies the parity mappings, and reports missing, renamed, extra and mismatched members. `bun run api-surface` reports and exits 0; `bun run api-surface:gate <component>` exits 1 while anything is unexplained. A new read-only workflow writes the per-Component table to the job summary on PRs and in the merge queue. `tools/oracle/api-surface.php` gains a post-load cross-check.

## Boundaries & Constraints

**Always:**
- CLI: `bun run api-surface [--root <dir>] [--details] [--markdown <file>] (<component>… | --all)` and `bun run api-surface:gate [--root <dir>] <component>…` (script runs the same file with `--gate`). A component is a `conformance/api-surface/<name>.jsonl` other than `additions`/`exceptions`; `--all` is every one, sorted. Its package is `packages/<name>` (equal for all 41 today). Unknown component, or no component and no `--all` → exit 2 naming it. Tool failure (tsc fails, unreadable/invalid jsonl, parse error) → exit 1 with the reason.
- Build: export from `tools/async-surface/async-surface.ts` and reuse its `tsc -b` emit and `packageDeclarations` (stale `.d.ts` dropped); a component whose `packages/<name>/package.json` is absent has no declarations (everything missing), not an error.
- Xaravel side: in each `packages/<c>/src/**/*.ts` (not `.d.ts`, parsed with `oxc-parser` `lang: "ts"`), a top-level `registerClass(<string literal>, <Identifier>)` statement maps the FQCN to that file and local name; the first registration of an FQCN wins. Its members are the public, non-`#`, non-computed-key members of every `class`/`interface` named `X` in that file's `.d.ts` (merged): `MethodDefinition` (`constructor` → `__construct`, `method`, `get`/`set` → property), `PropertyDefinition`/`AccessorProperty` (property; a function-typed one also counts as a method signature), `TSMethodSignature`, `TSPropertySignature`. Overloads of one name are one member with several signatures. Exported `TSDeclareFunction`s of any `.d.ts` in the package are the functions.
- Name mapping (Upstream → Xaravel): methods, properties, parameters and functions (short name after the last `\`) go through `camel()` (each `_x` after a letter or digit becomes `X`; leading underscores kept), except `__construct` → `constructor` and `__toString` → `toString`; other magic methods keep their name; constants and enum cases keep their name and are matched as static properties.
- DIV-12 (`conformance/scans/div12-pairs.jsonl`, keyed `class`+`name`): `option-pair` → Upstream property and method `name` on that class are not expected; `method-plus-state` → the property is not expected; `model-config` → the property is expected and the method is not expected under its name (its new name is cited in `exceptions.jsonl`/`additions.jsonl`, as the pair list holds no target). Not-expected members are reported as `div12`, never counted.
- Findings, per component: `missing` (an Upstream declaration with no registration — its members are not listed separately — or a member of a registered class, or a function); `extra` (a registered FQCN not in the component's file, or a member of a matched class with no Upstream counterpart; `constructor` is extra only if Upstream has no `__construct`); `renamed` (an unmatched Upstream member and an unmatched Xaravel member of one class whose mapped names are equal case-insensitively); `mismatch` (a matched member whose every signature fails; details from the signature with the fewest failures, first on a tie).
- Signature checks, per Upstream parameter i (positional): name = `camel(name)`, unless that is an ECMAScript reserved word (`default`, `class`, `function`, …, which cannot name a parameter; the renaming convention is PORTING.md's, AD-26), when any name passes; variadic ↔ rest; optional ↔ TS `?`/rest; when both sides' defaults are comparable literals (PHP `null`/`true`/`false`/int/float/`'…'`/`[]`; TS source initializer `null`/boolean/number (with unary `-`)/string/`[]`/`{}`), they are equal (`[]` matches `[]` or `{}`); when the PHP `type` is non-null, PHP `nullable` ↔ TS type is absent or contains `null`/`any`/`unknown`. Missing or extra TS parameters fail. Options form (AD-26), when Upstream has ≥2 optional non-variadic parameters: the required ones positionally, then one parameter whose type (or a union member, or an interface/type alias of that name in the package's `.d.ts`) is a type literal whose keys are exactly their `camel()` names. Returns: any `undefined` in the TS return type fails (AD-9); when PHP `returns` is non-null and not `void`/`never`, nullability must agree after unwrapping `Promise<…>`/`PromiseLike<…>`. Properties: same nullability rule; static must agree for every member kind. Defaults are read from the class or function of the same name in the source `.ts`.
- Explained: a `missing` or `mismatch` item by an `exceptions.jsonl` line with its component, fqcn and Upstream member name (or `member: null` for the whole declaration and its members); an `extra` item by an `additions.jsonl` line with the Xaravel member name (or `null` for a whole class); `renamed` needs both. Lines that explain nothing are listed as `stale`, not counted.
- Output: report mode prints one summary line per component, `api-surface <c>: <n> Upstream, <m> matched, <a> missing, <b> renamed, <e> extra, <x> mismatched, <d> div12; <u> unexplained (AD-15)`, preceded with `--details` by one line per item, `<c>: <category> <kind> <fqcn>[::<member>][: <details>][ (explained: <citation>)]`. `--markdown` writes a table (Component, Upstream, Matched, Missing, Renamed, Extra, Mismatched, Unexplained, plus a Total row). Gate mode prints every unexplained item, then `api-surface:gate <c>: <u> unexplained (AD-15)` per component; exit 1 if any is non-zero.
- Workflow `.github/workflows/api-surface.yml`: `pull_request` (main) and `merge_group`; top-level and job permissions `contents: read` only; checkout (`persist-credentials: false`) and setup-bun at the repo's pinned SHAs, `bun install --frozen-lockfile --ignore-scripts`, then one step that runs `bun run api-surface --all --markdown …`, appends the table to `$GITHUB_STEP_SUMMARY`, and on a non-zero exit writes a `::warning` and a note instead, ending with `exit 0`.
- Cross-check in `api-surface.php`, after the reflection loop and before printing: every class, interface, trait and enum whose file is under `<src dir>` from `get_declared_classes()`/`get_declared_interfaces()`/`get_declared_traits()`, plus every named class-like declared in a non-blade `.php` file under `<src dir>` (PHP tokenizer: `T_CLASS`/`T_INTERFACE`/`T_TRAIT`/`T_ENUM` followed by a name, not after `::` or `new`), must be in the class list; each one that is not prints `api-surface: the class list misses <FQCN> (declared in <path under src>)` to stderr, sorted, and the run exits 1 with no stdout.

**Never:**
- No PR comment and no write scope (spine AD-16: write scopes are for the Oracle, dashboard and release jobs only); no change to `ALLOWED_WRITE_JOBS`.
- No edits to `packages/**`, `conformance/api-surface/**` data, `conformance/scans/**`, `conformance/expectations/**`, `.oxlintrc.json`; no new devDependency; no `oxlint-disable`; tests write only into temp roots.
- The report never fails the PR; only `api-surface:gate` fails. Not a required check; `ci.yml` is unchanged.
- No type-aware resolution: inherited members, mixin-supplied trait members, aliases and unregistered exported classes are not seen (documented limits). Xaravel functions with no Upstream counterpart are not reported as extra.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| matched | `Repository::get(string $key, $default = null)` ↔ `get(key: string, fallback?: unknown)` (reserved word) | matched | exit 0 |
| param name | PHP `$seconds`, TS `ttl` | `mismatch … parameter 2 is ttl, Upstream seconds` | report 0, gate 1 |
| default | PHP `= 60`, TS source `= 30` | `mismatch … default 30, Upstream 60` | report 0, gate 1 |
| nullability | PHP `?string $x`, TS `x: string` | `mismatch … parameter 1 is not nullable` | gate 1 |
| options form | PHP `(a, b = 1, c = 2)`, TS `(a, options?: { b?; c? })` | matched | exit 0 |
| snake/magic | `get_id`, `__construct`, `__toString` ↔ `getId`, `constructor`, `toString` | matched | exit 0 |
| renamed | Upstream `getID`, TS `getId` only (no camel match) | `renamed method …::getID -> getId` | gate 1 |
| undefined | TS `find(): T \| undefined` | `mismatch … returns undefined (AD-9)` | gate 1 |
| missing class | Upstream class not registered | one `missing class` item | gate 1 |
| extra | TS member / registered class not in Upstream | `extra` items | gate 1 |
| explained | matching exceptions/additions lines | `(explained: DIV-12)`, unexplained 0 | gate 0 |
| DIV-12 | option-pair, method-plus-state, model-config pairs | `div12` items, not counted | exit 0 |
| missed class | PHP list omits a loaded trait and an unloaded class | both named | PHP exit 1, no stdout |
| bad args | `bun run api-surface nope` | names `nope` | exit 2 |

</intent-contract>

## Code Map

- `tools/async-surface/async-surface.ts` -- `REPO_ROOT`/`TSC` (:74-75), `packageDeclarations(root, pkg)` (:480, not exported), `declarationFiles` (:457), oxc helpers `node`/`nodes`/`nameOf`/`unwrapAnnotation`/`typeNameTail` (:83-125), tsc spawn in `main` (:555-560). Export `packageDeclarations`, `declarationFiles` and a new `emitDeclarations(root, dirs): string | null` (returns tsc's output on failure) used by its own `main`; behaviour unchanged.
- `oxc-parser` 0.155.0 shapes (probed): d.ts method params are `Identifier{name, optional, typeAnnotation}` or `RestElement{argument, typeAnnotation}`; `MethodDefinition.kind` `constructor|method|get|set`; `AccessorProperty`; `TSTypeReference{typeName, typeArguments{params}}`; keywords `TSNullKeyword`/`TSAnyKeyword`/`TSUnknownKeyword`/`TSUndefinedKeyword`. Source params: `AssignmentPattern{left, right}`, `TSParameterProperty{parameter}`; `registerClass` is `ExpressionStatement{expression: CallExpression{callee: Identifier, arguments: [Literal, Identifier]}}`.
- `conformance/api-surface/schema.json` -- `$defs` `surface`, `addition`, `exception`; reuse its validation by reading lines with the same key order (`component`,`fqcn`,`member`,`citation`). `tools/oracle/api-surface.ts` `checkCitations` (:303-359) already validates the citation files under `oracle:api-surface --check`; do not duplicate validation, only parse.
- `conformance/scans/div12-pairs.jsonl` -- `{"class","name","classification","property","method"}`; classifications `option-pair` (13), `model-config` (96), `method-plus-state` (1407).
- `tools/oracle/api-surface.php` -- reflection loop ends :269, functions :271-288, `underSrc` :186, prints at :298. The script is bind-mounted into the Oracle image (`/xaravel/api-surface.php`), not baked, so the image tag does not change. Upstream at the Pin: 2,437 tokenized class-likes = 2,437 exported (probed), so the real export passes.
- `conformance/tests/xaravel/api-surface.test.ts` -- `phpTest`, `runFixture(classes)` (:188), `FIXTURE_CLASSES` (:199), XT-conformance-198 (:371); CI runs it with real PHP in `ci.yml#php-fixtures` (`XARAVEL_PHP_FIXTURES=require`).
- `conformance/tests/xaravel/async-surface.test.ts` -- pattern: `xaravelTest` from `../../../packages/assert/src/index`, temp roots via `mkdtempSync`+`realpathSync`, CLI via `Bun.spawnSync([process.execPath, "--no-env-file", TOOL, "--root", dir, …])`, fixture package copied into `<tmp>/packages/demo`.
- `tools/workflow-permissions/workflow-permissions.ts` -- top-level `{contents: read}`; no write scopes outside `ALLOWED_WRITE_JOBS`.
- Action pins: checkout `3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, setup-bun `0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0`.
- `package.json` scripts; `tsconfig.json` include list (add `tools/api-surface/*.ts`); `docs/ops/oracle.md:318-360` (API surface; :360 names this Story), `docs/ops/ci.md` (:9 table, :26 queue), `docs/ops/async-surface.md` (model for the new doc); `stories/6.5.md` → `status: done` at the end.

## Tasks & Acceptance

**Execution:**
- `tools/async-surface/async-surface.ts` -- export the build/read helpers as above.
- `tools/api-surface/api-surface.ts` -- exported pure `diffComponent(input)` (Upstream records, citation lines, DIV-12 pairs, declaration and source texts → items), `camel`, `renderMarkdown`, plus the CLI.
- `tools/api-surface/fixtures/demo/` -- `package.json`, standalone `tsconfig.json` (as Story 6.4's demo), `src/*.ts` (a local `registerClass` stub declaration plus classes covering every matrix row); `tools/api-surface/fixtures/demo.jsonl`, `div12-pairs.jsonl`, `additions.jsonl`, `exceptions.jsonl`.
- `tools/oracle/api-surface.php` -- the cross-check; header comment.
- `.github/workflows/api-surface.yml` -- new workflow with a header comment.
- `package.json`, `tsconfig.json` -- scripts `api-surface`, `api-surface:gate` (`bun --no-env-file tools/api-surface/api-surface.ts [--gate]`); include the tool.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- XT-conformance-137 (real CLI and tsc over the fixture in a temp root: exact `--details` output for every finding kind and mapping), XT-conformance-138 (citation lines explain missing, extra, renamed, class-level, mismatch; stale listed; gate exit 1 naming unexplained items, 0 when all explained), XT-conformance-139 (report exits 0 with unexplained items and writes the markdown table; the workflow's triggers, `contents: read`, step text, `exit 0`, no `if:`; `checkWorkflows` passes; package.json scripts; `--all` on the real repository exits 0), plus `camel`/matrix edge cases through `diffComponent`.
- `conformance/tests/xaravel/api-surface.test.ts` -- XT-conformance-198 gains the cross-check run (list without `Fixture\Greets` and `Fixture\Options`: exit 1, both named, empty stdout) and its consequence names it.
- `docs/ops/api-surface.md` (new), `docs/ops/oracle.md`, `docs/ops/ci.md` -- usage, mappings, explained items, limits, the cross-check.

**Acceptance Criteria:**
- Given a package's `.d.ts` and `conformance/api-surface/<component>.jsonl`, when the diff runs, then it reports missing, renamed and extra members and parameter name, default or nullability mismatches, after camelCase, options-object and DIV-12 mappings (XT-conformance-137).
- Given an extra member in `additions.jsonl` or a missing member in `exceptions.jsonl` with a citation, when the diff runs, then it counts as explained (XT-conformance-138).
- Given any PR, when the diff runs, then the per-Component table is written to the job summary and the job does not fail, and `bun run api-surface:gate <component>` fails while any unexplained member remains (XT-conformance-139).
- Given the export, when `api-surface.php` runs, then a class under `src/` missing from the class list fails the run, naming it (XT-conformance-198, extended).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 30 findings — high 2, medium 6, low 16, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) DIV-12 pairs applied only on `pair.class`, while the export lists a member on its `declaredIn` class (35 real records) — each side's not-expected rule now also applies to the record on that side's `declaredIn` class; fixture pair added.
  - `[high]` `[patch]` (blind) interfaces can never match: spine AD-1 ports contracts as `interface` plus a `Symbol.for('<FQCN>')` / `contract<T>('<FQCN>')` token, never `registerClass`, so `api-surface:gate contracts` could not pass — a top-level token const is now a registration of its FQCN; fixture and docs added. The spine names exactly one form, so this follows the intent rather than widening it.
  - `[medium]` `[patch]` (blind) trait members are never seen — documented in § Limits (mixin-built traits, members from mixins); the mixin shape is PORTING.md's (AD-26), not yet decided.
  - `[low]` `[patch]` (blind) options form ignores a trailing variadic and the options parameter's optionality — the rest parameter and optional options/keys are now required; tested.
  - `[medium]` `[patch]` (blind) implementation defaults applied by position to every overload — defaults are compared only on a signature whose names equal the implementation's; tested.
  - `[medium]` `[patch]` (blind) AD-9 not checked on properties, and nested `undefined` flagged in returns — top-level only for returns; optional or `undefined` properties fail; tested.
  - `[low]` `[reject]` (blind) the Missing column understates scale for unregistered classes — the summary format is the spec's; the Upstream column gives the scale, `--details` lists each class.
  - `[low]` `[reject]` (blind) stale citations are shown only with `--details`, and lines naming an unknown component are never reported — `oracle:api-surface --check` already validates the citation files' schema; unlikely, and the fix adds a cross-component pass.
  - `[low]` `[reject]` (blind) XT-139 runs `tsc -b` on the real repository, writing `.cache/tsc` — gitignored build output, the same as `bun run typecheck` and Story 6.4's XT-136; no tracked path is written.
  - `[false]` `[reject]` (blind) Story marked done while sprint status says in-progress and the spec in-review — the orchestrator sets sprint status and the spec to done at finalize, in the same PR.
  - `[low]` `[patch]` (blind) workflow has no `timeout-minutes` — added (20). Concurrency and a paths filter rejected: the report is meant to run on every PR and in the queue (AD-15, AD-28); a failing checkout/install is infrastructure, and the check is not required.
  - `[low]` `[patch]` (blind) no test of a model-config method moved to a new name — fixture `setFillable` as `extra` explained by an `additions.jsonl` DIV-12 line; asserted.
  - `[low]` `[patch]` (blind) by-reference parameters silently unchecked — documented in § Limits.
  - `[low]` `[reject]` (blind) duplicate Upstream records overwritten; reader errors untested — the export is schema-checked and canonical (XT-conformance-199, `oracle:api-surface --check`); unlikely.
  - `[high]` `[patch]` (edge) interfaces ported as contract tokens are always missing — same root cause as the blind row; fixed there.
  - `[low]` `[patch]` (edge) Upstream method vs same-named TS property reported as `renamed foo -> foo` — now a `mismatch` naming the role.
  - `[low]` `[patch]` (edge) options form with a trailing variadic never passes — same as the blind options row.
  - `[low]` `[patch]` (edge) a TS `this` parameter shifts source defaults — skipped in `paramDefaults`.
  - `[medium]` `[patch]` (edge) nested `undefined` falsely flagged — same as the blind AD-9 row.
  - `[low]` `[reject]` (edge) two Upstream functions sharing a short name both match one TS function — none at the Pin share a component and short name in a way that matters today; a fix needs a namespace-to-module map.
  - `[medium]` `[patch]` (edge) `export declare const f: (…) => T` functions not collected — collected as function signatures; tested.
  - `[low]` `[reject]` (edge) an options interface using `extends`/`Partial` is reported as a mismatch — fails loudly and is citable; resolving heritage is type-aware work outside the syntactic walk.
  - `[false]` `[reject]` (edge) a registered TS `enum` has no members — AD-26 forbids TS `enum` (enums are classes with static instances).
  - `[low]` `[reject]` (edge) aliased or member-expression `registerClass` calls are skipped — AD-10 fixes the call form; Story 6.6's registration scan enforces it.
  - `[low]` `[reject]` (edge) misspelled citation component never reported stale — same as the blind stale row.
  - `[false]` `[reject]` (edge) a package with `package.json` but no `tsconfig.json` fails `tsc -b` — `scaffold:check` guarantees every package's tsconfig; and the failure is loud, not wrong.
  - `[low]` `[patch]` (edge) unwritable `--markdown` path throws a stack trace — caught; exit 1 with the reason.
  - `[false]` `[reject]` (edge) `member: null` on a method record, or a nameless parameter — the export's schema (`$defs/surface`) forbids both, checked by XT-conformance-199.
  - `[false]` `[reject]` (edge) braced `namespace A { }` followed by non-namespaced code — PHP forbids code outside a namespace block once braced namespaces are used; `namespace {` resets to the global namespace, which the tokenizer handles.
  - `[false]` `[reject]` (intent) the readings diverge on surface: fixtures instead of the real repository, job summary instead of a PR comment, DIV-12 as suppression, the cross-check proved on the fixture — descriptive. The PR comment is ruled out by AD-16 (Design Notes); the real repository runs in XT-139; model-config renames go through citations because the pair list holds no target; the real export runs the cross-check in `oracle.yml#build`, which this PR triggers through `tools/oracle/**`.

## Design Notes

"Posts a per-Component summary" is met with the job summary of a read-only check, shown on the PR's checks page: a PR comment needs `pull-requests: write`, which AD-16 reserves for the Oracle, dashboard and release jobs. The dashboard (Epic 7) is the other display AD-15 names.

Every Component package is a scaffold today, so `--all` reports nearly everything missing; that is expected and only the gate, run at a Component's last Epic, enforces it.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/api-surface-diff.test.ts conformance/tests/xaravel/api-surface.test.ts` -- expected: all pass (real PHP present locally)
- `bun run api-surface --all` -- expected: exit 0, 41 summary lines
- `bun run lint`, `bun run typecheck`, `bun run test`, `bun run harness --xaravel`, `bun run async-surface --all --check` -- expected: exit 0
- `bun run ownership:check`, `bun run escalations:check`, `bun tools/workflow-permissions/workflow-permissions.ts check`, `bun run story:check 6.5` -- expected: exit 0 (approvals/full-run clauses need CI)

## Auto Run Result

Status: done

**Summary.** `bun run api-surface [--root <dir>] [--details] [--markdown <file>] (<component>… | --all)` (`tools/api-surface/api-surface.ts`) builds each Component package's declarations with Story 6.4's `tsc -b` helper. It maps each `registerClass('<FQCN>', X)`, and each AD-1 contract token (`contract<T>('<FQCN>')` or `Symbol.for('<FQCN>')`), to `X`'s `.d.ts` declaration. It then diffs that against `conformance/api-surface/<component>.jsonl`, after these mappings:
- camelCase, plus `__construct` → `constructor` and `__toString` → `toString`;
- the AD-26 options-object form;
- DIV-12 (`div12-pairs.jsonl`, applied on the pair's class and on each side's `declaredIn` class).

It reports missing, renamed, extra and mismatched items. Mismatches cover parameter name, default (literal defaults read from the source), nullability, optionality, variadic, static, role, and AD-9 `undefined`. Citation lines in `exceptions.jsonl` / `additions.jsonl` explain items, and lines that explain nothing are listed as stale. Report mode always exits 0. `bun run api-surface:gate <component>` exits 1 while anything is unexplained. The new read-only workflow `api-surface.yml` runs on PRs and in the merge queue, writes the per-Component table to the job summary, and always ends with `exit 0`. `tools/oracle/api-surface.php` now cross-checks the class list after the load: `get_declared_*`, plus a tokenizer pass over `src/`. Any missed class fails the run and is named.

**Files changed.**
- `tools/api-surface/api-surface.ts` (new): the diff, the gate and the CLI. `tools/api-surface/fixtures/` (new): the demo package, a demo export, a DIV-12 pair list and citation files.
- `tools/async-surface/async-surface.ts`: exports its declaration helpers and the new `emitDeclarations`. Behaviour is unchanged.
- `tools/oracle/api-surface.php`: the class-list cross-check.
- `.github/workflows/api-surface.yml` (new): the PR and merge-queue report.
- `package.json`: the `api-surface` and `api-surface:gate` scripts. `tsconfig.json`: includes the tool.
- `conformance/tests/xaravel/api-surface-diff.test.ts` (new): XT-conformance-137, 138 and 139, plus edge cases. `conformance/tests/xaravel/api-surface.test.ts`: XT-conformance-198 gains the cross-check runs. No assertion was removed.
- `docs/ops/api-surface.md` (new). `docs/ops/oracle.md` and `docs/ops/ci.md` updated.
- `stories/6.5.md` and `sprint-status.yaml`: set to done.

**Review.** 30 findings: 2 high, 6 medium, 16 low and 6 false.
- Patched:
  - both highs (the same root cause): contract tokens now register interfaces;
  - 5 medium entries: DIV-12 `declaredIn`, overload defaults, AD-9 on properties and nested types, exported const functions, and trait members (added to § Limits);
  - 9 low: the options form with a variadic and optional keys, role mismatch, the `this` parameter, the `--markdown` write error, the workflow timeout, a model-config rename fixture, and by-ref parameters in § Limits.
- Rejected low, each with its reason in the Triage Log: missing-count scale, stale citations outside `--details`, the real-repo `tsc -b` cache, duplicate records, shared function short names, `extends`/`Partial` options types, and aliased `registerClass`.
- Rejected false: status bookkeeping, TS enums, packages without a tsconfig, `member: null` records, braced namespaces, and the intent audit's descriptive divergences.
- Nothing was deferred.

**Follow-up review recommended: true.** A high entry (contract-token registration) was patched in one pass. It has been checked only against a fixture, because `@xaravel/contracts` has no tokens yet. Story 10.5 fixes the real token form, and the recognition (`contract(...)` / `Symbol.for(...)` in a top-level const initializer) has to be checked against it.

**Verification.**
- `bun test` on the two api-surface test files: 9 pass.
- `bun run test`: 248 pass in 4 of 5 runs. The one failing run overlapped with the implementation subagent's own concurrent `tsc -b`/test run on the same `.cache`, and its output was lost. The 4 later runs passed.
- `bun run harness --xaravel`: 248 passed, differ=0.
- These all exit 0: `bun run api-surface --all` (41 components), `typecheck`, `lint`, `async-surface --all --check`, `bun audit --audit-level=high`, `ownership:check`, `escalations:check`, and the workflow-permissions check.
- `bun run story:check 6.5`: manifest, tests, xaravel-tests, fixtures and escalations pass. approvals and full-run need `GH_TOKEN` and run in CI.

**Residual risks.**
- The walk is syntactic. It does not see inherited members, mixin-supplied trait members, aliases, or `extends`/`Partial` options types, and by-ref parameters are not checked (see § Limits).
- DIV-12 model-config renames have no target in the pair list, so each one needs a pair of citation lines.
- The real Oracle-image run of the cross-check is exercised only by `oracle.yml#build` on this PR. The tokenizer probe found no missed class at the Pin.
- `bun run test` failed once without a captured cause; possibly a race on the shared `.cache/tsc` outDirs.
