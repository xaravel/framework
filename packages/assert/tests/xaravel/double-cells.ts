// The shared cell table of Story 4.7 (XT-assert-15 and XT-assert-16): each
// cell as PHP source for the Oracle and the same case in TS.
//
// The request file `conformance/oracle-requests/4.7.jsonl` was generated from
// this table (by a throwaway script outside the repository, through
// tools/oracle/request.ts's makeRequest and renderRequests), and
// doubles.test.ts rebuilds every request's `setup` and `exprs` from it, so the
// table and the signed fixtures cannot drift apart. No expected outcome is
// written here: every one comes from the Oracle.
//
// The evaluator runs no `runBare`, so a double cell drives what `runBare`
// would: `xt_case47` runs the body on a fresh TestCase (`XtCase47`, whose
// test method exists, so PHPUnit's metadata and event code can read it),
// catches what it throws, verifies the TestCase's mock objects through its
// MockObjectRegistry, hands the first throwable to
// `handleExceptionFromInvokedCountRule`, and returns
// `[result, thrown cell, verify cell, numberOfAssertionsPerformed()]`. Its TS
// twin, `runCase47`, does the same with the port's TestCase. A cell is `null`
// (nothing thrown) or `[class short name, getMessage(), null | [expectedAsString,
// actualAsString, getDiff(), toString()], getCode()]`, as Story 4.4's. No cell
// returns a double itself: the evaluator would encode its internals.
import { Assert, ExpectationFailedException, type MockObject, TestCase } from "../../src/index";
import { testCaseState } from "../../src/Framework/TestCase";
import { XtE } from "./expectation-cells";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const IFACE_BRAND = Symbol.for("XtDoubleIface");

// ---------------------------------------------------------------------------
// Twins

/** PHP's `class XtDouble`: untyped methods, a constructor that records its arguments. */
export class XtDouble {
  static readonly [CLASS_FQCN]: string = "XtDouble";
  ctorArgs: unknown = null;

  constructor(...args: unknown[]) {
    this.ctorArgs = args;
  }

  // The parameters are plain identifiers, so the port reads `$x` and `$y` from the source, as PHP reflects them.
  bar(x?: unknown, y?: unknown): unknown {
    void [x, y];
    return "real";
  }

  baz(): unknown {
    return "real baz";
  }

  chain(): unknown {
    return this;
  }
}

/**
 * XtDouble with default-valued parameters, as TS source usually declares them: its doubles behave as XtDouble's
 * (fixture-free checks in doubles.test.ts). Same FQCN, so the messages are comparable.
 */
export class XtDoubleWithDefaults {
  static readonly [CLASS_FQCN]: string = "XtDouble";

  bar(x: unknown = null, y: unknown = null): unknown {
    void [x, y];
    return "real";
  }

  baz(): unknown {
    return "real baz";
  }
}

/** PHP's `interface XtDoubleIface { function find($key); }`: a contract token (AD-1) that names its methods (ESC-4.5-1 item 3). */
export const XtDoubleIface = Object.freeze({
  [CLASS_FQCN]: "XtDoubleIface",
  [CONTRACT_METHODS]: Object.freeze(["find"]),
  [Symbol.hasInstance]: (value: unknown): boolean => typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[IFACE_BRAND] === true,
});

export interface XtDoubleIfaceShape {
  find(key?: unknown): unknown;
}

export const SETUP: readonly string[] = [
  "class XtE extends \\Exception {}",
  "class XtDouble { public $ctorArgs = null; public function __construct(...$args) { $this->ctorArgs = $args; } public function bar($x = null, $y = null) { return 'real'; } public function baz() { return 'real baz'; } public function chain() { return $this; } }",
  "interface XtDoubleIface { function find($key); }",
  "class XtCase47 extends \\PHPUnit\\Framework\\TestCase { public function testDouble(): void {} }",
  "function xt_cell47(\\Throwable $e) { $c = $e instanceof \\PHPUnit\\Framework\\ExpectationFailedException ? $e->getComparisonFailure() : null; return [(new \\ReflectionClass($e))->getShortName(), $e->getMessage(), $c === null ? null : [$c->getExpectedAsString(), $c->getActualAsString(), $c->getDiff(), $c->toString()], $e->getCode()]; }",
  "function xt_case47(\\Closure $f) { $t = new XtCase47('testDouble'); $result = null; $thrown = null; $verify = null; $last = null; try { $result = \\Closure::bind($f, $t, \\PHPUnit\\Framework\\TestCase::class)(); } catch (\\Throwable $e) { $thrown = xt_cell47($e); $last = $e; } [$registry, $emitter] = \\Closure::bind(fn () => [$this->mockObjectRegistry, $this->emitter], $t, \\PHPUnit\\Framework\\TestCase::class)(); try { $registry->verify($t, $emitter); } catch (\\Throwable $e) { $verify = xt_cell47($e); $last ??= $e; } if ($last !== null) { $registry->handleExceptionFromInvokedCountRule($t, $last); } return [$result, $thrown, $verify, $t->numberOfAssertionsPerformed()]; }",
  "function xt_direct47(\\Closure $f) { try { return [$f(), null]; } catch (\\Throwable $e) { return [null, xt_cell47($e)]; } }",
];

