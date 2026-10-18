<?php

// The api-surface fixture's autoloader (Story 3.5): `Fixture\X\Y` loads
// src/X/Y.php. It is hand-written, not Composer's, and lives outside vendor/
// so it is committed. It also loads src/functions.php, as Composer's `files`
// autoload would.

declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'Fixture\\')) {
        return;
    }
    $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen('Fixture\\'))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

require __DIR__ . '/src/functions.php';
