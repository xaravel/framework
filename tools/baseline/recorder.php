<?php

// The baseline recorder (Story 2.6; FR-3, FR-113).
//
// tools/baseline/runner.php runs PHPUnit or Pest with this file as PHP's
// `auto_prepend_file` and XARAVEL_BASELINE_OUT naming an output file. Without
// that variable the file does nothing. With it, before Composer can load
// anything, it (XARAVEL_BASELINE_ROOT names the suite directory, default the
// working directory):
//
//   1. defines `PHPUnit\Framework\Assert` from a tokenizer rewrite of the
//      suite's own `vendor/phpunit/phpunit/src/Framework/Assert.php`, included
//      under its own path through a `file` stream wrapper that serves the
//      rewritten source (so PHPUnit's preload `require_once` of the original
//      is a no-op): every
//      `public static function assert*` body starts with a call that records
//      the method's name when its caller frame's class is not exactly
//      `PHPUnit\Framework\Assert` (an outermost call). Vendor stays untouched;
//   2. registers an autoloader for `Xaravel\Baseline\*`, which holds the
//      PHPUnit extension the generated configuration bootstraps, and its event
//      subscribers. They track the running test (PreparationStarted to
//      Finished) and its outcome (Passed, Skipped, MarkedIncomplete, Failed,
//      Errored), and the class-level outcomes (BeforeFirstTestMethodErrored,
//      BeforeFirstTestMethodFailed, and a skipped test suite);
//   3. at shutdown, appends one JSON line per test to the output file:
//
//      {"test":string|null,"class":string|null,"outcome":"pass"|"skip"|"fail"|null,"assertions":{kind:count}}
//
//      `test` is PHPUnit's test id (`<class>::<method>#<dataset>`). A
//      class-level outcome has `test` null and `class` set, to the class, or
//      to `<class>::<method>` for a data-provider method's suite. A process
//      that ran a test in isolation has no subscribers; it finds the running
//      test in its call stack and writes `outcome` null (the parent process
//      receives the child's outcome events).
//
// When the extension bootstraps, it creates `<output file>.loaded`, which the
// runner requires.

declare(strict_types=1);

namespace Xaravel\Baseline;

final class Recorder
{
    /** The running test's id, between PreparationStarted and Finished. */
    public static ?string $current = null;

    /** @var array<string, array<string, int>> assertion counts by test id */
    public static array $assertions = [];

    /** @var array<string, string> outcome by test id */
    public static array $outcomes = [];

    /** @var array<string, string> class-level outcome by class (or `<class>::<method>`) */
    public static array $classOutcomes = [];

    public static string $out = '';

    private const RANK = ['pass' => 0, 'skip' => 1, 'fail' => 2];

    /** Called first thing in every rewritten `assert*` method. */
    public static function assertion(string $kind, ?string $callerClass): void
    {
        if ($callerClass === 'PHPUnit\Framework\Assert') {
            return;
        }
        $test = self::$current ?? self::testFromStack();
        if ($test === null) {
            return;
        }
        self::$assertions[$test][$kind] = (self::$assertions[$test][$kind] ?? 0) + 1;
    }

    /** The id of the TestCase on the call stack (for a test run in a separate process), or null. */
    private static function testFromStack(): ?string
    {
        foreach (\debug_backtrace(\DEBUG_BACKTRACE_PROVIDE_OBJECT | \DEBUG_BACKTRACE_IGNORE_ARGS) as $frame) {
            $object = $frame['object'] ?? null;
            if ($object instanceof \PHPUnit\Framework\TestCase) {
                try {
                    return $object->valueObjectForEvents()->id();
                } catch (\Throwable) {
                    return null;
                }
            }
        }

        return null;
    }

    public static function outcome(string $test, string $outcome): void
    {
        $previous = self::$outcomes[$test] ?? null;
        if ($previous === null || self::RANK[$outcome] > self::RANK[$previous]) {
            self::$outcomes[$test] = $outcome;
        }
    }

