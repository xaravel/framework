// Laravel's `Illuminate\Support\Traits\Macroable` (Story 11.1), as a runtime trait: `class X extends mixin(Base,
// Macroable)` (AD-26 Traits row).
//
// Storage. Upstream's `static::$macros` is one array shared by the class that uses the trait and all its subclasses.
// Here it is one Upstream static per Scope Frame unit, `frameStatic(<using class>, MACROS, …)` (AD-5.5), keyed by the
// using class: the nearest class up the constructor chain from the called class whose own `macro` is this trait's
// (the layer `mixin` builds). It is never a module variable or a plain static field. A table is never mutated in place:
// a write sets a fresh copy, so a unit never changes a table it reads through from an enclosing unit.
//
// Writes (`macro`, `mixin`, `flushMacros`) are base-only writes (DIV-11.2). Inside a `request`, `job` or `command`
// frame they throw `ScopeFrameException`; inside any other unit frame, a `test` frame included, they are held by that
// unit and discarded when it ends; with no active frame they throw, as `frameStatic`'s writes do (AD-5). Two limits
// are follow-ups, not divergences: a write before the Application is `sealed` goes to no Application base until the
// Story that adds the `sealed` state adds that seam (decisions/ESC-11.1-2.md), and a child unit of a `request`, `job`
// or `command` frame is recognised once `@xaravel/runtime/scope` exposes the frame chain's kinds
// (decisions/ESC-11.1-3.md).
//
// Dispatch. PHP resolves a missing method at call time through `__call` / `__callStatic`; without a Proxy (AD-7,
// AD-26) `macro(name)` makes `name` a real member of the using class once, on its prototype and on its static side,
// unless a member of that name already exists (a real method wins, as in PHP). The member is a dispatcher: it holds no
// state, is the same in every frame, and forwards to `__call` / `__callStatic`, which read the frame's table. A name
// that was never registered has no member, so calling it is a JS `TypeError`, not `BadMethodCallException`; such a
// call goes through `__callStatic` / `__call` instead (DIV-12.10).
import { BadMethodCallException, Error as PhpError, fqcn, registerClass } from "@xaravel/runtime";
import { currentFrame, type FrameSlot, frameStatic, ScopeFrameException } from "@xaravel/runtime/scope";

/** Any class, abstract or not. */
type AnyClass = abstract new (...args: never[]) => unknown;

/** The macro table: name ⇒ macro, in registration order. */
type MacroTable = ReadonlyMap<string, unknown>;

/** The `frameStatic` key of a using class's macro table: Upstream's `static::$macros`. */
const MACROS: unique symbol = Symbol("Illuminate\\Support\\Traits\\Macroable::$macros");
/** The unit kinds in which a base-only write throws (DIV-11.2). */
const BASE_ONLY_KINDS: ReadonlySet<string> = new Set(["request", "job", "command"]);
/** Prototype members every object has, never registered by `mixin`. */
const OBJECT_KEYS: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));
/** Static members every function has, never registered by `mixin`. */
const FUNCTION_KEYS: ReadonlySet<string> = new Set([...Object.getOwnPropertyNames(Function.prototype), "length", "name", "prototype", "arguments", "caller"]);

/** The class that uses the trait for `klass`: the nearest class up its chain whose own `macro` is the trait's. */
function usingClass(klass: object): AnyClass {
  for (let current: unknown = klass; typeof current === "function" && current !== Function.prototype; current = Object.getPrototypeOf(current)) {
    // The trait itself is never a using class: a member installed on it would be copied by every later `mixin`.
    if (current !== Macroable && Object.getOwnPropertyDescriptor(current, "macro")?.value === Macroable.macro) {
      return current as AnyClass;
    }
  }
  throw new TypeError("Macroable: the class does not use Illuminate\\Support\\Traits\\Macroable; declare it as `class X extends mixin(Base, Macroable)`");
}

/** The frame static that holds `klass`'s macro table. */
function macros(klass: object): FrameSlot<MacroTable> {
  return frameStatic<MacroTable>(usingClass(klass), MACROS, () => new Map());
}

/** Throws `ScopeFrameException` where a macro write may not happen (DIV-11.2, AD-5); see the header. */
function guardWrite(what: string): void {
  const frame = currentFrame();
  if (frame === null) {
    throw new ScopeFrameException(`Cannot ${what} with no active Scope Frame; run the code inside runInFrame()`);
  }
  if (BASE_ONLY_KINDS.has(frame.kind)) {
    throw new ScopeFrameException(`Cannot ${what} inside a ${frame.kind} frame: macros are base-only writes (DIV-11.2)`);
  }
}

/** PHP's `static::class` for a message: the called class's FQCN, or `class@anonymous` when it is not registered. */
function className(klass: object): string {
  try {
    return fqcn(klass);
  } catch {
    return "class@anonymous";
  }
}

/** Defines `fn` as `name` on `target`, unless a member of that name exists there or up its chain (a real method wins). */
function install(target: object, name: string, fn: (...args: unknown[]) => unknown): void {
  if (name in target) {
    return;
  }
  Object.defineProperty(target, name, { value: fn, writable: true, enumerable: false, configurable: true });
}

