// Xaravel Tests for Story 9.9: `mixin`, `classUsesRecursive`, `bootTraits` / `initializeTraits` (AD-26 Traits row).
// One test per acceptance-criterion row of the manifest, in order. XT-runtime-31 and XT-runtime-32 compare with the
// signed Oracle fixtures of `conformance/oracle-requests/9.9.jsonl` (a missing fixture fails the test), then check the
// composition and once-per-class rules the Oracle cannot show. Registrations into the base are process-wide, so every
// FQCN here is used by this file only.
//
// F-10 recorded reason: XT-runtime-31 and XT-runtime-32 are Xaravel Tests (stories/9.9.md has no test_ids), so no
// Upstream test exists whose inputs the requests could take. Per docs/ops/oracle.md § Per-Story requests and epics.md
// (Epic 9: "verified by Oracle Differential Tests"), the requests evaluate only the PHP constructs the acceptance
// criteria name (`class_uses_recursive()`, Model's `bootTraits()` / `initializeTraits()` through `ReflectionMethod`)
// over fixture traits and classes declared in the request (`App\Concerns\*`, `App\Plain\*`, `App\Eloquent\*`), and
// contain no Upstream fixture.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { bootTraits, classUsesRecursive, clearBootedTraits, float, fqcn, initializeTraits, isFloat, jsonEncode, mixin, PhpArray, registerClass } from "@xaravel/runtime";

const REPO = resolve(import.meta.dir, "..", "..", "..", "..");

/** The part of the grader's Oracle helpers (`packages/assert/tests/xaravel/oracle-values.ts`) this file uses. */
interface Output {
  error: unknown;
  results: ({ value: unknown } | { throws: unknown })[];
}
interface OracleValues {
  decode: (encoded: unknown) => unknown;
  readRequests: (path: string) => { id: string; sha256: string; exprs: string[] }[];
  readSignedFixture: (path: string, sha256: string, publicKeyPem: string) => Output;
}

// The runtime has no dependencies (AD-2), so its tsc project cannot reference @xaravel/assert's test files; the
// grader's fixture reader is loaded at run time instead of being re-implemented here.
const ORACLE_VALUES = join(REPO, "packages", "assert", "tests", "xaravel", "oracle-values.ts");
const { decode, readRequests, readSignedFixture } = (await import(ORACLE_VALUES)) as OracleValues;
const REQUESTS = "conformance/oracle-requests/9.9.jsonl";
const FIXTURES = "conformance/fixtures/runtime";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";

/** The signed Oracle output of the Story's one request for `id` (whose first expr is `firstExpr`, when given). */
function oracle(id: string, firstExpr?: string): Output {
  const requests = readRequests(join(REPO, REQUESTS)).filter((request) => request.id === id && (firstExpr === undefined || request.exprs[0] === firstExpr));
  if (requests.length !== 1) {
    throw new Error(`${REQUESTS}: expected one request for ${id}${firstExpr === undefined ? "" : ` with first expr ${firstExpr}`}, found ${requests.length}`);
  }
  const request = requests[0]!;
  const output = readSignedFixture(join(REPO, FIXTURES, `${request.sha256}.json`), request.sha256, readFileSync(join(REPO, PUBLIC_KEY), "utf8"));
  if (output.error !== null) {
    throw new Error(`${id}: the Oracle reported an error: ${jsonEncode(output.error)}`);
  }
  return output;
}

/** The decoded value of result `index`. */
function result(output: Output, index: number): unknown {
  const entry = output.results[index];
  if (entry === undefined || !("value" in entry)) {
    throw new Error(`result ${index} is not a value: ${jsonEncode(entry ?? null)}`);
  }
  return decode(entry.value);
}

/** The value `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

function assertThrows(fn: () => unknown, type: new (...args: never[]) => Error, message: string | RegExp): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof type, `expected a ${type.name}: ${String(error)}`);
  if (typeof message === "string") {
    Assert.assertSame(message, (error as Error).message);
  } else {
    Assert.assertTrue(message.test((error as Error).message), `unexpected message: ${(error as Error).message}`);
  }
}

/** A method read without binding it (it is only compared, never called). */
function member(holder: object, key: string): unknown {
  return Reflect.get(holder, key);
}

/** What the boot and initialize methods of the fixtures log: `<method>:<static::class>`. */
const log: string[] = [];

