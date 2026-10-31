<?php
// The PHP 8.5.11 evidence for XT-runtime-148 (trait-registry.test.ts), action item
// epic-15-retro-item-10-runtime-trait-registry (decisions/MAINT-2026-10-30-epic-15-items-2-5.md item 2.3): class_exists
// and trait_exists on a trait nothing has composed, a class, an enum, an interface and an unknown name. Each line is
// `<label>\t<json_encode(value)>`; the test computes every label with the runtime and compares it with the recorded
// value. A throw is `"<class>: <message>"`. Run with error_reporting=0: PHP's warnings, notices and deprecations are
// not raised by the runtime (DIV-9.17).
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 trait-registry.probe.php > trait-registry.probe.txt

namespace XaravelFixture\TraitRegistry {
    class Plain
    {
    }

    enum Suit
    {
        case Hearts;
    }

    trait Greets
    {
    }
}

namespace {
    function out(string $label, mixed $value): void
    {
        echo $label, "\t", json_encode($value), "\n";
    }

    function attempt(callable $fn): mixed
    {
        try {
            return $fn();
        } catch (Throwable $e) {
            return get_class($e) . ': ' . $e->getMessage();
        }
    }

    /** Each argument list through `$fn`, its result or "<class>: <message>". */
    function each_call(string $fn, array $calls): array
    {
        return array_map(fn ($args) => attempt(fn () => $fn(...$args)), $calls);
    }

    // The same argument lists for both functions.
    $calls = [
        ['XaravelFixture\\TraitRegistry\\Greets'], ['\\XaravelFixture\\TraitRegistry\\GREETS'], ['xaravelfixture\\traitregistry\\greets'],
        ['XaravelFixture\\TraitRegistry\\Greets', false], ['XaravelFixture\\TraitRegistry\\Plain'], ['stdClass'],
        ['XaravelFixture\\TraitRegistry\\Suit'], ['Stringable'], ['Nope\\Nothing'], [''], [5], [null], [[]],
        ['x', []], ['XaravelFixture\\TraitRegistry\\Greets', []], ['\\\\XaravelFixture\\TraitRegistry\\Greets'],
    ];
    out('class_exists', each_call('class_exists', $calls));
    out('trait_exists', each_call('trait_exists', $calls));

    // trait_exists's ReflectionFunction counts and its ArgumentCountErrors.
    $function = new ReflectionFunction('trait_exists');
    $refs = [];
    foreach ($function->getParameters() as $index => $parameter) {
        if ($parameter->isPassedByReference()) {
            $refs[] = $index;
        }
    }
    out('reflection', [$function->getName(), $function->getNumberOfRequiredParameters(), $function->getNumberOfParameters(), $function->isVariadic(), $refs]);
    out('counts', [
        attempt(fn () => call_user_func_array('trait_exists', [])),
        attempt(fn () => call_user_func_array('trait_exists', array_fill(0, $function->getNumberOfParameters() + 1, null))),
    ]);
}
