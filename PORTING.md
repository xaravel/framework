# PORTING.md: PHP to TypeScript rules

This is the rulebook Framework Agents port Laravel 13 from (FR-8). It restates decisions; it does not make them. Each rule comes from the architecture spine (`_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md`, AD-1..AD-28), the PRD (§5.1 parity rule, FR-8, FR-48, the addendum's API mapping examples), the Divergence Records `decisions/DIV-1.md`..`decisions/DIV-12.md`, or an Escalation ruling in `decisions/`. Where a rule restates a DIV, it cites the clause (`DIV-12.4`) and the record's text governs. A TypeScript limitation that no rule here or no DIV covers is never worked around silently: it goes through an Escalation (FR-114).

`PORTING.md` is Protected (AD-16). `bun run porting:check` gates it in CI (`docs/ops/porting.md`). The DIV-12 pair list at the end is generated: run `bun run porting:generate`, never edit it by hand.

## Construct mapping (AD-26)

One decided TypeScript form per PHP construct (AD-26). The first column is the spine's AD-26 table, character for character.

| PHP construct | Xaravel form | Status |
| --- | --- | --- |
| Named arguments | A function with more than one optional parameter also accepts a single options object keyed by the camelCase PHP parameter names. Trailing named arguments become that one object: `new Envelope(subject: 'Hi')` → `new Envelope({ subject: 'Hi' })` (PRD §5.1, addendum). `Envelope`, `Content`, `Attribute.make` and `Headers` are documented object-first. | decided |
| Backed / pure enums | A class with static instances, `cases()`, `from()` and `tryFrom()`; never a TS `enum`. | decided |
| PHP attributes (`#[X]`) | A TC39 decorator `@X(...)` with the same name and arguments (`#[ObservedBy([PostObserver])]` → `@ObservedBy([PostObserver])`, AD-7). Container attributes become AD-4 Spec descriptors (`Config('app.timezone')`, `CurrentUser()`, …). | decided |
| `__call` / `__callStatic` forwarding (managers, `ForwardsCalls`, Eloquent statics) | Explicit generated delegating methods, typed by the target contract. No Proxy outside `Model`. | decided |
| `__get` / `__set` outside `Model` | None (DIV-12). Use the explicit accessor: `$request->title` → `request.input('title')` (DIV-12.5), `$this->route('post')` → `this.route('post')`. | decided |
| `__toString` | `toString()` plus `[Symbol.toPrimitive]`. | decided |
| `__invoke` | A method named `__invoke`, which the container, router and dispatcher call. | decided |
| `ArrayAccess` | `offsetGet` / `offsetSet` / `offsetExists` / `offsetUnset` plus `get()`. Index syntax works only on `Model`, through its Proxy. `$collection[0]` → `collection.get(0)` (DIV-12.6); a write, `isset` or `unset` on any `ArrayAccess` object → `offsetSet` / `offsetExists` / `offsetUnset` (DIV-12.17). | decided |
| `IteratorAggregate`, `Countable` | `[Symbol.iterator]` and `count()`. A Traversable's `[Symbol.iterator]` yields its values, as a JS Array does; `entries()` yields `[key, value]` pairs and `keys()` its keys, as on a JS Map. `foreach ($c as $v)` → `for (const v of c)`; `foreach ($c as $k => $v)` → `for (const [k, v] of c.entries())`. `PhpArray` alone keeps its `[key, value]` iterator (AD-9.5). | decided |
| Generators (`yield`) | A JS generator function. `yield $v` → `yield v`; `yield $k => $v` → `yield keyed(k, v)`; `yield from $it` → `yield* yieldFrom(it)`, keeping keys. PHP's `Generator` (`current`, `key`, `send`, `getReturn`, …) comes from `@xaravel/runtime/php` and iterates as a Traversable (DIV-12.18). | decided |
| Traits | `mixin(Base, ...Traits)`, for example `class User extends mixin(Model, HasFactory, Notifiable)`. `boot<Trait>` / `initialize<Trait>` run as Upstream; trait identity comes from `classUsesRecursive()`, with traits registered under their Upstream FQCN (AD-19). | decided |
| `static::` / `new static` | `this` in static methods, and `new this()`. | decided |
| Property + method with one name (DIV-12) | Model configuration properties follow AD-7: the property wins, and a colliding Upstream method takes the name in the DIV-12 pair list (`fillable(arr)` → `setFillable(arr)`, `touches(rel)` → `isTouching(rel)`, DIV-12.4). Option pairs (`casts`, `middleware`, `backoff`, `tries`, `timeout`, `uniqueId`, `uniqueFor`, `retryUntil`, `attachments`, `envelope`, `content`, `via`, `broadcastOn`, …): base classes declare neither, and the framework reads `option(this, name)`, calling it if it is a function and reading the value otherwise (DIV-12.1). Framework method plus state (`delay()`, `afterCommit()`, `subject()`, …): the method keeps the name, and the state moves behind Upstream's getters (DIV-12.2). The full pair list is § DIV-12 pair list below. | decided |
| Facades | `Facade` subclasses in `@xaravel/support/facades`, with static delegating methods generated from the Upstream facade's `@method` docblocks at the Pin. Typing comes from `interface FacadeRoots { <accessor>: <RootClass> }`, augmented by each owning package. `fake` / `swap` / `shouldReceive` / `spy` / `partialMock` follow Upstream. `Route::get('/users', [UserController::class, 'index'])` → `Route.get('/users', [UserController, 'index'])` (addendum). | decided |
| `Macroable` | `macro()` installs on the prototype or the static side. Callers type their macro with `declare` / `declare static` members on their class (oxlint's `no-unsafe-declaration-merging` rejects module augmentation of a class; MAINT-2026-10-24-epic-11-items). | decided |
| Real-time facades (`Facades\App\X`) | `@xaravel/framework/facades/<FQCN path>`, resolved through the Class Registry. | decided |
| Dynamic `where<Column>()` and dynamic finders | Not supported. `whereEmail($v)` → `where('email', v)` (DIV-12.7). | decided |
| By-reference parameters | `Ref<T>` (AD-9); see § By-reference parameters. | decided |

## Idiom table

The parity rule (PRD §5.1): a Xaravel API has the same name, arguments, defaults and behaviour as its Laravel 13 counterpart. `->` and `::` become `.`, methods stay camelCase, and database attributes keep their column names (`created_at`). Any other difference is a bug unless an FR or a DIV specifies it.

| Laravel (PHP) | Xaravel (TS) | Note |
| --- | --- | --- |
| `Route::get('/users', [UserController::class, 'index']);` | `Route.get('/users', [UserController, 'index'])` | syntax only |
| `$users = User::where('active', 1)->with('posts')->get();` | `const users = await User.where('active', 1).with('posts').get()` | DIV-1 |
| `$user->posts` (lazy) | `user.posts` throws unless loaded; `await user.related('posts')` or `await user.load('posts')` | DIV-2 |
| `$user->posts()->create([...])` | `await user.related('posts').create({...})` | DIV-2 |
| `public function __construct(private Mailer $mailer)` | `@inject({ mailer: Mailer }) class X { constructor(private mailer: Mailer) {} }` | DIV-3 |
| `dispatch(function () use ($podcast) { … })` | `dispatch(async ({ podcast }) => …, { podcast })` (facades such as `Mail` may be used inside) | DIV-4 |
| `{{ $user->name }}` (Blade) | `{{ $user.name }}` | syntax only |
| `new Envelope(subject: 'Hi')` | `new Envelope({ subject: 'Hi' })` | syntax only (named arguments, §5.1) |
| `$collection[0]` | `collection.get(0)` | DIV-12 |
| `$request->validate([...])` | `await request.validate({...})` | DIV-1 (IO rules) |
| `collect([1, 2, 3])->map(fn ($x) => $x * 2)` | `collect([1, 2, 3]).map(x => x * 2)` | sync, no divergence |
| `php artisan make:model Invoice -mfc` | `bun artisan make:model Invoice -mfc` | CLI name kept (NFR-8) |

**PHP semantics are ported, not skipped** (PRD §5.1). Where Laravel relies on PHP behaviour, Xaravel reproduces it with the explicit helpers of `@xaravel/runtime` (AD-19). Nothing else re-implements them.

| PHP behaviour | Xaravel helper | Source |
| --- | --- | --- |
| A PHP array that is neither a list nor an all-string-keyed map | `PhpArray`: ordered, PHP key normalisation (`"1"` → `1`, `1.7` → `1`, `true` → `1`, `null` → `""`), insertion-order iteration, JSON form by the list rule | Story 9.5, AD-9, DIV-9.2 |
| A by-reference parameter | `Ref<T>` | Story 9.5, AD-9 |
| The int/float distinction | the runtime float marker; `isFloat(v)` reads it | Story 9.5, AD-9, DIV-9.4 |
| `undefined` reaching a boundary | `normalizeNull(v)`: `null` is the only absent value, and no API returns `undefined` | Story 9.5, AD-9, DIV-9.1 |
| `==` | `looseEquals(a, b)` | Story 9.6 |
| `===` / `!==` where an operand can be a PHP array | `identical(a, b)` / `!identical(a, b)` | ESC-14.2-1 |
| `$o->$name(...$args)` (a dynamic method name) | `callMethod(o, name, ...args)`: PHP's case-insensitive method lookup, then `__call` | ESC-14.2-7 |
| `$a + $b` on arrays | `arrayUnion(a, b)`: the left entries, then each right entry whose key the left lacks | ESC-14.4-1 |
| `$a + $b`, `$a / $b` on numbers or numeric strings | `plus(a, b)`, `divide(a, b)`: PHP's coercion, int or float result, `TypeError` and `DivisionByZeroError` | ESC-14.5-2 |
| `$a[] = $v` on an array value | `arrayAppend(a, v)` over a `Ref`: the next integer key | ESC-14.5-3 |
| `$x[$k] = $v` or `$x[] = $v` where `$x` may be any PHP value | `offsetAssign(ref, key, value)` over a `Ref`, `key` `null` for `[]`: PHP's write to an array, `null` or `false` (made an array), string or `ArrayAccess` receiver, and its `Error` on a scalar | ESC-14.6-8 |
| `$f(...$args)` | `callUnpacked(f, args)`: integer keys positional, string keys named | ESC-14.5-3 |
| `<=>` | `spaceship(a, b)` | Story 9.6 |
| `is_numeric` | `isNumeric(v)` | Story 9.6 |
| `(int)`, `(float)`, `(string)`, `(bool)` | `toInt`, `toFloat`, `toPhpString`, `toBool` | Story 9.6 |
| `(array)` | `toPhpArray(v)`: an object's properties, with PHP's mangled protected and private names | ESC-14.1-6 |
| PHP value-copy of arrays | `valueCopy(x)`; public APIs never mutate caller data and never return internal arrays by reference | Story 9.6, AD-9 |
| `serialize()` / `json_encode` | `phpSerialize` / `phpUnserialize`, `jsonEncode` / `jsonDecode` from `@xaravel/runtime/php`; never `JSON.stringify` on framework values | AD-23 |
| `X::class`, `static::class`, `get_class($o)` used as identity | `fqcn(xOrInstance)`; never `constructor.name` | AD-10 |

**`undefined` → `null`** (AD-9). `null` is the only absent value. `undefined` is normalised at boundaries and never returned; an expected `null` is never adapted to `undefined` (DIV-9.1).

**Casts of objects.** `(string) $object`, and a concatenation operand that is an object, become `toPhpString(x)`, which calls the object's `toString()` (its `__toString` port) as PHP does; a port never calls `toString()` itself for a cast. As in § Mechanical expression rule's `a . b` row, only a string-literal operand is left unwrapped: any other operand is wrapped, even a call that already returns a string (`'ba' . strtoupper($m[1])` becomes `'ba' + toPhpString(strtoupper(m[1]))`), as the rule is syntax-directed.

**Magic reads that forward to a method.** A read of a property that `conformance/scans/div12-pairs.jsonl` classifies `method-plus-state`, made through a `__get` that forwards to the same-named method (`$stringable->value` on `Illuminate\Support\Stringable`, whose `value` row in § DIV-12 pair list reads "method keeps the name; state behind Upstream's getters"), becomes that method call, `stringable.value()`, marked `// adapted:DIV-12.2`: it is DIV-12.2's read of the state property through Upstream's getter.

## Test-adaptation rules

- **Shape.** A Ported Test is declared only through `portedTest('<Test ID>', { case?, dataset? }, async function () { ... })` and asserts only through `@xaravel/assert`; importing `expect` from `bun:test` under `tests/ported` is a lint error (AD-15). `this` is the `case` TestCase (AD-25). The body is an `async function` even when it awaits nothing, so every Ported Test has the one shape.
- **Test case.** A test class that extends `PHPUnit\Framework\TestCase` directly is ported with `case: TestCase` from `@xaravel/assert`, or, when it declares helpers, properties, providers or traits, with a local `class <UpstreamClass> extends TestCase` in the test file whose helpers are public, because the body runs outside the class; assertions are called as `this.assertX(...)`, as Upstream calls `$this->assertX(...)`, and a PHP return type on the test method (`: void`) is dropped.
- **Data providers.** A `#[DataProvider('p')]` test is one `portedTest` whose `dataset` holds provider `p`'s rows, built when the test is declared (a module constant when several tests share the provider); PHPUnit's row keys become the Test ID suffixes (`#0`, `#1`, … for a list, `#<key>` for a string key), each row is spread into the body's parameters, typed from Upstream's hints or `unknown`, a defaulted parameter keeps its default, and a row of class names (`[Collection::class]`) holds the constructors, so `new $collection(...)` becomes `new collection(...)`. Where the test uses that value as a value, not as a class, it is `fqcn(collection)` (DIV-12.19).
- **Mockery.** `Mockery::mock(X::class)` becomes `Mockery.mock(X)` from `@xaravel/mockery`, where `X` is the class, the contract token of an `Illuminate\Contracts` interface (`Arrayable` from `@xaravel/contracts/support`), or the class `@xaravel/runtime/php` exports for a PHP interface (`JsonSerializable`); the expectation chain keeps Upstream's methods and arguments (`$m->expects('toArray')->andReturn('x')` becomes `m.expects('toArray').andReturn('x')`), and `portedTest` verifies and closes the Mockery container after the body, so a test never calls `Mockery.close()` itself.
- **Array literals.** An array literal takes the form DIV-9.2 gives its keys, not its spelling: keys, implicit or explicit, that normalise to `0..n-1` in order make a list and so a JS `Array` (`[0 => 'a', 1 => 'b']` becomes `['a', 'b']`), and other integer or mixed keys a `PhpArray` written with Upstream's keys as written (`null` and `''` included; the runtime normalises them), with explicit type arguments (a union of its key types, and `unknown` values) when its entries differ in type; these conversions are the syntax of the port, so they carry no `adapted` marker.
- **Reading a PHP array.** A read of an array whose JS form depends on its run-time keys (an `all()` or `toArray()` result) goes through `phpArrayEntries(a)` from `@xaravel/assert`, which yields the `[key, value]` pairs of a list, a plain object or a `PhpArray` alike: `isset($a[k])` becomes `phpArrayEntries(a).some(([key, v]) => key === nk && v !== null)`, where `nk` is `k` normalised as a PHP key (§ Idiom table, `PhpArray`): an integer-like string such as `'1'` is the integer `1`, so `isset($a['1'])` finds the key `1`.
- **Non-integral floats.** A non-integral float literal such as `1.5` is a float by its value, so it carries no float marker; the marker (DIV-9.4) is for an integral float such as `1.0` whose assertion depends on int/float.
- **Adapt versus skip** (PRD §5.1). A test is **adapted** when its Upstream intent can still be verified under a DIV's numbered adaptation clause, for example awaiting an IO call (DIV-1.1, DIV-8.1) or `await m.related('rel')` in place of lazy access (DIV-2.2). A test is **skipped** as `intentional-divergence:DIV-<n>` only when the behaviour it tests does not exist in Xaravel (for example a PCRE-only pattern, DIV-10.1).
- **Markers.** Each changed assertion line carries `// adapted:DIV-<n>.<k>` (and any line holding a converted pattern carries `// adapted:DIV-10.1`, § PCRE conversion / Markers), and the test's Expectations line carries the same clause in its `adapted` field (`DIV-<n>.<k>`). Only a `pass` line may carry `adapted`. `bun run divergence:check` fails a marker that names no existing clause (`docs/ops/divergence.md`).
- **Grader.** Never weaken an expected value, remove an assertion or add a skip without a DIV clause or an approved Escalation. The assertion floor (FR-113) still applies; only clauses listed in a record's `fewer_assertions` waive it (ESC-5.3-2).
- **Order of rewrites.** First apply § Mechanical expression rule, which is syntax-directed and uses no type information. Then apply the type-dependent rewrites, each an adaptation that cites its clause:
  - an IO call or thenable terminal is awaited: DIV-1.1 (with DIV-8.1 for the async body, DIV-8.2 for predicate assertions);
  - `$m->rel()` → `m.related('rel')`: DIV-2.1, and lazy `$m->rel` → `await m.related('rel')`: DIV-2.2;
  - index access on an `ArrayAccess` receiver, `a[k]` → `a.get(k)`: DIV-12.6;
  - a Model configuration method call, `fillable(arr)` → `setFillable(arr)`: DIV-12.4;
  - a magic Request property, `request.title` → `request.input('title')`: DIV-12.5;
  - a dynamic where, `whereEmail(v)` → `where('email', v)`: DIV-12.7;
  - a float whose int/float distinction the assertion depends on carries the float marker: DIV-9.4;
  - a parameter Upstream autowires through a type hint is declared with `inject({ <paramName>: <Spec> })`: DIV-3.1;
  - a serialized closure's captured state, which the mechanical rule drops with `use (...)`, is passed as explicit arguments: DIV-4.1.
- **Oracle inputs.** Oracle requests' `setup` and `exprs` keep Upstream's inputs; the Fidelity Review checks them against Upstream (AD-15).
- **Blade tests** keep every Upstream template input, with PHP expressions translated by the mechanical rule's Blade mode (FR-48). Assertions on generated PHP become Differential Tests on rendered HTML (DIV-5).

## Mechanical expression rule

The rule that turns a PHP expression in an Upstream test input or Blade template into TypeScript (FR-8.4, FR-48). It is syntax-directed: no type information is used. Type-dependent rewrites are adaptations under a DIV clause (§ Test-adaptation rules). `tools/porting/translate.ts` implements it, and `conformance/porting/expressions.jsonl` proves it on 20 real Upstream inputs.

```sh
bun run porting:translate '<php expression>'
bun run porting:translate --blade '<blade template>'
```

| PHP | TS |
| --- | --- |
| `$x`, `$this` | `x`, `this`. Blade mode keeps `$x` (AD-11). |
| `\A\B\C`, `C` (class name) | `C` (imports are not part of the rule). Two different qualified names with one short name in one input (`\A\Collection` and `\B\Collection`) are untranslatable (`short class name collision`). |
| `C::class` | `C` |
| `->`, `?->`, `::` (calls, properties, constants, `C::$p`) | `.`, `?.`, `.` |
| `f(...)`, `$o->m(...)` (first-class callable) | `f`, `o.m.bind(o)` |
| named arguments `f(1, b: 2, c: 3)` | `f(1, { b: 2, c: 3 })` (trailing named arguments become one object, AD-26) |
| bare function or constant name | kept verbatim (the import comes from the package § Imports below names: a helper from the Component whose api-surface declares it, PHP builtins and constants from `@xaravel/runtime/php`) |
| `true`/`FALSE`/`Null` | lower case |
| numbers; `017`/`0o17` | as written; `0o17` |
| integral float literal `1.0` | `float(1)` (DIV-9 float marker) |
| `'s'`, `"s\t$v {$o->p}"` | a JS single-quoted string; interpolation becomes `'s\t' + toPhpString(v) + ' ' + toPhpString(o.p)` |
| `a . b` | `toPhpString(a) + toPhpString(b)`; a string-literal operand is not wrapped |
| list `[1, 2]`, `array(1, 2)`, spread `...$a` | `[1, 2]`, `...a`; a spread of a `PhpArray` with integer keys is `...array_values(a)` (DIV-9.15) |
| every key a non-integer-like string literal | `{ a: 1, 'b-c': 2 }` |
| any other keyed array | `new PhpArray([[k, v], …])`; an implicit key gets the next literal integer index, and a non-literal key before an implicit one is untranslatable. Explicit (or mixed implicit and explicit) keys that normalise to `0..n-1` in order are a list, ported as a JS `Array` per § Test-adaptation rules / Array literals (DIV-9.2); `porting:translate` does not yet apply this. |
| `$a[k]` | `a[k]` (ArrayAccess receivers adapt to `.get(k)` under DIV-12) |
| `==`, `!=`/`<>`, `<=>` | `looseEquals(a, b)`, `!looseEquals(a, b)`, `spaceship(a, b)` |
| `===`, `!==`, `< > <= >=`, arithmetic, bitwise, `??`, `instanceof` | unchanged; the left operand of `??` has its property and index links optional-chained, as in `isset` (`$a->b->c ?? 1` → `a?.b?.c ?? 1`) |
| `!`, `&&`, `\|\|`, `c ? a : b` | operands and conditions wrapped `toBool(…)` unless boolean-shaped (comparison, `!`, `&&`/`\|\|`, `instanceof`, `isset`, `empty`, a boolean literal) |
| `a ?: b` | `toBool(a) ? a : b` when `a` is a variable or literal; otherwise untranslatable |
| `(int)`/`(integer)`, `(float)`/`(double)`, `(string)`/`(binary)`, `(bool)`/`(boolean)` | `toInt`, `toFloat`, `toPhpString`, `toBool` |
| `isset(e1, e2)`, `empty(e)` | `(e1 ?? null) !== null && …`, `!toBool(e ?? null)`; inside them every property and index link is optional-chained, as PHP suppresses null links: `isset($a->b['k'])` → `(a?.b?.['k'] ?? null) !== null` |
| `fn (T $a) => e`, `function ($a) use ($b) { return e; }` | `(a) => e` (types dropped, `use` dropped) |
| `new C(args)`, `$a = e` | `new C(args)`, `a = e` |
| `__DIR__` | `import.meta.dir` |

The rule keeps these operators syntactically. Where an operand may be a non-number (a numeric string, an array union with `+`, a mixed-type `<`/`>` comparison, `%` or `/` on strings), PHP's semantics differ from JavaScript's: the port uses the PHP-semantics helpers of § Idiom table by hand, or raises an Escalation (FR-114). The translator refuses only the operand cases listed under **Untranslatable.** below; every other operand-type case translates unchanged and is checked by hand, including array literals under `+` and variable or call operands such as `$a + 1`, `$a < 'x'` and `$a % 2` (the translator infers no type). Arithmetic on a numeric-string operand converts it first, as PHP does: `toInt` only when the operand can hold only an integer string (`$m[1] * 2` on a `(\d+)` capture becomes `toInt(m[1]) * 2`), `toFloat` only when it can hold only a non-integer numeric string, and an Escalation (FR-114) when it could be either.

**Imports.** Imports are written by hand from the Upstream `use` lines: an Upstream class or helper comes from `@xaravel/<component>`, the Component whose `conformance/api-surface/<component>.jsonl` declares it (`Collection`, `LazyCollection`, `Arr` and `collect` from `@xaravel/collections`, `Str` and `Stringable` from `@xaravel/support`, `Illuminate\Database\Eloquent\Model` from `@xaravel/database`), an `Illuminate\Contracts\<Ns>` interface from `@xaravel/contracts/<ns>`, PHP's exception classes from `@xaravel/runtime` (§ Exceptions), `PhpArray`, `Ref` and the PHP-semantics helpers of § Idiom table from `@xaravel/runtime`, and PHP's other classes, functions and constants (`stdClass`, `ArrayObject`, `JsonSerializable`, `strrev`, `PHP_EOL`) and the AD-23 codecs from `@xaravel/runtime/php`; a test imports only the class its `use` line names, never a same-named export of another package (PHP's `Exception`, not `@xaravel/assert`'s).

**By hand.** A construct the rule refuses is ported by these forms:

- A closure with a statement body, a `throw` or a `$this` is an arrow function, which keeps the test case as `this` as PHP binds `$this`, with its statements in order (`fn () => throw new E('m')` becomes `() => { throw new E('m'); }`). A closure that Upstream rebinds (a macro passed to `Collection::macro` or another `Macroable`, or a closure given to `Closure::bind`, `bindTo` or `call`) is a `function` expression instead, because an arrow function cannot be rebound.
- Every closure parameter, including those of closures the rule translates, is annotated with Upstream's type hint, or else the narrowest type its call site gives, or `unknown`, because `tsc --strict` rejects an implicit `any`.
- A PHP local is declared `let` when the test assigns it again and `const` otherwise; list destructuring `[$a, $b] = e` becomes `[a, b] = e`, declared `let [a, b] = e` on first use.
- `new C` without parentheses becomes `new C()`, and an anonymous class `new class extends Model {}` becomes `new (class extends Model {})()`.
- `(object) ['a' => 1]` becomes `Object.assign(new stdClass(), { a: 1 })`, and a dynamic property on a `stdClass` is a plain property write (`$o->text = 'f'` becomes `o.text = 'f'`), since `stdClass` has no `__set`.
- A PHP callable string (`'strrev'`) stays a string literal, as Upstream passes it.
- An empty callback passed to a framework API stays empty (`() => {}`): the API normalises its `undefined` result to `null` at the boundary (AD-9, DIV-9.1). A callback the test calls itself and whose result it asserts returns `null` explicitly (`() => null`).

**Examples.** `\Illuminate\Support\Str::words("\t\t\t")` → `Str.words('\t\t\t')`. `$c->where(fn ($value) => $value['v'] == 3)` → `c.where((value) => looseEquals(value['v'], 3))`. `[1 => 'foo', 2 => 'bar']` → `new PhpArray([[1, 'foo'], [2, 'bar']])`. Blade: `Hello {{ $user->name }}` → `Hello {{ $user.name }}`.

**Untranslatable.** These throw `UntranslatableExpression`, whose message names the construct: `match`, `throw`, `(array)`/`(object)`/`(unset)`, `static::`/`self::`/`parent::`, heredoc or nowdoc with interpolation, `@`, `print`/`echo`/`exit`, `list()`/destructuring, `and`/`or`/`xor`, a `function` closure with a body other than one `return`, `new class`, the other magic constants, `` ` ``, and statements. The translator also refuses, naming each: a nested ternary without parentheses, a by-reference parameter or `use (&$x)` capture, `new` on a dynamic class expression (`new $a->b`), a duplicate key in an all-string-keyed array, a variable named after a JavaScript reserved word (`$class`, `$eval`, `$arguments`), a short class name collision, Blade's `@for`, an arithmetic or bitwise operator (`+ - * / % ** & | ^ << >>`) with a string operand (a string literal, an interpolated string, a concatenation or a `(string)`/`(binary)` cast: `"5" + "5"`, ``string operand of `+` ``), `%` with a float literal operand (`7.5 % 2`, ``float operand of `%` ``), `< > <= >=` between a string operand and a number, boolean or `null` literal (`1 < "a"`, `comparison of a string with a non-string literal`), and `< > <= >=` between two numeric string literals (`"10" < "9"`, `comparison of two numeric strings`). Anything else outside the rule table is untranslatable too: the translator never guesses. An untranslatable input is ported by hand under the rules above, or raises an Escalation when no rule or DIV covers it.

**Blade mode.** `translateBladeTemplate` translates the expressions inside `{{ }}`, `{{{ }}}`, `{!! !!}` and the parentheses of Laravel's built-in directives that take PHP expressions (`BLADE_EXPRESSION_DIRECTIVES` in `tools/porting/translate.ts`: `@if`, `@elseif`, `@unless`, `@isset`, `@empty`, `@switch`, `@case`, `@while`, `@foreach`, `@forelse`, `@break`, `@continue`, `@can` and its variants, `@auth`, `@guest`, `@env`, `@section`, `@yield`, `@extends`, the `@include` family, `@each`, `@component`, `@slot`, `@props`, `@aware`, the `@push`/`@prepend` family, `@stack`, `@json`, `@js`, `@class`, `@style`, `@checked`, `@selected`, `@disabled`, `@readonly`, `@required`, `@bool`, `@inject`, `@lang`, `@choice`, `@method`, `@error`, `@session`, `@context`, `@fragment`, `@vite` and others listed there). Any other `@name(...)`, such as CSS `@media (…)` or `@supports (…)` or a custom directive, is copied byte for byte, as Blade leaves an unknown directive as text. `@for (…)` is untranslatable: its clauses are statements, so the loop is ported by hand. `@foreach` / `@forelse` translate the iterable and keep `as $k => $v`. Everything else is copied byte for byte (`{{-- --}}` comments, `@{{ }}` and `@@` escapes, `@verbatim` blocks, directives without parentheses), and `@php … @endphp` is untranslatable. Template variables keep PHP's `$` names (AD-11).

**Revising the rule.** Change the fixture first: add or edit the `expressions.jsonl` entry with the hand-derived TypeScript, then change the translator and this table until `bun run porting:check` passes (`docs/ops/porting.md`).

## By-reference parameters

A PHP by-reference parameter (`function f(&$x)`) takes a `Ref<T>` box from `@xaravel/runtime` (AD-9, Story 9.5). The callee writes through the box, and the caller reads the new value back from it. In a Ported Test, a by-reference argument becomes a `Ref<T>` read back through its `value` (DIV-9.2). The mechanical rule does not apply `Ref<T>` itself: a by-reference parameter or reference assignment is untranslatable, and the port applies this rule by hand. A by-reference closure capture `use (&$a)` needs no `Ref<T>`, because a JS closure captures the variable itself: the port captures a `let` (or the list it appends to), and `$a[] = v` on a list becomes `a.push(v)`.

## Exceptions

- **Classes.** Each PHP exception class is a JS `Error` subclass of the same name, registered under its Upstream FQCN with `registerClass('<FQCN>', X)` (spine Consistency Conventions, AD-10). Messages match Upstream exactly.
- **PHP's own classes** come from `@xaravel/runtime` (AD-19, Story 9.10), exported and registered under their PHP names with PHP's parent chain: `Exception`, `ErrorException`, `Error`, `TypeError`, `ValueError`, `ArgumentCountError`, `ArithmeticError`, `DivisionByZeroError`, `JsonException`; and the SPL classes `RuntimeException`, `LogicException`, `InvalidArgumentException`, `DomainException`, `LengthException`, `OutOfRangeException`, `OutOfBoundsException`, `RangeException`, `OverflowException`, `UnderflowException`, `UnexpectedValueException`, `BadFunctionCallException`, `BadMethodCallException`. `new InvalidArgumentException('m', 5, previous)` keeps `getMessage()`, `getCode()` and `getPrevious()`, and is `instanceof LogicException`, `Exception` and `Error`.
- **Tests.** `$this->expectException(X::class)` → `this.expectException(X)`; `expectExceptionMessage` keeps Upstream's message.
- **Other exception expectations.** `expectExceptionObject(new X(...))`, `expectExceptionCode` and `expectExceptionMessageMatches` keep Upstream's call (the pattern converted by § PCRE conversion), as do `$this->fail()` and the surrounding `try`/`finally`; a `catch (X)` without a variable becomes `catch (e) { if (!(e instanceof X)) throw e; … }`.
- **The `\Error`/`\Exception` split** is published through a `Symbol.for` protocol for the grader (Story 9.10; ESC-4.3-1 items 10 and 14). The grader reads it (Story 9.11): its exceptions and Mockery's (Story 9.12) extend the runtime's SPL classes, and `ExceptionComparator` takes only `\Exception`s. This closed DIV-9.8.

## Scalar coercion (AD-9)

Laravel runs in PHP's coercive mode, not under `declare(strict_types=1)`: 2 of its 1,742 source files and 18 of its 1,346 test files declare it. The Oracle evaluates every expression in coercive mode too. A port that checks scalar parameters strictly therefore diverges from Upstream (ESC-9.10-2). Where Upstream's behaviour or a test depends on it, a ported parameter typed `int`, `float`, `string` or `bool` converts its argument as PHP's coercive mode does:

| Argument | `int` | `float` | `string` | `bool` |
|---|---|---|---|---|
| numeric string (`'5'`, `' 5'`, `'5.0'`, `'1e3'`) | its value; a fractional value as for a float | its value | as given | `'0'` and `''` are `false`, others `true` |
| leading-numeric string (`'5 apples'`) | its numeric prefix, with a warning | its numeric prefix, with a warning | as given | `true` |
| non-numeric string | `TypeError` | `TypeError` | as given | `''` and `'0'` are `false`, others `true` |
| integral float (`5.0`) | `5` | as given | `'5'` | `0.0` is `false`, others `true` |
| fractional float (`5.5`) | `5`, with PHP 8.1's deprecation | as given | `'5.5'` | `true` |
| `true` / `false` | `1` / `0` | `1.0` / `0.0` | `'1'` / `''` | as given |
| `null` | see below | see below | see below | see below |

- **`null`** to a non-nullable scalar parameter is a `TypeError` for Laravel's own (userland) methods in coercive mode too. Only PHP's built-in functions and classes, the ones `@xaravel/runtime` ports such as `Exception::__construct`, accept it: as `''`, `0`, `0.0` or `false`, with PHP 8.1's deprecation.
- **Warnings and deprecations** are not modelled; the converted value is.
- **`TypeError` messages** keep PHP's text, for example `Foo::bar(): Argument #1 ($n) must be of type int, string given`.
- **The Oracle is the authority.** When a row of this table and a signed fixture disagree, the fixture wins, and the table is corrected.
- A Component that does not port a coercion Upstream relies on records it under a DIV clause before its Story ships; a Story never decides it locally (AD-9, AGENTS.md).

## Frame slots (AD-5)

Per-unit state lives in Scope Frame slots (`frameSlot(key, init)` from `@xaravel/runtime/scope`), never in singleton fields or module variables (AD-5). These are the services Laravel keeps per request in instance fields:

- View render state (a per-render `RenderContext`, AD-11)
- AuthManager guards
- Router current route
- UrlGenerator request
- Redirector
- CookieJar queue
- Translator locale
- Vite nonce
- Gate user resolver
- Log context
- the exception-handler dedupe map
- the Model event dispatcher
- `DatabaseTransactionsManager`

Lint rejects any `this.<field>` assignment after construction in a class listed in `tools/lint-rules/singletons.json` (Protected, generated from Upstream's `singleton()` bindings at the Pin plus Xaravel's own singletons). The boot-only exceptions are listed in `conformance/boot-only-state` (Protected) and throw if written after `sealed`.

## APP_KEY forms (AD-23)

`@xaravel/encryption` exposes `AppKey` with `raw()`, `configString()` and `previous()`. Each consumer uses the form Laravel uses, and each has interop Differential Tests:

- **Encrypter** → `raw()`
- **signed URLs** → `configString()` with `previous()`
- **closures** (the `SerializableClosure` payload signature, AD-14) → `configString()` with `previous()`
- **cookie prefix** → `raw()`

## Promise.all allow-list (AD-6)

Framework IO is awaited in sequence, in Upstream's order. `Promise.all` is allowed only where Upstream is itself concurrent, and only here:

- `Http.pool`
- `Concurrency.run`
- `Process.pool`
- batch dispatch

Every other IO is awaited one call at a time, in Upstream's order. A new entry needs an Escalation.

## PCRE conversion (DIV-10)

Xaravel uses JavaScript `RegExp`, not PCRE (DIV-10). The conversion rule is owned here (ESC-4.3-1 item 5). A pattern whose features all have a direct `RegExp` form is converted mechanically, and its test is ported (DIV-10.1):

- **Delimiters and flags.** `'/x/i'` → `/x/i`. The delimiters are dropped. Of PCRE's flags `i`, `m`, `s`, `x` and `u`, the flags `i`, `m`, `s` and `u` carry over unchanged; `x` has no `RegExp` form and is listed below.
- **Named groups.** `(?P<n>…)` → `(?<n>…)`.
- **Start of subject.** `\A` → `^`, in a pattern with no `m` flag.
- **End of subject.** `\z` → `$`.
- **Other delimiters.** Any PCRE delimiter (`#…#`, `~…~`, `{…}`) is dropped as `/` is, and a `/` inside the pattern is escaped as `\/`.
- **Markers.** A converted pattern is an adaptation under DIV-10.1: the line that holds it carries `// adapted:DIV-10.1`, whether or not it is an assertion line.
- **Replacements and callbacks.** A pattern passed to a `preg_replace`-style API (`Str.replaceMatches`, `Stringable.replaceMatches`) is converted without adding a `g` flag, because the API keeps PHP's replace-all and limit semantics; its replacement string keeps PHP's `$1` and `\1` references verbatim, and its callback receives PHP's match array (`match[0]`, `match[1]`), as Upstream's does.
- **Wildcards.** A `Str.is`-style wildcard (`whenIs('foo/*')`) is not a regular expression, so it stays a string.

These PCRE-only features have no equivalent. An Upstream test that depends on one is skipped as `intentional-divergence:DIV-10` (DIV-10.1):

- possessive quantifiers (`a++`, `a*+`, `a?+`)
- atomic groups (`(?>…)`)
- recursion (`(?R)`)
- conditionals (`(?(1)…|…)`)
- `\G`
- `\Z`
- the `x` flag
- inline flag groups (`(?i)`, `(?i:…)`)
- `\K`

## DIV-12 pair list

The members where an Upstream class has a property and a method with one name, generated from `conformance/scans/div12-pairs.jsonl` (Story 3.7's scan at the Pin) by `bun run porting:generate`. One row per (class, form), sorted by class and then form. The form is the first that applies:

1. The property and the method are on different sides (one static, one instance): `no collision (static and instance sides)`.
2. A Model configuration property in AD-7's list: `property wins; method → <renamed>()`, with the rename from DIV-12.4 (`fillable` → `setFillable`, `touches` → `isTouching`).
3. An option pair: `option(this, name)` (DIV-12.1).
4. Anything else, framework method plus state: `method keeps the name; state behind Upstream's getters` (DIV-12.2).

<!-- BEGIN div12-pairs: generated by bun run porting:generate; do not edit -->

| Class | Form | Names |
| --- | --- | --- |
| `Illuminate\Auth\Access\AuthorizationException` | method keeps the name; state behind Upstream's getters | `response`, `status` |
| `Illuminate\Auth\Access\Gate` | method keeps the name; state behind Upstream's getters | `abilities`, `defaultDenialResponse`, `policies` |
| `Illuminate\Auth\Access\Response` | method keeps the name; state behind Upstream's getters | `allowed`, `code`, `message`, `status` |
| `Illuminate\Auth\AuthManager` | method keeps the name; state behind Upstream's getters | `userResolver` |
| `Illuminate\Auth\AuthServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Auth\AuthServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Auth\AuthenticationException` | method keeps the name; state behind Upstream's getters | `guards`, `redirectTo` |
| `Illuminate\Auth\Console\ClearResetsCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Auth\Notifications\ResetPassword` | method keeps the name; state behind Upstream's getters | `locale` |
| `Illuminate\Auth\Notifications\VerifyEmail` | method keeps the name; state behind Upstream's getters | `locale` |
| `Illuminate\Auth\Passwords\PasswordResetServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Auth\Passwords\PasswordResetServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Auth\RequestGuard` | method keeps the name; state behind Upstream's getters | `user` |
| `Illuminate\Auth\SessionGuard` | method keeps the name; state behind Upstream's getters | `user`, `viaRemember` |
| `Illuminate\Auth\TokenGuard` | method keeps the name; state behind Upstream's getters | `user` |
| `Illuminate\Broadcasting\AnonymousEvent` | method keeps the name; state behind Upstream's getters | `shouldBroadcastNow` |
| `Illuminate\Broadcasting\BroadcastController` | method keeps the name; state behind Upstream's getters | `middleware` |
| `Illuminate\Broadcasting\BroadcastEvent` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Broadcasting\BroadcastEvent` | option(this, name) | `middleware` |
| `Illuminate\Broadcasting\BroadcastServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Broadcasting\BroadcastServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Broadcasting\UniqueBroadcastEvent` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Broadcasting\UniqueBroadcastEvent` | option(this, name) | `middleware` |
| `Illuminate\Bus\BusServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Bus\BusServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Bus\ChainedBatch` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Bus\PendingBatch` | method keeps the name; state behind Upstream's getters | `name` |
| `Illuminate\Bus\Queueable` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Cache\ArrayLock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\CacheLock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\CacheServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Cache\CacheServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Cache\Console\CacheTableCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Cache\Console\ClearCommand` | method keeps the name; state behind Upstream's getters | `cache`, `input` |
| `Illuminate\Cache\Console\ForgetCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Cache\Console\PruneStaleTagsCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Cache\DatabaseLock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\DatabaseStore` | method keeps the name; state behind Upstream's getters | `lockTable`, `table` |
| `Illuminate\Cache\DynamoDbLock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\FileLock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\Limiters\ConcurrencyLimiterBuilder` | method keeps the name; state behind Upstream's getters | `releaseAfter`, `sleep` |
| `Illuminate\Cache\Lock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\MemcachedLock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\MemoizedTaggedCache` | method keeps the name; state behind Upstream's getters | `tags` |
| `Illuminate\Cache\NoLock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\PhpRedisLock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\RedisLock` | method keeps the name; state behind Upstream's getters | `owner` |
| `Illuminate\Cache\RedisStore` | method keeps the name; state behind Upstream's getters | `connection`, `lockConnection` |
| `Illuminate\Cache\RedisTaggedCache` | method keeps the name; state behind Upstream's getters | `tags` |
| `Illuminate\Cache\TaggedCache` | method keeps the name; state behind Upstream's getters | `tags` |
| `Illuminate\Concurrency\ConcurrencyServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Concurrency\ConcurrencyServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Concurrency\Console\InvokeSerializedClosureCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\Command` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\CommandInput` | method keeps the name; state behind Upstream's getters | `arguments`, `options` |
| `Illuminate\Console\Concerns\InteractsWithIO` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\GeneratorCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\MigrationGeneratorCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\OutputStyle` | method keeps the name; state behind Upstream's getters | `newLineWritten`, `newLinesWritten` |
| `Illuminate\Console\Scheduling\CallbackEvent` | method keeps the name; state behind Upstream's getters | `description`, `environments`, `evenInMaintenanceMode`, `evenWhenPaused`, `onOneServer`, `runInBackground`, `timezone`, `user`, `withoutOverlapping` |
| `Illuminate\Console\Scheduling\Event` | method keeps the name; state behind Upstream's getters | `description`, `environments`, `evenInMaintenanceMode`, `evenWhenPaused`, `onOneServer`, `runInBackground`, `timezone`, `user`, `withoutOverlapping` |
| `Illuminate\Console\Scheduling\ManagesAttributes` | method keeps the name; state behind Upstream's getters | `description`, `environments`, `evenInMaintenanceMode`, `evenWhenPaused`, `onOneServer`, `runInBackground`, `user`, `withoutOverlapping` |
| `Illuminate\Console\Scheduling\PendingEventAttributes` | method keeps the name; state behind Upstream's getters | `description`, `environments`, `evenInMaintenanceMode`, `evenWhenPaused`, `onOneServer`, `runInBackground`, `timezone`, `user`, `withoutOverlapping` |
| `Illuminate\Console\Scheduling\Schedule` | method keeps the name; state behind Upstream's getters | `alwaysOnOneServer`, `events` |
| `Illuminate\Console\Scheduling\ScheduleClearCacheCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\Scheduling\ScheduleFinishCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\Scheduling\ScheduleInterruptCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\Scheduling\ScheduleListCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\Scheduling\SchedulePauseCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\Scheduling\ScheduleResumeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\Scheduling\ScheduleRunCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\Scheduling\ScheduleTestCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Console\Scheduling\ScheduleWorkCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Container\Container` | method keeps the name; state behind Upstream's getters | `resolved` |
| `Illuminate\Container\Container` | no collision (static and instance sides) | `instance` |
| `Illuminate\Container\ContextualBindingBuilder` | method keeps the name; state behind Upstream's getters | `needs` |
| `Illuminate\Container\RewindableGenerator` | method keeps the name; state behind Upstream's getters | `count` |
| `Illuminate\Contracts\Database\ModelIdentifier` | method keeps the name; state behind Upstream's getters | `useMorphMap` |
| `Illuminate\Cookie\CookieJar` | method keeps the name; state behind Upstream's getters | `queued` |
| `Illuminate\Cookie\CookieServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Cookie\CookieServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Cookie\Middleware\EncryptCookies` | no collision (static and instance sides) | `except` |
| `Illuminate\Database\Connection` | method keeps the name; state behind Upstream's getters | `beforeStartingTransaction`, `pretending`, `totalQueryDuration` |
| `Illuminate\Database\Console\DatabaseInspectionCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\DbCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\DumpCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Factories\FactoryMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Migrations\BaseCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Migrations\FreshCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Migrations\InstallCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Migrations\MigrateCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Migrations\MigrateMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Migrations\RefreshCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Migrations\ResetCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Migrations\RollbackCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Migrations\StatusCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\MonitorCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\PruneCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Seeds\SeedCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\Seeds\SeederMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\ShowCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\ShowModelCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\TableCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\Console\WipeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Database\DatabaseServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Database\DatabaseServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Database\Eloquent\BroadcastableModelEventOccurred` | method keeps the name; state behind Upstream's getters | `event` |
| `Illuminate\Database\Eloquent\Builder` | method keeps the name; state behind Upstream's getters | `onDelete`, `removedScopes`, `scopes` |
| `Illuminate\Database\Eloquent\Casts\Attribute` | no collision (static and instance sides) | `get`, `set` |
| `Illuminate\Database\Eloquent\Collection` | method keeps the name; state behind Upstream's getters | `escapeWhenCastingToString` |
| `Illuminate\Database\Eloquent\Concerns\GuardsAttributes` | method keeps the name; state behind Upstream's getters | `unguarded` |
| `Illuminate\Database\Eloquent\Concerns\GuardsAttributes` | property wins; method → setFillable() | `fillable` |
| `Illuminate\Database\Eloquent\Concerns\HasAttributes` | option(this, name) | `casts` |
| `Illuminate\Database\Eloquent\Concerns\HasEvents` | method keeps the name; state behind Upstream's getters | `dispatchesEvents` |
| `Illuminate\Database\Eloquent\Concerns\HasRelationships` | property wins; method → isTouching() | `touches` |
| `Illuminate\Database\Eloquent\Concerns\HasUniqueIds` | method keeps the name; state behind Upstream's getters | `usesUniqueIds` |
| `Illuminate\Database\Eloquent\Factories\CrossJoinSequence` | method keeps the name; state behind Upstream's getters | `count` |
| `Illuminate\Database\Eloquent\Factories\Factory` | method keeps the name; state behind Upstream's getters | `afterCreating`, `afterMaking`, `connection`, `count`, `expandRelationshipsByDefault`, `for`, `has`, `recycle` |
| `Illuminate\Database\Eloquent\Factories\Sequence` | method keeps the name; state behind Upstream's getters | `count` |
| `Illuminate\Database\Eloquent\Model` | method keeps the name; state behind Upstream's getters | `booted`, `booting`, `dispatchesEvents`, `escapeWhenCastingToString`, `isSoftDeletable`, `unguarded`, `usesUniqueIds` |
| `Illuminate\Database\Eloquent\Model` | no collision (static and instance sides) | `isMassPrunable`, `isPrunable`, `preventsLazyLoading`, `with` |
| `Illuminate\Database\Eloquent\Model` | option(this, name) | `casts` |
| `Illuminate\Database\Eloquent\Model` | property wins; method → isTouching() | `touches` |
| `Illuminate\Database\Eloquent\Model` | property wins; method → setFillable() | `fillable` |
| `Illuminate\Database\Eloquent\Relations\BelongsTo` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap`, `withDefault` |
| `Illuminate\Database\Eloquent\Relations\BelongsToMany` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap`, `using`, `withTimestamps` |
| `Illuminate\Database\Eloquent\Relations\Concerns\CanBeOneOfMany` | method keeps the name; state behind Upstream's getters | `isOneOfMany` |
| `Illuminate\Database\Eloquent\Relations\Concerns\SupportsDefaultModels` | method keeps the name; state behind Upstream's getters | `withDefault` |
| `Illuminate\Database\Eloquent\Relations\HasMany` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap` |
| `Illuminate\Database\Eloquent\Relations\HasManyThrough` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap` |
| `Illuminate\Database\Eloquent\Relations\HasOne` | method keeps the name; state behind Upstream's getters | `isOneOfMany`, `morphMap`, `requireMorphMap`, `withDefault` |
| `Illuminate\Database\Eloquent\Relations\HasOneOrMany` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap` |
| `Illuminate\Database\Eloquent\Relations\HasOneOrManyThrough` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap` |
| `Illuminate\Database\Eloquent\Relations\HasOneThrough` | method keeps the name; state behind Upstream's getters | `isOneOfMany`, `morphMap`, `requireMorphMap`, `withDefault` |
| `Illuminate\Database\Eloquent\Relations\MorphMany` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap` |
| `Illuminate\Database\Eloquent\Relations\MorphOne` | method keeps the name; state behind Upstream's getters | `isOneOfMany`, `morphMap`, `requireMorphMap`, `withDefault` |
| `Illuminate\Database\Eloquent\Relations\MorphOneOrMany` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap` |
| `Illuminate\Database\Eloquent\Relations\MorphPivot` | method keeps the name; state behind Upstream's getters | `booted`, `booting`, `dispatchesEvents`, `escapeWhenCastingToString`, `isSoftDeletable`, `unguarded`, `usesUniqueIds` |
| `Illuminate\Database\Eloquent\Relations\MorphPivot` | no collision (static and instance sides) | `isMassPrunable`, `isPrunable`, `preventsLazyLoading`, `with` |
| `Illuminate\Database\Eloquent\Relations\MorphPivot` | option(this, name) | `casts` |
| `Illuminate\Database\Eloquent\Relations\MorphPivot` | property wins; method → isTouching() | `touches` |
| `Illuminate\Database\Eloquent\Relations\MorphPivot` | property wins; method → setFillable() | `fillable` |
| `Illuminate\Database\Eloquent\Relations\MorphTo` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap`, `withDefault` |
| `Illuminate\Database\Eloquent\Relations\MorphToMany` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap`, `using`, `withTimestamps` |
| `Illuminate\Database\Eloquent\Relations\Pivot` | method keeps the name; state behind Upstream's getters | `booted`, `booting`, `dispatchesEvents`, `escapeWhenCastingToString`, `isSoftDeletable`, `unguarded`, `usesUniqueIds` |
| `Illuminate\Database\Eloquent\Relations\Pivot` | no collision (static and instance sides) | `isMassPrunable`, `isPrunable`, `preventsLazyLoading`, `with` |
| `Illuminate\Database\Eloquent\Relations\Pivot` | option(this, name) | `casts` |
| `Illuminate\Database\Eloquent\Relations\Pivot` | property wins; method → isTouching() | `touches` |
| `Illuminate\Database\Eloquent\Relations\Pivot` | property wins; method → setFillable() | `fillable` |
| `Illuminate\Database\Eloquent\Relations\Relation` | method keeps the name; state behind Upstream's getters | `morphMap`, `requireMorphMap` |
| `Illuminate\Database\Eloquent\SoftDeletes` | no collision (static and instance sides) | `forceDeleting` |
| `Illuminate\Database\MariaDbConnection` | method keeps the name; state behind Upstream's getters | `beforeStartingTransaction`, `pretending`, `totalQueryDuration` |
| `Illuminate\Database\MigrationServiceProvider` | method keeps the name; state behind Upstream's getters | `commands`, `publishableMigrationPaths` |
| `Illuminate\Database\MigrationServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Database\Migrations\DatabaseMigrationRepository` | method keeps the name; state behind Upstream's getters | `table` |
| `Illuminate\Database\Migrations\Migrator` | method keeps the name; state behind Upstream's getters | `paths`, `withoutMigrations` |
| `Illuminate\Database\MySqlConnection` | method keeps the name; state behind Upstream's getters | `beforeStartingTransaction`, `pretending`, `totalQueryDuration` |
| `Illuminate\Database\PostgresConnection` | method keeps the name; state behind Upstream's getters | `beforeStartingTransaction`, `pretending`, `totalQueryDuration` |
| `Illuminate\Database\Query\Builder` | method keeps the name; state behind Upstream's getters | `aggregate`, `distinct`, `fetchUsing`, `from`, `groupLimit`, `limit`, `lock`, `offset`, `timeout`, `useWritePdo` |
| `Illuminate\Database\Query\Grammars\PostgresGrammar` | method keeps the name; state behind Upstream's getters | `customOperators` |
| `Illuminate\Database\Query\JoinClause` | method keeps the name; state behind Upstream's getters | `aggregate`, `distinct`, `fetchUsing`, `from`, `groupLimit`, `limit`, `lock`, `offset`, `timeout`, `useWritePdo` |
| `Illuminate\Database\Query\JoinLateralClause` | method keeps the name; state behind Upstream's getters | `aggregate`, `distinct`, `fetchUsing`, `from`, `groupLimit`, `limit`, `lock`, `offset`, `timeout`, `useWritePdo` |
| `Illuminate\Database\SQLiteConnection` | method keeps the name; state behind Upstream's getters | `beforeStartingTransaction`, `pretending`, `totalQueryDuration` |
| `Illuminate\Database\Schema\Blueprint` | method keeps the name; state behind Upstream's getters | `after`, `charset`, `collation`, `engine`, `temporary` |
| `Illuminate\Database\Schema\Builder` | method keeps the name; state behind Upstream's getters | `defaultMorphKeyType`, `defaultStringLength`, `defaultTimePrecision` |
| `Illuminate\Database\Schema\MariaDbBuilder` | method keeps the name; state behind Upstream's getters | `defaultMorphKeyType`, `defaultStringLength`, `defaultTimePrecision` |
| `Illuminate\Database\Schema\MySqlBuilder` | method keeps the name; state behind Upstream's getters | `defaultMorphKeyType`, `defaultStringLength`, `defaultTimePrecision` |
| `Illuminate\Database\Schema\PostgresBuilder` | method keeps the name; state behind Upstream's getters | `defaultMorphKeyType`, `defaultStringLength`, `defaultTimePrecision` |
| `Illuminate\Database\Schema\SQLiteBuilder` | method keeps the name; state behind Upstream's getters | `defaultMorphKeyType`, `defaultStringLength`, `defaultTimePrecision` |
| `Illuminate\Database\Schema\SqlServerBuilder` | method keeps the name; state behind Upstream's getters | `defaultMorphKeyType`, `defaultStringLength`, `defaultTimePrecision` |
| `Illuminate\Database\SqlServerConnection` | method keeps the name; state behind Upstream's getters | `beforeStartingTransaction`, `pretending`, `totalQueryDuration` |
| `Illuminate\Encryption\Encrypter` | method keeps the name; state behind Upstream's getters | `previousKeys` |
| `Illuminate\Encryption\EncryptionServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Encryption\EncryptionServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Events\CallQueuedListener` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay`, `shouldBeUnique`, `shouldBeUniqueUntilProcessing` |
| `Illuminate\Events\CallQueuedListener` | option(this, name) | `debounceId`, `uniqueFor`, `uniqueId` |
| `Illuminate\Events\EventServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Events\EventServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Events\QueuedClosure` | method keeps the name; state behind Upstream's getters | `delay` |
| `Illuminate\Filesystem\FilesystemServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Filesystem\FilesystemServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Filesystem\LocalFilesystemAdapter` | method keeps the name; state behind Upstream's getters | `shouldServeSignedUrls` |
| `Illuminate\Filesystem\ReadThroughFilesystemAdapter` | method keeps the name; state behind Upstream's getters | `copy` |
| `Illuminate\Foundation\Application` | method keeps the name; state behind Upstream's getters | `basePath`, `booted`, `bootstrapPath`, `configPath`, `databasePath`, `environmentFile`, `environmentPath`, `hasBeenBootstrapped`, `langPath`, `publicPath`, `resolved`, `storagePath` |
| `Illuminate\Foundation\Application` | no collision (static and instance sides) | `instance` |
| `Illuminate\Foundation\ArrayMaintenanceMode` | method keeps the name; state behind Upstream's getters | `active` |
| `Illuminate\Foundation\Auth\EmailVerificationRequest` | method keeps the name; state behind Upstream's getters | `json` |
| `Illuminate\Foundation\Auth\User` | method keeps the name; state behind Upstream's getters | `booted`, `booting`, `dispatchesEvents`, `escapeWhenCastingToString`, `isSoftDeletable`, `unguarded`, `usesUniqueIds` |
| `Illuminate\Foundation\Auth\User` | no collision (static and instance sides) | `isMassPrunable`, `isPrunable`, `preventsLazyLoading`, `with` |
| `Illuminate\Foundation\Auth\User` | option(this, name) | `casts` |
| `Illuminate\Foundation\Auth\User` | property wins; method → isTouching() | `touches` |
| `Illuminate\Foundation\Auth\User` | property wins; method → setFillable() | `fillable` |
| `Illuminate\Foundation\Bootstrap\RegisterProviders` | method keeps the name; state behind Upstream's getters | `merge` |
| `Illuminate\Foundation\Bus\PendingChain` | method keeps the name; state behind Upstream's getters | `catchCallbacks`, `delay` |
| `Illuminate\Foundation\Bus\PendingClosureDispatch` | method keeps the name; state behind Upstream's getters | `afterResponse` |
| `Illuminate\Foundation\Bus\PendingDispatch` | method keeps the name; state behind Upstream's getters | `afterResponse` |
| `Illuminate\Foundation\Cloud\CloudJob` | method keeps the name; state behind Upstream's getters | `failed` |
| `Illuminate\Foundation\Cloud\ExceptionReporter` | method keeps the name; state behind Upstream's getters | `bladeMapper`, `currentConsoleInput`, `currentFallbackArgvInput`, `currentlyProcessingJobAttemptId` |
| `Illuminate\Foundation\Configuration\Middleware` | method keeps the name; state behind Upstream's getters | `priority`, `statefulApi`, `throttleWithRedis`, `trustHosts` |
| `Illuminate\Foundation\Console\AboutCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ApiInstallCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\BroadcastingInstallCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\CastMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ChannelListCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ChannelMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ClassMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ClearCompiledCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ClosureCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ComponentMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ConfigCacheCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ConfigClearCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ConfigMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ConfigPublishCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ConfigShowCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ConsoleMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\DevCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\DevListCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\DocsCommand` | method keeps the name; state behind Upstream's getters | `input`, `version` |
| `Illuminate\Foundation\Console\DownCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\EnumMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\EnvironmentCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\EnvironmentDecryptCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\EnvironmentEncryptCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\EventCacheCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\EventClearCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\EventGenerateCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\EventListCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\EventMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ExceptionMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\InterfaceMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\JobMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\JobMiddlewareMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\Kernel` | method keeps the name; state behind Upstream's getters | `bootstrappers`, `commandStartedAt`, `commands` |
| `Illuminate\Foundation\Console\KeyGenerateCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\LangPublishCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ListenerMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\MailMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ModelMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\NotificationMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ObserverMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\OptimizeClearCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\OptimizeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\PackageDiscoverCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\PolicyMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ProviderMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\QueuedCommand` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Foundation\Console\ReloadCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\RequestMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ResourceMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\RouteCacheCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\RouteClearCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\RouteListCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\RuleMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ScopeMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ServeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\StorageLinkCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\StorageUnlinkCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\StubPublishCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\TestMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\TraitMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\UpCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\VendorPublishCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ViewCacheCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ViewClearCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\Console\ViewMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Foundation\DevCommand` | method keeps the name; state behind Upstream's getters | `color`, `name`, `priority` |
| `Illuminate\Foundation\DevCommands` | method keeps the name; state behind Upstream's getters | `bufferSize`, `commands`, `except`, `mode`, `only`, `order`, `streamBufferSize`, `withTimestamps`, `withoutDefaultCommands`, `withoutVendorCommands` |
| `Illuminate\Foundation\Exceptions\Handler` | method keeps the name; state behind Upstream's getters | `dontFlash`, `dontReport`, `dontRetry` |
| `Illuminate\Foundation\Exceptions\Renderer\Exception` | method keeps the name; state behind Upstream's getters | `request` |
| `Illuminate\Foundation\Exceptions\Renderer\Frame` | method keeps the name; state behind Upstream's getters | `isMain`, `previous` |
| `Illuminate\Foundation\Exceptions\Renderer\Listener` | method keeps the name; state behind Upstream's getters | `queries` |
| `Illuminate\Foundation\Http\FormRequest` | method keeps the name; state behind Upstream's getters | `json` |
| `Illuminate\Foundation\Http\Kernel` | method keeps the name; state behind Upstream's getters | `bootstrappers`, `requestStartedAt` |
| `Illuminate\Foundation\Http\Middleware\CheckForMaintenanceMode` | no collision (static and instance sides) | `except` |
| `Illuminate\Foundation\Http\Middleware\PreventRequestForgery` | method keeps the name; state behind Upstream's getters | `allowSameSite` |
| `Illuminate\Foundation\Http\Middleware\PreventRequestForgery` | no collision (static and instance sides) | `except` |
| `Illuminate\Foundation\Http\Middleware\PreventRequestsDuringMaintenance` | no collision (static and instance sides) | `except` |
| `Illuminate\Foundation\Http\Middleware\TrimStrings` | no collision (static and instance sides) | `except` |
| `Illuminate\Foundation\Http\Middleware\ValidateCsrfToken` | method keeps the name; state behind Upstream's getters | `allowSameSite` |
| `Illuminate\Foundation\Http\Middleware\ValidateCsrfToken` | no collision (static and instance sides) | `except` |
| `Illuminate\Foundation\Http\Middleware\VerifyCsrfToken` | method keeps the name; state behind Upstream's getters | `allowSameSite` |
| `Illuminate\Foundation\Http\Middleware\VerifyCsrfToken` | no collision (static and instance sides) | `except` |
| `Illuminate\Foundation\Providers\ArtisanServiceProvider` | method keeps the name; state behind Upstream's getters | `commands`, `publishableMigrationPaths` |
| `Illuminate\Foundation\Providers\ArtisanServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Foundation\Providers\ComposerServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Foundation\Providers\ComposerServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Foundation\Providers\ConsoleSupportServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Foundation\Providers\ConsoleSupportServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Foundation\Providers\FormRequestServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Foundation\Providers\FormRequestServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Foundation\Providers\FoundationServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Foundation\Providers\FoundationServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Foundation\Queue\Queueable` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Foundation\Support\Providers\AuthServiceProvider` | method keeps the name; state behind Upstream's getters | `policies`, `publishableMigrationPaths` |
| `Illuminate\Foundation\Support\Providers\AuthServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Foundation\Support\Providers\EventServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Foundation\Support\Providers\EventServiceProvider` | no collision (static and instance sides) | `publishes`, `shouldDiscoverEvents` |
| `Illuminate\Foundation\Support\Providers\RouteServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Foundation\Support\Providers\RouteServiceProvider` | no collision (static and instance sides) | `loadRoutesUsing`, `publishes` |
| `Illuminate\Foundation\Testing\Concerns\MakesHttpRequests` | method keeps the name; state behind Upstream's getters | `followRedirects`, `withCredentials` |
| `Illuminate\Foundation\Testing\TestCase` | method keeps the name; state behind Upstream's getters | `followRedirects`, `withCredentials`, `withoutBootingFramework` |
| `Illuminate\Foundation\Testing\WithFaker` | method keeps the name; state behind Upstream's getters | `faker` |
| `Illuminate\Foundation\Vite` | method keeps the name; state behind Upstream's getters | `fonts`, `hotFile`, `preloadedAssets` |
| `Illuminate\Hashing\Argon2IdHasher` | method keeps the name; state behind Upstream's getters | `memory`, `threads`, `time` |
| `Illuminate\Hashing\ArgonHasher` | method keeps the name; state behind Upstream's getters | `memory`, `threads`, `time` |
| `Illuminate\Hashing\HashServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Hashing\HashServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Http\Client\Factory` | method keeps the name; state behind Upstream's getters | `globalMiddleware`, `globalOptions`, `preventStrayRequests`, `recorded` |
| `Illuminate\Http\Client\PendingRequest` | method keeps the name; state behind Upstream's getters | `async`, `baseUrl`, `bodyFormat`, `preventStrayRequests`, `truncateExceptionsAt` |
| `Illuminate\Http\Client\Request` | method keeps the name; state behind Upstream's getters | `attributes`, `data` |
| `Illuminate\Http\Client\RequestException` | method keeps the name; state behind Upstream's getters | `truncateAt` |
| `Illuminate\Http\Client\Response` | method keeps the name; state behind Upstream's getters | `cookies`, `truncateExceptionsAt` |
| `Illuminate\Http\File` | method keeps the name; state behind Upstream's getters | `hashName` |
| `Illuminate\Http\FileHelpers` | method keeps the name; state behind Upstream's getters | `hashName` |
| `Illuminate\Http\Middleware\TrustProxies` | method keeps the name; state behind Upstream's getters | `headers`, `proxies` |
| `Illuminate\Http\Request` | method keeps the name; state behind Upstream's getters | `json` |
| `Illuminate\Http\Resources\JsonApi\AnonymousResourceCollection` | method keeps the name; state behind Upstream's getters | `additional`, `collects`, `preserveKeys`, `with`, `wrap` |
| `Illuminate\Http\Resources\JsonApi\AnonymousResourceCollection` | no collision (static and instance sides) | `collection` |
| `Illuminate\Http\Resources\JsonApi\Concerns\ResolvesJsonApiElements` | method keeps the name; state behind Upstream's getters | `maxRelationshipDepth` |
| `Illuminate\Http\Resources\JsonApi\JsonApiRequest` | method keeps the name; state behind Upstream's getters | `json` |
| `Illuminate\Http\Resources\JsonApi\JsonApiResource` | method keeps the name; state behind Upstream's getters | `additional`, `maxRelationshipDepth`, `with`, `wrap` |
| `Illuminate\Http\Resources\Json\AnonymousResourceCollection` | method keeps the name; state behind Upstream's getters | `additional`, `collects`, `preserveKeys`, `with`, `wrap` |
| `Illuminate\Http\Resources\Json\AnonymousResourceCollection` | no collision (static and instance sides) | `collection` |
| `Illuminate\Http\Resources\Json\JsonResource` | method keeps the name; state behind Upstream's getters | `additional`, `with`, `wrap` |
| `Illuminate\Http\Resources\Json\ResourceCollection` | method keeps the name; state behind Upstream's getters | `additional`, `collects`, `with`, `wrap` |
| `Illuminate\Http\Resources\Json\ResourceCollection` | no collision (static and instance sides) | `collection` |
| `Illuminate\Http\Testing\File` | method keeps the name; state behind Upstream's getters | `hashName` |
| `Illuminate\Http\UploadedFile` | method keeps the name; state behind Upstream's getters | `hashName` |
| `Illuminate\Image\Image` | method keeps the name; state behind Upstream's getters | `file`, `hashName` |
| `Illuminate\Image\ImageServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Image\ImageServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\JsonSchema\Types\AnyOfType` | method keeps the name; state behind Upstream's getters | `description`, `enum`, `nullable`, `required`, `schemas`, `title` |
| `Illuminate\JsonSchema\Types\ArrayType` | method keeps the name; state behind Upstream's getters | `default`, `description`, `enum`, `items`, `nullable`, `required`, `title` |
| `Illuminate\JsonSchema\Types\BooleanType` | method keeps the name; state behind Upstream's getters | `default`, `description`, `enum`, `nullable`, `required`, `title` |
| `Illuminate\JsonSchema\Types\IntegerType` | method keeps the name; state behind Upstream's getters | `default`, `description`, `enum`, `multipleOf`, `nullable`, `required`, `title` |
| `Illuminate\JsonSchema\Types\NumberType` | method keeps the name; state behind Upstream's getters | `default`, `description`, `enum`, `multipleOf`, `nullable`, `required`, `title` |
| `Illuminate\JsonSchema\Types\ObjectType` | method keeps the name; state behind Upstream's getters | `default`, `description`, `enum`, `nullable`, `required`, `title` |
| `Illuminate\JsonSchema\Types\StringType` | method keeps the name; state behind Upstream's getters | `default`, `description`, `enum`, `format`, `nullable`, `pattern`, `required`, `title` |
| `Illuminate\JsonSchema\Types\Type` | method keeps the name; state behind Upstream's getters | `description`, `enum`, `nullable`, `required`, `title` |
| `Illuminate\JsonSchema\Types\UnionType` | method keeps the name; state behind Upstream's getters | `description`, `enum`, `nullable`, `required`, `title`, `types` |
| `Illuminate\Log\Context\ContextServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Log\Context\ContextServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Log\Context\Repository` | no collision (static and instance sides) | `handleUnserializeExceptionsUsing` |
| `Illuminate\Log\LogManager` | method keeps the name; state behind Upstream's getters | `sharedContext` |
| `Illuminate\Log\LogServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Log\LogServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Mail\Attachment` | method keeps the name; state behind Upstream's getters | `as` |
| `Illuminate\Mail\MailServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Mail\MailServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Mail\Mailable` | method keeps the name; state behind Upstream's getters | `bcc`, `cc`, `from`, `html`, `locale`, `mailer`, `markdown`, `metadata`, `replyTo`, `subject`, `to`, `view` |
| `Illuminate\Mail\Mailables\Attachment` | method keeps the name; state behind Upstream's getters | `as` |
| `Illuminate\Mail\Mailables\Content` | method keeps the name; state behind Upstream's getters | `html`, `htmlString`, `markdown`, `text`, `view`, `with` |
| `Illuminate\Mail\Mailables\Envelope` | method keeps the name; state behind Upstream's getters | `bcc`, `cc`, `from`, `metadata`, `replyTo`, `subject`, `tags`, `to`, `using` |
| `Illuminate\Mail\Mailables\Headers` | method keeps the name; state behind Upstream's getters | `messageId`, `references`, `text` |
| `Illuminate\Mail\Mailer` | method keeps the name; state behind Upstream's getters | `queue`, `to` |
| `Illuminate\Mail\Markdown` | method keeps the name; state behind Upstream's getters | `componentPaths`, `theme`, `withSecuredEncoding` |
| `Illuminate\Mail\PendingMail` | method keeps the name; state behind Upstream's getters | `bcc`, `cc`, `locale`, `to` |
| `Illuminate\Mail\SendQueuedMailable` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Mail\Transport\ArrayTransport` | method keeps the name; state behind Upstream's getters | `messages` |
| `Illuminate\Mail\Transport\LogTransport` | method keeps the name; state behind Upstream's getters | `logger` |
| `Illuminate\Mail\Transport\SesTransport` | method keeps the name; state behind Upstream's getters | `ses` |
| `Illuminate\Mail\Transport\SesV2Transport` | method keeps the name; state behind Upstream's getters | `ses` |
| `Illuminate\Notifications\ChannelManager` | method keeps the name; state behind Upstream's getters | `locale` |
| `Illuminate\Notifications\Console\NotificationTableCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Notifications\DatabaseNotification` | method keeps the name; state behind Upstream's getters | `booted`, `booting`, `dispatchesEvents`, `escapeWhenCastingToString`, `isSoftDeletable`, `unguarded`, `usesUniqueIds` |
| `Illuminate\Notifications\DatabaseNotification` | no collision (static and instance sides) | `isMassPrunable`, `isPrunable`, `preventsLazyLoading`, `with` |
| `Illuminate\Notifications\DatabaseNotification` | option(this, name) | `casts` |
| `Illuminate\Notifications\DatabaseNotification` | property wins; method → isTouching() | `touches` |
| `Illuminate\Notifications\DatabaseNotification` | property wins; method → setFillable() | `fillable` |
| `Illuminate\Notifications\DatabaseNotificationCollection` | method keeps the name; state behind Upstream's getters | `escapeWhenCastingToString` |
| `Illuminate\Notifications\Events\BroadcastNotificationCreated` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Notifications\Events\NotificationFailed` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Notifications\Events\NotificationSending` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Notifications\Events\NotificationSent` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Notifications\Events\NotificationSkipped` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Notifications\Messages\BroadcastMessage` | method keeps the name; state behind Upstream's getters | `afterCommit`, `data`, `delay` |
| `Illuminate\Notifications\Messages\MailMessage` | method keeps the name; state behind Upstream's getters | `bcc`, `cc`, `from`, `greeting`, `level`, `mailer`, `markdown`, `metadata`, `priority`, `replyTo`, `salutation`, `subject`, `theme`, `view` |
| `Illuminate\Notifications\Messages\SimpleMessage` | method keeps the name; state behind Upstream's getters | `greeting`, `level`, `mailer`, `salutation`, `subject` |
| `Illuminate\Notifications\Notification` | method keeps the name; state behind Upstream's getters | `locale` |
| `Illuminate\Notifications\NotificationSender` | method keeps the name; state behind Upstream's getters | `locale` |
| `Illuminate\Notifications\NotificationServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Notifications\NotificationServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Notifications\SendQueuedNotifications` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Illuminate\Pagination\AbstractCursorPaginator` | method keeps the name; state behind Upstream's getters | `currentCursorResolver`, `cursor`, `fragment`, `items`, `path`, `perPage` |
| `Illuminate\Pagination\AbstractPaginator` | method keeps the name; state behind Upstream's getters | `currentPage`, `currentPageResolver`, `currentPathResolver`, `defaultSimpleView`, `defaultView`, `escapeWhenCastingToString`, `fragment`, `items`, `onEachSide`, `path`, `perPage`, `queryStringResolver`, `viewFactoryResolver` |
| `Illuminate\Pagination\Cursor` | method keeps the name; state behind Upstream's getters | `parameters`, `pointsToNextItems` |
| `Illuminate\Pagination\CursorPaginator` | method keeps the name; state behind Upstream's getters | `currentCursorResolver`, `cursor`, `fragment`, `items`, `path`, `perPage` |
| `Illuminate\Pagination\LengthAwarePaginator` | method keeps the name; state behind Upstream's getters | `currentPage`, `currentPageResolver`, `currentPathResolver`, `defaultSimpleView`, `defaultView`, `escapeWhenCastingToString`, `fragment`, `items`, `lastPage`, `onEachSide`, `path`, `perPage`, `queryStringResolver`, `total`, `viewFactoryResolver` |
| `Illuminate\Pagination\PaginationServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Pagination\PaginationServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Pagination\Paginator` | method keeps the name; state behind Upstream's getters | `currentPage`, `currentPageResolver`, `currentPathResolver`, `defaultSimpleView`, `defaultView`, `escapeWhenCastingToString`, `fragment`, `items`, `onEachSide`, `path`, `perPage`, `queryStringResolver`, `viewFactoryResolver` |
| `Illuminate\Pipeline\Pipeline` | method keeps the name; state behind Upstream's getters | `finally`, `pipes`, `withinTransaction` |
| `Illuminate\Pipeline\PipelineServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Pipeline\PipelineServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Process\Factory` | method keeps the name; state behind Upstream's getters | `preventStrayProcesses` |
| `Illuminate\Process\FakeInvokedProcess` | method keeps the name; state behind Upstream's getters | `command` |
| `Illuminate\Process\FakeProcessDescription` | method keeps the name; state behind Upstream's getters | `exitCode`, `output` |
| `Illuminate\Process\FakeProcessResult` | method keeps the name; state behind Upstream's getters | `command`, `errorOutput`, `exitCode`, `output` |
| `Illuminate\Process\PendingProcess` | method keeps the name; state behind Upstream's getters | `command`, `idleTimeout`, `input`, `options`, `path`, `quietly`, `timeout`, `tty` |
| `Illuminate\Queue\CallQueuedClosure` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay`, `name` |
| `Illuminate\Queue\Console\BatchesTableCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\ClearCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\FailedTableCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\FlushFailedCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\ForgetFailedCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\ListFailedCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\ListenCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\MonitorCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\PauseCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\PruneBatchesCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\PruneFailedJobsCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\RestartCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\ResumeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\RetryBatchCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\RetryCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\TableCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Console\WorkCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Queue\Events\JobQueued` | method keeps the name; state behind Upstream's getters | `payload` |
| `Illuminate\Queue\Events\JobQueueing` | method keeps the name; state behind Upstream's getters | `payload` |
| `Illuminate\Queue\Events\JobRetryRequested` | method keeps the name; state behind Upstream's getters | `payload` |
| `Illuminate\Queue\Jobs\BeanstalkdJob` | method keeps the name; state behind Upstream's getters | `failed` |
| `Illuminate\Queue\Jobs\DatabaseJob` | method keeps the name; state behind Upstream's getters | `failed` |
| `Illuminate\Queue\Jobs\FakeJob` | method keeps the name; state behind Upstream's getters | `attempts`, `failed` |
| `Illuminate\Queue\Jobs\Job` | method keeps the name; state behind Upstream's getters | `failed` |
| `Illuminate\Queue\Jobs\RedisJob` | method keeps the name; state behind Upstream's getters | `failed` |
| `Illuminate\Queue\Jobs\SqsJob` | method keeps the name; state behind Upstream's getters | `failed` |
| `Illuminate\Queue\Jobs\SyncJob` | method keeps the name; state behind Upstream's getters | `failed`, `payload` |
| `Illuminate\Queue\Middleware\RateLimited` | method keeps the name; state behind Upstream's getters | `releaseAfter` |
| `Illuminate\Queue\Middleware\RateLimitedWithRedis` | method keeps the name; state behind Upstream's getters | `releaseAfter` |
| `Illuminate\Queue\Middleware\ThrottlesExceptions` | method keeps the name; state behind Upstream's getters | `byJob` |
| `Illuminate\Queue\Middleware\ThrottlesExceptionsWithRedis` | method keeps the name; state behind Upstream's getters | `byJob` |
| `Illuminate\Queue\Middleware\WithoutOverlapping` | method keeps the name; state behind Upstream's getters | `releaseAfter` |
| `Illuminate\Queue\QueueServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Queue\QueueServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Redis\Connections\Connection` | method keeps the name; state behind Upstream's getters | `client` |
| `Illuminate\Redis\Connections\PacksPhpRedisValues` | method keeps the name; state behind Upstream's getters | `supportsLzf`, `supportsPacking`, `supportsZstd` |
| `Illuminate\Redis\Connections\PhpRedisClusterConnection` | method keeps the name; state behind Upstream's getters | `client`, `supportsLzf`, `supportsPacking`, `supportsZstd` |
| `Illuminate\Redis\Connections\PhpRedisConnection` | method keeps the name; state behind Upstream's getters | `client`, `supportsLzf`, `supportsPacking`, `supportsZstd` |
| `Illuminate\Redis\Connections\PredisClusterConnection` | method keeps the name; state behind Upstream's getters | `client` |
| `Illuminate\Redis\Connections\PredisConnection` | method keeps the name; state behind Upstream's getters | `client` |
| `Illuminate\Redis\Limiters\ConcurrencyLimiterBuilder` | method keeps the name; state behind Upstream's getters | `releaseAfter`, `sleep` |
| `Illuminate\Redis\Limiters\DurationLimiterBuilder` | method keeps the name; state behind Upstream's getters | `sleep` |
| `Illuminate\Redis\RedisManager` | method keeps the name; state behind Upstream's getters | `connections` |
| `Illuminate\Redis\RedisServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Redis\RedisServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Routing\CompiledRouteCollection` | method keeps the name; state behind Upstream's getters | `routeNameByAction`, `routeNamesByMethod` |
| `Illuminate\Routing\Console\ControllerMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Routing\Console\MiddlewareMakeCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Routing\Controller` | method keeps the name; state behind Upstream's getters | `middleware` |
| `Illuminate\Routing\Controllers\Middleware` | method keeps the name; state behind Upstream's getters | `except`, `only` |
| `Illuminate\Routing\EncodedParameter` | method keeps the name; state behind Upstream's getters | `value` |
| `Illuminate\Routing\Middleware\ThrottleRequests` | method keeps the name; state behind Upstream's getters | `shouldHashKeys` |
| `Illuminate\Routing\Middleware\ThrottleRequestsWithRedis` | method keeps the name; state behind Upstream's getters | `shouldHashKeys` |
| `Illuminate\Routing\PendingResourceRegistration` | method keeps the name; state behind Upstream's getters | `name` |
| `Illuminate\Routing\PendingSingletonResourceRegistration` | method keeps the name; state behind Upstream's getters | `name` |
| `Illuminate\Routing\Pipeline` | method keeps the name; state behind Upstream's getters | `finally`, `pipes`, `withinTransaction` |
| `Illuminate\Routing\RedirectController` | method keeps the name; state behind Upstream's getters | `middleware` |
| `Illuminate\Routing\ResourceRegistrar` | method keeps the name; state behind Upstream's getters | `singularParameters`, `verbs` |
| `Illuminate\Routing\ResponseFactory` | method keeps the name; state behind Upstream's getters | `view` |
| `Illuminate\Routing\Route` | method keeps the name; state behind Upstream's getters | `bindingFields`, `defaults`, `methods`, `originalParameters`, `parameterNames`, `parameters`, `uri` |
| `Illuminate\Routing\Router` | method keeps the name; state behind Upstream's getters | `current`, `patterns` |
| `Illuminate\Routing\RoutingServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Routing\RoutingServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Routing\SortedMiddleware` | method keeps the name; state behind Upstream's getters | `escapeWhenCastingToString` |
| `Illuminate\Routing\UrlGenerator` | method keeps the name; state behind Upstream's getters | `forceScheme`, `formatHostUsing`, `formatPathUsing` |
| `Illuminate\Routing\ViewController` | method keeps the name; state behind Upstream's getters | `middleware` |
| `Illuminate\Session\Console\SessionTableCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Session\EncryptedStore` | method keeps the name; state behind Upstream's getters | `id` |
| `Illuminate\Session\SessionServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Session\SessionServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Session\Store` | method keeps the name; state behind Upstream's getters | `id` |
| `Illuminate\Support\AggregateServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Support\AggregateServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Support\Collection` | method keeps the name; state behind Upstream's getters | `escapeWhenCastingToString` |
| `Illuminate\Support\Defer\DeferredCallback` | method keeps the name; state behind Upstream's getters | `always`, `name` |
| `Illuminate\Support\HigherOrderWhenProxy` | method keeps the name; state behind Upstream's getters | `condition`, `negateConditionOnCapture` |
| `Illuminate\Support\LazyCollection` | method keeps the name; state behind Upstream's getters | `escapeWhenCastingToString` |
| `Illuminate\Support\Lottery` | method keeps the name; state behind Upstream's getters | `loser`, `resultFactory`, `winner` |
| `Illuminate\Support\MessageBag` | method keeps the name; state behind Upstream's getters | `messages` |
| `Illuminate\Support\NodePackageManager` | method keeps the name; state behind Upstream's getters | `packageManager` |
| `Illuminate\Support\Number` | method keeps the name; state behind Upstream's getters | `currency` |
| `Illuminate\Support\Once` | method keeps the name; state behind Upstream's getters | `instance` |
| `Illuminate\Support\Pluralizer` | method keeps the name; state behind Upstream's getters | `inflector`, `uncountable` |
| `Illuminate\Support\ServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Support\ServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Support\Sleep` | method keeps the name; state behind Upstream's getters | `duration`, `fake`, `syncWithCarbon`, `while` |
| `Illuminate\Support\Stringable` | method keeps the name; state behind Upstream's getters | `value` |
| `Illuminate\Support\Testing\Fakes\BatchFake` | method keeps the name; state behind Upstream's getters | `deleted` |
| `Illuminate\Support\Testing\Fakes\BusFake` | method keeps the name; state behind Upstream's getters | `serializeAndRestore` |
| `Illuminate\Support\Testing\Fakes\ExceptionHandlerFake` | method keeps the name; state behind Upstream's getters | `handler`, `reported`, `throwOnReport` |
| `Illuminate\Support\Testing\Fakes\NotificationFake` | method keeps the name; state behind Upstream's getters | `locale`, `serializeAndRestore` |
| `Illuminate\Support\Testing\Fakes\PendingBatchFake` | method keeps the name; state behind Upstream's getters | `name` |
| `Illuminate\Support\Testing\Fakes\PendingChainFake` | method keeps the name; state behind Upstream's getters | `catchCallbacks`, `delay` |
| `Illuminate\Support\Testing\Fakes\PendingMailFake` | method keeps the name; state behind Upstream's getters | `bcc`, `cc`, `locale`, `to` |
| `Illuminate\Support\Testing\Fakes\QueueFake` | method keeps the name; state behind Upstream's getters | `rawPushes`, `serializeAndRestore` |
| `Illuminate\Support\Traits\EnumeratesValues` | method keeps the name; state behind Upstream's getters | `escapeWhenCastingToString` |
| `Illuminate\Support\ValidatedInput` | method keeps the name; state behind Upstream's getters | `input` |
| `Illuminate\Testing\AssertableJsonString` | method keeps the name; state behind Upstream's getters | `json` |
| `Illuminate\Testing\Fluent\AssertableJson` | method keeps the name; state behind Upstream's getters | `interacted` |
| `Illuminate\Testing\Fluent\Concerns\Interaction` | method keeps the name; state behind Upstream's getters | `interacted` |
| `Illuminate\Testing\LoggedExceptionCollection` | method keeps the name; state behind Upstream's getters | `escapeWhenCastingToString` |
| `Illuminate\Testing\ParallelTestingServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Testing\ParallelTestingServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Testing\TestResponse` | method keeps the name; state behind Upstream's getters | `streamedContent` |
| `Illuminate\Translation\FileLoader` | method keeps the name; state behind Upstream's getters | `jsonPaths`, `paths` |
| `Illuminate\Translation\TranslationServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Translation\TranslationServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Translation\Translator` | method keeps the name; state behind Upstream's getters | `determineLocalesUsing`, `locale` |
| `Illuminate\Validation\ConditionalRules` | method keeps the name; state behind Upstream's getters | `defaultRules`, `rules` |
| `Illuminate\Validation\Factory` | method keeps the name; state behind Upstream's getters | `excludeUnvalidatedArrayKeys`, `resolver` |
| `Illuminate\Validation\InvokableValidationRule` | method keeps the name; state behind Upstream's getters | `invokable` |
| `Illuminate\Validation\Rules\CurrentPassword` | method keeps the name; state behind Upstream's getters | `guard` |
| `Illuminate\Validation\Rules\DatabaseRule` | method keeps the name; state behind Upstream's getters | `using` |
| `Illuminate\Validation\Rules\Date` | method keeps the name; state behind Upstream's getters | `format` |
| `Illuminate\Validation\Rules\Email` | method keeps the name; state behind Upstream's getters | `preventSpoofing`, `rfcCompliant`, `validateMxRecord` |
| `Illuminate\Validation\Rules\Enum` | method keeps the name; state behind Upstream's getters | `except`, `only` |
| `Illuminate\Validation\Rules\Exists` | method keeps the name; state behind Upstream's getters | `using` |
| `Illuminate\Validation\Rules\File` | method keeps the name; state behind Upstream's getters | `encoding` |
| `Illuminate\Validation\Rules\ImageFile` | method keeps the name; state behind Upstream's getters | `encoding` |
| `Illuminate\Validation\Rules\IpAddress` | method keeps the name; state behind Upstream's getters | `version` |
| `Illuminate\Validation\Rules\Password` | method keeps the name; state behind Upstream's getters | `letters`, `max`, `mixedCase`, `numbers`, `symbols`, `uncompromised` |
| `Illuminate\Validation\Rules\Password` | no collision (static and instance sides) | `min`, `required`, `sometimes` |
| `Illuminate\Validation\Rules\Unique` | method keeps the name; state behind Upstream's getters | `ignore`, `using` |
| `Illuminate\Validation\Rules\Url` | method keeps the name; state behind Upstream's getters | `protocols` |
| `Illuminate\Validation\Rules\Uuid` | method keeps the name; state behind Upstream's getters | `version` |
| `Illuminate\Validation\ValidationException` | method keeps the name; state behind Upstream's getters | `errorBag`, `redirectTo`, `status` |
| `Illuminate\Validation\ValidationServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\Validation\ValidationServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Illuminate\Validation\Validator` | method keeps the name; state behind Upstream's getters | `after`, `ensureExponentWithinAllowedRangeUsing`, `fakeDnsLookups`, `messages`, `stopOnFirstFailure` |
| `Illuminate\View\AnonymousComponent` | method keeps the name; state behind Upstream's getters | `data`, `ignoredParameterNames`, `view` |
| `Illuminate\View\AnonymousComponent` | no collision (static and instance sides) | `factory` |
| `Illuminate\View\Compilers\BladeCompiler` | method keeps the name; state behind Upstream's getters | `prepareStringsForCompilationUsing` |
| `Illuminate\View\Component` | method keeps the name; state behind Upstream's getters | `ignoredParameterNames` |
| `Illuminate\View\Component` | no collision (static and instance sides) | `factory` |
| `Illuminate\View\Concerns\ManagesComponents` | method keeps the name; state behind Upstream's getters | `componentData` |
| `Illuminate\View\Concerns\ManagesLayouts` | method keeps the name; state behind Upstream's getters | `parentPlaceholder`, `parentPlaceholderSalt` |
| `Illuminate\View\DynamicComponent` | method keeps the name; state behind Upstream's getters | `ignoredParameterNames` |
| `Illuminate\View\DynamicComponent` | no collision (static and instance sides) | `compiler`, `factory` |
| `Illuminate\View\Factory` | method keeps the name; state behind Upstream's getters | `componentData`, `composers`, `parentPlaceholder`, `parentPlaceholderSalt`, `shared` |
| `Illuminate\View\ViewServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Illuminate\View\ViewServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Laravel\Ai\AiManager` | method keeps the name; state behind Upstream's getters | `fakeAudioGateway`, `fakeClassificationGateway`, `fakeEmbeddingGateway`, `fakeFileGateway`, `fakeImageGateway`, `fakeRerankingGateway`, `fakeStoreGateway`, `fakeTranscriptionGateway` |
| `Laravel\Ai\AiServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Laravel\Ai\AiServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Laravel\Ai\AnonymousAgent` | method keeps the name; state behind Upstream's getters | `instructions`, `messages`, `tools` |
| `Laravel\Ai\Concerns\InteractsWithFakeAudio` | method keeps the name; state behind Upstream's getters | `fakeAudioGateway` |
| `Laravel\Ai\Concerns\InteractsWithFakeClassification` | method keeps the name; state behind Upstream's getters | `fakeClassificationGateway` |
| `Laravel\Ai\Concerns\InteractsWithFakeEmbeddings` | method keeps the name; state behind Upstream's getters | `fakeEmbeddingGateway` |
| `Laravel\Ai\Concerns\InteractsWithFakeFiles` | method keeps the name; state behind Upstream's getters | `fakeFileGateway` |
| `Laravel\Ai\Concerns\InteractsWithFakeImages` | method keeps the name; state behind Upstream's getters | `fakeImageGateway` |
| `Laravel\Ai\Concerns\InteractsWithFakeReranking` | method keeps the name; state behind Upstream's getters | `fakeRerankingGateway` |
| `Laravel\Ai\Concerns\InteractsWithFakeStores` | method keeps the name; state behind Upstream's getters | `fakeStoreGateway` |
| `Laravel\Ai\Concerns\InteractsWithFakeTranscriptions` | method keeps the name; state behind Upstream's getters | `fakeTranscriptionGateway` |
| `Laravel\Ai\Console\Commands\ChatCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Ai\Console\Commands\MakeAgentCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Ai\Console\Commands\MakeAgentMiddlewareCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Ai\Console\Commands\MakeToolCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Ai\Files\Audio` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\Base64Audio` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\Base64Document` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\Base64Image` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\Base64Video` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\Concerns\HasRemoteContent` | method keeps the name; state behind Upstream's getters | `response` |
| `Laravel\Ai\Files\Document` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\File` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\Image` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\LocalAudio` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\LocalDocument` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\LocalImage` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\LocalVideo` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\ProviderDocument` | method keeps the name; state behind Upstream's getters | `headers`, `id`, `name`, `providerOptions` |
| `Laravel\Ai\Files\ProviderImage` | method keeps the name; state behind Upstream's getters | `headers`, `id`, `name`, `providerOptions` |
| `Laravel\Ai\Files\RemoteAudio` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions`, `response` |
| `Laravel\Ai\Files\RemoteDocument` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions`, `response` |
| `Laravel\Ai\Files\RemoteImage` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions`, `response` |
| `Laravel\Ai\Files\RemoteVideo` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions`, `response` |
| `Laravel\Ai\Files\S3Document` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\StoredAudio` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\StoredDocument` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\StoredImage` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\StoredVideo` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Files\Video` | method keeps the name; state behind Upstream's getters | `headers`, `name`, `providerOptions` |
| `Laravel\Ai\Gateway\FakeClassificationGateway` | method keeps the name; state behind Upstream's getters | `preventStrayClassifications` |
| `Laravel\Ai\Gateway\FakeFileGateway` | method keeps the name; state behind Upstream's getters | `preventStrayOperations` |
| `Laravel\Ai\Gateway\FakeRerankingGateway` | method keeps the name; state behind Upstream's getters | `preventStrayRerankings` |
| `Laravel\Ai\Gateway\FakeStoreGateway` | method keeps the name; state behind Upstream's getters | `preventStrayOperations` |
| `Laravel\Ai\Gateway\FakeTextGateway` | method keeps the name; state behind Upstream's getters | `preventStrayPrompts` |
| `Laravel\Ai\Gateway\ParentInvocation` | method keeps the name; state behind Upstream's getters | `current` |
| `Laravel\Ai\Gateway\StepResult` | method keeps the name; state behind Upstream's getters | `response` |
| `Laravel\Ai\Gateway\TextGenerationOptions` | method keeps the name; state behind Upstream's getters | `providerOptions` |
| `Laravel\Ai\Jobs\BroadcastAgent` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Laravel\Ai\Jobs\GenerateAudio` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Laravel\Ai\Jobs\GenerateEmbeddings` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Laravel\Ai\Jobs\GenerateImage` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Laravel\Ai\Jobs\GenerateTranscription` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Laravel\Ai\Jobs\InvokeAgent` | method keeps the name; state behind Upstream's getters | `afterCommit`, `delay` |
| `Laravel\Ai\Models\Conversation` | method keeps the name; state behind Upstream's getters | `booted`, `booting`, `dispatchesEvents`, `escapeWhenCastingToString`, `isSoftDeletable`, `unguarded`, `usesUniqueIds` |
| `Laravel\Ai\Models\Conversation` | no collision (static and instance sides) | `isMassPrunable`, `isPrunable`, `preventsLazyLoading`, `with` |
| `Laravel\Ai\Models\Conversation` | option(this, name) | `casts` |
| `Laravel\Ai\Models\Conversation` | property wins; method → isTouching() | `touches` |
| `Laravel\Ai\Models\Conversation` | property wins; method → setFillable() | `fillable` |
| `Laravel\Ai\Models\ConversationMessage` | method keeps the name; state behind Upstream's getters | `booted`, `booting`, `dispatchesEvents`, `escapeWhenCastingToString`, `isSoftDeletable`, `unguarded`, `usesUniqueIds` |
| `Laravel\Ai\Models\ConversationMessage` | no collision (static and instance sides) | `isMassPrunable`, `isPrunable`, `preventsLazyLoading`, `with` |
| `Laravel\Ai\Models\ConversationMessage` | option(this, name) | `casts` |
| `Laravel\Ai\Models\ConversationMessage` | property wins; method → isTouching() | `touches` |
| `Laravel\Ai\Models\ConversationMessage` | property wins; method → setFillable() | `fillable` |
| `Laravel\Ai\ObjectSchema` | method keeps the name; state behind Upstream's getters | `name` |
| `Laravel\Ai\PendingResponses\PendingAudioGeneration` | method keeps the name; state behind Upstream's getters | `instructions`, `timeout`, `voice` |
| `Laravel\Ai\PendingResponses\PendingClassification` | method keeps the name; state behind Upstream's getters | `questions`, `timeout` |
| `Laravel\Ai\PendingResponses\PendingEmbeddingsGeneration` | method keeps the name; state behind Upstream's getters | `dimensions`, `shouldCache`, `timeout` |
| `Laravel\Ai\PendingResponses\PendingImageGeneration` | method keeps the name; state behind Upstream's getters | `attachments`, `quality`, `size`, `timeout` |
| `Laravel\Ai\PendingResponses\PendingReranking` | method keeps the name; state behind Upstream's getters | `limit`, `timeout` |
| `Laravel\Ai\PendingResponses\PendingTranscriptionGeneration` | method keeps the name; state behind Upstream's getters | `diarize`, `language`, `timeout` |
| `Laravel\Ai\Prompts\AgentPrompt` | method keeps the name; state behind Upstream's getters | `isFinalAttempt`, `provider`, `runContext` |
| `Laravel\Ai\Providers\AnthropicProvider` | method keeps the name; state behind Upstream's getters | `fileGateway`, `textGateway`, `textGenerationLoop` |
| `Laravel\Ai\Providers\AzureOpenAiProvider` | method keeps the name; state behind Upstream's getters | `azureGateway`, `embeddingGateway`, `fileGateway`, `imageGateway`, `storeGateway`, `textGateway`, `textGenerationLoop` |
| `Laravel\Ai\Providers\BedrockProvider` | method keeps the name; state behind Upstream's getters | `embeddingGateway`, `imageGateway`, `rerankingGateway`, `textGateway`, `textGenerationLoop` |
| `Laravel\Ai\Providers\CohereProvider` | method keeps the name; state behind Upstream's getters | `cohereGateway`, `embeddingGateway`, `rerankingGateway`, `textGateway`, `textGenerationLoop` |
| `Laravel\Ai\Providers\Concerns\HasAudioGateway` | method keeps the name; state behind Upstream's getters | `audioGateway` |
| `Laravel\Ai\Providers\Concerns\HasClassificationGateway` | method keeps the name; state behind Upstream's getters | `classificationGateway` |
| `Laravel\Ai\Providers\Concerns\HasEmbeddingGateway` | method keeps the name; state behind Upstream's getters | `embeddingGateway` |
| `Laravel\Ai\Providers\Concerns\HasFileGateway` | method keeps the name; state behind Upstream's getters | `fileGateway` |
| `Laravel\Ai\Providers\Concerns\HasImageGateway` | method keeps the name; state behind Upstream's getters | `imageGateway` |
| `Laravel\Ai\Providers\Concerns\HasRerankingGateway` | method keeps the name; state behind Upstream's getters | `rerankingGateway` |
| `Laravel\Ai\Providers\Concerns\HasStoreGateway` | method keeps the name; state behind Upstream's getters | `storeGateway` |
| `Laravel\Ai\Providers\Concerns\HasTextGateway` | method keeps the name; state behind Upstream's getters | `textGateway`, `textGenerationLoop` |
| `Laravel\Ai\Providers\Concerns\HasTranscriptionGateway` | method keeps the name; state behind Upstream's getters | `transcriptionGateway` |
| `Laravel\Ai\Providers\DeepSeekProvider` | method keeps the name; state behind Upstream's getters | `textGateway`, `textGenerationLoop` |
| `Laravel\Ai\Providers\ElevenLabsProvider` | method keeps the name; state behind Upstream's getters | `audioGateway`, `transcriptionGateway` |
| `Laravel\Ai\Providers\GeminiProvider` | method keeps the name; state behind Upstream's getters | `audioGateway`, `embeddingGateway`, `fileGateway`, `imageGateway`, `storeGateway`, `textGateway`, `textGenerationLoop`, `transcriptionGateway` |
| `Laravel\Ai\Providers\GroqProvider` | method keeps the name; state behind Upstream's getters | `textGateway`, `textGenerationLoop`, `transcriptionGateway` |
| `Laravel\Ai\Providers\JinaProvider` | method keeps the name; state behind Upstream's getters | `embeddingGateway`, `rerankingGateway` |
| `Laravel\Ai\Providers\MistralProvider` | method keeps the name; state behind Upstream's getters | `audioGateway`, `embeddingGateway`, `mistralGateway`, `textGateway`, `textGenerationLoop`, `transcriptionGateway` |
| `Laravel\Ai\Providers\OllamaProvider` | method keeps the name; state behind Upstream's getters | `embeddingGateway`, `ollamaGateway`, `textGateway`, `textGenerationLoop` |
| `Laravel\Ai\Providers\OpenAiCompatibleProvider` | method keeps the name; state behind Upstream's getters | `classificationGateway`, `embeddingGateway`, `textGateway`, `textGenerationLoop`, `transcriptionGateway` |
| `Laravel\Ai\Providers\OpenAiProvider` | method keeps the name; state behind Upstream's getters | `audioGateway`, `classificationGateway`, `embeddingGateway`, `fileGateway`, `imageGateway`, `storeGateway`, `textGateway`, `textGenerationLoop`, `transcriptionGateway` |
| `Laravel\Ai\Providers\OpenRouterProvider` | method keeps the name; state behind Upstream's getters | `audioGateway`, `classificationGateway`, `embeddingGateway`, `fileGateway`, `imageGateway`, `rerankingGateway`, `textGateway`, `textGenerationLoop`, `transcriptionGateway` |
| `Laravel\Ai\Providers\Tools\CodeExecution` | method keeps the name; state behind Upstream's getters | `providerOptions` |
| `Laravel\Ai\Providers\Tools\FileSearch` | method keeps the name; state behind Upstream's getters | `providerOptions` |
| `Laravel\Ai\Providers\Tools\ProviderTool` | method keeps the name; state behind Upstream's getters | `providerOptions` |
| `Laravel\Ai\Providers\Tools\ToolSearch` | method keeps the name; state behind Upstream's getters | `providerOptions` |
| `Laravel\Ai\Providers\Tools\WebFetch` | method keeps the name; state behind Upstream's getters | `providerOptions` |
| `Laravel\Ai\Providers\Tools\WebSearch` | method keeps the name; state behind Upstream's getters | `providerOptions` |
| `Laravel\Ai\Providers\TypeSafeProvider` | method keeps the name; state behind Upstream's getters | `classificationGateway` |
| `Laravel\Ai\Providers\VoyageAiProvider` | method keeps the name; state behind Upstream's getters | `embeddingGateway`, `rerankingGateway` |
| `Laravel\Ai\Providers\XaiProvider` | method keeps the name; state behind Upstream's getters | `imageGateway`, `textGateway`, `textGenerationLoop` |
| `Laravel\Ai\Responses\AddedDocumentResponse` | method keeps the name; state behind Upstream's getters | `fileId`, `id` |
| `Laravel\Ai\Responses\AudioResponse` | method keeps the name; state behind Upstream's getters | `randomStorageName` |
| `Laravel\Ai\Responses\Data\GeneratedImage` | method keeps the name; state behind Upstream's getters | `mime`, `randomStorageName` |
| `Laravel\Ai\Responses\FileResponse` | method keeps the name; state behind Upstream's getters | `content` |
| `Laravel\Ai\Responses\StoredFileResponse` | method keeps the name; state behind Upstream's getters | `id` |
| `Laravel\Ai\Responses\StreamableAgentResponse` | method keeps the name; state behind Upstream's getters | `hasYielded` |
| `Laravel\Ai\Schema` | method keeps the name; state behind Upstream's getters | `name` |
| `Laravel\Ai\Streaming\Events\Error` | method keeps the name; state behind Upstream's getters | `type` |
| `Laravel\Ai\Streaming\Events\ProviderToolEvent` | method keeps the name; state behind Upstream's getters | `type` |
| `Laravel\Ai\Streaming\Protocols\AgentUserInteractionProtocol` | method keeps the name; state behind Upstream's getters | `response` |
| `Laravel\Ai\StructuredAnonymousAgent` | method keeps the name; state behind Upstream's getters | `instructions`, `messages`, `schema`, `tools` |
| `Laravel\Ai\Tools\AgentTool` | method keeps the name; state behind Upstream's getters | `agent` |
| `Laravel\Ai\Tools\Filesystem\CopyFile` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\Filesystem\DeleteFile` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\Filesystem\FileExists` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\Filesystem\FilesystemTool` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\Filesystem\GetFileMetadata` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\Filesystem\GetFileUrl` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\Filesystem\ListFiles` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\Filesystem\MoveFile` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\Filesystem\ReadFile` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\Filesystem\WriteFile` | method keeps the name; state behind Upstream's getters | `disk` |
| `Laravel\Ai\Tools\LoadSkill` | method keeps the name; state behind Upstream's getters | `skills` |
| `Laravel\Ai\Tools\Request` | method keeps the name; state behind Upstream's getters | `toolCallId`, `toolInvocationId` |
| `Laravel\Ai\Tools\SimilaritySearch` | method keeps the name; state behind Upstream's getters | `description`, `rerank` |
| `Laravel\Boost\BoostServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Laravel\Boost\BoostServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Laravel\Boost\Console\AddSkillCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Boost\Console\ExecuteToolCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Boost\Console\InstallCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Boost\Console\ListSkillCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Boost\Console\StartCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Boost\Console\UpdateCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Boost\Install\GuidelineComposer` | method keeps the name; state behind Upstream's getters | `config`, `guidelines` |
| `Laravel\Boost\Install\Mcp\FileWriter` | method keeps the name; state behind Upstream's getters | `configKey` |
| `Laravel\Boost\Install\Mcp\TomlFileWriter` | method keeps the name; state behind Upstream's getters | `configKey` |
| `Laravel\Boost\Install\RuleComposer` | method keeps the name; state behind Upstream's getters | `rules` |
| `Laravel\Boost\Install\SkillComposer` | method keeps the name; state behind Upstream's getters | `config`, `skills` |
| `Laravel\Boost\Mcp\Prompts\LaravelCodeSimplifier\LaravelCodeSimplifier` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Prompts\UpgradeAiSdkv1\UpgradeAiSdkV1` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Prompts\UpgradeInertiav3\UpgradeInertiaV3` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Prompts\UpgradeLaravelv13\UpgradeLaravelV13` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Prompts\UpgradeLivewirev4\UpgradeLivewireV4` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Resources\ApplicationInfo` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `mimeType`, `name`, `title`, `uri` |
| `Laravel\Boost\Mcp\Tools\ApplicationInfo` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\BrowserLogs` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\DatabaseConnections` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\DatabaseQuery` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\DatabaseSchema` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\GetAbsoluteUrl` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\LastError` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\ReadLogEntries` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\RecordRule` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\SearchDocs` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Boost\Mcp\Tools\Tinker` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Mcp\Client` | method keeps the name; state behind Upstream's getters | `exceptTools`, `onlyTools` |
| `Laravel\Mcp\Client\OAuth\OAuthClient` | method keeps the name; state behind Upstream's getters | `returnTo` |
| `Laravel\Mcp\Client\Primitives\Tool` | method keeps the name; state behind Upstream's getters | `mirroredParameters` |
| `Laravel\Mcp\Client\Protocol` | method keeps the name; state behind Upstream's getters | `cache`, `connected`, `pinnedProtocolVersion` |
| `Laravel\Mcp\Client\Transport\HttpTransport` | method keeps the name; state behind Upstream's getters | `url` |
| `Laravel\Mcp\Console\Commands\InspectorCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Mcp\Console\Commands\MakeAppResourceCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Mcp\Console\Commands\MakePromptCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Mcp\Console\Commands\MakeResourceCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Mcp\Console\Commands\MakeServerCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Mcp\Console\Commands\MakeToolCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Mcp\Console\Commands\StartCommand` | method keeps the name; state behind Upstream's getters | `input` |
| `Laravel\Mcp\Exceptions\JsonRpcException` | method keeps the name; state behind Upstream's getters | `data` |
| `Laravel\Mcp\Request` | method keeps the name; state behind Upstream's getters | `meta`, `uri` |
| `Laravel\Mcp\Response` | method keeps the name; state behind Upstream's getters | `content`, `isError`, `role` |
| `Laravel\Mcp\ResponseFactory` | method keeps the name; state behind Upstream's getters | `responses` |
| `Laravel\Mcp\Server\AppResource` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `mimeType`, `name`, `title`, `uri` |
| `Laravel\Mcp\Server\Completions\ArrayCompletionResponse` | method keeps the name; state behind Upstream's getters | `hasMore`, `values` |
| `Laravel\Mcp\Server\Completions\CompletionResponse` | method keeps the name; state behind Upstream's getters | `hasMore`, `values` |
| `Laravel\Mcp\Server\Completions\DirectCompletionResponse` | method keeps the name; state behind Upstream's getters | `hasMore`, `values` |
| `Laravel\Mcp\Server\Completions\EnumCompletionResponse` | method keeps the name; state behind Upstream's getters | `hasMore`, `values` |
| `Laravel\Mcp\Server\McpServiceProvider` | method keeps the name; state behind Upstream's getters | `publishableMigrationPaths` |
| `Laravel\Mcp\Server\McpServiceProvider` | no collision (static and instance sides) | `publishes` |
| `Laravel\Mcp\Server\Primitive` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Mcp\Server\Prompt` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Mcp\Server\Resource` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `mimeType`, `name`, `title`, `uri` |
| `Laravel\Mcp\Server\ServerContext` | method keeps the name; state behind Upstream's getters | `prompts`, `resources`, `tools` |
| `Laravel\Mcp\Server\Tool` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Mcp\Server\Tools\ExecuteTools` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Mcp\Server\Tools\SearchTools` | method keeps the name; state behind Upstream's getters | `description`, `meta`, `name`, `title` |
| `Laravel\Mcp\Server\Tools\ToolSearch` | method keeps the name; state behind Upstream's getters | `tools` |
| `Laravel\Mcp\Server\Transport\HttpTransport` | method keeps the name; state behind Upstream's getters | `stream` |
| `Laravel\Mcp\Server\Ui\AppMeta` | method keeps the name; state behind Upstream's getters | `csp`, `domain`, `libraries`, `permissions`, `prefersBorder` |
| `Laravel\Mcp\Server\Ui\Csp` | method keeps the name; state behind Upstream's getters | `baseUriDomains`, `connectDomains`, `frameDomains`, `resourceDomains` |
| `Laravel\Mcp\Support\UriTemplate` | method keeps the name; state behind Upstream's getters | `variableNames` |
| `Laravel\Mcp\WebClient` | method keeps the name; state behind Upstream's getters | `exceptTools`, `onlyTools` |

1516 pairs in 737 groups.

<!-- END div12-pairs -->
