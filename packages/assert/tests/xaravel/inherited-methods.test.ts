// Xaravel Test for retro item epic-10-item-5 (XT-assert-23; FR-116, AD-1,
// AD-2, AD-26, ESC-10.2-4). Its test is declared through `xaravelTest`, as
// XT-conformance-128 requires of every Xaravel Test file.
//
// F-10: this test has no Upstream test inputs; it is the follow-up of
// ESC-10.2-4 (approved option 1, and its 2026-10-23 clarification: built-ins
// are PHP names): a PHPUnit double of a contract token doubles the methods of
// its parents closure and the built-ins each token lists, as a PHP mock of a
// child interface (or of one extending `Countable`, `ArrayAccess`,
// `IteratorAggregate` or `Stringable`) has every inherited method. It needs no
// Oracle fixture: which methods a PHP mock of an interface has is the
// language's reflection, not a library's.
//
// The grader never imports @xaravel/contracts (AD-2), so every token here is a
// stand-in built as Story 10.1's and 10.2's tokens are:
// `Symbol.for('xaravel.class.fqcn')`, `Symbol.for('xaravel.contract.methods')`,
// `Symbol.for('xaravel.contract.builtins')`, `Symbol.for('xaravel.contract.parents')`
// and a `Symbol.hasInstance` that reads the brand `Symbol.for('<FQCN>')`.
import { expect } from "bun:test";
import { TestCase, xaravelTest } from "../../src/index";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const CONTRACT_BUILTINS = Symbol.for("xaravel.contract.builtins");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");
const SIGNATURE = Symbol.for("xaravel.api.signature");

type Token = { readonly [Symbol.hasInstance]: (value: unknown) => boolean };

interface TokenSpec {
  readonly methods?: readonly string[];
  /** Read as given (not copied), so a test can give a bad value; `undefined` leaves the key out. */
  readonly builtins?: unknown;
  readonly parents?: () => unknown;
}

/** A stand-in contract token; `parents` is read lazily. */
function token(fqcn: string, spec: TokenSpec = {}): Token {
  const brand = Symbol.for(fqcn);
  const value: Record<symbol, unknown> = {
    [CLASS_FQCN]: fqcn,
    [CONTRACT_METHODS]: Object.freeze([...(spec.methods ?? [])]),
    [Symbol.hasInstance]: (candidate: unknown): boolean => typeof candidate === "object" && candidate !== null && (candidate as Record<symbol, unknown>)[brand] === true,
  };
  if (spec.builtins !== undefined) {
    value[CONTRACT_BUILTINS] = spec.builtins;
  }
  if (spec.parents !== undefined) {
    const parents = spec.parents;
    Object.defineProperty(value, CONTRACT_PARENTS, { get: parents, enumerable: true });
  }
  return Object.freeze(value) as unknown as Token;
}

type Double = Record<string, (...args: unknown[]) => unknown> & {
  method(name: string): { willReturn(value: unknown): unknown; willReturnCallback(callback: (...args: unknown[]) => unknown): unknown };
  expects(rule: unknown): { method(name: string): { willReturn(value: unknown): unknown } };
};

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
  return "(nothing thrown)";
}

/** Runs `fn` with a signature lookup that records each `fqcn::member` it is asked for (and has no row). */
function withRecordedLookup(fn: () => void): string[] {
  const asked: string[] = [];
  withLookup((fqcn, member) => {
    asked.push(`${fqcn}::${member}`);
    return null;
  }, fn);
  return asked;
}

/** Runs `fn` with `lookup` installed as the signature lookup. */
function withLookup(lookup: (fqcn: string, member: string) => unknown, fn: () => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, SIGNATURE);
  Object.defineProperty(globalThis, SIGNATURE, {
    value: lookup,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete (globalThis as Record<symbol, unknown>)[SIGNATURE];
    } else {
      Object.defineProperty(globalThis, SIGNATURE, previous);
    }
  }
}

