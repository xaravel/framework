// Xaravel Tests for Story 2.7 (Inventory determinism and runner-listing
// cross-check, FR-1). These run under plain `bun test` until the harness lands
// in Epic 5. `--check` and the cross-check run against hermetic fixture roots
// with a fake `--php` (which prints raw lister lines, or a runner's
// `--list-tests` text when called as `php -d …`) or a stand-in image runner, so
// no test needs PHP, a container runtime or vendor files. The workflow, the
// Protected Path list and CODEOWNERS are checked as committed.
import { expect } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { COMPONENT_MAP_FILE } from "../../../tools/component-map/component-map";
import { compareListing, crossCheck, IMAGE_LIST_SCRIPT, parseRunnerListing } from "../../../tools/inventory/cross-check";
import { generate, INVENTORY_DIR, LISTER, NONDETERMINISM_FILE, oracleImage, PHP_VERSION, type PestRawTest, type RawTest } from "../../../tools/inventory/inventory";
import { activePhases, checkMirror, CODEOWNERS_PATH, evaluatePr, isProtected, LIST_PATH, MAINTAINER, parseList } from "../../../tools/protected-paths/protected-paths";
import { checkWorkflow } from "../../../tools/workflow-permissions/workflow-permissions";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const INVENTORY_CLI = join(root, "tools", "inventory", "inventory.ts");
const CROSS_CHECK_CLI = join(root, "tools", "inventory", "cross-check.ts");

// ---------------------------------------------------------------------------
// Fixture

const QUEUEABLE = "Illuminate\\Tests\\Bus\\QueueableTest";
const STR = "Illuminate\\Tests\\Support\\SupportStrTest";
const COMPLETION = "P\\Tests\\Feature\\CompletionTest";

const SNAPSHOT_FILES: Record<string, Record<string, string>> = {
  framework: {
    "phpunit.xml.dist": '<?xml version="1.0"?>\n<phpunit/>\n',
    "src/Illuminate/Support/Str.php": "<?php\n",
    "tests/Bus/QueueableTest.php": "<?php\n".repeat(40),
    "tests/Support/SupportStrTest.php": "<?php\n".repeat(40),
  },
  mcp: {
    "phpunit.xml.dist": '<?xml version="1.0"?>\n<phpunit/>\n',
    "src/Server.php": "<?php\n",
    "tests/Feature/CompletionTest.php": "<?php\n".repeat(40),
  },
};

const TOKENS = ["cfunction", "w ", "ctestIt", "c(", "c)", "c{", "c$this", "c->", "cassertTrue", "c(", "ctrue", "c)", "c;", "c}"];

