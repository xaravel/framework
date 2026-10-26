// Xaravel Test for the Epic 10 retrospective's action item 4 (XT-mockery-15; L7, L8), as the Maintainer ruled it
// (decisions/MAINT-2026-10-24-epic-10-items.md, Item 4). Its test is declared through `xaravelTest`, as
// XT-conformance-128 requires of every Xaravel Test file.
//
// A JMac Double of a contract token takes a token only as @xaravel/assert's `isContractToken` reads one, names it by
// assert's `contractTokenName` and refuses a token with an empty FQCN, and defines its own and parent brands with
// assert's `defineContractBrand`, the descriptor PHPUnit's doubles share (XT-assert-100). An intersection whose
// targets share a parent defines that parent's brand once. An object with a `Symbol.hasInstance` that is no token is
// refused, as a target and as `Double.for()`'s trailing options. It needs no Oracle fixture: the brands and the
// refusals are Xaravel's own.
//
// The grader never imports @xaravel/contracts (AD-2), so every token here is a stand-in built as `contract()` builds
// one: frozen, with an own `Symbol.for('xaravel.class.fqcn')`.
import { expect } from "bun:test";
import { xaravelTest } from "@xaravel/assert";
import { Double } from "../../src/index";
import { InvalidDoubleTargetException } from "../../src/JMac/Testing/Exceptions/InvalidDoubleTargetException";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");
const LOOKUP = Symbol.for("xaravel.class.lookup");

/** A stand-in contract token. */
function token(fqcn: string, methods: readonly string[], parents: readonly object[] = []): object {
  const brand = Symbol.for(fqcn);
  return Object.freeze({
    [CLASS_FQCN]: fqcn,
    [CONTRACT_METHODS]: Object.freeze([...methods]),
    [CONTRACT_PARENTS]: Object.freeze([...parents]),
    [Symbol.hasInstance]: (value: unknown): boolean => typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true,
  });
}

function double(...targets: unknown[]): object {
  return (Double.for as (...args: unknown[]) => object)(...targets);
}

/** What `fn` throws, or null. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** A brand's descriptor, with its getter's result in place of the getter. */
function brandDescriptor(prototype: object, brand: symbol): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, brand);
  if (descriptor === undefined) {
    return null;
  }
  return { get: typeof Reflect.get(descriptor, "get") === "function" ? Reflect.get(prototype, brand) : "(none)", set: Reflect.get(descriptor, "set"), enumerable: descriptor.enumerable, configurable: descriptor.configurable };
}

const BRAND = { get: true, set: undefined, enumerable: false, configurable: false };

xaravelTest(
  "XT-mockery-15",
  "a JMac Double of a contract token defines its own and parent brands as own non-enumerable, non-configurable getters returning true, as PHPUnit's doubles do; an intersection of two tokens sharing a parent defines that brand once and is instanceof it; a token with an empty FQCN, and an object with a Symbol.hasInstance (own or inherited) that is no token (as a target or as the trailing options), throw InvalidDoubleTargetException; a class-name string the class lookup resolves to a token without Symbol.hasInstance is doubled, and to a forged object is refused (MAINT-2026-10-24 Item 4)",
  () => {
    // Own and parent brands share one descriptor.
    const Root = token("XtMT\\Root", ["root"]);
    const Child = token("XtMT\\Child", ["child"], [Root]);
    const single = double(Child);
    const prototype = Object.getPrototypeOf(single) as object;
    expect(brandDescriptor(prototype, Symbol.for("XtMT\\Child"))).toEqual(BRAND);
    expect(brandDescriptor(prototype, Symbol.for("XtMT\\Root"))).toEqual(BRAND);

    // An intersection whose targets share a parent: no redefine error, and instanceof every contract.
    const Shared = token("XtMT\\Shared", ["shared"]);
    const A = token("XtMT\\A", ["a"], [Shared]);
    const B = token("XtMT\\B", ["b"], [Shared]);
    const both = double(A, B);
    expect([both instanceof (A as never), both instanceof (B as never), both instanceof (Shared as never), both instanceof (Root as never)]).toEqual([true, true, true, false]);
    const intersection = Object.getPrototypeOf(both) as object;
    for (const name of ["XtMT\\A", "XtMT\\B", "XtMT\\Shared"]) {
      expect(brandDescriptor(intersection, Symbol.for(name))).toEqual(BRAND);
    }

    // An empty FQCN is a token no double can name.
    const nameless = Object.freeze({ [CLASS_FQCN]: "", [CONTRACT_METHODS]: Object.freeze(["a"]) });
    const error = thrown(() => double(nameless));
    expect(error?.constructor).toBe(InvalidDoubleTargetException);
    expect((error as Error).message).toContain("carries no FQCN");
    expect((thrown(() => double(token("XtMT\\WithNameless", [], [nameless]))) as Error | null)?.constructor).toBe(InvalidDoubleTargetException);

    // An object with a Symbol.hasInstance that is no token: unfrozen, or brand-only; as a target or as the options.
    const forged = { [CLASS_FQCN]: "XtMT\\Forged", [Symbol.hasInstance]: (): boolean => false };
    const brandOnly = { [Symbol.for("XtMT\\Branded")]: true, [Symbol.hasInstance]: (): boolean => false };
    // An object inheriting a genuine token is no token either: its Symbol.hasInstance is read through the chain.
    const inherited = Object.freeze(Object.create(Root) as object);
    for (const value of [forged, brandOnly, inherited]) {
      for (const error of [thrown(() => double(value)), thrown(() => double(Root, value))]) {
        expect(error?.constructor).toBe(InvalidDoubleTargetException);
        expect((error as Error).message).toContain("no contract token");
      }
    }

    // A class-name string resolves through the class lookup only to a contract token, as a token target does.
    const bare = Object.freeze({ [CLASS_FQCN]: "XtMT\\Bare", [CONTRACT_METHODS]: Object.freeze(["bare"]) });
    const answers: Record<string, unknown> = { "XtMT\\Bare": bare, "XtMT\\Forged": forged };
    const saved = Object.getOwnPropertyDescriptor(globalThis, LOOKUP);
    // Layered on the installed lookup: these names first, every other name delegated (null when none is installed).
    const previous: unknown = (globalThis as Record<symbol, unknown>)[LOOKUP];
    Object.defineProperty(globalThis, LOOKUP, {
      value: (name: string): unknown => answers[name] ?? (typeof previous === "function" ? (previous as (name: string) => unknown)(name) : null),
      configurable: true,
      writable: true,
    });
    try {
      const fromName = double("XtMT\\Bare");
      expect(brandDescriptor(Object.getPrototypeOf(fromName) as object, Symbol.for("XtMT\\Bare"))).toEqual(BRAND);
      expect((fromName as Record<symbol, unknown>)[Symbol.for("XtMT\\Bare")]).toBe(true);
      expect(thrown(() => double("XtMT\\Forged"))?.constructor).toBe(InvalidDoubleTargetException);
    } finally {
      if (saved === undefined) {
        delete (globalThis as Record<symbol, unknown>)[LOOKUP];
      } else {
        Object.defineProperty(globalThis, LOOKUP, saved);
      }
    }
  },
);
