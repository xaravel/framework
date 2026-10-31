// Xaravel Tests for action item epic-15-item-2-runtime-pcre-functions (decisions/ESC-15.2-1.md part f, approved by
// the monitor under decisions/MAINT-2026-10-26-runtime-builtins.md; the conversion forms of decisions/ESC-15.2-5.md):
// the PCRE functions vlucas/phpdotenv v5.7.0 calls. XT-runtime-135: preg_match, the conversion forms, modifiers and
// errors. XT-runtime-136: preg_match_all and preg_split. XT-runtime-137: preg_replace_callback. XT-runtime-138:
// preg_last_error's Scope Frame state, the registry's counts, the root and subpath exports, and the limits.
// XT-runtime-147 (action item epic-15-retro-item-9-runtime-pcre-pattern-cache, decisions/MAINT-2026-10-30-epic-15-items.md
// Item 6): the compiled-pattern cache, under nested, sequential and failing calls with one pattern string. None needs
// an Oracle fixture: each expected value is what PHP 8.5.11 gives for the same call, probed with the host's `php`.
// `php-pcre-functions.probe.php` prints each label as `<label>\t<argument lists>\t<results>` and
// `php-pcre-functions.probe.txt` is its output (`php -d error_reporting=0 php-pcre-functions.probe.php >
// php-pcre-functions.probe.txt`). Every recorded argument list is run through the runtime and its results compared.
// Not recorded: the assertions marked `Xaravel-only`, which have no PHP counterpart (a JS `TypeError` for a form the
// conversion rule does not cover or a value JS cannot hold, a `Ref`, Scope Frames).
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import { fqcn, registerClass } from "@xaravel/runtime/registry";
import { runInFrame, runInNarrowFrame } from "@xaravel/runtime/scope";
import { PATTERN_CACHE_SIZE, compilePattern, searchRegExp } from "../../src/php/pcre";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";

/** Each label's argument lists (parsed) and results (as PHP's JSON). */
const evidence = new Map(
  readFileSync(`${import.meta.dir}/php-pcre-functions.probe.txt`, "utf8").trim().split("\n").map((line) => {
    const [label, calls, results] = line.split("\t") as [string, string, string];
    return [label, { calls: JSON.parse(calls) as unknown[][], results }] as const;
  }),
);

/** The probe's fixture `Text`: a class with a `__toString` port. */
class Text {
  constructor(private readonly text: string = "text") {}

  toString(): string {
    return this.text;
  }
}
registerClass("XaravelFixture\\PcreFunctions\\Text", Text);

/** The probe's fixture `Plain`: a class with no `__toString`. */
class Plain {}
registerClass("XaravelFixture\\PcreFunctions\\Plain", Plain);

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

/** An argument the probe passed: a JSON object is a PHP array (its keys in the order PHP printed them). */
type Args = unknown[];

/** The probe's `pm`. */
function pm(...args: Args): unknown {
  const matches = new p.Ref<unknown>("untouched");
  const [pattern, subject, ...rest] = args;
  const result = attempt(() => Reflect.apply(p.preg_match, undefined, [pattern, subject, matches, ...rest]));
  return [result, matches.value, p.preg_last_error(), p.preg_last_error_msg()];
}

/** The probe's `pma`. */
function pma(...args: Args): unknown {
  const matches = new p.Ref<unknown>("untouched");
  const [pattern, subject, ...rest] = args;
  const result = attempt(() => Reflect.apply(p.preg_match_all, undefined, [pattern, subject, matches, ...rest]));
  return [result, matches.value, p.preg_last_error(), p.preg_last_error_msg()];
}

/** The probe's `ps`. */
function ps(...args: Args): unknown {
  const [pattern, subject] = args;
  const result = attempt(() => (args.length > 2 ? p.preg_split(pattern, subject, args[2], args[3]) : p.preg_split(pattern, subject)));
  return [result, p.preg_last_error()];
}

