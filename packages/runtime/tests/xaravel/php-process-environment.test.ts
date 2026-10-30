// Xaravel Tests for action item epic-15-item-3-runtime-process-environment (decisions/ESC-15.2-2.md and
// decisions/ESC-15.2-3.md, approved by the Maintainer; ESC-15.2-1 part g): the process environment and file read
// vlucas/phpdotenv v5.7.0 uses. XT-runtime-139: getenv and putenv. XT-runtime-140: the seeding of `superglobals`
// (`$_SERVER`, `$_ENV`) in a fresh process with a fixed environment, never re-read. XT-runtime-141: file_get_contents.
// XT-runtime-142: the registry's counts, the root and subpath exports, and the limits. None needs an Oracle fixture:
// each expected value is what PHP 8.5.11 gives for the same call, probed with the host's `php`.
// `php-process-environment.probe.php` prints each label as `<label>\t<argument lists>\t<results>` and
// `php-process-environment.probe.txt` is its output (`php -d error_reporting=0 php-process-environment.probe.php >
// php-process-environment.probe.txt`). Every recorded argument list is run through the runtime and its results
// compared. Not recorded: the assertions marked `Xaravel-only`, which have no PHP counterpart (a JS `TypeError` for a
// stream wrapper, `$use_include_path`, a `$context`, a NUL byte in the environment, or a value JS cannot hold).
// Each case restores `process.env` as it found it.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import { fqcn } from "@xaravel/runtime/registry";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");

/** Each label's argument lists (decoded as PHP's json_decode gives them, so a 64-bit int stays exact) and results. */
const evidence = new Map(
  readFileSync(`${import.meta.dir}/php-process-environment.probe.txt`, "utf8").trim().split("\n").map((line) => {
    const [label, calls, results] = line.split("\t") as [string, string, string];
    return [label, { calls: p.jsonDecode(calls, true) as unknown[][], results }] as const;
  }),
);

function json(value: unknown): string {
  return p.jsonEncode(value) as string;
}

/** The probe's `attempt`: the result, or "<class>: <message>" for a throw. */
function attempt(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    let name: string;
    try {
      name = fqcn(error as object);
    } catch {
      name = `JS ${(error as Error).name}`;
    }
    return `${name}: ${(error as Error).message}`;
  }
}

/** Runs `fn` and puts `process.env` back as it was, every name and value. */
function keepingEnvironment<T>(fn: () => T): T {
  const saved = { ...process.env };
  try {
    return fn();
  } finally {
    for (const name of Object.keys(process.env)) {
      if (!Object.hasOwn(saved, name)) {
        delete process.env[name];
      }
    }
    for (const [name, value] of Object.entries(saved)) {
      process.env[name] = value;
    }
  }
}

/** The probe's `cleanup`: unsets each name an assignment set. */
function cleanup(assignments: readonly unknown[]): void {
  for (const assignment of assignments) {
    if (typeof assignment === "string" && assignment !== "" && !assignment.startsWith("=")) {
      p.putenv(assignment.split("=", 1)[0]);
    }
  }
}

/** The fixtures the probe reads, written to a fresh temp directory; returns it. */
function fixtures(): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-fgc-"));
  writeFileSync(join(dir, "ascii"), "hello world\n");
  writeFileSync(join(dir, "utf8"), "héllo wörld ✓\n");
  writeFileSync(join(dir, "empty"), "");
  mkdirSync(join(dir, "sub"));
  return dir;
}

/** `$_SERVER`'s keys the PHP CLI sets that are no environment values. */
const CLI_KEYS = ["PHP_SELF", "SCRIPT_NAME", "SCRIPT_FILENAME", "PATH_TRANSLATED", "DOCUMENT_ROOT", "REQUEST_TIME_FLOAT", "REQUEST_TIME", "argv", "argc"];

/** The probe's seeding child, as a fresh Bun process importing `@xaravel/runtime/php`. */
const SEEDING_CHILD = `
const p = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/php/index.ts"))});
const cli = ${JSON.stringify(CLI_KEYS)};
const pairs = (a, server = false) => [...a].filter(([k]) => k !== "__CF_USER_TEXT_ENCODING" && !(server && cli.includes(k))).map(([k, v]) => [k, v]);
const same = (a, b) => p.jsonEncode(a) === p.jsonEncode(b);
const env = pairs(p.superglobals.env);
const server = pairs(p.superglobals.server, true);
const all = pairs(p.getenv());
const nul = pairs(p.getenv(null));
p.putenv("Z=changed");
p.putenv("E");
process.env.NEW = "1";
console.log(p.jsonEncode([env, server, all, nul, [same(pairs(p.superglobals.env), env), same(pairs(p.superglobals.server, true), server),
  p.getenv("Z"), p.getenv("E"), p.getenv("NEW"), pairs(p.getenv())]]));
`;

