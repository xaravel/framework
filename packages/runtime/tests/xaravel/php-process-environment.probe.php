<?php
// The PHP 8.5.11 evidence for XT-runtime-139..142 (php-process-environment.test.ts), action item
// epic-15-item-3-runtime-process-environment (ESC-15.2-1 part g, ESC-15.2-2, ESC-15.2-3): getenv, putenv, the CLI's
// seeding of $_SERVER and $_ENV, and file_get_contents, as vlucas/phpdotenv v5.7.0 calls them. Each line is
// `<label>\t<json_encode(argument lists)>\t<json_encode(results)>`: the test reads each argument list, runs the same
// call with the runtime, and compares the JSON of its results with the recorded one. A throw is
// `"<class>: <message>"`. Run with error_reporting=0: PHP's warnings are not raised by the runtime (DIV-9.17).
// Every environment name the probe sets starts with XP_ (or is a fixed digit name), and each is unset after its call.
// The seeding label runs a `php -n` child (no php.ini, so PHP's built-in variables_order EGPCS, as the Oracle image's
// `php:8.5.11-cli-trixie` has no php.ini either) with a fixed environment; macOS adds __CF_USER_TEXT_ENCODING to a
// child's environment, which the child leaves out. The file labels read fixtures this probe writes to a fresh temp
// directory; each argument list names a fixture relative to it (a name with `://` is passed as it is, relative to the
// working directory).
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-process-environment.probe.php > php-process-environment.probe.txt

function attempt(callable $fn): mixed
{
    try {
        return $fn();
    } catch (Throwable $e) {
        return get_class($e) . ': ' . $e->getMessage();
    }
}

/** One label: its argument lists, and each list's result through `$run`. */
function record(string $label, array $calls, callable $run): void
{
    echo $label, "\t", json_encode($calls), "\t", json_encode(array_map(fn ($args) => attempt(fn () => $run(...$args)), $calls)), "\n";
}

/** The names a call's assignments set, unset afterwards. */
function cleanup(array $assignments): void
{
    foreach ($assignments as $assignment) {
        if (is_string($assignment) && $assignment !== '' && $assignment[0] !== '=') {
            putenv(explode('=', $assignment, 2)[0]);
        }
    }
}

// XT-runtime-139: getenv after the assignments, then the names unset. A name holding `=` is left out: libc decides it
// (glibc, the Oracle image's, finds no entry; macOS's matches the name before the `=`).
record('getenv', [
    [['XP_Q=a=b'], 'XP_Q'], [[], 'XP_UNSET'], [[], ''], [['XP.D=1'], 'XP.D'], [['XP S=2'], 'XP S'], [['XP[=3'], 'XP['],
    [['XP_E='], 'XP_E'], [['XP_Q=a=b'], 'XP_Q', true], [['XP_Q=a=b'], 'XP_Q', 0], [['5=five'], 5],
    [['XP_É=é'], 'XP_É'], [['XP_Q=x'], 'xp_q'], [[], []], [['XP_Q=a'], 'XP_Q', []], [['XP_Q=a'], 'XP_Q', null],
    [['XP_Q=a'], 1.5], [['XP_Q=a'], false],
], function (array $assignments, ...$args) {
    try {
        foreach ($assignments as $assignment) {
            putenv($assignment);
        }
        return getenv(...$args);
    } finally {
        cleanup($assignments);
    }
});

// XT-runtime-139: putenv's results, then getenv of each name.
record('putenv', [
    [['XP_N=v'], ['XP_N']], [['XP_N='], ['XP_N']], [['XP_N=v', 'XP_N'], ['XP_N']], [['XP_A=b=c'], ['XP_A']], [[''], []],
    [['=x'], []], [['='], []], [['=x=y'], []], [['XP S=1', 'XP.D=2', 'XP[=3'], ['XP S', 'XP.D', 'XP[']], [['XP_U'], ['XP_U']],
    [['12=x'], ['12', 12]], [[5], ['5']], [[null], []], [[[]], []], [[true], ['1']], [[false], []], [[1.5], ['1.5']],
    [['XP_N=v', 'XP_N=w'], ['XP_N']], [['XP_É=é', 'XP_N= sp '], ['XP_É', 'XP_N']], [['XP_N==v'], ['XP_N']],
], function (array $assignments, array $names) {
    try {
        $results = [];
        foreach ($assignments as $assignment) {
            $results[] = attempt(fn () => putenv($assignment));
        }
        return [$results, array_map(fn ($name) => getenv($name), $names)];
    } finally {
        cleanup($assignments);
    }
});

