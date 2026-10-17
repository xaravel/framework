// The dependency-graph check (Story 1.3, AD-2).
//
//   bun tools/graph/graph.ts [--root <dir>]
//       prints `Dependency graph OK (<n> packages).`, or every violation to
//       stderr and exits 1
//
// Packages are the rows of `tools/scaffold/packages.jsonl`. Every violation kind
// the check reports, one line each, sorted:
//
//   missing package.json:  a table row has no `<dir>/package.json`
//   unknown package:       an `@xaravel/*` edge names a package with no table row
//   cycle:                 a cycle over workspace `dependencies` (dev and peer
//                          edges are not edges), rotated to its smallest name
//   foundation phase:      Foundation depends on a later-Phase package
//   grader edge:           a graded package lists a grader package outside
//                          devDependencies (except testing -> mockery dependency
//                          and support -> mockery optional peer)
//   layer edge:            runtime lists any workspace package, contracts lists
//                          anything but runtime, or a grader package lists a
//                          graded package (spine § Layers)
//   test edge phase:       a devDependency is neither a grader package nor of the
//                          same or an earlier Phase
//   undeclared import:     a `src/**` or `tests/**` import names a package the
//                          manifest does not declare for that file
//   unparseable source:    `Bun.Transpiler` cannot scan a source file
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { extname, join, relative, resolve } from "node:path";
import { TABLE_PATH } from "../scaffold/scaffold";
import { readTable, type PackageRow } from "../scaffold/table";

type DependencyMap = Record<string, string>;

interface Manifest {
  name?: string;
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
  optionalDependencies?: DependencyMap;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

interface Package {
  row: PackageRow;
  manifest: Manifest;
}

const EDGE_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

/** The fields that give a package an edge outside its tests. */
const RUNTIME_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"] as const;

const LOADERS: Readonly<Record<string, "ts" | "tsx" | "js">> = {
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
};

// Bun's `builtinModules` also lists `ws` and `undici`, which are ordinary npm
// packages rather than Node core modules, so importing them must be declared.
const NOT_BUILTIN = new Set(["ws", "undici"]);
const BUILTINS = new Set<string>(builtinModules.filter((name) => !NOT_BUILTIN.has(name)));

/** The two grader edges a graded package may hold outside devDependencies (AD-2). */
function allowedGraderEdge(pkg: Package, field: string, dep: string): boolean {
  const name = pkg.row.npm;
  if (name === "@xaravel/testing" && dep === "@xaravel/mockery" && field === "dependencies") {
    return true;
  }
  return (
    name === "@xaravel/support" &&
    dep === "@xaravel/mockery" &&
    field === "peerDependencies" &&
    pkg.manifest.peerDependenciesMeta?.[dep]?.optional === true
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The package a module specifier names: its first segment, or its first two for `@scope/`. */
export function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

function exempt(specifier: string): boolean {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#") ||
    specifier === "bun" ||
    specifier.startsWith("bun:") ||
    specifier.startsWith("node:") ||
    BUILTINS.has(specifier) ||
    BUILTINS.has(packageOf(specifier))
  );
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") {
        sourceFiles(path, out);
      }
    } else if (entry.isFile() && extname(entry.name) in LOADERS) {
      out.push(path);
    }
  }
  return out;
}

/** Every elementary cycle in `edges`, each once, rotated to start at its smallest name. */
function findCycles(edges: ReadonlyMap<string, readonly string[]>): string[][] {
  // Tarjan's SCCs first, so acyclic parts of the graph are never path-enumerated.
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const connect = (node: string): void => {
    indices.set(node, index);
    low.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);
    for (const next of edges.get(node) ?? []) {
      if (!indices.has(next)) {
        connect(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, indices.get(next)!));
      }
    }
    if (low.get(node) === indices.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component);
    }
  };
  for (const node of [...edges.keys()].sort(compare)) {
    if (!indices.has(node)) {
      connect(node);
    }
  }

  const cycles: string[][] = [];
  for (const component of components) {
    const members = new Set(component);
    if (component.length === 1 && !(edges.get(component[0]!) ?? []).includes(component[0]!)) {
      continue;
    }
    // A cycle is found from its smallest member, visiting only larger members.
    for (const start of [...component].sort(compare)) {
      const path = [start];
      const onPath = new Set(path);
      const walk = (node: string): void => {
        for (const next of [...(edges.get(node) ?? [])].sort(compare)) {
          if (next === start) {
            cycles.push([...path]);
          } else if (members.has(next) && compare(next, start) > 0 && !onPath.has(next)) {
            path.push(next);
            onPath.add(next);
            walk(next);
            path.pop();
            onPath.delete(next);
          }
        }
      };
      walk(start);
    }
  }
  return cycles;
}

