// Xaravel Tests for Epic 2 retro item 4 (finding R5): tools/inventory/lister.php,
// tools/baseline/runner.php and tools/baseline/recorder.php run for real, with
// the local `php`, against two committed fixture projects in php-fixtures/: a
// PHPUnit 13.4.3 one (the framework lock's PHPUnit) and a Pest v4.7.8 one on
// PHPUnit 12.5.33 (the ai, mcp and boost locks'). The other tool tests cover
// these scripts only through fakes, which is how the fork-guard bug reached
// CI.
//
// The fixtures' vendor/ is not committed; `bun run php-fixtures:install`
// installs it, and these tests never touch the network. When `php` is not on
// PATH or a fixture's vendor/ is missing, each test is skipped and its name
// gives the reason. With XARAVEL_PHP_FIXTURES=require (the CI `php-fixtures`
// job), an unmet precondition fails the test instead.
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseRunnerListing, type Runner } from "../../../tools/inventory/cross-check";
import { LISTER, parsePestRaw, parseRaw, pestTestId, type PestRawTest, type PestSuite, type RawTest } from "../../../tools/inventory/inventory";

const root = resolve(import.meta.dir, "..", "..", "..");
const FIXTURES = join(import.meta.dir, "php-fixtures");
const RUNNER = "tools/baseline/runner.php";
const REQUIRE = process.env["XARAVEL_PHP_FIXTURES"] === "require";
const TIMEOUT = 120_000;
/** pestTestId takes a Pest suite name; the fixture stands in for one. */
const PEST_SUITE: PestSuite = "ai";

type Fixture = "phpunit" | "pest";

interface RecorderLine {
  test: string | null;
  class: string | null;
  outcome: "pass" | "skip" | "fail" | null;
  assertions: Record<string, number>;
}

function fixtureDir(fixture: Fixture): string {
  return join(FIXTURES, fixture);
}

interface PhpProbe {
  version: string;
  versionId: number;
  pcntl: boolean;
}

let probed: PhpProbe | null = null;
const warned = new Set<string>();

/** One `php -r` call, cached: PHP_VERSION, PHP_VERSION_ID and whether pcntl is loaded. */
function probe(): PhpProbe {
  if (probed === null) {
    const result = Bun.spawnSync(["php", "-r", 'echo PHP_VERSION, " ", PHP_VERSION_ID, " ", extension_loaded("pcntl") ? 1 : 0;'], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) {
      throw new Error(`php -r failed: ${result.stderr.toString()}`);
    }
    const [version, versionId, pcntl] = result.stdout.toString().split(" ");
    probed = { version: version!, versionId: Number(versionId), pcntl: pcntl === "1" };
  }
  return probed;
}

/** The reason the fixture cannot run, or null when it can. */
function unmet(fixture: Fixture): string | null {
  if (Bun.which("php") === null) {
    return "php not on PATH";
  }
  const php = probe();
  if (php.versionId < 80400) {
    return `php ${php.version} is older than 8.4`;
  }
  if (fixture === "phpunit" && !php.pcntl) {
    return "php lacks the pcntl extension";
  }
  for (const required of ["vendor/autoload.php", `vendor/bin/${fixture}`]) {
    if (!existsSync(join(fixtureDir(fixture), required))) {
      return `${relative(root, fixtureDir(fixture))}/vendor missing; run bun run php-fixtures:install`;
    }
  }
  return null;
}

/** A test that needs `php` and the fixture's vendor/: skipped with the reason, or failed under XARAVEL_PHP_FIXTURES=require. */
function phpTest(name: string, fixture: Fixture, body: () => void): void {
  const reason = unmet(fixture);
  if (reason === null) {
    test(name, body, TIMEOUT);
  } else if (REQUIRE) {
    test(name, () => {
      throw new Error(`XARAVEL_PHP_FIXTURES=require: ${reason}`);
    });
  } else {
    // bun test does not print skipped test names, so the reason also goes to stderr once.
    if (!warned.has(reason)) {
      warned.add(reason);
      console.warn(`php-scripts.test.ts: skipping the ${fixture} fixture tests: ${reason}`);
    }
    test.skip(`${name} [skipped: ${reason}]`, body);
  }
}

