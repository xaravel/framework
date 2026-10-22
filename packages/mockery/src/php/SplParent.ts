// The internal parents that link the grader's PHP SPL copies to the runtime's SPL classes (Story 9.12, ESC-4.5-1
// item 2, ESC-9.11-1). Internal to the grader: never exported from `src/index.ts`, never frozen.
//
// Each copy in this directory (`Exception`, `RuntimeException`, `LogicException`, …) extends one parent built here,
// and that parent extends the copy's PHP parent copy (the JS `Error` for `Exception`). When `@xaravel/runtime` has
// published `globalThis[Symbol.for('xaravel.php.classes')]` (one of its package entries has loaded), every parent's
// constructor and prototype are re-parented onto the runtime class of its copy's PHP name: at module load when the
// map is already there, else at the first construction of a copy or subclass, an `instanceof` on a copy, or
// `graderExceptionClass()` after it appears. All eight parents link together, and linking is one-way. From then on
// a Mockery exception is `instanceof` the runtime's SPL classes along PHP's chain, its `Exception`, and never its
// `Error`. The grader never imports the runtime (AD-2): it reads the map by its symbol only.
//
// Linked, the copies' chains run through the runtime's classes, not through each other, so each parent carries the
// getters itself and, for the copy that directly extends it (never a subclass), a `Symbol.hasInstance` that
// delegates to the runtime class: the copies stand for PHP's one class of that name.
//
// Construction then runs the runtime constructor, so its PHP argument coercion applies. The runtime's own `name` is
// removed again, and `code` and `name` are set the same way in both cases, so a Mockery exception has the same own
// properties, getters, `message` and `name` with and without the map. A non-null `previous` is the JS `cause` in
// both. With no map, the chain is the one Mockery had before Story 9.12, plus these parents.
import { FQCN, shortClassName } from "../support/values";

const PHP_CLASSES = Symbol.for("xaravel.php.classes");

/** The eight PHP classes the copies stand for, each of which the runtime's map must hold before anything links. */
const SPL_NAMES = ["Exception", "RuntimeException", "LogicException", "InvalidArgumentException", "BadFunctionCallException", "BadMethodCallException", "OutOfBoundsException", "UnexpectedValueException"] as const;

export type SplName = (typeof SPL_NAMES)[number];

type AnyClass = abstract new (...args: never[]) => object;

/** A PHP throwable as the copies expose it: PHP's getters on a JS `Error`. */
export interface SplThrowable extends Error {
  getMessage(): string;
  getCode(): number;
  getPrevious(): Error | null;
}

/** The constructor type of an internal parent and of every copy. */
export type SplClass = (new (message?: string, code?: number, previous?: Error | null) => SplThrowable) & { readonly [FQCN]: string };

interface Pending {
  readonly name: SplName;
  readonly parent: AnyClass;
}

let linked = false;
const pending: Pending[] = [];

function phpClass(name: SplName): AnyClass | null {
  const map: unknown = (globalThis as Record<symbol, unknown>)[PHP_CLASSES];
  if (typeof map !== "object" || map === null) {
    return null;
  }
  const found: unknown = (map as Record<string, unknown>)[name];
  return typeof found === "function" ? (found as AnyClass) : null;
}

/**
 * Re-parents every internal parent onto the runtime's class of the same PHP name once the map is published (and holds
 * all eight). Returns whether the copies are linked.
 */
export function linkSplParents(): boolean {
  if (!linked) {
    if (!SPL_NAMES.every((name) => phpClass(name) !== null)) {
      return false;
    }
    linked = true;
  }
  while (pending.length > 0) {
    const { name, parent } = pending.shift()!;
    const target = phpClass(name)!;
    Object.setPrototypeOf(parent, target);
    Object.setPrototypeOf(parent.prototype, target.prototype);
  }
  return true;
}

const defaultHasInstance = Function.prototype[Symbol.hasInstance];

/**
 * The internal parent of the copy of PHP's `name`, whose PHP parent copy is `base` (the JS `Error` for `Exception`).
 * The copy is declared as `class <name> extends splParent("<name>", <base>)`.
 */
export function splParent(name: SplName, base: AnyClass | ErrorConstructor): SplClass {
  const root = base === Error;
  const Base = base as unknown as new (...args: unknown[]) => Error;

  class SplParent extends Base {
    readonly #code: number;
    readonly #previous: Error | null;

    /**
     * Once linked, `value instanceof <copy>` is `value instanceof <the runtime's class>`; a subclass of the copy
     * (Mockery's own exceptions), and every class before the link, keeps the default.
     */
    static [Symbol.hasInstance](this: AnyClass, value: unknown): boolean {
      if (Object.getPrototypeOf(this) === SplParent && linkSplParents()) {
        return value instanceof phpClass(name)!;
      }
      return defaultHasInstance.call(this, value);
    }

    constructor(message: string = "", code: number = 0, previous: Error | null = null) {
      const runtime = linkSplParents();
      // The runtime's `<name>(message, code, previous)` once linked, the parent copy's below the root, else the JS
      // `Error(message, options)`.
      const args: unknown[] = runtime || !root ? [message, code, previous] : previous === null ? [message] : [message, { cause: previous }];
      super(...args);
      let ownCode = code;
      if (runtime) {
        // The runtime's coerced code; its own `name` is replaced below, as without the map.
        ownCode = (this as unknown as { code: number }).code;
        delete (this as { name?: unknown }).name;
      }
      this.#code = ownCode;
      this.#previous = previous ?? null;
      // PHP's `$code`, an own non-enumerable property with and without the map.
      Object.defineProperty(this, "code", { value: ownCode, writable: true, enumerable: false, configurable: true });
      // Not enumerable: it is no public PHP property (formatObjects reads those).
      Object.defineProperty(this, "name", { value: shortClassName(new.target), writable: true, enumerable: false, configurable: true });
    }

    getMessage(): string {
      return this.message;
    }

    getCode(): number {
      return this.#code;
    }

    getPrevious(): Error | null {
      return this.#previous;
    }
  }

  Object.defineProperty(SplParent, "name", { value: `${name}SplParent` });
  pending.push({ name, parent: SplParent });
  linkSplParents();
  return SplParent as unknown as SplClass;
}
