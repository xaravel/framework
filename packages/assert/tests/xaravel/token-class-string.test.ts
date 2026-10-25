// Xaravel Test for the Epic 10 retrospective's action item 10 (XT-assert-101; L1, L2), as the Maintainer ruled it
// (decisions/MAINT-2026-10-24-epic-10-items.md, Item 2): the grader reads a contract token as its FQCN class-string,
// as PHP's `Arrayable::class` is (AD-9.8), in its `==` and `===`, its exporter and `varExport`, so
// `assertSame(Arrayable, 'Illuminate\Contracts\Support\Arrayable')` passes as in PHP and a failing
// `assertSame(Arrayable, Jsonable)` prints two class names. Its test is declared through `xaravelTest`, as
// XT-conformance-128 requires of every Xaravel Test file. It needs no Oracle fixture: each expected message is the
// one the grader already gives for the two FQCN strings, which other Xaravel Tests pin to PHPUnit's.
//
// The grader never imports @xaravel/contracts (AD-2), so every token here is a stand-in built as `contract()` builds
// one: frozen, with an own `Symbol.for('xaravel.class.fqcn')` and a `Symbol.toPrimitive` giving its brand.
import { expect } from "bun:test";
import { Invocation } from "../../src/Framework/MockObject/Runtime/Invocation";
import { InvokedCount } from "../../src/Framework/MockObject/Runtime/Rule/InvokedCount";
import { Assert, classString, phpLooseEquals, phpStrictEquals, phpVarExport, xaravelTest } from "../../src/index";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const ARRAYABLE = "Illuminate\\Contracts\\Support\\Arrayable";
const JSONABLE = "Illuminate\\Contracts\\Support\\Jsonable";

/** A stand-in contract token. */
function token(name: string): object {
  const brand = Symbol.for(name);
  return Object.freeze({ brand, [CLASS_FQCN]: name, [Symbol.toPrimitive]: (): symbol => brand });
}

/** The failure message of `fn`, its diff appended, or `(pass)`. */
function failure(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    const diff = (error as { getComparisonFailure?: () => { getDiff(): string } | null }).getComparisonFailure?.()?.getDiff() ?? "";
    return `${(error as Error).message}${diff}`;
  }
  return "(pass)";
}