// ---------------------------------------------------------------------------
// The TS runners

export type Cell = null | readonly [name: string, message: string, failure: readonly [string, string, string, string] | null, code: unknown];

function shortName(error: object): string {
  const constructor = (Object.getPrototypeOf(error) as { constructor?: unknown } | null)?.constructor;
  const fqcn: unknown = typeof constructor === "function" ? (constructor as unknown as Record<symbol, unknown>)[CLASS_FQCN] : undefined;
  if (typeof fqcn === "string") {
    return fqcn.split("\\").pop()!;
  }
  return typeof constructor === "function" ? constructor.name : typeof error;
}

/** A thrown value as a cell. */
export function thrownCell(error: unknown): Cell {
  if (!(error instanceof Error)) {
    return ["(not an Error)", String(error), null, 0];
  }
  const getMessage = (error as { getMessage?: () => string }).getMessage;
  const message = typeof getMessage === "function" ? getMessage.call(error) : error.message;
  const failure = error instanceof ExpectationFailedException ? error.getComparisonFailure() : null;
  const getCode = (error as { getCode?: () => unknown }).getCode;
  const code = typeof getCode === "function" ? getCode.call(error) : 0;
  return [shortName(error), message, failure === null ? null : [failure.getExpectedAsString(), failure.getActualAsString(), failure.getDiff(), failure.toString()], code];
}

/** `xt_case47`'s TS twin: `[result, thrown, verify, numberOfAssertionsPerformed()]`. */
export function runCase47(body: (this: TestCase) => unknown): readonly [unknown, Cell, Cell, number] {
  const test = new TestCase();
  let result: unknown = null;
  let thrown: Cell = null;
  let verify: Cell = null;
  let last: { value: unknown } | null = null;
  try {
    // A PHP closure without `return` returns null.
    result = body.call(test) ?? null;
  } catch (error) {
    thrown = thrownCell(error);
    last = { value: error };
  }
  const registry = testCaseState(test)!.mockObjects;
  try {
    registry.verify(test);
  } catch (error) {
    verify = thrownCell(error);
    last ??= { value: error };
  }
  if (last !== null) {
    registry.handleExceptionFromInvokedCountRule(test, last.value);
  }
  return [result, thrown, verify, test.numberOfAssertionsPerformed()];
}

/** `xt_direct47`'s TS twin: `[result, thrown]`. */
export function runDirect47(body: () => unknown): readonly [unknown, Cell] {
  try {
    return [body() ?? null, null];
  } catch (error) {
    return [null, thrownCell(error)];
  }
}

// ---------------------------------------------------------------------------
// Cells

export interface CaseCell {
  readonly label: string;
  readonly php: string;
  readonly ts: (this: TestCase) => unknown;
}

export interface DirectCell {
  readonly label: string;
  readonly php: string;
  readonly ts: () => unknown;
}

function scenario(label: string, php: string, ts: (this: TestCase) => unknown): CaseCell {
  return { label, php: `xt_case47(function () { ${php} })`, ts };
}

function direct(label: string, php: string, ts: () => unknown): DirectCell {
  return { label, php: `xt_direct47(function () { ${php} })`, ts };
}

type Double = XtDouble & MockObject;

const mock = (test: TestCase): Double => test.createMock(XtDouble);

/** The mock of a cell's TS twin, typed for `expects()` and the doubled methods. */
const CREATE = "$m = $this->createMock(XtDouble::class);";

