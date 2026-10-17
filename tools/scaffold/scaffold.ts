// Package scaffolder (Story 1.2, AD-2).
//
//   bun tools/scaffold/scaffold.ts [--root <dir>]          scaffold every package in the table
//   bun tools/scaffold/scaffold.ts [--root <dir>] --check  fail, naming each package whose
//                                                          tsconfig.json differs from its generated form
//
// Files a Story may own (`package.json`, `README.md`, `LICENSE`, `src/index.ts`,
// the `.gitkeep` placeholders) are created only when missing. Every package
// `tsconfig.json` and the root `tsconfig.json` `references` are always
// regenerated, from each package's current `package.json`.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { readTable, type PackageRow } from "./table";

export const TABLE_PATH = "tools/scaffold/packages.jsonl";
const DEFAULT_PIN = "v13.37.0";

/** What each row without an `illuminate/*` Upstream is, for its `description` and README. */
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  ai: "Xaravel's port of laravel/ai, the Laravel AI SDK.",
  assert: "PHPUnit-style assertions for Xaravel's Ported Tests (grader).",
  boost: "Xaravel's port of laravel/boost: app tools for AI agents.",
  "boost-framework": "Boost framework mode: an MCP server over Xaravel's conformance data (private tooling).",
  "create-xaravel": "The Xaravel Installer: `bun create xaravel <app>`.",
  finder: "Xaravel's port of the symfony/finder surface that Laravel uses.",
  framework: "The Xaravel meta-package: every Component and the Laravel-namespaced import paths.",
  htmx: "The htmx 4 Integration for Xaravel.",
  "http-foundation": "Xaravel's port of the symfony/http-foundation surface that Laravel uses.",
  mcp: "Xaravel's port of laravel/mcp: MCP servers with tools, resources and prompts.",
  mime: "Xaravel's port of the symfony/mime surface that Laravel uses.",
  mockery: "A Mockery-compatible mocking API for Xaravel tests (grader).",
  runtime: "Xaravel runtime primitives: Scope Frames, the Class Registry, PHP values and codecs.",
  "serializable-closure": "Xaravel's port of laravel/serializable-closure.",
  testbench: "Xaravel's Testbench, for testing packages against a booted application.",
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function writeJson(path: string, value: Json): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function readJson(path: string): Record<string, Json> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, Json>;
}

function posix(path: string): string {
  return path.split("\\").join("/");
}

function description(row: PackageRow): string {
  if (row.upstream !== null && row.upstream.startsWith("illuminate/")) {
    return `Xaravel's port of Laravel's ${row.upstream} component.`;
  }
  return DESCRIPTIONS[row.name] ?? `Xaravel package ${row.npm}.`;
}

function npmOfUpstream(rows: readonly PackageRow[], upstream: string): string {
  const target = rows.find((row) => row.upstream === upstream);
  if (target === undefined) {
    throw new Error(`No package row ports ${upstream}`);
  }
  return target.npm;
}

/** The workspace dependencies a row gets: its `require` list plus runtime/contracts (never a self-edge; runtime gets none). */
export function expectedDependencies(rows: readonly PackageRow[], row: PackageRow): string[] {
  const deps = new Set<string>();
  // runtime depends on nothing; contracts only on runtime (spine layer table).
  if ((row.kind === "upstream" || row.kind === "xaravel") && row.name !== "runtime") {
    deps.add("@xaravel/runtime");
    deps.add("@xaravel/contracts");
  }
  for (const upstream of row.require) {
    deps.add(npmOfUpstream(rows, upstream));
  }
  deps.delete(row.npm);
  return [...deps].sort();
}

/** AD-2: Support takes Mockery as an optional peer for `Facade.shouldReceive` / `spy` / `partialMock`. */
const EXTRA_PEERS: Readonly<Record<string, readonly string[]>> = { support: ["@xaravel/mockery"] };

/** Optional peers: the row's `suggest` list (plus AD-2's extra peers), minus anything already a dependency. */
export function expectedPeers(rows: readonly PackageRow[], row: PackageRow): string[] {
  const peers = new Set(row.suggest.map((upstream) => npmOfUpstream(rows, upstream)));
  for (const peer of EXTRA_PEERS[row.name] ?? []) {
    peers.add(peer);
  }
  peers.delete(row.npm);
  for (const dep of expectedDependencies(rows, row)) {
    peers.delete(dep);
  }
  return [...peers].sort();
}

