// Xaravel Tests for Story 10.5: the three Xaravel-only seams of `@xaravel/contracts` (AD-27). XT-contracts-13 checks
// `@xaravel/contracts/async` (AD-6): the thenable list against the `tools/lint-rules/thenables.ts` array it replaces,
// `NotPromise<T>` with the repo's pinned `tsc -b`, and the PromiseLike check (`support/thenables.ts`) on fixtures and on
// every package's `src/`. XT-contracts-14 checks the compiled-view ABI in `@xaravel/contracts/view` (AD-11): the
// `RenderContext` and `RenderLoop` fields against the View `Factory`'s per-render properties and `addLoop`'s entry, and
// `BladeHelper` against every `$__env-><method>` Upstream's Blade compilers emit and the default echo format.
// XT-contracts-15 checks `@xaravel/contracts/testing`'s hook order (AD-25) against `InteractsWithTestCaseLifecycle`,
// under ESC-10.5-1 Option 1.
//
// Each Upstream-derived part also compares with a literal copy, which runs without the snapshot. The snapshot is
// gitignored and synced by `bun run upstream:sync`, which CI's `check` job runs under `XARAVEL_UPSTREAM=require`
// (ESC-10.2-8). Where it is missing, the Upstream-derived parts fail under that variable and otherwise warn and are
// skipped.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { THENABLE_TYPES } from "@xaravel/contracts/async";
import { TEST_HOOK_ORDER } from "@xaravel/contracts/testing";
import * as view from "@xaravel/contracts/view";
import { PACKAGE, REPO, upstreamOrWarn } from "./support/contract-namespaces";
import { thenableProblems } from "./support/thenables";

const ILLUMINATE = join(REPO, "conformance", "upstream", "framework", "src", "Illuminate");

/** Runs the repo's pinned `tsc -b` in `cwd`; returns its exit code and combined output. */
async function tscBuild(cwd: string): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([process.execPath, "--bun", join(REPO, "node_modules", "typescript", "bin", "tsc"), "-b", "--pretty", "false"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, output: `${stdout}${stderr}` };
}

/** Builds each fixture source, in order, in one temp project that imports `@xaravel/contracts` (brand-compile.test.ts's form, with Bun's types). */
async function compileEach(prefix: string, sources: readonly string[]): Promise<{ code: number; output: string }[]> {
  const tmp = mkdtempSync(join(tmpdir(), prefix));
  try {
    copyFileSync(join(REPO, "tsconfig.base.json"), join(tmp, "tsconfig.base.json"));
    // The package's own `types` (`bun`): `@xaravel/contracts/view` reaches runtime sources that use Bun's globals.
    writeFileSync(join(tmp, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { types: ["bun"] }, include: ["fixture.ts"] }, null, 2) + "\n");
    mkdirSync(join(tmp, "node_modules", "@xaravel"), { recursive: true });
    mkdirSync(join(tmp, "node_modules", "@types"), { recursive: true });
    symlinkSync(join(REPO, "packages", "contracts"), join(tmp, "node_modules", "@xaravel", "contracts"));
    symlinkSync(join(REPO, "node_modules", "@types", "bun"), join(tmp, "node_modules", "@types", "bun"));
    const results: { code: number; output: string }[] = [];
    for (const source of sources) {
      writeFileSync(join(tmp, "fixture.ts"), source);
      results.push(await tscBuild(tmp));
    }
    return results;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** The TS error codes `output` reports. */
function errorCodes(output: string): string[] {
  return [...output.matchAll(/error (TS\d+)/g)].map((match) => match[1] ?? "");
}

/** `dir`'s files whose names end with `suffix`, recursively, sorted. */
function walk(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path, suffix));
    } else if (name.endsWith(suffix)) {
      out.push(path);
    }
  }
  return out;
}

/** The body of PHP method `name` in `source`, from its opening brace to the matching one. */
function phpMethodBody(source: string, name: string): string {
  const at = source.indexOf(`function ${name}(`);
  Assert.assertTrue(at !== -1, `function ${name} is in the source`);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
    } else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(open, i + 1);
      }
    }
  }
  return source.slice(open);
}

/** The field names of `export interface <name> { … }` in `source`, in order. */
function interfaceFields(source: string, name: string): string[] {
  const body = new RegExp(`export interface ${name} \\{\\n([\\s\\S]*?)\\n\\}`).exec(source)?.[1] ?? "";
  return [...body.matchAll(/^ {2}(?:readonly )?(\w+)\??:/gm)].map((match) => match[1] ?? "");
}

