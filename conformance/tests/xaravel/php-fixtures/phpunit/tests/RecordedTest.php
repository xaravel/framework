<?php

declare(strict_types=1);

namespace Fixture\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class RecordedTest extends TestCase
{
    public function testMixedKinds(): void
    {
        $this->assertSame(1, 1);
        $this->assertTrue(true);
        $this->assertSame('a', 'a');
    }

    public function testCount(): void
    {
        // assertCount calls assertThat itself; only the outermost call counts.
        $this->assertCount(2, [1, 2]);
    }

    /** @return array<string, array{int, int}> */
    public static function pairs(): array
    {
        return [
            'one' => [1, 1],
            'two' => [2, 2],
        ];
    }

    #[DataProvider('pairs')]
    public function testProvided(int $expected, int $actual): void
    {
        $this->assertSame($expected, $actual);
    }

    public function testSkipped(): void
    {
        $this->markTestSkipped('skipped by the fixture');
    }

    public function testFailing(): void
    {
        $this->assertSame(1, 2);
    }
}
