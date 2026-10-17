<?php

// The Test Inventory lister (Story 2.4 for PHPUnit, Story 2.5 for Pest; FR-1).
//
//   php lister.php <framework-dir> <php-version>
//   php lister.php <suite-dir> <php-version> pest
//
// Runs inside the Oracle image (or against a locked local install). It:
//
//   1. refuses any PHP other than <php-version>;
//   2. runs `phpunit --list-tests-xml` in <framework-dir> and takes its
//      listing as the authoritative set of Test IDs, failing on any output
//      other than PHPUnit's banner and its "Wrote list" line;
//   3. applies phpunit.xml.dist's <php> <ini>, <env> and <const> entries, loads
//      the autoloader and every listed test file, and joins each listed test
//      to its provider data through PHPUnit's DataProvider API, failing on a
//      dataset name that no provider label matches;
//   4. writes one raw JSON line per listed test to stdout:
//
//      {"id","class","method","dataset","file","source":{"file","start","end"},
//       "tokens":["c…"|"w…"|"#…"],"data":string|null,
//       "requiresDatabase":string[]|null,"redis":bool}
//
// Paths are relative to <framework-dir>. Each token carries its kind as a
// one-character prefix (c code, w whitespace, # comment); normalising and
// hashing happen in tools/inventory/inventory.ts. `data` is a deterministic
// export of the dataset with the framework directory replaced by `{root}`.
//
// Pest mode (the `pest` 4th argument) runs <suite-dir>'s own
// `vendor/bin/pest --list-tests-xml` with this file as its
// `auto_prepend_file` and XARAVEL_INVENTORY_PEST naming an output file. In
// that prepend mode the file only registers a shutdown function and returns.
// At shutdown, still inside Pest's process, the function reads Pest's listing
// (the authoritative set of tests) and Pest's test repository (describe
// blocks, descriptions, closures and datasets), and writes one raw line per
// listed test to the output file:
//
//      {"id","class","method","dataset","file","describe":string[],"name",
//       "source":{"file","start","end"},"tokens":[…],"data":string|null,
//       "requiresDatabase":string[]|null,"redis":bool}
//
// `id`, `class` and `method` are PHPUnit's (the generated `P\Tests\…` class);
// `file` is the test file and `source` the test closure, or for a
// closure-less `arch('<name>')` test its statement through the `;`. The
// outer process then checks Pest's output and exit and copies the lines to
// stdout.
//
// Exit codes: 0 success, 1 any failure (the reason is on stderr).

declare(strict_types=1);

function fail(string $message): never
{
    fwrite(STDERR, "lister: {$message}\n");
    exit(1);
}

// Prepend mode: this file is Pest's auto_prepend_file (see pestRun). Register
// the dump and return; Pest itself then runs. The functions below are
// compile-time bound, so they stay callable after this return.
$pestOutput = getenv('XARAVEL_INVENTORY_PEST');
$script = (string) ($_SERVER['SCRIPT_FILENAME'] ?? '');
if (
    is_string($pestOutput) && $pestOutput !== ''
    && realpath((string) ini_get('auto_prepend_file')) === __FILE__
    && $script !== '' && realpath($script) !== __FILE__
) {
    $pestRoot = (string) getenv('XARAVEL_INVENTORY_PEST_ROOT');
    register_shutdown_function(static function () use ($pestOutput, $pestRoot): void {
        pestDump($pestOutput, $pestRoot);
    });

    return;
}

if ($argc !== 3 && ! ($argc === 4 && $argv[3] === 'pest')) {
    fwrite(STDERR, "usage: php lister.php <framework-dir> <php-version> | php lister.php <suite-dir> <php-version> pest\n");
    exit(2);
}
$pestMode = $argc === 4;

$expectedVersion = $argv[2];
if (PHP_VERSION !== $expectedVersion) {
    fail('expected PHP '.$expectedVersion.', running PHP '.PHP_VERSION);
}

$root = realpath($argv[1]);
if ($root === false || ! is_dir($root)) {
    fail("{$argv[1]} is not a directory");
}
$rootAsGiven = rtrim($argv[1], '/');
foreach (['vendor/autoload.php', $pestMode ? 'vendor/bin/pest' : 'vendor/bin/phpunit', 'phpunit.xml.dist'] as $required) {
    if (! is_file($root.'/'.$required)) {
        fail("{$root}/{$required} is missing");
    }
}
if ($pestMode) {
    pestRun($root, $rootAsGiven);
}

