// Xaravel Tests for action item epic-15-retro-item-10-runtime-trait-registry (decisions/MAINT-2026-10-30-epic-15-items-2-5.md
// item 2.3): the Class Registry's declaration-time trait mark, `registerTrait`, and PHP's `trait_exists`, with
// `class_exists` false for a trait nothing has composed. XT-runtime-148. No Oracle fixture is needed: each expected
// value and message is what PHP 8.5.11 gives for the same call, probed with the host's `php`: `trait-registry.probe.php`
// prints each value as `<label>\t<json_encode(value)>` and `trait-registry.probe.txt` is its output (`php -d
// error_reporting=0 trait-registry.probe.php > trait-registry.probe.txt`). Every recorded label is recomputed with the
// runtime. Not recorded: the assertions marked `Xaravel-only`, which have no PHP counterpart (the Registry's API, its
// JS `TypeError`s and the mark itself).
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import * as registry from "@xaravel/runtime/registry";
import { fqcn, registerClass, registerTrait, resolveClass } from "@xaravel/runtime/registry";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";

const evidence = new Map(
  readFileSync(`${import.meta.dir}/trait-registry.probe.txt`, "utf8").trim().split("\n").map((line) => {
    const tab = line.indexOf("\t");
    return [line.slice(0, tab), line.slice(tab + 1)] as const;
  }),
);

/** The probe's fixture `Plain`: a class. */
class Plain {}
registerClass("XaravelFixture\\TraitRegistry\\Plain", Plain);

/** The probe's fixture enum `Suit` (AD-26): a class with a static `cases`. */
class Suit {
  static readonly Hearts: Suit = new Suit();

  static cases(): Suit[] {
    return [Suit.Hearts];
  }
}
registerClass("XaravelFixture\\TraitRegistry\\Suit", Suit);

/** The probe's fixture trait `Greets`, declared with `registerTrait` and never composed. */
class Greets {}
registerTrait("XaravelFixture\\TraitRegistry\\Greets", Greets);
registerClass("XaravelFixture\\TraitRegistry\\Greets", Greets);

function json(value: unknown): string {
  return p.jsonEncode(value) as string;
}

/** The probe's `attempt`: the result, or "<class>: <message>" for a throw. */
function attempt(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    return `${fqcn(error as object)}: ${(error as Error).message}`;
  }
}

/** The probe's `each_call`: each argument list through `fn`. */
function eachCall(fn: (...args: never[]) => unknown, calls: readonly (readonly unknown[])[]): unknown[] {
  return calls.map((args) => attempt(() => Reflect.apply(fn, undefined, args)));
}

/** A JS `TypeError` (not PHP's) thrown by `fn`, as its message; fails when `fn` throws anything else or nothing. */
function jsTypeError(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    Assert.assertTrue(error instanceof TypeError && !(error instanceof p.TypeError), `a JS TypeError: ${String(error)}`);
    return (error as Error).message;
  }
  Assert.fail("no JS TypeError thrown");
  return "";
}

/** The probe's `$calls`, the same argument lists for both functions. */
const CALLS = (): unknown[][] => [
  ["XaravelFixture\\TraitRegistry\\Greets"], ["\\XaravelFixture\\TraitRegistry\\GREETS"], ["xaravelfixture\\traitregistry\\greets"],
  ["XaravelFixture\\TraitRegistry\\Greets", false], ["XaravelFixture\\TraitRegistry\\Plain"], ["stdClass"],
  ["XaravelFixture\\TraitRegistry\\Suit"], ["Stringable"], ["Nope\\Nothing"], [""], [5], [null], [[]],
  ["x", []], ["XaravelFixture\\TraitRegistry\\Greets", []], ["\\\\XaravelFixture\\TraitRegistry\\Greets"],
];

/** Each probe label's runtime computation, as `trait-registry.probe.php` computes it with PHP. */
const CASES: Readonly<Record<string, () => unknown>> = {
  class_exists: () => eachCall(p.class_exists, CALLS()),
  trait_exists: () => eachCall(p.trait_exists, CALLS()),
  reflection: () => {
    const fn = PHP_FUNCTIONS["trait_exists"]!;
    return [fn.name, fn.required, fn.total, fn.variadic, [...fn.byRef]];
  },
  counts: () => {
    const fn = PHP_FUNCTIONS["trait_exists"]!;
    return [attempt(() => fn.call()), attempt(() => fn.call(...Array.from({ length: fn.total + 1 }, () => null)))];
  },
};