/** The fixture directory the file labels read, set while they run. */
let fixtureDir = "";

/** Each probe label's runtime computation for one argument list. */
const RUNNERS: Readonly<Record<string, (...args: unknown[]) => unknown>> = {
  getenv: (assignments, ...args) => {
    try {
      for (const assignment of assignments as unknown[]) {
        p.putenv(assignment);
      }
      return Reflect.apply(p.getenv, undefined, args);
    } finally {
      cleanup(assignments as unknown[]);
    }
  },
  putenv: (assignments, names) => {
    try {
      const results = (assignments as unknown[]).map((assignment) => attempt(() => p.putenv(assignment)));
      return [results, (names as unknown[]).map((name) => p.getenv(name))];
    } finally {
      cleanup(assignments as unknown[]);
    }
  },
  seeding: (environment) => {
    const env = Object.fromEntries((environment as [string, string][]).map(([name, value]) => [name, value]));
    const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", SEEDING_CHILD], { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe", env });
    Assert.assertSame(0, run.exitCode, run.stderr.toString());
    return p.jsonDecode(run.stdout.toString().trim(), true);
  },
  file_get_contents: (name, ...args) => Reflect.apply(p.file_get_contents, undefined, [typeof name === "string" && name !== "" && !name.includes("://") ? `${fixtureDir}/${name}` : name, ...args]),
  reflection: (name) => {
    const fn = PHP_FUNCTIONS[name as string]!;
    return [fn.name, fn.required, fn.total, fn.variadic, fn.byRef];
  },
  counts: (name) => {
    const fn = PHP_FUNCTIONS[name as string]!;
    const call = p.phpFunction(name)!;
    const few = fn.required > 0 ? attempt(() => call()) : null;
    const many = attempt(() => call(...Array.from({ length: fn.total + 1 }, () => null)));
    return [few, many];
  },
};

/** The runner of `label` (`file_get_contents.failures` runs as `file_get_contents`). */
function runnerOf(label: string): (...args: unknown[]) => unknown {
  return RUNNERS[label.replace(/\..*$/, "")]!;
}

/** Each label's recorded argument lists run through the runtime and compared, one by one, with PHP's results. */
function assertLabels(labels: readonly string[]): void {
  for (const label of labels) {
    const recorded = evidence.get(label);
    Assert.assertNotNull(recorded ?? null, `missing evidence: ${label}`);
    const run = runnerOf(label);
    const computed = keepingEnvironment(() => recorded!.calls.map((args) => json(attempt(() => run(...args)))));
    const recordedEach = (p.jsonDecode(recorded!.results, true) as unknown[]).map((result) => json(result));
    Assert.assertSame(recordedEach.length, computed.length, label);
    const differences: string[] = [];
    for (let i = 0; i < computed.length; i++) {
      if (recordedEach[i] !== computed[i]) {
        differences.push(`${label} ${json(recorded!.calls[i])}\n  PHP:     ${recordedEach[i]}\n  runtime: ${computed[i]}`);
      }
    }
    Assert.assertSame("", differences.join("\n"), label);
  }
}

/** A JS `TypeError` (not PHP's) thrown by `fn`, as its message; fails when `fn` throws anything else or nothing. */
function jsTypeError(fn: () => unknown, label: string = ""): string {
  try {
    fn();
  } catch (error) {
    Assert.assertTrue(error instanceof TypeError && !(error instanceof p.TypeError), `a JS TypeError: ${String(error)} ${label}`);
    return (error as Error).message;
  }
  Assert.fail(`no JS TypeError thrown ${label}`);
  return "";
}

const NEW = ["file_get_contents", "getenv", "putenv"] as const;

