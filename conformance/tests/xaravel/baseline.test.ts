// Xaravel Tests for Story 2.6 (Upstream baseline run: assertion kinds and
// Oracle outcomes, FR-3, FR-113). These run under plain `bun test` until the
// harness lands in Epic 5. The run, the merge and the Inventory's carry-over
// are exercised against hermetic fixture roots with a fake `--php` that
// prints canned lister and recorder lines, so no test needs PHP, a container
// runtime or vendor files. The committed Inventory, the workflow and the
// Dockerfile are checked directly.
import { expect } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  ALPHA_VARIANTS,
  collectResults,
  compareAttempts,
  IMAGE_USER,
  legEnv,
  LEGS,
  mergeResults,
  networkedRunArgs,
  NONDETERMINISM_FILE,
  parseFindings,
  parseResults,
  parseRunArgs,
  planRun,
  renderResults,
  resultsFile,
  SERVICE_ENV,
  SERVICE_LEGS,
  SQLITE_VARIANTS,
  VARIANT_ENV,
  variantsFor,
  type Finding,
  type Result,
  type ResultsLookup,
} from "../../../tools/baseline/baseline";
import { carryOver, INVENTORY_DIR, LISTER, parseInventory, PEST_SUITES, PHP_VERSION, renderInventory, suiteInventoryFiles, SUITES, type InventoryEntry, type RawTest, type Suite } from "../../../tools/inventory/inventory";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "baseline", "baseline.ts");
const HASH = "0".repeat(64);

// ---------------------------------------------------------------------------
// Fixture

const QUEUEABLE = "Illuminate\\Tests\\Bus\\QueueableTest";
const SQLITE_TEST = "Illuminate\\Tests\\Integration\\Database\\Sqlite\\SchemaBuilderSchemaNameTest";
const PGSQL_TEST = "Illuminate\\Tests\\Integration\\Database\\Postgres\\FulltextTest";
const MYSQL_TEST = "Illuminate\\Tests\\Integration\\Database\\MySql\\FulltextTest";

function entry(id: string, backends: string[], fields: Partial<InventoryEntry> = {}): InventoryEntry {
  const file = `framework/tests/${id.split("::")[0]!.replace("Illuminate\\Tests\\", "").split("\\").join("/")}.php`;
  return { id, component: id.includes("\\Bus\\") ? "bus" : "database", kind: id.includes("Integration") ? "integration" : "unit", backends, source: `${file}:1-2`, hash: HASH, assertions: null, oracle: {}, ...fields };
}

/** One entry per matrix row: pass with kinds, skip, fail, non-alpha only and mixed backends. */
const ENTRIES: InventoryEntry[] = [
  entry(`${QUEUEABLE}::testOnConnection#uses string`, ["none"]),
  entry(`${QUEUEABLE}::testOnQueue`, ["none"]),
  entry(`${MYSQL_TEST}::testWhereFulltext`, ["mysql"]),
  entry(`${PGSQL_TEST}::testWhereFulltext`, ["pgsql"]),
  entry(`${SQLITE_TEST}::testHasTable#with prefix`, ["mariadb", "mysql", "sqlite"]),
];

function raw(id: string, file: string): RawTest {
  const [cls, rest] = id.split("::") as [string, string];
  const [method, dataset] = rest.includes("#") ? (rest.split("#") as [string, string]) : [rest, null];
  return { id, class: cls, method, dataset, file, source: { file, start: 1, end: 2 }, tokens: ["cfunction"], data: null, requiresDatabase: null, redis: false };
}

