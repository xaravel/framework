// PHP's `unserialize()` over the AD-9 value model (Story 9.7, AD-23.1), mirroring PHP 8.5's `var_unserializer.re`. It
// reads the UTF-8 bytes of the payload, so `s:` lengths count bytes as PHP's do.
//
// - Values: `N;`, `b:0;`/`b:1;`, `i:` (an int beyond ±(2^53 − 1) a `bigint`, beyond int64 saturating at
//   `PHP_INT_MAX`/`PHP_INT_MIN` as `parse_iv` does), `d:` (an integral value marked with `float()`, so it re-serializes
//   as `d:`), `s:` and the deprecated escaped `S:`, `a:` in AD-9 form (a list an `Array`, all string keys a plain
//   object, else a `PhpArray`), `O:` by the Class Registry, `r:` (an object back-reference) and `R:` (PHP's reference,
//   read as the value it refers to: AD-9 has no references).
// - Objects: the class is resolved through the Registry (case-insensitive, test-frame classes included). One that is
//   not registered, or not allowed by `allowedClasses` (`true`, `false`, or a list of names compared
//   case-insensitively), is a `__PHP_Incomplete_Class` holding the raw entries, and no hook runs on it. Any other is
//   created with `Object.create(Class.prototype)`, no constructor running; its data goes to `__unserialize(data)`, or
//   else each property is defined under its unmangled name (`\0*\0x` and `\0Class\0x` are `x`) and `__wakeup()` runs.
//   As PHP delays them, every `__unserialize` and `__wakeup` runs after the whole parse, in the order the objects'
//   payloads complete.
// - Back-references are numbered as PHP numbers them: every value but an `R:` takes the next slot, keys and the array
//   given to `__unserialize` take none.
// - A malformed payload returns `false`, as PHP does: a truncated value, a wrong count, `b:2;`, an `r:` to a non-object
//   or out of range, bad float text, nesting beyond `unserialize_max_depth` (4096), an enum (`E:`) or `Serializable`
//   (`C:`) payload, which AD-9 cannot hold. Trailing data after a complete value is ignored (PHP warns and returns the
//   value). A string PHP accepts but JS cannot hold (invalid UTF-8) throws a `TypeError`.
import { resolveClass, type RegisteredClass } from "../registry/registry";
import { __PHP_Incomplete_Class } from "./__PHP_Incomplete_Class";
import { float } from "./PhpFloat";
import { arrayFromEntries, type PhpArrayKey } from "./PhpArray";
import { INT_MAX, INT_MIN, intKey } from "./phpInt";

/** PHP's `unserialize_max_depth` default. */
const MAX_DEPTH = 4096;
/** A lone (unpaired) surrogate, which has no UTF-8 form. */
const LONE_SURROGATE = /\p{Cs}/u;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** The options of `phpUnserialize`: PHP's `['allowed_classes' => …]`. */
export interface PhpUnserializeOptions {
  /** `true` (the default) allows every class, `false` none, a list the named ones (case-insensitive). */
  allowedClasses?: boolean | readonly string[];
}

/** A malformed payload: `phpUnserialize` returns `false`. */
class Malformed extends Error {}

/** A slot whose array is still being read, which no back-reference can use yet. */
const PENDING = Symbol("pending");

interface Delayed {
  readonly object: object;
  readonly data: unknown;
  readonly hook: "__unserialize" | "__wakeup";
}

const C_0 = 0x30;
const C_9 = 0x39;

class Reader {
  #pos = 0;
  #depth = 0;
  readonly #slots: unknown[] = [];
  /** The objects read so far, which an `r:` may refer to. */
  readonly #objects = new WeakSet<object>();
  readonly #delayed: Delayed[] = [];

  constructor(
    private readonly bytes: Uint8Array,
    private readonly allowed: (name: string) => boolean,
  ) {}

  /** The whole value; trailing data is ignored. */
  read(): unknown {
    const value = this.#value();
    for (const { object, data, hook } of this.#delayed) {
      (Reflect.get(object, hook) as (data?: unknown) => unknown).call(object, ...(hook === "__unserialize" ? [data] : []));
    }
    return value;
  }