/** The probe's `callback`. */
function callback(name: string): unknown {
  switch (name) {
    case "json": return (m: unknown) => `<${json(m)}>`;
    case "upper": return (m: unknown) => p.strtoupper((m as unknown[])[0]);
    case "count": return "count";
    case "int": return () => 7;
    case "null": return () => null;
    case "float": return () => 1.5;
    case "true": return () => true;
    case "array": return () => [1];
    case "text": return () => new Text("t");
    case "plain": return () => new Plain();
    case "throw": return () => {
      throw new p.Exception("boom");
    };
    case "invalid": return "nope";
    case "resolve": return (m: unknown) => {
      const key = (m as unknown[])[1] as string;
      return key === "A.B" ? "v1" : key === "A" ? "v2" : (m as unknown[])[0];
    };
    default: throw new Error(`no callback ${name}`);
  }
}

/** The probe's `prc`. */
function prc(...args: Args): unknown {
  const count = new p.Ref<unknown>("untouched");
  const [pattern, subject, limit, flags, name] = args;
  const result = attempt(() => p.preg_replace_callback(pattern, callback((name as string | undefined) ?? "json"), subject, args.length > 2 ? limit : -1, count, args.length > 3 ? flags : 0));
  return [result, count.value, p.preg_last_error()];
}

/** Every code point but the surrogates, as one string. */
function allCodePoints(): string {
  const parts: string[] = [];
  for (let c = 0; c <= 0x10ffff; c += 0x1000) {
    const chunk: number[] = [];
    for (let d = c; d < Math.min(c + 0x1000, 0x110000); d++) {
      if (d < 0xd800 || d > 0xdfff) chunk.push(d);
    }
    parts.push(String.fromCodePoint(...chunk));
  }
  return parts.join("");
}

/** Parser/Lexer.php's loop, through the runtime. */
function lex(regex: unknown, content: unknown): unknown {
  const tokens: unknown[] = [];
  let offset = 0;
  while (offset < p.strlen(content)) {
    const matches = new p.Ref<unknown>(null);
    if (p.preg_match(regex, content, matches, 0, offset) !== 1) {
      throw new p.Error("Lexer encountered unexpected character");
    }
    const token = (matches.value as unknown[])[0];
    offset += p.strlen(token);
    tokens.push(token);
  }
  return tokens;
}

