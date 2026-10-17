---
title: 'Story 2.3: Test-directory → Component map'
type: 'feature'
created: '2026-10-17'
baseline_revision: 'f4d6a28db18fb4cd026a7b25689606c6ea6e57aa'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.3.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Contract FQCN tokens resolve to contracts, not the implementing Component, in componentForFqcn.
    evidence: |-
      Unverified. It is settled when Epic 5 or Story 10.1 decides how BlockedByComponentError attributes a contract token. contracts is always installed, so this may be moot.
    location: >-
      tools/component-map/component-map.ts:279
    severity: medium (unverified)
  - summary: >-
      Code Owner review of conformance/component-map is enforced only by CODEOWNERS and the ruleset, which the admin identity bypasses.
    evidence: |-
      Unverified. It waits on retro epic-1 items 2 and 12 (Maintainer ruleset apply and agent identity).
    location: >-
      .github/CODEOWNERS
    severity: medium (unverified)
  - summary: >-
      component-map / check is not a required status check on main.
    evidence: |-
      .github/rulesets/main.json lists required checks. Changing it needs a Maintainer ruleset:apply (retro epic-1 item 2).
    location: >-
      .github/rulesets/main.json
    severity: low
---

<intent-contract>

## Intent

**Problem:** Nothing says which Component an Upstream test belongs to, so Stories 2.4 and 2.5 cannot fill the Inventory's `component` field, and Epic 5's `BlockedByComponentError` has no record of which FQCNs and container aliases each Component owns (FR-1).

**Approach:** Commit `conformance/component-map`: JSONL, one record per Component, holding its test-path entries (with the hand remaps), FQCN namespaces and classes, and container aliases. `tools/component-map/component-map.ts` exports the parser and lookups, plus a `check` command that validates the map against the Upstream snapshot: every test file the runners select maps to exactly one Component, and the FQCN and alias records match what the snapshot declares.

## Boundaries & Constraints

**Always:**
- Record format: `{"component","tests":[{"path","tags":[]}],"namespaces":[],"classes":[],"aliases":[]}`. Records are sorted by `component`, and each array is sorted. The file is UTF-8 with LF line endings, one record per line, and its `#` comment header is ignored by the parser. `component` must be a `name` row of `tools/scaffold/packages.jsonl`.
- A test path is relative to `conformance/upstream/` and starts with the repository name (`framework/tests/…`). An entry is either an exact file, a directory prefix ending in `/`, or a name prefix ending in `*`. A file belongs to its most specific matching entry: an exact file first, then the longest prefix. The file is **doubly mapped** when two entries with the same prefix match it; it is **unmapped** when no entry matches. An entry that matches no test file is **stale**. An entry is **redundant** when the entry it overrides has the same Component and tags. All four are check failures.
- A "test file" is what the repository's `phpunit.xml.dist` testsuites select: every `<directory suffix=…>` (the default suffix is `Test.php`) and `<file>` entry, minus any `<exclude>`. Pest uses the same file. So mcp's `tests/Conformance/` is not a test file.
- FQCN ownership: a Component owns the namespace prefixes in `namespaces` and the exact FQCNs in `classes`. A lookup tries an exact class first, then the longest namespace prefix. A namespace that several Components' composer.json PSR-4 prefixes share (`Illuminate\Support\`: Support, Collections, Conditionable, Macroable, Reflection) is owned by the Component whose directory the namespace names (Support). The others list every class, interface, trait and enum their `src` directory declares. The check fails unless every such declaration in `framework/src/Illuminate/<Dir>/**` and `{ai,mcp,boost}/src/**` resolves to its own Component, and no namespace or class appears twice.
- Alias ownership: the aliases are the keys of `Application::registerCoreContainerAliases`, plus every string-literal key that a `*ServiceProvider.php` binds with `singleton`, `bind`, `scoped` or `instance` (or their `If` forms). A key bound in Component X's provider belongs to X. A core key that no provider binds belongs to the owner of its first listed FQCN. The check fails when the map's aliases differ from that derivation, or when providers of two Components bind the same key.
- Tags are `deferred:<item>`, `<item>` kebab-case.
- `ai`, `mcp` and `boost` own their whole `tests/` and their composer.json PSR-4 namespaces.
- Every Upstream Component appears in the map, even with no tests (`contracts`).