  #fail(): never {
    throw new Malformed();
  }

  #peek(offset = 0): number {
    return this.bytes[this.#pos + offset] ?? -1;
  }

  #expect(text: string): void {
    for (let index = 0; index < text.length; index++) {
      if (this.#peek(index) !== text.charCodeAt(index)) {
        this.#fail();
      }
    }
    this.#pos += text.length;
  }

  /** `[0-9]+`, as a bigint. */
  #digits(): bigint {
    const start = this.#pos;
    while (this.#peek() >= C_0 && this.#peek() <= C_9) {
      this.#pos++;
    }
    if (this.#pos === start) {
      this.#fail();
    }
    return BigInt(this.#ascii(start, this.#pos));
  }

  /** An unsigned count or length that fits the remaining payload. */
  #count(): number {
    const value = this.#digits();
    if (value > BigInt(this.bytes.length)) {
      this.#fail();
    }
    return Number(value);
  }

  #ascii(start: number, end: number): string {
    let out = "";
    for (let index = start; index < end; index++) {
      out += String.fromCharCode(this.bytes[index]!);
    }
    return out;
  }

  #text(start: number, end: number): string {
    try {
      return decoder.decode(this.bytes.subarray(start, end));
    } catch {
      throw new TypeError("phpUnserialize(): the payload holds a string that is not valid UTF-8, which JS cannot hold");
    }
  }

  /** Reserves the next back-reference slot (`var_push`), returning its index. */
  #reserve(): number {
    this.#slots.push(PENDING);
    return this.#slots.length - 1;
  }

  /** A key: `i:`, `s:` or `S:` only, taking no slot. */
  #key(): PhpArrayKey {
    switch (this.#peek()) {
      case 0x69: // i
        return this.#int();
      case 0x73: // s
        return this.#string();
      case 0x53: // S
        return this.#escapedString();
      default:
        return this.#fail();
    }
  }

  #value(): unknown {
    const marker = this.#peek();
    if (marker === 0x52) {
      // R: reads a slot without taking one.
      return this.#backReference(false);
    }
    const slot = this.#reserve();
    let value: unknown;
    switch (marker) {
      case 0x4e: // N
        this.#expect("N;");
        value = null;
        break;
      case 0x62: {
        // b
        this.#expect("b:");
        const bit = this.#peek();
        if (bit !== 0x30 && bit !== 0x31) {
          this.#fail();
        }
        this.#pos++;
        this.#expect(";");
        value = bit === 0x31;
        break;
      }
      case 0x69: // i
        value = this.#int();
        break;
      case 0x64: // d
        value = this.#float();
        break;
      case 0x73: // s
        value = this.#string();
        break;
      case 0x53: // S
        value = this.#escapedString();
        break;
      case 0x61: // a
        value = this.#array();
        break;
      case 0x4f: // O
        return this.#object(slot);
      case 0x72: // r
        value = this.#backReference(true);
        break;
      default:
        // E: (enum), C: (Serializable) and anything else.
        return this.#fail();
    }
    this.#slots[slot] = value;
    return value;
  }

  #int(): number | bigint {
    this.#expect("i:");
    let negative = false;
    const sign = this.#peek();
    if (sign === 0x2b || sign === 0x2d) {
      negative = sign === 0x2d;
      this.#pos++;
    }
    let value = this.#digits();
    this.#expect(";");
    value = negative ? -value : value;
    // parse_iv saturates out of range ("Numerical result out of range").
    if (value > INT_MAX) {
      value = INT_MAX;
    } else if (value < INT_MIN) {
      value = INT_MIN;
    }
    return intKey(value);
  }

  #float(): unknown {
    this.#expect("d:");
    const start = this.#pos;
    const end = this.bytes.indexOf(0x3b, start);
    if (end === -1) {
      this.#fail();
    }
    const text = this.#ascii(start, end);
    this.#pos = end + 1;
    switch (text) {
      case "NAN":
        return NaN;
      case "INF":
        return Infinity;
      case "-INF":
        return -Infinity;
      default:
        break;
    }
    // iv | nv | nvexp of var_unserializer.re.
    if (!/^[+-]?(?:\d+|\d*\.\d+|\d+\.\d*)(?:[eE][+-]?\d+)?$/.test(text)) {
      this.#fail();
    }
    const value = Number(text);
    return Number.isSafeInteger(value) && !Object.is(value, -0) ? float(value) : value;
  }

  #string(): string {
    this.#expect("s:");
    const length = this.#count();
    this.#expect(':"');
    const start = this.#pos;
    if (start + length > this.bytes.length) {
      this.#fail();
    }
    this.#pos += length;
    this.#expect('";');
    return this.#text(start, start + length);
  }

  /** `S:<n>:"…";`, where `\xx` is the byte of hex `xx`. */
  #escapedString(): string {
    this.#expect("S:");
    const length = this.#count();
    this.#expect(':"');
    const out = new Uint8Array(length);
    for (let index = 0; index < length; index++) {
      const byte = this.#peek();
      if (byte === -1) {
        this.#fail();
      }
      if (byte === 0x5c) {
        const hex = this.#ascii(this.#pos + 1, this.#pos + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
          this.#fail();
        }
        out[index] = Number.parseInt(hex, 16);
        this.#pos += 3;
      } else {
        out[index] = byte;
        this.#pos++;
      }
    }
    this.#expect('";');
    try {
      return decoder.decode(out);
    } catch {
      throw new TypeError("phpUnserialize(): the payload holds a string that is not valid UTF-8, which JS cannot hold");
    }
  }

  #enter(): void {
    this.#depth++;
    if (this.#depth > MAX_DEPTH) {
      this.#fail();
    }
  }

  /** `<n>:{` then `n` key/value pairs then `}`, the values taking slots. */
  #entries(): [PhpArrayKey, unknown][] {
    const count = this.#count();
    this.#expect(":{");
    this.#enter();
    const entries: [PhpArrayKey, unknown][] = [];
    for (let index = 0; index < count; index++) {
      const key = this.#key();
      entries.push([key, this.#value()]);
    }
    this.#expect("}");
    this.#depth--;
    return entries;
  }

  #array(): unknown {
    this.#expect("a:");
    return arrayFromEntries(this.#entries());
  }

  #object(slot: number): unknown {
    this.#expect("O:");
    const length = this.#count();
    this.#expect(':"');
    const start = this.#pos;
    if (start + length > this.bytes.length) {
      this.#fail();
    }
    for (let index = start; index < start + length; index++) {
      // zend_is_valid_class_name: alphanumerics, `_`, `\` and bytes from 0x80.
      const byte = this.bytes[index]!;
      if (!(byte >= 0x80 || byte === 0x5f || byte === 0x5c || (byte >= C_0 && byte <= C_9) || (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a))) {
        this.#fail();
      }
    }
    if (length === 0) {
      this.#fail();
    }
    const name = this.#text(start, start + length);
    this.#pos += length;
    this.#expect('":');
    const klass = this.allowed(name) ? findClass(name) : null;
    if (klass === null || klass === (__PHP_Incomplete_Class as unknown)) {
      const incomplete = new __PHP_Incomplete_Class(name);
      this.#slots[slot] = incomplete;
      this.#objects.add(incomplete);
      for (const [key, value] of this.#entries()) {
        incomplete.pushEntry(String(key), value);
      }
      return incomplete;
    }
    const object = Object.create((klass as { prototype: object }).prototype) as object;
    this.#slots[slot] = object;
    this.#objects.add(object);
    const entries = this.#entries();
    if (typeof Reflect.get(object, "__unserialize") === "function") {
      this.#delayed.push({ object, data: arrayFromEntries(entries), hook: "__unserialize" });
      return object;
    }
    for (const [key, value] of entries) {
      Object.defineProperty(object, unmangle(String(key)), { value, enumerable: true, writable: true, configurable: true });
    }
    if (typeof Reflect.get(object, "__wakeup") === "function") {
      this.#delayed.push({ object, data: null, hook: "__wakeup" });
    }
    return object;
  }

  /** `r:<n>;` (an object only) or `R:<n>;`. */
  #backReference(object: boolean): unknown {
    this.#expect(object ? "r:" : "R:");
    const id = this.#digits();
    this.#expect(";");
    if (id < 1n || id > BigInt(this.#slots.length)) {
      this.#fail();
    }
    const value = this.#slots[Number(id) - 1];
    if (value === PENDING || (object && !this.#objects.has(value as object))) {
      this.#fail();
    }
    return value;
  }
}

