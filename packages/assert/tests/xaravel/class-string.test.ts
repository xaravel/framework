// Xaravel Test for the Epic 13 retrospective's action item 2 (epic-13-item-2-reflection-contracts), as the Maintainer
// ruled ESC-13.1-9 (decisions/MAINT-2026-10-25-story-13-1-second.md, option 1): `assertInstanceOf` and
// `assertNotInstanceOf` take a class-string, as PHPUnit 13.4.3's do (`Assert.php`: `class_exists($expected) ||
// interface_exists($expected)`, else `UnknownClassOrInterfaceException`). The grader imports no runtime (AD-2,
// XT-assert-3), so it resolves the string through `globalThis[Symbol.for('xaravel.class.lookup')]`, which a loaded
// `@xaravel/runtime` publishes. Whether another test file's import has installed that global is order-dependent, so
// every row runs in a fresh `bun` process: one that loads the runtime and contracts (the real lookup and a real
// `contract()` token) and one that loads only the grader (no lookup). Each expected message is the one the grader
// already gives for the class or token itself, which other Xaravel Tests pin to PHPUnit's.
import { join, resolve } from "node:path";
import { expect } from "bun:test";
import { xaravelTest } from "../../src/index";

const PACKAGES = resolve(import.meta.dir, "..", "..", "..");
const ASSERT = JSON.stringify(join(PACKAGES, "assert", "src", "index.ts"));
const RUNTIME = JSON.stringify(join(PACKAGES, "runtime", "src", "index.ts"));
const CONTRACTS = JSON.stringify(join(PACKAGES, "contracts", "src", "index.ts"));

/** Runs `body` in a fresh `bun` process after `imports`; `body` prints one JSON object. */
function child(imports: string, body: string): Record<string, string> {
  const { XARAVEL_NO_SCOPE_GLOBAL: _optOut, ...env } = process.env;
  const code = `${imports}
const outcome = (fn) => { try { fn(); return "(pass)"; } catch (e) { return e.constructor.name + ": " + e.message; } };
${body}`;
  const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", code], { cwd: PACKAGES, stdout: "pipe", stderr: "pipe", env });
  expect(run.stderr.toString()).toBe("");
  expect(run.exitCode).toBe(0);
  return JSON.parse(run.stdout.toString()) as Record<string, string>;
}

const WITH_RUNTIME = `const { Assert, TestCase } = await import(${ASSERT});
const runtime = await import(${RUNTIME});
const { contract } = await import(${CONTRACTS});`;

