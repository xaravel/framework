// Xaravel Tests for Story 10.6: `@xaravel/contracts` complete and Protected. XT-contracts-16 runs the API-surface gate
// as the Component's closing gate (AD-15), re-checks the gate's mappings on mutated copies of real contract files in a
// temp root (the first Component gate on real code), checks `docs/contracts.md` against the Upstream rows and the
// package's runtime exports, and checks the committed `async-surface.json`. XT-contracts-17 drives the committed
// protected-paths CLI against a fake GitHub API, in the shape of XT-conformance-19: once the Maintainer signs
// `decisions/PHASE-1-EXIT.md`, a Story PR touching `packages/contracts/**` fails (AD-16, FR-112). Tools run as child
// processes; nothing under `tools/**` or `conformance/tests/**` is imported.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { fqcn } from "@xaravel/runtime";
import { allRows, REPO } from "./support/contract-namespaces";

const PACKAGE = join(REPO, "packages", "contracts");

/** Spawns `bun run <script> …args` from the repository root, without colour. */
function bunRun(script: string, args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ["run", script, ...args], { cwd: REPO, encoding: "utf8", timeout: 240000, env: { ...process.env, NO_COLOR: "1" } });
}

/** A run's stdout and stderr, with its spawn error, for a failure message. */
function outputOf(run: SpawnSyncReturns<string>): string {
  return `${run.error === undefined ? "" : `${String(run.error)}\n`}${run.stdout ?? ""}${run.stderr ?? ""}`;
}

// ---------------------------------------------------------------------------
// XT-contracts-16: the gate, the mapping re-check, the docs and the async surface

/** The packages the gate builds in a temp root: contracts and the packages its tsconfig references reach. */
const ROOT_PACKAGES = ["contracts", "runtime", "assert", "mockery"] as const;

/**
 * A temp root (outside the repo) holding the gate's inputs: `conformance/api-surface/`, the DIV-12 pair list,
 * `tsconfig.base.json` and the packages' copies, symlinks kept as symlinks, plus a symlink to the repo's
 * `node_modules`. The packages' `tests/` are left out: the gate reads only `src` declarations, and a mutated signature
 * would otherwise fail the copy's typecheck of the tests that call it rather than reach the diff.
 */
function gateRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "xt-contracts-16-"));
  cpSync(join(REPO, "conformance", "api-surface"), join(root, "conformance", "api-surface"), { recursive: true, verbatimSymlinks: true });
  mkdirSync(join(root, "conformance", "scans"), { recursive: true });
  cpSync(join(REPO, "conformance", "scans", "div12-pairs.jsonl"), join(root, "conformance", "scans", "div12-pairs.jsonl"));
  cpSync(join(REPO, "tsconfig.base.json"), join(root, "tsconfig.base.json"));
  for (const name of ROOT_PACKAGES) {
    const from = join(REPO, "packages", name);
    cpSync(from, join(root, "packages", name), {
      recursive: true,
      verbatimSymlinks: true,
      filter: (source) => {
        const path = relative(from, source);
        return path !== "tests" && !path.startsWith(`tests${sep}`);
      },
    });
  }
  symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"));
  return root;
}

/** Runs `bun run api-surface:gate --root <root> contracts`. */
function gate(root: string | null): SpawnSyncReturns<string> {
  return bunRun("api-surface:gate", [...(root === null ? [] : ["--root", root]), "contracts"]);
}

/** One mapping re-check: a single text replacement in a contract file and the gate finding it must produce. */
interface Mutation {
  readonly name: string;
  readonly file: string;
  readonly search: string;
  readonly replace: string;
  /** Text the finding line must start with. */
  readonly finding: string;
  /** Text the finding line must also contain, when the start alone does not name the failure. */
  readonly detail: string | null;
}