/** The registered class `name` names, or null. */
function findClass(name: string): RegisteredClass | null {
  try {
    return resolveClass(name);
  } catch {
    return null;
  }
}

/** The JS property a serialized property name stands for: `\0*\0x` and `\0Class\0x` are `x`. */
function unmangle(name: string): string {
  if (name.startsWith("\0")) {
    const end = name.indexOf("\0", 1);
    if (end !== -1) {
      return name.slice(end + 1);
    }
  }
  return name;
}

function allowedBy(option: PhpUnserializeOptions["allowedClasses"]): (name: string) => boolean {
  if (option === undefined || option === true) {
    return () => true;
  }
  if (option === false) {
    return () => false;
  }
  if (!Array.isArray(option)) {
    throw new TypeError("phpUnserialize(): Option \"allowed_classes\" must be an array or of type bool");
  }
  const names = new Set<string>();
  for (const name of option as readonly unknown[]) {
    if (typeof name !== "string") {
      throw new TypeError("phpUnserialize(): Option \"allowed_classes\" must be an array of class names");
    }
    names.add(name.toLowerCase());
  }
  return (name) => names.has(name.toLowerCase());
}

/**
 * PHP's `unserialize($data, ['allowed_classes' => …])`: the value `data` encodes, in the AD-9 value model, or `false`
 * for a malformed payload (as PHP returns it, so `b:0;` and a malformed payload read alike). `undefined` and `null`
 * read as `""`, which is malformed. Throws a `TypeError` for a payload with a lone surrogate or a string that is not
 * valid UTF-8, and whatever an object's `__unserialize` or `__wakeup` throws.
 */
export function phpUnserialize(data: string | null | undefined, { allowedClasses = true }: PhpUnserializeOptions = {}): unknown {
  const allowed = allowedBy(allowedClasses);
  const text = data ?? "";
  if (typeof text !== "string") {
    throw new TypeError("phpUnserialize(): Argument #1 ($data) must be of type string");
  }
  if (LONE_SURROGATE.test(text)) {
    throw new TypeError("phpUnserialize(): the payload holds a lone surrogate, which has no UTF-8 form");
  }
  try {
    return new Reader(encoder.encode(text), allowed).read();
  } catch (error) {
    if (error instanceof Malformed) {
      return false;
    }
    throw error;
  }
}