/** XT-assert-15: the doubles. */
export const DOUBLE_CELLS: readonly CaseCell[] = [
  // expects(once())
  scenario("met once", `${CREATE} $m->expects($this->once())->method('bar')->with(1)->willReturn(2); return $m->bar(1);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(1).willReturn(2);
    return m.bar(1);
  }),
  scenario("unmet once", `${CREATE} $m->expects($this->once())->method('bar')->with(1)->willReturn(2);`, function () {
    mock(this).expects(this.once()).method("bar").with(1).willReturn(2);
  }),
  scenario("over-count", `${CREATE} $m->expects($this->once())->method('bar')->with(1)->willReturn(2); $m->bar(1); return $m->bar(1);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(1).willReturn(2);
    m.bar(1);
    return m.bar(1);
  }),
  scenario(
    "over-count caught",
    `${CREATE} $m->expects($this->once())->method('bar'); $m->bar('a', [1]); try { $m->bar('a', [1]); } catch (\\PHPUnit\\Framework\\ExpectationFailedException $e) { return $e->getMessage(); }`,
    function () {
      const m = mock(this);
      m.expects(this.once()).method("bar");
      m.bar("a", [1]);
      try {
        m.bar("a", [1]);
      } catch (error) {
        if (error instanceof ExpectationFailedException) {
          return error.getMessage();
        }
        throw error;
      }
      return null;
    },
  ),
  scenario("over-count of exactly(2)", `${CREATE} $m->expects($this->exactly(2))->method('bar'); $m->bar(1); $m->bar(2); return $m->bar(3, 4, 5);`, function () {
    const m = mock(this);
    m.expects(this.exactly(2)).method("bar");
    m.bar(1);
    m.bar(2);
    return (m.bar as (...args: unknown[]) => unknown)(3, 4, 5);
  }),
  // never()
  scenario("never, called", `${CREATE} $m->expects($this->never())->method('bar'); return $m->bar();`, function () {
    const m = mock(this);
    m.expects(this.never()).method("bar");
    return m.bar();
  }),
  scenario("never, not called", `${CREATE} $m->expects($this->never())->method('bar');`, function () {
    mock(this).expects(this.never()).method("bar");
  }),
  // exactly(2), atLeastOnce(), any() with 0, 1, 2 and 3 calls
  ...[0, 1, 2, 3].flatMap((calls) => [
    scenario(`exactly(2), ${calls} calls`, `${CREATE} $m->expects($this->exactly(2))->method('bar')->willReturn(7); $r = []; for ($i = 0; $i < ${calls}; $i++) { $r[] = $m->bar($i); } return $r;`, function () {
      const m = mock(this);
      m.expects(this.exactly(2)).method("bar").willReturn(7);
      const r: unknown[] = [];
      for (let i = 0; i < calls; i++) {
        r.push(m.bar(i));
      }
      return r;
    }),
    scenario(`atLeastOnce, ${calls} calls`, `${CREATE} $m->expects($this->atLeastOnce())->method('bar')->willReturn(7); $r = []; for ($i = 0; $i < ${calls}; $i++) { $r[] = $m->bar($i); } return $r;`, function () {
      const m = mock(this);
      m.expects(this.atLeastOnce()).method("bar").willReturn(7);
      const r: unknown[] = [];
      for (let i = 0; i < calls; i++) {
        r.push(m.bar(i));
      }
      return r;
    }),
    scenario(`any, ${calls} calls`, `${CREATE} $m->expects($this->any())->method('bar')->willReturn(7); $r = []; for ($i = 0; $i < ${calls}; $i++) { $r[] = $m->bar($i); } return $r;`, function () {
      const m = mock(this);
      m.expects(this.any()).method("bar").willReturn(7);
      const r: unknown[] = [];
      for (let i = 0; i < calls; i++) {
        r.push(m.bar(i));
      }
      return r;
    }),
  ]),
  // with()
  scenario("parameter mismatch", `${CREATE} $m->expects($this->once())->method('bar')->with(1)->willReturn(2); return $m->bar(2);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(1).willReturn(2);
    return m.bar(2);
  }),
  scenario(
    "parameter mismatch caught",
    `${CREATE} $m->expects($this->once())->method('bar')->with('x', ['k' => 1]); try { $m->bar('y', ['k' => 2]); } catch (\\PHPUnit\\Framework\\ExpectationFailedException $e) { return 'caught'; }`,
    function () {
      const m = mock(this);
      m.expects(this.once()).method("bar").with("x", { k: 1 });
      try {
        m.bar("y", { k: 2 });
      } catch (error) {
        if (error instanceof ExpectationFailedException) {
          return "caught";
        }
        throw error;
      }
      return null;
    },
  ),
  scenario("omitted declared argument", `${CREATE} $m->expects($this->once())->method('bar')->with(1, 2); return $m->bar(1);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(1, 2);
    return m.bar(1);
  }),
  scenario("parameter count too low", `${CREATE} $m->expects($this->once())->method('baz')->with(1); return $m->baz();`, function () {
    const m = mock(this);
    m.expects(this.once()).method("baz").with(1);
    return m.baz();
  }),
  scenario("extra argument mismatch", `${CREATE} $m->expects($this->once())->method('bar')->with(1, 2, 4); return $m->bar(1, 2, 3);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(1, 2, 4);
    return (m.bar as (...args: unknown[]) => unknown)(1, 2, 3);
  }),
  scenario("extra arguments match", `${CREATE} $m->expects($this->once())->method('bar')->with(1, 2, 3)->willReturn('ok'); return $m->bar(1, 2, 3);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(1, 2, 3).willReturn("ok");
    return (m.bar as (...args: unknown[]) => unknown)(1, 2, 3);
  }),
  scenario("with loose equality", `${CREATE} $m->expects($this->once())->method('bar')->with('1', 2.0)->willReturn('ok'); return $m->bar(1, 2);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with("1", 2.0).willReturn("ok");
    return m.bar(1, 2);
  }),
  scenario("isInstanceOf matches", `${CREATE} $m->expects($this->once())->method('bar')->with($this->isInstanceOf(XtDouble::class))->willReturn('ok'); return $m->bar(new XtDouble());`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(this.isInstanceOf(XtDouble)).willReturn("ok");
    return m.bar(new XtDouble());
  }),
  scenario("isInstanceOf mismatch", `${CREATE} $m->expects($this->once())->method('bar')->with($this->isInstanceOf(XtDouble::class)); return $m->bar('x');`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(this.isInstanceOf(XtDouble));
    return m.bar("x");
  }),
  scenario("with on method() without expects", `${CREATE} $m->method('bar')->with(1)->willReturn('ok'); return [$m->bar(1), $m->bar(2)];`, function () {
    const m = mock(this);
    m.method("bar").with(1).willReturn("ok");
    return [m.bar(1), m.bar(2)];
  }),
  // will*()
  scenario("willReturn of two values", `${CREATE} $m->method('bar')->willReturn(1, 2); $r = [$m->bar(), $m->bar()]; $r[] = $m->bar(); return $r;`, function () {
    const m = mock(this);
    m.method("bar").willReturn(1, 2);
    const r = [m.bar(), m.bar()];
    r.push(m.bar());
    return r;
  }),
  scenario("willReturn of a stub", `${CREATE} $m->method('bar')->willReturn($this->throwException(new XtE('from willReturn'))); return $m->bar();`, function () {
    const m = mock(this);
    m.method("bar").willReturn(this.throwException(new XtE("from willReturn")));
    return m.bar();
  }),
  scenario(
    "willReturnOnConsecutiveCalls",
    `${CREATE} $m->method('bar')->willReturnOnConsecutiveCalls(1, $this->throwException(new XtE('second'))); $r = [$m->bar()]; try { $m->bar(); } catch (XtE $e) { $r[] = $e->getMessage(); } $r[] = $m->bar(); return $r;`,
    function () {
      const m = mock(this);
      m.method("bar").willReturnOnConsecutiveCalls(1, this.throwException(new XtE("second")));
      const r = [m.bar()];
      try {
        m.bar();
      } catch (error) {
        if (!(error instanceof XtE)) {
          throw error;
        }
        r.push(error.getMessage());
      }
      r.push(m.bar());
      return r;
    },
  ),
  scenario("willReturnCallback", `${CREATE} $m->method('bar')->willReturnCallback(fn ($a, $b) => $a + $b); return [$m->bar(1, 2), $m->bar(5)];`, function () {
    const m = mock(this);
    m.method("bar").willReturnCallback((a: number, b: number) => a + b);
    return [m.bar(1, 2), m.bar(5)];
  }),
  scenario("willReturnCallback, variadic", `${CREATE} $m->method('bar')->willReturnCallback(fn (...$a) => $a); return [$m->bar(1), $m->bar(1, 2, 3)];`, function () {
    const m = mock(this);
    m.method("bar").willReturnCallback((...a: unknown[]) => a);
    return [m.bar(1), (m.bar as (...args: unknown[]) => unknown)(1, 2, 3)];
  }),
  scenario("willReturnCallback without a return", `${CREATE} $m->method('bar')->willReturnCallback(function () {}); return $m->bar();`, function () {
    const m = mock(this);
    m.method("bar").willReturnCallback(() => {});
    return m.bar();
  }),
  scenario("willReturnSelf", `${CREATE} $m->method('chain')->willReturnSelf(); return $m->chain() === $m;`, function () {
    const m = mock(this);
    m.method("chain").willReturnSelf();
    return m.chain() === m;
  }),
  scenario("willReturnMap", `${CREATE} $m->method('bar')->willReturnMap([[1, 'a'], [2, 'b'], [1, 2, 'c'], [3, 4, 5, 'd']]); return [$m->bar(1), $m->bar(2), $m->bar(3), $m->bar(1, 2), $m->bar(3, 4), $m->bar('1'), $m->bar(1, 2, 3)];`, function () {
    const m = mock(this);
    m.method("bar").willReturnMap([
      [1, "a"],
      [2, "b"],
      [1, 2, "c"],
      [3, 4, 5, "d"],
    ]);
    return [m.bar(1), m.bar(2), m.bar(3), m.bar(1, 2), m.bar(3, 4), m.bar("1"), (m.bar as (...args: unknown[]) => unknown)(1, 2, 3)];
  }),
  scenario("willReturnMap with a constraint", `${CREATE} $m->method('bar')->willReturnMap([[$this->isInstanceOf(XtDouble::class), null, 'object']]); return [$m->bar(new XtDouble()), $m->bar('x')];`, function () {
    const m = mock(this);
    m.method("bar").willReturnMap([[this.isInstanceOf(XtDouble), null, "object"]]);
    return [m.bar(new XtDouble()), m.bar("x")];
  }),
  scenario("willThrowException", `${CREATE} $m->method('bar')->willThrowException(new XtE('x', 3)); return $m->bar();`, function () {
    const m = mock(this);
    m.method("bar").willThrowException(new XtE("x", 3));
    return m.bar();
  }),
  scenario("no stub", `${CREATE} $m->expects($this->once())->method('bar'); return $m->bar();`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar");
    return m.bar();
  }),
  // Several matchers
  scenario("first return value wins", `${CREATE} $m->expects($this->once())->method('bar')->willReturn(1); $m->expects($this->once())->method('bar')->willReturn(2); return $m->bar();`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").willReturn(1);
    m.expects(this.once()).method("bar").willReturn(2);
    return m.bar();
  }),
  scenario(
    "an exception after a return value",
    `${CREATE} $m->expects($this->any())->method('bar')->willReturn(1); $m->expects($this->never())->method('bar'); try { $m->bar(); } catch (\\PHPUnit\\Framework\\ExpectationFailedException $e) { return 'caught'; }`,
    function () {
      const m = mock(this);
      m.expects(this.any()).method("bar").willReturn(1);
      m.expects(this.never()).method("bar");
      try {
        m.bar();
      } catch (error) {
        if (error instanceof ExpectationFailedException) {
          return "caught";
        }
        throw error;
      }
      return null;
    },
  ),
  scenario("matchers on two methods", `${CREATE} $m->expects($this->once())->method('bar')->willReturn(1); $m->expects($this->once())->method('baz')->willReturn(2); return $m->baz();`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").willReturn(1);
    m.expects(this.once()).method("baz").willReturn(2);
    return m.baz();
  }),
  scenario("two mocks", `$a = $this->createMock(XtDouble::class); $b = $this->createMock(XtDouble::class); $a->expects($this->once())->method('bar'); $b->expects($this->once())->method('baz'); $a->bar();`, function () {
    const a = mock(this);
    const b = mock(this);
    a.expects(this.once()).method("bar");
    b.expects(this.once()).method("baz");
    a.bar();
  }),
  // Configuration errors
  scenario("unconfigured call", `${CREATE} return [$m->baz(), $m->bar(1)];`, function () {
    const m = mock(this);
    return [m.baz(), m.bar(1)];
  }),
  scenario("unknown method", `${CREATE} $m->method('nope');`, function () {
    mock(this).method("nope");
  }),
  scenario("method name in another case", `${CREATE} $m->expects($this->once())->method('BAR');`, function () {
    mock(this).expects(this.once()).method("BAR");
  }),
  scenario("method twice", `${CREATE} $m->method('bar')->method('baz');`, function () {
    mock(this).method("bar").method("baz");
  }),
  scenario("with twice", `${CREATE} $m->expects($this->once())->method('bar')->with(1)->with(2);`, function () {
    mock(this).expects(this.once()).method("bar").with(1).with(2);
  }),
  scenario("with before method", `${CREATE} $m->expects($this->once())->with(1);`, function () {
    mock(this).expects(this.once()).with(1);
  }),
  scenario("willReturn before method", `${CREATE} $m->expects($this->once())->willReturn(1);`, function () {
    mock(this).expects(this.once()).willReturn(1);
  }),
  scenario("with on two matchers", `${CREATE} $m->expects($this->once())->method('bar')->with(1); $m->expects($this->once())->method('bar')->with(2);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(1);
    m.expects(this.once()).method("bar").with(2);
  }),
  // Instances
  scenario("instanceof", `$s = $this->createStub(XtDouble::class); return [$this->createMock(XtDouble::class) instanceof XtDouble, $s instanceof XtDouble, $this->createMock(XtDouble::class)->ctorArgs];`, function () {
    const s = this.createStub(XtDouble);
    // A double made without the constructor runs no field initializer, so `ctorArgs` is undefined where PHP has its declared default null (ESC-4.7-1 item 2).
    return [this.createMock(XtDouble) instanceof XtDouble, s instanceof XtDouble, this.createMock(XtDouble).ctorArgs ?? null];
  }),
  // Stubs
  scenario("stub", `$s = $this->createStub(XtDouble::class); $s->method('bar')->willReturn(3); return [$s->bar(), $s->baz(), method_exists($s, 'expects'), method_exists($s->method('baz'), 'with')];`, function () {
    const s = this.createStub(XtDouble);
    s.method("bar").willReturn(3);
    return [s.bar(), s.baz(), typeof (s as unknown as Record<string, unknown>)["expects"] === "function", typeof (s.method("baz") as unknown as Record<string, unknown>)["with"] === "function"];
  }),
  scenario("static stub", `$s = static::createStub(XtDouble::class); $s->method('bar')->willReturn(4); return $s->bar();`, function () {
    const s = TestCase.createStub(XtDouble);
    s.method("bar").willReturn(4);
    return s.bar();
  }),
  // Builders
  scenario("builder", `$m = $this->getMockBuilder(XtDouble::class)->onlyMethods(['bar'])->setConstructorArgs([1])->getMock(); $m->expects($this->once())->method('bar')->willReturn(5); return [$m->ctorArgs, $m->baz(), $m->bar()];`, function () {
    const m = this.getMockBuilder(XtDouble).onlyMethods(["bar"]).setConstructorArgs([1]).getMock();
    m.expects(this.once()).method("bar").willReturn(5);
    return [m.ctorArgs, m.baz(), m.bar()];
  }),
  scenario("builder, registered", `$m = $this->getMockBuilder(XtDouble::class)->onlyMethods(['bar'])->getMock(); $m->expects($this->once())->method('bar');`, function () {
    const m = this.getMockBuilder(XtDouble).onlyMethods(["bar"]).getMock();
    m.expects(this.once()).method("bar");
  }),
  scenario("builder, method not doubled", `$m = $this->getMockBuilder(XtDouble::class)->onlyMethods(['bar'])->getMock(); $m->method('baz');`, function () {
    this.getMockBuilder(XtDouble).onlyMethods(["bar"]).getMock().method("baz");
  }),
  scenario("builder, onlyMethods of an unknown method", `$this->getMockBuilder(XtDouble::class)->onlyMethods(['nope']);`, function () {
    this.getMockBuilder(XtDouble).onlyMethods(["nope"]);
  }),
  scenario("builder, every method", `$m = $this->getMockBuilder(XtDouble::class)->getMock(); return [$m->ctorArgs, $m->bar(), $m->baz()];`, function () {
    const m = this.getMockBuilder(XtDouble).getMock();
    // A double made without the constructor runs no field initializer, so `ctorArgs` is undefined where PHP has its declared default null (ESC-4.7-1 item 2).
    return [m.ctorArgs ?? null, m.bar(), m.baz()];
  }),
  scenario("builder, no method", `$m = $this->getMockBuilder(XtDouble::class)->onlyMethods([])->getMock(); return [$m->bar(), $m->baz()];`, function () {
    const m = this.getMockBuilder(XtDouble).onlyMethods([]).getMock();
    return [m.bar(), m.baz()];
  }),
  scenario("builder, no constructor", `$m = $this->getMockBuilder(XtDouble::class)->setConstructorArgs([1])->disableOriginalConstructor()->getMock(); return $m->ctorArgs;`, function () {
    const m = this.getMockBuilder(XtDouble).setConstructorArgs([1]).disableOriginalConstructor().getMock();
    // A double made without the constructor runs no field initializer, so `ctorArgs` is undefined where PHP has its declared default null (ESC-4.7-1 item 2).
    return m.ctorArgs ?? null;
  }),
  scenario("builder, constructor enabled again", `$m = $this->getMockBuilder(XtDouble::class)->setConstructorArgs([1, 2])->disableOriginalConstructor()->enableOriginalConstructor()->getMock(); return $m->ctorArgs;`, function () {
    const m = this.getMockBuilder(XtDouble).setConstructorArgs([1, 2]).disableOriginalConstructor().enableOriginalConstructor().getMock();
    // A double made without the constructor runs no field initializer, so `ctorArgs` is undefined where PHP has its declared default null (ESC-4.7-1 item 2).
    return m.ctorArgs ?? null;
  }),
  scenario("createPartialMock", `$m = $this->createPartialMock(XtDouble::class, ['bar']); $m->expects($this->once())->method('bar')->willReturn(6); return [$m->ctorArgs, $m->baz(), $m->bar()];`, function () {
    const m = this.createPartialMock(XtDouble, ["bar"]);
    m.expects(this.once()).method("bar").willReturn(6);
    // A double made without the constructor runs no field initializer, so `ctorArgs` is undefined where PHP has its declared default null (ESC-4.7-1 item 2).
    return [m.ctorArgs ?? null, m.baz(), m.bar()];
  }),
  // An interface
  scenario("interface", `$m = $this->createMock(XtDoubleIface::class); $u = $m->find(1); $m->expects($this->once())->method('find')->willReturn('found'); return [$u, $m->find('k'), $m instanceof XtDoubleIface];`, function () {
    const m = this.createMock(XtDoubleIface) as XtDoubleIfaceShape & MockObject;
    const u = m.find(1);
    m.expects(this.once()).method("find").willReturn("found");
    return [u, m.find("k"), m instanceof XtDoubleIface];
  }),
  scenario("interface, unmet", `$m = $this->createMock(XtDoubleIface::class); $m->expects($this->once())->method('find');`, function () {
    (this.createMock(XtDoubleIface) as XtDoubleIfaceShape & MockObject).expects(this.once()).method("find");
  }),
];

