<?php

// The Oracle evaluator (Story 3.2; FR-6, AD-15).
//
//   php evaluate.php <framework-dir> <php-version> <requests-file>...
//
// tools/oracle/fixtures.ts (`bun run oracle:fixtures`) runs it twice, in the
// Oracle image or against a locked local install, compares the two passes and
// signs each output (docs/ops/oracle.md, Fixtures).
//
// Runs inside the Oracle image (or against a locked local install). It:
//
//   1. refuses any PHP other than <php-version>;
//   2. applies phpunit.xml.dist's <php> <ini>, <env> and <const> entries,
//      changes to <framework-dir> and loads its autoloader, as lister.php does;
//   3. reads each <requests-file> in turn, one Oracle request per line
//      (conformance/oracle/schema.json), and evaluates each in its own
//      pcntl_fork child, so no static state (macros, facades, test clocks,
//      serializers) leaks from one request to the next; a child that has not
//      answered after 60 seconds is killed; the child answers only over a
//      socket pair, and its accidental output (echo, print, displayed errors,
//      dump(), writes to STDOUT or php://stdout) is discarded and never
//      recorded: the script re-runs itself with fd 1 on /dev/null and the
//      real stdout on fd 3, where the protocol writer writes (this guards
//      against stray output, not against request code that deliberately
//      opens php://fd/3);
//   4. writes one JSON line per request to stdout, in input order (file by
//      file, line by line):
//
//      {"sha256":<request hash>,"output":{"error":null|{"stage","class","message"},"results":[…]}}
//
// Each kind runs as docs/ops/oracle.md "Evaluation contract per kind" says:
// the Test ID's class is instantiated, setUpBeforeClass() and setUp() run, then
// a closure bound to the instance assigns the bindings and runs `setup` and
// `exprs` with eval(), in the Test ID's namespace (so unqualified function
// names resolve as in the test file), then tearDown() and
// tearDownAfterClass(). `blade-render` renders Blade::render($template, $data)
// in an Orchestra Testbench application: the Test ID's own class when it is a
// Testbench TestCase, else a bare Testbench TestCase.
//
// An Xaravel Test ID (`XT-<component>-<n>`, a per-Story request of Story 3.4)
// has no Upstream class: it runs bound to a bare PHPUnit TestCase in the
// global namespace (`blade-render`: the bare Testbench TestCase). Since no
// setUp() of its own freezes the clock or builds a translator, `date-format`
// applies its `now` through `Illuminate\Support\Carbon::setTestNow`, and the bare
// TestCase has Upstream's `getIlluminateArrayTranslator()` for
// `validation-message` (Story 5.9, Epic 3 retro R6).
//
// A result is {"value":<encoded>} or {"throws":{"class","message"}}. An error
// at a stage (`bindings`, `setUp`, `setup`, `tearDown`, `fatal`, `timeout`)
// sets `error`; an error before `exprs` leaves `results` empty. Values are
// encoded losslessly and deterministically:
//
//   null, true, false        as themselves
//   string                   a JSON string; not valid UTF-8: {"bytes":<base64>}
//   int                      {"int":"<decimal>"}
//   float                    {"float":"<var_export>"}  (1.0, 0.1, -0.0, INF, NAN)
//   array                    {"array":[[<key>,<value>],…]}  in PHP order; a key
//                            is an encoded int or a string
//   enum case                {"enum":"<Class>::<Case>"}
//   Mockery mock             {"mock":"<mocked class>"}  (its parent class, else its
//                            first non-Mockery interface by name); its
//                            internals are Mockery's, not Upstream's
//   object                   {"object":"<Class>","properties":[[<name>,<scope>,<value>],…]}
//                            from the (array) cast, in its order; scope is ""
//                            (public), "*" (protected) or the declaring class
//                            (private); no magic method runs
//   object already being     {"recursion":"<Class>"}
//   encoded (a cycle)
//   resource                 {"resource":"<type>"}
//
// Every string (values, keys, exception messages) has the framework
// directory replaced by `{root}`, as lister.php's export does, so the image
// and a local install give the same bytes.
//
// Exit codes: 0 success, 1 any failure (the reason is on stderr).

declare(strict_types=1);

function fail(string $message): never
{
    fwrite(STDERR, "evaluate: {$message}\n");
    exit(1);
}

if ($argc < 4) {
    fail('usage: php evaluate.php <framework-dir> <php-version> <requests-file>...');
}
if (PHP_VERSION !== $argv[2]) {
    fail('needs PHP '.$argv[2].', this is '.PHP_VERSION);
}
foreach (['pcntl_fork', 'pcntl_waitpid', 'posix_kill', 'stream_socket_pair'] as $function) {
    if (! function_exists($function)) {
        fail("needs {$function}() (the pcntl and posix extensions)");
    }
}
if (! function_exists('proc_open')) {
    fail('needs proc_open()');
}