/** The path of $path relative to the framework directory; fails when it lies outside. */
function relativePath(string $root, string $path): string
{
    $real = realpath($path);
    if ($real === false || ! str_starts_with($real, $root.'/')) {
        fail("{$path} is outside {$root}");
    }

    return substr($real, strlen($root) + 1);
}

// ---------------------------------------------------------------------------
// 1. PHPUnit's own listing

$listFile = tempnam(sys_get_temp_dir(), 'xaravel-inventory-');
if ($listFile === false) {
    fail('cannot create a temp file');
}
register_shutdown_function(static function () use ($listFile): void {
    @unlink($listFile);
});

$process = proc_open(
    [PHP_BINARY, 'vendor/bin/phpunit', '--colors=never', '--do-not-cache-result', '--list-tests-xml', $listFile],
    [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]],
    $pipes,
    $root,
);
if (! is_resource($process)) {
    fail('cannot start phpunit');
}
$output = stream_get_contents($pipes[1]);
fclose($pipes[1]);
$status = proc_close($process);
if ($status !== 0) {
    fail("phpunit --list-tests-xml exited {$status}:\n{$output}");
}
$lines = array_values(array_filter(explode("\n", (string) $output), static fn (string $line): bool => trim($line) !== ''));
$expected = count($lines) === 2
    && preg_match('/^PHPUnit \S+ by Sebastian Bergmann and contributors\.$/', $lines[0]) === 1
    && $lines[1] === 'Wrote list of tests that would have been run to '.$listFile;
if (! $expected) {
    fail("unexpected phpunit output:\n{$output}");
}

$document = new DOMDocument;
if (! $document->load($listFile)) {
    fail('cannot parse the phpunit test list');
}
$xpath = new DOMXPath($document);
$xpath->registerNamespace('t', 'https://xml.phpunit.de/testSuite');
$listed = [];
foreach ($xpath->query('/t:testSuite/t:tests/t:testClass') as $classNode) {
    $class = $classNode->getAttribute('name');
    $file = $classNode->getAttribute('file');
    foreach ($xpath->query('t:testMethod', $classNode) as $methodNode) {
        $listed[] = ['id' => $methodNode->getAttribute('id'), 'class' => $class, 'method' => $methodNode->getAttribute('name'), 'file' => $file];
    }
}
if ($listed === []) {
    fail('phpunit listed no tests');
}

// ---------------------------------------------------------------------------
// 2. The <php> configuration, the autoloader and the test files

$config = new DOMDocument;
if (! $config->load($root.'/phpunit.xml.dist')) {
    fail('cannot parse phpunit.xml.dist');
}
$configPath = new DOMXPath($config);
foreach ($configPath->query('/phpunit/php/*') as $node) {
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

chdir($root);
require $root.'/vendor/autoload.php';

foreach ($listed as $test) {
    require_once $test['file'];
}

// ---------------------------------------------------------------------------
// 3. Tokens, attributes and the dataset export

/** @var array<string, list<PhpToken>> */
$tokenCache = [];

/** @return list<PhpToken> */
function tokensOf(string $file): array
{
    global $tokenCache;
    if (! isset($tokenCache[$file])) {
        $code = file_get_contents($file);
        if ($code === false) {
            fail("cannot read {$file}");
        }
        $tokenCache[$file] = PhpToken::tokenize($code);
    }

    return $tokenCache[$file];
}

function tokenString(PhpToken $token): string
{
    if ($token->is(T_WHITESPACE)) {
        return 'w'.$token->text;
    }
    if ($token->is([T_COMMENT, T_DOC_COMMENT])) {
        return '#'.$token->text;
    }

    return 'c'.$token->text;
}

/**
 * The tokens of method $method in $file from `function` to its closing brace.
 *
 * @return list<string>
 */
function methodTokens(string $file, string $method, int $start, int $end): array
{
    $tokens = tokensOf($file);
    $count = count($tokens);
    for ($i = 0; $i < $count; $i++) {
        $token = $tokens[$i];
        if (! $token->is(T_FUNCTION) || $token->line < $start || $token->line > $end) {
            continue;
        }
        $j = $i + 1;
        while ($j < $count && $tokens[$j]->isIgnorable()) {
            $j++;
        }
        if ($j < $count && $tokens[$j]->is('&')) {
            $j++;
            while ($j < $count && $tokens[$j]->isIgnorable()) {
                $j++;
            }
        }
        if ($j >= $count || strcasecmp($tokens[$j]->text, $method) !== 0) {
            continue;
        }
        $parens = 0;
        $depth = 0;
        $out = [];
        for ($k = $i; $k < $count; $k++) {
            $current = $tokens[$k];
            $out[] = tokenString($current);
            if ($depth === 0 && $current->is('(')) {
                $parens++;
            } elseif ($depth === 0 && $current->is(')')) {
                $parens--;
            } elseif ($current->is(['{', T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES]) && ($depth > 0 || $parens === 0)) {
                $depth++;
            } elseif ($current->is('}') && $depth > 0) {
                $depth--;
                if ($depth === 0) {
                    return $out;
                }
            } elseif ($depth === 0 && $parens === 0 && $current->is(';')) {
                return $out;
            }
        }
        fail("{$file}: the body of {$method} does not end");
    }
    fail("{$file}:{$start}-{$end}: cannot find function {$method}");
}

/**
 * The code tokens of lines $start..$end of $file, for a closure's export.
 *
 * @return list<string>
 */
function lineCodeTokens(string $file, int $start, int $end): array
{
    $out = [];
    foreach (tokensOf($file) as $token) {
        if ($token->line >= $start && $token->line <= $end && ! $token->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT])) {
            $out[] = $token->text;
        }
    }

    return $out;
}

