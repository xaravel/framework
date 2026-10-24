// Xaravel Test for retro item epic-10-item-5 (XT-mockery-14; FR-116, AD-1,
// AD-2, AD-26, ESC-10.2-4). Its test is declared through `xaravelTest`, as
// XT-conformance-128 requires of every Xaravel Test file.
//
// F-10: this test has no Upstream test inputs; it is the follow-up of
// ESC-10.2-4 (approved option 1, and its 2026-10-23 clarification: built-ins
// are PHP names): a JMac Double of a contract token doubles the methods of its
// parents closure and the built-ins each token lists, as a PHP double of a
// child interface (or of one extending `Countable`, `ArrayAccess`,
// `IteratorAggregate` or `Stringable`) has every inherited method. It needs no
// Oracle fixture: which methods a PHP double of an interface has is the
// language's reflection, not a library's.
//
// The grader never imports @xaravel/contracts (AD-2), so every token here is a
// stand-in built as Story 10.1's and 10.2's tokens are:
// `Symbol.for('xaravel.class.fqcn')`, `Symbol.for('xaravel.contract.methods')`,
// `Symbol.for('xaravel.contract.builtins')`, `Symbol.for('xaravel.contract.parents')`
// and a `Symbol.hasInstance` that reads the brand `Symbol.for('<FQCN>')`.
import { expect } from "bun:test";
import { xaravelTest } from "@xaravel/assert";
import { Double } from "../../src/index";

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
    Object.defineProperty(value, CONTRACT_PARENTS, { get: spec.parents, enumerable: true });
  }
  return Object.freeze(value) as unknown as Token;
}

interface Expectation {
  returns(...values: unknown[]): Expectation;
  resolves(resolver: (...args: unknown[]) => unknown): Expectation;
}

type Doubled = Record<string, (...args: unknown[]) => unknown> & {
  allows(method: string): Expectation;
  expects(method: string): Expectation;
  strict(): Doubled;
};