// ---------------------------------------------------------------------------------------------------------------------
// XT-contracts-13: @xaravel/contracts/async

/** The thenable types Story 10.5's first AC names: the Builders, the base Relation and the `Pending*` builders. */
const AC_THENABLES: readonly string[] = [
  "Illuminate\\Database\\Query\\Builder",
  "Illuminate\\Database\\Eloquent\\Builder",
  "Illuminate\\Database\\Eloquent\\Relations\\Relation",
  "Illuminate\\Http\\Client\\PendingRequest",
  "Illuminate\\Foundation\\Bus\\PendingDispatch",
  "Illuminate\\Foundation\\Bus\\PendingChain",
  "Illuminate\\Bus\\PendingBatch",
  "Illuminate\\Broadcasting\\PendingBroadcast",
  "Illuminate\\Testing\\PendingCommand",
  "Laravel\\Mcp\\Server\\Testing\\PendingTestResponse",
];

/** The string literals of `THENABLE_TYPES`' array literal in `tools/lint-rules/thenables.ts`, read as text. */
function toolThenables(): string[] {
  const source = readFileSync(join(REPO, "tools", "lint-rules", "thenables.ts"), "utf8");
  const literal = /export const THENABLE_TYPES: readonly string\[\] = \[([\s\S]*?)\n\];/.exec(source)?.[1] ?? "";
  return [...literal.matchAll(/^\s*("(?:[^"\\]|\\.)*"),?$/gm)].map((match) => JSON.parse(match[1] ?? '""') as string);
}

const NOT_PROMISE_OK = `import type { NotPromise } from "@xaravel/contracts/async";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const plain: Equals<NotPromise<number>, number> = true;
export const promise: Equals<NotPromise<Promise<number>>, never> = true;
export const promiseLike: Equals<NotPromise<PromiseLike<string>>, never> = true;
export const union: Equals<NotPromise<number | Promise<number>>, number> = true;

declare function map<U>(fn: () => NotPromise<U>): U[];
export const mapped: number[] = map(() => 1);
`;

const NOT_PROMISE_ASYNC = `import type { NotPromise } from "@xaravel/contracts/async";

declare function map<U>(fn: () => NotPromise<U>): U[];
export const mapped = map(async () => 1);
`;

/** A PromiseLike check fixture: its source and the class the check names, or null when it reports nothing. */
interface CheckFixture {
  readonly name: string;
  readonly source: string;
  readonly reports: string | null;
}

const CHECK_FIXTURES: readonly CheckFixture[] = [
  // Members that count.
  { name: "method", source: "export class ThenMethod {\n  then(): void {}\n}\n", reports: "ThenMethod" },
  { name: "async method", source: "export class AsyncThen {\n  async then(): Promise<void> {}\n}\n", reports: "AsyncThen" },
  {
    name: "generic method",
    source: "export class GenericThen<T> {\n  then<R1 = T, R2 = never>(onfulfilled?: ((value: T) => R1) | null, onrejected?: ((reason: unknown) => R2) | null): Promise<R1 | R2> {\n    return null as never;\n  }\n}\n",
    reports: "GenericThen",
  },
  { name: "getter", source: "export class GetterThen {\n  get then(): null {\n    return null;\n  }\n}\n", reports: "GetterThen" },
  { name: "setter", source: "export class SetterThen {\n  set then(value: unknown) {}\n}\n", reports: "SetterThen" },
  { name: "optional field", source: "export class OptionalThen {\n  then?: () => void;\n}\n", reports: "OptionalThen" },
  { name: "constructor parameter property", source: "export class ParameterThen {\n  constructor(\n    private readonly other: Map<string, number> = new Map(),\n    public then: () => void,\n  ) {}\n}\n", reports: "ParameterThen" },
  { name: "readonly constructor parameter property", source: "export class ReadonlyParameterThen {\n  constructor(readonly then: () => void) {}\n}\n", reports: "ReadonlyParameterThen" },
  { name: "field with an initializer", source: "export class FieldThen {\n  then = (): void => {};\n}\n", reports: "FieldThen" },
  { name: "field with a type", source: "export class TypedThen {\n  declare then: (resolve: () => void) => void;\n}\n", reports: "TypedThen" },
  { name: "field without semicolons", source: "export class LooseThen {\n  other = 1\n  then = () => {\n    return 1\n  }\n}\n", reports: "LooseThen" },
  { name: "quoted name", source: "export class QuotedThen {\n  'then'(): void {}\n}\n", reports: "QuotedThen" },
  { name: "computed string name", source: 'export class ComputedThen {\n  ["then"](): void {}\n}\n', reports: "ComputedThen" },
  { name: "after other members", source: "export class LaterThen {\n  static make(): LaterThen {\n    return new LaterThen();\n  }\n  private x: { a: number } = { a: 1 };\n  run(): { b: string } {\n    return { b: `${this.x.a}` };\n  }\n  then(): void {}\n}\n", reports: "LaterThen" },
  { name: "class expression", source: "export const ExpressionThen = class {\n  then(): void {}\n};\n", reports: "ExpressionThen" },
  { name: "anonymous generic class expression", source: "export const GenericExpressionThen = class<T> {\n  then(): T {\n    return null as never;\n  }\n};\n", reports: "GenericExpressionThen" },
  {
    name: "other implements only",
    source: "export class OtherThen implements Iterable<number> {\n  *[Symbol.iterator](): Iterator<number> {}\n  then(): void {}\n}\n",
    reports: "OtherThen",
  },
  { name: "PromiseLike in a comment", source: "export class CommentedThen /* implements PromiseLike<void> */ {\n  then(): void {}\n}\n", reports: "CommentedThen" },
  {
    name: "nested in a body",
    source:
      "export class Outer implements PromiseLike<number> {\n  then<R1 = number, R2 = never>(onfulfilled?: ((value: number) => R1) | null, onrejected?: ((reason: unknown) => R2) | null): PromiseLike<R1 | R2> {\n    return Promise.resolve(1).then(onfulfilled, onrejected);\n  }\n  make(): object {\n    class Inner {\n      then(): void {}\n    }\n    return new Inner();\n  }\n}\n",
    reports: "Inner",
  },
  {
    name: "returned for mixin",
    source:
      'import { mixin } from "@xaravel/runtime/traits";\n\nexport function ThenTrait<B extends new (...args: any[]) => object>(Base: B) {\n  return class ThenableTrait extends Base {\n    then(): void {}\n  };\n}\n\nexport class Host extends mixin(null, ThenTrait(Object)) {}\n',
    reports: "ThenableTrait",
  },
  // Members that do not count, and declared thenables.
  {
    name: "implements PromiseLike",
    source: "export class Declared extends Base implements Arrayable, PromiseLike<Declared> {\n  then<R1 = Declared, R2 = never>(onfulfilled?: ((value: Declared) => R1) | null): PromiseLike<R1 | R2> {\n    return null as never;\n  }\n}\n",
    reports: null,
  },
  { name: "constructor parameter", source: "export class PlainParameter {\n  constructor(then: () => void) {\n    then();\n  }\n}\n", reports: null },
  { name: "static member", source: "export class StaticThen {\n  static then(): void {}\n  static async ['then'](): Promise<void> {}\n}\n", reports: null },
  { name: "object literal", source: "export const literal = { then(): void {} };\nexport class Literal {\n  make(): object {\n    return { then: () => 1, 'then'() {} };\n  }\n}\n", reports: null },
  { name: ".then( call", source: "export class Caller {\n  run(p: Promise<number>): Promise<number> {\n    return p.then((v) => v).then(function then(v) { return v; });\n  }\n}\n", reports: null },
  {
    name: "comments, strings, templates and regexes",
    source:
      'export class Text {\n  // then(): void {}\n  /* then(): void {} */\n  s = "class S { then() {} }";\n  t = `class T { then() {} } ${"then"}`;\n  r = /class R { then() {} }/;\n  q = 4 / 2;\n}\n// class C { then() {} }\nexport const u = `${`class U { then() {} }`}`;\nexport const v = /then\\(\\) {}/g.test("then");\n',
    reports: null,
  },
];

xaravelTest(
  "XT-contracts-13",
  "@xaravel/contracts/async exports THENABLE_TYPES, frozen, the 26 FQCNs of tools/lint-rules/thenables.ts's list in its order with every thenable the Story's AC names, the list async-surface's thenableTypes() prefers when @xaravel/contracts/async resolves from its root, here resolved from the contracts package and a dependent package to a non-empty string array (resolution from the repository root waits on ESC-10.5-2), and NotPromise<T>, which is T for a non-thenable and never for a Promise or PromiseLike and distributes over a union, so a sync map(fn: () => NotPromise<U>) rejects an async callback (AD-6.8, AD-27.2); the PromiseLike check reports a class with an instance then member (method, async, generic, getter, setter, field, optional field, constructor parameter property, quoted or computed name, class expression, anonymous generic class expression, nested or returned for mixin) and no PromiseLike in its own implements list, ignores static members, object literals, .then( calls, comments, strings, templates and regexes, and reports nothing for any packages/*/src file (ESC-6.1-1 item 2)",
  async () => {
    // The list: frozen, the tool's list in order, every AC name.
    Assert.assertTrue(Object.isFrozen(THENABLE_TYPES));
    const tool = toolThenables();
    Assert.assertSame(26, tool.length, "tools/lint-rules/thenables.ts lists 26 thenables");
    Assert.assertSame(JSON.stringify(tool), JSON.stringify(THENABLE_TYPES));
    for (const name of AC_THENABLES) {
      Assert.assertTrue(THENABLE_TYPES.includes(name), name);
    }

    // What async-surface reads: the subpath resolves from a package to src/async/index.ts, whose list is a non-empty string array.
    for (const from of [PACKAGE, join(REPO, "packages", "support")]) {
      const path = Bun.resolveSync("@xaravel/contracts/async", from);
      Assert.assertSame(join(REPO, "packages", "contracts", "src", "async", "index.ts"), path, relative(REPO, from));
      const mod = (await import(path)) as { THENABLE_TYPES?: unknown };
      const list = mod.THENABLE_TYPES;
      Assert.assertTrue(Array.isArray(list) && list.length > 0 && list.every((item) => typeof item === "string"), "a non-empty string array");
    }

    // NotPromise, compiled.
    const [ok, rejected] = await compileEach("xaravel-contracts-async-", [NOT_PROMISE_OK, NOT_PROMISE_ASYNC]);
    Assert.assertSame(0, ok?.code, ok?.output);
    Assert.assertNotEquals(0, rejected?.code, rejected?.output);
    Assert.assertSame(JSON.stringify(["TS2322"]), JSON.stringify(errorCodes(rejected?.output ?? "")), rejected?.output);
    Assert.assertTrue((rejected?.output ?? "").includes("fixture.ts(4,"), rejected?.output);

    // The PromiseLike check on the fixtures.
    for (const fixture of CHECK_FIXTURES) {
      const expected = fixture.reports === null ? [] : [`fixture.ts: class ${fixture.reports} declares then but does not implement PromiseLike`];
      Assert.assertSame(JSON.stringify(expected), JSON.stringify(thenableProblems(fixture.source, "fixture.ts")), fixture.name);
    }

    // The PromiseLike check on every package's src/.
    const problems: string[] = [];
    let files = 0;
    const packages = join(REPO, "packages");
    for (const pkg of readdirSync(packages).sort()) {
      const src = join(packages, pkg, "src");
      try {
        if (!statSync(src).isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }
      for (const file of walk(src, ".ts")) {
        files++;
        problems.push(...thenableProblems(readFileSync(file, "utf8"), relative(REPO, file)));
      }
    }
    Assert.assertTrue(files > 0, "packages/*/src has files");
    Assert.assertSame("[]", JSON.stringify(problems));
  },
  180_000,
);

// ---------------------------------------------------------------------------------------------------------------------
// XT-contracts-14: @xaravel/contracts/view

/** `RenderContext`'s fields in the spec's order (Design Notes), each with a value of its type for the compile fixture. */
const RENDER_CONTEXT_FIELDS: readonly (readonly [string, string])[] = [
  ["data", "{ user: 1 }"],
  ["factory", "factory"],
  ["sections", "{ content: 'a' }"],
  ["sectionStack", "['content']"],
  ["pushes", "{ scripts: { 0: 'a' } }"],
  ["prepends", "{ scripts: { 0: 'b' } }"],
  ["pushStack", "['scripts']"],
  ["renderedOnce", "new Set<string>()"],
  ["componentStack", "[]"],
  ["componentData", "{ 1: { title: 'x' } }"],
  ["currentComponentData", "{ 1: { title: 'x' } }"],
  ["slots", "{ 1: { footer: 'f' } }"],
  ["slotStack", "{ 1: ['footer'] }"],
  ["loopsStack", "[loop]"],
  ["fragments", "{ list: 'l' }"],
  ["fragmentStack", "['list']"],
  ["fragmentCapture", "null"],
];

/** The fields that hold no Upstream property: the data, the factory and the capture set (AD-11). */
const XARAVEL_FIELDS: readonly string[] = ["data", "factory", "fragmentCapture"];

/** `RenderLoop`'s fields, `addLoop`'s keys in its order. */
const RENDER_LOOP_FIELDS: readonly string[] = ["iteration", "index", "remaining", "count", "first", "last", "odd", "even", "depth", "parent"];

/** The concern files (and `Factory.php`) whose instance properties are per-render state, with the properties `RenderContext` takes. */
const STATE_SOURCES: Readonly<Record<string, readonly string[] | null>> = {
  "View/Concerns/ManagesLayouts.php": null,
  "View/Concerns/ManagesStacks.php": null,
  "View/Concerns/ManagesComponents.php": null,
  "View/Concerns/ManagesLoops.php": null,
  "View/Concerns/ManagesFragments.php": null,
  // The Factory's own state is the `@once` set; its other properties are the engines, finder, events, container,
  // shared data, extensions, composers and caches, and the render count AD-11 does not name.
  "View/Factory.php": ["renderedOnce"],
};

/**
 * The `View/Concerns/*.php` files `RenderContext` takes nothing from: event registration holds no per-render state, and
 * `ManagesTranslations::$translationReplacements` is left out because AD-11's list does not name it (the spec's Design
 * Notes; the View Epic raises an Escalation if it needs it).
 */
const EXCLUDED_CONCERNS: readonly string[] = ["View/Concerns/ManagesEvents.php", "View/Concerns/ManagesTranslations.php"];

/** Every `$__env-><method>` name Upstream's Blade compilers emit at the Pin, sorted. */
const BLADE_ENV_METHODS: readonly string[] = [
  "addLoop",
  "appendSection",
  "endSlot",
  "exists",
  "first",
  "getConsumableComponentData",
  "getContainer",
  "getLastLoop",
  "hasRenderedOnce",
  "incrementLoopIndices",
  "isStackEmpty",
  "make",
  "markAsRenderedOnce",
  "popLoop",
  "renderComponent",
  "renderEach",
  "renderTranslation",
  "renderUnless",
  "renderWhen",
  "slot",
  "startComponent",
  "startComponentFirst",
  "startFragment",
  "startPrepend",
  "startPush",
  "startSection",
  "startTranslation",
  "stopFragment",
  "stopPrepend",
  "stopPush",
  "stopSection",
  "yieldContent",
  "yieldPushContent",
  "yieldSection",
];

/** The view fixture: a full `RenderContext` (minus `omit`), a `RenderLoop`, and `Record<BladeHelper, true>` over `helpers`. */
function viewFixture(helpers: readonly string[], omit: string | null): string {
  const fields = RENDER_CONTEXT_FIELDS.filter(([name]) => name !== omit).map(([name, value]) => `  ${name}: ${value},`);
  return `import type { BladeEnvMethod, BladeFunction, BladeHelper, Factory, RenderContext, RenderLoop } from "@xaravel/contracts/view";

declare const factory: Factory;

const parent: RenderLoop = { iteration: 1, index: 0, remaining: 1, count: 2, first: true, last: false, odd: true, even: false, depth: 1, parent: null };
const loop: RenderLoop = { iteration: 0, index: 0, remaining: null, count: null, first: true, last: null, odd: false, even: true, depth: 2, parent };

export const ctx: RenderContext = {
${fields.join("\n")}
};

export const helpers: Record<BladeHelper, true> = {
${helpers.map((name) => `  ${name}: true,`).join("\n")}
};

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export const required: Equals<RenderContext, Required<RenderContext>> = true;
export const loopRequired: Equals<RenderLoop, Required<RenderLoop>> = true;

export const env: BladeEnvMethod = "startSection";
export const echo: BladeFunction = "e";
`;
}

xaravelTest(
  "XT-contracts-14",
  "@xaravel/contracts/view keeps its runtime exports and adds, as types only, the compiled-view ABI (AD-11, AD-27.2): RenderContext, whose fields are data, factory, each per-render instance property of Upstream's View Factory concerns for sections, stacks, components, loops and fragments, Factory::$renderedOnce for @once, and fragmentCapture, so a context with every field compiles and one missing a field does not; RenderLoop, the keys of ManagesLoops::addLoop's entry; and BladeHelper, BladeEnvMethod (every $__env-><method> name in Illuminate/View/Compilers at the Pin) or BladeFunction (\"e\", BladeCompiler::DEFAULT_ECHO_FORMAT's function), so Record<BladeHelper, true> over those names compiles with no missing or extra key",
  async () => {
    // Types only: the runtime exports are still the four Upstream declarations.
    Assert.assertSame(JSON.stringify(["Engine", "Factory", "View", "ViewCompilationException"]), JSON.stringify(Object.keys(view).sort()));

    // The declared fields are the literal lists.
    const source = readFileSync(join(PACKAGE, "src", "view", "RenderContext.ts"), "utf8");
    Assert.assertSame(JSON.stringify(RENDER_CONTEXT_FIELDS.map(([name]) => name)), JSON.stringify(interfaceFields(source, "RenderContext")));
    Assert.assertSame(JSON.stringify(RENDER_LOOP_FIELDS), JSON.stringify(interfaceFields(source, "RenderLoop")));

    let helpers: readonly string[] = [...BLADE_ENV_METHODS, "e"];
    if (upstreamOrWarn("seams.test.ts")) {
      // RenderContext's Upstream fields are the concerns' instance properties and the Factory's `@once` set.
      // Every concern is either read or explicitly excluded.
      const concerns = readdirSync(join(ILLUMINATE, "View", "Concerns")).filter((name) => name.endsWith(".php")).map((name) => `View/Concerns/${name}`).sort();
      const accounted = [...Object.keys(STATE_SOURCES).filter((file) => file.startsWith("View/Concerns/")), ...EXCLUDED_CONCERNS].sort();
      Assert.assertSame(JSON.stringify(concerns), JSON.stringify(accounted));

      const state: string[] = [];
      for (const [file, take] of Object.entries(STATE_SOURCES)) {
        const php = readFileSync(join(ILLUMINATE, file), "utf8");
        const properties = [...php.matchAll(/^ {4}protected \$(\w+)/gm)].map((match) => match[1] ?? "");
        for (const name of take ?? properties) {
          Assert.assertTrue(properties.includes(name), `${file} declares $${name}`);
          state.push(name);
        }
      }
      const upstreamFields = RENDER_CONTEXT_FIELDS.map(([name]) => name).filter((name) => !XARAVEL_FIELDS.includes(name));
      Assert.assertSame(JSON.stringify([...state].sort()), JSON.stringify([...upstreamFields].sort()));

      // RenderLoop is addLoop's entry.
      const addLoop = phpMethodBody(readFileSync(join(ILLUMINATE, "View", "Concerns", "ManagesLoops.php"), "utf8"), "addLoop");
      Assert.assertSame(JSON.stringify(RENDER_LOOP_FIELDS), JSON.stringify([...addLoop.matchAll(/'(\w+)' =>/g)].map((match) => match[1])));

      // BladeEnvMethod is every `$__env->` name the compilers emit; BladeFunction the default echo format's function.
      const names = new Set<string>();
      for (const file of walk(join(ILLUMINATE, "View", "Compilers"), ".php")) {
        for (const match of readFileSync(file, "utf8").matchAll(/\$__env->([A-Za-z_]\w*)/g)) {
          names.add(match[1] ?? "");
        }
      }
      const parsed = [...names].sort();
      Assert.assertSame(34, parsed.length);
      Assert.assertSame(JSON.stringify(BLADE_ENV_METHODS), JSON.stringify(parsed));
      const format = /const DEFAULT_ECHO_FORMAT = '([^']*)';/.exec(readFileSync(join(ILLUMINATE, "View", "Compilers", "BladeCompiler.php"), "utf8"))?.[1] ?? "";
      const echo = /^(\w+)\(%s\)$/.exec(format)?.[1] ?? `(no function in ${JSON.stringify(format)})`;
      Assert.assertSame("e", echo);
      helpers = [...parsed, echo];
    }

    // Compiled: every field compiles, one missing does not; the helper record has no missing or extra key.
    const [complete, missing] = await compileEach("xaravel-contracts-view-", [viewFixture(helpers, null), viewFixture(helpers, "fragmentCapture")]);
    Assert.assertSame(0, complete?.code, complete?.output);
    Assert.assertNotEquals(0, missing?.code, missing?.output);
    Assert.assertSame(JSON.stringify(["TS2741"]), JSON.stringify(errorCodes(missing?.output ?? "")), missing?.output);
    Assert.assertTrue((missing?.output ?? "").includes("'fragmentCapture'"), missing?.output);
  },
  180_000,
);