function logged(fn: () => unknown): string[] {
  log.length = 0;
  fn();
  return log.splice(0);
}

// The fixture traits of both requests (XT-runtime-31 declares them without methods; the members do not change
// class_uses_recursive). `Inner` has a property default, reached twice by `Comment` (a diamond).
class Inner {
  tags: string[] = [];
  static bootInner(this: object): void {
    log.push(`bootInner:${fqcn(this)}`);
  }
  initializeInner(): void {
    log.push(`initializeInner:${fqcn(this)}`);
  }
}
registerClass("App\\Concerns\\Inner", Inner);

class HasA extends mixin(null, Inner) {
  static bootHasA(this: object): void {
    log.push(`bootHasA:${fqcn(this)}`);
  }
  initializeHasA(): void {
    log.push(`initializeHasA:${fqcn(this)}`);
  }
}
registerClass("App\\Concerns\\HasA", HasA);

class HasB {
  static bootHasB(this: object): void {
    log.push(`bootHasB:${fqcn(this)}`);
  }
  initializeHasB(): void {
    log.push(`initializeHasB:${fqcn(this)}`);
  }
}
registerClass("App\\Concerns\\HasB", HasB);

class HasC extends mixin(null, Inner) {
  static bootHasC(this: object): void {
    log.push(`bootHasC:${fqcn(this)}`);
  }
}
registerClass("App\\Concerns\\HasC", HasC);

class HasP {
  static bootHasP(this: object): void {
    log.push(`bootHasP:${fqcn(this)}`);
  }
  initializeHasP(): void {
    log.push(`initializeHasP:${fqcn(this)}`);
  }
}
registerClass("App\\Concerns\\HasP", HasP);

// XT-runtime-31's plain classes.
class Base extends mixin(null, HasP) {}
registerClass("App\\Plain\\Base", Base);
class Post extends mixin(Base, HasA, HasB) {}
registerClass("App\\Plain\\Post", Post);
class Comment extends mixin(Base, HasB, HasC, HasA) {}
registerClass("App\\Plain\\Comment", Comment);
class Reply extends mixin(Comment, HasB) {}
registerClass("App\\Plain\\Reply", Reply);
class Plain {}
registerClass("App\\Plain\\Plain", Plain);

// XT-runtime-32's classes: a JS host stands for Eloquent's Model, calling initializeTraits from its constructor.
class Host {
  constructor() {
    initializeTraits(this);
  }
}
abstract class EloquentBase extends mixin(Host, HasP) {}
registerClass("App\\Eloquent\\Base", EloquentBase);
class EloquentPost extends mixin(EloquentBase, HasA, HasB) {
  static override bootHasB(this: object): void {
    log.push(`Post::bootHasB:${fqcn(this)}`);
  }
  static bootOther(this: object): void {
    log.push(`bootOther:${fqcn(this)}`);
  }
  initializeOther(): void {
    log.push(`initializeOther:${fqcn(this)}`);
  }
}
registerClass("App\\Eloquent\\Post", EloquentPost);
class EloquentComment extends mixin(EloquentBase, HasB, HasC, HasA) {}
registerClass("App\\Eloquent\\Comment", EloquentComment);
class EloquentReply extends mixin(EloquentComment, HasB) {}
registerClass("App\\Eloquent\\Reply", EloquentReply);

// XT-runtime-31's trait-default classes (ESC-9.9-2): each base declares its PHP property table and, as the request's
// `App\Defaults\initialize()`, calls initializeTraits from its constructor, after its own fields are set.
const PHP_PROPERTIES = Symbol.for("xaravel.php.properties");

class DefaultsHost {
  static readonly [PHP_PROPERTIES] = [];
  constructor() {
    initializeTraits(this);
  }
}
registerClass("App\\Defaults\\Host", DefaultsHost);
class DefaultsNamed {
  static readonly [PHP_PROPERTIES] = [{ name: "name", visibility: "public", default: "parent" }];
  name: string = "parent";
  constructor() {
    initializeTraits(this);
  }
}
registerClass("App\\Defaults\\Named", DefaultsNamed);
class DefaultsGuarded {
  static readonly [PHP_PROPERTIES] = [{ name: "guarded", visibility: "protected", default: ["*"] }];
  protected guarded: string[] = ["*"];
  constructor() {
    initializeTraits(this);
  }
  getGuarded(): string[] {
    return this.guarded;
  }
}
registerClass("App\\Defaults\\Guarded", DefaultsGuarded);

