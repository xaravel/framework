<?php

namespace PsrFixture;

interface LoggerLike
{
    public const LEVEL = 'debug';

    public function log($level, string|\Stringable $message, array $context = []): void;
}
