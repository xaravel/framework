// Xaravel Test for the Epic 10 retrospective's action item 4 (XT-assert-100; L7, L8), as the Maintainer ruled it
// (decisions/MAINT-2026-10-24-epic-10-items.md, Item 4). Its test is declared through `xaravelTest`, as
// XT-conformance-128 requires of every Xaravel Test file.
//
// A PHPUnit double of a contract token takes a token only as the grader's `isContractToken` reads one, names it by
// `contractTokenName` and refuses a token with an empty FQCN, and defines its own and parent brands with
// `defineContractBrand`: an own, non-enumerable, non-configurable getter returning true, the descriptor @xaravel/mockery's
// doubles share (XT-mockery-15). It needs no Oracle fixture: the brands and the refusals are Xaravel's own.
//
// The grader never imports @xaravel/contracts (AD-2), so every token here is a stand-in built as `contract()` builds
// one: frozen, with an own `Symbol.for('xaravel.class.fqcn')`.
import { expect } from "bun:test";
import { lookupClass } from "../../src/Framework/MockObject/Generator/Signature";
import { contractTokenName, defineContractBrand, isContractToken, TestCase, xaravelTest } from "../../src/index";

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

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
  return "(nothing thrown)";
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
  "XT-assert-100",
  "a PHPUnit double of a contract token defines its own and parent brands as own non-enumerable, non-configurable getters returning true (defineContractBrand, skipped when owned); contractTokenName gives a token's own FQCN, null when empty; contractTokenName never runs an accessor FQCN; a token with an empty FQCN and an object that is no token are refused with the needs-a-class-or-a-contract-token TypeError; the return-type class lookup yields a token and not a forged object (MAINT-2026-10-24 Item 4)",
  () => {
    const test = new TestCase();
    const make = (target: unknown, mock: boolean): object => (mock ? test.createMock(target as never) : test.createStub(target as never)) as object;

    // Own and parent brands share one descriptor.
    const Root = token("XtT\\Root", ["root"]);
    const Child = token("XtT\\Child", ["child"], [Root]);
    for (const mock of [true, false]) {
      const double = make(Child, mock);
      const prototype = Object.getPrototypeOf(double) as object;
      expect(brandDescriptor(prototype, Symbol.for("XtT\\Child"))).toEqual(BRAND);
      expect(brandDescriptor(prototype, Symbol.for("XtT\\Root"))).toEqual(BRAND);
      expect([double instanceof (Child as never), double instanceof (Root as never)]).toEqual([true, true]);
    }

    // defineContractBrand: the descriptor, and no redefinition of a brand the prototype owns.
    const prototype = {};
    const brand = Symbol.for("XtT\\Defined");
    defineContractBrand(prototype, brand);
    expect(brandDescriptor(prototype, brand)).toEqual(BRAND);
    const before = Object.getOwnPropertyDescriptor(prototype, brand);
    expect(messageOf(() => defineContractBrand(prototype, brand))).toBe("(nothing thrown)");
    expect(Object.getOwnPropertyDescriptor(prototype, brand)).toStrictEqual(before);
    expect(Object.keys(prototype)).toEqual([]);

    // contractTokenName: the own FQCN, null when empty.
    expect(contractTokenName(Root)).toBe("XtT\\Root");
    expect(contractTokenName(Object.freeze({ [CLASS_FQCN]: "" }))).toBeNull();
    // It reads the own data property, as the predicate does: an accessor never runs.
    let ran = false;
    const accessor = Object.freeze(
      Object.defineProperty({}, CLASS_FQCN, {
        get: (): string => {
          ran = true;
          return "XtT\\Accessor";
        },
      }),
    );
    expect([isContractToken(accessor), contractTokenName(accessor), ran]).toEqual([false, null, false]);

    // An empty FQCN is a token no double can name.
    const nameless = Object.freeze({ [CLASS_FQCN]: "", [CONTRACT_METHODS]: Object.freeze(["a"]) });
    expect(isContractToken(nameless)).toBe(true);
    const refusal = "TypeError: PHPUnit\\Framework\\MockObject: a test double needs a class or a contract token, got a contract token that carries no FQCN";
    expect(messageOf(() => make(nameless, true))).toBe(refusal);
    expect(messageOf(() => make(nameless, false))).toBe(refusal);
    // So is a parent whose FQCN is empty.
    expect(messageOf(() => make(token("XtT\\WithNameless", [], [nameless]), true))).toBe(refusal);

    // An object that is no token is refused: unfrozen, or brand-only.
    const forged = { [CLASS_FQCN]: "XtT\\Forged", [Symbol.hasInstance]: (): boolean => false };
    const brandOnly = { [Symbol.for("XtT\\Branded")]: true, [Symbol.hasInstance]: (): boolean => false };
    for (const value of [forged, brandOnly]) {
      expect(isContractToken(value)).toBe(false);
      expect(messageOf(() => make(value, true))).toBe("TypeError: PHPUnit\\Framework\\MockObject: a test double needs a class or a contract token, got object");
    }

    // The class lookup of a return type yields an object only when it is a contract token.
    const answers: Record<string, unknown> = { "XtT\\Root": Root, "XtT\\Forged": forged };
    const saved = Object.getOwnPropertyDescriptor(globalThis, LOOKUP);
    // Layered on the installed lookup: these names first, every other name delegated (null when none is installed).
    const previous: unknown = (globalThis as Record<symbol, unknown>)[LOOKUP];
    Object.defineProperty(globalThis, LOOKUP, {
      value: (name: string): unknown => answers[name] ?? (typeof previous === "function" ? (previous as (name: string) => unknown)(name) : null),
      configurable: true,
      writable: true,
    });
    try {
      expect(lookupClass("XtT\\Root")).toBe(Root);
      expect(lookupClass("\\XtT\\Root")).toBe(Root);
      expect(lookupClass("XtT\\Forged")).toBeNull();
    } finally {
      if (saved === undefined) {
        delete (globalThis as Record<symbol, unknown>)[LOOKUP];
      } else {
        Object.defineProperty(globalThis, LOOKUP, saved);
      }
    }
  },
);