/** Each probe label's runtime computation for one argument list. */
const RUNNERS: Readonly<Record<string, (...args: Args) => unknown>> = {
  "preg_match.basic": pm,
  "preg_match.forms": pm,
  "preg_match.esc-15.2-5": pm,
  "preg_match.errors": pm,
  "preg_match.sequence": (fn) => {
    const run = (pattern: string): unknown => {
      switch (fn) {
        case "preg_match": return p.preg_match(pattern, "é", new p.Ref<unknown>(null), 0, 0);
        case "preg_match_all": return p.preg_match_all(pattern, "é", new p.Ref<unknown>(null));
        case "preg_split": return p.preg_split(pattern, "é");
        default: return p.preg_replace_callback(pattern, () => "x", "é");
      }
    };
    const out: unknown[] = [];
    for (const pattern of ["/a", "/a/", "/(/", "/é/u"]) {
      out.push([run(pattern), p.preg_last_error(), p.preg_last_error_msg()]);
    }
    out.push([p.preg_match("/./u", "é", new p.Ref<unknown>(null), 0, 1), p.preg_last_error(), p.preg_last_error_msg()]);
    out.push([run("/./u"), p.preg_last_error(), p.preg_last_error_msg()]);
    return out;
  },
  "preg_match.arguments": pm,
  "preg_match.space": (pattern, complement) => {
    const all = allCodePoints();
    const matches = new p.Ref<unknown>(null);
    p.preg_match_all(pattern, all, matches);
    const runs = p.preg_match_all(complement, all);
    return [((matches.value as unknown[][])[0]!).map((m) => (m as string).codePointAt(0)!.toString(16)), runs, p.preg_last_error()];
  },
  "phpdotenv.isValidName": (s) => [pm("~\\A[a-zA-Z0-9_.]+\\z~", s), pm("~\\A[\\p{Ll}\\p{Lu}\\p{M}\\p{N}_.]+\\z~u", s)],
  "phpdotenv.parseLiteral": pm,
  "phpdotenv.lexer": lex,
  "phpdotenv.validator": (regex, value) => [p.preg_match(regex, "") === false && p.preg_last_error() === p.PREG_INTERNAL_ERROR, pm(regex, value)],
  "preg_match_all": pma,
  "preg_split": ps,
  "phpdotenv.lines": pma,
  "phpdotenv.parser": ps,
  "phpdotenv.occurrences": (pattern, subject) => [p.preg_match_all(pattern, subject), p.preg_last_error()],
  "preg_replace_callback": prc,
  "phpdotenv.resolver": prc,
  "cache.interleaved": (kase) => {
    const inner: unknown[] = [];
    const count = new p.Ref<unknown>(null);
    switch (kase) {
      case "global": {
        const outer = p.preg_replace_callback("/a/", () => {
          const all = new p.Ref<unknown>(null);
          const one = new p.Ref<unknown>(null);
          inner.push([p.preg_match_all("/a/", "aaa", all), all.value, p.preg_split("/a/", "bab"), p.preg_match("/a/", "zza", one, 0, 1), one.value]);
          return "X";
        }, "xaya", -1, count);
        return [outer, count.value, inner, p.preg_last_error()];
      }
      case "sticky": {
        const outer = p.preg_replace_callback("/a/A", () => {
          const one = new p.Ref<unknown>(null);
          const all = new p.Ref<unknown>(null);
          inner.push([p.preg_match("/a/A", "ba", one, 0, 1), one.value, p.preg_match_all("/a/A", "aaba", all), all.value]);
          return "X";
        }, "aab", -1, count);
        return [outer, count.value, inner, p.preg_last_error()];
      }
      case "retry": {
        const outer = p.preg_replace_callback("/x*/", (m: unknown) => {
          inner.push(p.preg_split("/x*/", "axb"));
          return `[${(m as unknown[])[0] as string}]`;
        }, "axb", -1, count);
        return [outer, count.value, inner, p.preg_last_error()];
      }
      case "offsets": {
        const m1 = new p.Ref<unknown>(null);
        const m2 = new p.Ref<unknown>(null);
        const first = p.preg_match("/b/", "abcb", m1, p.PREG_OFFSET_CAPTURE, 3);
        const second = p.preg_match("/b/", "abcb", m2, p.PREG_OFFSET_CAPTURE);
        return [first, m1.value, second, m2.value, p.preg_last_error()];
      }
      case "nested-replace": {
        const outer = p.preg_replace_callback("/a/", () => {
          const c = new p.Ref<unknown>(null);
          const result = p.preg_replace_callback("/a/", () => "Y", "aba", -1, c);
          return `${result as string}${String(c.value)}`;
        }, "xaya", -1, count);
        return [outer, count.value, p.preg_last_error()];
      }
      default:
        return [
          [p.preg_match("/(/", "a"), p.preg_last_error()],
          [p.preg_match("/(/", "a"), p.preg_last_error()],
          [p.preg_match("/a/", "a"), p.preg_last_error()],
          [p.preg_split("/(/", "a"), p.preg_last_error()],
          [p.preg_match_all("/(/", "a"), p.preg_last_error()],
          [p.preg_replace_callback("/(/", () => "x", "a"), p.preg_last_error()],
          [p.preg_replace_callback(["/a/", "/(/"], () => "x", "a"), p.preg_last_error()],
        ];
    }
  },
  "reflection": (name) => {
    const fn = PHP_FUNCTIONS[name as string]!;
    return [fn.name, fn.required, fn.total, fn.variadic, fn.byRef];
  },
  "counts": (name) => {
    const fn = PHP_FUNCTIONS[name as string]!;
    const call = p.phpFunction(name)!;
    const few = fn.required > 0 ? attempt(() => call()) : null;
    const many = attempt(() => call(...Array.from({ length: fn.total + 1 }, () => null)));
    return [few, many];
  },
  "constants": () => [
    p.PREG_PATTERN_ORDER, p.PREG_SET_ORDER, p.PREG_OFFSET_CAPTURE, p.PREG_UNMATCHED_AS_NULL, p.PREG_SPLIT_NO_EMPTY,
    p.PREG_SPLIT_DELIM_CAPTURE, p.PREG_SPLIT_OFFSET_CAPTURE, p.PREG_NO_ERROR, p.PREG_INTERNAL_ERROR, p.PREG_BACKTRACK_LIMIT_ERROR,
    p.PREG_RECURSION_LIMIT_ERROR, p.PREG_BAD_UTF8_ERROR, p.PREG_BAD_UTF8_OFFSET_ERROR, p.PREG_JIT_STACKLIMIT_ERROR,
  ],
};

