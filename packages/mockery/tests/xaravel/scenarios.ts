// The shared scenario table of Stories 4.5 (XT-mockery-1..3) and 4.6
// (XT-mockery-4): each Mockery scenario as PHP source and as its TS twin, and
// the PHP/TS twin classes.
//
// The request files `conformance/oracle-requests/4.5.jsonl` and `4.6.jsonl`
// were generated from this table (by a throwaway script outside the
// repository, through tools/oracle/request.ts's makeRequest and
// renderRequests: one request per Xaravel Test ID, `setup` = `setupFor(id)`,
// `exprs` = each scenario's `wrapPhp`), and mockery.test.ts rebuilds every
// request's `setup` and `exprs` from it, so the table and the signed fixtures
// cannot drift apart. No expected outcome is written here: every one comes
// from the Oracle (real Mockery 1.6.15).
//
// Story 4.6's twins (`XtIface`, `XtReal`) are declared in SETUP_ADVANCED
// only, after 4.5's SETUP, so 4.5's requests keep their bytes. TS has no
// class registry of its own (the grader never imports the runtime), so this
// module layers a stand-in for the class-lookup protocol
// (`globalThis[Symbol.for('xaravel.class.lookup')]`, ESC-4.6-1 item 9) that
// resolves the twins' names over any lookup already installed, and restores
// it after the importing file's tests.
//
// A scenario appends what it observes to `$r` / `r`. The wrapper closes the
// container and gives `['ok', $r]`, or `['throws', <short class>, <message>]`
// for the first throw (then closes again, ignoring a second throw). `xt_try` /
// `xtTry` records a throw without ending the scenario.
import { afterAll } from "bun:test";
import type { Mockery as MockeryClass } from "../../src/index";
import { BadMethodCallException as SplBadMethodCallException } from "../../src/php/BadMethodCallException";
import { UnexpectedValueException as SplUnexpectedValueException } from "../../src/php/UnexpectedValueException";
import { Exception as MockeryException } from "../../src/Mockery/Exception";
import { shortClassName } from "../../src/support/values";
import { BrandedArray } from "../../../assert/tests/xaravel/oracle-values";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

// ---------------------------------------------------------------------------
// Twin classes (PHP declarations in SETUP)

export class XtFoo {
  static readonly [CLASS_FQCN]: string = "XtFoo";
  // PHP lets a caller pass more arguments than a method declares, so the twins take any.
  bar(..._args: unknown[]): unknown {
    return null;
  }
  baz(..._args: unknown[]): unknown {
    return null;
  }
  qux(..._args: unknown[]): unknown {
    return null;
  }
}

export class XtBar extends XtFoo {
  static override readonly [CLASS_FQCN]: string = "XtBar";
}

export class XtErr extends Error {
  static readonly [CLASS_FQCN]: string = "XtErr";
  // PHP's Exception keeps these protected: no public property.
  readonly #code: number;
  readonly #previous: Error | null;
  constructor(message: string = "", code: number = 0, previous: Error | null = null) {
    super(message);
    this.#code = code;
    this.#previous = previous;
  }
  getMessage(): string {
    return this.message;
  }
  getCode(): number {
    return this.#code;
  }
  getPrevious(): Error | null {
    return this.#previous;
  }
}

export class XtProp {
  static readonly [CLASS_FQCN]: string = "XtProp";
  a = 1;
  s = "x";
  f = 1.5;
  n = null;
  l = [1, [2]];
  o: unknown = null;
}

/** Story 4.6's real-bodied twin: its constructor records each argument list in `made`. */
export class XtReal {
  static readonly [CLASS_FQCN]: string = "XtReal";
  static made: unknown[][] = [];
  constructor(...args: unknown[]) {
    XtReal.made.push(args);
  }
  bar(..._args: unknown[]): unknown {
    return "real bar";
  }
  baz(..._args: unknown[]): unknown {
    return this.bar("from baz");
  }
  qux(..._args: unknown[]): unknown {
    return "real";
  }
}

const MODEL_STATE = Symbol.for("xaravel.model.state");

/** Every key XtModel's defineProperty trap saw, in order (XT-mockery-5). */
export const MODEL_TRAP_KEYS: (string | symbol)[] = [];

/** Every string key XtModel's own set trap took, in order (XT-mockery-5). */
export const MODEL_SET_KEYS: string[] = [];

/**
 * XT-mockery-5's local model double (no graded Model is imported): its prototype declares `MODEL_STATE`, and its
 * constructor returns a Proxy whose defineProperty trap throws on a string key, as an Eloquent model's attribute
 * Proxy would refuse a member it does not own. Its set trap takes a string key into its own attribute record, as a
 * Model routes `$model->x = v` to its attributes, never to defineProperty.
 */
export class XtModel {
  static readonly [CLASS_FQCN]: string = "XtModel";
  static made: unknown[][] = [];
  constructor(...args: unknown[]) {
    XtModel.made.push(args);
    const attributes = new Map<string, unknown>();
    return new Proxy(this, {
      set(target, key, value, receiver): boolean {
        if (typeof key === "string") {
          MODEL_SET_KEYS.push(key);
          attributes.set(key, value);
          return true;
        }
        return Reflect.set(target, key, value, receiver);
      },
      defineProperty(target, key, descriptor): boolean {
        MODEL_TRAP_KEYS.push(key);
        if (typeof key === "string") {
          throw new Error(`XtModel's defineProperty trap was called with the string key ${key}`);
        }
        return Reflect.defineProperty(target, key, descriptor);
      },
    });
  }
  getConnectionName(): unknown {
    return "real-connection";
  }
  getTable(): unknown {
    return `${String(this.getConnectionName())}:table`;
  }
}
Object.defineProperty(XtModel.prototype, MODEL_STATE, { value: null, writable: true, configurable: true, enumerable: false });

const LOOKUP = Symbol.for("xaravel.class.lookup");
const TWINS = new Map<string, unknown>([
  ["xtfoo", XtFoo],
  ["xtbar", XtBar],
  ["xterr", XtErr],
  ["xtprop", XtProp],
  ["xtreal", XtReal],
  ["xtmodel", XtModel],
]);
// Layered on whatever lookup is installed (the runtime's, when a file loaded it): the twins first, every other name
// delegated to the previous lookup (null when there was none); the previous property, or its absence, is restored
// after the importing file's tests, so the grader's results never depend on the runtime's lookup.
const previousLookupDescriptor = Object.getOwnPropertyDescriptor(globalThis, LOOKUP);
const previousLookup: unknown = (globalThis as Record<symbol, unknown>)[LOOKUP];
Object.defineProperty(globalThis, LOOKUP, {
  value: (name: string): unknown =>
    TWINS.get(name.toLowerCase()) ?? (typeof previousLookup === "function" ? (previousLookup as (name: string) => unknown)(name) : null),
  writable: true,
  configurable: true,
  enumerable: false,
});
afterAll(() => {
  if (previousLookupDescriptor === undefined) {
    delete (globalThis as Record<symbol, unknown>)[LOOKUP];
  } else {
    Object.defineProperty(globalThis, LOOKUP, previousLookupDescriptor);
  }
});

export const SETUP: readonly string[] = [
  "class XtFoo { public function bar($x = null) {} public function baz() {} public function qux() {} }",
  "class XtBar extends XtFoo {}",
  "class XtErr extends \\Exception {}",
  "class XtProp { public $a = 1; public $s = 'x'; public $f = 1.5; public $n = null; public $l = [1, [2]]; public $o = null; }",
  "function xt_try(callable $f) { try { return ['ok', $f()]; } catch (\\Throwable $e) { return ['throws', (new \\ReflectionClass($e))->getShortName(), $e->getMessage()]; } }",
];

