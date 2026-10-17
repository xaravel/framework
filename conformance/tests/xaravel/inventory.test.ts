// Xaravel Tests for Story 2.4 (PHPUnit Test Inventory for laravel/framework,
// FR-1, FR-7). These run under plain `bun test` until the harness lands in
// Epic 5. The generator runs against hermetic fixture roots with a fake
// `--php` (or, for image mode, a stand-in runner) that prints raw lister
// lines, so no test needs PHP, a container runtime or vendor files. The committed Inventory is checked
// directly, and against the Upstream snapshot when it is present.
import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { COMPONENT_MAP_FILE, readMap } from "../../../tools/component-map/component-map";
import {
  backendsFor,
  buildEntries,
  FOREIGN_COMPONENTS,
  generate,
  INVENTORY_DIR,
  kindFor,
  LISTER,
  normaliseTokens,
  oracleImage,
  parseInventory,
  PHP_VERSION,
  parseRaw,
  QUEUE_BACKENDS,
  renderInventory,
  testHash,
  type InventoryEntry,
  type RawTest,
} from "../../../tools/inventory/inventory";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "inventory", "inventory.ts");
const SNAPSHOT = join(root, "conformance", "upstream", "framework");
const HAS_SNAPSHOT = existsSync(join(SNAPSHOT, "tests"));
const realMap = readMap(root);

// ---------------------------------------------------------------------------
// Fixture

const QUEUEABLE = "Illuminate\\Tests\\Bus\\QueueableTest";
const POSTGRES = "Illuminate\\Tests\\Integration\\Database\\Postgres\\FulltextTest";
const UNIQUE = "Illuminate\\Tests\\Integration\\Database\\UniqueConstraintViolationTest";
const QUEUE = "Illuminate\\Tests\\Integration\\Queue\\JobDispatchingTest";
const REDIS = "Illuminate\\Tests\\Integration\\Cache\\RedisStoreTest";
const STR = "Illuminate\\Tests\\Support\\SupportStrTest";

/** The fixture snapshot's test files (enough lines for every source range below). */
const FILES: Record<string, string> = {
  "phpunit.xml.dist": '<?xml version="1.0"?>\n<phpunit/>\n',
  "src/Illuminate/Support/Str.php": "<?php\n",
  "tests/Bus/QueueableTest.php": "<?php\n".repeat(40),
  "tests/Integration/Database/Postgres/FulltextTest.php": "<?php\n".repeat(40),
  "tests/Integration/Database/UniqueConstraintViolationTest.php": "<?php\n".repeat(40),
  "tests/Integration/Queue/JobDispatchingTest.php": "<?php\n".repeat(40),
  "tests/Integration/Cache/RedisStoreTest.php": "<?php\n".repeat(40),
  "tests/Support/SupportStrTest.php": "<?php\n".repeat(40),
  "tests/Support/Concerns/BaseTests.php": "<?php\n".repeat(40),
};

const TOKENS = ["cfunction", "w ", "ctestIt", "c(", "c)", "w\n    ", "c{", "w\n        ", "# // a comment", "w\n        ", "c$this", "c->", "cassertTrue", "c(", "ctrue", "c)", "c;", "w\n    ", "c}"];

function raw(fields: Partial<RawTest> & Pick<RawTest, "class" | "method" | "file">): RawTest {
  const dataset = fields.dataset ?? null;
  return {
    id: `${fields.class}::${fields.method}${dataset === null ? "" : `#${dataset}`}`,
    dataset,
    source: { file: fields.file, start: 10, end: 14 },
    tokens: TOKENS,
    data: null,
    requiresDatabase: null,
    redis: false,
    ...fields,
  };
}

