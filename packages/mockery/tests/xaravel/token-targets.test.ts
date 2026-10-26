// Xaravel Test for the Epic 14 retrospective's action item 4 (XT-mockery-17), as the Maintainer ruled ESC-14.1-11
// (decisions/MAINT-2026-10-26-story-14-1-mockery.md, option 1): `Mockery.mock(X)`, with `X` an `@xaravel/contracts`
// token or a runtime PHP-interface token (PORTING.md § Mockery), builds a mock that implements `X` and every contract
// it extends, as Mockery 1.6.15's `Mockery::mock(X::class)` implements the interface `X`, and whose name carries the
// token's FQCN (`MockConfiguration::generateName`). Class, string, symbol, list and string-keyed-map arguments are
// read as before. Its test is declared through `xaravelTest`, as XT-conformance-128 requires of every Xaravel Test
// file. It needs no Oracle fixture: PHP's `instanceof` on a mock of an interface is the language's, and the
// messages are the ones XT-mockery-1..9 pin for a class target.
//
// The grader never imports @xaravel/contracts or @xaravel/runtime (AD-2), so every token here is a stand-in built as
// `contract()` and `phpInterface()` build theirs: frozen, with `brand`, an own `Symbol.for('xaravel.class.fqcn')`,
// the method names, the parents, and a `Symbol.hasInstance` reading the brand `Symbol.for('<FQCN>')`.
import { expect } from "bun:test";
import { xaravelTest } from "@xaravel/assert";
import { BadMethodCallException, Exception, InvalidCountException, Mockery } from "../../src/index";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");
const CONTRACT_BUILTINS = Symbol.for("xaravel.contract.builtins");
const ARRAYABLE = "Illuminate\\Contracts\\Support\\Arrayable";

type Token = object;

/** A stand-in token, as `contract()` (or, with built-ins, `phpInterface()`) builds one. */
function token(fqcn: string, methods: readonly string[], parents: readonly object[] = [], builtins: readonly string[] = []): Token {
  const brand = Symbol.for(fqcn);
  return Object.freeze({
    ...(builtins.length > 0 ? { [CONTRACT_BUILTINS]: Object.freeze([...builtins]) } : {}),
    brand,
    [CLASS_FQCN]: fqcn,
    [CONTRACT_METHODS]: Object.freeze([...methods]),
    [CONTRACT_PARENTS]: Object.freeze([...parents]),
    [Symbol.hasInstance]: (value: unknown): boolean => ((typeof value === "object" && value !== null) || typeof value === "function") && (value as Record<symbol, unknown>)[brand] === true,
    [Symbol.toPrimitive]: (): symbol => brand,
  });
}

function isA(value: unknown, target: Token | (abstract new (...args: never[]) => object)): boolean {
  return value instanceof (target as never);
}

type AnyMock = Record<string, (...args: unknown[]) => any> & { mockery_getName(): string };

function mock(...args: unknown[]): AnyMock {
  return (Mockery.mock as (...args: unknown[]) => unknown)(...args) as AnyMock;
}

/** The mock name with its counter replaced, so names compare across runs. */
function named(m: AnyMock): string {
  return m.mockery_getName().replace(/^Mockery_\d+_/, "Mockery_N_");
}

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

class XtTargetFoo {
  bar(): string {
    return "real";
  }
}

