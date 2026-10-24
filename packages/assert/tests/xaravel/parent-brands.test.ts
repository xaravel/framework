// Xaravel Test for retro item epic-10-item-2 (XT-assert-22; FR-116, AD-1,
// AD-2, ESC-10.1-6). Its test is declared through `xaravelTest`, as
// XT-conformance-128 requires of every Xaravel Test file.
//
// F-10: this test has no Upstream test inputs; it is the follow-up of
// ESC-10.1-6 (approved option 1): a PHPUnit double of a child contract is an
// instance of every contract the child extends, as a PHP mock of a child
// interface is. It needs no Oracle fixture: PHP's `instanceof` on a mock of an
// interface is the language's, not a library's.
//
// The grader never imports @xaravel/contracts (AD-2), so every token here is a
// stand-in built as Story 10.1's tokens are: `Symbol.for('xaravel.class.fqcn')`,
// `Symbol.for('xaravel.contract.methods')`, `Symbol.for('xaravel.contract.parents')`
// and a `Symbol.hasInstance` that reads the brand `Symbol.for('<FQCN>')`.
import { expect } from "bun:test";
import { TestCase, xaravelTest } from "../../src/index";

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

xaravelTest("XT-assert-22", "given a contract token with parents, a PHPUnit double of it is instanceof every contract in the parents' closure and nothing else; it doubles the parents' methods too (ESC-10.1-6; ESC-10.2-4 supersedes the own-list rule)", () => {
  const test = new TestCase();
  const make = (target: unknown, mock: boolean): object => (mock ? test.createMock(target as never) : test.createStub(target as never)) as object;

  // Child: Child -> Parent -> Root.
  const Root = token("Xt\\Root", ["root"]);
  const Parent = token("Xt\\Parent", ["parent"], () => [Root]);
  const Child = token("Xt\\Child", ["child"], () => Object.freeze([Parent]));
  const Unrelated = token("Xt\\Unrelated", []);
  for (const mock of [true, false]) {
    const double = make(Child, mock);
    expect([double instanceof (Child as never), double instanceof (Parent as never), double instanceof (Root as never), double instanceof (Unrelated as never)]).toEqual([true, true, true, false]);
    expect(brandsOf(double)).toEqual(["Xt\\Child", "Xt\\Parent", "Xt\\Root"]);
    // ESC-10.2-4 supersedes ESC-10.1-6's interim own-list rule: the parents' methods are doubled too.
    const proto = Object.getPrototypeOf(double) as object;
    expect([Object.hasOwn(proto, "child"), Object.hasOwn(proto, "parent"), Object.hasOwn(proto, "root")]).toEqual([true, true, true]);
    // Parent brands are non-enumerable, non-configurable getters, as the own brand is.
    const descriptor = Object.getOwnPropertyDescriptor(proto, Symbol.for("Xt\\Root"))!;
    expect([descriptor.enumerable, descriptor.configurable, typeof descriptor.get]).toEqual([false, false, "function"]);
  }

  // No key, or null: only the own brand, as before.
  const Plain = token("Xt\\Plain", ["a"]);
  const Nulled = token("Xt\\Nulled", ["a"], () => null);
  expect(brandsOf(make(Plain, true))).toEqual(["Xt\\Plain"]);
  expect(brandsOf(make(Nulled, false))).toEqual(["Xt\\Nulled"]);

  // Diamond and cycle: A -> [B, C], B -> [D], C -> [D], D -> [A].
  let A: Token | null = null;
  const D = token("Xt\\D", [], () => [A]);
  const B = token("Xt\\B", [], () => [D]);
  const C = token("Xt\\C", [], () => [D]);
  A = token("Xt\\A", ["a"], () => [B, C]);
  const diamond = make(A, true);
  expect([A, B, C, D].map((t) => diamond instanceof (t as never))).toEqual([true, true, true, true]);
  expect(brandsOf(diamond)).toEqual(["Xt\\A", "Xt\\B", "Xt\\C", "Xt\\D"]);

  // A bare symbol parent is its own brand.
  const WithSymbol = token("Xt\\WithSymbol", [], () => [Symbol.for("X\\Base")]);
  expect((make(WithSymbol, false) as Record<symbol, unknown>)[Symbol.for("X\\Base")]).toBe(true);

  // Not an iterable, or an entry that is not a contract.
  expect(messageOf(() => make(token("Xt\\Bad", [], () => 42), true))).toBe("TypeError: Xt\\Bad: [Symbol.for('xaravel.contract.parents')] must be an iterable of contract tokens");
  class SomeClass {}
  expect(messageOf(() => make(token("Xt\\Bad", [], () => [SomeClass]), true))).toBe("TypeError: Xt\\Bad: [Symbol.for('xaravel.contract.parents')] must hold contract tokens, got function");
  expect(messageOf(() => make(token("Xt\\Bad", [], () => ["X"]), false))).toBe("TypeError: Xt\\Bad: [Symbol.for('xaravel.contract.parents')] must hold contract tokens, got string");
});
