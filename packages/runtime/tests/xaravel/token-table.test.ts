// Xaravel Tests for the Epic 13 retrospective's action item 2 (epic-13-item-2-reflection-contracts), as the Maintainer
// ruled ESC-13.1-7 and ESC-13.1-8 (decisions/MAINT-2026-10-25-story-13-1-second.md, option 1 each). XT-runtime-48: the
// Registry's contract token table (`registerContractToken`), `interfaceExists`, `new ReflectionClass('<token FQCN>')`
// and `isSubclassOf('<token FQCN>')`, and the `Symbol.for('xaravel.class.lookup')` global's install rules, checked in
// fresh processes. XT-runtime-49: `enumExists` and `ReflectionEnum` over AD-26's enum model (`static cases()`, and
// `static backingType` on a backed enum). Neither needs an Oracle fixture: each expected value is PHP 8.5's documented
// behaviour for the matching interface or enum declaration, and each message is PHP 8.5's.
//
// The runtime cannot import @xaravel/contracts, so a token is a stand-in built as `contract()` builds one: frozen, with
// an own non-writable `Symbol.for('xaravel.class.fqcn')`, a `Symbol.toPrimitive` giving its brand, and its parents at
// `Symbol.for('xaravel.contract.parents')`. Unlike `reflection.test.ts`'s stand-ins, these are recorded with
// `registerContractToken`, as `contract()` records its tokens (XT-contracts-21 pins that side).
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import { inject } from "@xaravel/runtime";
import * as php from "@xaravel/runtime/php";
import { enumExists, interfaceExists, ReflectionClass, ReflectionEnum, ReflectionException, ReflectionFunction, ReflectionNamedType, TypeError as PhpTypeError } from "@xaravel/runtime/php";
import { fqcn, registerClass, registerContractToken, registerTestClass, resolveClass } from "@xaravel/runtime/registry";
import * as registry from "@xaravel/runtime/registry";
import { runInRootFrame } from "@xaravel/runtime/scope";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");
const CLASS_LOOKUP = Symbol.for("xaravel.class.lookup");
const NS = "XaravelFixture\\Tokens";

/** A stand-in contract token named `name`, extending `parents`. */
function token(name: string, parents: readonly object[] = []): object {
  const brand = Symbol.for(name);
  return Object.freeze({
    brand,
    [CLASS_FQCN]: name,
    [CONTRACT_PARENTS]: Object.freeze([...parents]),
    [Symbol.toPrimitive]: (): symbol => brand,
    [Symbol.hasInstance]: (value: unknown): boolean => typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true,
  });
}

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

function assertThrows(klass: abstract new (...args: never[]) => unknown, matches: string | RegExp, fn: () => unknown): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof klass, `expected a ${String((klass as { name?: unknown }).name)}: ${String(error)}`);
  const message = (error as globalThis.Error).message;
  if (typeof matches === "string") {
    Assert.assertSame(matches, message);
  } else {
    Assert.assertTrue(matches.test(message), `unexpected message: ${message}`);
  }
}

/** Runs `code` as a module in a fresh `bun` process from the package directory, with `env` over the parent's (less the opt-out). */
function child(code: string, env: Record<string, string> = {}): { code: number; out: string; err: string } {
  const { XARAVEL_NO_SCOPE_GLOBAL: _optOut, ...inherited } = process.env;
  const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", code], { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe", env: { ...inherited, ...env } });
  return { code: run.exitCode, out: run.stdout.toString().trim(), err: run.stderr.toString() };
}

/** The four package entries, each of which installs the lookup. */
const ENTRIES = ["src/index.ts", "src/scope/index.ts", "src/registry/index.ts", "src/php/index.ts"] as const;

// Upstream's SupportReflectorTest fixtures as tokens and classes: interface IA, interface IB extends IA, a class
// implementing IB, and a method hinting IB.
const IA = token(`${NS}\\IA`);
const IB = token(`${NS}\\IB`, [IA]);
registerContractToken(IA);
registerContractToken(IB);

class ImplementsIB {
  get [Symbol.for(`${NS}\\IA`)](): true {
    return true;
  }
  get [Symbol.for(`${NS}\\IB`)](): true {
    return true;
  }
}
registerClass(`${NS}\\ImplementsIB`, ImplementsIB);

class Plain {}
registerClass(`${NS}\\Plain`, Plain);

class WithInterfaceParameter {
  @inject({ x: IB })
  f(x: unknown): unknown {
    return x;
  }
}
registerClass(`${NS}\\WithInterfaceParameter`, WithInterfaceParameter);