class SetsName {
  name: string = "named";
}
registerClass("App\\Concerns\\SetsName", SetsName);
class WritesName {
  name: string = "named";
  initializeWritesName(): void {
    this.name = "written";
  }
}
registerClass("App\\Concerns\\WritesName", WritesName);
class Flags {
  flag = false;
  initializeFlags(): void {
    this.flag = true;
  }
}
registerClass("App\\Concerns\\Flags", Flags);
class Unguards {
  protected guarded: string[] = [];
}
registerClass("App\\Concerns\\Unguards", Unguards);

class UsesName extends mixin(DefaultsNamed, SetsName) {}
registerClass("App\\Defaults\\UsesName", UsesName);
class UsesWrites extends mixin(DefaultsNamed, WritesName) {}
registerClass("App\\Defaults\\UsesWrites", UsesWrites);
class Flagged extends mixin(DefaultsHost, Flags) {}
registerClass("App\\Defaults\\Flagged", Flagged);
class Open extends mixin(DefaultsGuarded, Unguards) {}
registerClass("App\\Defaults\\Open", Open);

/** The DIV-12.8 limits of a trait default against a base property, and the private-slot rule, pinned locally. */
function checkDefaultLimits(): void {
  // DIV-12.8, a write equal to the declared default: it looks untouched, so the trait's default replaces it, where
  // PHP keeps "parent".
  class WritesParent {
    name: string = "named";
    initializeWritesParent(): void {
      this.name = "parent";
    }
  }
  registerClass("App\\Concerns\\XtWritesParent", WritesParent);
  class UsesWritesParent extends mixin(DefaultsNamed, WritesParent) {}
  registerClass("App\\Defaults\\XtUsesWritesParent", UsesWritesParent);
  Assert.assertSame("named", new UsesWritesParent().name, "DIV-12.8: a constructor write equal to the declared default is replaced");
  // A private base property is a separate PHP slot: it never counts as the base's default, so its value is kept.
  class Secret {
    static readonly [PHP_PROPERTIES] = [{ name: "name", visibility: "private", default: "parent" }];
    name: string = "parent";
  }
  registerClass("App\\Defaults\\XtSecret", Secret);
  class UsesSecret extends mixin(Secret, SetsName) {}
  registerClass("App\\Defaults\\XtUsesSecret", UsesSecret);
  Assert.assertSame("parent", new UsesSecret().name);
}