    public static function classOutcome(string $class, string $outcome): void
    {
        $previous = self::$classOutcomes[$class] ?? null;
        if ($previous === null || self::RANK[$outcome] > self::RANK[$previous]) {
            self::$classOutcomes[$class] = $outcome;
        }
    }

    public static function testId(\PHPUnit\Event\Code\Test $test): string
    {
        return $test->id();
    }

    public static function flush(): void
    {
        $lines = '';
        $tests = \array_keys(self::$outcomes + self::$assertions);
        \sort($tests, \SORT_STRING);
        foreach ($tests as $test) {
            $kinds = self::$assertions[$test] ?? [];
            \ksort($kinds, \SORT_STRING);
            $lines .= \json_encode(['test' => $test, 'class' => null, 'outcome' => self::$outcomes[$test] ?? null, 'assertions' => (object) $kinds], \JSON_UNESCAPED_SLASHES | \JSON_UNESCAPED_UNICODE | \JSON_INVALID_UTF8_SUBSTITUTE | \JSON_THROW_ON_ERROR)."\n";
        }
        $classes = \array_keys(self::$classOutcomes);
        \sort($classes, \SORT_STRING);
        foreach ($classes as $class) {
            $lines .= \json_encode(['test' => null, 'class' => $class, 'outcome' => self::$classOutcomes[$class], 'assertions' => new \stdClass], \JSON_UNESCAPED_SLASHES | \JSON_UNESCAPED_UNICODE | \JSON_INVALID_UTF8_SUBSTITUTE | \JSON_THROW_ON_ERROR)."\n";
        }
        if ($lines !== '' && \file_put_contents(self::$out, $lines, \FILE_APPEND | \LOCK_EX) === false) {
            \fwrite(\STDERR, 'recorder: cannot write '.self::$out."\n");
        }
    }
}

/**
 * A `file` stream wrapper, registered only while the recorder includes Assert.php: it serves the rewritten
 * source for that one path.
 */
final class AssertSource
{
    public static string $path = '';

    public static string $source = '';

    public static bool $served = false;

    /** @var resource|null */
    public $context;

    private int $position = 0;

    public function stream_open(string $path, string $mode, int $options, ?string &$openedPath): bool
    {
        $real = \str_starts_with($path, 'file://') ? \substr($path, 7) : $path;
        if ($real !== self::$path || $mode[0] !== 'r') {
            return false;
        }
        self::$served = true;
        $openedPath = self::$path;

        return true;
    }

    public function stream_read(int $count): string
    {
        $chunk = \substr(self::$source, $this->position, $count);
        $this->position += \strlen($chunk);

        return $chunk;
    }

    public function stream_eof(): bool
    {
        return $this->position >= \strlen(self::$source);
    }

    /** @return array<string, int> */
    public function stream_stat(): array
    {
        return ['size' => \strlen(self::$source), 'mode' => 0100644];
    }

    /** @return array<string, int>|false */
    public function url_stat(string $path, int $flags): array|false
    {
        $real = \str_starts_with($path, 'file://') ? \substr($path, 7) : $path;

        return $real === self::$path ? ['size' => \strlen(self::$source), 'mode' => 0100644] : false;
    }

    public function stream_set_option(int $option, int $arg1, ?int $arg2): bool
    {
        return false;
    }

    public function stream_close(): void
    {
    }
}

function fail(string $message): never
{
    \fwrite(\STDERR, "recorder: {$message}\n");
    exit(1);
}

