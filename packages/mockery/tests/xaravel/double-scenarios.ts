// The scenario table of Story 4.8 (XT-mockery-7): each `jasonmccreary/double`
// v1.0.1 scenario as PHP source and as its TS twin, and the PHP/TS twin
// classes, interfaces and enum.
//
// The request file `conformance/oracle-requests/4.8.jsonl` was generated from
// this table (by a throwaway script outside the repository, through
// tools/oracle/request.ts's makeRequest and renderRequests: one request,
// `setup` = DOUBLE_SETUP, `exprs` = each scenario's `wrapDoublePhp`), and
// mockery.test.ts rebuilds the request's `setup` and `exprs` from it, so the
// table and the signed fixture cannot drift apart. No expected outcome is
// written here: every one comes from the Oracle (the real PHP library, loaded
// by DOUBLE_SETUP's autoloader from the image's
// `/oracle/upstream/ai/vendor/jasonmccreary/double/src`, else from
// `getenv('XARAVEL_DOUBLE_SRC')` for a local cross-check).
//
// A scenario appends what it observes to `$r` / `r`. The wrapper turns
// auto-verify on, runs the scenario, then `Double::verifyAll(false)`, and
// gives the cell `[outcome, verify outcome, assertTrue count]`: the outcome is
// `['ok', $r]` or `['throws', <short class>, <message>, $r]`; the verify
// outcome `['ok', <checks>]` or `['throws', <short class>, <message>]`; the
// count is `Assert::getCount()`'s delta, and in TS the `assertTrue` kinds the
// counting context recorded.
//
// JS has no return types and no class registry, so `installDoubleLookups()`
// installs the return-type lookup (`Symbol.for('xaravel.api.signature')`,
// ESC-4.8-1 item 1) from the twins' declared PHP return types, and a class
// lookup (`Symbol.for('xaravel.class.lookup')`) that answers the twins (the
// interfaces with their contract tokens) before any lookup already installed.
// Both are `configurable` defines, removed by the function it returns.
import { Argument, Double, OverriddenDouble } from "../../src/index";
import { runCounted } from "../../../assert/src/declarations/AssertionCounter";
import { shortClassName } from "../../src/support/values";
import { messageOf, xtTry } from "./scenarios";

const FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const SIGNATURE = Symbol.for("xaravel.api.signature");
const LOOKUP = Symbol.for("xaravel.class.lookup");

// ---------------------------------------------------------------------------
// Twins (PHP declarations in DOUBLE_SETUP)

/** `class XtP`: a value object, equal by PHP `==` when its `v` is. */
export class XtP {
  static readonly [FQCN]: string = "XtP";
  v: unknown;
  constructor(v: unknown = null) {
    this.v = v;
  }
}

/** An AD-1 contract token: `Symbol.hasInstance` reads the brand `Symbol.for(name)`; its methods are listed. */
function contract(name: string, methods: readonly string[]): { readonly [Symbol.hasInstance]: (value: unknown) => boolean } {
  const brand = Symbol.for(name);
  return Object.freeze({
    [FQCN]: name,
    [CONTRACT_METHODS]: Object.freeze([...methods]),
    [Symbol.hasInstance](value: unknown): boolean {
      return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true;
    },
  });
}

/** `interface XtI1 { public function one($a); }` */
export const XtI1 = contract("XtI1", ["one"]);
/** `interface XtI2 { public function two($b); }` */
export const XtI2 = contract("XtI2", ["two"]);

/** `enum XtE { case First; case Second; }` */
export class XtE {
  static readonly [FQCN]: string = "XtE";
  static readonly First: XtE = new XtE("First");
  static readonly Second: XtE = new XtE("Second");
  private constructor(readonly name: string) {}
  static cases(): XtE[] {
    return [XtE.First, XtE.Second];
  }
}

/** `class XtErr extends \RuntimeException {}` */
export class XtErr extends Error {
  static readonly [FQCN]: string = "XtErr";
  getMessage(): string {
    return this.message;
  }
}

export class XtGrand {
  static readonly [FQCN]: string = "XtGrand";
  leaf(): unknown {
    return "leaf";
  }
}

export class XtChild {
  static readonly [FQCN]: string = "XtChild";
  grand(): unknown {
    return new XtGrand();
  }
  value(): unknown {
    return 7;
  }
}

/** The doubled service: untyped and typed methods, real bodies for passthru, a static and a magic method. */
export class XtSvc {
  static readonly [FQCN]: string = "XtSvc";
  state: unknown = "initial";
  m(a?: unknown, b?: unknown): unknown {
    void [a, b];
    return "real m";
  }
  fetch(key?: unknown): unknown {
    void key;
    return "real fetch";
  }
  untyped(): unknown {
    return "real";
  }
  flag(): unknown {
    return true;
  }
  total(): unknown {
    return 5;
  }
  ratio(): unknown {
    return 1.5;
  }
  name(): unknown {
    return "n";
  }
  items(): unknown {
    return [1];
  }
  maybe(): unknown {
    return null;
  }
  me(): unknown {
    return this;
  }
  child(): unknown {
    return new XtChild();
  }
  iface(): unknown {
    throw new Error("real");
  }
  kind(): unknown {
    return XtE.Second;
  }
  real(): unknown {
    return `real:${String(this.state)}`;
  }
  callsSelf(): unknown {
    return this.m("from callsSelf");
  }
  __get(name?: unknown): unknown {
    void name;
    return null;
  }
  static make(): unknown {
    return new XtSvc();
  }
}

