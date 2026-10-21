// The Class Registry core (AD-10; ESC-9.1-2): one process-wide map from PHP FQCN to class.
//
// Classes register when their module loads, so this map is boot state, not per-unit state (AD-5). Story 9.4
// builds the rest of the Registry on this core (`resolveClass`, `registerTestClass` overlays, PSR-4 autoload, the
// classmap, the grader brand) and removes nothing from it.

/** Any class: the Registry stores constructors, never instances. */
export type RegisteredClass = abstract new (...args: never[]) => unknown;

/** Registered classes by lower-cased FQCN (PHP class names are case-insensitive). */
const byKey = new Map<string, { readonly fqcn: string; readonly klass: RegisteredClass }>();
/** The FQCN each registered class was registered under. */
const byClass = new WeakMap<RegisteredClass, string>();

/** `\Foo\Bar` and `Foo\Bar` name the same class. */
function normalise(fqcn: string): string {
  return fqcn.startsWith("\\") ? fqcn.slice(1) : fqcn;
}

/**
 * Registers `klass` under the PHP FQCN `fqcn`. Registering the same class under the same FQCN again is a no-op;
 * a different class under a taken FQCN, or a registered class under a second FQCN, throws.
 */
export function registerClass(fqcn: string, klass: RegisteredClass): void {
  if (typeof fqcn !== "string" || normalise(fqcn) === "") {
    throw new TypeError("registerClass(): the FQCN must be a non-empty string");
  }
  if (typeof klass !== "function") {
    throw new TypeError(`registerClass(): ${fqcn} must be registered with a class`);
  }
  const name = normalise(fqcn);
  const key = name.toLowerCase();
  const taken = byKey.get(key);
  const previous = byClass.get(klass);
  if (taken !== undefined && taken.klass === klass) {
    return;
  }
  if (taken !== undefined) {
    throw new TypeError(`registerClass(): ${name} is already registered to another class`);
  }
  if (previous !== undefined) {
    throw new TypeError(`registerClass(): the class registered as ${previous} cannot also be registered as ${name}`);
  }
  byKey.set(key, { fqcn: name, klass });
  byClass.set(klass, name);
}

/** The FQCN `classOrInstance`'s class was registered under; throws when that class is not registered. */
export function fqcn(classOrInstance: object): string {
  if ((typeof classOrInstance !== "object" && typeof classOrInstance !== "function") || classOrInstance === null) {
    throw new TypeError("fqcn(): the value is not a class or an object");
  }
  const klass: unknown = typeof classOrInstance === "function" ? classOrInstance : Object.getPrototypeOf(classOrInstance)?.constructor;
  const name = typeof klass === "function" ? byClass.get(klass as RegisteredClass) : undefined;
  if (name === undefined) {
    throw new TypeError("fqcn(): the class is not registered; end its file with registerClass('<FQCN>', <Class>)");
  }
  return name;
}