/** Each label's recorded argument lists run through the runtime, in a frame so preg_last_error records. */
function assertLabels(labels: readonly string[]): void {
  for (const label of labels) {
    const recorded = evidence.get(label);
    Assert.assertNotNull(recorded ?? null, `missing evidence: ${label}`);
    const run = RUNNERS[label]!;
    const results = runInFrame("unit", () => recorded!.calls.map((args) => attempt(() => run(...args))));
    const expected = JSON.parse(recorded!.results) as unknown[];
    const computed = results.map((result) => json(result));
    // Compared per argument list, so each difference names its call.
    const recordedEach = splitJsonList(recorded!.results);
    Assert.assertSame(expected.length, computed.length, label);
    const differences: string[] = [];
    for (let i = 0; i < computed.length; i++) {
      if (recordedEach[i] !== computed[i]) {
        differences.push(`${label} ${json(recorded!.calls[i])}\n  PHP:     ${recordedEach[i]}\n  runtime: ${computed[i]}`);
      }
    }
    Assert.assertSame("", differences.join("\n"), label);
  }
}

/** The top-level elements of a JSON list, as their JSON text. */
function splitJsonList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 1;
  for (let i = 1; i < text.length - 1; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === "\"") inString = false;
    } else if (c === "\"") {
      inString = true;
    } else if (c === "[" || c === "{") {
      depth++;
    } else if (c === "]" || c === "}") {
      depth--;
    } else if (c === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (text.length > 2) {
    out.push(text.slice(start, text.length - 1));
  }
  return out;
}

/** A JS `TypeError` (not PHP's) thrown by `fn`, as its message; fails when `fn` throws anything else or nothing. */
function jsTypeError(fn: () => unknown, label: string = ""): string {
  try {
    fn();
  } catch (error) {
    Assert.assertTrue(error instanceof TypeError && !(error instanceof p.TypeError), `a JS TypeError: ${String(error)}`);
    return (error as Error).message;
  }
  Assert.fail(`no JS TypeError thrown ${label}`);
  return "";
}

const NEW = ["preg_last_error", "preg_last_error_msg", "preg_match", "preg_match_all", "preg_replace_callback", "preg_split"] as const;
const CONSTANTS = [
  "PREG_PATTERN_ORDER", "PREG_SET_ORDER", "PREG_OFFSET_CAPTURE", "PREG_UNMATCHED_AS_NULL", "PREG_SPLIT_NO_EMPTY", "PREG_SPLIT_DELIM_CAPTURE",
  "PREG_SPLIT_OFFSET_CAPTURE", "PREG_NO_ERROR", "PREG_INTERNAL_ERROR", "PREG_BACKTRACK_LIMIT_ERROR", "PREG_RECURSION_LIMIT_ERROR",
  "PREG_BAD_UTF8_ERROR", "PREG_BAD_UTF8_OFFSET_ERROR", "PREG_JIT_STACKLIMIT_ERROR",
] as const;

xaravelTest(
  "XT-runtime-135",
  "preg_match gives PHP 8.5.11's result, $matches (named groups, PREG_OFFSET_CAPTURE, PREG_UNMATCHED_AS_NULL, byte offsets) and preg_last_error for every conversion form PORTING.md § PCRE conversion lists (delimiters, modifiers, \\A, \\z, the A modifier, branch reset, byte matching without u, PCRE's \\s), for phpdotenv's patterns and its Lexer loop, and returns false with PHP's error code for a pattern PHP cannot compile or a bad offset (ESC-15.2-1 part f, ESC-15.2-5)",
  () => {
    assertLabels([
      "preg_match.basic", "preg_match.forms", "preg_match.esc-15.2-5", "preg_match.errors", "preg_match.sequence", "preg_match.arguments",
      "preg_match.space", "phpdotenv.isValidName", "phpdotenv.parseLiteral", "phpdotenv.lexer", "phpdotenv.validator",
    ]);
  },
);

