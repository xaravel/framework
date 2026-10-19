// Xaravel Tests for Story 3.1 (Oracle request format and mechanical
// extraction, FR-6, AD-15, decisions/ESC-3.1-1.md). These run under plain
// `bun test` until the harness lands in Epic 5.
//
// The schema and hash tests need nothing. The extraction runs against a
// hermetic fixture root whose snapshot holds small Upstream-shaped test files
// for all five families; a fake `php` prints the fixture's raw lister lines
// and hands tokens.php to the real local PHP, which tokenises the fixture
// files for real (PHP code a tool runs needs a test that executes it). When
// `php` is not on PATH those tests are skipped and their name gives the
// reason; with XARAVEL_PHP_FIXTURES=require they fail instead. The committed
// requests are checked directly. This file never imports tools/oracle/oracle.ts
// directly or names its image runner (XT-conformance-44); tools/oracle/extract.ts
// does import it, so image mode here runs only through a stand-in runner.
import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { COMPONENT_MAP_FILE } from "../../../tools/component-map/component-map";
import { LISTER, readSuiteInventory, type ImageRunner, type RawTest } from "../../../tools/inventory/inventory";
import { BLADE_BASE } from "../../../tools/oracle/extract/blade";
import { checkClosedSet, extract, FAMILIES, TOKENS_SCRIPT } from "../../../tools/oracle/extract";
import { dateFamily } from "../../../tools/oracle/extract/date";
import { decodeLiteral, parseFile, parseTokenLines, renderSource, splitExport, type ExtractTest, type Token } from "../../../tools/oracle/extract/php";
import {
  canonicalJson,
  compareUnits,
  makeRequest,
  parseRequests,
  readSchema,
  renderRequest,
  renderRequests,
  REQUESTS_DIR,
  requestHash,
  SCHEMA_FILE,
  validateRequest,
  type InputByKind,
  type OracleRequest,
  type RequestKind,
} from "../../../tools/oracle/request";
import { Assert, xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "oracle", "extract.ts");
const schema = readSchema(root);
const REQUIRE = process.env["XARAVEL_PHP_FIXTURES"] === "require";
const PHP = Bun.which("php");
const TIMEOUT = 60_000;
/** The framework snapshot inside the Oracle image (docs/ops/oracle.md), written out because this file does not import tools/oracle/oracle.ts (XT-conformance-44). */
const IMAGE_FRAMEWORK = "/oracle/upstream/framework";
let warned = false;

/** A test that runs the real PHP tokenizer: skipped with the reason when `php` is absent, failed under XARAVEL_PHP_FIXTURES=require. */
function phpTest(id: string, consequence: string, body: () => Promise<void> | void): void {
  // bun test does not print skipped test names, so the reason also goes to stderr once.
  if (PHP === null && !REQUIRE && !warned) {
    warned = true;
    console.warn("oracle-extract.test.ts: skipping the extraction runs: php not on PATH");
  }
  xaravelTest(
    id,
    consequence,
    () => {
      if (PHP === null) {
        if (REQUIRE) {
          throw new Error("XARAVEL_PHP_FIXTURES=require: php not on PATH");
        }
        Assert.markTestSkipped("php not on PATH");
      }
      return body();
    },
    TIMEOUT,
  );
}

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const parsed = (request: OracleRequest): unknown => JSON.parse(renderRequest(request)) as unknown;

// ---------------------------------------------------------------------------
// XT-conformance-68

const SAMPLES: { [K in RequestKind]: InputByKind[K] } = {
  "php-expr": { bindings: { x: "'a'" }, setup: ["$y = 1;"], exprs: ["\\Illuminate\\Support\\Str::upper($x)"] },
  "sql-grammar": { grammar: "pgsql", setup: ["$builder = $this->getPostgresBuilder();"], exprs: ["$builder->toSql()"] },
  "blade-render": { template: "Hello {{ $name }}", data: { name: "Taylor" } },
  "validation-message": { lines: { "validation.required": "required!" }, data: { name: "" }, rules: { name: "Required" }, messages: {}, attributes: {}, format: ":message", exprs: ["$v->messages()->first('name')"] },
  "date-format": { now: "\\Illuminate\\Support\\Carbon::create(2017, 6, 27)", timezone: "UTC", setup: [], exprs: ["$this->now->toDateString()"] },
};

