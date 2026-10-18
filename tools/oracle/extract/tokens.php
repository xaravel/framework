<?php

// The tokenizer behind `bun run oracle:extract` (Story 3.1).
//
//   php tokens.php <dir> <file>...
//
// Writes one JSON line per file, in the order given:
//
//   {"file":"<file>","tokens":[[<token name>,<text>,<line>],...]}
//
// The tokens are PHP's own (`PhpToken::tokenize`, named by
// `getTokenName()`), so tools/oracle/extract/php.ts never re-implements the
// lexer. <file> is relative to <dir> and is echoed as given. Nothing is
// loaded or executed: no autoloader and no vendor/ are needed.
//
// Exit codes: 0 success, 1 any failure (the reason is on stderr), 2 usage.

declare(strict_types=1);

function fail(string $message): never
{
    fwrite(STDERR, "tokens: {$message}\n");
    exit(1);
}

if ($argc < 3) {
    fwrite(STDERR, "usage: php tokens.php <dir> <file>...\n");
    exit(2);
}

$dir = rtrim($argv[1], '/');
if (! is_dir($dir)) {
    fail("{$dir} is not a directory");
}

$out = fopen('php://stdout', 'w');
foreach (array_slice($argv, 2) as $file) {
    if ($file === '' || str_starts_with($file, '/') || in_array('..', explode('/', $file), true)) {
        fail("{$file} is not a relative path inside {$dir}");
    }
    $code = @file_get_contents($dir.'/'.$file);
    if ($code === false) {
        fail("cannot read {$dir}/{$file}");
    }
    $tokens = [];
    foreach (PhpToken::tokenize($code) as $token) {
        $tokens[] = [$token->getTokenName(), $token->text, $token->line];
    }
    try {
        $line = json_encode(['file' => $file, 'tokens' => $tokens], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        fail("{$file}: ".$error->getMessage());
    }
    fwrite($out, $line."\n");
}
fclose($out);
exit(0);
