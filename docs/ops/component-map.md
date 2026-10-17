# The component map

`conformance/component-map` says which Component each Upstream test file belongs to, and which FQCNs and container aliases each Component owns (FR-1). The Inventory (Stories 2.4 and 2.5) takes its `component` field from it, and Epic 5's `BlockedByComponentError` uses its FQCN and alias records. The tool is `tools/component-map/component-map.ts`.

## Format

The map is JSONL: UTF-8 with LF line endings, one record per Component per line. Lines starting with `#` are comments and are ignored. Blank lines are not allowed.

```
{"component":"collections","tests":[{"path":"framework/tests/Support/SupportArrTest.php","tags":[]}],"namespaces":[],"classes":["Illuminate\\Support\\Arr"],"aliases":[]}
```

- `component` is a `name` row of `tools/scaffold/packages.jsonl`. Every Upstream Component (each `src/Illuminate/<Dir>`) has a record, even with no tests (`contracts`), and so do `ai`, `mcp` and `boost`.
- Records are sorted by `component`. `tests` is sorted by `path`, and every other array is sorted, with no duplicates.
- `tests[].path` is relative to `conformance/upstream/` and starts with the repository name (`framework/tests/…`). It is an exact file, a directory prefix ending in `/`, or a name prefix ending in `*`.
- `tests[].tags` holds `deferred:<item>` tags, with `<item>` in kebab-case. For example, `deferred:foundation-cloud`.
- `namespaces` holds namespace prefixes ending in `\`. `classes` holds exact FQCNs, with no leading `\`.
- `aliases` holds the container keys the Component owns.

The map is hand-signed data. The tool only reads it and never rewrites it.

## Precedence

A test file belongs to its most specific matching entry: an exact file first, then the longest prefix. That is how a remap works without listing every file in a directory. For example, `framework/tests/Support/SupportArrTest.php` under `collections` overrides `framework/tests/Support/` under `support`. Two different prefixes of the same length cannot both match one path, so two entries conflict only when they have the same prefix.

A test file is a file that the repository's `phpunit.xml.dist` testsuites select. That means every `<directory>` with its `suffix` (default `Test.php`), plus every `<file>`, minus any `<exclude>`. Pest reads the same file. So `tests/AfterEachTestExtension.php`, `TestCase.php` files and mcp's `tests/Conformance/` are not test files.

FQCNs follow the same idea: an exact class in `classes` first, then the longest namespace prefix. A namespace belongs to the Component whose composer.json PSR-4 declares it, and Foundation, which has no composer.json, owns `Illuminate\Foundation\`. Several Components share `Illuminate\Support\`. Support owns that namespace because its directory is the one the namespace names. Collections, Conditionable, Macroable and Reflection each list every class, interface, trait and enum that their `src` directory declares. Blade templates are not scanned.

Aliases are the keys of `Application::registerCoreContainerAliases`, plus every string-literal key that a `*ServiceProvider.php` binds with `singleton`, `bind`, `scoped` or `instance` (or the `If` forms). A provider-bound key belongs to that provider's Component. A core key that no provider binds belongs to the owner of its first listed FQCN. That is why `config` goes to config and `request` goes to http.

## Checking it

```
bun run upstream:sync
bun run component-map:check
```

The check reads only the snapshot and never fetches. It prints the test-file count for each repository and exits 0 when the map is current. It exits 1 when there is any problem, and 2 on a usage error. Map problems are listed under `Component map check failed (FR-1):`. A missing or unreadable snapshot stops the check with one line, `Component map check failed: <reason>`. The `component-map` workflow runs it on every PR, in the merge queue and on `main`, together with the snapshot-backed parts of `conformance/tests/xaravel/component-map.test.ts`. Plain `bun test` skips those parts when the snapshot is absent.

| Message | Meaning and fix |
| --- | --- |
| `unmapped: <path>` | No entry matches a test file. Add an entry, or widen one. |
| `doubly mapped: <path> (<a>, <b>)` | Two entries with the same prefix match the file. Keep one. |
| `stale: <entry> (<component>) matches no test file` | The entry matches nothing, for example after a file was renamed Upstream. Remove it or fix it. |
| `redundant: <entry> (<component>) overrides <other> with the same Component and tags` | The override changes nothing. Remove it. |
| `conformance/component-map:<line>: …` | A bad record: malformed JSON, an unknown Component, unsorted records or arrays, a bad tag or a bad path. |
| `conformance/component-map: no record for Upstream Component <c>` | Add a record for the Component, even an empty one. |
| `fqcn drift: <fqcn> is owned by <owner>, expected <component>` | A declaration resolves to the wrong Component. Usually a shared-namespace Component is missing a class in `classes`. |
| `fqcn drift: namespace … appears twice` / `class … appears twice` | List each namespace or class under one Component only. |
| `fqcn drift: class <fqcn> is listed under <c>, but …` | The class is not declared in the snapshot, or a namespace already owns it. Remove it. |
| `alias drift: <alias> expected <a>, map has <b>` | An alias is missing, extra or under the wrong Component. Move it to the expected Component. |
| `alias drift: <alias> is bound by providers of <a> and <b>` | Two Components' providers bind the same key. Raise an Escalation, because the map cannot give the key one owner. |
| `conformance/upstream/<name> is missing; run bun run upstream:sync` | There is no snapshot. Sync it first. |
| `conformance/component-map: <c> is not an Upstream Component` | The record names a package-table row that is not an Upstream Component (`runtime`, say). Remove it. |
| `conformance/component-map: the file must end with a newline` | Add the final LF. |
| `repo ownership: <path> resolves to <c>, but every <repo> test belongs to <repo>` | A framework Component's entry claims an ai, mcp or boost test. Remove that entry. |
| `fqcn drift: <fqcn> is declared by both <a> and <b>` | Two Components' sources declare the same FQCN. Raise an Escalation. |
| `fqcn drift: namespace <ns> is shared by <a>, <b> and names none of them` | A PSR-4 prefix is shared and no sharer's directory matches the namespace's last segment. Raise an Escalation. |
| `fqcn drift: namespace <ns> is listed under <c>, but its composer.json PSR-4 owner is <owner>` | The namespace belongs to another Component, or to none. Move it or remove it. |
| `fqcn drift: namespace <ns> is owned by <c> in the map, expected <owner>` | A PSR-4 namespace is missing from its owner's record. Add it there. |
| `alias drift: <alias> appears twice (<a>, <b>)` | List each alias under one Component only. |
| `alias drift: core alias <alias> is bound by no provider and its first FQCN <fqcn> is not declared in the snapshot` | The owner cannot be derived. Raise an Escalation. |
| `conformance/upstream/<name>/phpunit.xml.dist selects <rel>, which does not exist` | A testsuite path is missing from the snapshot. Run `bun run upstream:sync`. If the path is still missing, Upstream renamed a suite: fix the snapshot, not the map. |

## Changing the map

`conformance/component-map` is a Protected Path, covered by `/conformance/` in `conformance/protected-paths`, so `.github/CODEOWNERS` assigns it to the Maintainer. A change lands only through an Infrastructure Story that has the Maintainer's Code Owner review, and that review is the sign-off on every entry. After a Pin bump, run the check. Then fix each stale, unmapped or drift line by hand, and review the class and alias arrays against the tool's derivation.
