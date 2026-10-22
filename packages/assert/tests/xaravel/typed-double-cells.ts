// The cell table of XT-assert-20 (Story 9.11, ESC-4.7-1 item 2): PHPUnit's test doubles of a target whose declared
// signature comes from a surface row. Each cell is PHP source for the Oracle and the same case in TS.
//
// The request `XT-assert-20` in `conformance/oracle-requests/9.11.jsonl` was generated from this table (by a
// throwaway script outside the repository, through tools/oracle/request.ts's makeRequest and renderRequest), and
// typed-doubles.test.ts rebuilds its `setup` and `exprs` from it, so the table and the signed fixture cannot drift
// apart. No expected outcome is written here: every one comes from the Oracle.
//
// The PHP twin `XtTyped` (and its parent `XtTypedBase`) declares the return types and defaults; the TS twin
// declares none, and its parameter names differ from PHP's, so only a row can supply them. The rows a TS run serves
// through the fake `Symbol.for('xaravel.api.signature')` lookup are `TYPED_ROWS`; the request's first two exprs are
// the same rows as `xt_rows20` reflects them in PHP, in `tools/oracle/api-surface.php`'s form, and the test checks
// the two are equal. A cell runs as XT-assert-15's do: `xt_case20` is `xt_case47` under this request's own names, and
// its TS twin is double-cells.ts's `runCase47`.
import { gettype, isPhpObject, classNameOf } from "../../src/comparison/PhpValues";
import type { MockObject, TestCase } from "../../src/index";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

// ---------------------------------------------------------------------------
// Twins

/** PHP's `class XtTypedBase { public function inherited(): string }`. */
export class XtTypedBase {
  static readonly [CLASS_FQCN]: string = "XtTypedBase";

  inherited(): unknown {
    return "base";
  }
}

/** PHP's `class XtTyped extends XtTypedBase`: the TS methods declare no types, and name their parameters `p0`… */
export class XtTyped extends XtTypedBase {
  static override readonly [CLASS_FQCN]: string = "XtTyped";

  i(): unknown {
    return 1;
  }
  s(): unknown {
    return "s";
  }
  b(): unknown {
    return true;
  }
  ns(): unknown {
    return "n";
  }
  a(): unknown {
    return [1];
  }
  v(): unknown {
    return null;
  }
  mx(): unknown {
    return 1;
  }
  st(): unknown {
    return this;
  }
  sf(): unknown {
    return this;
  }
  o(): unknown {
    return this;
  }
  c(): unknown {
    return "strlen";
  }
  it(): unknown {
    return [1];
  }
  t(): unknown {
    return true;
  }
  u(): unknown {
    return 1;
  }
  uc(): unknown {
    return this;
  }
  nv(): unknown {
    throw new Error("nv");
  }
  cl(): unknown {
    return this;
  }
  args(p0?: unknown, p1?: unknown, p2?: unknown, p3?: unknown, p4?: unknown): unknown {
    void [p0, p1, p2, p3, p4];
    return "real";
  }
}

