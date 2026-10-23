// Xaravel Tests for Story 10.1: the contract token mechanism (AD-1.1, ESC-10.1-1) and app contracts (AD-1.5,
// ESC-10.1-3). XT-contracts-2 (the compile-time brand) is in brand-compile.test.ts, and XT-contracts-4 (the
// `@xaravel/contracts/psr` tokens) in psr.test.ts.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Assert, TestCase, xaravelTest } from "@xaravel/assert";
import { Double } from "@xaravel/mockery";
import { hasBrand, jsonEncode } from "@xaravel/runtime/php";
import { fqcn, loadClassmap, resolveClass } from "@xaravel/runtime/registry";
import { CLASS_FQCN, contract, CONTRACT_METHODS, CONTRACT_PARAMETERS } from "@xaravel/contracts";

declare const ArrayableBrand: unique symbol;
/** A test-local `Illuminate\Contracts\Support\Arrayable`, declared as Story 10.2's generators will emit it. */
interface Arrayable {
  readonly [Arrayable.brand]: true;
  toArray(): unknown;
}
const Arrayable = contract<Arrayable, typeof ArrayableBrand>("Illuminate\\Contracts\\Support\\Arrayable", { toArray: [] });

/** A class carrying the brand as generators emit it. */
class Post implements Arrayable {
  get [Arrayable.brand](): true {
    return true as const;
  }

  toArray(): unknown {
    return [1, 2];
  }
}

class Draft extends Post {}

declare const JsonableBrand: unique symbol;
/** A test-local `Illuminate\Contracts\Support\Jsonable`. */
interface Jsonable {
  readonly [Jsonable.brand]: true;
  toJson(options?: number): string;
}
const Jsonable = contract<Jsonable, typeof JsonableBrand>("Illuminate\\Contracts\\Support\\Jsonable", { toJson: ["options"] });

/** A class encoding through its own toJson(). */
class Report implements Jsonable {
  get [Jsonable.brand](): true {
    return true as const;
  }

  toJson(options: number = 0): string {
    return `"report:${options}"`;
  }
}

/** The brand named through the token itself: `Symbol.toPrimitive` makes it the same property key. */
class ViaToken {
  get [Arrayable as unknown as typeof ArrayableBrand](): true {
    return true as const;
  }
}

class Unbranded {
  toArray(): unknown {
    return [];
  }
}

class WrongValue {
  get [Arrayable.brand](): number {
    return 1;
  }
}