// Verifies: FR-6, AD-15 (the request schema: four keys in order, Test ID or XT ID, five kinds with typed inputs, sha256 of the canonical request)
xaravelTest("XT-conformance-68", "conformance/oracle/schema.json requires id (Test ID or XT ID), kind (the five), a typed input and the sha256 of the canonical request, and a wrong hash fails (FR-6, AD-15.4)", () => {
  expect(existsSync(join(root, SCHEMA_FILE))).toBe(true);
  // Each kind validates, keys in order, with exactly the kind's input keys.
  const ids = ["Illuminate\\Tests\\Support\\SupportStrTest::testUpper", "Illuminate\\Tests\\Support\\SupportStrTest::testPairs#data set \"one\"", "ai/tests/Feature/AgentTest.php::agents > it runs#dataset \"x\"", "XT-support-12"];
  for (const kind of Object.keys(SAMPLES) as RequestKind[]) {
    for (const id of ids) {
      const request = makeRequest(id, kind, SAMPLES[kind] as never);
      expect([kind, id, validateRequest(parsed(request), schema)]).toEqual([kind, id, []]);
      expect(Object.keys(parsed(request) as object)).toEqual(["id", "kind", "input", "sha256"]);
    }
  }
  const ok = makeRequest(ids[0]!, "php-expr", SAMPLES["php-expr"]);
  const line = renderRequest(ok);
  expect(line).toBe(`{"id":"Illuminate\\\\Tests\\\\Support\\\\SupportStrTest::testUpper","kind":"php-expr","input":{"bindings":{"x":"'a'"},"setup":["$y = 1;"],"exprs":["\\\\Illuminate\\\\Support\\\\Str::upper($x)"]},"sha256":"${ok.sha256}"}`);
  // The hash is over the canonical {id, kind, input}: keys sorted at every depth, no whitespace.
  expect(ok.sha256).toBe(sha256(`{"id":"Illuminate\\\\Tests\\\\Support\\\\SupportStrTest::testUpper","input":{"bindings":{"x":"'a'"},"exprs":["\\\\Illuminate\\\\Support\\\\Str::upper($x)"],"setup":["$y = 1;"]},"kind":"php-expr"}`));

  const errorsOf = (mutate: (value: Record<string, unknown>) => void, base: OracleRequest = ok): string[] => {
    const value = parsed(base) as Record<string, unknown>;
    mutate(value);
    return validateRequest(value, schema);
  };
  expect(errorsOf(() => {})).toEqual([]);
  // Missing and extra keys.
  for (const key of ["id", "kind", "input", "sha256"]) {
    expect(errorsOf((value) => delete value[key]).join("\n")).toContain(`missing "${key}"`);
  }
  expect(errorsOf((value) => (value["extra"] = 1)).join("\n")).toContain('unexpected key "extra"');
  // Bad id, kind and sha256.
  for (const id of ["", "no-separator", "Foo::", "XT-support-0", "XT-Support-1", "Foo::bar\nbaz"]) {
    expect([id, errorsOf((value) => (value["id"] = id)).length > 0]).toEqual([id, true]);
  }
  expect(errorsOf((value) => (value["kind"] = "php-snippet")).join("\n")).toContain("is not one of");
  expect(errorsOf((value) => (value["sha256"] = ok.sha256.toUpperCase())).join("\n")).toContain("does not match");
  expect(errorsOf((value) => (value["sha256"] = "0".repeat(64)))).toEqual([`$.sha256: expected ${ok.sha256}, the hash of the canonical request`]);
  // A changed id or input no longer matches its hash.
  expect(errorsOf((value) => (value["id"] = "XT-support-13"))).toEqual([`$.sha256: expected ${requestHash("XT-support-13", "php-expr", ok.input)}, the hash of the canonical request`]);
  // Malformed inputs, per kind.
  const malformed: [RequestKind, (input: Record<string, unknown>) => void, string][] = [
    ["php-expr", (input) => (input["setup"] = "$y = 1;"), "$.input.setup: expected array"],
    ["php-expr", (input) => (input["exprs"] = []), "$.input.exprs: fewer than 1 items"],
    ["php-expr", (input) => (input["bindings"] = { "1x": "'a'" }), 'key "1x"'],
    ["php-expr", (input) => (input["bindings"] = { x: 1 }), "$.input.bindings.x: expected string"],
    ["php-expr", (input) => (input["template"] = "x"), 'unexpected key "template"'],
    ["sql-grammar", (input) => (input["grammar"] = "oracle"), "$.input.grammar"],
    ["sql-grammar", (input) => delete input["grammar"], 'missing "grammar"'],
    ["blade-render", (input) => (input["data"] = []), "$.input.data: expected object"],
    ["blade-render", (input) => (input["template"] = null), "$.input.template: expected string"],
    ["validation-message", (input) => (input["format"] = 1), "$.input.format: expected string or null"],
    ["validation-message", (input) => delete input["attributes"], 'missing "attributes"'],
    ["date-format", (input) => (input["timezone"] = ""), "$.input.timezone: shorter than 1"],
    ["date-format", (input) => (input["exprs"] = [""]), "$.input.exprs[0]: shorter than 1"],
  ];
  for (const [kind, mutate, message] of malformed) {
    const request = makeRequest("XT-support-1", kind, SAMPLES[kind] as never);
    const errors = errorsOf((value) => mutate(value["input"] as Record<string, unknown>), request);
    expect([kind, message, errors.join("\n").includes(message)]).toEqual([kind, message, true]);
  }
  expect(errorsOf((value) => (value["input"] = "x")).join("\n")).toContain("$.input: expected object");
  // A lone UTF-16 surrogate in any string or key fails at its path, since PHP's json_decode rejects the line; a pair (an astral character) is valid.
  const surrogate = "holds a lone UTF-16 surrogate, which PHP's json_decode rejects";
  expect(validateRequest(parsed(makeRequest("XT-view-1", "blade-render", { template: "ü😀", data: { "😀": "ü😀" } })), schema)).toEqual([]);
  const highInString = makeRequest("XT-support-1", "php-expr", { bindings: {}, setup: [], exprs: ["'\ud800'"] });
  expect(validateRequest(parsed(highInString), schema)).toEqual([`$.input.exprs[0]: ${surrogate}`]);
  const lowInKey = makeRequest("XT-view-1", "blade-render", { template: "x", data: { "\udc00": 1 } });
  expect(validateRequest(parsed(lowInKey), schema)).toEqual([`$.input.data key "\\udc00": ${surrogate}`]);
  const reversed = makeRequest("XT-view-1", "blade-render", { template: "\udc00\ud800", data: {} });
  expect(validateRequest(parsed(reversed), schema)).toEqual([`$.input.template: ${surrogate}`]);
  expect(errorsOf((value) => (value["id"] = "XT-support-1#\ud800")).join("\n")).toContain(`$.id: ${surrogate}`);
  for (const request of [highInString, lowInKey, reversed]) {
    expect(() => parseRequests(`${renderRequest(request)}\n`, "f.jsonl", schema)).toThrow(`f.jsonl:1: $.input.`);
  }
  expect(() => parseRequests(`${renderRequest(highInString)}\n`, "f.jsonl", schema)).toThrow(`f.jsonl:1: $.input.exprs[0]: ${surrogate}`);

  // Canonical JSON: keys by UTF-16 code unit at every depth (integer-like keys too), `/` and non-ASCII unescaped.
  const value = JSON.parse('{"b":[{"z":1,"a":null}],"10":true,"9":"a/b","a":"ü😀","é":-1.5,"Z":"\\u0001\\n"}') as never;
  expect(canonicalJson(value)).toBe('{"10":true,"9":"a/b","Z":"\\u0001\\n","a":"ü😀","b":[{"a":null,"z":1}],"é":-1.5}');
  expect(requestHash("XT-support-1", "blade-render", { template: "a/ü", data: { "10": 1, "9": 2 } })).toBe(sha256('{"id":"XT-support-1","input":{"data":{"10":1,"9":2},"template":"a/ü"},"kind":"blade-render"}'));
  // A file's lines: the key order is part of the format.
  expect(() => parseRequests(`{"kind":"php-expr","id":"XT-support-1","input":{},"sha256":"${"0".repeat(64)}"}\n`, "f.jsonl", schema)).toThrow("f.jsonl:1: expected the keys id, kind, input, sha256 in that order");
  expect(parseRequests(`${line}\n`, "f.jsonl", schema)).toEqual([parsed(ok) as OracleRequest]);
  // A line that parses and validates but is not byte-identical to its rendering is rejected.
  const slashed = makeRequest("XT-view-2", "blade-render", { template: "a/b", data: {} });
  for (const variant of [line.replace('"kind":', '"kind": '), `${line}\r`, renderRequest(slashed).replace("a/b", "a\\/b"), line.replace('"kind":"php-expr"', '"kind":"php\\u002dexpr"')]) {
    expect(() => parseRequests(`${variant}\n`, "f.jsonl", schema)).toThrow("f.jsonl:1: the line is not in canonical form");
  }
  // A dataset name may hold a newline.
  expect(validateRequest(parsed(makeRequest("Foo\\BarTest::testX#line\nbreak", "php-expr", SAMPLES["php-expr"])), schema)).toEqual([]);

  // Files: identical requests once, sorted by id then sha256; one sha256 on two different lines fails.
  const ab = makeRequest("XT-view-1", "blade-render", { template: "x", data: { a: 1, b: 2 } });
  const ba = makeRequest("XT-view-1", "blade-render", { template: "x", data: { b: 2, a: 1 } });
  expect(ab.sha256).toBe(ba.sha256);
  expect(() => renderRequests([{ component: "view", request: ab }, { component: "view", request: ba }])).toThrow(`two different requests share sha256 ${ab.sha256}`);
  const other = makeRequest("XT-view-1", "blade-render", { template: "y", data: {} });
  const first = makeRequest("XT-view-0", "blade-render", { template: "z", data: {} });
  const [low, high] = [ab, other].sort((a, b) => compareUnits(a.sha256, b.sha256));
  expect(renderRequests([{ component: "view", request: other }, { component: "view", request: ab }, { component: "view", request: first }, { component: "view", request: ab }, { component: "support", request: ok }])).toEqual(
    new Map([
      ["support", `${line}\n`],
      ["view", [first, low!, high!].map((request) => `${renderRequest(request)}\n`).join("")],
    ]),
  );
});