/** Every AD-2 violation under `root`, one line each, sorted. Empty when the graph is sound. */
export function checkGraph(root: string): string[] {
  const rows = readTable(join(root, TABLE_PATH));
  const byNpm = new Map(rows.map((row) => [row.npm, row]));
  const violations = new Set<string>();
  const packages: Package[] = [];

  for (const row of rows) {
    const manifestPath = join(root, row.dir, "package.json");
    if (!existsSync(manifestPath)) {
      violations.add(`missing package.json: ${row.dir}/package.json (${row.npm} is in ${TABLE_PATH})`);
      continue;
    }
    packages.push({ row, manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest });
  }

  // Edges to @xaravel/* names with no table row.
  for (const pkg of packages) {
    for (const field of EDGE_FIELDS) {
      for (const dep of Object.keys(pkg.manifest[field] ?? {})) {
        if (dep.startsWith("@xaravel/") && !byNpm.has(dep)) {
          violations.add(`unknown package: ${pkg.row.npm} lists ${dep} in ${field}, but ${dep} has no row in ${TABLE_PATH}`);
        }
      }
    }
  }

  // Cycles over workspace `dependencies` only; dev and peer edges are not static runtime edges.
  const edges = new Map<string, string[]>();
  for (const pkg of packages) {
    edges.set(
      pkg.row.npm,
      Object.keys(pkg.manifest.dependencies ?? {}).filter((dep) => byNpm.has(dep)),
    );
  }
  for (const cycle of findCycles(edges)) {
    violations.add(`cycle: ${[...cycle, cycle[0]!].join(" -> ")}`);
  }

  for (const pkg of packages) {
    const { row, manifest } = pkg;

    // Foundation may depend only on Components of its own or earlier Phases.
    if (row.name === "foundation") {
      for (const dep of Object.keys(manifest.dependencies ?? {})) {
        const target = byNpm.get(dep);
        if (target !== undefined && target.phase > row.phase) {
          violations.add(
            `foundation phase: ${row.npm} (Phase ${row.phase}) depends on ${dep} (Phase ${target.phase}); Foundation may depend only on Components of its own or earlier Phases (AD-2)`,
          );
        }
      }
    }

    // Graded packages take grader packages only as devDependencies.
    if (row.kind !== "grader") {
      for (const field of RUNTIME_FIELDS) {
        for (const dep of Object.keys(manifest[field] ?? {})) {
          if (byNpm.get(dep)?.kind === "grader" && !allowedGraderEdge(pkg, field, dep)) {
            violations.add(
              `grader edge: ${row.npm} lists ${dep} in ${field}; graded packages may take grader packages only as devDependencies, except @xaravel/testing -> @xaravel/mockery (dependency) and @xaravel/support -> @xaravel/mockery (optional peer) (AD-2)`,
            );
          }
        }
      }
    }

    // Layer edges (spine § Layers): runtime depends on nothing, contracts only on
    // runtime, and the grader on nothing graded.
    for (const field of RUNTIME_FIELDS) {
      for (const dep of Object.keys(manifest[field] ?? {})) {
        const target = byNpm.get(dep);
        if (target === undefined) {
          continue;
        }
        let rule: string | null = null;
        if (row.name === "runtime") {
          rule = "@xaravel/runtime may depend on no workspace package";
        } else if (row.name === "contracts" && dep !== "@xaravel/runtime") {
          rule = "@xaravel/contracts may depend only on @xaravel/runtime";
        } else if (row.kind === "grader" && target.kind !== "grader") {
          rule = "grader packages may depend on nothing graded";
        }
        if (rule !== null) {
          violations.add(`layer edge: ${row.npm} lists ${dep} in ${field}; ${rule} (AD-2)`);
        }
      }
    }

    // Test edges reach only grader packages and packages of the same or an earlier Phase.
    for (const dep of Object.keys(manifest.devDependencies ?? {})) {
      const target = byNpm.get(dep);
      if (target !== undefined && target.kind !== "grader" && target.phase > row.phase) {
        violations.add(
          `test edge phase: ${row.npm} (Phase ${row.phase}) lists ${dep} (Phase ${target.phase}) in devDependencies; tests may import only grader packages and packages of the same or an earlier Phase (AD-2)`,
        );
      }
    }

    // Undeclared imports.
    const deps = new Set(Object.keys(manifest.dependencies ?? {}));
    const devDeps = new Set(Object.keys(manifest.devDependencies ?? {}));
    const peers = new Set(Object.keys(manifest.peerDependencies ?? {}));
    for (const area of ["src", "tests"] as const) {
      for (const file of sourceFiles(join(root, row.dir, area))) {
        const rel = relative(root, file).split("\\").join("/");
        let imports: { path: string; kind: string }[];
        try {
          imports = new Bun.Transpiler({ loader: LOADERS[extname(file)]! }).scanImports(readFileSync(file, "utf8"));
        } catch (error) {
          violations.add(`unparseable source: ${rel}: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        for (const { path: specifier, kind } of imports) {
          if (exempt(specifier)) {
            continue;
          }
          const target = packageOf(specifier);
          if (target === row.npm || deps.has(target)) {
            continue;
          }
          let allowed: string;
          if (area === "tests") {
            if (devDeps.has(target)) {
              continue;
            }
            allowed = "dependencies or devDependencies";
          } else if (kind === "dynamic-import") {
            if (peers.has(target)) {
              continue;
            }
            allowed = "dependencies or peerDependencies";
          } else {
            allowed = "dependencies";
          }
          violations.add(`undeclared import: ${rel} imports ${JSON.stringify(specifier)}, but ${target} is not in ${row.npm} ${allowed}`);
        }
      }
    }
  }

  return [...violations].sort(compare);
}

function main(argv: readonly string[]): number {
  let root = resolve(import.meta.dir, "..", "..");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[++i];
      if (value === undefined) {
        process.stderr.write("--root needs a directory\n");
        return 2;
      }
      root = resolve(value);
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      return 2;
    }
  }
  const violations = checkGraph(root);
  if (violations.length === 0) {
    const count = readTable(join(root, TABLE_PATH)).length;
    process.stdout.write(`Dependency graph OK (${count} packages).\n`);
    return 0;
  }
  process.stderr.write(`Dependency graph violations (AD-2):\n${violations.map((line) => `  ${line}`).join("\n")}\n`);
  return 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
