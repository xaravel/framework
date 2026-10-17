// Xaravel Tests for Story 2.5 (Pest Test Inventory for laravel/ai, laravel/mcp
// and laravel/boost, FR-1). These run under plain `bun test` until the harness
// lands in Epic 5. The generator runs against hermetic fixture roots with a
// fake `--php` (or, for image mode, a stand-in runner) that prints raw lister
// lines, so no test needs PHP, a container runtime or vendor files. The
// committed Inventory files are checked directly, and against the Upstream
// snapshots when they are present.
import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { COMPONENT_MAP_FILE, readMap, type ComponentMap } from "../../../tools/component-map/component-map";
import {
  backendsFor,
  buildPestEntries,
  FOREIGN_COMPONENTS,
  generate,
  INVENTORY_DIR,
  kindFor,
  LISTER,
  oracleImage,
  parseInventory,
  parsePestRaw,
  PEST_SUITES,
  pestTestId,
  PHP_VERSION,
  testHash,
  type InventoryEntry,
  type PestRawTest,
  type PestSuite,
  type RawTest,
} from "../../../tools/inventory/inventory";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "inventory", "inventory.ts");
const realMap = readMap(root);
const COUNTS: Record<PestSuite, number> = { ai: 3381, mcp: 1284, boost: 1138 };

// ---------------------------------------------------------------------------
// Fixture

const SNAPSHOT_FILES: Record<string, Record<string, string>> = {
  framework: {
    "phpunit.xml.dist": '<?xml version="1.0"?>\n<phpunit/>\n',
    "src/Illuminate/Support/Str.php": "<?php\n",
    "tests/Support/SupportStrTest.php": "<?php\n".repeat(40),
  },
  ai: {
    "phpunit.xml.dist": '<?xml version="1.0"?>\n<phpunit/>\n',
    "src/Ai.php": "<?php\n",
    "tests/Unit/AgentTest.php": "<?php\n".repeat(40),
    "tests/Integration/AgentFakeIsolationTest.php": "<?php\n".repeat(40),
  },
  mcp: {
    "phpunit.xml.dist": '<?xml version="1.0"?>\n<phpunit/>\n',
    "src/Server.php": "<?php\n",
    "tests/Feature/CompletionTest.php": "<?php\n".repeat(40),
    "tests/ArchTest.php": "<?php\n".repeat(40),
  },
  boost: {
    "phpunit.xml.dist": '<?xml version="1.0"?>\n<phpunit/>\n',
    "src/Boost.php": "<?php\n",
    "tests/Feature/BoostTest.php": "<?php\n".repeat(40),
  },
};

const TOKENS = ["cfunction", "w ", "c(", "c)", "c:", "w ", "cvoid", "w ", "c{", "w\n    ", "# // a comment", "w\n    ", "cexpect", "c(", "ctrue", "c)", "c->", "ctoBeTrue", "c(", "c)", "c;", "w\n", "c}"];
const ARCH_TOKENS = ["carch", "c(", "c'strict types'", "c)", "w\n    ", "c->", "cexpect", "c(", "c'Laravel\\Mcp'", "c)", "w\n    ", "c->", "ctoUseStrictTypes", "c(", "c)", "c;"];

function evaluable(description: string): string {
  return `__pest_evaluable_${description.replaceAll("_", "__").replaceAll(" ", "_")}`.replace(/[^a-zA-Z0-9_\x80-￿]/g, "_");
}

function pestRaw(fields: Partial<PestRawTest> & Pick<PestRawTest, "file" | "name">): PestRawTest {
  const describe = fields.describe ?? [];
  const dataset = fields.dataset ?? null;
  const cls = `P\\${fields.file.replace(/\.php$/, "").split("/").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("\\")}`;
  const method = evaluable([...describe.map((part) => `\`${part}\` → `), fields.name].join(""));
  return {
    id: `${cls}::${method}${dataset === null ? "" : `#${dataset}`}`,
    class: cls,
    method,
    dataset,
    describe,
    source: { file: fields.file, start: 10, end: 14 },
    tokens: TOKENS,
    data: null,
    requiresDatabase: null,
    redis: false,
    ...fields,
  };
}

