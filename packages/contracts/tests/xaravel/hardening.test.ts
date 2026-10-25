// Xaravel Test for the Epic 10 retrospective's action item 3: `contract()` and the alias table hardened (findings
// L3–L6, L9). XT-contracts-19 has one block per row of the item's edge-case matrix: the alias table's names are read
// as queries are (one leading `\` dropped, the contract-prefix test case-insensitive), an extra token must be a
// contract token that names no FQCN the package exports or another extra token names, `contract()` refuses what PHP
// refuses in an interface declaration, `canonicalToken` on a non-abstract value throws `fqcn()`'s error, and a class
// carrying a static brand passes `instanceof` as a value but not as a class.
import { Assert, xaravelTest } from "@xaravel/assert";
import { hasBrand, LogicException } from "@xaravel/runtime/php";
import { fqcn } from "@xaravel/runtime/registry";
import { CLASS_FQCN, contract, type ContractToken } from "@xaravel/contracts";
import { aliasResolver, type AliasTable, canonicalToken, validateAliasTable } from "@xaravel/contracts/aliases";
import * as support from "@xaravel/contracts/support";
import { assertSameAbstract, typeErrorOf } from "./support/contract-namespaces";

/** The message of the `LogicException` `fn` throws, `(nothing thrown)` when it returns, or a note naming another error. */
function logicMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof LogicException ? error.message : `not a LogicException: ${String(error)}`;
  }
  return "(nothing thrown)";
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

/** A three-part table with the given parts, the rest empty. */
function table(parts: Partial<AliasTable>): AliasTable {
  return { CORE_CONTAINER_ALIASES: {}, PROVIDER_BINDINGS: {}, PROVIDER_ALIASES: [], ...parts };
}