// ---------------------------------------------------------------------------
// The extraction fixture

const STR = "Illuminate\\Tests\\Support\\SupportStrTest";
const CARBON = "Illuminate\\Tests\\Support\\SupportCarbonTest";
const ARR = "Illuminate\\Tests\\Support\\SupportArrTest";
const QUERY = "Illuminate\\Tests\\Database\\DatabaseQueryBuilderTest";
const MYSQL = "Illuminate\\Tests\\Database\\DatabaseMySqlSchemaGrammarTest";
const ECHO = "Illuminate\\Tests\\View\\Blade\\BladeEchoTest";
const BLADE = "Illuminate\\Tests\\Integration\\View\\BladeTest";
const VALIDATOR = "Illuminate\\Tests\\Validation\\ValidationValidatorTest";

/** The fixture snapshot: Upstream-shaped test files at the Differential paths, and one file outside the set. */
const FILES: Record<string, string> = {
  "phpunit.xml.dist": '<?xml version="1.0"?>\n<phpunit>\n    <php>\n        <ini name="date.timezone" value="UTC" />\n    </php>\n</phpunit>\n',
  "src/Illuminate/Support/Str.php": "<?php\n",
  "tests/Support/SupportStrTest.php": `<?php

namespace Illuminate\\Tests\\Support;

use Illuminate\\Support\\Str;
use Mockery as m;
use PHPUnit\\Framework\\Attributes\\DataProvider;
use PHPUnit\\Framework\\TestCase;

use function Illuminate\\Support\\{now, value as val};

class SupportStrTest extends TestCase
{
    protected $prefix = 'x';

    public function testUpper()
    {
        // A pure call.
        $this->assertSame('FOO', Str::upper('foo'));
        static::assertSame('BAR', Str::upper( /* kept */ 'bar'), 'message');
    }

    public function testInterleaved(): void
    {
        $value = Str::of('a');
        $this->assertSame('a', (string) $value);
        $value = $value->append($this->prefix, val(fn (Str|null $s) => $s));
        $this->assertSame('ax', (string) $value);
    }

    #[DataProvider('pairs')]
    public function testPairs($x, $y, $z = 'z')
    {
        $this->assertSame($y, Str::lower($x).$z);
    }

    public static function pairs(): array
    {
        return [];
    }

    public function testIf()
    {
        if (true) {
            $this->assertTrue(Str::isAscii('a'));
        }
    }

    public function testUnknownAssertion()
    {
        $this->assertFileExists(Str::upper('a'));
    }

    public function testNamedArgument()
    {
        $this->assertSame('a', Str::limit('a', limit: 1));
    }

    public function testExpectException()
    {
        $this->expectException(\\RuntimeException::class);
        $this->assertNull(Str::upper('a'));
    }

    public function testUndeclaredProperty()
    {
        $this->assertSame('a', $this->missing);
    }

    public function testUndefinedVariable()
    {
        $this->assertSame('a', Str::upper($nope));
    }

    public function testMockery()
    {
        $mock = m::mock(Str::class);
        $this->assertNull($mock);
    }

    public function testStaticOutsideHead()
    {
        $this->assertSame('a', Str::upper(static::class));
    }

    public function testMagicConstant()
    {
        $this->assertSame('a', Str::upper(__DIR__));
    }

    #[DataProvider('uuids')]
    public function testReversed($uuid, $passes)
    {
        $this->assertSame(Str::isUuid($uuid), $passes);
    }

    public function testUnset()
    {
        $value = Str::of('a');
        unset($value);
        $this->assertSame('a', (string) $value);
    }
}
`,
  "tests/Support/SupportCarbonTest.php": `<?php

namespace Illuminate\\Tests\\Support;

use Illuminate\\Support\\Carbon;
use PHPUnit\\Framework\\TestCase;

class SupportCarbonTest extends TestCase
{
    protected $now;

    protected function setUp(): void
    {
        Carbon::setTestNow($this->now = Carbon::create(2017, 6, 27, 13, 14, 15, 'UTC'));
    }

    public function testFormat()
    {
        $this->assertSame('2017-06-27', $this->now->toDateString());
    }

    public function testMacro()
    {
        Carbon::macro('twoDaysAgo', function () {
            return Carbon::now()->subDays(2);
        });

        $this->assertSame('2017-06-25', Carbon::twoDaysAgo()->toDateString());
    }
}
`,
  "tests/Support/SupportArrTest.php": `<?php

namespace Illuminate\\Tests\\Support;

use Illuminate\\Support\\Arr;
use PHPUnit\\Framework\\TestCase;

class SupportArrTest extends TestCase
{
    public function testGet()
    {
        $this->assertSame(1, Arr::get(['a' => 1], 'a'));
    }
}
`,
  "tests/Database/DatabaseQueryBuilderTest.php": `<?php

namespace Illuminate\\Tests\\Database;

use Illuminate\\Database\\Query\\Expression as Raw;
use PHPUnit\\Framework\\TestCase;

class DatabaseQueryBuilderTest extends TestCase
{
    public function testMultiGrammar()
    {
        $builder = $this->getMySqlBuilder();
        $builder->select('*')->from('users');
        $this->assertSame('select * from \`users\`', $builder->toSql());

        $builder = $this->getPostgresBuilder();
        $builder->select(new Raw('1'))->from('users');
        $this->assertSame('select 1 from "users"', $builder->toSql());
    }

    public function testNoGrammar()
    {
        $builder = $this->makeBuilder();
        $this->assertSame('x', $builder->toSql());
    }

    public function testMockExpectation()
    {
        $builder = $this->getBuilder();
        $builder->getConnection()->shouldReceive('select');
        $this->assertSame('x', $builder->toSql());
    }

    public function testReusedBuilder()
    {
        $builder = $this->getSQLiteBuilder();
        $builder->from('users');
        $this->assertSame('select * from "users"', $builder->toSql());
        $builder->where('id', 1);
        $this->assertSame('select * from "users" where "id" = ?', $builder->toSql());
    }

    public function testTwoHelpersInOneSegment()
    {
        $mysql = $this->getMySqlBuilder()->from('users');
        $pgsql = $this->getPostgresBuilder()->from('users');
        $this->assertSame('select * from \`users\`', $mysql->toSql());
        $this->assertSame('select * from "users"', $pgsql->toSql());
    }

    public function testMockQueryBuilderSegment()
    {
        $builder = $this->getMySqlBuilder();
        $this->assertSame('select *', $builder->toSql());
        $builder = $this->getMockQueryBuilder();
        $this->assertSame('select *', $builder->toSql());
    }

    protected function getBuilder()
    {
    }

    protected function getMySqlBuilder()
    {
    }

    protected function getPostgresBuilder()
    {
    }

    protected function getSQLiteBuilder()
    {
    }

    protected function getMockQueryBuilder()
    {
    }

    protected function makeBuilder()
    {
    }
}
`,
  "tests/Database/DatabaseMySqlSchemaGrammarTest.php": `<?php

namespace Illuminate\\Tests\\Database;

use Illuminate\\Database\\Schema\\Blueprint;
use PHPUnit\\Framework\\TestCase;

class DatabaseMySqlSchemaGrammarTest extends TestCase
{
    public function testAddingString()
    {
        $blueprint = new Blueprint($this->getConnection(), 'users');
        $blueprint->string('foo');
        $this->assertSame(['alter table \`users\` add \`foo\` varchar(255) not null'], $blueprint->toSql());
    }

    protected function getConnection()
    {
    }
}
`,
  "tests/View/Blade/BladeEchoTest.php": `<?php

namespace Illuminate\\Tests\\View\\Blade;

class BladeEchoTest extends AbstractBladeTestCase
{
    public function testEchos()
    {
        $string = '{{ $a }}';
        $this->assertSame('<?php echo e($a); ?>', $this->compiler->compileString($string));
        $this->assertSame('<?php echo e($a); ?>', $this->compiler->compileString('{{ $a }}'));
        $this->assertSame('x', $this->compiler->compileString(<<<'BLADE'
            @if($a)
                x
            @endif
            BLADE));
    }

    public function testInterpolated()
    {
        $this->assertSame('', $this->compiler->compileString("{{ {$this->name} }}"));
    }

    public function testCustomDirective()
    {
        $this->compiler->directive('x', fn () => '');
        $this->assertSame('', $this->compiler->compileString('@x'));
    }
}

namespace Other;

class Unrelated
{
}
`,
  "tests/View/Blade/BladeEchoHandlerTest.php": `<?php

namespace Illuminate\\Tests\\View\\Blade;

class BladeEchoHandlerTest extends AbstractBladeTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->compiler->stringable(function (Fluent $object) {
            return 'Hello World';
        });
    }

    public function testHandler()
    {
        $this->assertSame('<?php echo e($a); ?>', $this->compiler->compileString('{{ $a }}'));
    }
}
`,
  "tests/Integration/View/BladeTest.php": `<?php

namespace Illuminate\\Tests\\Integration\\View;

use Illuminate\\Support\\Facades\\Blade;
use Orchestra\\Testbench\\TestCase;

class BladeTest extends TestCase
{
    public function test_rendering_blade_string()
    {
        $this->assertSame('Hello Taylor', Blade::render('Hello {{ $name }}', ['name' => 'Taylor']));
    }

    public function test_computed_template()
    {
        $result = Blade::render(str_repeat('a', 2));
        $this->assertSame('aa', $result);
    }
}
`,
  "tests/Validation/ValidationValidatorTest.php": `<?php

namespace Illuminate\\Tests\\Validation;

use Illuminate\\Validation\\Validator;
use PHPUnit\\Framework\\TestCase;

class ValidationValidatorTest extends TestCase
{
    public function testMessages()
    {
        $trans = $this->getIlluminateArrayTranslator();
        $trans->addLines(['validation.required' => 'required!'], 'en');
        $v = new Validator($trans, ['name' => ''], ['name' => 'Required']);
        $this->assertFalse($v->passes());
        $v->messages()->setFormat(':message');

        $this->assertSame('required!', $v->messages()->first('name'));
    }

    public function testNoMessageAssertion()
    {
        $trans = $this->getIlluminateArrayTranslator();
        $v = new Validator($trans, [], []);
        $this->assertTrue($v->passes());
    }

    public function testOtherLocale()
    {
        $trans = $this->getIlluminateArrayTranslator();
        $trans->addLines(['validation.required' => 'requis'], 'fr');
        $v = new Validator($trans, ['name' => ''], ['name' => 'Required']);
        $this->assertSame('requis', $v->messages()->first('name'));
    }

    public function testTwoValidators()
    {
        $trans = $this->getIlluminateArrayTranslator();
        $v = new Validator($trans, ['name' => ''], ['name' => 'Required']);
        $this->assertSame('validation.required', $v->messages()->first('name'));
        $v = new Validator($trans, ['name' => 'x'], ['name' => 'Required']);
        $this->assertSame('', $v->messages()->first('name'));
    }

    public function testFormatThenPasses()
    {
        $trans = $this->getIlluminateArrayTranslator();
        $v = new Validator($trans, ['name' => ''], ['name' => 'Required']);
        $v->messages()->setFormat(':message');
        $this->assertFalse($v->passes());
        $this->assertSame('validation.required', $v->messages()->first('name'));
    }

    public function testCustomMessagesAndAttributes()
    {
        $trans = $this->getIlluminateArrayTranslator();
        $trans->addLines(['validation.required' => ':attribute is required!'], 'en');
        $trans->addLines(['validation.string' => ':attribute must be a string!', 'validation.required' => ':attribute is needed!'], 'en');
        $v = new Validator($trans, ['name' => '', 'nick' => 1], ['name' => 'required', 'nick' => 'string'], ['nick.string' => 'No.'], ['name' => 'Name']);
        $this->assertTrue($v->fails());
        $this->assertSame(['name' => ['Name is needed!'], 'nick' => ['No.']], $v->errors()->toArray());
    }

    public function getIlluminateArrayTranslator()
    {
    }
}
`,
};

