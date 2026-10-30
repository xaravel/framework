// Xaravel Tests for the runtime builtin scan (epic-14-retro-item-4,
// `tools/scans/builtins.ts`). XT-conformance-269 runs the scan on a mini
// snapshot in a temporary root; XT-conformance-270 runs it on the real
// snapshot and skips when `conformance/upstream/` has not been synced.
import { expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CONSTRUCT_HELPERS, isExported, main, renderReport, runtimeExports, scanBuiltins } from "../../../tools/scans/builtins";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const REAL = existsSync(join(root, "conformance", "upstream", "framework", "src"));

function writeTree(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

const PACKAGES = [
  { name: "ai", dir: "packages/ai", npm: "@xaravel/ai", phase: 9, kind: "upstream", upstream: "laravel/ai", private: false, require: [], suggest: [] },
  { name: "collections", dir: "packages/collections", npm: "@xaravel/collections", phase: 1, kind: "upstream", upstream: "illuminate/collections", private: false, require: [], suggest: [] },
  { name: "runtime", dir: "packages/runtime", npm: "@xaravel/runtime", phase: 1, kind: "xaravel", upstream: null, private: false, require: [], suggest: [] },
];

const MAP = `${JSON.stringify({ component: "ai", tests: [{ path: "ai/tests/Feature/", tags: [] }], namespaces: [], classes: [], aliases: [] })}\n${JSON.stringify({ component: "collections", tests: [{ path: "framework/tests/Support/SupportThingTest.php", tags: [] }], namespaces: [], classes: [], aliases: [] })}\n`;

const PHPUNIT = '<phpunit>\n  <testsuites>\n    <testsuite name="All">\n      <directory suffix="Test.php">./tests</directory>\n    </testsuite>\n  </testsuites>\n</phpunit>\n';

/** A temporary root with the package table and component map, plus `conformance/upstream/<files>` when `files` is not null. */
async function withRoot(files: Record<string, string> | null, body: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-builtin-scan-test-"));
  try {
    writeTree(dir, {
      "tools/scaffold/packages.jsonl": PACKAGES.map((row) => `${JSON.stringify(row)}\n`).join(""),
      "conformance/component-map": MAP,
    });
    if (files !== null) {
      for (const repo of ["framework", "ai", "mcp", "boost"]) {
        mkdirSync(join(dir, "conformance", "upstream", repo, "src"), { recursive: true });
      }
      writeTree(join(dir, "conformance", "upstream"), files);
    }
    await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs the scan's `main` with stdout and stderr captured. */
async function run(argv: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const saved = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
  process.stdout.write = ((chunk: string) => out.push(chunk) > 0) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => err.push(chunk) > 0) as typeof process.stderr.write;
  try {
    const code = await main(argv);
    return { code, stdout: out.join(""), stderr: err.join("") };
  } finally {
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
}

const SRC = "framework/src/Illuminate/Collections";
const TEST = "framework/tests/Support/SupportThingTest.php";

const THING = [
  "<?php", //                                                    1
  "",
  "namespace Illuminate\\Support;",
  "",
  "use function Foo\\{bar}; use function str_repeat;", //         5: a global import declares nothing
  "use function Baz\\qux as quux;",
  "",
  "class Thing",
  "{",
  "    public function str_pad($x)", //                          10
  "    {",
  "        $a = str_pad($x, 3);",
  "        $b = \\ucfirst($x); class_basename($x);",
  "        $c = count([1]) + json_encode($x) + serialize($x) + is_numeric($x);",
  "        $this->str_pad(1); $x?->str_pad(1); A::str_pad(1); new Foo(1);", // 15
  "        Foo\\bar(1); bar(1); quux(1); collect([1]); value(1); str_repeat('a', 2);",
  "        if (isset($x) && empty($x)) { $d = clone $x; }",
  "        $e = match ($x) { default => array(1) }; $z = array('ucfirst'); if ('ucfirst') {}",
  "        $f = fn ($y) => array_map('ucfirst', [$y]);",
  "        $g = array_map('not_called_anywhere', []); $k = ['ucfirst' => 'ucfirst', 'ucfirst'];", // 20: array keys and values are no callables
  "        $h = new class { public function in_anon() { return 1; } }; $r = new readonly class { public function ucfirst() {} };",
  "        in_anon(1); $x->f(print: 1); $y = Exit::X; $w = new Print;",
  "        // str_pad(9) in a comment, 'str_pad' twice",
  "        yield from [1]; $m = $x & str_word_count($x);",
  "    }", //                                                    25
  "}",
  "",
].join("\n");

const HELPERS = [
  "<?php",
  "",
  "if (! function_exists('collect')) {",
  "    function collect($value = []) { return $value; }",
  "}",
  "",
  "function value($value) { return $value; }",
  "",
].join("\n");

const TEST_FILE = [
  "<?php", //                                    1
  "",
  "test('pads', function () {",
  "    expect(str_pad('a', 2))->toBe('a ');",
  "    mock(Thing::class);", //                  5
  "});",
  "",
].join("\n");

const SNAPSHOT: Record<string, string> = {
  [`${SRC}/Thing.php`]: THING,
  [`${SRC}/helpers.php`]: HELPERS,
  // Not scanned for collections, but it declares a function Upstream owns.
  "framework/src/Illuminate/Support/helpers.php": "<?php\n\nfunction class_basename($class) { return $class; }\n",
  [TEST]: TEST_FILE,
  "framework/phpunit.xml.dist": PHPUNIT,
  // The ai Component: its own `<repo>/src`, and a Pest helper in `tests/Pest.php`, which no testsuite selects.
  "ai/src/Gateway.php": "<?php\n\nnamespace Laravel\\Ai;\n\nfunction id() { return uniqid(fakeHelper()); }\n",
  "ai/tests/Pest.php": "<?php\n\nfunction fakeHelper() { return 'x'; }\n\nfunction requiresApiKey() {}\n",
  "ai/tests/Feature/GatewayTest.php": "<?php\n\nrequiresApiKey();\ntest('id', fn () => expect(strtok('a b', ' ')));\n",
  "ai/phpunit.xml.dist": PHPUNIT,
};

// ---------------------------------------------------------------------------
// XT-conformance-269

xaravelTest(
  "XT-conformance-269",
  "scan:builtins lists the PHP functions and constructs an Upstream Component and its tests call by name that Upstream does not declare and @xaravel/runtime/php does not export, and exits 2 on a usage error and 1 without a snapshot (epic-14-retro-item-4)",
  async () => {
    const exports = await runtimeExports();
    // The construct helpers are real exports; the matrix's exported builtins are covered and the missing ones are not.
    for (const helper of Object.values(CONSTRUCT_HELPERS)) {
      if (helper !== null) {
        expect(exports).toContain(helper);
      }
    }
    for (const name of ["count", "json_encode", "serialize", "is_numeric"]) {
      expect(isExported(name, exports)).toBe(true);
    }
    for (const name of ["str_pad", "ucfirst", "in_anon"]) {
      expect(isExported(name, exports)).toBe(false);
    }

    await withRoot(SNAPSHOT, async (dir) => {
      const result = await run(["collections", "--root", dir]);
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
      expect(result.stdout).toBe(
        [
          `function function_exists calls=1 strings=0 first=${SRC}/helpers.php:3`,
          `function in_anon calls=1 strings=0 first=${SRC}/Thing.php:22`,
          `function str_pad calls=2 strings=0 first=${SRC}/Thing.php:12`,
          `function str_repeat calls=1 strings=0 first=${SRC}/Thing.php:16`,
          `function str_word_count calls=1 strings=0 first=${SRC}/Thing.php:24`,
          `function ucfirst calls=1 strings=1 first=${SRC}/Thing.php:13`,
          `construct array calls=2 first=${SRC}/Thing.php:18 helper=none`,
          `construct clone calls=1 first=${SRC}/Thing.php:17 helper=none`,
          `construct isset calls=1 first=${SRC}/Thing.php:17 helper=none`,
          "builtins: collections: 6 function(s) and 3 construct(s) not in @xaravel/runtime/php; 3 file(s) scanned.",
          "",
        ].join("\n"),
      );
      // Deterministic: a second run prints the same bytes.
      expect((await run(["collections", "--root", dir])).stdout).toBe(result.stdout);

      // A construct whose helper the runtime lacks is listed with that helper.
      const lacking = scanBuiltins(dir, "collections", exports.filter((name) => !["unhandledMatch", "yieldFrom", "toBool"].includes(name)));
      const report = renderReport(lacking).split("\n");
      expect(report).toContain(`construct empty calls=1 first=${SRC}/Thing.php:17 helper=toBool`);
      expect(report).toContain(`construct match calls=1 first=${SRC}/Thing.php:18 helper=unhandledMatch`);
      expect(report).toContain(`construct yield from calls=1 first=${SRC}/Thing.php:24 helper=yieldFrom`);

      // ai, mcp and boost own `<repo>/src`; a helper declared in `tests/Pest.php` is Upstream's.
      const ai = await run(["ai", "--root", dir]);
      expect(ai.stderr).toBe("");
      expect(ai.code).toBe(0);
      expect(ai.stdout).toBe(
        [
          "function strtok calls=1 strings=0 first=ai/tests/Feature/GatewayTest.php:4",
          "function uniqid calls=1 strings=0 first=ai/src/Gateway.php:5",
          "builtins: ai: 2 function(s) and 0 construct(s) not in @xaravel/runtime/php; 2 file(s) scanned.",
          "",
        ].join("\n"),
      );
    });

    await withRoot(SNAPSHOT, async (dir) => {
      for (const argv of [[], ["--root", dir], ["nope", "--root", dir], ["runtime", "--root", dir], ["collections", "--bad", "--root", dir], ["collections", "extra", "--root", dir], ["collections", "--root"]]) {
        const usage = await run(argv);
        expect(usage.code).toBe(2);
        expect(usage.stdout).toBe("");
        expect(usage.stderr).toStartWith("scan:builtins: ");
        expect(usage.stderr).toContain("Usage:");
      }
      // An unknown Component is a usage error even when the component map is missing.
      rmSync(join(dir, "conformance", "component-map"));
      expect((await run(["nope", "--root", dir])).code).toBe(2);
    });

    await withRoot(null, async (dir) => {
      const missing = await run(["collections", "--root", dir]);
      expect(missing.code).toBe(1);
      expect(missing.stdout).toBe("");
      expect(missing.stderr).toStartWith("scan:builtins: ");
      expect(missing.stderr).toContain("upstream:sync");
    });

    await withRoot({ ...SNAPSHOT, [`${SRC}/Broken.php`]: "<?php\n$a = 'unterminated;\n" }, async (dir) => {
      const broken = await run(["collections", "--root", dir]);
      expect(broken.code).toBe(1);
      expect(broken.stderr).toBe(`scan:builtins: ${SRC}/Broken.php:2: unterminated string\n`);
    });
  },
);

// ---------------------------------------------------------------------------
// XT-conformance-270

xaravelTest("XT-conformance-270", "scan:builtins collections on the real snapshot prints a parseable listing that names none of @xaravel/runtime/php's exports (epic-14-retro-item-4)", async () => {
  if (!REAL) {
    return;
  }
  const exports = await runtimeExports();
  const result = await run(["collections"]);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  const lines = result.stdout.split("\n");
  expect(lines.pop()).toBe("");
  const summary = lines.pop()!;
  // Support's helpers.php declares class_basename, which Collections calls.
  expect(lines.some((line) => line.startsWith("function class_basename "))).toBe(false);
  expect(summary).toMatch(/^builtins: collections: \d+ function\(s\) and \d+ construct\(s\) not in @xaravel\/runtime\/php; \d+ file\(s\) scanned\.$/);
  for (const line of lines) {
    const fn = /^function ([a-z_][a-z0-9_]*) calls=(\d+) strings=(\d+) first=(\S+):(\d+)$/.exec(line);
    const construct = /^construct ([a-z_ ]+) calls=(\d+) first=(\S+):(\d+) helper=(\S+)$/.exec(line);
    expect(fn !== null || construct !== null).toBe(true);
    if (fn !== null) {
      expect(isExported(fn[1]!, exports)).toBe(false);
      expect(Number(fn[2]) + Number(fn[3])).toBeGreaterThan(0);
    } else {
      expect(Object.keys(CONSTRUCT_HELPERS)).toContain(construct![1]!);
      expect(exports).not.toContain(construct![5]!);
    }
  }
});
