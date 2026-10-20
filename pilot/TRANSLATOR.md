# Pilot translator brief (Story 8.7, pilot/porting branch only)

You are a fresh-context translator in the PORTING.md pilot. You port a handful of Laravel Upstream PHPUnit tests to Xaravel Ported Tests (TypeScript, Bun) by following `PORTING.md` alone. The point of the pilot is to find where `PORTING.md` does not decide something, so record honestly every rule you apply and every point it leaves open.

Working tree: `/Users/ea/repos/xaravel-pilot` (branch `pilot/porting`). Use absolute paths.

## Your only inputs

You may read ONLY these:

1. `/Users/ea/repos/xaravel-pilot/PORTING.md`
2. The Divergence Records `/Users/ea/repos/xaravel-pilot/decisions/DIV-1.md` .. `DIV-12.md` (only the `DIV-*.md` files in `decisions/`)
3. The public API of `@xaravel/assert` and `@xaravel/mockery`: `/Users/ea/repos/xaravel-pilot/packages/assert/src/**` and `/Users/ea/repos/xaravel-pilot/packages/mockery/src/**` (read their exports and signatures; start at each `src/index.ts`)
4. The generated declaration-only modules in `/Users/ea/repos/xaravel-pilot/pilot/types/**` and `/Users/ea/repos/xaravel-pilot/pilot/tsconfig.json`, which say what each import specifier resolves to: `@xaravel/collections`, `@xaravel/support`, `@xaravel/support/facades`, `@xaravel/contracts/<ns>`, `@xaravel/runtime`, `@xaravel/runtime/php`. They declare types only; every type is `any`.
5. The Upstream source `/Users/ea/repos/xaravel-pilot/conformance/upstream/framework/tests/Support/**` (your test file, its data providers, and its fixtures under `Fixtures/`)

Do NOT read anything else: not other packages' source, not `_bmad-output/`, `stories/`, `conformance/tests/`, `conformance/inventory/`, `tools/`, `AGENTS.md`, the architecture or PRD, other escalations or decisions, and not the other translators' files under `packages/*/tests/ported/` or `pilot/logs/`. Do not search the web.

## What to write

1. The Ported Test file at the path given in your task. Its FIRST line is exactly:
   `// pilot/porting: Story 8.7 pilot translation, never merged`
   Port every Test ID assigned to you, and only those tests (a provider row `X#k` means port test `X` with its full data provider as `dataset`; the other rows of that dataset come along). Keep Upstream's test method order and every assertion. Port the helper/fixture classes the tests need into the same directory (`Fixtures/<Name>.ts`, or local to the test file), each fixture file also starting with the marker line.
2. A JSON log at the path given in your task: an array with one object per assigned Test ID, in the given order:
   `{ "id": "<Test ID>", "rules": ["<rule>", ...], "ambiguities": [{ "point": "<what PORTING.md did not decide>", "choice": "<what you did>" }] }`
   A `<rule>` names a PORTING.md rule as `<## section title> / <rule label>`, where the label is the bold lead of a bullet (`Test-adaptation rules / Shape`), a construct or idiom table row's first cell (`Construct mapping (AD-26) / ArrayAccess`, `Idiom table / ==`), or a mechanical-rule table row's PHP cell (`Mechanical expression rule / named arguments`). Use exactly the same string each time you cite the same rule. List every rule you applied for that Test ID. An ambiguity is any point where you had to decide something PORTING.md (with the DIV records) does not settle; be specific (the construct, the line, the candidate readings). Repeat it on every Test ID it affects.

## Rules of the pilot

- Follow `PORTING.md`'s § Test-adaptation rules: `portedTest('<Test ID without #key>', { case?, dataset? }, async function () { ... })`, assertions only through `@xaravel/assert` (never `expect` from `bun:test`). Every changed assertion line carries `// adapted:DIV-<n>.<k>` naming an existing clause.
- Never weaken an expected value, remove an assertion or add a skip. If something cannot be ported under PORTING.md and a DIV clause, keep the assertion as close to Upstream as you can and record the ambiguity.
- Do not implement any Collection/Arr/Str/Stringable behaviour. The packages are empty; your file only has to type-check against the declarations.
- Type-check: `cd /Users/ea/repos/xaravel-pilot && bunx tsc --strict --noEmit -p pilot/tsconfig.json`. It must report no error in YOUR files (other translators work in parallel; ignore errors in their files). Do not edit `pilot/types`, `pilot/tsconfig.json` or anything outside your own output files. Do not use `any` casts, `// @ts-ignore` or `@ts-expect-error` to silence an error; if a declaration seems to be missing, record it as an ambiguity and write the most faithful code that compiles.
- Do not commit; the coordinator commits.

When done, reply with: the files you wrote, the tsc result for your files, and a short list of the ambiguities you recorded.