/** `true` when `fn` does not throw: PHP's `class_exists($n)` over the Registry (no autoload). */
function classExists(name: string): boolean {
  return thrownBy(() => resolveClass(name)) === null;
}

/** `Reflector::isParameterSubclassOf`'s body (Reflector.php:176-183), ported over the runtime as Story 13.1 will. */
function isSubclassOfByName(paramClassName: string | null, className: string): boolean {
  return paramClassName !== null && (classExists(paramClassName) || interfaceExists(paramClassName)) && new ReflectionClass(paramClassName).isSubclassOf(className);
}

xaravelTest(
  "XT-runtime-48",
  "the Registry records a contract token under its FQCN with registerContractToken (exported from the root and registry), case-insensitive with a leading \\ dropped, first token wins and the same token again is a no-op, a non-token a TypeError; interfaceExists (root and php) is true for a recorded token's FQCN and false for a class, an unknown name and an unrecorded token, and a non-string a PHP TypeError; new ReflectionClass and isSubclassOf resolve a recorded token's FQCN after the classes, so Reflector::isParameterSubclassOf ports line for line for an interface hint; fqcn and resolveClass are unchanged; Symbol.for('xaravel.class.lookup') gives a class (test class first) or a token or null, and is installed by each of the four entries, non-writable, non-configurable and non-enumerable, refuses another value with LogicException and is skipped under XARAVEL_NO_SCOPE_GLOBAL=1 (ESC-13.1-7, ESC-13.1-9)",
  () => {
    // Exports.
    Assert.assertSame(registerContractToken, (root as Record<string, unknown>)["registerContractToken"]);
    Assert.assertSame(registerContractToken, (registry as Record<string, unknown>)["registerContractToken"]);
    Assert.assertSame(interfaceExists, (root as Record<string, unknown>)["interfaceExists"]);
    Assert.assertSame(interfaceExists, (php as Record<string, unknown>)["interfaceExists"]);

    // Token recorded: the name resolves, case-insensitive, a leading \ ignored.
    Assert.assertTrue(interfaceExists(`${NS}\\IB`));
    Assert.assertTrue(interfaceExists(`\\${NS}\\IB`.toLowerCase()));
    Assert.assertTrue(interfaceExists(`${NS}\\IA`));
    const reflected = new ReflectionClass(`${NS}\\IB`);
    Assert.assertSame(`${NS}\\IB`, reflected.getName());
    Assert.assertSame(`${NS}\\IB`, new ReflectionClass(`\\${NS}\\ib`.toLowerCase()).getName());
    Assert.assertTrue(reflected.isSubclassOf(`${NS}\\IA`));
    Assert.assertTrue(reflected.isSubclassOf(IA));
    Assert.assertFalse(reflected.isSubclassOf(`${NS}\\IB`));
    Assert.assertFalse(new ReflectionClass(`${NS}\\IA`).isSubclassOf(`${NS}\\IB`));
    Assert.assertFalse(reflected.getParentClass());
    // A class against a token's FQCN is hasBrand, as against the token itself.
    Assert.assertTrue(new ReflectionClass(ImplementsIB).isSubclassOf(`${NS}\\IB`));
    Assert.assertSame(php.hasBrand(ImplementsIB, IB), new ReflectionClass(ImplementsIB).isSubclassOf(`${NS}\\IB`));
    Assert.assertSame(php.hasBrand(Plain, IB), new ReflectionClass(Plain).isSubclassOf(`${NS}\\IB`));
    Assert.assertFalse(new ReflectionClass(Plain).isSubclassOf(`${NS}\\IB`));

    // A token is still never a registered class (ESC-10.1-3).
    Assert.assertSame(`${NS}\\IB`, fqcn(IB));
    Assert.assertFalse(classExists(`${NS}\\IB`));
    assertThrows(Error, `Class "${NS}\\IB" not found`, () => resolveClass(`${NS}\\IB`));
    Assert.assertFalse(`${NS}\\IB` in (globalThis as unknown as Record<symbol, object>)[Symbol.for("xaravel.php.classes")]!);

    // Reflector::isParameterSubclassOf over an interface hint (testParameterSubclassOfInterface), and a class hint.
    const hinted = new ReflectionClass(WithInterfaceParameter).getMethod("f").getParameters()[0]!.getType() as ReflectionNamedType;
    Assert.assertSame(`${NS}\\IB`, hinted.getName());
    Assert.assertTrue(isSubclassOfByName(hinted.getName(), `${NS}\\IA`));
    Assert.assertFalse(isSubclassOfByName(hinted.getName(), `${NS}\\IB`));
    Assert.assertTrue(isSubclassOfByName(`${NS}\\ImplementsIB`, `${NS}\\IA`));
    Assert.assertFalse(isSubclassOfByName("Nope", `${NS}\\IA`));
    Assert.assertFalse(isSubclassOfByName(null, `${NS}\\IA`));

    // Not an interface: a class's FQCN, an unknown name, a stand-in token never recorded.
    const unrecorded = token(`${NS}\\Unrecorded`);
    Assert.assertSame(`${NS}\\Unrecorded`, fqcn(unrecorded));
    Assert.assertFalse(interfaceExists(`${NS}\\Plain`));
    Assert.assertFalse(interfaceExists("Nope"));
    Assert.assertFalse(interfaceExists(`${NS}\\Unrecorded`));
    Assert.assertFalse(interfaceExists(""));
    assertThrows(ReflectionException, 'Class "Nope" does not exist', () => new ReflectionClass("Nope"));
    assertThrows(ReflectionException, `Class "${NS}\\Unrecorded" does not exist`, () => new ReflectionClass(`${NS}\\Unrecorded`));
    assertThrows(ReflectionException, 'Class "Nope" does not exist', () => reflected.isSubclassOf("Nope"));

    // Re-declaration: the first token stays; the same token again is a no-op.
    const again = token(`${NS}\\ib`);
    registerContractToken(again);
    registerContractToken(IB);
    Assert.assertSame(`${NS}\\IB`, new ReflectionClass(`${NS}\\IB`).getName());
    const lookup = (globalThis as unknown as Record<symbol, (name: string) => unknown>)[CLASS_LOOKUP]!;
    Assert.assertSame(IB, lookup(`${NS}\\ib`));
    Assert.assertSame(IB, lookup(`\\${NS}\\IB`));

    // Bad token.
    for (const value of [{}, Object.freeze({}), { [CLASS_FQCN]: "A\\B" }, ImplementsIB, null, 5, "A\\B"]) {
      assertThrows(TypeError, "registerContractToken(): the value is not a contract token", () => registerContractToken(value as object));
    }

    // Non-string: PHP's TypeError with PHP 8.5's message.
    assertThrows(PhpTypeError, "interface_exists(): Argument #1 ($interface) must be of type string, int given", () => interfaceExists(5 as unknown as string));
    assertThrows(PhpTypeError, "interface_exists(): Argument #1 ($interface) must be of type string, null given", () => interfaceExists(null as unknown as string));

    // The lookup: classes before tokens, a test class first, else null.
    Assert.assertSame("function", typeof lookup);
    Assert.assertSame(Plain, lookup(`${NS}\\Plain`));
    Assert.assertSame(Plain, lookup(`\\${NS}\\plain`));
    Assert.assertSame(null, lookup("Nope"));
    Assert.assertSame(null, lookup(`${NS}\\Unrecorded`));
    Assert.assertSame(null, lookup(5 as unknown as string));
    const shadow = token(`${NS}\\Plain`);
    registerContractToken(shadow);
    Assert.assertSame(Plain, lookup(`${NS}\\Plain`), "a class wins over a token of the same name");
    Assert.assertFalse(interfaceExists(`${NS}\\Plain`));
    Assert.assertSame(`${NS}\\Plain`, new ReflectionClass(`${NS}\\Plain`).getName());
    class Fixture {}
    runInRootFrame("test", () => {
      registerTestClass(`${NS}\\TestOnly`, Fixture);
      Assert.assertSame(Fixture, lookup(`${NS}\\TestOnly`));
      Assert.assertFalse(interfaceExists(`${NS}\\TestOnly`));
    });
    Assert.assertSame(null, lookup(`${NS}\\TestOnly`));
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, CLASS_LOOKUP)!;
    Assert.assertSame([false, false, false], [descriptor.writable, descriptor.configurable, descriptor.enumerable]);

    // Each of the four entries installs it in a fresh process.
    for (const entry of ENTRIES) {
      const run = child(`await import(${JSON.stringify(join(PACKAGE_DIR, entry))}); const f = globalThis[Symbol.for("xaravel.class.lookup")]; const d = Object.getOwnPropertyDescriptor(globalThis, Symbol.for("xaravel.class.lookup")); console.log(typeof f, f("stdclass") !== null, f("Nope"), d.writable, d.configurable, d.enumerable);`);
      Assert.assertSame(0, run.code, `${entry}: ${run.err}`);
      Assert.assertSame("function true null false false false", run.out, entry);
    }
    // The Registry alone installs nothing.
    const bare = child(`await import(${JSON.stringify(join(PACKAGE_DIR, "src/registry/registry.ts"))}); console.log(globalThis[Symbol.for("xaravel.class.lookup")] === undefined);`);
    Assert.assertSame(0, bare.code, bare.err);
    Assert.assertSame("true", bare.out, bare.err);
    // Already defined with another value: loading throws PHP's LogicException.
    const taken = child(
      `Object.defineProperty(globalThis, Symbol.for("xaravel.class.lookup"), { value: () => null }); try { await import("@xaravel/runtime/php"); console.log("installed"); } catch (e) { console.log(e.name + ": " + e.message); }`,
    );
    Assert.assertSame(0, taken.code, taken.err);
    Assert.assertSame(
      "LogicException: Symbol.for('xaravel.class.lookup') was already defined by other code or another copy of @xaravel/runtime; @xaravel/runtime will not install over it",
      taken.out,
      taken.err,
    );
    // Opted out: neither installed nor refused.
    const optedOut = child(`await import("@xaravel/runtime"); console.log(globalThis[Symbol.for("xaravel.class.lookup")] === undefined);`, { XARAVEL_NO_SCOPE_GLOBAL: "1" });
    Assert.assertSame(0, optedOut.code, optedOut.err);
    Assert.assertSame("true", optedOut.out, optedOut.err);
    const secondCopy = child(
      `const first = () => null; Object.defineProperty(globalThis, Symbol.for("xaravel.class.lookup"), { value: first }); await import("@xaravel/runtime"); console.log(globalThis[Symbol.for("xaravel.class.lookup")] === first);`,
      { XARAVEL_NO_SCOPE_GLOBAL: "1" },
    );
    Assert.assertSame(0, secondCopy.code, secondCopy.err);
    Assert.assertSame("true", secondCopy.out, secondCopy.err);
  },
  60_000,
);

