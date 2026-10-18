// Xaravel Tests for Story 4.1 (the PHP comparison core; FR-116, AD-15, AD-2).
// These run under plain `bun test`, like Story 4.2's (`xaravelTest` is not used to test the grader itself).
//
// XT-assert-1 reads only signed Oracle fixtures: the truth table is never
// written by hand or evaluated locally (AD-15). A missing, unsigned or errored
// fixture fails the test; it is never skipped.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as api from "../../src/index";
import { phpLooseEquals, phpStrictEquals } from "../../src/index";
import { BrandedArray, matrixMismatches, PHP_ARRAY, PHP_PROPS, readRequests, readSignedFixture } from "./oracle-values";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUESTS = "conformance/oracle-requests/4.1.jsonl";
const FIXTURES = "conformance/fixtures/assert";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";

test("XT-assert-1: phpLooseEquals and phpStrictEquals match the signed PHP 8.5 Oracle truth table over every ordered pair", () => {
  const requests = readRequests(join(root, REQUESTS));
  expect(requests).toHaveLength(4);
  const publicKey = readFileSync(join(root, PUBLIC_KEY), "utf8");
  const problems: string[] = [];
  let pairs = 0;
  for (const request of requests) {
    const path = `${FIXTURES}/${request.sha256}.json`;
    try {
      const output = readSignedFixture(join(root, path), request.sha256, publicKey);
      const result = matrixMismatches(path, request, output, { loose: phpLooseEquals, strict: phpStrictEquals });
      pairs += result.pairs;
      problems.push(...result.mismatches);
    } catch (error) {
      problems.push(error instanceof Error ? error.message.replace(`${root}/`, "") : String(error));
    }
  }
  expect(problems).toEqual([]);
  expect(pairs).toBeGreaterThan(0);
});