/** A deterministic export of $value; objects already on the path export as a recursion marker. */
function export(mixed $value, array &$path = []): string
{
    if (is_string($value) && ! mb_check_encoding($value, 'UTF-8')) {
        return 'hex('.bin2hex($value).')';
    }
    if ($value === null || is_bool($value) || is_int($value) || is_float($value) || is_string($value)) {
        return var_export($value, true);
    }
    if (is_array($value)) {
        $parts = [];
        foreach ($value as $key => $item) {
            $parts[] = var_export($key, true).'=>'.export($item, $path);
        }

        return '['.implode(',', $parts).']';
    }
    if (is_resource($value) || gettype($value) === 'resource (closed)') {
        return 'resource('.get_resource_type($value).')';
    }
    if ($value instanceof UnitEnum) {
        return $value::class.'::'.$value->name;
    }
    if ($value instanceof Closure) {
        $reflection = new ReflectionFunction($value);
        $file = $reflection->getFileName();
        if ($file === false) {
            return 'closure('.$reflection->getName().')';
        }
        $start = (int) $reflection->getStartLine();
        $end = (int) $reflection->getEndLine();

        return 'closure('.$file.':'.$start.'-'.$end.':'.json_encode(lineCodeTokens($file, $start, $end), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE).')';
    }
    if ($value instanceof DateTimeInterface) {
        return $value::class.'('.$value->format('Y-m-d\TH:i:s.uP e').')';
    }
    if ($value instanceof ArrayObject) {
        return $value::class.export($value->getArrayCopy(), $path);
    }
    if (is_object($value)) {
        $id = spl_object_id($value);
        if (in_array($id, $path, true)) {
            return '*RECURSION*';
        }
        $path[] = $id;
        $parts = [];
        foreach (get_mangled_object_vars($value) as $key => $item) {
            $parts[] = var_export(str_replace("\0", '\\0', (string) $key), true).'=>'.export($item, $path);
        }
        array_pop($path);

        return $value::class.'{'.implode(',', $parts).'}';
    }

    return gettype($value);
}

/**
 * The drivers every RequiresDatabase attribute on the class hierarchy and the
 * method allows (their intersection), or null when there is none.
 *
 * @return list<string>|null
 */
function requiredDatabases(ReflectionClass $class, ReflectionMethod $method): ?array
{
    $attributes = $method->getAttributes('Orchestra\Testbench\Attributes\RequiresDatabase');
    for ($current = $class; $current !== false; $current = $current->getParentClass()) {
        array_push($attributes, ...$current->getAttributes('Orchestra\Testbench\Attributes\RequiresDatabase'));
    }
    $drivers = null;
    foreach ($attributes as $attribute) {
        $arguments = $attribute->getArguments();
        $driver = $arguments['driver'] ?? $arguments[0] ?? null;
        $set = array_values(array_unique(array_map('strval', (array) $driver)));
        $drivers = $drivers === null ? $set : array_values(array_intersect($drivers, $set));
    }
    if ($drivers === null) {
        return null;
    }
    sort($drivers, SORT_STRING);

    return $drivers;
}

