// Xaravel Tests for Story 3.6 (Upstream scans: facades, singletons and
// boot-only state). These run under plain `bun test` until the harness lands
// in Epic 5. Each scan runs against a mini snapshot written into a temporary
// root; the parts that read the real snapshot run only when
// `conformance/upstream/` has been synced (it is gitignored).
import { expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { renderJson, type Json } from "../../../tools/oracle/request";
import { activePhases, CODEOWNERS_PATH, isProtected, LIST_PATH, MAINTAINER, matches, parseList, renderCodeowners } from "../../../tools/protected-paths/protected-paths";
import { buildFacades, FACADES_FILE, main as facadesMain, parseMethodTag } from "../../../tools/scans/facades";
import { tokenize } from "../../../tools/scans/php";
import { BOOT_ONLY_FILE, buildSingletons, main as singletonsMain, SINGLETONS_FILE } from "../../../tools/scans/singletons";
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

/** A temporary root holding `conformance/upstream/<files>`, with an empty `src/` for every repository. */
function withSnapshot(files: Record<string, string>, body: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-scans-test-"));
  try {
    for (const repo of ["framework", "ai", "mcp", "boost"]) {
      mkdirSync(join(dir, "conformance", "upstream", repo, "src"), { recursive: true });
    }
    writeTree(join(dir, "conformance", "upstream"), files);
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

const php = (namespace: string, body: string, uses: readonly string[] = []): string =>
  `<?php\n\nnamespace ${namespace};\n\n${uses.map((use) => `use ${use};\n`).join("")}${uses.length > 0 ? "\n" : ""}${body}\n`;

// ---------------------------------------------------------------------------
// XT-conformance-83

const FACADES = "framework/src/Illuminate/Support/Facades";

const FACADE_SNAPSHOT: Record<string, string> = {
  [`${FACADES}/Facade.php`]: php("Illuminate\\Support\\Facades", "abstract class Facade\n{\n    protected static function getFacadeAccessor()\n    {\n        throw new \\RuntimeException('Facade does not implement getFacadeAccessor method.');\n    }\n}"),
  [`${FACADES}/Cache.php`]: php(
    "Illuminate\\Support\\Facades",
    [
      "/**",
      " * @method static mixed get(string $key, mixed $default = null)",
      " * @method static bool put(string $key, mixed $value, int|null $ttl = null)",
      " *",
      " * @see https://laravel.com/docs/cache",
      " * @see \\Illuminate\\Support\\Testing\\Fakes\\CacheFake",
      " * @see \\Illuminate\\Cache\\CacheManager",
      " */",
      "class Cache extends Facade",
      "{",
      "    /**",
      "     * Get the registered name of the component.",
      "     */",
      "    protected static function getFacadeAccessor()",
      "    {",
      "        return 'cache';",
      "    }",
      "}",
    ].join("\n"),
  ),
  [`${FACADES}/Process.php`]: php(
    "Illuminate\\Support\\Facades",
    [
      "/**",
      " * @method static array<string, mixed> options(array $options)",
      " * @method static \\Illuminate\\Support\\Collection<int, string> lines()",
      " * @method \\Closure(int): void callback()",
      " * @method static static make(string $command = ')')",
      " * @method static array merge(array $items = ['a' => 1], string $glue = ',')",
      " *",
      " * @see \\Illuminate\\Process\\PendingProcess",
      " */",
      "#[\\Deprecated(message: 'not really')]",
      "class Process extends Facade",
      "{",
      "    protected static function getFacadeAccessor()",
      "    {",
      "        return Factory::class;",
      "    }",
      "",
      "    public static function fake($callback = null)",
      "    {",
      "        return \"{$callback}\";",
      "    }",
      "}",
    ].join("\n"),
    ["Closure", "Illuminate\\Process\\Factory"],
  ),
  // Not a facade: it does not extend Facade.
  [`${FACADES}/Helper.php`]: php("Illuminate\\Support\\Facades", "class Helper\n{\n}"),
  "framework/src/Illuminate/Support/Testing/Fakes/CacheFake.php": php("Illuminate\\Support\\Testing\\Fakes", "class CacheFake\n{\n}"),
  "framework/src/Illuminate/Cache/CacheManager.php": php("Illuminate\\Cache", "class CacheManager\n{\n}"),
  "framework/src/Illuminate/Process/Factory.php": php("Illuminate\\Process", "class Factory\n{\n}"),
  "framework/src/Illuminate/Process/PendingProcess.php": php("Illuminate\\Process", "class PendingProcess\n{\n}"),
};

const method = (name: string, isStatic: boolean, returns: string | null, parameters: string, signature: string): Record<string, Json> => ({ name, static: isStatic, returns, parameters, signature });

const FACADE_LINES = [
  renderJson({
    facade: "Illuminate\\Support\\Facades\\Cache",
    accessor: "cache",
    root: "Illuminate\\Cache\\CacheManager",
    methods: [
      method("get", true, "mixed", "string $key, mixed $default = null", "static mixed get(string $key, mixed $default = null)"),
      method("put", true, "bool", "string $key, mixed $value, int|null $ttl = null", "static bool put(string $key, mixed $value, int|null $ttl = null)"),
    ],
  }),
  renderJson({
    facade: "Illuminate\\Support\\Facades\\Process",
    accessor: "Illuminate\\Process\\Factory",
    root: "Illuminate\\Process\\Factory",
    methods: [
      method("options", true, "array<string, mixed>", "array $options", "static array<string, mixed> options(array $options)"),
      method("lines", true, "\\Illuminate\\Support\\Collection<int, string>", "", "static \\Illuminate\\Support\\Collection<int, string> lines()"),
      method("callback", false, "\\Closure(int): void", "", "\\Closure(int): void callback()"),
      // The quoted `)` in the default is skipped, and `=>` in an array default does not close a `<`.
      method("make", true, "static", "string $command = ')'", "static static make(string $command = ')')"),
      method("merge", true, "array", "array $items = ['a' => 1], string $glue = ','", "static array merge(array $items = ['a' => 1], string $glue = ',')"),
    ],
  }),
];

xaravelTest("XT-conformance-83", "scan:facades writes conformance/scans/facades.jsonl with each facade's accessor, root class and every @method signature, and fails closed on a bad accessor, a missing root or a bad @method (Story 3.6)", () => {
  // The lexer keeps a docblock as a token and records lines.
  const tokens = tokenize("<?php\n/** doc */\n#[A('x]')]\n$a?->b ??= <<<'EOT'\n  raw $x\n  EOT;\n", "x.php");
  expect(tokens.map((t) => [t.kind, t.text, t.line])).toEqual([
    ["docblock", "/** doc */", 2],
    ["attribute", "#[A('x]')]", 3],
    ["variable", "$a", 4],
    ["punct", "?->", 4],
    ["name", "b", 4],
    ["punct", "??=", 4],
    ["string", "<<<'EOT'\n  raw $x\n  EOT", 4],
    ["punct", ";", 6],
  ]);
  expect(tokens[6]!.value).toBe("raw $x");

  // @method parsing.
  expect(parseMethodTag("  static bool has(string $key)  ")).toEqual({ name: "has", static: true, returns: "bool", parameters: "string $key", signature: "static bool has(string $key)" });
  expect(parseMethodTag("void flush()")).toEqual({ name: "flush", static: false, returns: "void", parameters: "", signature: "void flush()" });
  expect(parseMethodTag("static flush()")).toEqual({ name: "flush", static: true, returns: null, parameters: "", signature: "static flush()" });
  expect(parseMethodTag("static bool")).toBeNull();
  expect(parseMethodTag("static bool has(string $key")).toBeNull();
  expect(parseMethodTag("static bool (string $key)")).toBeNull();

  withSnapshot(FACADE_SNAPSHOT, (dir) => {
    const expected = FACADE_LINES.map((line) => `${line}\n`).join("");
    expect(buildFacades(dir)).toBe(expected);
    const first = run(facadesMain, ["--root", dir]);
    expect(first.stderr).toBe("");
    expect(first.code).toBe(0);
    expect(first.stdout).toBe(`facades: 2 facades, 7 @method lines; wrote ${FACADES_FILE}.\n`);
    expect(readFileSync(join(dir, FACADES_FILE), "utf8")).toBe(expected);
    expect(run(facadesMain, ["--root", dir, "--check"]).code).toBe(0);

    // Drift: an edited file and a missing one.
    writeFileSync(join(dir, FACADES_FILE), expected.replace('"accessor":"cache"', '"accessor":"store"'));
    const drift = run(facadesMain, ["--root", dir, "--check"]);
    expect(drift.code).toBe(1);
    expect(drift.stderr.split("\n")[0]).toBe(`facades drift: ${FACADES_FILE} differs from the scan (first difference at line 1)`);
    rmSync(join(dir, FACADES_FILE));
    const missing = run(facadesMain, ["--check", "--root", dir]);
    expect(missing.code).toBe(1);
    expect(missing.stderr.split("\n")[0]).toBe(`facades drift: ${FACADES_FILE} is missing`);
    expect(existsSync(join(dir, FACADES_FILE))).toBe(false);

    // Usage errors exit 2.
    expect(run(facadesMain, ["--nope"]).code).toBe(2);
    expect(run(facadesMain, ["--root"]).code).toBe(2);
  });

  // Failures write nothing and name the place.
  const failures: [string, string, string][] = [
    [
      "Bad.php",
      php("Illuminate\\Support\\Facades", "/**\n * @see \\Illuminate\\Cache\\CacheManager\n */\nclass Bad extends Facade\n{\n    protected static function getFacadeAccessor()\n    {\n        return $x;\n    }\n}"),
      `conformance/upstream/${FACADES}/Bad.php:12: getFacadeAccessor() of Illuminate\\Support\\Facades\\Bad must return a string literal or X::class`,
    ],
    [
      "Orphan.php",
      php("Illuminate\\Support\\Facades", "/**\n * @see https://example.com\n * @see \\Illuminate\\Support\\Testing\\Fakes\\CacheFake\n */\nclass Orphan extends Facade\n{\n    protected static function getFacadeAccessor()\n    {\n        return 'orphan';\n    }\n}"),
      `conformance/upstream/${FACADES}/Orphan.php:9: facade Illuminate\\Support\\Facades\\Orphan has no root`,
    ],
    [
      "Broken.php",
      php("Illuminate\\Support\\Facades", "/**\n * @method static bool\n * @see \\Illuminate\\Cache\\CacheManager\n */\nclass Broken extends Facade\n{\n    protected static function getFacadeAccessor()\n    {\n        return 'cache';\n    }\n}"),
      `conformance/upstream/${FACADES}/Broken.php:6: @method line of Illuminate\\Support\\Facades\\Broken does not parse`,
    ],
  ];
  for (const [name, source, message] of failures) {
    withSnapshot({ ...FACADE_SNAPSHOT, [`${FACADES}/${name}`]: source }, (dir) => {
      const result = run(facadesMain, ["--root", dir]);
      expect([name, result.code]).toEqual([name, 1]);
      expect(result.stderr.startsWith(`facades scan failed: ${message}`)).toBe(true);
      expect(existsSync(join(dir, FACADES_FILE))).toBe(false);
    });
  }
});

xaravelTest("XT-conformance-248", "the committed conformance/scans/facades.jsonl is the scan of the snapshot, one line per facade (Story 3.6)", () => {
  if (!REAL) {
    console.warn("scans.test.ts: conformance/upstream is not synced; the real-snapshot check is skipped");
    return;
  }
  const text = buildFacades(root);
  expect(readFileSync(join(root, FACADES_FILE), "utf8")).toBe(text);
  const lines = text.split("\n").slice(0, -1);
  // 46 classes in Support/Facades extend Facade at the Pin (47 files with the base Facade).
  expect(lines.length).toBe(46);
  const process = JSON.parse(lines.find((line) => line.includes('"facade":"Illuminate\\\\Support\\\\Facades\\\\Process"'))!) as { accessor: string; root: string };
  expect([process.accessor, process.root]).toEqual(["Illuminate\\Process\\Factory", "Illuminate\\Process\\Factory"]);
  const date = JSON.parse(lines.find((line) => line.includes('"facade":"Illuminate\\\\Support\\\\Facades\\\\Date"'))!) as { root: string };
  expect(date.root).toBe("Illuminate\\Support\\DateFactory");
});

// ---------------------------------------------------------------------------
// XT-conformance-84

const PROVIDER = [
  "class WidgetServiceProvider extends BaseProvider",
  "{",
  "    public $singletons = [",
  "        StoreContract::class => DatabaseStore::class,",
  "        Contracts\\Hub::class,",
  "    ];",
  "",
  "    protected $commands = [",
  "        'Make' => Console\\MakeCommand::class,",
  "    ];",
  "",
  "    protected $devCommands = [",
  "        'Serve' => Console\\ServeCommand::class,",
  "    ];",
  "",
  "    public function register()",
  "    {",
  "        $this->app->singleton('widgets', function ($app) {",
  "            if ($app->bound('legacy')) {",
  "                return new WidgetManager($app);",
  "            }",
  "            $inner = function () {",
  "                return new \\stdClass;",
  "            };",
  "",
  "            return new WidgetManager($app, $inner);",
  "        });",
  "",
  "        $this->app->singleton('widgets.translator', function ($app) {",
  "            $translator = new Translator($app['locale']);",
  "            $translator->setFallback('en');",
  "",
  "            return $translator;",
  "        });",
  "",
  "        $this->app->singleton('widgets.cookie', function ($app) {",
  "            return (new CookieJar)->setDefaultPathAndDomain('/', null);",
  "        });",
  "",
  "        $this->app->singleton('widgets.jar', function ($app) {",
  "            return (new CookieJar)->queued();",
  "        });",
  "",
  "        $this->app->singleton('widgets.queue', function ($app) {",
  "            return tap(new QueueManager($app), function ($manager) {",
  "                $manager->addConnector('sync');",
  "            });",
  "        });",
  "",
  "        $this->app->singleton('widgets.typed', function ($app): Hub {",
  "            return $app->make('hub');",
  "        });",
  "",
  "        $this->app->singleton('widgets.twice', function ($app) {",
  "            $manager = new WidgetManager;",
  "            $manager = new WidgetManager($app);",
  "",
  "            return $manager;",
  "        });",
  "",
  "        $this->app->singleton(BaseRegistry::class);",
  "",
  "        $this->app->singleton(Registry::class);",
  "",
  "        $this->app->singleton(Contracts\\Clock::class);",
  "",
  "        $this->app->singleton(",
  "            Contracts\\Hub::class,",
  "            Hub::class",
  "        );",
  "",
  "        $this->app->singletonif('widgets.driver', fn ($app) => $app->make(Registry::class)->current());",
  "",
  "        $this->app->rebinding('request', function ($app, $request) {",
  "            $app->make(Registry::class)->setRequest($request);",
  "        });",
  "",
  "        $this->app->make(Registry::class)->addpath(__DIR__);",
  "",
  // Receivers that resolve to a bound class (Story 6.3): `app(K)->`, `$this->app[K]->`, `resolve(Y::class)->`,
  // `X::`, a facade line of conformance/scans/facades.jsonl, and a facade class in the snapshot.
  "        app('widgets.queue')->addRoute('jobs');",
  "        $this->app['widgets']->addDriver('array');",
  "        resolve(StoreContract::class)->put('x');",
  "        Hub::reset();",
  "        Jar::setSecure(true);",
  "        Widgets::setLocale('de');",
  // Receivers that resolve to no bound class seed nothing.
  "        $store->tag('a');",
  "        $app->make(StoreContract::class)->tag('b');",
  "        app('missing')->tag('c');",
  "        Missing::tag('d');",
  "        static::tag('e');",
  "        $this->app->make(Contracts\\Clock::class)->tag('f');",
  "        $this->other->make(StoreContract::class)->tag('g');",
  "",
  "        $this->registerCommands(array_merge(",
  "            $this->commands,",
  "            $this->devCommands",
  "        ));",
  "    }",
  "",
  "    protected function registerCommands(array $commands)",
  "    {",
  "        foreach ($commands as $name => $command) {",
  "            $this->app->singleton($command);",
  "        }",
  "    }",
  "",
  "    public function boot()",
  "    {",
  "        $this->app->make(Registry::class)->extend('x', fn () => null);",
  "        $this->registerGroups();",
  "    }",
  "",
  "    protected function registerGroups()",
  "    {",
  "        $this->app->make(Registry::class)->group(['prefix' => 'x']);",
  "        $this->app->make(Registry::class)->listen('booted');",
  "        $this->app->make(Registry::class)->watch();",
  "    }",
  "}",
].join("\n");

const SINGLETON_SNAPSHOT: Record<string, string> = {
  "framework/src/Illuminate/Support/ServiceProvider.php": php("Illuminate\\Support", "abstract class ServiceProvider\n{\n    protected $app;\n\n    public function __construct($app)\n    {\n        $this->app = $app;\n    }\n}"),
  "framework/src/Illuminate/Foundation/Support/Providers/BaseProvider.php": php("Illuminate\\Foundation\\Support\\Providers", "abstract class BaseProvider extends ServiceProvider\n{\n}", ["Illuminate\\Support\\ServiceProvider"]),
  "ai/src/WidgetServiceProvider.php": php("Laravel\\Ai", PROVIDER, ["Illuminate\\Foundation\\Support\\Providers\\BaseProvider", "Laravel\\Ai\\Contracts\\Store as StoreContract", "Laravel\\Ai\\Facades\\Jar", "Laravel\\Ai\\Facades\\Widgets"]),
  "framework/src/Illuminate/Support/Facades/Facade.php": php("Illuminate\\Support\\Facades", "abstract class Facade\n{\n}"),
  "ai/src/Facades/Widgets.php": php("Laravel\\Ai\\Facades", "class Widgets extends Facade\n{\n    protected static function getFacadeAccessor()\n    {\n        return 'widgets.translator';\n    }\n}", ["Illuminate\\Support\\Facades\\Facade"]),
  "ai/src/Contracts/Store.php": php("Laravel\\Ai\\Contracts", "interface Store\n{\n}"),
  "ai/src/Contracts/Hub.php": php("Laravel\\Ai\\Contracts", "interface Hub\n{\n}"),
  "ai/src/Contracts/Clock.php": php("Laravel\\Ai\\Contracts", "interface Clock\n{\n}"),
  "ai/src/DatabaseStore.php": php("Laravel\\Ai", "class DatabaseStore implements Contracts\\Store\n{\n    protected $items = [];\n\n    protected $tags = [];\n\n    public function put($key)\n    {\n        $this->items[] = $key;\n    }\n\n    public function tag($tag)\n    {\n        $this->tags[] = $tag;\n    }\n}"),
  "ai/src/Hub.php": php("Laravel\\Ai", "class Hub implements Contracts\\Hub\n{\n    protected static $resets = 0;\n\n    public static function reset()\n    {\n        static::$resets = 1;\n    }\n}"),
  "ai/src/WidgetManager.php": php("Laravel\\Ai", "class WidgetManager\n{\n    protected $drivers = [];\n\n    public function addDriver($driver)\n    {\n        $this->drivers[] = $driver;\n    }\n}"),
  "ai/src/Translator.php": php("Laravel\\Ai", "class Translator\n{\n    protected $fallback;\n\n    protected $locale;\n\n    public function setFallback($fallback)\n    {\n        $this->fallback = $fallback;\n    }\n\n    public function setLocale($locale)\n    {\n        $this->locale = $locale;\n    }\n}"),
  "ai/src/CookieJar.php": php(
    "Laravel\\Ai",
    [
      "class CookieJar",
      "{",
      "    protected $path;",
      "",
      "    protected $queued = [];",
      "",
      "    protected $secure = false;",
      "",
      "    public function setSecure($secure)",
      "    {",
      "        $this->secure = $secure;",
      "    }",
      "",
      "    public function setDefaultPathAndDomain($path, $domain)",
      "    {",
      "        $this->path = $path;",
      "",
      "        return $this;",
      "    }",
      "",
      "    public function queued()",
      "    {",
      "        return $this->queued;",
      "    }",
      "}",
    ].join("\n"),
  ),
  "ai/src/QueueManager.php": php("Laravel\\Ai", "class QueueManager\n{\n    protected $connectors = [];\n\n    protected $routes = [];\n\n    public function addConnector($name)\n    {\n        $this->connectors[] = $name;\n    }\n\n    public function addRoute($route)\n    {\n        $this->routes[] = $route;\n    }\n}"),
  "ai/src/Console/MakeCommand.php": php("Laravel\\Ai\\Console", "class MakeCommand\n{\n}"),
  "ai/src/Console/ServeCommand.php": php("Laravel\\Ai\\Console", "class ServeCommand\n{\n}"),
  "ai/src/Concerns/RegistersPaths.php": php(
    "Laravel\\Ai\\Concerns",
    [
      "trait RegistersPaths",
      "{",
      "    protected array $paths = [];",
      "",
      "    protected $resolved = [];",
      "",
      "    public function addPath(string $path): void",
      "    {",
      "        $this->paths[] = $this->normalize($path);",
      "        self::$count++;",
      "    }",
      "",
      "    public function resolve(string $name)",
      "    {",
      "        return $this->resolved[$name] ??= $name;",
      "    }",
      "}",
    ].join("\n"),
  ),
  "ai/src/BaseRegistry.php": php(
    "Laravel\\Ai",
    [
      "abstract class BaseRegistry",
      "{",
      "    use RegistersPaths;",
      "",
      "    protected static int $count = 0;",
      "",
      "    protected static int $instances = 0;",
      "",
      "    protected static $shared;",
      "",
      "    protected $normalized = 0;",
      "",
      "    protected function normalize(string $path): string",
      "    {",
      "        if ($path === '') {",
      "            return $this->normalize('/');",
      "        }",
      "",
      "        $this->normalized += 1;",
      "",
      "        return $path;",
      "    }",
      "}",
    ].join("\n"),
    ["Laravel\\Ai\\Concerns\\RegistersPaths"],
  ),
  "ai/src/Registry.php": php(
    "Laravel\\Ai",
    [
      "class Registry extends BaseRegistry",
      "{",
      "    protected $extensions = [];",
      "",
      "    protected $booted;",
      "",
      "    protected $counter = 0;",
      "",
      "    protected $defaults;",
      "",
      "    protected $request;",
      "",
      "    protected $stack = [];",
      "",
      "    protected $first;",
      "",
      "    protected $depth = 0;",
      "",
      "    protected $listeners = [];",
      "",
      "    protected $fired;",
      "",
      "    protected $mode;",
      "",
      "    protected $ref;",
      "",
      "    protected $listed;",
      "",
      "    protected $sorted = [];",
      "",
      "    protected $anon;",
      "",
      "    public function __construct()",
      "    {",
      "        $this->booted = false;",
      "        $this->counter = 1;",
      "        $this->configure();",
      "    }",
      "",
      "    protected function configure()",
      "    {",
      "        $this->defaults = ['x' => 1];",
      "    }",
      "",
      "    public function extend(string $name, \\Closure $callback)",
      "    {",
      "        $this->extensions[$name] = $callback;",
      "        $this->counter++;",
      "",
      "        return $this;",
      "    }",
      "",
      "    public function driver()",
      "    {",
      "        unset($this->counter);",
      "",
      "        return $this->resolve('default');",
      "    }",
      "",
      "    public function setRequest($request)",
      "    {",
      "        $this->request = $request;",
      "",
      "        return $this;",
      "    }",
      "",
      "    public function group(array $attributes)",
      "    {",
      "        $this->stack[] = $attributes;",
      "        [$this->first] = [$attributes];",
      "        $this->depth = 0;",
      "        static::$instances = 1;",
      "        static::$shared = 1;",
      "        $this->ref = null;",
      "        $this->listed = null;",
      "        $this->sorted = [];",
      "        $this->anon = 0;",
      "    }",
      "",
      "    public function pop()",
      "    {",
      "        array_pop($this->stack);",
      "        ++$this->depth;",
      "        BaseRegistry::$instances += 1;",
      "        parent::$shared = 2;",
      "        $alias = &$this->ref;",
      "        list($this->listed) = [1];",
      "        sort($this->sorted);",
      "    }",
      "",
      "    public function listen(string $event)",
      "    {",
      "        $this->listeners[] = function () use ($event) {",
      "            $this->fired = $event;",
      "        };",
      "",
      "        return new class {",
      "            public function run()",
      "            {",
      "                $this->anon = 1;",
      "            }",
      "        };",
      "    }",
      "",
      "    public function watch()",
      "    {",
      "        $run = function () {",
      "            $this->setMode('live');",
      "        };",
      "",
      "        $run();",
      "    }",
      "",
      "    public function setMode($mode)",
      "    {",
      "        $this->mode = $mode;",
      "    }",
      "}",
    ].join("\n"),
  ),
};

const binding = (abstract: string, cls: string | null): string => renderJson({ provider: "Laravel\\Ai\\WidgetServiceProvider", abstract, class: cls });

const SINGLETONS_JSON = [
  "{",
  '  "comment": "Generated by `bun run scan:singletons` (tools/scans/singletons.ts) from conformance/upstream at the Baseline Pin. Do not edit by hand: every class an Upstream provider binds with singleton() (Story 3.6, Story 6.3, AD-5).",',
  '  "bindings": [',
  // An abstract class bound alone builds no known class.
  `    ${binding("Laravel\\Ai\\BaseRegistry", null)},`,
  `    ${binding("Laravel\\Ai\\Console\\MakeCommand", "Laravel\\Ai\\Console\\MakeCommand")},`,
  `    ${binding("Laravel\\Ai\\Console\\ServeCommand", "Laravel\\Ai\\Console\\ServeCommand")},`,
  // An interface bound alone builds no known class.
  `    ${binding("Laravel\\Ai\\Contracts\\Clock", null)},`,
  // The unkeyed `$singletons` entry names an interface.
  `    ${binding("Laravel\\Ai\\Contracts\\Hub", null)},`,
  `    ${binding("Laravel\\Ai\\Contracts\\Hub", "Laravel\\Ai\\Hub")},`,
  `    ${binding("Laravel\\Ai\\Contracts\\Store", "Laravel\\Ai\\DatabaseStore")},`,
  `    ${binding("Laravel\\Ai\\Registry", "Laravel\\Ai\\Registry")},`,
  `    ${binding("widgets", "Laravel\\Ai\\WidgetManager")},`,
  // `(new CookieJar)->setDefaultPathAndDomain(…)`: the setter returns $this.
  `    ${binding("widgets.cookie", "Laravel\\Ai\\CookieJar")},`,
  `    ${binding("widgets.driver", null)},`,
  // `(new CookieJar)->queued()`: queued() does not return $this.
  `    ${binding("widgets.jar", null)},`,
  `    ${binding("widgets.queue", "Laravel\\Ai\\QueueManager")},`,
  `    ${binding("widgets.translator", "Laravel\\Ai\\Translator")},`,
  // `$manager` is assigned twice.
  `    ${binding("widgets.twice", null)},`,
  // The declared return type `: Hub`.
  `    ${binding("widgets.typed", "Laravel\\Ai\\Hub")}`,
  "  ],",
  '  "classes": [',
  '    "Laravel\\\\Ai\\\\Console\\\\MakeCommand",',
  '    "Laravel\\\\Ai\\\\Console\\\\ServeCommand",',
  '    "Laravel\\\\Ai\\\\CookieJar",',
  '    "Laravel\\\\Ai\\\\DatabaseStore",',
  '    "Laravel\\\\Ai\\\\Hub",',
  '    "Laravel\\\\Ai\\\\QueueManager",',
  '    "Laravel\\\\Ai\\\\Registry",',
  '    "Laravel\\\\Ai\\\\Translator",',
  '    "Laravel\\\\Ai\\\\WidgetManager"',
  "  ],",
  // Each boot-only property with its writers: the register/boot path no-boot-only-write allows (Story 6.3).
  '  "bootOnly": [',
  ...[
    ["Laravel\\Ai\\CookieJar::$secure", "setsecure"],
    ["Laravel\\Ai\\DatabaseStore::$items", "put"],
    ["Laravel\\Ai\\Hub::$resets", "reset"],
    ["Laravel\\Ai\\QueueManager::$routes", "addroute"],
    ["Laravel\\Ai\\Registry::$count", "addpath"],
    ["Laravel\\Ai\\Registry::$extensions", "extend"],
    ["Laravel\\Ai\\Registry::$first", "group"],
    ["Laravel\\Ai\\Registry::$listeners", "listen"],
    ["Laravel\\Ai\\Registry::$normalized", "normalize"],
    ["Laravel\\Ai\\Registry::$paths", "addpath"],
    ["Laravel\\Ai\\Translator::$locale", "setlocale"],
    ["Laravel\\Ai\\WidgetManager::$drivers", "adddriver"],
  ].map(([property, writer], i, all) => `    ${renderJson({ property: property!, writers: [writer!] })}${i < all.length - 1 ? "," : ""}`),
  "  ]",
  "}",
  "",
].join("\n");

const BOOT_ONLY = [
  "# Boot-only state (AD-5): `<FQCN>::$<property>` written only during register/boot.",
  "# Generated by `bun run scan:singletons` (tools/scans/singletons.ts) from conformance/upstream.",
  "# Do not edit by hand: `bun run scan:singletons --check` flags any difference.",
  // addpath() is called at the top level of register() (names compare case-insensitively), and
  // normalize() only from addPath() and itself; extend() at the top level of boot(); group() and
  // listen() from registerGroups(), which boot() calls as $this->registerGroups().
  // Not listed: $resolved and $counter (written by the runtime resolve() / driver()); $booted
  // (constructor) and $defaults (configure(), called only from the constructor); $request
  // (setRequest() is called only inside a rebinding closure); $stack (array_pop in pop()), $depth
  // (++ in pop()) and $instances (BaseRegistry::$instances in pop()); $fired (written in a closure
  // inside listen()); $mode (setMode() is called only inside a closure in watch(), a runtime
  // caller); $ref (&), $listed (list() destructuring), $sorted (sort()) and $shared (parent::$shared),
  // each also written in pop(); $anon (written in an anonymous class inside listen()); the
  // Translator, CookieJar and QueueManager setters setFallback, setDefaultPathAndDomain and
  // addConnector (called only in closures).
  // Story 6.3: a boot entry call seeds only the classes its receiver resolves to. Listed:
  // CookieJar::$secure (the facades.jsonl line Jar, accessor widgets.cookie), DatabaseStore::$items
  // (resolve(StoreContract::class), bound to DatabaseStore), Hub::$resets (Hub::reset()),
  // QueueManager::$routes (app('widgets.queue')), Translator::$locale (the facade class Widgets,
  // accessor widgets.translator) and WidgetManager::$drivers ($this->app['widgets']). Not listed:
  // DatabaseStore::$tags, as tag() is called only on receivers that resolve to no bound class (a
  // variable, $app->make, an unbound abstract, an unindexed class, static::, an interface bound to no
  // class, $this->other->make).
  "Laravel\\Ai\\CookieJar::$secure",
  "Laravel\\Ai\\DatabaseStore::$items",
  "Laravel\\Ai\\Hub::$resets",
  "Laravel\\Ai\\QueueManager::$routes",
  "Laravel\\Ai\\Registry::$count",
  "Laravel\\Ai\\Registry::$extensions",
  "Laravel\\Ai\\Registry::$first",
  "Laravel\\Ai\\Registry::$listeners",
  "Laravel\\Ai\\Registry::$normalized",
  "Laravel\\Ai\\Registry::$paths",
  "Laravel\\Ai\\Translator::$locale",
  "Laravel\\Ai\\WidgetManager::$drivers",
  "",
].join("\n");

const PROVIDER_FILE = "conformance/upstream/ai/src/WidgetServiceProvider.php";
// The null bindings, printed for review with the line of each `singleton(` call (the provider
// file has a 9-line header, so PROVIDER's first line is line 10).
const REVIEW = [
  `singletons: class null, for review: Laravel\\Ai\\WidgetServiceProvider Laravel\\Ai\\BaseRegistry (${PROVIDER_FILE}:70)`,
  `singletons: class null, for review: Laravel\\Ai\\WidgetServiceProvider Laravel\\Ai\\Contracts\\Clock (${PROVIDER_FILE}:74)`,
  `singletons: class null, for review: Laravel\\Ai\\WidgetServiceProvider Laravel\\Ai\\Contracts\\Hub (${PROVIDER_FILE}:14)`,
  `singletons: class null, for review: Laravel\\Ai\\WidgetServiceProvider widgets.driver (${PROVIDER_FILE}:81)`,
  `singletons: class null, for review: Laravel\\Ai\\WidgetServiceProvider widgets.jar (${PROVIDER_FILE}:49)`,
  `singletons: class null, for review: Laravel\\Ai\\WidgetServiceProvider widgets.twice (${PROVIDER_FILE}:63)`,
];

xaravelTest("XT-conformance-84", "scan:singletons writes tools/lint-rules/singletons.json with every class an Upstream provider binds with singleton(), and seeds conformance/boot-only-state, deterministically (Story 3.6)", () => {
  withSnapshot(SINGLETON_SNAPSHOT, (dir) => {
    // A facade line, read from conformance/scans/facades.jsonl (its class need not be in the snapshot).
    writeTree(dir, { [FACADES_FILE]: `${renderJson({ facade: "Laravel\\Ai\\Facades\\Jar", accessor: "widgets.cookie", root: "Laravel\\Ai\\CookieJar", methods: [] })}\n` });
    const built = buildSingletons(dir);
    expect(built.singletons).toBe(SINGLETONS_JSON);
    expect(built.bootOnlyState).toBe(BOOT_ONLY);
    expect(JSON.parse(built.singletons)).toBeTruthy();
    expect(built.unresolved.map((line) => `singletons: class null, for review: ${line}`)).toEqual(REVIEW);

    const first = run(singletonsMain, ["--root", dir]);
    expect(first.stderr).toBe("");
    expect(first.code).toBe(0);
    expect(first.stdout).toBe(`${REVIEW.join("\n")}\nsingletons: 16 bindings (6 with class null), 9 classes, 12 boot-only properties; wrote ${SINGLETONS_FILE}, ${BOOT_ONLY_FILE}.\n`);
    const files = (): string[] => [readFileSync(join(dir, SINGLETONS_FILE), "utf8"), readFileSync(join(dir, BOOT_ONLY_FILE), "utf8")];
    expect(files()).toEqual([SINGLETONS_JSON, BOOT_ONLY]);
    expect(run(singletonsMain, ["--root", dir]).code).toBe(0);
    expect(files()).toEqual([SINGLETONS_JSON, BOOT_ONLY]);
    expect(run(singletonsMain, ["--root", dir, "--check"]).code).toBe(0);

    // Drift in one file, absence of the other.
    writeFileSync(join(dir, BOOT_ONLY_FILE), `${BOOT_ONLY}Laravel\\Ai\\Hub::$extra\n`);
    rmSync(join(dir, SINGLETONS_FILE));
    const drift = run(singletonsMain, ["--root", dir, "--check"]);
    expect(drift.code).toBe(1);
    expect(drift.stderr.split("\n").slice(0, 2)).toEqual([`singletons drift: ${SINGLETONS_FILE} is missing`, `singletons drift: ${BOOT_ONLY_FILE} differs from the scan (first difference at line 16)`]);
  });

  // A dynamic abstract outside the foreach rule fails the run and writes nothing.
  const bad = php("Laravel\\Mcp", "class BadServiceProvider extends ServiceProvider\n{\n    public function register()\n    {\n        $abstract = 'x';\n        $this->app->singleton($abstract);\n    }\n}", ["Illuminate\\Support\\ServiceProvider"]);
  withSnapshot({ ...SINGLETON_SNAPSHOT, "mcp/src/BadServiceProvider.php": bad }, (dir) => {
    const result = run(singletonsMain, ["--root", dir]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("singletons scan failed: conformance/upstream/mcp/src/BadServiceProvider.php:12: singleton($abstract): the abstract is a variable the foreach rule does not resolve\n");
    expect(existsSync(join(dir, SINGLETONS_FILE))).toBe(false);
    expect(existsSync(join(dir, BOOT_ONLY_FILE))).toBe(false);
  });
});

xaravelTest("XT-conformance-249", "the committed singletons.json and boot-only-state are the scan of the snapshot (Story 3.6)", () => {
  if (!REAL) {
    console.warn("scans.test.ts: conformance/upstream is not synced; the real-snapshot check is skipped");
    return;
  }
  const built = buildSingletons(root);
  expect(readFileSync(join(root, SINGLETONS_FILE), "utf8")).toBe(built.singletons);
  expect(readFileSync(join(root, BOOT_ONLY_FILE), "utf8")).toBe(built.bootOnlyState);
  // Closure-built singletons resolve (ESC-3.6-1): `$trans = new Translator(…); return $trans;`,
  // `new Redirector(…)` through a variable, `(new CookieJar)->setDefaultPathAndDomain(…)`, and
  // `(new Dispatcher($app))->setQueueResolver(…)`.
  for (const cls of ["Illuminate\\Cache\\CacheManager", "Illuminate\\Translation\\Translator", "Illuminate\\Routing\\Redirector", "Illuminate\\Cookie\\CookieJar", "Illuminate\\Events\\Dispatcher", "Illuminate\\Routing\\UrlGenerator"]) {
    expect([cls, built.classes.includes(cls)]).toEqual([cls, true]);
  }
  // UrlGenerator::setRequest runs in RoutingServiceProvider's request rebinder closure, per request (AD-5).
  expect(built.bootOnly).not.toContain("Illuminate\\Routing\\UrlGenerator::$request");
  // A boot entry call seeds only the class its receiver resolves to (Story 6.3, Epic 3 retro S5): the false
  // entries an any-receiver `->extend(` / `->after(` / `->addConnector(` match listed are gone, and the
  // genuine ones stay, each with its writers (Route::group, ParallelTesting::setUp*, Mcp::local).
  for (const absent of [
    "Illuminate\\Queue\\QueueManager::$connectors",
    "Illuminate\\Auth\\Access\\Gate::$afterCallbacks",
    "Illuminate\\Translation\\Translator::$handleMissingTranslationKeys",
    "Illuminate\\Cache\\CacheManager::$customCreators",
    "Illuminate\\Routing\\Router::$binders",
    "Illuminate\\Validation\\Factory::$extensions",
  ]) {
    expect([absent, built.bootOnly.includes(absent)]).toEqual([absent, false]);
  }
  expect(built.writers).toEqual([
    { property: "Illuminate\\Routing\\Router::$groupStack", writers: ["group", "updategroupstack"] },
    { property: "Illuminate\\Testing\\ParallelTesting::$setUpProcessCallbacks", writers: ["setupprocess"] },
    { property: "Illuminate\\Testing\\ParallelTesting::$setUpTestCaseCallbacks", writers: ["setuptestcase"] },
    { property: "Illuminate\\Testing\\ParallelTesting::$tearDownProcessCallbacks", writers: ["teardownprocess"] },
    { property: "Laravel\\Mcp\\Server\\Registrar::$localServers", writers: ["local"] },
  ]);
  expect(built.bootOnly).toEqual(built.writers.map((entry) => entry.property));
  expect((JSON.parse(built.singletons) as { bootOnly: unknown }).bootOnly).toEqual(built.writers);
  // The foreach rule resolves ArtisanServiceProvider::registerCommands' singleton($command).
  expect(built.bindings).toContainEqual({ provider: "Illuminate\\Foundation\\Providers\\ArtisanServiceProvider", abstract: "Illuminate\\Foundation\\Console\\AboutCommand", class: "Illuminate\\Foundation\\Console\\AboutCommand" });
  // FoundationServiceProvider::$singletons.
  expect(built.bindings).toContainEqual({ provider: "Illuminate\\Foundation\\Providers\\FoundationServiceProvider", abstract: "Illuminate\\Foundation\\Vite", class: "Illuminate\\Foundation\\Vite" });
});

// ---------------------------------------------------------------------------
// XT-conformance-85

xaravelTest("XT-conformance-85", "the scan outputs are Protected and CODEOWNERS assigns them to the Maintainer (AD-16.1)", () => {
  const entries = parseList(readFileSync(join(root, LIST_PATH), "utf8"));
  const phases = activePhases(root);
  const codeowners = readFileSync(join(root, CODEOWNERS_PATH), "utf8");
  expect(codeowners).toBe(renderCodeowners(entries, phases));
  for (const path of [FACADES_FILE, SINGLETONS_FILE, BOOT_ONLY_FILE]) {
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
});