/** XT-mockery-4's setup: 4.5's, then Story 4.6's twins. */
export const SETUP_ADVANCED: readonly string[] = [
  ...SETUP,
  "interface XtIface { public function ifm(); }",
  "class XtReal { public static $made = []; public function __construct(...$a) { self::$made[] = $a; } public function bar($x = null) { return 'real bar'; } public function baz() { return $this->bar('from baz'); } public function qux() { return 'real'; } }",
];

/** The request setup of a Xaravel Test ID. */
export function setupFor(id: Scenario["id"]): readonly string[] {
  return id === "XT-mockery-4" ? SETUP_ADVANCED : SETUP;
}

/** The message of a thrown value (a PHP-style exception's `getMessage()`, else `message`). */
export function messageOf(error: unknown): unknown {
  if (typeof error === "object" && error !== null && typeof (error as { getMessage?: unknown }).getMessage === "function") {
    return (error as { getMessage: () => unknown }).getMessage();
  }
  return error instanceof Error ? error.message : String(error);
}

/** `xt_try`: `['ok', <value>]`, or `['throws', <short class>, <message>]`. */
export function xtTry(fn: () => unknown): unknown[] {
  try {
    return ["ok", fn()];
  } catch (error) {
    return ["throws", shortClassName(error), messageOf(error)];
  }
}

/** The PHP class name (FQCN) of a thrown value. */
function classOf(error: unknown): string {
  const ctor = (error as { constructor?: unknown }).constructor as Record<symbol, unknown> | undefined;
  return typeof ctor?.[CLASS_FQCN] === "string" ? (ctor[CLASS_FQCN] as string) : "?";
}

type M = typeof MockeryClass;
type MockOf = ReturnType<M["mock"]>;

export interface Scenario {
  readonly id: "XT-mockery-1" | "XT-mockery-2" | "XT-mockery-3" | "XT-mockery-4" | "XT-mockery-7";
  readonly label: string;
  /** The AC 1 API names the scenario exercises (4.5's or 4.6's). */
  readonly uses: readonly string[];
  /** PHP statements; they append to `$r`. */
  readonly php: string;
  /** The TS twin; it appends to `r`. */
  readonly run: (Mockery: M, r: unknown[]) => void;
}

/** The PHP expression of one scenario. */
export function wrapPhp(php: string): string {
  return `(function () { try { $r = []; ${php} \\Mockery::close(); return ['ok', $r]; } catch (\\Throwable $e) { try { \\Mockery::close(); } catch (\\Throwable $ignored) {} return ['throws', (new \\ReflectionClass($e))->getShortName(), $e->getMessage()]; } })()`;
}

/** Runs the TS twin of one scenario with the same wrapping. */
export function runScenario(Mockery: M, scenario: Scenario): unknown[] {
  const r: unknown[] = [];
  try {
    scenario.run(Mockery, r);
    Mockery.close();
    return ["ok", r];
  } catch (error) {
    try {
      Mockery.close();
    } catch {
      // ignored, as the PHP wrapper does
    }
    return ["throws", shortClassName(error), messageOf(error)];
  }
}

const FOO = "$m = \\Mockery::mock(\\XtFoo::class);";