function double(target: unknown): Doubled {
  return (Double.for as (...args: unknown[]) => Doubled)(target);
}

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
  const previous = Object.getOwnPropertyDescriptor(globalThis, SIGNATURE);
  Object.defineProperty(globalThis, SIGNATURE, {
    value: (fqcn: string, member: string): null => {
      asked.push(`${fqcn}::${member}`);
      return null;
    },
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
  return asked;
}

xaravelTest("XT-mockery-14", "a JMac Double of a contract token doubles its parents' methods and every token's built-ins, each once, a name any token lists as a built-in staying one; built-in getIterator and __toString drive the double's iterator and string protocols, an intersection's too (ESC-10.2-4)", () => {
  // Inherited: Child -> Parent -> Root, each method configurable, an inherited one declared by its parent.
  const Root = token("XtM\\Root", { methods: ["root"] });
  const Parent = token("XtM\\Parent", { methods: ["parent"], parents: () => [Root] });
  const Child = token("XtM\\Child", { methods: ["child"], parents: () => [Parent] });
  const child = double(Child);
  const proto = Object.getPrototypeOf(child) as object;
  expect(["child", "parent", "root"].map((name) => Object.hasOwn(proto, name))).toEqual([true, true, true]);
  child.allows("root").returns("r");
  child.expects("parent").returns("p");
  expect([child["root"]!(), child["parent"]!(), child["child"]!()]).toEqual(["r", "p", null]);
  expect(
    withRecordedLookup(() => {
      const fresh = double(Child);
      fresh["root"]!();
      fresh["parent"]!();
      fresh["child"]!();
    }),
  ).toEqual(["XtM\\Root::root", "XtM\\Parent::parent", "XtM\\Child::child"]);

  // Once: the first wins, compared case-insensitively, declared by the token that wins.
  const SharedParent = token("XtM\\SharedParent", { methods: ["Shared", "other"] });
  const SharedChild = token("XtM\\SharedChild", { methods: ["shared"], parents: () => [SharedParent] });
  const shared = double(SharedChild);
  const sharedProto = Object.getPrototypeOf(shared) as object;
  expect([Object.hasOwn(sharedProto, "shared"), Object.hasOwn(sharedProto, "Shared"), Object.hasOwn(sharedProto, "other")]).toEqual([true, false, true]);
  expect(withRecordedLookup(() => double(SharedChild)["shared"]!())).toEqual(["XtM\\SharedChild::shared"]);

  // Built-ins: each configurable by its PHP name, declared by its PHP interface.
  const Collection = token("XtM\\Collection", { methods: ["all"], builtins: ["count", "offsetGet", "getIterator", "__toString"] });
  const collection = double(Collection);
  collection.allows("count").returns(3);
  collection.allows("offsetGet").returns("at");
  expect([collection["count"]!(), collection["offsetGet"]!(0)]).toEqual([3, "at"]);
  expect(
    withRecordedLookup(() => {
      const fresh = double(Collection);
      fresh["count"]!();
      fresh["offsetGet"]!(0);
      fresh["getIterator"]!();
      fresh["__toString"]!();
      fresh["all"]!();
    }),
  ).toEqual(["Countable::count", "ArrayAccess::offsetGet", "IteratorAggregate::getIterator", "Stringable::__toString", "XtM\\Collection::all"]);
  const ArrayAccessOnly = token("XtM\\ArrayAccessOnly", { builtins: ["offsetExists", "offsetSet", "offsetUnset", "custom"] });
  expect(
    withRecordedLookup(() => {
      const fresh = double(ArrayAccessOnly);
      fresh["offsetExists"]!(0);
      fresh["offsetSet"]!(0, 1);
      fresh["offsetUnset"]!(0);
      fresh["custom"]!();
    }),
  ).toEqual(["ArrayAccess::offsetExists", "ArrayAccess::offsetSet", "ArrayAccess::offsetUnset", "XtM\\ArrayAccessOnly::custom"]);

  // Iterator: what getIterator returns is iterated, one recorded getIterator call per iteration.
  const Iterable = token("XtM\\Iterable", { builtins: ["getIterator"] });
  const iterable = double(Iterable);
  iterable.allows("getIterator").returns([1, 2]);
  expect([...(iterable as unknown as Iterable<unknown>)]).toEqual([1, 2]);
  expect(Double.stateFor(iterable).callsFor("getIterator")).toEqual([[]]);
  const generated = double(Iterable);
  generated.allows("getIterator").resolves(function* () {
    yield "a";
    yield "b";
  });
  expect([...(generated as unknown as Iterable<unknown>)]).toEqual(["a", "b"]);
  const iteratorDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(iterable) as object, Symbol.iterator)!;
  expect([iteratorDescriptor.enumerable, iteratorDescriptor.configurable, typeof iteratorDescriptor.value]).toEqual([false, true, "function"]);

  // Iterator unconfigured (loose): the null default iterates nothing.
  expect([...(double(Iterable) as unknown as Iterable<unknown>)]).toEqual([]);

  // Iterator bad: PHP's TypeError, thrown when iterated.
  const bad = double(Iterable);
  bad.allows("getIterator").returns(42);
  const className = (Object.getPrototypeOf(bad) as { constructor: Record<symbol, unknown> }).constructor[CLASS_FQCN] as string;
  expect(className).toMatch(/^JMac\\Testing\\Engine\\Generated\\Iterable_\d+$/);
  expect(messageOf(() => [...(bad as unknown as Iterable<unknown>)])).toBe(`TypeError: Objects returned by ${className}::getIterator() must be traversable or implement interface Iterator`);

  // Stringable: toString(), a template literal and String() return what __toString returns.
  const Text = token("XtM\\Text", { builtins: ["__toString"] });
  const text = double(Text);
  text.allows("__toString").returns("x");
  expect([text["toString"]!(), `${text as unknown as string}`, String(text as unknown as string)]).toEqual(["x", "x", "x"]);
  // Configuring toString configures __toString: the call is recorded as __toString.
  const aliased = double(Text);
  aliased.allows("toString").returns("y");
  expect([aliased["toString"]!(), `${aliased as unknown as string}`]).toEqual(["y", "y"]);
  expect([Double.stateFor(aliased).callsFor("__toString").length, Double.stateFor(aliased).callsFor("toString").length]).toEqual([2, 0]);
  // A token that doubles its own toString keeps it, and the alias does not apply.
  const own = double(token("XtM\\OwnToString", { methods: ["toString"], builtins: ["__toString"] }));
  own.allows("toString").returns("own");
  own.allows("__toString").returns("magic");
  expect([own["toString"]!(), String(own as unknown as string)]).toEqual(["own", "magic"]);

  // Parent built-in: a child of an IteratorAggregate parent iterates through getIterator.
  const IterableParent = token("XtM\\IterableParent", { builtins: ["getIterator"] });
  const iterableChild = double(token("XtM\\IterableChild", { methods: ["c"], parents: () => [IterableParent] }));
  iterableChild.allows("getIterator").returns([7]);
  expect([...(iterableChild as unknown as Iterable<unknown>)]).toEqual([7]);

  // Redeclared built-in: a child that lists getIterator as a plain method of an IteratorAggregate parent is
  // iterable, and its getIterator is declared by the child (as Laravel's Enumerable redeclares it).
  const Redeclaring = token("XtM\\Redeclaring", { methods: ["getIterator"], parents: () => [IterableParent] });
  const redeclaring = double(Redeclaring);
  redeclaring.allows("getIterator").returns([8, 9]);
  expect([...(redeclaring as unknown as Iterable<unknown>)]).toEqual([8, 9]);
  expect(withRecordedLookup(() => double(Redeclaring)["getIterator"]!())).toEqual(["XtM\\Redeclaring::getIterator"]);
  // Redeclared built-in __toString: configuring toString configures the child's __toString.
  const TextParent = token("XtM\\TextParent", { builtins: ["__toString"] });
  const redeclaredText = double(token("XtM\\RedeclaringText", { methods: ["__toString"], parents: () => [TextParent] }));
  redeclaredText.allows("toString").returns("y");
  expect([String(redeclaredText as unknown as string), redeclaredText["toString"]!()]).toEqual(["y", "y"]);
  expect([Double.stateFor(redeclaredText).callsFor("__toString").length, Double.stateFor(redeclaredText).callsFor("toString").length]).toEqual([2, 0]);

  // An intersection of a Countable-style and a Stringable-style token wires only the string protocol.
  const Counted = token("XtM\\Counted", { builtins: ["count"] });
  const counted = (Double.for as (...args: unknown[]) => Doubled)(Counted, Text);
  counted.allows("count").returns(2);
  counted.allows("toString").returns("both");
  expect([Symbol.iterator in counted, counted["count"]!(), counted["toString"]!(), String(counted as unknown as string)]).toEqual([false, 2, "both", "both"]);
  expect(Double.stateFor(counted).callsFor("__toString").length).toBe(2);

  // An intersection with an IteratorAggregate-style token iterates through its getIterator, and wires no string
  // protocol.
  const countedIterable = (Double.for as (...args: unknown[]) => Doubled)(Counted, Iterable);
  countedIterable.allows("getIterator").returns([3, 4]);
  expect([[...(countedIterable as unknown as Iterable<unknown>)], Object.hasOwn(Object.getPrototypeOf(countedIterable) as object, "toString"), Symbol.toPrimitive in countedIterable]).toEqual([[3, 4], false, false]);
  expect(Double.stateFor(countedIterable).callsFor("getIterator")).toEqual([[]]);

  // An intersection of a bare symbol (which declares every name) and a Stringable token still wires toString()
  // and aliases toString to __toString.
  const withBare = (Double.for as (...args: unknown[]) => Doubled)(Symbol.for("XtM\\Bare"), Text);
  withBare.allows("toString").returns("bare");
  expect([withBare["toString"]!(), `${withBare as unknown as string}`]).toEqual(["bare", "bare"]);
  expect([Double.stateFor(withBare).callsFor("__toString").length, Double.stateFor(withBare).callsFor("toString").length]).toEqual([2, 0]);

  // A method a token merely lists is not wired to a protocol, and toString is not an alias on it.
  const listed = double(token("XtM\\Listed", { methods: ["getIterator", "__toString"] }));
  expect([Symbol.iterator in listed, Object.hasOwn(Object.getPrototypeOf(listed) as object, "toString"), Symbol.toPrimitive in listed]).toEqual([false, false, false]);
  expect(messageOf(() => listed.allows("toString"))).toMatch(/^UnknownMethodException: /);

  // No keys, or null: methods and prototype symbol keys as on the baseline.
  for (const plain of [token("XtM\\Plain", { methods: ["a"] }), token("XtM\\Nulled", { methods: ["a"], builtins: null, parents: () => null })]) {
    const plainProto = Object.getPrototypeOf(double(plain)) as object;
    expect(Object.getOwnPropertyNames(plainProto).sort()).toEqual(["a", "allows", "constructor", "expects", "instance", "passthru", "strict"]);
    expect(Object.getOwnPropertySymbols(plainProto).map((key) => Symbol.keyFor(key) ?? "(unregistered)")).toEqual([(plain as unknown as Record<symbol, string>)[CLASS_FQCN], "(unregistered)"]);
  }

  // Bad built-ins: thrown when the target is read.
  expect(messageOf(() => double(token("XtM\\Bad", { builtins: 42 })))).toBe("TypeError: XtM\\Bad: [Symbol.for('xaravel.contract.builtins')] must be an iterable of method names");
  expect(messageOf(() => double(token("XtM\\Bad", { builtins: [Symbol.iterator] })))).toBe("TypeError: XtM\\Bad: [Symbol.for('xaravel.contract.builtins')] must hold method names, got symbol");
  expect(messageOf(() => double(token("XtM\\Child2", { parents: () => [token("XtM\\BadParent", { builtins: 42 })] })))).toBe(
    "TypeError: XtM\\BadParent: [Symbol.for('xaravel.contract.builtins')] must be an iterable of method names",
  );

  // A class target has no built-ins: its getIterator is not wired to the iterator protocol.
  class WithGetIterator {
    getIterator(): unknown {
      return [1];
    }
  }
  expect(Symbol.iterator in double(WithGetIterator)).toBe(false);
});