/** Whether the class hierarchy uses InteractsWithRedis, directly or through a trait. */
function usesRedis(ReflectionClass $class): bool
{
    $pending = [];
    for ($current = $class; $current !== false; $current = $current->getParentClass()) {
        array_push($pending, ...$current->getTraitNames());
    }
    $seen = [];
    while ($pending !== []) {
        $trait = array_pop($pending);
        if (isset($seen[$trait])) {
            continue;
        }
        $seen[$trait] = true;
        if ($trait === 'Illuminate\Foundation\Testing\Concerns\InteractsWithRedis') {
            return true;
        }
        if (trait_exists($trait)) {
            array_push($pending, ...(new ReflectionClass($trait))->getTraitNames());
        }
    }

    return false;
}

/**
 * Makes a provider's runtime-computed values reproducible: seeds PHP's
 * Mersenne Twister (Faker draws from it) from the test's name, and routes
 * Str's UUIDs, ULIDs and random strings through counters reset per provider.
 * Without this, a provider using fake() or Str::uuid() would change the
 * dataset export, and so the hash, on every generation.
 */
function pinRandomness(string $prefix): void
{
    mt_srand(crc32($prefix));
    srand(crc32($prefix));
    if (! class_exists('Illuminate\Support\Str')) {
        return;
    }
    $counter = 0;
    $next = static function () use (&$counter): int {
        return ++$counter;
    };
    Illuminate\Support\Str::createUuidsUsing(static fn () => Ramsey\Uuid\Uuid::fromString(sprintf('00000000-0000-4000-8000-%012x', $next())));
    Illuminate\Support\Str::createUlidsUsing(static fn () => new Symfony\Component\Uid\Ulid(sprintf('00000000000000000000%06d', $next())));
    Illuminate\Support\Str::createRandomStringsUsing(static fn (int $length) => substr(str_repeat(sprintf('r%05d', $next()), (int) ceil($length / 6) + 1), 0, $length));
}

// ---------------------------------------------------------------------------
// 4. One raw line per listed test

$dataProvider = new PHPUnit\Metadata\Api\DataProvider(PHPUnit\Event\Facade::emitter());
/** @var array<string, array<string, string>|null> */
$datasets = [];
$out = fopen('php://stdout', 'w');
$replace = [$root => '{root}'];
if ($rootAsGiven !== $root && $rootAsGiven !== '') {
    $replace[$rootAsGiven] = '{root}';
}