test("XT-assert-2: a branded PhpArray and an object exposing xaravel.php.props compare as the PHP array or object they stand for", () => {
  // Branded map vs list, plain object and another branded map.
  const list = ["b", "a"];
  const ordered = new BrandedArray([[0, "b"], [1, "a"]]);
  const reversed = new BrandedArray([[1, "a"], [0, "b"]]);
  expect(PHP_ARRAY in ordered).toBe(true);
  expect(phpStrictEquals(ordered, list)).toBe(true);
  expect(phpLooseEquals(reversed, list)).toBe(true);
  expect(phpStrictEquals(reversed, list)).toBe(false);
  expect(phpLooseEquals(reversed, ordered)).toBe(true);
  expect(phpStrictEquals(reversed, ordered)).toBe(false);

  const map = { a: 1, b: 2 };
  const brandedMap = new BrandedArray([["b", 2], ["a", 1]]);
  expect(phpLooseEquals(brandedMap, map)).toBe(true);
  expect(phpStrictEquals(brandedMap, map)).toBe(false);
  expect(phpStrictEquals(new BrandedArray([["a", 1], ["b", 2]]), map)).toBe(true);
  expect(phpLooseEquals(new BrandedArray([["a", "1"], ["b", 2]]), map)).toBe(true);
  expect(phpStrictEquals(new BrandedArray([["a", "1"], ["b", 2]]), map)).toBe(false);
  expect(phpLooseEquals(new BrandedArray([["a", 1]]), map)).toBe(false);
  expect(phpLooseEquals(new BrandedArray([]), [])).toBe(true);
  expect(phpLooseEquals(new BrandedArray([]), null)).toBe(true);
  expect(phpLooseEquals(new BrandedArray([[0, 1]]), 1)).toBe(false);

  // Objects behind the props protocol: == by class and props, === by identity.
  class Point {
    constructor(private readonly props: Record<string, unknown>) {}
    [PHP_PROPS](): unknown {
      return this.props;
    }
  }
  class Other {
    constructor(private readonly props: Record<string, unknown>) {}
    [PHP_PROPS](): unknown {
      return this.props;
    }
  }
  const p = new Point({ x: 1, y: 2 });
  expect(phpLooseEquals(p, new Point({ y: 2, x: 1 }))).toBe(true);
  expect(phpLooseEquals(p, new Point({ x: "1", y: 2 }))).toBe(true);
  expect(phpLooseEquals(p, new Point({ x: 2, y: 2 }))).toBe(false);
  expect(phpStrictEquals(p, new Point({ x: 1, y: 2 }))).toBe(false);
  expect(phpStrictEquals(p, p)).toBe(true);
  expect(phpLooseEquals(p, new Other({ x: 1, y: 2 }))).toBe(false);
  // An object is not the array of its props, and a props object is not a plain-object array.
  expect(phpLooseEquals(p, { x: 1, y: 2 })).toBe(false);
  expect(phpLooseEquals(p, new BrandedArray([["x", 1], ["y", 2]]))).toBe(false);
  expect(phpLooseEquals(p, "Point")).toBe(false);
  expect(phpLooseEquals(p, true)).toBe(true);
  expect(phpLooseEquals(p, null)).toBe(false);
  // PHP casts an object compared with a number to 1 (with a warning).
  expect(phpLooseEquals(p, 1)).toBe(true);
  expect(phpLooseEquals(1, p)).toBe(true);
  expect(phpLooseEquals(p, 2)).toBe(false);
  expect(phpStrictEquals(p, 1)).toBe(false);
  // Props given as a branded map, nested inside lists.
  const q = new Point(new BrandedArray([["x", 1], ["y", 2]]) as unknown as Record<string, unknown>);
  expect(phpLooseEquals([p], [q])).toBe(true);
  expect(phpStrictEquals([p], [q])).toBe(false);
  expect(phpStrictEquals([p], [p])).toBe(true);

  // Recursion throws PHP's error; undefined (not a PHP value) equals only undefined.
  const loop: unknown[] = [];
  loop.push(loop);
  const other: unknown[] = [];
  other.push(other);
  expect(() => phpLooseEquals(loop, other)).toThrow("Nesting level too deep - recursive dependency?");
  expect(() => phpStrictEquals(loop, other)).toThrow("Nesting level too deep - recursive dependency?");
  expect(phpLooseEquals(undefined, undefined)).toBe(true);
  expect(phpLooseEquals(undefined, null)).toBe(false);
  expect(phpLooseEquals(undefined, false)).toBe(false);
  expect(phpStrictEquals(undefined, null)).toBe(false);
  // A symbol (not a PHP value either) equals only itself, under both operators.
  const symbol = Symbol("s");
  expect(phpLooseEquals(symbol, symbol)).toBe(true);
  expect(phpStrictEquals(symbol, symbol)).toBe(true);
  expect(phpLooseEquals(symbol, Symbol("s"))).toBe(false);
  expect(phpLooseEquals(symbol, true)).toBe(false);

  // A bigint is a PHP int.
  expect(phpStrictEquals(1n, 1)).toBe(true);
  expect(phpLooseEquals(1n, "1")).toBe(true);
  expect(phpLooseEquals(0n, false)).toBe(true);
  expect(phpLooseEquals(2n ** 60n, "1152921504606846976")).toBe(true);
  expect(phpStrictEquals(2n ** 60n, "1152921504606846976")).toBe(false);

  // An ordinary class instance without the props protocol: its own enumerable keys are its props.
  class A {
    constructor(readonly value: unknown) {}
  }
  expect(phpLooseEquals(new A(1), new A("1"))).toBe(true);
  expect(phpLooseEquals(new A(1), new A(2))).toBe(false);
  expect(phpStrictEquals(new A(1), new A(1))).toBe(false);
  // A JS built-in with internal state has no props form: it equals only itself.
  expect(phpLooseEquals(new Date(0), new Date(1))).toBe(false);
  expect(phpLooseEquals(new Date(0), new Date(0))).toBe(false);
  const date = new Date(0);
  expect(phpLooseEquals(date, date)).toBe(true);
  expect(phpLooseEquals(new Map(), new Map())).toBe(false);
  expect(phpLooseEquals(new Map([[1, 2]]), new Map())).toBe(false);
  expect(phpLooseEquals(new Set([1]), new Set([2]))).toBe(false);
  expect(phpLooseEquals(/a/, /b/)).toBe(false);
  expect(phpLooseEquals(new Uint8Array([1]), new Uint8Array([2]))).toBe(false);
  expect(phpLooseEquals(new Error("a"), new Error("b"))).toBe(false);
  const builtIns: (() => object)[] = [
    () => new WeakMap(),
    () => new Headers(),
    () => new ArrayBuffer(1),
  ];
  for (const make of builtIns) {
    const one = make();
    expect(phpLooseEquals(one, make())).toBe(false);
    expect(phpLooseEquals(one, one)).toBe(true);
  }
  const builtInPairs: (readonly [object, object])[] = [
    [new Number(1), new Number(2)],
    [Promise.resolve(1), Promise.resolve(2)],
    [new URL("http://a/"), new URL("http://b/")],
  ];
  for (const [one, two] of builtInPairs) {
    expect(phpLooseEquals(one, two)).toBe(false);
    expect(phpLooseEquals(one, one)).toBe(true);
  }
  // A props-less object that refers to itself hits PHP's recursion guard.
  class Node {
    self: unknown = null;
  }
  const selfA = new Node();
  selfA.self = selfA;
  const selfB = new Node();
  selfB.self = selfB;
  expect(() => phpLooseEquals(selfA, selfB)).toThrow("Nesting level too deep - recursive dependency?");
  // A props method must return a PHP array.
  class BadProps {
    constructor(private readonly props: unknown) {}
    [PHP_PROPS](): unknown {
      return this.props;
    }
  }
  expect(() => phpLooseEquals(new BadProps(1), new BadProps(1))).toThrow(TypeError);
  expect(() => phpLooseEquals(new BadProps(new Map([["x", 1]])), new BadProps(new Map([["x", 2]])))).toThrow(TypeError);
  expect(() => phpLooseEquals(new BadProps(null), new BadProps(null))).toThrow(TypeError);

  // A sparse list reads each hole as null.
  // oxlint-disable-next-line no-sparse-arrays
  expect(phpLooseEquals([, 1], [null, 1])).toBe(true);
  // oxlint-disable-next-line no-sparse-arrays
  expect(phpStrictEquals([, 1], [null, 1])).toBe(true);

  // Branded keys: an int-like string is an int, a safe bigint is a number; bad keys and pairs throw.
  expect(phpStrictEquals(new BrandedArray([["0", "a"]]), ["a"])).toBe(true);
  expect(phpStrictEquals(new BrandedArray([[1n, "a"]]), new BrandedArray([[1, "a"]]))).toBe(true);
  expect(phpStrictEquals(new BrandedArray([[2n ** 60n, "a"]]), new BrandedArray([["1152921504606846976", "a"]]))).toBe(true);
  expect(phpStrictEquals(new BrandedArray([["-0", "a"]]), { "-0": "a" })).toBe(true);
  const badKeys: unknown[] = [null, true, 1.5, NaN, 2 ** 60, 2n ** 64n, Symbol("k"), {}];
  for (const key of badKeys) {
    expect(() => phpLooseEquals(new BrandedArray([[key as never, 1]]), [1])).toThrow(TypeError);
  }
  expect(() => phpLooseEquals(new BrandedArray([[0, 1], ["0", 2]]), [1, 2])).toThrow(TypeError);
  expect(() => phpLooseEquals(new BrandedArray(["x" as never]), ["x"])).toThrow(TypeError);

  // No import from @xaravel/runtime: the brands are read through Symbol.for only.
  const source = readFileSync(join(root, "packages/assert/src/comparison/PhpComparison.ts"), "utf8");
  const imports = new Bun.Transpiler({ loader: "ts" }).scanImports(source).map((entry) => entry.path);
  expect(imports.filter((path) => path.startsWith("@xaravel/"))).toEqual([]);
});