xaravelTest(
  "XT-runtime-136",
  "preg_match_all (PREG_PATTERN_ORDER, PREG_SET_ORDER, with PREG_OFFSET_CAPTURE and PREG_UNMATCHED_AS_NULL) and preg_split (limits -1, 0, 1, 2 and below, PREG_SPLIT_NO_EMPTY, PREG_SPLIT_DELIM_CAPTURE, PREG_SPLIT_OFFSET_CAPTURE) give PHP 8.5.11's results, iterating past empty matches as php_pcre.c does, for phpdotenv's Lines and Parser patterns too (ESC-15.2-1 part f)",
  () => {
    assertLabels(["preg_match_all", "preg_split", "phpdotenv.lines", "phpdotenv.occurrences", "phpdotenv.parser"]);
  },
);

xaravelTest(
  "XT-runtime-137",
  "preg_replace_callback gives PHP 8.5.11's result and $count with a limit, string and array patterns and subjects (keys kept), PHP's (string) of the callback's result, empty matches, PREG_OFFSET_CAPTURE and PREG_UNMATCHED_AS_NULL, null for a pattern PHP cannot compile, and phpdotenv's Resolver call (ESC-15.2-1 part f)",
  () => {
    assertLabels(["preg_replace_callback", "phpdotenv.resolver"]);
  },
);