xaravelTest(
  "XT-runtime-148",
  "registerTrait registers a class as registerClass does and marks it a PHP trait at declaration, so class_exists is false and trait_exists true for it before anything composes it, as PHP 8.5.11 gives; trait_exists is a PHP function-name registry entry with PHP's coercion, TypeErrors and ReflectionFunction counts, exported from the root and @xaravel/runtime/php as the same object; registerTrait throws as registerClass does, naming registerTrait() (epic-15-retro-item-10-runtime-trait-registry)",
  () => {
    // Every recorded label is computed, and every computed label recorded.
    Assert.assertSame(json([...evidence.keys()].sort()), json(Object.keys(CASES).sort()));
    for (const [label, compute] of Object.entries(CASES)) {
      Assert.assertSame(evidence.get(label), json(compute()), label);
    }

    // Xaravel-only: root and subpath identity, and the registry entry.
    Assert.assertSame(p.trait_exists, root.trait_exists);
    Assert.assertSame(PHP_FUNCTIONS["trait_exists"]!.fn, p.trait_exists);
    Assert.assertSame(registry.registerTrait, root.registerTrait);
    Assert.assertTrue(p.function_exists("trait_exists"));
    Assert.assertTrue(p.is_callable("trait_exists"));

    // Xaravel-only: identity is unchanged by registerTrait.
    Assert.assertSame("XaravelFixture\\TraitRegistry\\Greets", fqcn(Greets));
    Assert.assertSame(Greets, resolveClass("XaravelFixture\\TraitRegistry\\Greets"));
    Assert.assertSame(Greets, resolveClass("\\xaravelfixture\\traitregistry\\GREETS"));

    // Xaravel-only: the mark is an own, non-enumerable, non-writable, non-configurable `true`.
    const mark = Object.getOwnPropertyDescriptor(Greets, Symbol.for("xaravel.traits.trait"));
    Assert.assertSame(json({ value: true, writable: false, enumerable: false, configurable: false }), json(mark ?? null));
    Assert.assertFalse(Object.hasOwn(Plain, Symbol.for("xaravel.traits.trait")));

    // Xaravel-only: registerTrait again, and registerClass after it, are no-ops; the class stays a trait.
    registerTrait("XaravelFixture\\TraitRegistry\\Greets", Greets);
    registerTrait("\\XaravelFixture\\TraitRegistry\\Greets", Greets);
    registerClass("XaravelFixture\\TraitRegistry\\Greets", Greets);
    Assert.assertSame("XaravelFixture\\TraitRegistry\\Greets", fqcn(Greets));
    Assert.assertTrue(p.trait_exists(fqcn(Greets)));
    Assert.assertFalse(p.class_exists(fqcn(Greets)));

    // Xaravel-only: a class composing a registered trait stays a class, and mixin keeps the trait's mark as it is.
    class UsesGreets extends root.mixin(null, Greets) {}
    registerClass("XaravelFixture\\TraitRegistry\\UsesGreets", UsesGreets);
    Assert.assertTrue(p.class_exists(fqcn(UsesGreets)));
    Assert.assertFalse(p.trait_exists(fqcn(UsesGreets)));
    Assert.assertSame(json(["XaravelFixture\\TraitRegistry\\Greets"]), json(Object.values(root.classUsesRecursive(UsesGreets))));
    Assert.assertTrue(p.trait_exists(fqcn(Greets)));

    // Xaravel-only: the conflicts registerClass refuses, named for registerTrait(); a refused class is not marked.
    class Other {}
    Assert.assertSame(
      "registerTrait(): XaravelFixture\\TraitRegistry\\Plain is already registered to another class",
      jsTypeError(() => registerTrait("XaravelFixture\\TraitRegistry\\Plain", Other)),
    );
    Assert.assertFalse(Object.hasOwn(Other, Symbol.for("xaravel.traits.trait")));
    Assert.assertTrue(p.class_exists("XaravelFixture\\TraitRegistry\\Plain"));
    Assert.assertSame(
      "registerTrait(): the class registered as XaravelFixture\\TraitRegistry\\Plain cannot also be registered as XaravelFixture\\TraitRegistry\\Elsewhere",
      jsTypeError(() => registerTrait("XaravelFixture\\TraitRegistry\\Elsewhere", Plain)),
    );
    Assert.assertFalse(Object.hasOwn(Plain, Symbol.for("xaravel.traits.trait")));
    Assert.assertSame(
      "registerTrait(): XaravelFixture\\TraitRegistry\\NotAClass must be registered with a class",
      jsTypeError(() => registerTrait("XaravelFixture\\TraitRegistry\\NotAClass", {} as never)),
    );
    Assert.assertSame("registerTrait(): the FQCN must be a non-empty string", jsTypeError(() => registerTrait("", Other)));
    Assert.assertSame("registerTrait(): the FQCN must be a non-empty string", jsTypeError(() => registerTrait("\\", Other)));
    Assert.assertSame("registerTrait(): the FQCN must be a non-empty string", jsTypeError(() => registerTrait(5 as never, Other)));
    Assert.assertFalse(Object.hasOwn(Other, Symbol.for("xaravel.traits.trait")));
    // registerClass keeps its own name in the same messages.
    Assert.assertSame("registerClass(): the FQCN must be a non-empty string", jsTypeError(() => registerClass("", Other)));
  },
);