**Never:**
- Edit the snapshot, `ci.yml`, any existing test's expected values, `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or `tools/workflow-permissions/`.
- Make `bun test` or any non-`component-map:check` path need the snapshot. Tests that need it run only when it is present.
- Fetch anything. Touch the Inventory, `pin:bump` or Expectations (Stories 2.4+ and Epic 5).
- Use `JSON.stringify` to write the committed map; it is hand-signed data. The tool only reads it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Map current | the real snapshot and map | `component-map:check` prints per-repo counts and exits 0 | — |
| Unmapped | a test file that no entry matches | exit 1: `unmapped: <path>` | — |
| Doubly mapped | the same entry under two Components | exit 1: `doubly mapped: <path> (<a>, <b>)` | — |
| Stale or redundant | an entry matching no test file, or one overriding an entry with the same Component and tags | exit 1 naming the entry | — |
| Not a test | `tests/AfterEachTestExtension.php`, or mcp `tests/Conformance/*Test.php` | not counted, not unmapped | — |
| FQCN drift | a Collections class missing from `classes`, or a namespace listed twice | exit 1 naming the FQCN, its owner and the expected Component | — |
| Alias drift | an alias missing, extra or under the wrong Component, or bound by two Components' providers | exit 1 naming the alias with expected and actual owner | — |
| Bad record | unknown Component, unsorted records or arrays, a bad tag, malformed JSON | exit 1 with the line number | — |
| No snapshot | `conformance/upstream/<name>` absent | exit 1 with `run bun run upstream:sync` | no fetch |

</intent-contract>

## Code Map

- `tools/upstream/upstream.ts` -- reuse `UPSTREAM_REPOS`, `UPSTREAM_DIR`, `upstreamPath(root,name,rel)` (it throws the sync hint) and `readUpstream`. Copy the header-comment style, `UsageError`, `USAGE`, `parseOptions` (`--root`) and `main` (exit 0 / 1 / 2) from :410-479. `tools/oracle/oracle.ts:36` is the import precedent.
- `tools/scaffold/table.ts` -- `readTable(root)` at :269 gives `packages.jsonl` rows, `kebab()` at :91 gives directory → Component names, and `symbolIndex` at :126 is the class-declaration scan pattern to mirror (it is private).
- `conformance/upstream/framework/phpunit.xml.dist` -- one `<directory suffix="Test.php">./tests</directory>`. The ai, mcp and boost files list `tests/Unit`, `tests/Feature`, `tests/Integration` and `<file>tests/ArchTest.php</file>`. Their autoloads: `Laravel\Ai\`; `Laravel\Mcp\` and `Laravel\Mcp\Server\`; `Laravel\Boost\`.
- `framework/src/Illuminate/Foundation/Application.php:1644` -- `registerCoreContainerAliases`. Some keys list only a Contract or a third-party class first (`auth.driver`, `filesystem.disk`, `filesystem.cloud`, `hash.driver`, `queue.connection`, `cache.psr6`), so the provider rule decides those. `config` and `request` are bound only in Foundation bootstrap or kernel code, not in a provider, so they go to Config and Http by their first FQCN.
- Snapshot counts at planning time: 1004 framework `*Test.php` files. Remap targets present: `tests/Support/{SupportArr,SupportCollection,SupportLazyCollection,SupportLazyCollectionIsLazy,SupportMacroable,SupportConditionable,SupportReflector,SupportReflectsClosures}Test.php`, `tests/Conditionable/`, `tests/Integration/{Generators,Migration}/`, `tests/Integration/Log/Context{,Integration}Test.php`, `tests/Http/Middleware/{TrimStrings,PreventRequestForgery,VitePreloading}Test.php`, `tests/Foundation/Cloud/` and `tests/Foundation/LaravelCloudJsonFormatterTest.php`.
- `conformance/tests/xaravel/upstream.test.ts` -- the test conventions: an `XT-conformance-<n>: …` title, `withFixture` with temp roots, `Bun.spawn` of the CLI with `--root`, and real-snapshot parts guarded by `existsSync`.
- `tools/protected-paths/protected-paths.ts` -- the exported matcher and the CODEOWNERS generator for XT-48. `/conformance/` already covers the map, so no list change is needed.
- `conformance/tests/xaravel/repository-policy.test.ts:750-789` and `upstream.test.ts:176-185` pin `ci.yml`'s jobs and steps exactly. The snapshot-backed check therefore goes in a new workflow. `oracle.test.ts:558` requires other workflows not to log in to or push to GHCR.

## Tasks & Acceptance

**Execution:**
- `tools/component-map/component-map.ts` -- new. It exports:
  - `COMPONENT_MAP_FILE` and the types;
  - `parseMap(text)`, `readMap(root)`;
  - `testFiles(root, name)`, from phpunit.xml.dist;
  - `componentForTest(map, path)`, which returns `{component, tags}` or `null`;
  - `componentForFqcn(map, fqcn)` and `componentForAlias(map, alias)`, which return `null` when nothing owns the value;
  - `declaredClasses(root)` and `expectedAliases(root)`;
  - `check(root)`, which returns `{counts, problems}`.

  The CLI command is `check [--root]`.
- `conformance/component-map` -- new. It has a `#` header that names the format, the precedence rule and the Protected-Path sign-off, then one record for each Upstream Component plus `ai`, `mcp` and `boost`. Generate the class and alias arrays from the snapshot with the tool's own derivation, then review them by hand.
- `.github/workflows/component-map.yml` -- new. Job `check`: pinned checkout (`persist-credentials: false`), setup-bun, `bun run upstream:sync`, `bun run upstream:check`, `bun run component-map:check`, and `bun test conformance/tests/xaravel/component-map.test.ts` so the snapshot-backed assertions run. It triggers on `pull_request`, `merge_group` and `push` to `main`, with `permissions: contents: read`.
- `package.json` -- add `"component-map:check": "bun tools/component-map/component-map.ts check"`. `tsconfig.json` -- include `tools/component-map/**/*.ts`.
- `conformance/tests/xaravel/component-map.test.ts` -- new, covering XT-conformance-45..48 and the matrix with fixture roots, plus the real map and snapshot when they are present.
- `docs/ops/component-map.md` -- new operator note covering the format, the precedence rule, how to change the map (Code Owner review) and the failure messages.

