# Configuration

`@xaravel/config` ports Laravel 13's `illuminate/config` component, the `Repository` that holds an application's configuration, and the libraries Laravel reads `.env` files with: `vlucas/phpdotenv` v5.7.0, `phpoption/phpoption` 1.10.0 and `graham-campbell/result-type` 1.2.0. Every class is registered under its Upstream FQCN and exported from the package root. The package is synchronous throughout: no member returns a Promise (AD-6), so its `async-surface.json` is `[]`.

This page follows Laravel's [configuration page](https://laravel.com/docs/13.x/configuration) where this package covers it: accessing configuration values, the typed getters, environment files and the `.env` grammar. The parts of that page that need the rest of the framework come in later Epics (see [What later Epics add](#what-later-epics-add)).

## Accessing configuration values

A `Repository` is built from the configuration items, an array keyed by file name in Laravel (`app`, `database`, …). Keys use "dot" notation, as in Laravel, and a default is returned when the key does not exist:

```ts
import { Repository } from "@xaravel/config";

const config = new Repository({ app: { name: "Xaravel", timezone: "UTC" } });

config.get("app.timezone"); // "UTC"
config.get("app.locale", "en"); // "en", the default
config.get("app.locale", () => "en"); // a closure default is called, as Arr::get calls value()
config.has("app.name"); // true
config.get(["app.name", "app.locale"]); // { "app.name": "Xaravel", "app.locale": null }, as getMany() returns
```

The members are Laravel's: `has(key)`, `get(key, defaultValue)`, `getMany(keys)`, `set(key, value)`, `prepend(key, value)`, `push(key, value)` and `all()`. `get` with an array of keys is `getMany`: a numeric key's value is a configuration key with a `null` default, and any other key is a configuration key whose value is its default. Upstream's `$default` parameter is `defaultValue`, as `default` is a reserved word in JavaScript. `all()` returns a value copy, so changing it never changes the repository. The `Repository` is `Macroable`: `Repository.macro(name, fn)` adds a method, as in Laravel.