export const SCENARIOS: readonly Scenario[] = [
  // ---- XT-mockery-1: the core API
  {
    id: "XT-mockery-1",
    label: "once() met, with(1), andReturn(2)",
    uses: ["shouldReceive", "once", "with", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->once()->with(1)->andReturn(2); $r[] = $m->bar(1);`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").once().with(1).andReturn(2);
      r.push(m.bar(1));
    },
  },
  {
    id: "XT-mockery-1",
    label: "once() unmet",
    uses: ["shouldReceive", "once"],
    php: `${FOO} $m->shouldReceive('bar')->once();`,
    run: (Mockery) => {
      Mockery.mock(XtFoo).shouldReceive("bar").once();
    },
  },
  {
    id: "XT-mockery-1",
    label: "twice() met",
    uses: ["shouldReceive", "twice"],
    php: `${FOO} $m->shouldReceive('bar')->twice(); $r[] = $m->bar(); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").twice();
      r.push(m.bar(), m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "twice() unmet: one call",
    uses: ["shouldReceive", "twice"],
    php: `${FOO} $m->shouldReceive('bar')->twice(); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").twice();
      r.push(m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "times(3) met",
    uses: ["shouldReceive", "times"],
    php: `${FOO} $m->shouldReceive('bar')->times(3)->andReturn(1); $r[] = $m->bar(); $r[] = $m->bar(); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").times(3).andReturn(1);
      r.push(m.bar(), m.bar(), m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "times(3) unmet: four calls, the fourth still answered",
    uses: ["shouldReceive", "times"],
    php: `${FOO} $m->shouldReceive('bar')->times(3)->andReturn(1); for ($i = 0; $i < 4; $i++) { $r[] = $m->bar(); } $r[] = xt_try(function () { \\Mockery::close(); return null; });`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").times(3).andReturn(1);
      for (let i = 0; i < 4; i++) {
        r.push(m.bar());
      }
      r.push(
        xtTry(() => {
          Mockery.close();
          return null;
        }),
      );
    },
  },
  {
    id: "XT-mockery-1",
    label: "never() met",
    uses: ["shouldReceive", "never"],
    php: `${FOO} $m->shouldReceive('bar')->never(); $r[] = 'none';`,
    run: (Mockery, r) => {
      Mockery.mock(XtFoo).shouldReceive("bar").never();
      r.push("none");
    },
  },
  {
    id: "XT-mockery-1",
    label: "never() unmet: one call",
    uses: ["shouldReceive", "never"],
    php: `${FOO} $m->shouldReceive('bar')->never(); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").never();
      r.push(m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "atLeast()->times(2) met with three calls",
    uses: ["shouldReceive", "atLeast", "times"],
    php: `${FOO} $m->shouldReceive('bar')->atLeast()->times(2)->andReturn('x'); $r[] = $m->bar(); $r[] = $m->bar(); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").atLeast().times(2).andReturn("x");
      r.push(m.bar(), m.bar(), m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "atLeast()->times(2) unmet: one call",
    uses: ["shouldReceive", "atLeast", "times"],
    php: `${FOO} $m->shouldReceive('bar')->atLeast()->times(2); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").atLeast().times(2);
      r.push(m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "atMost()->times(1) met",
    uses: ["shouldReceive", "atMost", "times"],
    php: `${FOO} $m->shouldReceive('bar')->atMost()->times(1)->andReturn('y'); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").atMost().times(1).andReturn("y");
      r.push(m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "atMost()->times(1) unmet: two calls",
    uses: ["shouldReceive", "atMost", "times"],
    php: `${FOO} $m->shouldReceive('bar')->atMost()->times(1)->andReturn('y'); $r[] = $m->bar(); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").atMost().times(1).andReturn("y");
      r.push(m.bar(), m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "with(1) matches '1' (PHP ==)",
    uses: ["shouldReceive", "with", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->with(1)->andReturn('a'); $r[] = $m->bar('1'); $r[] = $m->bar(1.0);`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(1).andReturn("a");
      r.push(m.bar("1"), m.bar(1.0));
    },
  },
  {
    id: "XT-mockery-1",
    label: "with(null) matches false",
    uses: ["shouldReceive", "with", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->with(null)->andReturn('b'); $r[] = $m->bar(false); $r[] = xt_try(fn () => $m->bar(true));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(null).andReturn("b");
      r.push(
        m.bar(false),
        xtTry(() => m.bar(true)),
      );
    },
  },
  {
    id: "XT-mockery-1",
    label: "with([1, 2]) matches [1, 2] and ['1', '2']",
    uses: ["shouldReceive", "with", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->with([1, 2])->andReturn('c'); $r[] = $m->bar([1, 2]); $r[] = $m->bar(['1', '2']); $r[] = xt_try(fn () => $m->bar([2, 1]));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with([1, 2]).andReturn("c");
      r.push(
        m.bar([1, 2]),
        m.bar(["1", "2"]),
        xtTry(() => m.bar([2, 1])),
      );
    },
  },
  {
    id: "XT-mockery-1",
    label: "with('XtFoo') matches an XtBar instance",
    uses: ["shouldReceive", "with", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->with('XtFoo')->andReturn('d'); $r[] = $m->bar(new \\XtBar()); $r[] = $m->bar('XtFoo');`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with("XtFoo").andReturn("d");
      r.push(m.bar(new XtBar()), m.bar("XtFoo"));
    },
  },
  {
    id: "XT-mockery-1",
    label: "with(XtFoo::class) (the class itself in TS) matches an XtBar instance",
    uses: ["shouldReceive", "with", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->with(\\XtFoo::class)->andReturn('e'); $r[] = $m->bar(new \\XtBar()); $r[] = xt_try(fn () => $m->bar(new \\XtErr()));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(XtFoo).andReturn("e");
      r.push(
        m.bar(new XtBar()),
        xtTry(() => m.bar(new XtErr())),
      );
    },
  },
  {
    id: "XT-mockery-1",
    label: "withArgs([1])",
    uses: ["shouldReceive", "withArgs", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->withArgs([1])->andReturn('f'); $r[] = $m->bar(1); $r[] = xt_try(fn () => $m->bar(1, 2));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").withArgs([1]).andReturn("f");
      r.push(
        m.bar(1),
        xtTry(() => m.bar(1, 2)),
      );
    },
  },
  {
    id: "XT-mockery-1",
    label: "withArgs(closure) returning true",
    uses: ["shouldReceive", "withArgs", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->withArgs(fn ($x) => $x === 1)->andReturn('g'); $r[] = $m->bar(1); $r[] = xt_try(fn () => $m->bar(2));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar")
        .withArgs((x: unknown) => x === 1)
        .andReturn("g");
      r.push(
        m.bar(1),
        xtTry(() => m.bar(2)),
      );
    },
  },
  {
    id: "XT-mockery-1",
    label: "withArgs(closure) returning 1 does not match",
    uses: ["shouldReceive", "withArgs"],
    php: `${FOO} $m->shouldReceive('bar')->withArgs(fn () => 1); $r[] = xt_try(fn () => $m->bar(1));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").withArgs(() => 1);
      r.push(xtTry(() => m.bar(1)));
    },
  },
  {
    id: "XT-mockery-1",
    label: "withArgs() with neither an array nor a closure",
    uses: ["shouldReceive", "withArgs"],
    php: `${FOO} $m->shouldReceive('bar')->withArgs(5);`,
    run: (Mockery) => {
      Mockery.mock(XtFoo)
        .shouldReceive("bar")
        .withArgs(5 as never);
    },
  },
  {
    id: "XT-mockery-1",
    label: "withAnyArgs() after with(1)",
    uses: ["shouldReceive", "with", "withAnyArgs", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->with(1)->withAnyArgs()->andReturn('h'); $r[] = $m->bar(5, 6); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(1).withAnyArgs().andReturn("h");
      r.push(m.bar(5, 6), m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "with() expects no arguments",
    uses: ["shouldReceive", "with"],
    php: `${FOO} $m->shouldReceive('bar')->with(); $r[] = xt_try(fn () => $m->bar(1)); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with();
      r.push(
        xtTry(() => m.bar(1)),
        m.bar(),
      );
    },
  },
  {
    id: "XT-mockery-1",
    label: "andReturn(1, 2) over three calls",
    uses: ["shouldReceive", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->andReturn(1, 2); $r[] = $m->bar(); $r[] = $m->bar(); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andReturn(1, 2);
      r.push(m.bar(), m.bar(), m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "andReturnValues([3, 4]) over three calls",
    uses: ["shouldReceive", "andReturnValues"],
    php: `${FOO} $m->shouldReceive('bar')->andReturnValues([3, 4]); $r[] = $m->bar(); $r[] = $m->bar(); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andReturnValues([3, 4]);
      r.push(m.bar(), m.bar(), m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "andThrow(new XtErr('e')) throws that object",
    uses: ["shouldReceive", "andThrow"],
    php: `${FOO} $x = new \\XtErr('e'); $m->shouldReceive('bar')->andThrow($x); try { $m->bar(); $r[] = 'no throw'; } catch (\\XtErr $e) { $r[] = [$e === $x, $e->getMessage()]; }`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      const x = new XtErr("e");
      m.shouldReceive("bar").andThrow(x);
      try {
        m.bar();
        r.push("no throw");
      } catch (error) {
        if (!(error instanceof XtErr)) {
          throw error;
        }
        r.push([error === x, error.getMessage()]);
      }
    },
  },
  {
    id: "XT-mockery-1",
    label: "andThrow(XtErr::class, 'm', 7) builds the exception",
    uses: ["shouldReceive", "andThrow"],
    php: `${FOO} $m->shouldReceive('bar')->andThrow(\\XtErr::class, 'm', 7); try { $m->bar(); $r[] = 'no throw'; } catch (\\XtErr $e) { $r[] = [$e->getMessage(), $e->getCode()]; }`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andThrow(XtErr, "m", 7);
      try {
        m.bar();
        r.push("no throw");
      } catch (error) {
        if (!(error instanceof XtErr)) {
          throw error;
        }
        r.push([error.getMessage(), error.getCode()]);
      }
    },
  },
  {
    id: "XT-mockery-1",
    label: "andReturn() of an exception without andThrow returns it",
    uses: ["shouldReceive", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->andReturn(new \\XtErr('r')); $r[] = $m->bar()->getMessage();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andReturn(new XtErr("r"));
      r.push((m.bar() as XtErr).getMessage());
    },
  },
  {
    id: "XT-mockery-1",
    label: "ordered() in order",
    uses: ["shouldReceive", "ordered"],
    php: `${FOO} $m->shouldReceive('bar')->ordered(); $m->shouldReceive('baz')->ordered(); $r[] = $m->bar(); $r[] = $m->baz();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").ordered();
      m.shouldReceive("baz").ordered();
      r.push(m.bar(), m.baz());
    },
  },
  {
    id: "XT-mockery-1",
    label: "ordered() out of order throws at the call",
    uses: ["shouldReceive", "ordered"],
    php: `${FOO} $m->shouldReceive('bar')->ordered(); $m->shouldReceive('baz')->ordered(); $r[] = $m->baz(); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").ordered();
      m.shouldReceive("baz").ordered();
      r.push(m.baz());
      r.push(m.bar());
    },
  },
  {
    id: "XT-mockery-1",
    label: "ordered() in two groups",
    uses: ["shouldReceive", "ordered", "with"],
    php: `${FOO} $m->shouldReceive('bar')->ordered('g1'); $m->shouldReceive('baz')->ordered('g1'); $m->shouldReceive('qux')->ordered('g2'); $r[] = $m->baz(); $r[] = $m->bar(); $r[] = $m->qux(); $r[] = xt_try(fn () => $m->bar()); $r[] = xt_try(fn () => $m->qux());`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").ordered("g1");
      m.shouldReceive("baz").ordered("g1");
      m.shouldReceive("qux").ordered("g2");
      r.push(m.baz(), m.bar(), m.qux());
      r.push(
        xtTry(() => m.bar()),
        xtTry(() => m.qux()),
      );
    },
  },
  {
    id: "XT-mockery-1",
    label: "two exhausted with(1)->once() expectations: the third call falls back to the first",
    uses: ["shouldReceive", "with", "once", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar')->with(1)->once()->andReturn('a'); $m->shouldReceive('bar')->with(1)->once()->andReturn('b'); $r[] = $m->bar(1); $r[] = $m->bar(1); $r[] = $m->bar(1); $r[] = xt_try(function () { \\Mockery::close(); return null; });`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(1).once().andReturn("a");
      m.shouldReceive("bar").with(1).once().andReturn("b");
      r.push(m.bar(1), m.bar(1), m.bar(1));
      r.push(
        xtTry(() => {
          Mockery.close();
          return null;
        }),
      );
    },
  },
  {
    id: "XT-mockery-1",
    label: "several names in one shouldReceive",
    uses: ["shouldReceive", "once", "andReturn", "with"],
    php: `${FOO} $m->shouldReceive('bar', 'baz')->once()->andReturn(5); $r[] = $m->bar(); $r[] = $m->baz(); $r[] = (string) $m->shouldReceive('qux', 'bar')->with(1, 'x');`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar", "baz").once().andReturn(5);
      r.push(m.bar(), m.baz(), String(m.shouldReceive("qux", "bar").with(1, "x")));
    },
  },
  {
    id: "XT-mockery-1",
    label: "no return value gives null; the method name matches case-insensitively",
    uses: ["shouldReceive", "andReturn"],
    php: `${FOO} $m->shouldReceive('bar'); $m->shouldReceive('baz')->andReturn(); $r[] = $m->bar(); $r[] = $m->baz(); $r[] = $m->BAR();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar");
      m.shouldReceive("baz").andReturn();
      r.push(m.bar(), m.baz(), m.BAR());
    },
  },
  {
    id: "XT-mockery-1",
    label: "times('x') is rejected",
    uses: ["shouldReceive", "times"],
    php: `${FOO} $m->shouldReceive('bar')->times('x');`,
    run: (Mockery) => {
      Mockery.mock(XtFoo)
        .shouldReceive("bar")
        .times("x" as never);
    },
  },
  {
    id: "XT-mockery-1",
    label: "a mock of no class",
    uses: ["shouldReceive", "once", "andReturn"],
    php: `$m = \\Mockery::mock(); $m->shouldReceive('anything')->once()->andReturn(3); $r[] = $m->anything(); $r[] = xt_try(fn () => $m->other());`,
    run: (Mockery, r) => {
      const m = Mockery.mock();
      m.shouldReceive("anything").once().andReturn(3);
      r.push(
        m.anything(),
        xtTry(() => m.other()),
      );
    },
  },

  // ---- XT-mockery-2: unmet expectations
  {
    id: "XT-mockery-2",
    label: "once() unmet",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar')->once();`,
    run: (Mockery) => {
      Mockery.mock(XtFoo).shouldReceive("bar").once();
    },
  },
  {
    id: "XT-mockery-2",
    label: "atLeast()->times(2) unmet",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar')->atLeast()->times(2);`,
    run: (Mockery) => {
      Mockery.mock(XtFoo).shouldReceive("bar").atLeast().times(2);
    },
  },
  {
    id: "XT-mockery-2",
    label: "atMost()->times(1) unmet",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar')->atMost()->times(1); $m->bar(); $m->bar();`,
    run: (Mockery) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").atMost().times(1);
      m.bar();
      m.bar();
    },
  },
  {
    id: "XT-mockery-2",
    label: "with(1, 'x')->twice() called once",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar')->with(1, 'x')->twice(); $m->bar(1, 'x');`,
    run: (Mockery) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(1, "x").twice();
      m.bar(1, "x");
    },
  },
  {
    id: "XT-mockery-2",
    label: "the first unmet expectation of the first mock fails the close",
    uses: [],
    php: `$a = \\Mockery::mock(\\XtFoo::class); $b = \\Mockery::mock(\\XtBar::class); $b->shouldReceive('bar')->once(); $a->shouldReceive('qux')->once(); $a->shouldReceive('baz')->once();`,
    run: (Mockery) => {
      const a = Mockery.mock(XtFoo);
      const b = Mockery.mock(XtBar);
      b.shouldReceive("bar").once();
      a.shouldReceive("qux").once();
      a.shouldReceive("baz").once();
    },
  },
  {
    id: "XT-mockery-2",
    label: "the expectation count holds only call-count-constrained expectations",
    uses: [],
    php: `${FOO} $n = \\Mockery::mock(\\XtBar::class); $m->shouldReceive('bar')->once(); $m->shouldReceive('baz'); $m->shouldReceive('qux')->atLeast()->once(); $n->shouldReceive('bar')->never(); $n->shouldReceive('baz')->withAnyArgs(); $r[] = \\Mockery::getContainer()->mockery_getExpectationCount(); $m->bar(); $m->qux();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      const n = Mockery.mock(XtBar);
      m.shouldReceive("bar").once();
      m.shouldReceive("baz");
      m.shouldReceive("qux").atLeast().once();
      n.shouldReceive("bar").never();
      n.shouldReceive("baz").withAnyArgs();
      r.push(Mockery.getContainer().mockery_getExpectationCount());
      m.bar();
      m.qux();
    },
  },

  // ---- XT-mockery-3: a call that matches no expectation
  {
    id: "XT-mockery-3",
    label: "a declared method without expectations",
    uses: [],
    php: `${FOO} try { $m->baz(); } catch (\\BadMethodCallException $e) { $r[] = [get_class($e), $e->getMessage()]; }`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      try {
        m.baz();
      } catch (error) {
        if (!(error instanceof SplBadMethodCallException)) {
          throw error;
        }
        r.push([classOf(error), error.getMessage()]);
      }
    },
  },
  {
    id: "XT-mockery-3",
    label: "an undeclared method",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar'); try { $m->nope(1); } catch (\\BadMethodCallException $e) { $r[] = [get_class($e), $e->getMessage()]; }`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar");
      try {
        m.nope(1);
      } catch (error) {
        if (!(error instanceof SplBadMethodCallException)) {
          throw error;
        }
        r.push([classOf(error), error.getMessage()]);
      }
    },
  },
  {
    id: "XT-mockery-3",
    label: "with(1) called with 2",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar')->with(1); try { $m->bar(2); } catch (\\UnexpectedValueException $e) { $r[] = [get_class($e), $e instanceof \\Mockery\\Exception, $e->getMessage()]; }`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(1);
      try {
        m.bar(2);
      } catch (error) {
        if (!(error instanceof SplUnexpectedValueException)) {
          throw error;
        }
        r.push([classOf(error), error instanceof MockeryException, error.getMessage()]);
      }
    },
  },
  {
    id: "XT-mockery-3",
    label: "with(1) and with(2) called with 3",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar')->with(1); $m->shouldReceive('bar')->with(2)->once(); $m->bar(3);`,
    run: (Mockery) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(1);
      m.shouldReceive("bar").with(2).once();
      m.bar(3);
    },
  },
  {
    id: "XT-mockery-3",
    label: "an object argument against an equal but distinct object",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar')->with(new \\XtFoo()); $m->bar(new \\XtFoo());`,
    run: (Mockery) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(new XtFoo());
      m.bar(new XtFoo());
    },
  },
  {
    id: "XT-mockery-3",
    label: "with() called with one argument",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar')->with(); $m->bar('a');`,
    run: (Mockery) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with();
      m.bar("a");
    },
  },
  {
    id: "XT-mockery-3",
    label: "the arguments are formatted as Mockery does",
    uses: [],
    php: `${FOO} $m->shouldReceive('bar')->with(1); $m->bar(2, [1, 'a' => [2]], 1.5, 1.0, 1.0E+25, -0.25, true, null, 'x', ['a' => 'x'], [], fn () => 1);`,
    run: (Mockery) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").with(1);
      m.bar(
        2,
        new BrandedArray([
          [0, 1],
          ["a", [2]],
        ]),
        1.5,
        1.0,
        1.0e25,
        -0.25,
        true,
        null,
        "x",
        { a: "x" },
        [],
        () => 1,
      );
    },
  },
  {
    id: "XT-mockery-3",
    label: "an object argument with public properties",
    uses: [],
    php: `${FOO} $p = new \\XtProp(); $p->o = new \\XtFoo(); $m->shouldReceive('bar')->with(1); $m->bar($p, new \\XtBar());`,
    run: (Mockery) => {
      const m = Mockery.mock(XtFoo);
      const p = new XtProp();
      p.o = new XtFoo();
      m.shouldReceive("bar").with(1);
      m.bar(p, new XtBar());
    },
  },
  // ---- XT-mockery-4: Story 4.6's API (spies, partials, defaults, matchers, verification, Container forms)
  {
    id: "XT-mockery-4",
    label: "spy: calls answer null and shouldHaveReceived counts",
    uses: ["spy", "shouldHaveReceived"],
    php: `$s = \\Mockery::spy(\\XtFoo::class); $r[] = $s->bar(1); $r[] = $s->nope(); $s->shouldHaveReceived('bar')->with(1)->once(); $r[] = $s->mockery_getExpectationCount();`,
    run: (Mockery, r) => {
      const s = Mockery.spy(XtFoo);
      r.push(s.bar(1), s.nope());
      s.shouldHaveReceived("bar").with(1).once();
      r.push(s.mockery_getExpectationCount());
    },
  },
  {
    id: "XT-mockery-4",
    label: "spy: shouldHaveReceived of a method never called",
    uses: ["spy", "shouldHaveReceived"],
    php: `$s = \\Mockery::spy(\\XtFoo::class); $s->shouldHaveReceived('baz');`,
    run: (Mockery) => {
      Mockery.spy(XtFoo).shouldHaveReceived("baz");
    },
  },
  {
    id: "XT-mockery-4",
    label: "shouldHaveReceived with an argument list, refined by with() and twice()",
    uses: ["spy", "shouldHaveReceived", "with", "twice"],
    php: `$s = \\Mockery::spy(\\XtFoo::class); $s->bar(1); $s->bar(1); $s->bar(2); $s->shouldHaveReceived('bar', [1])->twice(); $r[] = xt_try(fn () => $s->shouldHaveReceived('bar')->with(2)->twice()); $r[] = xt_try(fn () => $s->shouldHaveReceived('bar')->atMost()->times(2)); $r[] = $s->mockery_getExpectationCount();`,
    run: (Mockery, r) => {
      const s = Mockery.spy(XtFoo);
      s.bar(1);
      s.bar(1);
      s.bar(2);
      s.shouldHaveReceived("bar", [1]).twice();
      r.push(
        xtTry(() => s.shouldHaveReceived("bar").with(2).twice()),
        xtTry(() => s.shouldHaveReceived("bar").atMost().times(2)),
        s.mockery_getExpectationCount(),
      );
    },
  },
  {
    id: "XT-mockery-4",
    label: "shouldHaveReceived() as a higher-order message",
    uses: ["spy", "shouldHaveReceived"],
    php: `$s = \\Mockery::spy(\\XtFoo::class); $s->qux(); $s->shouldHaveReceived()->qux()->once(); $r[] = xt_try(fn () => $s->shouldHaveReceived()->qux(5)); $r[] = xt_try(fn () => $s->shouldHaveReceived('qux')->withNoArgs()->twice());`,
    run: (Mockery, r) => {
      const s = Mockery.spy(XtFoo);
      s.qux();
      s.shouldHaveReceived().qux().once();
      r.push(
        xtTry(() => s.shouldHaveReceived().qux(5)),
        xtTry(() => s.shouldHaveReceived("qux").withNoArgs().twice()),
      );
    },
  },
  {
    id: "XT-mockery-4",
    label: "shouldNotHaveReceived, plain and higher-order",
    uses: ["spy", "shouldNotHaveReceived"],
    php: `$s = \\Mockery::spy(\\XtFoo::class); $s->bar(); $r[] = xt_try(fn () => $s->shouldNotHaveReceived('bar')); $r[] = $s->shouldNotHaveReceived('baz'); $r[] = xt_try(fn () => $s->shouldNotHaveReceived()->bar()); $s->shouldNotHaveReceived()->bar(1); $r[] = xt_try(fn () => $s->shouldNotHaveReceived('bar', [])); $r[] = $s->mockery_getExpectationCount();`,
    run: (Mockery, r) => {
      const s = Mockery.spy(XtFoo);
      s.bar();
      r.push(
        xtTry(() => s.shouldNotHaveReceived("bar")),
        s.shouldNotHaveReceived("baz"),
        xtTry(() => s.shouldNotHaveReceived().bar()),
      );
      s.shouldNotHaveReceived().bar(1);
      r.push(
        xtTry(() => s.shouldNotHaveReceived("bar", [])),
        s.mockery_getExpectationCount(),
      );
    },
  },
  {
    id: "XT-mockery-4",
    label: "spy of a class and an interface",
    uses: ["spy", "containerForms"],
    php: `$s = \\Mockery::spy(\\XtFoo::class, \\XtIface::class); $r[] = [$s instanceof \\XtFoo, $s->mockery_getName(), $s->bar()];`,
    run: (Mockery, r) => {
      const s = Mockery.spy(XtFoo, "XtIface");
      r.push([s instanceof XtFoo, s.mockery_getName(), s.bar()]);
    },
  },
  {
    id: "XT-mockery-4",
    label: "a 'Class[method]' partial runs the real constructor and the other methods",
    uses: ["partial", "containerForms", "andReturn"],
    php: `\\XtReal::$made = []; $m = \\Mockery::mock('XtReal[bar]'); $m->shouldReceive('bar')->andReturn('mocked'); $r[] = $m->qux(); $r[] = $m->bar(); $r[] = $m->baz(); $r[] = \\XtReal::$made; $r[] = [$m instanceof \\XtReal, $m->mockery_getName()]; $r[] = xt_try(fn () => \\Mockery::mock('XtReal[bar]')->bar());`,
    run: (Mockery, r) => {
      XtReal.made = [];
      const m = Mockery.mock("XtReal[bar]");
      m.shouldReceive("bar").andReturn("mocked");
      r.push(m.qux(), m.bar(), m.baz(), [...XtReal.made], [m instanceof XtReal, m.mockery_getName()]);
      r.push(xtTry(() => Mockery.mock("XtReal[bar]").bar()));
    },
  },
  {
    id: "XT-mockery-4",
    label: "a 'Class[!method]' partial mocks every other method",
    uses: ["partial", "containerForms"],
    php: `$m = \\Mockery::mock('XtReal[!qux]'); $r[] = $m->qux(); $r[] = xt_try(fn () => $m->bar()); $r[] = xt_try(fn () => \\Mockery::mock('XtNoSuchClass[bar]'));`,
    run: (Mockery, r) => {
      const m = Mockery.mock("XtReal[!qux]");
      r.push(
        m.qux(),
        xtTry(() => m.bar()),
        xtTry(() => Mockery.mock("XtNoSuchClass[bar]")),
      );
    },
  },
  {
    id: "XT-mockery-4",
    label: "makePartial defers calls without a matching expectation to the real method",
    uses: ["makePartial", "with", "andReturn"],
    php: `\\XtReal::$made = []; $m = \\Mockery::mock(\\XtReal::class)->makePartial(); $r[] = $m->qux(); $m->shouldReceive('bar')->andReturn('m'); $r[] = $m->baz(); $m->shouldReceive('qux')->with(1)->andReturn('one'); $r[] = [$m->qux(1), $m->qux(2)]; $r[] = \\XtReal::$made; $r[] = xt_try(fn () => $m->nope());`,
    run: (Mockery, r) => {
      XtReal.made = [];
      const m = Mockery.mock(XtReal).makePartial();
      r.push(m.qux());
      m.shouldReceive("bar").andReturn("m");
      r.push(m.baz());
      m.shouldReceive("qux").with(1).andReturn("one");
      r.push([m.qux(1), m.qux(2)], [...XtReal.made], xtTry(() => m.nope()));
    },
  },
  {
    id: "XT-mockery-4",
    label: "shouldDeferMissing is makePartial",
    uses: ["makePartial"],
    php: `$m = \\Mockery::mock(\\XtReal::class); $r[] = $m->shouldDeferMissing() === $m; $r[] = $m->qux();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtReal);
      r.push(m.shouldDeferMissing() === m, m.qux());
    },
  },
  {
    id: "XT-mockery-4",
    label: "shouldIgnoreMissing(5) answers missing and unmatched calls",
    uses: ["shouldIgnoreMissing", "with", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class)->shouldIgnoreMissing(5); $r[] = $m->nope(); $r[] = $m->bar(); $m->shouldReceive('baz')->with(1)->andReturn('b'); $r[] = $m->baz(2); $r[] = $m->baz(1); $n = \\Mockery::mock(\\XtFoo::class); $r[] = $n->shouldIgnoreMissing() === $n; $r[] = [$n->nope(), $n->qux()];`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo).shouldIgnoreMissing(5);
      r.push(m.nope(), m.bar());
      m.shouldReceive("baz").with(1).andReturn("b");
      r.push(m.baz(2), m.baz(1));
      const n = Mockery.mock(XtFoo);
      r.push(n.shouldIgnoreMissing() === n, [n.nope(), n.qux()]);
    },
  },
  {
    id: "XT-mockery-4",
    label: "byDefault: a later expectation overrides the default",
    uses: ["byDefault", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->andReturn(1)->byDefault(); $r[] = $m->bar(); $m->shouldReceive('bar')->andReturn(2); $r[] = $m->bar(); $e = $m->shouldReceive('baz')->andReturn(3); $m->shouldReceive('baz')->andReturn(4); $r[] = xt_try(fn () => $e->byDefault()); $n = \\Mockery::mock(\\XtFoo::class); $n->shouldReceive('qux')->andReturn('q'); $r[] = $n->byDefault() === $n; $n->shouldReceive('qux')->andReturn('r'); $r[] = $n->qux();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andReturn(1).byDefault();
      r.push(m.bar());
      m.shouldReceive("bar").andReturn(2);
      r.push(m.bar());
      const e = m.shouldReceive("baz").andReturn(3);
      m.shouldReceive("baz").andReturn(4);
      r.push(xtTry(() => e.byDefault()));
      const n = Mockery.mock(XtFoo);
      n.shouldReceive("qux").andReturn("q");
      r.push(n.byDefault() === n);
      n.shouldReceive("qux").andReturn("r");
      r.push(n.qux());
    },
  },
  {
    id: "XT-mockery-4",
    label: "byDefault: an unmet default once() is verified when nothing overrides it",
    uses: ["byDefault", "once"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->once()->byDefault(); $r[] = \\Mockery::getContainer()->mockery_getExpectationCount();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").once().byDefault();
      r.push(Mockery.getContainer().mockery_getExpectationCount());
    },
  },
  {
    id: "XT-mockery-4",
    label: "quick definitions are defaults",
    uses: ["containerForms", "byDefault", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class, ['bar' => 1, 'baz' => 2]); $r[] = $m->bar(); $m->shouldReceive('bar')->andReturn(9); $r[] = [$m->bar(), $m->baz()];`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo, { bar: 1, baz: 2 });
      r.push(m.bar());
      m.shouldReceive("bar").andReturn(9);
      r.push([m.bar(), m.baz()]);
    },
  },
  {
    id: "XT-mockery-4",
    label: "andReturnUsing runs each closure in turn, and closures take precedence over andReturn",
    uses: ["andReturnUsing", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->andReturnUsing(fn ($x) => $x * 2, fn ($x) => $x * 3); $r[] = [$m->bar(1), $m->bar(1), $m->bar(2)]; $m->shouldReceive('baz')->andReturn(5)->andReturnUsing(fn () => 7); $m->shouldReceive('qux')->andReturnUsing(fn () => 8)->andReturn(5); $r[] = [$m->baz(), $m->qux()];`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andReturnUsing(
        (x: number) => x * 2,
        (x: number) => x * 3,
      );
      r.push([m.bar(1), m.bar(1), m.bar(2)]);
      m.shouldReceive("baz")
        .andReturn(5)
        .andReturnUsing(() => 7);
      m.shouldReceive("qux")
        .andReturnUsing(() => 8)
        .andReturn(5);
      r.push([m.baz(), m.qux()]);
    },
  },
  {
    id: "XT-mockery-4",
    label: "andReturnSelf, andReturnTrue, andReturnFalse, andReturnNull and andReturns",
    uses: ["andReturnSelf", "andReturnTrue", "andReturnFalse", "andReturnNull", "andReturns"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->andReturnSelf(); $m->shouldReceive('baz')->andReturnTrue(); $m->shouldReceive('qux')->andReturnFalse(); $m->shouldReceive('a')->andReturn(1)->andReturnNull(); $m->shouldReceive('b')->andReturns(1, 2); $r[] = [$m->bar() === $m, $m->baz(), $m->qux(), $m->a(), $m->b(), $m->b()];`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andReturnSelf();
      m.shouldReceive("baz").andReturnTrue();
      m.shouldReceive("qux").andReturnFalse();
      m.shouldReceive("a").andReturn(1).andReturnNull();
      m.shouldReceive("b").andReturns(1, 2);
      r.push([m.bar() === m, m.baz(), m.qux(), m.a(), m.b(), m.b()]);
    },
  },
  {
    id: "XT-mockery-4",
    label: "andReturnArg returns an argument, and fails for a missing one or a bad index",
    uses: ["andReturnArg"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->andReturnArg(1); $r[] = $m->bar('a', 'b'); $r[] = xt_try(fn () => $m->bar('a')); $r[] = xt_try(fn () => $m->shouldReceive('baz')->andReturnArg(-1));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andReturnArg(1);
      r.push(
        m.bar("a", "b"),
        xtTry(() => m.bar("a")),
        xtTry(() => m.shouldReceive("baz").andReturnArg(-1)),
      );
    },
  },
  {
    id: "XT-mockery-4",
    label: "Mockery::on, ::type and ::any match as Mockery does",
    uses: ["on", "type", "any", "with", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->with(\\Mockery::on(fn ($x) => $x > 1), \\Mockery::type('string'), \\Mockery::any())->andReturn('ok'); $r[] = $m->bar(2, 's', null); $r[] = xt_try(fn () => $m->bar(1, 's', null)); $r[] = xt_try(fn () => $m->bar(2, 3, null)); $m->shouldReceive('baz')->with(\\Mockery::on(fn ($x) => 1))->andReturn('never'); $r[] = xt_try(fn () => $m->baz(1));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar")
        .with(
          Mockery.on((x: number) => x > 1),
          Mockery.type("string"),
          Mockery.any(),
        )
        .andReturn("ok");
      r.push(
        m.bar(2, "s", null),
        xtTry(() => m.bar(1, "s", null)),
        xtTry(() => m.bar(2, 3, null)),
      );
      m.shouldReceive("baz")
        .with(Mockery.on(() => 1))
        .andReturn("never");
      r.push(xtTry(() => m.baz(1)));
    },
  },
  {
    id: "XT-mockery-4",
    label: "matchers print as Mockery prints them",
    uses: ["on", "type", "any", "with", "once"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->with(\\Mockery::on(fn () => true), \\Mockery::type('int'), \\Mockery::any(), \\Mockery::type(\\Closure::class), \\Mockery::type(\\XtFoo::class))->once();`,
    run: (Mockery) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar")
        .with(
          Mockery.on(() => true),
          Mockery.type("int"),
          Mockery.any(),
          Mockery.type("Closure"),
          Mockery.type(XtFoo),
        )
        .once();
    },
  },
  {
    id: "XT-mockery-4",
    label: "Mockery::type over PHP's types and classes",
    uses: ["type", "with", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); foreach (['int', 'float', 'string', 'bool', 'array', 'null', 'XtFoo', 'Closure', 'object'] as $t) { $m->shouldReceive('bar')->with(\\Mockery::type($t))->andReturn($t); } $m->shouldReceive('bar')->with(\\Mockery::any())->andReturn('other'); $r[] = [$m->bar(1), $m->bar(1.5), $m->bar('s'), $m->bar(true), $m->bar([1]), $m->bar(null), $m->bar(new \\XtBar()), $m->bar(fn () => 1), $m->bar(new \\XtErr())]; $m->shouldReceive('baz')->with(\\Mockery::type('numeric'))->andReturn('numeric'); $m->shouldReceive('baz')->with(\\Mockery::type('scalar'))->andReturn('scalar'); $m->shouldReceive('baz')->with(\\Mockery::type('callable'))->andReturn('callable'); $m->shouldReceive('baz')->with(\\Mockery::any())->andReturn('other'); $r[] = [$m->baz('12'), $m->baz('1e3'), $m->baz('x'), $m->baz(fn () => 1), $m->baz([])];`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      for (const t of ["int", "float", "string", "bool", "array", "null", "XtFoo", "Closure", "object"]) {
        m.shouldReceive("bar").with(Mockery.type(t)).andReturn(t);
      }
      m.shouldReceive("bar").with(Mockery.any()).andReturn("other");
      r.push([m.bar(1), m.bar(1.5), m.bar("s"), m.bar(true), m.bar([1]), m.bar(null), m.bar(new XtBar()), m.bar(() => 1), m.bar(new XtErr())]);
      m.shouldReceive("baz").with(Mockery.type("numeric")).andReturn("numeric");
      m.shouldReceive("baz").with(Mockery.type("scalar")).andReturn("scalar");
      m.shouldReceive("baz").with(Mockery.type("callable")).andReturn("callable");
      m.shouldReceive("baz").with(Mockery.any()).andReturn("other");
      r.push([m.baz("12"), m.baz("1e3"), m.baz("x"), m.baz(() => 1), m.baz([])]);
    },
  },
  {
    id: "XT-mockery-4",
    label: "Mockery::capture writes the argument",
    uses: ["capture", "with", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->with(\\Mockery::capture($c))->andReturn('c'); $r[] = $c; $r[] = $m->bar(42); $r[] = $c;`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      const c = { value: null as unknown };
      m.shouldReceive("bar").with(Mockery.capture(c)).andReturn("c");
      r.push(c.value, m.bar(42), c.value);
    },
  },
  {
    id: "XT-mockery-4",
    label: "Mockery::self returns the last mock; with none it throws",
    uses: ["self", "containerForms", "andReturn"],
    php: `$r[] = xt_try(fn () => \\Mockery::self()); $m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->andReturn(\\Mockery::self()); $r[] = $m->bar() === $m; $seen = null; $b = \\Mockery::mock(\\XtBar::class, function ($mock) use (&$seen) { $seen = \\Mockery::self(); }); $r[] = [$seen === $m, \\Mockery::self() === $b];`,
    run: (Mockery, r) => {
      r.push(xtTry(() => Mockery.self()));
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andReturn(Mockery.self());
      r.push(m.bar() === m);
      let seen: unknown = null;
      const b = Mockery.mock(XtBar, () => {
        seen = Mockery.self();
      });
      r.push([seen === m, Mockery.self() === b]);
    },
  },
  {
    id: "XT-mockery-4",
    label: "allows: a name, a map and a higher-order message",
    uses: ["allows", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->allows('bar')->andReturn(1); $r[] = $m->allows(['baz' => 2, 'qux' => 3]) === $m; $m->allows()->a(5)->andReturn(6); $r[] = [$m->bar(), $m->baz(), $m->qux(), $m->a(5)]; $r[] = xt_try(fn () => $m->a(4)); $r[] = \\Mockery::getContainer()->mockery_getExpectationCount();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.allows("bar").andReturn(1);
      r.push(m.allows({ baz: 2, qux: 3 }) === m);
      m.allows().a(5).andReturn(6);
      r.push([m.bar(), m.baz(), m.qux(), m.a(5)], xtTry(() => m.a(4)), Mockery.getContainer().mockery_getExpectationCount());
    },
  },
  {
    id: "XT-mockery-4",
    label: "expects: a name and a higher-order message expect one call",
    uses: ["expects", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->expects('bar')->andReturn(1); $m->expects()->baz(2)->andReturn(3); $r[] = [$m->bar(), $m->baz(2)]; $r[] = \\Mockery::getContainer()->mockery_getExpectationCount();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.expects("bar").andReturn(1);
      m.expects().baz(2).andReturn(3);
      r.push([m.bar(), m.baz(2)], Mockery.getContainer().mockery_getExpectationCount());
    },
  },
  {
    id: "XT-mockery-4",
    label: "expects() unmet",
    uses: ["expects"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->expects()->baz(2);`,
    run: (Mockery) => {
      Mockery.mock(XtFoo).expects().baz(2);
    },
  },
  {
    id: "XT-mockery-4",
    label: "shouldNotReceive met, and as a higher-order message",
    uses: ["shouldNotReceive", "shouldReceive"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldNotReceive('bar'); $m->shouldNotReceive()->qux(1); $r[] = xt_try(fn () => $m->qux(2)); $m->shouldReceive()->baz(1)->andReturn('h'); $r[] = $m->baz(1); $r[] = \\Mockery::getContainer()->mockery_getExpectationCount();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldNotReceive("bar");
      m.shouldNotReceive().qux(1);
      r.push(xtTry(() => m.qux(2)));
      m.shouldReceive().baz(1).andReturn("h");
      r.push(m.baz(1), Mockery.getContainer().mockery_getExpectationCount());
    },
  },
  {
    id: "XT-mockery-4",
    label: "shouldNotReceive unmet",
    uses: ["shouldNotReceive"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldNotReceive('bar', 'baz'); $r[] = $m->baz();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldNotReceive("bar", "baz");
      r.push(m.baz());
    },
  },
  {
    id: "XT-mockery-4",
    label: "shouldAllowMockingProtectedMethods returns the mock",
    uses: ["shouldAllowMockingProtectedMethods"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $r[] = $m->shouldAllowMockingProtectedMethods() === $m; $m->shouldReceive('bar')->andReturn(1); $r[] = $m->bar();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      r.push(m.shouldAllowMockingProtectedMethods() === m);
      m.shouldReceive("bar").andReturn(1);
      r.push(m.bar());
    },
  },
  {
    id: "XT-mockery-4",
    label: "andThrowExceptions throws each in turn",
    uses: ["andThrowExceptions"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->andThrowExceptions([new \\XtErr('a'), new \\XtErr('b')]); $r[] = xt_try(fn () => $m->bar()); $r[] = xt_try(fn () => $m->bar()); $r[] = xt_try(fn () => $m->bar()); $r[] = xt_try(fn () => $m->shouldReceive('baz')->andThrowExceptions(['x']));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andThrowExceptions([new XtErr("a"), new XtErr("b")]);
      r.push(
        xtTry(() => m.bar()),
        xtTry(() => m.bar()),
        xtTry(() => m.bar()),
        xtTry(() => m.shouldReceive("baz").andThrowExceptions(["x"])),
      );
    },
  },
  {
    id: "XT-mockery-4",
    label: "andThrow and andThrows with a class-name string",
    uses: ["andThrowClassName", "andThrows"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->andThrow('LogicException', 'lm', 3); try { $m->bar(); } catch (\\LogicException $e) { $r[] = [get_class($e), $e->getMessage(), $e->getCode()]; } $m->shouldReceive('baz')->andThrows('Mockery\\\\Exception\\\\RuntimeException', 'rm'); $r[] = xt_try(fn () => $m->baz()); $m->shouldReceive('qux')->andThrow('\\\\InvalidArgumentException'); $r[] = xt_try(fn () => $m->qux()); $r[] = xt_try(fn () => $m->shouldReceive('a')->andThrow('XtNoSuchClass'));`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").andThrow("LogicException", "lm", 3);
      try {
        m.bar();
      } catch (error) {
        r.push([classOf(error), messageOf(error), (error as { getCode(): number }).getCode()]);
      }
      m.shouldReceive("baz").andThrows("Mockery\\Exception\\RuntimeException", "rm");
      r.push(xtTry(() => m.baz()));
      m.shouldReceive("qux").andThrow("\\InvalidArgumentException");
      r.push(
        xtTry(() => m.qux()),
        xtTry(() => m.shouldReceive("a").andThrow("XtNoSuchClass")),
      );
    },
  },
  {
    id: "XT-mockery-4",
    label: "passthru runs the real method, still matched and counted",
    uses: ["passthru", "once", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtReal::class); $m->shouldReceive('qux')->once()->passthru(); $m->shouldReceive('baz')->passthru(); $m->shouldReceive('bar')->andReturn('stub'); $r[] = [$m->qux(), $m->baz()]; $r[] = \\Mockery::getContainer()->mockery_getExpectationCount();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtReal);
      m.shouldReceive("qux").once().passthru();
      m.shouldReceive("baz").passthru();
      m.shouldReceive("bar").andReturn("stub");
      r.push([m.qux(), m.baz()], Mockery.getContainer().mockery_getExpectationCount());
    },
  },
  {
    id: "XT-mockery-4",
    label: "globally()->ordered() orders across mocks",
    uses: ["globally", "ordered"],
    php: `$a = \\Mockery::mock(\\XtFoo::class); $b = \\Mockery::mock(\\XtBar::class); $a->shouldReceive('bar')->globally()->ordered(); $b->shouldReceive('baz')->globally()->ordered(); $a->shouldReceive('qux')->globally()->ordered(); $r[] = $a->bar(); $r[] = $b->baz(); $r[] = $a->qux(); $r[] = xt_try(fn () => $a->bar());`,
    run: (Mockery, r) => {
      const a = Mockery.mock(XtFoo);
      const b = Mockery.mock(XtBar);
      a.shouldReceive("bar").globally().ordered();
      b.shouldReceive("baz").globally().ordered();
      a.shouldReceive("qux").globally().ordered();
      r.push(a.bar(), b.baz(), a.qux(), xtTry(() => a.bar()));
    },
  },
  {
    id: "XT-mockery-4",
    label: "globally()->ordered() out of order throws at the call",
    uses: ["globally", "ordered"],
    php: `$a = \\Mockery::mock(\\XtFoo::class); $b = \\Mockery::mock(\\XtBar::class); $a->shouldReceive('bar')->globally()->ordered(); $b->shouldReceive('baz')->globally()->ordered(); $r[] = $b->baz(); $r[] = $a->bar();`,
    run: (Mockery, r) => {
      const a = Mockery.mock(XtFoo);
      const b = Mockery.mock(XtBar);
      a.shouldReceive("bar").globally().ordered();
      b.shouldReceive("baz").globally().ordered();
      r.push(b.baz());
      r.push(a.bar());
    },
  },
  {
    id: "XT-mockery-4",
    label: "withNoArgs and withSomeOfArgs",
    uses: ["withNoArgs", "withSomeOfArgs", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->withNoArgs()->andReturn('n'); $r[] = $m->bar(); $r[] = xt_try(fn () => $m->bar(1)); $m->shouldReceive('baz')->withSomeOfArgs(1, 'b')->andReturn('s'); $r[] = $m->baz('b', 2, 1); $r[] = xt_try(fn () => $m->baz('1', 'b')); $r[] = (string) $m->shouldReceive('qux')->withSomeOfArgs(1);`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").withNoArgs().andReturn("n");
      r.push(m.bar(), xtTry(() => m.bar(1)));
      m.shouldReceive("baz").withSomeOfArgs(1, "b").andReturn("s");
      r.push(
        m.baz("b", 2, 1),
        xtTry(() => m.baz("1", "b")),
        String(m.shouldReceive("qux").withSomeOfArgs(1)),
      );
    },
  },
  {
    id: "XT-mockery-4",
    label: "zeroOrMoreTimes allows any number of calls and counts",
    uses: ["zeroOrMoreTimes", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->zeroOrMoreTimes(); $m->shouldReceive('baz')->zeroOrMoreTimes()->andReturn(1); $r[] = [$m->baz(), $m->baz()]; $r[] = \\Mockery::getContainer()->mockery_getExpectationCount();`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").zeroOrMoreTimes();
      m.shouldReceive("baz").zeroOrMoreTimes().andReturn(1);
      r.push([m.baz(), m.baz()], Mockery.getContainer().mockery_getExpectationCount());
    },
  },
  {
    id: "XT-mockery-4",
    label: "because() adds its reason to an unmet exact count",
    uses: ["because", "once"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->once()->because('it must');`,
    run: (Mockery) => {
      Mockery.mock(XtFoo).shouldReceive("bar").once().because("it must");
    },
  },
  {
    id: "XT-mockery-4",
    label: "times() after never() is silent",
    uses: ["never", "times"],
    php: `$m = \\Mockery::mock(\\XtFoo::class); $m->shouldReceive('bar')->never()->times(2); $r[] = [$m->bar(), $m->bar()];`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo);
      m.shouldReceive("bar").never().times(2);
      r.push([m.bar(), m.bar()]);
    },
  },
  {
    id: "XT-mockery-4",
    label: "Container forms: a trailing closure, interface lists and several targets",
    uses: ["containerForms", "andReturn"],
    php: `$m = \\Mockery::mock(\\XtFoo::class, function ($m) { $m->shouldReceive('bar')->andReturn('cl'); }); $r[] = $m->bar(); $i = \\Mockery::mock('XtFoo, XtIface'); $j = \\Mockery::mock('XtFoo|XtIface'); $k = \\Mockery::mock(\\XtFoo::class, \\XtIface::class); $r[] = [$i instanceof \\XtFoo, $i->mockery_getName(), $j->mockery_getName(), $k instanceof \\XtFoo, $k->mockery_getName()];`,
    run: (Mockery, r) => {
      const m = Mockery.mock(XtFoo, (mock: MockOf) => {
        mock.shouldReceive("bar").andReturn("cl");
      });
      r.push(m.bar());
      const i = Mockery.mock("XtFoo, XtIface");
      const j = Mockery.mock("XtFoo|XtIface");
      const k = Mockery.mock(XtFoo, "XtIface");
      r.push([i instanceof XtFoo, i.mockery_getName(), j.mockery_getName(), k instanceof XtFoo, k.mockery_getName()]);
    },
  },
  {
    id: "XT-mockery-4",
    label: "Container forms: an object (a proxied partial) and constructor arguments",
    uses: ["containerForms", "andReturn"],
    php: `\\XtReal::$made = []; $o = new \\XtReal('o'); $m = \\Mockery::mock($o); $m->shouldReceive('bar')->andReturn('p'); $r[] = [$m->bar(), $m->qux(), $m instanceof \\XtReal, $m->mockery_getName()]; $c = \\Mockery::mock(\\XtReal::class, [1, 2]); $e = \\Mockery::mock(\\XtReal::class, []); $r[] = \\XtReal::$made; $r[] = xt_try(fn () => $c->qux());`,
    run: (Mockery, r) => {
      XtReal.made = [];
      const o = new XtReal("o");
      const m = Mockery.mock(o);
      m.shouldReceive("bar").andReturn("p");
      r.push([m.bar(), m.qux(), m instanceof XtReal, m.mockery_getName()]);
      const c = Mockery.mock(XtReal, [1, 2]);
      Mockery.mock(XtReal, []);
      r.push([...XtReal.made], xtTry(() => c.qux()));
    },
  },
  {
    id: "XT-mockery-4",
    label: "Container forms: an argument it cannot parse",
    uses: ["containerForms"],
    php: `$r[] = xt_try(fn () => \\Mockery::mock(5)); $r[] = xt_try(fn () => \\Mockery::mock(\\XtFoo::class, true));`,
    run: (Mockery, r) => {
      r.push(
        xtTry(() => Mockery.mock(5)),
        xtTry(() => Mockery.mock(XtFoo, true)),
      );
    },
  },
];