/** The running PHP's own PHP_VERSION, which the scripts require as their version argument. */
function phpVersion(): string {
  return probe().version;
}

/** Runs php with $args in $cwd; fails on a non-zero exit, with stderr. */
function php(args: readonly string[], cwd: string = root): string {
  const result = Bun.spawnSync(["php", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const stdout = result.stdout.toString();
  if (result.exitCode !== 0) {
    throw new Error(`php ${args.join(" ")} exited ${result.exitCode}:\n${result.stderr.toString()}${stdout}`);
  }
  return stdout;
}

function lister(fixture: Fixture, dir: string = fixtureDir(fixture)): string {
  return php([join(root, LISTER), dir, phpVersion(), ...(fixture === "pest" ? ["pest"] : [])]);
}

function runner(fixture: Fixture, files: string = "-"): RecorderLine[] {
  const stdout = php([join(root, RUNNER), fixtureDir(fixture), phpVersion(), fixture, files]);
  expect(existsSync(join(fixtureDir(fixture), "phpunit.xaravel-baseline.xml"))).toBe(false);
  expect(stdout.endsWith("\n")).toBe(true);
  return stdout.slice(0, -1).split("\n").map((line) => JSON.parse(line) as RecorderLine);
}

/** The suite's own `--list-tests`, parsed by the cross-check. */
function runnerListing(fixture: Fixture): string[] {
  const runnerName: Runner = fixture;
  return parseRunnerListing(php([`vendor/bin/${runnerName}`, "--list-tests", "--colors=never", "--do-not-cache-result"], fixtureDir(fixture)), runnerName);
}

/** The exact source text from `function` to the closing brace of lines start..end of a fixture file. */
function sourceText(fixture: Fixture, raw: Pick<RawTest, "source">): string {
  const lines = readFileSync(join(fixtureDir(fixture), raw.source.file), "utf8").split("\n").slice(raw.source.start - 1, raw.source.end).join("\n");
  return lines.slice(lines.indexOf("function"), lines.lastIndexOf("}") + 1);
}

function tokenText(raw: Pick<RawTest, "tokens">): string {
  return raw.tokens.map((token) => token.slice(1)).join("");
}

function withFilesList<T>(text: string, body: (file: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-php-scripts-"));
  try {
    const file = join(dir, "files.txt");
    writeFileSync(file, text);
    return body(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const recorded = (test: string, outcome: RecorderLine["outcome"], assertions: Record<string, number> = {}): RecorderLine => ({ test, class: null, outcome, assertions });

// ---------------------------------------------------------------------------
// PHPUnit

const FORK = "Fixture\\Tests\\ForkTest::testFork";
const RECORDED = "Fixture\\Tests\\RecordedTest";

/** The PHPUnit fixture's recorder lines: tests sorted by id (byte order), no class-level lines. */
const PHPUNIT_FORK_LINE = recorded(FORK, "pass", { assertSame: 1, assertTrue: 1 });
const PHPUNIT_RECORDED_LINES: RecorderLine[] = [
  recorded(`${RECORDED}::testCount`, "pass", { assertCount: 1 }),
  recorded(`${RECORDED}::testFailing`, "fail", { assertSame: 1 }),
  recorded(`${RECORDED}::testMixedKinds`, "pass", { assertSame: 2, assertTrue: 1 }),
  recorded(`${RECORDED}::testProvided#one`, "pass", { assertSame: 1 }),
  recorded(`${RECORDED}::testProvided#two`, "pass", { assertSame: 1 }),
  recorded(`${RECORDED}::testSkipped`, "skip"),
];

// Verifies: FR-1 (the lister's PHPUnit raw lines, run for real, list exactly the runner's tests with their datasets)
phpTest("XT-conformance-173: lister.php lists the PHPUnit fixture's tests in listing order with exact ids, sources, tokens and dataset exports, and the ids equal phpunit --list-tests (FR-1)", "phpunit", () => {
  const raws = parseRaw(lister("phpunit"));
  expect(raws.map(({ tokens: _tokens, ...rest }) => rest)).toEqual([
    { id: FORK, class: "Fixture\\Tests\\ForkTest", method: "testFork", dataset: null, file: "tests/ForkTest.php", source: { file: "tests/ForkTest.php", start: 13, end: 26 }, data: null, requiresDatabase: null, redis: false },
    ...(
      [
        ["testMixedKinds", null, 12, 17, null],
        ["testCount", null, 19, 23, null],
        ["testProvided", "one", 35, 38, "[0=>1,1=>1]"],
        ["testProvided", "two", 35, 38, "[0=>2,1=>2]"],
        ["testSkipped", null, 40, 43, null],
        ["testFailing", null, 45, 48, null],
      ] as const
    ).map(([method, dataset, start, end, data]) => ({
      id: `${RECORDED}::${method}${dataset === null ? "" : `#${dataset}`}`,
      class: RECORDED,
      method,
      dataset,
      file: "tests/RecordedTest.php",
      source: { file: "tests/RecordedTest.php", start, end },
      data,
      requiresDatabase: null,
      redis: false,
    })),
  ]);
  for (const raw of raws) {
    expect(tokenText(raw)).toBe(sourceText("phpunit", raw));
  }
  expect(runnerListing("phpunit")).toEqual(raws.map((raw) => raw.id));
});

// Verifies: FR-3, FR-113 (the runner and recorder, run for real, give each PHPUnit test its exact outcome and assertion kinds)
phpTest("XT-conformance-174: runner.php records the PHPUnit fixture's exact pass, skip and fail outcomes and {kind: count}, counting a nested assertThat inside assertCount once (FR-3, FR-113)", "phpunit", () => {
  expect(runner("phpunit")).toEqual([PHPUNIT_FORK_LINE, ...PHPUNIT_RECORDED_LINES]);
});

// Verifies: FR-113 (a pcntl_fork child never repeats the counts recorded before the fork)
phpTest("XT-conformance-175: a test that asserts and then pcntl_forks a child that exits has its counts recorded once, not again by the child (FR-113)", "phpunit", () => {
  expect(withFilesList("tests/ForkTest.php\n", (files) => runner("phpunit", files))).toEqual([PHPUNIT_FORK_LINE]);
});

// Verifies: FR-3 (a files list reduces the run to the named test files)
phpTest("XT-conformance-176: runner.php given a files list naming one test file records only that file's tests (FR-3)", "phpunit", () => {
  expect(withFilesList("tests/RecordedTest.php\n", (files) => runner("phpunit", files))).toEqual(PHPUNIT_RECORDED_LINES);
});

// ---------------------------------------------------------------------------
// Pest

const PEST_CLASS = "P\\Tests\\ExampleTest";
const PEST_FILE = "tests/ExampleTest.php";

/** The Pest fixture's tests in listing order: PHPUnit method, describe, name, dataset, source lines and dataset export. */
const PEST_TESTS = [
  ["__pest_evaluable_adds_numbers", [], "adds numbers", null, 5, 8, null],
  ["__pest_evaluable__math__→_it_multiplies", ["math"], "it multiplies", null, 11, 13, null],
  ["__pest_evaluable_doubles", [], "doubles", 'dataset "one"', 16, 18, "[0=>1,1=>2]"],
  ["__pest_evaluable_doubles", [], "doubles", 'dataset "two"', 16, 18, "[0=>2,1=>4]"],
  ["__pest_evaluable_is_skipped", [], "is skipped", null, 23, 25, null],
  ["__pest_evaluable_fails", [], "fails", null, 27, 29, null],
] as const;

// Verifies: FR-1 (the lister's Pest raw lines, run for real, give the Pest Test IDs of exactly the runner's tests)
phpTest("XT-conformance-177: lister.php in pest mode lists the Pest fixture's tests with exact describe, name, dataset and source, pestTestId gives the describe > name#dataset ids, and the ids equal pest --list-tests (FR-1)", "pest", () => {
  const raws: PestRawTest[] = parsePestRaw(lister("pest"));
  expect(raws.map(({ tokens: _tokens, ...rest }) => rest)).toEqual(
    PEST_TESTS.map(([method, describe, name, dataset, start, end, data]) => ({
      id: `${PEST_CLASS}::${method}${dataset === null ? "" : `#${dataset}`}`,
      class: PEST_CLASS,
      method,
      dataset,
      file: PEST_FILE,
      describe: [...describe],
      name,
      source: { file: PEST_FILE, start, end },
      data,
      requiresDatabase: null,
      redis: false,
    })),
  );
  expect(raws.map((raw) => pestTestId(PEST_SUITE, raw))).toEqual([
    "ai/tests/ExampleTest.php::adds numbers",
    "ai/tests/ExampleTest.php::math > it multiplies",
    'ai/tests/ExampleTest.php::doubles#dataset "one"',
    'ai/tests/ExampleTest.php::doubles#dataset "two"',
    "ai/tests/ExampleTest.php::is skipped",
    "ai/tests/ExampleTest.php::fails",
  ]);
  for (const raw of raws) {
    expect(tokenText(raw)).toBe(sourceText("pest", raw));
  }
  expect(runnerListing("pest")).toEqual(raws.map((raw) => raw.id));
  // A relative <suite-dir> lists the same lines (Pest runs in the suite directory).
  expect(lister("pest", relative(root, fixtureDir("pest")))).toBe(lister("pest"));
});

// Verifies: FR-3, FR-113 (the runner and recorder, run for real, give each Pest test its exact outcome and assertion kinds)
phpTest("XT-conformance-178: runner.php records the Pest fixture's exact outcomes and {kind: count} per Pest Test ID (FR-3, FR-113)", "pest", () => {
  const ids = new Map(parsePestRaw(lister("pest")).map((raw) => [raw.id, pestTestId(PEST_SUITE, raw)]));
  const lines = runner("pest");
  expect(lines.every((line) => line.class === null)).toBe(true);
  expect(lines.filter((line) => line.test === null || !ids.has(line.test))).toEqual([]);
  expect(lines.map((line) => [ids.get(line.test!), line.outcome, line.assertions])).toEqual([
    ["ai/tests/ExampleTest.php::math > it multiplies", "pass", { assertSame: 1 }],
    ["ai/tests/ExampleTest.php::adds numbers", "pass", { assertSame: 1, assertTrue: 1 }],
    ['ai/tests/ExampleTest.php::doubles#dataset "one"', "pass", { assertSame: 1 }],
    ['ai/tests/ExampleTest.php::doubles#dataset "two"', "pass", { assertSame: 1 }],
    ["ai/tests/ExampleTest.php::fails", "fail", { assertSame: 1 }],
    ["ai/tests/ExampleTest.php::is skipped", "skip", {}],
  ]);
});

// ---------------------------------------------------------------------------
// The fixture locks follow the Oracle locks (no PHP needed)

/** The locked version of each named package in a composer.lock (packages and packages-dev). */
function lockedVersions(file: string, names: readonly string[]): Record<string, string | null> {
  const lock = JSON.parse(readFileSync(join(root, file), "utf8")) as { packages?: { name: string; version: string }[]; "packages-dev"?: { name: string; version: string }[] };
  const all = [...(lock.packages ?? []), ...(lock["packages-dev"] ?? [])];
  return Object.fromEntries(names.map((name) => [name, all.find((entry) => entry.name === name)?.version ?? null]));
}

// Verifies: FR-3 (the fixtures run the PHPUnit and Pest versions the Oracle runs, so a pin bump that moves them fails here)
test("XT-conformance-179: the PHPUnit fixture locks the framework Oracle lock's phpunit/phpunit, and the Pest fixture locks the ai, mcp and boost Oracle locks' pestphp/pest and phpunit/phpunit (FR-3)", () => {
  const fixtureLock = (fixture: Fixture): string => `${relative(root, fixtureDir(fixture))}/composer.lock`;
  const phpunit = lockedVersions(fixtureLock("phpunit"), ["phpunit/phpunit"]);
  expect(phpunit["phpunit/phpunit"]).not.toBeNull();
  expect(lockedVersions("conformance/oracle/locks/framework/composer.lock", ["phpunit/phpunit"])).toEqual(phpunit);
  const pest = lockedVersions(fixtureLock("pest"), ["pestphp/pest", "phpunit/phpunit"]);
  expect(Object.values(pest).every((version) => version !== null)).toBe(true);
  for (const suite of ["ai", "mcp", "boost"]) {
    expect([suite, lockedVersions(`conformance/oracle/locks/${suite}/composer.lock`, ["pestphp/pest", "phpunit/phpunit"])]).toEqual([suite, pest]);
  }
});