`set` takes a key and a value, or an array of key/value pairs, and `prepend` / `push` add a value to the front or the end of an array value. Like every write, these run inside a Scope Frame, such as a request, a job or a test (see [Writes are per unit of work](#writes-are-per-unit-of-work)):

```ts
config.set("app.timezone", "America/Chicago");
config.set({ "app.debug": true, "app.url": "http://localhost" });
config.push("app.providers", "App\\Providers\\AppServiceProvider");
```

### Typed getters

As in Laravel, `string`, `integer`, `float`, `boolean` and `array` return the value only when it has that PHP type, and otherwise throw `InvalidArgumentException` with Upstream's message, `Configuration value for key [app.name] must be a string, integer given.` `collection(key, defaultValue)` returns the array value as an `@xaravel/collections` `Collection`.

```ts
config.string("app.name"); // "Xaravel"
config.integer("app.name"); // throws InvalidArgumentException
```

`integer` returns a `number`, or a `bigint` for a PHP int beyond JavaScript's safe-integer range; `float` reads the runtime's float marker, so `1.0` written as `float(1)` is a float and `1` is an integer (AD-9).

### Array access

PHP's `$config['app.name']` reads through `ArrayAccess`. A JavaScript index cannot call a method, so the `ArrayAccess` forms are the methods PHP calls: `config.offsetGet('app.name')`, `config.offsetSet('app.name', 'x')`, `config.offsetExists('app.name')` and `config.offsetUnset('app.name')`, which sets the value to `null` as Upstream does (DIV-12.6, DIV-12.17).

### Writes are per unit of work

The items given to the constructor are the repository's base, a value copy that is never changed afterwards. Every write (`set`, `push`, `prepend`, `offsetSet`, `offsetUnset`) lands in the active Scope Frame, the request, job or test that made it, over that base (AD-5). A write made in one request is never seen by a concurrent one, and a write with no active frame throws `ScopeFrameException`. In a test, a write lands in the test's frame and is gone when the test ends.

The pre-boot form, a write before the Application is sealed that changes the base, needs the Application's `sealed` state and lands with it (Story 17.4 or 51.1).

## Environment configuration

As in Laravel, environment-specific values live in a `.env` file at the application root, read by phpdotenv. `Dotenv` is phpdotenv's entry point: a named constructor builds a loader over one or more paths, and `load()` reads, parses and sets the variables.

```ts
import { Dotenv } from "@xaravel/config";

const dotenv = Dotenv.createImmutable(import.meta.dir); // reads <dir>/.env
dotenv.load(); // throws InvalidPathException when no file is readable
dotenv.safeLoad(); // the same, but a missing file is not an error
Dotenv.parse("APP_NAME=Xaravel\n"); // { APP_NAME: "Xaravel" }, with no environment change
```

The constructors are phpdotenv's, with its parameters `(paths, names, shortCircuit, fileEncoding)`:

| Constructor | Repository |
| --- | --- |
| `Dotenv.createImmutable` | `$_SERVER` and `$_ENV`; a variable already set is never overwritten |
| `Dotenv.createMutable` | `$_SERVER` and `$_ENV`; a loaded value overwrites |
| `Dotenv.createUnsafeImmutable` | as `createImmutable`, plus `getenv` / `putenv` over `process.env` |
| `Dotenv.createUnsafeMutable` | as `createMutable`, plus `getenv` / `putenv` |
| `Dotenv.createArrayBacked` | an in-memory `ArrayAdapter` only |
| `Dotenv.create(repository, …)` | a repository you build |

### Validating variables

`required(variables)` and `ifPresent(variables)` return a `Validator`, whose rules are phpdotenv's: `required()`, `notEmpty()`, `isInteger()`, `isBoolean()`, `allowedValues(choices)`, `allowedRegexValues(regex)`, `assert(callback, message)` and `assertNullable(callback, message)`. A failure throws `ValidationException` with phpdotenv's message.

```ts
dotenv.required(["DB_HOST", "DB_NAME"]).notEmpty();
dotenv.ifPresent("APP_DEBUG").isBoolean();
```

### The `.env` grammar

The parser is phpdotenv's, ported line for line, so a `.env` file gives the same values in Xaravel as in PHP Laravel (FR-20). Its tests compare the port's results and error messages with phpdotenv's run by the Oracle.

```ini
APP_NAME=Xaravel
export APP_ENV=local          # an `export` prefix is allowed
GREETING="Hello ${APP_NAME}"  # double quotes interpolate: "Hello Xaravel"
RAW='Hello ${APP_NAME}'       # single quotes do not: "Hello ${APP_NAME}"
TABBED="a\tb"                 # escape sequences in double quotes
EMPTY=                        # the empty string
NOTE=value # a comment        # "value"
MULTI="line one
line two"                     # a quoted value may span lines
```

- An unquoted value ends at whitespace before a `#` comment; whitespace inside it is an error.
- `${VAR}` reads a variable defined earlier in the file or already in the repository; an undefined one is kept as written, `${VAR}`.
- An invalid line throws `InvalidFileException` with phpdotenv's message, for example `Failed to parse dotenv file. Encountered an invalid name at [FOO BAR].`
- A file in another encoding is read with `fileEncoding`; an unknown encoding throws `InvalidEncodingException`.

### Notes on reading env files

These match PHP's behaviour; they are recorded rulings, not divergences:

- The env-file read is a sync `file_get_contents` (ESC-15.2-3): it runs once at boot, so AD-6 keeps it sync.
- `$_SERVER` and `$_ENV` are the runtime's `superglobals`, seeded once from `process.env` at module load and never re-read, as PHP seeds them (ESC-15.2-2). They are boot-time process state, not per-request state, so a `putenv` is seen by `getenv` and not by `$_SERVER`, as in PHP.

### Repository modes

`RepositoryBuilder` builds the repository a `Dotenv` writes to. `RepositoryBuilder.createWithDefaultAdapters()` reads and writes through the `ServerConstAdapter` (`$_SERVER`) and the `EnvConstAdapter` (`$_ENV`); `createWithNoAdapters()` starts empty. `addReader`, `addWriter` and `addAdapter` take an adapter or its class (`PutenvAdapter`, `ArrayAdapter`, `ApacheAdapter`, each an `AdapterClass`), `immutable()` keeps existing values, and `allowList(names)` limits the names written. The default is phpdotenv's: in immutable mode a real environment variable wins over the file.

```ts
import { PutenvAdapter, RepositoryBuilder, Dotenv } from "@xaravel/config";

const repository = RepositoryBuilder.createWithNoAdapters().addAdapter(PutenvAdapter).immutable().make();
Dotenv.create(repository, import.meta.dir).load();
```

### Bun's `.env` autoload is switched off

Bun reads `.env`, `.env.local` and `.env.<NODE_ENV>` into `process.env` on its own, with its own grammar and precedence. Xaravel switches that off, so only Xaravel's loader ever sets a value from an env file (FR-20.2): the repository's root `bunfig.toml` sets `env = false`, and every `bun` command in a `package.json` script that can run project code passes `--no-env-file`; the package-manager subcommands (`bun install`, `add`, `remove`, `update`, `pm`, `link`, `unlink`, `outdated`, `patch`, `publish`) run none and are exempt. `bun run entry-scripts:check` fails any other script that lacks the flag (`entry-scripts: package.json: scripts.start: bun command lacks --no-env-file (FR-20.2)`). When you run a script by hand, pass the flag too: `bun --no-env-file server.ts`. The Skeleton app (`skeleton/`) has no `bunfig.toml` yet; its `env = false` comes with the Skeleton Story (61.2), so until then an app relies on `--no-env-file` alone, which by itself stops the autoload.

## What later Epics add

- The `config()` and `env()` helpers and the `Env` class, with its `true` / `false` / `null` / `empty` value casts, come with Support (Epic 20).
- Choosing which env file loads (`.env.<APP_ENV>`, `--env`) and when, the `app()->environment()` checks and `APP_DEBUG`, come with Foundation's bootstrap (Epic 51).
- `config:cache` and `config:clear`, `config:show`, `config:publish` and `env:encrypt` / `env:decrypt` come with the console commands (Epic 55).

## PhpOption and ResultType

phpdotenv returns optional values and results through two small libraries, ported and exported as they are:

- `Option` is the base of `Some` (a value), `None` (no value; `None.create()` returns the one instance) and `LazyOption` (a value a callback computes on first use). `Option.fromValue`, `Option.fromArraysValue`, `Option.fromReturn`, `Option.ensure` and `Option.lift` build one; `get`, `getOrElse`, `getOrCall`, `getOrThrow`, `map`, `flatMap`, `filter`, `select`, `foldLeft` and the rest are phpoption's.
- `Result` is the base of `Success` and `Error`, with `success()`, `error()`, `map`, `flatMap` and `mapError`. `Error` is Upstream's name; import it under an alias where the JavaScript global is also needed.

## Exports

Every class, interface and contract token phpdotenv declares is exported under its short name. The contract tokens (`ExceptionInterface`, `LoaderInterface`, `ParserInterface`, `RepositoryInterface`, `AdapterInterface`, `ReaderInterface`, `WriterInterface`, `StoreInterface`) are both a TypeScript interface and a runtime token for `instanceof`-style brand checks; `AdapterInterfaceStatic` types an adapter class's static `create()`.

- Loading: `Dotenv`, `Validator`, `Loader`, `Resolver`.
- Exceptions: `InvalidEncodingException`, `InvalidFileException`, `InvalidPathException`, `ValidationException`.
- Parsing: `Parser`, `Lexer`, `Lines`, `EntryParser`, `Entry`, `Value`.
- Repositories: `AdapterRepository`, `RepositoryBuilder`, `ApacheAdapter`, `ArrayAdapter`, `EnvConstAdapter`, `PutenvAdapter`, `ServerConstAdapter`, `GuardedWriter`, `ImmutableWriter`, `ReplacingWriter`, `MultiReader`, `MultiWriter`.
- Stores: `FileStore`, `StringStore`, `StoreBuilder`, `Paths`, `Reader`.
- Utilities: `Regex`, `Str` (phpdotenv's `Dotenv\Util\Str`, not Support's).

## Divergences

- **DIV-12.6:** an index read on the `Repository`, `$config['app.name']`, is `config.offsetGet('app.name')`.
- **DIV-12.17:** an index write, `isset` and `unset` on the `Repository` are `offsetSet`, `offsetExists` and `offsetUnset`.
- **DIV-10.1:** phpdotenv's patterns run as JavaScript `RegExp`s through the runtime's `preg_*` functions, converted by PORTING.md's PCRE rule; a pattern in a test (`allowedRegexValues`) is converted the same way.
- **DIV-9.17:** PHP's notices and warnings are not raised. phpdotenv's `@file_get_contents` on a missing file returns `false` with no warning, as PHP's `@` silences it.
- **DIV-9.18:** a PHP string is a JavaScript string, so it cannot hold bytes that are not valid UTF-8. A `.env` file that is not valid UTF-8 (a Latin-1 file, even with a `fileEncoding`) throws `file_get_contents()`'s `TypeError`, and an unquoted value or comment whose 1,000-byte Lexer token ends inside a multibyte character throws `preg_match()`'s `TypeError`, where PHP keeps the bytes; `safeLoad` does not swallow either.
