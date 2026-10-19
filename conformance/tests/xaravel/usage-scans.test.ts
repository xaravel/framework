// Xaravel Tests for Story 3.7 (Upstream scans: closure identifiers, DIV-12
// pairs and test-API usage). These run under plain `bun test` until the
// harness lands in Epic 5. Each scan runs against a mini snapshot written into
// a temporary root; the parts that read the real snapshot run only when
// `conformance/upstream/` has been synced (it is gitignored).
import { expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { renderJson } from "../../../tools/oracle/request";
import { activePhases, CODEOWNERS_PATH, isProtected, LIST_PATH, MAINTAINER, matches, parseList, renderCodeowners } from "../../../tools/protected-paths/protected-paths";
import { ALLOWED_IDENTIFIERS_COMMENT, ALLOWED_IDENTIFIERS_FILE, buildClosures, main as closuresMain } from "../../../tools/scans/closures";
import { buildDiv12, classifier, DIV12_FILE, main as div12Main } from "../../../tools/scans/div12";
import { buildIndex } from "../../../tools/scans/php";
import { ASSERTIONS_FILE, buildTestApi, inventoryExecutions, main as testApiMain, MOCKERY_FILE } from "../../../tools/scans/test-api";
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

/** A temporary root holding `conformance/upstream/<files>` (an empty `src/` for every repository) and `extra` at the root. */
function withSnapshot(files: Record<string, string>, body: (dir: string) => void, extra: Record<string, string> = {}): void {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-usage-scans-test-"));
  try {
    for (const repo of ["framework", "ai", "mcp", "boost"]) {
      mkdirSync(join(dir, "conformance", "upstream", repo, "src"), { recursive: true });
    }
    writeTree(join(dir, "conformance", "upstream"), files);
    writeTree(dir, extra);
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs a scan's `main` with stdout and stderr captured. */
function run(main: (argv: readonly string[]) => number, argv: readonly string[]): { code: number; stdout: string; stderr: string } {
  const out: string[] = [];
  const err: string[] = [];
  const saved = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
  process.stdout.write = ((chunk: string) => out.push(chunk) > 0) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => err.push(chunk) > 0) as typeof process.stderr.write;
  try {
    const code = main(argv);
    return { code, stdout: out.join(""), stderr: err.join("") };
  } finally {
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
}

const php = (namespace: string | null, body: string, uses: readonly string[] = []): string =>
  `<?php\n\n${namespace === null ? "" : `namespace ${namespace};\n\n`}${uses.map((use) => `use ${use};\n`).join("")}${uses.length > 0 ? "\n" : ""}${body}\n`;

/** The outputs are Protected, and CODEOWNERS assigns them to the Maintainer (AD-16, as XT-conformance-85). */
function expectProtected(paths: readonly string[]): void {
  const entries = parseList(readFileSync(join(root, LIST_PATH), "utf8"));
  const phases = activePhases(root);
  const codeowners = readFileSync(join(root, CODEOWNERS_PATH), "utf8");
  expect(codeowners).toBe(renderCodeowners(entries, phases));
  for (const path of paths) {
    expect([path, existsSync(join(root, path))]).toEqual([path, true]);
    expect([path, isProtected(entries, phases, path)]).toEqual([path, true]);
    const owning = codeowners
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => line.split(/\s+/))
      .filter(([pattern]) => matches(pattern!, path))
      .at(-1);
    expect([path, owning?.[1]]).toEqual([path, MAINTAINER]);
  }
  expect(MAINTAINER).toBe("@edanisko");
}

// ---------------------------------------------------------------------------
// XT-conformance-86

const FACADES = "framework/src/Illuminate/Support/Facades";

const CLOSURE_SNAPSHOT: Record<string, string> = {
  [`${FACADES}/Facade.php`]: php("Illuminate\\Support\\Facades", "abstract class Facade\n{\n}"),
  [`${FACADES}/Cache.php`]: php("Illuminate\\Support\\Facades", "class Cache extends Facade\n{\n    protected static function getFacadeAccessor()\n    {\n        return 'cache';\n    }\n}"),
  // An abstract facade subclass is not a facade.
  [`${FACADES}/Manager.php`]: php("Illuminate\\Support\\Facades", "abstract class Manager extends Facade\n{\n}"),
  // A facade outside Support/Facades, through an import.
  "ai/src/Ai.php": php("Laravel\\Ai", "class Ai extends Facade\n{\n}", ["Illuminate\\Support\\Facades\\Facade"]),
  // A global helpers file: guarded functions, a by-reference function, closures, a class and an anonymous class.
  "framework/src/Illuminate/Support/helpers.php": php(
    null,
    [
      "use Illuminate\\Support\\Collection;",
      "",
      "if (! function_exists('collect')) {",
      "    function collect($value = [])",
      "    {",
      "        $f = function () { return fn () => 1; };",
      "        return new Collection($value);",
      "    }",
      "}",
      "",
      "if (! function_exists('str')) {",
      "    function &str($string = null)",
      "    {",
      "        return new class { public function anonymous() {} };",
      "    }",
      "}",
      "",
      "class HelperBag",
      "{",
      "    public function notAHelper()",
      "    {",
      "    }",
      "}",
      "",
      "function collect($again) {}",
    ].join("\n"),
  ),
  // A namespaced function is not a helper.
  "framework/src/Illuminate/Support/functions.php": php("Illuminate\\Support", "function bar()\n{\n}"),
};

xaravelTest("XT-conformance-86", "scan:closures writes allowed-identifiers.json with every facade short name and global helper name", () => {
  withSnapshot(CLOSURE_SNAPSHOT, (dir) => {
    const expected = ["{", `  "comment": ${JSON.stringify(ALLOWED_IDENTIFIERS_COMMENT)},`, '  "facades": [', '    "Ai",', '    "Cache"', "  ],", '  "helpers": [', '    "collect",', '    "str"', "  ]", "}", ""].join("\n");
    expect(buildClosures(dir).text).toBe(expected);

    const written = run(closuresMain, ["--root", dir]);
    expect([written.code, written.stderr]).toEqual([0, ""]);
    expect(written.stdout).toBe(`closures: 2 facades, 2 helpers; wrote ${ALLOWED_IDENTIFIERS_FILE}.\n`);
    expect(readFileSync(join(dir, ALLOWED_IDENTIFIERS_FILE), "utf8")).toBe(expected);
    expect(run(closuresMain, ["--root", dir, "--check"]).code).toBe(0);
    writeFileSync(join(dir, ALLOWED_IDENTIFIERS_FILE), expected.replace('"str"', '"strr"'));
    const drift = run(closuresMain, ["--root", dir, "--check"]);
    expect(drift.code).toBe(1);
    expect(drift.stderr.split("\n")[0]).toBe(`closures drift: ${ALLOWED_IDENTIFIERS_FILE} differs from the scan (first difference at line 9)`);
    expect(run(closuresMain, ["--root", dir, "--bogus"]).code).toBe(2);
  });

  // Two facades with one short name: nothing written, both FQCNs named.
  const duplicate = { ...CLOSURE_SNAPSHOT, "mcp/src/Facades/Cache.php": php("Laravel\\Mcp\\Facades", "class Cache extends \\Illuminate\\Support\\Facades\\Facade\n{\n}") };
  withSnapshot(duplicate, (dir) => {
    const failed = run(closuresMain, ["--root", dir]);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toBe("closures scan failed: two facades share the short name Cache: Illuminate\\Support\\Facades\\Cache and Laravel\\Mcp\\Facades\\Cache\n");
    expect(existsSync(join(dir, ALLOWED_IDENTIFIERS_FILE))).toBe(false);
  });

  if (REAL) {
    const result = buildClosures(root);
    expect(readFileSync(join(root, ALLOWED_IDENTIFIERS_FILE), "utf8")).toBe(result.text);
    for (const name of ["Cache", "Route", "Ai", "Mcp"]) {
      expect([name, result.facades.includes(name)]).toEqual([name, true]);
    }
    for (const name of ["app", "collect", "str"]) {
      expect([name, result.helpers.includes(name)]).toEqual([name, true]);
    }
    expect(result.facades.includes("Facade")).toBe(false);
  }
  expectProtected([ALLOWED_IDENTIFIERS_FILE]);
});

// ---------------------------------------------------------------------------
// XT-conformance-87

const ELOQUENT = "framework/src/Illuminate/Database/Eloquent";
const DEMO = "framework/src/Illuminate/Demo";

const DIV12_SNAPSHOT: Record<string, string> = {
  [`${ELOQUENT}/Model.php`]: php("Illuminate\\Database\\Eloquent", "abstract class Model\n{\n    use HasAttributes;\n\n    protected $connection;\n\n    public function connection()\n    {\n    }\n}", ["Illuminate\\Database\\Eloquent\\Concerns\\HasAttributes"]),
  // A Model trait: `casts` is an option pair (AD-7), any other pair model-config.
  [`${ELOQUENT}/Concerns/HasAttributes.php`]: php(
    "Illuminate\\Database\\Eloquent\\Concerns",
    "trait HasAttributes\n{\n    protected $casts = [];\n\n    protected $visible = [];\n\n    protected function casts()\n    {\n        return [];\n    }\n\n    public function visible()\n    {\n    }\n}",
  ),
  "framework/src/Illuminate/Foundation/Auth/User.php": php("Illuminate\\Foundation\\Auth", "class User extends Model\n{\n}", ["Illuminate\\Database\\Eloquent\\Model"]),
  // An own pair, and an interface (never listed).
  [`${DEMO}/Own.php`]: php("Illuminate\\Demo", "class Own implements Named\n{\n    public $name;\n\n    public function name()\n    {\n    }\n}"),
  [`${DEMO}/Named.php`]: php("Illuminate\\Demo", "interface Named\n{\n    public function name();\n}"),
  // A trait pair, and a class using it.
  [`${DEMO}/HasMode.php`]: php("Illuminate\\Demo", "trait HasMode\n{\n    protected $mode;\n\n    public function mode()\n    {\n    }\n}"),
  [`${DEMO}/WithTrait.php`]: php("Illuminate\\Demo", "class WithTrait\n{\n    use HasMode;\n}"),
  // An inherited pair: the property in the parent, the method in a trait of the child.
  [`${DEMO}/Base.php`]: php("Illuminate\\Demo", "class Base\n{\n    protected $label;\n}"),
  [`${DEMO}/Labels.php`]: php("Illuminate\\Demo", "trait Labels\n{\n    public function label()\n    {\n    }\n}"),
  [`${DEMO}/Child.php`]: php("Illuminate\\Demo", "class Child extends Base\n{\n    use Labels;\n}"),
  // A static pair, and a promoted constructor property.
  [`${DEMO}/Statics.php`]: php("Illuminate\\Demo", "class Statics\n{\n    protected static $resolver;\n\n    public static function resolver()\n    {\n    }\n}"),
  [`${DEMO}/Promoted.php`]: php("Illuminate\\Demo", "class Promoted\n{\n    public function __construct(protected string $driver, $plain = null)\n    {\n    }\n\n    public function driver()\n    {\n    }\n\n    public function plain()\n    {\n    }\n}"),
  // The option-holder interfaces: ShouldQueue, and an indexed interface extending it.
  "framework/src/Illuminate/Contracts/Queue/ShouldQueue.php": php("Illuminate\\Contracts\\Queue", "interface ShouldQueue\n{\n}"),
  "framework/src/Illuminate/Contracts/Queue/ShouldQueueAfterCommit.php": php("Illuminate\\Contracts\\Queue", "interface ShouldQueueAfterCommit extends ShouldQueue\n{\n}"),
  // An option holder: an AD-26 pair (`tries`), a `method_exists` option-name pair (`maxExceptions`), a `$this`-only
  // `method_exists` read (`retryAfter`, not an option name) and a plain pair (`queue`).
  [`${DEMO}/Job.php`]: php(
    "Illuminate\\Demo",
    "class Job implements ShouldQueue\n{\n    public $tries;\n\n    public $maxExceptions;\n\n    public $retryAfter;\n\n    public $queue;\n\n    public function tries()\n    {\n    }\n\n    public function maxExceptions()\n    {\n    }\n\n    public function retryAfter()\n    {\n    }\n\n    public function queue()\n    {\n    }\n}",
    ["Illuminate\\Contracts\\Queue\\ShouldQueue"],
  ),
  // An option holder through an interface extending ShouldQueue.
  [`${DEMO}/Listener.php`]: php("Illuminate\\Demo", "class Listener implements ShouldQueueAfterCommit\n{\n    public $timeout;\n\n    public function timeout()\n    {\n    }\n}", ["Illuminate\\Contracts\\Queue\\ShouldQueueAfterCommit"]),
  // The other option-holder routes, each with an AD-26 pair: `Queueable` (on a class and on a trait), a Mailable,
  // a Notification and a ShouldBroadcast implementer.
  "framework/src/Illuminate/Bus/Queueable.php": php("Illuminate\\Bus", "trait Queueable\n{\n}"),
  [`${DEMO}/QueueableJob.php`]: php("Illuminate\\Demo", "class QueueableJob\n{\n    use Queueable;\n\n    public $backoff;\n\n    public function backoff()\n    {\n    }\n}", ["Illuminate\\Bus\\Queueable"]),
  [`${DEMO}/QueuedTrait.php`]: php("Illuminate\\Demo", "trait QueuedTrait\n{\n    use Queueable;\n\n    public $uniqueFor;\n\n    public function uniqueFor()\n    {\n    }\n}", ["Illuminate\\Bus\\Queueable"]),
  "framework/src/Illuminate/Mail/Mailable.php": php("Illuminate\\Mail", "class Mailable\n{\n}"),
  [`${DEMO}/Welcome.php`]: php("Illuminate\\Demo", "class Welcome extends Mailable\n{\n    public $attachments;\n\n    public function attachments()\n    {\n    }\n}", ["Illuminate\\Mail\\Mailable"]),
  "framework/src/Illuminate/Notifications/Notification.php": php("Illuminate\\Notifications", "class Notification\n{\n}"),
  [`${DEMO}/Invoice.php`]: php("Illuminate\\Demo", "class Invoice extends Notification\n{\n    public $via;\n\n    public function via()\n    {\n    }\n}", ["Illuminate\\Notifications\\Notification"]),
  "framework/src/Illuminate/Contracts/Broadcasting/ShouldBroadcast.php": php("Illuminate\\Contracts\\Broadcasting", "interface ShouldBroadcast\n{\n}"),
  [`${DEMO}/Shipped.php`]: php("Illuminate\\Demo", "class Shipped implements ShouldBroadcast\n{\n    public $broadcastOn;\n\n    public function broadcastOn()\n    {\n    }\n}", ["Illuminate\\Contracts\\Broadcasting\\ShouldBroadcast"]),
  // The same names on a class that is not an option holder.
  [`${DEMO}/Plain.php`]: php("Illuminate\\Demo", "class Plain\n{\n    public $tries;\n\n    public $maxExceptions;\n\n    public function tries()\n    {\n    }\n\n    public function maxExceptions()\n    {\n    }\n}"),
  [`${DEMO}/Worker.php`]: php(
    "Illuminate\\Demo",
    [
      "class Worker",
      "{",
      "    public function maxExceptionsFor($job)",
      "    {",
      "        if (method_exists($job, 'maxExceptions')) {",
      "            return $job->maxExceptions();",
      "        }",
      "",
      "        return $job->maxExceptions;",
      "    }",
      "",
      "    public function retryAfter()",
      "    {",
      "        if (method_exists($this, 'retryAfter')) {",
      "            return $this->retryAfter;",
      "        }",
      "",
      "        $other->queue = 1;",
      "        return method_exists($job, 'queue');",
      "    }",
      "}",
    ].join("\n"),
  ),
};

const side = (declaredIn: string, isStatic: boolean): { declaredIn: string; static: boolean } => ({ declaredIn, static: isStatic });
const pairLine = (cls: string, name: string, classification: string, property: { declaredIn: string; static: boolean }, method: { declaredIn: string; static: boolean }): string =>
  renderJson({ class: cls, name, classification, property, method });

xaravelTest("XT-conformance-87", "scan:div12 writes div12-pairs.jsonl with every property/method name pair, classified", () => {
  withSnapshot(DIV12_SNAPSHOT, (dir) => {
    const D = "Illuminate\\Demo\\";
    const MODEL = "Illuminate\\Database\\Eloquent\\Model";
    const ATTRS = "Illuminate\\Database\\Eloquent\\Concerns\\HasAttributes";
    const USER = "Illuminate\\Foundation\\Auth\\User";
    const own = (name: string, classification: string, cls: string): string => pairLine(`${D}${cls}`, name, classification, side(`${D}${cls}`, false), side(`${D}${cls}`, false));
    const expected = [
      pairLine(ATTRS, "casts", "option-pair", side(ATTRS, false), side(ATTRS, false)),
      pairLine(ATTRS, "visible", "model-config", side(ATTRS, false), side(ATTRS, false)),
      pairLine(MODEL, "casts", "option-pair", side(ATTRS, false), side(ATTRS, false)),
      pairLine(MODEL, "connection", "model-config", side(MODEL, false), side(MODEL, false)),
      pairLine(MODEL, "visible", "model-config", side(ATTRS, false), side(ATTRS, false)),
      pairLine(`${D}Child`, "label", "method-plus-state", side(`${D}Base`, false), side(`${D}Labels`, false)),
      own("mode", "method-plus-state", "HasMode"),
      own("via", "option-pair", "Invoice"),
      own("maxExceptions", "option-pair", "Job"),
      own("queue", "method-plus-state", "Job"),
      own("retryAfter", "method-plus-state", "Job"),
      own("tries", "option-pair", "Job"),
      own("timeout", "option-pair", "Listener"),
      own("name", "method-plus-state", "Own"),
      own("maxExceptions", "method-plus-state", "Plain"),
      own("tries", "method-plus-state", "Plain"),
      own("driver", "method-plus-state", "Promoted"),
      own("backoff", "option-pair", "QueueableJob"),
      own("uniqueFor", "option-pair", "QueuedTrait"),
      own("broadcastOn", "option-pair", "Shipped"),
      pairLine(`${D}Statics`, "resolver", "method-plus-state", side(`${D}Statics`, true), side(`${D}Statics`, true)),
      own("attachments", "option-pair", "Welcome"),
      pairLine(`${D}WithTrait`, "mode", "method-plus-state", side(`${D}HasMode`, false), side(`${D}HasMode`, false)),
      pairLine(USER, "casts", "option-pair", side(ATTRS, false), side(ATTRS, false)),
      pairLine(USER, "connection", "model-config", side(MODEL, false), side(MODEL, false)),
      pairLine(USER, "visible", "model-config", side(ATTRS, false), side(ATTRS, false)),
    ]
      .map((line) => `${line}\n`)
      .join("");
    const first = buildDiv12(dir).text;
    expect(first).toBe(expected);
    expect(buildDiv12(dir).text).toBe(first);

    const written = run(div12Main, ["--root", dir]);
    expect([written.code, written.stderr]).toEqual([0, ""]);
    expect(written.stdout).toBe(`div12: 26 pairs (11 option-pair, 5 model-config, 10 method-plus-state); wrote ${DIV12_FILE}.\n`);
    const bytes = readFileSync(join(dir, DIV12_FILE));
    expect(run(div12Main, ["--root", dir]).code).toBe(0);
    expect(readFileSync(join(dir, DIV12_FILE)).equals(bytes)).toBe(true);
    expect(run(div12Main, ["--root", dir, "--check"]).code).toBe(0);
    rmSync(join(dir, DIV12_FILE));
    const missing = run(div12Main, ["--root", dir, "--check"]);
    expect(missing.code).toBe(1);
    expect(missing.stderr.split("\n")[0]).toBe(`div12 drift: ${DIV12_FILE} is missing`);
    expect(existsSync(join(dir, DIV12_FILE))).toBe(false);
  });

  if (REAL) {
    const { text, pairs } = buildDiv12(root);
    expect(readFileSync(join(root, DIV12_FILE), "utf8")).toBe(text);
    expect(buildDiv12(root).text).toBe(text);
    const classifications = new Set(pairs.map((pair) => pair.classification));
    expect([...classifications].sort()).toEqual(["method-plus-state", "model-config", "option-pair"]);
    // The spine's anchors (AD-7, AD-26, ESC-3.7-1). `Model` has no `connection()` method at the Pin, so that
    // anchor is checked through the classification rule rather than a listed pair.
    const find = (cls: string, name: string): string | undefined => pairs.find((pair) => pair.class === cls && pair.name === name)?.classification;
    expect(find("Illuminate\\Database\\Eloquent\\Model", "casts")).toBe("option-pair");
    expect(find("Illuminate\\Database\\Query\\Builder", "timeout")).toBe("method-plus-state");
    const index = buildIndex(root);
    const classify = classifier(index);
    expect(classify(index.byFqcn.get("Illuminate\\Database\\Eloquent\\Model")!, "connection")).toBe("model-config");
    for (const pair of pairs.filter((p) => p.class === "Illuminate\\Database\\Eloquent\\Model")) {
      expect([pair.name, pair.classification]).toEqual([pair.name, pair.name === "casts" ? "option-pair" : "model-config"]);
    }
  }
  expectProtected([DIV12_FILE]);
});

// ---------------------------------------------------------------------------
// XT-conformance-88

const TEST_API_SNAPSHOT: Record<string, string> = {
  "framework/src/Illuminate/Foundation/Testing/Concerns/InteractsWithDatabase.php": php("Illuminate\\Foundation\\Testing\\Concerns", "trait InteractsWithDatabase\n{\n    protected function assertDatabaseHas($table, array $data = [])\n    {\n    }\n}"),
  // An unrelated `src/` class declaring `assertCount`: it does not exclude the suites' calls.
  "framework/src/Illuminate/Support/Bag.php": php("Illuminate\\Support", "class Bag\n{\n    public function assertCount($n)\n    {\n    }\n}"),
  // An indexed `PHPUnit\Framework\Assert` subclass.
  "framework/src/Illuminate/Testing/Assert.php": php("Illuminate\\Testing", "abstract class Assert extends PHPUnit\n{\n}", ["PHPUnit\\Framework\\Assert as PHPUnit"]),
  [`${FACADES}/Facade.php`]: php("Illuminate\\Support\\Facades", "abstract class Facade\n{\n}"),
  [`${FACADES}/File.php`]: php("Illuminate\\Support\\Facades", "class File extends Facade\n{\n}"),
  // The suite's base class: it declares `assertFoo` and uses the trait declaring `assertDatabaseHas`.
  "framework/tests/Support/TestCase.php": php(
    "Illuminate\\Tests\\Support",
    "abstract class TestCase extends BaseTestCase\n{\n    use InteractsWithDatabase;\n\n    protected function assertFoo($x)\n    {\n        $this->assertTrue($x);\n    }\n}",
    ["Illuminate\\Foundation\\Testing\\Concerns\\InteractsWithDatabase", "PHPUnit\\Framework\\TestCase as BaseTestCase"],
  ),
  "framework/tests/Support/SupportTest.php": php(
    "Illuminate\\Tests\\Support",
    [
      "class SupportTest extends TestCase",
      "{",
      "    public function testThings()",
      "    {",
      "        $this->assertSame(1, 1);",
      "        self::assertTrue(true);",
      "        static::assertNull(null);",
      "        $this->assertequals(1, 1);",
      "        parent::assertEquals(1, 1);",
      "        PHPUnit::assertArraySubset([], []);",
      "        Assert::assertArraySubset([], []);",
      "        $this->assertCount(0, []);",
      "        $this->assertDatabaseHas('users', []);",
      "        $this->assertFoo(1);",
      "        $this->assertFileContains('x');",
      "        $this->expectException(\\RuntimeException::class);",
      "        $this->fail('x');",
      "        $this->markTestSkipped('x');",
      "        // $this->assertCommented(1);",
      "        $mock = m::mock(Foo::class);",
      "        $mock->shouldReceive('bar')->with(m::on(function ($x) {",
      "            return $x->shouldReceive('inner')->once();",
      "        }))->andReturnUsing(fn () => 1)->once();",
      "        Mockery::mock(Foo::class)->foo();",
      "        $mock->expects('x')->once();",
      "        $builder->expects($this->once())->method('x');",
      "        $spy->shouldHaveReceived()->foo()->once();",
      "        $mock->allows()->foo()->andReturn(1)->andreturn(2);",
      "        File::shouldReceive('x')->once();",
      "        Mockery::close();",
      "    }",
      "}",
    ].join("\n"),
    ["Illuminate\\Support\\Facades\\File", "Illuminate\\Testing\\Assert", "Mockery", "Mockery as m", "PHPUnit\\Framework\\Assert as PHPUnit"],
  ),
  // `m` aliasing another class, and an unimported `Mockery`: not Mockery.
  "framework/tests/Other/OtherTest.php": php("Illuminate\\Tests\\Other", "class OtherTest extends TestCase\n{\n    public function testIt()\n    {\n        m::create()->shouldIgnoreMissing;\n        Mockery::mock();\n    }\n}", ["Illuminate\\Support\\Factory as m", "PHPUnit\\Framework\\TestCase"]),
  // A Blade file is not a suite file.
  "framework/tests/View/fixtures/view.blade.php": "<?php $this->assertBlade(1); ?>\n",
};

const INVENTORY = {
  "conformance/inventory/support.jsonl": [
    renderJson({ id: "A::testOne", assertions: { assertSame: 2, assertNotTrue: 1, assertEquals: 3 } }),
    renderJson({ id: "A::testTwo", assertions: null }),
    renderJson({ id: "A::testThree", assertions: {} }),
  ]
    .map((line) => `${line}\n`)
    .join(""),
  "conformance/inventory/oracle-nondeterminism.jsonl": `${renderJson({ id: "A::testOne", assertions: { assertIgnored: 5 } })}\n`,
};

xaravelTest("XT-conformance-88", "scan:test-api writes the PHPUnit assertion and Mockery method usage of the Upstream suites", () => {
  withSnapshot(
    TEST_API_SNAPSHOT,
    (dir) => {
      const result = buildTestApi(dir);
      const assertions = [
        { name: "assertArraySubset", calls: 2, executions: 0 },
        { name: "assertCount", calls: 1, executions: 0 },
        { name: "assertEquals", calls: 2, executions: 3 },
        { name: "assertFileContains", calls: 1, executions: 0 },
        { name: "assertNotTrue", calls: 0, executions: 1 },
        { name: "assertNull", calls: 1, executions: 0 },
        { name: "assertSame", calls: 1, executions: 2 },
        { name: "assertTrue", calls: 2, executions: 0 },
        { name: "expectException", calls: 1, executions: 0 },
        { name: "fail", calls: 1, executions: 0 },
        { name: "markTestSkipped", calls: 1, executions: 0 },
      ];
      expect(result.files.get(ASSERTIONS_FILE)).toBe(assertions.map((line) => `${renderJson(line)}\n`).join(""));
      const mockery = [
        { name: "allows", static: false, count: 1 },
        { name: "andReturn", static: false, count: 2 },
        { name: "andReturnUsing", static: false, count: 1 },
        { name: "close", static: true, count: 1 },
        { name: "expects", static: false, count: 1 },
        { name: "mock", static: true, count: 2 },
        { name: "on", static: true, count: 1 },
        { name: "once", static: false, count: 5 },
        { name: "shouldHaveReceived", static: false, count: 1 },
        { name: "shouldReceive", static: false, count: 3 },
        { name: "with", static: false, count: 1 },
      ];
      expect(result.files.get(MOCKERY_FILE)).toBe(mockery.map((line) => `${renderJson(line)}\n`).join(""));

      const written = run(testApiMain, ["--root", dir]);
      expect([written.code, written.stderr]).toEqual([0, ""]);
      expect(written.stdout).toBe(
        [
          ...assertions.filter((line) => line.calls > 0 && line.executions === 0).map((line) => `test-api: never executed at the baseline, for review: ${line.name} (${line.calls} calls)`),
          `test-api: 11 assertions, 11 Mockery methods; wrote ${ASSERTIONS_FILE}, ${MOCKERY_FILE}.`,
          "",
        ].join("\n"),
      );
      expect(run(testApiMain, ["--root", dir, "--check"]).code).toBe(0);
      writeFileSync(join(dir, MOCKERY_FILE), "");
      const drift = run(testApiMain, ["--root", dir, "--check"]);
      expect(drift.code).toBe(1);
      expect(drift.stderr.split("\n")[0]).toBe(`test-api drift: ${MOCKERY_FILE} differs from the scan (first difference at line 1)`);
    },
    INVENTORY,
  );

  // Without an Inventory the run fails and writes nothing.
  withSnapshot(TEST_API_SNAPSHOT, (dir) => {
    const failed = run(testApiMain, ["--root", dir]);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toBe("test-api scan failed: conformance/inventory is missing; the assertion executions come from the committed Inventory\n");
    expect(existsSync(join(dir, ASSERTIONS_FILE))).toBe(false);
  });

  if (REAL) {
    const result = buildTestApi(root);
    expect(readFileSync(join(root, ASSERTIONS_FILE), "utf8")).toBe(result.files.get(ASSERTIONS_FILE)!);
    expect(readFileSync(join(root, MOCKERY_FILE), "utf8")).toBe(result.files.get(MOCKERY_FILE)!);
    const listed = new Set(result.assertions.map((line) => line.name));
    for (const kind of inventoryExecutions(root).keys()) {
      expect([kind, listed.has(kind)]).toEqual([kind, true]);
    }
    const byName = new Map(result.assertions.map((line) => [line.name, line]));
    expect(byName.get("assertCount")!.calls).toBeGreaterThanOrEqual(1000);
    expect(byName.has("fail")).toBe(true);
    const mocks = new Set(result.mockery.map((line) => `${line.name}:${line.static}`));
    for (const key of ["shouldReceive:false", "once:false", "andReturn:false", "mock:true"]) {
      expect([key, mocks.has(key)]).toEqual([key, true]);
    }
  }
  expectProtected([ASSERTIONS_FILE, MOCKERY_FILE]);
});