/** XT-assert-16: the matchers' strings and verify messages, and addToAssertionCount. */
export const MATCHER_CELLS: readonly CaseCell[] = [
  scenario("toString", "return [$this->once()->toString(), $this->never()->toString(), $this->exactly(2)->toString(), $this->exactly(1)->toString(), $this->atLeastOnce()->toString(), $this->any()->toString()];", function () {
    return [this.once().toString(), this.never().toString(), this.exactly(2).toString(), this.exactly(1).toString(), this.atLeastOnce().toString(), this.any().toString()];
  }),
  scenario("exactly(2) verify", "$this->exactly(2)->verify();", function () {
    this.exactly(2).verify();
  }),
  scenario("once verify", "$this->once()->verify();", function () {
    this.once().verify();
  }),
  scenario("never verify", "$this->never()->verify(); return $this->never()->isNever();", function () {
    this.never().verify();
    return this.never().isNever();
  }),
  scenario("atLeastOnce verify", "$this->atLeastOnce()->verify();", function () {
    this.atLeastOnce().verify();
  }),
  scenario("any verify", "$this->any()->verify(); return [$this->any()->numberOfInvocations(), $this->any()->hasBeenInvoked()];", function () {
    this.any().verify();
    return [this.any().numberOfInvocations(), this.any().hasBeenInvoked()];
  }),
  scenario("addToAssertionCount", "$this->addToAssertionCount(3); $this->addToAssertionCount(0); return $this->numberOfAssertionsPerformed();", function () {
    this.addToAssertionCount(3);
    this.addToAssertionCount(0);
    return this.numberOfAssertionsPerformed();
  }),
  scenario("addToAssertionCount with a mock", `${CREATE} $m->expects($this->once())->method('bar')->with(1); $m->bar(1); $this->addToAssertionCount(2); return $this->numberOfAssertionsPerformed();`, function () {
    const m = mock(this);
    m.expects(this.once()).method("bar").with(1);
    m.bar(1);
    this.addToAssertionCount(2);
    return this.numberOfAssertionsPerformed();
  }),
  scenario("stringContains on the instance", "return [$this->stringContains('A')->toString(), $this->stringContains('A', false)->toString()];", function () {
    return [this.stringContains("A").toString(), this.stringContains("A", false).toString()];
  }),
];

