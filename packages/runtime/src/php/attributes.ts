// PHP attributes on a class (DIV-12.15). `#[X(args)]` is written `@attribute(X, ...args)`, a TC39 class decorator
// that adds `{ class: X, args }` to the class's own attribute list, under `Symbol.for('xaravel.attributes')` in its
// `Symbol.metadata` object. TC39 applies a class's decorators bottom-up (Bun 1.4.3), so each one prepends, which
// keeps source order. The list is the class's own: a subclass's metadata inherits its parent's, so the reader asks
// for an own `Symbol.metadata` object and an own list, never the parent's. `ReflectionClass.getAttributes()` reads it.
import { METADATA, type MetadataHolder } from "../metadata/inject";

/** The key the list is stored under in a `Symbol.metadata` object. */
const ATTRIBUTES = Symbol.for("xaravel.attributes");

/** One `@attribute(X, ...args)`: the attribute class and its arguments, frozen. Internal. */
export interface AttributeEntry {
  readonly class: abstract new (...args: never[]) => unknown;
  readonly args: readonly unknown[];
}

/** What `attribute(X, ...args)` returns: a TC39 class decorator. */
export type AttributeDecorator = (value: unknown, context: DecoratorContext) => void;

/** A frozen entry for `klass` with `args`. */
function entryOf(klass: unknown, args: readonly unknown[]): AttributeEntry {
  if (typeof klass !== "function") {
    throw new TypeError(`attribute(): the attribute must be a class, not ${klass === null ? "null" : typeof klass} (DIV-12.15)`);
  }
  return Object.freeze({ class: klass as AttributeEntry["class"], args: Object.freeze([...args]) });
}

/** `holder`'s own list with `entry` first. */
function prepend(holder: MetadataHolder, entry: AttributeEntry): void {
  const own = Object.hasOwn(holder, ATTRIBUTES) ? (holder[ATTRIBUTES] as readonly AttributeEntry[]) : [];
  Object.defineProperty(holder, ATTRIBUTES, { value: Object.freeze([entry, ...own]), enumerable: true, writable: true, configurable: true });
}

/**
 * PHP's `#[X(...args)]` on a class (DIV-12.15): a TC39 class decorator adding `X` and `args` to the class's own
 * attribute list, in source order. `X` is built only when `ReflectionAttribute.newInstance()` is called. Throws
 * `TypeError` for an `X` that is not a class, or a target that is not a class.
 */
export function attribute(klass: abstract new (...args: never[]) => unknown, ...args: unknown[]): AttributeDecorator {
  const entry = entryOf(klass, args);
  return (_value: unknown, context: DecoratorContext): void => {
    if (typeof context !== "object" || context === null || context.kind !== "class") {
      throw new TypeError(`attribute(): a ${typeof context === "object" && context !== null ? String(context.kind) : "non-decorator"} cannot take a PHP attribute; use it on a class (DIV-12.15)`);
    }
    prepend(context.metadata as MetadataHolder, entry);
  };
}

/** `klass`'s own attribute list, in source order; empty when it declares none. Internal. */
export function ownAttributes(klass: unknown): readonly AttributeEntry[] {
  if (typeof klass !== "function" || !Object.hasOwn(klass, METADATA)) {
    return [];
  }
  const metadata: unknown = (klass as unknown as MetadataHolder)[METADATA];
  if (typeof metadata !== "object" || metadata === null || !Object.hasOwn(metadata, ATTRIBUTES)) {
    return [];
  }
  return (metadata as MetadataHolder)[ATTRIBUTES] as readonly AttributeEntry[];
}

/**
 * Declares `attributeClass(...args)` on `klass` without a decorator, for a class that names itself (`Attribute`'s own
 * `#[Attribute(Attribute::TARGET_CLASS)]`, which a decorator could not reference). Internal.
 */
export function declareOwnAttribute(klass: abstract new (...args: never[]) => unknown, attributeClass: abstract new (...args: never[]) => unknown, args: readonly unknown[]): void {
  let metadata: unknown = Object.hasOwn(klass, METADATA) ? (klass as unknown as MetadataHolder)[METADATA] : null;
  if (typeof metadata !== "object" || metadata === null) {
    const inherited: unknown = (klass as unknown as MetadataHolder)[METADATA];
    metadata = Object.create(typeof inherited === "object" ? inherited : null) as MetadataHolder;
    Object.defineProperty(klass, METADATA, { value: metadata, enumerable: false, writable: true, configurable: true });
  }
  prepend(metadata as MetadataHolder, entryOf(attributeClass, args));
}
