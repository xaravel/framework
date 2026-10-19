# Epic 6 Context: Static guardrails: lint rules, async surface & API-surface diff

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Catch the mistakes agents make most often before review, and do it mechanically: floating Promises, identity taken from `constructor.name`, stray writes to singleton state, async-ness chosen ad hoc, and silent drift of the public API away from Upstream Laravel. Epic 6 builds the type-aware oxlint configuration, the custom `tools/lint-rules`, the `async-surface.json` generator and drift check, the API-surface `.d.ts` diff with its gate command, and the duplicate-FQCN/registration scan. Every later Story runs these checks in CI, so the conventions hold across Components built in parallel. Most framework code does not exist yet, so each rule is proven on fixtures now and then applies to packages as they are written.

## Stories

- Story 6.1: Type-aware async-safety lint
- Story 6.2: Lint rules for identity, values and test hygiene
- Story 6.3: Lint rules for async signatures, frame state and declarations
- Story 6.4: `async-surface.json` generator and drift check
- Story 6.5: API-surface diff
- Story 6.6: Duplicate-FQCN and registration scan

## Requirements & Constraints

- **Kind.** This is a Conformance System Epic. Its tooling lives under `tools/`, which is Protected, along with `.oxlintrc.json`, the root `package.json` and `.github/`. Changes there go through Maintainer Code Owner review.
- **Verification shape.** Every acceptance criterion is verified by an `XT-conformance-<n>` Xaravel Test (`xaravelTest(...)`). Each test runs the rule over a failing fixture, which must fail and name the rule, and over a passing fixture, which must pass.
- **Async-safety lint.** The type-aware rules `no-floating-promises` (with `checkThenables: true`), `await-thenable` and `no-misused-promises` (with both `checksVoidReturn: true` and `checksConditionals: true`) are errors. They run over `packages/*/src`, `packages/*/tests`, `skeleton/` and the compiled-view snapshots. Every Story's CI includes this lint.
- **Pinned options.** `lint:disables` must fail on any config that turns off `checksConditionals` (or any other pinned option), and a fixture that uses a Promise as a condition must fail lint. Story 6.6 carries this follow-up from an Escalation raised in Story 6.1.
- **No disabling.** An `oxlint-disable` comment for any rule the architecture names fails CI and reports the comment's location.
- **Custom rules (`tools/lint-rules`).** Each rule fails on its fixture and reports the rule's name:
  - `constructor.name` used for identity;
  - `JSON.stringify` on framework values in `packages/*/src`;
  - `expect` imported from `bun:test` under `tests/ported`;
  - a contract imported with `import type` for injection;
  - `#private` in `Model` or its concerns;
  - a default export from a package;
  - a public method returning `T | Promise<T>`;
  - a thenable returned from an `async` function;
  - a `this.<field>` assignment after construction in a class listed in `singletons.json`;
  - an arrow-function test body in a file that calls `uses()`;
  - `inject({...})` keys whose names or order differ from the parameter list;
  - a non-constant model column default;
  - a write to a property listed in `conformance/boot-only-state` outside the class's `register` / `boot` path.
- **Boot-only-state cleanup.** The known false entries in `conformance/boot-only-state` (for example `QueueManager::$connectors` and `Gate::$afterCallbacks`) must be removed by fixing the scan rule and regenerating. Never edit the file by hand.
- **Async surface.** `bun run async-surface <pkg>` uses `oxc-parser` to walk the package's emitted `.d.ts` and writes `async-surface.json`, one line per public method that returns a Promise or a thenable, with the root named in its `@asyncRoot` tag.
  - The thenable type list comes from `@xaravel/contracts/async` when that package is installed, and from the tool's fixture list otherwise.
  - A public method that returns a Promise and has no tag fails the check, which names the method.
  - In the merge queue, any difference between the committed file and the regenerated one fails and prints the diff.
- **API-surface diff.** Compare each package's `.d.ts` with `conformance/api-surface/<component>.jsonl`.
  - **What it reports:** missing, renamed and extra members, plus mismatches in parameter names, defaults and nullability.
  - **Parity mappings, applied before comparing:** camelCase, named arguments taken as an options object, and the DIV-12 renames.
  - **Explained members:** an extra member is explained by a cited entry in `additions.jsonl`, and a missing member by a cited entry in `exceptions.jsonl`.
  - **On a PR:** it posts a per-Component summary and never fails the PR.
  - **Gate:** `bun run api-surface:gate <component>` fails while any member is unexplained. A Component's last Epic is accepted against this command.
  - **Export cross-check:** after the export loads, `get_declared_classes()` is compared with every class file under Upstream `src/`. Any class the static scan missed fails the check, which names it.
