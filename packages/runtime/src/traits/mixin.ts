// PHP traits (AD-26 Traits row, Story 9.9): `mixin`, `classUsesRecursive`, `bootTraits`, `initializeTraits` and
// `clearBootedTraits`.
//
// A trait is a registered class: `class SoftDeletes { static bootSoftDeletes() {} initializeSoftDeletes() {} }`, then
// `registerClass('Illuminate\\Database\\Eloquent\\SoftDeletes', SoftDeletes)`. A trait that uses traits is
// `class HasA extends mixin(null, Inner) { … }`. `class X extends mixin(Base, A, B)` composes A and B into a new
// class (a "layer") between X and Base, so members resolve as PHP's do: X's own, then the traits', then Base's.
//
// - Prototype members (methods and accessors, string and symbol keys) and static members (string keys) are copied
//   onto the layer; static data is copied with `valueCopy`, so each using class has its own, as PHP gives each class
//   its own trait statics.
// - Instance property defaults are the own enumerable properties of a trait instance, read once; the layer's
//   constructor assigns a copy of each after `super(...args)` returns, unless the instance already owns the key.
// - A member reached twice from the same declaring trait (a diamond) is applied once. A method two different traits
//   declare throws PHP's collision message when it is called, so a class that overrides it resolves the collision; a
//   property two traits declare with different defaults makes `mixin` throw.
// - `classUsesRecursive` is Laravel's `class_uses_recursive` (`Support/helpers.php`). `bootTraits` /
//   `initializeTraits` are Model's (`Database/Eloquent/Model.php` `bootTraits` / `initializeTraits`): boot methods in
//   PHP's method-table order, once per class; initializers once per call, the host calling it once per instance.
//
// The booted record is a non-enumerable own symbol property of the class, never a module variable (AD-5).
import { isFloat } from "../php/PhpFloat";
import { valueCopy } from "../php/valueCopy";
import { fqcn, resolveClass } from "../registry/registry";

/** Any class, abstract or not. */
type AnyClass = abstract new (...args: any) => any;

/** The layer record: the base class and the traits a layer composes. */
const LAYER = Symbol.for("xaravel.traits.layer");
/** The booted record of a class: its initializer names, in order. */
const BOOTED = Symbol.for("xaravel.traits.booted");
/** Static keys every function owns, never copied from a trait. */
const FUNCTION_KEYS: ReadonlySet<string> = new Set(["length", "name", "prototype"]);

