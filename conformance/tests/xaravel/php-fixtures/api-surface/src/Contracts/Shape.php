<?php

namespace Fixture\Contracts;

interface Shape
{
    public const SIDES = 0;

    public function area(): float;
}