const A = "\\PHPUnit\\Framework\\Assert";

/** XT-assert-16: `stringContains` and `assertArraySubset`'s count. */
export const STRING_CELLS: readonly DirectCell[] = [
  direct("stringContains toString", `return [${A}::stringContains('A')->toString(), ${A}::stringContains('A', false)->toString(), ${A}::stringContains('É')->toString(), ${A}::stringContains('É', false)->toString(), ${A}::stringContains('')->toString()];`, () => [
    Assert.stringContains("A").toString(),
    Assert.stringContains("A", false).toString(),
    Assert.stringContains("É").toString(),
    Assert.stringContains("É", false).toString(),
    Assert.stringContains("").toString(),
  ]),
  direct("stringContains matches ignoring case", `${A}::assertThat('xay', ${A}::stringContains('A'));`, () => {
    Assert.assertThat("xay", Assert.stringContains("A"));
  }),
  direct("stringContains fails ignoring case", `${A}::assertThat('xby', ${A}::stringContains('A'));`, () => {
    Assert.assertThat("xby", Assert.stringContains("A"));
  }),
  direct("stringContains fails with case", `${A}::assertThat('xay', ${A}::stringContains('A', false));`, () => {
    Assert.assertThat("xay", Assert.stringContains("A", false));
  }),
  direct("stringContains matches with case", `${A}::assertThat('xAy', ${A}::stringContains('A', false));`, () => {
    Assert.assertThat("xAy", Assert.stringContains("A", false));
  }),
  direct("stringContains multibyte", `${A}::assertThat('xÉy', ${A}::stringContains('é'));`, () => {
    Assert.assertThat("xÉy", Assert.stringContains("é"));
  }),
  direct("stringContains multibyte fails", `${A}::assertThat('xy', ${A}::stringContains('É'), 'ctx');`, () => {
    Assert.assertThat("xy", Assert.stringContains("É"), "ctx");
  }),
  direct("stringContains non-string", `${A}::assertThat(1, ${A}::stringContains('A'));`, () => {
    Assert.assertThat(1, Assert.stringContains("A"));
  }),
  direct("stringContains empty needle", `${A}::assertThat(1, ${A}::stringContains(''));`, () => {
    Assert.assertThat(1, Assert.stringContains(""));
  }),
  direct("assertStringContainsString unchanged", `${A}::assertStringContainsString('A', 'xay');`, () => {
    Assert.assertStringContainsString("A", "xay");
  }),
];