export const SETUP: readonly string[] = [
  "class XtTypedBase { public function inherited(): string { return 'base'; } }",
  "class XtTyped extends XtTypedBase { public function i(): int { return 1; } public function s(): string { return 's'; } public function b(): bool { return true; } public function ns(): ?string { return 'n'; } public function a(): array { return [1]; } public function v(): void {} public function mx(): mixed { return 1; } public function st(): static { return $this; } public function sf(): self { return $this; } public function o(): object { return $this; } public function c(): callable { return 'strlen'; } public function it(): iterable { return [1]; } public function t(): true { return true; } public function u(): int|string { return 1; } public function uc(): XtTypedBase|\\ArrayObject { return $this; } public function nv(): never { throw new \\LogicException('nv'); } public function cl(): XtTypedBase { return $this; } public function args($a, $b = 2, $c = 'x', $d = [], $e = null) { return 'real'; } }",
  "class XtCase20 extends \\PHPUnit\\Framework\\TestCase { public function testDouble(): void {} }",
  "function xt_cell20(\\Throwable $e) { $c = $e instanceof \\PHPUnit\\Framework\\ExpectationFailedException ? $e->getComparisonFailure() : null; return [(new \\ReflectionClass($e))->getShortName(), $e->getMessage(), $c === null ? null : [$c->getExpectedAsString(), $c->getActualAsString(), $c->getDiff(), $c->toString()], $e->getCode()]; }",
  "function xt_case20(\\Closure $f) { $t = new XtCase20('testDouble'); $result = null; $thrown = null; $verify = null; $last = null; try { $result = \\Closure::bind($f, $t, \\PHPUnit\\Framework\\TestCase::class)(); } catch (\\Throwable $e) { $thrown = xt_cell20($e); $last = $e; } [$registry, $emitter] = \\Closure::bind(fn () => [$this->mockObjectRegistry, $this->emitter], $t, \\PHPUnit\\Framework\\TestCase::class)(); try { $registry->verify($t, $emitter); } catch (\\Throwable $e) { $verify = xt_cell20($e); $last ??= $e; } if ($last !== null) { $registry->handleExceptionFromInvokedCountRule($t, $last); } return [$result, $thrown, $verify, $t->numberOfAssertionsPerformed()]; }",
  "function xt_lit20($v) { if ($v === null) { return 'null'; } if (is_bool($v)) { return $v ? 'true' : 'false'; } if (is_int($v)) { return (string) $v; } if (is_float($v) || is_string($v)) { return var_export($v, true); } $l = array_is_list($v); $i = []; foreach ($v as $k => $x) { $i[] = ($l ? '' : xt_lit20($k) . ' => ') . xt_lit20($x); } return '[' . implode(', ', $i) . ']'; }",
  "function xt_rows20(string $c) { $out = []; foreach ((new \\ReflectionClass($c))->getMethods(\\ReflectionMethod::IS_PUBLIC) as $m) { if ($m->getDeclaringClass()->getName() !== $c) { continue; } $ps = []; foreach ($m->getParameters() as $p) { $t = $p->getType(); $ps[] = ['name' => $p->getName(), 'type' => $t === null ? null : (string) $t, 'nullable' => $t === null ? true : $t->allowsNull(), 'default' => $p->isDefaultValueAvailable() ? xt_lit20($p->getDefaultValue()) : null, 'optional' => $p->isOptional(), 'variadic' => $p->isVariadic(), 'byRef' => $p->isPassedByReference()]; } $r = $m->getReturnType(); $out[] = [$m->getName(), $ps, $r === null ? null : (string) $r, $r === null ? true : $r->allowsNull()]; } return $out; }",
];

// ---------------------------------------------------------------------------
// The rows (api-surface.php's form: `[member, parameters, returns, nullable]` per declared public method)

export interface RowParameter {
  readonly name: string;
  readonly type: string | null;
  readonly nullable: boolean;
  readonly default: string | null;
  readonly optional: boolean;
  readonly variadic: boolean;
  readonly byRef: boolean;
}

export type Row = readonly [member: string, parameters: readonly RowParameter[], returns: string | null, nullable: boolean];

function untyped(name: string, defaultText: string | null): RowParameter {
  return { name, type: null, nullable: true, default: defaultText, optional: defaultText !== null, variadic: false, byRef: false };
}

function typed(member: string, returns: string, nullable = false): Row {
  return [member, [], returns, nullable];
}

