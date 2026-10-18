<?php

namespace Fixture;

use Fixture\Contracts\Shape;

class Widget extends Base implements Shape
{
    use Greets;

    public const LIMIT = 10;

    protected const HIDDEN = 1;

    public ?string $label = null;

    public static $count = 0;

    protected int $secret = 0;

    public function __construct(public readonly int $size = PHP_INT_MAX)
    {
    }

    public static function make(?string $name, Size $size = Size::Small, array $tags = ['*'], ...$rest): static
    {
        return new static();
    }

    public function area(): float
    {
        return 0.0;
    }

    public function fill(array &$into, Options $options = new Options(1), int $mode = self::LIMIT, array $map = ['a' => 1]): void
    {
    }

    protected function hidden(): void
    {
    }
}