/** A class that declares two of Double's reserved verbs, as Laravel's Gate declares `allows`. */
export class XtGate {
  static readonly [FQCN]: string = "XtGate";
  instance(): unknown {
    return "real instance";
  }
  allows(ability?: unknown): unknown {
    void ability;
    return true;
  }
}

/** PHP's `xt_upper`, for `resolves(xt_upper(...))`. */
function xtUpper(value: string): string {
  return value.toUpperCase();
}

/** The twins' declared PHP return types, as `conformance/api-surface` rows give them. */
const RETURN_TYPES: ReadonlyMap<string, { readonly returns: string; readonly nullable: boolean }> = new Map([
  ["XtSvc::flag", { returns: "bool", nullable: false }],
  ["XtSvc::total", { returns: "int", nullable: false }],
  ["XtSvc::ratio", { returns: "float", nullable: false }],
  ["XtSvc::name", { returns: "string", nullable: false }],
  ["XtSvc::items", { returns: "array", nullable: false }],
  ["XtSvc::maybe", { returns: "?XtP", nullable: true }],
  ["XtSvc::me", { returns: "self", nullable: false }],
  ["XtSvc::child", { returns: "XtChild", nullable: false }],
  ["XtSvc::iface", { returns: "XtI1", nullable: false }],
  ["XtSvc::kind", { returns: "XtE", nullable: false }],
  ["XtChild::grand", { returns: "XtGrand", nullable: false }],
  ["XtChild::value", { returns: "int", nullable: false }],
]);

const TWINS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ["xtp", XtP],
  ["xti1", XtI1],
  ["xti2", XtI2],
  ["xte", XtE],
  ["xterr", XtErr],
  ["xtgrand", XtGrand],
  ["xtchild", XtChild],
  ["xtsvc", XtSvc],
  ["xtgate", XtGate],
]);

