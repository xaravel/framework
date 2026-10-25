// Xaravel Test for the Epic 10 retrospective's action item 10 (XT-mockery-16; L1, L2), as the Maintainer ruled it
// (decisions/MAINT-2026-10-24-epic-10-items.md, Item 2 and "Item 10's route", item 3): a contract token is its FQCN
// class-string (AD-9.8), so `with(Arrayable)` matches as Mockery 1.6.15's `Expectation::_matchArg` matches
// `with(Arrayable::class)` (Expectation.php 949-980): the token itself and the FQCN string through `==`, and an object
// that is an `instanceof` it; Mockery and the JMac ValueFormatter print a token as that string. Its test is declared
// through `xaravelTest`, as XT-conformance-128 requires of every Xaravel Test file. It needs no Oracle fixture: each
// expected outcome is Mockery's for the FQCN string, which XT-mockery-1..9 pin to the Oracle's.
//
// The grader never imports @xaravel/contracts (AD-2), so every token here is a stand-in built as `contract()` builds
// one: frozen, with an own `Symbol.for('xaravel.class.fqcn')`, its methods and parents, and a `Symbol.hasInstance`
// reading its brand.
import { expect } from "bun:test";
import { xaravelTest } from "@xaravel/assert";
import { Double, Mockery, NoMatchingExpectationException } from "../../src/index";
import { ValueFormatter } from "../../src/JMac/Testing/Diagnostics/ValueFormatter";
import { EqualsMatcher } from "../../src/JMac/Testing/Matching/EqualsMatcher";
import { formatArgument, getDebugType, phpString } from "../../src/support/values";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const ARRAYABLE = "Illuminate\\Contracts\\Support\\Arrayable";

/** A stand-in contract token. */
function token(fqcn: string, methods: readonly string[]): object {
  const brand = Symbol.for(fqcn);
  return Object.freeze({
    ...bareToken(fqcn),
    [Symbol.hasInstance]: (value: unknown): boolean => typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true,
    [Symbol.for("xaravel.contract.methods")]: Object.freeze([...methods]),
  });
}

/** A stand-in contract token with no `Symbol.hasInstance`, as XT-contracts-20's `bareParent` is: it cannot answer `instanceof`. */
function bareToken(fqcn: string): object {
  const brand = Symbol.for(fqcn);
  return Object.freeze({
    brand,
    [CLASS_FQCN]: fqcn,
    [Symbol.for("xaravel.contract.parents")]: Object.freeze([]),
    [Symbol.toPrimitive]: (): symbol => brand,
  });
}

class XtTokenService {
  run(_value: unknown): unknown {
    return null;
  }
}

/** What `fn` returns, or `<class>: <message>` for what it throws. */
function outcome(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    // The mock's name carries the container's counter, so only the shown arguments are compared.
    return error instanceof NoMatchingExpectationException ? `NoMatchingExpectationException: ${error.message.split("\n")[0]!.replace(/Mockery_\d+_/, "Mockery_N_")}` : error;
  }
}

