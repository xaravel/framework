// Xaravel Tests for Story 1.3 (dependency-graph check).
// These run under plain `bun test` until the harness lands in Epic 5.
import { expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkGraph } from "../../../tools/graph/graph";
import { readTable } from "../../../tools/scaffold/table";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");

interface FixturePackage {
  phase?: number;
  kind?: string;
  /** The table row's npm name; defaults to `@xaravel/<name>`. */
  npm?: string;
  manifest?: Record<string, unknown>;
  /** Leave the package without a package.json. */
  noManifest?: boolean;
  /** Source files, keyed by path relative to the package directory. */
  files?: Record<string, string>;
}

const workspace = (...names: string[]): Record<string, string> => Object.fromEntries(names.map((name) => [name, "workspace:*"]));

/** Writes a hermetic root: the package table, each package.json and its source files. */
function fixture(packages: Record<string, FixturePackage>): string {
  const tmp = mkdtempSync(join(tmpdir(), "xaravel-graph-"));
  const rows = Object.keys(packages)
    .sort()
    .map((name) => {
      const pkg = packages[name]!;
      return {
        name,
        dir: `packages/${name}`,
        npm: pkg.npm ?? `@xaravel/${name}`,
        phase: pkg.phase ?? 1,
        kind: pkg.kind ?? "upstream",
        upstream: null,
        private: false,
        require: [],
        suggest: [],
      };
    });
  mkdirSync(join(tmp, "tools", "scaffold"), { recursive: true });
  writeFileSync(join(tmp, "tools", "scaffold", "packages.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  for (const row of rows) {
    const pkg = packages[row.name]!;
    const dir = join(tmp, row.dir);
    mkdirSync(dir, { recursive: true });
    if (pkg.noManifest !== true) {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: row.npm, version: "0.0.0", type: "module", ...pkg.manifest }, null, 2) + "\n");
    }
    for (const [path, content] of Object.entries(pkg.files ?? {})) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
  }
  return tmp;
}

async function runCli(dir: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, join(root, "tools", "graph", "graph.ts"), "--root", dir], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