**Acceptance Criteria:**
- Given `conformance/component-map`, when `component-map:check` validates it against the snapshot, then every test file maps to exactly one Component, and an unmapped, doubly mapped, stale or redundant entry fails with exit 1 naming it (XT-conformance-45).
- Given the map, when it is inspected, then each hand remap in the Story resolves to its Component: Collections, Macroable, Conditionable, Reflection, Foundation (Generators and the three Http Middleware tests), Database (Migration) and Log (Context*). `tests/Foundation/Cloud/**` and `LaravelCloudJsonFormatterTest.php` resolve to Foundation with the tag `deferred:foundation-cloud`. Every ai, mcp and boost test resolves to `ai`, `mcp` or `boost` (XT-conformance-46).
- Given the map, when it is inspected, then every Component records its namespaces, classes and aliases, and the lookups give for example `Illuminate\Support\Collection` → collections, `Illuminate\Support\Str` → support, `auth.driver` → auth, `app` → foundation and `config` → config. With the snapshot present, the FQCN and alias derivations match the map (XT-conformance-47).
- Given a change to the map, when it is proposed, then the protected-paths matcher classifies `conformance/component-map` as Protected and the generated CODEOWNERS assigns it to the Maintainer (XT-conformance-48).

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 31 findings — high 0, medium 0, low 24, false 3, maybe-false 4
- findings:
  - `[low]` `[reject]` intent: the Log ← `Integration/Log/Context*` and Conditionable ← `tests/Conditionable` remaps have no entries of their own — the base directory entries already give those files to log and conditionable, and the spec's redundant rule would reject a duplicate entry; XT-46 asserts that each one resolves.
  - `[false]` `[reject]` intent: scoping test files to what phpunit.xml.dist selects, across all four repos — this is the spec's Always rule, the runner listing Story 2.7 cross-checks against, and Story 2.5 needs ai, mcp and boost.
  - `[maybe-false]` `[defer]` intent: contract FQCN tokens resolve to `contracts`, not to the implementing Component, under BlockedByComponentError — settled only once Epic 5 / Story 10.1 decide how the error attributes a contract token (contracts is always installed). If it is real, medium (unverified).
  - `[maybe-false]` `[defer]` intent: Code Owner enforcement is checked only in the repo (matcher and CODEOWNERS), not through GitHub rulesets — ruleset enforcement and the admin identity are retro epic-1 items 2 and 12, already waiting on the Maintainer. If it is real, medium (unverified).
  - `[false]` `[reject]` intent: the real-map assertions skip without a snapshot — XT-46's remap assertions read only the committed map and always run; the snapshot-backed parts run in component-map.yml after a sync, as in the 2.2 precedent.
  - `[low]` `[patch]` blind: records for non-Upstream Components (runtime, assert, …) pass — check now rejects any record outside the required set.
  - `[low]` `[reject]` blind+edge: an entry that more specific entries fully shadow is not flagged — the spec defines stale as "matches no test file"; it is a rare case, and catching it adds a second ownership pass.
  - `[low]` `[patch]` blind+edge: duplicate test paths inside one record pass parsing — the paths must now be strictly sorted, and a duplicate fails with its line number.
  - `[low]` `[patch]` blind: testFiles skips a selected directory or file that does not exist — it now throws, naming the path.
  - `[low]` `[reject]` blind+edge: `<exclude>` is applied across suites, and globs and self-closing elements are ignored — no Upstream phpunit.xml.dist uses any of these; supporting them adds parser branches.
  - `[low]` `[reject]` blind+edge: the binding regex matches commented-out calls and ignores `$singletons`/`$bindings` properties and `->alias()` — the derivation matches the map at this Pin, the providers' `$singletons` use class keys only, and any future drift shows up as alias drift.
  - `[low]` `[reject]` blind: there is no derive or print command — it adds public CLI surface; the drift lines name each expected owner.
  - `[false]` `[reject]` blind: the workflow test step passes without a snapshot — the earlier `upstream:sync` and `upstream:check` steps fail the job when the snapshot is absent or partial.
  - `[low]` `[patch]` / `[defer]` blind: the workflow has no timeout and is not a required check — added `timeout-minutes: 15`. Making it required is a ruleset change for the Maintainer (retro item 2), deferred.
  - `[low]` `[patch]` blind: the doc's failure-message table is incomplete — every emitted message is now listed.
  - `[low]` `[patch]` blind+edge: check() throws some errors and returns others — its doc comment now says it throws on a missing or unreadable snapshot.
  - `[low]` `[reject]` blind: the snapshot is scanned two or three times — the check takes seconds; caching adds plumbing for no user-visible gain.
  - `[low]` `[reject]` blind: the test hard-codes 1004 framework files — that is a deliberate pin of the snapshot state; Story 2.8's bump updates protected tests anyway.
  - `[low]` `[reject]` blind: readMap at module load breaks the whole file on a bad map — a bad map still fails loudly; the only cost is per-test granularity.
  - `[low]` `[patch]` verification-gap: the unclaimed-namespace branch is untested — added a fixture case that asserts the exact problem.
  - `[low]` `[reject]` edge: a duplicate JSON key inside a record — JSON.parse keeps the last value; a hand-signed map is reviewed as text; detecting it needs a custom scanner.
  - `[low]` `[patch]` edge: a framework Component can remap an ai, mcp or boost path — check now requires those repos' files to resolve to their own Component.
  - `[maybe-false]` `[reject]` edge: a missing ai/mcp src tree is skipped silently — upstream:check verifies every tree hash before this check; if real, it is only low.
  - `[low]` `[reject]` edge: a heredoc line starting with `class Foo` is taken for a declaration — Blade views are already excluded and the derivation matches the map; a PHP lexer is out of proportion.
  - `[low]` `[reject]` edge: a malformed composer.json error names no file — the snapshot is tree-hash verified, and it still fails closed.
  - `[maybe-false]` `[reject]` edge: symlinked test files are skipped — settled by checking whether any snapshot test path is a symlink; if real, only low.