const MUTATIONS: readonly Mutation[] = [
  {
    name: "AD-26 options form: json() loses its options overload",
    file: "src/routing/ResponseFactory.ts",
    search: "  json(options?: { data?: unknown; status?: number; headers?: PhpArrayLike; options?: number }): JsonResponse;\n",
    replace: "",
    finding: "contracts: mismatch method Illuminate\\Contracts\\Routing\\ResponseFactory::json: ",
    detail: "options overload: parameter 1 is not an options object with keys data, status, headers, options",
  },
  {
    name: "nullability: useCollectionClass() loses `| null`",
    file: "src/database/ModelIdentifier.ts",
    search: "useCollectionClass(collectionClass: string | null)",
    replace: "useCollectionClass(collectionClass: string)",
    finding: "contracts: mismatch method Illuminate\\Contracts\\Database\\ModelIdentifier::useCollectionClass: ",
    detail: "is not nullable",
  },
  {
    name: "defaults: useMorphMap() defaults to false",
    file: "src/database/ModelIdentifier.ts",
    search: "static useMorphMap(useMorphMap = true)",
    replace: "static useMorphMap(useMorphMap = false)",
    finding: "contracts: mismatch method Illuminate\\Contracts\\Database\\ModelIdentifier::useMorphMap: ",
    detail: "default false, Upstream true",
  },
  {
    name: "names: Store.forget becomes Forget",
    file: "src/cache/Store.ts",
    search: "  forget(key: string)",
    replace: "  Forget(key: string)",
    finding: "contracts: renamed method Illuminate\\Contracts\\Cache\\Store::forget -> Forget",
    detail: null,
  },
  {
    name: "names: constructor maps to __construct",
    file: "src/database/ModelIdentifier.ts",
    search: "relations: PhpArrayLike, connection: unknown) {",
    replace: "relations: PhpArrayLike, connection: unknown, extra: string) {",
    finding: "contracts: mismatch method Illuminate\\Contracts\\Database\\ModelIdentifier::__construct: ",
    detail: "parameter 5 (extra) is extra",
  },
  {
    name: "extra member: Store gains a method Upstream lacks",
    file: "src/cache/Store.ts",
    search: "  getPrefix(): string;\n",
    replace: "  getPrefix(): string;\n  sweep(): boolean;\n",
    finding: "contracts: extra method Illuminate\\Contracts\\Cache\\Store::sweep",
    detail: null,
  },
  {
    name: "missing member: Store loses flush()",
    file: "src/cache/Store.ts",
    search: "  flush(): Promise<boolean>;\n",
    replace: "",
    finding: "contracts: missing method Illuminate\\Contracts\\Cache\\Store::flush",
    detail: null,
  },
];

/** The number of times `needle` occurs in `text`. */
function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** One `div12-pairs.jsonl` line, read structurally. */
interface Div12Pair {
  readonly class: string;
  readonly name: string;
  readonly classification: string;
}

/** The `## <title>` section of a markdown page, up to the next `## ` heading; "" when absent. */
function section(page: string, title: string): string {
  const start = page.indexOf(`\n## ${title}\n`);
  if (start === -1) {
    return "";
  }
  const next = page.indexOf("\n## ", start + 1);
  return page.slice(start, next === -1 ? page.length : next);
}

