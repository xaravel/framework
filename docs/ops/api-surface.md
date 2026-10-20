# API-surface diff (`bun run api-surface`)

AD-15 holds each package's public TypeScript surface to Upstream's: every public Upstream class member must exist in the port under its mapped name, with the same parameter names, defaults and nullability, unless a cited line explains the gap. `bun run api-surface` diffs each package's emitted `.d.ts` against the Upstream export `conformance/api-surface/<component>.jsonl` ([oracle.md](oracle.md#api-surface-bun-run-oracleapi-surface)) and reports the findings; `bun run api-surface:gate` fails while any is unexplained (Story 6.5; AD-15, AD-9, AD-26, DIV-12).

```sh
bun run api-surface <component>…                     # one summary line per component; exits 0 unless a tool failure (e.g. an unknown citation component)
bun run api-surface --all                            # every component, sorted
bun run api-surface --details <component>…           # one line per finding, then the summary
bun run api-surface --all --markdown <file>          # also writes the per-Component table (CI's job summary)
bun run api-surface:gate <component>…                # exits 1 while anything is unexplained or a citation file has a problem
bun --no-env-file tools/api-surface/api-surface.ts --root <dir> …   # a temp root (tests)
```

A component is a `conformance/api-surface/<name>.jsonl` other than `additions.jsonl` and `exceptions.jsonl`; its package is `packages/<name>`. An unknown component, or neither a component nor `--all`, exits 2 naming it. A tool failure (tsc fails, a jsonl file is unreadable or invalid, a citation line names a component with no `conformance/api-surface/<component>.jsonl`, a declaration or source does not parse) exits 1 with the reason, in report and gate mode alike: `api-surface: conformance/api-surface/exceptions.jsonl:<n>: unknown component nope (no conformance/api-surface/nope.jsonl)`. A component is known when its file exists under `--root`, whichever components were selected.