xaravelTest(
  "XT-assert-102",
  "assertInstanceOf and assertNotInstanceOf take a class-string the runtime's Symbol.for('xaravel.class.lookup') resolves, as PHPUnit's take an existing class or interface name (ESC-13.1-9): a registered class's FQCN (any case, a leading \\), a registerTestClass FQCN in its test and a recorded contract token's FQCN with a branded object pass and fail with the same text as the class or token itself ('is an instance of class <FQCN>' / 'interface <FQCN>'); an unknown name, or any name with no runtime loaded, throws UnknownClassOrInterfaceException; expectException's and assertContainsOnlyInstancesOf's handling of a string is unchanged",
  () => {
    const rows = child(
      WITH_RUNTIME,
      `const { registerClass, registerTestClass, runInRootFrame } = runtime;
class Post {}
class Other {}
registerClass("XaravelFixture\\\\ClassString\\\\Post", Post);
registerClass("XaravelFixture\\\\ClassString\\\\Other", Other);
const Shape = contract("XaravelFixture\\\\ClassString\\\\Shape", {});
class Square { get [Shape.brand]() { return true; } }
registerClass("XaravelFixture\\\\ClassString\\\\Square", Square);
const POST = "XaravelFixture\\\\ClassString\\\\Post";
const SHAPE = "XaravelFixture\\\\ClassString\\\\Shape";
const out = {
  classPass: outcome(() => Assert.assertInstanceOf(POST, new Post())),
  classPassCase: outcome(() => Assert.assertInstanceOf("\\\\xaravelfixture\\\\classstring\\\\post", new Post())),
  classFail: outcome(() => Assert.assertInstanceOf(POST, new Other())),
  classFailByValue: outcome(() => Assert.assertInstanceOf(Post, new Other())),
  classNotPass: outcome(() => Assert.assertNotInstanceOf(POST, new Other())),
  classNotFail: outcome(() => Assert.assertNotInstanceOf(POST, new Post())),
  classNotFailByValue: outcome(() => Assert.assertNotInstanceOf(Post, new Post())),
  builtin: outcome(() => Assert.assertInstanceOf("LogicException", new runtime.LogicException("x"))),
  tokenPass: outcome(() => Assert.assertInstanceOf(SHAPE, new Square())),
  tokenFail: outcome(() => Assert.assertInstanceOf(SHAPE, new Post())),
  tokenFailByValue: outcome(() => Assert.assertInstanceOf(Shape, new Post())),
  tokenNotFail: outcome(() => Assert.assertNotInstanceOf(SHAPE, new Square())),
  tokenNotFailByValue: outcome(() => Assert.assertNotInstanceOf(Shape, new Square())),
  tokenNotPass: outcome(() => Assert.assertNotInstanceOf(SHAPE, new Post())),
  unknown: outcome(() => Assert.assertInstanceOf("Nope", new Post())),
  unknownNot: outcome(() => Assert.assertNotInstanceOf("Nope", new Post())),
  containsOnly: outcome(() => Assert.assertContainsOnlyInstancesOf(POST, [new Post()])),
  expectException: outcome(() => new TestCase().expectException(POST)),
};
class Fixture {}
runInRootFrame("test", () => {
  registerTestClass("XaravelFixture\\\\ClassString\\\\Fixture", Fixture);
  out.testClassPass = outcome(() => Assert.assertInstanceOf("XaravelFixture\\\\ClassString\\\\Fixture", new Fixture()));
  out.testClassFail = outcome(() => Assert.assertInstanceOf("XaravelFixture\\\\ClassString\\\\Fixture", new Post()));
});
out.testClassAfter = outcome(() => Assert.assertInstanceOf("XaravelFixture\\\\ClassString\\\\Fixture", new Fixture()));
console.log(JSON.stringify(out));`,
    );
    const post = "XaravelFixture\\ClassString\\Post";
    const shape = "XaravelFixture\\ClassString\\Shape";
    const fixture = "XaravelFixture\\ClassString\\Fixture";
    expect(rows["classPass"]).toBe("(pass)");
    expect(rows["classPassCase"]).toBe("(pass)");
    expect(rows["classFail"]).toBe(`ExpectationFailedException: Failed asserting that an instance of class XaravelFixture\\ClassString\\Other is an instance of class ${post}.`);
    expect(rows["classFail"]).toBe(rows["classFailByValue"]!);
    expect(rows["classNotPass"]).toBe("(pass)");
    expect(rows["classNotFail"]).toBe(`ExpectationFailedException: Failed asserting that an instance of class ${post} is not an instance of class ${post}.`);
    expect(rows["classNotFail"]).toBe(rows["classNotFailByValue"]!);
    expect(rows["builtin"]).toBe("(pass)");
    expect(rows["tokenPass"]).toBe("(pass)");
    expect(rows["tokenFail"]).toBe(`ExpectationFailedException: Failed asserting that an instance of class ${post} is an instance of interface ${shape}.`);
    expect(rows["tokenFail"]).toBe(rows["tokenFailByValue"]!);
    expect(rows["tokenNotFail"]).toBe(rows["tokenNotFailByValue"]!);
    expect(rows["tokenNotFail"]).toContain(`is not an instance of interface ${shape}.`);
    expect(rows["tokenNotPass"]).toBe("(pass)");
    expect(rows["unknown"]).toBe('UnknownClassOrInterfaceException: Class or interface "Nope" does not exist');
    expect(rows["unknownNot"]).toBe('UnknownClassOrInterfaceException: Class or interface "Nope" does not exist');
    // Not in the ruling: assertContainsOnlyInstancesOf still refuses a string.
    expect(rows["containsOnly"]).toBe(`UnknownClassOrInterfaceException: Class or interface "${post}" does not exist`);
    // Not in the ruling either: expectException still refuses a class-string, even one the runtime's lookup resolves.
    expect(rows["expectException"]).toBe(`UnknownClassOrInterfaceException: Class or interface "${post}" does not exist`);
    expect(rows["testClassPass"]).toBe("(pass)");
    expect(rows["testClassFail"]).toBe(`ExpectationFailedException: Failed asserting that an instance of class ${post} is an instance of class ${fixture}.`);
    expect(rows["testClassAfter"]).toBe(`UnknownClassOrInterfaceException: Class or interface "${fixture}" does not exist`);

    // No runtime loaded: no lookup, so every string is unknown, as before.
    const bare = child(
      `const { Assert, TestCase } = await import(${ASSERT});`,
      `class Post {}
const out = {
  lookup: String(globalThis[Symbol.for("xaravel.class.lookup")]),
  instanceOf: outcome(() => Assert.assertInstanceOf("stdClass", new Post())),
  notInstanceOf: outcome(() => Assert.assertNotInstanceOf("Post", new Post())),
  byValue: outcome(() => Assert.assertInstanceOf(Post, new Post())),
};
console.log(JSON.stringify(out));`,
    );
    expect(bare["lookup"]).toBe("undefined");
    expect(bare["instanceOf"]).toBe('UnknownClassOrInterfaceException: Class or interface "stdClass" does not exist');
    expect(bare["notInstanceOf"]).toBe('UnknownClassOrInterfaceException: Class or interface "Post" does not exist');
    expect(bare["byValue"]).toBe("(pass)");

    // A lookup that gives something other than a class or a token: the name is unknown.
    const odd = child(
      `Object.defineProperty(globalThis, Symbol.for("xaravel.class.lookup"), { value: (name) => (name === "Obj" ? {} : name === "Num" ? 5 : null) });
const { Assert } = await import(${ASSERT});`,
      `const out = {
  obj: outcome(() => Assert.assertInstanceOf("Obj", {})),
  num: outcome(() => Assert.assertNotInstanceOf("Num", {})),
};
console.log(JSON.stringify(out));`,
    );
    expect(odd["obj"]).toBe('UnknownClassOrInterfaceException: Class or interface "Obj" does not exist');
    expect(odd["num"]).toBe('UnknownClassOrInterfaceException: Class or interface "Num" does not exist');
  },
  60_000,
);