xaravelTest("XT-assert-23", "a PHPUnit double of a contract token doubles its parents' methods (declared, and typed, by the parent) and every token's built-ins, each once, a name any token lists as a built-in staying one; built-in getIterator and __toString drive the double's iterator and string protocols (ESC-10.2-4)", () => {
  const test = new TestCase();
  const make = (target: unknown, mock: boolean): Double => (mock ? test.createMock(target as never) : test.createStub(target as never)) as unknown as Double;

  for (const mock of [true, false]) {
    // Inherited: Child -> Parent -> Root, each method configurable, an inherited one declared by its parent.
    const Root = token("Xt\\Root", { methods: ["root"] });
    const Parent = token("Xt\\Parent", { methods: ["parent"], parents: () => [Root] });
    const Child = token("Xt\\Child", { methods: ["child"], parents: () => [Parent] });
    const child = make(Child, mock);
    const proto = Object.getPrototypeOf(child) as object;
    expect(["child", "parent", "root"].map((name) => Object.hasOwn(proto, name))).toEqual([true, true, true]);
    child.method("root").willReturn("r");
    child.method("parent").willReturn("p");
    expect([child["root"]!(), child["parent"]!(), child["child"]!()]).toEqual(["r", "p", null]);
    if (mock) {
      const expecting = make(Child, true);
      expecting.expects(test.any()).method("root").willReturn("e");
      expect(expecting["root"]!()).toBe("e");
    }
    const asked = withRecordedLookup(() => {
      const fresh = make(Child, mock);
      fresh["root"]!();
      fresh["parent"]!();
      fresh["child"]!();
    });
    expect(asked).toEqual(["Xt\\Root::root", "Xt\\Parent::parent", "Xt\\Child::child"]);
    // An inherited method's row is its parent's: `self` there is the parent, so an unconfigured call returns a
    // double of the parent, not of the child.
    if (mock) {
      let returned: unknown = null;
      withLookup(
        (fqcn, member) => (fqcn === "Xt\\Parent" && member === "parent" ? { parameters: [], returns: "self", nullable: false } : null),
        () => {
          returned = make(Child, true)["parent"]!();
        },
      );
      expect([returned instanceof (Parent as never), returned instanceof (Child as never)]).toEqual([true, false]);
    }

    // Once: the first wins, compared case-insensitively, declared by the token that wins.
    const SharedParent = token("Xt\\SharedParent", { methods: ["Shared", "other"] });
    const SharedChild = token("Xt\\SharedChild", { methods: ["shared"], parents: () => [SharedParent] });
    const shared = make(SharedChild, mock);
    const sharedProto = Object.getPrototypeOf(shared) as object;
    expect([Object.hasOwn(sharedProto, "shared"), Object.hasOwn(sharedProto, "Shared"), Object.hasOwn(sharedProto, "other")]).toEqual([true, false, true]);
    expect(withRecordedLookup(() => make(SharedChild, mock)["shared"]!())).toEqual(["Xt\\SharedChild::shared"]);

    // Built-ins: each configurable by its PHP name, declared by its PHP interface.
    const Collection = token("Xt\\Collection", { methods: ["all"], builtins: ["count", "offsetGet", "getIterator", "__toString"] });
    const collection = make(Collection, mock);
    collection.method("count").willReturn(3);
    collection.method("offsetGet").willReturn("at");
    expect([collection["count"]!(), collection["offsetGet"]!(0)]).toEqual([3, "at"]);
    expect(
      withRecordedLookup(() => {
        const fresh = make(Collection, mock);
        fresh["count"]!();
        fresh["offsetGet"]!(0);
        fresh["getIterator"]!();
        fresh["__toString"]!();
        fresh["all"]!();
      }),
    ).toEqual(["Countable::count", "ArrayAccess::offsetGet", "IteratorAggregate::getIterator", "Stringable::__toString", "Xt\\Collection::all"]);
    const ArrayAccessOnly = token("Xt\\ArrayAccessOnly", { builtins: ["offsetExists", "offsetSet", "offsetUnset", "custom"] });
    expect(
      withRecordedLookup(() => {
        const fresh = make(ArrayAccessOnly, mock);
        fresh["offsetExists"]!(0);
        fresh["offsetSet"]!(0, 1);
        fresh["offsetUnset"]!(0);
        fresh["custom"]!();
      }),
    ).toEqual(["ArrayAccess::offsetExists", "ArrayAccess::offsetSet", "ArrayAccess::offsetUnset", "Xt\\ArrayAccessOnly::custom"]);

    // Iterator: what getIterator returns is iterated, one getIterator call per iteration.
    const Iterable = token("Xt\\Iterable", { builtins: ["getIterator"] });
    const iterable = make(Iterable, mock);
    let calls = 0;
    iterable.method("getIterator").willReturnCallback(() => {
      calls++;
      return [1, 2];
    });
    expect([[...(iterable as unknown as Iterable<unknown>)], calls]).toEqual([[1, 2], 1]);
    const generated = make(Iterable, mock);
    generated.method("getIterator").willReturn(
      (function* () {
        yield "a";
        yield "b";
      })(),
    );
    expect([...(generated as unknown as Iterable<unknown>)]).toEqual(["a", "b"]);
    const iteratorDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(iterable) as object, Symbol.iterator)!;
    expect([iteratorDescriptor.enumerable, iteratorDescriptor.configurable, typeof iteratorDescriptor.value]).toEqual([false, true, "function"]);

    // Iterator unconfigured: the null default iterates nothing.
    if (!mock) {
      expect([...(make(Iterable, false) as unknown as Iterable<unknown>)]).toEqual([]);
    }

    // Iterator bad: PHP's TypeError, thrown when iterated.
    const bad = make(Iterable, mock);
    bad.method("getIterator").willReturn(42);
    const className = (Object.getPrototypeOf(bad) as { constructor: Record<symbol, unknown> }).constructor[CLASS_FQCN] as string;
    expect(className).toMatch(mock ? /^MockObject_Xt_Iterable_[0-9a-f]{8}$/ : /^TestStub_Xt_Iterable_[0-9a-f]{8}$/);
    expect(messageOf(() => [...(bad as unknown as Iterable<unknown>)])).toBe(`TypeError: Objects returned by ${className}::getIterator() must be traversable or implement interface Iterator`);

    // Stringable: toString(), a template literal and String() return what __toString returns.
    const Text = token("Xt\\Text", { builtins: ["__toString"] });
    const text = make(Text, mock);
    text.method("__toString").willReturn("x");
    expect([text["toString"]!(), `${text as unknown as string}`, String(text as unknown as string)]).toEqual(["x", "x", "x"]);
    // Configuring toString configures __toString: the call is recorded as __toString.
    const aliased = make(Text, mock);
    aliased.method("toString").willReturn("y");
    expect([aliased["toString"]!(), `${aliased as unknown as string}`, aliased["__toString"]!()]).toEqual(["y", "y", "y"]);
    if (mock) {
      const once = make(Text, true);
      once.expects(test.never()).method("toString");
      expect(messageOf(() => String(once as unknown as string))).toBe("ExpectationFailedException: Xt\\Text::__toString() was not expected to be called, actually called 1 time.");
    }
    // A token that doubles its own toString keeps it, and the alias does not apply.
    const OwnToString = token("Xt\\OwnToString", { methods: ["toString"], builtins: ["__toString"] });
    const own = make(OwnToString, mock);
    own.method("toString").willReturn("own");
    own.method("__toString").willReturn("magic");
    expect([own["toString"]!(), String(own as unknown as string)]).toEqual(["own", "magic"]);

    // Parent built-in: a child of an IteratorAggregate parent iterates through getIterator.
    const IterableParent = token("Xt\\IterableParent", { builtins: ["getIterator"] });
    const IterableChild = token("Xt\\IterableChild", { methods: ["c"], parents: () => [IterableParent] });
    const iterableChild = make(IterableChild, mock);
    iterableChild.method("getIterator").willReturn([7]);
    expect([...(iterableChild as unknown as Iterable<unknown>)]).toEqual([7]);

    // Redeclared built-in: a child that lists getIterator as a plain method of an IteratorAggregate parent is
    // iterable, and its getIterator is declared by the child (as Laravel's Enumerable redeclares it).
    const Redeclaring = token("Xt\\Redeclaring", { methods: ["getIterator"], parents: () => [IterableParent] });
    const redeclaring = make(Redeclaring, mock);
    redeclaring.method("getIterator").willReturn([8, 9]);
    expect([...(redeclaring as unknown as Iterable<unknown>)]).toEqual([8, 9]);
    expect(withRecordedLookup(() => make(Redeclaring, mock)["getIterator"]!())).toEqual(["Xt\\Redeclaring::getIterator"]);
    // Redeclared built-in __toString: configuring toString configures the child's __toString.
    const TextParent = token("Xt\\TextParent", { builtins: ["__toString"] });
    const redeclaredText = make(token("Xt\\RedeclaringText", { methods: ["__toString"], parents: () => [TextParent] }), mock);
    redeclaredText.method("toString").willReturn("y");
    expect([String(redeclaredText as unknown as string), redeclaredText["toString"]!(), redeclaredText["__toString"]!()]).toEqual(["y", "y", "y"]);

    // A method a token merely lists is not wired to a protocol.
    const Listed = token("Xt\\Listed", { methods: ["getIterator", "__toString"] });
    const listed = make(Listed, mock);
    expect([Symbol.iterator in listed, Object.hasOwn(Object.getPrototypeOf(listed) as object, "toString"), Symbol.toPrimitive in listed]).toEqual([false, false, false]);
    expect(messageOf(() => listed.method("toString"))).toBe('MethodCannotBeConfiguredException: Trying to configure method "toString" which cannot be configured because it does not exist, has not been specified, is final, or is static');

    // No keys, or null: methods and prototype symbol keys as on the baseline.
    for (const plain of [token("Xt\\Plain", { methods: ["a"] }), token("Xt\\Nulled", { methods: ["a"], builtins: null, parents: () => null })]) {
      const double = make(plain, mock);
      const plainProto = Object.getPrototypeOf(double) as object;
      expect(Object.getOwnPropertyNames(plainProto).sort()).toEqual(mock ? ["a", "constructor", "expects", "method"] : ["a", "constructor", "method"]);
      expect(Object.getOwnPropertySymbols(plainProto).map((key) => Symbol.keyFor(key) ?? "(unregistered)")).toEqual(["(unregistered)", (plain as unknown as Record<symbol, string>)[CLASS_FQCN]]);
    }

    // Bad built-ins: thrown when the target is read.
    expect(messageOf(() => make(token("Xt\\Bad", { builtins: 42 }), mock))).toBe("TypeError: Xt\\Bad: [Symbol.for('xaravel.contract.builtins')] must be an iterable of method names");
    expect(messageOf(() => make(token("Xt\\Bad", { builtins: [Symbol.iterator] }), mock))).toBe("TypeError: Xt\\Bad: [Symbol.for('xaravel.contract.builtins')] must hold method names, got symbol");
    expect(messageOf(() => make(token("Xt\\Child2", { parents: () => [token("Xt\\BadParent", { builtins: 42 })] }), mock))).toBe(
      "TypeError: Xt\\BadParent: [Symbol.for('xaravel.contract.builtins')] must be an iterable of method names",
    );
  }

  // A class target has no built-ins: its getIterator is not wired to the iterator protocol.
  class WithGetIterator {
    getIterator(): unknown {
      return [1];
    }
  }
  expect(Symbol.iterator in (test.createStub(WithGetIterator as never) as object)).toBe(false);
});
