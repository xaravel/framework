import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as p from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";

class BinderAccess implements p.ArrayAccess {
  get [p.ArrayAccess.brand](): true { return true; }
  private values: Record<string, unknown> = { n: 1 };
  offsetExists(offset: unknown): boolean { return Object.hasOwn(this.values, String(offset)); }
  offsetGet(offset: unknown): unknown { return this.values[String(offset)] ?? null; }
  offsetSet(offset: unknown, value: unknown): void { this.values[String(offset)] = value; }
  offsetUnset(offset: unknown): void { delete this.values[String(offset)]; }
}
class BinderOther {}
registerClass("BinderAccess", BinderAccess);
registerClass("BinderOther", BinderOther);
function bind(value: unknown, type = "ArrayAccess|array", fn = "accessUnion"): unknown {
  return p.bindPhpArguments(fn, [{ name: "value", type }], [value])[0];
}
const cases: Record<string, () => unknown> = {};
for (const [label, value] of Object.entries({null: null, int: 1, float: 1.5, true: true, false: false, string: "x", closure: () => 1, object: new BinderOther()})) {
  cases[`invalid.${label}`] = () => bind(value);
  cases[`reordered.${label}`] = () => bind(value, "array|ArrayAccess", "reorderedUnion");
  cases[`nullable.${label}`] = () => bind(value, "ArrayAccess|array|null", "nullableUnion");
}
for (const [label, value] of Object.entries({arrayobject: new p.ArrayObject({n: 1}), custom: new BinderAccess()})) {
  cases[`handle.${label}`] = () => { const bound = bind(value) as p.ArrayAccess; bound.offsetSet("n", 2); return [bound === value, value.offsetGet("n")]; };
  cases[`default.${label}`] = () => p.bindPhpArguments("accessUnion", [{name: "value", type: "ArrayAccess|array"}, {name: "default", type: "?int", default: null}], [value])[0] === value;
}
cases["copy.list"] = () => { const value = [[1]]; const bound = bind(value) as number[][]; bound[0]!.push(2); return [value,bound]; };
cases["copy.map"] = () => { const value = {nested: [1]}; const bound = bind(value) as typeof value; bound.nested.push(2); return [value,bound]; };
cases["copy.mixed"] = () => { const value = new p.PhpArray<p.PhpKeyInput, unknown>([[2, [1]], ["name", 1]]); const bound = bind(value) as p.PhpArray; (bound.get(2) as number[]).push(2); return [value,bound]; };
cases.omitted = () => p.bindPhpArguments("nullableUnion", [{name: "value", type: "ArrayAccess|array|null", default: null}], [])[0];
cases["nullable.array"] = () => bind([1], "ArrayAccess|array|null", "nullableUnion");
cases["nullable.handle"] = () => { const value = new BinderAccess(); return bind(value, "ArrayAccess|array|null", "nullableUnion") === value; };
cases["unused.invalid"] = () => p.bindPhpArguments("accessUnion", [{name: "value", type: "ArrayAccess|array"}, {name: "default", type: "?int", default: null}], [new p.ArrayObject(), []]);
cases.timing = () => {
  let entered = false;
  const guarded = (): void => { p.bindPhpArguments("guardedUnion", [{name: "value", type: "ArrayAccess|array"}, {name: "default", type: "?int", default: null}], [new p.ArrayObject(), []]); entered = true; };
  try { guarded(); } catch (error) { Assert.assertTrue(error instanceof p.TypeError); }
  return entered;
};
xaravelTest("XT-runtime-97", "ArrayAccess union binding agrees with every executed PHP evidence row", () => {
  const lines = readFileSync(`${import.meta.dir}/php-binder-arrayaccess.probe.txt`, "utf8").trim().split("\n");
  Assert.assertSame(lines.length, Object.keys(cases).length);
  for (const line of lines) {
    const [label, expected] = line.split("\t");
    let result: unknown;
    try { const value = cases[label!]!(); result = [p.get_debug_type(value), value]; }
    catch (error) { result = `${(error as Error).name}: ${(error as Error).message}`; }
    Assert.assertSame(expected, p.jsonEncode(result, p.JSON_PRESERVE_ZERO_FRACTION), label);
  }
});
xaravelTest("XT-runtime-98", "ArrayAccess unions preserve handles and copy nested arrays in every runtime array form", () => {
  for (const type of ["ArrayAccess|array", "array|ArrayAccess", "ArrayAccess|array|null"]) {
    for (const object of [new p.ArrayObject(), new BinderAccess()]) {
      Assert.assertTrue(bind(object, type) === object);
      (bind(object, type) as p.ArrayAccess).offsetSet("n", 7);
      Assert.assertSame(7, object.offsetGet("n"));
    }
    for (const value of [new p.ArrayObject(), new BinderAccess(), [], {}, new p.PhpArray()]) {
      let entered = false;
      let error: unknown = null;
      try {
        p.bindPhpArguments("guardedUnion", [{name: "value", type}, {name: "default", type: "?int", default: null}], [value, []]);
        entered = true;
      } catch (caught) { error = caught; }
      Assert.assertTrue(error instanceof p.TypeError);
      Assert.assertFalse(entered);
      Assert.assertSame("guardedUnion(): Argument #2 ($default) must be of type ?int, array given", (error as Error).message);
    }
    const handle = new BinderAccess();
    for (const value of [[{nested: [1], handle}], {nested: [1], handle}, new p.PhpArray<p.PhpKeyInput, unknown>([[2, [1]], ["handle", handle]])]) {
      const bound = bind(value, type) as object;
      Assert.assertTrue(bound !== value);
      const copied = p.arrayEntries(bound);
      const original = p.arrayEntries(value);
      Assert.assertTrue(copied[0]![1] !== original[0]![1]);
      if (Array.isArray(value)) {
        const nested = (copied[0]![1] as {nested: number[]; handle: BinderAccess});
        nested.nested.push(2);
        Assert.assertSame(1, value[0]!.nested.length);
        Assert.assertTrue(nested.handle === handle);
      } else {
        (copied[0]![1] as number[]).push(2);
        Assert.assertSame(1, (original[0]![1] as number[]).length);
        Assert.assertTrue(copied[1]![1] === handle);
      }
    }
  }
});