/** Installs the instance and static dispatchers of `name` on the using class `klass` (see the header). */
function installDispatchers(klass: AnyClass, name: string): void {
  install(
    klass.prototype as object,
    name,
    {
      [name](this: Macroable, ...args: unknown[]): unknown {
        return this.__call(name, args);
      },
    }[name]!,
  );
  install(
    klass,
    name,
    {
      [name](this: typeof Macroable, ...args: unknown[]): unknown {
        return this.__callStatic(name, args);
      },
    }[name]!,
  );
}

/** Calls `macro` with `parameters`: a function with `self` as `this`, an `__invoke` object as is. */
function callMacro(macro: unknown, self: unknown, parameters: readonly unknown[]): unknown {
  if (typeof macro === "function") {
    return Reflect.apply(macro, self, parameters);
  }
  if (typeof macro === "object" && macro !== null && typeof (macro as { __invoke?: unknown }).__invoke === "function") {
    return (macro as { __invoke: (...args: unknown[]) => unknown }).__invoke(...parameters);
  }
  throw new PhpError("Value not callable");
}

/** The methods PHP's `getMethods(IS_PUBLIC | IS_PROTECTED)` lists for `mixin`'s class, in its order, by name. */
function mixinMethods(mixin: object): Map<string, (...args: unknown[]) => unknown> {
  const methods = new Map<string, (...args: unknown[]) => unknown>();
  for (let holder: unknown = Object.getPrototypeOf(mixin); holder !== null && holder !== Object.prototype; holder = Object.getPrototypeOf(holder)) {
    for (const key of Object.getOwnPropertyNames(holder)) {
      const descriptor = Object.getOwnPropertyDescriptor(holder, key)!;
      if (key !== "constructor" && !OBJECT_KEYS.has(key) && !methods.has(key) && "value" in descriptor && typeof descriptor.value === "function") {
        methods.set(key, descriptor.value as (...args: unknown[]) => unknown);
      }
    }
  }
  const klass: unknown = (Object.getPrototypeOf(mixin) as { constructor?: unknown } | null)?.constructor;
  for (let holder: unknown = klass; typeof holder === "function" && holder !== Object && holder !== Function.prototype; holder = Object.getPrototypeOf(holder)) {
    for (const key of Object.getOwnPropertyNames(holder)) {
      const descriptor = Object.getOwnPropertyDescriptor(holder, key)!;
      if (!FUNCTION_KEYS.has(key) && !methods.has(key) && "value" in descriptor && typeof descriptor.value === "function") {
        methods.set(key, descriptor.value as (...args: unknown[]) => unknown);
      }
    }
  }
  return methods;
}

/**
 * Laravel's `Macroable` trait: register macros on a class at run time and call them on its instances or statically.
 * Use it as `class X extends mixin(Base, Macroable)`, and type each macro through module augmentation. Macros are
 * held per Scope Frame and are base-only writes (DIV-11.2).
 */
export class Macroable {
  /**
   * Register a custom macro. A function macro is called with `this` bound to the instance (instance call) or the
   * called class (static call); an arrow function, as a PHP `static function`, keeps its own `this`. Throws
   * `ScopeFrameException` inside a `request`, `job` or `command` frame, and with no active frame (DIV-11.2).
   */
  static macro(name: string, macro: unknown): null {
    guardWrite(`register the macro ${name}`);
    const slot = macros(this);
    const table = new Map(slot.get());
    table.set(name, macro);
    slot.set(table);
    installDispatchers(usingClass(this), name);
    return null;
  }

  /**
   * Mix another object into the class: each public or protected method of the object's class (its prototype chain
   * and its static side) is called with `this` the object, and its result is registered as a macro of the same name;
   * with `replace` false, a macro that already exists is kept.
   */
  static mixin(mixin: object, replace: boolean = true): null {
    guardWrite("mix in macros");
    const self = this as unknown as typeof Macroable;
    for (const [name, method] of mixinMethods(mixin)) {
      if (replace || !self.hasMacro(name)) {
        self.macro(name, Reflect.apply(method, mixin, []));
      }
    }
    return null;
  }

  /** Checks if macro is registered (and not null), in the active frame. */
  static hasMacro(name: string): boolean {
    return (macros(this).get().get(name) ?? null) !== null;
  }

  /** Flush the existing macros of the class (in the active frame). Throws where `macro` throws. */
  static flushMacros(): null {
    guardWrite("flush the macros");
    macros(this).set(new Map());
    return null;
  }

  /**
   * Dynamically handle calls to the class: calls the macro `method` with `this` the called class. Throws
   * `BadMethodCallException` when it is not registered.
   */
  static __callStatic(method: string, parameters: unknown[]): unknown {
    const self = this as unknown as typeof Macroable;
    if (!self.hasMacro(method)) {
      throw new BadMethodCallException(`Method ${className(self)}::${method} does not exist.`);
    }
    return callMacro(macros(self).get().get(method), self, parameters);
  }

  /**
   * Dynamically handle calls to the class: calls the macro `method` with `this` the instance. Throws
   * `BadMethodCallException` when it is not registered.
   */
  __call(method: string, parameters: unknown[]): unknown {
    const klass = (this as object).constructor as typeof Macroable;
    if (!klass.hasMacro(method)) {
      throw new BadMethodCallException(`Method ${className(klass)}::${method} does not exist.`);
    }
    return callMacro(macros(klass).get().get(method), this, parameters);
  }
}

registerClass("Illuminate\\Support\\Traits\\Macroable", Macroable);