const TOKENS_LINE = ["cfunction"];

function raw(cls: string, method: string, file: string, dataset: string | null = null, data: string | null = null): RawTest {
  return { id: `${cls}::${method}${dataset === null ? "" : `#${dataset}`}`, class: cls, method, dataset, file, source: { file, start: 1, end: 2 }, tokens: TOKENS_LINE, data, requiresDatabase: null, redis: false };
}

const STR_FILE = "tests/Support/SupportStrTest.php";
const RAWS: RawTest[] = [
  ...["testUpper", "testInterleaved"].map((method) => raw(STR, method, STR_FILE)),
  raw(STR, "testPairs", STR_FILE, 'data set "one"', "[0=>'A',1=>'az']"),
  raw(STR, "testPairs", STR_FILE, "two", "[0=>'B',1=>'bq',2=>'q']"),
  raw(STR, "testPairs", STR_FILE, "named", "['y'=>'cz','x'=>'C']"),
  raw(STR, "testPairs", STR_FILE, "object", "[0=>stdClass{},1=>'x']"),
  raw(STR, "testPairs", STR_FILE, "closure", "[0=>closure(f.php:1-2:[]),1=>'x']"),
  raw(STR, "testPairs", STR_FILE, "hex", "[0=>hex(ff),1=>'x']"),
  raw(STR, "testPairs", STR_FILE, "root", "[0=>'{root}/a',1=>'x']"),
  raw(STR, "testReversed", STR_FILE, "0", "[0=>'a',1=>false]"),
  raw(STR, "testUnset", STR_FILE),
  ...["testIf", "testUnknownAssertion", "testNamedArgument", "testExpectException", "testUndeclaredProperty", "testUndefinedVariable", "testMockery", "testStaticOutsideHead", "testMagicConstant"].map((method) => raw(STR, method, STR_FILE)),
  ...["testFormat", "testMacro"].map((method) => raw(CARBON, method, "tests/Support/SupportCarbonTest.php")),
  raw(ARR, "testGet", "tests/Support/SupportArrTest.php"),
  ...["testMultiGrammar", "testNoGrammar", "testMockExpectation", "testReusedBuilder", "testTwoHelpersInOneSegment", "testMockQueryBuilderSegment"].map((method) => raw(QUERY, method, "tests/Database/DatabaseQueryBuilderTest.php")),
  raw(MYSQL, "testAddingString", "tests/Database/DatabaseMySqlSchemaGrammarTest.php"),
  ...["testEchos", "testInterpolated", "testCustomDirective"].map((method) => raw(ECHO, method, "tests/View/Blade/BladeEchoTest.php")),
  raw("Illuminate\\Tests\\View\\Blade\\BladeEchoHandlerTest", "testHandler", "tests/View/Blade/BladeEchoHandlerTest.php"),
  ...["test_rendering_blade_string", "test_computed_template"].map((method) => raw(BLADE, method, "tests/Integration/View/BladeTest.php")),
  ...["testMessages", "testNoMessageAssertion", "testOtherLocale", "testTwoValidators", "testFormatThenPasses", "testCustomMessagesAndAttributes"].map((method) => raw(VALIDATOR, method, "tests/Validation/ValidationValidatorTest.php")),
];

/** Every other listed Differential file gets a stub class with one unreadable test, as the closed-set check needs. */
const STUBS: Record<string, string> = Object.fromEntries(
  FAMILIES.flatMap((family) => family.files)
    .filter((file) => !(file in FILES) && file !== BLADE_BASE)
    .map((file) => {
      const parts = file.replace(/\.php$/, "").split("/");
      const name = parts.pop()!;
      const namespace = ["Illuminate", "Tests", ...parts.slice(1)].join("\\");
      return [file, `<?php\n\nnamespace ${namespace};\n\nclass ${name}\n{\n    public function testStub()\n    {\n        if (true) {\n        }\n    }\n}\n`];
    }),
);
const STUB_RAWS: RawTest[] = Object.entries(STUBS).map(([file, text]) => raw(`${/namespace (.*);/.exec(text)![1]!}\\${file.split("/").pop()!.replace(/\.php$/, "")}`, "testStub", file));

const STR_UPPER = "\\Illuminate\\Support\\Str";
const CARBON_FQCN = "\\Illuminate\\Support\\Carbon";
const NOW = `${CARBON_FQCN}::create(2017, 6, 27, 13, 14, 15, 'UTC')`;
const MYSQL_SETUP = ["$builder = $this->getMySqlBuilder();", "$builder->select('*')->from('users');"];
const INTERLEAVED_SETUP = [`$value = ${STR_UPPER}::of('a');`];

/** The requests the fixture must give, per Component file (sorted within the file by the test). */
const EXPECTED: Record<string, OracleRequest[]> = {
  database: [
    makeRequest(`${QUERY}::testMultiGrammar`, "sql-grammar", { grammar: "mysql", setup: MYSQL_SETUP, exprs: ["$builder->toSql()"] }),
    makeRequest(`${QUERY}::testMultiGrammar`, "sql-grammar", {
      grammar: "pgsql",
      setup: [...MYSQL_SETUP, "$builder->toSql();", "$builder = $this->getPostgresBuilder();", "$builder->select(new \\Illuminate\\Database\\Query\\Expression('1'))->from('users');"],
      exprs: ["$builder->toSql()"],
    }),
    makeRequest(`${QUERY}::testReusedBuilder`, "sql-grammar", { grammar: "sqlite", setup: ["$builder = $this->getSQLiteBuilder();", "$builder->from('users');"], exprs: ["$builder->toSql()"] }),
    makeRequest(`${QUERY}::testReusedBuilder`, "sql-grammar", { grammar: "sqlite", setup: ["$builder = $this->getSQLiteBuilder();", "$builder->from('users');", "$builder->toSql();", "$builder->where('id', 1);"], exprs: ["$builder->toSql()"] }),
    makeRequest(`${QUERY}::testMockQueryBuilderSegment`, "sql-grammar", { grammar: "mysql", setup: ["$builder = $this->getMySqlBuilder();"], exprs: ["$builder->toSql()"] }),
    makeRequest(`${MYSQL}::testAddingString`, "sql-grammar", { grammar: "mysql", setup: ["$blueprint = new \\Illuminate\\Database\\Schema\\Blueprint($this->getConnection(), 'users');", "$blueprint->string('foo');"], exprs: ["$blueprint->toSql()"] }),
  ],
  support: [
    makeRequest(`${STR}::testUpper`, "php-expr", { bindings: {}, setup: [], exprs: [`${STR_UPPER}::upper('foo')`, `${STR_UPPER}::upper( /* kept */ 'bar')`] }),
    makeRequest(`${STR}::testInterleaved`, "php-expr", { bindings: {}, setup: INTERLEAVED_SETUP, exprs: ["(string) $value"] }),
    makeRequest(`${STR}::testInterleaved`, "php-expr", {
      bindings: {},
      setup: [...INTERLEAVED_SETUP, "(string) $value;", `$value = $value->append($this->prefix, \\Illuminate\\Support\\value(fn (${STR_UPPER}|null $s) => $s));`],
      exprs: ["(string) $value"],
    }),
    makeRequest(`${STR}::testPairs#data set "one"`, "php-expr", { bindings: { x: "'A'", y: "'az'", z: "'z'" }, setup: [], exprs: [`${STR_UPPER}::lower($x).$z`] }),
    makeRequest(`${STR}::testPairs#two`, "php-expr", { bindings: { x: "'B'", y: "'bq'", z: "'q'" }, setup: [], exprs: [`${STR_UPPER}::lower($x).$z`] }),
    makeRequest(`${STR}::testPairs#named`, "php-expr", { bindings: { x: "'C'", y: "'cz'", z: "'z'" }, setup: [], exprs: [`${STR_UPPER}::lower($x).$z`] }),
    makeRequest(`${CARBON}::testFormat`, "date-format", { now: NOW, timezone: "UTC", setup: [], exprs: ["$this->now->toDateString()"] }),
    makeRequest(`${CARBON}::testMacro`, "date-format", {
      now: NOW,
      timezone: "UTC",
      setup: [`${CARBON_FQCN}::macro('twoDaysAgo', function () {\n            return ${CARBON_FQCN}::now()->subDays(2);\n        });`],
      exprs: [`${CARBON_FQCN}::twoDaysAgo()->toDateString()`],
    }),
  ],
  validation: [
    makeRequest(`${VALIDATOR}::testMessages`, "validation-message", {
      lines: { "validation.required": "required!" },
      data: { name: "" },
      rules: { name: "Required" },
      messages: {},
      attributes: {},
      format: ":message",
      exprs: ["$v->messages()->first('name')"],
    }),
    makeRequest(`${VALIDATOR}::testCustomMessagesAndAttributes`, "validation-message", {
      lines: { "validation.required": ":attribute is needed!", "validation.string": ":attribute must be a string!" },
      data: { name: "", nick: 1 },
      rules: { name: "required", nick: "string" },
      messages: { "nick.string": "No." },
      attributes: { name: "Name" },
      format: null,
      exprs: ["$v->errors()->toArray()"],
    }),
  ],
  view: [
    makeRequest(`${ECHO}::testEchos`, "blade-render", { template: "{{ $a }}", data: {} }),
    makeRequest(`${ECHO}::testEchos`, "blade-render", { template: "@if($a)\n    x\n@endif", data: {} }),
    makeRequest(`${BLADE}::test_rendering_blade_string`, "blade-render", { template: "Hello {{ $name }}", data: { name: "Taylor" } }),
  ],
};

function expectedFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [component, requests] of Object.entries(EXPECTED)) {
    const sorted = [...requests].sort((a, b) => (a.id === b.id ? (a.sha256 < b.sha256 ? -1 : 1) : a.id < b.id ? -1 : 1));
    out[`${component}.jsonl`] = sorted.map((request) => `${renderRequest(request)}\n`).join("");
  }
  return out;
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

