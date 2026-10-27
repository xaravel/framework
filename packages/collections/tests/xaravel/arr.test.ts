import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Story 14.6: the dot-key array helpers operate on all three PHP array forms and preserve value-copy boundaries.
import { Assert, xaravelTest } from "@xaravel/assert";
import { Arr, Collection, LazyCollection } from "@xaravel/collections";
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { ArrayIterator, JsonSerializable, stdClass, arrayEntries, Error as PhpError, keyed, PhpArray, Ref, valueCopy } from "@xaravel/runtime";

xaravelTest("XT-collections-12", "FR-23: Arr dot get/set/has/forget preserve PHP keys, insertion order, null semantics and array value copies; synchronous callable forms reject async callbacks and lazy traversal stops and cleans up correctly", async () => {
  const arrayable = new class implements Arrayable {
    get [Arrayable.brand](): true { return true; }
    toArray(): unknown[] { return []; }
  }();
  const jsonable = new class implements Jsonable {
    get [Jsonable.brand](): true { return true; }
    toJson(): string { return "[]"; }
  }();
  const serializable = new class implements JsonSerializable {
    get [JsonSerializable.brand](): true { return true; }
    jsonSerialize(): unknown { return []; }
  }();
  for (const item of [[], {}, new PhpArray(), arrayable, jsonable, serializable, new ArrayIterator([]), new Collection(), (function* () { yield 1; })()]) Assert.assertTrue(Arr.arrayable(item));
  for (const item of [null, "abc", 123, 12.34, true, new stdClass(), () => null]) Assert.assertFalse(Arr.arrayable(item));

  const forms = [
    new PhpArray<string, unknown>([["root", new PhpArray<string, unknown>([["leaf", new PhpArray([[0, "a"], [1, "b"]])], ["nullable", null]])]]),
    [{ leaf: ["a", "b"], nullable: null }],
    { root: { leaf: ["a", "b"], nullable: null } },
    new PhpArray<string | number, unknown>([["1", { leaf: ["a", "b"], nullable: null }], ["tail", "last"]]),
  ];
  for (const [index, input] of forms.entries()) {
    const prefix = index === 1 ? "0" : index === 3 ? "1" : "root";
    const snapshot = valueCopy(input);
    Assert.assertSame("b", Arr.get(input, prefix + ".leaf.1"));
    Assert.assertTrue(Arr.has(input, prefix + ".nullable"));
    Assert.assertNull(Arr.get(input, prefix + ".nullable", "default"));
    Assert.assertFalse(Arr.has(input, prefix + ".absent"));
    Assert.assertSame("default", Arr.get(input, prefix + ".absent", () => "default"));
    Assert.assertFalse(Arr.has(input, []));
    Assert.assertFalse(Arr.has(input, null));
    const read = new Ref(Arr.get(input, prefix + ".leaf"));
    Arr.set(read, "0", "changed");
    Assert.assertSame("a", Arr.get(input, prefix + ".leaf.0"));
    const ref = new Ref<unknown>(input);
    const replacement = ["new"];
    const returned = new Ref(Arr.set(ref, prefix + ".leaf.1", replacement));
    replacement[0] = "external";
    Assert.assertSame(["new"], Arr.get(ref.value, prefix + ".leaf.1"));
    Arr.set(returned, "1.0", "returned");
    Assert.assertSame(["new"], Arr.get(ref.value, prefix + ".leaf.1"));
    Arr.forget(ref, prefix + ".leaf.0");
    Assert.assertFalse(Arr.has(ref.value, prefix + ".leaf.0"));
    Assert.assertSame([1], arrayEntries(Arr.get(ref.value, prefix + ".leaf") as object).map(([key]) => key));
    Assert.assertSame(snapshot, input);
    Assert.assertTrue(Arr.hasAll(input, [prefix + ".leaf", prefix + ".nullable"]));
    Assert.assertTrue(Arr.hasAny(input, ["missing", prefix + ".nullable"]));
  }

  const literal = { "a.b": null, a: { b: "nested" } };
  Assert.assertNull(Arr.get(literal, "a.b", "fallback"));
  Assert.assertTrue(Arr.has(literal, "a.b"));
  const literalRef = new Ref<unknown>(literal);
  Arr.set(literalRef, "a.b", "written");
  Assert.assertNull(Arr.get(literalRef.value, "a.b"));
  Assert.assertSame("written", Arr.get(Arr.get(literalRef.value, "a"), "b"));
  Assert.assertSame("nested", Arr.get(literal.a, "b"));
  Arr.set(literalRef, "a.b", "nested");
  Arr.forget(literalRef, "a.b");
  Assert.assertSame({ a: { b: "nested" } }, literalRef.value);
  Assert.assertSame("nested", Arr.get(literalRef.value, "a.b"));
  Assert.assertSame(literal, Arr.get(literal, null));
  Assert.assertSame("fallback", Arr.get(null, null, "fallback"));

  const normalized = new Ref<unknown>(new PhpArray([["tail", "last"]]));
  Arr.set(normalized, "1", "one");
  Arr.set(normalized, "01", "leading zero");
  Arr.set(normalized, "1", "replacement");
  Assert.assertSame([["tail", "last"], [1, "replacement"], ["01", "leading zero"]], arrayEntries(normalized.value as object));
  Arr.forget(normalized, 1);
  Assert.assertSame([["tail", "last"], ["01", "leading zero"]], arrayEntries(normalized.value as object));

  const whole = new Ref<unknown>({ old: true });
  const newValue = { list: [1] };
  Arr.set(whole, null, newValue);
  newValue.list[0] = 2;
  Assert.assertSame({ list: [1] }, whole.value);
  Assert.assertSame("fallback", Arr.first([], { default: "fallback" }));
  Assert.assertSame("fallback", Arr.last([], { default: "fallback" }));
  Assert.assertSame(["A", "B"], Arr.map(["a", "b"], "strtoupper"));
  const predicate = new class { __invoke(value: unknown, _key: unknown): boolean { return typeof value === "string"; } }();
  Assert.assertTrue(Arr.every(["a", "b"], predicate));
  Assert.assertTrue(Arr.some([1, "b"], predicate));
  const target = new class { matches(value: unknown, _key: unknown): boolean { return typeof value === "string"; } }();
  Assert.assertTrue(Arr.every(["a", "b"], [target, "matches"]));
  Assert.assertSame("a", Arr.first([1, "a"], [target, "matches"]));
  Assert.assertSame("b", Arr.last(["a", 1, "b"], { callback: [target, "matches"] }));
  Assert.assertSame(["A-0", "B-1"], Arr.mapSpread([["A"], ["B"]], (value: string, key: number) => `${value}-${key}`));

  // Each predicate stops at its first decisive item without pre-materializing a Traversable.
  for (const decisive of [true, false]) {
    let closed = 0;
    const source = function* (): globalThis.Generator<unknown, void, unknown> {
      try { yield keyed("first", { decisive }); throw new Error("over-read"); }
      finally { closed++; }
    };
    const callback = (item: { decisive: boolean }, key: unknown) => {
      Assert.assertSame("first", key);
      return item.decisive;
    };
    const held = source();
    Assert.assertSame(decisive, decisive ? Arr.some(held, callback) : Arr.every(held, callback));
    Assert.assertSame(0, closed);
    held.return(undefined);
    Assert.assertSame(1, closed);
  }
  Assert.assertTrue(Arr.every((function* () { yield 1; yield 2; })(), (item: number, key: number) => item === key + 1));

  const mutable = new PhpArray<string, unknown>([["b", { rank: 2, nested: ["b"] }], ["a", { rank: 1, nested: ["a"] }]]);
  const before = valueCopy(mutable);
  const keyedRetriever = new class { rank(item: { rank: number }): number { return item.rank; } }();
  const rank = new class { __invoke(item: { rank: number }): number { return item.rank; } }();
  const outputs = [Arr.where(mutable, () => true), Arr.reject(mutable, () => false), Arr.whereNotNull(mutable), Arr.keyBy(mutable, "rank"), Arr.sort(mutable, [keyedRetriever, "rank"]), Arr.sortDesc(mutable, rank)];
  Assert.assertSame(["a", "b"], arrayEntries(outputs[4] as object).map(([key]) => key));
  Assert.assertSame(["b", "a"], arrayEntries(outputs[5] as object).map(([key]) => key));
  for (const output of outputs) {
    const first = arrayEntries(output as object)[0]![1] as { nested: string[] };
    first.nested[0] = "changed";
    Assert.assertSame(before, mutable);
  }

  const nestedInput = { a: { nested: ["a"] }, b: { nested: ["b"] } };
  const nestedSnapshot = valueCopy(nestedInput);
  const divided = Arr.divide(nestedInput);
  (divided[1][0] as { nested: string[] }).nested[0] = "changed";
  Assert.assertSame(nestedSnapshot, nestedInput);
  for (const limit of [1, -1, -1n]) {
    const taken = Arr.take(nestedInput, limit);
    (arrayEntries(taken as object)[0]![1] as { nested: string[] }).nested[0] = "changed";
    Assert.assertSame(nestedSnapshot, nestedInput);
  }
  Assert.assertSame({ b: { nested: ["b"] } }, Arr.take(nestedInput, -1n));
  for (const output of [Arr.onlyValues(nestedInput, [nestedInput.a]), Arr.exceptValues(nestedInput, [nestedInput.b])]) {
    (arrayEntries(output as object)[0]![1] as { nested: string[] }).nested[0] = "changed";
    Assert.assertSame(nestedSnapshot, nestedInput);
  }
  for (const decisive of [true, false]) {
    let calls = 0;
    const callback = new class {
      __invoke(item: { nested: string[] }, key: unknown): boolean {
        calls++;
        Assert.assertSame("a", key);
        item.nested[0] = "callback mutation";
        return decisive;
      }
    }();
    Assert.assertSame(decisive, decisive ? Arr.some(nestedInput, callback) : Arr.every(nestedInput, callback));
    Assert.assertSame(1, calls);
    Assert.assertSame(nestedSnapshot, nestedInput);
  }

  // A retained write result owns untouched branches as well as the changed path.
  for (const operation of ["set", "forget"]) {
    const original = { changed: { old: 1 }, untouched: { nested: ["original"] } };
    const ref = new Ref<unknown>(original);
    if (operation === "set") Arr.set(ref, "changed.new", 2);
    else Arr.forget(ref, "changed.old");
    original.untouched.nested[0] = "external mutation";
    Assert.assertSame(["original"], Arr.get(ref.value, "untouched.nested"));
  }

  let nativeCleanup = 0;
  const native = (function* () {
    try { yield keyed("first", { nested: ["first"] }); yield keyed("second", { nested: ["second"] }); }
    finally { nativeCleanup++; }
  })();
  Assert.assertSame({ nested: ["first"] }, Arr.first(native));
  Assert.assertSame(0, nativeCleanup);
  const resumed = native.next();
  Assert.assertFalse(resumed.done ?? false);
  Assert.assertSame({ nested: ["second"] }, resumed.done ? null : resumed.value.value);
  native.return(undefined);
  Assert.assertSame(1, nativeCleanup);
  const nativePredicate = (function* () { yield keyed("skip", 1); yield keyed("match", 2); yield keyed("tail", 3); })();
  const visited: unknown[] = [];
  Assert.assertSame(2, Arr.first(nativePredicate, (item: number, key: unknown) => { visited.push(key); return item === 2; }));
  Assert.assertSame(["skip", "match"], visited);
  const predicateResumed = nativePredicate.next();
  Assert.assertFalse(predicateResumed.done ?? false);
  Assert.assertSame(3, predicateResumed.done ? null : predicateResumed.value.value);
  nativePredicate.return(undefined);

  const sparse = new PhpArray([[4, "A"], [9, "B"]]);
  const sparseSnapshot = valueCopy(sparse);
  Assert.assertSame(["AB0"], Arr.mapSpread([sparse], (a: string, b: string, key: number) => a + b + String(key)));
  Assert.assertSame(sparseSnapshot, sparse);
  let unpackError: unknown = null;
  try { Arr.mapSpread([{ named: "A" }], () => null); } catch (error) { unpackError = error; }
  Assert.assertInstanceOf(PhpError, unpackError);
  Assert.assertSame("Cannot use positional argument after named argument during unpacking", (unpackError as PhpError).getMessage());

  let enumerations = 0;
  let cleanup = 0;
  const observed: unknown[] = [];
  const lazyInput = { nested: ["original"] };
  const lazy = LazyCollection.make(function* () {
    enumerations++;
    try { yield keyed("item", lazyInput); yield keyed("tail", { nested: ["tail"] }); }
    finally { cleanup++; }
  }).tapEach((item: { nested: string[] }, key: unknown) => {
    observed.push(key);
    item.nested[0] = "callback mutation";
  });
  Assert.assertSame(0, enumerations);
  Assert.assertSame([], observed);
  Assert.assertSame({ item: { nested: ["original"] }, tail: { nested: ["tail"] } }, lazy.all());
  Assert.assertSame(1, enumerations);
  Assert.assertSame(1, cleanup);
  Assert.assertSame(["item", "tail"], observed);
  Assert.assertSame({ nested: ["original"] }, lazy.first());
  Assert.assertSame(2, enumerations);
  Assert.assertSame(2, cleanup);
  Assert.assertSame(["item", "tail", "item"], observed);
  Assert.assertSame({ nested: ["original"] }, lazyInput);

  const callbackFailure = new Error("tapEach callback");
  let errorCleanup = 0;
  let observedFailure: unknown = null;
  try {
    LazyCollection.make(function* () {
      try { yield 1; yield 2; } finally { errorCleanup++; }
    }).tapEach(() => { throw callbackFailure; }).all();
  } catch (error) { observedFailure = error; }
  Assert.assertSame(callbackFailure, observedFailure);
  Assert.assertSame(1, errorCleanup);

  const dispatch: string[] = [];
  class DerivedArr extends Arr {
    static override get(array: unknown, key: unknown, fallback: unknown = null): unknown { dispatch.push("get"); return super.get(array, key, fallback); }
    static override set(array: Ref<unknown>, key: unknown, item: unknown): unknown { dispatch.push("set"); return super.set(array, key, item); }
    static override has(array: unknown, keys: unknown): boolean { dispatch.push("has"); return super.has(array, keys); }
    static override wrap(item: unknown): unknown { dispatch.push("wrap"); return super.wrap(item); }
  }
  Assert.assertSame({ a: 1 }, DerivedArr.add([], "a", 1));
  Assert.assertSame(["get", "set"], dispatch);
  dispatch.length = 0;
  Assert.assertTrue(DerivedArr.hasAll({ a: 1 }, ["a"]));
  Assert.assertTrue(DerivedArr.hasAny({ a: 1 }, ["a"]));
  Assert.assertSame(["has", "has"], dispatch);
  dispatch.length = 0;
  Assert.assertSame("active", DerivedArr.toCssClasses({ active: true }));
  Assert.assertSame(["wrap"], dispatch);

  await verifySyncCallbacks();
});

