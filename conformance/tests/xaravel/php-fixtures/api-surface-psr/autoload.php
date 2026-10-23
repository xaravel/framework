<?php

// The api-surface interfaces-mode fixture's autoloader (epic-10-item-1,
// ESC-10.1-4): `PsrFixture\X\Y` loads src/X/Y.php and `PsrOdd\X` loads
// odd/X.php. It is hand-written, not Composer's, and lives outside vendor/ so
// it is committed. It also loads src/helpers.php, as Composer's `files`
// autoload would, so a declared function is present for the mode to skip.
// Composer\InstalledVersions answers as Composer's would for
// one installed package, fixture/psr at 1.0.0, so the script's version check
// runs against it.

declare(strict_types=1);

namespace Composer {
    final class InstalledVersions
    {
        private const VERSIONS = ['fixture/psr' => '1.0.0'];

        public static function isInstalled(string $packageName, bool $includeDevRequirements = true): bool
        {
            return isset(self::VERSIONS[$packageName]);
        }

        public static function getPrettyVersion(string $packageName): ?string
        {
            return self::VERSIONS[$packageName] ?? null;
        }
    }
}

namespace {
    spl_autoload_register(static function (string $class): void {
        foreach (['PsrFixture\\' => '/src/', 'PsrOdd\\' => '/odd/'] as $prefix => $dir) {
            if (str_starts_with($class, $prefix)) {
                $file = __DIR__ . $dir . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
                if (is_file($file)) {
                    require $file;
                }
            }
        }
    });

    require __DIR__ . '/src/helpers.php';
}