test("XT-assert-3: @xaravel/assert has no graded-package edge or import, and its exports and prototypes are frozen", () => {
  // The package graph check (AD-2) passes, and the manifest declares no runtime edge at all.
  const graph = Bun.spawnSync([process.execPath, "tools/graph/graph.ts"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  expect({ exitCode: graph.exitCode, stderr: graph.stderr.toString() }).toEqual({ exitCode: 0, stderr: "" });
  const manifest = JSON.parse(readFileSync(join(root, "packages/assert/package.json"), "utf8")) as Record<string, unknown>;
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    expect(Object.keys((manifest[field] as Record<string, unknown> | undefined) ?? {})).toEqual([]);
  }

  // Every src/ import is relative or a builtin; none names a workspace package other than the grader's own.
  const grader = new Set(["@xaravel/assert", "@xaravel/mockery"]);
  const glob = new Bun.Glob("**/*.ts");
  const srcDir = join(root, "packages/assert/src");
  const bad: string[] = [];
  for (const file of glob.scanSync(srcDir)) {
    const text = readFileSync(join(srcDir, file), "utf8");
    for (const { path } of new Bun.Transpiler({ loader: "ts" }).scanImports(text)) {
      const relativeOrBuiltin = path.startsWith(".") || path.startsWith("node:") || path.startsWith("bun:");
      const graderPackage = [...grader].some((name) => path === name || path.startsWith(`${name}/`));
      if (!relativeOrBuiltin && !graderPackage) {
        bad.push(`${relative(root, join(srcDir, file))}: ${path}`);
      }
    }
  }
  expect(bad).toEqual([]);

  // Assigning to an export, an exported function or its prototype throws.
  const exported = Object.entries(api);
  expect(exported.map(([name]) => name).sort()).toEqual(["Assert", "AssertionFailedError", "ComparisonFailure", "Constraint", "Exception", "ExpectationFailedException", "SkippedWithMessageException", "TestCase", "phpLooseEquals", "phpStrictEquals", "portedTest", "recordAssertion", "xaravelTest"]);
  for (const [name, value] of exported) {
    expect(() => {
      (api as Record<string, unknown>)[name] = () => true;
    }).toThrow(TypeError);
    expect(typeof value).toBe("function");
    const fn = value as unknown as Record<string, unknown>;
    expect(Object.isFrozen(fn)).toBe(true);
    expect(() => {
      fn["call"] = () => true;
    }).toThrow(TypeError);
    expect(() => {
      fn["prototype"] = {};
    }).toThrow(TypeError);
    const prototype = fn["prototype"];
    if (typeof prototype === "object" && prototype !== null) {
      expect(Object.isFrozen(prototype)).toBe(true);
      expect(() => {
        (prototype as Record<string, unknown>)["patched"] = true;
      }).toThrow(TypeError);
    }
  }
  expect(phpLooseEquals(1, "1")).toBe(true);
});