xaravelTest(
  "XT-contracts-19",
  "contract() and the alias table hardened (Epic 10 retrospective, L3–L6, L9): validateAliasTable drops one leading \\ from every table name, as queries are, and tests the contract prefixes case-insensitively; an extra token must be a contract token, else TypeError naming its index, and every token reachable from it whose FQCN, ignoring case, is a known one (the package's or an earlier extra's) must be that same object, else LogicException naming the FQCN; a case variant of an exported FQCN in the table is refused, as lookups are case-sensitive; contract() throws a TypeError for two members equal ignoring ASCII case, a parent listed twice or naming the contract itself, and a member also listed as a builtin; canonicalToken on a non-abstract value throws fqcn()'s error; a class with a static brand passes instanceof as a value, while hasBrand(class) and its instances do not",
  () => {
    // L3 backslash: a table name is read without its leading `\`.
    Assert.assertSame(
      "[Illuminate\\Contracts\\Nope] names a contract that @xaravel/contracts does not export.",
      logicMessage(() => validateAliasTable(table({ CORE_CONTAINER_ALIASES: { s: ["\\Illuminate\\Contracts\\Nope"] } }))),
    );
    Assert.assertSame(
      "[Illuminate\\Contracts\\Nope] names a contract that @xaravel/contracts does not export.",
      logicMessage(() => validateAliasTable(table({ PROVIDER_ALIASES: [["\\App\\M", "\\Illuminate\\Contracts\\Nope"]] }))),
    );
    Assert.assertSame("[App\\Thing] is aliased to itself.", logicMessage(() => validateAliasTable(table({ PROVIDER_ALIASES: [["\\App\\Thing", "App\\Thing"]] }))));
    Assert.assertSame("[App\\Thing] is aliased to itself.", logicMessage(() => validateAliasTable(table({ CORE_CONTAINER_ALIASES: { "\\App\\Thing": ["App\\Thing"] } }))));
    assertSameAbstract(support.Arrayable, aliasResolver(table({ CORE_CONTAINER_ALIASES: { "\\Illuminate\\Contracts\\Support\\Arrayable": ["x"] } }))("x"));

    // L3 case: the contract-prefix test is case-insensitive; the name is reported as written.
    Assert.assertSame(
      "[illuminate\\contracts\\nope] names a contract that @xaravel/contracts does not export.",
      logicMessage(() => validateAliasTable(table({ CORE_CONTAINER_ALIASES: { s: ["illuminate\\contracts\\nope"] } }))),
    );
    // A case variant of an exported FQCN is refused, naming both, as lookups are case-sensitive.
    Assert.assertSame(
      "[illuminate\\contracts\\support\\arrayable] differs only in letter case from the exported contract [Illuminate\\Contracts\\Support\\Arrayable]; alias lookups are case-sensitive.",
      logicMessage(() => validateAliasTable(table({ CORE_CONTAINER_ALIASES: { s: ["illuminate\\contracts\\support\\arrayable"] } }))),
    );
    Assert.assertSame("[PSR\\LOG\\Nope] names a contract that @xaravel/contracts does not export.", logicMessage(() => validateAliasTable(table({ PROVIDER_BINDINGS: { s: "PSR\\LOG\\Nope" } }))));

    // L3 resolve: a core alias written with a leading `\` reaches its token; lookups stay case-sensitive.
    const resolve = aliasResolver(table({ CORE_CONTAINER_ALIASES: { s: ["\\Illuminate\\Contracts\\Support\\Arrayable"] } }));
    assertSameAbstract(support.Arrayable, resolve("Illuminate\\Contracts\\Support\\Arrayable"));
    assertSameAbstract(support.Arrayable, resolve("\\Illuminate\\Contracts\\Support\\Arrayable"));
    assertSameAbstract(support.Arrayable, resolve("s"));
    assertSameAbstract("S", resolve("S"));
    const bareBinding = aliasResolver(table({ PROVIDER_BINDINGS: { "\\App\\Key": "\\App\\Built" } }));
    assertSameAbstract("App\\Key", bareBinding("App\\Built"));

    // L4 collision: an extra token may not replace a package token, in any letter case.
    for (const name of ["Illuminate\\Contracts\\Support\\Arrayable", "illuminate\\contracts\\support\\ARRAYABLE"]) {
      const twin = contract<object>(name);
      Assert.assertSame(`[${name}] is a contract that @xaravel/contracts exports; an extra token may not replace it.`, logicMessage(() => validateAliasTable(table({}), [twin])));
      Assert.assertSame(`[${name}] is a contract that @xaravel/contracts exports; an extra token may not replace it.`, logicMessage(() => aliasResolver(table({}), [twin])));
    }

    // The package's own token as an extra is accepted, while an extra whose parent is a twin of a package token is not.
    Assert.assertSame("(nothing thrown)", logicMessage(() => validateAliasTable(table({}), [support.Arrayable])));
    assertSameAbstract(support.Arrayable, aliasResolver(table({ CORE_CONTAINER_ALIASES: { s: ["Illuminate\\Contracts\\Support\\Arrayable"] } }), [support.Arrayable])("s"));
    const twinParent = contract<object>("App\\Contracts\\ViaTwin", {}, [contract("Illuminate\\Contracts\\Support\\Arrayable")]);
    Assert.assertSame(
      "[Illuminate\\Contracts\\Support\\Arrayable] is a contract that @xaravel/contracts exports; an extra token may not replace it.",
      logicMessage(() => validateAliasTable(table({}), [twinParent])),
    );

    // L4 extra twice: two distinct tokens of one FQCN (any case) collide; the same object twice does not.
    const First = contract<object>("App\\Contracts\\Twice");
    const Second = contract<object>("App\\Contracts\\TWICE");
    Assert.assertSame("[App\\Contracts\\TWICE] is named by two extra tokens.", logicMessage(() => validateAliasTable(table({}), [First, Second])));
    Assert.assertSame("[App\\Contracts\\Twice] is named by two extra tokens.", logicMessage(() => validateAliasTable(table({}), [First, contract<object>("App\\Contracts\\Twice")])));
    Assert.assertSame("(nothing thrown)", logicMessage(() => validateAliasTable(table({}), [First, First])));
    const twiceTable = table({ CORE_CONTAINER_ALIASES: { twice: ["App\\Contracts\\Twice"] } });
    assertSameAbstract(First, aliasResolver(twiceTable, [First, First])("twice"));

    // L4 non-token: a TypeError naming the index, never a raw property error from the parents walk.
    const nonTokens: unknown[] = [
      Object.freeze({ [CLASS_FQCN]: "App\\X" }),
      { [CLASS_FQCN]: "App\\X" },
      Object.freeze(Object.assign(() => null, { [CLASS_FQCN]: "App\\X" })),
      Object.freeze({ [CLASS_FQCN]: 42, [Symbol.hasInstance]: () => true }),
      Object.freeze({ [CLASS_FQCN]: "App\\X", [Symbol.hasInstance]: () => true, [Symbol.for("xaravel.contract.parents")]: [{}] }),
      Object.freeze({ [CLASS_FQCN]: "App\\X", [Symbol.hasInstance]: () => true, [Symbol.for("xaravel.contract.parents")]: "x" }),
      null,
      "App\\X",
    ];
    for (const bad of nonTokens) {
      Assert.assertSame("extra token 1 is not a contract token.", typeErrorOf(() => validateAliasTable(table({}), [First, bad as ContractToken<object>])));
      Assert.assertSame("extra token 0 is not a contract token.", typeErrorOf(() => aliasResolver(table({}), [bad as ContractToken<object>])));
    }
    // A non-token without parents, against a table that aliases its FQCN: the TypeError, not a raw error from the walk.
    const parentless = Object.freeze({ [CLASS_FQCN]: "App\\X", [Symbol.hasInstance]: () => true });
    Assert.assertSame("extra token 0 is not a contract token.", typeErrorOf(() => validateAliasTable(table({ CORE_CONTAINER_ALIASES: { x: ["App\\X"] } }), [parentless as unknown as ContractToken<object>])));
    // A token whose parents are contract tokens, recursively, is accepted.
    const Child = contract<object>("App\\Contracts\\Child", {}, [First, support.Arrayable]);
    Assert.assertSame("(nothing thrown)", logicMessage(() => validateAliasTable(table({}), [Child, First])));

    // L5 members: two members equal case-insensitively (PHP method names are case-insensitive).
    Assert.assertSame("contract(): App\\M::Count() is declared twice in App\\M (method names are case-insensitive)", typeErrorOf(() => contract("App\\M", { count: [], Count: [] })));
    Assert.assertSame("(nothing thrown)", typeErrorOf(() => contract("App\\M", { count: [], counted: [] })));
    // PHP folds ASCII only: `é` and `É` are two names.
    Assert.assertSame("(nothing thrown)", typeErrorOf(() => contract("App\\M", { é: [], É: [] })));

    // L5 parents: a parent listed twice (same token, or FQCNs equal case-insensitively), or naming the contract itself.
    const A = contract("App\\A");
    Assert.assertSame("contract(): parent 1 of App\\B, App\\A, is listed twice", typeErrorOf(() => contract("App\\B", {}, [A, A])));
    Assert.assertSame("contract(): parent 1 of App\\B, app\\a, is listed twice", typeErrorOf(() => contract("App\\B", {}, [A, contract("app\\a")])));
    Assert.assertSame("contract(): App\\A cannot extend itself (parent 0)", typeErrorOf(() => contract("App\\A", {}, [A])));
    Assert.assertSame("contract(): APP\\a cannot extend itself (parent 0)", typeErrorOf(() => contract("\\APP\\a", {}, [A])));

    // L5 builtin: a member whose name is also a listed builtin, in any case.
    Assert.assertSame("contract(): App\\C::count() is also listed in the builtins of App\\C", typeErrorOf(() => contract("App\\C", { count: [] }, [], {}, ["count"])));
    Assert.assertSame("contract(): App\\C::COUNT() is also listed in the builtins of App\\C", typeErrorOf(() => contract("App\\C", { COUNT: [] }, [], {}, ["count"])));
    Assert.assertSame("(nothing thrown)", typeErrorOf(() => contract("App\\C", { all: [] }, [], {}, ["count"])));

    // L6: canonicalToken on a non-abstract value throws fqcn()'s error.
    for (const value of [{}, 42]) {
      const expected = thrownBy(() => fqcn(value as never));
      const actual = thrownBy(() => canonicalToken(value as never));
      Assert.assertNotNull(expected);
      Assert.assertNotNull(actual);
      Assert.assertSame((expected as Error).constructor, (actual as Error).constructor);
      Assert.assertSame((expected as Error).message, (actual as Error).message);
    }

    // L9: instanceof accepts any object or function carrying the brand (XT-contracts-1), so a class with a static brand
    // is an instance as a value; hasBrand asks the class question through the prototype, and its instances lack the brand.
    class StaticBrand {
      static [support.Arrayable.brand] = true;
    }
    class InheritsStatic extends StaticBrand {}
    Assert.assertTrue((StaticBrand as unknown) instanceof support.Arrayable);
    Assert.assertTrue((InheritsStatic as unknown) instanceof support.Arrayable);
    Assert.assertFalse(hasBrand(StaticBrand, support.Arrayable));
    Assert.assertFalse(hasBrand(InheritsStatic, support.Arrayable));
    Assert.assertFalse((new StaticBrand() as unknown) instanceof support.Arrayable);
  },
);
