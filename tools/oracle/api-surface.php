<?php

// The API-surface exporter behind `bun run oracle:api-surface` (Story 3.5;
// FR-6, AD-15, PRD §5.1).
//
//   php api-surface.php <autoload.php> <src dir> <classes file>
//   php api-surface.php --interfaces <package> <version> <autoload.php> <src dir>
//
// Loads <autoload.php>, then reflects every FQCN listed (one per line) in
// <classes file> and every user function whose file is under <src dir>. It
// writes one JSON line per record to stdout:
//
//   {"fqcn","kind","member":null,"stubbed":[…]}                 class, interface, trait or enum
//   {"fqcn","kind":"method","member","static","parameters","returns","nullable"}
//   {"fqcn","kind":"property","member","static","type","nullable"}
//   {"fqcn","kind":"constant"|"case","member","static":true}
//   {"fqcn","kind":"function","member":null,"static":false,"parameters","returns","nullable","file"}
//
// A parameter is {"name","type","nullable","default","optional","variadic","byRef"}.
// Members are public and declared by the class itself (trait-imported members
// count, inherited ones do not). `type` and `returns` are PHP's type string,
// or null when untyped; `nullable` is allowsNull(), and untyped counts as
// nullable. `default` is null when there is none, else PHP source: a constant
// name (an unqualified global constant loses its namespace fallback prefix),
// `new …` as Reflection prints it, `Enum::Case` (FQCN without a leading
// backslash), or a compact literal; any other object default fails the run.
// A function's `file` is relative to <src dir>.
//
// After the reflection, it cross-checks the class list (Story 6.5): every
// class, interface, trait or enum declared from a file under <src dir>
// (get_declared_classes(), get_declared_interfaces(), get_declared_traits())
// and every named class-like a non-blade `.php` file under <src dir> declares
// (PHP tokenizer) must be listed. Each one that is not is printed to stderr,
// sorted, as `api-surface: the class list misses <FQCN> (declared in <path
// under src>)`, and the run exits 1 with no stdout: a class the static scan
// missed must not vanish from the surface silently.
//
// A type that fails to autoload (`Class|Interface|Trait "X" not found`) is
// defined as an empty stub of that kind and the load is retried. A
// declaration's `stubbed` lists, sorted, every stub among its parent classes,
// interfaces and traits (and theirs), whatever the load order. tools/oracle/api-surface.ts
// re-renders, validates and sorts the lines (docs/ops/oracle.md, API surface).
//
// The interfaces mode (ESC-10.1-4) exports a Composer package that is not
// Upstream source, such as psr/log: it first checks that
// Composer\InstalledVersions reports <package> installed at <version> (else
// `api-surface: <package> is installed at <v>, the lock pins <version>`), then
// reflects every interface a non-blade `.php` file under <src dir> declares
// (PHP tokenizer), sorted; none at all fails the run (`api-surface: <package>
// declares no interface under <src dir>`). Each must load as an interface (else
// `api-surface: <FQCN> is not an interface`). Classes, traits, enums and
// functions are not exported, and there is no class-list cross-check: the
// list comes from the same scan.
//
// Exit codes: 0 success, 1 any failure (the reason is on stderr), 2 usage.

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

function fail(string $message): never
{
    fwrite(STDERR, "api-surface: {$message}\n");
    exit(1);
}

$interfaces = $argc === 6 && $argv[1] === '--interfaces';
if (!$interfaces && ($argc !== 4 || $argv[1] === '--interfaces')) {
    fwrite(STDERR, "usage: php api-surface.php <autoload.php> <src dir> <classes file>\n       php api-surface.php --interfaces <package> <version> <autoload.php> <src dir>\n");
    exit(2);
}