const REPO = resolve(import.meta.dir, "../../../..");

async function withFixture<T>(source: string, run: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-collections-sync-"));
  try {
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { types: ["bun"] }, include: ["fixture.ts"] }, null, 2) + "\n");
    writeFileSync(join(dir, "tsconfig.base.json"), readFileSync(join(REPO, "tsconfig.base.json")));
    mkdirSync(join(dir, "node_modules", "@xaravel"), { recursive: true });
    mkdirSync(join(dir, "node_modules", "@types"), { recursive: true });
    symlinkSync(join(REPO, "packages", "collections"), join(dir, "node_modules", "@xaravel", "collections"));
    symlinkSync(join(REPO, "packages", "runtime"), join(dir, "node_modules", "@xaravel", "runtime"));
    symlinkSync(join(REPO, "node_modules", "@types", "bun"), join(dir, "node_modules", "@types", "bun"));
    writeFileSync(join(dir, "fixture.ts"), source);
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The repository's pinned `tsc -b` in `dir`: its exit code, its output, and the `fixture.ts(<line>,…): error TS<n>` pairs. */
async function tscFixture(dir: string): Promise<{ code: number; output: string; errors: string[] }> {
  const proc = Bun.spawn([process.execPath, "--bun", join(REPO, "node_modules", "typescript", "bin", "tsc"), "-b", "--pretty", "false"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const output = `${stdout}${stderr}`;
  const errors = [...output.matchAll(/^fixture\.ts\((\d+),\d+\): error (TS\d+)/gm)].map((match) => `${match[1]}:${match[2]}`);
  return { code, output, errors };
}

/** oxlint with the repository's `.oxlintrc.json`, type-aware, from the repository root (lint.test.ts's form): `<line>:<rule>` per diagnostic. */
function oxlintFixture(dir: string): { code: number; output: string; diagnostics: string[] } {
  const proc = Bun.spawnSync([process.execPath, "--bun", "oxlint", "--type-aware", "-c", ".oxlintrc.json", "--format", "unix", join(dir, "fixture.ts")], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  const output = proc.stdout.toString() + proc.stderr.toString();
  const diagnostics: string[] = [];
  for (const line of output.split("\n")) {
    const match = /^.+?fixture\.ts:(\d+):\d+: .*\[(?:Error|Warning)\/[\w-]+\(([\w-]+)\)\]$/.exec(line);
    if (match !== null) {
      diagnostics.push(`${match[1]}:${match[2]}`);
    }
  }
  return { code: proc.exitCode ?? -1, output, diagnostics };
}

/** Compile and lint real temp projects, as the Collections XT probes do. */
async function verifySyncCallbacks(): Promise<void> {
  const members = ["first", "last", "map", "mapWithKeys", "mapSpread", "partition", "where", "reject", "every", "some", "sole", "keyBy", "sort", "sortDesc"];
  const lines = [
    'import { Arr, LazyCollection } from "@xaravel/collections";',
    ...members.flatMap((member) => [
      `Arr.${member}([1], async (value: number) => value);`,
      `Arr.${member}([1], { __invoke: async (value: number) => value });`,
    ]),
    'LazyCollection.make([1]).tapEach(async (value: number) => value);',
    'LazyCollection.make([1]).tapEach({ __invoke: async (value: number) => value });',
  ];
  const expected = lines.slice(1).map((_, index) => index + 2);
  await withFixture(lines.join("\n") + "\n", async (dir) => {
    const tsc = await tscFixture(dir);
    Assert.assertNotEquals(0, tsc.code, tsc.output);
    Assert.assertSame(expected, tsc.errors.map((entry) => Number(entry.split(":")[0])), tsc.output);
    const lint = oxlintFixture(dir);
    Assert.assertNotEquals(0, lint.code, lint.output);
    Assert.assertSame(expected.map((line) => `${line}:no-misused-promises`), lint.diagnostics, lint.output);
  });
  const valid = lines.join("\n").replaceAll("async ", "") + "\n" + [
    'const target = { apply(value: number): number { return value; } };',
    'Arr.sort([1], [target, "apply"]);',
    'Arr.sortDesc([1], [target, "apply"]);',
    'Arr.every([1], [target, "apply"]);',
    'Arr.mapSpread([[1]], [target, "apply"]);',
  ].join("\n");
  await withFixture(valid, async (dir) => {
    const tsc = await tscFixture(dir);
    Assert.assertSame(0, tsc.code, tsc.output);
    const lint = oxlintFixture(dir);
    Assert.assertSame(0, lint.code, lint.output);
  });
}
