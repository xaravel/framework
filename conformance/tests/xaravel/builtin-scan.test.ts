// Xaravel Tests for the runtime builtin scan (epic-14-retro-item-4,
// `tools/scans/builtins.ts`). XT-conformance-269 runs the scan on a mini
// snapshot in a temporary root; XT-conformance-270 runs it on the real
// snapshot and skips when `conformance/upstream/` has not been synced.
// epic-15-retro-item-7 widened the scan: XT-conformance-274 (constants and
// classes), 275 (refused PCRE patterns) and 276 (pinned vendor source, fetched
// only under --sync from local repositories in a temporary directory) run on
// mini snapshots; 277 checks the real `tools/scans/vendor-ports.jsonl`.
import { expect } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CONSTRUCT_HELPERS, isExported, main, renderReport, runtimeExports, scanBuiltins } from "../../../tools/scans/builtins";
import { xaravelTest } from "../../../packages/assert/src/index";
import { compilePattern } from "../../../packages/runtime/src/php/pcre";
import { readTable } from "../../../tools/scaffold/table";
import { lockedPackage, readLock, readVendorPorts } from "../../../tools/scans/vendor";
import { treeHash } from "../../../tools/upstream/upstream";

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
  "if (! defined('COLLECT_HELPERS')) {",
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
  "ai/tests/Feature/GatewayTest.php": "<?php\n\nrequiresApiKey();\ntest('id', fn () => expect(soundex('a b')));\n",
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
          `function defined calls=1 strings=0 first=${SRC}/helpers.php:3`,
          `function in_anon calls=1 strings=0 first=${SRC}/Thing.php:22`,
          `function str_pad calls=2 strings=0 first=${SRC}/Thing.php:12`,
          `function str_repeat calls=1 strings=0 first=${SRC}/Thing.php:16`,
          `function str_word_count calls=1 strings=0 first=${SRC}/Thing.php:24`,
          `function ucfirst calls=1 strings=1 first=${SRC}/Thing.php:13`,
          `construct array calls=2 first=${SRC}/Thing.php:18 helper=none`,
          `construct clone calls=1 first=${SRC}/Thing.php:17 helper=none`,
          `construct isset calls=1 first=${SRC}/Thing.php:17 helper=none`,
          // The non-namespaced test file names `Thing::class`, a global class Upstream does not declare (epic-15-retro-item-7).
          `class Thing uses=1 first=${TEST}:5`,
          "builtins: collections: 6 function(s), 3 construct(s), 0 constant(s) and 1 class(es) not in @xaravel/runtime/php; 0 refused pattern(s); 3 file(s) scanned.",
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
          "function soundex calls=1 strings=0 first=ai/tests/Feature/GatewayTest.php:4",
          "function uniqid calls=1 strings=0 first=ai/src/Gateway.php:5",
          "builtins: ai: 2 function(s), 0 construct(s), 0 constant(s) and 0 class(es) not in @xaravel/runtime/php; 0 refused pattern(s); 2 file(s) scanned.",
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
  expect(summary).toMatch(
    /^builtins: collections: \d+ function\(s\), \d+ construct\(s\), \d+ constant\(s\) and \d+ class\(es\) not in @xaravel\/runtime\/php; \d+ refused pattern\(s\); \d+ file\(s\) scanned\.$/,
  );
  for (const line of lines) {
    const fn = /^function ([a-z_][a-z0-9_]*) calls=(\d+) strings=(\d+) first=(\S+):(\d+)$/.exec(line);
    const construct = /^construct ([a-z_ ]+) calls=(\d+) first=(\S+):(\d+) helper=(\S+)$/.exec(line);
    // epic-15-retro-item-7: constants, classes and refused patterns.
    const constant = /^constant ([A-Z][A-Z0-9_]*) uses=(\d+) first=(\S+):(\d+)$/.exec(line);
    const klass = /^class ([A-Za-z_][A-Za-z0-9_]*) uses=(\d+) first=(\S+):(\d+)$/.exec(line);
    const pattern = /^pattern (".*") uses=(\d+) first=(\S+):(\d+) refused=(".*")$/.exec(line);
    expect(fn !== null || construct !== null || constant !== null || klass !== null || pattern !== null).toBe(true);
    if (constant !== null) {
      expect(exports).not.toContain(constant[1]!);
    } else if (klass !== null) {
      expect(exports.map((name) => name.toLowerCase())).not.toContain(klass[1]!.toLowerCase());
    } else if (pattern !== null) {
      expect(typeof JSON.parse(pattern[1]!)).toBe("string");
      expect(JSON.parse(pattern[5]!)).toContain("(DIV-10.1)");
    } else if (fn !== null) {
      expect(isExported(fn[1]!, exports)).toBe(false);
      expect(Number(fn[2]) + Number(fn[3])).toBeGreaterThan(0);
    } else {
      expect(Object.keys(CONSTRUCT_HELPERS)).toContain(construct![1]!);
      expect(exports).not.toContain(construct![5]!);
    }
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-274

const CONSTS = [
  "<?php", //                                                                       1
  "",
  "namespace Illuminate\\Support;",
  "",
  "use const Foo\\IMPORTED_CONST;", //                                               5
  "use Countable;",
  "use Foo\\Bar; use Foo\\{Grouped, Other as Alias};", //                          7: grouped imports name namespaced classes
  "use GlobalTwo as Two;",
  "",
  "const TOP_LEVEL = 1;", //                                                        10
  "define('DEFINED_CONST', 2);",
  "",
  "enum Suit: string",
  "{",
  "    case HEARTS = 'h';", //                                                       15
  "    case SPADES;",
  "    public function f($x) { switch ($x) { case CASE_CONST: return 1; } return 0; }",
  "}",
  "",
  "interface Shape extends Countable, Two {}", //                                   20
  "",
  "class Consts extends \\GlobalOne implements Countable, \\GlobalThree",
  "{",
  "    const BAR = 1;",
  "    const int TYPED = 2, MULTI = 3;", //                                         25
  "    public function f(LOCAL_TYPE $x, ?OTHER_TYPE &$y, UNION_A|UNION_B $u, SPREAD_TYPE ...$z): void",
  "    {",
  "        $a = PHP_EOL . \\E_ALL . TRUE . null . False . Foo::BAR_X . $this->PROP . $o?->NULLSAFE . Foo\\BAR_NS . __DIR__;",
  "        BAR_CALL::x(); g(NAMED: 1); $n = new UPPER_NEW;",
  "        $b = TOP_LEVEL + DEFINED_CONST + IMPORTED_CONST + OTHER_DECLARED + DIRECTORY_SEPARATOR + E_ALL;", // 30
  "        $c = new \\GlobalFour() instanceof \\GlobalFive;",
  "        $d = new Bar; $e = new Unimported; $f = new class {}; $g = new readonly class {}; new Grouped; new Alias;",
  "        try {} catch (\\GlobalSix | \\GlobalSeven $e) {} catch (Unimported2 $e) {}",
  "        self::x(); static::x(); parent::x(); \\Mockery::mock(); Two::x(); \\arrayiterator::class; \\Foo\\Baz::x(); \\FixtureGlobal::x();",
  "    }", //                                                                       35
  "}",
  "",
  "class WithTraits",
  "{",
  "    use SomeTrait;", //                                                           40
  "    public function a() { return TRAIT_AFTER_A . \\TraitClassA::x() . trait_fn_a(); }",
  "}",
  "",
  "class WithAdaptation",
  "{", //                                                                           45
  "    use TraitOne, TraitTwo { TraitOne::hello insteadof TraitTwo; TraitTwo::hello as HELLO_ALIAS; }",
  "    public function b() { return TRAIT_AFTER_B . new \\TraitClassB() . trait_fn_b(); }",
  "}",
  "",
].join("\n");

const GLOBALS = [
  "<?php", //                                         1
  "",
  "class GlobalDeclared {}",
  "",
  "new GlobalDeclared; GlobalDeclared::x();", //      5
  "new Undeclared(); new undeclared;",
  "$x = $y instanceof Countable; $this->model::query(); $o?->other::query();", // a property before `::` names no class
  "",
].join("\n");

xaravelTest(
  "XT-conformance-274",
  "scan:builtins lists the global constants and builtin classes the scanned code names, minus declared, imported and exported names, by the constant and class rules (epic-15-retro-item-7)",
  async () => {
    const files = {
      ...SNAPSHOT,
      [`${SRC}/Consts.php`]: CONSTS,
      [`${SRC}/globals.php`]: GLOBALS,
      // Not scanned for collections: a global class and a top-level constant Upstream declares elsewhere.
      "framework/tests/Support/fixtures.php": "<?php\n\nclass FixtureGlobal {}\n\nconst OTHER_DECLARED = 1;\n",
    };
    await withRoot(files, async (dir) => {
      const exports = ["DIRECTORY_SEPARATOR", "ArrayIterator", "EmptyIterator"];
      const report = renderReport(scanBuiltins(dir, "collections", exports)).split("\n");
      const at = (file: string, line: number): string => `${SRC}/${file}:${line}`;
      const constants = report.filter((line) => line.startsWith("constant "));
      expect(constants).toEqual([
        `constant CASE_CONST uses=1 first=${at("Consts.php", 17)}`,
        `constant E_ALL uses=2 first=${at("Consts.php", 28)}`,
        `constant PHP_EOL uses=1 first=${at("Consts.php", 28)}`,
        // A class-body trait `use`, with or without an adaptation block, ends at its `;` or `}`.
        `constant TRAIT_AFTER_A uses=1 first=${at("Consts.php", 41)}`,
        `constant TRAIT_AFTER_B uses=1 first=${at("Consts.php", 47)}`,
      ]);
      expect(report).toContain(`function trait_fn_a calls=1 strings=0 first=${at("Consts.php", 41)}`);
      expect(report).toContain(`function trait_fn_b calls=1 strings=0 first=${at("Consts.php", 47)}`);
      for (const name of ["grouped", "other", "alias", "model"]) {
        expect(report.some((line) => line.toLowerCase().startsWith(`class ${name} `))).toBe(false);
      }
      const classes = report.filter((line) => line.startsWith("class "));
      expect(classes).toEqual([
        `class Countable uses=3 first=${at("Consts.php", 20)}`,
        `class GlobalFive uses=1 first=${at("Consts.php", 31)}`,
        `class GlobalFour uses=1 first=${at("Consts.php", 31)}`,
        `class GlobalOne uses=1 first=${at("Consts.php", 22)}`,
        `class GlobalSeven uses=1 first=${at("Consts.php", 33)}`,
        `class GlobalSix uses=1 first=${at("Consts.php", 33)}`,
        `class GlobalThree uses=1 first=${at("Consts.php", 22)}`,
        `class GlobalTwo uses=2 first=${at("Consts.php", 20)}`,
        `class Thing uses=1 first=${TEST}:5`,
        `class TraitClassA uses=1 first=${at("Consts.php", 41)}`,
        `class TraitClassB uses=1 first=${at("Consts.php", 47)}`,
        `class Undeclared uses=2 first=${at("globals.php", 6)}`,
      ]);
      expect(report.at(-2)).toMatch(/^builtins: collections: \d+ function\(s\), \d+ construct\(s\), 5 constant\(s\) and 12 class\(es\) not in @xaravel\/runtime\/php; 0 refused pattern\(s\); 5 file\(s\) scanned\.$/);

      // Constants compare case-sensitively with the runtime exports, classes case-insensitively.
      const lowered = renderReport(scanBuiltins(dir, "collections", ["directory_separator", "ARRAYITERATOR", "countable", "PHP_EOL"])).split("\n");
      expect(lowered).toContain(`constant DIRECTORY_SEPARATOR uses=1 first=${at("Consts.php", 30)}`);
      expect(lowered.some((line) => line.toLowerCase().startsWith("class arrayiterator "))).toBe(false);
      // Without the export, the class prints in its first-seen spelling (`Undeclared` above groups `undeclared` too).
      expect(renderReport(scanBuiltins(dir, "collections", [])).split("\n")).toContain(`class arrayiterator uses=1 first=${at("Consts.php", 34)}`);
      expect(lowered.some((line) => line.startsWith("constant PHP_EOL "))).toBe(false);
      expect(lowered.some((line) => line.startsWith("class Countable "))).toBe(false);

      // Deterministic through main.
      const first = await run(["collections", "--root", dir]);
      expect(first.code).toBe(0);
      expect((await run(["collections", "--root", dir])).stdout).toBe(first.stdout);
    });
  },
);

// ---------------------------------------------------------------------------
// XT-conformance-275

const PATTERNS = [
  "<?php", //                                              1
  "",
  "namespace Illuminate\\Support;",
  "",
  "preg_match('/a++/', $s);", //                           5: a possessive quantifier
  "preg_replace('/foo/x', '', $s);", //                    6: the x modifier
  "preg_match('/foo/', $s);", //                           7: converted
  "preg_match('/(unclosed/', $s);", //                     8: PHP cannot compile it
  "$p = '/path/to'; $d = '+1 day'; $i = \"/a++/$x\";", //  9: not patterns, or interpolated
  "$again = ['/a++/' => \"/foo/x\"];", //                  10
  "",
].join("\n");

/** The message `compilePattern` throws for `pattern`, or null. */
function thrown(pattern: string): string | null {
  try {
    compilePattern("preg_match", pattern);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

xaravelTest(
  "XT-conformance-275",
  "scan:builtins lists each literal string the runtime's compilePattern accepts as a PHP pattern and then refuses, with the thrown message, and skips converted, PHP-invalid, non-pattern and interpolated strings (epic-15-retro-item-7)",
  async () => {
    // The fixture's literals as compilePattern sees them.
    expect(compilePattern("preg_match", "/foo/")).not.toBeNull();
    expect(compilePattern("preg_match", "/(unclosed/")).toBeNull();
    expect(compilePattern("preg_match", "/path/to")).toBeNull();
    expect(compilePattern("preg_match", "+1 day")).toBeNull();
    const possessive = thrown("/a++/");
    const extended = thrown("/foo/x");
    expect(possessive).toContain("possessive");
    expect(extended).toContain("x modifier");

    await withRoot({ ...SNAPSHOT, [`${SRC}/Patterns.php`]: PATTERNS }, async (dir) => {
      const result = await run(["collections", "--root", dir]);
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
      const lines = result.stdout.split("\n");
      expect(lines.filter((line) => line.startsWith("pattern "))).toEqual([
        `pattern "/a++/" uses=2 first=${SRC}/Patterns.php:5 refused=${JSON.stringify(possessive)}`,
        `pattern "/foo/x" uses=2 first=${SRC}/Patterns.php:6 refused=${JSON.stringify(extended)}`,
      ]);
      expect(lines.at(-2)).toMatch(/; 2 refused pattern\(s\); 4 file\(s\) scanned\.$/);
    });
  },
);

// ---------------------------------------------------------------------------
// XT-conformance-276

/** Runs git in `cwd` without a user's hooks or signing, failing loudly. */
function git(cwd: string, args: readonly string[]): string {
  const proc = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString().trim();
}

/** A local bare repository `<base>/<repo>.git` holding one commit of `files`; returns the commit. */
function bareRepo(base: string, repo: string, files: Record<string, string>): string {
  const work = mkdtempSync(join(tmpdir(), "xaravel-builtin-scan-work-"));
  try {
    writeTree(work, files);
    git(work, ["init", "--quiet"]);
    git(work, ["add", "-A"]);
    git(work, ["commit", "--quiet", "-m", "pinned"]);
    const commit = git(work, ["rev-parse", "HEAD"]);
    const bare = join(base, `${repo}.git`);
    mkdirSync(dirname(bare), { recursive: true });
    git(base, ["clone", "--quiet", "--bare", work, bare]);
    // `git fetch <url> <commit>` asks for a commit by id.
    git(bare, ["config", "uploadpack.allowAnySHA1InWant", "true"]);
    return commit;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const OPTION = [
  "<?php", //                                                   1
  "",
  "namespace Acme;",
  "",
  "final class Option implements \\IteratorAggregate", //       5
  "{",
  "    public function reduce(array $a) { return array_reduce($a, fn ($c, $x) => $c, null); }",
  "    public function path() { return 'a' . \\DIRECTORY_SEPARATOR . 'b' . soundex('x'); }",
  "    public function getIterator(): \\Traversable { return new \\EmptyIterator(); }",
  "}", //                                                       10
  "",
].join("\n");

/** Makes every file and directory under `dir` writable again, so a test can tamper with a read-only cache. */
function makeWritable(dir: string): void {
  chmodSync(dir, 0o755);
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (lstatSync(path).isDirectory()) {
      makeWritable(path);
    } else {
      chmodSync(path, 0o644);
    }
  }
}

xaravelTest(
  "XT-conformance-276",
  "scan:builtins reads the pinned source of the vendor libraries a Component ports, fetched only under --sync at the lock's commit and verified by its tree hash, and fails closed on a missing, modified, wrong-commit or unlocked vendor source (epic-15-retro-item-7)",
  async () => {
    const remote = mkdtempSync(join(tmpdir(), "xaravel-builtin-scan-remote-"));
    try {
      const option = bareRepo(remote, "acme/option", {
        "src/Option.php": OPTION,
        "src/Tests/OptionTest.php": "<?php\n\nexcluded_by_classmap();\n",
        "helpers.php": "<?php\n\nfunction acme_helper() { return levenshtein('a', 'b'); }\n",
        "outside/NotAutoloaded.php": "<?php\n\nnot_autoloaded();\n",
      });
      const foundation = bareRepo(remote, "symfony/http-foundation", {
        "Request.php": "<?php\n\nnamespace Symfony\\Component\\HttpFoundation;\n\nclass Request { public function f() { return metaphone('x'); } }\n",
        "Tests/RequestTest.php": "<?php\n\nexcluded_test();\n",
      });
      const base = `file://${remote}`;
      const lockEntry = (name: string, commit: string, autoload: unknown): unknown => ({ name, source: { type: "git", url: `https://github.com/${name}.git`, reference: commit }, autoload });
      const lock = (optionCommit: string): string =>
        `${JSON.stringify(
          {
            packages: [lockEntry("acme/option", optionCommit, { files: ["helpers.php"], "psr-4": { "Acme\\": "src/" }, "exclude-from-classmap": ["/Tests/"] })],
            "packages-dev": [lockEntry("symfony/http-foundation", foundation, { "psr-4": { "Symfony\\Component\\HttpFoundation\\": "" }, "exclude-from-classmap": ["/Tests/"] })],
          },
          null,
          4,
        )}\n`;
      const files = { ...SNAPSHOT, "framework/src/Illuminate/Config/Repository.php": "<?php\n\nnamespace Illuminate\\Config;\n\nclass Repository { public function f() { return similar_text('a', 'b'); } }\n" };
      const extraRows = [
        { name: "config", dir: "packages/config", npm: "@xaravel/config", phase: 2, kind: "upstream", upstream: "illuminate/config", private: false, require: [], suggest: [] },
        { name: "http-foundation", dir: "packages/http-foundation", npm: "@xaravel/http-foundation", phase: 4, kind: "xaravel", upstream: "symfony/http-foundation", private: false, require: [], suggest: [] },
      ];
      await withRoot(files, async (dir) => {
        writeTree(dir, {
          "tools/scaffold/packages.jsonl": [...PACKAGES, ...extraRows].map((row) => `${JSON.stringify(row)}\n`).join(""),
          "tools/scans/vendor-ports.jsonl": `${JSON.stringify({ component: "config", package: "acme/option", source: "a test row" })}\n`,
          "conformance/oracle/locks/framework/composer.lock": lock(option),
        });
        const cache = join(dir, ".cache", "vendor");
        const cached = join(cache, `acme/option@${option}`);
        try {

          // Without --sync a missing vendor source fails, and nothing is fetched or written.
          const missing = await run(["config", "--root", dir]);
          expect(missing.code).toBe(1);
          expect(missing.stdout).toBe("");
          expect(missing.stderr).toStartWith("scan:builtins: ");
          expect(missing.stderr).toContain("acme/option");
          expect(missing.stderr).toContain("run bun run scan:builtins config --sync");
          expect(existsSync(join(dir, ".cache"))).toBe(false);

          // --remote is only valid with --sync; repeated or valueless flags are usage errors.
          for (const argv of [["config", "--remote", base], ["config", "--sync", "--sync"], ["config", "--sync", "--remote"], ["config", "--sync", "--remote", base, "--remote", base]]) {
            const usage = await run([...argv, "--root", dir]);
            expect(usage.code).toBe(2);
            expect(usage.stderr).toContain("Usage:");
          }

          // --sync fetches the pinned commit, records its tree and scans the vendor files after the Upstream ones.
          const synced = await run(["config", "--root", dir, "--sync", "--remote", base]);
          expect(synced.stderr).toBe("");
          expect(synced.code).toBe(0);
          expect(existsSync(join(cached, "src", "Option.php"))).toBe(true);
          expect(readFileSync(`${cached}.tree`, "utf8").trim()).toBe(treeHash(cached));
          const lines = synced.stdout.split("\n");
          expect(lines).toContain("function similar_text calls=1 strings=0 first=framework/src/Illuminate/Config/Repository.php:5");
          expect(lines).toContain("function soundex calls=1 strings=0 first=vendor:acme/option/src/Option.php:8");
          expect(lines).toContain("function levenshtein calls=1 strings=0 first=vendor:acme/option/helpers.php:3");
          // The exclude-from-classmap segment and a directory outside the autoload rules are not read.
          expect(synced.stdout).not.toContain("excluded_by_classmap");
          expect(synced.stdout).not.toContain("not_autoloaded");
          expect(lines.at(-2)).toEndWith("; 3 file(s) scanned.");
          // The vendor file's array_reduce, DIRECTORY_SEPARATOR and EmptyIterator, as the runtime lacking them would see them.
          const bare = renderReport(scanBuiltins(dir, "config", [])).split("\n");
          expect(bare).toContain("function array_reduce calls=1 strings=0 first=vendor:acme/option/src/Option.php:7");
          expect(bare).toContain("constant DIRECTORY_SEPARATOR uses=1 first=vendor:acme/option/src/Option.php:8");
          expect(bare).toContain("class EmptyIterator uses=1 first=vendor:acme/option/src/Option.php:9");
          expect(bare).toContain("class IteratorAggregate uses=1 first=vendor:acme/option/src/Option.php:5");

          // A verified cache scans without --sync, byte for byte the same.
          const again = await run(["config", "--root", dir]);
          expect(again.code).toBe(0);
          expect(again.stdout).toBe(synced.stdout);

          // A cached file edited after the sync fails the run without --sync, and is fetched again with it.
          makeWritable(cached);
          writeFileSync(join(cached, "src", "Option.php"), `${OPTION}\nextra();\n`);
          const tampered = await run(["config", "--root", dir]);
          expect(tampered.code).toBe(1);
          expect(tampered.stdout).toBe("");
          expect(tampered.stderr).toContain("acme/option");
          expect(tampered.stderr).toContain("modified");
          const refetched = await run(["config", "--root", dir, "--sync", "--remote", base]);
          expect(refetched.code).toBe(0);
          expect(refetched.stdout).toBe(synced.stdout);
          expect(readFileSync(join(cached, "src", "Option.php"), "utf8")).toBe(OPTION);

          // A commit the remote cannot give fails, naming the package and the commit, and leaves nothing behind.
          const wrong = "0123456789abcdef0123456789abcdef01234567";
          writeTree(dir, { "conformance/oracle/locks/framework/composer.lock": lock(wrong) });
          const failed = await run(["config", "--root", dir, "--sync", "--remote", base]);
          expect(failed.code).toBe(1);
          expect(failed.stdout).toBe("");
          expect(failed.stderr).toStartWith("scan:builtins: ");
          expect(failed.stderr).toContain("acme/option");
          expect(failed.stderr).toContain(wrong);
          expect(existsSync(join(cache, `acme/option@${wrong}`))).toBe(false);
          expect(existsSync(join(cache, `acme/option@${wrong}.tree`))).toBe(false);
          expect(readdirSync(cache).filter((name) => name.startsWith("."))).toEqual([]);
          expect(readdirSync(join(cache, "acme")).sort()).toEqual([`option@${option}`, `option@${option}.tree`]);

          // A vendor package the lock does not name fails, naming the package and the lock.
          writeTree(dir, {
            "conformance/oracle/locks/framework/composer.lock": lock(option),
            "tools/scans/vendor-ports.jsonl": `${JSON.stringify({ component: "config", package: "acme/absent", source: "a test row" })}\n`,
          });
          const unlocked = await run(["config", "--root", dir, "--sync", "--remote", base]);
          expect(unlocked.code).toBe(1);
          expect(unlocked.stderr).toContain("acme/absent");
          expect(unlocked.stderr).toContain("conformance/oracle/locks/framework/composer.lock");

          // A vendor-only Component scans only its own package's autoload files; one with no source stays a usage error.
          const vendorOnly = await run(["http-foundation", "--root", dir, "--sync", "--remote", base]);
          expect(vendorOnly.stderr).toBe("");
          expect(vendorOnly.code).toBe(0);
          expect(vendorOnly.stdout).toContain("function metaphone calls=1 strings=0 first=vendor:symfony/http-foundation/Request.php:5\n");
          expect(vendorOnly.stdout).not.toContain("excluded_test");
          expect(vendorOnly.stdout).toEndWith("; 1 file(s) scanned.\n");
          expect((await run(["runtime", "--root", dir])).code).toBe(2);
        } finally {
          // The cache is read-only; the temporary root is removed after this.
          if (existsSync(cache)) {
            makeWritable(cache);
          }
        }
      });
    } finally {
      rmSync(remote, { recursive: true, force: true });
    }
  },
);

// ---------------------------------------------------------------------------
// XT-conformance-277

xaravelTest(
  "XT-conformance-277",
  "every row of tools/scans/vendor-ports.jsonl names a Component of the packages table and a package of the framework composer.lock, and the rows are sorted and unique (epic-15-retro-item-7)",
  () => {
    const table = readTable(join(root, "tools", "scaffold", "packages.jsonl"));
    const rows = readVendorPorts(root, table);
    expect(rows.length).toBeGreaterThan(0);
    const components = new Set(table.map((row) => row.name));
    const packages = readLock(root, "conformance/oracle/locks/framework/composer.lock");
    for (const row of rows) {
      expect(components.has(row.component)).toBe(true);
      expect(packages.has(row.package)).toBe(true);
      expect(lockedPackage(root, "conformance/oracle/locks/framework/composer.lock", row.package, packages).commit).toMatch(/^[0-9a-f]{40}$/);
    }
    const keys = rows.map((row) => `${row.component}\u0000${row.package}`);
    expect(keys).toEqual([...new Set(keys)].sort());
  },
);