foreach ($listed as $test) {
    $class = $test['class'];
    $method = $test['method'];
    $prefix = $class.'::'.$method;
    if ($test['id'] === $prefix) {
        $dataset = null;
    } elseif (str_starts_with($test['id'], $prefix.'#')) {
        $dataset = substr($test['id'], strlen($prefix) + 1);
    } else {
        fail("test id {$test['id']} does not start with {$prefix}");
    }

    // PHPUnit lists a test without datasets when it does not call the
    // provider (an unmet requirement, say), so only a listed dataset is joined.
    $data = null;
    if ($dataset !== null) {
        if (! array_key_exists($prefix, $datasets)) {
            pinRandomness($prefix);
            ob_start();
            try {
                $provided = $dataProvider->providedData($class, $method);
            } catch (Throwable $error) {
                ob_end_clean();
                fail("{$prefix}: the data provider failed: ".$error::class.': '.$error->getMessage());
            }
            $stray = ob_get_clean();
            if ($stray !== '' && $stray !== false) {
                fail("{$prefix}: the data provider wrote output: {$stray}");
            }
            $exports = null;
            if ($provided !== null) {
                $exports = [];
                foreach ($provided as $label => $providedData) {
                    $exports[(string) $label] = strtr(export($providedData->value()), $replace);
                }
            }
            $datasets[$prefix] = $exports;
        }
        $exports = $datasets[$prefix];
        if ($exports === null || ! array_key_exists($dataset, $exports)) {
            fail("{$test['id']}: dataset ".json_encode($dataset, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE).' matches no provider label');
        }
        $data = $exports[$dataset];
    }

    $reflectionClass = new ReflectionClass($class);
    $reflectionMethod = new ReflectionMethod($class, $method);
    $declaring = $reflectionMethod->getFileName();
    if ($declaring === false) {
        fail("{$prefix}: no declaring file");
    }
    $start = (int) $reflectionMethod->getStartLine();
    $end = (int) $reflectionMethod->getEndLine();

    $line = json_encode([
        'id' => $test['id'],
        'class' => $class,
        'method' => $method,
        'dataset' => $dataset,
        'file' => relativePath($root, $test['file']),
        'source' => ['file' => relativePath($root, $declaring), 'start' => $start, 'end' => $end],
        'tokens' => methodTokens($declaring, $method, $start, $end),
        'data' => $data,
        'requiresDatabase' => requiredDatabases($reflectionClass, $reflectionMethod),
        'redis' => usesRedis($reflectionClass),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
    fwrite($out, $line."\n");
}

fclose($out);
exit(0);

// ---------------------------------------------------------------------------
// 5. Pest mode (Story 2.5)

/**
 * The outer process: runs the suite's own Pest with this file prepended,
 * checks its output and exit, and copies the dumped raw lines to stdout.
 */
function pestRun(string $root, string $rootAsGiven): never
{
    $listFile = tempnam(sys_get_temp_dir(), 'xaravel-inventory-');
    $outFile = tempnam(sys_get_temp_dir(), 'xaravel-inventory-pest-');
    if ($listFile === false || $outFile === false) {
        fail('cannot create a temp file');
    }
    register_shutdown_function(static function () use ($listFile, $outFile): void {
        @unlink($listFile);
        @unlink($outFile);
    });

    $env = getenv();
    $env['XARAVEL_INVENTORY_PEST'] = $outFile;
    // Pest runs in $root, so a relative <suite-dir> would resolve against the
    // wrong directory there; pass the real path instead. An absolute
    // <suite-dir> is kept as given, so the `{root}` replacement of that
    // spelling (a symlinked path, say) still applies.
    $env['XARAVEL_INVENTORY_PEST_ROOT'] = $rootAsGiven === '' || ! str_starts_with($rootAsGiven, '/') ? $root : $rootAsGiven;
    $process = proc_open(
        [PHP_BINARY, '-d', 'auto_prepend_file='.__FILE__, 'vendor/bin/pest', '--colors=never', '--do-not-cache-result', '--list-tests-xml', $listFile],
        [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]],
        $pipes,
        $root,
        $env,
    );
    if (! is_resource($process)) {
        fail('cannot start pest');
    }
    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $status = proc_close($process);
    if ($status !== 0) {
        fail("pest --list-tests-xml exited {$status}:\n{$output}");
    }
    $lines = array_values(array_filter(explode("\n", (string) $output), static fn (string $line): bool => trim($line) !== ''));
    if (count($lines) !== 1 || trim($lines[0]) !== 'INFO  Wrote list of tests that would have been run to '.$listFile.'.') {
        fail("unexpected pest output:\n{$output}");
    }
    $raw = file_get_contents($outFile);
    if ($raw === false || $raw === '') {
        fail('pest listed no tests');
    }
    fwrite(STDOUT, $raw);
    exit(0);
}

/** Pest's listing file, the value after --list-tests-xml on Pest's command line. */
function pestListFile(): ?string
{
    $args = $_SERVER['argv'] ?? [];
    foreach ($args as $index => $arg) {
        if ($arg === '--list-tests-xml' && isset($args[$index + 1])) {
            return (string) $args[$index + 1];
        }
    }

    return null;
}

/**
 * The tokens of the closure starting at token $i (`function` or `fn`): a
 * `function` through its closing brace, an `fn` through its expression's
 * last token. Returns the tokens and the end line, or null when it does not end.
 *
 * @param  list<PhpToken>  $tokens
 * @return array{0: list<string>, 1: int}|null
 */
function closureExtent(array $tokens, int $i): ?array
{
    $count = count($tokens);
    $out = [];
    if ($tokens[$i]->is(T_FUNCTION)) {
        $parens = 0;
        $depth = 0;
        for ($k = $i; $k < $count; $k++) {
            $current = $tokens[$k];
            $out[] = tokenString($current);
            if ($depth === 0 && $current->is('(')) {
                $parens++;
            } elseif ($depth === 0 && $current->is(')')) {
                $parens--;
            } elseif ($current->is(['{', T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES]) && ($depth > 0 || $parens === 0)) {
                $depth++;
            } elseif ($current->is('}') && $depth > 0) {
                $depth--;
                if ($depth === 0) {
                    return [$out, $current->line];
                }
            }
        }

        return null;
    }
    $depth = 0;
    $last = null;
    for ($k = $i; $k < $count; $k++) {
        $current = $tokens[$k];
        if ($current->is(['(', '[', '{', T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES, T_ATTRIBUTE])) {
            $depth++;
        } elseif ($current->is([')', ']', '}'])) {
            if ($depth === 0) {
                break;
            }
            $depth--;
        } elseif ($depth === 0 && ($current->is([',', ';', T_CLOSE_TAG]))) {
            break;
        }
        $out[] = tokenString($current);
        if (! $current->isIgnorable()) {
            $last = $current;
            $lastIndex = count($out);
        }
    }
    if ($last === null) {
        return null;
    }

    return [array_slice($out, 0, $lastIndex), $last->line + substr_count($last->text, "\n")];
}

/** The name of the call whose argument list holds token $i, or null at statement level. */
function enclosingCall(array $tokens, int $i): ?string
{
    $depth = 0;
    for ($k = $i - 1; $k >= 0; $k--) {
        $current = $tokens[$k];
        if ($current->is([')', ']', '}'])) {
            $depth++;
        } elseif ($current->is(['(', '[', '{', T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES, T_ATTRIBUTE])) {
            if ($depth === 0) {
                if (! $current->is('(')) {
                    return null;
                }
                for ($j = $k - 1; $j >= 0 && $tokens[$j]->isIgnorable(); $j--);

                return $j >= 0 && $tokens[$j]->is(T_STRING) ? $tokens[$j]->text : null;
            }
            $depth--;
        } elseif ($depth === 0 && $current->is(';')) {
            return null;
        }
    }

    return null;
}

/**
 * The test closure in $file between lines $start and $end: the one `function`
 * or `fn` starting on $start and ending on $end that is not a describe block,
 * hook or dataset closure. Fails when there is none or more than one.
 *
 * @return list<string>
 */
function testClosureTokens(string $file, int $start, int $end, string $label): array
{
    $tokens = tokensOf($file);
    $found = [];
    foreach ($tokens as $i => $token) {
        if ($token->line !== $start || ! $token->is([T_FUNCTION, T_FN])) {
            continue;
        }
        $extent = closureExtent($tokens, $i);
        if ($extent === null || $extent[1] !== $end) {
            continue;
        }
        $call = enclosingCall($tokens, $i);
        if ($call !== null && in_array(strtolower($call), ['describe', 'beforeeach', 'aftereach', 'beforeall', 'afterall', 'with', 'dataset'], true)) {
            continue;
        }
        $found[] = $extent[0];
    }
    if (count($found) !== 1) {
        fail("{$label}: ".count($found)." candidate test closures at {$file}:{$start}-{$end}");
    }

    return $found[0];
}

/** The value of a single- or plain double-quoted literal, or null for anything else. */
function stringLiteral(PhpToken $token): ?string
{
    if (! $token->is(T_CONSTANT_ENCAPSED_STRING)) {
        return null;
    }
    $text = $token->text;
    $body = substr($text, 1, -1);
    if ($text[0] === "'") {
        return strtr($body, ['\\\\' => '\\', "\\'" => "'"]);
    }

    return str_contains($body, '\\') || str_contains($body, '$') ? null : $body;
}

/**
 * The statement `arch('<name>')…;` in $file: its tokens through the `;` and
 * its lines. Fails unless exactly one statement-level arch call has the literal $name.
 *
 * @return array{0: list<string>, 1: int, 2: int}
 */
function archStatement(string $file, string $name, string $label): array
{
    $tokens = tokensOf($file);
    $count = count($tokens);
    $found = [];
    foreach ($tokens as $i => $token) {
        if (! $token->is(T_STRING) || strcasecmp($token->text, 'arch') !== 0) {
            continue;
        }
        for ($p = $i - 1; $p >= 0 && $tokens[$p]->isIgnorable(); $p--);
        if ($p >= 0 && ! $tokens[$p]->is([';', '{', '}', T_OPEN_TAG])) {
            continue;
        }
        $n = [];
        for ($k = $i + 1; $k < $count && count($n) < 3; $k++) {
            if (! $tokens[$k]->isIgnorable()) {
                $n[] = $tokens[$k];
            }
        }
        if (count($n) < 3 || ! $n[0]->is('(') || stringLiteral($n[1]) !== $name || ! $n[2]->is(')')) {
            continue;
        }
        $depth = 0;
        $out = [];
        $endLine = null;
        for ($k = $i; $k < $count; $k++) {
            $current = $tokens[$k];
            $out[] = tokenString($current);
            if ($current->is(['(', '[', '{', T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES, T_ATTRIBUTE])) {
                $depth++;
            } elseif ($current->is([')', ']', '}'])) {
                $depth--;
            } elseif ($depth === 0 && $current->is(';')) {
                $endLine = $current->line;
                break;
            }
        }
        if ($endLine === null) {
            fail("{$label}: the arch('{$name}') statement in {$file} does not end");
        }
        $found[] = [$out, $token->line, $endLine];
    }
    if (count($found) !== 1) {
        fail("{$label}: a closure-less test that is not exactly one arch('<literal>') statement (".count($found)." found in {$file})");
    }

    return $found[0];
}

/**
 * Prepend mode, at Pest's shutdown: one raw line per test in Pest's listing,
 * written to $outFile. Writes nothing when Pest wrote no listing (Pest's own
 * failure is then reported by the outer process).
 */
function pestDump(string $outFile, string $rootAsGiven): void
{
    $listFile = pestListFile();
    if ($listFile === null || ! is_file($listFile) || filesize($listFile) === 0) {
        return;
    }
    $root = realpath($rootAsGiven);
    if ($root === false) {
        fail("{$rootAsGiven} is not a directory");
    }
    $document = new DOMDocument;
    if (! $document->load($listFile)) {
        fail('cannot parse the pest test list');
    }
    $xpath = new DOMXPath($document);
    $xpath->registerNamespace('t', 'https://xml.phpunit.de/testSuite');

    $repository = Pest\TestSuite::getInstance()->tests;
    $defaultClosureFile = (new ReflectionClass(Pest\Factories\TestCaseMethodFactory::class))->getFileName();
    $dataProvider = new PHPUnit\Metadata\Api\DataProvider(PHPUnit\Event\Facade::emitter());
    $replace = [$root => '{root}'];
    if ($rootAsGiven !== $root && $rootAsGiven !== '') {
        $replace[rtrim($rootAsGiven, '/')] = '{root}';
    }
    /** @var array<string, array<string, string>|null> */
    $datasets = [];
    $lines = [];

    foreach ($xpath->query('/t:testSuite/t:tests/t:testClass') as $classNode) {
        $class = $classNode->getAttribute('name');
        if (! class_exists($class, false)) {
            fail("{$class} is not a loaded test class");
        }
        // Token lists are large; keep only the current class's files.
        $GLOBALS['tokenCache'] = [];
        $reflectionClass = new ReflectionClass($class);
        // A plain PHPUnit test class that Pest runs (boost has one): its test
        // name is the method, its source the method, as in Story 2.4.
        $plain = ! property_exists($class, '__filename');
        if ($plain) {
            $filename = $classNode->getAttribute('file');
            $factory = null;
        } else {
            $filename = (string) $class::$__filename;
            $factory = $repository->get($filename);
            if ($factory === null) {
                fail("{$class}: no Pest test file {$filename}");
            }
        }
        foreach ($xpath->query('t:testMethod', $classNode) as $methodNode) {
            $id = $methodNode->getAttribute('id');
            $method = $methodNode->getAttribute('name');
            $prefix = $class.'::'.$method;
            if ($id === $prefix) {
                $dataset = null;
            } elseif (str_starts_with($id, $prefix.'#')) {
                $dataset = substr($id, strlen($prefix) + 1);
            } else {
                fail("test id {$id} does not start with {$prefix}");
            }

            if ($plain) {
                $reflectionMethod = new ReflectionMethod($class, $method);
                $declaring = $reflectionMethod->getFileName();
                if ($declaring === false) {
                    fail("{$prefix}: no declaring file");
                }
                $start = (int) $reflectionMethod->getStartLine();
                $end = (int) $reflectionMethod->getEndLine();
                $lines[] = pestRawLine($id, $class, $method, $dataset, $root, $filename, [], $method, $declaring, $start, $end, methodTokens($declaring, $method, $start, $end), pestDatasetExport($datasets, $dataProvider, $replace, $class, $method, $id, $dataset), $reflectionClass);

                continue;
            }

            $testMethod = null;
            foreach ($factory->methods as $candidate) {
                if ($candidate->description !== null && Pest\Support\Str::evaluable($candidate->description) === $method) {
                    $testMethod = $candidate;
                    break;
                }
            }
            if ($testMethod === null) {
                fail("{$id}: the listed method matches no Pest test in {$filename}");
            }

            $describe = array_map(static fn ($description): string => (string) $description, $testMethod->describing);
            $describePrefix = implode('', array_map(static fn (string $description): string => '`'.$description.'` → ', $describe));
            $description = (string) $testMethod->description;
            if (! str_starts_with($description, $describePrefix) || strlen($description) === strlen($describePrefix)) {
                fail("{$id}: the description ".json_encode($description, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE).' does not start with its describe prefix '.json_encode($describePrefix, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            }
            $name = substr($description, strlen($describePrefix));

            $data = pestDatasetExport($datasets, $dataProvider, $replace, $class, $method, $id, $dataset);

            $closure = new ReflectionFunction($testMethod->closure);
            $closureFile = $closure->getFileName();
            if ($closureFile === false) {
                fail("{$id}: the test closure has no file");
            }
            if (realpath($closureFile) === realpath((string) $defaultClosureFile)) {
                [$tokens, $start, $end] = archStatement($filename, $name, $id);
                $sourceFile = $filename;
            } else {
                $start = (int) $closure->getStartLine();
                $end = (int) $closure->getEndLine();
                $tokens = testClosureTokens($closureFile, $start, $end, $id);
                $sourceFile = $closureFile;
            }

            $lines[] = pestRawLine($id, $class, $method, $dataset, $root, $filename, $describe, $name, $sourceFile, $start, $end, $tokens, $data, $reflectionClass);
        }
    }
    if ($lines === []) {
        fail('pest listed no tests');
    }
    if (file_put_contents($outFile, implode('', $lines)) === false) {
        fail("cannot write {$outFile}");
    }
}

/**
 * The export of the listed dataset $dataset of $class::$method (null without
 * one), computing and caching every label's export on the first call.
 *
 * @param  array<string, array<string, string>|null>  $datasets
 * @param  array<string, string>  $replace
 */
function pestDatasetExport(array &$datasets, PHPUnit\Metadata\Api\DataProvider $dataProvider, array $replace, string $class, string $method, string $id, ?string $dataset): ?string
{
    if ($dataset === null) {
        return null;
    }
    $prefix = $class.'::'.$method;
    if (! array_key_exists($prefix, $datasets)) {
        pinRandomness($prefix);
        ob_start();
        try {
            $provided = $dataProvider->providedData($class, $method);
        } catch (Throwable $error) {
            ob_end_clean();
            fail("{$prefix}: the dataset failed: ".$error::class.': '.$error->getMessage());
        }
        $stray = ob_get_clean();
        if ($stray !== '' && $stray !== false) {
            fail("{$prefix}: the dataset wrote output: {$stray}");
        }
        $exports = null;
        if ($provided !== null) {
            $exports = [];
            foreach ($provided as $label => $providedData) {
                $value = $providedData->value();
                $first = $value === [] ? null : $value[array_key_first($value)];
                if (count($value) === 1 && $first instanceof Pest\Exceptions\DatasetProviderError) {
                    fail("{$prefix}: the dataset failed: ".($first->getPrevious() ?? $first)->getMessage());
                }
                $exports[(string) $label] = strtr(export($value), $replace);
            }
        }
        $datasets[$prefix] = $exports;
    }
    $exports = $datasets[$prefix];
    if ($exports === null || ! array_key_exists($dataset, $exports)) {
        fail("{$id}: dataset ".json_encode($dataset, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE).' matches no provider label');
    }

    return $exports[$dataset];
}

/**
 * One raw Pest line.
 *
 * @param  list<string>  $describe
 * @param  list<string>  $tokens
 */
function pestRawLine(string $id, string $class, string $method, ?string $dataset, string $root, string $file, array $describe, string $name, string $sourceFile, int $start, int $end, array $tokens, ?string $data, ReflectionClass $reflectionClass): string
{
    return json_encode([
        'id' => $id,
        'class' => $class,
        'method' => $method,
        'dataset' => $dataset,
        'file' => relativePath($root, $file),
        'describe' => $describe,
        'name' => $name,
        'source' => ['file' => relativePath($root, $sourceFile), 'start' => $start, 'end' => $end],
        'tokens' => $tokens,
        'data' => $data,
        'requiresDatabase' => requiredDatabases($reflectionClass, new ReflectionMethod($class, $method)),
        'redis' => usesRedis($reflectionClass),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR)."\n";
}