xaravelTest(
  "XT-runtime-139",
  "getenv gives PHP 8.5.11's value, false for an unset or empty name, and PHP's TypeErrors; putenv sets (the value after the first =, empty included) or unsets a name, returns true, throws PHP's ValueError for an empty assignment or one starting with =, and leaves superglobals ($_SERVER, $_ENV) as they are while getenv sees the change (ESC-15.2-1 part g, ESC-15.2-2)",
  () => {
    assertLabels(["getenv", "putenv"]);
    keepingEnvironment(() => {
      // putenv and a process.env write leave both arrays alone, for a new name and for a seeded one.
      const before = [json(p.superglobals.env), json(p.superglobals.server)];
      Assert.assertTrue(p.putenv("XP_NEW=v"));
      process.env["XP_JS"] = "w";
      Assert.assertSame("v", p.getenv("XP_NEW"));
      Assert.assertSame("w", p.getenv("XP_JS"));
      Assert.assertFalse(p.superglobals.env.has("XP_NEW"));
      Assert.assertFalse(p.superglobals.server.has("XP_JS"));
      const found = [...p.superglobals.env.keys()].find((key) => typeof key === "string");
      Assert.assertNotNull(found ?? null, "a seeded string key");
      const seeded = found as string;
      const value = p.superglobals.env.get(seeded);
      Assert.assertTrue(p.putenv(`${seeded}=changed`));
      Assert.assertSame("changed", p.getenv(seeded));
      Assert.assertSame(value, p.superglobals.env.get(seeded));
      Assert.assertTrue(p.putenv(seeded));
      Assert.assertFalse(p.getenv(seeded));
      Assert.assertSame(value, p.superglobals.server.get(seeded));
      Assert.assertSame(before[0], json(p.superglobals.env));
      Assert.assertSame(before[1], json(p.superglobals.server));
      // getenv() reads process.env at the call, filtered as $_ENV is.
      process.env["XP.DOT"] = "1";
      process.env["12345"] = "n";
      const all = p.getenv() as p.PhpArray;
      Assert.assertTrue(all instanceof p.PhpArray);
      Assert.assertSame("v", all.get("XP_NEW"));
      Assert.assertFalse(all.has("XP.DOT"));
      Assert.assertSame("n", all.get(12345));
      Assert.assertSame("number", typeof [...all.keys()].find((key) => key === 12345));
      Assert.assertSame(json(all), json(p.getenv(null)));
      // Xaravel-only: an omitted argument is its default.
      Assert.assertSame(json(all), json(p.getenv(undefined, undefined)));
    });
  },
);

xaravelTest(
  "XT-runtime-140",
  "a fresh process started with a fixed environment (names with a space, a dot or [, integer-like names, an empty value, a value with =) holds in superglobals.env and superglobals.server the entries PHP 8.5.11's -n CLI puts in $_ENV and $_SERVER (EGPCS, the Oracle image's built-in variables_order), with PHP's keys and values, as getenv() does; after putenv and a process.env write both arrays are unchanged while getenv sees the change (ESC-15.2-2)",
  () => {
    assertLabels(["seeding"]);
  },
  60_000,
);