/** One raw line per scenario the backend rules and datasets cover. */
const RAWS: RawTest[] = [
  raw({ class: QUEUEABLE, method: "testOnConnection", file: "tests/Bus/QueueableTest.php", dataset: "uses string", data: "[0=>'redis']" }),
  raw({ class: QUEUEABLE, method: "testOnConnection", file: "tests/Bus/QueueableTest.php", dataset: "uses BackedEnum #1", data: "[0=>Illuminate\\Tests\\Bus\\ConnectionEnum::SQS]" }),
  raw({ class: STR, method: "testAscii", file: "tests/Support/SupportStrTest.php", dataset: "0", data: "[0=>'a']" }),
  raw({ class: STR, method: "testAscii", file: "tests/Support/SupportStrTest.php", dataset: "1", data: "[0=>'b']" }),
  raw({ class: STR, method: "testInherited", file: "tests/Support/SupportStrTest.php", source: { file: "tests/Support/Concerns/BaseTests.php", start: 3, end: 7 } }),
  raw({ class: POSTGRES, method: "testWhereFulltext", file: "tests/Integration/Database/Postgres/FulltextTest.php", requiresDatabase: ["pgsql"] }),
  raw({ class: POSTGRES, method: "testNoAttribute", file: "tests/Integration/Database/Postgres/FulltextTest.php" }),
  raw({ class: UNIQUE, method: "testMysql", file: "tests/Integration/Database/UniqueConstraintViolationTest.php", requiresDatabase: ["mysql"] }),
  raw({ class: QUEUE, method: "testJobCanUseCustomMethodsAfterDispatch", file: "tests/Integration/Queue/JobDispatchingTest.php", redis: true }),
  raw({ class: REDIS, method: "testItCanStoreInfinite", file: "tests/Integration/Cache/RedisStoreTest.php", redis: true }),
];

function rawText(raws: readonly RawTest[]): string {
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
  /** A locked-install stand-in: a copy of the fixture snapshot's tests, src and phpunit.xml.dist. */
  local: string;
  /** The fake PHP. */
  php: string;
  /** Holds the fake PHP, its recorded args and the raw lines it prints. */
  bin: string;
  setRaw: (raws: readonly RawTest[] | string) => void;
  inventory: () => Record<string, string>;
}