xaravelTest(
  "XT-assert-101",
  "the grader reads a contract token as its FQCN class-string (AD-9.8, MAINT-2026-10-24 Item 2): classString gives a token's FQCN and any other value as it is; phpStrictEquals and phpLooseEquals compare a token as that string; assertSame and assertEquals pass a token against its FQCN, itself and, nested, in arrays, and fail a token against another with the two-strings message and diff; assertNotSame fails a token against its FQCN; the exporter and varExport print a token as the quoted string, alone and nested, and the canonicalizing comparator sorts nested tokens by that string's serialized form; an InvokedCount message names a token argument as the quoted string; a token's PHP type is unchanged, so assertIsString still fails it",
  () => {
    const Arrayable = token(ARRAYABLE);
    const Jsonable = token(JSONABLE);

    // classString: a token as its FQCN, any other value as it is.
    expect(classString(Arrayable)).toBe(ARRAYABLE);
    const plain = { [CLASS_FQCN]: ARRAYABLE };
    expect(classString(plain)).toBe(plain);
    for (const value of [null, 1, "x", [Arrayable]]) {
      expect(classString(value)).toBe(value);
    }

    // `===` and `==`.
    expect([phpStrictEquals(Arrayable, ARRAYABLE), phpStrictEquals(ARRAYABLE, Arrayable), phpStrictEquals(Arrayable, Arrayable), phpStrictEquals(Arrayable, Jsonable)]).toEqual([true, true, true, false]);
    expect([phpLooseEquals(Arrayable, ARRAYABLE), phpLooseEquals([Arrayable], [ARRAYABLE]), phpLooseEquals(Arrayable, Jsonable), phpLooseEquals(Arrayable, true), phpLooseEquals(Arrayable, 0)]).toEqual([true, true, false, true, false]);
    expect(phpStrictEquals({ k: [Arrayable] }, { k: [ARRAYABLE] })).toBe(true);

    // assertSame / assertEquals pass.
    for (const fn of [
      () => Assert.assertSame(Arrayable, ARRAYABLE),
      () => Assert.assertSame(ARRAYABLE, Arrayable),
      () => Assert.assertSame(Arrayable, Arrayable),
      () => Assert.assertSame([Arrayable], [ARRAYABLE]),
      () => Assert.assertEquals(Arrayable, ARRAYABLE),
      () => Assert.assertEquals({ k: [Arrayable] }, { k: [ARRAYABLE] }),
      () => Assert.assertEqualsCanonicalizing([Jsonable, Arrayable], [ARRAYABLE, JSONABLE]),
      () => Assert.assertNotSame(Arrayable, Jsonable),
      () => Assert.assertNotEquals(Arrayable, Jsonable),
    ]) {
      expect(failure(fn)).toBe("(pass)");
    }

    // A token against another: the two-strings message and diff, as for the two FQCN strings.
    const strings = `--- Expected\n'${ARRAYABLE}'\n+++ Actual\n'${JSONABLE}'\n--- Expected\n+++ Actual\n@@ @@\n-'${ARRAYABLE}'\n+'${JSONABLE}'\n`;
    expect(failure(() => Assert.assertSame(Arrayable, Jsonable))).toBe(`Failed asserting that two strings are identical.\n${strings}`);
    expect(failure(() => Assert.assertSame(Arrayable, Jsonable))).toBe(failure(() => Assert.assertSame(ARRAYABLE, JSONABLE)));
    expect(failure(() => Assert.assertSame(Arrayable, JSONABLE))).toBe(failure(() => Assert.assertSame(ARRAYABLE, JSONABLE)));
    expect(failure(() => Assert.assertEquals(Arrayable, Jsonable))).toBe(`Failed asserting that two strings are equal.\n${strings}`);
    expect(failure(() => Assert.assertEquals(Arrayable, Jsonable))).toBe(failure(() => Assert.assertEquals(ARRAYABLE, JSONABLE)));

    // Nested: the exporter prints each token as its quoted string.
    expect(failure(() => Assert.assertSame([Arrayable], [Jsonable]))).toBe(
      `Failed asserting that two arrays are identical.\n--- Expected\nArray &0 [\n    0 => '${ARRAYABLE}',\n]\n+++ Actual\nArray &0 [\n    0 => '${JSONABLE}',\n]\n--- Expected\n+++ Actual\n@@ @@\n Array &0 [\n-    0 => '${ARRAYABLE}',\n+    0 => '${JSONABLE}',\n ]\n`,
    );
    expect(failure(() => Assert.assertEquals([Arrayable], [Jsonable]))).toBe(
      `Failed asserting that two arrays are equal.\n--- Expected\nArray (\n    0 => '${ARRAYABLE}'\n)\n+++ Actual\nArray (\n    0 => '${JSONABLE}'\n)\n--- Expected\n+++ Actual\n@@ @@\n Array (\n-    0 => '${ARRAYABLE}'\n+    0 => '${JSONABLE}'\n )\n`,
    );
    expect(failure(() => Assert.assertEquals({ k: [Arrayable] }, { k: [Jsonable] }))).toBe(failure(() => Assert.assertEquals({ k: [ARRAYABLE] }, { k: [JSONABLE] })));

    // The failure text of a token against a scalar.
    expect(failure(() => Assert.assertSame(Arrayable, 1))).toBe(`Failed asserting that 1 is identical to '${ARRAYABLE}'.`);
    expect(failure(() => Assert.assertSame(1, Arrayable))).toBe(`Failed asserting that '${ARRAYABLE}' is identical to 1.`);

    // assertNotSame / assertNotEquals against the FQCN fail, as PHP's do for two equal strings.
    expect(failure(() => Assert.assertNotSame(Arrayable, ARRAYABLE))).toBe("Failed asserting that two strings are not identical.");
    expect(failure(() => Assert.assertNotSame(Arrayable, Arrayable))).toBe(failure(() => Assert.assertNotSame(ARRAYABLE, ARRAYABLE)));
    expect(failure(() => Assert.assertNotEquals(Arrayable, ARRAYABLE))).toBe(`Failed asserting that '${ARRAYABLE}' is not equal to '${ARRAYABLE}'.`);

    // Canonicalizing sorts nested arrays by their serialized form, so a nested token must serialize as its string:
    // `s:38:"…Arrayable"` sorts after `s:12:"Illuminate\B"`, so both sides reach the same order only then.
    expect(failure(() => Assert.assertEqualsCanonicalizing([[Arrayable], ["Illuminate\\B"]], [["Illuminate\\B"], [ARRAYABLE]]))).toBe("(pass)");
    expect(failure(() => Assert.assertEqualsCanonicalizing([[Jsonable], [Arrayable]], [[ARRAYABLE], [JSONABLE]]))).toBe("(pass)");
    expect(failure(() => Assert.assertEqualsCanonicalizing([{ k: Jsonable }, { k: Arrayable }], [{ k: ARRAYABLE }, { k: JSONABLE }]))).toBe("(pass)");
    expect(failure(() => Assert.assertEqualsCanonicalizing([[Jsonable], [Arrayable]], [[ARRAYABLE], [ARRAYABLE]]))).toBe(
      failure(() => Assert.assertEqualsCanonicalizing([[JSONABLE], [ARRAYABLE]], [[ARRAYABLE], [ARRAYABLE]])),
    );

    // The shortened exporter (an invocation's text): an InvokedCount message names a token argument as the string.
    const once = new InvokedCount(1);
    const call = new Invocation("XtService", "run", [Arrayable, [Jsonable]], {});
    once.invoked(call);
    expect(failure(() => once.invoked(call))).toBe(
      `XtService::run('${ARRAYABLE}', [...]) was not expected to be called more than once, actually called 2 times.`,
    );
    expect(failure(() => once.invoked(new Invocation("XtService", "run", [Arrayable], {})))).toBe(
      `XtService::run('${ARRAYABLE}') was not expected to be called more than once, actually called 3 times.`,
    );

    // varExport: the string, escaped as var_export escapes it, alone and nested.
    expect(phpVarExport(Arrayable)).toBe("'Illuminate\\\\Contracts\\\\Support\\\\Arrayable'");
    expect(phpVarExport(Arrayable)).toBe(phpVarExport(ARRAYABLE));
    expect(phpVarExport([Arrayable, { a: Jsonable }])).toBe(phpVarExport([ARRAYABLE, { a: JSONABLE }]));
    expect(phpVarExport([Arrayable])).toBe("array (\n  0 => 'Illuminate\\\\Contracts\\\\Support\\\\Arrayable',\n)");

    // The type assertions are unchanged (no `gettype` or `isScalar` change): a token is no string to assertIsString,
    // though its message prints the class-string.
    expect(failure(() => Assert.assertIsString(Arrayable))).toBe(`Failed asserting that '${ARRAYABLE}' is of type string.`);
  },
);
