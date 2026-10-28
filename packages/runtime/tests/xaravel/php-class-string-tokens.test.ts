import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as p from "@xaravel/runtime/php";
import { fqcn, registerClass } from "@xaravel/runtime/registry";
import { phpInterface } from "../../src/php/phpInterface";
import { phpType } from "../../src/php/phpType";

const token = p.Stringable;
const namedToken = phpInterface("TokenProbe\\Named");
const parameters = [{ name: "value", type: "string", default: token }];
const bindString = (value: unknown): unknown => p.bindPhpArguments("tokenString", parameters, [value])[0];
const cases: Record<string, () => unknown> = {
  direct: () => [p.gettype(token), p.getDebugType(token), p.is_string(token), p.is_array(token), token],
  namespaced: () => [p.gettype(namedToken), p.toPhpString(namedToken), bindString(namedToken), p.phpReturn("tokenReturn", "string", namedToken), p.valueCopy(namedToken)],
  distinct: () => [p.looseEquals(token, namedToken), p.spaceship(token, namedToken), p.spaceship(namedToken, token), p.identical([token], [namedToken]), p.looseEquals(token, "ArrayAccess"), p.spaceship("ArrayAccess", token)],
  selected: () => bindString(p.valueCopy({ token }).token),
  parameter: () => bindString(token),
  return: () => p.phpReturn("tokenReturn", "string", token),
  "default.string": () => p.bindPhpArguments("tokenString", parameters, [])[0],
  nested: () => { const a = { nested: [token] }; const b = p.valueCopy(a) as { nested: unknown[] }; b.nested.push("changed"); return [a, b]; },
  "default.array": () => {
    const defaults = [{ name: "value", type: "array", default: { nested: [token] } }];
    const a = p.bindPhpArguments("tokenDefault", defaults, [])[0] as { nested: unknown[] };
    a.nested.push("changed");
    return [a, p.bindPhpArguments("tokenDefault", defaults, [])[0]];
  },
  "invalid.parameter": () => p.bindPhpArguments("tokenArray", [{ name: "value", type: "array" }], [token]),
  "invalid.return": () => p.phpReturn("tokenReturnArray", "array", token),
  regression: () => [[], new p.stdClass(), null, 1, true, "text"].map(p.gettype),
  casts: () => [p.toInt(token), p.toFloat(token), p.toPhpString(token), p.toBool(token)],
  comparison: () => [p.looseEquals(token, "Stringable"), p.spaceship(token, "Stringable"), p.spaceship(token, 0), p.spaceship(0, token)],
  identical: () => [p.identical(token, "Stringable"), p.identical([token], ["Stringable"])],
  "exception.message": () => new p.Exception(token as unknown as string).getMessage(),
  "exception.code": () => new p.Exception("", token as unknown as number),
  arithmetic: () => p.plus(token, 1),
  "numeric.builtin": () => p.floor(token),
  flip: () => p.array_flip([token]),
  "range.start": () => p.range(token, "U"),
  "range.end": () => p.range("Q", token),
};
xaravelTest("XT-runtime-99", "Contract class strings match PHP classification and typed boundaries", () => {
  const lines = readFileSync(`${import.meta.dir}/php-class-string-tokens.probe.txt`, "utf8").trim().split("\n");
  Assert.assertSame(lines.length, Object.keys(cases).length);
  for (const line of lines) {
    const [label, expected] = line.split("\t");
    let result: unknown;
    try { result = cases[label!]!(); }
    catch (error) { result = `${(error as Error).name}: ${(error as Error).message}`; }
    Assert.assertSame(expected, p.jsonEncode(result), label);
  }
  Assert.assertSame("string", phpType(token));
});
xaravelTest("XT-runtime-100", "All PHP array forms preserve token identity through copying and typed boundaries", () => {
  const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, { token });
  const branded = { [Symbol.for("xaravel.php.array")]: true, *[Symbol.iterator]() { yield ["token", token] as const; } };
  for (const source of [[token], { token }, new p.PhpArray([["token", token]]), nullPrototype, branded]) {
    const defaults = [{ name: "value", type: "array", default: { container: source } }];
    const first = p.bindPhpArguments("tokenDefault", defaults, [])[0] as { container: object };
    const second = p.bindPhpArguments("tokenDefault", defaults, [])[0] as { container: object };
    Assert.assertTrue(first !== second);
    Assert.assertTrue(first.container !== second.container);
    Assert.assertTrue(p.arrayEntries(first.container)[0]![1] === token);
    const nested = { container: source };
    const copied = p.valueCopy(nested);
    Assert.assertTrue(copied !== nested);
    Assert.assertTrue(copied.container !== source);
    const selected = p.arrayEntries(copied.container)[0]![1];
    Assert.assertTrue(selected === token);
    Assert.assertTrue(bindString(selected) === "Stringable");
    Assert.assertSame("string", typeof bindString(selected));
    Assert.assertTrue(p.phpReturn("tokenReturn", "string", selected) === "Stringable");
    Assert.assertSame("string", typeof p.phpReturn("tokenReturn", "string", selected));
    for (const copy of [p.bindPhpArguments("tokenArray", [{ name: "value", type: "array" }], [source])[0], p.phpReturn("tokenReturnArray", "array", source)]) {
      Assert.assertTrue(copy !== source);
      Assert.assertTrue(p.arrayEntries(copy as object)[0]![1] === token);
    }
  }
  Assert.assertTrue(p.valueCopy(token) === token);
  const defaultString = p.bindPhpArguments("tokenString", parameters, [])[0];
  Assert.assertTrue(defaultString === "Stringable");
  Assert.assertSame("string", typeof defaultString);
  class Named {}
  registerClass("XaravelFixture\\ClassStringTokenRegression", Named);
  const instance = new Named();
  Assert.assertTrue(p.valueCopy(instance) === instance);
  Assert.assertTrue(p.valueCopy(Named) === Named);
  Assert.assertSame("object", phpType(Named));
  Assert.assertSame(fqcn(Named), p.phpReturn("tokenReturn", "string", Named));
});