if ($interfaces) {
    [, , $package, $version, $autoload, $srcArg] = $argv;
} else {
    [, $autoload, $srcArg, $listFile] = $argv;
}
$srcReal = realpath($srcArg);
if ($srcReal === false || !is_dir($srcReal)) {
    fail("{$srcArg} is not a directory");
}
if (!is_file($autoload)) {
    fail("{$autoload} does not exist");
}
if (!$interfaces) {
    $list = file($listFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($list === false) {
        fail("cannot read {$listFile}");
    }
}

set_error_handler(static function (int $level, string $message, string $file, int $line): bool {
    fail("PHP error {$level} at {$file}:{$line}: {$message}");
});

require $autoload;

function typeOf(?ReflectionType $type): ?string
{
    return $type === null ? null : (string) $type;
}

function nullableOf(?ReflectionType $type): bool
{
    return $type === null ? true : $type->allowsNull();
}

function literal(mixed $value): string
{
    if ($value === null) {
        return 'null';
    }
    if (is_bool($value)) {
        return $value ? 'true' : 'false';
    }
    if (is_int($value)) {
        return (string) $value;
    }
    if (is_float($value) || is_string($value)) {
        return var_export($value, true);
    }
    if (is_array($value)) {
        $isList = array_is_list($value);
        $items = [];
        foreach ($value as $key => $item) {
            $items[] = ($isList ? '' : literal($key) . ' => ') . literal($item);
        }
        return '[' . implode(', ', $items) . ']';
    }
    if ($value instanceof UnitEnum) {
        return get_class($value) . '::' . $value->name;
    }
    fail('cannot render a default holding an object of class ' . get_debug_type($value));
}

/** An unqualified constant in namespaced code reports the namespaced fallback name; this gives the global one. */
function constantName(string $name): string
{
    if (!str_contains($name, '::') && str_contains($name, '\\') && !defined($name)) {
        $short = substr($name, strrpos($name, '\\') + 1);
        if (defined($short)) {
            return $short;
        }
    }
    return $name;
}

function defaultOf(ReflectionParameter $parameter): ?string
{
    if (!$parameter->isDefaultValueAvailable()) {
        return null;
    }
    if ($parameter->isDefaultValueConstant()) {
        return constantName((string) $parameter->getDefaultValueConstantName());
    }
    $value = $parameter->getDefaultValue();
    if (is_object($value) && !($value instanceof UnitEnum)) {
        if (preg_match('/ = (new .*) \]$/', (string) $parameter, $match) !== 1) {
            fail("cannot read the `new` default of \${$parameter->getName()} from " . (string) $parameter);
        }
        return $match[1];
    }
    return literal($value);
}

function parametersOf(ReflectionFunctionAbstract $function): array
{
    $out = [];
    foreach ($function->getParameters() as $parameter) {
        $out[] = [
            'name' => $parameter->getName(),
            'type' => typeOf($parameter->getType()),
            'nullable' => nullableOf($parameter->getType()),
            'default' => defaultOf($parameter),
            'optional' => $parameter->isOptional(),
            'variadic' => $parameter->isVariadic(),
            'byRef' => $parameter->isPassedByReference(),
        ];
    }
    return $out;
}

/** Loads $fqcn, stubbing each missing parent type it names; each stub's name becomes a key of $stubs. */
function load(string $fqcn, array &$stubs): void
{
    for ($attempt = 0; $attempt <= 20; $attempt++) {
        try {
            if (class_exists($fqcn) || interface_exists($fqcn) || trait_exists($fqcn) || enum_exists($fqcn)) {
                return;
            }
            fail("{$fqcn} is not found");
        } catch (Error $error) {
            if (preg_match('/^(Class|Interface|Trait) "([^"]+)" not found$/', $error->getMessage(), $match) !== 1) {
                fail("{$fqcn} failed to load: " . get_class($error) . ': ' . $error->getMessage());
            }
            $keyword = strtolower($match[1]);
            $name = ltrim($match[2], '\\');
            $pos = strrpos($name, '\\');
            $namespace = $pos === false ? '' : substr($name, 0, $pos);
            $short = $pos === false ? $name : substr($name, $pos + 1);
            if (class_exists($name, false) || interface_exists($name, false) || trait_exists($name, false)) {
                fail("{$fqcn} failed to load: {$name} is reported missing but is defined");
            }
            eval(($namespace === '' ? '' : "namespace {$namespace}; ") . "{$keyword} {$short} {}");
            $stubs[$name] = true;
        } catch (Throwable $error) {
            fail("{$fqcn} failed to load: " . get_class($error) . ': ' . $error->getMessage());
        }
    }
    fail("{$fqcn} needs more than 20 stubs");
}

function underSrc(string|false $file, string $srcReal): string|null
{
    if ($file === false) {
        return null;
    }
    $real = realpath($file);
    if ($real === false || !str_starts_with($real, $srcReal . '/')) {
        return null;
    }
    return substr($real, strlen($srcReal) + 1);
}

/** The stubs among $class's parent classes, interfaces and traits (and theirs), sorted. */
function stubbedOf(ReflectionClass $class, array $stubs): array
{
    $names = $class->getInterfaceNames();
    for ($current = $class; $current !== false; $current = $current->getParentClass()) {
        if ($current !== $class) {
            $names[] = $current->getName();
        }
        $pending = $current->getTraitNames();
        while ($pending !== []) {
            $trait = array_shift($pending);
            $names[] = $trait;
            if (!isset($stubs[$trait])) {
                $pending = [...$pending, ...(new ReflectionClass($trait))->getTraitNames()];
            }
        }
    }
    $out = array_values(array_unique(array_filter($names, static fn (string $name): bool => isset($stubs[$name]))));
    sort($out, SORT_STRING);
    return $out;
}

/**
 * The named class-likes a PHP file declares, by the tokenizer: `class`, `interface`, `trait` or `enum` (or only the
 * keywords in $kinds) followed by a name, not after `::` or `new`.
 */
function declaredIn(string $code, array $kinds = [T_CLASS, T_INTERFACE, T_TRAIT, T_ENUM]): array
{
    $tokens = array_values(array_filter(
        token_get_all($code),
        static fn (array|string $token): bool => !is_array($token) || !in_array($token[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true),
    ));
    $namespace = '';
    $out = [];
    foreach ($tokens as $i => $token) {
        if (!is_array($token)) {
            continue;
        }
        $next = $tokens[$i + 1] ?? null;
        if ($token[0] === T_NAMESPACE) {
            if (is_array($next) && in_array($next[0], [T_STRING, T_NAME_QUALIFIED], true)) {
                $namespace = $next[1];
            } elseif ($next === '{') {
                $namespace = '';
            }
            continue;
        }
        if (!in_array($token[0], $kinds, true) || !is_array($next) || $next[0] !== T_STRING) {
            continue;
        }
        $previous = $tokens[$i - 1] ?? null;
        if (is_array($previous) && in_array($previous[0], [T_DOUBLE_COLON, T_NEW], true)) {
            continue;
        }
        $out[] = ($namespace === '' ? '' : $namespace . '\\') . $next[1];
    }
    return $out;
}

/** Every non-blade `.php` file under $dir, as paths relative to it, sorted. */
function phpFiles(string $dir): array
{
    $out = [];
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        $path = $file->getPathname();
        if ($file->isFile() && str_ends_with($path, '.php') && !str_ends_with($path, '.blade.php')) {
            $out[] = substr($path, strlen($dir) + 1);
        }
    }
    sort($out, SORT_STRING);
    return $out;
}

/**
 * The class-likes under $srcReal the class list misses (Story 6.5): those declared from a file under it (by
 * get_declared_classes(), get_declared_interfaces() and get_declared_traits(), enums included; anonymous classes
 * and aliases skipped), and those its non-blade `.php` files declare (by the tokenizer). FQCN => path under src, sorted.
 */
function missedClasses(array $list, string $srcReal): array
{
    $listed = [];
    foreach ($list as $fqcn) {
        $listed[strtolower($fqcn)] = true;
    }
    $missed = [];
    foreach ([...get_declared_classes(), ...get_declared_interfaces(), ...get_declared_traits()] as $name) {
        $class = new ReflectionClass($name);
        if ($class->isAnonymous() || $class->getName() !== $name) {
            continue;
        }
        $file = underSrc($class->getFileName(), $srcReal);
        if ($file !== null && !isset($listed[strtolower($name)])) {
            $missed[$name] = $file;
        }
    }
    foreach (phpFiles($srcReal) as $path) {
        $code = file_get_contents($srcReal . '/' . $path);
        if ($code === false) {
            fail("cannot read {$path}");
        }
        foreach (declaredIn($code) as $name) {
            if (!isset($listed[strtolower($name)]) && !isset($missed[$name])) {
                $missed[$name] = $path;
            }
        }
    }
    ksort($missed, SORT_STRING);
    return $missed;
}

/** The interfaces the non-blade `.php` files under $srcReal declare, by the tokenizer, sorted and unique. */
function interfacesUnder(string $srcReal): array
{
    $out = [];
    foreach (phpFiles($srcReal) as $path) {
        $code = file_get_contents($srcReal . '/' . $path);
        if ($code === false) {
            fail("cannot read {$path}");
        }
        foreach (declaredIn($code, [T_INTERFACE]) as $name) {
            $out[$name] = true;
        }
    }
    $out = array_keys($out);
    sort($out, SORT_STRING);
    return $out;
}

if ($interfaces) {
    if (!class_exists(Composer\InstalledVersions::class) || !Composer\InstalledVersions::isInstalled($package)) {
        fail("{$package} is not installed");
    }
    $installed = Composer\InstalledVersions::getPrettyVersion($package);
    if ($installed !== $version) {
        fail("{$package} is installed at " . ($installed ?? 'no version') . ", the lock pins {$version}");
    }
    $list = interfacesUnder($srcReal);
    if ($list === []) {
        fail("{$package} declares no interface under {$srcArg}");
    }
}

$stubs = [];
$lines = [];
$current = '(none)';
try {
    foreach ($list as $fqcn) {
        $current = $fqcn;
        load($fqcn, $stubs);
        $class = new ReflectionClass($fqcn);
        if ($class->getName() !== $fqcn) {
            fail("{$fqcn} is declared as {$class->getName()}");
        }
        if ($interfaces && !$class->isInterface()) {
            fail("{$fqcn} is not an interface");
        }
        if (underSrc($class->getFileName(), $srcReal) === null) {
            fail("{$fqcn} is not declared under {$srcReal} (" . var_export($class->getFileName(), true) . ')');
        }
        $kind = $class->isEnum() ? 'enum' : ($class->isInterface() ? 'interface' : ($class->isTrait() ? 'trait' : 'class'));
        $lines[] = ['fqcn' => $fqcn, 'kind' => $kind, 'member' => null, 'stubbed' => stubbedOf($class, $stubs)];
        foreach ($class->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
            if ($method->getDeclaringClass()->getName() !== $fqcn) {
                continue;
            }
            $lines[] = [
                'fqcn' => $fqcn,
                'kind' => 'method',
                'member' => $method->getName(),
                'static' => $method->isStatic(),
                'parameters' => parametersOf($method),
                'returns' => typeOf($method->getReturnType()),
                'nullable' => nullableOf($method->getReturnType()),
            ];
        }
        foreach ($class->getProperties(ReflectionProperty::IS_PUBLIC) as $property) {
            if ($property->getDeclaringClass()->getName() !== $fqcn) {
                continue;
            }
            $lines[] = [
                'fqcn' => $fqcn,
                'kind' => 'property',
                'member' => $property->getName(),
                'static' => $property->isStatic(),
                'type' => typeOf($property->getType()),
                'nullable' => nullableOf($property->getType()),
            ];
        }
        foreach ($class->getReflectionConstants(ReflectionClassConstant::IS_PUBLIC) as $constant) {
            if ($constant->getDeclaringClass()->getName() !== $fqcn) {
                continue;
            }
            $lines[] = ['fqcn' => $fqcn, 'kind' => $constant->isEnumCase() ? 'case' : 'constant', 'member' => $constant->getName(), 'static' => true];
        }
    }

    foreach ($interfaces ? [] : get_defined_functions()['user'] as $name) {
        $current = "function {$name}";
        $function = new ReflectionFunction($name);
        $file = underSrc($function->getFileName(), $srcReal);
        if ($file === null) {
            continue;
        }
        $lines[] = [
            'fqcn' => $function->getName(),
            'kind' => 'function',
            'member' => null,
            'static' => false,
            'parameters' => parametersOf($function),
            'returns' => typeOf($function->getReturnType()),
            'nullable' => nullableOf($function->getReturnType()),
            'file' => $file,
        ];
    }

    $current = 'the class-list cross-check';
    $missed = $interfaces ? [] : missedClasses($list, $srcReal);
    if ($missed !== []) {
        foreach ($missed as $fqcn => $path) {
            fwrite(STDERR, "api-surface: the class list misses {$fqcn} (declared in {$path})\n");
        }
        exit(1);
    }

    $current = 'the output';
    $out = '';
    foreach ($lines as $line) {
        $out .= json_encode($line, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION) . "\n";
    }
} catch (Throwable $error) {
    fail("{$current}: " . get_class($error) . ': ' . $error->getMessage());
}
echo $out;