/** The declared rows of the twins, by class, in PHP's declaration order. */
export const TYPED_ROWS: Readonly<Record<string, readonly Row[]>> = {
  XtTypedBase: [typed("inherited", "string")],
  XtTyped: [
    typed("i", "int"),
    typed("s", "string"),
    typed("b", "bool"),
    typed("ns", "?string", true),
    typed("a", "array"),
    typed("v", "void"),
    typed("mx", "mixed", true),
    typed("st", "static"),
    typed("sf", "XtTyped"),
    typed("o", "object"),
    typed("c", "callable"),
    typed("it", "iterable"),
    typed("t", "true"),
    typed("u", "string|int"),
    typed("uc", "XtTypedBase|ArrayObject"),
    typed("nv", "never"),
    typed("cl", "XtTypedBase"),
    ["args", [untyped("a", null), untyped("b", "2"), untyped("c", "'x'"), untyped("d", "[]"), untyped("e", "null")], null, true],
  ],
};

/** `TYPED_ROWS` as the `Symbol.for('xaravel.api.signature')` lookup serves it: `(fqcn, member) => row | null`. */
export function typedLookup(fqcn: unknown, member: unknown): object | null {
  const rows = typeof fqcn === "string" ? TYPED_ROWS[fqcn] : undefined;
  const row = rows?.find(([name]) => name === member);
  if (row === undefined) {
    return null;
  }
  const [name, parameters, returns, nullable] = row;
  return Object.freeze({ fqcn, kind: "method", member: name, static: false, parameters, returns, nullable });
}

// ---------------------------------------------------------------------------
// Cells

export interface CaseCell {
  readonly label: string;
  readonly php: string;
  readonly ts: (this: TestCase) => unknown;
}

function scenario(label: string, php: string, ts: (this: TestCase) => unknown): CaseCell {
  return { label, php: `xt_case20(function () { ${php} })`, ts };
}

type Typed = XtTyped & MockObject;
type Call = (...args: unknown[]) => unknown;

const mock = (test: TestCase): Typed => test.createMock(XtTyped);
const CREATE = "$m = $this->createMock(XtTyped::class);";

/** The values of the unconfigured scalar-typed calls, in one order. */
function scalars(m: Typed): unknown[] {
  return [m.i(), m.s(), m.b(), m.ns(), m.a(), m.v(), m.mx(), m.t(), m.u()];
}
const SCALARS = "[$m->i(), $m->s(), $m->b(), $m->ns(), $m->a(), $m->v(), $m->mx(), $m->t(), $m->u()]";