export function generatePackageJson(rows: readonly PackageRow[], row: PackageRow): Record<string, Json> {
  const manifest: Record<string, Json> = {
    name: row.npm,
    version: "0.0.0",
    description: description(row),
    license: "MIT",
  };
  if (row.private) {
    manifest.private = true;
  }
  manifest.type = "module";
  manifest.engines = { bun: ">=1.4" };
  manifest.exports = { ".": "./src/index.ts" };
  const deps = expectedDependencies(rows, row);
  if (deps.length > 0) {
    manifest.dependencies = Object.fromEntries(deps.map((dep) => [dep, "workspace:*"]));
  }
  const peers = expectedPeers(rows, row);
  if (peers.length > 0) {
    manifest.peerDependencies = Object.fromEntries(peers.map((peer) => [peer, "workspace:*"]));
    manifest.peerDependenciesMeta = Object.fromEntries(peers.map((peer) => [peer, { optional: true }]));
  }
  return manifest;
}

function readme(root: string, rows: readonly PackageRow[], row: PackageRow): string {
  const pinPath = join(root, "conformance", "baseline-pin");
  const pin = existsSync(pinPath) ? readFileSync(pinPath, "utf8").trim() : DEFAULT_PIN;
  const ports =
    row.upstream === null
      ? "It has no Upstream Laravel package of its own."
      : row.upstream.startsWith("illuminate/")
        ? `It ports \`${row.upstream}\` from Laravel ${pin}.`
        : `It ports \`${row.upstream}\`; its Upstream pin is recorded in Epic 2.`;
  const lines = [
    `# ${row.npm}`,
    "",
    `${description(row)} Part of Xaravel, a TypeScript port of Laravel.`,
    "",
    ports,
    "",
    "Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.",
    "",
    "## Dependencies",
    "",
  ];
  const deps = expectedDependencies(rows, row);
  const peers = expectedPeers(rows, row);
  if (deps.length === 0 && peers.length === 0) {
    lines.push("None.");
  }
  for (const dep of deps) {
    const reason =
      dep === "@xaravel/runtime" || dep === "@xaravel/contracts"
        ? "allowed for every package (AD-2)"
        : row.name === "foundation"
          ? "imported by Upstream Foundation from a Component of its own or an earlier Phase (AD-2)"
          : "Upstream `composer.json` `require` (AD-2)";
    lines.push(`- \`${dep}\` (workspace): ${reason}.`);
  }
  for (const peer of peers) {
    const reason =
      (EXTRA_PEERS[row.name] ?? []).includes(peer)
        ? "for `Facade.shouldReceive` / `spy` / `partialMock`; Graded packages take the grader only as a devDependency, with this exception (AD-2)"
        : row.name === "foundation"
        ? "imported by Upstream Foundation from a later-Phase Component, reached by FQCN only (AD-2)"
        : "Upstream `composer.json` `suggest`, reached only by token, alias or guarded `import()` (AD-2)";
    lines.push(`- \`${peer}\` (optional peer): ${reason}.`);
  }
  return lines.join("\n") + "\n";
}

/** Workspace dependency names in a package's current `package.json`. */
function workspaceDependencies(manifest: Record<string, Json>): string[] {
  const deps = manifest.dependencies;
  if (typeof deps !== "object" || deps === null || Array.isArray(deps)) {
    return [];
  }
  return Object.entries(deps)
    .filter(([, spec]) => typeof spec === "string" && spec.startsWith("workspace:"))
    .map(([name]) => name);
}