// ---------------------------------------------------------------------------------------------------------------------
// XT-contracts-15: @xaravel/contracts/testing

/** The hook order under ESC-10.5-1 Option 1: Upstream's. */
const HOOK_ORDER: readonly string[] = ["createApplication", "setUp<Trait>", "afterApplicationCreated", "test", "tearDown<Trait>", "beforeApplicationDestroyed"];

/** The hook order `InteractsWithTestCaseLifecycle.php` runs, parsed from its source. */
function upstreamHookOrder(): string[] {
  const php = readFileSync(join(ILLUMINATE, "Foundation", "Testing", "Concerns", "InteractsWithTestCaseLifecycle.php"), "utf8");

  // Set-up: `refreshApplication()` (createApplication), `setUpTraits()`, then the afterApplicationCreated callbacks.
  const setUp = phpMethodBody(php, "setUpTheTestEnvironment");
  const steps: [number, string][] = [
    [setUp.indexOf("$this->refreshApplication()"), "createApplication"],
    [setUp.indexOf("$this->setUpTraits()"), "setUp<Trait>"],
    [setUp.indexOf("$this->afterApplicationCreatedCallbacks as"), "afterApplicationCreated"],
  ];
  for (const [offset, hook] of steps) {
    Assert.assertTrue(offset !== -1, `setUpTheTestEnvironment runs ${hook}`);
  }
  const order = steps.sort((a, b) => a[0] - b[0]).map(([, hook]) => hook);
  order.push("test");

  // Tear-down: setUpTraits registers each tearDown<Trait> as a beforeApplicationDestroyed callback while the test
  // environment is set up, so before any callback the test registers; the callbacks are appended and run in order.
  const traits = phpMethodBody(php, "setUpTraits");
  const tearDownName = traits.indexOf("$method = 'tearDown'.class_basename($trait)");
  const registration = traits.indexOf("$this->beforeApplicationDestroyed(fn () => $this->{$method}())", tearDownName);
  Assert.assertTrue(tearDownName !== -1 && registration !== -1, "setUpTraits registers tearDown<Trait> as a beforeApplicationDestroyed callback");
  const setUpName = traits.indexOf("$method = 'setUp'.class_basename($trait)");
  Assert.assertTrue(setUpName !== -1, "setUpTraits names setUp<Trait>");
  Assert.assertTrue(setUpName < tearDownName, "setUpTraits names setUp<Trait> first");
  Assert.assertTrue(phpMethodBody(php, "beforeApplicationDestroyed").includes("$this->beforeApplicationDestroyedCallbacks[] = $callback;"), "callbacks are appended");
  Assert.assertTrue(phpMethodBody(php, "callBeforeApplicationDestroyedCallbacks").includes("foreach ($this->beforeApplicationDestroyedCallbacks as $callback)"), "callbacks run in order");
  Assert.assertTrue(phpMethodBody(php, "tearDownTheTestEnvironment").includes("$this->callBeforeApplicationDestroyedCallbacks()"), "tearDownTheTestEnvironment runs the callbacks");
  order.push("tearDown<Trait>", "beforeApplicationDestroyed");
  return order;
}

xaravelTest(
  "XT-contracts-15",
  "@xaravel/contracts/testing exports TEST_HOOK_ORDER, frozen, createApplication → setUp<Trait> → afterApplicationCreated → test → tearDown<Trait> → beforeApplicationDestroyed, the order Upstream's InteractsWithTestCaseLifecycle runs (setUpTheTestEnvironment's refreshApplication, setUpTraits and afterApplicationCreated callbacks, and setUpTraits registering each tearDown<Trait> as an earlier beforeApplicationDestroyed callback), under ESC-10.5-1 Option 1 in place of AD-25's wording (AD-27.2)",
  () => {
    Assert.assertTrue(Object.isFrozen(TEST_HOOK_ORDER));
    Assert.assertSame(JSON.stringify(HOOK_ORDER), JSON.stringify(TEST_HOOK_ORDER));
    if (upstreamOrWarn("seams.test.ts")) {
      Assert.assertSame(JSON.stringify(HOOK_ORDER), JSON.stringify(upstreamHookOrder()));
    }
  },
);