/** XT-assert-16: `Assert::getCount()`'s delta over one passing `assertArraySubset`, in PHP; the port's counted total. */
export const SUBSET_CELLS: readonly { readonly label: string; readonly php: string; readonly ts: () => void }[] = [
  {
    label: "assertArraySubset",
    php: `xt_direct47(function () { $before = ${A}::getCount(); \\Illuminate\\Testing\\Assert::assertArraySubset(['a' => 1], ['a' => 1, 'b' => 2]); return ${A}::getCount() - $before; })`,
    ts: () => Assert.assertArraySubset({ a: 1 }, { a: 1, b: 2 }),
  },
  {
    label: "assertArraySubset strict",
    php: `xt_direct47(function () { $before = ${A}::getCount(); \\Illuminate\\Testing\\Assert::assertArraySubset([1], [1, 2], true); return ${A}::getCount() - $before; })`,
    ts: () => Assert.assertArraySubset([1], [1, 2], true),
  },
];

// ---------------------------------------------------------------------------
// Requests

export interface RequestSpec {
  readonly id: "XT-assert-15" | "XT-assert-16";
  readonly name: string;
  readonly setup: readonly string[];
  readonly exprs: readonly string[];
}

export const REQUESTS: readonly RequestSpec[] = [
  { id: "XT-assert-15", name: "doubles", setup: SETUP, exprs: DOUBLE_CELLS.map((cell) => cell.php) },
  { id: "XT-assert-16", name: "matchers", setup: SETUP, exprs: MATCHER_CELLS.map((cell) => cell.php) },
  { id: "XT-assert-16", name: "strings", setup: SETUP, exprs: [...STRING_CELLS.map((cell) => cell.php), ...SUBSET_CELLS.map((cell) => cell.php)] },
];
