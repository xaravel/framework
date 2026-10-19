# Lint

`bun run lint` is the lint gate every PR runs (AD-28.1): CI's required `ci.yml#check` job runs it, so a lint failure fails the PR (Stories 6.1, 6.2; NFR-3, AD-6, AD-16.4). It is two commands, chained:

```sh
bun --bun oxlint --type-aware && bun run lint:disables
```

## oxlint (`.oxlintrc.json`)

oxlint 1.88.0 with oxlint-tsgolint 7.0.2004 (root `devDependencies`), run type-aware. The root `.oxlintrc.json` enables the `correctness` category as errors, and these rules at the top level, so they apply to every linted path: `packages/*/src`, `packages/*/tests`, `skeleton/` and the compiled-view snapshots (which land under `packages/view/tests/`, Story 49.1):

| Rule | Setting | Why |
| --- | --- | --- |
| `typescript/no-floating-promises` | `["error", {"checkThenables": true}]` | an unawaited Promise, or an unawaited thenable Builder, Relation or `PendingRequest` (AD-6) whose terminal never runs |
| `typescript/await-thenable` | `"error"` | `await` on a value that is not a Promise or thenable |
| `typescript/no-misused-promises` | `["error", {"checksVoidReturn": true}]` | an async callback passed where a `void` return is expected, whose rejection nobody sees |
| `unicorn/no-thenable` | `"off"` | AD-6 makes Builders, Relations and `PendingRequest` thenable by design |

`checkThenables` fires only for a `then` typed as `PromiseLike`. The config has no `overrides`, and no `ignorePatterns` entry may match `packages/` or `skeleton/` files. `.oxlintrc.json` is plain JSON (no comments): tests read it with `JSON.parse`, so the rationale lives here.

The committed fixtures in `tools/lint-rules/fixtures/async-safety/` prove the rules: `floating-thenable.ts`, `await-plain.ts` and `misused-void-callback.ts` each fail one rule, and `passing.ts` holds the same three patterns done right. The root config ignores the fixtures directory so `bun run lint` stays green; XT-conformance-129 and XT-conformance-130 copy the fixtures into temp roots and lint them with the real config, from the repository root (oxlint finds tsgolint from the cwd), with `--format unix`.

## The `xaravel` plugin (`tools/lint-rules/plugin.ts`)

Story 6.2 adds an oxlint JS plugin, loaded by the root config's `"jsPlugins": ["./tools/lint-rules/plugin.ts"]`, with six rules for the spine's identity, value and test-hygiene conventions. Each is `"error"` at the top level of `.oxlintrc.json` and a spine rule (`SPINE_RULES`), so no directive or config may switch it off. The rules need no type information. Each message names the AD it enforces.

| Rule | Scope | Reports | Why |
| --- | --- | --- | --- |
| `xaravel/no-identity-constructor-name` | every linted file except the grader's locations (`packages/assert/`, `packages/mockery/`, `conformance/`, `tools/`), which cannot call `fqcn()` under AD-15's grader isolation, so their class-name reads are display only (ruling [decisions/ESC-6.2-1.md](../../decisions/ESC-6.2-1.md)) | a read of `<expr>.constructor.name`: dot, optional (`?.`) or computed string access, and `const { name } = <expr>.constructor` (also in an assignment). A bare identifier called `constructor` is not matched | identity is `fqcn()` (AD-10) |
| `xaravel/no-framework-json-stringify` | `packages/<p>/src/` where `<p>` is not a grader package (`assert`, `mockery`) | any reference to `JSON.stringify`, `JSON["stringify"]` or `globalThis.JSON.stringify`, called, aliased or destructured (`const { stringify } = JSON`) | encode with `jsonEncode` / `phpSerialize` (AD-23). "On a framework value" needs types the rule does not have, so it bans every reference; `jsonEncode` covers any legitimate need |
| `xaravel/no-ported-bun-expect` | files under a `tests/ported/` directory | a value import or re-export of `expect` (any alias) from `bun:test`, a namespace import or `export *` of `bun:test`, `import("bun:test")`, `require("bun:test")` and `<obj>.require("bun:test")` (`import.meta.require`). Type-only imports are not matched | Ported Tests use only `portedTest(...)` and `@xaravel/assert` (AD-15) |
| `xaravel/no-type-import-injection` | every linted file | an identifier bound by `import type {X}` or `import {type X}` (any module) referenced in value position inside the arguments of an `inject(...)` call or `@inject(...)` decorator (callee `inject` or `<obj>.inject`). Type arguments, annotations and non-computed keys are not references | a contract injected must be imported as a value (AD-1); tsc reports the same misuse as TS1361 |
| `xaravel/no-model-private` | `packages/database/src/Eloquent/Model.ts` and `packages/database/src/Eloquent/Concerns/**` | every `#private` name: field, method, accessor, `this.#x`, `#x in o` | the `Model` Proxy cannot reach `#private`; use a Symbol slot (AD-7) |
| `xaravel/no-package-default-export` | `packages/<p>/src/` and `installer/src/` | `export default`, `export { x as default }`, `export { default } from`, `export * as default from` | named exports only (AD-3). Skeleton app convention files (`config/*.ts`, migrations) are outside the scope, so they may default-export |

