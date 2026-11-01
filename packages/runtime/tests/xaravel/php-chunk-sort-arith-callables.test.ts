// Executable PHP 8.5.11 evidence for the ESC-14.5 runtime batch; every recorded label is recomputed.
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import { registerClass, registerContractToken, fqcn } from "@xaravel/runtime/registry";
import { frameSlot, interleave, runInFrame } from "@xaravel/runtime/scope";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";

const NS = "XaravelFixture\\ChunkSort";
class Base {
  method(x: unknown): string { return `instance:${p.toPhpString(x)}`; }
  options(value: unknown, opts: unknown): unknown { return [value, opts]; }
  static optionsStatic(value: unknown, opts: unknown): unknown { return [fqcn(this), value, opts]; }
  static called(): string { return fqcn(this); }
  static stat(x: unknown): string { return `static:${p.toPhpString(x)}`; }
}
Object.defineProperty(Object.getOwnPropertyDescriptor(Base.prototype, "options")!.value as object, Symbol.for("xaravel.php.options"), { value: true });
Object.defineProperty(Object.getOwnPropertyDescriptor(Base, "optionsStatic")!.value as object, Symbol.for("xaravel.php.options"), { value: true });
class Child extends Base {}
class Magic {
  __call(name: string, args: unknown[]): unknown { return [name, args]; }
  static __callStatic(name: string, args: unknown[]): unknown { return [name, args]; }
}
class Invokable { __invoke(x: unknown): unknown { return p.plus(x, 1); } }
class QualifiedBase {
  instance(): unknown { return ["base", fqcn(this)]; }
  static stat(): unknown { return ["base", fqcn(this)]; }
  static inherited(): unknown { return ["base", fqcn(this)]; }
  options(value: unknown, options: unknown): unknown { return ["base", fqcn(this), value, options]; }
  static optionsStatic(value: unknown, options: unknown): unknown { return ["base", fqcn(this), value, options]; }
}
class QualifiedMiddle extends QualifiedBase {
  override instance(): unknown { return ["middle", fqcn(this)]; }
  static override stat(): unknown { return ["middle", fqcn(this)]; }
  override options(value: unknown, options: unknown): unknown { return ["middle", fqcn(this), value, options]; }
  static override optionsStatic(value: unknown, options: unknown): unknown { return ["middle", fqcn(this), value, options]; }
}
class QualifiedChild extends QualifiedMiddle {}
class Unrelated { static stat(): string { return "unrelated"; } }
class UnicodeMethods {
  K(): string { return "kelvin"; }
  K(): string { return "ascii"; }
  Écho(): string { return "accent"; }
}
for (const klass of [QualifiedBase, QualifiedMiddle]) {
  for (const [holder, name] of [[klass.prototype, "options"], [klass, "optionsStatic"]] as const) {
    Object.defineProperty(Object.getOwnPropertyDescriptor(holder, name)!.value as object, Symbol.for("xaravel.php.options"), { value: true });
  }
}
for (const [name, klass] of [["QualifiedBase", QualifiedBase], ["QualifiedMiddle", QualifiedMiddle], ["QualifiedChild", QualifiedChild], ["Unrelated", Unrelated], ["UnicodeMethods", UnicodeMethods]] as const) registerClass(`${NS}\\${name}`, klass);
// Runtime cannot import contracts: use the same recorded token protocol as token-table.test.ts.
function customToken(name: string, parents: readonly object[] = []): { readonly brand: symbol } {
  const brand = Symbol.for(name);
  const token = Object.freeze({ brand, [Symbol.for("xaravel.class.fqcn")]: name, [Symbol.for("xaravel.contract.parents")]: parents, [Symbol.toPrimitive]: (): symbol => brand });
  registerContractToken(token); return token;
}
const CustomParent = customToken(`${NS}\\CustomParent`);
const CustomChild = customToken(`${NS}\\CustomChild`, [CustomParent]);
class ContractImpl {
  get [CustomParent.brand](): true { return true; }
  get [CustomChild.brand](): true { return true; }
}
registerClass(`${NS}\\ContractImpl`, ContractImpl);
class PairIterator {
  #position = 0;
  constructor(private readonly pairs: readonly (readonly [unknown, unknown])[]) {}
  get [p.Iterator.brand](): true { return true; }
  get [p.Traversable.brand](): true { return true; }
  current(): unknown { return this.pairs[this.#position]![1]; }
  key(): unknown { return this.pairs[this.#position]![0]; }
  rewind(): void { this.#position = 0; }
  next(): void { this.#position++; }
  valid(): boolean { return this.#position < this.pairs.length; }
}
class PairAggregate {
  constructor(private readonly pairs: readonly (readonly [unknown, unknown])[]) {}
  get [p.IteratorAggregate.brand](): true { return true; }
  get [p.Traversable.brand](): true { return true; }
  getIterator(): PairIterator { return new PairIterator(this.pairs); }
}
class Status {
  static cases(): Status[] { return [Status.Ready]; }
  static readonly Ready = new Status();
}
for (const [name, klass] of [["Base", Base], ["Child", Child], ["Magic", Magic], ["Invokable", Invokable], ["Status", Status]] as const) registerClass(`${NS}\\${name}`, klass);

function attempt(fn: () => unknown): unknown {
  try { return fn(); } catch (error) { return `${fqcn(error as object)}: ${(error as Error).message}`; }
}
function encode(value: unknown): string { return p.jsonEncode(value, p.JSON_PRESERVE_ZERO_FRACTION) as string; }
const mixed = (): p.PhpArray<p.PhpKeyInput, unknown> => new p.PhpArray<p.PhpKeyInput, unknown>([["z", "A10"], [4, "a2"], ["b", "A2"], [-1, "a02"], ["aa", "A2"]]);
const names = ["array_chunk", "key", "ksort", "krsort", "uksort", "sort", "rsort", "intdiv", "floor", "ceil", "is_subclass_of", "call_user_func_array", "strrev", "strtolower", "setlocale"] as const;
const cases: Record<string, () => unknown> = {
  chunk: () => [p.array_chunk([], 2), p.array_chunk(new p.PhpArray<p.PhpKeyInput, unknown>([["a", 1], [5, 2], ["b", 3], [9, 4]]), "2"), p.array_chunk(new p.PhpArray<p.PhpKeyInput, unknown>([["a", 1], [5, 2], ["b", 3], [9, 4]]), 2, true), p.array_chunk([1, 2], p.PHP_INT_MAX)],
  "chunk.errors": () => [attempt(() => p.array_chunk([], 0)), attempt(() => p.array_chunk(1, 2)), attempt(() => p.array_chunk([], [])), attempt(() => p.array_chunk([], 2, []))],
  pointer: () => { const a = new p.Ref<unknown>(new p.PhpArray<p.PhpKeyInput, unknown>([["a", false], [5, "last"]])); return [p.key(a.value), p.reset(a), p.key(a.value), p.end(a), p.key(a.value)]; },
  "pointer.empty": () => { const a = new p.Ref<unknown>([]); return [p.reset(a), p.key(a.value), p.end(a), p.key(a.value)]; },
  uksort: () => { const a = new p.Ref<unknown>({ bb: 1, a: 2, cc: 3 }); const calls: unknown[] = []; p.uksort(a, (x: unknown, y: unknown) => { calls.push([x, y]); return p.strlen(x) - p.strlen(y); }); return [a.value, calls]; },
  "uksort.throw": () => { const a = new p.Ref<unknown>({ d: 4, c: 3, b: 2, a: 1 }); const calls: unknown[] = []; const error = attempt(() => p.uksort(a, (x: unknown, y: unknown) => { calls.push([x, y]); if (calls.length === 2) throw new p.RuntimeException("stop"); return p.spaceship(x, y); })); return [error, a.value, calls]; },
  "arith.plus": () => [p.plus(1, 2), p.plus(p.PHP_INT_MAX, 0), p.plus(p.PHP_INT_MAX, 1), p.plus(p.PHP_INT_MIN, -1), p.plus(" 12tail", 2), p.plus("1e2", true), p.plus(null, false), p.plus(p.float(1), 1), p.plus({ a: 1 }, { a: 2, b: 3 })],
  "arith.divide": () => [p.divide(6, 3), p.divide(7, 2), p.divide("6", true), p.divide(p.float(6), 3), p.divide(p.PHP_INT_MIN, -1), p.divide(p.PHP_INT_MAX, 1)],
  "arith.errors": () => [attempt(() => p.plus([], 1)), attempt(() => p.plus("x", 1)), attempt(() => p.divide(1, 0)), attempt(() => p.divide(1, [])), attempt(() => p.intdiv(p.PHP_INT_MIN, -1)), attempt(() => p.intdiv(1, 0)), attempt(() => p.intdiv([], 2))],
  "arith.builtins": () => [p.intdiv(-7, 2), p.intdiv("9", 2), p.floor("2.9"), p.ceil(-2.9), p.floor(null), p.ceil(2), p.PHP_INT_MIN, p.PHP_INT_MAX],
  // PHP byte evidence is checked separately: JS explicitly refuses the unsupported a9c3 byte string.
  string: () => [p.strrev("abc"), p.strrev(120), p.strtolower("AbCÉÇ"), p.strtolower(null), [...new TextEncoder().encode("é").reverse()].map((byte) => byte.toString(16)).join("")],
  "string.errors": () => [attempt(() => p.strrev([])), attempt(() => p.strtolower([]))],
  subclass: () => [p.is_subclass_of(new Child(), fqcn(Base)), p.is_subclass_of(fqcn(Child), fqcn(Base)), p.is_subclass_of(fqcn(Base), fqcn(Base)), p.is_subclass_of(fqcn(Child), fqcn(Base), false), p.is_subclass_of(fqcn(Status), "UnitEnum")],
  callables: () => [[new Child(), "METHOD"], [fqcn(Child), "STAT"], `${fqcn(Child)}::sTaT`, new Invokable(), (x: unknown) => p.plus(x, 1), [new Magic(), "missing"], [fqcn(Magic), "missing"]].map((f) => [p.is_callable(f), p.call_user_func_array(f, [5])]),
  callbacks: () => [p.array_map([new Child(), "METHOD"], [1, 2]), p.array_filter([0, 1], [new Invokable(), "__INVOKE"]), p.array_any([1], [fqcn(Child), "STAT"]), p.array_map(`${fqcn(Child)}::STAT`, [1])],
  "callback.errors": () => [attempt(() => p.array_map(["Missing", "m"], [1])), attempt(() => p.array_map([fqcn(Child), "method"], [1])), attempt(() => p.array_map([1, "x"], [1])), attempt(() => p.array_map(["x"], [1])), attempt(() => p.call_user_func_array(42, [])), attempt(() => p.call_user_func_array("strtoupper", 1))],
  append: () => { const input = new p.PhpArray<p.PhpKeyInput, unknown>([[5, "a"], ["x", "b"]]); input.delete(5); const ref = new p.Ref<unknown>(input); const value = { nested: [1] }; p.arrayAppend(ref, value); value.nested.push(2); return ref.value; },
  // The options wrapper preserves the recorded PHP named parameter for the ordering check.
  unpack: () => [p.call_user_func_array((a: unknown, b: unknown) => [a, b], new p.PhpArray<p.PhpKeyInput, unknown>([[5, "x"], [9, "y"]])), attempt(() => p.call_user_func_array(Object.assign((opts: { string: string }) => p.strtoupper(opts.string), { [Symbol.for("xaravel.php.options")]: true }), new p.PhpArray<p.PhpKeyInput, unknown>([["string", "x"], [0, "y"]])))],
  locale: () => runInFrame("unit", () => [p.setlocale(p.LC_ALL, "C"), p.setlocale(p.LC_ALL, "0"), p.setlocale(p.LC_ALL, "POSIX"), p.setlocale(p.LC_ALL, "xaravel-missing-locale"), p.setlocale(p.LC_ALL, "0"), p.strcoll("ab", "a")]),
  "generator.owned": () => { const log: string[] = []; for (const _ of p.Generator.owned(source(log))) break; return log; },
  "generator.held": () => { const log: string[] = []; const g = new p.Generator(source(log)); for (const _ of g) break; const before = [...log]; g.next(); const during = [g.current(), [...log]]; g.next(); return [before, during, log]; },
  "generator.exhaust": () => { const log: string[] = []; for (const _ of p.Generator.owned(source(log))) { /* consume */ } return log; },
  "pointer.copy": () => { const alias = { first: [1], last: [2] }; const a = new p.Ref<unknown>(alias); p.end(a); const copy = p.valueCopy(a.value) as typeof alias; p.arrayAppend(a, [3]); copy.first.push(4); return [p.key(a.value), p.key(copy), p.key(alias), a.value, copy, alias]; },
  "pointer.nested": () => { const nested = new p.Ref<unknown>({ x: 1, y: 2 }); p.end(nested); const a = { nest: nested.value }; const copy = p.valueCopy(a); return [p.key(copy.nest), p.key(a.nest)]; },
  "append.initialize": () => [null, false].map((initial) => { const a = new p.Ref<unknown>(initial); const v = { nested: [1] }; p.arrayAppend(a, v); v.nested.push(2); return a.value; }),
  "callables.magic-only": () => [p.is_callable(new Magic()), attempt(() => p.call_user_func_array(new Magic(), []))],
  "callables.late-static": () => [[fqcn(Child), "called"], `${fqcn(Child)}::called`, [new Child(), "called"]].map((f) => p.call_user_func_array(f, [])),
  "unpack.scalar": () => attempt(() => p.callUnpacked(() => 1, 1)),
  "unpack.traversable": () => {
    const f = Object.assign((...args: unknown[]) => args, { [Symbol.for("xaravel.php.options")]: true });
    return [p.callUnpacked(f, (function* () { yield p.keyed(8, "a"); yield p.keyed(8, "b"); })()), attempt(() => p.callUnpacked(f, (function* () { yield p.keyed("x", 1); yield p.keyed("x", 2); })())), attempt(() => p.callUnpacked(f, (function* () { yield p.keyed("x", 1); yield p.keyed(0, 2); })())), attempt(() => p.callUnpacked(f, (function* () { yield p.keyed(null, 1); })()))];
  },
  "uksort.large-ties": () => { const large = largeArray(); const a = new p.Ref<unknown>(large); p.ksort(a, p.SORT_NUMERIC); const b = new p.Ref<unknown>(large); p.uksort(b, (a: unknown, b: unknown) => p.strlen(a) - p.strlen(b)); return [a.value, b.value]; },
  "uksort.large-throw": () => { const a = new p.Ref<unknown>(largeArray()); const calls: unknown[] = []; const error = attempt(() => p.uksort(a, (a: unknown, b: unknown) => { calls.push([a, b]); if (calls.length === 12) throw new p.RuntimeException("large-stop"); return p.spaceship(a, b); })); return [error, a.value, calls]; },
  "locale.categories": () => runInFrame("unit", () => { p.setlocale(p.LC_ALL, "C"); p.setlocale(p.LC_NUMERIC, "POSIX"); return [p.LC_CTYPE, p.LC_NUMERIC, p.LC_TIME, p.LC_COLLATE, p.LC_MONETARY, p.LC_MESSAGES].map((cat) => p.setlocale(cat, "0")); }),
  "pointer.delete": () => { const a = new p.Ref<unknown>(new p.PhpArray([["a", 1], ["b", 2], ["c", 3]])); p.end(a); const v = a.value as p.PhpArray; v.delete("a"); const before = p.key(v); v.delete("c"); const after = p.key(v); p.arrayAppend(a, 4); return [before, after, p.key(a.value), a.value]; },
  "pointer.return-copy": () => [p.reset, p.end].map((fn) => { const original = [[1], [2]]; const ref = new p.Ref<unknown>(original); const value = fn(ref) as number[]; value.push(9); return [original, ref.value, value]; }),
  "locale.candidates": () => runInFrame("unit", () => [p.setlocale(p.LC_ALL, "C\0junk"), p.setlocale(p.LC_ALL, ["xaravel-missing", "C"]), p.setlocale(p.LC_ALL, "xaravel-missing", "C"), p.setlocale(p.LC_ALL, ["xaravel-missing"]), p.setlocale(p.LC_ALL, []), p.setlocale(p.LC_ALL, ["0"]), p.setlocale(p.LC_ALL, [true])]),
  "append.errors": () => ["", 1, true, new p.stdClass()].map((value) => attempt(() => p.arrayAppend(new p.Ref<unknown>(value), 1))),
  "unpack.float-key": () => attempt(() => p.callUnpacked(() => 1, (function* () { yield p.keyed(9007199254740992, 1); })())),
  "sort.numeric-keys": () => [p.ksort, p.krsort].flatMap((fn) => [p.SORT_REGULAR, p.SORT_NUMERIC, p.SORT_STRING].map((flag) => { const ref = new p.Ref<unknown>(new p.PhpArray<p.PhpKeyInput, unknown>([["02", "a"], [2, "b"], ["2.0", "c"], ["2e0", "d"], ["10", "e"], [-1, "f"]])); fn(ref, flag); return ref.value; })),
  "pointer.native-delete": () => { const ref = new p.Ref<unknown>({ a: 1, b: 2, c: 3 }); p.end(ref); const map = ref.value as Record<string, unknown>; delete map.a; const before = p.key(map); delete map.c; const after = p.key(map); p.arrayAppend(ref, 4); return [before, after, p.key(ref.value), ref.value]; },
  "unpack.negative-zero": () => attempt(() => p.callUnpacked(() => 1, (function* () { yield p.keyed(-0, 1); })())),
  "sort.nested-copy": () => [p.ksort, p.krsort, (ref: p.Ref<unknown>) => p.uksort(ref, p.strcmp), p.sort, p.rsort].map((sort) => { const original = { b: [2], a: [1] }; const ref = new p.Ref<unknown>(original); sort(ref); const first = p.arrayEntries(ref.value as object)[0]![1] as number[]; first.push(9); return [original, ref.value]; }),
  "locale.int-categories": () => runInFrame("unit", () => [p.LC_CTYPE, p.LC_NUMERIC, p.LC_TIME, p.LC_COLLATE, p.LC_MONETARY, p.LC_MESSAGES, p.LC_ALL].map((cat) => [p.setlocale(BigInt(cat), "C"), p.setlocale(BigInt(cat), "0")])),
  "locale.array-casts": () => runInFrame("unit", () => [p.setlocale(p.LC_ALL, [[]]), p.setlocale(p.LC_ALL, [[1], "C"]), attempt(() => p.setlocale(p.LC_ALL, [new p.stdClass()])), attempt(() => p.setlocale(p.LC_ALL, new p.stdClass())), attempt(() => p.setlocale(p.LC_ALL, "C", []))]),
  "arith.union-copy": () => {
    const a = new p.Ref<unknown>(new p.PhpArray<p.PhpKeyInput, unknown>([["a", [1]], ["b", [2]], [9, "gone"]]));
    (a.value as p.PhpArray).delete(9); p.end(a);
    const right = { c: [3] }; const sum = new p.Ref<unknown>(p.plus(a.value, right)); const before = p.key(sum.value);
    const entries = new Map(p.arrayEntries(sum.value as object)); (entries.get("a") as number[]).push(8); (entries.get("c") as number[]).push(9);
    p.arrayAppend(sum, 4); return [before, p.key(a.value), p.key(sum.value), a.value, right, sum.value];
  },
  "arith.union-invalid-pointer": () => [[[], { x: 1 }], [{ a: 1, b: 2 }, { c: 3 }]].map(([input, right]) => {
    const ref = new p.Ref<unknown>(input); p.end(ref); if (!Array.isArray(ref.value)) delete (ref.value as Record<string, unknown>).b;
    const sum = p.plus(ref.value, right); return [p.key(ref.value), p.key(sum), sum];
  }),
  "callables.unicode": () => ["K", "K", "k", "écho", "ÉCHO"].map((name) => [p.is_callable([new UnicodeMethods(), name]), attempt(() => p.call_user_func_array([new UnicodeMethods(), name], []))]),
  "callables.qualified": () => {
    const methods = ["instance", "stat", "inherited", `${fqcn(QualifiedBase)}::instance`, `${fqcn(QualifiedBase)}::stat`, `${fqcn(QualifiedBase)}::inherited`, `${fqcn(QualifiedMiddle)}::stat`, "self::instance", "self::stat", "parent::instance", "parent::stat", "parent::inherited", `${fqcn(Unrelated)}::stat`, "Missing::stat", `${fqcn(QualifiedBase)}::missing`, "::stat", `${fqcn(QualifiedBase)}::bad::stat`];
    return [new QualifiedChild(), fqcn(QualifiedChild)].flatMap((target) => methods.map((name) => [p.is_callable([target, name]), attempt(() => p.call_user_func_array([target, name], []))]))
      .concat([new QualifiedBase(), fqcn(QualifiedBase)].map((target) => [p.is_callable([target, "parent::stat"]), attempt(() => p.call_user_func_array([target, "parent::stat"], []))]));
  },
  "callables.qualified-strings": () => [`${fqcn(QualifiedChild)}::${fqcn(QualifiedBase)}::stat`, `${fqcn(QualifiedChild)}::parent::stat`, `${fqcn(QualifiedChild)}::self::stat`].map((callable) => [p.is_callable(callable), attempt(() => p.call_user_func_array(callable, []))]),
  "callables.qualified-options": () => {
    const args = new p.PhpArray<p.PhpKeyInput, unknown>([[0, 1], ["limit", 2]]);
    const forms = [new QualifiedChild(), fqcn(QualifiedChild)].flatMap((target) => [`${fqcn(QualifiedBase)}::optionsStatic`, "self::optionsStatic", "parent::optionsStatic"].map((name) => [target, name]))
      .concat([`${fqcn(QualifiedBase)}::options`, "self::options", "parent::options"].map((name) => [new QualifiedChild(), name]));
    return forms.map((callable) => {
      const value = p.call_user_func_array(callable, args);
      Assert.assertSame(encode(value), encode(p.callUnpacked(callable, args)));
      if (typeof callable[0] === "string") Assert.assertSame(encode(value), encode(p.callUnpacked([QualifiedChild, callable[1]], args)));
      return value;
    });
  },
  "arith.special": () => specialArithmetic().map((value) => [p.isFloat(value) ? "double" : "integer", Number.isNaN(Number(value)) ? "NAN" : Number(value) === Infinity ? "INF" : Number(value) === -Infinity ? "-INF" : Number(value) === 0 ? Object.is(Number(value), -0) ? "-0" : "+0" : Number(value)]),
  "arith.negative-zero-divisor": () => attempt(() => p.divide(1, -0)),
  "sort.builtin-error": () => [p.sort, p.rsort].map((sort) => {
    const ref = new p.Ref<unknown>(["z", "y", new p.stdClass(), "x", "a"]);
    const error = attempt(() => sort(ref, p.SORT_STRING)); return [error, ref.value];
  }),
  "locale.variadic-errors": () => runInFrame("unit", () => [attempt(() => p.setlocale(p.LC_ALL, "missing", new p.stdClass())), attempt(() => p.setlocale(p.LC_ALL, "missing", "missing", new p.stdClass())), p.setlocale(p.LC_ALL, "missing", ["C"]), p.setlocale(p.LC_ALL, [], "C")]),
  "subclass.custom": () => [p.is_subclass_of(new ContractImpl(), `${NS}\\CustomChild`), p.is_subclass_of(new ContractImpl(), `${NS}\\CustomParent`), p.is_subclass_of(ContractImpl, `${NS}\\CustomParent`), p.is_subclass_of(CustomChild, `${NS}\\CustomParent`), p.is_subclass_of(CustomParent, `${NS}\\CustomChild`), p.is_subclass_of(CustomChild, `${NS}\\CustomChild`), p.is_subclass_of(CustomChild, `${NS}\\CustomParent`, false)],
  // PHP's variadic target accepts named arguments; its JS mapping needs the options brand.
  "unpack.custom-traversable": () => [PairIterator, PairAggregate].flatMap((klass) => ([[[8, "a"], [3, "b"]], [[null, 1]], [["named", 1], [0, 2]]] as const).map((pairs) => attempt(() => p.callUnpacked(Object.assign((...values: unknown[]) => values, { [Symbol.for("xaravel.php.options")]: true }), new klass(pairs))))),
  "append.negative-index": () => ([[-5, false], [-5, true], [-1, true]] as const).map(([key, remove]) => {
    const array = new p.PhpArray([[key, "old"]]); if (remove) array.delete(key);
    const ref = new p.Ref<unknown>(array); p.arrayAppend(ref, "new"); p.arrayAppend(ref, "next"); return ref.value;
  }),
  "sort.large-values": () => [p.sort, p.rsort].map((sort) => {
    const input: Record<string, string> = {}; for (let index = 25; index >= 0; index--) input[`key${index}`] = ["A", "a", "B", "b"][index % 4]!;
    const ref = new p.Ref<unknown>(input); sort(ref, p.SORT_STRING | p.SORT_FLAG_CASE); return ref.value;
  }),
  "sort.pointer-reset": () => [p.ksort, p.krsort, (ref: p.Ref<unknown>) => p.uksort(ref, p.strcmp), p.sort, p.rsort].map((sort) => {
    const ref = new p.Ref<unknown>({ c: 3, a: 1, b: 2 }); p.end(ref); const alias = ref.value;
    sort(ref); return [p.key(ref.value), p.key(alias), ref.value, alias];
  }),
  registry: () => names.map((name) => { const f = PHP_FUNCTIONS[name]!; return [name, f.required, f.total, f.variadic, [...f.byRef]]; }),
};
function specialArithmetic(): unknown[] {
  return [p.plus(NaN, 1), p.plus(Infinity, -Infinity), p.plus(Infinity, 1), p.plus(-Infinity, -1), p.plus(-0, -0), p.plus(-0, p.float(0)), p.divide(NaN, 2), p.divide(Infinity, 2), p.divide(-Infinity, 2), p.divide(1, Infinity), p.divide(1, -Infinity), p.divide(-0, 2), p.divide(p.float(0), 2), p.floor(NaN), p.floor(Infinity), p.floor(-Infinity), p.floor(-0), p.floor(0), p.ceil(NaN), p.ceil(Infinity), p.ceil(-Infinity), p.ceil(-0), p.ceil(0), p.ceil(-0.2)];
}
function* source(log: string[]): globalThis.Generator<unknown, void, unknown> {
  try { log.push("start"); yield 1; log.push("later"); yield 2; } finally { log.push("finally"); }
}
for (const fn of ["ksort", "krsort", "sort", "rsort"] as const) for (const flag of [0, 1, 2, 5, 6, 10, 14, 99]) {
  cases[`sort.${fn}.${flag}`] = () => { const alias = mixed(); const a = new p.Ref<unknown>(alias); const result = p[fn](a, flag); return [result, a.value, alias]; };
}
function largeArray(): Record<string, number> { const a: Record<string, number> = {}; for (let i = 25; i >= 0; i--) a[`key${String(i).padStart(2, "0")}`] = i; return a; }
function check(prefixes: string[]): void {
  const lines = readFileSync(`${import.meta.dir}/php-chunk-sort-arith-callables.probe.txt`, "utf8").trim().split("\n");
  for (const line of lines) {
    const tab = line.indexOf("\t"); const label = line.slice(0, tab);
    if (prefixes.some((prefix) => label.startsWith(prefix))) Assert.assertSame(line.slice(tab + 1), encode(cases[label]!()), label);
  }
}
xaravelTest("XT-runtime-86", "PHP chunk, pointer and stable key/value sorts match executed PHP 8.5.11 evidence, including comparator mutation on exceptions", () => {
  check(["chunk", "pointer", "sort.", "uksort"]);
  for (const original of [Object.freeze([1, 2]), Object.preventExtensions({ a: 1, b: 2 }), Object.freeze(new p.PhpArray([["a", 1], ["b", 2]]))]) {
    const a = new p.Ref<unknown>(original); p.end(a); const copied = p.valueCopy(a.value);
    Assert.assertSame(p.arrayEntries(original)[1]![0], p.key(a.value)); Assert.assertSame(p.key(a.value), p.key(copied));
    Assert.assertSame(p.arrayEntries(original)[0]![0], p.key(original)); p.arrayAppend(a, 3); Assert.assertSame(p.key(copied), p.key(a.value));
    p.reset(a); Assert.assertSame(p.arrayEntries(original)[1]![0], p.key(copied));
  }
  const nested = { a: [1] }; const result = p.array_chunk(nested, 1); (result[0] as number[][])[0]!.push(2); Assert.assertSame('{"a":[1]}', encode(nested));
  Assert.assertSame(0, p.key(["a"]));
  for (const array of [[1, 2], { a: 1, b: 2 }] as const) {
    const ref = new p.Ref<unknown>(array); p.end(ref); Assert.assertSame(p.arrayEntries(array)[1]![0], p.key(ref.value)); p.reset(ref); Assert.assertSame(p.arrayEntries(array)[0]![0], p.key(ref.value));
  }
});
xaravelTest("XT-runtime-87", "Exact int64 arithmetic, numeric coercion, float markers, string bytes and Registry subclasses match PHP evidence", () => {
  check(["arith", "string", "subclass"]);
  for (const value of specialArithmetic()) Assert.assertTrue(p.isFloat(value));
  for (const index of [4, 10, 11, 16, 21, 23]) Assert.assertTrue(Object.is(Number(specialArithmetic()[index]), -0));
  for (const index of [5, 9, 12, 17, 22]) Assert.assertTrue(Object.is(Number(specialArithmetic()[index]), 0));
  Assert.assertTrue(Number.isNaN(Number(p.plus(NaN, 1))));
  Assert.assertTrue(Object.is(Number(p.divide(Infinity, 2)), Infinity));
  Assert.assertTrue(Object.is(Number(p.divide(-Infinity, 2)), -Infinity));
  for (const original of [[[1], [2]], { a: [1], b: [2] }, new p.PhpArray([["a", [1]], ["b", [2]]])]) {
    const ref = new p.Ref<unknown>(original); p.end(ref);
    const shared = new p.stdClass(); const right = { c: [3], shared };
    const union = p.plus(ref.value, right);
    Assert.assertSame(p.key(ref.value), p.key(union));
    const entries = new Map(p.arrayEntries(union as object));
    (entries.values().next().value as number[]).push(8); (entries.get("c") as number[]).push(9);
    Assert.assertSame("[1]", encode(p.arrayEntries(ref.value as object)[0]![1]));
    Assert.assertSame("[3]", encode(right.c)); Assert.assertTrue(entries.get("shared") === shared);
  }
  Assert.assertTrue(p.is_subclass_of(p.BackedEnum, "UnitEnum"));
  Assert.assertFalse(p.is_subclass_of(p.UnitEnum, "UnitEnum"));
  Assert.assertTrue(p.isFloat(p.floor(2))); Assert.assertTrue(p.isFloat(p.divide(p.float(6), 3)));
  let error: unknown = null; try { p.strrev("é"); } catch (caught) { error = caught; } Assert.assertTrue(error instanceof globalThis.TypeError); Assert.assertSame("strrev(): the result splits a UTF-8 sequence, which JS cannot hold", (error as Error).message);
});
xaravelTest("XT-runtime-88", "Every PHP callable form shares invocation, invalid callback diagnostics and append copies; named argument boundaries stay explicit", () => {
  check(["callable", "callback", "append", "unpack"]);
  Assert.assertSame('["x","y"]', encode(p.callUnpacked((a: unknown, b: unknown) => [a, b], new p.PhpArray<p.PhpKeyInput, unknown>([[8, "x"], [2, "y"]]))));
  let error: unknown = null; try { p.callUnpacked("strtoupper", { string: "abc" }); } catch (caught) { error = caught; } Assert.assertTrue(error instanceof globalThis.TypeError); Assert.assertTrue((error as Error).message.includes("without an options form"));
  const options = Object.assign((value: unknown, opts: unknown) => [value, opts], { [Symbol.for("xaravel.php.options")]: true });
  Assert.assertSame('[1,{"limit":2}]', encode(p.callUnpacked(options, new p.PhpArray<p.PhpKeyInput, unknown>([[0, 1], ["limit", 2]]))));
  const optionsArgs = new p.PhpArray<p.PhpKeyInput, unknown>([[0, 1], ["limit", 2]]);
  for (const callable of [[new Child(), "options"], [new Child(), "optionsStatic"], [Child, "optionsStatic"], [fqcn(Child), "optionsStatic"], `${fqcn(Child)}::optionsStatic`]) {
    const expected = Array.isArray(callable) && callable[1] === "options" ? [1, { limit: 2 }] : [fqcn(Child), 1, { limit: 2 }];
    Assert.assertSame(encode(expected), encode(p.callUnpacked(callable, optionsArgs)));
    Assert.assertSame(encode(expected), encode(p.call_user_func_array(callable, optionsArgs)));
  }
  Assert.assertSame("TypeError: call_user_func_array(): Argument #2 ($args) must be of type array, Generator given", attempt(() => p.call_user_func_array(options, new p.Generator((function* () { yield 1; })()))));
  class OptionsInvoker { __invoke(value: unknown, opts: unknown): unknown { return [value, opts]; } }
  Object.defineProperty(Object.getOwnPropertyDescriptor(OptionsInvoker.prototype, "__invoke")!.value as object, Symbol.for("xaravel.php.options"), { value: true });
  registerClass(`${NS}\\OptionsInvoker`, OptionsInvoker);
  for (const invoke of [p.callUnpacked, p.call_user_func_array]) {
    Assert.assertSame('[1,{"limit":2}]', encode(invoke(new OptionsInvoker(), optionsArgs)));
    const array = [1]; const object = new p.stdClass();
    const mutate = Object.assign((positional: number[], opts: { named: number[]; object: object }) => { positional.push(2); opts.named.push(3); return opts.object; }, { [Symbol.for("xaravel.php.options")]: true });
    const args = new p.PhpArray<p.PhpKeyInput, unknown>([[0, array], ["named", array], ["object", object]]);
    Assert.assertTrue(invoke(mutate, args) === object);
    Assert.assertSame("[1]", encode(array)); Assert.assertSame('[1]', encode(args.get("named")));
  }
  const ref = new p.Ref<unknown>(0); Assert.assertSame("Error: Cannot use a scalar value as an array", attempt(() => p.arrayAppend(ref, 1)));
  Assert.assertSame("Error: [] operator not supported for strings", attempt(() => p.arrayAppend(new p.Ref<unknown>(""), 1)));
  Assert.assertSame("Error: Cannot use object of type stdClass as array", attempt(() => p.arrayAppend(new p.Ref<unknown>(new p.stdClass()), 1)));
  const alias = { nested: [1] }; const held = new p.Ref<unknown>(alias); p.arrayAppend(held, 2); Assert.assertSame('{"nested":[1]}', encode(alias));
  const max = new p.Ref<unknown>(new p.PhpArray<p.PhpKeyInput, unknown>([[p.PHP_INT_MAX, 1]])); Assert.assertSame("Error: Cannot add element to the array as the next element is already occupied", attempt(() => p.arrayAppend(max, 2)));
});
xaravelTest("XT-runtime-89", "Locale slots isolate concurrent frames and owned generators clean up entries, keys and values on every exit without exhausting held sources", async () => {
  check(["locale", "generator"]);
  // Inspect the slot write as well as the canonical public result: C/POSIX cannot distinguish state by value.
  const slot = frameSlot<string[]>("xaravel.php.locale", () => Array<string>(6).fill("C"));
  const frameStates: string[][] = [];
  await interleave(["C", "POSIX"].map((locale) => async () => {
    const before = slot.get();
    Assert.assertSame("C", p.setlocale(p.LC_ALL, locale));
    const state = slot.get(); frameStates.push(state);
    Assert.assertTrue(state !== before, "public locale selection writes the frame slot");
    await Promise.resolve();
    Assert.assertTrue(slot.get() === state, "another frame cannot replace this frame's locale state");
    Assert.assertSame("C", p.setlocale(p.LC_ALL, null));
  }));
  Assert.assertTrue(frameStates[0] !== frameStates[1], "concurrent frames own separate locale vectors");
  runInFrame("unit", () => {
    const old = p.setlocale(p.LC_ALL, "0"); p.setlocale(p.LC_ALL, "POSIX"); Assert.assertSame("C", p.setlocale(p.LC_ALL, old)); Assert.assertSame(false, p.setlocale(999, "C")); Assert.assertSame("C", p.setlocale(p.LC_ALL, 0));
  });
  for (const traversal of ["entries", "keys", "values"] as const) {
    const heldLog: string[] = []; const held = new p.Generator(source(heldLog));
    const sequence = traversal === "entries" ? held.entries() : traversal === "keys" ? held.keys() : held;
    for (const _ of sequence) break;
    held.next(); Assert.assertSame(2, held.current()); Assert.assertSame('["start","later"]', encode(heldLog)); held.next();

    for (const exit of ["break", "throw", "return"] as const) {
      const log: string[] = []; const g = p.Generator.owned(source(log));
      const iterate = (): void => { const sequence = traversal === "entries" ? g.entries() : traversal === "keys" ? g.keys() : g; for (const _ of sequence) { if (exit === "throw") throw new p.RuntimeException("exit"); if (exit === "return") return; break; } };
      const caught = attempt(iterate); if (exit === "throw") Assert.assertSame("RuntimeException: exit", caught);
      Assert.assertSame('["start","finally"]', encode(log));
    }
  }
  const delegatedLog: string[] = []; const delegated = p.Generator.owned(source(delegatedLog));
  const outer = p.Generator.owned((function* () { yield* p.yieldFrom(delegated); })()); for (const _ of outer) break; Assert.assertSame('["start","finally"]', encode(delegatedLog));
  const innerLog: string[] = []; const inner = new p.Generator(source(innerLog));
  const wrapping = p.Generator.owned((function* () { yield* p.yieldFrom(inner); })());
  for (const _ of wrapping) break;
  Assert.assertSame('["start"]', encode(innerLog)); inner.next(); Assert.assertSame(2, inner.current());
  Assert.assertSame('["start","later"]', encode(innerLog)); inner.next();
  const forceLog: string[] = [];
  const yielding = p.Generator.owned((function* () { try { yield 1; } finally { forceLog.push("before"); yield 2; forceLog.push("after"); } })());
  Assert.assertSame("Error: Cannot yield from finally in a force-closed generator", attempt(() => { for (const _ of yielding) break; }));
  Assert.assertSame('["before"]', encode(forceLog));
  // DIV-9.16: JavaScript keeps a loop-body exception when closing finally also throws.
  const competingLog: string[] = [];
  const bodyError = new p.RuntimeException("body");
  const closeError = new p.RuntimeException("close");
  const throwClose = (): never => { throw closeError; };
  const competing = p.Generator.owned((function* () { try { yield 1; } finally { competingLog.push("finally"); throwClose(); } })());
  let competingCaught: unknown = null;
  try { for (const _ of competing) throw bodyError; } catch (error) { competingCaught = error; }
  Assert.assertTrue(competingCaught === bodyError); // adapted:DIV-9.16
  Assert.assertSame('["finally"]', encode(competingLog)); Assert.assertFalse(competing.valid());
  const sourceError = new p.RuntimeException("source");
  const sourceLog: string[] = [];
  const throwing = p.Generator.owned((function* () { try { yield 1; throw sourceError; } finally { sourceLog.push("finally"); } })());
  let sourceCaught: unknown = null;
  try { for (const _ of throwing) { /* consume */ } } catch (error) { sourceCaught = error; }
  Assert.assertTrue(sourceCaught === sourceError); Assert.assertFalse(throwing.valid()); Assert.assertSame('["finally"]', encode(sourceLog));
  for (const owned of [false, true]) {
    const cleanupLog: string[] = [];
    const raw = (function* () { try { yield p.keyed(null, 1); yield 2; } finally { cleanupLog.push("finally"); } })();
    const unpacked = owned ? p.Generator.owned(raw) : new p.Generator(raw);
    Assert.assertSame("Error: Keys must be of type int|string during argument unpacking", attempt(() => p.callUnpacked(() => 1, unpacked)));
    Assert.assertSame(owned ? '["finally"]' : '[]', encode(cleanupLog));
    Assert.assertSame(!owned, unpacked.valid());
    if (!owned) { unpacked.next(); Assert.assertSame(2, unpacked.current()); unpacked.next(); }
    Assert.assertSame('["finally"]', encode(cleanupLog));
  }
  const log: string[] = [];
  const failFinally = (): never => { throw new p.RuntimeException("finally"); };
  const g = p.Generator.owned((function* () { try { yield 1; yield 2; } finally { log.push("finally"); failFinally(); } })());
  Assert.assertSame("RuntimeException: finally", attempt(() => { for (const _ of g) break; })); Assert.assertSame('["finally"]', encode(log));
});
xaravelTest("XT-runtime-90", "Every newly exported operation resolves from PHP and root entrypoints with PHP reflection metadata and every evidence label is executed", () => {
  check([""]);
  for (const name of [...names, "plus", "divide", "arrayAppend", "callUnpacked", "resolveCallable", "PHP_INT_MAX", "PHP_INT_MIN", "LC_ALL", "LC_CTYPE", "LC_NUMERIC", "LC_TIME", "LC_COLLATE", "LC_MONETARY", "LC_MESSAGES"] as const) Assert.assertSame(p[name], root[name], name);
  for (const name of names) Assert.assertSame(PHP_FUNCTIONS[name]!.fn, p[name], name);
  const labels = readFileSync(`${import.meta.dir}/php-chunk-sort-arith-callables.probe.txt`, "utf8").trim().split("\n").map((line) => line.split("\t")[0]!).sort(); Assert.assertSame(labels, Object.keys(cases).sort());
});