// Keep accidental output of request and Upstream code out of the protocol
// stream: re-run this script with fd 1 on /dev/null and the real stdout on
// fd 3, where the protocol writer below writes. PHP cannot dup2(), and closing STDOUT in
// the child would break code that writes to the STDOUT constant (Symfony's
// ConsoleOutput, which Testbench builds), so fd 1 is /dev/null from the start.
const PROTOCOL_FD_ENV = 'XARAVEL_EVALUATE_PROTOCOL_FD';
if (getenv(PROTOCOL_FD_ENV) !== '3') {
    putenv(PROTOCOL_FD_ENV.'=3');
    $inner = proc_open([PHP_BINARY, ...$argv], [0 => STDIN, 1 => ['file', '/dev/null', 'w'], 2 => STDERR, 3 => STDOUT], $pipes);
    if ($inner === false) {
        fail('cannot start the evaluation process');
    }
    $code = proc_close($inner);
    if ($code !== 0) {
        fwrite(STDERR, "evaluate: the evaluation process exited with {$code}\n");
        exit(1);
    }
    exit(0);
}
putenv(PROTOCOL_FD_ENV);
unset($_ENV[PROTOCOL_FD_ENV], $_SERVER[PROTOCOL_FD_ENV]);
$rootAsGiven = rtrim($argv[1], '/');
$root = realpath($rootAsGiven);
if ($root === false || ! is_file($root.'/phpunit.xml.dist') || ! is_file($root.'/vendor/autoload.php')) {
    fail("{$argv[1]} is not an installed framework directory");
}
$requestFiles = array_slice($argv, 3);
$requestTexts = [];
foreach ($requestFiles as $requestFile) {
    $text = file_get_contents($requestFile);
    if ($text === false) {
        fail("cannot read {$requestFile}");
    }
    $requestTexts[$requestFile] = $text;
}

$config = new DOMDocument;
if (! $config->load($root.'/phpunit.xml.dist')) {
    fail('cannot parse phpunit.xml.dist');
}
foreach ((new DOMXPath($config))->query('/phpunit/php/*') as $node) {
    $name = $node->getAttribute('name');
    $value = $node->getAttribute('value');
    switch ($node->nodeName) {
        case 'ini':
            ini_set($name, $value);
            break;
        case 'env':
            $force = $node->getAttribute('force') === 'true';
            if ($force || getenv($name) === false) {
                putenv("{$name}={$value}");
            }
            if ($force || ! array_key_exists($name, $_ENV)) {
                $_ENV[$name] = $value;
            }
            if ($force || ! array_key_exists($name, $_SERVER)) {
                $_SERVER[$name] = $value;
            }
            break;
        case 'const':
            if (! defined($name)) {
                define($name, $value);
            }
            break;
        default:
            fail("phpunit.xml.dist <php> has an unsupported <{$node->nodeName}>");
    }
}
ini_set('serialize_precision', '-1');

chdir($root);
require $root.'/vendor/autoload.php';

// PHPUnit's configuration registry, as `phpunit` sets it up from
// phpunit.xml.dist before it runs a test: Testbench reads it in tearDown().
$emitter = PHPUnit\Event\Facade::emitter();
PHPUnit\TextUI\Configuration\Registry::init(
    (new PHPUnit\TextUI\CliArguments\Builder($emitter))->fromParameters([]),
    (new PHPUnit\TextUI\XmlConfiguration\Loader($emitter))->load($root.'/phpunit.xml.dist'),
    $emitter,
);

const TIMEOUT_SECONDS = 60;

final class Encoder
{
    /** @var array<int, true> ids of the objects being encoded */
    private array $stack = [];

    /** @param array<string, string> $replace */
    public function __construct(private readonly array $replace)
    {
    }

    public function string(string $value): mixed
    {
        $value = strtr($value, $this->replace);

        return mb_check_encoding($value, 'UTF-8') ? $value : ['bytes' => base64_encode($value)];
    }

    public function encode(mixed $value, int $depth = 0): mixed
    {
        if ($depth > 512) {
            throw new RuntimeException('value nested deeper than 512 levels');
        }

        return match (true) {
            $value === null, is_bool($value) => $value,
            is_string($value) => $this->string($value),
            is_int($value) => ['int' => (string) $value],
            is_float($value) => ['float' => var_export($value, true)],
            is_array($value) => ['array' => $this->pairs($value, $depth)],
            $value instanceof UnitEnum => ['enum' => $this->string($value::class.'::'.$value->name)],
            $value instanceof Mockery\LegacyMockInterface => ['mock' => $this->string($this->mocked($value))],
            is_object($value) => $this->object($value, $depth),
            default => ['resource' => get_resource_type($value)],
        };
    }

