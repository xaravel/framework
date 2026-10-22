// Internal helpers the codec's two halves share (Story 9.7): PHP's property-name mangling, a class's PHP property
// table (ESC-9.7-1 part 1) and the UTF-8 checks. The package does not export this module.
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