async function withFixtures(fixtures: Record<string, FixturePackage>[], body: (dirs: string[]) => Promise<void>): Promise<void> {
  const dirs = fixtures.map(fixture);
  try {
    await body(dirs);
  } finally {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

xaravelTest("XT-conformance-11", "a dependency cycle between packages fails the graph check and is printed once, starting at its smallest name; self-dependencies are cycles and peers are not edges (AD-2)", async () => {
  await withFixtures(
    [
      { a: { npm: "@x/a", manifest: { dependencies: workspace("@x/b") } }, b: { npm: "@x/b", manifest: { dependencies: workspace("@x/a") } } },
      {
        a: { manifest: { dependencies: workspace("@xaravel/b") } },
        b: { manifest: { dependencies: workspace("@xaravel/c") } },
        c: { manifest: { dependencies: workspace("@xaravel/a") } },
        d: { manifest: { dependencies: workspace("@xaravel/d") } },
      },
      // One strongly connected group holding two cycles.
      {
        a: { manifest: { dependencies: workspace("@xaravel/b", "@xaravel/c") } },
        b: { manifest: { dependencies: workspace("@xaravel/a") } },
        c: { manifest: { dependencies: workspace("@xaravel/a") } },
      },
      // support ⇄ filesystem shape: a peer pointing back is not a cycle.
      {
        a: { manifest: { dependencies: workspace("@xaravel/b") } },
        b: { manifest: { peerDependencies: workspace("@xaravel/a"), peerDependenciesMeta: { "@xaravel/a": { optional: true } } } },
      },
    ],
    async ([pair, triangle, group, peer]) => {
      expect(checkGraph(pair!)).toEqual(["cycle: @x/a -> @x/b -> @x/a"]);
      expect(checkGraph(triangle!)).toEqual(["cycle: @xaravel/a -> @xaravel/b -> @xaravel/c -> @xaravel/a", "cycle: @xaravel/d -> @xaravel/d"]);
      expect(checkGraph(group!)).toEqual(["cycle: @xaravel/a -> @xaravel/b -> @xaravel/a", "cycle: @xaravel/a -> @xaravel/c -> @xaravel/a"]);
      expect(checkGraph(peer!)).toEqual([]);

      const failing = await runCli(pair!);
      expect(failing.code).toBe(1);
      expect(failing.stderr).toContain("cycle: @x/a -> @x/b -> @x/a");
      const passing = await runCli(peer!);
      expect(passing).toMatchObject({ code: 0, stdout: "Dependency graph OK (2 packages).\n" });
    },
  );
});

xaravelTest("XT-conformance-12", "a static import of a package not in the importer's dependencies fails, naming the file, the import and the missing dependency; peers pass only through a guarded import() (AD-2)", async () => {
  await withFixtures(
    [
      {
        a: {
          files: {
            "src/i.ts": 'import { B } from "@xaravel/b";\nexport { B };\n',
            "src/deep/j.ts": 'export * from "@xaravel/b/y";\n',
            "src/m.mts": 'import { B } from "@xaravel/b/m";\nexport { B };\n',
            "src/v.tsx": 'import { B } from "@xaravel/b/v";\nexport const view = <div title="v">{String(B)}</div>;\n',
            "src/p.mjs": 'import { B } from "@xaravel/b/p";\nexport { B };\n',
          },
        },
        b: {},
      },
      {
        a: {
          manifest: { peerDependencies: workspace("@xaravel/b"), peerDependenciesMeta: { "@xaravel/b": { optional: true } } },
          files: { "src/static.ts": 'import "@xaravel/b";\n' },
        },
        b: {},
      },
      {
        a: {
          manifest: { peerDependencies: workspace("@xaravel/b"), peerDependenciesMeta: { "@xaravel/b": { optional: true } } },
          files: { "src/dyn.ts": 'export async function load() {\n  return await import("@xaravel/c/sub");\n}\n' },
        },
        b: {},
        c: {},
      },
      {
        a: { files: { "src/net.ts": 'import WebSocket from "ws";\nimport "undici";\nexport { WebSocket };\n' } },
      },
      {
        a: { manifest: { dependencies: workspace("@xaravel/b") }, files: { "src/c.cjs": 'module.exports = require("third-party");\n' } },
        b: {},
      },
      {
        a: {
          manifest: { peerDependencies: workspace("@xaravel/b"), peerDependenciesMeta: { "@xaravel/b": { optional: true } } },
          files: {
            "src/guarded.ts": 'export async function load() {\n  return await import("@xaravel/b");\n}\n',
            "src/own.ts": 'export { x } from "@xaravel/a/sub";\n',
            "src/builtins.ts": 'import { join } from "node:path";\nimport { readFileSync } from "fs";\nimport "fs/promises";\nimport { $ } from "bun";\nimport { Database } from "bun:sqlite";\nimport x from "#internal";\nimport y from "./local";\nexport { join, readFileSync, $, Database, x, y };\n',
            "src/types.ts": 'import type { B } from "@xaravel/b";\nexport type { B };\n// import "@xaravel/c";\nexport const s = "import \\"@xaravel/c\\"";\n',
            "README.md": 'import "@xaravel/c";\n',
          },
        },
        b: {},
      },
    ],
    async ([undeclared, staticPeer, undeclaredDynamic, notBuiltin, thirdParty, passing]) => {
      expect(checkGraph(undeclared!)).toEqual([
        'undeclared import: packages/a/src/deep/j.ts imports "@xaravel/b/y", but @xaravel/b is not in @xaravel/a dependencies',
        'undeclared import: packages/a/src/i.ts imports "@xaravel/b", but @xaravel/b is not in @xaravel/a dependencies',
        'undeclared import: packages/a/src/m.mts imports "@xaravel/b/m", but @xaravel/b is not in @xaravel/a dependencies',
        'undeclared import: packages/a/src/p.mjs imports "@xaravel/b/p", but @xaravel/b is not in @xaravel/a dependencies',
        'undeclared import: packages/a/src/v.tsx imports "@xaravel/b/v", but @xaravel/b is not in @xaravel/a dependencies',
        // Bun's scanImports reports the JSX runtime it injects for JSX: a real runtime edge.
        'undeclared import: packages/a/src/v.tsx imports "react", but react is not in @xaravel/a dependencies',
        'undeclared import: packages/a/src/v.tsx imports "react/jsx-dev-runtime", but react is not in @xaravel/a dependencies',
      ]);
      expect(checkGraph(staticPeer!)).toEqual([
        'undeclared import: packages/a/src/static.ts imports "@xaravel/b", but @xaravel/b is not in @xaravel/a dependencies',
      ]);
      expect(checkGraph(undeclaredDynamic!)).toEqual([
        'undeclared import: packages/a/src/dyn.ts imports "@xaravel/c/sub", but @xaravel/c is not in @xaravel/a dependencies or peerDependencies',
      ]);
      // `ws` and `undici` are in Bun's builtinModules but are npm packages.
      expect(checkGraph(notBuiltin!)).toEqual([
        'undeclared import: packages/a/src/net.ts imports "undici", but undici is not in @xaravel/a dependencies',
        'undeclared import: packages/a/src/net.ts imports "ws", but ws is not in @xaravel/a dependencies',
      ]);
      expect(checkGraph(thirdParty!)).toEqual([
        'undeclared import: packages/a/src/c.cjs imports "third-party", but third-party is not in @xaravel/a dependencies',
      ]);
      expect(checkGraph(passing!)).toEqual([]);

      const failing = await runCli(undeclared!);
      expect(failing.code).toBe(1);
      expect(failing.stderr).toContain('packages/a/src/i.ts imports "@xaravel/b", but @xaravel/b is not in @xaravel/a dependencies');
      expect((await runCli(staticPeer!)).code).toBe(1);
      expect((await runCli(passing!)).code).toBe(0);
    },
  );
});

xaravelTest("XT-conformance-13", "Foundation depending on a later-Phase package fails the graph check under AD-2; same-or-earlier Phases and later-Phase optional peers pass; runtime depends on nothing and contracts only on runtime (AD-2)", async () => {
  const base = {
    routing: { phase: 6 },
    database: { phase: 4 },
    console: { phase: 7 },
  };
  await withFixtures(
    [
      { ...base, foundation: { phase: 6, manifest: { dependencies: workspace("@xaravel/routing", "@xaravel/console") } } },
      {
        ...base,
        foundation: {
          phase: 6,
          manifest: {
            dependencies: workspace("@xaravel/routing", "@xaravel/database"),
            peerDependencies: workspace("@xaravel/console"),
            peerDependenciesMeta: { "@xaravel/console": { optional: true } },
          },
        },
      },
      {
        runtime: { phase: 1, kind: "xaravel", manifest: { dependencies: workspace("@xaravel/support"), peerDependencies: workspace("@xaravel/contracts") } },
        contracts: { phase: 1, manifest: { dependencies: workspace("@xaravel/runtime", "@xaravel/support"), optionalDependencies: workspace("@xaravel/collections") } },
        support: { phase: 2 },
        collections: { phase: 1 },
      },
      {
        runtime: { phase: 1, kind: "xaravel" },
        contracts: { phase: 1, manifest: { dependencies: workspace("@xaravel/runtime") } },
      },
    ],
    async ([later, earlier, layers, layered]) => {
      const expected =
        "foundation phase: @xaravel/foundation (Phase 6) depends on @xaravel/console (Phase 7); Foundation may depend only on Components of its own or earlier Phases (AD-2)";
      expect(checkGraph(later!)).toEqual([expected]);
      expect(checkGraph(earlier!)).toEqual([]);
      expect(checkGraph(layers!)).toEqual([
        "layer edge: @xaravel/contracts lists @xaravel/collections in optionalDependencies; @xaravel/contracts may depend only on @xaravel/runtime (AD-2)",
        "layer edge: @xaravel/contracts lists @xaravel/support in dependencies; @xaravel/contracts may depend only on @xaravel/runtime (AD-2)",
        "layer edge: @xaravel/runtime lists @xaravel/contracts in peerDependencies; @xaravel/runtime may depend on no workspace package (AD-2)",
        "layer edge: @xaravel/runtime lists @xaravel/support in dependencies; @xaravel/runtime may depend on no workspace package (AD-2)",
      ]);
      expect(checkGraph(layered!)).toEqual([]);

      const failing = await runCli(later!);
      expect(failing.code).toBe(1);
      expect(failing.stderr).toContain(expected);
      expect((await runCli(earlier!)).code).toBe(0);
      expect((await runCli(layers!)).code).toBe(1);
      expect((await runCli(layered!)).code).toBe(0);
    },
  );
});

xaravelTest("XT-conformance-14", "a graded package with a runtime edge to a grader package fails; only testing -> mockery (dependency) and support -> mockery (optional peer) pass, and devDependencies on the grader always pass; a grader package depends on nothing graded (AD-2, AD-15.9)", async () => {
  const graders = { assert: { phase: 0, kind: "grader" }, mockery: { phase: 0, kind: "grader" } };
  const optionalMockery = { peerDependencies: workspace("@xaravel/mockery"), peerDependenciesMeta: { "@xaravel/mockery": { optional: true } } };
  await withFixtures(
    [
      { ...graders, cache: { phase: 5, manifest: { dependencies: workspace("@xaravel/assert") } } },
      {
        ...graders,
        testing: { phase: 7, manifest: { dependencies: workspace("@xaravel/mockery") } },
        support: { phase: 2, manifest: optionalMockery },
        cache: { phase: 5, manifest: { devDependencies: workspace("@xaravel/assert", "@xaravel/mockery") } },
      },
      { ...graders, support: { phase: 2, manifest: { peerDependencies: workspace("@xaravel/mockery") } } },
      {
        ...graders,
        testing: { phase: 7, manifest: { dependencies: workspace("@xaravel/assert") } },
        support: { phase: 2, manifest: { dependencies: workspace("@xaravel/mockery") } },
        cache: { phase: 5, manifest: { ...optionalMockery, optionalDependencies: workspace("@xaravel/assert") } },
      },
      {
        assert: { phase: 0, kind: "grader", manifest: { dependencies: workspace("@xaravel/mockery", "@xaravel/support") } },
        mockery: { phase: 0, kind: "grader", manifest: { peerDependencies: workspace("@xaravel/support") } },
        support: { phase: 2 },
      },
    ],
    async ([runtime, allowed, requiredPeer, misplaced, graderGraded]) => {
      const exceptions =
        "graded packages may take grader packages only as devDependencies, except @xaravel/testing -> @xaravel/mockery (dependency) and @xaravel/support -> @xaravel/mockery (optional peer) (AD-2)";
      expect(checkGraph(runtime!)).toEqual([`grader edge: @xaravel/cache lists @xaravel/assert in dependencies; ${exceptions}`]);
      expect(checkGraph(allowed!)).toEqual([]);
      expect(checkGraph(requiredPeer!)).toEqual([`grader edge: @xaravel/support lists @xaravel/mockery in peerDependencies; ${exceptions}`]);
      expect(checkGraph(misplaced!)).toEqual([
        `grader edge: @xaravel/cache lists @xaravel/assert in optionalDependencies; ${exceptions}`,
        `grader edge: @xaravel/cache lists @xaravel/mockery in peerDependencies; ${exceptions}`,
        `grader edge: @xaravel/support lists @xaravel/mockery in dependencies; ${exceptions}`,
        `grader edge: @xaravel/testing lists @xaravel/assert in dependencies; ${exceptions}`,
      ]);
      expect(checkGraph(graderGraded!)).toEqual([
        "layer edge: @xaravel/assert lists @xaravel/support in dependencies; grader packages may depend on nothing graded (AD-2)",
        "layer edge: @xaravel/mockery lists @xaravel/support in peerDependencies; grader packages may depend on nothing graded (AD-2)",
      ]);

      const failing = await runCli(runtime!);
      expect(failing.code).toBe(1);
      expect(failing.stderr).toContain("grader edge: @xaravel/cache lists @xaravel/assert in dependencies");
      expect((await runCli(requiredPeer!)).code).toBe(1);
      expect((await runCli(graderGraded!)).code).toBe(1);
      expect((await runCli(allowed!)).code).toBe(0);
    },
  );
});

xaravelTest("XT-conformance-15", "a dev-only edge from test files to an earlier-Phase package is left out of the cycle check and passes; a later-Phase devDependency fails (AD-2 Tests)", async () => {
  await withFixtures(
    [
      {
        assert: { phase: 0, kind: "grader" },
        // The earlier-Phase devDependency depends back on the importer: not a cycle.
        collections: { phase: 1, manifest: { dependencies: workspace("@xaravel/support") } },
        support: {
          phase: 2,
          manifest: { devDependencies: workspace("@xaravel/collections", "@xaravel/assert") },
          files: {
            "tests/xaravel/uses-collections.test.ts": 'import { Collection } from "@xaravel/collections";\nimport { assertSame } from "@xaravel/assert/sub";\nexport { Collection, assertSame };\n',
          },
        },
      },
      {
        support: { phase: 2, manifest: { dependencies: workspace("@xaravel/collections") } },
        collections: {
          phase: 1,
          manifest: { devDependencies: workspace("@xaravel/support") },
          files: { "tests/xaravel/uses-support.test.ts": 'import { Str } from "@xaravel/support";\nexport { Str };\n' },
        },
      },
      {
        support: { phase: 2 },
        collections: { phase: 1, files: { "tests/ported/x.test.ts": 'import "@xaravel/support";\n' } },
      },
      {
        support: { phase: 2, manifest: { devDependencies: workspace("@xaravel/collections") }, files: { "src/x.ts": 'import "@xaravel/collections";\n' } },
        collections: { phase: 1 },
      },
    ],
    async ([earlier, later, undeclared, devInSrc]) => {
      expect(checkGraph(earlier!)).toEqual([]);
      expect(checkGraph(later!)).toEqual([
        "test edge phase: @xaravel/collections (Phase 1) lists @xaravel/support (Phase 2) in devDependencies; tests may import only grader packages and packages of the same or an earlier Phase (AD-2)",
      ]);
      expect(checkGraph(undeclared!)).toEqual([
        'undeclared import: packages/collections/tests/ported/x.test.ts imports "@xaravel/support", but @xaravel/support is not in @xaravel/collections dependencies or devDependencies',
      ]);
      // A devDependency does not license a src/** import.
      expect(checkGraph(devInSrc!)).toEqual([
        'undeclared import: packages/support/src/x.ts imports "@xaravel/collections", but @xaravel/collections is not in @xaravel/support dependencies',
      ]);

      const failing = await runCli(later!);
      expect(failing.code).toBe(1);
      expect(failing.stderr).toContain("test edge phase: @xaravel/collections (Phase 1) lists @xaravel/support (Phase 2)");
      expect((await runCli(earlier!)).code).toBe(0);
    },
  );
});

xaravelTest("XT-conformance-16", "a dependency declared but never imported passes the graph check, and the committed repo passes; a missing package.json and an unparseable source are violations (AD-2)", async () => {
  await withFixtures(
    [
      { collections: {}, support: { phase: 2, manifest: { dependencies: workspace("@xaravel/collections") }, files: { "src/index.ts": "export {};\n" } } },
      { support: { phase: 2, manifest: { dependencies: workspace("@xaravel/collections") } } },
      { collections: { noManifest: true }, support: { phase: 2 } },
      { support: { phase: 2, files: { "src/broken.ts": "export const = ;\n" } } },
    ],
    async ([unused, unknown, noManifest, unparseable]) => {
      expect(checkGraph(unused!)).toEqual([]);
      expect(await runCli(unused!)).toMatchObject({ code: 0, stdout: "Dependency graph OK (2 packages).\n" });
      expect(checkGraph(unknown!)).toEqual([
        "unknown package: @xaravel/support lists @xaravel/collections in dependencies, but @xaravel/collections has no row in tools/scaffold/packages.jsonl",
      ]);
      expect((await runCli(unknown!)).code).toBe(1);
      const missing = "missing package.json: packages/collections/package.json (@xaravel/collections is in tools/scaffold/packages.jsonl)";
      expect(checkGraph(noManifest!)).toEqual([missing]);
      const missingCli = await runCli(noManifest!);
      expect(missingCli.code).toBe(1);
      expect(missingCli.stderr).toContain(missing);
      const broken = "unparseable source: packages/support/src/broken.ts: Failed to scan imports";
      expect(checkGraph(unparseable!)).toEqual([broken]);
      const brokenCli = await runCli(unparseable!);
      expect(brokenCli.code).toBe(1);
      expect(brokenCli.stderr).toContain(broken);
    },
  );

  expect(checkGraph(root)).toEqual([]);
  const repo = await runCli(root);
  const count = readTable(join(root, "tools", "scaffold", "packages.jsonl")).length;
  expect(repo).toMatchObject({ code: 0, stdout: `Dependency graph OK (${count} packages).\n` });
});
