# Lint

`bun run lint` is the lint gate every PR runs (AD-28.1): CI's required `ci.yml#check` job runs it, so a lint failure fails the PR (Story 6.1; NFR-3, AD-6, AD-16.4). It is two commands, chained:

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

## Adding a spine rule (Stories 6.2, 6.3)

The spine's rules live in one constant, `SPINE_RULES` in `tools/lint-rules/disables.ts`; a rule that must carry options also gets an entry in `SPINE_RULE_OPTIONS`. A Story adding a custom rule appends its name (the last `/` segment) there and sets the rule to `error` at the top level of `.oxlintrc.json`. From then on the root config must hold it and no directive may disable it.