    /** @param array<array-key, mixed> $value */
    private function pairs(array $value, int $depth): array
    {
        $pairs = [];
        foreach ($value as $key => $item) {
            $pairs[] = [is_int($key) ? ['int' => (string) $key] : $this->string($key), $this->encode($item, $depth + 1)];
        }

        return $pairs;
    }

    private function object(object $value, int $depth): array
    {
        $id = spl_object_id($value);
        if (isset($this->stack[$id])) {
            return ['recursion' => $this->string($value::class)];
        }
        $this->stack[$id] = true;
        try {
            $properties = [];
            foreach ((array) $value as $key => $item) {
                $key = (string) $key;
                if (str_starts_with($key, "\0")) {
                    [, $scope, $name] = explode("\0", $key, 3);
                } else {
                    [$scope, $name] = ['', $key];
                }
                $properties[] = [$this->string($name), $this->string($scope), $this->encode($item, $depth + 1)];
            }

            return ['object' => $this->string($value::class), 'properties' => $properties];
        } finally {
            unset($this->stack[$id]);
        }
    }

    /** The class or interface a Mockery mock stands in for (its first), else the mock's own class. */
    private function mocked(object $mock): string
    {
        $parent = get_parent_class($mock);
        if ($parent !== false && ! str_starts_with($parent, 'Mockery\\')) {
            return $parent;
        }
        $interfaces = array_values(array_filter(class_implements($mock), static fn (string $name): bool => ! str_starts_with($name, 'Mockery\\')));
        sort($interfaces, SORT_STRING);

        return $interfaces[0] ?? $mock::class;
    }

    /** @return array{class: mixed, message: mixed} */
    public function throwable(Throwable $error): array
    {
        return ['class' => $this->string($error::class), 'message' => $this->string($error->getMessage())];
    }
}

final class StageError extends RuntimeException
{
    /** @var list<mixed> the results recorded before a `tearDown` error */
    public array $partial = [];

    public function __construct(public readonly string $stage, public readonly Throwable $error)
    {
        parent::__construct($stage);
    }
}

/**
 * The Test ID's class and method: `<class>::<method>[#<dataset>]`. An Xaravel
 * Test ID has no Upstream class, so it gets the bare PHPUnit TestCase.
 */
function testTarget(string $id): array
{
    if (preg_match('/^XT-[a-z][a-z0-9-]*-[1-9][0-9]*$/', $id) === 1) {
        return [BareTestCase::class, 'evaluate'];
    }
    if (preg_match('/^([A-Za-z_\\\\][A-Za-z0-9_\\\\]*)::([A-Za-z_][A-Za-z0-9_]*)(?:#[\s\S]*)?$/', $id, $match) !== 1) {
        throw new RuntimeException("{$id} is not a PHPUnit Test ID");
    }
    if (! class_exists($match[1])) {
        throw new RuntimeException("{$match[1]} is not a loadable class");
    }

    return [$match[1], $match[2]];
}

/**
 * Runs `$body` bound to a fresh instance of `$class` between its PHPUnit
 * fixture methods, and returns the body's results.
 */
function withTestCase(string $class, string $method, Closure $body): array
{
    $results = [];
    $error = null;
    try {
        $class::setUpBeforeClass();
        $test = new $class($method);
    } catch (Throwable $e) {
        throw new StageError('setUp', $e);
    }
    try {
        (fn () => $this->setUp())->call($test);
    } catch (Throwable $e) {
        throw new StageError('setUp', $e);
    }
    try {
        $results = Closure::bind($body, $test, $class)();
    } catch (StageError $e) {
        $error = $e;
    }
    try {
        (fn () => $this->tearDown())->call($test);
        $class::tearDownAfterClass();
    } catch (Throwable $e) {
        $error ??= new StageError('tearDown', $e);
    }
    if ($error !== null) {
        $error->partial = $results;
        throw $error;
    }

    return $results;
}

/**
 * The body every eval-based kind shares: bindings, setup, then each expr.
 *
 * @param array<string, string> $bindings
 * @param list<string> $prelude PHP statements run before `setup` (validation-message; date-format's `now` for an Xaravel Test ID)
 * @param list<string> $setup
 * @param list<string> $exprs
 */