xaravelTest(
  "XT-mockery-17",
  "Mockery.mock(<contract token>) implements the token and every contract it extends, as Mockery 1.6.15's mock of an interface does (ESC-14.1-11 option 1): a contracts token and a runtime PHP-interface token, alone or after a class, are instanceof, take expectations and verify them as a class target does, name the mock Mockery_<n>_<class>_<FQCN> with \\ as _, report an unexpected call of a listed method as received without expectations and of any other as missing; a token with an empty FQCN cannot be parsed; distinct tokens of one name never share a generated class; class, string, symbol, list and string-keyed-map arguments are unchanged",
  () => {
    const Arrayable = token(ARRAYABLE, ["toArray"]);
    const JsonSerializable = token("JsonSerializable", ["jsonSerialize"]);

    // The four ESC-14.1-11 Upstream shapes: SupportCollectionTest::testToArrayCallsToArrayOnEachItemInCollection
    // (Arrayable twice) and testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection (JsonSerializable and
    // Arrayable), each item's method called once, as Collection::toArray() / jsonSerialize() call it.
    const item1 = mock(Arrayable);
    item1.expects("toArray").andReturn("foo.array");
    const item2 = mock(Arrayable);
    item2.expects("toArray").andReturn("bar.array");
    expect([isA(item1, Arrayable), isA(item2, Arrayable)]).toEqual([true, true]);
    const toArray = (items: unknown[]): unknown[] => items.map((item) => (isA(item, Arrayable) ? (item as AnyMock).toArray!() : item));
    expect(toArray([item1, item2])).toEqual(["foo.array", "bar.array"]);
    expect(named(item1)).toBe("Mockery_N_Illuminate_Contracts_Support_Arrayable");
    expect(Mockery.getContainer().mockery_getExpectationCount()).toBe(2);
    Mockery.close();

    const json = mock(JsonSerializable);
    json.expects("jsonSerialize").andReturn(["foo.json"]);
    const arrayable = mock(Arrayable);
    arrayable.expects("toArray").andReturn(["bar.array"]);
    expect([isA(json, JsonSerializable), isA(json, Arrayable), isA(arrayable, Arrayable), isA(arrayable, JsonSerializable)]).toEqual([true, false, true, false]);
    const jsonSerialize = (items: unknown[]): unknown[] =>
      items.map((item) => (isA(item, JsonSerializable) ? (item as AnyMock).jsonSerialize!() : isA(item, Arrayable) ? (item as AnyMock).toArray!() : item));
    expect(jsonSerialize([json, arrayable])).toEqual([["foo.json"], ["bar.array"]]);
    expect(named(json)).toBe("Mockery_N_JsonSerializable");
    Mockery.close();

    // An unmet expectation fails verification as for a class target.
    const unmet = mock(Arrayable);
    unmet.expects("toArray").andReturn("x");
    expect(thrown(() => Mockery.close())).toBeInstanceOf(InvalidCountException);

    // A child token: the mock is instanceof it and every contract in its parents closure, nothing else.
    const Q = token("Xt\\Q", ["q"]);
    const P = token("Xt\\P", ["p"], [Q]);
    const C = token("Xt\\C", ["c"], [P]);
    const Other = token("Xt\\Other", []);
    const child = mock(C);
    expect([isA(child, C), isA(child, P), isA(child, Q), isA(child, Other)]).toEqual([true, true, true, false]);
    child.shouldReceive("q").andReturn("from Q");
    expect(child.q!()).toBe("from Q");

    // A runtime PHP-interface token with built-ins and a parent, as phpInterface() builds IteratorAggregate.
    const Traversable = token("Traversable", []);
    const IteratorAggregate = token("IteratorAggregate", [], [Traversable], ["getIterator"]);
    const aggregate = mock(IteratorAggregate);
    expect([isA(aggregate, IteratorAggregate), isA(aggregate, Traversable)]).toEqual([true, true]);
    // Known limit, recorded and deferred, not intended PHP behaviour: a token's built-ins get no JS protocol on a
    // Mockery token mock (JMac doubles do get one).
    expect(Symbol.iterator in (aggregate as object)).toBe(false);

    // Unexpected calls: a listed method (own, a parent's or a built-in) was received without expectations; any other
    // method does not exist. Both throw BadMethodCallException and are recorded.
    const bare = mock(Arrayable);
    const listed = thrown(() => bare.toArray!());
    expect(listed).toBeInstanceOf(BadMethodCallException);
    expect((listed as Error).message).toBe(`Received ${bare.mockery_getName()}::toArray(), but no expectations were specified`);
    const missing = thrown(() => bare.foo!());
    expect(missing).toBeInstanceOf(BadMethodCallException);
    expect((missing as Error).message).toBe(`Method ${bare.mockery_getName()}::foo() does not exist on this mock object`);
    expect((thrown(() => child.p!()) as Error).message).toBe(`Received ${child.mockery_getName()}::p(), but no expectations were specified`);
    expect((thrown(() => aggregate.getIterator!()) as Error).message).toBe(`Received ${aggregate.mockery_getName()}::getIterator(), but no expectations were specified`);
    const recorded = Mockery.getContainer().mockery_thrownExceptions();
    expect(recorded).toHaveLength(4);
    expect([recorded.includes(listed), recorded.includes(missing)]).toEqual([true, true]);
    Mockery.close();

    // A class plus a token: extends the class, implements the token; class part first, then the token's FQCN.
    const both = mock(XtTargetFoo, Arrayable);
    expect([isA(both, XtTargetFoo), isA(both, Arrayable)]).toEqual([true, true]);
    expect(named(both)).toBe("Mockery_N_XtTargetFoo_Illuminate_Contracts_Support_Arrayable");
    both.expects("toArray").andReturn("both");
    expect(both.toArray!()).toBe("both");
    // A class plus a runtime PHP-interface token, likewise.
    const withJson = mock(XtTargetFoo, JsonSerializable);
    expect([isA(withJson, XtTargetFoo), isA(withJson, JsonSerializable), isA(withJson, Arrayable)]).toEqual([true, true, false]);
    expect(named(withJson)).toBe("Mockery_N_XtTargetFoo_JsonSerializable");
    withJson.expects("jsonSerialize").andReturn([1]);
    expect(withJson.jsonSerialize!()).toEqual([1]);
    expect(Mockery.getContainer().mockery_getExpectationCount()).toBe(2);
    // Several tokens are all implemented, in the order given.
    const several = mock(Arrayable, JsonSerializable);
    expect([isA(several, Arrayable), isA(several, JsonSerializable)]).toEqual([true, true]);
    expect(named(several)).toBe("Mockery_N_Illuminate_Contracts_Support_Arrayable_JsonSerializable");
    Mockery.close();

    // An unmet expectation of a class-plus-token mock fails verification too.
    const unmetJson = mock(XtTargetFoo, JsonSerializable);
    unmetJson.expects("jsonSerialize").andReturn([1]);
    expect(thrown(() => Mockery.close())).toBeInstanceOf(InvalidCountException);

    // Name order: the symbol token's part, or an unresolved class-name string, comes before the token's FQCN, as
    // generateName puts the target class before the interfaces; a token given twice is one part.
    expect(named(mock(Symbol.for("Xt\\Sym"), Arrayable))).toBe("Mockery_N_Xt_Sym_Illuminate_Contracts_Support_Arrayable");
    expect(named(mock("Xt\\Missing", Arrayable))).toBe("Mockery_N_Xt_Missing_Illuminate_Contracts_Support_Arrayable");
    expect(named(mock(Arrayable, Arrayable))).toBe("Mockery_N_Illuminate_Contracts_Support_Arrayable");

    // A Gate-like token that lists `allows` keeps it as a declared method (AvoidMethodClashPass), and a token that
    // lists `then` dispatches it.
    const Gate = token("Xt\\Gate", ["allows"]);
    const gate = mock(Gate);
    expect((thrown(() => gate.allows!("x")) as Error).message).toBe(`Received ${gate.mockery_getName()}::allows(), but no expectations were specified`);
    const allowed = mock(Gate);
    allowed.shouldReceive("allows").andReturn(true);
    expect(allowed.allows!("x")).toBe(true);
    const Thenable = token("Xt\\Thenable", ["then"]);
    expect(typeof mock(Thenable).then).toBe("function");
    Mockery.close();

    // A token whose FQCN is empty cannot be parsed.
    const unnamed = thrown(() => mock(token("", ["toArray"])));
    expect(unnamed).toBeInstanceOf(Exception);
    expect((unnamed as Error).message).toBe("Unable to parse arguments sent to Mockery\\Container::mock()");

    // Two distinct tokens of one FQCN never share a generated class; one token reuses its class.
    const Twin = token(ARRAYABLE, ["toArray", "extra"]);
    const first = mock(Arrayable);
    const again = mock(Arrayable);
    const twin = mock(Twin);
    expect(Object.getPrototypeOf(first)).toBe(Object.getPrototypeOf(again));
    expect(Object.getPrototypeOf(twin)).not.toBe(Object.getPrototypeOf(first));
    expect((thrown(() => twin.extra!()) as Error).message).toBe(`Received ${twin.mockery_getName()}::extra(), but no expectations were specified`);
    expect((thrown(() => first.extra!()) as Error).message).toBe(`Method ${first.mockery_getName()}::extra() does not exist on this mock object`);
    Mockery.close();

    // Unchanged: a class, a class-name string, a symbol (no brand), a string-keyed map and a list.
    const classMock = mock(XtTargetFoo);
    expect(isA(classMock, XtTargetFoo)).toBe(true);
    expect(named(classMock)).toBe("Mockery_N_XtTargetFoo");
    expect(named(mock("Xt\\Unresolved\\Name"))).toBe("Mockery_N_Xt_Unresolved_Name");
    const sym = Symbol.for("Xt\\SymbolToken");
    const symbolMock = mock(sym);
    expect((symbolMock as unknown as Record<symbol, unknown>)[sym]).not.toBe(true);
    expect(named(symbolMock)).toBe("Mockery_N_Xt_SymbolToken");
    const quick = mock({ foo: "bar" });
    expect(quick.foo!()).toBe("bar");
    expect(isA(quick, Arrayable)).toBe(false);
    class XtWithArgs {
      readonly value: unknown;
      constructor(value: unknown) {
        this.value = value;
      }
    }
    const constructed = mock(XtWithArgs, [1, 2]) as unknown as XtWithArgs;
    expect(constructed.value).toBe(1);
    Mockery.close();
  },
);