/** The error `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

xaravelTest(
  "XT-contracts-1",
  "a contract token Arrayable with brand Symbol.for('Illuminate\\Contracts\\Support\\Arrayable'): x instanceof Arrayable is true exactly when x (an object or function) has a property at the brand key, own or inherited, whose value is true; get [Arrayable]() names the same key through the token's Symbol.toPrimitive, so hasBrand and jsonEncode read it unchanged (AD-1.1)",
  () => {
    const key = Symbol.for("Illuminate\\Contracts\\Support\\Arrayable");
    Assert.assertSame(key, Arrayable.brand);
    Assert.assertSame("Illuminate\\Contracts\\Support\\Arrayable", Arrayable[CLASS_FQCN]);
    Assert.assertTrue(Object.isFrozen(Arrayable));
    Assert.assertSame("object", typeof Arrayable);
    for (const hint of ["string", "number", "default"]) {
      Assert.assertSame(key, Arrayable[Symbol.toPrimitive](hint));
    }

    // Brand present: on an instance, a subclass instance, and a class through hasBrand.
    const post: unknown = new Post();
    Assert.assertTrue(post instanceof Arrayable);
    if (post instanceof Arrayable) {
      Assert.assertSame("[1,2]", JSON.stringify(post.toArray()));
    }
    Assert.assertTrue(new Draft() instanceof Arrayable);
    Assert.assertTrue(hasBrand(Post, Arrayable));
    Assert.assertTrue(hasBrand(Draft, Arrayable));
    Assert.assertTrue(hasBrand(new Post(), Arrayable));
    Assert.assertSame("[1,2]", jsonEncode(new Post()));

    // Computed through the token: the same property at runtime.
    Assert.assertTrue(Object.getOwnPropertySymbols(ViaToken.prototype).includes(key));
    Assert.assertTrue(new ViaToken() instanceof Arrayable);
    Assert.assertTrue(hasBrand(ViaToken, Arrayable));

    // Brand absent: false, never a throw.
    const absent: unknown[] = [{}, null, undefined, 42, "x", Symbol.for("x"), new Unbranded(), new WrongValue(), Unbranded, Post, { [key]: 1 }];
    for (const value of absent) {
      Assert.assertFalse(value instanceof Arrayable);
    }
    Assert.assertFalse(hasBrand(Unbranded, Arrayable));
    Assert.assertFalse(hasBrand(WrongValue, Arrayable));
    Assert.assertSame("{}", jsonEncode(new Unbranded()));
    // A plain object carrying the brand is an instance, as the brand protocol reads through any chain.
    Assert.assertTrue({ [key]: true } instanceof Arrayable);
    Assert.assertTrue(Object.assign(() => null, { [key]: true }) instanceof Arrayable);

    // The token's own keys, exactly.
    const expectedKeys: (string | symbol)[] = ["brand", CLASS_FQCN, CONTRACT_METHODS, CONTRACT_PARAMETERS, Symbol.hasInstance, Symbol.toPrimitive];
    const ownKeys = Reflect.ownKeys(Arrayable);
    Assert.assertSame(expectedKeys.length, ownKeys.length);
    for (const ownKey of expectedKeys) {
      Assert.assertTrue(ownKeys.includes(ownKey), String(ownKey));
    }

    // Jsonable's brand: jsonEncode encodes through toJson().
    Assert.assertTrue(new Report() instanceof Jsonable);
    Assert.assertSame('"report:0"', jsonEncode(new Report()));

    // contract() accepts exactly the FQCNs the Registry's grammar accepts. registerClass() rejects only an empty name,
    // so the Registry's grammar is read through loadClassmap(), which rejects a classmap key outside it. The classmap
    // is reset to empty afterwards (only registry.test.ts loads one, and it loads its own).
    const dir = mkdtempSync(join(tmpdir(), "xaravel-contracts-grammar-"));
    try {
      const path = join(dir, "classmap.json");
      for (const candidate of ["XtContractsGrammar\\A1", "XtContractsGrammar\\Été", "", "\\", "a\\\\b", "1a", "X\\", "X Y"]) {
        writeFileSync(path, jsonEncode({ [candidate]: "x.ts" }) as string);
        const viaRegistry = thrownBy(() => loadClassmap(path)) !== null;
        const viaContract = thrownBy(() => contract(candidate)) !== null;
        Assert.assertSame(viaRegistry, viaContract, candidate);
      }
      writeFileSync(path, "{}");
      loadClassmap(path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    Assert.assertTrue(Object.create(new Post()) instanceof Arrayable);

    // A leading `\` is dropped.
    const Foo = contract("\\App\\Foo");
    Assert.assertSame("App\\Foo", Foo[CLASS_FQCN]);
    Assert.assertSame(Symbol.for("App\\Foo"), Foo.brand);

    // A bad FQCN throws a TypeError naming contract().
    for (const bad of ["", "\\", "a\\\\b", "1a", "App\\", "App Foo", null, 42, Symbol.for("A")]) {
      const error = thrownBy(() => contract(bad as string));
      Assert.assertInstanceOf(TypeError, error);
      Assert.assertStringContainsString("contract()", (error as TypeError).message);
    }
  },
);

xaravelTest(
  "XT-contracts-18",
  "the token carries its method names at Symbol.for('xaravel.contract.methods') and its parameter names at Symbol.for('xaravel.contract.parameters') as a frozen { <method>: [<param>, …] } record (ESC-10.1-1 (b), ESC-4.5-1 item 3), and Mockery's and PHPUnit's doubles take their method list from the token",
  () => {
    Assert.assertSame(Symbol.for("xaravel.contract.methods"), CONTRACT_METHODS);
    Assert.assertSame(Symbol.for("xaravel.contract.parameters"), CONTRACT_PARAMETERS);
    Assert.assertSame(Symbol.for("xaravel.class.fqcn"), CLASS_FQCN);

    // Metadata, frozen and copied from the caller's input.
    const a = ["p", "q"];
    const members: Record<string, string[]> = { a, b: [] };
    const X = contract("X\\Y", members);
    Assert.assertSame('["a","b"]', JSON.stringify(X[CONTRACT_METHODS]));
    Assert.assertSame('{"a":["p","q"],"b":[]}', JSON.stringify(X[CONTRACT_PARAMETERS]));
    Assert.assertTrue(Object.isFrozen(X[CONTRACT_METHODS]));
    Assert.assertTrue(Object.isFrozen(X[CONTRACT_PARAMETERS]));
    Assert.assertTrue(Object.isFrozen(X[CONTRACT_PARAMETERS]["a"]));
    Assert.assertTrue(Object.isFrozen(X[CONTRACT_PARAMETERS]["b"]));
    a.push("r");
    members["c"] = [];
    Assert.assertSame('["a","b"]', JSON.stringify(X[CONTRACT_METHODS]));
    Assert.assertSame('{"a":["p","q"],"b":[]}', JSON.stringify(X[CONTRACT_PARAMETERS]));

    // No members.
    const Billing = contract("App\\Contracts\\Billing");
    Assert.assertSame("[]", JSON.stringify(Billing[CONTRACT_METHODS]));
    Assert.assertSame("{}", JSON.stringify(Billing[CONTRACT_PARAMETERS]));
    Assert.assertTrue(Object.isFrozen(Billing[CONTRACT_METHODS]));
    Assert.assertTrue(Object.isFrozen(Billing[CONTRACT_PARAMETERS]));

    // Bad members throw a TypeError naming contract().
    // oxlint-disable-next-line no-sparse-arrays
    for (const bad of [{ a: "p" }, { a: [1] }, { a: [, "p"] }, [], null]) {
      const error = thrownBy(() => contract("X\\Z", bad as unknown as Record<string, string[]>));
      Assert.assertInstanceOf(TypeError, error);
      Assert.assertStringContainsString("contract()", (error as TypeError).message);
    }

    // Mockery's Double: an instance of the token, its methods the token's, named by the FQCN.
    const Shape = contract("App\\Contracts\\Shape", { area: [], scale: ["factor"] });
    const double = Double.for(Shape as never) as { allows(method: string): { returns(value: unknown): unknown }; area(): unknown; scale(factor: number): unknown; expects(method: string): unknown };
    Assert.assertTrue(double instanceof Shape);
    double.allows("scale").returns(7);
    Assert.assertSame(7, double.scale(2));
    Assert.assertNull(double.area());
    const unknown = thrownBy(() => double.expects("perimeter"));
    Assert.assertStringContainsString("App\\Contracts\\Shape", (unknown as Error).message);
    Assert.assertStringContainsString("perimeter", (unknown as Error).message);

    // PHPUnit's mock: likewise.
    const mock = new TestCase().createMock(Shape) as unknown as { area(): unknown; scale(factor: number): unknown; method(name: string): { willReturn(value: unknown): unknown } };
    Assert.assertTrue(mock instanceof Shape);
    Assert.assertStringStartsWith("MockObject_App_Contracts_Shape_", String(((mock as object).constructor as unknown as Record<symbol, unknown>)[CLASS_FQCN]));
    mock.method("scale").willReturn(5);
    Assert.assertSame(5, mock.scale(3));
    Assert.assertNull(mock.area());
    const unconfigurable = thrownBy(() => new TestCase().createMock(Shape).method("perimeter"));
    Assert.assertStringContainsString("perimeter", (unconfigurable as Error).message);
  },
);

declare const BillingBrand: unique symbol;
/** An app contract, declared as the README shows. */
interface Billing {
  readonly [Billing.brand]: true;
  charge(amount: number): unknown;
}
const Billing = contract<Billing, typeof BillingBrand>("App\\Contracts\\Billing", { charge: ["amount"] });