xaravelTest(
  "XT-contracts-16",
  "@xaravel/contracts is complete: `bun run api-surface:gate contracts` reports 0 unexplained (AD-15); the gate's mappings, re-checked on mutated temp copies of real contract files, catch a dropped AD-26 options overload, a lost `| null`, a changed default, a renamed member and a changed constructor (`__construct`), and no contracts row is a DIV-12 rename or state member (DIV-12); docs/contracts.md lists every Upstream interface and class once with its FQCN, a real subpath and a real runtime export, and cites the Divergences that shape contracts; no additions.jsonl or exceptions.jsonl line explains contracts; async-surface.json is committed and current (AD-6)",
  async () => {
    // The gate on the repo.
    const real = gate(null);
    Assert.assertSame(0, real.status, outputOf(real));
    Assert.assertStringContainsString("api-surface:gate contracts: 0 unexplained (AD-15)", real.stdout ?? "", outputOf(real));

    // The mapping re-check, on a temp root alone.
    const root = gateRoot();
    try {
      Assert.assertFalse(relative(REPO, root) === "" || !relative(REPO, root).startsWith(".."), `the temp root ${root} must be outside the repo`);
      const baseline = gate(root);
      Assert.assertSame(0, baseline.status, `the unmutated temp root must pass the gate:\n${outputOf(baseline)}`);
      Assert.assertStringContainsString("api-surface:gate contracts: 0 unexplained (AD-15)", baseline.stdout ?? "", outputOf(baseline));

      for (const mutation of MUTATIONS) {
        const path = join(root, "packages", "contracts", mutation.file);
        const original = readFileSync(path, "utf8");
        Assert.assertSame(1, occurrences(original, mutation.search), `${mutation.name}: ${JSON.stringify(mutation.search)} must occur exactly once in ${mutation.file}`);
        writeFileSync(path, original.replace(mutation.search, mutation.replace));
        try {
          const run = gate(root);
          const output = outputOf(run);
          Assert.assertSame(1, run.status, `${mutation.name}:\n${output}`);
          const line = output.split("\n").find((text) => text.startsWith(mutation.finding)) ?? null;
          Assert.assertNotNull(line, `${mutation.name}: no finding starting ${JSON.stringify(mutation.finding)}:\n${output}`);
          if (mutation.detail !== null) {
            Assert.assertStringContainsString(mutation.detail, line ?? "", `${mutation.name}:\n${output}`);
          }
          Assert.assertStringContainsString("api-surface:gate contracts: 1 unexplained (AD-15)", output, `${mutation.name}: only the mutation is unexplained:\n${output}`);
        } finally {
          writeFileSync(path, original);
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    // DIV-12, checked as data: no contracts row is a rename source, and each pair on a contracts class names a
    // member the rows do not list, so it drops nothing the gate would compare.
    const rows = allRows();
    // A mapping that misreads real code raises an Escalation, never a citation line (AD-15).
    for (const citation of ["additions.jsonl", "exceptions.jsonl"]) {
      const cited = readFileSync(join(REPO, "conformance", "api-surface", citation), "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "" && (JSON.parse(line) as { component?: string }).component === "contracts");
      Assert.assertSame(0, cited.length, `${citation} lines for contracts:\n${cited.join("\n")}`);
    }
    const fqcns = new Set(rows.filter((row) => row.member === null).map((row) => row.fqcn));
    const renameSources = rows.filter((row) => row.member === "fillable" || row.member === "touches");
    Assert.assertSame("[]", JSON.stringify(renameSources.map((row) => `${row.fqcn}::${row.member ?? ""}`)), "DIV-12 rename sources among the contracts rows");
    const pairs = readFileSync(join(REPO, "conformance", "scans", "div12-pairs.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as Div12Pair)
      .filter((pair) => fqcns.has(pair.class));
    for (const pair of pairs) {
      Assert.assertSame("method-plus-state", pair.classification, `${pair.class}::${pair.name}`);
      const listed = rows.filter((row) => row.fqcn === pair.class && row.member === pair.name && row.kind !== "method");
      Assert.assertSame(0, listed.length, `${pair.class}::${pair.name}: the state member a method-plus-state pair drops is listed`);
    }
    const report = bunRun("api-surface", ["contracts"]);
    Assert.assertSame(0, report.status, outputOf(report));
    Assert.assertMatchesRegularExpression(/^api-surface contracts: .* 0 div12; 0 unexplained \(AD-15\)$/m, report.stdout ?? "", outputOf(report));

    // The docs page against the rows and the package's real exports.
    const page = readFileSync(join(PACKAGE, "docs", "contracts.md"), "utf8");
    const exportsMap = (JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as { exports: Record<string, string> }).exports;
    const tableRows = new Map<string, { readonly kind: string; readonly subpath: string; readonly name: string }[]>();
    const unparsed: string[] = [];
    for (const line of section(page, "Reference").split("\n").filter((text) => text.startsWith("| `"))) {
      const match = /^\| `([^`]+)` \| (\w+) \| `@xaravel\/contracts\/([^`]+)` \| `([^`]+)` \|$/.exec(line);
      if (match === null) {
        unparsed.push(line);
        continue;
      }
      const list = tableRows.get(match[1] ?? "") ?? [];
      list.push({ kind: match[2] ?? "", subpath: match[3] ?? "", name: match[4] ?? "" });
      tableRows.set(match[1] ?? "", list);
    }
    const declarationRows = rows.filter((row) => row.kind === "interface" || row.kind === "class");
    const declarations = declarationRows.map((row) => row.fqcn);
    const kinds = new Map(declarationRows.map((row) => [row.fqcn, row.kind]));
    const missing = declarations.filter((name) => !tableRows.has(name));
    const duplicated = declarations.filter((name) => (tableRows.get(name)?.length ?? 0) > 1);
    const extra = [...tableRows.keys()].filter((name) => !declarations.includes(name));
    const unresolved: string[] = [];
    for (const [name, entries] of tableRows) {
      for (const entry of entries) {
        if (!Object.hasOwn(exportsMap, `./${entry.subpath}`)) {
          unresolved.push(`${name}: ./${entry.subpath} is not in package.json exports`);
          continue;
        }
        const module = (await import(`@xaravel/contracts/${entry.subpath}`)) as Record<string, unknown>;
        const value = module[entry.name];
        if (value === undefined) {
          unresolved.push(`${name}: @xaravel/contracts/${entry.subpath} does not export ${entry.name}`);
          continue;
        }
        let identity: string;
        try {
          identity = fqcn(value as object);
        } catch (error) {
          identity = `(no FQCN: ${String(error)})`;
        }
        if (identity !== name) {
          unresolved.push(`${name}: @xaravel/contracts/${entry.subpath}'s ${entry.name} is ${identity}`);
        }
        if (kinds.has(name) && entry.kind !== kinds.get(name)) {
          unresolved.push(`${name}: the table's kind ${entry.kind} is not the row's ${kinds.get(name) ?? ""}`);
        }
      }
    }
    Assert.assertSame(
      "",
      [...unparsed.map((line) => `unparsed: ${line}`), ...missing.map((name) => `missing: ${name}`), ...duplicated.map((name) => `listed twice: ${name}`), ...extra.map((name) => `extra: ${name}`), ...unresolved].join("\n"),
      "docs/contracts.md's reference table against the rows",
    );
    Assert.assertSame(declarations.length, [...tableRows.values()].flat().length, "one table row per declaration");

    const divergences = section(page, "Divergences");
    Assert.assertNotSame("", divergences, "docs/contracts.md has a ## Divergences section");
    const cited = [...new Set([...divergences.matchAll(/\bDIV-(\d+)\b/g)].map((match) => Number(match[1])))];
    for (const n of [1, 3, 9, 12]) {
      Assert.assertContains(n, cited, `the Divergences section cites DIV-${n}`);
    }
    for (const n of cited) {
      Assert.assertTrue(existsSync(join(REPO, "decisions", `DIV-${n}.md`)), `DIV-${n} is cited but decisions/DIV-${n}.md does not exist`);
    }

    // async-surface.json is committed and current.
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "packages/contracts/async-surface.json"], { cwd: REPO, encoding: "utf8" });
    Assert.assertSame(0, tracked.status, outputOf(tracked));
    const surface = bunRun("async-surface", ["--check", "contracts"]);
    Assert.assertSame(0, surface.status, outputOf(surface));
  },
  600000,
);