## Design Notes

Precedence is what makes a remap possible without listing all 49 Support files. Two entries can conflict only when they have the same prefix: two different prefixes of the same length cannot both be prefixes of one path. So a remap like the one below is legal, and listing `framework/tests/Support/SupportArrTest.php` under two Components fails as doubly mapped:

```
{"component":"collections","tests":[{"path":"framework/tests/Support/SupportArrTest.php","tags":[]}, …], …}
{"component":"support","tests":[{"path":"framework/tests/Integration/Support/","tags":[]},{"path":"framework/tests/Support/","tags":[]}], …}
```

Container aliases cover the core table plus provider string bindings, which is what a Ported Test can resolve by string. Story 10.4 ports the alias → FQCN table itself. This map records only who owns each key.

## Verification

**Commands:**
- `bun test` -- expected: all pass, including XT-45..48
- `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run protected-paths:codeowners --check` -- expected: clean
- `bun run component-map:check` -- expected: exit 0 with counts (1004 framework files)

## Auto Run Result

Status: done

**Summary:** `conformance/component-map` now maps every Upstream test file that the runners select to exactly one Component: 1559 files in total, 1004 in framework, 338 in ai, 122 in mcp and 95 in boost. For each Component it also records the FQCN namespaces and classes it owns and the container aliases it owns. `tools/component-map/component-map.ts` parses the map and exports the lookups (`componentForTest`, `componentForFqcn`, `componentForAlias`). `component-map:check` validates the map against the snapshot:
- each repository's `phpunit.xml.dist` testsuites decide which files are test files;
- a file belongs to its most specific entry;
- the check fails on an unmapped, doubly mapped, stale or redundant entry;
- the FQCN ownership is derived from composer.json PSR-4 and the class declarations;
- the alias ownership is derived from `registerCoreContainerAliases` and the string bindings in the service providers.

