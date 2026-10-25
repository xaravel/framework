// Laravel's `Illuminate\Support\Traits\Macroable` (Story 11.1), as a runtime trait: `class X extends mixin(Base,
// Macroable)` (AD-26 Traits row).
//
// Storage. Upstream's `static::$macros` is one array shared by the class that uses the trait and all its subclasses.
// Here it is one Upstream static per Scope Frame unit, `frameStatic(<using class>, MACROS, …)` (AD-5.5), keyed by the
// using class: the nearest class up the constructor chain from the called class whose own `macro` is this trait's
// (the layer `mixin` builds). It is never a module variable or a plain static field. A table is never mutated in place:
// a write sets a fresh copy, so a unit never changes a table it reads through from an enclosing unit.
//
// Writes (`macro`, `mixin`, `flushMacros`) are base-only writes (DIV-11.2, AD-5). A write passes only when the active
// frame chain (`frameKinds()`, decisions/ESC-11.1-3.md) holds a `test` frame and no `request`, `job` or `command` frame:
// a test frame, and a unit or narrow frame nested in one at any depth, which writes to the test frame's overlay
// (decisions/ESC-11.1-5.md, second bullet; decisions/ESC-11.1-6.md left these nested cases to the frame-chain read).
// `frameStatic` routes the write as AD-5.8 does: from a unit or narrow frame nested in a test frame at any depth it lands
// in the nearest enclosing test frame (decisions/MAINT-2026-10-24-ad-5-8-any-depth.md), and it is discarded when that
// test ends. A `test` frame nested in another test is the nearest test frame for its own writes, so its macros end
// with it. Every other chain throws `ScopeFrameException`: a `request`, `job` or `command` frame anywhere in the
// chain, a test frame opened inside one included (DIV-11.2); a chain with no test frame, such as a root `unit` frame
// or an `interleave` unit, whose origin the read does not follow (ESC-11.1-5, first bullet); and no active frame, as
// `frameStatic`'s writes do (decisions/ESC-11.1-2.md). One limit is a follow-up, not a
// divergence: a write before the Application is `sealed` goes to no Application base until the Story that adds the
// `sealed` state adds that seam (decisions/ESC-11.1-2.md).
//
// Dispatch. PHP resolves a missing method at call time through `__call` / `__callStatic`; without a Proxy (AD-7,
// AD-26) `macro(name)` makes `name` a real member of the using class once, on its prototype and on its static side,
// unless the class, its parents or the trait declare a member of that name (a real method wins, as in PHP). Only
// members declared below `Object.prototype` / `Function.prototype` count: a name JavaScript gives every object or
// function (`toString`, `valueOf`, `hasOwnProperty`, `call`, `apply`, `bind`, …) is no PHP method, so its dispatcher is
// installed on the using class and the macro runs as `__call` / `__callStatic` would run it. The member is a
// dispatcher: it holds no state, is the same in every frame, and forwards to `__call` / `__callStatic`, which read the
// frame's table. Dispatchers outlive the frame (DIV-12.10) but macros do not (DIV-11.2), so a dispatcher over such a
// built-in falls back to JavaScript's own member, with the same `this` and arguments, whenever the active frame's table
// of the receiver's class has no entry of its name (none at all with no active frame, or for a receiver whose class
// does not use the trait); an entry (a macro, `null`, or the tombstone `flushMacros` leaves) forwards. The receiver's
// table, not the installing class's, is read, so a using class below another using class, whose own install the
// parent's dispatcher shadows, still reaches its own macros. A built-in that is an accessor (`__proto__` on both sides,
// `caller` and `arguments` on `Function.prototype`) gets an accessor dispatcher: its getter gives the forwarding
// function while the entry exists and the original getter's result otherwise, and its setter is the original's. So a
// frame that never registered the name sees the class as before any macro, and JavaScript's implicit calls
// (`String(x)`, template literals, `+`) reach the macro only while the entry exists, a consequence of DIV-12.11's
// install, not PHP behaviour. A name that was never registered has no member, so calling it is a JS `TypeError`, not
// `BadMethodCallException`; such a call goes through `__callStatic` / `__call` instead (DIV-12.10). The four names a
// class owns in JavaScript, its static `prototype`, `name` and `length` and its prototype's `constructor`, cannot hold a
// dispatcher without breaking the class, so `macro()` throws `InvalidArgumentException` for them (DIV-12.11).
import { BadMethodCallException, Error as PhpError, fqcn, InvalidArgumentException, registerClass } from "@xaravel/runtime";
import { frameKinds, type FrameSlot, frameStatic, ScopeFrameException } from "@xaravel/runtime/scope";

