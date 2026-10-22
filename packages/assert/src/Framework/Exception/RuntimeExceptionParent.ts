// The lazy link from the grader's exceptions to the runtime's SPL classes (Story 9.11, ESC-4.3-1 items 10 and 14,
// ESC-9.11-1). Internal to the grader: never exported from `src/index.ts`, never frozen.
//
// Every grader exception whose PHP parent chain reaches an SPL class reaches `\RuntimeException`
// (PHPUnit's `Framework\Exception`, `Util\InvalidJsonException`, `MockObject\RuntimeException` and
// `NeverReturningMethodException`, sebastian/comparator's `ComparisonFailure`). Each extends
// `RuntimeExceptionParent`, which extends the JS `Error`. When `@xaravel/runtime` has published
// `globalThis[Symbol.for('xaravel.php.classes')]` (one of its package entries has loaded), the parent's
// constructor and prototype are re-parented onto the runtime's `RuntimeException`: at this module's load
// when the map is already there, else at the first construction after it appears. From then on a grader
// exception is `instanceof` the runtime's `RuntimeException` and `Exception`, and never its `Error`, as in
// PHP. The grader never imports the runtime (AD-2): it reads the map by its symbol only.
//
// Construction then runs the runtime constructor, which takes PHP's `(string $message, int $code,
// ?Throwable $previous)`; the parent passes only those. The runtime's own `name` and `code` properties are
// removed again, so a grader exception has the same own properties with and without the map (each class
// sets its `name`, and PHPUnit's `Exception` its read-only `code`). With no map, the chain is the one the
// grader had before Story 9.11: the class, this parent, the JS `Error`.
const PHP_CLASSES = Symbol.for("xaravel.php.classes");
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

type PhpClass = abstract new (...args: never[]) => object;

/** The runtime's class map, when published: PHP's built-in classes by declared name (`docs/exceptions.md`). */
export function phpClassMap(): Readonly<Record<string, unknown>> | null {
  const map: unknown = (globalThis as Record<symbol, unknown>)[PHP_CLASSES];
  return typeof map === "object" && map !== null ? (map as Readonly<Record<string, unknown>>) : null;
}

/** The runtime's PHP class `name`, when the map is published and holds it. */
export function phpClass(name: string): PhpClass | null {
  const found: unknown = phpClassMap()?.[name];
  return typeof found === "function" ? (found as PhpClass) : null;
}

let linked = false;

/** Re-parents `RuntimeExceptionParent` onto the runtime's `RuntimeException` once the map is published. */
function link(): boolean {
  if (!linked) {
    const parent = phpClass("RuntimeException");
    if (parent !== null) {
      Object.setPrototypeOf(RuntimeExceptionParent, parent);
      Object.setPrototypeOf(RuntimeExceptionParent.prototype, parent.prototype);
      linked = true;
    }
  }
  return linked;
}

export class RuntimeExceptionParent extends Error {
  /**
   * The class-name brand a subclass without its own reads (ESC-4.3-1 item 1): its JS name, as before the link, never
   * the runtime parent's `RuntimeException`.
   */
  static get [CLASS_FQCN](): string {
    return this.name;
  }

  constructor(message: string = "", code: number = 0, previous: Error | null = null) {
    const runtime = link();
    // The runtime's `RuntimeException(message, code, previous)` once linked, else the JS `Error(message, options)`.
    const args: [string, ErrorOptions?] = runtime
      ? ([message, code, previous] as unknown as [string, ErrorOptions?])
      : previous === null
        ? [message]
        : [message, { cause: previous }];
    super(...args);
    if (runtime) {
      // The runtime's own `name` and `code`: each grader class sets its own, as without the map.
      delete (this as { name?: unknown }).name;
      delete (this as { code?: unknown }).code;
    }
  }

  /** PHP's `getMessage()` (a subclass with its own message keeps overriding it). */
  getMessage(): string {
    return this.message;
  }

  /** PHP's `getCode()`: the `code` property when it is set, else 0. */
  getCode(): unknown {
    return (this as { code?: unknown }).code ?? 0;
  }

  /** PHP's `getPrevious()`: the JS `cause` when it is an error, else null. */
  getPrevious(): Error | null {
    return this.cause instanceof Error ? this.cause : null;
  }
}

link();