interface LayerRecord {
  readonly base: AnyClass | null;
  readonly traits: readonly AnyClass[];
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
/** A class's static side, without its construct signature or `prototype`. */
type StaticSide<C> = C extends unknown ? Omit<C, "prototype"> : never;
type TraitInstances<Ts extends readonly AnyClass[]> = Ts extends readonly [] ? object : UnionToIntersection<InstanceType<Ts[number]>>;
type TraitStatics<Ts extends readonly AnyClass[]> = Ts extends readonly [] ? unknown : UnionToIntersection<StaticSide<Ts[number]>>;

/** The class `mixin(Base, ...Traits)` returns: Base's constructor, with Base's and the traits' members. */
export type Mixed<B extends AnyClass | null, Ts extends readonly AnyClass[]> = (new (
  ...args: B extends AnyClass ? ConstructorParameters<B> : []
) => (B extends AnyClass ? InstanceType<B> : object) & TraitInstances<Ts>) &
  (B extends AnyClass ? StaticSide<B> : unknown) &
  TraitStatics<Ts>;

/** A class or instance `classUsesRecursive` accepts, or its FQCN. */
export type ClassReference = AnyClass | object | string;

/** The layer record `klass` owns, or null when it is not a layer. */
function layerOf(klass: unknown): LayerRecord | null {
  if (typeof klass !== "function" || !Object.hasOwn(klass, LAYER)) {
    return null;
  }
  return (klass as unknown as Record<symbol, LayerRecord>)[LAYER]!;
}

/** The traits `klass` uses directly: those of the layer it extends. */
function directTraits(klass: AnyClass): readonly AnyClass[] {
  return layerOf(Object.getPrototypeOf(klass))?.traits ?? [];
}

/** A display name for a trait in a `mixin` error: its FQCN when registered. */
function traitName(trait: AnyClass): string {
  try {
    return fqcn(trait);
  } catch {
    return "an unregistered trait";
  }
}

/** A member key as PHP would print it. */
function keyName(key: string | symbol): string {
  return typeof key === "symbol" ? `[${key.description ?? ""}]` : key;
}

/** Whether two defaults are PHP-identical (`===`, arrays compared entry by entry, in order). */
function identical(a: unknown, b: unknown): boolean {
  if (Object.is(a, b) || a === b) {
    return true;
  }
  if (isFloat(a) && isFloat(b)) {
    return Number(a) === Number(b);
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => identical(value, b[index]));
  }
  const iterable = (x: object): x is Iterable<unknown> => (x as Record<symbol, unknown>)[Symbol.for("xaravel.php.array")] === true;
  if (iterable(a) && iterable(b)) {
    const left = [...a] as [unknown, unknown][];
    const right = [...b] as [unknown, unknown][];
    return left.length === right.length && left.every(([key, value], index) => key === right[index]![0] && identical(value, right[index]![1]));
  }
  const prototypeA: unknown = Object.getPrototypeOf(a);
  if ((prototypeA !== Object.prototype && prototypeA !== null) || prototypeA !== Object.getPrototypeOf(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every((key, index) => key === keysB[index] && identical((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  );
}

interface Member {
  readonly declarer: AnyClass;
  readonly descriptor: PropertyDescriptor;
}

/**
 * A trait's members on one side (`proto` or `static`): its own, then those of the traits it uses, in use order,
 * the first key winning (a trait's own member overrides a used trait's, as in PHP).
 */
function traitMembers(trait: AnyClass, side: "proto" | "static", out: Map<string | symbol, Member> = new Map()): Map<string | symbol, Member> {
  const holder: object = side === "proto" ? (trait.prototype as object) : trait;
  const keys: (string | symbol)[] = side === "proto" ? Reflect.ownKeys(holder).filter((key) => key !== "constructor") : Object.getOwnPropertyNames(holder).filter((key) => !FUNCTION_KEYS.has(key));
  for (const key of keys) {
    if (!out.has(key)) {
      out.set(key, { declarer: trait, descriptor: Object.getOwnPropertyDescriptor(holder, key)! });
    }
  }
  const layer: unknown = Object.getPrototypeOf(trait);
  const composed: object | null = layerOf(layer) === null ? null : side === "proto" ? ((layer as AnyClass).prototype as object) : (layer as object);
  for (const used of directTraits(trait)) {
    for (const [key, member] of traitMembers(used, side)) {
      if (out.has(key)) {
        continue;
      }
      // A collision among the used traits is resolved on the trait's own layer (a thrower): take the layer's.
      const own = composed === null ? undefined : Object.getOwnPropertyDescriptor(composed, key);
      out.set(key, own !== undefined && !sameDescriptor(own, member.descriptor) ? { declarer: trait, descriptor: own } : member);
    }
  }
  return out;
}

/** Whether two descriptors hold the same value or accessors (a static data copy counts as the same). */
function sameDescriptor(a: PropertyDescriptor, b: PropertyDescriptor): boolean {
  return "value" in a && "value" in b ? identical(a.value, b.value) : a.get === b.get && a.set === b.set;
}

/** Whether a descriptor is a method (a function data property that is not enumerable, as class methods are). */
function isMethod(descriptor: PropertyDescriptor): boolean {
  return "value" in descriptor && typeof descriptor.value === "function" && descriptor.enumerable !== true;
}

/** Whether two descriptors define the same member (the same function, accessors or identical data). */
function sameMember(a: PropertyDescriptor, b: PropertyDescriptor): boolean {
  if ("value" in a && "value" in b) {
    return identical(a.value, b.value);
  }
  return a.get === b.get && a.set === b.set;
}

/** A method that throws PHP's trait collision message when called, as the receiver's class did not resolve it. */
function collision(first: AnyClass, later: AnyClass, key: string | symbol): (this: object) => never {
  const name = keyName(key);
  return function (this: object): never {
    let receiver: string;
    try {
      receiver = fqcn(this);
    } catch {
      receiver = "an unregistered class";
    }
    throw new Error(`Trait method ${traitName(later)}::${name} has not been applied as ${receiver}::${name}, because of collision with ${traitName(first)}::${name}`);
  };
}

/** Defines `members` on `target`, applying the diamond and collision rules across traits. */
function applyMembers(target: object, side: "proto" | "static", traits: readonly AnyClass[]): void {
  const applied = new Map<string | symbol, Member>();
  for (const trait of traits) {
    for (const [key, member] of traitMembers(trait, side)) {
      const previous = applied.get(key);
      if (previous !== undefined) {
        if (previous.declarer === member.declarer || sameMember(previous.descriptor, member.descriptor)) {
          continue;
        }
        if (isMethod(previous.descriptor) || isMethod(member.descriptor) || !("value" in member.descriptor)) {
          const thrower = collision(previous.declarer, member.declarer, key);
          const descriptor: PropertyDescriptor =
            "value" in previous.descriptor ? { value: thrower, writable: true, enumerable: false, configurable: true } : { get: thrower, set: thrower, enumerable: false, configurable: true };
          Object.defineProperty(target, key, descriptor);
          continue;
        }
        throw new Error(
          `${traitName(previous.declarer)} and ${traitName(member.declarer)} define the same property ($${keyName(key)}) in the composition of a class. However, the definition differs and is considered incompatible.`,
        );
      }
      applied.set(key, member);
      const descriptor = member.descriptor;
      Object.defineProperty(target, key, side === "static" && "value" in descriptor && !isMethod(descriptor) ? { ...descriptor, value: valueCopy(descriptor.value ?? null) } : descriptor);
    }
  }
}

/** The instance property defaults of `traits`, by key, in order; throws when two traits' defaults differ. */
function instanceDefaults(traits: readonly AnyClass[]): [string, unknown][] {
  const defaults = new Map<string, { from: AnyClass; value: unknown }>();
  for (const trait of traits) {
    const instance = Reflect.construct(trait as unknown as new () => object, []) as Record<string, unknown>;
    for (const key of Object.keys(instance)) {
      const value = instance[key] ?? null;
      const previous = defaults.get(key);
      if (previous === undefined) {
        defaults.set(key, { from: trait, value });
      } else if (!identical(previous.value, value)) {
        throw new Error(
          `${traitName(previous.from)} and ${traitName(trait)} define the same property ($${key}) in the composition of a class. However, the definition differs and is considered incompatible.`,
        );
      }
    }
  }
  return [...defaults].map(([key, { value }]) => [key, value]);
}

/** Assigns a copy of each default `instance` does not already own. */
function assignDefaults(instance: object, defaults: readonly [string, unknown][]): void {
  for (const [key, value] of defaults) {
    if (!Object.hasOwn(instance, key)) {
      Object.defineProperty(instance, key, { value: valueCopy(value), writable: true, enumerable: true, configurable: true });
    }
  }
}

/**
 * A new class extending `base` (or nothing, for `null`) that holds the members of `traits`, in order: write
 * `class X extends mixin(Base, A, B)` for PHP's `class X extends Base { use A, B; }`, and
 * `class T extends mixin(null, Inner)` for a trait that uses `Inner`.
 */
export function mixin<B extends AnyClass | null, const Ts extends readonly AnyClass[]>(base: B, ...traits: Ts): Mixed<B, Ts> {
  if (base !== null && typeof base !== "function") {
    throw new TypeError("mixin(): the base must be a class or null");
  }
  for (const trait of traits) {
    if (typeof trait !== "function") {
      throw new TypeError("mixin(): every trait must be a class");
    }
  }
  const defaults = instanceDefaults(traits);
  const Layer =
    base === null
      ? class {
          constructor(..._args: unknown[]) {
            assignDefaults(this, defaults);
          }
        }
      : class extends (base as unknown as new (...args: unknown[]) => object) {
          constructor(...args: unknown[]) {
            super(...args);
            assignDefaults(this, defaults);
          }
        };
  applyMembers(Layer.prototype, "proto", traits);
  applyMembers(Layer, "static", traits);
  const record: LayerRecord = Object.freeze({ base, traits: Object.freeze([...traits]) });
  Object.defineProperty(Layer, LAYER, { value: record, enumerable: false, writable: false, configurable: false });
  return Layer as unknown as Mixed<B, Ts>;
}

/** The class `reference` names: a class itself, an instance's class, or the class registered under an FQCN. */
function classOf(reference: unknown, caller: string): AnyClass {
  if (typeof reference === "string") {
    return resolveClass(reference) as AnyClass;
  }
  if (typeof reference === "function") {
    return reference as AnyClass;
  }
  if (typeof reference === "object" && reference !== null) {
    const klass: unknown = (Object.getPrototypeOf(reference) as { constructor?: unknown } | null)?.constructor;
    if (typeof klass === "function") {
      return klass as AnyClass;
    }
  }
  throw new TypeError(`${caller}(): the value is not a class, an object or a class name`);
}

/** Laravel's `trait_uses_recursive`: the traits `klass` uses directly, then each one's, recursively, by FQCN. */
function traitUsesRecursive(klass: AnyClass): Map<string, AnyClass> {
  const traits = new Map<string, AnyClass>();
  for (const trait of directTraits(klass)) {
    const name = fqcn(trait);
    if (!traits.has(name)) {
      traits.set(name, trait);
    }
  }
  const result = new Map(traits);
  for (const trait of traits.values()) {
    for (const [name, used] of traitUsesRecursive(trait)) {
      if (!result.has(name)) {
        result.set(name, used);
      }
    }
  }
  return result;
}

/** The ordered trait FQCNs of `klass`: each class from the root ancestor down to `klass`, its traits recursively. */
function usedTraitNames(klass: AnyClass): string[] {
  const chain: AnyClass[] = [];
  for (let current: unknown = klass; typeof current === "function" && current !== Function.prototype; current = Object.getPrototypeOf(current)) {
    if (layerOf(current) === null) {
      chain.unshift(current as AnyClass);
    }
  }
  const names = new Set<string>();
  for (const member of chain) {
    for (const name of traitUsesRecursive(member).keys()) {
      names.add(name);
    }
  }
  return [...names];
}

/**
 * Laravel's `class_uses_recursive($class)`: the traits a class (given as the class, an instance or its FQCN) and its
 * parents use, traits used by traits included, in Upstream order, as a PHP array FQCN ⇒ FQCN (`[]` when none).
 * Throws `fqcn()`'s `TypeError` for an unregistered trait.
 */
export function classUsesRecursive(reference: ClassReference): Record<string, string> | [] {
  const names = usedTraitNames(classOf(reference, "classUsesRecursive"));
  if (names.length === 0) {
    return [];
  }
  const result: Record<string, string> = {};
  for (const name of names) {
    Object.defineProperty(result, name, { value: name, writable: true, enumerable: true, configurable: true });
  }
  return result;
}

/** The method names of `klass`'s table on one side, in PHP's order: own, each trait's table, then the parent's. */
function methodTable(klass: AnyClass, side: "proto" | "static", out: Set<string>): Set<string> {
  const holder: object = side === "proto" ? (klass.prototype as object) : klass;
  for (const key of Object.getOwnPropertyNames(holder)) {
    if (key === "constructor" || (side === "static" && FUNCTION_KEYS.has(key))) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(holder, key)!;
    if ("value" in descriptor && typeof descriptor.value === "function") {
      out.add(key);
    }
  }
  const parent: unknown = Object.getPrototypeOf(klass);
  const layer = layerOf(parent);
  if (layer !== null) {
    for (const trait of layer.traits) {
      methodTable(trait, side, out);
    }
  }
  const next: unknown = layer !== null ? layer.base : parent;
  if (typeof next === "function" && next !== Function.prototype) {
    methodTable(next as AnyClass, side, out);
  }
  return out;
}

/** PHP's `class_basename`: the last segment of an FQCN. */
function basename(name: string): string {
  return name.slice(name.lastIndexOf("\\") + 1);
}

/**
 * Model's `bootTraits` for `klass`, at most once per class (a later call is a no-op until `clearBootedTraits`): calls
 * each static `boot<Trait>` for a trait in `classUsesRecursive(klass)`, with `this` the class, in PHP's method-table
 * order (the class's own methods, its traits' in use order, then its parent's), and records the `initialize<Trait>`
 * methods `initializeTraits` calls. The record is stored before the boot methods run.
 */
export function bootTraits(klass: AnyClass): void {
  if (typeof klass !== "function") {
    throw new TypeError("bootTraits(): the value is not a class");
  }
  if (Object.hasOwn(klass, BOOTED)) {
    return;
  }
  const traits = usedTraitNames(klass).map(basename);
  const boots = new Set(traits.map((name) => `boot${name}`));
  const initializers = new Set(traits.map((name) => `initialize${name}`));
  const bootMethods = [...methodTable(klass, "static", new Set())].filter((name) => boots.has(name));
  const initializeMethods = Object.freeze([...methodTable(klass, "proto", new Set())].filter((name) => initializers.has(name)));
  Object.defineProperty(klass, BOOTED, { value: initializeMethods, enumerable: false, writable: false, configurable: true });
  for (const name of bootMethods) {
    (klass as unknown as Record<string, (this: AnyClass) => unknown>)[name]!.call(klass);
  }
}

/**
 * Model's `initializeTraits`: boots the instance's class if it is not booted, then calls each recorded
 * `initialize<Trait>` method on the instance. The host calls it once per instance, from its constructor.
 */
export function initializeTraits(instance: object): void {
  if (typeof instance !== "object" || instance === null) {
    throw new TypeError("initializeTraits(): the value is not an object");
  }
  const klass = classOf(instance, "initializeTraits");
  bootTraits(klass);
  const names = (klass as unknown as Record<symbol, readonly string[]>)[BOOTED]!;
  for (const name of names) {
    (instance as Record<string, (this: object) => unknown>)[name]!.call(instance);
  }
}

/** Forgets that `klass` booted its traits, so the next `bootTraits` boots it again (Model's `clearBootedModels`). */
export function clearBootedTraits(klass: AnyClass): void {
  if (typeof klass !== "function") {
    throw new TypeError("clearBootedTraits(): the value is not a class");
  }
  if (Object.hasOwn(klass, BOOTED)) {
    delete (klass as unknown as Record<symbol, unknown>)[BOOTED];
  }
}