A path scope tests the file's path relative to the cwd when it is inside it, else its absolute path, matched by segment (`(^|/)packages/[^/]+/src/`), so the rules hold on the real tree and on temp roots. The grader exemption is anchored: a cwd-relative path must start with a grader location, and an absolute path is judged from its first root-level segment (`packages/<p>/`, `conformance/`, `tools/`, `skeleton/`, `installer/`), so a nested `packages/demo/src/tools/` is not exempt. The root config must keep `./tools/lint-rules/plugin.ts` in `jsPlugins` (a string or `{ "specifier": … }` entry); `lint:disables` fails a root config that drops or repoints it. Rule names are compared by their last `/` segment, so a custom rule's name must not collide with an oxlint built-in (hence `no-package-default-export`, not `no-default-export`).

The committed fixtures in `tools/lint-rules/fixtures/identity-values/` prove the rules: `constructor-name.ts`, `json-stringify.ts`, `ported-expect.ts`, `type-import-injection.ts`, `model-private.ts` and `default-export.ts` each fail one rule at its scoped path; `passing.ts`, `passing-expect.ts` and `passing-ported.ts` hold the near-misses (named exports, a `jsonEncode`-style call, `fqcn(x)`, a value-imported token in `inject`, a `MODEL_STATE` Symbol slot, a parameter named `constructor`, `expect` outside `tests/ported/`, a type-only `expect` import); `support.ts` stands in for `inject`, `fqcn`, `jsonEncode` and a contract token. `type-import-injection.ts` carries a `@ts-expect-error` for TS1361 so the fixtures typecheck. XT-conformance-132 copies them into temp roots at each rule's placements, adds inline edge cases, and lints them with the real config from the repository root with `--format unix`.

## No disabling (`bun run lint:disables`)

AD-16.4: an `oxlint-disable` of any rule the spine names fails CI.

```sh
bun run lint:disables                                   # the real repository
bun --no-env-file tools/lint-rules/disables.ts --root <dir>
```

It reads only, and checks:

- **Directives.** Every file oxlint lints (`git ls-files -co --exclude-standard` with oxlint's extensions `.ts .tsx .mts .cts .js .jsx .mjs .cjs`, minus the root `ignorePatterns`) is tokenized, so only real `//` and `/* */` comments count, never text inside a string, template literal or regex. A comment starting `oxlint-disable`, `oxlint-disable-line`, `oxlint-disable-next-line` or an `eslint-` spelling is a directive. Its rule list is the comma-separated text up to a ` -- ` description. A rule is compared by its last `/` segment, so `no-floating-promises`, `typescript/no-floating-promises` and `@typescript-eslint/no-floating-promises` are the same rule. A directive naming a spine rule fails; so does one naming no rule, since it disables every rule. Directives for other rules (`no-control-regex`, `typescript/unbound-method`, …) are allowed.
- **Configs.** The root `.oxlintrc.json` and every nested `.oxlintrc.json` / `.oxlintrc.jsonc` must leave each spine rule at `error` with its options. A nested config replaces the root's for its directory unless it `extends` it, so a nested config that omits a spine rule disables it and fails. An `overrides` entry that lowers or weakens a spine rule fails, as does a `plugins` list without `typescript`, a config that does not parse, and an `oxlint.config.*` JS config (the check cannot read one).
- **Ignores.** No `ignorePatterns` entry in any config (matched relative to that config's directory), and no line of a root `.eslintignore` (which oxlint honours by default), may exclude a protected path. The protected paths are fixed probes under `packages/*/src`, `packages/*/tests`, `skeleton/` and the compiled-view snapshots, one `packages/demo/src/Demo<ext>` per linted extension, and every listed linted file under `packages/*/src`, `packages/*/tests` and `skeleton/`. The violation names the entry and the first path it excludes.

Each violation is one stderr line, `<path>:<line>:<col>: <message> (AD-16)`. Exit codes: 0 none (prints `lint disables: ok (<n> files)`), 1 any violation, 2 usage error. XT-conformance-131 covers it.

## Adding a spine rule (Story 6.3)

The spine's rules live in one constant, `SPINE_RULES` in `tools/lint-rules/disables.ts`; a rule that must carry options also gets an entry in `SPINE_RULE_OPTIONS`. A Story adding a custom rule adds it to the `xaravel` plugin, appends its name (the last `/` segment) to `SPINE_RULES` and sets the rule to `error` at the top level of `.oxlintrc.json`. From then on the root config must hold it and no directive may disable it. Story 6.2 did this for the six rules above.