// AD-26 enums: a backed enum (string and int), a pure enum, a class that is no enum, and a bad backing type.
class Suit {
  static readonly backingType = "string";
  static readonly Hearts = new Suit("H");
  static readonly Spades = new Suit("S");
  constructor(readonly value: string) {}
  static cases(): Suit[] {
    return [Suit.Hearts, Suit.Spades];
  }
  static from(value: string): Suit {
    return Suit.tryFrom(value) as Suit;
  }
  static tryFrom(value: string): Suit | null {
    return Suit.cases().find((c) => c.value === value) ?? null;
  }
}
registerClass(`${NS}\\Suit`, Suit);

class Level {
  static readonly backingType = "int";
  static cases(): Level[] {
    return [];
  }
}
registerClass(`${NS}\\Level`, Level);

class Pure {
  static readonly Only = new Pure();
  static cases(): Pure[] {
    return [Pure.Only];
  }
}
registerClass(`${NS}\\Pure`, Pure);

class Floaty {
  static readonly backingType = "float";
  static cases(): Floaty[] {
    return [];
  }
}
registerClass(`${NS}\\Floaty`, Floaty);

/** `Reflector::isParameterBackedEnumWithStringBackingType`'s body (Reflector.php:191-211), ported line for line. */
function isParameterBackedEnumWithStringBackingType(fn: (...args: never[]) => unknown): boolean {
  const type = new ReflectionFunction(fn).getParameters()[0]!.getType();
  if (!(type instanceof ReflectionNamedType)) {
    return false;
  }
  const backedEnumClass = type.getName();
  if (enumExists(backedEnumClass)) {
    const reflectionBackedEnum = new ReflectionEnum(backedEnumClass);
    return reflectionBackedEnum.isBacked() && reflectionBackedEnum.getBackingType()!.getName() === "string";
  }
  return false;
}

