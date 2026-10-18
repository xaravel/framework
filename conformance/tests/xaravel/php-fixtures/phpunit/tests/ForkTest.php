<?php

declare(strict_types=1);

namespace Fixture\Tests;

use PHPUnit\Framework\Attributes\RequiresPhpExtension;
use PHPUnit\Framework\TestCase;

final class ForkTest extends TestCase
{
    #[RequiresPhpExtension('pcntl')]
    public function testFork(): void
    {
        $this->assertTrue(true);
        $pid = pcntl_fork();
        if ($pid === -1) {
            $this->fail('pcntl_fork failed');
        }
        if ($pid === 0) {
            // The child runs its shutdown functions, the recorder's among them.
            exit(0);
        }
        pcntl_waitpid($pid, $status);
        $this->assertSame(0, pcntl_wexitstatus($status));
    }
}
