// Xaravel Tests for Story 1.2 (package scaffolder and every package scaffolded).
// These run under plain `bun test` until the harness lands in Epic 5.
import { expect } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkTsconfigs, generateTsconfig, scaffold } from "../../../tools/scaffold/scaffold";
import { buildTable, kebab, UPSTREAM_PHASES, type PackageRow } from "../../../tools/scaffold/table";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const tablePath = join(root, "tools", "scaffold", "packages.jsonl");

interface Row {
  name: string;
  dir: string;
  npm: string;
  phase: number;
  kind: string;
  upstream: string | null;
  private: boolean;
  require: string[];
  suggest: string[];
}

type Manifest = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

const UPSTREAM_WITH_COMPOSER = [
  "auth", "broadcasting", "bus", "cache", "collections", "concurrency", "conditionable", "config", "console",
  "container", "contracts", "cookie", "database", "encryption", "events", "filesystem", "hashing", "http", "image",
  "json-schema", "log", "macroable", "mail", "notifications", "pagination", "pipeline", "process", "queue", "redis",
  "reflection", "routing", "session", "support", "testing", "translation", "validation", "view",
];
const OTHER_ROWS: Record<string, string> = {
  foundation: "packages/foundation",
  runtime: "packages/runtime",
  "http-foundation": "packages/http-foundation",
  mime: "packages/mime",
  finder: "packages/finder",
  "serializable-closure": "packages/serializable-closure",
  htmx: "packages/htmx",
  testbench: "packages/testbench",
  framework: "packages/framework",
  mcp: "packages/mcp",
  boost: "packages/boost",
  ai: "packages/ai",
  assert: "packages/assert",
  mockery: "packages/mockery",
  "create-xaravel": "installer",
  "boost-framework": "tools/boost-framework",
};
const FIELDS = ["name", "dir", "npm", "phase", "kind", "upstream", "private", "require", "suggest"];

function readJsonl(path: string): Row[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Row);
}

function readTableFile(): Row[] {
  return readJsonl(tablePath);
}

function readJson<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function npmOf(rows: readonly Row[], upstream: string): string {
  const row = rows.find((candidate) => candidate.upstream === upstream);
  if (row === undefined) {
    throw new Error(`no row ports ${upstream}`);
  }
  return row.npm;
}

