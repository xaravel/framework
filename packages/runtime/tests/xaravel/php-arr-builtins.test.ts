// PHP 8.5.11 evidence: php -d error_reporting=0 php-arr-builtins.probe.php. Every recorded label executes below.
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as p from "@xaravel/runtime/php";
import * as root from "@xaravel/runtime";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";
import { fqcn, registerClass } from "@xaravel/runtime/registry";

const cases: Record<string, () => unknown> = {
  lists: () => [p.array_is_list([]), p.array_is_list(["a", "b"]), p.array_is_list(new p.PhpArray<p.PhpKeyInput, unknown>([[1, "b"], [0, "a"]])), p.array_is_list({ x: 1 })],
  "list-error": () => p.array_is_list(null),
  push: () => { const a = new p.PhpArray<p.PhpKeyInput, unknown>([[5, "a"], ["x", "b"]]); a.delete(5); const ref = new p.Ref<unknown>(a); return [p.array_push(ref, "c", null), ref.value]; },
  "push-zero": () => { const ref = new p.Ref<unknown>([]); return [p.array_push(ref), ref.value]; },
  "push-negative": () => { const ref = new p.Ref<unknown>(new p.PhpArray<p.PhpKeyInput, unknown>([[-5, "a"]])); p.array_push(ref, "b"); return ref.value; },
  "push-overflow": () => p.array_push(new p.Ref(new p.PhpArray<p.PhpKeyInput, unknown>([[9223372036854775807n, "a"]])), "b"),
  "push-partial-overflow": () => {
    const ref = new p.Ref<unknown>(new p.PhpArray<p.PhpKeyInput, unknown>([[9223372036854775806n, "a"]]));
    try { p.array_push(ref, "b", "c"); } catch (error) { return [`${fqcn(error as object)}: ${(error as Error).message}`, ref.value]; }
    return null;
  },
  "query-separator-throws": () => {
    class Separator { toString(): string { throw new p.RuntimeException("separator conversion"); } }
    return p.http_build_query([], "", new Separator());
  },
  "push-error": () => p.array_push(new p.Ref<unknown>(1), 2),
  query: () => p.http_build_query(new p.PhpArray<p.PhpKeyInput, unknown>([[2, "a b"], ["s", "~!*() /é"], ["n", null], ["t", true], ["f", false], ["nested", new p.PhpArray<p.PhpKeyInput, unknown>([["a", "x y"], [3, "z"]])], ["empty", []]]), "p_", "&", p.PHP_QUERY_RFC3986),
  query1738: () => p.http_build_query({ s: "~!*() /é", x: 1 }, "", ";", p.PHP_QUERY_RFC1738),
  "query-invalid-encoding": () => p.http_build_query({ x: "~ a" }, "", null, 3),
  "query-coercion": () => p.http_build_query(new p.PhpArray<p.PhpKeyInput, unknown>([[3, false]]), 23, 42, "2"),
  "query-object": () => { const o = new p.stdClass(); o.x = 1; o["\0*\0hidden"] = 2; o["\0Example\0secret"] = 3; const nested = new p.stdClass(); nested.yes = true; o.nested = nested; return p.http_build_query(o); },
  "query-recursive": () => { const o = new p.stdClass(); o.x = 1; o.self = o; return p.http_build_query({ o }); },
  "query-repeated": () => { const o = new p.stdClass(); o.x = 1; return p.http_build_query({ a: o, b: o }); },
  "query-error": () => p.http_build_query(null),
  "query-separator-error": () => p.http_build_query([], "", []),
  "shuffle-empty": () => new p.Randomizer().shuffleArray([]),
  "shuffle-single": () => new p.Randomizer().shuffleArray({ x: "a" }),
  "shuffle-error": () => new p.Randomizer().shuffleArray(1),
  metadata: () => Object.fromEntries(["array_is_list", "array_push", "http_build_query"].map((name) => { const f = PHP_FUNCTIONS[name]!; return [name, [f.required, f.total, f.variadic, f.byRef]]; })),
};
cases["query-class-string"] = () => p.http_build_query({token: p.Stringable, nested: [p.Stringable]});
cases["query-class-error"] = () => p.http_build_query(p.Stringable);
cases["query-options-all"] = () => p.http_build_query(new p.PhpArray<p.PhpKeyInput, unknown>([[3,"a b"],["nested",new p.PhpArray([[4,"c d"]])]]), {numericPrefix: "p_",argSeparator: ";",encodingType: p.PHP_QUERY_RFC3986});
cases["query-options-empty"] = () => p.http_build_query({s:"a b"}, {});
cases["query-visibility"] = () => {
  class VisibilityBase { yes = "visible"; hidden = "hidden"; secret = "secret"; }
  class Visibility extends VisibilityBase { child = "public child"; childSecret = "private child"; }
  Object.defineProperty(VisibilityBase, Symbol.for("xaravel.php.properties"), {value: [{name:"yes",visibility:"public"},{name:"hidden",visibility:"protected"},{name:"secret",visibility:"private"}]});
  Object.defineProperty(Visibility, Symbol.for("xaravel.php.properties"), {value: [{name:"child",visibility:"public"},{name:"childSecret",visibility:"private"}]});
  registerClass("XaravelFixture\\QueryVisibilityBase", VisibilityBase);
  registerClass("XaravelFixture\\QueryVisibility", Visibility);
  return p.http_build_query(new Visibility());
};
cases["list-forms"] = () => { const sparse = new p.PhpArray([[0,"a"],[2,"b"]]); const deleted = ["a","b"]; Reflect.deleteProperty(deleted, "1"); return [p.array_is_list(sparse),p.array_is_list(deleted),p.array_is_list(Object.assign(Object.create(null) as object, {0:"a",1:"b"})),p.array_is_list({0:"a",1:"b"})]; };
cases["query-constructor"] = () => { class QueryConstructor {} registerClass("QueryConstructor",QueryConstructor); return p.http_build_query({class:QueryConstructor}); };
cases["query-options-null"] = () => p.http_build_query({s:"a b"},{numericPrefix:null,argSeparator:null,encodingType:null});
cases["query-options-invalid"] = () => p.http_build_query({s:"a b"},{encodingType:[]});
cases["query-options-throws"] = () => { class Separator { toString(): string {throw new p.RuntimeException("options conversion");} } return p.http_build_query([],{argSeparator:new Separator()}); };
function capture(fn: () => unknown): string {
  let result: unknown;
  try { result = fn(); } catch (error) { const e = error as Error; result = `${fqcn(error as object)}: ${e.message}`; }
  return p.jsonEncode(result, p.JSON_UNESCAPED_UNICODE | p.JSON_UNESCAPED_SLASHES | p.JSON_PRESERVE_ZERO_FRACTION) as string;
}
xaravelTest("XT-runtime-91", "Arr builtin matrix matches every executed PHP 8.5.11 probe label", () => {
  const lines = readFileSync(`${import.meta.dir}/php-arr-builtins.probe.txt`, "utf8").trim().split("\n");
  Assert.assertSame(lines.length, Object.keys(cases).length);
  for (const line of lines) { const tab = line.indexOf("\t"); const label = line.slice(0, tab); Assert.assertSame(line.slice(tab + 1), capture(cases[label]!), label); }
});
xaravelTest("XT-runtime-92", "Builtin exports, named callbacks, value separation and secure shuffle preserve PHP contracts", () => {
  for (const name of ["array_is_list", "array_push", "http_build_query", "PHP_QUERY_RFC1738", "PHP_QUERY_RFC3986"] as const) Assert.assertSame(p[name], root[name]);
  Assert.assertTrue(p.phpFunction("ARRAY_IS_LIST")!([]) as boolean);
  Assert.assertSame("x=a%20b", p.phpFunction("http_build_query")!({ x: "a b" }, "", null, 2));
  const original = { a: [1] }; const ref = new p.Ref<unknown>(original); const added = [2];
  p.array_push(ref, added); added.push(3); Assert.assertSame('{"a":[1]}', p.jsonEncode(original));
  Assert.assertSame('{"a":[1],"0":[2]}', p.jsonEncode(ref.value));
  const called = new p.Ref<unknown>([]); Assert.assertSame(2, p.phpFunction("array_push")!(called, "a", "b")); Assert.assertSame(["a", "b"], called.value);
  Assert.assertSame("x=a%20b", p.http_build_query({ x: "a b" }, { encodingType: p.PHP_QUERY_RFC3986 }));
  // Force an out-of-range draw for bound 3, then select swaps 2->0 and 1->1.
  // Restoring in finally isolates the controlled secure-source test from every other test.
  const descriptor = Object.getOwnPropertyDescriptor(crypto, "getRandomValues");
  const draws = [0xffffffff, 0, 1];
  let drawCount = 0;
  try {
    Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: (words: Uint32Array): Uint32Array => {
      Assert.assertTrue(drawCount < draws.length, "shuffle requests only the expected draws");
      words[0] = draws[drawCount++]!;
      return words;
    } });
    Assert.assertSame(["c", "b", "a"], new p.Randomizer().shuffleArray({a: "a", b: "b", c: "c"}));
    Assert.assertSame(3, drawCount, "secure rejection sampling discards the first draw");
  } finally {
    if (descriptor) Object.defineProperty(crypto, "getRandomValues", descriptor);
    else Reflect.deleteProperty(crypto, "getRandomValues");
  }
  const options = Object.assign(Object.create(null) as p.HttpBuildQueryOptions, {numericPrefix:"p_",argSeparator:";",encodingType:p.PHP_QUERY_RFC3986});
  Assert.assertSame("p_3=a%20b", p.http_build_query(new p.PhpArray([[3,"a b"]]), options));
  const zeroRef = new p.Ref<unknown>([1]); const zeroOriginal = zeroRef.value;
  Assert.assertSame(1, p.array_push(zeroRef)); Assert.assertTrue(zeroRef.value === zeroOriginal);
  Assert.assertTrue(p.array_is_list(new p.PhpArray<p.PhpKeyInput, unknown>([[0n,"a"],["1","b"]])));
  // Native JS holes are undefined values, normalized to null at this boundary; PHP key gaps use PhpArray above.
  const nativeSparse = ["a", "gap", "b"]; Reflect.deleteProperty(nativeSparse, "1");
  Assert.assertTrue(p.array_is_list(nativeSparse));
  const values = { a: [1], b: "x", c: "x", d: 2 };
  const before = p.jsonEncode(values);
  for (let i = 0; i < 20; i++) {
    const shuffled = new p.Randomizer().shuffleArray(values);
    Assert.assertSame(4, shuffled.length); Assert.assertSame(2, shuffled.filter((v) => v === "x").length);
    Assert.assertTrue(shuffled.includes(2)); const nested = shuffled.find(Array.isArray) as number[]; Assert.assertSame([1], nested); nested.push(9);
    Assert.assertSame(before, p.jsonEncode(values));
  }
});