function raw(cls: string, method: string, file: string, dataset: string | null, data: string | null = null): RawTest {
  return { id: `${cls}::${method}${dataset === null ? "" : `#${dataset}`}`, class: cls, method, dataset, file, source: { file, start: 10, end: 14 }, tokens: TOKENS, data, requiresDatabase: null, redis: false };
}

const RAWS: RawTest[] = [
  raw(QUEUEABLE, "testOnConnection", "tests/Bus/QueueableTest.php", "uses string", "[0=>'redis']"),
  raw(STR, "testAscii", "tests/Support/SupportStrTest.php", "0", "[0=>'a']"),
  raw(STR, "testAscii", "tests/Support/SupportStrTest.php", "1", "[0=>'b']"),
];
/** The framework runner's own listing of RAWS. */
const PHPUNIT_LISTING = [
  "PHPUnit 13.4.3 by Sebastian Bergmann and contributors.",
  "",
  "Available tests:",
  ` - ${QUEUEABLE}::testOnConnection"uses string"`,
  ` - ${STR}::testAscii#0`,
  ` - ${STR}::testAscii#1`,
  "",
].join("\n");

function pestRaw(method: string, describe: string[], name: string, dataset: string | null): PestRawTest {
  return { ...raw(COMPLETION, method, "tests/Feature/CompletionTest.php", dataset, dataset === null ? null : "[0=>1]"), describe, name };
}

const MCP_RAWS: PestRawTest[] = [pestRaw("__pest_evaluable__A__→__it_x", ["A"], "it x", null), pestRaw("__pest_evaluable_it_takes_a_dataset", [], "it takes a dataset", 'dataset "a"')];
const MCP_IDS = ["mcp/tests/Feature/CompletionTest.php::A > it x", 'mcp/tests/Feature/CompletionTest.php::it takes a dataset#dataset "a"'];
/** Pest's own listing of MCP_RAWS, with its INFO header and the trailing `.`. */
const PEST_LISTING = ["", "  INFO  Available tests:", "", ` - ${COMPLETION}::__pest_evaluable__A__→__it_x`, ` - ${COMPLETION}::__pest_evaluable_it_takes_a_dataset"dataset "a"".`, ""].join("\n");

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

/**
 * A fake PHP. Called as `php -d …` (a runner's `--list-tests`) it records its arguments and directory, fails with
 * `list-fail` when that exists, and otherwise prints `listing.txt`. Called as the lister it records its arguments,
 * fails with `fail` when that exists, and otherwise prints `raw.jsonl`.
 */
const FAKE = [
  "#!/bin/sh",
  'here="$(dirname "$0")"',
  'if [ "$1" = "-d" ]; then',
  '  printf \'%s\\n\' "$@" > "$here/list-args"; pwd -P > "$here/list-cwd"',
  '  if [ -f "$here/list-fail" ]; then cat "$here/list-fail" >&2; exit 2; fi',
  '  cat "$here/listing.txt"; exit 0',
  "fi",
  'printf \'%s\\n\' "$@" > "$here/args"',
  'if [ -f "$here/fail" ]; then cat "$here/fail" >&2; exit 3; fi',
  'cat "$here/raw.jsonl"',
  "",
].join("\n");

interface Fixture {
  dir: string;
  local: (suite: string) => string;
  php: string;
  bin: string;
  setRaw: (raws: readonly RawTest[]) => void;
  setListing: (text: string) => void;
  inventory: () => Record<string, string>;
}

async function withFixture(body: (fx: Fixture) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-inventory-checks-"));
  try {
    for (const file of ["tools/scaffold/packages.jsonl", COMPONENT_MAP_FILE, LISTER, "conformance/baseline-pin", "conformance/oracle/Dockerfile", "conformance/oracle/Dockerfile.dockerignore", ...["framework", "ai", "mcp", "boost"].map((name) => `conformance/oracle/locks/${name}/composer.lock`)]) {
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
      setRaw: (raws) => writeFileSync(join(bin, "raw.jsonl"), rawText(raws)),
      setListing: (text) => writeFileSync(join(bin, "listing.txt"), text),
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
    fx.setListing(PHPUNIT_LISTING);
    await body(fx);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function run(cli: string, args: string[], path = process.env["PATH"] ?? ""): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, cli, ...args], { cwd: root, env: { PATH: path }, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

const WORKFLOW = join(root, ".github", "workflows", "inventory.yml");

// ---------------------------------------------------------------------------
// XT-conformance-59

xaravelTest("XT-conformance-59", "bun run inventory --check regenerates the Inventory in memory and fails, naming the file, on any byte difference from the committed files; it never writes (FR-1.2)", async () => {
  await withFixture(async (fx) => {
    const inv = join(fx.dir, INVENTORY_DIR);
    // Generate the framework, then baseline one file (carry-over keeps it), and add files --check never compares.
    generate(fx.dir, { local: fx.local("framework"), php: fx.php });
    writeFileSync(join(inv, "support.jsonl"), readFileSync(join(inv, "support.jsonl"), "utf8").replaceAll('"assertions":null,"oracle":{}', '"assertions":{"assertTrue":1},"oracle":{"none":"pass"}'));
    writeFiles(inv, { "ai.jsonl": "ai stays\n", [NONDETERMINISM_FILE]: "findings stay\n" });
    const committed = fx.inventory();
    const check = ["generate", "--check", "--root", fx.dir, "--local", fx.local("framework"), "--php", fx.php];

    // Unchanged: OK, exit 0, nothing touched.
    const ok = await run(INVENTORY_CLI, check);
    expect([ok.code, ok.stdout, ok.stderr]).toEqual([0, "Inventory check OK: 3 tests in 2 files are byte-identical.\n", ""]);
    expect(fx.inventory()).toEqual(committed);

    // An edited hash in bus.jsonl: drift named with its first differing line; the file is left as edited.
    const edited = committed["bus.jsonl"]!.replace(/"hash":"[0-9a-f]{64}"/, `"hash":"${"0".repeat(64)}"`);
    writeFileSync(join(inv, "bus.jsonl"), edited);
    const drift = await run(INVENTORY_CLI, check);
    expect([drift.code, drift.stdout, drift.stderr]).toEqual([1, "", `inventory drift: ${INVENTORY_DIR}/bus.jsonl differs from the regenerated Inventory (first difference at line 1)\nInventory check failed: 1 file(s) differ.\n`]);
    expect(fx.inventory()).toEqual({ ...committed, "bus.jsonl": edited });
    // The first differing line is reported, not always line 1. The appended line is a valid entry: a committed
    // file that does not parse stops carry-over before any comparison (R6).
    const busEntry = JSON.parse(committed["bus.jsonl"]!.trimEnd().split("\n").at(-1)!) as { id: string };
    writeFileSync(join(inv, "bus.jsonl"), `${committed["bus.jsonl"]!}${JSON.stringify({ ...busEntry, id: `${busEntry.id}Extra` })}\n`);
    const appended = await run(INVENTORY_CLI, check);
    expect(appended.stderr).toBe(`inventory drift: ${INVENTORY_DIR}/bus.jsonl differs from the regenerated Inventory (first difference at line 2)\nInventory check failed: 1 file(s) differ.\n`);
    writeFileSync(join(inv, "bus.jsonl"), committed["bus.jsonl"]!);

    // A missing file and a stray framework file (a valid one, since carry-over reads it): both named, nothing
    // written or deleted.
    const ghost = '{"id":"Illuminate\\\\Tests\\\\Ghost\\\\GhostTest::testX","component":"ghost","kind":"unit","backends":["none"],"source":"framework/tests/Ghost/GhostTest.php:1-2","hash":"' + "0".repeat(64) + '","assertions":null,"oracle":{}}\n';
    rmSync(join(inv, "support.jsonl"));
    writeFileSync(join(inv, "ghost.jsonl"), ghost);
    const missing = await run(INVENTORY_CLI, check);
    expect([missing.code, missing.stderr]).toEqual([1, `inventory drift: ${INVENTORY_DIR}/support.jsonl is missing\ninventory drift: ${INVENTORY_DIR}/ghost.jsonl is not generated\nInventory check failed: 2 file(s) differ.\n`]);
    const { "support.jsonl": _support, ...rest } = committed;
    expect(fx.inventory()).toEqual({ ...rest, "ghost.jsonl": ghost });

    // generate without --check is unchanged: it restores support.jsonl (carry-over from nothing) and deletes the stray.
    const plain = generate(fx.dir, { local: fx.local("framework"), php: fx.php });
    expect([plain.removed, plain.drift]).toEqual([[`${INVENTORY_DIR}/ghost.jsonl`], []]);
    expect(Object.keys(fx.inventory())).toEqual(Object.keys(committed));
    expect(fx.inventory()["bus.jsonl"]).toBe(committed["bus.jsonl"]!);
    writeFileSync(join(inv, "support.jsonl"), committed["support.jsonl"]!);

    // A Pest suite in image mode: only <suite>.jsonl is compared; the framework's files are not.
    fx.setRaw(MCP_RAWS);
    generate(fx.dir, { suite: "mcp", local: fx.local("mcp"), php: fx.php });
    const runner = (_image: string, _mounts: unknown, command: readonly string[]): string => rawText(command[2] === "/oracle/upstream/mcp" ? MCP_RAWS : RAWS);
    writeFileSync(join(inv, "ghost.jsonl"), "ghost\n");
    expect(generate(fx.dir, { suite: "mcp", check: true, runner }).drift).toEqual([]);
    writeFileSync(join(inv, "mcp.jsonl"), "");
    expect(generate(fx.dir, { suite: "mcp", check: true, runner }).drift).toEqual([`inventory drift: ${INVENTORY_DIR}/mcp.jsonl differs from the regenerated Inventory (first difference at line 1)`]);
    expect(readFileSync(join(inv, "mcp.jsonl"), "utf8")).toBe("");
    rmSync(join(inv, "ghost.jsonl"));

    // Usage errors exit 2.
    expect((await run(INVENTORY_CLI, ["generate", "--check", "--check"])).code).toBe(2);
    expect((await run(INVENTORY_CLI, ["generate", "--check", "--image", "x", "--local", fx.local("framework")])).code).toBe(2);
  });

  // The workflow: nightly, on demand and on PRs touching its inputs; read-only; one job; the same SHA pins as baseline.yml.
  const text = readFileSync(WORKFLOW, "utf8");
  expect(checkWorkflow(".github/workflows/inventory.yml", text)).toEqual([]);
  const wf = Bun.YAML.parse(text) as Record<string, unknown>;
  expect(wf["permissions"]).toEqual({ contents: "read" });
  const on = wf["on"] as Record<string, unknown>;
  expect(Object.keys(on).sort()).toEqual(["pull_request", "schedule", "workflow_dispatch"]);
  expect((on["schedule"] as { cron: string }[]).length).toBe(1);
  expect(on["pull_request"]).toEqual({
    branches: ["main"],
    paths: ["tools/inventory/**", ["tools", "oracle", "**"].join("/"), "tools/upstream/**", "tools/component-map/**", "conformance/inventory/**", "conformance/oracle/**", "conformance/baseline-pin", "conformance/component-map", "tools/scaffold/packages.jsonl", "package.json", ".bun-version", "bun.lock", ".github/workflows/inventory.yml"],
  });
  const jobs = wf["jobs"] as Record<string, Record<string, unknown>>;
  expect(Object.keys(jobs)).toEqual(["inventory"]);
  expect(jobs["inventory"]!["permissions"]).toBeUndefined();
  const steps = jobs["inventory"]!["steps"] as Record<string, unknown>[];
  expect(steps[0]).toEqual({ uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", with: { "persist-credentials": false } });
  const baseline = readFileSync(join(root, ".github", "workflows", "baseline.yml"), "utf8");
  for (const uses of text.matchAll(/uses: (\S+ # \S+)/g)) {
    expect([uses[1], baseline.includes(`uses: ${uses[1]!}`)]).toEqual([uses[1], true]);
  }
  expect(steps.map((step) => step["run"]).filter((value) => value !== undefined)).toEqual([
    "bun run upstream:sync",
    "bun run upstream:check",
    "bun run oracle:check",
    `set -euo pipefail\ntag="$(bun ${["tools", "oracle", "oracle.ts"].join("/")} tag)"\nbun run oracle:build "xaravel-oracle:\${tag}"\n`,
    "bun run inventory --check",
    "bun run inventory:cross-check",
  ]);
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
  expect([scripts.inventory, scripts["inventory:cross-check"]]).toEqual(["bun --no-env-file tools/inventory/inventory.ts generate", "bun --no-env-file tools/inventory/cross-check.ts"]);
});

// ---------------------------------------------------------------------------
// XT-conformance-60

xaravelTest("XT-conformance-60", "bun run inventory:cross-check compares each suite's phpunit or pest --list-tests in the Oracle with the Inventory and lists the missing and extra Test IDs (FR-1.5)", async () => {
  // Parsing: headers, blank lines, int and named datasets, Pest's INFO header and trailing dot.
  expect(parseRunnerListing(PHPUNIT_LISTING, "phpunit")).toEqual(RAWS.map((entry) => entry.id));
  expect(parseRunnerListing(' - C::m"uses string"\n - C::m#0\n', "phpunit")).toEqual(["C::m#uses string", "C::m#0"]);
  expect(parseRunnerListing("Available test:\n - C::m\n", "phpunit")).toEqual(["C::m"]);
  expect(parseRunnerListing(" - C::m#-1\n", "phpunit")).toEqual(["C::m#-1"]);
  expect(parseRunnerListing(PEST_LISTING, "pest")).toEqual(MCP_RAWS.map((entry) => entry.id));
  expect(parseRunnerListing("  INFO  Available tests:\n\n - P\\T::__pest_evaluable_x.\n", "pest")).toEqual(["P\\T::__pest_evaluable_x"]);
  expect(parseRunnerListing(' - P\\T::__pest_evaluable_x"(\'a.b\')".\n', "pest")).toEqual(["P\\T::__pest_evaluable_x#('a.b')"]);
  // Fail closed: noise, an unparseable entry (PHPUnit keeps a `.`), a duplicate.
  expect(() => parseRunnerListing(`${PHPUNIT_LISTING}There was 1 PHPUnit test runner warning\n`, "phpunit")).toThrow("unexpected phpunit output: There was 1 PHPUnit test runner warning");
  expect(() => parseRunnerListing(" - C::m.\n", "phpunit")).toThrow("unparseable phpunit entry:  - C::m.");
  expect(() => parseRunnerListing(" - C::m#x\n", "phpunit")).toThrow("unparseable phpunit entry:  - C::m#x");
  expect(() => parseRunnerListing(" - Cm\n", "pest")).toThrow("unparseable pest entry:  - Cm");
  expect(() => parseRunnerListing(' - C::m#0\n - C::m"0"\n', "phpunit")).toThrow("duplicate phpunit entry: C::m#0");

  // Comparison: match, missing and extra (sorted), Pest mapping and an unmapped runner ID.
  expect(compareListing("framework", ["C::b", "C::a", "C::c"], ["C::a", "C::b", "C::c"])).toEqual({ suite: "framework", runner: "phpunit", runnerCount: 3, inventoryCount: 3, missing: [], extra: [] });
  expect(compareListing("framework", ["C::c", "C::b", "C::z"], ["C::a", "C::c", "C::d"])).toMatchObject({ missing: ["C::a", "C::d"], extra: ["C::b", "C::z"] });
  const map = new Map([["P\\T::__pest_evaluable_x", "mcp/tests/T.php::x"], ["P\\T::__pest_evaluable_y", "mcp/tests/T.php::y"]]);
  expect(compareListing("mcp", ["P\\T::__pest_evaluable_x"], ["mcp/tests/T.php::x"], map)).toMatchObject({ runner: "pest", missing: [], extra: [] });
  expect(compareListing("mcp", ["P\\T::__pest_evaluable_x", "P\\T::__pest_evaluable_y", "P\\T::__pest_evaluable_q"], ["mcp/tests/T.php::x"], map)).toMatchObject({ missing: [], extra: ["P\\T::__pest_evaluable_q", "mcp/tests/T.php::y"] });
  // Two runner IDs that map to one Inventory ID: the second is extra, not a match.
  const collide = new Map([["P\\T::__pest_evaluable_x", "mcp/tests/T.php::x"], ["P\\T::__pest_evaluable_x2", "mcp/tests/T.php::x"]]);
  expect(compareListing("mcp", ["P\\T::__pest_evaluable_x", "P\\T::__pest_evaluable_x2"], ["mcp/tests/T.php::x"], collide)).toMatchObject({ runnerCount: 2, inventoryCount: 1, missing: [], extra: ["mcp/tests/T.php::x"] });

  await withFixture(async (fx) => {
    generate(fx.dir, { local: fx.local("framework"), php: fx.php });
    fx.setRaw(MCP_RAWS);
    generate(fx.dir, { suite: "mcp", local: fx.local("mcp"), php: fx.php });
    const framework = ["--root", fx.dir, "--local", fx.local("framework"), "--php", fx.php];
    const mcp = ["--suite", "mcp", "--root", fx.dir, "--local", fx.local("mcp"), "--php", fx.php];

    // Framework, local: the runner runs in the install; every ID matches.
    const ok = await run(CROSS_CHECK_CLI, framework);
    expect([ok.code, ok.stdout, ok.stderr]).toEqual([0, "framework: 3 runner tests match 3 Inventory entries\n", ""]);
    expect(readFileSync(join(fx.bin, "list-args"), "utf8")).toBe("-d\nmemory_limit=-1\nvendor/bin/phpunit\n--list-tests\n--colors=never\n");
    expect(readFileSync(join(fx.bin, "list-cwd"), "utf8").trim()).toBe(realpathSync(fx.local("framework")));

    // Missing and extra.
    fx.setListing(PHPUNIT_LISTING.replace(` - ${STR}::testAscii#1\n`, ` - ${STR}::testNew\n`));
    const diff = await run(CROSS_CHECK_CLI, framework);
    expect([diff.code, diff.stdout]).toEqual([1, ""]);
    expect(diff.stderr).toBe(
      [
        "framework: 1 missing, 1 extra (3 runner tests, 3 Inventory entries)",
        `missing from phpunit's listing: ${STR}::testAscii#1`,
        `not in the Inventory: ${STR}::testNew`,
        "Inventory cross-check failed: 1 missing, 1 extra",
        "",
      ].join("\n"),
    );
    // Noise and a failing runner.
    fx.setListing(`${PHPUNIT_LISTING}There was 1 PHPUnit test runner warning\n`);
    const noise = await run(CROSS_CHECK_CLI, framework);
    expect([noise.code, noise.stderr]).toEqual([1, "framework: unexpected phpunit output: There was 1 PHPUnit test runner warning\nInventory cross-check failed: 0 missing, 0 extra\n"]);
    writeFileSync(join(fx.bin, "list-fail"), "boom\n");
    const failed = await run(CROSS_CHECK_CLI, framework);
    expect([failed.code, failed.stderr]).toEqual([1, "framework: phpunit --list-tests failed (exit 2): boom\nInventory cross-check failed: 0 missing, 0 extra\n"]);
    rmSync(join(fx.bin, "list-fail"));
    // A stale local copy fails before the runner runs.
    writeFiles(fx.local("framework"), { "tests/Support/SupportStrTest.php": "<?php // edited\n" });
    const stale = await run(CROSS_CHECK_CLI, framework);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain("is not a copy of the snapshot");
    writeFiles(fx.local("framework"), SNAPSHOT_FILES["framework"]!);

    // Pest, local: the runner's IDs map through the lister's raw ids to the Inventory.
    fx.setListing(PEST_LISTING);
    const pest = await run(CROSS_CHECK_CLI, mcp);
    expect([pest.code, pest.stdout, pest.stderr]).toEqual([0, "mcp: 2 runner tests match 2 Inventory entries\n", ""]);
    expect(readFileSync(join(fx.bin, "list-args"), "utf8")).toBe("-d\nmemory_limit=-1\nvendor/bin/pest\n--list-tests\n--colors=never\n");
    expect(readFileSync(join(fx.bin, "args"), "utf8")).toBe(`${join(fx.dir, LISTER)}\n${fx.local("mcp")}\n${PHP_VERSION}\npest\n`);
    // A runner ID the lister does not list is extra under its runner ID; the Inventory ID it lacks is missing.
    fx.setRaw(MCP_RAWS.slice(0, 1));
    const unmapped = await run(CROSS_CHECK_CLI, mcp);
    expect([unmapped.code, unmapped.stderr]).toEqual([
      1,
      ["mcp: 1 missing, 1 extra (2 runner tests, 2 Inventory entries)", `missing from pest's listing: ${MCP_IDS[1]!}`, `not in the Inventory: ${COMPLETION}::__pest_evaluable_it_takes_a_dataset#dataset "a"`, "Inventory cross-check failed: 1 missing, 1 extra", ""].join("\n"),
    ]);
    // A lister that repeats a raw id fails.
    fx.setRaw([...MCP_RAWS, MCP_RAWS[0]!]);
    const repeated = await run(CROSS_CHECK_CLI, mcp);
    expect([repeated.code, repeated.stderr]).toEqual([1, `mcp: duplicate lister id: ${MCP_RAWS[0]!.id}\nInventory cross-check failed: 0 missing, 0 extra\n`]);
    fx.setRaw(MCP_RAWS);

    // Image mode: every suite, no mounts for the runner, `sh -c 'cd "$0" && exec php …' /oracle/upstream/<suite> <runner>`.
    const runs: { image: string; mounts: unknown; command: readonly string[] }[] = [];
    const runner = (image: string, mounts: unknown, command: readonly string[]): string => {
      runs.push({ image, mounts, command });
      if (command[0] === "sh") {
        return command[3] === "/oracle/upstream/framework" ? PHPUNIT_LISTING : PEST_LISTING;
      }
      return rawText(MCP_RAWS);
    };
    const image = crossCheck(fx.dir, { suite: "mcp", runner });
    expect([image.errors, image.missing, image.extra, image.suites.map((s) => [s.suite, s.runnerCount, s.inventoryCount])]).toEqual([[], 0, 0, [["mcp", 2, 2]]]);
    expect(runs[0]).toEqual({ image: oracleImage(fx.dir), mounts: [], command: ["sh", "-c", IMAGE_LIST_SCRIPT, "/oracle/upstream/mcp", "pest"] });
    expect(IMAGE_LIST_SCRIPT).toBe('cd "$0" && exec php -d memory_limit=-1 "vendor/bin/$1" --list-tests --colors=never');
    expect(runs[1]!.command).toEqual(["php", "/xaravel/lister.php", "/oracle/upstream/mcp", PHP_VERSION, "pest"]);
    runs.length = 0;
    expect(crossCheck(fx.dir, { suite: "framework", image: "example.test/oracle:1", runner }).suites[0]).toMatchObject({ suite: "framework", missing: [], extra: [] });
    expect(runs).toEqual([{ image: "example.test/oracle:1", mounts: [], command: ["sh", "-c", IMAGE_LIST_SCRIPT, "/oracle/upstream/framework", "phpunit"] }]);
    // Every suite is checked before the summary: ai and boost have no snapshot here, framework and mcp still run.
    const all = crossCheck(fx.dir, { suite: "all", runner });
    expect(all.suites.map((s) => s.suite)).toEqual(["framework", "mcp"]);
    expect(all.errors.map((e) => e.suite)).toEqual(["ai", "boost"]);
    expect(all.errors[0]!.message).toBe("conformance/upstream/ai is missing; run bun run upstream:sync");
    const failing = crossCheck(fx.dir, {
      suite: "framework",
      runner: (_image, _mounts, command) => {
        throw new Error(`${command.join(" ")} in x failed (exit 2): boom`);
      },
    });
    expect(failing.errors).toEqual([{ suite: "framework", message: "phpunit --list-tests failed (exit 2): boom" }]);

    // The CLI in image mode with no --suite checks every suite: ai and boost fail on their missing snapshots. PATH
    // holds only the fake bin, so framework and mcp fail before any container runtime is found.
    const defaultAll = await run(CROSS_CHECK_CLI, ["--root", fx.dir], fx.bin);
    expect(defaultAll.code).toBe(1);
    expect(defaultAll.stderr).toContain("ai: conformance/upstream/ai is missing; run bun run upstream:sync\n");
    expect(defaultAll.stderr).toContain("boost: conformance/upstream/boost is missing; run bun run upstream:sync\n");
    expect(defaultAll.stderr).toContain("framework: phpunit --list-tests failed: ");
    // So does crossCheck() itself.
    expect(crossCheck(fx.dir, { runner }).errors.map((e) => e.suite)).toEqual(["ai", "boost"]);

    // Usage errors exit 2.
    expect((await run(CROSS_CHECK_CLI, ["--image", "x", "--local", fx.local("framework")])).code).toBe(2);
    expect((await run(CROSS_CHECK_CLI, ["--suite", "nope"])).code).toBe(2);
    expect((await run(CROSS_CHECK_CLI, ["--suite", "all", "--local", fx.local("framework")])).code).toBe(2);
    expect((await run(CROSS_CHECK_CLI, ["--check"])).code).toBe(2);
    expect((await run(CROSS_CHECK_CLI, ["--php", fx.php])).code).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// XT-conformance-61

xaravelTest("XT-conformance-61", "a PR that edits conformance/inventory/ fails protected-paths unless the Maintainer approved the head commit, because the Inventory is Protected (FR-1, FR-112.1, FR-112.2, FR-112.3, AD-16.1, AD-16.2)", () => {
  const listText = readFileSync(join(root, LIST_PATH), "utf8");
  const entries = parseList(listText);
  const phases = activePhases(root);
  const files = readdirSync(join(root, INVENTORY_DIR)).map((name) => `${INVENTORY_DIR}/${name}`);
  expect(files.length).toBeGreaterThan(4);
  for (const path of [...files, `${INVENTORY_DIR}/new-component.jsonl`]) {
    expect([path, isProtected(entries, phases, path)]).toEqual([path, true]);
  }

  const head = "a".repeat(40);
  const pr = (reviews: { user: { login: string }; state: string; commit_id: string }[]) =>
    evaluatePr(entries, phases, { files: [{ filename: `${INVENTORY_DIR}/bus.jsonl` }, { filename: "packages/support/src/Str.ts" }], changedFiles: 2, reviews, headSha: head });
  const unapproved = pr([]);
  expect(unapproved.protectedFiles).toEqual([`${INVENTORY_DIR}/bus.jsonl`]);
  expect(unapproved.violations).toEqual([`protected path: ${INVENTORY_DIR}/bus.jsonl needs ${MAINTAINER}'s approving review on the head commit (no Maintainer review); re-run this check after approving (AD-16)`]);
  const login = MAINTAINER.slice(1);
  expect(pr([{ user: { login }, state: "APPROVED", commit_id: "b".repeat(40) }]).violations.length).toBe(1);
  expect(pr([{ user: { login: "someone-else" }, state: "APPROVED", commit_id: head }]).violations.length).toBe(1);
  expect(pr([{ user: { login }, state: "APPROVED", commit_id: head }])).toEqual({ protectedFiles: [`${INVENTORY_DIR}/bus.jsonl`], approved: true, violations: [] });

  // The real CODEOWNERS mirrors the list, so GitHub requires the Maintainer too.
  expect(checkMirror(listText, readFileSync(join(root, CODEOWNERS_PATH), "utf8"), phases)).toEqual([]);
});
