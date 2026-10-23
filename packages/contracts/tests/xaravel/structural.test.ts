// Xaravel Test for Story 10.2: the concrete types a contract names are structural (AD-1.2). `@xaravel/contracts`
// imports nothing but `@xaravel/runtime` and its own files, and a temp project built with the repo's pinned `tsc -b`
// (XT-contracts-2's pattern) passes a local Collection-shaped class to `Bus\Dispatcher::chain` and a Request-shaped
// object to `Support\Responsable::toResponse`, and fails with TS2345 when the class lacks a structural member or an
// async function is passed as a sync-only (`SyncClosure`) callback. Every concrete class the Upstream contract files
// name maps to a `src/structural/` type, which the port imports where the class is in a signature.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";

const REPO = resolve(import.meta.dir, "..", "..", "..", "..");
const PACKAGE = resolve(import.meta.dir, "..", "..");

/** Every `.ts` file under `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** The module specifiers a source file imports or re-exports: `from "…"`, bare `import "…"` and `import("…")`. */
function specifiers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return found;
}

/** The 19 Upstream namespaces Story 10.2 ports. */
const NAMESPACES = ["Support", "Container", "Config", "Foundation", "Pipeline", "Events", "Bus", "Queue", "Cache", "Redis", "Encryption", "Hashing", "Filesystem", "Process", "Translation", "Validation", "Debug", "Concurrency", "JsonSchema"];

/** PHP's built-in classes and interfaces an Upstream contract file names, each with its Xaravel form. */
const PHP_BUILTINS: Readonly<Record<string, string>> = {
  Closure: "the structural `Closure` function type (or `SyncClosure`)",
  DateTimeInterface: "the structural `DateTimeInterface`",
  DateInterval: "src/psr/SimpleCache/DateInterval.ts",
  UnitEnum: "the structural `UnitEnum`",
  Throwable: "the JS `Error`",
  Countable: "the structural `Countable`",
  ArrayAccess: "the structural `ArrayAccess`",
  IteratorAggregate: "the structural `IteratorAggregate`",
  Stringable: "the structural `Stringable`",
  stdClass: "the structural `StdClass`",
  Exception: "@xaravel/runtime/php's `Exception`",
  RuntimeException: "@xaravel/runtime/php's `RuntimeException`",
  InvalidArgumentException: "@xaravel/runtime/php's `InvalidArgumentException`",
  LogicException: "@xaravel/runtime/php's `LogicException`",
};

/** The kebab-case subpath of an Upstream namespace (`JsonSchema` → `json-schema`). */
function kebab(ns: string): string {
  return ns.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * The FQCN → import path (relative to a contract file) of each structural type: the FQCN that opens its header
 * comment. `DateInterval` and `CarbonInterval` are `src/psr/SimpleCache/DateInterval.ts`.
 */
function structuralFiles(): Map<string, string> {
  const files = new Map<string, string>([
    ["DateInterval", "../psr/SimpleCache/DateInterval"],
    ["Carbon\\CarbonInterval", "../psr/SimpleCache/DateInterval"],
  ]);
  for (const entry of readdirSync(join(PACKAGE, "src", "structural")).filter((name) => name.endsWith(".ts"))) {
    const header = /^\/\/ ([A-Za-z][\w]*(?:\\[\w]+)+)/.exec(readFileSync(join(PACKAGE, "src", "structural", entry), "utf8"));
    if (header?.[1] !== undefined) {
      files.set(header[1], `../structural/${entry.replace(/\.ts$/, "")}`);
    }
  }
  return files;
}

/**
 * The concrete classes an Upstream contract file names, each with its local name: its `use` lines, and the fully
 * qualified `\Illuminate\…`, `\Symfony\…`, `\Psr\Http\…` and `\Carbon\…` names in its text, except
 * `Illuminate\Contracts\…` and the PSR interfaces `@xaravel/contracts/psr` ports. `@throws` lines are left out: an
 * exception a contract documents is no type it names in a signature, and its own package ports it.
 */
function concreteNames(source: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const match of source.matchAll(/^use\s+([\w\\]+)(?:\s+as\s+(\w+))?;/gm)) {
    const name = match[1] ?? "";
    names.set(name, match[2] ?? name.slice(name.lastIndexOf("\\") + 1));
  }
  for (const line of source.split("\n").filter((text) => !text.includes("@throws"))) {
    for (const match of line.matchAll(/\\((?:Illuminate|Symfony|Psr\\Http|Carbon)\\[\w\\]+)/g)) {
      const name = match[1] ?? "";
      names.set(name, names.get(name) ?? name);
    }
  }
  for (const name of names.keys()) {
    if (name.startsWith("Illuminate\\Contracts\\") || /^Psr\\(Container|SimpleCache|Log)\\/.test(name)) {
      names.delete(name);
    }
  }
  return names;
}