/** The source of Assert.php with a record call at the start of every `public static function assert*` body. */
function rewriteAssert(string $source): string
{
    $tokens = \PhpToken::tokenize($source);
    $count = \count($tokens);
    $insertAfter = [];
    for ($i = 0; $i < $count; $i++) {
        if (! $tokens[$i]->is(\T_FUNCTION)) {
            continue;
        }
        $j = $i + 1;
        while ($j < $count && $tokens[$j]->isIgnorable()) {
            $j++;
        }
        if ($j >= $count || ! $tokens[$j]->is(\T_STRING) || ! \str_starts_with($tokens[$j]->text, 'assert')) {
            continue;
        }
        // The modifiers before `function`.
        $public = false;
        $static = false;
        for ($k = $i - 1; $k >= 0; $k--) {
            if ($tokens[$k]->isIgnorable()) {
                continue;
            }
            if ($tokens[$k]->is(\T_PUBLIC)) {
                $public = true;
            } elseif ($tokens[$k]->is(\T_STATIC)) {
                $static = true;
            } elseif (! $tokens[$k]->is([\T_FINAL, \T_ABSTRACT])) {
                break;
            }
        }
        if (! $public || ! $static) {
            continue;
        }
        // Skip the parameter list, then find the body's `{` (or `;` for an abstract method).
        $k = $j + 1;
        while ($k < $count && $tokens[$k]->text !== '(') {
            $k++;
        }
        $depth = 0;
        for (; $k < $count; $k++) {
            if ($tokens[$k]->text === '(') {
                $depth++;
            } elseif ($tokens[$k]->text === ')') {
                $depth--;
                if ($depth === 0) {
                    break;
                }
            }
        }
        for (; $k < $count; $k++) {
            if ($tokens[$k]->text === '{' || $tokens[$k]->text === ';') {
                break;
            }
        }
        if ($k < $count && $tokens[$k]->text === '{') {
            $insertAfter[$k] = true;
        }
    }
    if ($insertAfter === []) {
        fail('found no public static assert* method in Assert.php');
    }
    $call = ' \Xaravel\Baseline\Recorder::assertion(__FUNCTION__, \debug_backtrace(\DEBUG_BACKTRACE_IGNORE_ARGS, 2)[1][\'class\'] ?? null);';
    $out = '';
    foreach ($tokens as $index => $token) {
        $out .= $token->text;
        if (isset($insertAfter[$index])) {
            $out .= $call;
        }
    }

    return $out;
}