xaravelTest(
  "XT-runtime-138",
  "preg_last_error keeps its code per Scope Frame, two concurrent frames apart, and reads 0 outside a frame; every new function is a registry entry with PHP's ReflectionFunction counts and ArgumentCountErrors, exported from the root and @xaravel/runtime/php as the same object with the PREG_* constants; a form outside PORTING.md § PCRE conversion, or a value JS cannot hold, throws a JS TypeError naming the limit and records no error code (ESC-15.2-1 part f, AD-5)",
  async () => {
    assertLabels(["reflection", "counts", "constants"]);
    // Every recorded label is computed, and every computed label recorded.
    Assert.assertSame(json([...evidence.keys()].sort()), json(Object.keys(RUNNERS).sort()));
    // Root and subpath identity, for every new name.
    for (const name of [...NEW, ...CONSTANTS]) {
      const fromPhp = (p as Record<string, unknown>)[name];
      Assert.assertNotNull(fromPhp ?? null, name);
      Assert.assertSame(fromPhp, (root as Record<string, unknown>)[name], name);
    }
    for (const name of NEW) {
      Assert.assertSame((p as Record<string, unknown>)[name], PHP_FUNCTIONS[name]!.fn, name);
      Assert.assertTrue(p.is_callable(name), name);
      Assert.assertTrue(p.function_exists(name), name);
    }

    // Outside a frame nothing is recorded, and the reads are 0 / "No error".
    Assert.assertFalse(p.preg_match("/abc", "a"));
    Assert.assertSame(0, p.preg_last_error());
    Assert.assertSame("No error", p.preg_last_error_msg());
    // In a narrow frame no unit encloses, nothing is recorded either.
    runInNarrowFrame("narrow", [], () => {
      Assert.assertFalse(p.preg_match("/abc", "a"));
      Assert.assertSame(0, p.preg_last_error());
    });
    // A frame's code does not outlive it.
    runInFrame("unit", () => {
      Assert.assertFalse(p.preg_match("/abc", "a"));
      Assert.assertSame(1, p.preg_last_error());
    });
    Assert.assertSame(0, p.preg_last_error());
    runInFrame("unit", () => Assert.assertSame(0, p.preg_last_error()));
    // Two concurrent frames keep their codes apart.
    const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1));
    const [left, right] = await Promise.all([
      runInFrame("unit", async () => {
        const out: unknown[] = [p.preg_match("/a", "a")];
        await tick();
        out.push(p.preg_last_error());
        await tick();
        out.push(p.preg_match("/a/", "a"), p.preg_last_error());
        return out;
      }),
      runInFrame("unit", async () => {
        const out: unknown[] = [p.preg_match("/./u", "é", null, 0, 1)];
        await tick();
        out.push(p.preg_last_error_msg());
        await tick();
        out.push(p.preg_last_error());
        return out;
      }),
    ]);
    Assert.assertSame("[false,1,1,0]", json(left));
    Assert.assertSame('[false,"The offset did not correspond to the beginning of a valid UTF-8 code point",5]', json(right));

    // Xaravel-only: a form outside the rule throws the JS TypeError limit and records no code.
    runInFrame("unit", () => {
      Assert.assertFalse(p.preg_match("/abc", "a"));
      for (const pattern of [
        "/a++/", "/a*+/", "/a?+/", "/a{1,2}+/", "/(?>a)/", "/(?R)/", "/(a)(?1)/", "/(?(1)a|b)/", "/\\Ga/", "/a\\Z/", "/a/x", "/(?i)a/",
        "/(?i:a)/", "/a\\Kb/", "/a/U", "/(?<n>a)/J", "/(a)/n", "/a/r", "/(a)\\1/", "/(?<n>a)\\k<n>/", "/(a)\\g1/", "/(?P<n>a)(?P=n)/",
        "/\\w/u", "/\\W/u", "/\\d/u", "/\\D/u", "/\\b/u", "/\\B/u", "/[\\w]/u", "/[\\d]/u", "/[[:alpha:]]/u", "/[[:^space:]]/u",
        "/é/i", "/[é]/i", "/\\xe9/i", "/[\\x00-\\xff]/i", "/(?#c)a/", "/\\Qa\\E/", "/\\h/", "/\\v/", "/\\R/", "/\\N/", "/\\X/",
        "/\\cA/", "/\\o{101}/", "/[[:<:]]a/", "/a[[:>:]]/", "/(*UTF8)a/", "/(?|(?<n>a)|b)/", "/(?:(a)|b)+/", "/(a*)*/", "/(a|)+/", "/(a*)?/",
        "/(?<=(a))b/", "/(?=a)*/", "/\\p{Greek}/u", "/\\p{Xan}/u", "/\\p{Lu}/iu", "/[\\101]/",
      ]) {
        Assert.assertStringContainsString("PORTING.md § PCRE conversion", jsTypeError(() => p.preg_match(pattern, "a"), pattern), pattern);
        Assert.assertSame(1, p.preg_last_error(), pattern);
      }
      Assert.assertStringContainsString("PORTING.md", jsTypeError(() => p.preg_split("/a++/", "a")));
      Assert.assertStringContainsString("PORTING.md", jsTypeError(() => p.preg_match_all("/a++/", "a")));
      Assert.assertStringContainsString("PORTING.md", jsTypeError(() => p.preg_replace_callback("/a++/", () => "", "a")));
      Assert.assertSame(1, p.preg_last_error());
    });
    // Xaravel-only: a captured value that splits a UTF-8 sequence throws the limit when its slot is read (phpdotenv's
    // Lexer never reads the group that holds one byte); a keyed array holding one throws at once; a lone surrogate
    // throws the limit.
    const split = new p.Ref<unknown>(null);
    Assert.assertSame(1, p.preg_match("/(.)(.)/", "é", split));
    Assert.assertSame("é", (split.value as unknown[])[0]);
    Assert.assertSame(3, (split.value as unknown[]).length);
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => (split.value as unknown[])[1]));
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => json(split.value)));
    (split.value as unknown[])[1] = "x";
    Assert.assertSame("x", (split.value as unknown[])[1]);
    const pairs = new p.Ref<unknown>(null);
    p.preg_match_all("/./", "é", pairs, p.PREG_SET_ORDER | p.PREG_OFFSET_CAPTURE);
    Assert.assertSame(1, ((pairs.value as unknown[][])[1]![0] as unknown[])[1]);
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => ((pairs.value as unknown[][])[1]![0] as unknown[])[0]));
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => p.preg_match("/(?<n>.)/", "é", new p.Ref<unknown>(null))));
    const pieces = p.preg_split("/\\xa9/", "éa") as unknown[];
    Assert.assertSame("a", pieces[1]);
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => pieces[0]));
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => p.preg_replace_callback("/\\xa9/", () => "", "é")));
    Assert.assertSame(1, p.preg_match("/./", "é"));
    for (const call of [() => p.preg_match("/a/", "\ud800"), () => p.preg_match("/\ud800/u", "a"), () => p.preg_split("/a/", "\udc00"),
      () => p.preg_replace_callback("/a/", () => "\ud800", "a")]) {
      Assert.assertStringContainsString("lone surrogate", jsTypeError(call));
    }
    // Xaravel-only: no limit records an error code: each runs in a frame seeded with error 5, which stays.
    runInFrame("unit", () => {
      for (const [label, call] of [
        ["out-of-rule form", () => p.preg_match("/a++/", "a")],
        ["out-of-rule form in preg_replace_callback", () => p.preg_replace_callback("/a++/", () => "", "a")],
        ["split capture in a keyed callback argument", () => p.preg_replace_callback("/(?<n>.)/", () => "", "é")],
        ["split capture in a named PREG_PATTERN_ORDER list", () => p.preg_match_all("/(?<n>.)/", "é", new p.Ref<unknown>(null))],
        ["split replacement result", () => p.preg_replace_callback("/\\xa9/", () => "", "é")],
        ["lone surrogate in the subject", () => p.preg_match("/a/", "\ud800")],
        ["lone surrogate in the pattern", () => p.preg_match("/\ud800/u", "a")],
        ["lone surrogate in a callback result", () => p.preg_replace_callback("/a/", () => "\ud800", "a")],
        ["lone surrogate in a callback result, array subject", () => p.preg_replace_callback("/a/", () => "\ud800", ["b", "a"])],
        ["array pattern with a later out-of-rule pattern", () => p.preg_replace_callback(["/a/", "/a++/"], () => "", "a")],
        ["array pattern with a later out-of-rule pattern, array subject", () => p.preg_replace_callback(["/a/", "/b/", "/(?>a)/"], () => "", ["a", "b"])],
      ] as const) {
        Assert.assertSame(false, p.preg_match("/./u", "é", null, 0, 1), label);
        Assert.assertSame(5, p.preg_last_error(), label);
        jsTypeError(call, label);
        Assert.assertSame(5, p.preg_last_error(), label);
      }
      // A count Ref is left as it was when a limit throws.
      const count = new p.Ref<unknown>("untouched");
      jsTypeError(() => p.preg_replace_callback("/a/", () => "\ud800", "a", -1, count));
      Assert.assertSame("untouched", count.value);
    });
    // Xaravel-only: in PREG_PATTERN_ORDER a split capture's list slot throws when read, and an assigned slot is
    // replaced; a named group's list throws at once.
    const ordered = new p.Ref<unknown>(null);
    Assert.assertSame(2, p.preg_match_all("/./", "é", ordered));
    const list = (ordered.value as unknown[][])[0]!;
    Assert.assertSame(2, list.length);
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => list[0]));
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => list[1]));
    list[0] = "x";
    Assert.assertSame("x", list[0]);
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => p.preg_match_all("/(?<n>.)/", "é", new p.Ref<unknown>(null))));
    // Xaravel-only: a by-reference argument is a Ref; null or omitted is none; anything else is refused.
    Assert.assertSame(1, p.preg_match("/a/", "a", null));
    Assert.assertStringContainsString("DIV-9.2", jsTypeError(() => p.preg_match("/a/", "a", 5 as never)));
    Assert.assertStringContainsString("DIV-9.2", jsTypeError(() => p.preg_replace_callback("/a/", () => "", "a", -1, [] as never)));
    // Through the registry a non-Ref by-reference argument gets a fresh Ref, as PHP's call does.
    Assert.assertSame(1, p.phpFunction("preg_match")!("/a/", "a", 5));
    // Xaravel-only: an undefined optional argument is omitted.
    Assert.assertSame(1, p.preg_match("/b/", "ab", undefined, undefined, undefined));
    Assert.assertSame('["a","c"]', json(p.preg_split("/b/", "abc", undefined, undefined)));
  },
);