interface Fixture {
  dir: string;
  local: string;
  php: string;
  requests: () => Record<string, string>;
}

async function withFixture(body: (fx: Fixture) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-oracle-extract-"));
  try {
    for (const file of ["tools/scaffold/packages.jsonl", COMPONENT_MAP_FILE, LISTER, TOKENS_SCRIPT, SCHEMA_FILE]) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      copyFileSync(join(root, file), join(dir, file));
    }
    writeFiles(join(dir, "conformance", "upstream", "framework"), { ...FILES, ...STUBS });
    const local = join(dir, "local");
    writeFiles(local, { ...FILES, ...STUBS });
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "raw.jsonl"), [...RAWS, ...STUB_RAWS].map((entry) => `${JSON.stringify(entry)}\n`).join(""));
    // The lister's output is the fixture's; tokens.php runs on the real PHP.
    const php = join(bin, "php");
    writeFileSync(php, `#!/bin/sh\nhere="$(dirname "$0")"\ncase "$1" in\n  *lister.php) cat "$here/raw.jsonl" ;;\n  *) exec '${PHP ?? "php"}' "$@" ;;\nesac\n`);
    chmodSync(php, 0o755);
    await body({
      dir,
      local,
      php,
      requests: () => {
        const out: Record<string, string> = {};
        const requests = join(dir, REQUESTS_DIR);
        if (existsSync(requests)) {
          for (const name of readdirSync(requests).sort()) {
            out[name] = readFileSync(join(requests, name), "utf8");
          }
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

// ---------------------------------------------------------------------------
// XT-conformance-69

// Verifies: FR-6, AD-15 (the five family modules read the closed Differential set mechanically into sorted per-Component request files)
phpTest("XT-conformance-69", "bun run oracle:extract runs the five family modules over the Differential files and writes conformance/oracle/requests/<component>.jsonl, sorted, one request per readable Test ID x dataset (x segment, grammar or template), and none for an unreadable body (FR-6, AD-15.4)", async () => {
  await withFixture(async (fx) => {
    writeFiles(join(fx.dir, REQUESTS_DIR), { "routing.jsonl": "stale\n" });
    const run = await cli(["--root", fx.dir, "--local", fx.local, "--php", fx.php]);
    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    expect(run.stdout).toBe(
      [
        "database: 6 requests",
        "support: 8 requests",
        "validation: 2 requests",
        "view: 3 requests",
        "str: 6 requests from 5 Test IDs",
        "sql: 6 requests from 4 Test IDs",
        "blade: 3 requests from 2 Test IDs",
        "validation: 2 requests from 2 Test IDs",
        "date: 2 requests from 2 Test IDs",
        `removed ${REQUESTS_DIR}/routing.jsonl`,
        "Oracle requests: 19 requests in 4 files.",
        "",
      ].join("\n"),
    );
    const files = fx.requests();
    expect(files).toEqual(expectedFiles());
    for (const [name, text] of Object.entries(files)) {
      const requests = parseRequests(text, name, schema);
      const keys = requests.map((request) => [request.id, request.sha256].join("\n"));
      expect(keys).toEqual([...keys].sort(compareUnits));
    }
  });
});

// Verifies: FR-6 (the committed requests are valid, sorted, de-duplicated and name Inventory Test IDs of their own Component)
xaravelTest("XT-conformance-214", "every committed conformance/oracle/requests/<component>.jsonl line validates against the schema with its hash, is sorted by id then sha256, and names an Inventory Test ID of that Component (FR-6, AD-15.4)", () => {
  const dir = join(root, REQUESTS_DIR);
  const names = readdirSync(dir).sort();
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((name) => name.endsWith(".jsonl"))).toBe(true);
  const inventory = new Map(readSuiteInventory(root, "framework").map((entry) => [entry.id, entry.component]));
  const kinds = new Set<string>();
  for (const name of names) {
    const component = name.slice(0, -".jsonl".length);
    const text = readFileSync(join(dir, name), "utf8");
    const requests = parseRequests(text, `${REQUESTS_DIR}/${name}`, schema);
    expect(requests.length).toBeGreaterThan(0);
    const keys = requests.map((request) => `${request.id}\n${request.sha256}`);
    expect(keys).toEqual([...new Set(keys)].sort(compareUnits));
    expect(new Set(requests.map((request) => request.sha256)).size).toBe(requests.length);
    expect(requests.filter((request) => inventory.get(request.id) !== component).map((request) => request.id)).toEqual([]);
    requests.forEach((request) => kinds.add(request.kind));
  }
  expect([...kinds].sort()).toEqual(["blade-render", "date-format", "php-expr", "sql-grammar", "validation-message"]);
});

// Verifies: AD-15 (literal decoding and dataset rows: what is a literal, and what is not)
xaravelTest("XT-conformance-215", "PHP literals decode as PHP evaluates them, and dataset exports split into literal sources, refusing objects, closures, hex, resources, recursion and {root} rewrites (AD-15.4)", () => {
  const tokens = (source: string, list: [string, string][]): ReturnType<typeof parseTokenLines> => parseTokenLines(`${JSON.stringify({ file: source, tokens: list.map(([name, text]) => [name, text, 1]) })}\n`);
  const code = (list: [string, string][]) => tokens("x", list).get("x")!;
  expect(decodeLiteral(code([["T_CONSTANT_ENCAPSED_STRING", "'a\\'b\\\\c\\n'"], [".", "."], ["T_CONSTANT_ENCAPSED_STRING", '"\\t\\x41\\u{1F600}\\$"']]))).toBe("a'b\\c\\n\tA😀$");
  expect(decodeLiteral(code([["[", "["], ["T_CONSTANT_ENCAPSED_STRING", "'1'"], ["T_DOUBLE_ARROW", "=>"], ["T_LNUMBER", "0x10"], [",", ","], ["T_STRING", "NULL"], [",", ","], ["]", "]"]]))).toBeUndefined();
  expect(decodeLiteral(code([["[", "["], ["T_CONSTANT_ENCAPSED_STRING", "'0'"], ["T_DOUBLE_ARROW", "=>"], ["T_LNUMBER", "0x10"], [",", ","], ["T_STRING", "NULL"], [",", ","], ["]", "]"]]))).toEqual([16, null]);
  expect(decodeLiteral(code([["[", "["], ["T_CONSTANT_ENCAPSED_STRING", "'a'"], ["T_DOUBLE_ARROW", "=>"], ["T_DNUMBER", "1.5"], ["]", "]"]]))).toEqual({ a: 1.5 });
  // An integral float would decode back as an int; a constant is not a literal; a raw byte is not text.
  expect(decodeLiteral(code([["T_DNUMBER", "1.0"]]))).toBeUndefined();
  expect(decodeLiteral(code([["T_STRING", "PHP_EOL"]]))).toBeUndefined();
  expect(decodeLiteral(code([["T_CONSTANT_ENCAPSED_STRING", '"\\xff"']]))).toBeUndefined();
  expect(decodeLiteral(code([["T_START_HEREDOC", "<<<EOT\n"], ["T_ENCAPSED_AND_WHITESPACE", "    a \\\" \\t\n      b\n"], ["T_END_HEREDOC", "    EOT"]]))).toBe('a \\" \t\n  b');
  expect(decodeLiteral(code([["T_START_HEREDOC", "<<<EOT\n"], ["T_VARIABLE", "$a"], ["T_END_HEREDOC", "EOT"]]))).toBeUndefined();

  expect(splitExport("[0=>'a',1=>[0=>'b','k'=>NULL],2=>-1.5E+20,3=>true,4=>'' . \"\\0\" . 'x']")).toEqual([
    { key: 0, source: "'a'" },
    { key: 1, source: "[0=>'b','k'=>NULL]" },
    { key: 2, source: "-1.5E+20" },
    { key: 3, source: "true" },
    { key: 4, source: "'' . \"\\0\" . 'x'" },
  ]);
  expect(splitExport("['it\\'s'=>'a,b]']")).toEqual([{ key: "it's", source: "'a,b]'" }]);
  for (const bad of ["[0=>stdClass{}]", "[0=>closure(f:1-2:[])]", "[0=>hex(ff)]", "[0=>resource(stream)]", "[0=>*RECURSION*]", "[0=>App\\E::A]", "[0=>'{root}/x']", "[0=>Carbon\\Carbon(2017-01-01T00:00:00.000000+00:00 UTC)]", "'a'"]) {
    expect([bad, splitExport(bad)]).toEqual([bad, null]);
  }
});

// Verifies: AD-15 (the closed set moves with the snapshot, never silently)
xaravelTest("XT-conformance-216", "the run fails naming each listed Differential file that is missing from the snapshot or has no listed tests, and each tests/View/Blade/*Test.php file the Blade list lacks (AD-15.4)", () => {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-oracle-closed-"));
  try {
    const listed = ["tests/Support/SupportStrTest.php", "tests/Support/SupportCarbonTest.php", "tests/View/Blade/BladeEchoTest.php", BLADE_BASE];
    writeFiles(dir, { "tests/Support/SupportStrTest.php": "<?php\n", "tests/View/Blade/BladeEchoTest.php": "<?php\n", "tests/View/Blade/BladeNewTest.php": "<?php\n", "tests/View/Blade/Helper.php": "<?php\n" });
    const raws = [raw(STR, "testUpper", "tests/Support/SupportStrTest.php")];
    let message = "";
    try {
      checkClosedSet(dir, listed, raws);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(
      [
        "the Differential file set does not match the snapshot:",
        "  tests/Support/SupportCarbonTest.php is listed in a family module but is not in conformance/upstream/framework",
        "  tests/View/Blade/BladeEchoTest.php is listed in a family module but the lister lists no tests in it",
        "  tests/View/Blade/BladeNewTest.php is in conformance/upstream/framework but not in BLADE_FILES (tools/oracle/extract/blade.ts)",
      ].join("\n"),
    );
    expect(() => checkClosedSet(dir, ["tests/Support/SupportStrTest.php", BLADE_BASE], raws)).toThrow("BladeNewTest.php is in");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** The real PHP tokenizer over one source text. */
function tokenize(source: string): Token[] {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-oracle-tokens-"));
  try {
    writeFileSync(join(dir, "x.php"), source);
    const proc = Bun.spawnSync([PHP!, join(root, TOKENS_SCRIPT), dir, "x.php"], { stdout: "pipe", stderr: "pipe" });
    expect(proc.stderr.toString()).toBe("");
    return parseTokenLines(proc.stdout.toString()).get("x.php")!;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Verifies: AD-15 (catch types are resolved; an unreadable setUp clock or a missing date.timezone fails the run)
phpTest("XT-conformance-217", "class names in catch clauses resolve like other class names, and the date family fails on an unreadable setUp() setTestNow or a missing date.timezone instead of guessing (AD-15.4)", () => {
  const file = parseFile("x.php", tokenize("<?php\nnamespace App;\nuse Some\\Thing;\nclass T {\n  public function testA() {\n    $f = function () { try { x(); } catch (Thing | \\Other\\E $e) { } catch (Local) { } };\n  }\n}\n"));
  const body = file.classes[0]!.methods.get("testa")!.body!;
  expect(renderSource(file.classes[0]!.scope, body)).toBe("$f = function () { try { x(); } catch (\\Some\\Thing | \\Other\\E $e) { } catch (\\App\\Local) { } };");

  const carbon = (setUp: string): ExtractTest => {
    const parsedFile = parseFile("c.php", tokenize(`<?php\nnamespace App;\nuse Illuminate\\Support\\Carbon;\nclass C {\n  protected function setUp(): void { ${setUp} }\n  public function testA() { $this->assertSame('x', Carbon::now()->toDateString()); }\n}\n`));
    const cls = parsedFile.classes[0]!;
    return { id: "App\\C::testA", file: cls.scope, cls, method: cls.methods.get("testa")!, bindings: {}, ini: { "date.timezone": "UTC" } };
  };
  expect(dateFamily.extract(carbon("Carbon::setTestNow(Carbon::create(2017));")).map((input) => input.now)).toEqual(["\\Illuminate\\Support\\Carbon::create(2017)"]);
  expect(dateFamily.extract(carbon("parent::setUp();")).map((input) => input.now)).toEqual([null]);
  expect(() => dateFamily.extract(carbon("if (true) { Carbon::setTestNow(Carbon::create(2017)); }"))).toThrow("C::setUp() is not readable");
  expect(() => dateFamily.extract(carbon("$this->clock = Carbon::setTestNow(Carbon::create(2017));"))).toThrow("calls setTestNow in a form the date family cannot read");
  expect(() => dateFamily.extract({ ...carbon("Carbon::setTestNow(Carbon::create(2017));"), ini: {} })).toThrow("phpunit.xml.dist sets no date.timezone");
});

// ---------------------------------------------------------------------------
// XT-conformance-70

// Verifies: FR-6 (extraction is byte-stable on the same snapshot, and --check fails closed on drift)
phpTest("XT-conformance-70", "two extractions of the same snapshot give identical bytes, image mode gives the same bytes through read-only mounts, and --check passes, then reports each drifted file without writing (FR-6)", async () => {
  await withFixture(async (fx) => {
    const args = ["--root", fx.dir, "--local", fx.local, "--php", fx.php];
    expect((await cli(args)).code).toBe(0);
    const first = fx.requests();
    expect((await cli(args)).code).toBe(0);
    expect(fx.requests()).toEqual(first);
    expect(first).toEqual(expectedFiles());

    // Image mode: the lister and tokens.php run through the runner with read-only mounts; same bytes.
    const calls: { image: string; mounts: Parameters<ImageRunner>[1]; command: readonly string[] }[] = [];
    rmSync(join(fx.dir, REQUESTS_DIR), { recursive: true });
    extract(fx.dir, {
      image: "xaravel-oracle:test",
      runner: (image, mounts, command) => {
        calls.push({ image, mounts, command });
        if (command[1] === "/xaravel/lister.php") {
          return readFileSync(join(fx.dir, "bin", "raw.jsonl"), "utf8");
        }
        const [, script, dir, ...files] = command;
        expect([script, dir]).toEqual(["/xaravel/tokens.php", IMAGE_FRAMEWORK]);
        const proc = Bun.spawnSync([PHP!, join(fx.dir, TOKENS_SCRIPT), join(fx.dir, "conformance", "upstream", "framework"), ...files], { stdout: "pipe", stderr: "pipe" });
        expect(proc.exitCode).toBe(0);
        return proc.stdout.toString();
      },
    });
    expect(fx.requests()).toEqual(first);
    expect(calls.map((call) => [call.image, call.mounts, call.command.slice(0, 3)])).toEqual([
      ["xaravel-oracle:test", [{ host: join(fx.dir, LISTER), container: "/xaravel/lister.php" }], ["php", "/xaravel/lister.php", IMAGE_FRAMEWORK]],
      ["xaravel-oracle:test", [{ host: join(fx.dir, TOKENS_SCRIPT), container: "/xaravel/tokens.php" }], ["php", "/xaravel/tokens.php", IMAGE_FRAMEWORK]],
    ]);

    // --check passes on the generated files.
    const ok = await cli([...args, "--check"]);
    expect([ok.code, ok.stderr, ok.stdout]).toEqual([0, "", "Oracle requests check OK: 19 requests in 4 files are byte-identical.\n"]);

    // A changed byte, a missing file and a stray file are each reported; nothing is written.
    const support = join(fx.dir, REQUESTS_DIR, "support.jsonl");
    const lines = first["support.jsonl"]!.split("\n");
    lines[2] = lines[2]!.replace("php-expr", "php-exps");
    writeFileSync(support, lines.join("\n"));
    rmSync(join(fx.dir, REQUESTS_DIR, "view.jsonl"));
    writeFileSync(join(fx.dir, REQUESTS_DIR, "routing.jsonl"), "stale\n");
    const before = fx.requests();
    const drift = await cli([...args, "--check"]);
    expect(drift.code).toBe(1);
    expect(drift.stdout).toBe("");
    expect(drift.stderr).toBe(
      [
        `oracle requests drift: ${REQUESTS_DIR}/support.jsonl differs from the extracted requests (first difference at line 3)`,
        `oracle requests drift: ${REQUESTS_DIR}/view.jsonl is missing`,
        `oracle requests drift: ${REQUESTS_DIR}/routing.jsonl is not generated`,
        "Oracle requests check failed: 3 file(s) differ.",
        "",
      ].join("\n"),
    );
    expect(fx.requests()).toEqual(before);

    // A lister failure fails closed and writes nothing.
    rmSync(join(fx.dir, "bin", "raw.jsonl"));
    const failed = await cli(args);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("Oracle request extraction failed: the lister failed");
    expect(fx.requests()).toEqual(before);
  });
});

// Verifies: FR-6 (the CLI shape: strict flags, usage errors exit 2)
xaravelTest("XT-conformance-218", "oracle:extract rejects unknown, repeated or valueless flags, --php without --local and --image with --local with exit 2 and the usage (FR-6)", async () => {
  for (const args of [["generate"], ["--check", "--check"], ["--root"], ["--local", "--check"], ["--php", "php"], ["--image", "x", "--local", "y"], ["--suite", "framework"]]) {
    const result = await cli(args);
    expect([args, result.code, result.stdout]).toEqual([args, 2, ""]);
    expect(result.stderr).toContain("Usage:\n  bun tools/oracle/extract.ts [--check] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]");
  }
});