async function withFixture(body: (fx: Fixture) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-inventory-"));
  try {
    for (const file of ["tools/scaffold/packages.jsonl", COMPONENT_MAP_FILE, LISTER, "conformance/baseline-pin", ...["framework", "ai", "mcp", "boost"].map((name) => `conformance/oracle/locks/${name}/composer.lock`)]) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      copyFileSync(join(root, file), join(dir, file));
    }
    writeFiles(join(dir, "conformance", "upstream", "framework"), FILES);
    const local = join(dir, "local");
    writeFiles(local, FILES);
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const php = join(bin, "php");
    writeFileSync(php, FAKE);
    chmodSync(php, 0o755);
    const fx: Fixture = {
      dir,
      local,
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
    fx.setRaw(RAWS);
    await body(fx);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cli(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { cwd: root, env: { PATH: process.env["PATH"] ?? "", ...env }, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

/** The committed framework Inventory, file by file. */
function committed(): Map<string, InventoryEntry[]> {
  const dir = join(root, INVENTORY_DIR);
  const files = new Map<string, InventoryEntry[]>();
  for (const name of readdirSync(dir).sort()) {
    const component = name.replace(/\.jsonl$/, "");
    if (name.endsWith(".jsonl") && !FOREIGN_COMPONENTS.includes(component)) {
      files.set(component, parseInventory(readFileSync(join(dir, name), "utf8"), `${INVENTORY_DIR}/${name}`));
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// XT-conformance-49

test("XT-conformance-49: bun run inventory writes conformance/inventory/<component>.jsonl with one {id, component, kind, backends, source, hash, assertions, oracle} line per runner-listed test, and fails closed (FR-1)", async () => {
  await withFixture(async (fx) => {
    // Foreign files are never touched; a framework Component no longer generated is deleted.
    writeFiles(join(fx.dir, INVENTORY_DIR), { "ai.jsonl": "ai stays\n", "mcp.jsonl": "mcp stays\n", "boost.jsonl": "boost stays\n", "routing.jsonl": "stale\n" });

    // Generate (local): per-Component files, counts, exit 0.
    const ok = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(ok.stderr).toBe("");
    expect(ok.code).toBe(0);
    expect(ok.stdout).toBe(
      ["bus: 2 tests", "cache: 1 tests", "database: 3 tests", "queue: 1 tests", "support: 3 tests", `removed ${INVENTORY_DIR}/routing.jsonl`, "Inventory: 10 tests in 5 files.", ""].join("\n"),
    );
    expect(readFileSync(join(fx.bin, "args"), "utf8")).toBe(`${join(fx.dir, LISTER)}\n${fx.local}\n${PHP_VERSION}\n`);
    const files = fx.inventory();
    expect(Object.keys(files)).toEqual(["ai.jsonl", "boost.jsonl", "bus.jsonl", "cache.jsonl", "database.jsonl", "mcp.jsonl", "queue.jsonl", "support.jsonl"]);
    expect([files["ai.jsonl"], files["mcp.jsonl"], files["boost.jsonl"]]).toEqual(["ai stays\n", "mcp stays\n", "boost stays\n"]);

    // The record: keys in order, sorted by id, LF and a trailing newline.
    const support = files["support.jsonl"]!;
    expect(support.endsWith("\n")).toBe(true);
    const lines = support.slice(0, -1).split("\n");
    expect(lines.map((line) => JSON.parse(line).id)).toEqual([`${STR}::testAscii#0`, `${STR}::testAscii#1`, `${STR}::testInherited`]);
    expect(Object.keys(JSON.parse(lines[0]!))).toEqual(["id", "component", "kind", "backends", "source", "hash", "assertions", "oracle"]);
    expect(JSON.parse(lines[0]!)).toEqual({ id: `${STR}::testAscii#0`, component: "support", kind: "unit", backends: ["none"], source: "framework/tests/Support/SupportStrTest.php:10-14", hash: testHash(TOKENS, "[0=>'a']"), assertions: null, oracle: {} });
    // An inherited method's source is its declaring file; its id uses the concrete class.
    expect(JSON.parse(lines[2]!).source).toBe("framework/tests/Support/Concerns/BaseTests.php:3-7");
    expect(parseInventory(support, "support.jsonl").length).toBe(3);
    const database = parseInventory(files["database.jsonl"]!, "database.jsonl");
    expect(database.every((entry) => entry.kind === "integration")).toBe(true);

    // Sorting is by UTF-16 code units, not locale.
    const sorted = buildEntries([raw({ class: STR, method: "test_b", file: "tests/Support/SupportStrTest.php" }), raw({ class: STR, method: "testZ", file: "tests/Support/SupportStrTest.php" })], realMap);
    expect(sorted.map((entry) => entry.id)).toEqual([`${STR}::testZ`, `${STR}::test_b`]);
    expect([...renderInventory(sorted).keys()]).toEqual(["support"]);

    // Image mode: the lister mounted read-only and run in the default image, xaravel-oracle:<oracle tag>.
    rmSync(join(fx.dir, INVENTORY_DIR, "support.jsonl"));
    const runs: { image: string; mounts: unknown; command: readonly string[] }[] = [];
    const runner = (image: string, mounts: unknown, command: readonly string[]): string => {
      runs.push({ image, mounts, command });
      return rawText(RAWS);
    };
    expect(generate(fx.dir, { runner }).total).toBe(10);
    expect(oracleImage(fx.dir)).toMatch(/^xaravel-oracle:v13\.37\.0-[0-9a-f]{12}$/);
    expect(runs).toEqual([{ image: oracleImage(fx.dir), mounts: [{ host: join(fx.dir, LISTER), container: "/xaravel/lister.php" }], command: ["php", "/xaravel/lister.php", "/oracle/upstream/framework", PHP_VERSION] }]);
    expect(fx.inventory()).toEqual(files);
    generate(fx.dir, { image: "example.test/oracle:1", runner });
    expect(runs[1]!.image).toBe("example.test/oracle:1");
    expect(() =>
      generate(fx.dir, {
        runner: () => {
          throw new Error("php /xaravel/lister.php in x failed (exit 1): lister: expected PHP 8.5.11, running PHP 8.4.0");
        },
      }),
    ).toThrow("the lister failed: php /xaravel/lister.php in x failed (exit 1): lister: expected PHP 8.5.11, running PHP 8.4.0");

    // Unmapped: a raw test file no map entry matches.
    fx.setRaw([...RAWS, raw({ class: "Illuminate\\Tests\\Nowhere\\XTest", method: "testX", file: "tests/Nowhere/XTest.php" })]);
    writeFiles(join(fx.dir, "conformance", "upstream", "framework"), { "tests/Nowhere/XTest.php": "<?php\n".repeat(20) });
    writeFiles(fx.local, { "tests/Nowhere/XTest.php": "<?php\n".repeat(20) });
    const unmapped = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(unmapped.code).toBe(1);
    expect(unmapped.stderr).toBe("Inventory generate failed: unmapped test file: framework/tests/Nowhere/XTest.php\n");
    expect(fx.inventory()).toEqual(files);

    // Bad raw line: malformed JSON or a missing field, named by line number.
    fx.setRaw(`${rawText(RAWS.slice(0, 2))}{"id":\n`);
    const malformed = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(malformed.code).toBe(1);
    expect(malformed.stderr).toStartWith("Inventory generate failed: raw line 3: malformed JSON");
    const { redis: _redis, ...missing } = RAWS[0]!;
    fx.setRaw(`${rawText(RAWS.slice(0, 1))}${JSON.stringify(missing)}\n`);
    const field = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(field.code).toBe(1);
    expect(field.stderr).toBe('Inventory generate failed: raw line 2: missing field "redis"\n');
    expect(() => parseRaw(`${JSON.stringify({ ...RAWS[0]!, id: "X::y" })}\n`)).toThrow('raw line 1: id "X::y" is not');
    expect(() => parseRaw(`${JSON.stringify({ ...RAWS[0]!, tokens: ["xbad"] })}\n`)).toThrow('raw line 1: field "tokens"');

    // Lister fails: its exit code and stderr are reported.
    fx.setRaw(RAWS);
    writeFileSync(join(fx.bin, "fail"), "lister: unexpected phpunit output:\nThere was 1 PHPUnit test runner warning\n");
    const failed = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toBe("Inventory generate failed: the lister failed (exit 3): lister: unexpected phpunit output:\nThere was 1 PHPUnit test runner warning\n");
    rmSync(join(fx.bin, "fail"));

    // Stale local copy: a test or source file that differs from, or is missing in, the snapshot.
    writeFiles(fx.local, { "tests/Support/SupportStrTest.php": "<?php // edited\n" });
    const stale = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain(`${join(fx.local, "tests/Support/SupportStrTest.php")} differs from conformance/upstream/framework/tests/Support/SupportStrTest.php`);
    writeFiles(fx.local, { "tests/Support/SupportStrTest.php": FILES["tests/Support/SupportStrTest.php"]!, "src/Illuminate/Support/Extra.php": "<?php\n" });
    const extra = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(extra.code).toBe(1);
    expect(extra.stderr).toContain(`${join(fx.local, "src/Illuminate/Support/Extra.php")} is not in conformance/upstream/framework`);
    rmSync(join(fx.local, "src/Illuminate/Support/Extra.php"));
    rmSync(join(fx.local, "tests/Support/SupportStrTest.php"));
    const absent = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(absent.code).toBe(1);
    expect(absent.stderr).toContain(`${join(fx.local, "tests/Support/SupportStrTest.php")} is missing`);
    writeFiles(fx.local, { "tests/Support/SupportStrTest.php": FILES["tests/Support/SupportStrTest.php"]! });

    // A source outside the snapshot's tests/, or past the end of its file.
    fx.setRaw([raw({ class: STR, method: "testX", file: "tests/Support/SupportStrTest.php", source: { file: "src/Illuminate/Support/Str.php", start: 1, end: 1 } })]);
    expect(() => generate(fx.dir, { local: fx.local, php: fx.php })).toThrow("source framework/src/Illuminate/Support/Str.php is not in conformance/upstream/framework/tests/");
    fx.setRaw([raw({ class: STR, method: "testX", file: "tests/Support/SupportStrTest.php", source: { file: "tests/Support/SupportStrTest.php", start: 1, end: 999 } })]);
    expect(() => generate(fx.dir, { local: fx.local, php: fx.php })).toThrow("is past the end of the file");
    // A duplicate id.
    fx.setRaw([RAWS[0]!, RAWS[0]!]);
    expect(() => generate(fx.dir, { local: fx.local, php: fx.php })).toThrow(`duplicate test id: ${RAWS[0]!.id}`);

    // Usage errors exit 2.
    expect((await cli(["generate", "--root", fx.dir, "--image", "x", "--local", fx.local])).code).toBe(2);
    expect((await cli(["generate", "--php", fx.php])).code).toBe(2);
    expect((await cli(["list"])).code).toBe(2);

    // No snapshot: exit 1 with the sync hint, and nothing fetched or written.
    fx.setRaw(RAWS);
    rmSync(join(fx.dir, "conformance", "upstream"), { recursive: true });
    const none = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(none.code).toBe(1);
    expect(none.stderr).toBe("Inventory generate failed: conformance/upstream/framework is missing; run bun run upstream:sync\n");
  });

  // parseInventory fails closed on malformed, unsorted or misordered lines.
  const line = '{"id":"A\\\\BTest::testX","component":"support","kind":"unit","backends":["none"],"source":"framework/tests/BTest.php:1-2","hash":"' + "0".repeat(64) + '","assertions":null,"oracle":{}}';
  expect(parseInventory(`${line}\n`, "f").length).toBe(1);
  expect(() => parseInventory(line, "f")).toThrow("f: the file must end with a newline");
  expect(() => parseInventory(`${line}\n${line}\n`, "f")).toThrow("f:2: A\\BTest::testX is not sorted after");
  expect(() => parseInventory(`${line.replace('"kind":"unit",', "").replace('"component"', '"kind":"unit","component"')}\n`, "f")).toThrow("f:1: expected the keys");
  expect(() => parseInventory(`${line.replace("framework/tests/BTest.php", "framework/src/B.php")}\n`, "f")).toThrow("f:1: bad source");
  expect(() => parseInventory(`${line.replace('["none"]', '["redis","none"]')}\n`, "f")).toThrow("f:1: backends");

  // The committed Inventory: exactly 16216 unique ids, sorted and well-formed, each source inside the snapshot.
  const inventory = committed();
  const all = [...inventory.values()].flat();
  expect(all.length).toBe(16216);
  expect(new Set(all.map((entry) => entry.id)).size).toBe(16216);
  for (const [component, entries] of inventory) {
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect([entry.id, entry.component]).toEqual([entry.id, component]);
    }
  }
  if (HAS_SNAPSHOT) {
    const lengths = new Map<string, number>();
    for (const entry of all) {
      const [, path, start, end] = /^framework\/(.+):(\d+)-(\d+)$/.exec(entry.source)!;
      if (!lengths.has(path!)) {
        const file = join(SNAPSHOT, path!);
        lengths.set(path!, existsSync(file) ? readFileSync(file, "utf8").split("\n").length : 0);
      }
      const length = lengths.get(path!)!;
      expect([entry.source, length >= Number(end) && Number(start) >= 1]).toEqual([entry.source, true]);
    }
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-50

test("XT-conformance-50: each #[DataProvider] or #[TestWith] dataset, runtime-computed ones included, is its own entry, an unnamed dataset using its numeric index (FR-1)", async () => {
  await withFixture((fx) => {
    generate(fx.dir, { local: fx.local, php: fx.php });
    const bus = parseInventory(fx.inventory()["bus.jsonl"]!, "bus.jsonl");
    expect(bus.map((entry) => entry.id)).toEqual([`${QUEUEABLE}::testOnConnection#uses BackedEnum #1`, `${QUEUEABLE}::testOnConnection#uses string`]);
    expect(bus[0]!.hash).not.toBe(bus[1]!.hash);
    const support = parseInventory(fx.inventory()["support.jsonl"]!, "support.jsonl");
    expect(support.slice(0, 2).map((entry) => entry.id)).toEqual([`${STR}::testAscii#0`, `${STR}::testAscii#1`]);
  });

  // The lister takes PHPUnit's own listing as the set of ids and joins every dataset to a provider label.
  const lister = readFileSync(join(root, LISTER), "utf8");
  for (const needle of ["--list-tests-xml", "PHPUnit\\Metadata\\Api\\DataProvider", "matches no provider label", "unexpected phpunit output", "expected PHP "]) {
    expect([needle, lister.includes(needle)]).toEqual([needle, true]);
  }

  const ids = new Set([...committed().values()].flat().map((entry) => entry.id));
  for (const id of [
    "Illuminate\\Tests\\Bus\\QueueableTest::testOnConnection#uses string",
    "Illuminate\\Tests\\Bus\\QueueableTest::testOnConnection#uses BackedEnum #1",
    "Illuminate\\Tests\\Auth\\AuthAccessGateTest::testHasAbilities#0",
    "Illuminate\\Tests\\Auth\\AuthAccessGateTest::testHasAbilities#1",
    "Illuminate\\Tests\\Auth\\AuthAccessGateTest::testBasicClosuresCanBeDefined",
  ]) {
    expect([id, ids.has(id)]).toEqual([id, true]);
  }
  // A test whose provider PHPUnit does not call (an unmet requirement) is listed once, without a dataset.
  expect(ids.has("Illuminate\\Tests\\Filesystem\\JoinPathsHelperTest::testItCanMergePathsForWindows")).toBe(true);
});

// ---------------------------------------------------------------------------
// XT-conformance-51

test("XT-conformance-51: backends come from #[RequiresDatabase], the Integration/Database/<Engine> directories, InteractsWithRedis and the Integration/Queue suite, otherwise [\"none\"] (FR-1)", async () => {
  const b = (fields: Partial<Pick<RawTest, "file" | "requiresDatabase" | "redis">>): string[] => backendsFor({ id: "T::t", file: "tests/Support/XTest.php", requiresDatabase: null, redis: false, ...fields });
  expect(b({})).toEqual(["none"]);
  expect(b({ requiresDatabase: ["sqlite", "mysql", "sqlite"] })).toEqual(["mysql", "sqlite"]);
  expect(b({ file: "tests/Integration/Database/Postgres/XTest.php" })).toEqual(["pgsql"]);
  expect(b({ file: "tests/Integration/Database/MySql/XTest.php" })).toEqual(["mysql"]);
  expect(b({ file: "tests/Integration/Database/MariaDb/XTest.php" })).toEqual(["mariadb"]);
  expect(b({ file: "tests/Integration/Database/SqlServer/XTest.php" })).toEqual(["sqlsrv"]);
  expect(b({ file: "tests/Integration/Database/Sqlite/XTest.php" })).toEqual(["sqlite"]);
  expect(b({ file: "tests/Integration/Database/XTest.php" })).toEqual(["none"]);
  expect(b({ file: "tests/Integration/Database/Fixtures/XTest.php" })).toEqual(["none"]);
  expect(b({ file: "tests/Integration/Database/Sqlite/XTest.php", requiresDatabase: ["mysql", "sqlite"] })).toEqual(["sqlite"]);
  expect(b({ redis: true })).toEqual(["redis"]);
  expect(b({ file: "tests/Integration/Queue/XTest.php" })).toEqual([...QUEUE_BACKENDS]);
  expect(b({ file: "tests/Integration/Queue/XTest.php", redis: true })).toEqual([...QUEUE_BACKENDS, "redis"].sort());
  expect(b({ file: "tests/Integration/Database/Postgres/XTest.php", redis: true })).toEqual(["pgsql", "redis"]);
  // DB conflict: an empty intersection keeps the directory's engine, or none (decisions/ESC-2.4-1.md).
  expect(b({ file: "tests/Integration/Database/Postgres/XTest.php", requiresDatabase: ["mysql"] })).toEqual(["pgsql"]);
  expect(b({ file: "tests/Integration/Database/Sqlite/XTest.php", requiresDatabase: [] })).toEqual(["sqlite"]);
  expect(b({ requiresDatabase: [] })).toEqual(["none"]);
  expect(b({ file: "tests/Integration/Database/XTest.php", requiresDatabase: [] })).toEqual(["none"]);
  expect(b({ requiresDatabase: [], redis: true })).toEqual(["redis"]);
  expect(kindFor("tests/Integration/Queue/XTest.php")).toBe("integration");
  expect(kindFor("tests/Queue/XTest.php")).toBe("unit");

  await withFixture(async (fx) => {
    generate(fx.dir, { local: fx.local, php: fx.php });
    const byId = new Map(Object.values(fx.inventory()).flatMap((text) => (text.startsWith("{") ? parseInventory(text, "f") : [])).map((entry) => [entry.id, entry.backends]));
    expect(byId.get(`${POSTGRES}::testWhereFulltext`)).toEqual(["pgsql"]);
    expect(byId.get(`${POSTGRES}::testNoAttribute`)).toEqual(["pgsql"]);
    expect(byId.get(`${UNIQUE}::testMysql`)).toEqual(["mysql"]);
    expect(byId.get(`${REDIS}::testItCanStoreInfinite`)).toEqual(["redis"]);
    expect(byId.get(`${STR}::testAscii#0`)).toEqual(["none"]);

    // DB conflict through the CLI: Postgres/ plus #[RequiresDatabase('mysql')].
    fx.setRaw([raw({ class: POSTGRES, method: "testConflict", file: "tests/Integration/Database/Postgres/FulltextTest.php", requiresDatabase: ["mysql"] })]);
    const conflict = await cli(["generate", "--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect([conflict.code, conflict.stderr]).toEqual([0, ""]);
    expect(Object.values(fx.inventory()).flatMap((text) => (text.startsWith("{") ? parseInventory(text, "f") : [])).map((entry) => [entry.id, entry.backends])).toContainEqual([`${POSTGRES}::testConflict`, ["pgsql"]]);
  });

  // The committed Inventory.
  const all = [...committed().values()].flat();
  const unique = all.filter((entry) => entry.id.startsWith(`${UNIQUE}::`));
  expect(unique.length).toBeGreaterThan(0);
  for (const entry of unique) {
    expect([entry.id, entry.backends.length, entry.backends[0] !== "none"]).toEqual([entry.id, 1, true]);
  }
  expect(new Set(unique.map((entry) => entry.backends[0]))).toEqual(new Set(["mysql", "pgsql", "sqlite", "sqlsrv"]));
  const postgres = all.filter((entry) => entry.source.startsWith("framework/tests/Integration/Database/Postgres/") || entry.id.startsWith("Illuminate\\Tests\\Integration\\Database\\Postgres\\"));
  expect(postgres.length).toBeGreaterThan(0);
  for (const entry of postgres.filter((item) => item.id.startsWith("Illuminate\\Tests\\Integration\\Database\\Postgres\\"))) {
    expect([entry.id, entry.backends.includes("pgsql")]).toEqual([entry.id, true]);
  }
  // decisions/ESC-2.4-1.md: the inherited tests whose attributes exclude their engine directory keep that engine.
  const escalated = all.filter((entry) => /^Illuminate\\Tests\\Integration\\Database\\Sqlite\\SchemaBuilderSchemaNameTest::(testForeignKeys|testComment|testAutoIncrementStartingValue|testHasTable)#/.test(entry.id));
  expect(escalated.map((entry) => entry.backends)).toEqual(Array.from({ length: 8 }, () => ["sqlite"]));
  const redisCache = all.filter((entry) => entry.id.startsWith("Illuminate\\Tests\\Integration\\Cache\\RedisStoreTest::"));
  expect(redisCache.length).toBeGreaterThan(0);
  for (const entry of redisCache) {
    expect([entry.id, entry.backends]).toEqual([entry.id, ["redis"]]);
  }
  const queue = all.filter((entry) => entry.id.startsWith("Illuminate\\Tests\\Integration\\Queue\\"));
  expect(queue.length).toBeGreaterThan(0);
  for (const entry of queue) {
    expect([entry.id, QUEUE_BACKENDS.every((backend) => entry.backends.includes(backend))]).toEqual([entry.id, true]);
  }
  const supportStr = all.filter((entry) => entry.id.startsWith(`${STR}::`));
  expect(supportStr.length).toBeGreaterThan(0);
  for (const entry of supportStr) {
    expect([entry.id, entry.backends]).toEqual([entry.id, ["none"]]);
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-52

test("XT-conformance-52: hash covers the method's code tokens and the dataset export; whitespace and comments leave it, code and data change it; generation is byte-identical (FR-7)", async () => {
  const base = testHash(TOKENS, "[0=>'a']");
  expect(base).toMatch(/^[0-9a-f]{64}$/);
  expect(normaliseTokens(TOKENS)).toEqual(["function", "testIt", "(", ")", "{", "$this", "->", "assertTrue", "(", "true", ")", ";", "}"]);
  // Whitespace and comment tokens: unchanged.
  const reformatted = TOKENS.flatMap((token) => (token.startsWith("w") ? ["w  \n\t"] : token.startsWith("#") ? ["# /* other */", "w\n"] : [token]));
  expect(testHash(reformatted, "[0=>'a']")).toBe(base);
  expect(testHash(TOKENS.filter((token) => !token.startsWith("#")), "[0=>'a']")).toBe(base);
  // A code token or the dataset: changed.
  expect(testHash(TOKENS.map((token) => (token === "ctrue" ? "cfalse" : token)), "[0=>'a']")).not.toBe(base);
  expect(testHash(TOKENS, "[0=>'b']")).not.toBe(base);
  expect(testHash(TOKENS, null)).not.toBe(base);
  // Token boundaries count: ["ab"] is not ["a", "b"].
  expect(testHash(["cab"], null)).not.toBe(testHash(["ca", "cb"], null));
  expect(() => normaliseTokens(["xfoo"])).toThrow("has no kind prefix");

  // Two generations of the same input are byte-identical.
  await withFixture((fx) => {
    generate(fx.dir, { local: fx.local, php: fx.php });
    const first = fx.inventory();
    generate(fx.dir, { local: fx.local, php: fx.php });
    expect(fx.inventory()).toEqual(first);
    // Reordered raw lines give the same files.
    fx.setRaw([...RAWS].reverse());
    generate(fx.dir, { local: fx.local, php: fx.php });
    expect(fx.inventory()).toEqual(first);
  });

  // The committed hashes are well-formed.
  const all = [...committed().values()].flat();
  expect(all.every((entry) => /^[0-9a-f]{64}$/.test(entry.hash))).toBe(true);
});
