<?php

// The API-surface exporter behind `bun run oracle:api-surface` (Story 3.5;
// FR-6, AD-15, PRD §5.1).
//
//   php api-surface.php <autoload.php> <src dir> <classes file>
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
// A type that fails to autoload (`Class|Interface|Trait "X" not found`) is
// defined as an empty stub of that kind and the load is retried. A
// declaration's `stubbed` lists, sorted, every stub among its parent classes,
// interfaces and traits (and theirs), whatever the load order. tools/oracle/api-surface.ts
// re-renders, validates and sorts the lines (docs/ops/oracle.md, API surface).
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

if ($argc !== 4) {
    fwrite(STDERR, "usage: php api-surface.php <autoload.php> <src dir> <classes file>\n");
    exit(2);
}

[, $autoload, $srcArg, $listFile] = $argv;
$srcReal = realpath($srcArg);
if ($srcReal === false || !is_dir($srcReal)) {
    fail("{$srcArg} is not a directory");
}
if (!is_file($autoload)) {
    fail("{$autoload} does not exist");
}
$list = file($listFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
if ($list === false) {
    fail("cannot read {$listFile}");
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

    foreach (get_defined_functions()['user'] as $name) {
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

    $current = 'the output';
    $out = '';
    foreach ($lines as $line) {
        $out .= json_encode($line, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION) . "\n";
    }
} catch (Throwable $error) {
    fail("{$current}: " . get_class($error) . ': ' . $error->getMessage());
}
echo $out;