function evalBody(string $namespace, array $bindings, array $prelude, array $setup, array $exprs, Encoder $encoder): Closure
{
    return function () use ($namespace, $bindings, $prelude, $setup, $exprs, $encoder): array {
        $__xaravelNs = $namespace === '' ? '' : "namespace {$namespace};\n";
        foreach ($bindings as $__xaravelName => $__xaravelLiteral) {
            if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $__xaravelName) !== 1) {
                throw new StageError('bindings', new RuntimeException("invalid binding name {$__xaravelName}"));
            }
            try {
                eval($__xaravelNs.'$'.$__xaravelName.' = '.$__xaravelLiteral.';');
            } catch (Throwable $e) {
                throw new StageError('bindings', $e);
            }
        }
        foreach ([...$prelude, ...$setup] as $__xaravelStatement) {
            try {
                eval($__xaravelNs.$__xaravelStatement);
            } catch (Throwable $e) {
                throw new StageError('setup', $e);
            }
        }
        $__xaravelResults = [];
        foreach ($exprs as $__xaravelExpr) {
            try {
                $__xaravelValue = eval($__xaravelNs.'return '.$__xaravelExpr.';');
                $__xaravelResults[] = ['value' => $encoder->encode($__xaravelValue)];
            } catch (Throwable $e) {
                $__xaravelResults[] = ['throws' => $encoder->throwable($e)];
            }
        }

        return $__xaravelResults;
    };
}

/** PHP source of a JSON value, as a literal. */
function phpLiteral(mixed $value): string
{
    return var_export($value, true);
}

/** @return array{error: mixed, results: list<mixed>} */
function evaluate(array $request, Encoder $encoder): array
{
    $kind = $request['kind'];
    $input = $request['input'];
    try {
        if ($kind === 'blade-render') {
            [$class, $method] = testTarget($request['id']);
            if (! is_subclass_of($class, Orchestra\Testbench\TestCase::class)) {
                $class = BareTestbenchCase::class;
                $method = 'render';
            }
            $template = $input['template'];
            $data = $input['data'];
            $results = withTestCase($class, $method, function () use ($template, $data, $encoder): array {
                try {
                    return [['value' => $encoder->encode(Illuminate\Support\Facades\Blade::render($template, $data))]];
                } catch (Throwable $e) {
                    return [['throws' => $encoder->throwable($e)]];
                }
            });

            return ['error' => null, 'results' => $results];
        }
        [$class, $method] = testTarget($request['id']);
        $namespace = (new ReflectionClass($class))->getNamespaceName();
        $bindings = [];
        $prelude = [];
        $setup = $input['setup'] ?? [];
        $exprs = $input['exprs'];
        switch ($kind) {
            case 'php-expr':
                $bindings = $input['bindings'];
                break;
            case 'sql-grammar':
                break;
            case 'date-format':
                date_default_timezone_set($input['timezone']);
                // An Upstream class's setUp() applies `now` itself; an Xaravel Test ID has no setUp() that does, so
                // the frozen clock is applied here (Epic 3 retro R6).
                if ($class === BareTestCase::class && $input['now'] !== null) {
                    $prelude = ['\\Illuminate\\Support\\Carbon::setTestNow('.$input['now'].');'];
                }
                break;
            case 'validation-message':
                $prelude = [
                    '$trans = $this->getIlluminateArrayTranslator();',
                    '$trans->addLines('.phpLiteral($input['lines']).", 'en');",
                    '$v = new \Illuminate\Validation\Validator($trans, '.phpLiteral($input['data']).', '.phpLiteral($input['rules']).', '.phpLiteral($input['messages']).', '.phpLiteral($input['attributes']).');',
                ];
                if ($input['format'] !== null) {
                    $prelude[] = '$v->messages()->setFormat('.phpLiteral($input['format']).');';
                }
                break;
            default:
                throw new RuntimeException("unknown kind {$kind}");
        }
        try {
            $results = withTestCase($class, $method, evalBody($namespace, $bindings, $prelude, $setup, $exprs, $encoder));
        } finally {
            // An Xaravel Test date-format request's frozen clock never outlives its request.
            if ($kind === 'date-format' && $class === BareTestCase::class) {
                \Illuminate\Support\Carbon::setTestNow();
            }
        }

        return ['error' => null, 'results' => $results];
    } catch (StageError $e) {
        return ['error' => ['stage' => $e->stage, ...$encoder->throwable($e->error)], 'results' => $e->partial ?? []];
    }
}

/**
 * The test case an Xaravel Test ID runs bound to: no Upstream class, the global namespace. It has Upstream's
 * validation tests' translator, so a `validation-message` request evaluates as it does there (Epic 3 retro R6).
 */