/** The composition rules of `mixin` (the matrix's local Composition row). */
function checkComposition(): void {
  const COUNTER = Symbol("counter");
  class Counts {
    hits: number[] = [1];
    static registry: string[] = ["a"];
    static label = "counts";
    count(): string {
      return `count:${fqcn(this)}`;
    }
    get doubled(): number {
      return (this.hits[0] ?? 0) * 2;
    }
    [COUNTER](): string {
      return "symbol";
    }
    static make(this: object): string {
      return `make:${fqcn(this)}`;
    }
  }
  registerClass("App\\Concerns\\XtCounts", Counts);
  class Named {
    name = "named";
    count(): string {
      return "Named::count";
    }
    describe(): string {
      return `${this.name}:${this.count()}`;
    }
  }
  registerClass("App\\Concerns\\XtNamed", Named);
  class Parent {
    readonly made: string;
    name = "parent";
    constructor(made: string) {
      this.made = made;
    }
    count(): string {
      return "Parent::count";
    }
    greet(): string {
      return "Parent::greet";
    }
  }
  registerClass("App\\Plain\\XtParent", Parent);

  // Collision: Counts and Named both declare count(); calling it throws PHP's message, naming the receiver.
  class Collides extends mixin(Parent, Counts, Named) {}
  registerClass("App\\Plain\\XtCollides", Collides);
  const collides = new Collides("made");
  assertThrows(
    () => collides.count(),
    Error,
    "Trait method App\\Concerns\\XtNamed::count has not been applied as App\\Plain\\XtCollides::count, because of collision with App\\Concerns\\XtCounts::count",
  );
  // A class that overrides the method resolves the collision, as in PHP.
  class Resolves extends mixin(Parent, Counts, Named) {
    override count(): string {
      return "Resolves::count";
    }
    override greet(): string {
      return `Resolves::greet>${super.greet()}`;
    }
  }
  registerClass("App\\Plain\\XtResolves", Resolves);
  const one = new Resolves("built");
  Assert.assertSame("Resolves::count", one.count());
  // Own members first, then the traits', then the base's; `super` in the class reaches the trait layer, then Base.
  Assert.assertSame("Resolves::greet>Parent::greet", one.greet());
  Assert.assertSame("built", one.made);
  // DIV-12.8, no table: Parent declares no PHP property table, so its field `name` keeps its value against Named's
  // default, where PHP has the trait's "named" (ESC-9.9-2).
  Assert.assertSame("parent:Resolves::count", one.describe(), "DIV-12.8: a base without a property table keeps its value");
  // Accessors, symbol-keyed methods and per-instance defaults.
  Assert.assertSame(2, one.doubled);
  Assert.assertSame("symbol", one[COUNTER]());
  const two = new Resolves("other");
  one.hits.push(2);
  Assert.assertSame(jsonEncode([1, 2]), jsonEncode(one.hits));
  Assert.assertSame(jsonEncode([1]), jsonEncode(two.hits));
  Assert.assertSame(jsonEncode(["hits", "made", "name"]), jsonEncode(Object.keys(one).sort()));
  // Statics: methods see the using class as `this`; data is copied per using class.
  Assert.assertSame("make:App\\Plain\\XtResolves", Resolves.make());
  Assert.assertSame("make:App\\Plain\\XtCollides", Collides.make());
  Resolves.registry.push("b");
  Assert.assertSame(jsonEncode(["a", "b"]), jsonEncode(Resolves.registry));
  Assert.assertSame(jsonEncode(["a"]), jsonEncode(Collides.registry));
  Assert.assertSame(jsonEncode(["a"]), jsonEncode(Counts.registry));
  Assert.assertSame("counts", Resolves.label);
  // The Registry brand of a trait is never copied onto a layer, so the class keeps its own identity.
  Assert.assertSame("App\\Plain\\XtResolves", fqcn(Resolves));
  Assert.assertSame("App\\Plain\\XtResolves", fqcn(one));
  // instanceof: the base is a type, a trait is not (PHP's instanceof is false for a trait).
  Assert.assertTrue(one instanceof Resolves);
  Assert.assertTrue(one instanceof Parent);
  Assert.assertFalse(one instanceof Counts);
  Assert.assertFalse(one instanceof Named);
  // A diamond (HasC and HasA both use Inner) applies Inner once: no collision, one default.
  const comment = new Comment();
  Assert.assertSame(jsonEncode([]), jsonEncode(comment.tags));
  Assert.assertSame("function", typeof member(Comment, "bootInner"));
  Assert.assertSame(member(Inner, "bootInner"), member(Comment, "bootInner"));
  Assert.assertSame(member(Inner.prototype, "initializeInner"), member(Comment.prototype, "initializeInner"));
  // A trait's own members come before the traits it uses: HasA's are its own, Inner's through it.
  Assert.assertSame(member(HasA, "bootHasA"), member(Post, "bootHasA"));
  Assert.assertSame(member(Inner, "bootInner"), member(Post, "bootInner"));
  // Two traits with different defaults for one property: mixin throws, naming both traits and the property.
  class Tagged {
    tags = ["x"];
  }
  registerClass("App\\Concerns\\XtTagged", Tagged);
  assertThrows(() => mixin(null, Inner, Tagged), Error, /App\\Concerns\\Inner and App\\Concerns\\XtTagged define the same property \(\$tags\)/);
  // The same default from two traits is compatible, as in PHP.
  class SameTags {
    tags: string[] = [];
  }
  registerClass("App\\Concerns\\XtSameTags", SameTags);
  Assert.assertSame(jsonEncode([]), jsonEncode(new (mixin(null, Inner, SameTags))().tags));
  // Two traits with different static methods of one name: calling it throws PHP's collision message.
  class StaticOne {
    static make(): string {
      return "one";
    }
    get label(): string {
      return "one";
    }
  }
  registerClass("App\\Concerns\\XtStaticOne", StaticOne);
  class StaticTwo {
    static make(): string {
      return "two";
    }
    get label(): string {
      return "two";
    }
  }
  registerClass("App\\Concerns\\XtStaticTwo", StaticTwo);
  class StaticClash extends mixin(null, StaticOne, StaticTwo) {}
  registerClass("App\\Plain\\XtStaticClash", StaticClash);
  assertThrows(
    () => StaticClash.make(),
    Error,
    "Trait method App\\Concerns\\XtStaticTwo::make has not been applied as App\\Plain\\XtStaticClash::make, because of collision with App\\Concerns\\XtStaticOne::make",
  );
  // Two traits with different getters of one name: reading it throws.
  assertThrows(
    () => new StaticClash().label,
    Error,
    "Trait method App\\Concerns\\XtStaticTwo::label has not been applied as App\\Plain\\XtStaticClash::label, because of collision with App\\Concerns\\XtStaticOne::label",
  );
  // Different static data: mixin throws the property message; identical static arrays compose.
  class ListA {
    static items: string[] = ["a"];
  }
  registerClass("App\\Concerns\\XtListA", ListA);
  class ListB {
    static items: string[] = ["b"];
  }
  registerClass("App\\Concerns\\XtListB", ListB);
  class ListA2 {
    static items: string[] = ["a"];
  }
  registerClass("App\\Concerns\\XtListA2", ListA2);
  assertThrows(() => mixin(null, ListA, ListB), Error, /App\\Concerns\\XtListA and App\\Concerns\\XtListB define the same property \(\$items\)/);
  Assert.assertSame(jsonEncode(["a"]), jsonEncode(mixin(null, ListA, ListA2).items));
  // Identical PhpArray defaults compose.
  class MapA {
    map = new PhpArray([[1, "x"]]);
  }
  registerClass("App\\Concerns\\XtMapA", MapA);
  class MapB {
    map = new PhpArray([[1, "x"]]);
  }
  registerClass("App\\Concerns\\XtMapB", MapB);
  Assert.assertSame(1, [...new (mixin(null, MapA, MapB))().map].length);
  // A float default reached through a diamond composes, and stays a float.
  class Ratio {
    ratio = float(1.0);
  }
  registerClass("App\\Concerns\\XtRatio", Ratio);
  class RatioA extends mixin(null, Ratio) {}
  registerClass("App\\Concerns\\XtRatioA", RatioA);
  class RatioB extends mixin(null, Ratio) {}
  registerClass("App\\Concerns\\XtRatioB", RatioB);
  Assert.assertTrue(isFloat(new (mixin(null, RatioA, RatioB))().ratio));
  // A collision inside a trait (T uses two traits that collide) is kept when T is used.
  class Nested extends mixin(null, StaticOne, StaticTwo) {}
  registerClass("App\\Concerns\\XtNested", Nested);
  class UsesNested extends mixin(null, Nested) {}
  registerClass("App\\Plain\\XtUsesNested", UsesNested);
  assertThrows(() => UsesNested.make(), Error, /has not been applied as App\\Plain\\XtUsesNested::make, because of collision/);
  // A field declared without an initializer reads null, never undefined (AD-9).
  class Bare {
    declared?: string;
  }
  registerClass("App\\Concerns\\XtBareField", Bare);
  Assert.assertNull(new (mixin(null, Bare))().declared);
  // An unregistered trait has no FQCN: classUsesRecursive throws fqcn()'s TypeError.
  class Unregistered {}
  class UsesUnregistered extends mixin(null, Unregistered) {}
  registerClass("App\\Plain\\XtUsesUnregistered", UsesUnregistered);
  assertThrows(() => classUsesRecursive(UsesUnregistered), TypeError, "fqcn(): the class is not registered; end its file with registerClass('<FQCN>', <Class>)");
}