/** Installs the return-type lookup and a class lookup for the twins; returns the function that removes both. */
export function installDoubleLookups(): () => void {
  const previousLookup = Object.getOwnPropertyDescriptor(globalThis, LOOKUP);
  const previousSignature = Object.getOwnPropertyDescriptor(globalThis, SIGNATURE);
  const fallback: unknown = previousLookup?.value;
  Object.defineProperty(globalThis, SIGNATURE, {
    value: (fqcn: string, member: string): unknown => RETURN_TYPES.get(`${fqcn}::${member}`) ?? null,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(globalThis, LOOKUP, {
    value: (name: string): unknown => TWINS.get(name.toLowerCase()) ?? (typeof fallback === "function" ? (fallback as (name: string) => unknown)(name) : null),
    writable: false,
    enumerable: false,
    configurable: true,
  });
  return (): void => {
    for (const [key, previous] of [
      [SIGNATURE, previousSignature],
      [LOOKUP, previousLookup],
    ] as const) {
      if (previous === undefined) {
        delete (globalThis as Record<symbol, unknown>)[key];
      } else {
        Object.defineProperty(globalThis, key, previous);
      }
    }
  };
}

const PREFIX = String.raw`JMac\\Testing\\`;
const ORACLE_SRC = "/oracle/upstream/ai/vendor/jasonmccreary/double/src";

/** XT-mockery-7's setup: Double's autoloader, then the twins. */
export const DOUBLE_SETUP: readonly string[] = [
  String.raw`spl_autoload_register(function ($class) { $prefix = '${PREFIX}'; if (strncmp($class, $prefix, strlen($prefix)) !== 0) { return; } $base = is_dir('${ORACLE_SRC}') ? '${ORACLE_SRC}' : getenv('XARAVEL_DOUBLE_SRC'); if (! is_string($base) || $base === '') { return; } $file = $base.'/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php'; if (is_file($file)) { require $file; } });`,
  "class XtP { public $v; public function __construct($v = null) { $this->v = $v; } }",
  "interface XtI1 { public function one($a); }",
  "interface XtI2 { public function two($b); }",
  "enum XtE { case First; case Second; }",
  String.raw`class XtErr extends \RuntimeException {}`,
  "class XtGrand { public function leaf() { return 'leaf'; } }",
  "class XtChild { public function grand(): XtGrand { return new XtGrand; } public function value(): int { return 7; } }",
  String.raw`class XtSvc { public $state = 'initial'; public function m($a = null, $b = null) { return 'real m'; } public function fetch($key = null) { return 'real fetch'; } public function untyped() { return 'real'; } public function flag(): bool { return true; } public function total(): int { return 5; } public function ratio(): float { return 1.5; } public function name(): string { return 'n'; } public function items(): array { return [1]; } public function maybe(): ?XtP { return null; } public function me(): self { return $this; } public function child(): XtChild { return new XtChild; } public function iface(): XtI1 { throw new \LogicException('real'); } public function kind(): XtE { return XtE::Second; } public function real() { return 'real:'.$this->state; } public function callsSelf() { return $this->m('from callsSelf'); } public function __get($name) { return null; } public static function make() { return new static; } }`,
  "class XtGate { public function instance() { return 'real instance'; } public function allows($ability = null) { return true; } }",
  String.raw`function xt_try(callable $f) { try { return ['ok', $f()]; } catch (\Throwable $e) { return ['throws', (new \ReflectionClass($e))->getShortName(), $e->getMessage()]; } }`,
  "function xt_upper($s) { return strtoupper($s); }",
];

export interface DoubleScenario {
  readonly label: string;
  /** PHP statements; they append to `$r`. */
  readonly php: string;
  /** The TS twin; it appends to `r`. */
  readonly run: (r: unknown[]) => void;
}

const D = String.raw`\JMac\Testing\Double`;
const A = String.raw`\JMac\Testing\Matching\Argument`;
const OD = String.raw`\JMac\Testing\OverriddenDouble`;
const SVC = `$d = ${D}::for(XtSvc::class);`;

/** The PHP expression of one scenario. */
export function wrapDoublePhp(php: string): string {
  return String.raw`(function () { $before = \PHPUnit\Framework\Assert::getCount(); ${D}::enableAutoVerify(); $r = []; try { ${php} $o = ['ok', $r]; } catch (\Throwable $e) { $o = ['throws', (new \ReflectionClass($e))->getShortName(), $e->getMessage(), $r]; } try { $v = ['ok', ${D}::verifyAll(false)]; } catch (\Throwable $e) { $v = ['throws', (new \ReflectionClass($e))->getShortName(), $e->getMessage()]; } return [$o, $v, \PHPUnit\Framework\Assert::getCount() - $before]; })()`;
}

/** Runs the TS twin of one scenario with the same wrapping, in a fresh counting context. */
export async function runDoubleScenario(scenario: DoubleScenario): Promise<unknown[]> {
  let outcome: unknown[] = [];
  let verify: unknown[] = [];
  const counted = await runCounted(() => {
    Double.enableAutoVerify();
    const r: unknown[] = [];
    try {
      scenario.run(r);
      outcome = ["ok", r];
    } catch (error) {
      outcome = ["throws", shortClassName(error), messageOf(error), r];
    }
    try {
      verify = ["ok", Double.verifyAll(false)];
    } catch (error) {
      verify = ["throws", shortClassName(error), messageOf(error)];
    }
  });
  const kinds = Object.keys(counted.assertions).filter((kind) => kind !== "assertTrue");
  if (kinds.length > 0 || counted.total !== (counted.assertions["assertTrue"] ?? 0)) {
    throw new Error(`${scenario.label}: recorded assertions other than assertTrue: ${JSON.stringify(counted.assertions)} (total ${String(counted.total)})`);
  }
  if (counted.error !== null) {
    throw counted.error.value;
  }
  return [outcome, verify, counted.assertions["assertTrue"] ?? 0];
}

/** A double of XtSvc, loosely typed for the twins. */
function svc(): any {
  return Double.for(XtSvc);
}

export const DOUBLE_SCENARIOS: readonly DoubleScenario[] = [
  // ---- returns
  {
    label: "expects()->returns(1), called once; instance() is the double",
    php: `${SVC} $d->expects('m')->returns(1); $r[] = $d->m(); $r[] = $d->instance() === $d; $r[] = $d instanceof XtSvc;`,
    run: (r) => {
      const d = svc();
      d.expects("m").returns(1);
      r.push(d.m(), d.instance() === d, d instanceof XtSvc);
    },
  },
  {
    label: "allows()->returns(1, 2), called 3 times: holds at the last",
    php: `${SVC} $d->allows('m')->returns(1, 2); $r[] = $d->m(); $r[] = $d->m(); $r[] = $d->m();`,
    run: (r) => {
      const d = svc();
      d.allows("m").returns(1, 2);
      r.push(d.m(), d.m(), d.m());
    },
  },
  {
    label: "expects()->times(3)->returns(1, 2), called 3 times",
    php: `${SVC} $d->expects('m')->times(3)->returns(1, 2); $r[] = $d->m(); $r[] = $d->m(); $r[] = $d->m();`,
    run: (r) => {
      const d = svc();
      d.expects("m").times(3).returns(1, 2);
      r.push(d.m(), d.m(), d.m());
    },
  },
  {
    label: "returns(a closure): the closure is returned, not called",
    php: `${SVC} $d->allows('m')->returns(fn () => 'called'); $v = $d->m(); $r[] = $v instanceof \\Closure; $r[] = $v();`,
    run: (r) => {
      const d = svc();
      d.allows("m").returns(() => "called");
      const v = d.m();
      r.push(typeof v === "function", v());
    },
  },
  {
    label: "returns() with no value",
    php: `${SVC} $d->allows('m')->returns();`,
    run: () => {
      svc().allows("m").returns();
    },
  },
  // ---- throws
  {
    label: "throws(e) called twice: the same instance each time",
    php: `${SVC} $e = new XtErr('x'); $d->allows('m')->throws($e); $r[] = xt_try(fn () => $d->m()); try { $d->m(); } catch (\\Throwable $c) { $r[] = $c === $e; }`,
    run: (r) => {
      const d = svc();
      const e = new XtErr("x");
      d.allows("m").throws(e);
      r.push(xtTry(() => d.m()));
      try {
        d.m();
      } catch (caught) {
        r.push(caught === e);
      }
    },
  },
  {
    label: "throws(a, b) called 3 times: holds at the last",
    php: `${SVC} $d->allows('m')->throws(new XtErr('a'), new XtErr('b')); $r[] = xt_try(fn () => $d->m()); $r[] = xt_try(fn () => $d->m()); $r[] = xt_try(fn () => $d->m());`,
    run: (r) => {
      const d = svc();
      d.allows("m").throws(new XtErr("a"), new XtErr("b"));
      r.push(
        xtTry(() => d.m()),
        xtTry(() => d.m()),
        xtTry(() => d.m()),
      );
    },
  },
  {
    label: "throws() with no exception",
    php: `${SVC} $d->allows('m')->throws();`,
    run: () => {
      svc().allows("m").throws();
    },
  },
  {
    label: "expects()->with('k')->throws(e): a matching call throws",
    php: `${SVC} $d->expects('fetch')->with('k')->throws(new XtErr('nope')); $r[] = xt_try(fn () => $d->fetch('k'));`,
    run: (r) => {
      const d = svc();
      d.expects("fetch").with("k").throws(new XtErr("nope"));
      r.push(xtTry(() => d.fetch("k")));
    },
  },
  // ---- resolves
  {
    label: "resolves(fn ($a, $b) => $a.$b): called with the arguments",
    php: `${SVC} $d->allows('m')->resolves(fn ($a, $b) => $a.$b); $r[] = $d->m('x', 'y');`,
    run: (r) => {
      const d = svc();
      d.allows("m").resolves((a: string, b: string) => a + b);
      r.push(d.m("x", "y"));
    },
  },
  {
    label: "resolves(a first-class callable)",
    php: `${SVC} $d->allows('m')->resolves(xt_upper(...)); $r[] = $d->m('abc');`,
    run: (r) => {
      const d = svc();
      d.allows("m").resolves(xtUpper);
      r.push(d.m("abc"));
    },
  },
  {
    label: "times(minimum: 1)->resolves(fn), called twice",
    php: `${SVC} $d->expects('m')->times(minimum: 1)->resolves(fn ($a) => $a * 2); $r[] = $d->m(2); $r[] = $d->m(5);`,
    run: (r) => {
      const d = svc();
      d.expects("m")
        .times({ minimum: 1 })
        .resolves((a: number) => a * 2);
      r.push(d.m(2), d.m(5));
    },
  },
  // ---- the last verb wins
  {
    label: "returns(1)->throws(e), throws(e)->resolves(fn), resolves(fn)->returns(2)",
    php: `$a = ${D}::for(XtSvc::class); $a->allows('m')->returns(1)->throws(new XtErr('t')); $r[] = xt_try(fn () => $a->m()); $b = ${D}::for(XtSvc::class); $b->allows('m')->throws(new XtErr('t'))->resolves(fn () => 'resolved'); $r[] = $b->m(); $c = ${D}::for(XtSvc::class); $c->allows('m')->resolves(fn () => 'r')->returns(2); $r[] = $c->m();`,
    run: (r) => {
      const a = svc();
      a.allows("m").returns(1).throws(new XtErr("t"));
      r.push(xtTry(() => a.m()));
      const b = svc();
      b.allows("m")
        .throws(new XtErr("t"))
        .resolves(() => "resolved");
      r.push(b.m());
      const c = svc();
      c.allows("m")
        .resolves(() => "r")
        .returns(2);
      r.push(c.m());
    },
  },
  // ---- call limits
  {
    label: "expects() called twice: limit exceeded at the 2nd call",
    php: `${SVC} $d->expects('m'); $r[] = $d->m(); $r[] = $d->m();`,
    run: (r) => {
      const d = svc();
      d.expects("m");
      r.push(d.m());
      r.push(d.m());
    },
  },
  {
    label: "expects()->never(), called",
    php: `${SVC} $d->expects('m')->never(); $d->m('x');`,
    run: () => {
      const d = svc();
      d.expects("m").never();
      d.m("x");
    },
  },
  {
    label: "times(1, 3) called 4 times; times(maximum: 1) called twice",
    php: `${SVC} $d->expects('m')->times(1, 3); $d->m(); $d->m(); $d->m(); $r[] = xt_try(fn () => $d->m()); $e = ${D}::for(XtSvc::class); $e->allows('fetch')->times(maximum: 1); $e->fetch(); $r[] = xt_try(fn () => $e->fetch());`,
    run: (r) => {
      const d = svc();
      d.expects("m").times(1, 3);
      d.m();
      d.m();
      d.m();
      r.push(xtTry(() => d.m()));
      const e = svc();
      e.allows("fetch").times({ maximum: 1 });
      e.fetch();
      r.push(xtTry(() => e.fetch()));
    },
  },
  {
    label: "the limit exceeded names the other matching expectation",
    php: `${SVC} $d->expects('m')->with(1)->returns('x'); $d->expects('m')->with(${A}::type('int'))->never(); $r[] = $d->m(1); $r[] = $d->m(1);`,
    run: (r) => {
      const d = svc();
      d.expects("m").with(1).returns("x");
      d.expects("m").with(Argument.type("int")).never();
      r.push(d.m(1));
      r.push(d.m(1));
    },
  },
  {
    label: "times() errors: no bound, a count and a minimum, minimum over maximum",
    php: `${SVC} $r[] = xt_try(fn () => $d->allows('m')->times()); $r[] = xt_try(fn () => $d->allows('m')->times(1, minimum: 1)); $r[] = xt_try(fn () => $d->allows('m')->times(3, 1));`,
    run: (r) => {
      const d = svc();
      r.push(
        xtTry(() => d.allows("m").times()),
        xtTry(() => d.allows("m").times({ count: 1, minimum: 1 })),
        xtTry(() => d.allows("m").times(3, 1)),
      );
    },
  },
  // ---- verification
  {
    label: "expects() never called: unsatisfied at verify",
    php: `${SVC} $d->expects('m');`,
    run: () => {
      svc().expects("m");
    },
  },
  {
    label: "times(2) called once: unsatisfied at verify",
    php: `${SVC} $d->expects('m')->times(2); $d->m(1);`,
    run: () => {
      const d = svc();
      d.expects("m").times(2);
      d.m(1);
    },
  },
  {
    label: "times(minimum: 1) never called; times(2, 3) called once",
    php: `${SVC} $d->expects('m')->times(minimum: 1); $e = ${D}::for(XtChild::class); $e->expects('value')->times(2, 3); $e->value();`,
    run: () => {
      const d = svc();
      d.expects("m").times({ minimum: 1 });
      const e: any = Double.for(XtChild);
      e.expects("value").times(2, 3);
      e.value();
    },
  },
  {
    label: "two unmet expectations on one double: the multi-line message",
    php: `${SVC} $d->expects('m')->times(2); $d->expects('fetch'); $d->m();`,
    run: () => {
      const d = svc();
      d.expects("m").times(2);
      d.expects("fetch");
      d.m();
    },
  },
  {
    label: "two doubles: the first unmet one fails",
    php: `$a = ${D}::for(XtSvc::class); $a->expects('m'); $b = ${D}::for(XtChild::class); $b->expects('value');`,
    run: () => {
      const a = svc();
      a.expects("m");
      const b: any = Double.for(XtChild);
      b.expects("value");
    },
  },
  {
    label: "two doubles: the first passes, the second fails",
    php: `$a = ${D}::for(XtSvc::class); $a->allows('m'); $b = ${D}::for(XtChild::class); $b->expects('value');`,
    run: () => {
      const a = svc();
      a.allows("m");
      const b: any = Double.for(XtChild);
      b.expects("value");
    },
  },
  {
    label: "allows() never called: verify passes",
    php: `${SVC} $d->allows('m');`,
    run: () => {
      svc().allows("m");
    },
  },
  // ---- argument matching
  {
    label: "with('a', ['k' => 1]) called with ('b', ['k' => 2]): the comparison block",
    php: `${SVC} $d->expects('m')->with('a', ['k' => 1]); $d->m('b', ['k' => 2]);`,
    run: () => {
      const d = svc();
      d.expects("m").with("a", { k: 1 });
      d.m("b", { k: 2 });
    },
  },
  {
    label: "the mismatch at the call, then unsatisfied at verify with the comparison block",
    php: `${SVC} $d->expects('m')->with('a', ['k' => 1]); $r[] = xt_try(fn () => $d->m('a', ['k' => 2]));`,
    run: (r) => {
      const d = svc();
      d.expects("m").with("a", { k: 1 });
      r.push(xtTry(() => d.m("a", { k: 2 })));
    },
  },
  {
    label: "two candidates: the list form",
    php: `${SVC} $d->expects('m')->with(1); $d->expects('m')->with(2); $d->m(3);`,
    run: () => {
      const d = svc();
      d.expects("m").with(1);
      d.expects("m").with(2);
      d.m(3);
    },
  },
  {
    label: "four candidates: the capped list",
    php: `${SVC} $d->allows('m')->with(1); $d->allows('m')->with(2); $d->allows('m')->with(3); $d->expects('m')->with(4); $d->m(5);`,
    run: () => {
      const d = svc();
      d.allows("m").with(1);
      d.allows("m").with(2);
      d.allows("m").with(3);
      d.expects("m").with(4);
      d.m(5);
    },
  },
  {
    label: "a long string: StringDiffer by character",
    php: `${SVC} $d->expects('m')->with('the quick brown fox jumps over the lazy dog'); $d->m('the quick brown fax jumps over the lazy dog');`,
    run: () => {
      const d = svc();
      d.expects("m").with("the quick brown fox jumps over the lazy dog");
      d.m("the quick brown fax jumps over the lazy dog");
    },
  },
  {
    label: "a multi-line string: StringDiffer by line",
    php: `${SVC} $d->expects('m')->with("line one\\nline two\\nline three\\nline four"); $d->m("line one\\nline 2\\nline three\\nline four");`,
    run: () => {
      const d = svc();
      d.expects("m").with("line one\nline two\nline three\nline four");
      d.m("line one\nline 2\nline three\nline four");
    },
  },
  {
    label: "a non-ASCII string past the byte threshold: 30 characters, 60 bytes, StringDiffer by code point",
    php: `${SVC} $d->expects('m')->with('ééééééééééééééé'); $d->m('ééééééééééééééè');`,
    run: () => {
      const d = svc();
      d.expects("m").with("ééééééééééééééé");
      d.m("ééééééééééééééè");
    },
  },
  {
    label: "a non-ASCII multi-line string: StringDiffer by line",
    php: `${SVC} $d->expects('m')->with("première ligne\\nseconde ligne ✓\\ntroisième"); $d->m("première ligne\\nsecond ligne ✗\\ntroisième");`,
    run: () => {
      const d = svc();
      d.expects("m").with("première ligne\nseconde ligne ✓\ntroisième");
      d.m("première ligne\nsecond ligne ✗\ntroisième");
    },
  },
  {
    label: "scalars: true/null against false/1.5",
    php: `${SVC} $d->expects('m')->with(true, null); $d->m(false, 1.5);`,
    run: () => {
      const d = svc();
      d.expects("m").with(true, null);
      d.m(false, 1.5);
    },
  },
  {
    label: "array key order: ['a' => 1, 'b' => 2] against ['b' => 2, 'a' => 1]",
    php: `${SVC} $d->expects('m')->with(['a' => 1, 'b' => 2]); $r[] = xt_try(fn () => $d->m(['b' => 2, 'a' => 1])); $e = ${D}::for(XtSvc::class); $e->allows('m')->with(['a' => 1, 'b' => [2, 3]])->returns('same'); $r[] = $e->m(['a' => 1, 'b' => [2, 3]]);`,
    run: (r) => {
      const d = svc();
      d.expects("m").with({ a: 1, b: 2 });
      r.push(xtTry(() => d.m({ b: 2, a: 1 })));
      const e = svc();
      e.allows("m")
        .with({ a: 1, b: [2, 3] })
        .returns("same");
      r.push(e.m({ a: 1, b: [2, 3] }));
    },
  },
  {
    label: "objects by PHP ==: new XtP(1) matches another new XtP(1), not new XtP(2)",
    php: `${SVC} $d->expects('m')->with(new XtP(1))->returns('eq'); $r[] = $d->m(new XtP(1)); $e = ${D}::for(XtSvc::class); $e->expects('m')->with(new XtP(1)); $r[] = xt_try(fn () => $e->m(new XtP(2)));`,
    run: (r) => {
      const d = svc();
      d.expects("m").with(new XtP(1)).returns("eq");
      r.push(d.m(new XtP(1)));
      const e = svc();
      e.expects("m").with(new XtP(1));
      r.push(xtTry(() => e.m(new XtP(2))));
    },
  },
  {
    label: "the arity mismatch: list form at the call, the arity line at verify",
    php: `${SVC} $d->expects('m')->with(1, 2); $r[] = xt_try(fn () => $d->m(1)); $e = ${D}::for(XtSvc::class); $e->expects('fetch')->with(); $r[] = xt_try(fn () => $e->fetch('k'));`,
    run: (r) => {
      const d = svc();
      d.expects("m").with(1, 2);
      r.push(xtTry(() => d.m(1)));
      const e = svc();
      e.expects("fetch").with();
      r.push(xtTry(() => e.fetch("k")));
    },
  },
  {
    label: "Argument::type(XtP::class) on allows(): a match, and a mismatch falls to the safe default",
    php: `${SVC} $d->allows('m')->with(${A}::type(XtP::class))->returns('typed'); $r[] = $d->m(new XtP); $r[] = $d->m('x');`,
    run: (r) => {
      const d = svc();
      d.allows("m").with(Argument.type(XtP)).returns("typed");
      r.push(d.m(new XtP()), d.m("x"));
    },
  },
  {
    label: "Argument::type('string') and Argument::satisfies(fn): a match, then a mismatch of both",
    php: `${SVC} $d->expects('m')->with(${A}::type('string'), ${A}::satisfies(fn ($v) => $v > 1))->returns('both'); $r[] = $d->m('s', 2); $r[] = xt_try(fn () => $d->m(1, 0));`,
    run: (r) => {
      const d = svc();
      d.expects("m")
        .with(
          Argument.type("string"),
          Argument.satisfies((v: number) => v > 1),
        )
        .returns("both");
      r.push(d.m("s", 2));
      r.push(xtTry(() => d.m(1, 0)));
    },
  },
  {
    label: "Argument::type(XtI1::class) matches a double of the interface",
    php: `${SVC} $i = ${D}::for(XtI1::class); $d->allows('m')->with(${A}::type(XtI1::class))->returns('iface'); $r[] = $d->m($i); $r[] = $d->m(new XtP);`,
    run: (r) => {
      const d = svc();
      const i = Double.for(XtI1);
      d.allows("m").with(Argument.type(XtI1)).returns("iface");
      r.push(d.m(i), d.m(new XtP()));
    },
  },
  // ---- dispatch
  {
    label: "a specific expectation before a generic one, and the exhausted one as fallback",
    php: `${SVC} $d->expects('m')->with(1)->returns('specific'); $d->allows('m')->returns('generic'); $r[] = $d->m(1); $r[] = $d->m(2); $r[] = $d->m(1);`,
    run: (r) => {
      const d = svc();
      d.expects("m").with(1).returns("specific");
      d.allows("m").returns("generic");
      r.push(d.m(1), d.m(2), d.m(1));
    },
  },
  {
    label: "last registered first within a tier",
    php: `${SVC} $d->allows('m')->returns('a'); $d->expects('m')->returns('b'); $r[] = $d->m(); $r[] = $d->m();`,
    run: (r) => {
      const d = svc();
      d.allows("m").returns("a");
      d.expects("m").returns("b");
      r.push(d.m(), d.m());
    },
  },
  {
    label: "two identical finite expects(): ambiguous at verify",
    php: `${SVC} $d->expects('m')->with(1)->returns('first'); $d->expects('m')->with(1)->returns('second'); $r[] = $d->m(1); $r[] = $d->m(1);`,
    run: (r) => {
      const d = svc();
      d.expects("m").with(1).returns("first");
      d.expects("m").with(1).returns("second");
      r.push(d.m(1), d.m(1));
    },
  },
  {
    label: "two ambiguous methods: the multi-line message",
    php: `${SVC} $d->expects('m')->with(1); $d->expects('m')->with(1); $d->expects('fetch'); $d->expects('fetch'); $d->m(1); $d->m(1); $d->fetch(); $d->fetch();`,
    run: () => {
      const d = svc();
      d.expects("m").with(1);
      d.expects("m").with(1);
      d.expects("fetch");
      d.expects("fetch");
      d.m(1);
      d.m(1);
      d.fetch();
      d.fetch();
    },
  },
  // ---- configurable methods
  {
    label: "an unknown method with a near name: did you mean",
    php: `${SVC} $r[] = xt_try(fn () => $d->expects('fetc')); $d->allows('zzzzzz');`,
    run: (r) => {
      const d = svc();
      r.push(xtTry(() => d.expects("fetc")));
      d.allows("zzzzzz");
    },
  },
  {
    label: "a static method",
    php: `${SVC} $d->expects('make');`,
    run: () => {
      svc().expects("make");
    },
  },
  {
    label: "a magic method",
    php: `${SVC} $d->allows('__get');`,
    run: () => {
      svc().allows("__get");
    },
  },
  // ---- safe defaults
  {
    label: "safe defaults: untyped, bool, int, float, string, array, ?X, self, a class, an interface, an enum",
    php: `${SVC} $r[] = $d->untyped(); $r[] = $d->flag(); $r[] = $d->total(); $r[] = $d->ratio(); $r[] = $d->name(); $r[] = $d->items(); $r[] = $d->maybe(); $r[] = $d->me() === $d; $c = $d->child(); $r[] = $c instanceof XtChild; $r[] = $c->value(); $i = $d->iface(); $r[] = $i instanceof XtI1; $r[] = $d->kind()->name;`,
    run: (r) => {
      const d = svc();
      r.push(d.untyped(), d.flag(), d.total(), d.ratio(), d.name(), d.items(), d.maybe(), d.me() === d);
      const c = d.child();
      r.push(c instanceof XtChild, c.value());
      const i = d.iface();
      r.push(i instanceof XtI1, d.kind().name);
    },
  },
  {
    label: "a matched expectation without a return gives the safe default",
    php: `${SVC} $d->expects('total'); $d->expects('child'); $r[] = $d->total(); $r[] = $d->child() instanceof XtChild;`,
    run: (r) => {
      const d = svc();
      d.expects("total");
      d.expects("child");
      r.push(d.total(), d.child() instanceof XtChild);
    },
  },
  {
    label: "past the fabrication depth: FabricationLimitExceeded",
    php: `${SVC} $d->child()->grand();`,
    run: () => {
      svc().child().grand();
    },
  },
  {
    label: "a fabricated double: the note on its messages",
    php: `${SVC} $c = $d->child(); $r[] = xt_try(fn () => $c->expects('nope')); $c->strict(); $c->value();`,
    run: (r) => {
      const c = svc().child();
      r.push(xtTry(() => c.expects("nope")));
      c.strict();
      c.value();
    },
  },
  // ---- passthru
  {
    label: "passthru(): an unconfigured call runs the real method; a self-call reaches a stub",
    php: `$d = ${D}::for(XtSvc::class)->passthru(); $r[] = $d->m(); $d->allows('m')->returns('stub'); $r[] = $d->callsSelf();`,
    run: (r) => {
      const d = svc().passthru();
      r.push(d.m());
      d.allows("m").returns("stub");
      r.push(d.callsSelf());
    },
  },
  {
    label: "passthru($real): the real instance's state is copied",
    php: `$real = new XtSvc; $real->state = 'copied'; $d = ${D}::for(XtSvc::class)->passthru($real); $r[] = $d->real(); $r[] = $d->state; $r[] = $real->state;`,
    run: (r) => {
      const real = new XtSvc();
      real.state = "copied";
      const d = svc().passthru(real);
      r.push(d.real(), d.state, real.state);
    },
  },
  {
    label: "Double::for($real)->passthru(): the known instance is copied",
    php: `$real = new XtSvc; $real->state = 'known'; $d = ${D}::for($real)->passthru(); $r[] = $d->real(); $r[] = $d instanceof XtSvc; $r[] = $d === $real;`,
    run: (r) => {
      const real = new XtSvc();
      real.state = "known";
      const d: any = Double.for(real).passthru();
      r.push(d.real(), d instanceof XtSvc, d === real);
    },
  },
  {
    label: "passthru() on an interface double",
    php: `${D}::for(XtI1::class)->passthru();`,
    run: () => {
      Double.for(XtI1).passthru();
    },
  },
  {
    label: "passthru() given an instance of another class",
    php: `${D}::for(XtSvc::class)->passthru(new XtP);`,
    run: () => {
      svc().passthru(new XtP());
    },
  },
  {
    label: "a second mode: strict() then passthru()",
    php: `${D}::for(XtSvc::class)->strict()->passthru();`,
    run: () => {
      svc().strict().passthru();
    },
  },
  {
    label: "passthru() and an expects() mismatch: the passthru note",
    php: `$d = ${D}::for(XtSvc::class)->passthru(); $d->expects('m')->with(1)->returns('one'); $r[] = $d->m(1); $d->m(2);`,
    run: (r) => {
      const d = svc().passthru();
      d.expects("m").with(1).returns("one");
      r.push(d.m(1));
      d.m(2);
    },
  },
  // ---- strict
  {
    label: "strict(): unconfigured calls throw UnexpectedCall (the suggestion, the comparison, the call list)",
    php: `$d = ${D}::for(XtSvc::class)->strict(); $r[] = xt_try(fn () => $d->m(1)); $r[] = xt_try(fn () => $d->m(2)); $r[] = xt_try(fn () => $d->m(3)); $d->allows('fetch')->returns('f'); $r[] = $d->fetch('k');`,
    run: (r) => {
      const d = svc().strict();
      r.push(
        xtTry(() => d.m(1)),
        xtTry(() => d.m(2)),
        xtTry(() => d.m(3)),
      );
      d.allows("fetch").returns("f");
      r.push(d.fetch("k"));
    },
  },
  // ---- override
  {
    label: "override: a colliding class gives an OverriddenDouble",
    php: `$g = ${D}::for(XtGate::class, override: true); $r[] = $g instanceof ${OD}; $r[] = $g->instance() instanceof XtGate; $g->expects('allows')->with('edit')->returns(false); $r[] = $g->instance()->allows('edit'); $r[] = $g->instance()->instance();`,
    run: (r) => {
      const g: any = Double.for(XtGate, { override: true });
      r.push(g instanceof OverriddenDouble, g.instance() instanceof XtGate);
      g.expects("allows").with("edit").returns(false);
      r.push(g.instance().allows("edit"), g.instance().instance());
    },
  },
  {
    label: "override on a class without a collision: an ordinary double",
    php: `$d = ${D}::for(XtSvc::class, override: true); $r[] = $d instanceof ${OD}; $r[] = $d->instance() === $d;`,
    run: (r) => {
      const d: any = Double.for(XtSvc, { override: true });
      r.push(d instanceof OverriddenDouble, d.instance() === d);
    },
  },
  {
    label: "new OverriddenDouble($double) configures the wrapped double",
    php: `$inner = ${D}::for(XtGate::class, override: true)->instance(); $w = new ${OD}($inner); $w->allows('instance')->returns('x'); $r[] = $inner->instance(); $r[] = $w->instance() === $inner;`,
    run: (r) => {
      const inner: any = Double.for(XtGate, { override: true }).instance();
      const w = new OverriddenDouble(inner);
      w.allows("instance").returns("x");
      r.push(inner.instance(), w.instance() === inner);
    },
  },
  {
    label: "a colliding class without override: ReservedNameCollisionException",
    php: `${D}::for(XtGate::class);`,
    run: () => {
      Double.for(XtGate);
    },
  },
  // ---- targets
  {
    label: "an interface double",
    php: `$d = ${D}::for(XtI1::class); $r[] = $d instanceof XtI1; $d->expects('one')->returns(5); $r[] = $d->one('z');`,
    run: (r) => {
      const d: any = Double.for(XtI1);
      r.push(d instanceof XtI1);
      d.expects("one").returns(5);
      r.push(d.one("z"));
    },
  },
  {
    label: "an intersection: instanceof both, and expectations work",
    php: `$d = ${D}::for(XtI1::class, XtI2::class); $r[] = $d instanceof XtI1; $r[] = $d instanceof XtI2; $d->expects('one')->with(1)->returns('a'); $d->allows('two')->returns('b'); $r[] = $d->one(1); $r[] = $d->two(5);`,
    run: (r) => {
      const d: any = Double.for(XtI1, XtI2);
      r.push(d instanceof XtI1, d instanceof XtI2);
      d.expects("one").with(1).returns("a");
      d.allows("two").returns("b");
      r.push(d.one(1), d.two(5));
    },
  },
  {
    label: "a class among several targets",
    php: `${D}::for(XtI1::class, XtSvc::class);`,
    run: () => {
      Double.for(XtI1, XtSvc);
    },
  },
  {
    label: "the same interface twice",
    php: `${D}::for(XtI1::class, XtI1::class);`,
    run: () => {
      Double.for(XtI1, XtI1);
    },
  },
  {
    label: "override with several targets; no target; a real instance among several",
    php: `$r[] = xt_try(fn () => ${D}::for(XtI1::class, XtI2::class, override: true)); $r[] = xt_try(fn () => ${D}::for()); $r[] = xt_try(fn () => ${D}::for(new XtSvc, XtI1::class));`,
    run: (r) => {
      r.push(
        xtTry(() => Double.for(XtI1, XtI2, { override: true })),
        xtTry(() => Double.for()),
        xtTry(() => Double.for(new XtSvc(), XtI1)),
      );
    },
  },
];