/** Raw lines per Pest suite: describe blocks, datasets, an arch test and an Integration test. */
const PEST_RAWS: Record<PestSuite, PestRawTest[]> = {
  ai: [
    pestRaw({ file: "tests/Unit/AgentTest.php", name: "it prompts" }),
    pestRaw({ file: "tests/Integration/AgentFakeIsolationTest.php", name: "faking one agent doesnt affect another agent" }),
  ],
  mcp: [
    pestRaw({ file: "tests/Feature/CompletionTest.php", describe: ["A", "B"], name: "it x" }),
    pestRaw({ file: "tests/Feature/CompletionTest.php", name: "it takes a dataset", dataset: 'dataset "a"', data: "[0=>1]" }),
    pestRaw({ file: "tests/Feature/CompletionTest.php", name: "it takes a dataset", dataset: "(2)", data: "[0=>2]" }),
    pestRaw({ file: "tests/ArchTest.php", name: "strict types", source: { file: "tests/ArchTest.php", start: 7, end: 9 }, tokens: ARCH_TOKENS }),
  ],
  boost: [pestRaw({ file: "tests/Feature/BoostTest.php", name: "it boosts", requiresDatabase: ["sqlite"], redis: true })],
};

const FRAMEWORK_RAW: RawTest = {
  id: "Illuminate\\Tests\\Support\\SupportStrTest::testAscii",
  class: "Illuminate\\Tests\\Support\\SupportStrTest",
  method: "testAscii",
  dataset: null,
  file: "tests/Support/SupportStrTest.php",
  source: { file: "tests/Support/SupportStrTest.php", start: 10, end: 14 },
  tokens: TOKENS,
  data: null,
  requiresDatabase: null,
  redis: false,
};

