import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as p from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";
function scalar(name: string, type: string, input: unknown): unknown {
  const [value] = p.bindPhpArguments(name, [{ name: "value", type }], [input]);
  return p.phpReturn(name, type, value);
}
function typed(...args: unknown[]): unknown {
  const [array, key, fallback] = p.bindPhpArguments("typed", [{ name: "array", type: "array" }, { name: "key", type: "string|int|null" }, { name: "default", type: "?int", default: null }], args);
  return p.phpReturn("typed", "int", p.arrayEntries(array as object).find(([k]) => k === key)?.[1] ?? fallback);
}
function rejects(fn: () => unknown): void {
  let error: unknown = null;
  try { fn(); } catch (caught) { error = caught; }
  Assert.assertTrue(error instanceof p.TypeError);
}
const cases: Record<string, () => unknown> = {
  "int.big": () => String(scalar("bindInt", "int", "9007199254740993")),
  "int.numeric": () => scalar("bindInt", "int", "1e3"),
  "int.float": () => scalar("bindInt", "int", 1.5),
  "int.null": () => scalar("bindInt", "int", null),
  "float.int": () => scalar("bindFloat", "float", 1),
  "string.bool": () => scalar("bindString", "string", true),
  "bool.zero": () => scalar("bindBool", "bool", "0"),
  "union.float": () => scalar("bindUnion", "int|float", "1.5"),
  "union.int": () => scalar("bindUnion", "int|float", "12"),
  "union.exact": () => scalar("bindUnion", "int|float", p.float(1)),
  "unused.default": () => typed({ n: 1 }, "n", []),
  "key.invalid": () => typed({ n: 1 }, [], null),
  "array.invalid": () => typed(1, "n", null),
  nullable: () => typed({ n: 1 }, "n", null),
};
// Match the PHP parameter-only and return-only functions independently.
for (const [suffix, type, value, supplied] of [["Array", "array", [], []], ["String", "string", 12, 12], ["Bool", "bool", "0", 1], ["Int", "int", "12", "12"], ["Float", "float", 1, 1]] as const) {
  cases[`parameter.${suffix}`] = () => p.bindPhpArguments(`parameter${suffix}`, [{name: "value", type}], [value])[0];
  cases[`return.${suffix}`] = () => p.phpReturn(`return${suffix}`, type, value);
  cases[`return.error.${suffix}`] = () => p.phpReturn(`return${suffix}`, type, type === "array" ? 1 : []);
  cases[`parameter.null.${suffix}`] = () => p.bindPhpArguments(`parameter${suffix}`, [{name: "value", type}], [null])[0];
  cases[`unused.${suffix}`] = () => p.bindPhpArguments(`unused${suffix}`, [{name: "value", type}, {name: "default", type: `?${type}`, default: null}], [type === "array" ? [] : type === "string" ? "x" : type === "bool" ? true : type === "float" ? p.float(1) : 1, type === "array" ? 1 : []])[0];
  cases[`default.omitted.${suffix}`] = () => p.bindPhpArguments(`default${suffix}`, [{name: "value", type: `?${type}`, default: null}], [])[0];
  cases[`default.supplied.${suffix}`] = () => p.bindPhpArguments(`default${suffix}`, [{name: "value", type: `?${type}`, default: null}], [supplied])[0];
}
cases["count.required"] = () => p.bindPhpArguments("requiredCount", [{name: "value", type: "int"}], []);
cases["count.optional"] = () => p.bindPhpArguments("optionalCount", [{name: "value", type: "int"}, {name: "fallback", type: "?int", default: null}], []);

