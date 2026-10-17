<?php

// The baseline runner (Story 2.6; FR-3, FR-113).
//
//   php runner.php <suite-dir> <php-version> <phpunit|pest> <files-list|->
//
// Runs inside the Oracle image (or against a locked local install). It:
//
//   1. refuses any PHP other than <php-version>;
//   2. writes a generated configuration beside <suite-dir>'s phpunit.xml.dist:
//      the same file, with its test suites reduced to the test files listed
//      one per line in <files-list> (relative to <suite-dir>), or kept whole
//      for `-`; tools/baseline/recorder.php's extension added to the existing
//      extensions; and the result cache off;
//   3. runs `PHP_BINARY -d memory_limit=-1 -d auto_prepend_file=recorder.php
//      vendor/bin/<runner> --configuration <generated> --colors=never
//      --do-not-cache-result` in <suite-dir> (no memory limit, as on
//      Upstream's CI, where setup-php sets memory_limit=-1; a <php> <ini> in
//      the configuration still applies), with XARAVEL_BASELINE_OUT naming the recorder's output
//      file. The runner's own output goes to stderr. Its exit code is ignored:
//      Upstream failures are data;
//   4. fails when the recorder never loaded, and otherwise copies the
//      recorder's lines to stdout. It removes the generated configuration and
//      its temp files on the way out.
//
// Exit codes: 0 success, 1 any failure (the reason is on stderr), 2 usage.

declare(strict_types=1);

function fail(string $message): never
{
    fwrite(STDERR, "runner: {$message}\n");
    exit(1);
}

if ($argc !== 5 || ! in_array($argv[3], ['phpunit', 'pest'], true)) {
    fwrite(STDERR, "usage: php runner.php <suite-dir> <php-version> <phpunit|pest> <files-list|->\n");
    exit(2);
}
[, $suiteArg, $expectedVersion, $runner, $filesArg] = $argv;

if (PHP_VERSION !== $expectedVersion) {
    fail('expected PHP '.$expectedVersion.', running PHP '.PHP_VERSION);
}
$root = realpath($suiteArg);
if ($root === false || ! is_dir($root)) {
    fail("{$suiteArg} is not a directory");
}
foreach (["vendor/bin/{$runner}", 'vendor/phpunit/phpunit/src/Framework/Assert.php', 'phpunit.xml.dist'] as $required) {
    if (! is_file($root.'/'.$required)) {
        fail("{$root}/{$required} is missing");
    }
}
$recorder = __DIR__.'/recorder.php';
if (! is_file($recorder)) {
    fail("{$recorder} is missing");
}

$files = null;
if ($filesArg !== '-') {
    $text = file_get_contents($filesArg);
    if ($text === false) {
        fail("cannot read {$filesArg}");
    }
    $files = array_values(array_filter(explode("\n", $text), static fn (string $line): bool => $line !== ''));
    if ($files === []) {
        fail("{$filesArg} lists no test files");
    }
    foreach ($files as $file) {
        if (str_starts_with($file, '/') || str_contains($file, '..') || ! is_file($root.'/'.$file)) {
            fail("{$file} is not a test file in {$root}");
        }
    }
}

// ---------------------------------------------------------------------------
// The generated configuration

$config = new DOMDocument;
$config->preserveWhiteSpace = true;
if (! $config->load($root.'/phpunit.xml.dist')) {
    fail('cannot parse phpunit.xml.dist');
}
$phpunit = $config->documentElement;
if ($phpunit === null || $phpunit->nodeName !== 'phpunit') {
    fail('phpunit.xml.dist has no <phpunit> root');
}
$phpunit->setAttribute('cacheResult', 'false');
if ($files !== null) {
    foreach (iterator_to_array($phpunit->getElementsByTagName('testsuites')) as $old) {
        $old->parentNode?->removeChild($old);
    }
    $suites = $config->createElement('testsuites');
    $suite = $config->createElement('testsuite');
    $suite->setAttribute('name', 'xaravel-baseline');
    foreach ($files as $file) {
        $suite->appendChild($config->createElement('file', htmlspecialchars($file, ENT_XML1)));
    }
    $suites->appendChild($suite);
    $phpunit->insertBefore($suites, $phpunit->firstChild);
}
$extensions = $phpunit->getElementsByTagName('extensions')->item(0);
if ($extensions === null) {
    $extensions = $config->createElement('extensions');
    $phpunit->appendChild($extensions);
}
$bootstrap = $config->createElement('bootstrap');
$bootstrap->setAttribute('class', 'Xaravel\\Baseline\\Extension');
$extensions->appendChild($bootstrap);

$generated = $root.'/phpunit.xaravel-baseline.xml';
$out = tempnam(sys_get_temp_dir(), 'xaravel-baseline-');
if ($out === false) {
    fail('cannot create a temp file');
}
register_shutdown_function(static function () use ($generated, $out): void {
    @unlink($generated);
    @unlink($out);
    @unlink($out.'.loaded');
});
if ($config->save($generated) === false) {
    fail("cannot write {$generated}");
}

// ---------------------------------------------------------------------------
// The run

$env = getenv();
$env['XARAVEL_BASELINE_OUT'] = $out;
$env['XARAVEL_BASELINE_ROOT'] = $root;
$process = proc_open(
    [PHP_BINARY, '-d', 'memory_limit=-1', '-d', 'auto_prepend_file='.$recorder, "vendor/bin/{$runner}", '--configuration', $generated, '--colors=never', '--do-not-cache-result'],
    [0 => ['file', '/dev/null', 'r'], 1 => STDERR, 2 => STDERR],
    $pipes,
    $root,
    $env,
);
if (! is_resource($process)) {
    fail("cannot start {$runner}");
}
$status = proc_close($process);
fwrite(STDERR, "runner: {$runner} exited {$status}\n");

if (! is_file($out.'.loaded')) {
    fail("the recorder never loaded ({$runner} exited {$status})");
}
$lines = file_get_contents($out);
if ($lines === false) {
    fail("cannot read {$out}");
}
fwrite(STDOUT, $lines);
exit(0);