/** The tsconfig a package gets, derived from its current `package.json`. */
export function generateTsconfig(root: string, rows: readonly PackageRow[], row: PackageRow): Record<string, Json> {
  const pkgDir = join(root, row.dir);
  const manifest = readJson(join(pkgDir, "package.json"));
  const cache = posix(relative(pkgDir, join(root, ".cache", "tsc", row.name)));
  const references = workspaceDependencies(manifest)
    .map((dep) => {
      const target = rows.find((candidate) => candidate.npm === dep);
      if (target === undefined) {
        throw new Error(`${row.dir}/package.json depends on ${dep}, which is not in ${TABLE_PATH}`);
      }
      return posix(relative(pkgDir, join(root, target.dir)));
    })
    .sort();
  return {
    extends: posix(relative(pkgDir, join(root, "tsconfig.base.json"))),
    compilerOptions: {
      composite: true,
      noEmit: false,
      emitDeclarationOnly: true,
      rootDir: "src",
      outDir: cache,
      tsBuildInfoFile: `${cache}/tsconfig.tsbuildinfo`,
      types: ["bun"],
    },
    include: ["src/**/*.ts"],
    references: references.map((path) => ({ path })),
  };
}

function serialize(value: Json): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function rootReferences(rows: readonly PackageRow[]): Json[] {
  return rows
    .map((row) => `./${row.dir}`)
    .sort()
    .map((path) => ({ path }));
}

function writeIfMissing(path: string, content: string): void {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

/** Scaffolds every package in `<root>/tools/scaffold/packages.jsonl`. Idempotent. */
export function scaffold(root: string): void {
  const rows = readTable(join(root, TABLE_PATH));
  const license = readFileSync(join(root, "LICENSE"), "utf8");
  for (const row of rows) {
    const pkgDir = join(root, row.dir);
    writeIfMissing(join(pkgDir, "package.json"), serialize(generatePackageJson(rows, row)));
    writeIfMissing(join(pkgDir, "README.md"), readme(root, rows, row));
    writeIfMissing(join(pkgDir, "LICENSE"), license);
    writeIfMissing(join(pkgDir, "src", "index.ts"), "export {};\n");
    for (const dir of ["tests/ported", "tests/xaravel", "docs"]) {
      writeIfMissing(join(pkgDir, dir, ".gitkeep"), "");
    }
  }
  for (const row of rows) {
    const path = join(root, row.dir, "tsconfig.json");
    const content = serialize(generateTsconfig(root, rows, row));
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      writeFileSync(path, content);
    }
  }
  const rootPath = join(root, "tsconfig.json");
  const rootConfig = readJson(rootPath);
  rootConfig.references = rootReferences(rows);
  const content = serialize(rootConfig);
  if (readFileSync(rootPath, "utf8") !== content) {
    writeJson(rootPath, rootConfig);
  }
}

/**
 * Names every package whose `tsconfig.json` is missing or differs from its
 * generated form, plus `(root tsconfig.json references)` if the root
 * references are stale. Empty when everything matches.
 */
export function checkTsconfigs(root: string): string[] {
  const rows = readTable(join(root, TABLE_PATH));
  const drifted: string[] = [];
  for (const row of rows) {
    const path = join(root, row.dir, "tsconfig.json");
    let expected: string;
    try {
      expected = serialize(generateTsconfig(root, rows, row));
    } catch (error) {
      drifted.push(`${row.name} (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected) {
      drifted.push(row.name);
    }
  }
  const listed = new Set(rows.map((row) => row.dir));
  const packagesDir = join(root, "packages");
  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !listed.has(`packages/${entry.name}`)) {
        drifted.push(`packages/${entry.name} (not in ${TABLE_PATH.split("/").pop()})`);
      }
    }
  }
  const rootConfig = readJson(join(root, "tsconfig.json"));
  if (JSON.stringify(rootConfig.references ?? null) !== JSON.stringify(rootReferences(rows))) {
    drifted.push("(root tsconfig.json references)");
  }
  return drifted;
}

function main(argv: readonly string[]): number {
  let root = resolve(import.meta.dir, "..", "..");
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[++i];
      if (value === undefined) {
        process.stderr.write("--root needs a directory\n");
        return 2;
      }
      root = resolve(value);
    } else if (arg === "--check") {
      check = true;
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      return 2;
    }
  }
  if (!check) {
    scaffold(root);
    return 0;
  }
  const drifted = checkTsconfigs(root);
  if (drifted.length === 0) {
    process.stdout.write("Every package tsconfig.json matches its generated form.\n");
    return 0;
  }
  process.stderr.write(
    `tsconfig.json differs from its generated form (run \`bun run scaffold\`):\n${drifted.map((name) => `  ${name}`).join("\n")}\n`,
  );
  return 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