class StripeBilling implements Billing {
  get [Billing.brand](): true {
    return true as const;
  }

  charge(amount: number): unknown {
    return amount;
  }
}

class PlainBilling {
  charge(amount: number): unknown {
    return amount;
  }
}

/** The message of the error Mockery throws when a double of `token` is told to expect `method`, which it lacks. */
function unknownMethodMessage(token: object, method: string): string {
  const double = Double.for(token as never) as { expects(method: string): unknown };
  const error = thrownBy(() => double.expects(method));
  Assert.assertInstanceOf(Error, error);
  return (error as Error).message;
}

xaravelTest(
  "XT-contracts-3",
  "an app or package interface's token made with contract<T>('<FQCN>') behaves like a framework token (instanceof, hasBrand, test doubles) and resolves through fqcn(), which gives its FQCN without a leading \\ (AD-1.5)",
  () => {
    Assert.assertSame("App\\Contracts\\Billing", fqcn(Billing));
    Assert.assertSame("Illuminate\\Contracts\\Support\\Arrayable", fqcn(Arrayable));
    Assert.assertSame("App\\Contracts\\Billing", fqcn(contract("\\App\\Contracts\\Billing")));
    Assert.assertSame(Symbol.for("App\\Contracts\\Billing"), Billing.brand);

    // instanceof and hasBrand, as for Arrayable.
    const billing: unknown = new StripeBilling();
    Assert.assertTrue(billing instanceof Billing);
    if (billing instanceof Billing) {
      Assert.assertSame(3, billing.charge(3));
    }
    Assert.assertTrue(hasBrand(StripeBilling, Billing));
    Assert.assertFalse(new PlainBilling() instanceof Billing);
    Assert.assertFalse(hasBrand(PlainBilling, Billing));

    // Test doubles: instances of the token, named by its FQCN, as for a framework-namespace token.
    const double = Double.for(Billing as never) as { allows(method: string): { returns(value: unknown): unknown }; charge(amount: number): unknown };
    Assert.assertTrue(double instanceof Billing);
    double.allows("charge").returns(9);
    Assert.assertSame(9, double.charge(1));
    const appMessage = unknownMethodMessage(Billing, "refund");
    Assert.assertStringContainsString("App\\Contracts\\Billing", appMessage);
    const frameworkMessage = unknownMethodMessage(Arrayable, "refund");
    Assert.assertStringContainsString("Illuminate\\Contracts\\Support\\Arrayable", frameworkMessage);
    Assert.assertSame(frameworkMessage.replace("Illuminate\\Contracts\\Support\\Arrayable", "App\\Contracts\\Billing"), appMessage);

    const mock = new TestCase().createMock(Billing);
    Assert.assertTrue(mock instanceof Billing);
    Assert.assertStringStartsWith("MockObject_App_Contracts_Billing_", String(((mock as object).constructor as unknown as Record<symbol, unknown>)[CLASS_FQCN]));
    const frameworkMock = new TestCase().createMock(Arrayable);
    Assert.assertTrue(frameworkMock instanceof Arrayable);
    Assert.assertStringStartsWith("MockObject_Illuminate_Contracts_Support_Arrayable_", String(((frameworkMock as object).constructor as unknown as Record<symbol, unknown>)[CLASS_FQCN]));

    // A token is not a class: its name never resolves through the Registry.
    const notFound = thrownBy(() => resolveClass("App\\Contracts\\Billing"));
    Assert.assertInstanceOf(Error, notFound);
    Assert.assertStringContainsString("App\\Contracts\\Billing", (notFound as Error).message);
  },
);
