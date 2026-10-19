# API-surface diff (`bun run api-surface`)

AD-15 holds each package's public TypeScript surface to Upstream's: every public Upstream class member must exist in the port under its mapped name, with the same parameter names, defaults and nullability, unless a cited line explains the gap. `bun run api-surface` diffs each package's emitted `.d.ts` against the Upstream export `conformance/api-surface/<component>.jsonl` ([oracle.md](oracle.md#api-surface-bun-run-oracleapi-surface)) and reports the findings; `bun run api-surface:gate` fails while any is unexplained (Story 6.5; AD-15, AD-9, AD-26, DIV-12).

```sh
bun run api-surface <component>…                     # one summary line per component; always exits 0
bun run api-surface --all                            # every component, sorted
bun run api-surface --details <component>…           # one line per finding, then the summary
bun run api-surface --all --markdown <file>          # also writes the per-Component table (CI's job summary)
bun run api-surface:gate <component>…                # exits 1 while anything is unexplained
bun --no-env-file tools/api-surface/api-surface.ts --root <dir> …   # a temp root (tests)
```

A component is a `conformance/api-surface/<name>.jsonl` other than `additions.jsonl` and `exceptions.jsonl`; its package is `packages/<name>`. An unknown component, or neither a component nor `--all`, exits 2 naming it. A tool failure (tsc fails, a jsonl file is unreadable or invalid, a declaration or source does not parse) exits 1 with the reason.

A Component's last Epic is accepted against `bun run api-surface:gate <component>` (AD-15): zero unexplained members.

## How it works

1. **Build.** The packages with a `packages/<c>/package.json` are built with one `tsc -b`, Story 6.4's helper (`emitDeclarations` in `tools/async-surface/async-surface.ts`), and their `<tsconfig outDir>/src/**/*.d.ts` are read with its `packageDeclarations` (a deleted source's stale `.d.ts` is dropped). A component without a package has no declarations: everything is missing.
2. **Registrations.** In each `packages/<c>/src/**/*.ts` (not `.d.ts`, parsed with `oxc-parser`, `lang: "ts"`), a top-level statement `registerClass('<FQCN>', X)` (a string literal and an identifier) maps the FQCN to that file and local name `X` (AD-10). The first registration of an FQCN wins; the duplicate scan is Story 6.6's.
3. **Members.** A registered class's members are the public members of every `class` and `interface` named `X` in that file's `.d.ts`, merged; `private`, `protected`, `#private` and computed keys are skipped. A method (`constructor` counts as `__construct`), a getter or setter (a property), a field or accessor (a property; a function-typed one also counts as a method signature), an interface method or property signature. Overloads of one name are one member with several signatures. Functions are the exported `declare function`s of any `.d.ts` in the package.
4. **Defaults** are read from the source: the class (or function) of the same name in the source `.ts`, from the implementation's parameter initializers, by position.

## Parity mappings

Upstream names map to Xaravel names before comparing:

- Methods, properties, parameters and functions (the short name after the last `\`) go through `camel()`: each `_x` after a letter or digit becomes `X`; leading underscores are kept (`get_id` → `getId`, `_private_name` → `_privateName`).
- `__construct` → `constructor`, `__toString` → `toString`; other magic methods keep their name.
- Constants and enum cases keep their name and are matched as static properties.
- **DIV-12** (`conformance/scans/div12-pairs.jsonl`, keyed `class` + `name`): `option-pair` → the Upstream property and the method `name` on that class are not expected; `method-plus-state` → the property is not expected; `model-config` → the property is expected and the method is not expected under its name (its new name is cited in `exceptions.jsonl` / `additions.jsonl`, since the pair list holds no target). Members that are not expected are reported as `div12` and never counted.
- **Options form (AD-26).** When Upstream has two or more optional non-variadic parameters, a signature may take the required ones positionally and then one options parameter whose type (or a union member, or an interface or type alias of that name in the package's `.d.ts`) is a type literal whose keys are exactly the optional parameters' `camel()` names.

## Findings

| Category | What |
| --- | --- |
| `missing` | an Upstream declaration with no registration (its members are not listed separately), a member of a registered class, or a function, with no Xaravel counterpart |
| `extra` | a registered FQCN the component's file lacks, or a member of a matched class with no Upstream counterpart (`constructor` is extra only if Upstream has no `__construct`) |
| `renamed` | an unmatched Upstream member and an unmatched Xaravel member of one class whose mapped names are equal case-insensitively (`getURL -> getUrl`) |
| `mismatch` | a matched member whose every signature fails a check below; the details come from the signature with the fewest failures (the first on a tie) |
| `div12` | an Upstream member DIV-12 says is not expected; not counted |
| `stale` | a citation line that explains nothing; listed, not counted |

**Signature checks**, per Upstream parameter by position:

- the name is `camel(name)`, unless that is an ECMAScript reserved word (`default`, `class`, `function`, …, which cannot name a parameter; PORTING.md's renaming convention, AD-26), when any name passes;
- variadic ↔ a rest parameter; optional ↔ TS `?` or rest;
- when both defaults are comparable literals (PHP `null`, `true`, `false`, an int, a float, `'…'`, `[]`; a TS initializer `null`, a boolean, a number with an optional unary `-`, a string, `[]`, `{}`), they are equal; PHP `[]` matches `[]` or `{}`;
- when the PHP `type` is not null: PHP `nullable` ↔ the TS type is absent or contains `null`, `any` or `unknown` (a rest parameter's element type);
- a missing or an extra TS parameter fails.

Returns: any `undefined` in the TS return type fails (AD-9); when PHP `returns` is not null, `void` or `never`, nullability must agree after unwrapping `Promise<…>` / `PromiseLike<…>`. Properties: the same nullability rule on the property type. `static` must agree for every member kind (a constant or case must be a static property).

## Explained items

`conformance/api-surface/exceptions.jsonl` and `additions.jsonl` are Protected, hand-written through Maintainer review, and validated by `bun run oracle:api-surface --check` ([oracle.md](oracle.md#citation-files)); this tool only reads them.

- A `missing` or `mismatch` item is explained by an `exceptions.jsonl` line with its component, FQCN and Upstream member name, or `member: null` for the whole declaration and its members.
- An `extra` item is explained by an `additions.jsonl` line with the Xaravel member name, or `member: null` for the whole class.
- A `renamed` item needs both: an exception for the Upstream name and an addition for the Xaravel name.
- An exact member line is preferred to a `null` line. A line that explains nothing is listed as `stale`.

## Output

Report mode, per component (with `--details`, its item lines first):

```
<c>: <category> <kind> <fqcn>[::<member>[ -> <xaravel name>]][: <details>][ (explained: <citation>)]
api-surface <c>: <n> Upstream, <m> matched, <a> missing, <b> renamed, <e> extra, <x> mismatched, <d> div12; <u> unexplained (AD-15)
```

`Upstream` counts the component file's lines; `matched` counts registered declarations and the members and functions that matched with no mismatch. `--markdown <file>` writes a table with the columns Component, Upstream, Matched, Missing, Renamed, Extra, Mismatched and Unexplained, and a Total row. Gate mode prints every unexplained item, then `api-surface:gate <c>: <u> unexplained (AD-15)` per component, and exits 1 if any count is not zero.

Every Component package is a scaffold today, so `--all` reports nearly everything missing. That is expected: only the gate, run at a Component's last Epic, enforces it.

## CI

`.github/workflows/api-surface.yml#report` runs on `pull_request` (main) and `merge_group`, with `contents: read` only. It runs `bun run api-surface --all --markdown …` and appends the table to the job summary, shown on the PR's checks page. A tool failure becomes a `::warning` and a note in the summary; the step ends with `exit 0`, so the report never fails a PR, and it is not a required check. There is no PR comment: that needs `pull-requests: write`, which AD-16 reserves for the Oracle, dashboard and release jobs. The dashboard (Epic 7) is the other display AD-15 names.

## The export's class-list cross-check

The Upstream export reflects the FQCNs a static scan lists (tools/component-map's `declaredClasses`); a class that scan misses would vanish from the surface silently. So `tools/oracle/api-surface.php`, after its reflection loop and before printing, checks every class, interface, trait and enum declared from a file under `<src dir>` (`get_declared_classes()`, `get_declared_interfaces()`, `get_declared_traits()`; anonymous classes and aliases skipped) and every named class-like a non-blade `.php` file under `<src dir>` declares (by the PHP tokenizer: `class`, `interface`, `trait` or `enum` followed by a name, not after `::` or `new`). Each one missing from the class list prints `api-surface: the class list misses <FQCN> (declared in <path under src>)` to stderr, sorted, and the run exits 1 with no stdout. At the Pin every tokenized class-like is listed, so the export passes.

## Limits

The walk is syntactic, with no type-aware resolution:

- Inherited members are not seen: each class is compared on its own members, as the export lists only declared ones (the port mirrors Upstream's hierarchy).
- Trait members a class gets through a mixin, rather than declaring them, are not seen; nor are type aliases of classes or unregistered exported classes.
- Xaravel functions with no Upstream counterpart are not reported as extra; functions match by short name only.
- Defaults are compared only when both sides are plain literals; constants, `new …` and enum cases are not compared.