const fileOf = (entry: InventoryEntry): string => entry.source.replace(/^framework\//, "").replace(/:\d+-\d+$/, "");
const RAWS: RawTest[] = ENTRIES.map((e) => raw(e.id, fileOf(e)));

function recorderLine(test: string | null, outcome: string | null, assertions: Record<string, number> = {}, cls: string | null = null): string {
  return `${JSON.stringify({ test, class: cls, outcome, assertions })}\n`;
}

function result(id: string, outcome: Result["outcome"], assertions: Record<string, number> = {}): Result {
  return { id, outcome, assertions };
}

/** A results lookup over in-memory files keyed `<suite>.<variant>.<attempt>.jsonl`. */
function lookupOf(files: Record<string, Result[]>): ResultsLookup {
  return (suite, variant, attempt) => {
    const list = files[resultsFile(suite, variant, attempt)];
    return list === undefined ? null : new Map(list.map((r) => [r.id, r]));
  };
}

/** A fake PHP: the lister prints `lister.jsonl`, the runner records its files and env and prints `recorder.jsonl`, testbench leaves a marker. */
const FAKE = [
  "#!/bin/sh",
  'here="$(dirname "$0")"',
  'echo "$*" >> "$here/calls"',
  'case "$1" in',
  '  *lister.php) cat "$here/lister.jsonl" ;;',
  '  *runner.php) if [ "$5" != "-" ]; then cp "$5" "$here/files"; fi; env | grep -E "^(DB|REDIS|QUEUE)_" | sort > "$here/env"; cat "$here/recorder.jsonl" ;;',
  '  vendor/bin/testbench) touch "$here/sqlite-created" ;;',
  "  *) exit 9 ;;",
  "esac",
  "",
].join("\n");

interface Fixture {
  dir: string;
  local: string;
  php: string;
  bin: string;
  out: string;
  inventory: () => Record<string, string>;
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

async function withFixture(body: (fx: Fixture) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-baseline-"));
  try {
    const snapshotFiles: Record<string, string> = { "phpunit.xml.dist": "<phpunit/>\n" };
    for (const e of ENTRIES) {
      snapshotFiles[fileOf(e)] = "<?php\n".repeat(5);
    }
    writeFiles(join(dir, "conformance", "upstream", "framework"), snapshotFiles);
    const local = join(dir, "local");
    writeFiles(local, snapshotFiles);
    for (const tool of [LISTER, "tools/baseline/runner.php", "tools/baseline/recorder.php"]) {
      writeFiles(dir, { [tool]: readFileSync(join(root, tool), "utf8") });
    }
    writeFiles(join(dir, INVENTORY_DIR), Object.fromEntries([...renderInventory(ENTRIES)].map(([component, text]) => [`${component}.jsonl`, text])));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const php = join(bin, "php");
    writeFileSync(php, FAKE);
    chmodSync(php, 0o755);
    writeFileSync(join(bin, "lister.jsonl"), RAWS.map((r) => `${JSON.stringify(r)}\n`).join(""));
    await body({
      dir,
      local,
      php,
      bin,
      out: join(dir, "out"),
      inventory: () => {
        const out: Record<string, string> = {};
        for (const name of readdirSync(join(dir, INVENTORY_DIR)).sort()) {
          out[name] = readFileSync(join(dir, INVENTORY_DIR, name), "utf8");
        }
        return out;
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { cwd: root, env: { PATH: process.env["PATH"] ?? "" }, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

/** The committed Inventory of every suite. */
function committed(): InventoryEntry[] {
  const dir = join(root, INVENTORY_DIR);
  const entries: InventoryEntry[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === NONDETERMINISM_FILE) {
      continue;
    }
    const component = name.replace(/\.jsonl$/, "");
    const suite: Suite = (PEST_SUITES as readonly string[]).includes(component) ? (component as Suite) : "framework";
    entries.push(...parseInventory(readFileSync(join(dir, name), "utf8"), `${INVENTORY_DIR}/${name}`, suite));
  }
  return entries;
}

const workflow = (): Record<string, unknown> => Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "baseline.yml"), "utf8")) as Record<string, unknown>;

// XT-conformance-56
// Verifies: FR-3, FR-113 (each Inventory entry carries the assertion kinds and Oracle outcome of the baseline run)
xaravelTest("XT-conformance-56", "the baseline workflow runs every leg in the Oracle image with Postgres 18 and Redis 8.10.2, and every Inventory entry gets assertions and oracle keyed by exactly its alpha variants (FR-3, FR-113, AD-15.2)", async () => {
  // Variants: the alpha set, each entry's oracle keys, and each variant's environment.
  expect(ALPHA_VARIANTS).toEqual(["none", "pgsql", "queue-database@sqlite", "queue-redis@redis", "queue-sync@none", "redis", "sqlite"]);
  expect(variantsFor(["none"])).toEqual(["none"]);
  expect(variantsFor(["mysql"])).toEqual([]);
  expect(variantsFor(["mariadb", "mysql", "sqlite"])).toEqual(["sqlite"]);
  expect(variantsFor(["queue-beanstalkd@beanstalkd", "queue-database@sqlite", "queue-redis@redis", "queue-sync@none", "redis"])).toEqual(["queue-database@sqlite", "queue-redis@redis", "queue-sync@none", "redis"]);
  expect(VARIANT_ENV["none"]).toEqual({});
  expect(VARIANT_ENV["sqlite"]).toEqual({ DB_CONNECTION: "sqlite" });
  expect(VARIANT_ENV["pgsql"]).toEqual({ DB_CONNECTION: "pgsql", DB_HOST: "127.0.0.1", DB_PORT: "5432", DB_DATABASE: "laravel", DB_USERNAME: "forge", DB_PASSWORD: "password" });
  expect(VARIANT_ENV["redis"]).toEqual({ REDIS_CLIENT: "phpredis", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379", REDIS_CACHE_CONNECTION: "cache", REDIS_CACHE_LOCK_CONNECTION: "cache", CACHE_STORE: "redis" });
  expect(VARIANT_ENV["queue-sync@none"]).toEqual({ QUEUE_CONNECTION: "sync" });
  expect(VARIANT_ENV["queue-database@sqlite"]).toEqual({ DB_CONNECTION: "sqlite", QUEUE_CONNECTION: "database" });
  expect(VARIANT_ENV["queue-redis@redis"]).toEqual({ REDIS_CLIENT: "phpredis", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379", REDIS_CACHE_CONNECTION: "cache", REDIS_CACHE_LOCK_CONNECTION: "cache", QUEUE_CONNECTION: "redis" });
  expect(SQLITE_VARIANTS).toEqual(["queue-database@sqlite", "sqlite"]);
  // Upstream's linux_tests services env, on the framework none and queue-sync@none legs only (ESC-2.6-2).
  expect(SERVICE_ENV).toEqual({ DB_PORT: "3306", DB_USERNAME: "root", DYNAMODB_CACHE_TABLE: "laravel_dynamodb_test", DYNAMODB_ENDPOINT: "http://localhost:8888", AWS_ACCESS_KEY_ID: "randomKey", AWS_SECRET_ACCESS_KEY: "randomSecret" });
  expect(SERVICE_LEGS as readonly { suite: string; variant: string }[]).toEqual([{ suite: "framework", variant: "none" }, { suite: "framework", variant: "queue-sync@none" }]);
  expect(legEnv("framework", "none")).toEqual(SERVICE_ENV);
  expect(legEnv("framework", "queue-sync@none")).toEqual({ QUEUE_CONNECTION: "sync", ...SERVICE_ENV });
  expect(legEnv("framework", "pgsql")).toEqual(VARIANT_ENV["pgsql"]!);
  expect(legEnv("framework", "sqlite")).toEqual({ DB_CONNECTION: "sqlite" });
  expect(legEnv("ai", "none")).toEqual({});
  expect(legEnv("boost", "none")).toEqual({});
  expect(VARIANT_ENV["none"]).toEqual({});
  expect(LEGS as readonly { suite: string; variant: string }[]).toEqual([...ALPHA_VARIANTS.map((variant) => ({ suite: "framework", variant })), { suite: "ai", variant: "none" }, { suite: "mcp", variant: "none" }, { suite: "boost", variant: "none" }]);

  // The plan: a leg covers only the files holding tagged entries; the whole suite when that is every file.
  const sqlitePlan = planRun("framework", "sqlite", ENTRIES, RAWS);
  expect(sqlitePlan.files).toEqual(["tests/Integration/Database/Sqlite/SchemaBuilderSchemaNameTest.php"]);
  expect([...sqlitePlan.tagged.values()]).toEqual([`${SQLITE_TEST}::testHasTable#with prefix`]);
  expect(planRun("framework", "none", ENTRIES.filter((e) => e.backends.includes("none")), RAWS.slice(0, 2)).files).toBeNull();
  expect(() => planRun("framework", "pgsql", ENTRIES, RAWS.slice(0, 2))).toThrow("the lister does not list 1 framework Inventory entries tagged pgsql, first");
  expect(() => planRun("framework", "none", ENTRIES.slice(1), RAWS)).toThrow("which is not in the framework Inventory");

  // Pass with kinds: outermost assert* calls counted per kind; records only the tagged IDs.
  const nonePlan = planRun("framework", "none", ENTRIES, RAWS);
  const none = collectResults(
    nonePlan,
    [
      recorderLine(`${QUEUEABLE}::testOnConnection#uses string`, "pass", { assertSame: 2, assertTrue: 1 }),
      recorderLine(`${QUEUEABLE}::testOnQueue`, "pass"),
      recorderLine(`${PGSQL_TEST}::testWhereFulltext`, "skip"),
    ].join(""),
  );
  expect(none).toEqual([result(`${QUEUEABLE}::testOnConnection#uses string`, "pass", { assertSame: 2, assertTrue: 1 }), result(`${QUEUEABLE}::testOnQueue`, "pass")]);
  expect(renderResults(none)).toBe(
    `{"id":${JSON.stringify(`${QUEUEABLE}::testOnConnection#uses string`)},"outcome":"pass","assertions":{"assertSame":2,"assertTrue":1}}\n{"id":${JSON.stringify(`${QUEUEABLE}::testOnQueue`)},"outcome":"pass","assertions":{}}\n`,
  );
  expect(parseResults(renderResults(none), "f")).toEqual(new Map(none.map((r) => [r.id, r])));
  // A test run in a separate process records its assertions in the child (outcome null): they are summed.
  expect(collectResults(nonePlan, [recorderLine(`${QUEUEABLE}::testOnQueue`, null, { assertSame: 1 }), recorderLine(`${QUEUEABLE}::testOnQueue`, "pass", { assertSame: 1 }), recorderLine(`${QUEUEABLE}::testOnConnection#uses string`, "pass")].join(""))[1]).toEqual(
    result(`${QUEUEABLE}::testOnQueue`, "pass", { assertSame: 2 }),
  );
  // Fails closed: a tagged ID with no outcome, an outcome for an unlisted test, a malformed line.
  expect(() => collectResults(nonePlan, recorderLine(`${QUEUEABLE}::testOnQueue`, "pass"))).toThrow(`1 tagged framework tests got no outcome on none:\n  ${QUEUEABLE}::testOnConnection#uses string`);
  expect(() => collectResults(nonePlan, recorderLine(`${QUEUEABLE}::testElse`, "pass"))).toThrow(`the run reported ${QUEUEABLE}::testElse, which the lister does not list`);
  expect(() => collectResults(nonePlan, '{"test":"x"}\n')).toThrow("recorder line 1: expected the keys test, class, outcome, assertions");
  expect(() => collectResults(nonePlan, recorderLine(`${QUEUEABLE}::testOnQueue`, "pass", { expectException: 1 }))).toThrow("recorder line 1: assertions must map assert* kinds");

  // Merge: oracle keys are exactly the alpha variants, assertions the maximum per kind, null with none.
  const merged = mergeResults(
    [entry("A\\BTest::testX", ["queue-redis@redis", "queue-sync@none", "redis"]), entry("A\\BTest::testY", ["mysql"]), entry("A\\BTest::testZ", ["mariadb", "mysql", "sqlite"])],
    lookupOf(
      Object.fromEntries(
        [1, 2].flatMap((attempt) => [
          [resultsFile("framework", "redis", attempt), [result("A\\BTest::testX", "pass", { assertSame: 1, assertTrue: 2 })]],
          [resultsFile("framework", "queue-redis@redis", attempt), [result("A\\BTest::testX", "pass", { assertSame: 3 })]],
          [resultsFile("framework", "queue-sync@none", attempt), [result("A\\BTest::testX", "skip")]],
          [resultsFile("framework", "sqlite", attempt), [result("A\\BTest::testZ", "pass", {})]],
        ]),
      ),
    ),
  );
  expect(merged.problems).toEqual([]);
  expect(merged.entries.map((e) => [e.assertions, e.oracle])).toEqual([
    [{ assertSame: 3, assertTrue: 2 }, { "queue-redis@redis": "pass", "queue-sync@none": "skip", redis: "pass" }],
    [null, {}],
    [{}, { sqlite: "pass" }],
  ]);
  expect([...renderInventory(merged.entries).values()].join("")).toContain('"assertions":{"assertSame":3,"assertTrue":2},"oracle":{"queue-redis@redis":"pass","queue-sync@none":"skip","redis":"pass"}}');

  // The record: eight keys in order; the new fields are validated.
  const line = JSON.stringify({ id: "A\\BTest::testX", component: "support", kind: "unit", backends: ["none", "x"].slice(0, 1), source: "framework/tests/BTest.php:1-2", hash: HASH, assertions: { assertSame: 1 }, oracle: { none: "pass" } });
  expect(parseInventory(`${line}\n`, "f")[0]!.oracle).toEqual({ none: "pass" });
  expect(parseInventory(`${line.replace('{"assertSame":1}', "null").replace('{"none":"pass"}', "{}")}\n`, "f")[0]!.assertions).toBeNull();
  expect(() => parseInventory(`${line.replace('{"assertSame":1}', "null")}\n`, "f")).toThrow("f:1: assertions must be null exactly when oracle is {}");
  expect(() => parseInventory(`${line.replace('{"none":"pass"}', '{"sqlite":"pass"}')}\n`, "f")).toThrow("f:1: oracle keys must be exactly the alpha variants in backends");
  expect(() => parseInventory(`${line.replace('"pass"', '"ok"')}\n`, "f")).toThrow("f:1: oracle must be an object of pass, skip or fail");
  expect(() => parseInventory(`${line.replace('"assertSame":1', '"assertSame":0')}\n`, "f")).toThrow("f:1: assertions must be null or an object");
  expect(() => parseInventory(`${line.replace('"assertSame":1', '"assertTrue":1,"assertSame":1')}\n`, "f")).toThrow("f:1: assertions must be null or an object");
  expect(() => parseInventory(`${line.replace(',"oracle":{"none":"pass"}', "")}\n`, "f")).toThrow("f:1: expected the keys");

  // Regenerate: an unchanged entry keeps its fields byte-for-byte; a changed hash or backends gets null and {}.
  const baselined = { ...entry("A\\BTest::testX", ["none"]), assertions: { assertSame: 1 }, oracle: { none: "pass" as const } };
  expect(carryOver([{ ...baselined, assertions: null, oracle: {} }], [baselined])).toEqual([baselined]);
  expect(carryOver([{ ...baselined, hash: "1".repeat(64), assertions: null, oracle: {} }], [baselined])[0]).toMatchObject({ assertions: null, oracle: {} });
  expect(carryOver([{ ...baselined, backends: ["redis"], assertions: null, oracle: {} }], [baselined])[0]).toMatchObject({ assertions: null, oracle: {} });
  expect(carryOver([{ ...baselined, id: "A\\BTest::testW", assertions: null, oracle: {} }], [baselined])[0]).toMatchObject({ assertions: null, oracle: {} });

  // The run (local mode, fake PHP): lister, then testbench for SQLite, then the runner on the tagged files with the variant's env.
  await withFixture(async (fx) => {
    writeFileSync(join(fx.bin, "recorder.jsonl"), recorderLine(`${SQLITE_TEST}::testHasTable#with prefix`, "skip"));
    const ok = await cli(["run", "--root", fx.dir, "--suite", "framework", "--variant", "sqlite", "--attempt", "1", "--out", fx.out, "--local", fx.local, "--php", fx.php]);
    expect([ok.code, ok.stderr]).toEqual([0, ""]);
    expect(ok.stdout).toBe(`framework on sqlite, attempt 1: 1 tests (0 pass, 1 skip, 0 fail); wrote ${join(fx.out, "framework.sqlite.1.jsonl")}\n`);
    expect(readFileSync(join(fx.out, "framework.sqlite.1.jsonl"), "utf8")).toBe(`{"id":${JSON.stringify(`${SQLITE_TEST}::testHasTable#with prefix`)},"outcome":"skip","assertions":{}}\n`);
    expect(readFileSync(join(fx.bin, "files"), "utf8")).toBe("tests/Integration/Database/Sqlite/SchemaBuilderSchemaNameTest.php\n");
    expect(readFileSync(join(fx.bin, "env"), "utf8")).toBe("DB_CONNECTION=sqlite\n");
    expect(existsSync(join(fx.bin, "sqlite-created"))).toBe(true);
    const calls = readFileSync(join(fx.bin, "calls"), "utf8").split("\n");
    expect(calls[0]).toBe(`${join(fx.dir, LISTER)} ${fx.local} ${PHP_VERSION}`);
    expect(calls[1]).toBe("vendor/bin/testbench package:create-sqlite-db");
    expect(calls[2]!.startsWith(`${join(fx.dir, "tools", "baseline", "runner.php")} ${fx.local} ${PHP_VERSION} phpunit `)).toBe(true);

    // pgsql: its env, no SQLite database.
    rmSync(join(fx.bin, "sqlite-created"));
    writeFileSync(join(fx.bin, "recorder.jsonl"), recorderLine(`${PGSQL_TEST}::testWhereFulltext`, "pass", { assertCount: 1 }));
    const pg = await cli(["run", "--root", fx.dir, "--suite", "framework", "--variant", "pgsql", "--attempt", "2", "--out", fx.out, "--local", fx.local, "--php", fx.php]);
    expect([pg.code, pg.stderr]).toEqual([0, ""]);
    expect(readFileSync(join(fx.bin, "env"), "utf8")).toBe("DB_CONNECTION=pgsql\nDB_DATABASE=laravel\nDB_HOST=127.0.0.1\nDB_PASSWORD=password\nDB_PORT=5432\nDB_USERNAME=forge\n");
    expect(existsSync(join(fx.bin, "sqlite-created"))).toBe(false);

    // A tagged ID that gets no outcome fails the run, which writes nothing.
    writeFileSync(join(fx.bin, "recorder.jsonl"), "");
    const missing = await cli(["run", "--root", fx.dir, "--suite", "framework", "--variant", "none", "--attempt", "1", "--out", fx.out, "--local", fx.local, "--php", fx.php]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("Baseline run failed: 2 tagged framework tests got no outcome on none:");
    expect(existsSync(join(fx.out, "framework.none.1.jsonl"))).toBe(false);
  });

  // Bad usage: an unknown variant or suite, a missing flag, a Pest suite off none.
  for (const [args, message] of [
    [["run", "--suite", "framework", "--variant", "mysql", "--attempt", "1", "--out", "o"], "Unknown variant: mysql"],
    [["run", "--suite", "laravel", "--variant", "none", "--attempt", "1", "--out", "o"], "Unknown suite: laravel"],
    [["run", "--suite", "framework", "--variant", "none", "--out", "o"], "--attempt is required"],
    [["run", "--suite", "framework", "--variant", "none", "--attempt", "3", "--out", "o"], "--attempt must be 1 or 2"],
    [["run", "--suite", "mcp", "--variant", "pgsql", "--attempt", "1", "--out", "o"], "mcp runs only on none"],
    [["run", "--suite", "framework", "--variant", "none", "--attempt", "1", "--out", "o", "--php", "php"], "--php needs --local"],
    [["merge"], "--in is required"],
    [["bogus"], "Unknown command: bogus"],
  ] as const) {
    const bad = await cli([...args]);
    expect(bad.code).toBe(2);
    expect(bad.stderr.split("\n")[0]!.startsWith(message)).toBe(true);
    expect(bad.stderr).toContain("Usage:");
  }
  expect(parseRunArgs(["--suite", "ai", "--variant", "none", "--attempt", "2", "--out", "o", "--image", "img"])).toMatchObject({ suite: "ai", variant: "none", attempt: 2, image: "img" });

  // The networked image run: host network, the non-root user (uid 1001, the GitHub runner's), the env, read-only
  // tool mounts and one read-write output mount.
  expect(IMAGE_USER).toBe("1001:1001");
  expect(networkedRunArgs("img", { env: { DB_CONNECTION: "pgsql", DB_HOST: "127.0.0.1" }, mounts: [{ host: "/t", container: "/xaravel/baseline" }], output: { host: "/w", container: "/xaravel/work" } }, ["php", "x"])).toEqual([
    "run",
    "--rm",
    "--network",
    "host",
    "--user",
    "1001:1001",
    "--env",
    "DB_CONNECTION=pgsql",
    "--env",
    "DB_HOST=127.0.0.1",
    "--volume",
    "/t:/xaravel/baseline:ro",
    "--volume",
    "/w:/xaravel/work:rw",
    "img",
    "php",
    "x",
  ]);

  // The recorder and runner: outermost Assert::assert* calls, the PHPUnit events, the generated config.
  const recorder = readFileSync(join(root, "tools", "baseline", "recorder.php"), "utf8");
  expect(recorder).toContain("if ($callerClass === 'PHPUnit\\Framework\\Assert') {");
  expect(recorder).toContain("\\getenv('XARAVEL_BASELINE_OUT')");
  // A pcntl_fork child (FilesystemTest::testSharedGet forks 20) never flushes, or it would repeat every count so far.
  expect(recorder).toContain("if (\\getmypid() !== $recorderPid) {");
  for (const event of ["PreparationStarted", "Passed", "Skipped", "MarkedIncomplete", "Failed", "Errored", "BeforeFirstTestMethodErrored", "Finished"]) {
    expect(recorder).toContain(`\\PHPUnit\\Event\\Test\\${event}Subscriber`);
  }
  const runnerPhp = readFileSync(join(root, "tools", "baseline", "runner.php"), "utf8");
  expect(runnerPhp).toContain("'auto_prepend_file='.$recorder");
  expect(runnerPhp).toContain("'--do-not-cache-result'");
  expect(runnerPhp).toContain("Xaravel\\\\Baseline\\\\Extension");

  // The image: Upstream's Linux CI extension set, PECL sources checked against pinned sha256, redis configured as Upstream does.
  const dockerfile = readFileSync(join(root, "conformance", "oracle", "Dockerfile"), "utf8");
  expect(dockerfile).toMatch(/-php-ext-install -j"\$\(nproc\)" gmp pdo_mysql pdo_pgsql intl zip pcntl gd;/);
  expect(dockerfile).toMatch(/-php-ext-configure gd --with-freetype --with-jpeg --with-webp;/);
  expect(dockerfile).toContain('echo "$sha  /tmp/pecl/$name.tgz" | sha256sum -c -;');
  const pecl = [...dockerfile.matchAll(/pecl_build (\w+) (\S+) ([0-9a-f]{64})/g)].map((m) => `${m[1]}-${m[2]}`);
  expect(pecl).toEqual(["igbinary-3.2.17RC1", "msgpack-3.0.1", "redis-6.3.0", "memcached-3.4.0", "imagick-3.8.1"]);
  expect(dockerfile).toContain("--enable-redis --enable-redis-igbinary --enable-redis-msgpack --enable-redis-lzf --with-liblzf --enable-redis-zstd --with-libzstd --enable-redis-lz4 --with-liblz4;");
  expect(dockerfile).toContain("for ext in gmp ftp pdo_mysql pdo_pgsql intl zip pcntl gd igbinary msgpack redis memcached imagick; do");
  expect(dockerfile).not.toContain("pecl install");
  // Upstream's tests never run as root: the image's last USER is uid 1001, which owns /oracle/upstream; root is
  // used only for the build steps before it.
  const code = dockerfile.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  expect(code).toContain("useradd --uid 1001 --gid 1001 --create-home --shell /bin/sh oracle;");
  expect(code).toContain("chown -R 1001:1001 /oracle/upstream; \\\n    chmod -R u+w /oracle/upstream\n");
  const users = [...code.matchAll(/^USER (\S+)$/gm)].map((m) => m[1]);
  expect(users).toEqual(["1001:1001"]);
  expect(code.lastIndexOf("\nRUN ")).toBeLessThan(code.indexOf("\nUSER 1001:1001\n"));

  // The workflow: read-only, SHA-pinned, its triggers, legs x attempts, the services, the merge job.
  const wf = workflow();
  expect(wf["permissions"]).toEqual({ contents: "read" });
  expect(wf["on"]).toEqual({ pull_request: { branches: ["main"], paths: ["tools/baseline/**", ["tools", "oracle", "**"].join("/"), "tools/inventory/**", "tools/upstream/**", "conformance/oracle/**", "conformance/inventory/**", "conformance/baseline-pin", ".github/workflows/baseline.yml"] }, workflow_dispatch: null });
  const jobs = wf["jobs"] as Record<string, Record<string, unknown>>;
  expect(Object.keys(jobs)).toEqual(["inventory", "leg", "merge"]);
  expect(jobs["leg"]!["needs"]).toBe("inventory");
  expect(jobs["merge"]!["needs"]).toBe("leg");
  const matrix = (jobs["leg"]!["strategy"] as { matrix: { attempt: number[]; leg: { suite: string; variant: string; services?: boolean }[] } }).matrix;
  expect(matrix.attempt).toEqual([1, 2]);
  const byLeg = (a: { suite: string; variant: string }, b: { suite: string; variant: string }): number => `${a.suite}.${a.variant}`.localeCompare(`${b.suite}.${b.variant}`);
  expect(matrix.leg.map(({ suite, variant }) => ({ suite, variant })).sort(byLeg)).toEqual([...LEGS].sort(byLeg));
  // Exactly the service legs set `services: true`; no other leg sets the key.
  expect(matrix.leg.filter((leg) => "services" in leg).map((leg) => ({ suite: leg.suite, variant: leg.variant, services: leg.services }))).toEqual(SERVICE_LEGS.map((leg) => ({ ...leg, services: true })));
  const services = jobs["leg"]!["services"] as Record<string, { image: string; ports: string[]; env?: Record<string, unknown>; options?: string }>;
  expect(Object.keys(services)).toEqual(["postgres", "redis", "memcached", "mysql", "dynamodb"]);
  expect(Object.values(services).map((service) => service.image)).toEqual([
    "postgres:18",
    "redis:8.10.2",
    "${{ matrix.leg.services && 'memcached:1.6-alpine' || '' }}",
    "${{ matrix.leg.services && 'mysql:9.7' || '' }}",
    "${{ matrix.leg.services && 'amazon/dynamodb-local:2.0.0' || '' }}",
  ]);
  expect(services["memcached"]!.ports).toEqual(["11211:11211"]);
  expect(services["mysql"]!.ports).toEqual(["3306:3306"]);
  expect(services["mysql"]!.env).toEqual({ MYSQL_ALLOW_EMPTY_PASSWORD: "yes", MYSQL_DATABASE: "forge" });
  expect(services["mysql"]!.options).toContain('--health-cmd="mysqladmin ping"');
  expect(services["dynamodb"]!.ports).toEqual(["8888:8000"]);
  const text = readFileSync(join(root, ".github", "workflows", "baseline.yml"), "utf8");
  for (const uses of text.matchAll(/uses: (\S+)/g)) {
    expect(uses[1]!).toMatch(/^[\w-]+\/[\w-]+@[0-9a-f]{40}$/);
  }
  expect(text).toContain("bun run oracle:build");
  expect(text).toContain('bun run baseline run --suite "$SUITE" --variant "$VARIANT" --attempt "$ATTEMPT" --out baseline-results');
  expect(text).toContain("bun run baseline merge --in baseline-results");
  expect(text).toContain("name: inventory");
  expect(text).toContain("run: bun run inventory\n");
  expect(text.match(/name: inventory-listing\n/g)?.length).toBe(3);
  expect(text).toContain("git add --intent-to-add conformance/inventory\n          git diff --exit-code --stat conformance/inventory");
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.baseline).toBe("bun tools/baseline/baseline.ts");

  // The committed Inventory: every entry has both fields, oracle keyed by exactly its alpha variants, and every
  // pgsql, redis and queue-redis@redis entry has an outcome there.
  const all = committed();
  expect(all.length).toBe(16267 + 3381 + 1284 + 1138);
  for (const e of all) {
    const variants = variantsFor(e.backends);
    expect(Object.keys(e.oracle)).toEqual(variants);
    expect(e.assertions === null).toBe(variants.length === 0);
  }
  for (const variant of ["pgsql", "redis", "queue-redis@redis"]) {
    const tagged = all.filter((e) => e.backends.includes(variant));
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged.every((e) => e.oracle[variant] !== undefined)).toBe(true);
  }
  // ESC-2.6-2: with Upstream's DynamoDB Local on the none leg, the four DynamoDbStoreTest IDs record Upstream's
  // own outcome and an assertion floor, not a service-caused skip.
  const dynamo = ["testItemsCanBeAtomicallyAdded", "testItemsCanBeIncrementedAndDecremented", "testItemsCanBeStoredAndRetrieved", "testLocksCanBeAcquired"].map((method) => `Illuminate\\Tests\\Integration\\Cache\\DynamoDbStoreTest::${method}`);
  for (const id of dynamo) {
    const entry = all.find((e) => e.id === id);
    expect(entry).toBeDefined();
    expect(entry!.oracle["none"]).toBeDefined();
    expect(entry!.oracle["none"]).not.toBe("skip");
    expect(Object.keys(entry!.assertions ?? {}).length).toBeGreaterThan(0);
  }
  // Re-rendering the committed files reproduces them byte for byte (what `bun run inventory` carries over).
  for (const [component, text] of renderInventory(carryOver(all, all))) {
    expect(readFileSync(join(root, INVENTORY_DIR, `${component}.jsonl`), "utf8")).toBe(text);
  }
});

// XT-conformance-57
// Verifies: FR-3 (an Upstream skip or failure at the Pin is recorded as such, for the upstream-skip check)
xaravelTest("XT-conformance-57", "a test that Upstream skips or fails on a variant is recorded as skip or fail there, and the ESC-2.4-1 SchemaBuilderSchemaNameTest IDs are not pass on sqlite (FR-3, AD-15.2)", () => {
  const plan = planRun("framework", "none", ENTRIES, RAWS);
  const [first, second] = [`${QUEUEABLE}::testOnConnection#uses string`, `${QUEUEABLE}::testOnQueue`];

  // Skipped and MarkedIncomplete are skip; Failed and Errored are fail; the worst wins (fail > skip > pass).
  expect(collectResults(plan, [recorderLine(first, "skip"), recorderLine(second, "fail")].join(""))).toEqual([result(first, "skip"), result(second, "fail")]);
  expect(collectResults(plan, [recorderLine(first, "pass"), recorderLine(first, "fail"), recorderLine(first, "skip"), recorderLine(second, "pass"), recorderLine(second, "skip")].join(""))).toEqual([result(first, "fail"), result(second, "skip")]);
  // A class-level BeforeFirstTestMethodErrored fails every test of the class, a skipped suite skips them.
  expect(collectResults(plan, recorderLine(null, "fail", {}, QUEUEABLE))).toEqual([result(first, "fail"), result(second, "fail")]);
  expect(collectResults(plan, [recorderLine(null, "skip", {}, `${QUEUEABLE}::testOnConnection`), recorderLine(second, "pass")].join(""))).toEqual([result(first, "skip"), result(second, "pass")]);
  expect(() => collectResults(plan, recorderLine(null, "fail", {}, "Illuminate\\Tests\\Nope"))).toThrow("the run reported fail for Illuminate\\Tests\\Nope, which holds no listed test");

  // Merged: the variant's value is skip or fail.
  const id = `${PGSQL_TEST}::testWhereFulltext`;
  const lookup = lookupOf({ [resultsFile("framework", "pgsql", 1)]: [result(id, "fail")], [resultsFile("framework", "pgsql", 2)]: [result(id, "fail")] });
  expect(mergeResults([entry(id, ["pgsql"])], lookup).entries[0]).toMatchObject({ assertions: {}, oracle: { pgsql: "fail" } });
  const sqliteId = `${SQLITE_TEST}::testHasTable#with prefix`;
  const sqlite = lookupOf({ [resultsFile("framework", "sqlite", 1)]: [result(sqliteId, "skip")], [resultsFile("framework", "sqlite", 2)]: [result(sqliteId, "skip")] });
  expect(mergeResults([entry(sqliteId, ["sqlite"])], sqlite).entries[0]).toMatchObject({ assertions: {}, oracle: { sqlite: "skip" } });

  // The committed ESC-2.4-1 IDs.
  const escalated = committed().filter((e) => /^Illuminate\\Tests\\Integration\\Database\\Sqlite\\SchemaBuilderSchemaNameTest::(testForeignKeys|testComment|testAutoIncrementStartingValue|testHasTable)#/.test(e.id));
  expect(escalated.length).toBe(8);
  for (const e of escalated) {
    expect(e.oracle["sqlite"]).toBeDefined();
    expect(e.oracle["sqlite"]).not.toBe("pass");
  }
});

// XT-conformance-58
// Verifies: FR-113 (repeated baseline runs give identical assertions; a difference is an Oracle non-determinism finding)
xaravelTest("XT-conformance-58", "two attempts on the same Pin merge into the Inventory when identical; any difference is reported as oracle non-determinism and exits 1 without writing (FR-6.1, FR-113)", async () => {
  const id = `${QUEUEABLE}::testOnQueue`;
  expect(compareAttempts(id, "none", result(id, "pass", { assertSame: 2 }), result(id, "pass", { assertSame: 2 }))).toBeNull();
  expect(compareAttempts(id, "none", result(id, "pass", { assertSame: 2 }), result(id, "pass", { assertSame: 3 }))).toBe(
    `oracle non-determinism: ${id} on none: {"outcome":"pass","assertions":{"assertSame":2}} vs {"outcome":"pass","assertions":{"assertSame":3}}`,
  );
  expect(compareAttempts(id, "none", result(id, "pass"), result(id, "skip"))).toBe(`oracle non-determinism: ${id} on none: {"outcome":"pass","assertions":{}} vs {"outcome":"skip","assertions":{}}`);

  await withFixture(async (fx) => {
    const writeAttempts = (overrides: Record<string, Result[] | null> = {}): void => {
      rmSync(fx.out, { recursive: true, force: true });
      mkdirSync(fx.out, { recursive: true });
      const files: Record<string, Result[]> = {};
      for (const attempt of [1, 2]) {
        files[resultsFile("framework", "none", attempt)] = [result(`${QUEUEABLE}::testOnConnection#uses string`, "pass", { assertSame: 2 }), result(id, "pass", { assertSame: 1 })];
        files[resultsFile("framework", "pgsql", attempt)] = [result(`${PGSQL_TEST}::testWhereFulltext`, "fail")];
        files[resultsFile("framework", "sqlite", attempt)] = [result(`${SQLITE_TEST}::testHasTable#with prefix`, "skip")];
      }
      for (const [name, list] of Object.entries({ ...files, ...overrides })) {
        if (list !== null) {
          writeFileSync(join(fx.out, name), renderResults(list));
        }
      }
    };
    const before = fx.inventory();

    // Attempts differ: every difference is reported, exit 1, nothing written.
    writeAttempts({ [resultsFile("framework", "none", 2)]: [result(`${QUEUEABLE}::testOnConnection#uses string`, "pass", { assertSame: 3 }), result(id, "pass", { assertSame: 1 })] });
    const differ = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect(differ.code).toBe(1);
    expect(differ.stderr).toBe(
      `Baseline merge failed: the baseline results do not merge (1 problems):\n  oracle non-determinism: ${QUEUEABLE}::testOnConnection#uses string on none: {"outcome":"pass","assertions":{"assertSame":2}} vs {"outcome":"pass","assertions":{"assertSame":3}}\n`,
    );
    expect(fx.inventory()).toEqual(before);

    // A missing attempt-2 file, or a missing ID: named with its variant, exit 1, nothing written.
    writeAttempts({ [resultsFile("framework", "sqlite", 2)]: null });
    const noFile = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect([noFile.code, noFile.stderr]).toEqual([1, `Baseline merge failed: the baseline results do not merge (1 problems):\n  missing result: ${SQLITE_TEST}::testHasTable#with prefix on sqlite (no framework.sqlite.2.jsonl; 1 results missing)\n`]);
    writeAttempts({ [resultsFile("framework", "none", 2)]: [result(id, "pass", { assertSame: 1 })] });
    const noId = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect([noId.code, noId.stderr]).toEqual([1, `Baseline merge failed: the baseline results do not merge (1 problems):\n  missing result: ${QUEUEABLE}::testOnConnection#uses string on none (attempt 2, framework.none.2.jsonl)\n`]);
    expect(fx.inventory()).toEqual(before);

    // A result for an ID the Inventory does not tag with that variant: named, exit 1, nothing written.
    const extra = [result(`${QUEUEABLE}::testOnConnection#uses string`, "pass", { assertSame: 2 }), result(id, "pass", { assertSame: 1 }), result(`${PGSQL_TEST}::testWhereFulltext`, "pass")];
    writeAttempts({ [resultsFile("framework", "none", 1)]: extra, [resultsFile("framework", "none", 2)]: extra });
    const untagged = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect([untagged.code, untagged.stderr]).toEqual([
      1,
      `Baseline merge failed: the baseline results do not merge (2 problems):\n  framework.none.1.jsonl: ${PGSQL_TEST}::testWhereFulltext is not an Inventory entry tagged none\n  framework.none.2.jsonl: ${PGSQL_TEST}::testWhereFulltext is not an Inventory entry tagged none\n`,
    ]);
    expect(fx.inventory()).toEqual(before);

    // A listed finding (decisions/ESC-2.6-1.md): attempts that differ only in counts, with the same outcome and
    // kinds, write the pinned record.
    const findingsPath = join(fx.dir, INVENTORY_DIR, NONDETERMINISM_FILE);
    const finding = (fields: Partial<Finding> = {}): string =>
      `${JSON.stringify({ id, variant: "none", attempts: [{ assertSame: 1 }, { assertSame: 2 }], record: { assertSame: 1 }, ...fields })}\n`;
    const base = (attempt2: Result): Record<string, Result[]> => ({
      [resultsFile("framework", "none", 1)]: [result(`${QUEUEABLE}::testOnConnection#uses string`, "pass", { assertSame: 2 }), result(id, "pass", { assertSame: 1 })],
      [resultsFile("framework", "none", 2)]: [result(`${QUEUEABLE}::testOnConnection#uses string`, "pass", { assertSame: 2 }), attempt2],
    });
    writeFileSync(findingsPath, finding());
    writeAttempts(base(result(id, "pass", { assertSame: 2 })));
    const listedOk = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect([listedOk.code, listedOk.stderr]).toEqual([0, ""]);
    expect(fx.inventory()["bus.jsonl"]).toContain(`${JSON.stringify(id).slice(1, -1)}","component":"bus","kind":"unit","backends":["none"],"source":"framework/tests/Bus/QueueableTest.php:1-2","hash":"${HASH}","assertions":{"assertSame":1},"oracle":{"none":"pass"}}`);
    // The listed pair keeps its record when both attempts happen to agree on a higher count.
    writeFileSync(findingsPath, finding({ attempts: [{ assertSame: 1 }, { assertSame: 3 }] }));
    const agreeHigh = base(result(id, "pass", { assertSame: 3 }));
    writeAttempts({ ...agreeHigh, [resultsFile("framework", "none", 1)]: agreeHigh[resultsFile("framework", "none", 2)]! });
    expect((await cli(["merge", "--root", fx.dir, "--in", fx.out])).code).toBe(0);
    expect(fx.inventory()["bus.jsonl"]).toContain(`"assertions":{"assertSame":1},"oracle":{"none":"pass"}}`);
    expect(fx.inventory()["bus.jsonl"]).not.toContain(`"assertions":{"assertSame":3}`);
    const listedBefore = fx.inventory();
    // A listed pair whose outcome differs, or whose attempts do not fit the record, still fails and writes nothing.
    writeFileSync(findingsPath, finding());
    for (const [attempt2, shown] of [
      [result(id, "fail", { assertSame: 2 }), `{"outcome":"fail","assertions":{"assertSame":2}}`],
      [result(id, "pass", { assertSame: 2, assertTrue: 1 }), `{"outcome":"pass","assertions":{"assertSame":2,"assertTrue":1}}`],
    ] as const) {
      writeAttempts(base(attempt2));
      const listedBad = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
      expect([listedBad.code, listedBad.stderr]).toEqual([
        1,
        `Baseline merge failed: the baseline results do not merge (1 problems):\n  oracle non-determinism: ${id} on none: {"outcome":"pass","assertions":{"assertSame":1}} vs ${shown} (listed in ${INVENTORY_DIR}/${NONDETERMINISM_FILE}, but the attempts do not fit its record {"assertSame":1})\n`,
      ]);
      expect(fx.inventory()).toEqual({ ...listedBefore, [NONDETERMINISM_FILE]: finding() });
    }
    // An unlisted difference next to a listed one still fails.
    writeAttempts({
      ...base(result(id, "pass", { assertSame: 2 })),
      [resultsFile("framework", "none", 2)]: [result(`${QUEUEABLE}::testOnConnection#uses string`, "pass", { assertSame: 3 }), result(id, "pass", { assertSame: 2 })],
    });
    const unlisted = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect([unlisted.code, unlisted.stderr]).toEqual([
      1,
      `Baseline merge failed: the baseline results do not merge (1 problems):\n  oracle non-determinism: ${QUEUEABLE}::testOnConnection#uses string on none: {"outcome":"pass","assertions":{"assertSame":2}} vs {"outcome":"pass","assertions":{"assertSame":3}}\n`,
    ]);
    // A finding that matches no entry's alpha variant fails closed.
    writeFileSync(findingsPath, finding({ variant: "sqlite" }));
    writeAttempts();
    const stale = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect([stale.code, stale.stderr]).toEqual([1, `Baseline merge failed: the baseline results do not merge (1 problems):\n  ${INVENTORY_DIR}/${NONDETERMINISM_FILE}: ${id} on sqlite is not an Inventory entry's alpha variant\n`]);
    expect(fx.inventory()).toEqual({ ...listedBefore, [NONDETERMINISM_FILE]: finding({ variant: "sqlite" }) });
    // A listed pair with a missing attempt is reported as a missing result, not as a finding that matches no entry.
    writeFileSync(findingsPath, finding());
    writeAttempts({ [resultsFile("framework", "none", 2)]: [result(`${QUEUEABLE}::testOnConnection#uses string`, "pass", { assertSame: 2 })] });
    const listedMissing = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect([listedMissing.code, listedMissing.stderr]).toEqual([1, `Baseline merge failed: the baseline results do not merge (1 problems):\n  missing result: ${id} on none (attempt 2, framework.none.2.jsonl)\n`]);
    expect(fx.inventory()).toEqual({ ...listedBefore, [NONDETERMINISM_FILE]: finding() });
    rmSync(findingsPath);
    writeFileSync(join(fx.dir, INVENTORY_DIR, "bus.jsonl"), before["bus.jsonl"]!);

    // Identical attempts: written, and merging again changes nothing.
    writeAttempts();
    const ok = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect([ok.code, ok.stderr, ok.stdout]).toEqual([0, "", "Baseline merged: 5 entries in 2 files.\n"]);
    const after = fx.inventory();
    expect(after["bus.jsonl"]).toBe(
      [
        `{"id":${JSON.stringify(`${QUEUEABLE}::testOnConnection#uses string`)},"component":"bus","kind":"unit","backends":["none"],"source":"framework/tests/Bus/QueueableTest.php:1-2","hash":"${HASH}","assertions":{"assertSame":2},"oracle":{"none":"pass"}}`,
        `{"id":${JSON.stringify(id)},"component":"bus","kind":"unit","backends":["none"],"source":"framework/tests/Bus/QueueableTest.php:1-2","hash":"${HASH}","assertions":{"assertSame":1},"oracle":{"none":"pass"}}`,
        "",
      ].join("\n"),
    );
    expect(after["database.jsonl"]).toContain('"backends":["mysql"],"source":"framework/tests/Integration/Database/MySql/FulltextTest.php:1-2","hash":"' + HASH + '","assertions":null,"oracle":{}}');
    expect(after["database.jsonl"]).toContain('"assertions":{},"oracle":{"sqlite":"skip"}}');
    const again = await cli(["merge", "--root", fx.dir, "--in", fx.out]);
    expect(again.code).toBe(0);
    expect(fx.inventory()).toEqual(after);
  });

  // The findings file: one object per line, the attempts' kinds, a record no higher than either attempt.
  const f = (fields: Record<string, unknown>): string => `${JSON.stringify({ id, variant: "none", attempts: [{ assertSame: 1 }, { assertSame: 2 }], record: { assertSame: 1 }, ...fields })}\n`;
  expect([...parseFindings(f({}), "f.jsonl").values()]).toEqual([{ id, variant: "none", attempts: [{ assertSame: 1 }, { assertSame: 2 }], record: { assertSame: 1 } }]);
  for (const [text, message] of [
    ["{", "f.jsonl:1: malformed JSON"],
    [`${JSON.stringify({ id, variant: "none", record: {}, attempts: [{}, {}] })}\n`, "f.jsonl:1: expected the keys id, variant, attempts, record"],
    [f({ id: "" }), "f.jsonl:1: bad id"],
    [f({ variant: "mysql" }), "f.jsonl:1: variant must be one of"],
    [f({ attempts: [{ assertSame: 1 }] }), "f.jsonl:1: attempts must be the two observed assertion multisets"],
    [f({ record: { assertSame: 0 } }), "f.jsonl:1: record must map assert* kinds to positive integers"],
    [f({ record: { assertSame: 2 } }), "f.jsonl:1: record must have the attempts' kinds and no count above either attempt's"],
    [f({ record: { assertTrue: 1 } }), "f.jsonl:1: record must have the attempts' kinds and no count above either attempt's"],
    [f({}) + f({}), `f.jsonl:2: ${id} on none is not sorted after ${id} on none`],
  ] as const) {
    expect(() => parseFindings(text, "f.jsonl")).toThrow(message);
  }

  // The committed findings file holds exactly the ESC-2.6-1 finding, and the Inventory records its pinned floor.
  const committedFindings = [...parseFindings(readFileSync(join(root, INVENTORY_DIR, NONDETERMINISM_FILE), "utf8"), NONDETERMINISM_FILE).values()];
  const casting = "Illuminate\\Tests\\Integration\\Database\\DatabaseEloquentModelAttributeCastingTest::testAttributesByDefaultDontCacheBooleans";
  expect(committedFindings).toEqual([{ id: casting, variant: "none", attempts: [{ assertIsBool: 2 }, { assertIsBool: 3 }], record: { assertIsBool: 2 } }]);
  expect(committed().find((e) => e.id === casting)).toMatchObject({ assertions: { assertIsBool: 2 }, oracle: { none: "pass" } });
  // It is not a Component's Inventory file.
  expect(suiteInventoryFiles(root, "framework").map(([component]) => `${component}.jsonl`)).not.toContain(NONDETERMINISM_FILE);

  // The CI run behind the committed files merged with no unlisted non-determinism: every entry with an alpha
  // variant carries assertions, which `merge` writes only when both attempts agree or fit a listed finding's record.
  for (const e of committed()) {
    if (variantsFor(e.backends).length > 0) {
      expect(e.assertions).not.toBeNull();
    }
  }
  expect(SUITES).toEqual(["framework", "ai", "mcp", "boost"]);
});
