// `Mockery` (Mockery 1.6.15, Mockery.php): the static entry point: `mock`,
// `spy`, `close`, `getContainer`, `self`, the matchers `any`, `on`, `type` and
// `capture`, and `formatArgs`/`formatObjects`.
//
// Test finish (ESC-4.5-1 item 1). `getContainer()` returns the container of
// the current run (an AsyncLocalStorage store), else a process-level one.
// `globalThis[Symbol.for('xaravel.mockery.run')](fn)` runs `fn` with the run's
// own container. A run adopts the process-level container, if one exists (a
// mock made at file load or in a bare `bun:test` hook), as its container and
// empties the process slot, so the next test to finish verifies it, as
// PHPUnit's tearDown closes Mockery's one global container; otherwise the run
// starts with none. A process-level container with no run after it (made
// after the last run, or in a file with no later test) is never closed, as
// PHPUnit's global container is closed only by a test's tearDown. When `fn`
// rejects, the run's container (adopted or not) is closed without verifying
// and the error is rethrown; when it resolves, `Mockery.close()` runs.
// `close()` called outside a run closes the process slot as before.
//
// Loading installs both globals non-writable and non-configurable. If either
// symbol already holds a property that is not this evaluation's own value, the
// load throws `LogicException` naming it and installs neither (Epic 4 retro
// R4): a foreign `run` would otherwise turn off every verification silently.
// The own-value check is per evaluation, so a second copy of the module throws
// too: two copies keep separate containers, and the run protocol could not
// verify the second copy's mocks.
//
// `close()` records one `mockeryExpectation` assertion per
// call-count-constrained expectation (`mockery_getExpectationCount()`, which
// PHPUnit adds to its assertion count), detaches the container, then verifies
// it (`mockery_teardown`). `portedTest` and `xaravelTest` call the protocol.
//
// Mutable state lives in module variables and the store, never in statics.
import { recordAssertion } from "@xaravel/assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { Container } from "./Mockery/Container";
import type { MockObject } from "./Mockery/LegacyMockInterface";
import { Any } from "./Mockery/Matcher/Any";
import { Closure } from "./Mockery/Matcher/Closure";
import { MatcherAbstract } from "./Mockery/Matcher/MatcherAbstract";
import { Type } from "./Mockery/Matcher/Type";
import { LogicException } from "./php/LogicException";
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

/** A by-reference box (AD-9): `Mockery.capture(ref)` writes the argument to `ref.value` (ESC-4.6-1 item 2). */
export interface Ref<T = unknown> {
  value: T;
}

export class Mockery {
  static readonly [FQCN]: string = "Mockery";

  /** A matcher for any one argument. */
  static any(): Any {
    return new Any();
  }

  /** A matcher that matches any argument and writes it to `reference.value` (PHP's `&$reference`). */
  static capture(reference: Ref): Closure {
    return new Closure((argument: unknown): boolean => {
      reference.value = argument;
      return true;
    });
  }

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
  static mock<T extends object>(target: abstract new (...args: never[]) => T, ...args: unknown[]): MockObject<T>;
  static mock(...args: unknown[]): MockObject;
  static mock(...args: unknown[]): MockObject {
    return (Mockery.getContainer().mock as (...args: unknown[]) => MockObject)(...args);
  }

  /** A matcher for an argument `closure` returns exactly `true` for. */
  static on(closure: (argument: any) => unknown): Closure {
    return new Closure(closure);
  }

  /** The last mock created in the current container. */
  static self(): MockObject {
    const container = currentSlot().container;
    if (container === null) {
      throw new LogicException("You have not declared any mocks yet");
    }
    return container.self();
  }

  /** `mock(...args)->shouldIgnoreMissing()`: a mock that answers every call and records it for `shouldHaveReceived`. */
  static spy<T extends object>(target: abstract new (...args: never[]) => T, ...args: unknown[]): MockObject<T>;
  static spy(...args: unknown[]): MockObject;
  static spy(...args: unknown[]): MockObject {
    return (Mockery.getContainer().mock as (...args: unknown[]) => MockObject)(...args).shouldIgnoreMissing();
  }

  /** A matcher for an argument of PHP type `expected` (`'string'`, `'int'`, …), or of a class. */
  static type(expected: string | (abstract new (...args: never[]) => object)): Type {
    return new Type(expected);
  }
}

/**
 * The run protocol: `fn` with the run's container, closed (and verified) when `fn` resolves. The run adopts the
 * process-level container, if any, and empties the process slot (PHPUnit closes Mockery's one global container
 * at the next test's tearDown).
 */
async function run<T>(fn: () => T | Promise<T>): Promise<T> {
  const slot: ContainerSlot = { container: processSlot.container };
  processSlot.container = null;
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

const mockGlobal = Object.freeze((...args: unknown[]): MockObject => (Mockery.mock as (...args: unknown[]) => MockObject)(...args));
const runGlobal = Object.freeze(run);

// Checks both slots before defining either, so a conflict on one never leaves
// the other half-installed. A slot holding this evaluation's own value is left
// as is; any other property there, whatever its value, throws (R4), including
// one a second copy of this module installed.
function installAll(globals: ReadonlyArray<readonly [string, unknown]>): void {
  const missing: Array<readonly [symbol, unknown]> = [];
  for (const [name, value] of globals) {
    const key = Symbol.for(name);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    if (descriptor === undefined) {
      missing.push([key, value]);
    } else if (!("value" in descriptor) || descriptor.value !== value) {
      throw new LogicException(`Symbol.for('${name}') was already defined by other code or another copy of @xaravel/mockery; @xaravel/mockery will not install over it`);
    }
  }
  for (const [key, value] of missing) {
    Object.defineProperty(globalThis, key, { value, writable: false, configurable: false, enumerable: false });
  }
}

installAll([
  ["xaravel.mockery.mock", mockGlobal],
  ["xaravel.mockery.run", runGlobal],
]);