xaravelTest(
  "XT-runtime-31",
  "class X extends mixin(Base, TraitA, TraitB), with traits registered under their Upstream FQCNs: classUsesRecursive(X) returns the trait FQCNs, traits used by traits included, in Upstream order, as the Oracle's class_uses_recursive (for a class, an instance, an FQCN and a trait); members resolve own, then traits', then the base's, statics and defaults are copied per class and instance, a diamond applies once and a collision throws PHP's message when called; a trait default replaces a base property still at its declared default, as the Oracle's, and keeps any other value, except in the two DIV-12.8 cases (no property table: the base's value is kept; a write equal to the declared default: the trait's default applies) (AD-26, ESC-9.9-2)",
  () => {
    checkComposition();
    checkDefaultLimits();
    const defaults = oracle("XT-runtime-31", "(new \\App\\Defaults\\UsesName())->name");
    const instances: [string, () => unknown][] = [
      ["UsesName->name", () => new UsesName().name],
      ["UsesWrites->name", () => new UsesWrites().name],
      ["Flagged->flag", () => new Flagged().flag],
      ["Open->getGuarded()", () => new Open().getGuarded()],
    ];
    for (const [index, [label, read]] of instances.entries()) {
      Assert.assertSame(jsonEncode(result(defaults, index)), jsonEncode(read()), label);
    }
    const output = oracle("XT-runtime-31", "class_uses_recursive(\\App\\Plain\\Base::class)");
    const cases: [string, unknown][] = [
      ["Base", Base],
      ["Post", Post],
      ["Comment", Comment],
      ["Reply", Reply],
      ["Plain", Plain],
      ["new Comment", new Comment()],
      ["'App\\Plain\\Reply'", "App\\Plain\\Reply"],
      ["HasA", HasA],
    ];
    for (const [index, [label, reference]] of cases.entries()) {
      Assert.assertSame(jsonEncode(result(output, index)), jsonEncode(classUsesRecursive(reference as object)), `class_uses_recursive(${label})`);
    }
  },
);