// ---------------------------------------------------------------------------
// XT-contracts-17: contracts become Protected once Phase 1 exits

const CLI = join(REPO, "tools", "protected-paths", "protected-paths.ts");
const LIST_PATH = "conformance/protected-paths";
const CODEOWNERS_PATH = ".github/CODEOWNERS";
const EXIT_PATH = "decisions/PHASE-1-EXIT.md";
const MAINTAINER = "edanisko";
const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const CONTRACT_FILE = "packages/contracts/src/cache/Store.ts";

/** A Maintainer-signed `PHASE-1-EXIT.md`, in the shape of the `MAINT-*` rulings; a fixture, never the real file. */
const SIGNED_EXIT = "---\ndecision: approved\ndecided_by: Maintainer\ndate: 2026-10-24\n---\n\n# Phase 1 exit\n\nThe Maintainer accepts Phase 1 as complete.\n";
/** An exit file without the Maintainer's signature; it activates nothing. */
const UNSIGNED_EXIT = "# Phase 1 exit\n";

/** Runs the protected-paths CLI from the repo root with only `PATH` and `env`. */
async function runCli(args: readonly string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { cwd: REPO, env: { PATH: process.env["PATH"] ?? "", ...env }, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

/**
 * A hermetic base checkout: the committed list, optionally an exit file, and `.github/CODEOWNERS` rendered by the
 * CLI's own `codeowners --root`, so it mirrors the list for that root's active Phases.
 */
async function protectedRoot(exit: string | null): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "xt-contracts-17-"));
  mkdirSync(join(root, "conformance"), { recursive: true });
  writeFileSync(join(root, LIST_PATH), readFileSync(join(REPO, LIST_PATH), "utf8"));
  if (exit !== null) {
    mkdirSync(dirname(join(root, EXIT_PATH)), { recursive: true });
    writeFileSync(join(root, EXIT_PATH), exit);
  }
  const rendered = await runCli(["codeowners", "--root", root]);
  Assert.assertSame(0, rendered.code, `${rendered.stdout}${rendered.stderr}`);
  return root;
}

/** The head contents the fake API serves: the root's list, its CODEOWNERS and its exit file, if any. */
function headOf(root: string): Record<string, string> {
  const head: Record<string, string> = {};
  for (const path of [LIST_PATH, CODEOWNERS_PATH, EXIT_PATH]) {
    if (existsSync(join(root, path))) {
      head[path] = readFileSync(join(root, path), "utf8");
    }
  }
  return head;
}

interface Review {
  readonly user: { readonly login: string };
  readonly state: string;
  readonly commit_id: string;
}