xaravelTest(
  "XT-mockery-16",
  "with(token) matches as Mockery 1.6.15's _matchArg matches with(<FQCN>::class), a contract token being its class-string (AD-9.8, MAINT-2026-10-24 Item 10's route item 3): the token itself, the FQCN string and an object that is an instanceof the token match; an unrelated object, a PHP array and another string do not, and nor does another token; with(<FQCN>) matches a token argument, a nested with([token]) matches by `==` on the strings, and a token with no Symbol.hasInstance skips the instanceof step without throwing; JMac's EqualsMatcher compares a token strictly as its class-string; a token argument prints as its quoted FQCN in a no-match message, alone and in an array, getDebugType gives string and ValueFormatter describes it as var_export does that string",
  () => {
    const Arrayable = token(ARRAYABLE, ["toArray"]);
    const Jsonable = token("Illuminate\\Contracts\\Support\\Jsonable", ["toJson"]);
    const double = (Double.for as (...targets: unknown[]) => object)(Arrayable);
    expect(double instanceof (Arrayable as never)).toBe(true);
    class Branded {
      constructor() {
        (this as Record<symbol, unknown>)[Symbol.for(ARRAYABLE)] = true;
      }
    }

    const mock = Mockery.mock(XtTokenService) as unknown as XtTokenService & { shouldReceive(name: string): { with(...args: unknown[]): { andReturn(value: unknown): unknown } } };
    mock.shouldReceive("run").with(Arrayable).andReturn("matched");
    expect(outcome(() => mock.run(Arrayable))).toBe("matched");
    expect(outcome(() => mock.run(ARRAYABLE))).toBe("matched");
    expect(outcome(() => mock.run(double))).toBe("matched");
    expect(outcome(() => mock.run(new Branded()))).toBe("matched");
    const unmatched = (shown: string): string =>
      `NoMatchingExpectationException: No matching handler found for Mockery_N_XtTokenService::run(${shown}). Either the method was unexpected or its arguments matched no expected argument list for this method`;
    expect(outcome(() => mock.run(new XtTokenService()))).toBe(unmatched("object(XtTokenService)"));
    expect(outcome(() => mock.run({}))).toBe(unmatched("[]"));
    expect(outcome(() => mock.run("Illuminate\\Contracts\\Support\\Jsonable"))).toBe(unmatched("'Illuminate\\Contracts\\Support\\Jsonable'"));
    expect(outcome(() => mock.run(Jsonable))).toBe(unmatched("'Illuminate\\Contracts\\Support\\Jsonable'"));
    expect(outcome(() => mock.run([Arrayable]))).toBe(unmatched(`[0 => '${ARRAYABLE}']`));
    Mockery.close();

    // with(<FQCN string>) against a token argument: the token is that string, so it matches; another token does not.
    const byName = Mockery.mock(XtTokenService) as unknown as typeof mock;
    byName.shouldReceive("run").with(ARRAYABLE).andReturn("by name");
    expect(outcome(() => byName.run(Arrayable))).toBe("by name");
    expect(outcome(() => byName.run(Jsonable))).toBe(unmatched("'Illuminate\\Contracts\\Support\\Jsonable'"));
    Mockery.close();

    // A nested with([token]): PHP `==` on the arrays, each token its string.
    const nested = Mockery.mock(XtTokenService) as unknown as typeof mock;
    nested.shouldReceive("run").with([Arrayable]).andReturn("nested");
    expect(outcome(() => nested.run([Arrayable]))).toBe("nested");
    expect(outcome(() => nested.run([ARRAYABLE]))).toBe("nested");
    expect(outcome(() => nested.run([Jsonable]))).toBe(unmatched("[0 => 'Illuminate\\Contracts\\Support\\Jsonable']"));
    Mockery.close();

    // A token with no Symbol.hasInstance cannot answer instanceof: it skips that step, never throws, and matches by `==`.
    const Bare = bareToken(ARRAYABLE);
    const bare = Mockery.mock(XtTokenService) as unknown as typeof mock;
    bare.shouldReceive("run").with(Bare).andReturn("bare");
    expect(outcome(() => bare.run(ARRAYABLE))).toBe("bare");
    expect(outcome(() => bare.run(Arrayable))).toBe("bare");
    expect(outcome(() => bare.run(new XtTokenService()))).toBe(unmatched("object(XtTokenService)"));
    expect(outcome(() => bare.run(new Branded()))).toBe(unmatched("object(Branded)"));
    Mockery.close();

    // JMac's EqualsMatcher compares a token as its class-string strictly, as Upstream compares a class-string (`===`),
    // never as the frozen object it is in JS (a plain object of the same own keys does not match it).
    const equals = new EqualsMatcher(Arrayable);
    expect([equals.matches(Arrayable), equals.matches(ARRAYABLE), equals.matches(true), equals.matches(Jsonable), equals.matches([Arrayable]), equals.matches({ brand: Symbol.for(ARRAYABLE) })]).toEqual([true, true, false, false, false, false]);
    expect([new EqualsMatcher(ARRAYABLE).matches(Arrayable), new EqualsMatcher([Arrayable]).matches([ARRAYABLE]), new EqualsMatcher(true).matches(Arrayable)]).toEqual([true, true, false]);
    expect(equals.explainMismatch(true)).toBe("expected 'Illuminate\\\\Contracts\\\\Support\\\\Arrayable', got true");

    // The display helpers read a token as its string.
    expect(phpString(Arrayable)).toBe(ARRAYABLE);
    expect(formatArgument(Arrayable, (_value: unknown): _value is { toString(): string } => false)).toBe(`'${ARRAYABLE}'`);
    expect(getDebugType(Arrayable)).toBe("string");
    expect(ValueFormatter.describe(Arrayable)).toBe("'Illuminate\\\\Contracts\\\\Support\\\\Arrayable'");
  },
);
