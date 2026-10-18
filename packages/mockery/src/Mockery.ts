// `Mockery` (Mockery 1.6.15, Mockery.php): the static entry point. Story 4.5:
// `mock`, `close`, `getContainer`, `formatArgs` and `formatObjects`.
//
// Test finish (ESC-4.5-1 item 1). `getContainer()` returns the container of
// the current run (an AsyncLocalStorage store), else a process-level one.
// `globalThis[Symbol.for('xaravel.mockery.run')](fn)` runs `fn` with a fresh
// container: when `fn` rejects, the container is closed without verifying and
// the error is rethrown; when it resolves, `Mockery.close()` runs. `close()`
// records one `mockeryExpectation` assertion per call-count-constrained
// expectation (`mockery_getExpectationCount()`, which PHPUnit adds to its
// assertion count), detaches the container, then verifies it
// (`mockery_teardown`). `portedTest` and `xaravelTest` call the protocol.
//
// Mutable state lives in module variables and the store, never in statics.
import { recordAssertion } from "@xaravel/assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { Container } from "./Mockery/Container";
import type { MockObject } from "./Mockery/LegacyMockInterface";
import { MatcherAbstract } from "./Mockery/Matcher/MatcherAbstract";
import { type Formattable, FQCN, formatArgument, isPhpObject, objectToArray, getClass, varExport } from "./support/values";

interface ContainerSlot {
  container: Container | null;
}

const storage = new AsyncLocalStorage<ContainerSlot>();
const processSlot: ContainerSlot = { container: null };
/** `formatObjects`' `static $formatting` recursion guard. */
let formatting = false;

function currentSlot(): ContainerSlot {
  return storage.getStore() ?? processSlot;
}

function isMatcher(value: unknown): value is Formattable {
  return value instanceof MatcherAbstract;
}

export class Mockery {
  static readonly [FQCN]: string = "Mockery";

  /** Closes and verifies the current container: counts its expectations, detaches it, then verifies every mock. */
  static close(): void {
    const slot = currentSlot();
    const container = slot.container;
    if (container === null) {
      return;
    }
    const count = container.mockery_getExpectationCount();
    for (let index = 0; index < count; index++) {
      recordAssertion("mockeryExpectation");
    }
    slot.container = null;
    container.mockery_teardown();
    container.mockery_close();
  }

  /** `method(<formatted args>)`, or `method()` for null. */
  static formatArgs(method: string, args: readonly unknown[] | null = null): string {
    if (args === null) {
      return `${method}()`;
    }
    return `${method}(${args.map((argument) => formatArgument(argument, isMatcher)).join(", ")})`;
  }

  /** `Objects: ( <var_export of each object argument as an array> )`, or `''` when there is none. */
  static formatObjects(objects: readonly unknown[] | null = null): string {
    if (formatting) {
      return "[Recursion]";
    }
    if (objects === null) {
      return "";
    }
    const filtered = objects.filter((object): object is object => isPhpObject(object));
    if (filtered.length === 0) {
      return "";
    }
    formatting = true;
    try {
      const parts: [string, unknown][] = [];
      for (const object of filtered) {
        const className = getClass(object);
        const value = objectToArray(object);
        const existing = parts.find(([name]) => name === className);
        if (existing === undefined) {
          parts.push([className, value]);
        } else {
          existing[1] = value;
        }
      }
      return `Objects: ( ${varExport(Object.fromEntries(parts))})`;
    } finally {
      formatting = false;
    }
  }

  /** The current container: the run's, else the process-level one; created when absent. */
  static getContainer(): Container {
    const slot = currentSlot();
    slot.container ??= new Container();
    return slot.container;
  }

  /** `getContainer().mock(...)`. */
  static mock<T extends object>(target: abstract new (...args: never[]) => T): MockObject<T>;
  static mock(target?: string | symbol): MockObject;
  static mock(...args: unknown[]): MockObject {
    return (Mockery.getContainer().mock as (...args: unknown[]) => MockObject)(...args);
  }
}

/** The run protocol: `fn` with a fresh container, closed (and verified) when `fn` resolves. */
async function run<T>(fn: () => T | Promise<T>): Promise<T> {
  const slot: ContainerSlot = { container: null };
  let result: T;
  try {
    result = await storage.run(slot, fn);
  } catch (error) {
    const container = slot.container;
    slot.container = null;
    container?.mockery_close();
    throw error;
  }
  storage.run(slot, () => {
    Mockery.close();
  });
  return result;
}

function install(key: symbol, value: unknown): void {
  if (Object.getOwnPropertyDescriptor(globalThis, key) !== undefined) {
    return;
  }
  Object.defineProperty(globalThis, key, { value, writable: false, configurable: false, enumerable: false });
}

install(Symbol.for("xaravel.mockery.mock"), Object.freeze((...args: unknown[]): MockObject => (Mockery.mock as (...args: unknown[]) => MockObject)(...args)));
install(Symbol.for("xaravel.mockery.run"), Object.freeze(run));
