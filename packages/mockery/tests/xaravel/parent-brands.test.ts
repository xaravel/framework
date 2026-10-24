// Xaravel Test for retro item epic-10-item-2 (XT-mockery-13; FR-116, AD-1,
// AD-2, ESC-10.1-6). Its test is declared through `xaravelTest`, as
// XT-conformance-128 requires of every Xaravel Test file.
//
// F-10: this test has no Upstream test inputs; it is the follow-up of
// ESC-10.1-6 (approved option 1): a JMac Double of a child contract is an
// instance of every contract the child extends, as a PHP double of a child
// interface is. It needs no Oracle fixture: PHP's `instanceof` on a double of
// an interface is the language's, not a library's.
//
// The grader never imports @xaravel/contracts (AD-2), so every token here is a
// stand-in built as Story 10.1's tokens are: `Symbol.for('xaravel.class.fqcn')`,
// `Symbol.for('xaravel.contract.methods')`, `Symbol.for('xaravel.contract.parents')`
// and a `Symbol.hasInstance` that reads the brand `Symbol.for('<FQCN>')`.
import { expect } from "bun:test";
import { xaravelTest } from "@xaravel/assert";
import { Double } from "../../src/index";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");

type Token = { readonly [Symbol.hasInstance]: (value: unknown) => boolean };

/** A stand-in contract token; `parents` is read lazily, so tokens can form a cycle. */
function token(fqcn: string, methods: readonly string[], parents: () => unknown = () => undefined): Token {
  const brand = Symbol.for(fqcn);
  return Object.freeze({
    [CLASS_FQCN]: fqcn,
    [CONTRACT_METHODS]: Object.freeze([...methods]),
    get [CONTRACT_PARENTS](): unknown {
      return parents();
    },
    [Symbol.hasInstance]: (value: unknown): boolean => typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true,
  });
}

/** The registered, non-protocol symbol keys of the double's prototype: its brands. */
function brandsOf(double: object): string[] {
  return Object.getOwnPropertySymbols(Object.getPrototypeOf(double) as object)
    .map((key) => Symbol.keyFor(key))
    .filter((key): key is string => key !== undefined && !key.startsWith("xaravel."))
    .sort();
}

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
  return "(nothing thrown)";
}

function double(...targets: unknown[]): object {
  return (Double.for as (...args: unknown[]) => object)(...targets);
}

xaravelTest("XT-mockery-13", "given a contract token with parents, a JMac Double of it (or of an intersection of such tokens) is instanceof every contract in the parents' closure and nothing else; it doubles the parents' methods too (ESC-10.1-6; ESC-10.2-4 supersedes the own-list rule)", () => {
  // Child: Child -> Parent -> Root.
  const Root = token("XtM\\Root", ["root"]);
  const Parent = token("XtM\\Parent", ["parent"], () => [Root]);
  const Child = token("XtM\\Child", ["child"], () => Object.freeze([Parent]));
  const Unrelated = token("XtM\\Unrelated", []);
  const child = double(Child);
  expect([child instanceof (Child as never), child instanceof (Parent as never), child instanceof (Root as never), child instanceof (Unrelated as never)]).toEqual([true, true, true, false]);
  expect(brandsOf(child)).toEqual(["XtM\\Child", "XtM\\Parent", "XtM\\Root"]);
  // ESC-10.2-4 supersedes ESC-10.1-6's interim own-list rule: the parents' methods are doubled too.
  const proto = Object.getPrototypeOf(child) as object;
  expect([Object.hasOwn(proto, "child"), Object.hasOwn(proto, "parent"), Object.hasOwn(proto, "root")]).toEqual([true, true, true]);
  // Parent brands are non-enumerable, non-configurable getters, as the own brand is and as PHPUnit's doubles define
  // them (assert's `defineContractBrand`, MAINT-2026-10-24 Item 4).
  const descriptor = Object.getOwnPropertyDescriptor(proto, Symbol.for("XtM\\Root"))!;
  expect([descriptor.enumerable, descriptor.configurable, typeof descriptor.get]).toEqual([false, false, "function"]);

  // No key, or null: only the own brand, as before.
  expect(brandsOf(double(token("XtM\\Plain", ["a"])))).toEqual(["XtM\\Plain"]);
  expect(brandsOf(double(token("XtM\\Nulled", ["a"], () => null)))).toEqual(["XtM\\Nulled"]);

  // Diamond and cycle: A -> [B, C], B -> [D], C -> [D], D -> [A].
  let A: Token | null = null;
  const D = token("XtM\\D", [], () => [A]);
  const B = token("XtM\\B", [], () => [D]);
  const C = token("XtM\\C", [], () => [D]);
  A = token("XtM\\A", ["a"], () => [B, C]);
  const diamond = double(A);
  expect([A, B, C, D].map((t) => diamond instanceof (t as never))).toEqual([true, true, true, true]);
  expect(brandsOf(diamond)).toEqual(["XtM\\A", "XtM\\B", "XtM\\C", "XtM\\D"]);

  // A bare symbol parent is its own brand.
  expect((double(token("XtM\\WithSymbol", [], () => [Symbol.for("X\\Base")])) as Record<symbol, unknown>)[Symbol.for("X\\Base")]).toBe(true);

  // Intersection: every parent of both tokens; the doubled methods are the two tokens' and their parents' (ESC-10.2-4).
  const BaseA = token("XtM\\BaseA", ["ba"]);
  const BaseB = token("XtM\\BaseB", ["bb"]);
  const TokA = token("XtM\\TokA", ["fa"], () => [BaseA]);
  const TokB = token("XtM\\TokB", ["fb"], () => [BaseB]);
  const both = double(TokA, TokB);
  expect([TokA, TokB, BaseA, BaseB, Unrelated].map((t) => both instanceof (t as never))).toEqual([true, true, true, true, false]);
  expect(brandsOf(both)).toEqual(["XtM\\BaseA", "XtM\\BaseB", "XtM\\TokA", "XtM\\TokB"]);
  const bothProto = Object.getPrototypeOf(both) as object;
  expect(["fa", "fb", "ba", "bb"].map((method) => Object.hasOwn(bothProto, method))).toEqual([true, true, true, true]);

  // Not an iterable, or an entry that is not a contract.
  expect(messageOf(() => double(token("XtM\\Bad", [], () => 42)))).toBe("TypeError: XtM\\Bad: [Symbol.for('xaravel.contract.parents')] must be an iterable of contract tokens");
  class SomeClass {}
  expect(messageOf(() => double(token("XtM\\Bad", [], () => [SomeClass])))).toBe("TypeError: XtM\\Bad: [Symbol.for('xaravel.contract.parents')] must hold contract tokens, got function");
  expect(messageOf(() => double(token("XtM\\Bad", [], () => ["X"])))).toBe("TypeError: XtM\\Bad: [Symbol.for('xaravel.contract.parents')] must hold contract tokens, got string");
});
