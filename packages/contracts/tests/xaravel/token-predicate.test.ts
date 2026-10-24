// Xaravel Test for the Epic 10 retrospective's action item 4 (L7), as the Maintainer ruled it
// (decisions/MAINT-2026-10-24-epic-10-items.md, Item 4): one contract-token predicate on each side of AD-15's grader
// line. `@xaravel/runtime`'s `isContractToken` is the runtime side's, used by the Registry and `@xaravel/contracts`;
// `@xaravel/assert`'s is the grader side's, used by both test doubles. Neither imports the other, so XT-contracts-20
// pins them equal: both are fed every row of the item's edge-case matrix and every export of every `@xaravel/contracts`
// subpath, and must give the same answer on each. A token is a frozen, non-function object whose own
// `Symbol.for('xaravel.class.fqcn')` property is a non-writable string data property.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Assert, isContractToken as graderIsContractToken, xaravelTest } from "@xaravel/assert";
import { isContractToken as runtimeIsContractToken } from "@xaravel/runtime";
import { fqcn, isContractToken as registryIsContractToken } from "@xaravel/runtime/registry";
import { CLASS_FQCN, contract, CONTRACT_PARENTS, type ContractToken } from "@xaravel/contracts";
import { aliasResolver } from "@xaravel/contracts/aliases";
import { PACKAGE, typeErrorOf } from "./support/contract-namespaces";

/** Every `@xaravel/contracts` subpath module, `./aliases` included. */
const MODULES: readonly (readonly [string, object])[] = await Promise.all(
  Object.keys((JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as { exports: Record<string, string> }).exports).map(
    async (subpath) => [subpath, (await import(`@xaravel/contracts${subpath.slice(1)}`)) as object] as const,
  ),
);

/** Both predicates' answers on `value`, asserted equal; returns the shared answer. */
function agreed(label: string, value: unknown): boolean {
  const runtime = runtimeIsContractToken(value);
  const grader = graderIsContractToken(value);
  Assert.assertSame(runtime, grader, `${label}: runtime and grader predicates agree`);
  return runtime;
}

/** A frozen object with the own FQCN data property `name` and nothing else. */
function frozenWith(name: unknown): object {
  return Object.freeze({ [CLASS_FQCN]: name });
}

xaravelTest(
  "XT-contracts-20",
  "@xaravel/runtime's isContractToken (also from /registry) and @xaravel/assert's agree on every value: a contract() token and every exported token are tokens; an unfrozen forged object, a frozen object whose FQCN is a getter or not a string, a sealed object with a writable FQCN, an object inheriting a token's FQCN, a frozen function, a brand-only object, primitives and null are not; a frozen empty FQCN is a token. contract() takes a genuine parent without Symbol.hasInstance and lists it, refuses a forged parent, and aliasResolver a forged extra token (MAINT-2026-10-24 Item 4)",
  () => {
    // The runtime predicate is one function, from every entry that exports it.
    Assert.assertSame(runtimeIsContractToken, registryIsContractToken);

    // A genuine token.
    const genuine = contract("A\\B", {});
    Assert.assertTrue(agreed("contract() token", genuine));
    Assert.assertSame("A\\B", fqcn(genuine));

    // An unfrozen forged token: not a token, so contract() refuses it as a parent and aliasResolver as an extra token.
    const forged = { [CLASS_FQCN]: "A\\B", [Symbol.hasInstance]: (): boolean => true };
    Assert.assertFalse(agreed("unfrozen forged", forged));
    Assert.assertSame("contract(): parent 0 of X\\Y is not a contract token", typeErrorOf(() => contract("X\\Y", {}, [forged as unknown as ContractToken<object>])));
    Assert.assertSame("extra token 0 is not a contract token.", typeErrorOf(() => aliasResolver({ CORE_CONTAINER_ALIASES: {}, PROVIDER_BINDINGS: {}, PROVIDER_ALIASES: [] }, [forged as unknown as ContractToken<object>])));

    // contract() takes any genuine token as a parent, one without Symbol.hasInstance included, and lists it.
    const bareParent = Object.freeze({ [CLASS_FQCN]: "P\\Q" });
    const withBareParent = contract("X\\Y", {}, [bareParent as unknown as ContractToken<object>]);
    Assert.assertSame(1, withBareParent[CONTRACT_PARENTS].length);
    Assert.assertSame(bareParent, withBareParent[CONTRACT_PARENTS][0]);

    // An accessor FQCN, or a writable one on a sealed (not frozen) object.
    Assert.assertFalse(agreed("frozen accessor FQCN", Object.freeze(Object.defineProperty({}, CLASS_FQCN, { get: () => "A\\B", enumerable: true }))));
    const sealed = Object.seal({ [CLASS_FQCN]: "A\\B" });
    Assert.assertTrue(Object.getOwnPropertyDescriptor(sealed, CLASS_FQCN)?.writable === true);
    Assert.assertFalse(agreed("sealed writable FQCN", sealed));
    Assert.assertFalse(agreed("unfrozen non-writable FQCN", Object.defineProperty({}, CLASS_FQCN, { value: "A\\B", writable: false })));

    // A non-string FQCN.
    Assert.assertFalse(agreed("frozen numeric FQCN", frozenWith(1)));
    Assert.assertFalse(agreed("frozen null FQCN", frozenWith(null)));

    // An inherited FQCN.
    Assert.assertFalse(agreed("frozen Object.create(token)", Object.freeze(Object.create(genuine) as object)));

    // A function: a class, even frozen with an own FQCN.
    const fn = function named(): void {};
    Object.defineProperty(fn, CLASS_FQCN, { value: "A\\B", writable: false });
    Object.freeze(fn);
    Assert.assertFalse(agreed("frozen function with an own FQCN", fn));
    class Registered {
      static readonly [CLASS_FQCN]: string = "A\\Registered";
    }
    Assert.assertFalse(agreed("class with a static FQCN", Registered));

    // Primitives and null.
    for (const [label, value] of [
      ["null", null],
      ["undefined", undefined],
      ["string", "A\\B"],
      ["symbol", Symbol.for("A\\B")],
      ["number", 1],
      ["boolean", true],
      ["plain object", {}],
      ["frozen plain object", Object.freeze({})],
    ] as const) {
      Assert.assertFalse(agreed(label, value));
    }

    // A brand-only object, which Mockery once named by its brand's description, is no token.
    Assert.assertFalse(agreed("brand-only object", { [Symbol.for("XtBranded")]: true, [Symbol.hasInstance]: (): boolean => false }));
    Assert.assertFalse(agreed("frozen brand-only object", Object.freeze({ [Symbol.for("XtBranded")]: true, [Symbol.hasInstance]: (): boolean => false })));

    // An empty FQCN is a token; each test double refuses it as nameless (XT-assert-100, XT-mockery-15).
    Assert.assertTrue(agreed("frozen empty FQCN", frozenWith("")));

    // Every export of every subpath: the two agree, and each non-function export carrying an own FQCN is a token.
    let tokens = 0;
    for (const [subpath, module] of MODULES) {
      for (const [name, value] of Object.entries(module)) {
        const answer = agreed(`${subpath} ${name}`, value);
        if (typeof value === "object" && value !== null && Object.hasOwn(value, CLASS_FQCN)) {
          Assert.assertTrue(answer, `${subpath} ${name} is a contract token`);
          Assert.assertSame((value as Record<symbol, unknown>)[CLASS_FQCN], fqcn(value));
          tokens++;
        }
      }
    }
    Assert.assertGreaterThan(100, tokens);
  },
);