export const TYPED_CELLS: readonly CaseCell[] = [
  scenario("unconfigured scalar returns", `${CREATE} return ${SCALARS};`, function () {
    return scalars(mock(this));
  }),
  scenario("their gettype", `${CREATE} return array_map(fn ($r) => gettype($r), ${SCALARS});`, function () {
    return scalars(mock(this)).map((value) => gettype(value));
  }),
  scenario("static", `${CREATE} $r = $m->st(); return [$r instanceof XtTyped, get_class($r) === get_class($m), $r === $m, $r->i()];`, function () {
    const m = mock(this);
    const r = m.st() as Typed;
    return [r instanceof XtTyped, classNameOf(r) === classNameOf(m), r === m, r.i()];
  }),
  scenario("self", `${CREATE} $r = $m->sf(); return [$r instanceof XtTyped, get_class($r) === get_class($m), $r === $m, $r->s()];`, function () {
    const m = mock(this);
    const r = m.sf() as Typed;
    return [r instanceof XtTyped, classNameOf(r) === classNameOf(m), r === m, r.s()];
  }),
  scenario("object", `${CREATE} return get_class($m->o());`, function () {
    const o = mock(this).o();
    return isPhpObject(o) ? classNameOf(o) : gettype(o);
  }),
  scenario("callable", `${CREATE} $f = $m->c(); return [is_callable($f), $f()];`, function () {
    const f = mock(this).c();
    return [typeof f === "function", (f as Call)()];
  }),
  scenario("iterable", `${CREATE} $g = $m->it(); return [$g instanceof \\Traversable, iterator_to_array($g)];`, function () {
    const g = mock(this).it() as Iterable<unknown>;
    return [typeof g === "object" && g !== null && Symbol.iterator in g, [...g]];
  }),
  scenario("class-typed return", `${CREATE} $r = $m->cl(); return [$r instanceof XtTypedBase, $r instanceof XtTyped, $r->inherited()];`, function () {
    const r = mock(this).cl() as XtTypedBase;
    return [r instanceof XtTypedBase, r instanceof XtTyped, r.inherited()];
  }),
  scenario("union of classes", `${CREATE} return $m->uc();`, function () {
    return mock(this).uc();
  }),
  scenario("never", `${CREATE} return $m->nv();`, function () {
    return mock(this).nv();
  }),
  scenario("a stub", `$s = $this->createStub(XtTyped::class); return [$s->i(), $s->s(), $s->args(1)];`, function () {
    const s = this.createStub(XtTyped);
    return [s.i(), s.s(), s.args(1)];
  }),
  scenario("with() names the declared parameter", `${CREATE} $m->expects($this->once())->method('args')->with(1, 3); return $m->args(1);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("args").with(1, 3);
    return m.args(1);
  }),
  scenario("toString's return type", `${CREATE} $m->expects($this->once())->method('i')->with(1); return $m->i(2);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("i").with(1);
    return (m.i as Call)(2);
  }),
  scenario("toString's nullable return type", `${CREATE} $m->expects($this->once())->method('ns')->with('a'); return $m->ns('b');`, function () {
    const m = mock(this);
    m.expects(this.once()).method("ns").with("a");
    return (m.ns as Call)("b");
  }),
  scenario("toString's union return type", `${CREATE} $m->expects($this->once())->method('u')->with('a'); return $m->u('b');`, function () {
    const m = mock(this);
    m.expects(this.once()).method("u").with("a");
    return (m.u as Call)("b");
  }),
  scenario("the declaring class", `${CREATE} $m->expects($this->once())->method('inherited')->with(1); return $m->inherited(2);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("inherited").with(1);
    return (m.inherited as Call)(2);
  }),
  scenario("omitted arguments seen by willReturnCallback", `${CREATE} $m->method('args')->willReturnCallback(fn (...$a) => $a); return [$m->args(1), $m->args(1, 5), $m->args(1, 5, 'y', [1], 'e', 'extra')];`, function () {
    const m = mock(this);
    m.method("args").willReturnCallback((...a: unknown[]) => a);
    return [m.args(1), m.args(1, 5), (m.args as Call)(1, 5, "y", [1], "e", "extra")];
  }),
  scenario("with() of the padded defaults", `${CREATE} $m->expects($this->once())->method('args')->with(1, 2, 'x', [], null)->willReturn('ok'); return $m->args(1);`, function () {
    const m = mock(this);
    m.expects(this.once()).method("args").with(1, 2, "x", [], null).willReturn("ok");
    return m.args(1);
  }),
  scenario("willReturnMap with short rows", `${CREATE} $m->method('args')->willReturnMap([[1, 'one'], [1, 3, 'three'], ['zero']]); return [$m->args(1), $m->args(1, 3), $m->args(1, 2), $m->args(2)];`, function () {
    const m = mock(this);
    m.method("args").willReturnMap([[1, "one"], [1, 3, "three"], ["zero"]]);
    return [m.args(1), m.args(1, 3), m.args(1, 2), m.args(2)];
  }),
];

export interface RequestSpec {
  readonly id: "XT-assert-20";
  readonly setup: readonly string[];
  readonly exprs: readonly string[];
}

/** The two row exprs, then one per cell. */
export const ROW_EXPRS: readonly string[] = ["xt_rows20(XtTypedBase::class)", "xt_rows20(XtTyped::class)"];

export const REQUEST: RequestSpec = { id: "XT-assert-20", setup: SETUP, exprs: [...ROW_EXPRS, ...TYPED_CELLS.map((cell) => cell.php)] };
