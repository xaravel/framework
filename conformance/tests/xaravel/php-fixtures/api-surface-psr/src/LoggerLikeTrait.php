<?php

namespace PsrFixture;

trait LoggerLikeTrait
{
    public function debug(string|\Stringable $message, array $context = []): void
    {
        $this->log('debug', $message, $context);
    }
}