xaravelTest(
  "XT-runtime-49",
  "enumExists (root and php) is true for a registered class whose static side has a cases function (AD-26) and false for a class without one, a token's FQCN and an unknown name, a non-string a PHP TypeError; ReflectionEnum, registered under its PHP name, exported from the root and php, a ReflectionClass, takes an enum class, a case or an FQCN: isBacked and getBackingType give a builtin string or int ReflectionNamedType for a declared static backingType and false / null for a pure enum, and throw PHP's TypeError for another backingType; a class that is no enum is ReflectionException 'is not an enum', an unknown name 'does not exist'; so Reflector::isParameterBackedEnumWithStringBackingType ports line for line (ESC-13.1-8)",
  () => {
    Assert.assertSame("ReflectionEnum", fqcn(ReflectionEnum));
    Assert.assertSame(ReflectionEnum, resolveClass("ReflectionEnum"));
    Assert.assertSame(ReflectionEnum, (root as Record<string, unknown>)["ReflectionEnum"]);
    Assert.assertSame(ReflectionEnum, (php as Record<string, unknown>)["ReflectionEnum"]);
    Assert.assertSame(enumExists, (root as Record<string, unknown>)["enumExists"]);
    Assert.assertSame(enumExists, (php as Record<string, unknown>)["enumExists"]);
    Assert.assertFalse("ReflectionEnum" in (globalThis as unknown as Record<symbol, object>)[Symbol.for("xaravel.php.classes")]!);

    // Backed, by class, FQCN (any case, leading \) and case.
    Assert.assertTrue(enumExists(`${NS}\\Suit`));
    Assert.assertTrue(enumExists(`\\${NS}\\suit`.toLowerCase()));
    for (const target of [Suit, `${NS}\\Suit`, `\\${NS}\\SUIT`, Suit.Hearts] as const) {
      const reflection = new ReflectionEnum(target);
      Assert.assertInstanceOf(ReflectionClass, reflection);
      Assert.assertSame(`${NS}\\Suit`, reflection.getName());
      Assert.assertTrue(reflection.isBacked());
      const backing = reflection.getBackingType();
      Assert.assertInstanceOf(ReflectionNamedType, backing);
      Assert.assertSame(["string", true], [backing!.getName(), backing!.isBuiltin()]);
    }
    const level = new ReflectionEnum(Level);
    Assert.assertTrue(level.isBacked());
    Assert.assertSame(["int", true], [level.getBackingType()!.getName(), level.getBackingType()!.isBuiltin()]);

    // Pure.
    Assert.assertTrue(enumExists(`${NS}\\Pure`));
    const pure = new ReflectionEnum(Pure.Only);
    Assert.assertFalse(pure.isBacked());
    Assert.assertSame(null, pure.getBackingType());

    // Not an enum.
    Assert.assertFalse(enumExists(`${NS}\\Plain`));
    Assert.assertFalse(enumExists(`${NS}\\IB`));
    Assert.assertFalse(enumExists("Nope"));
    assertThrows(ReflectionException, `Class "${NS}\\Plain" is not an enum`, () => new ReflectionEnum(Plain));
    assertThrows(ReflectionException, `Class "${NS}\\Plain" is not an enum`, () => new ReflectionEnum(`${NS}\\plain`));
    assertThrows(ReflectionException, `Class "${NS}\\Plain" is not an enum`, () => new ReflectionEnum(new Plain()));
    assertThrows(ReflectionException, `Class "${NS}\\IB" is not an enum`, () => new ReflectionEnum(`${NS}\\IB`));
    assertThrows(ReflectionException, `Class "${NS}\\IB" is not an enum`, () => new ReflectionEnum(IB));
    assertThrows(ReflectionException, 'Class "Nope" does not exist', () => new ReflectionEnum("Nope"));
    assertThrows(PhpTypeError, "ReflectionEnum::__construct(): Argument #1 ($objectOrClass) must be of type object|string, int given", () => new ReflectionEnum(5 as unknown as string));

    // Bad backing type.
    Assert.assertTrue(enumExists(`${NS}\\Floaty`));
    const floaty = new ReflectionEnum(Floaty);
    assertThrows(PhpTypeError, `${NS}\\Floaty::backingType must be 'string' or 'int' (AD-26), 'float' given`, () => floaty.isBacked());
    assertThrows(PhpTypeError, `${NS}\\Floaty::backingType must be 'string' or 'int' (AD-26), 'float' given`, () => floaty.getBackingType());

    // Non-string.
    assertThrows(PhpTypeError, "enum_exists(): Argument #1 ($enum) must be of type string, null given", () => enumExists(null as unknown as string));
    assertThrows(PhpTypeError, "enum_exists(): Argument #1 ($enum) must be of type string, int given", () => enumExists(5 as unknown as string));

    // Reflector::isParameterBackedEnumWithStringBackingType, line for line.
    Assert.assertTrue(isParameterBackedEnumWithStringBackingType(inject({ suit: Suit }, (suit: unknown) => suit)));
    Assert.assertFalse(isParameterBackedEnumWithStringBackingType(inject({ level: Level }, (level: unknown) => level)));
    Assert.assertFalse(isParameterBackedEnumWithStringBackingType(inject({ pure: Pure }, (pure: unknown) => pure)));
    Assert.assertFalse(isParameterBackedEnumWithStringBackingType(inject({ plain: Plain }, (plain: unknown) => plain)));
    Assert.assertFalse(isParameterBackedEnumWithStringBackingType(inject({ s: String }, (s: unknown) => s)));
  },
);