xaravelTest(
  "XT-runtime-32",
  "bootTraits(X) calls each boot<Trait> once per class, with the class as this, and initializeTraits(instance) each initialize<Trait> once per instance, in Upstream order (the class's own methods, its traits' in use order, then its parent's), as the Oracle's Model::bootTraits / initializeTraits; clearBootedTraits lets a class boot again (AD-26)",
  () => {
    // The local rows first, so a missing fixture hides none of them.
    clearBootedTraits(EloquentPost);
    bootTraits(EloquentPost);
    // Once per class: a second bootTraits, and a second instance, boot nothing; each instance initializes once.
    Assert.assertSame(jsonEncode([]), jsonEncode(logged(() => bootTraits(EloquentPost))));
    Assert.assertSame(
      jsonEncode(["initializeHasA:App\\Eloquent\\Post", "initializeInner:App\\Eloquent\\Post", "initializeHasB:App\\Eloquent\\Post", "initializeHasP:App\\Eloquent\\Post"]),
      jsonEncode(logged(() => new EloquentPost())),
    );
    // A subclass boots on its own, with itself as static::class.
    class Sub extends EloquentPost {}
    registerClass("App\\Eloquent\\XtSub", Sub);
    Assert.assertSame(
      jsonEncode(["Post::bootHasB:App\\Eloquent\\XtSub", "bootHasA:App\\Eloquent\\XtSub", "bootInner:App\\Eloquent\\XtSub", "bootHasP:App\\Eloquent\\XtSub"]),
      jsonEncode(logged(() => bootTraits(Sub))),
    );
    // clearBootedTraits forgets the class only: Post boots again, Sub does not.
    clearBootedTraits(EloquentPost);
    Assert.assertSame(4, logged(() => bootTraits(EloquentPost)).length);
    Assert.assertSame(0, logged(() => bootTraits(Sub)).length);
    // An instance made inside a boot method does not boot again, and runs every initializer.
    class Eager {
      static bootEager(this: new () => object): void {
        log.push("bootEager");
        new this();
      }
      initializeEager(): void {
        log.push("initializeEager");
      }
    }
    registerClass("App\\Concerns\\Eager", Eager);
    class EagerModel extends mixin(Host, Eager) {}
    registerClass("App\\Eloquent\\XtEager", EagerModel);
    Assert.assertSame(jsonEncode(["bootEager", "initializeEager", "initializeEager"]), jsonEncode(logged(() => new EagerModel())));
    // A class with no traits boots nothing and initializes nothing.
    class Bare extends Host {}
    registerClass("App\\Eloquent\\XtBare", Bare);
    Assert.assertSame(jsonEncode([]), jsonEncode(logged(() => new Bare())));
    Assert.assertSame(jsonEncode([]), jsonEncode(classUsesRecursive(Bare)));

    const output = oracle("XT-runtime-32");
    const classes: [string, new () => object][] = [
      ["Post", EloquentPost],
      ["Comment", EloquentComment],
      ["Reply", EloquentReply],
    ];
    for (const [index, [label, klass]] of classes.entries()) {
      clearBootedTraits(klass);
      const boot = logged(() => bootTraits(klass));
      const initialize = logged(() => new klass());
      Assert.assertSame(jsonEncode(result(output, index)), jsonEncode([boot, initialize]), label);
    }
  },
);
