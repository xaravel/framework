// Internal helpers the codecs share (Stories 9.7 and 9.8): PHP's property-name mangling, a class's PHP property table
// (ESC-9.7-1 part 1), an object's properties as `serialize()` and `json_encode` read them, and the UTF-8 checks. The
// package does not export this module. It calls the Registry's `fqcn` when a class with a PHP property table is first
// read (to mangle its private properties) and on error paths, never at load time.
import { fqcn } from "../registry/registry";

/** A lone (unpaired) surrogate, which has no UTF-8 form. */
export const LONE_SURROGATE = /\p{Cs}/u;

/** The UTF-8 encoder of the codec. */
export const utf8 = new TextEncoder();

/** The JS property a serialized property name stands for: `\0*\0x` and `\0Class\0x` are `x`; any other name as it is. */
export function unmangle(name: string): string {
  if (name.startsWith("\0")) {
    const end = name.indexOf("\0", 1);
    if (end !== -1) {
      return name.slice(end + 1);
    }
  }
  return name;
}

/** One property of a class's PHP property table (ESC-9.7-1 part 1), as a ported class declares it. */
interface PhpPropertyDeclaration {
  readonly name: string;
  readonly visibility: "public" | "protected" | "private";
  readonly default?: unknown;
}

/** A declared property of an object: its serialized (mangled) name, its JS property and its declared default. */
export interface PhpPropertySlot {
  /** `name` (public), `\0*\0name` (protected) or `\0<declaring FQCN>\0name` (private). */
  readonly key: string;
  /** The JS property that holds it. */
  readonly name: string;
  readonly default: unknown;
}

const PHP_PROPERTIES = Symbol.for("xaravel.php.properties");
const PHP_PROPS = Symbol.for("xaravel.php.props");
const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_FLOAT = Symbol.for("xaravel.php.float");

/** `propertyTable`'s result per class (null included): a class's table is static, so it is built once. */
const tables = new WeakMap<object, PhpPropertySlot[] | null>();

/**
 * The PHP property table of `klass` and its parents (ESC-9.7-1 part 1), in PHP's order: a parent's properties first,
 * a public or protected property a child redeclares keeping the parent's position, then the child's new ones. Each
 * class's own static `[Symbol.for('xaravel.php.properties')]` lists `{ name, visibility, default }` in declaration
 * order; a private property is mangled with the FQCN of the class whose table lists it. Null when no class in the
 * chain declares a table, which keeps the public-only behaviour. Throws a `TypeError` naming the class and property
 * when a private property shares its name with another declared property, which one JS property cannot hold.
 */
export function propertyTable(klass: object): PhpPropertySlot[] | null {
  let table = tables.get(klass);
  if (table === undefined) {
    table = buildPropertyTable(klass);
    tables.set(klass, table);
  }
  return table;
}

function buildPropertyTable(klass: object): PhpPropertySlot[] | null {
  const chain: object[] = [];
  for (let current: unknown = klass; typeof current === "function" && current !== Function.prototype; current = Object.getPrototypeOf(current)) {
    if (Object.hasOwn(current, PHP_PROPERTIES)) {
      chain.unshift(current);
    }
  }
  if (chain.length === 0) {
    return null;
  }
  const slots: PhpPropertySlot[] = [];
  // The slot of each public or protected name, which a child's redeclaration replaces in place.
  const shared = new Map<string, number>();
  for (const declaring of chain) {
    const table: unknown = (declaring as Record<symbol, unknown>)[PHP_PROPERTIES];
    if (!Array.isArray(table)) {
      throw new TypeError(`${fqcn(declaring)}: [Symbol.for('xaravel.php.properties')] must be a list of { name, visibility, default }`);
    }
    for (const entry of table as PhpPropertyDeclaration[]) {
      const value = entry.default ?? null;
      if (entry.visibility === "private") {
        slots.push({ key: `\0${fqcn(declaring)}\0${entry.name}`, name: entry.name, default: value });
        continue;
      }
      const slot = { key: entry.visibility === "protected" ? `\0*\0${entry.name}` : entry.name, name: entry.name, default: value };
      const index = shared.get(entry.name);
      if (index === undefined) {
        shared.set(entry.name, slots.length);
        slots.push(slot);
      } else {
        slots[index] = slot;
      }
    }
  }
  // One JS property cannot hold two PHP slots. Public and protected slots share a name in place, so a repeated name
  // always involves a private slot, whose value would be lost.
  const names = new Set<string>();
  for (const slot of slots) {
    if (names.has(slot.name)) {
      throw new TypeError(`${fqcn(klass)}: the PHP property table declares more than one property $${slot.name} (a private one included), which one JS property cannot hold`);
    }
    names.add(slot.name);
  }
  return slots;
}

