// The shared scenario table of Story 4.5 (XT-mockery-1..3): each Mockery
// scenario as PHP source and as its TS twin, and the PHP/TS twin classes.
//
// The request file `conformance/oracle-requests/4.5.jsonl` was generated from
// this table (by a throwaway script outside the repository, through
// tools/oracle/request.ts's makeRequest and renderRequests: one request per
// Xaravel Test ID, `setup` = SETUP, `exprs` = each scenario's `wrapPhp`), and
// mockery.test.ts rebuilds every request's `setup` and `exprs` from it, so the
// table and the signed fixtures cannot drift apart. No expected outcome is
// written here: every one comes from the Oracle (real Mockery 1.6.15).
//
// A scenario appends what it observes to `$r` / `r`. The wrapper closes the
// container and gives `['ok', $r]`, or `['throws', <short class>, <message>]`
// for the first throw (then closes again, ignoring a second throw). `xt_try` /
// `xtTry` records a throw without ending the scenario.
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

export const SETUP: readonly string[] = [
  "class XtFoo { public function bar($x = null) {} public function baz() {} public function qux() {} }",
  "class XtBar extends XtFoo {}",
  "class XtErr extends \\Exception {}",
  "class XtProp { public $a = 1; public $s = 'x'; public $f = 1.5; public $n = null; public $l = [1, [2]]; public $o = null; }",
  "function xt_try(callable $f) { try { return ['ok', $f()]; } catch (\\Throwable $e) { return ['throws', (new \\ReflectionClass($e))->getShortName(), $e->getMessage()]; } }",
];

/** The message of a thrown value (a PHP-style exception's `getMessage()`, else `message`). */
function messageOf(error: unknown): unknown {
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

export interface Scenario {
  readonly id: "XT-mockery-1" | "XT-mockery-2" | "XT-mockery-3";
  readonly label: string;
  /** The AC 1 API names the scenario exercises. */
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
];