final class BareTestCase extends PHPUnit\Framework\TestCase
{
    /** Upstream's `getIlluminateArrayTranslator()` (tests/Validation): an `en` Translator over an ArrayLoader. */
    public function getIlluminateArrayTranslator(): Illuminate\Translation\Translator
    {
        return new Illuminate\Translation\Translator(new Illuminate\Translation\ArrayLoader, 'en');
    }
}

/** A bare Testbench application for `blade-render` requests whose own class is not one. */
final class BareTestbenchCase extends Orchestra\Testbench\TestCase
{
}

/** The child's output buffer callback: everything written to the output layer is dropped. */
function discardOutput(string $buffer): string
{
    return '';
}

/** Runs one request in a forked child and returns its output line's `output`. */
function runChild(array $request, Encoder $encoder): array
{
    $pair = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
    if ($pair === false) {
        fail('cannot create a socket pair');
    }
    $pid = pcntl_fork();
    if ($pid === -1) {
        fail('cannot fork');
    }
    if ($pid === 0) {
        fclose($pair[0]);
        $channel = $pair[1];
        // The child's fd 1 (and STDOUT) is already /dev/null (see the re-exec
        // above), so accidental writes to STDOUT or php://stdout go nowhere; a
        // discarding output buffer also swallows echo, print and displayed
        // errors. The answer travels only over $channel; the inherited fd 3 is
        // not guarded against request code that opens it on purpose. The callback is a
        // named function, not a closure: a closure would take an object id and
        // shift spl_object_id() in recorded values (Carbon's constructedObjectId).
        ob_start('discardOutput', 4096);
        register_shutdown_function(static function () use ($channel, $encoder): void {
            $last = error_get_last();
            if ($last !== null && in_array($last['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
                @fwrite($channel, json_encode(['error' => ['stage' => 'fatal', 'class' => null, 'message' => $encoder->string($last['message'])], 'results' => []], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));
            }
            posix_kill(posix_getpid(), SIGKILL);
        });
        $output = evaluate($request, $encoder);
        $json = json_encode($output, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
        fwrite($channel, $json);
        fflush($channel);
        posix_kill(posix_getpid(), SIGKILL);
    }
    fclose($pair[1]);
    stream_set_blocking($pair[0], false);
    $buffer = '';
    $deadline = microtime(true) + TIMEOUT_SECONDS;
    $timedOut = false;
    while (true) {
        $read = [$pair[0]];
        $write = $except = null;
        $left = $deadline - microtime(true);
        if ($left <= 0) {
            $timedOut = true;
            break;
        }
        $ready = stream_select($read, $write, $except, (int) $left, 200000);
        if ($ready === false) {
            continue;
        }
        if ($ready > 0) {
            $chunk = fread($pair[0], 1 << 20);
            if ($chunk === '' || $chunk === false) {
                if (feof($pair[0])) {
                    break;
                }
                continue;
            }
            $buffer .= $chunk;
        }
    }
    fclose($pair[0]);
    if ($timedOut) {
        posix_kill($pid, SIGKILL);
    }
    pcntl_waitpid($pid, $status);
    if ($timedOut) {
        return ['error' => ['stage' => 'timeout', 'class' => null, 'message' => 'no answer after '.TIMEOUT_SECONDS.' seconds'], 'results' => []];
    }
    if ($buffer === '') {
        return ['error' => ['stage' => 'fatal', 'class' => null, 'message' => 'the evaluation process ended without an answer'], 'results' => []];
    }
    try {
        return json_decode($buffer, true, 1024, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        fail("{$request['sha256']}: unreadable child answer: {$e->getMessage()}");
    }
}

$replace = [$root => '{root}'];
if ($rootAsGiven !== $root && $rootAsGiven !== '') {
    $replace[$rootAsGiven] = '{root}';
}
$encoder = new Encoder($replace);
$out = fopen('php://fd/3', 'w');
if ($out === false) {
    fail('cannot open the protocol stream (fd 3)');
}
foreach ($requestTexts as $requestFile => $requestsText) {
    foreach (explode("\n", $requestsText) as $number => $line) {
        if ($line === '') {
            continue;
        }
        try {
            $request = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            fail("{$requestFile}:".($number + 1).": not JSON: {$e->getMessage()}");
        }
        if (! is_array($request) || ! isset($request['id'], $request['kind'], $request['input'], $request['sha256'])) {
            fail("{$requestFile}:".($number + 1).': not an Oracle request');
        }
        $output = runChild($request, $encoder);
        fwrite($out, json_encode(['sha256' => $request['sha256'], 'output' => $output], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR)."\n");
    }
}