xaravelTest(
  "XT-runtime-141",
  "file_get_contents gives PHP 8.5.11's contents for a local file with an offset (negative from the end) and a length, false with no warning for a missing file, a path through a file or a negative offset before the start, an empty string for an offset past the end and for a directory, and PHP's ValueErrors and TypeErrors for an empty path, a NUL byte, a negative length and a wrong type (ESC-15.2-3, DIV-9.17)",
  () => {
    fixtureDir = fixtures();
    try {
      assertLabels(["file_get_contents", "file_get_contents.failures"]);
      // An unreadable file is false too (skipped as root, who reads it anyway).
      const locked = join(fixtureDir, "locked");
      writeFileSync(locked, "secret");
      chmodSync(locked, 0o000);
      if (process.getuid?.() !== 0) {
        Assert.assertFalse(p.file_get_contents(locked));
      }
      chmodSync(locked, 0o600);
      // Each call reads the file again; nothing is cached.
      writeFileSync(join(fixtureDir, "ascii"), "changed");
      Assert.assertSame("changed", p.file_get_contents(join(fixtureDir, "ascii")));
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  },
);

xaravelTest(
  "XT-runtime-142",
  "getenv, putenv and file_get_contents are registry entries with PHP's ReflectionFunction counts and ArgumentCountErrors, exported with superglobals from the root and @xaravel/runtime/php as the same objects; a stream wrapper path, $use_include_path true, a non-null $context, contents that are no valid UTF-8, and a NUL byte or lone surrogate in an environment string throw a JS TypeError naming the limit (ESC-15.2-1 part g, ESC-15.2-2, ESC-15.2-3)",
  () => {
    assertLabels(["reflection", "counts"]);
    // Every recorded label is computed.
    for (const label of evidence.keys()) {
      Assert.assertNotNull(runnerOf(label) ?? null, label);
    }
    // Root and subpath identity.
    for (const name of [...NEW, "superglobals"]) {
      const fromPhp = (p as Record<string, unknown>)[name];
      Assert.assertNotNull(fromPhp ?? null, name);
      Assert.assertSame(fromPhp, (root as Record<string, unknown>)[name], name);
    }
    for (const name of NEW) {
      Assert.assertSame((p as Record<string, unknown>)[name], PHP_FUNCTIONS[name]!.fn, name);
      Assert.assertTrue(p.is_callable(name), name);
      Assert.assertTrue(p.function_exists(name), name);
    }
    // superglobals is frozen; its two arrays are distinct PhpArrays.
    Assert.assertTrue(Object.isFrozen(p.superglobals));
    Assert.assertTrue(p.superglobals.env instanceof p.PhpArray);
    Assert.assertTrue(p.superglobals.server instanceof p.PhpArray);
    Assert.assertFalse(p.superglobals.env === p.superglobals.server);
    // A name holding = is no entry (glibc's getenv, the Oracle image's).
    keepingEnvironment(() => {
      p.putenv("XP_F=1");
      Assert.assertFalse(p.getenv("XP_F=1"));
    });

    // Xaravel-only: the limits.
    const dir = fixtures();
    try {
      const bad = join(dir, "bad");
      writeFileSync(bad, new Uint8Array([0x61, 0xff, 0x62]));
      Assert.assertStringContainsString("UTF-8", jsTypeError(() => p.file_get_contents(bad)));
      Assert.assertSame("a", p.file_get_contents(bad, false, null, 0, 1));
      Assert.assertStringContainsString("UTF-8", jsTypeError(() => p.file_get_contents(join(dir, "utf8"), false, null, 2)));
      for (const path of ["php://stdin", "php://memory", "http://example.com/", "file:///etc/hosts", `file://${join(dir, "ascii")}`, "data:text/plain,a", "compress.zlib://x", "PHP://memory", "glob://*"]) {
        Assert.assertStringContainsString("stream wrapper", jsTypeError(() => p.file_get_contents(path), path), path);
      }
      Assert.assertStringContainsString("$use_include_path", jsTypeError(() => p.file_get_contents(join(dir, "ascii"), true)));
      Assert.assertStringContainsString("$context", jsTypeError(() => p.file_get_contents(join(dir, "ascii"), false, {})));
      Assert.assertStringContainsString("$context", jsTypeError(() => p.file_get_contents(join(dir, "ascii"), false, 5)));
      // PHP parses $offset and $length before the limits apply.
      Assert.assertSame("TypeError: file_get_contents(): Argument #4 ($offset) must be of type int, string given", attempt(() => p.file_get_contents("x", false, {}, "bad")));
      Assert.assertSame("ValueError: file_get_contents(): Argument #5 ($length) must be greater than or equal to 0", attempt(() => p.file_get_contents("x", true, null, 0, -1)));
      Assert.assertStringContainsString("lone surrogate", jsTypeError(() => p.file_get_contents(`${dir}/\ud800`)));
      // A relative path reads from the working directory, as PHP's does.
      Assert.assertSame(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8"), keepingCwd(PACKAGE_DIR, () => p.file_get_contents("package.json")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    keepingEnvironment(() => {
      Assert.assertStringContainsString("NUL", jsTypeError(() => p.putenv("XP_N=a\0b")));
      Assert.assertStringContainsString("NUL", jsTypeError(() => p.putenv("XP\0N=a")));
      Assert.assertStringContainsString("NUL", jsTypeError(() => p.getenv("XP\0N")));
      Assert.assertFalse(p.getenv("XP_N"));
      Assert.assertStringContainsString("lone surrogate", jsTypeError(() => p.putenv("XP_N=\ud800")));
      Assert.assertStringContainsString("lone surrogate", jsTypeError(() => p.getenv("\udc00")));
      Assert.assertFalse(p.getenv("XP_N"));
    });
  },
);

/** Runs `fn` with `dir` as the working directory. */
function keepingCwd<T>(dir: string, fn: () => T): T {
  const saved = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(saved);
  }
}