- **Registration scan** over `packages/*/src` fails in three cases:
  - the same FQCN is passed to `registerClass` in two packages (it names both);
  - a framework file exports a public class but does not end with `registerClass('<FQCN>', X)` (it names the file);
  - any package `package.json` sets `"sideEffects": false`.

## Technical Decisions

- **Toolchain.** Bun 1.4.3, TypeScript 7.0.2 (`tsc --strict`), oxlint 1.88.0 and oxlint-tsgolint 7.0.2004, and `oxc-parser` for walking declarations. Do not use ESLint, Prettier, Node, npm, Jest or Vitest.
- **Async model.** Async-ness is decided by rule, not by each agent.
  - Async roots are a fixed set of Driver-contract methods that perform IO.
  - A public method is async if and only if it reaches a root, or it accepts a callback that is allowed to be async (gates, listeners, validation rules, middleware and so on). A method that is async on any path is async on every path.
  - Each async method carries `@asyncRoot <Contract.method>` or `@asyncRoot callback`. JSDoc survives `.d.ts` emission.
  - Builders, Relations and `PendingRequest` are thenables: awaiting one runs its terminal.
  - The CI tiers: PRs run lint and typecheck, and the merge queue regenerates `async-surface.json` and runs the API-surface diff.
- **Identity.** Identity is `fqcn()` only, backed by the Class Registry in `@xaravel/runtime/registry`, keyed by PHP FQCN. Every framework class file ends with `registerClass(...)`. Third-party symbols such as Symfony and Carbon each have exactly one owning package, registered under the original FQCN, and the duplicate-FQCN scan enforces this.
- **Per-unit state.** Per-request state lives in Scope Frame slots. `tools/lint-rules/singletons.json` is generated from Upstream's `singleton()` bindings at the Pin, plus Xaravel's own singletons. `conformance/boot-only-state` lists properties that may be written only before the Application is sealed.
- **Values.** Encode with `jsonEncode` / `phpSerialize` from `@xaravel/runtime/php`. `null` is the only absent value, and the API-surface check is also where returning `undefined` gets caught.
- **Injection.** `inject({ param: Spec })` is a TC39 decorator. Key order is parameter order and key names are parameter names. Never set `experimentalDecorators`.
- **Eloquent.** The `Model` Proxy forbids `#private`. A column default must be a constant expression.
- **Tests.**
  - Ported Tests use only `portedTest` and `@xaravel/assert`.
  - Pest-style app tests that call `uses()` must use `function` bodies, not arrow functions.
- **Packages.** Named exports only, with no default exports from packages. App convention files such as `config/*.ts` and migrations are exempt.

## Cross-Story Dependencies

- **Inputs from earlier Epics.**
  - Epic 1 provides `.oxlintrc.json`, the scaffolded packages and the Protected Paths check.
  - Epic 3 provides the Upstream scans: the API-surface export (`oracle:api-surface`, the additions and exceptions files), `singletons.json`, `conformance/boot-only-state` and the DIV-12 pair list.
  - Epic 5 provides the harness, the CI pipeline and the merge queue these checks plug into.
- **Within this Epic.**
  - Stories 6.2 and 6.3 share the `tools/lint-rules` infrastructure.
  - Story 6.3 consumes `singletons.json` and `boot-only-state` from Epic 3, and its fix to the boot-only-state scan touches Epic 3's scan tooling.
  - Story 6.5 adds the get_declared_classes cross-check to the Epic 3 export.
  - Story 6.6 also extends Story 6.1's lint config and its `lint:disables` check (the `checksConditionals` pin).
- **Downstream consumers.**
  - Every Component Epic commits `async-surface.json` and closes on `api-surface:gate`.
  - Story 10.5 (Contracts) later supplies the thenable list in `@xaravel/contracts/async`, which the Story 6.4 tool must prefer when that package is installed.
  - Epic 7's dashboard shows the per-Component API-surface diff.