A new read-only workflow, `component-map.yml`, runs the check on a synced snapshot.

**Files changed:**
- `tools/component-map/component-map.ts`: new. Parser, lookups, test-file selection, FQCN and alias derivation, the check, and the CLI.
- `conformance/component-map`: new. 41 records: 38 `src/Illuminate` Components plus ai, mcp and boost. It includes the hand remaps and the `deferred:foundation-cloud` tags.
- `.github/workflows/component-map.yml`: new. Sync, `upstream:check`, `component-map:check`, then the snapshot-backed Xaravel Tests.
- `conformance/tests/xaravel/component-map.test.ts`: new. XT-conformance-45..48.
- `docs/ops/component-map.md`: new operator note.
- `package.json`: adds the `component-map:check` script. `tsconfig.json`: includes `tools/component-map`.

**Review:** 31 findings: 0 high, 0 medium, 24 low, 3 false, 4 maybe-false.
- **Patched (low):**
  - a record for a non-Upstream Component fails;
  - a duplicate test path in one record fails;
  - a testsuite path that does not exist now throws;
  - ai, mcp and boost must own their own tests;
  - the doc comment says when `check()` throws;
  - a test covers an unclaimed namespace;
  - the workflow has a timeout;
  - the doc's failure-message table is complete.
- **Deferred:**
  - how contract tokens are attributed (Epic 5 or Story 10.1);
  - GitHub-level Code Owner enforcement (retro epic-1 items 2 and 12);
  - making `component-map / check` a required check (retro item 2).
- **Rejected:** each one has its reason in the Review Triage Log.

**Follow-up review recommendation:** false. Only low entries were patched (8 low, 0 medium, 0 high).

**Verification:**
- `bun test`: 50 pass, 0 fail.
- `typecheck`, `lint`, `workflows:check`, `protected-paths:codeowners --check`, `ownership:check`, `scaffold:check`, `graph:check` and `upstream:check`: clean.
- `component-map:check`: OK, 1559 files.

**Residual risks:**
- The FQCN and alias derivations use regular expressions over PHP source. They do not read comments, `$singletons`/`$bindings` properties, or `->alias()` calls outside Application.php. At this Pin they match the map, and drift fails loudly.
- `component-map / check` is advisory until the Maintainer adds it to the required checks.
- The XT-45 framework count (1004) must be updated at the next Pin bump.