/**
 * The properties of an object whose class declares a PHP property table, by serialized name, in PHP's order: each
 * declared one (its JS value, or its default when the object has no such own property), then the object's other own
 * enumerable string keys as dynamic public properties.
 */
export function declaredProps(o: object, table: readonly PhpPropertySlot[]): Map<string, unknown> {
  const record = o as Record<string, unknown>;
  const props = new Map<string, unknown>();
  const declared = new Set<string>();
  for (const slot of table) {
    declared.add(slot.name);
    props.set(slot.key, Object.hasOwn(o, slot.name) ? (record[slot.name] ?? null) : slot.default);
  }
  for (const key of Object.keys(o)) {
    if (!declared.has(key) && !props.has(key)) {
      props.set(key, record[key] ?? null);
    }
  }
  return props;
}

/** The PHP property table of `o`'s class (see `propertyTable`), or null when it has none or no class. */
export function objectTable(o: object): PhpPropertySlot[] | null {
  const prototype: unknown = Object.getPrototypeOf(o);
  if (prototype === null) {
    return null;
  }
  const klass: unknown = Reflect.get(prototype as object, "constructor");
  return typeof klass === "function" ? propertyTable(klass) : null;
}

/**
 * The `[name, value]` properties of an object as PHP's `(array)` cast lists them, the reader `phpSerialize` and
 * `jsonEncode` share: its class's PHP property table and dynamic keys (`declaredProps`, protected and private names
 * mangled), else its `[Symbol.for('xaravel.php.props')]()` (a PHP array; its keys as strings), else its own enumerable
 * string keys. A value `undefined` reads as `null`.
 */
export function objectProps(o: object): [string, unknown][] {
  const table = objectTable(o);
  if (table !== null) {
    return [...declaredProps(o, table)];
  }
  const record = o as Record<string | symbol, unknown>;
  const props: unknown = record[PHP_PROPS];
  if (typeof props === "function") {
    return propsEntries((props as () => unknown).call(o));
  }
  return Object.keys(o).map((key) => [key, record[key] ?? null]);
}

/**
 * The `[key as string, value]` pairs of the PHP array the props protocol returned (a list, a branded array or a plain
 * object), or none for any other value. Keys are written as strings, so they need no normalisation.
 */
function propsEntries(data: unknown): [string, unknown][] {
  if (typeof data !== "object" || data === null) {
    return [];
  }
  if (Array.isArray(data)) {
    const entries: [string, unknown][] = [];
    for (let index = 0; index < data.length; index++) {
      entries.push([String(index), (data[index] as unknown) ?? null]);
    }
    return entries;
  }
  const record = data as Record<string | symbol, unknown>;
  if (record[PHP_FLOAT] === true) {
    return [];
  }
  if (record[PHP_ARRAY] === true) {
    return [...(data as Iterable<readonly [unknown, unknown]>)].map(([key, value]) => [String(key), value ?? null]);
  }
  const prototype: unknown = Object.getPrototypeOf(data);
  if (prototype !== Object.prototype && prototype !== null) {
    return [];
  }
  return Object.keys(data).map((key) => [key, record[key] ?? null]);
}
