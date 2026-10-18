<?php

namespace Fixture;

enum Size: string
{
    case Small = 's';
    case Large = 'l';

    public const DEFAULT = self::Small;
}
