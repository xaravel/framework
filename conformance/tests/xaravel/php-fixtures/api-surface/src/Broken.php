<?php

namespace Fixture;

class Broken implements \Missing\Contract
{
    public function run(): ?int
    {
        return null;
    }
}