A Component's last Epic is accepted against `bun run api-surface:gate <component>` (AD-15): zero unexplained members, zero citation problems and no tool failure. `story:check` enforces it: the Story's manifest carries `api_surface_gate: <component>`, and its `api-surface` clause runs the gate ([done-check.md](done-check.md#the-api_surface_gate-field)).

## How it works

1. **Build.** The packages with a `packages/<c>/package.json` are built with one `tsc -b`, Story 6.4's helper (`emitDeclarations` in `tools/async-surface/async-surface.ts`), and their `<tsconfig outDir>/src/**/*.d.ts` are read with its `packageDeclarations` (a deleted source's stale `.d.ts` is dropped). A component without a package has no declarations: everything is missing.
2. **Registrations.** In each `packages/<c>/src/**/*.ts` (not `.d.ts`, parsed with `oxc-parser`, `lang: "ts"`), a top-level statement `registerClass('<FQCN>', X)` maps the FQCN to that file and local name `X` (AD-10). What counts as a registration is decided by Story 6.6's recogniser (`recogniseRegistration` in `tools/registration/registration.ts`, [registration.md](registration.md)), so only a call the scan accepts as conforming registers; the FQCN is keyed without its leading `\` (`registerClass('\\X\\A', A)` matches Upstream `X\A`) and with its case as written. The first registration of an FQCN wins; the duplicate scan is Story 6.6's. An interface is never `registerClass`ed: AD-1 ports it as an `interface X` plus a same-named runtime token, so a top-level `const X = …` (exported or not) whose initializer is a call `contract('<FQCN>')` / `contract<T>('<FQCN>')`, or contains a `Symbol.for('<FQCN>')` call with a string literal that is an Upstream FQCN, also registers that FQCN (likewise without a leading `\`) to `X`. A `Symbol.for` argument counts only when it has Story 6.6's FQCN shape (`isFqcn` in `tools/registration/registration.ts`) and its first segment, after an optional leading `\`, is `Illuminate` or `Laravel` (`Illuminate\Contracts\Lock`, `\Laravel\Mcp\Tool`); runtime brands such as `Symbol.for("xaravel.class.fqcn")`, other namespaces (`X\Lock`) and a bare or run-on prefix (`Illuminate`, `IlluminateX\A`) register nothing, and the first qualifying `Symbol.for` in the initializer is used. `contract('<FQCN>')` takes any string literal; its members come from the same-named interface or class in the file's `.d.ts`. A `registerClass` of the same FQCN wins over a token.
3. **Members.** A registered class's members are the public members of every `class` and `interface` named `X` in that file's `.d.ts`, merged; `private`, `protected`, `#private` and computed keys are skipped. A method (`constructor` counts as `__construct`), a getter or setter (a property), a field or accessor (a property; a function-typed one also counts as a method signature), an interface method or property signature. Overloads of one name are one member with several signatures. Functions are the exported `declare function`s of any `.d.ts` in the package, and its exported `declare const`s typed as a function (the `.d.ts` of `export const f = (…) => …`).
4. **Defaults** are read from the source: the class (or function, or `const` holding an arrow or function expression) of the same name in the source `.ts`, from the implementation's parameter initializers, by position, skipping a `this` parameter. A member with one signature takes them; an overload takes them only when its parameter names equal the implementation's, and otherwise its defaults are not compared.

## Parity mappings

Upstream names map to Xaravel names before comparing:

- Methods, properties, parameters and functions (the short name after the last `\`) go through `camel()`: each `_x` after a letter or digit becomes `X`; leading underscores are kept (`get_id` → `getId`, `_private_name` → `_privateName`).
- `__construct` → `constructor`, `__toString` → `toString`; other magic methods keep their name.
- Constants and enum cases keep their name and are matched as static properties.
- **DIV-12** (`conformance/scans/div12-pairs.jsonl`, keyed `class` + `name`): `option-pair` → see below; `method-plus-state` → the property is not expected; `model-config` → the property is expected, and the method is expected under its decided new name when DIV-12 decides one, and otherwise not expected (its new name is then cited in `exceptions.jsonl` / `additions.jsonl`, since the pair list holds no target). Each side's rule applies to the record on the pair's `class` and on that side's `declaredIn` class (the export lists a member on the class that declares it, so `Illuminate\Bus\Queueable::$middleware` is covered by a pair on `BroadcastEvent`); a record is not expected if any pair says so. Members that are not expected are reported as `div12` and never counted.
- **DIV-12 renames.** The tool holds the fixed table `DIV12_RENAMES` (PRD §5.2 DIV-12, spine AD-7): `fillable` → `setFillable`, `touches` → `isTouching`; no other target is invented. A `model-config` method in the table is compared under its new name, like any member: matched, a `mismatch`, `renamed` (case-insensitively against the new name), or `missing method X::fillable: expected as setFillable (DIV-12)`, which only an `exceptions.jsonl` line for the Upstream name explains. The Xaravel `setFillable` is then not `extra`. Every other `model-config` method stays `div12`.
- **Option pairs (AD-26).** On a declaration that is not a `trait`, an `option-pair` is satisfied by either Xaravel form, a property or a method of the pair's `camel()` name: both Upstream records are `div12`, and the Xaravel member is not `extra`. When neither form is declared, the first record of the pair (in the export's order) is `missing <kind> X::<name>: option pair: neither form is declared (DIV-12, AD-26)`, counted, and the other is `div12`. On a `trait` both records are `div12`, and a form the trait declares is reported `extra` (AD-26: base classes declare neither): AD-26 says base classes declare neither form and the framework reads `option(this, name)`, and the export lists the defaults' providers (`Illuminate\Bus\Queueable::$middleware`, `Eloquent\Concerns\HasAttributes::casts`) on their traits, while the concrete classes that set the option must keep it in some form.
- **Options form (AD-26).** When Upstream has two or more optional non-variadic parameters, the member "also accepts" an options object, so it needs both forms, each met by some signature (overload): a **positional** signature, checked as below, and an **options-form** signature, which takes the required parameters positionally and then one options parameter whose type (or a union member, or an interface or type alias of that name in the package's `.d.ts`) is a type literal whose keys are exactly the optional parameters' `camel()` names. The options parameter and each of its keys must be optional (`?`). When Upstream ends with a variadic parameter, a rest parameter must follow the options parameter, checked like a positional rest. Each form's failures are those of its best signature; a `mismatch` lists the positional failures, then the options-form failures, each prefixed `options overload: ` (`options overload: parameter 2 is not an options object with keys b, c`). A member with fewer optional parameters needs the positional form only. Functions follow the same rule.

## Findings

| Category | What |
| --- | --- |
| `missing` | an Upstream declaration with no registration (its members are not listed separately), a member of a registered class, or a function, with no Xaravel counterpart; an option pair with neither form; a renamed `model-config` method absent under its new name |
| `extra` | a registered FQCN the component's file lacks, or a member of a matched class with no Upstream counterpart (`constructor` is extra only if Upstream has no `__construct`) |
| `renamed` | an unmatched Upstream member and an unmatched Xaravel member of one class whose mapped names are equal case-insensitively (`getURL -> getUrl`) |
| `mismatch` | a matched member with no signature passing the checks below (for a member needing both AD-26 forms: when either form has no passing signature); each form's details come from its signature with the fewest failures (the first on a tie) |
| `div12` | an Upstream member DIV-12 says is not expected; not counted |
| `stale` | a citation line that explains nothing; listed, not counted |

**Signature checks**, per Upstream parameter by position:

- the name is `camel(name)`, unless that is an ECMAScript reserved word (`default`, `class`, `function`, …, which cannot name a parameter; PORTING.md's renaming convention, AD-26), when any name passes;
- variadic ↔ a rest parameter; optional ↔ TS `?` or rest;
- when both defaults are comparable literals (PHP `null`, `true`, `false`, an int, a float, `'…'`, `[]`; a TS initializer `null`, a boolean, a number with an optional unary `-`, a string, `[]`, `{}`), they are equal; PHP `[]` matches `[]` or `{}`;
- when the PHP `type` is not null: PHP `nullable` ↔ the TS type is absent or contains `null`, `any` or `unknown` (a rest parameter's element type);
- a missing or an extra TS parameter fails.

Returns: `undefined` at the top level of the TS return type (through parentheses and unions, after unwrapping `Promise<…>` / `PromiseLike<…>`) fails (AD-9), but not one nested inside, such as a callback's parameter; when PHP `returns` is not null, `void` or `never`, nullability must agree after unwrapping `Promise<…>` / `PromiseLike<…>`. Properties: the same nullability rule on the property type, and an optional (`?`) property or a top-level `undefined` in its type fails with `returns undefined (AD-9)`. A member found under the mapped name but in the other role is a `mismatch` (`is a property, Upstream method` / `is a method, Upstream property`), not a rename. `static` must agree for every member kind (a constant or case must be a static property).

## Explained items

`conformance/api-surface/exceptions.jsonl` and `additions.jsonl` are Protected, hand-written through Maintainer review, and validated by `bun run oracle:api-surface --check` ([oracle.md](oracle.md#citation-files)); this tool only reads them. Gate mode runs the same validation (`checkCitations` in `tools/oracle/api-surface.ts`) on every run, so an empty or mistyped citation, a non-canonical, unsorted or duplicate line fails the gate even where `oracle.yml` did not run. Every line's `component` must name a component file (see above). Both checks cover every line of both citation files, not only the selected components' lines, so a bad line for component B fails `api-surface:gate A` too.

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

`Upstream` counts the component file's lines; `matched` counts registered declarations and the members and functions that matched with no mismatch. `--markdown <file>` writes a table with the columns Component, Upstream, Matched, Missing, Renamed, Extra, Mismatched and Unexplained, and a Total row. Gate mode prints every unexplained item, then `api-surface:gate <c>: <u> unexplained (AD-15)` per component. After the component lines it prints each citation-file problem `checkCitations` reports, then a count line, both only when there is a problem:

```
api-surface:gate citation problem: <problem>
api-surface:gate citations: <n> problem(s) (AD-15)
```

It exits 1 if any count is not zero or any citation problem is found.

Every Component package is a scaffold today, so `--all` reports nearly everything missing. That is expected: only the gate, run at a Component's last Epic, enforces it.

## CI

`.github/workflows/api-surface.yml#report` runs on `pull_request` (main) and `merge_group`, with `contents: read` only. It runs `bun run api-surface --all --markdown …` and appends the table to the job summary, shown on the PR's checks page. A tool failure becomes a `::warning` and a note in the summary; the step ends with `exit 0`, so the report never fails a PR, and it is not a required check. There is no PR comment: that needs `pull-requests: write`, which AD-16 reserves for the Oracle, dashboard and release jobs. The dashboard (Epic 7) is the other display AD-15 names.

## The export's class-list cross-check

The Upstream export reflects the FQCNs a static scan lists (tools/component-map's `declaredClasses`); a class that scan misses would vanish from the surface silently. So `tools/oracle/api-surface.php`, after its reflection loop and before printing, checks every class, interface, trait and enum declared from a file under `<src dir>` (`get_declared_classes()`, `get_declared_interfaces()`, `get_declared_traits()`; anonymous classes and aliases skipped) and every named class-like a non-blade `.php` file under `<src dir>` declares (by the PHP tokenizer: `class`, `interface`, `trait` or `enum` followed by a name, not after `::` or `new`). Each one missing from the class list prints `api-surface: the class list misses <FQCN> (declared in <path under src>)` to stderr, sorted, and the run exits 1 with no stdout. At the Pin every tokenized class-like is listed, so the export passes.

## Limits

The walk is syntactic, with no type-aware resolution:

- Inherited members are not seen: each class is compared on its own members, as the export lists only declared ones (the port mirrors Upstream's hierarchy).
- Trait members are not seen unless the class declares them: the members of a trait the port builds as a mixin, and the members a class gets from a mixin, are invisible to the walk. Nor are type aliases of classes or unregistered exported classes.
- By-reference parameters (`byRef`) are not checked.
- Xaravel functions with no Upstream counterpart are not reported as extra; functions match by short name only.
- Defaults are compared only when both sides are plain literals; constants, `new …` and enum cases are not compared.