/** Whether `name` (or its `use` alias `local`) is in a `@param` / `@return` line or a `function` declaration. */
function inSignature(source: string, name: string, local: string): boolean {
  const word = new RegExp(`(?<![\\w\\\\])${local}\\b`);
  return source.split("\n").some((line) => (/@param|@return|\bfunction\b/.test(line) && (line.includes(`\\${name}`) || word.test(line))));
}

/**
 * Whether a port names `local` in a method signature: a line declaring a method (`name(`, or `name<…>(`), outside
 * comments and import lines.
 */
function usedInSignature(port: string, local: string): boolean {
  const word = new RegExp(`(?<![\\w$])${local}\\b`);
  return port.split("\n").some((line) => {
    const text = line.trim();
    return !/^(\/\/|\/\*|\*|import\b)/.test(text) && /\w+\s*(<[^>]*>)?\s*\(/.test(text) && word.test(text);
  });
}

/** The fixture's shared part: a dispatcher and a responsable, and a request-shaped object literal. */
const PRELUDE = `import type { Dispatcher } from "@xaravel/contracts/bus";
import type { Application } from "@xaravel/contracts/foundation";
import type { Responsable } from "@xaravel/contracts/support";

declare const app: Application;
declare const dispatcher: Dispatcher;
declare const responsable: Responsable;

export const terminatingApp = app.terminating(() => {});

export const response = responsable.toResponse({
  method: () => "GET",
  root: () => "http://localhost",
  url: () => "http://localhost/users",
  fullUrl: () => "http://localhost/users?page=2",
  path: () => "users",
  ajax: () => false,
});
`;

/** A local class shaped like Laravel's `Collection` subset; `withIsEmpty` false drops `isEmpty()`. */
function collectionClass(withIsEmpty: boolean): string {
  return `
export class Jobs {
  readonly #items: unknown[] = ["ProcessPodcast", "OptimizePodcast"];

  all(): unknown[] {
    return [...this.#items];
  }
${withIsEmpty ? "\n  isEmpty(): boolean {\n    return this.#items.length === 0;\n  }\n" : ""}
  toArray(): unknown[] {
    return this.all();
  }

  count(): number {
    return this.#items.length;
  }

  *[Symbol.iterator](): Iterator<unknown> {
    yield* this.#items;
  }
}

export const chain = dispatcher.chain(new Jobs());
`;
}

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

xaravelTest(
  "XT-contracts-6",
  "@xaravel/contracts imports only @xaravel/runtime and its own files and depends only on @xaravel/runtime; a concrete type a contract names is a structural interface inside contracts, so a local Collection-shaped class passed to Bus\\Dispatcher.chain and a Request-shaped object passed to Support\\Responsable.toResponse compile under the pinned tsc -b, and a class missing a required structural member fails with TS2345; every concrete class an Upstream contract file of the 19 namespaces names is a src/structural/ type (or a PHP built-in's Xaravel form) that the port imports where the class is in a signature, and a sync-only callback type rejects an async terminating callback (AD-1.2)",
  async () => {
    // Imports: the runtime package, its subpaths, or a relative path that stays inside the package.
    const files = sourceFiles(join(PACKAGE, "src"));
    Assert.assertNotEmpty(files);
    for (const file of files) {
      for (const specifier of specifiers(readFileSync(file, "utf8"))) {
        const where = `${relative(PACKAGE, file)} imports ${specifier}`;
        if (specifier.startsWith(".")) {
          Assert.assertFalse(relative(PACKAGE, resolve(dirname(file), specifier)).startsWith(".."), where);
        } else {
          Assert.assertTrue(specifier === "@xaravel/runtime" || specifier.startsWith("@xaravel/runtime/"), where);
        }
      }
    }
    const manifest = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as { readonly dependencies?: Record<string, string> };
    Assert.assertSame(JSON.stringify({ "@xaravel/runtime": "workspace:*" }), JSON.stringify(manifest.dependencies ?? null));

    // Every concrete class an Upstream contract file names is a structural type (or a PHP built-in's Xaravel form),
    // and the contract file imports it when the class is in a signature. The Upstream snapshot is gitignored and synced
    // by `bun run upstream:sync`; CI's `check` job does not sync it, so there this part warns and is left to local runs
    // (`bun run harness`, `story:check`), as scans.test.ts's XT-conformance-248 does.
    const structural = structuralFiles();
    const upstreamSynced = existsSync(join(REPO, "conformance", "upstream", "framework", "src", "Illuminate", "Contracts"));
    if (!upstreamSynced) {
      console.warn("structural.test.ts: conformance/upstream is not synced; the Upstream concrete-class check is skipped");
    }
    for (const ns of upstreamSynced ? NAMESPACES : []) {
      const dir = join(REPO, "conformance", "upstream", "framework", "src", "Illuminate", "Contracts", ns);
      for (const entry of readdirSync(dir).filter((name) => name.endsWith(".php"))) {
        const source = readFileSync(join(dir, entry), "utf8");
        const port = readFileSync(join(PACKAGE, "src", kebab(ns), entry.replace(/\.php$/, ".ts")), "utf8");
        for (const [name, local] of concreteNames(source)) {
          const where = `Illuminate\\Contracts\\${ns}\\${entry} names ${name}`;
          if (Object.hasOwn(PHP_BUILTINS, name)) {
            continue;
          }
          const file = structural.get(name) ?? null;
          Assert.assertNotNull(file, `${where}, which no src/structural/ header names`);
          if (file !== null && inSignature(source, name, local)) {
            Assert.assertStringContainsString(`from "${file}"`, port, `${where} in a signature; its port imports ${file}`);
            const structuralName = file.slice(file.lastIndexOf("/") + 1);
            Assert.assertTrue(usedInSignature(port, structuralName), `${where} in a signature; its port declares ${structuralName} in a method signature`);
          }
        }
      }
    }

    // Structural compile: the shapes are accepted, and a missing member is a TS2345.
    const tmp = mkdtempSync(join(tmpdir(), "xaravel-contract-structural-"));
    try {
      copyFileSync(join(REPO, "tsconfig.base.json"), join(tmp, "tsconfig.base.json"));
      // `@xaravel/runtime`, which the contracts import, is typed against Bun's globals, as every package is.
      writeFileSync(join(tmp, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { typeRoots: [join(REPO, "node_modules", "@types")], types: ["bun"] }, include: ["fixture.ts"] }, null, 2) + "\n");
      mkdirSync(join(tmp, "node_modules", "@xaravel"), { recursive: true });
      symlinkSync(join(REPO, "packages", "contracts"), join(tmp, "node_modules", "@xaravel", "contracts"));
      const fixture = join(tmp, "fixture.ts");

      writeFileSync(fixture, PRELUDE + collectionClass(true));
      const complete = await tscBuild(tmp);
      Assert.assertSame(0, complete.code, complete.output);

      writeFileSync(fixture, PRELUDE + collectionClass(false));
      const missing = await tscBuild(tmp);
      Assert.assertNotEquals(0, missing.code);
      const codes = [...missing.output.matchAll(/error (TS\d+)/g)].map((match) => match[1]);
      Assert.assertNotEmpty(codes, missing.output);
      for (const code of codes) {
        Assert.assertSame("TS2345", code, missing.output);
      }
      Assert.assertStringContainsString("isEmpty", missing.output);

      // A sync-only callback (SyncClosure): an async terminating callback is a TS2345.
      writeFileSync(fixture, PRELUDE + collectionClass(true) + "\nexport const asyncTerminating = app.terminating(async () => {});\n");
      const asyncCallback = await tscBuild(tmp);
      Assert.assertNotEquals(0, asyncCallback.code);
      const asyncCodes = [...asyncCallback.output.matchAll(/error (TS\d+)/g)].map((match) => match[1]);
      Assert.assertSame(JSON.stringify(["TS2345"]), JSON.stringify(asyncCodes), asyncCallback.output);
      Assert.assertStringContainsString("fixture.ts", asyncCallback.output);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
  120_000,
);
