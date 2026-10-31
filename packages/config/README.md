# @xaravel/config

Xaravel's port of Laravel's illuminate/config component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/config` from Laravel v13.37.0.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Documentation

- [Configuration](docs/config.md): the `Repository`, env files through `Dotenv`, the `.env` grammar, repository modes, Bun's `.env` autoload switched off, and the Divergences.

## Dependencies

- `@xaravel/collections` (workspace): Upstream `composer.json` `require` (AD-2).
- `@xaravel/contracts` (workspace): allowed for every package (AD-2).
- `@xaravel/macroable` (workspace): used directly by Upstream source and reached through its `composer.json` `require` graph (AD-2): Illuminate\Config\Repository uses Illuminate\Support\Traits\Macroable, reached through illuminate/collections' require.
- `@xaravel/runtime` (workspace): allowed for every package (AD-2).

## Ported libraries

- `vlucas/phpdotenv` v5.7.0, under `src/Dotenv/`: AD-22 makes this package its owner. It is ported, not taken from npm, because the same `.env` file must give the same values as in PHP Laravel (FR-20), and neither Bun's built-in `.env` loader (which Xaravel switches off) nor npm's `dotenv` follows phpdotenv's grammar (`${VAR}` interpolation, escape sequences, multiline values, its error messages).
- `phpoption/phpoption` 1.10.0 (`src/PhpOption/`): phpdotenv is built on its `Option` type, and ESC-15.2-4 gives it to this package.
- `graham-campbell/result-type` 1.2.0 (`src/GrahamCampbell/ResultType/`): phpdotenv is built on its `Result` type, and ESC-15.2-4 gives it to this package.

A `.env` file that is not valid UTF-8, or an unquoted value or comment whose 1,000-byte Lexer token ends inside a multibyte character, throws a `TypeError` naming the runtime's UTF-8 limit, where PHP keeps the bytes (DIV-9.18).

Each class is registered under its Upstream FQCN. Their licenses are in `NOTICE`.