xaravelTest("XT-conformance-6", "packages.jsonl has the 53 package rows, sorted, with Phase and the Pin's illuminate/* require/suggest, and Foundation's edges from its imports (AD-2, AD-27)", async () => {
  const text = readFileSync(tablePath, "utf8");
  expect(text.includes("\r")).toBe(false);
  expect(text.endsWith("\n")).toBe(true);
  const lines = text.split("\n").slice(0, -1);
  expect(lines.length).toBe(53);
  const rows = lines.map((line) => JSON.parse(line) as Row);

  const names = rows.map((row) => row.name);
  expect(names).toEqual(sorted(names));
  expect(new Set(names).size).toBe(names.length);
  expect(sorted(names)).toEqual(sorted([...UPSTREAM_WITH_COMPOSER, ...Object.keys(OTHER_ROWS)]));

  const upstreams = new Set(rows.map((row) => row.upstream));
  for (const row of rows) {
    expect(Object.keys(row)).toEqual(FIELDS);
    expect(Number.isInteger(row.phase) && row.phase >= 0 && row.phase <= 9).toBe(true);
    expect(["upstream", "xaravel", "grader", "distribution"]).toContain(row.kind);
    expect(row.upstream === null || typeof row.upstream === "string").toBe(true);
    expect(typeof row.private).toBe("boolean");
    for (const list of [row.require, row.suggest]) {
      expect(list).toEqual(sorted([...new Set(list)]));
      for (const edge of list) {
        expect(edge.startsWith("illuminate/")).toBe(true);
        expect(upstreams.has(edge)).toBe(true);
      }
    }
    if (UPSTREAM_WITH_COMPOSER.includes(row.name)) {
      expect(row).toMatchObject({ dir: `packages/${row.name}`, npm: `@xaravel/${row.name}`, kind: "upstream", upstream: `illuminate/${row.name}` });
    } else if (row.name !== "foundation") {
      expect(row.dir).toBe(OTHER_ROWS[row.name]!);
      expect(row.require).toEqual([]);
      expect(row.suggest).toEqual([]);
    }
  }

  const byName = new Map(rows.map((row) => [row.name, row]));
  expect(byName.get("json-schema")!.dir).toBe("packages/json-schema");
  expect(byName.get("support")!.require).toEqual([
    "illuminate/collections",
    "illuminate/conditionable",
    "illuminate/contracts",
    "illuminate/macroable",
    "illuminate/reflection",
  ]);
  expect(byName.get("support")!.suggest).toEqual(["illuminate/filesystem"]);
  for (const [name, phase] of Object.entries({ assert: 0, mockery: 0, "boost-framework": 0, runtime: 1, contracts: 1, support: 2, finder: 3, database: 4, cache: 5, foundation: 6, htmx: 6, console: 7, testbench: 7, queue: 8, mcp: 8, ai: 9 })) {
    expect(`${name}:${byName.get(name)!.phase}`).toBe(`${name}:${phase}`);
  }

  // Foundation: own-or-earlier Phase imports are `require`, later ones `suggest`.
  const phaseOf = new Map(rows.map((row) => [row.upstream, row.phase]));
  const foundation = byName.get("foundation")!;
  expect(foundation.upstream).toBe("illuminate/foundation");
  expect(foundation.require.length).toBeGreaterThan(0);
  expect(foundation.suggest.length).toBeGreaterThan(0);
  expect(foundation.require).toContain("illuminate/routing");
  expect(foundation.suggest).toContain("illuminate/console");
  for (const edge of foundation.require) {
    expect(phaseOf.get(edge)! <= foundation.phase).toBe(true);
  }
  for (const edge of foundation.suggest) {
    expect(phaseOf.get(edge)! > foundation.phase).toBe(true);
  }

  // The committed table equals the one built from the Upstream snapshot, when it has been synced.
  if (existsSync(join(root, "conformance", "upstream", "framework"))) {
    const proc = Bun.spawn([process.execPath, join(root, "tools", "scaffold", "table.ts"), "--check"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    if (code !== 0) {
      throw new Error(`table.ts --check exited ${code}:\n${stderr}`);
    }
  }
  // Hermetic derivation check on a fixture Upstream snapshot (no checkout needed).
  const fixtureRoot = mkdtempSync(join(tmpdir(), "xaravel-upstream-"));
  const fixture = join(fixtureRoot, "conformance", "upstream", "framework");
  try {
    // With no snapshot, table.ts fails with the sync hint.
    const unsynced = Bun.spawnSync([process.execPath, join(root, "tools", "scaffold", "table.ts"), "--root", fixtureRoot, "--check"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(unsynced.exitCode).toBe(1);
    expect(unsynced.stderr.toString()).toContain("conformance/upstream/framework is missing; run bun run upstream:sync");

    const illuminate = join(fixture, "src", "Illuminate");
    for (const dir of Object.keys(UPSTREAM_PHASES)) {
      mkdirSync(join(illuminate, dir), { recursive: true });
      if (dir === "Foundation") {
        continue;
      }
      const prefix = dir === "Collections" ? "Illuminate\\Support\\" : `Illuminate\\${dir}\\`;
      const composer: Record<string, unknown> = { name: `illuminate/${kebab(dir)}`, autoload: { "psr-4": { [prefix]: "" } } };
      if (dir === "Support") {
        composer.require = { php: "^8.3", "illuminate/contracts": "^13.0", "illuminate/collections": "^13.0", "symfony/polyfill-php85": "^1.33" };
        composer.suggest = { "illuminate/filesystem": "Required for X.", "league/uri": "Required for Y." };
      }
      writeFileSync(join(illuminate, dir, "composer.json"), JSON.stringify(composer));
    }
    writeFileSync(join(illuminate, "Routing", "Router.php"), "<?php\nnamespace Illuminate\\Routing;\nclass Router {}\n");
    writeFileSync(join(illuminate, "Console", "Command.php"), "<?php\nnamespace Illuminate\\Console;\nclass Command {}\n");
    writeFileSync(join(illuminate, "Collections", "Collection.php"), "<?php\nnamespace Illuminate\\Support;\nclass Collection {}\n");
    writeFileSync(
      join(illuminate, "Foundation", "Application.php"),
      "<?php\nnamespace Illuminate\\Foundation;\nuse Illuminate\\Routing\\Router;\nuse Illuminate\\Console\\Command;\nuse Illuminate\\Support\\Collection;\nuse Illuminate\\Foundation\\Other;\n$x = 'Illuminate\\\\Routing\\\\Router';\n",
    );

    const built = buildTable(fixture);
    expect(built.length).toBe(53);
    const fixtureRow = (name: string) => built.find((row) => row.name === name)!;
    expect(fixtureRow("support").require).toEqual(["illuminate/collections", "illuminate/contracts"]);
    expect(fixtureRow("support").suggest).toEqual(["illuminate/filesystem"]);
    expect(fixtureRow("foundation").require).toEqual(["illuminate/collections", "illuminate/routing"]);
    expect(fixtureRow("foundation").suggest).toEqual(["illuminate/console"]);

    const proc = Bun.spawn([process.execPath, join(root, "tools", "scaffold", "table.ts"), "--root", fixtureRoot, "--check"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    expect(code).toBe(1);
    expect(stderr).toContain("packages.jsonl differs from the table built from the Upstream snapshot");
    expect(stderr).toContain('- {"name":"support"');
    expect(stderr).toContain('+ {"name":"support"');

    // Only Foundation may lack a composer.json.
    rmSync(join(illuminate, "Mail", "composer.json"));
    expect(() => buildTable(fixture)).toThrow("Mail has no composer.json");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}, 60_000);

/** XT-7's per-row checks: generated files, manifest fields, README and LICENSE under `base`. */
function assertPackagesGenerated(base: string): void {
  const rows = readJsonl(join(base, "tools", "scaffold", "packages.jsonl"));
  const license = readFileSync(join(base, "LICENSE"), "utf8");
  for (const row of rows) {
    const dir = join(base, row.dir);
    for (const path of ["package.json", "tsconfig.json", "README.md", "LICENSE", "src/index.ts", "tests/ported", "tests/xaravel", "docs"]) {
      if (!existsSync(join(dir, path))) {
        throw new Error(`${row.dir}/${path} is missing`);
      }
    }
    expect(existsSync(join(dir, "bunfig.toml"))).toBe(false);

    const manifest = readJson<Manifest>(join(dir, "package.json"));
    expect(manifest.name).toBe(row.npm);
    expect(manifest.version).toBe("0.0.0");
    expect(typeof manifest.description).toBe("string");
    expect(manifest.license).toBe("MIT");
    expect(manifest.type).toBe("module");
    expect(manifest.engines).toEqual({ bun: ">=1.4" });
    expect(manifest.exports).toEqual({ ".": "./src/index.ts" });
    expect("sideEffects" in manifest).toBe(false);
    expect(manifest.private === true).toBe(row.private);
    const repository = (manifest as unknown as Record<string, unknown>)["repository"];
    if (row.private) {
      expect(repository).toBeUndefined();
    } else {
      expect(repository).toEqual({ type: "git", url: "git+https://github.com/xaravel/framework.git", directory: row.dir });
    }

    const readme = readFileSync(join(dir, "README.md"), "utf8");
    expect(readme).toContain(row.npm);
    expect(readme).toContain("Part of Xaravel, a TypeScript port of Laravel");
    if (row.upstream !== null) {
      expect(readme).toContain(row.upstream);
      expect(readme.includes("from Laravel v")).toBe(row.upstream.startsWith("illuminate/"));
    }
    expect(readme).toContain("not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.");
    expect(readme).toContain("## Dependencies");
    expect(readFileSync(join(dir, "LICENSE"), "utf8")).toBe(license);
  }

  const byName = new Map(rows.map((row) => [row.name, row]));
  expect(readJson(join(base, "installer", "package.json")).name).toBe("create-xaravel");
  expect(byName.get("create-xaravel")!.dir).toBe("installer");
  expect(readJson(join(base, "tools", "boost-framework", "package.json")).private).toBe(true);
  expect(rows.filter((row) => row.private).map((row) => row.name)).toEqual(["boost-framework"]);
}

/** XT-8's per-row checks: workspace dependencies, optional peers and runtime/contracts edges under `base`. */
function assertDependencies(base: string): void {
  const rows = readJsonl(join(base, "tools", "scaffold", "packages.jsonl"));
  for (const row of rows) {
    const manifest = readJson<Manifest>(join(base, row.dir, "package.json"));
    const deps = manifest.dependencies ?? {};
    const peers = manifest.peerDependencies ?? {};
    const meta = manifest.peerDependenciesMeta ?? {};
    expect(row.npm in deps).toBe(false);
    expect(`${row.name}: ${Object.keys(peers).filter((peer) => peer in deps).join(",")}`).toBe(`${row.name}: `);
    for (const edge of row.require) {
      expect(`${row.name} -> ${npmOf(rows, edge)}: ${deps[npmOf(rows, edge)]}`).toBe(`${row.name} -> ${npmOf(rows, edge)}: workspace:*`);
    }
    for (const edge of row.suggest) {
      const peer = npmOf(rows, edge);
      if (row.require.includes(edge)) {
        continue; // already a dependency (Auth: illuminate/queue is in both lists Upstream)
      }
      expect(`${row.name} ~> ${peer}: ${peers[peer]} optional=${meta[peer]?.optional}`).toBe(`${row.name} ~> ${peer}: workspace:* optional=true`);
    }
    for (const always of ["@xaravel/runtime", "@xaravel/contracts"]) {
      const wanted = (row.kind === "upstream" || row.kind === "xaravel") && row.name !== "runtime" && always !== row.npm;
      if (wanted) {
        expect(`${row.name} -> ${always}: ${deps[always]}`).toBe(`${row.name} -> ${always}: workspace:*`);
      }
    }
    if (row.kind === "distribution" || row.name === "runtime") {
      expect(`${row.name}: ${Object.keys(deps).filter((dep) => dep.startsWith("@xaravel/")).join(",")}`).toBe(`${row.name}: `);
    }
    // A grader package may depend on other grader packages only, never on anything graded (AD-2; ESC-4.5-1 item 7).
    if (row.kind === "grader") {
      const graderNpms = new Set(rows.filter((other) => other.kind === "grader").map((other) => other.npm));
      const graded = Object.keys(deps).filter((dep) => dep.startsWith("@xaravel/") && !graderNpms.has(dep));
      expect(`${row.name}: ${graded.join(",")}`).toBe(`${row.name}: `);
    }
  }
  const contracts = readJson<Manifest>(join(base, "packages", "contracts", "package.json"));
  expect(contracts.dependencies).toEqual({ "@xaravel/runtime": "workspace:*" });
  const support = readJson<Manifest>(join(base, "packages", "support", "package.json"));
  expect(support.peerDependencies?.["@xaravel/mockery"]).toBe("workspace:*");
  expect(support.peerDependenciesMeta?.["@xaravel/mockery"]).toEqual({ optional: true });
  expect(readFileSync(join(base, "packages", "support", "README.md"), "utf8")).toMatch(/`@xaravel\/mockery` \(optional peer\): .*AD-2/);
  const auth = readJson<Manifest>(join(base, "packages", "auth", "package.json"));
  expect(auth.dependencies?.["@xaravel/queue"]).toBe("workspace:*");
  expect("@xaravel/queue" in (auth.peerDependencies ?? {})).toBe(false);
}

xaravelTest("XT-conformance-7", "every package has the generated package.json, tsconfig.json, src/, tests/ported/, tests/xaravel/, docs/, README.md and LICENSE; the Installer is create-xaravel and boost-framework is private (AD-2, FR-10)", () => {
  assertPackagesGenerated(root);
});

xaravelTest("XT-conformance-8", "each require is a workspace:* dependency, each suggest an optional peer, dependencies and peers are disjoint, and upstream/xaravel packages depend on @xaravel/runtime and @xaravel/contracts (AD-2, FR-10)", () => {
  assertDependencies(root);
});

xaravelTest(
  "XT-conformance-9", "root tsc -b builds every package as its own project reference, including its tests/, with types [bun] and references equal to its workspace dependencies (AD-2)",
  async () => {
    const rows = readTableFile();
    const rootConfig = readJson<{ references?: { path: string }[] }>(join(root, "tsconfig.json"));
    expect(rootConfig.references).toEqual(sorted(rows.map((row) => `./${row.dir}`)).map((path) => ({ path })));

    for (const row of rows) {
      const dir = join(root, row.dir);
      const config = readJson<{ compilerOptions: Record<string, unknown>; references: { path: string }[]; include: string[] }>(join(dir, "tsconfig.json"));
      expect(config.compilerOptions.composite).toBe(true);
      expect(config.compilerOptions.types).toEqual(["bun"]);
      expect("experimentalDecorators" in config.compilerOptions).toBe(false);
      expect(config.compilerOptions.rootDir).toBe(".");
      expect(config.include).toEqual(["src/**/*.ts", "tests/**/*.ts"]);
      const manifest = readJson<Manifest>(join(dir, "package.json"));
      const workspaceDeps = Object.entries(manifest.dependencies ?? {})
        .filter(([, spec]) => spec.startsWith("workspace:"))
        .map(([name]) => rows.find((candidate) => candidate.npm === name)!);
      const expected = sorted(workspaceDeps.map((dep) => resolve(root, dep.dir)));
      expect(config.references.map((ref) => resolve(dir, ref.path))).toEqual(expected);
    }

    const proc = Bun.spawn([process.execPath, "run", "typecheck"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    if (code !== 0) {
      throw new Error(`tsc -b exited ${code}:\n${stdout}\n${stderr}`);
    }
    for (const row of rows) {
      expect(existsSync(join(root, ".cache", "tsc", row.name, "tsconfig.tsbuildinfo"))).toBe(true);
    }
  },
  120_000,
);

function snapshot(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      snapshot(path, out);
    } else {
      out.set(path, readFileSync(path, "utf8"));
    }
  }
  return out;
}

async function runCheck(tmp: string): Promise<{ code: number; stderr: string }> {
  const proc = Bun.spawn([process.execPath, join(root, "tools", "scaffold", "scaffold.ts"), "--root", tmp, "--check"], {
    cwd: tmp,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  return { code, stderr };
}

xaravelTest(
  "XT-conformance-10", "scaffold --check fails naming every package whose tsconfig.json differs from its generated form or is missing, stale root references and unlisted package dirs; scaffold generates every package, is idempotent and keeps an edited package.json (AD-2)",
  async () => {
    const tmp = mkdtempSync(join(tmpdir(), "xaravel-scaffold-"));
    try {
      for (const path of ["LICENSE", "tsconfig.json", "tsconfig.base.json", "conformance/baseline-pin", "tools/scaffold/packages.jsonl"]) {
        mkdirSync(join(tmp, path, ".."), { recursive: true });
        copyFileSync(join(root, path), join(tmp, path));
      }
      scaffold(tmp);
      expect(checkTsconfigs(tmp)).toEqual([]);
      expect(await runCheck(tmp)).toMatchObject({ code: 0 });
      assertPackagesGenerated(tmp);
      assertDependencies(tmp);

      // Re-run: no file changes.
      const before = snapshot(tmp);
      scaffold(tmp);
      expect(snapshot(tmp)).toEqual(before);

      // A Story adds a dependency: the package.json is kept and the tsconfig regenerated.
      const pagination = join(tmp, "packages", "pagination");
      const manifest = readJson<Manifest>(join(pagination, "package.json"));
      manifest.dependencies = { ...manifest.dependencies, "@xaravel/http": "workspace:*" };
      const edited = JSON.stringify(manifest, null, 2) + "\n";
      writeFileSync(join(pagination, "package.json"), edited);
      expect(checkTsconfigs(tmp)).toEqual(["pagination"]);
      scaffold(tmp);
      expect(readFileSync(join(pagination, "package.json"), "utf8")).toBe(edited);
      const config = readJson<{ references: { path: string }[] }>(join(pagination, "tsconfig.json"));
      expect(config.references.map((ref) => ref.path)).toContain("../http");
      expect(checkTsconfigs(tmp)).toEqual([]);

      // Root references stripped: --check names them, scaffold restores them.
      const rootPath = join(tmp, "tsconfig.json");
      const generatedRoot = readFileSync(rootPath, "utf8");
      const stripped = readJson(rootPath);
      delete stripped.references;
      writeFileSync(rootPath, JSON.stringify(stripped, null, 2) + "\n");
      const rootResult = await runCheck(tmp);
      expect(rootResult.code).toBe(1);
      expect(rootResult.stderr).toContain("  (root tsconfig.json references)\n");
      scaffold(tmp);
      expect(readFileSync(rootPath, "utf8")).toBe(generatedRoot);
      expect(checkTsconfigs(tmp)).toEqual([]);

      // A directory under packages/ with no table row is reported.
      mkdirSync(join(tmp, "packages", "stray"));
      const strayResult = await runCheck(tmp);
      expect(strayResult.code).toBe(1);
      expect(strayResult.stderr).toContain("  packages/stray (not in packages.jsonl)\n");
      rmSync(join(tmp, "packages", "stray"), { recursive: true });
      expect(checkTsconfigs(tmp)).toEqual([]);

      // Drift: a hand-edited tsconfig and a missing one are both named.
      const cache = join(tmp, "packages", "cache", "tsconfig.json");
      const cacheConfig = readJson<{ compilerOptions: Record<string, unknown> }>(cache);
      cacheConfig.compilerOptions.types = ["bun", "node"];
      writeFileSync(cache, JSON.stringify(cacheConfig, null, 2) + "\n");
      unlinkSync(join(tmp, "packages", "mail", "tsconfig.json"));
      const result = await runCheck(tmp);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("  cache\n");
      expect(result.stderr).toContain("  mail\n");
      expect(result.stderr).not.toContain("  pagination\n");
      expect(checkTsconfigs(tmp)).toEqual(["cache", "mail"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
  60_000,
);

/** Runs the repo's pinned `tsc -b` in `cwd`; returns its exit code and combined output. */
async function tscBuild(cwd: string): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([process.execPath, "--bun", join(root, "node_modules", "typescript", "bin", "tsc"), "-b", "--pretty", "false"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, output: `${stdout}${stderr}` };
}

xaravelTest(
  "XT-conformance-170", "under tsc -b, a guarded import() of an unreferenced optional peer type-checks and stays typed, and a package's tests/ are type-checked (AD-2)",
  async () => {
    const tmp = mkdtempSync(join(tmpdir(), "xaravel-peer-"));
    try {
      copyFileSync(join(root, "tsconfig.base.json"), join(tmp, "tsconfig.base.json"));
      const row = (name: string): PackageRow => ({
        name,
        dir: `packages/${name}`,
        npm: `@xaravel/${name}`,
        phase: 1,
        kind: "xaravel",
        upstream: null,
        private: false,
        require: [],
        suggest: [],
      });
      const rows = [row("a"), row("b")];
      const manifests: Record<string, Record<string, unknown>> = {
        a: {
          name: "@xaravel/a",
          type: "module",
          exports: { ".": "./src/index.ts" },
          peerDependencies: { "@xaravel/b": "workspace:*" },
          peerDependenciesMeta: { "@xaravel/b": { optional: true } },
          devDependencies: { "@xaravel/b": "workspace:*" },
        },
        b: { name: "@xaravel/b", type: "module", exports: { ".": "./src/index.ts" }, dependencies: { "@xaravel/a": "workspace:*" } },
      };
      for (const r of rows) {
        const dir = join(tmp, r.dir);
        mkdirSync(join(dir, "src"), { recursive: true });
        mkdirSync(join(dir, "tests", "xaravel"), { recursive: true });
        writeFileSync(join(dir, "package.json"), JSON.stringify(manifests[r.name], null, 2) + "\n");
      }
      for (const r of rows) {
        writeFileSync(join(tmp, r.dir, "tsconfig.json"), JSON.stringify(generateTsconfig(tmp, rows, r), null, 2) + "\n");
      }
      expect(readJson<{ references: unknown[] }>(join(tmp, "packages", "a", "tsconfig.json")).references).toEqual([]);
      expect(readJson<{ references: unknown[] }>(join(tmp, "packages", "b", "tsconfig.json")).references).toEqual([{ path: "../a" }]);
      writeFileSync(
        join(tmp, "tsconfig.json"),
        JSON.stringify({ extends: "./tsconfig.base.json", files: [], references: [{ path: "./packages/a" }, { path: "./packages/b" }] }, null, 2) + "\n",
      );
      writeFileSync(join(tmp, "packages", "b", "src", "index.ts"), "export const value: number = 1;\n");
      mkdirSync(join(tmp, "packages", "a", "node_modules", "@xaravel"), { recursive: true });
      symlinkSync("../../../b", join(tmp, "packages", "a", "node_modules", "@xaravel", "b"));
      mkdirSync(join(tmp, "packages", "b", "node_modules", "@xaravel"), { recursive: true });
      symlinkSync("../../../a", join(tmp, "packages", "b", "node_modules", "@xaravel", "a"));
      mkdirSync(join(tmp, "node_modules"));
      symlinkSync(join(root, "node_modules", "@types"), join(tmp, "node_modules", "@types"));

      const source = (member: string) =>
        `export async function peer(): Promise<number | null> {\n  try {\n    return (await import("@xaravel/b")).${member};\n  } catch {\n    return null;\n  }\n}\n`;
      const aIndex = join(tmp, "packages", "a", "src", "index.ts");
      const aTest = join(tmp, "packages", "a", "tests", "xaravel", "x.test.ts");

      // Guarded peer import, no reference to b: builds.
      writeFileSync(aIndex, source("value"));
      const clean = await tscBuild(tmp);
      expect(`${clean.code}\n${clean.output}`).toBe("0\n");

      // The peer import is still typed: a missing member is an error.
      writeFileSync(aIndex, source("missing"));
      const missing = await tscBuild(tmp);
      expect(missing.code).not.toBe(0);
      expect(missing.output.split("\n").some((line) => line.includes("packages/a/src/index.ts") && line.includes("TS2339"))).toBe(true);
      writeFileSync(aIndex, source("value"));

      // A type error in a package test file fails the build, naming the file.
      writeFileSync(aTest, 'const n: number = "s";\nexport { n };\n');
      const broken = await tscBuild(tmp);
      expect(broken.code).not.toBe(0);
      expect(broken.output.split("\n").some((line) => line.includes("tests/xaravel/x.test.ts") && line.includes("TS2322"))).toBe(true);

      // A well-typed test file importing bun:test builds.
      writeFileSync(aTest, 'import { test } from "bun:test";\n\ntest("x", () => {});\n');
      const tests = await tscBuild(tmp);
      expect(`${tests.code}\n${tests.output}`).toBe("0\n");

      // A test statically imports an unreferenced, cyclic workspace devDependency (b depends on a): builds.
      writeFileSync(aTest, 'import { test } from "bun:test";\nimport { value } from "@xaravel/b";\n\nconst n: number = value;\ntest("x", () => {\n  void n;\n});\n');
      const dev = await tscBuild(tmp);
      expect(`${dev.code}\n${dev.output}`).toBe("0\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
  120_000,
);