/** Any class, abstract or not. */
type AnyClass = abstract new (...args: never[]) => unknown;

/** The macro table: name ⇒ macro, in registration order. */
type MacroTable = ReadonlyMap<string, unknown>;

/** The `frameStatic` key of a using class's macro table: Upstream's `static::$macros`. */
const MACROS: unique symbol = Symbol("Illuminate\\Support\\Traits\\Macroable::$macros");
/** The frame kind a chain must hold for a macro write to pass (ESC-11.1-5); a narrow frame is never of this kind. */
const WRITABLE_KIND = "test";
/** The frame kinds under which a macro write throws, anywhere in the chain (DIV-11.2, ESC-11.1-3). */
const BARRIER_KINDS: ReadonlySet<string> = new Set(["request", "job", "command"]);
/** The names JavaScript reserves on a class, which `macro()` refuses (DIV-12.11). */
const RESERVED_NAMES: ReadonlySet<string> = new Set(["prototype", "name", "length", "constructor"]);

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
  const kinds = frameKinds();
  if (kinds.length === 0) {
    throw new ScopeFrameException(`Cannot ${what} with no active Scope Frame; run the code inside runInFrame()`);
  }
  const barrier = kinds.find((kind) => BARRIER_KINDS.has(kind));
  if (barrier !== undefined) {
    throw new ScopeFrameException(`Cannot ${what} inside a ${barrier} frame: macros are base-only writes, and a ${barrier} frame takes none (DIV-11.2, ESC-11.1-3)`);
  }
  if (!kinds.includes(WRITABLE_KIND)) {
    throw new ScopeFrameException(`Cannot ${what} inside a ${kinds[0]} frame: macros are base-only writes, held only inside a test frame (DIV-11.2, ESC-11.1-5)`);
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

/**
 * Defines `name` on `target` with `descriptor`, unless `target` or an object up its chain below `stop` declares a
 * member of that name (a real method wins). Members of `stop` (`Object.prototype`, `Function.prototype`) and above are
 * JavaScript's, not PHP methods, so they do not block the dispatcher (DIV-12.11).
 */
function install(target: object, name: string, descriptor: PropertyDescriptor, stop: object): void {
  for (let holder: object | null = target; holder !== null && holder !== stop; holder = Object.getPrototypeOf(holder) as object | null) {
    if (Object.hasOwn(holder, name)) {
      return;
    }
  }
  Object.defineProperty(target, name, { ...descriptor, enumerable: false, configurable: true });
}

/**
 * The JavaScript member `name` resolves to on `stop` (`Object.prototype`, `Function.prototype`), or `null` when it has
 * none (DIV-12.11):
 *
 * - `function`: a built-in method (`toString`, `call`, …). Read through `Reflect.get`, because a hardened intrinsic
 *   keeps a method such as `toString` behind an accessor whose getter returns it (as SES's override taming does).
 * - `accessor`: a getter that gives a non-function or throws (`__proto__` on both sides, `caller` and `arguments` on
 *   `Function.prototype`), with the original getter and setter.
 */
type Builtin =
  | { readonly kind: "function"; readonly fn: (...args: unknown[]) => unknown }
  | { readonly kind: "accessor"; readonly get: () => unknown; readonly set: ((value: unknown) => void) | null };

/** The JavaScript member `name` resolves to on `stop`, or `null` (see `Builtin`). */
function builtinOf(stop: object, name: string): Builtin | null {
  try {
    const member: unknown = Reflect.get(stop, name);
    if (typeof member === "function") {
      return { kind: "function", fn: member as (...args: unknown[]) => unknown };
    }
  } catch {
    // A throwing getter (`Function.prototype.caller`): an accessor, read below.
  }
  for (let holder: object | null = stop; holder !== null; holder = Object.getPrototypeOf(holder) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(holder, name);
    if (descriptor !== undefined) {
      const get: unknown = Reflect.get(descriptor, "get");
      const set: unknown = Reflect.get(descriptor, "set");
      return typeof get === "function" ? { kind: "accessor", get: get as () => unknown, set: typeof set === "function" ? (set as (value: unknown) => void) : null } : null;
    }
  }
  return null;
}

/**
 * Whether the active frame's table of the class `receiver` resolves to has an entry of `name` (a macro, `null`, or a
 * `flushMacros` tombstone). A receiver that is not a class using the trait has none, so it gets JavaScript's member.
 */
function hasEntry(receiver: unknown, name: string): boolean {
  if (typeof receiver !== "function") {
    return false;
  }
  let table: FrameSlot<MacroTable>;
  try {
    table = macros(receiver);
  } catch {
    return false;
  }
  return table.get().has(name);
}

/** The class of an instance-side receiver, or `null` for a primitive, `null` or `undefined`. */
function classOf(receiver: unknown): unknown {
  return (typeof receiver === "object" && receiver !== null) || typeof receiver === "function" ? ((receiver as { constructor?: unknown }).constructor ?? null) : null;
}

/**
 * The descriptor of a dispatcher for `name` over `builtin` (see the header). With no built-in, a data property that
 * always forwards. Over a built-in method, a data property that forwards while the receiver's class has an entry of
 * `name` in the active frame and calls the built-in otherwise. Over a built-in accessor, an accessor whose getter gives
 * `forward` while the entry exists and the original getter's result otherwise, and whose setter is the original's.
 */
function dispatcher(name: string, builtin: Builtin | null, classOfReceiver: (receiver: unknown) => unknown, forward: (receiver: unknown, args: unknown[]) => unknown): PropertyDescriptor {
  const forwarder = {
    [name](this: unknown, ...args: unknown[]): unknown {
      return forward(this, args);
    },
  }[name]!;
  if (builtin === null) {
    return { value: forwarder, writable: true };
  }
  if (builtin.kind === "function") {
    const original = builtin.fn;
    return {
      value: {
        [name](this: unknown, ...args: unknown[]): unknown {
          return hasEntry(classOfReceiver(this), name) ? forward(this, args) : Reflect.apply(original, this, args);
        },
      }[name]!,
      writable: true,
    };
  }
  const { get, set } = builtin;
  return {
    get(this: unknown): unknown {
      return hasEntry(classOfReceiver(this), name) ? forwarder : Reflect.apply(get, this, []);
    },
    set: set ?? undefined,
  };
}

/** Installs the instance and static dispatchers of `name` on the using class `klass` (see the header). */
function installDispatchers(klass: AnyClass, name: string): void {
  install(
    klass.prototype as object,
    name,
    dispatcher(name, builtinOf(Object.prototype, name), classOf, (receiver, args) => (receiver as Macroable).__call(name, args)),
    Object.prototype,
  );
  install(
    klass,
    name,
    dispatcher(name, builtinOf(Function.prototype, name), (receiver) => receiver, (receiver, args) => (receiver as typeof Macroable).__callStatic(name, args)),
    Function.prototype,
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

/** A method `mixin` registers: the function, and whether it is static (found on the class's static side). */
interface MixinMethod {
  readonly method: (...args: unknown[]) => unknown;
  readonly isStatic: boolean;
}

/**
 * The methods PHP's `getMethods(IS_PUBLIC | IS_PROTECTED)` lists for `mixin`'s class `klass`, in its order, by name: the
 * function-valued members its prototype chain and its static side declare below `Object.prototype`, `Object` and
 * `Function.prototype`. The prototype's `constructor`, JavaScript's class link and never a method, is skipped (DIV-12.11);
 * any other name the mixin declares counts, `toString` and a static method named `constructor` included.
 */
function mixinMethods(mixin: object, klass: unknown): Map<string, MixinMethod> {
  const methods = new Map<string, MixinMethod>();
  for (let holder: unknown = Object.getPrototypeOf(mixin); holder !== null && holder !== Object.prototype; holder = Object.getPrototypeOf(holder)) {
    for (const key of Object.getOwnPropertyNames(holder)) {
      const descriptor = Object.getOwnPropertyDescriptor(holder, key)!;
      if (key !== "constructor" && !methods.has(key) && "value" in descriptor && typeof descriptor.value === "function") {
        methods.set(key, { method: descriptor.value as (...args: unknown[]) => unknown, isStatic: false });
      }
    }
  }
  for (let holder: unknown = klass; typeof holder === "function" && holder !== Object && holder !== Function.prototype; holder = Object.getPrototypeOf(holder)) {
    for (const key of Object.getOwnPropertyNames(holder)) {
      const descriptor = Object.getOwnPropertyDescriptor(holder, key)!;
      if (!methods.has(key) && "value" in descriptor && typeof descriptor.value === "function") {
        methods.set(key, { method: descriptor.value as (...args: unknown[]) => unknown, isStatic: true });
      }
    }
  }
  return methods;
}

/**
 * Laravel's `Macroable` trait: register macros on a class at run time and call them on its instances or statically.
 * Use it as `class X extends mixin(Base, Macroable)`, and type each macro with `declare` / `declare static` members. Macros are
 * held per Scope Frame and are base-only writes (DIV-11.2).
 */
export class Macroable {
  /**
   * Register a custom macro. A function macro is called with `this` bound to the instance (instance call) or the
   * called class (static call); an arrow function, as a PHP `static function`, keeps its own `this`. Passes only when
   * the active frame chain holds a `test` frame and no `request`, `job` or `command` frame, and lands in the nearest
   * test frame; throws `ScopeFrameException` otherwise, and with no active frame (DIV-11.2; see the header).
   *
   * A name JavaScript gives every object or function (`toString`, `call`, `bind`, …) dispatches to the macro while the
   * active frame has an entry of that name, unless the class or its parents declare it; with no entry, JavaScript's
   * own member runs. The four names JavaScript reserves on a class, `prototype`, `name`, `length` and `constructor`,
   * throw `InvalidArgumentException`, after the frame check (DIV-12.11).
   */
  static macro(name: string, macro: unknown): null {
    guardWrite(`register the macro ${name}`);
    if (RESERVED_NAMES.has(name)) {
      throw new InvalidArgumentException(
        `Cannot register a macro named ${name}: JavaScript reserves ${name} on a class (a class's own prototype, name and length, and its prototype's constructor); choose another name (DIV-12.11)`,
      );
    }
    const slot = macros(this);
    const table = new Map(slot.get());
    table.set(name, macro);
    slot.set(table);
    installDispatchers(usingClass(this), name);
    return null;
  }

  /**
   * Mix another object into the class: each public or protected method of the object's class (its prototype chain
   * and its static side) is called, and its result is registered as a macro of the same name; with `replace` false, a
   * macro that already exists is kept. A prototype method is called with `this` the object; a static method with
   * `this` the object's class, as PHP's `static::`. The prototype's `constructor` is skipped; a method named `prototype`,
   * `name` or `length`, or a static method named `constructor`, throws as `macro()` does (DIV-12.11).
   */
  static mixin(mixin: object, replace: boolean = true): null {
    guardWrite("mix in macros");
    const self = this as unknown as typeof Macroable;
    const klass: unknown = (Object.getPrototypeOf(mixin) as { constructor?: unknown } | null)?.constructor;
    for (const [name, { method, isStatic }] of mixinMethods(mixin, klass)) {
      if (replace || !self.hasMacro(name)) {
        self.macro(name, Reflect.apply(method, isStatic ? klass : mixin, []));
      }
    }
    return null;
  }

  /** Checks if macro is registered (and not null), in the active frame. */
  static hasMacro(name: string): boolean {
    return (macros(this).get().get(name) ?? null) !== null;
  }

  /**
   * Flush the existing macros of the class (in the active frame). Throws where `macro` throws. Each flushed name keeps
   * a `null` entry (a tombstone), which `hasMacro` reads as not registered, so a dispatcher over a JavaScript built-in
   * still forwards and throws `BadMethodCallException` in this frame (DIV-12.11).
   */
  static flushMacros(): null {
    guardWrite("flush the macros");
    const slot = macros(this);
    slot.set(new Map([...slot.get().keys()].map((name): [string, unknown] => [name, null])));
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