/** Runs `pr` for a `story/10.7` PR touching `files` against a `Bun.serve` fake of the GitHub API on port 0. */
async function runPr(root: string, files: readonly string[], reviews: readonly Review[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const head = headOf(root);
  const page = <T>(items: readonly T[], url: URL): Response => {
    const size = Number(url.searchParams.get("per_page") ?? "30");
    const n = Number(url.searchParams.get("page") ?? "1");
    return Response.json(items.slice((n - 1) * size, n * size));
  };
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (request.headers.get("authorization") !== "Bearer test-token") {
        return new Response("unauthorized", { status: 401 });
      }
      const base = "/repos/xaravel/framework";
      if (url.pathname === `${base}/pulls/7`) {
        return Response.json({ number: 7, head: { sha: HEAD, ref: "story/10.7" }, changed_files: files.length });
      }
      if (url.pathname === `${base}/pulls/7/files`) {
        return page(
          files.map((filename) => ({ filename, status: "modified" })),
          url,
        );
      }
      if (url.pathname === `${base}/pulls/7/reviews`) {
        return page(reviews, url);
      }
      if (url.pathname.startsWith(`${base}/contents/`) && url.searchParams.get("ref") === HEAD) {
        const content = head[url.pathname.slice(`${base}/contents/`.length)];
        if (content === undefined) {
          return new Response("not found", { status: 404 });
        }
        return request.headers.get("accept") === "application/vnd.github.raw+json"
          ? new Response(content)
          : Response.json({ type: "file", encoding: "base64", content: Buffer.from(content).toString("base64") });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    return await runCli(["pr", "--repo", "xaravel/framework", "--pr", "7", "--root", root], { GITHUB_API_URL: `http://localhost:${server.port}`, GH_TOKEN: "test-token" });
  } finally {
    await server.stop(true);
  }
}

xaravelTest(
  "XT-contracts-17",
  "the committed conformance/protected-paths marks /packages/contracts/ after-phase:1, so once the Maintainer signs decisions/PHASE-1-EXIT.md a Story PR touching packages/contracts/** fails the protected-paths check without the Maintainer's approving review on the head commit, while with no exit file, or an unsigned one, contracts stay editable during Phase 1, and a signed exit file protects nothing outside the list (AD-16, FR-112)",
  async () => {
    const list = readFileSync(join(REPO, LIST_PATH), "utf8").split("\n");
    Assert.assertContains("/packages/contracts/ after-phase:1", list, `${LIST_PATH} marks contracts after-phase:1`);

    const roots: string[] = [];
    try {
      const signed = await protectedRoot(SIGNED_EXIT);
      roots.push(signed);
      Assert.assertContains(`/packages/contracts/ @${MAINTAINER}`, readFileSync(join(signed, CODEOWNERS_PATH), "utf8").split("\n"), "CODEOWNERS lists contracts once Phase 1 exits");

      const blocked = await runPr(signed, [CONTRACT_FILE], []);
      Assert.assertSame(1, blocked.code, `${blocked.stdout}${blocked.stderr}`);
      Assert.assertStringContainsString(`protected path: ${CONTRACT_FILE} needs @${MAINTAINER}'s approving review on the head commit`, blocked.stderr, blocked.stderr);
      Assert.assertStringNotContainsString("codeowners drift", blocked.stderr, blocked.stderr);

      const stale = await runPr(signed, [CONTRACT_FILE], [{ user: { login: MAINTAINER }, state: "APPROVED", commit_id: OLD }]);
      Assert.assertSame(1, stale.code, `an approval on an older commit does not count:\n${stale.stdout}${stale.stderr}`);

      const elsewhere = await runPr(signed, ["packages/support/src/Str.ts"], []);
      Assert.assertSame(0, elsewhere.code, `${elsewhere.stdout}${elsewhere.stderr}`);
      Assert.assertSame("Protected Paths OK: PR #7 touches no Protected Path.\n", elsewhere.stdout, elsewhere.stderr);

      const approved = await runPr(signed, [CONTRACT_FILE], [{ user: { login: MAINTAINER }, state: "APPROVED", commit_id: HEAD }]);
      Assert.assertSame(0, approved.code, `${approved.stdout}${approved.stderr}`);

      for (const [label, exit] of [
        ["no exit file", null],
        ["an unsigned exit file", UNSIGNED_EXIT],
      ] as const) {
        const open = await protectedRoot(exit);
        roots.push(open);
        Assert.assertStringNotContainsString("/packages/contracts/", readFileSync(join(open, CODEOWNERS_PATH), "utf8"), `${label}: CODEOWNERS leaves contracts out`);
        const editable = await runPr(open, [CONTRACT_FILE], []);
        Assert.assertSame(0, editable.code, `${label}: ${editable.stdout}${editable.stderr}`);
        Assert.assertSame("Protected Paths OK: PR #7 touches no Protected Path.\n", editable.stdout, `${label}: ${editable.stderr}`);
      }
    } finally {
      for (const root of roots) {
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
  120000,
);