for (const [index, type] of ["string|int|null", "int|float", "float|bool", "array|string"].entries()) {
  for (const [label, value] of Object.entries({integer: 12, fraction: 1.5, numeric: "12", decimal: "1.5", exponent: "1e3", overflow: "9223372036854775808", text: "x", null: null, bool: true, array: []})) {
    cases[`matrix.${index}.${label}`] = () => p.bindPhpArguments(`matrix${index}`, [{name: "value", type}], [value])[0];
  }
}
for (const [label, args] of [["0", []], ["1", [1]], ["2", [null, 2]]] as const) {
  cases[`count.beforeRequired${label}`] = () => p.bindPhpArguments("beforeRequired", [{name: "first", type: "?int", default: null}, {name: "second", type: "int"}], args);
}
cases["copy.return"] = () => { const a = {nested: [1]}; const b = p.phpReturn("copyReturn", "array", a) as typeof a; b.nested.push(2); return [a,b]; };
cases["copy.parameter"] = () => { const a = {nested: [1]}; const [b] = p.bindPhpArguments("copyParameter", [{name: "value", type: "array"}], [a]) as [typeof a]; b.nested.push(2); return [a,b]; };
cases["class.bool"] = () => p.bindPhpArguments("parameterBool", [{name: "value", type: "bool"}], [p.Stringable])[0];
cases["class.int.error"] = () => p.bindPhpArguments("parameterInt", [{name: "value", type: "int"}], [p.Stringable])[0];
cases["class.return.error"] = () => p.phpReturn("returnInt", "int", p.Stringable);
for (const [index,type] of ["string|int|null", "int|float", "float|bool", "array|string"].entries()) {
  for (const [label,value] of Object.entries({numeric:"12",decimal:"1.5",overflow:"9223372036854775808",text:"x",null:null,array:[]})) cases[`returnMatrix.${index}.${label}`] = () => p.phpReturn(`returnMatrix${index}`,type,value);
}
for (const [suffix,type] of [["Int","int"],["Float","float"]] as const) {
  for (const [label,value] of Object.entries({fraction:"1.5",exponent:"1e3",large:"9007199254740993",overflow:"9223372036854775808",leading:"12tail",empty:""})) cases[`numeric.${suffix}.${label}`] = () => p.bindPhpArguments(`parameter${suffix}`,[{name:"value",type}],[value])[0];
}
function numberObservation(value: unknown): unknown {
  return [p.get_debug_type(value), typeof value === "number" && Number.isNaN(value) ? "NAN" : value === Infinity ? "INF" : value === -Infinity ? "-INF" : Object.is(value, -0) ? "-0" : value];
}
for (const [suffix, type] of [["Int", "int"], ["Float", "float"]] as const) {
  for (const [label, value] of Object.entries({ min: -9223372036854775808n, max: 9223372036854775807n, under: "-9223372036854775809", overflowExponent: "1e999", nan: NaN, inf: Infinity, negativeZero: -0 })) {
    cases[`boundary.parameter.${suffix}.${label}`] = () => numberObservation(p.bindPhpArguments(`parameter${suffix}`, [{name:"value",type}], [value])[0]);
    cases[`boundary.return.${suffix}.${label}`] = () => numberObservation(p.phpReturn(`return${suffix}`, type, value));
  }
}
for (const [suffix, type, fallback] of [["Int", "int", 7], ["Float", "float", p.float(1)], ["String", "string", "default"], ["Bool", "bool", true]] as const) {
  cases[`default.nonnull.${suffix}`] = () => p.bindPhpArguments(`nonnull${suffix}`, [{name:"value",type,default:fallback}], [])[0];
}
cases["default.mutable"] = () => {
  const parameters = [{name:"value",type:"array",default:{nested:[1]}}];
  const first = p.bindPhpArguments("mutableDefault",parameters,[])[0] as {nested:number[]}; first.nested.push(2);
  const second = p.bindPhpArguments("mutableDefault",parameters,[])[0]; return [first,second];
};
for (const [index,type] of ["bool|float", "string|array", "null|int|string"].entries()) {
  for (const [label,value] of Object.entries({fraction:1.5, numeric:"12",text:"x",nil:null,bool:true,array:[]})) {
    cases[`reordered.${index}.${label}`] = () => p.bindPhpArguments(`reordered${index}`,[{name:"value",type}],[value])[0];
  }
}
xaravelTest("XT-runtime-95", "Userland coercions reproduce every PHP evidence label", () => {
  const lines = readFileSync(`${import.meta.dir}/php-arr-builtins-arguments.probe.txt`, "utf8").trim().split("\n");
  Assert.assertSame(lines.length, Object.keys(cases).length);
  for (const line of lines) {
    const [label, expected] = line.split("\t");
    let result: unknown;
    try { const value = cases[label!]!(); result = [p.get_debug_type(value), value]; }
    catch (error) { result = `${(error as Error).name}: ${(error as Error).message}`; }
    Assert.assertSame(expected, p.jsonEncode(result, p.JSON_PRESERVE_ZERO_FRACTION), label);
  }
});
xaravelTest("XT-runtime-96", "Binding validates before body and normalizes defaults, class strings and float identity", () => {
  let called = false;
  for (const type of ["array", "bool", "int", "float", "string"]) {
    const method = (...args: unknown[]): unknown => {
      p.bindPhpArguments("Example::get", [{name: "value", type}, {name: "default", type: `?${type}`, default: null}], args);
      called = true; return 1;
    };
    const valid = type === "array" ? [] : type === "string" ? "x" : type === "bool" ? true : 1;
    rejects(() => method(valid, type === "array" ? 1 : []));
    Assert.assertFalse(called);
    Assert.assertSame(null, p.bindPhpArguments("example", [{name: "value", type: `?${type}`, default: null}], [])[0]);
  }
  class Named {}
  registerClass("XaravelFixture\\ArgumentNamed", Named);
  Assert.assertSame("XaravelFixture\\ArgumentNamed", p.phpReturn("example", "string", Named));
  Assert.assertSame("Stringable", p.phpReturn("example", "string", p.Stringable));
  class Stringable { toString(): string { return "value"; } }
  Assert.assertSame("value", scalar("example", "string", new Stringable()));
  Assert.assertSame(1, p.bindPhpArguments("example", [{name: "value", type: "int"}], [1n])[0]);
  Assert.assertSame(1, p.phpReturn("example", "int", 1n));
  const marked = p.float(1);
  Assert.assertTrue(p.phpReturn("example", "float", marked) === marked);
  Assert.assertTrue(p.isFloat(p.phpReturn("example", "float", 1)));
  Assert.assertSame(9007199254740993n, p.phpReturn("example", "int", 9007199254740993n));
  rejects(() => p.phpReturn("example", "int", []));
  const explicit = (args: unknown[]): unknown => p.bindPhpArguments("example", [{name: "value", type: "int"}, {name: "left", type: "?string", default: null}, {name: "right", type: "bool", default: false}], args);
  Assert.assertSame('[1,null,true]', p.jsonEncode(explicit([1, null, 1])));
  Assert.assertSame('[1,"2",false]', p.jsonEncode(explicit([1, 2, false])));
  Assert.assertSame("12", p.bindPhpArguments("example", [{name: "key", type: "string|int|null"}], ["12"])[0]);
});