/** Declares the extension and its subscribers; PHPUnit is loaded by the time the autoloader calls this. */
function declareExtension(): void
{
    final class Extension implements \PHPUnit\Runner\Extension\Extension
    {
        public function bootstrap(\PHPUnit\TextUI\Configuration\Configuration $configuration, \PHPUnit\Runner\Extension\Facade $facade, \PHPUnit\Runner\Extension\ParameterCollection $parameters): void
        {
            $facade->registerSubscribers(
                new PreparationStarted,
                new Finished,
                new Passed,
                new Skipped,
                new MarkedIncomplete,
                new Failed,
                new Errored,
                new BeforeFirstTestMethodErrored,
                new BeforeFirstTestMethodFailed,
                new TestSuiteSkipped,
            );
            if (\file_put_contents(Recorder::$out.'.loaded', "loaded\n") === false) {
                fail('cannot write '.Recorder::$out.'.loaded');
            }
        }
    }

    final class PreparationStarted implements \PHPUnit\Event\Test\PreparationStartedSubscriber
    {
        public function notify(\PHPUnit\Event\Test\PreparationStarted $event): void
        {
            Recorder::$current = Recorder::testId($event->test());
        }
    }

    final class Finished implements \PHPUnit\Event\Test\FinishedSubscriber
    {
        public function notify(\PHPUnit\Event\Test\Finished $event): void
        {
            Recorder::$current = null;
        }
    }

    final class Passed implements \PHPUnit\Event\Test\PassedSubscriber
    {
        public function notify(\PHPUnit\Event\Test\Passed $event): void
        {
            Recorder::outcome(Recorder::testId($event->test()), 'pass');
        }
    }

    final class Skipped implements \PHPUnit\Event\Test\SkippedSubscriber
    {
        public function notify(\PHPUnit\Event\Test\Skipped $event): void
        {
            Recorder::outcome(Recorder::testId($event->test()), 'skip');
        }
    }

    final class MarkedIncomplete implements \PHPUnit\Event\Test\MarkedIncompleteSubscriber
    {
        public function notify(\PHPUnit\Event\Test\MarkedIncomplete $event): void
        {
            Recorder::outcome(Recorder::testId($event->test()), 'skip');
        }
    }

    final class Failed implements \PHPUnit\Event\Test\FailedSubscriber
    {
        public function notify(\PHPUnit\Event\Test\Failed $event): void
        {
            Recorder::outcome(Recorder::testId($event->test()), 'fail');
        }
    }

    final class Errored implements \PHPUnit\Event\Test\ErroredSubscriber
    {
        public function notify(\PHPUnit\Event\Test\Errored $event): void
        {
            Recorder::outcome(Recorder::testId($event->test()), 'fail');
        }
    }

    final class BeforeFirstTestMethodErrored implements \PHPUnit\Event\Test\BeforeFirstTestMethodErroredSubscriber
    {
        public function notify(\PHPUnit\Event\Test\BeforeFirstTestMethodErrored $event): void
        {
            Recorder::classOutcome($event->testClassName(), 'fail');
        }
    }

    final class BeforeFirstTestMethodFailed implements \PHPUnit\Event\Test\BeforeFirstTestMethodFailedSubscriber
    {
        public function notify(\PHPUnit\Event\Test\BeforeFirstTestMethodFailed $event): void
        {
            Recorder::classOutcome($event->testClassName(), 'fail');
        }
    }

    final class TestSuiteSkipped implements \PHPUnit\Event\TestSuite\SkippedSubscriber
    {
        public function notify(\PHPUnit\Event\TestSuite\Skipped $event): void
        {
            $suite = $event->testSuite();
            if ($suite instanceof \PHPUnit\Event\TestSuite\TestSuiteForTestMethodWithDataProvider) {
                Recorder::classOutcome($suite->className().'::'.$suite->methodName(), 'skip');
            } elseif ($suite instanceof \PHPUnit\Event\TestSuite\TestSuiteForTestClass) {
                Recorder::classOutcome($suite->className(), 'skip');
            }
            foreach ($suite->tests() as $test) {
                Recorder::outcome(Recorder::testId($test), 'skip');
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Prepend mode

$out = \getenv('XARAVEL_BASELINE_OUT');
if (! \is_string($out) || $out === '' || \realpath((string) \ini_get('auto_prepend_file')) !== __FILE__) {
    return;
}
Recorder::$out = $out;

if (\class_exists('PHPUnit\Framework\Assert', false)) {
    fail('PHPUnit\Framework\Assert is already defined');
}
$suiteRoot = \getenv('XARAVEL_BASELINE_ROOT');
$assertFile = (\is_string($suiteRoot) && $suiteRoot !== '' ? $suiteRoot : \getcwd()).'/vendor/phpunit/phpunit/src/Framework/Assert.php';
$source = @\file_get_contents($assertFile);
if (! \is_string($source)) {
    fail("cannot read {$assertFile}");
}
$rewritten = rewriteAssert($source);
// Include the rewritten source under the original path, so the path counts as
// included and PHPUnit's own `require_once` of it (its preload) is a no-op.
$assertPath = \realpath($assertFile);
AssertSource::$path = $assertPath === false ? $assertFile : $assertPath;
AssertSource::$source = $rewritten;
\stream_wrapper_unregister('file');
\stream_wrapper_register('file', AssertSource::class);
try {
    require_once AssertSource::$path;
} finally {
    \stream_wrapper_restore('file');
}
if (! \class_exists('PHPUnit\Framework\Assert', false) || ! AssertSource::$served) {
    fail('the rewritten Assert.php did not define PHPUnit\Framework\Assert');
}

\spl_autoload_register(static function (string $class): void {
    static $declared = false;
    if (! $declared && \str_starts_with($class, 'Xaravel\\Baseline\\')) {
        $declared = true;
        declareExtension();
    }
}, true, true);

\register_shutdown_function(static function (): void {
    Recorder::flush();
});