function rawText(raws: readonly (RawTest | PestRawTest)[]): string {
  return raws.map((entry) => `${JSON.stringify(entry)}\n`).join("");
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

/** A fake binary that records its arguments, fails when `fail` exists, and otherwise prints `raw.jsonl`. */
const FAKE = '#!/bin/sh\nhere="$(dirname "$0")"\nprintf \'%s\\n\' "$@" > "$here/args"\nif [ -f "$here/fail" ]; then cat "$here/fail" >&2; exit 3; fi\ncat "$here/raw.jsonl"\n';

interface Fixture {
  dir: string;
  /** A locked-install stand-in per suite: a copy of the fixture snapshot's tests, src and phpunit.xml.dist. */
  local: (suite: string) => string;
  php: string;
  bin: string;
  setRaw: (raws: readonly (RawTest | PestRawTest)[] | string) => void;
  inventory: () => Record<string, string>;
}

async function withFixture(body: (fx: Fixture) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-pest-inventory-"));
  try {
    for (const file of ["tools/scaffold/packages.jsonl", COMPONENT_MAP_FILE, LISTER, "conformance/baseline-pin", ...["framework", "ai", "mcp", "boost"].map((name) => `conformance/oracle/locks/${name}/composer.lock`)]) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      copyFileSync(join(root, file), join(dir, file));
    }
    for (const [suite, files] of Object.entries(SNAPSHOT_FILES)) {
      writeFiles(join(dir, "conformance", "upstream", suite), files);
      writeFiles(join(dir, "local", suite), files);
    }
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const php = join(bin, "php");
    writeFileSync(php, FAKE);
    chmodSync(php, 0o755);
    const fx: Fixture = {
      dir,
      local: (suite) => join(dir, "local", suite),
      php,
      bin,
      setRaw: (raws) => writeFileSync(join(bin, "raw.jsonl"), typeof raws === "string" ? raws : rawText(raws)),
      inventory: () => {
        const out: Record<string, string> = {};
        const inv = join(dir, INVENTORY_DIR);
        if (existsSync(inv)) {
          for (const name of readdirSync(inv).sort()) {
            out[name] = readFileSync(join(inv, name), "utf8");
          }
        }
        return out;
      },
    };
    fx.setRaw(PEST_RAWS.mcp);
    await body(fx);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { cwd: root, env: { PATH: process.env["PATH"] ?? "" }, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

/** A stand-in image runner that answers each suite's command with its raw lines. */
function suiteRunner(runs: { image: string; mounts: unknown; command: readonly string[] }[]) {
  return (image: string, mounts: unknown, command: readonly string[]): string => {
    runs.push({ image, mounts, command });
    const suite = command[2]!.split("/").at(-1)!;
    return suite === "framework" ? rawText([FRAMEWORK_RAW]) : rawText(PEST_RAWS[suite as PestSuite]);
  };
}

/** The committed Inventory file of a Pest suite. */
function committed(suite: PestSuite): InventoryEntry[] {
  return parseInventory(readFileSync(join(root, INVENTORY_DIR, `${suite}.jsonl`), "utf8"), `${INVENTORY_DIR}/${suite}.jsonl`, suite);
}

function ids(text: string): string[] {
  return text
    .slice(0, -1)
    .split("\n")
    .map((line) => JSON.parse(line).id as string);
}

// ---------------------------------------------------------------------------
// XT-conformance-53

test("XT-conformance-53: bun run inventory gives every Pest test in the ai, mcp and boost snapshots an entry {id, component, kind, backends, source, hash, assertions, oracle} with id <suite>/<file>::<describe> > … > <test name>#<dataset> (FR-1)", async () => {
  await withFixture(async (fx) => {
    writeFiles(join(fx.dir, INVENTORY_DIR), { "routing.jsonl": "framework stays\n", "ai.jsonl": "ai stays\n", "boost.jsonl": "boost stays\n" });

    // One suite local: only mcp.jsonl is written; the lister runs in pest mode.
    const ok = await cli(["generate", "--suite", "mcp", "--root", fx.dir, "--local", fx.local("mcp"), "--php", fx.php]);
    expect(ok.stderr).toBe("");
    expect(ok.code).toBe(0);
    expect(ok.stdout).toBe(["mcp: 4 tests", "Inventory: 4 tests in 1 files.", ""].join("\n"));
    expect(readFileSync(join(fx.bin, "args"), "utf8")).toBe(`${join(fx.dir, LISTER)}\n${fx.local("mcp")}\n${PHP_VERSION}\npest\n`);
    const files = fx.inventory();
    expect(Object.keys(files)).toEqual(["ai.jsonl", "boost.jsonl", "mcp.jsonl", "routing.jsonl"]);
    // The other suites' files and the framework's are left byte-identical.
    expect([files["routing.jsonl"], files["ai.jsonl"], files["boost.jsonl"]]).toEqual(["framework stays\n", "ai stays\n", "boost stays\n"]);

    // The record: Story 2.4's keys, order, sorting and file format.
    const mcp = files["mcp.jsonl"]!;
    expect(mcp.endsWith("\n")).toBe(true);
    expect(ids(mcp)).toEqual([
      "mcp/tests/ArchTest.php::strict types",
      "mcp/tests/Feature/CompletionTest.php::A > B > it x",
      "mcp/tests/Feature/CompletionTest.php::it takes a dataset#(2)",
      'mcp/tests/Feature/CompletionTest.php::it takes a dataset#dataset "a"',
    ]);
    const entries = parseInventory(mcp, "mcp.jsonl", "mcp");
    expect(Object.keys(JSON.parse(mcp.split("\n")[1]!))).toEqual(["id", "component", "kind", "backends", "source", "hash", "assertions", "oracle"]);
    expect(entries[1]).toEqual({ id: "mcp/tests/Feature/CompletionTest.php::A > B > it x", component: "mcp", kind: "unit", backends: ["none"], source: "mcp/tests/Feature/CompletionTest.php:10-14", hash: testHash(TOKENS, null), assertions: null, oracle: {} });
    // A closure-less arch() test: its statement's lines and tokens.
    expect(entries[0]!.source).toBe("mcp/tests/ArchTest.php:7-9");
    expect(entries[0]!.hash).toBe(testHash(ARCH_TOKENS, null));

    // Generate all (image mode): framework files plus ai, mcp and boost, one read-only mount, the pest command.
    const runs: { image: string; mounts: unknown; command: readonly string[] }[] = [];
    const all = generate(fx.dir, { suite: "all", runner: suiteRunner(runs) });
    expect(all.counts).toEqual({ support: 1, ai: 2, mcp: 4, boost: 1 });
    expect(all.total).toBe(8);
    expect(all.removed).toEqual([`${INVENTORY_DIR}/routing.jsonl`]);
    expect(runs.map((run) => run.command)).toEqual([
      ["php", "/xaravel/lister.php", "/oracle/upstream/framework", PHP_VERSION],
      ...PEST_SUITES.map((suite) => ["php", "/xaravel/lister.php", `/oracle/upstream/${suite}`, PHP_VERSION, "pest"]),
    ]);
    for (const run of runs) {
      expect(run.image).toBe(oracleImage(fx.dir));
      expect(run.mounts).toEqual([{ host: join(fx.dir, LISTER), container: "/xaravel/lister.php" }]);
    }
    expect(Object.keys(fx.inventory())).toEqual(["ai.jsonl", "boost.jsonl", "mcp.jsonl", "support.jsonl"]);
    expect(fx.inventory()["mcp.jsonl"]).toBe(mcp);
    // Without a suite, generate() still lists the framework only (Story 2.4's form).
    const framework: { image: string; mounts: unknown; command: readonly string[] }[] = [];
    expect(generate(fx.dir, { runner: suiteRunner(framework) }).counts).toEqual({ support: 1 });
    expect(framework.length).toBe(1);

    // Carry-over (Story 2.6): a baselined entry whose id, hash and backends are unchanged keeps assertions and
    // oracle byte for byte; an entry whose hash changed comes back null / {}.
    const baselined = mcp.replaceAll('"assertions":null,"oracle":{}', '"assertions":{"assertSame":1},"oracle":{"none":"skip"}');
    writeFileSync(join(fx.dir, INVENTORY_DIR, "mcp.jsonl"), baselined);
    const changed = PEST_RAWS.mcp.map((entry) => (entry.name === "it x" ? { ...entry, tokens: [...entry.tokens, "cfoo"] } : entry));
    generate(fx.dir, { suite: "mcp", runner: () => rawText(changed) });
    const carried = fx.inventory()["mcp.jsonl"]!.split("\n");
    const baselinedLines = baselined.split("\n");
    expect([carried[0], carried[2], carried[3]]).toEqual([baselinedLines[0], baselinedLines[2], baselinedLines[3]]);
    expect(JSON.parse(carried[1]!)).toMatchObject({ id: "mcp/tests/Feature/CompletionTest.php::A > B > it x", assertions: null, oracle: {} });
    writeFileSync(join(fx.dir, INVENTORY_DIR, "mcp.jsonl"), mcp);

    // kind: Integration/ is integration; backends: attribute drivers plus redis, no directory or queue rules.
    const ai = parseInventory(fx.inventory()["ai.jsonl"]!, "ai.jsonl", "ai");
    expect(ai.map((entry) => [entry.id, entry.kind])).toEqual([
      ["ai/tests/Integration/AgentFakeIsolationTest.php::faking one agent doesnt affect another agent", "integration"],
      ["ai/tests/Unit/AgentTest.php::it prompts", "unit"],
    ]);
    expect(parseInventory(fx.inventory()["boost.jsonl"]!, "boost.jsonl", "boost")[0]!.backends).toEqual(["redis", "sqlite"]);
    const b = (fields: Partial<Pick<RawTest, "file" | "requiresDatabase" | "redis">>): string[] => backendsFor({ id: "T::t", file: "tests/Unit/XTest.php", requiresDatabase: null, redis: false, ...fields }, "ai");
    expect(b({})).toEqual(["none"]);
    expect(b({ file: "tests/Integration/Database/Postgres/XTest.php" })).toEqual(["none"]);
    expect(b({ file: "tests/Integration/Queue/XTest.php" })).toEqual(["none"]);
    expect(b({ requiresDatabase: ["sqlite", "pgsql", "sqlite"], redis: true })).toEqual(["pgsql", "redis", "sqlite"]);
    expect(kindFor("tests/Integration/XTest.php")).toBe("integration");

    // Bad raw line: malformed JSON, a missing or mistyped field, named by line number.
    fx.setRaw(`${rawText(PEST_RAWS.mcp.slice(0, 1))}{"id":\n`);
    const malformed = await cli(["generate", "--suite", "mcp", "--root", fx.dir, "--local", fx.local("mcp"), "--php", fx.php]);
    expect(malformed.code).toBe(1);
    expect(malformed.stderr).toStartWith("Inventory generate failed: raw line 2: malformed JSON");
    const { describe: _describe, ...missing } = PEST_RAWS.mcp[0]!;
    fx.setRaw(`${rawText(PEST_RAWS.mcp.slice(0, 1))}${JSON.stringify(missing)}\n`);
    const field = await cli(["generate", "--suite", "mcp", "--root", fx.dir, "--local", fx.local("mcp"), "--php", fx.php]);
    expect([field.code, field.stderr]).toEqual([1, 'Inventory generate failed: raw line 2: missing field "describe"\n']);
    expect(() => parsePestRaw(`${JSON.stringify({ ...PEST_RAWS.mcp[0]!, name: "" })}\n`)).toThrow('raw line 1: field "name" must be a non-empty string');
    expect(() => parsePestRaw(`${JSON.stringify({ ...PEST_RAWS.mcp[0]!, describe: "A" })}\n`)).toThrow('raw line 1: field "describe"');
    expect(() => parsePestRaw(`${JSON.stringify({ ...PEST_RAWS.mcp[0]!, id: "P\\X::y" })}\n`)).toThrow('raw line 1: id "P\\\\X::y" is not');
    expect(() => parsePestRaw(`${JSON.stringify({ ...PEST_RAWS.mcp[0]!, tokens: ["xbad"] })}\n`)).toThrow('raw line 1: field "tokens"');

    // The lister fails: its exit code and stderr are reported.
    fx.setRaw(PEST_RAWS.mcp);
    writeFileSync(join(fx.bin, "fail"), "lister: unexpected pest output:\n  WARN  something\n");
    const failed = await cli(["generate", "--suite", "mcp", "--root", fx.dir, "--local", fx.local("mcp"), "--php", fx.php]);
    expect([failed.code, failed.stderr]).toEqual([1, "Inventory generate failed: the lister failed (exit 3): lister: unexpected pest output:\n  WARN  something\n"]);
    rmSync(join(fx.bin, "fail"));

    // Stale local copy: a file that differs from, is missing in, or is extra to conformance/upstream/<suite>.
    writeFiles(fx.local("mcp"), { "tests/ArchTest.php": "<?php // edited\n" });
    const stale = await cli(["generate", "--suite", "mcp", "--root", fx.dir, "--local", fx.local("mcp"), "--php", fx.php]);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain(`${join(fx.local("mcp"), "tests/ArchTest.php")} differs from conformance/upstream/mcp/tests/ArchTest.php`);
    writeFiles(fx.local("mcp"), { "tests/ArchTest.php": SNAPSHOT_FILES["mcp"]!["tests/ArchTest.php"]!, "src/Extra.php": "<?php\n" });
    const extra = await cli(["generate", "--suite", "mcp", "--root", fx.dir, "--local", fx.local("mcp"), "--php", fx.php]);
    expect(extra.stderr).toContain(`${join(fx.local("mcp"), "src/Extra.php")} is not in conformance/upstream/mcp`);
    rmSync(join(fx.local("mcp"), "src/Extra.php"));
    // The local copy is compared with the suite's snapshot, not the framework's.
    const wrongCopy = await cli(["generate", "--suite", "mcp", "--root", fx.dir, "--local", fx.local("ai"), "--php", fx.php]);
    expect(wrongCopy.code).toBe(1);
    expect(wrongCopy.stderr).toContain(`${join(fx.local("ai"), "tests/ArchTest.php")} is missing`);

    // A source outside the suite's tests/, or past the end of its file; a duplicate id.
    fx.setRaw([pestRaw({ file: "tests/ArchTest.php", name: "x", source: { file: "src/Server.php", start: 1, end: 1 } })]);
    expect(() => generate(fx.dir, { suite: "mcp", local: fx.local("mcp"), php: fx.php })).toThrow("mcp/tests/ArchTest.php::x: source mcp/src/Server.php is not in conformance/upstream/mcp/tests/");
    fx.setRaw([pestRaw({ file: "tests/ArchTest.php", name: "x", source: { file: "tests/ArchTest.php", start: 1, end: 999 } })]);
    expect(() => generate(fx.dir, { suite: "mcp", local: fx.local("mcp"), php: fx.php })).toThrow("is past the end of the file");
    fx.setRaw([PEST_RAWS.mcp[0]!, PEST_RAWS.mcp[0]!]);
    expect(() => generate(fx.dir, { suite: "mcp", local: fx.local("mcp"), php: fx.php })).toThrow("duplicate test id: mcp/tests/Feature/CompletionTest.php::A > B > it x");
    fx.setRaw("");
    expect(() => generate(fx.dir, { suite: "mcp", local: fx.local("mcp"), php: fx.php })).toThrow("the lister listed no mcp tests");

    // Bad usage exits 2: --local with --suite all, an unknown suite.
    expect((await cli(["generate", "--root", fx.dir, "--suite", "all", "--local", fx.local("mcp")])).code).toBe(2);
    expect((await cli(["generate", "--root", fx.dir, "--suite", "pest"])).code).toBe(2);
    expect((await cli(["generate", "--root", fx.dir, "--suite"])).code).toBe(2);
    expect(() => generate(fx.dir, { suite: "all", local: fx.local("mcp"), php: fx.php })).toThrow("--local takes one suite's install");

    // CLI defaults: --local without --suite is the framework (Story 2.4's form); see the fake's recorded args.
    fx.setRaw([FRAMEWORK_RAW]);
    const frameworkLocal = await cli(["generate", "--root", fx.dir, "--local", fx.local("framework"), "--php", fx.php]);
    expect([frameworkLocal.code, frameworkLocal.stderr, frameworkLocal.stdout]).toEqual([0, "", "support: 1 tests\nInventory: 1 tests in 1 files.\n"]);
    expect(readFileSync(join(fx.bin, "args"), "utf8")).toBe(`${join(fx.dir, LISTER)}\n${fx.local("framework")}\n${PHP_VERSION}\n`);

    // No snapshot: exit 1 with the sync hint; nothing fetched or written.
    fx.setRaw(PEST_RAWS.mcp);
    const before = fx.inventory();
    rmSync(join(fx.dir, "conformance", "upstream", "mcp"), { recursive: true });
    const none = await cli(["generate", "--suite", "mcp", "--root", fx.dir, "--local", fx.local("mcp"), "--php", fx.php]);
    expect([none.code, none.stderr]).toEqual([1, "Inventory generate failed: conformance/upstream/mcp is missing; run bun run upstream:sync\n"]);
    // In --suite all, a missing Pest snapshot fails before the framework is written.
    rmSync(join(fx.dir, INVENTORY_DIR, "support.jsonl"));
    expect(() => generate(fx.dir, { suite: "all", runner: suiteRunner([]) })).toThrow("conformance/upstream/mcp is missing; run bun run upstream:sync");
    // Without --suite or --local the CLI lists every suite, so the missing Pest snapshot fails it the same way.
    const imageAll = await cli(["generate", "--root", fx.dir]);
    expect([imageAll.code, imageAll.stderr]).toEqual([1, "Inventory generate failed: conformance/upstream/mcp is missing; run bun run upstream:sync\n"]);
    const { "support.jsonl": _support, ...rest } = before;
    expect(fx.inventory()).toEqual(rest);
  });

  // parseInventory with a suite: ids, Component and source belong to that suite.
  const line = (id: string, component: string, source: string): string => JSON.stringify({ id, component, kind: "unit", backends: ["none"], source, hash: "0".repeat(64), assertions: null, oracle: {} });
  expect(parseInventory(`${line("ai/tests/XTest.php::it x", "ai", "ai/tests/XTest.php:1-2")}\n`, "f", "ai").length).toBe(1);
  expect(() => parseInventory(`${line("ai/tests/XTest.php::it x", "ai", "framework/tests/XTest.php:1-2")}\n`, "f", "ai")).toThrow("f:1: bad source");
  expect(() => parseInventory(`${line("mcp/tests/XTest.php::it x", "ai", "ai/tests/XTest.php:1-2")}\n`, "f", "ai")).toThrow("f:1: bad id");
  expect(() => parseInventory(`${line("ai/tests/XTest.php::it x", "mcp", "ai/tests/XTest.php:1-2")}\n`, "f", "ai")).toThrow("f:1: bad component");
  expect(pestTestId("mcp", { file: "tests/XTest.php", describe: ["A", "B"], name: "it x", dataset: null })).toBe("mcp/tests/XTest.php::A > B > it x");

  // The lister runs Pest's own listing inside Pest's process and fails closed.
  const lister = readFileSync(join(root, LISTER), "utf8");
  for (const needle of ["auto_prepend_file", "XARAVEL_INVENTORY_PEST", "vendor/bin/pest", "--list-tests-xml", "unexpected pest output", "matches no Pest test", "describe prefix", "matches no provider label", "arch('<literal>')", "expected PHP "]) {
    expect([needle, lister.includes(needle)]).toEqual([needle, true]);
  }

  // The committed files: exactly the runner-listed counts, unique, sorted and well-formed.
  for (const suite of PEST_SUITES) {
    const entries = committed(suite);
    expect([suite, entries.length, new Set(entries.map((entry) => entry.id)).size]).toEqual([suite, COUNTS[suite], COUNTS[suite]]);
    for (const entry of entries) {
      expect([entry.id, entry.id.startsWith(`${suite}/tests/`), entry.source.split(":")[0]!.startsWith(`${suite}/tests/`)]).toEqual([entry.id, true, true]);
    }
    const snapshot = join(root, "conformance", "upstream", suite);
    if (existsSync(join(snapshot, "tests"))) {
      const lengths = new Map<string, number>();
      for (const entry of entries) {
        const [, path, start, end] = new RegExp(`^${suite}/(.+):(\\d+)-(\\d+)$`).exec(entry.source)!;
        if (!lengths.has(path!)) {
          const file = join(snapshot, path!);
          lengths.set(path!, existsSync(file) ? readFileSync(file, "utf8").split("\n").length : 0);
        }
        expect([entry.source, lengths.get(path!)! >= Number(end) && Number(start) >= 1]).toEqual([entry.source, true]);
        const testFile = entry.id.slice(suite.length + 1, entry.id.indexOf("::"));
        expect([entry.id, existsSync(join(snapshot, testFile))]).toEqual([entry.id, true]);
      }
    }
  }
  // describe() blocks join with " > ".
  const completion = committed("mcp").filter((entry) => entry.id.startsWith("mcp/tests/Feature/CompletionTest.php::"));
  expect(completion.map((entry) => entry.id)).toContain("mcp/tests/Feature/CompletionTest.php::from() - Basic Completions > it filters by prefix and returns all when empty");
  expect(completion.filter((entry) => entry.id.includes(" > ")).length).toBe(8);
  expect(completion.some((entry) => entry.id.includes("→") || entry.id.includes("`"))).toBe(false);
  // The arch() tests, sourced from their statements.
  expect(committed("mcp").filter((entry) => entry.id.startsWith("mcp/tests/ArchTest.php::")).length).toBe(7);
  expect(committed("boost").filter((entry) => entry.id.startsWith("boost/tests/ArchTest.php::")).length).toBe(5);
  expect(committed("mcp").find((entry) => entry.id === "mcp/tests/ArchTest.php::strict and safe")!.source).toBe("mcp/tests/ArchTest.php:10-14");
  // boost's one plain PHPUnit class: the method name is the test name, the method its source.
  const plain = committed("boost").find((entry) => entry.id === "boost/tests/Feature/BrowserLogsRouteRegistrationTest.php::test_browser_logs_route_is_not_registered_when_the_watcher_is_disabled");
  expect(plain?.source).toBe("boost/tests/Feature/BrowserLogsRouteRegistrationTest.php:18-21");
  // At the Pin every Pest entry runs on the suites' in-memory SQLite env: ["none"].
  for (const suite of PEST_SUITES) {
    expect([suite, committed(suite).every((entry) => entry.backends.length === 1 && entry.backends[0] === "none")]).toEqual([suite, true]);
  }
  // Only laravel/ai has tests/Integration/.
  expect(committed("ai").some((entry) => entry.kind === "integration")).toBe(true);
  expect([...committed("mcp"), ...committed("boost")].every((entry) => entry.kind === "unit")).toBe(true);
  // The framework Inventory still excludes the Pest suites' files.
  expect(FOREIGN_COMPONENTS).toEqual(["ai", "boost", "mcp"]);
});

// ---------------------------------------------------------------------------
// XT-conformance-54

test("XT-conformance-54: each Pest with() dataset is its own entry carrying Pest's dataset label (FR-1)", async () => {
  await withFixture((fx) => {
    generate(fx.dir, { suite: "mcp", local: fx.local("mcp"), php: fx.php });
    const entries = parseInventory(fx.inventory()["mcp.jsonl"]!, "mcp.jsonl", "mcp").filter((entry) => entry.id.includes("it takes a dataset"));
    // ->with(['a' => [1], [2]]): the named key's label, and the unnamed value's.
    expect(entries.map((entry) => entry.id)).toEqual(["mcp/tests/Feature/CompletionTest.php::it takes a dataset#(2)", 'mcp/tests/Feature/CompletionTest.php::it takes a dataset#dataset "a"']);
    expect(entries[1]!.hash).toBe(testHash(TOKENS, "[0=>1]"));
    expect(entries[0]!.hash).not.toBe(entries[1]!.hash);
    expect(entries[0]!.source).toBe(entries[1]!.source);
    // Two generations of the same input are byte-identical, whatever the raw order.
    const first = fx.inventory();
    fx.setRaw([...PEST_RAWS.mcp].reverse());
    generate(fx.dir, { suite: "mcp", local: fx.local("mcp"), php: fx.php });
    expect(fx.inventory()).toEqual(first);
  });

  const mcp = new Map(committed("mcp").map((entry) => [entry.id, entry]));
  for (const id of [
    'mcp/tests/Feature/Server/CachingTest.php::it adds caching hints to every cacheable result#dataset "tools/list"',
    'mcp/tests/Feature/Server/CachingTest.php::it adds caching hints to every cacheable result#dataset "server/discover"',
    "mcp/tests/Feature/Server/Middleware/ValidateMcpHeadersTest.php::it rejects a request missing a required header#('Mcp-Name')",
    "mcp/tests/Feature/Server/Middleware/ValidateMcpHeadersTest.php::it rejects a request missing a required header#('Mcp-Method')",
  ]) {
    expect([id, mcp.has(id)]).toEqual([id, true]);
  }
  // Datasets of one test share its source; their dataset values differ, and so do their hashes.
  const headers = [...mcp.values()].filter((entry) => entry.id.startsWith("mcp/tests/Feature/Server/Middleware/ValidateMcpHeadersTest.php::it rejects a request missing a required header#"));
  expect(headers.length).toBe(3);
  expect(new Set(headers.map((entry) => entry.source)).size).toBe(1);
  expect(new Set(headers.map((entry) => entry.hash)).size).toBe(3);
  // Every suite has datasets, and every dataset label is non-empty.
  for (const suite of PEST_SUITES) {
    const datasets = committed(suite).filter((entry) => /::[^#]*#/.test(entry.id));
    expect([suite, datasets.length > 0, datasets.every((entry) => !entry.id.endsWith("#"))]).toEqual([suite, true, true]);
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-55

test("XT-conformance-55: every laravel/ai entry is Component ai in ai.jsonl, mcp and boost entries are mcp and boost, and a Pest file mapped to another Component fails (FR-1)", async () => {
  for (const suite of PEST_SUITES) {
    const entries = committed(suite);
    expect([suite, entries.every((entry) => entry.component === suite)]).toEqual([suite, true]);
  }

  // A Pest test file the map gives to another Component fails.
  const record = realMap.records.find((item) => item.component === "support")!;
  const odd: ComponentMap = { records: [...realMap.records.filter((item) => item !== record), { ...record, tests: [...record.tests, { path: "ai/tests/Unit/AgentTest.php", tags: [] }] }] };
  expect(() => buildPestEntries("ai", PEST_RAWS.ai, odd)).toThrow("ai/tests/Unit/AgentTest.php maps to support, not ai");
  expect(() => buildPestEntries("ai", [pestRaw({ file: "elsewhere/XTest.php", name: "it x" })], realMap)).toThrow("unmapped test file: ai/elsewhere/XTest.php");
  expect(buildPestEntries("ai", PEST_RAWS.ai, realMap).every((entry) => entry.component === "ai")).toBe(true);

  await withFixture(async (fx) => {
    // Through the CLI: a fixture map that gives one ai test file to support.
    const mapFile = join(fx.dir, COMPONENT_MAP_FILE);
    const text = readFileSync(mapFile, "utf8").replace('{"component":"support","tests":[', '{"component":"support","tests":[{"path":"ai/tests/Unit/AgentTest.php","tags":[]},');
    writeFileSync(mapFile, text);
    fx.setRaw(PEST_RAWS.ai);
    const wrong = await cli(["generate", "--suite", "ai", "--root", fx.dir, "--local", fx.local("ai"), "--php", fx.php]);
    expect([wrong.code, wrong.stderr]).toEqual([1, "Inventory generate failed: ai/tests/Unit/AgentTest.php maps to support, not ai\n"]);
    expect(fx.inventory()).toEqual({});
  });
});
