// Xaravel Test for the Epic 13 retrospective's action item 2 (epic-13-item-2-reflection-contracts), as the Maintainer
// ruled ESC-13.1-7 (decisions/MAINT-2026-10-25-story-13-1-second.md, option 1): `contract(...)` records each token it
// makes with `@xaravel/runtime`'s `registerContractToken`, so the token's FQCN resolves to it as PHP's interface name
// does. XT-contracts-21 pins that side; the runtime's token table itself is XT-runtime-48. The first token made under
// a name stays recorded, as XT-contracts tests build throwaway tokens under shared names.
import { Assert, xaravelTest } from "@xaravel/assert";
import { enumExists, interfaceExists, ReflectionClass, ReflectionException } from "@xaravel/runtime/php";
import { fqcn, resolveClass } from "@xaravel/runtime/registry";
import { contract } from "@xaravel/contracts";
import { Arrayable } from "@xaravel/contracts/support";

const NS = "XaravelFixture\\ContractTokens";
const CLASS_LOOKUP = Symbol.for("xaravel.class.lookup");

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

xaravelTest(
  "XT-contracts-21",
  "contract() records each token it makes under its FQCN (ESC-13.1-7): interfaceExists is true for it, any case and with a leading \\, new ReflectionClass(name) reflects it and isSubclassOf(name) walks its parents, the class lookup gives the token; a later contract() under the same name (any case) leaves the first recorded and still returns its own token; a contract() that throws records nothing; the token is still not a class: resolveClass throws and enumExists is false; a shipped contract's FQCN resolves too",
  () => {
    const IA = contract(`${NS}\\IA`, { a: [] });
    const IB = contract(`\\${NS}\\IB`, { b: [] }, [IA]);
    Assert.assertTrue(interfaceExists(`${NS}\\IA`));
    Assert.assertTrue(interfaceExists(`${NS}\\IB`));
    Assert.assertTrue(interfaceExists(`\\${NS}\\ib`.toLowerCase()));
    const reflected = new ReflectionClass(`${NS}\\IB`);
    Assert.assertSame(`${NS}\\IB`, reflected.getName());
    Assert.assertTrue(reflected.isSubclassOf(`${NS}\\IA`));
    Assert.assertFalse(new ReflectionClass(`${NS}\\IA`).isSubclassOf(`${NS}\\IB`));
    const lookup = (globalThis as unknown as Record<symbol, (name: string) => unknown>)[CLASS_LOOKUP]!;
    Assert.assertTrue(lookup(`${NS}\\IB`) === IB, "the lookup gives the token");

    // First wins: a later token under the same name is returned but not recorded.
    const later = contract(`${NS}\\ib`, { other: [] });
    Assert.assertFalse(later === IB);
    Assert.assertSame(`${NS}\\ib`, fqcn(later));
    Assert.assertTrue(lookup(`${NS}\\IB`) === IB, "the first token stays recorded");
    Assert.assertSame(`${NS}\\IB`, new ReflectionClass(`${NS}\\ib`).getName());

    // A refused declaration records nothing.
    Assert.assertTrue(thrownBy(() => contract(`${NS}\\Bad`, { m: [], M: [] })) instanceof TypeError);
    Assert.assertFalse(interfaceExists(`${NS}\\Bad`));

    // Still never a class (ESC-10.1-3).
    Assert.assertTrue(thrownBy(() => resolveClass(`${NS}\\IB`)) instanceof Error);
    Assert.assertFalse(enumExists(`${NS}\\IB`));
    Assert.assertTrue(thrownBy(() => new ReflectionClass(`${NS}\\Never`)) instanceof ReflectionException);

    // A shipped contract.
    Assert.assertTrue(interfaceExists("Illuminate\\Contracts\\Support\\Arrayable"));
    Assert.assertSame("Illuminate\\Contracts\\Support\\Arrayable", new ReflectionClass("illuminate\\contracts\\support\\arrayable").getName());
    Assert.assertSame(fqcn(Arrayable), new ReflectionClass(Arrayable).getName());
  },
);
