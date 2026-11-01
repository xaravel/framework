// Executed PHP 8.5.11 evidence; unsupported names adapt only under DIV-9.15.
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as p from "@xaravel/runtime/php";
import { fqcn } from "@xaravel/runtime/registry";

const options = Object.assign((value: unknown = null, opts: unknown = []) => [value, opts], { [Symbol.for("xaravel.php.options")]: true });
function attempt(run: () => unknown): unknown {
  try { return run(); } catch (error) { return `${fqcn(error as object)}: ${(error as Error).message}`; }
}
function encode(value: unknown): string { return p.jsonEncode(value) as string; }
function array(entries: [p.PhpKeyInput, unknown][]): p.PhpArray<p.PhpKeyInput, unknown> { return new p.PhpArray(entries); }

xaravelTest("XT-runtime-152", "Unpacking rejects unsupported names in argument order and preserves options diagnostics against PHP 8.5.11", () => {
  const records = new Map(readFileSync(`${import.meta.dir}/php-callunpacked-order.probe.txt`, "utf8").trim().split("\n").map((line) => {
    const tab = line.indexOf("\t"); return [line.slice(0, tab), line.slice(tab + 1)];
  }));
  const checked = new Set<string>();
  const check = (label: string, actual: unknown): void => { Assert.assertSame(records.get(label), encode(actual), label); checked.add(label); };
  for (const [name, invoke] of [["callUnpacked", p.callUnpacked], ["call_user_func_array", p.call_user_func_array]] as const) {
    for (const [suffix, entries] of [["first", [["a", 1], [0, 2]]], ["second", [[0, 1], ["a", 2]]]] as [string, [p.PhpKeyInput, unknown][]][]) {
      const label = `${name}.unsupported-${suffix}`;
      check(label, "Error: Unknown named parameter $a");
      let caught: unknown = null;
      let called = false;
      try { invoke(() => { called = true; }, array(entries)); } catch (error) { caught = error; }
      Assert.assertTrue(caught instanceof globalThis.TypeError); // adapted:DIV-9.15
      Assert.assertSame(`${name}(): named argument unpacking is untranslatable for a target without an options form (ESC-14.5-3)`, (caught as Error).message); // adapted:DIV-9.15
      Assert.assertFalse(called);
    }
    check(`${name}.options`, invoke(options, array([[0, 1], ["limit", 2]])));
    check(`${name}.order`, attempt(() => invoke(options, array([["limit", 2], [0, 1]]))));
    check(`${name}.positional`, invoke((...values: unknown[]) => values, array([[8, "a"], [3, "b"]])));
  }
  check("callUnpacked.duplicate", attempt(() => p.callUnpacked(options, p.Generator.owned((function* () { yield p.keyed("limit", 1); yield p.keyed("limit", 2); })()))));
  check("callUnpacked.bad-key", attempt(() => p.callUnpacked(options, p.Generator.owned((function* () { yield p.keyed(null, 1); })()))));
  const log: string[] = [];
  let caught: unknown = null;
  try {
    p.callUnpacked(() => null, p.Generator.owned((function* () {
      try { log.push("start"); yield p.keyed("a", 1); log.push("later"); yield p.keyed(0, 2); }
      finally { log.push("finally"); }
    })()));
  } catch (error) { caught = error; }
  check("callUnpacked.lazy", ["Error: Unknown named parameter $a", log]);
  Assert.assertTrue(caught instanceof globalThis.TypeError); // adapted:DIV-9.15
  Assert.assertSame("callUnpacked(): named argument unpacking is untranslatable for a target without an options form (ESC-14.5-3)", (caught as Error).message); // adapted:DIV-9.15
  Assert.assertSame([...records.keys()].sort(), [...checked].sort(), "every PHP evidence label is checked");
});
