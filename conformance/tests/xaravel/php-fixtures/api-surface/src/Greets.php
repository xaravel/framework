<?php

namespace Fixture;

trait Greets
{
    public function greet(string $who = 'world'): string
    {
        return "Hello, {$who}";
    }
}