// XT-runtime-140: a `php -n` child started with the fixed environment: $_ENV, $_SERVER's environment entries,
// getenv() and getenv(null), each as [key, value] pairs (an int key stays an int; $_SERVER's CLI keys left out); then, after putenv('Z=changed'),
// putenv('E') and putenv('NEW=1'), $_ENV and $_SERVER unchanged while getenv sees the change.
$child = <<<'PHP'
$cli = ['PHP_SELF', 'SCRIPT_NAME', 'SCRIPT_FILENAME', 'PATH_TRANSLATED', 'DOCUMENT_ROOT', 'REQUEST_TIME_FLOAT', 'REQUEST_TIME', 'argv', 'argc'];
$pairs = function (array $a, bool $server = false) use ($cli): array {
    $out = [];
    foreach ($a as $k => $v) {
        if ($k !== '__CF_USER_TEXT_ENCODING' && !($server && in_array($k, $cli, true))) {
            $out[] = [$k, $v];
        }
    }
    return $out;
};
$env = $pairs($_ENV);
$server = $pairs($_SERVER, true);
$all = $pairs(getenv());
$null = $pairs(getenv(null));
putenv('Z=changed');
putenv('E');
putenv('NEW=1');
echo json_encode([$env, $server, $all, $null, [$pairs($_ENV) === $env, $pairs($_SERVER, true) === $server,
    getenv('Z'), getenv('E'), getenv('NEW'), $pairs(getenv())]]);
PHP;
$environments = [
    [['12', 'x'], ['A.B', '1'], ['A B', '2'], ['A[', '3'], ['Z', 'z'], ['E', ''], ['Q', 'a=b'], ['-3', 'm'], ['007', 'o'],
        ['A]', '4'], ['A-B', '5'], ['É', 'é'], ['PHP_SELF', 'p'], ['a', 'lower'], ['A', 'upper'], ['_', 'u']],
    [['Z', 'z'], ['E', '']],
];
record('seeding', array_map(fn ($environment) => [$environment], $environments), function (array $environment) use ($child) {
    // Through env -i: proc_open's $env array cannot hold an integer-like name.
    $command = array_merge(['/usr/bin/env', '-i'], array_map(fn ($pair) => "$pair[0]=$pair[1]", $environment), [PHP_BINARY, '-n', '-r', $child]);
    $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $out = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);
    return json_decode($out);
});

// XT-runtime-141: file_get_contents over fixtures in a fresh temp directory.
$dir = sys_get_temp_dir() . '/xaravel-fgc-' . getmypid();
@mkdir($dir);
file_put_contents("$dir/ascii", "hello world\n");
file_put_contents("$dir/utf8", "héllo wörld ✓\n");
file_put_contents("$dir/empty", '');
@mkdir("$dir/sub");
$read = fn ($name, ...$args) => file_get_contents(is_string($name) && $name !== '' && !str_contains($name, '://') ? "$dir/$name" : $name, ...$args);
$reads = [];
foreach ([0, 1, 5, 11, 12, 13, 100, -1, -5, -12, -13, -100, PHP_INT_MAX, PHP_INT_MIN] as $offset) {
    foreach ([null, 0, 1, 4, 100, PHP_INT_MAX] as $length) {
        $reads[] = ['ascii', false, null, $offset, $length];
    }
}
record('file_get_contents', array_merge([['ascii'], ['utf8'], ['empty'], ['ascii', false], ['ascii', 0, null, '1', '2'],
    ['ascii', false, null, 1.5], ['ascii', false, null, null, null], ['utf8', false, null, 1, 2], ['utf8', false, null, 3],
    ['utf8', false, null, -4], ['utf8', false, null, -4, 3], ['utf8', false, null, 8, 2], ['utf8', false, null, 18],
    ['utf8', false, null, 19], ['utf8', false, null, -18], ['utf8', false, null, -19], ['empty', false, null, 0, 0],
    ['empty', false, null, 1], ['empty', false, null, -1],
], $reads), $read);
record('file_get_contents.failures', [
    ['missing'], ['missing', false, null, 0, 0], ['ascii/x'], ['sub/missing'], ['sub/../ascii'], ['ascii/'], ['sub'], ['sub/'],
    ['sub', false, null, 1], ['sub', false, null, -1], ['sub', false, null, 0, 0], [''], ["a\0b"], ['ascii', false, null, 0, -1],
    ['missing', false, null, 0, -1], ['', false, null, 0, -1], ["a\0b", false, null, 0, -1], [[]], ['ascii', []],
    ['ascii', false, null, 'x'], ['ascii', false, null, 0, 'x'], ['ascii', false, null, 0, []], ['foo://x'], ['c://x'],
], $read);
foreach (['ascii', 'utf8', 'empty'] as $name) {
    unlink("$dir/$name");
}
rmdir("$dir/sub");
rmdir($dir);

// XT-runtime-142: every new function's ReflectionFunction counts and its ArgumentCountErrors.
$new = ['file_get_contents', 'getenv', 'putenv'];
record('reflection', array_map(fn ($n) => [$n], $new), function ($name) {
    $function = new ReflectionFunction($name);
    $refs = [];
    foreach ($function->getParameters() as $index => $parameter) {
        if ($parameter->isPassedByReference()) {
            $refs[] = $index;
        }
    }
    return [$function->getName(), $function->getNumberOfRequiredParameters(), $function->getNumberOfParameters(), $function->isVariadic(), $refs];
});
record('counts', array_map(fn ($n) => [$n], $new), function ($name) {
    $function = new ReflectionFunction($name);
    $few = $function->getNumberOfRequiredParameters() > 0 ? attempt(fn () => call_user_func_array($name, [])) : null;
    $many = attempt(fn () => call_user_func_array($name, array_fill(0, $function->getNumberOfParameters() + 1, null)));
    return [$few, $many];
});