xaravelTest(
  "XT-runtime-147",
  "one pattern string's compiled-pattern cache entry gives PHP 8.5.11's results to global, sticky and empty-match-retry calls nested in a preg_replace_callback callback, to sequential calls with different offsets, and to a cached compile failure with its error code; an entry is frozen, each call gets its own RegExp, the JS TypeError limit still names each caller, and the cache keeps at most 4096 pattern strings (decisions/MAINT-2026-10-30-epic-15-items.md Item 6, AD-5)",
  () => {
    assertLabels(["cache.interleaved"]);
    // Xaravel-only: the same pattern string gives the same frozen entry, and no RegExp is shared.
    const entry = compilePattern("preg_match", "/c(a)c/u")!;
    Assert.assertTrue(entry === compilePattern("preg_split", "/c(a)c/u"));
    Assert.assertTrue(Object.isFrozen(entry) && Object.isFrozen(entry.names) && Object.isFrozen(entry.phpOf));
    Assert.assertFalse("search" in entry);
    const first = searchRegExp(entry);
    const second = searchRegExp(entry);
    Assert.assertTrue(first !== second);
    Assert.assertSame(0, second.lastIndex);
    Assert.assertTrue(first.global && !first.sticky);
    Assert.assertTrue(searchRegExp(compilePattern("preg_match", "/a/A")!).sticky);
    // Xaravel-only: a limit is not cached, so each caller's TypeError names it.
    Assert.assertStringContainsString("preg_match()", jsTypeError(() => p.preg_match("/a/x", "a")));
    Assert.assertStringContainsString("preg_split()", jsTypeError(() => p.preg_split("/a/x", "a")));
    Assert.assertStringContainsString("preg_match_all()", jsTypeError(() => p.preg_match_all("/a++/", "a")));
    Assert.assertStringContainsString("preg_replace_callback()", jsTypeError(() => p.preg_replace_callback("/a++/", () => "", "a")));
    // Xaravel-only: after PATTERN_CACHE_SIZE other pattern strings the first is converted again.
    Assert.assertSame(4096, PATTERN_CACHE_SIZE);
    const oldest = compilePattern("preg_match", "/lru-first/")!;
    Assert.assertTrue(oldest === compilePattern("preg_match", "/lru-first/"));
    for (let i = 0; i < PATTERN_CACHE_SIZE - 1; i++) {
      compilePattern("preg_match", `/lru-${i}/`);
    }
    // 4095 newer entries: the first is still held.
    Assert.assertTrue(oldest === compilePattern("preg_match", "/lru-first/"));
    // A hit made it the newest, so 4096 more evict it.
    for (let i = 0; i < PATTERN_CACHE_SIZE; i++) {
      compilePattern("preg_match", `/lru-again-${i}/`);
    }
    const again = compilePattern("preg_match", "/lru-first/")!;
    Assert.assertTrue(oldest !== again);
    Assert.assertSame(oldest.source, again.source);
    Assert.assertSame(1, p.preg_match("/lru-first/", "lru-first"));
    // Xaravel-only: a hit refreshes recency (LRU, not FIFO). With the cache full and `/lru-recent/` oldest, a hit then
    // one new pattern string evicts `/lru-recent-0/`, inserted right after it, and keeps `/lru-recent/`.
    const recent = compilePattern("preg_match", "/lru-recent/")!;
    const next = compilePattern("preg_match", "/lru-recent-0/")!;
    for (let i = 1; i < PATTERN_CACHE_SIZE - 1; i++) {
      compilePattern("preg_match", `/lru-recent-${i}/`);
    }
    Assert.assertTrue(recent === compilePattern("preg_match", "/lru-recent/"));
    compilePattern("preg_match", "/lru-recent-new/");
    Assert.assertTrue(recent === compilePattern("preg_match", "/lru-recent/"));
    Assert.assertTrue(next !== compilePattern("preg_match", "/lru-recent-0/"));
  },
);
