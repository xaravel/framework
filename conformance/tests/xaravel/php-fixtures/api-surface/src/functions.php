<?php

namespace {
    function fixture_helper($value = null, bool $strict = false)
    {
        return $value;
    }
}

namespace Fixture {
    function namespaced(string ...$parts): string
    {
        return implode('', $parts);
    }
}
