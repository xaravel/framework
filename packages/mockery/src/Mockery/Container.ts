// `Mockery\Container` (Mockery 1.6.15, Container.php): the mocks of one test,
// verified and torn down together, and the global call order.
//
// `mock(...args)` parses its arguments as Container::parseArguments does
// (Container.php 627-740): a trailing function (with two or more arguments)
// runs with the new mock before it is remembered; a class is a target (the
// first class is the one the mock extends, so `instanceof` holds for it only;
// ESC-4.6-1 item 8); a string is a class name, `'A, B'` or `'A|B'` lists of
// names, or a `'Foo[m1,!m2]'` partial (the real constructor runs with no
// arguments); an object is a proxied partial; a list is constructor
// arguments (the real constructor runs with them); a string-keyed map is
// quick definitions (`shouldReceive(map)->byDefault()`). A class-name string
// resolves to a class only through the class-lookup protocol (ESC-4.6-1 item
// 9); an unresolved name is a display-only part of the mock's name. A
// contract token object (`@xaravel/assert`'s `isContractToken`: an
// `@xaravel/contracts` token or a runtime PHP-interface token, PORTING.md's
// `Mockery.mock(X)` form; ESC-14.1-11 option 1) is an interface target: the
// mock is `instanceof` it and every contract it extends, and its name carries
// the token's FQCN. A token with an empty FQCN cannot be parsed.
// `alias:` and `overload:` mocks are PHP-only (ESC-4.6-1 item 3). Anything
// else throws `Mockery\Exception('Unable to parse arguments sent to
// Mockery\Container::mock()')`.
import { LogicException } from "../php/LogicException";
import { lookupClass } from "../support/classes";
import { contractTokenName, isContractToken } from "@xaravel/assert";
import { arrayEntries, classNameOf, FQCN, isClass, isClosure, isPhpArray, isPhpObject } from "../support/values";
import { Exception } from "./Exception";
import { InvalidArgumentException } from "./Exception/InvalidArgumentException";
import { InvalidOrderException } from "./Exception/InvalidOrderException";
import type { LegacyMockInterface, MockObject } from "./LegacyMockInterface";
import { Mock, type MockSpec } from "./Mock";

type AnyClass = abstract new (...args: never[]) => object;

interface Parsed {
  closure: ((mock: MockObject) => unknown) | null;
  targets: (AnyClass | string)[];
  token: symbol | null;
  contracts: object[];
  partialObject: object | null;
  whiteList: string[] | null;
  blackList: string[];
  quickDefinitions: Record<string, unknown> | null;
  constructorArgs: unknown[] | null;
}

export class Container {
  static readonly [FQCN]: string = "Mockery\\Container";

  protected _allocatedOrder = 0;
  protected _currentOrder = 0;
  protected _groups = new Map<string, number>();
  protected _mocks: MockObject[] = [];

  /** A new mock, remembered by this container (see the header for the argument forms). */
  mock<T extends object>(target: abstract new (...args: never[]) => T, ...args: unknown[]): MockObject<T>;
  mock(...args: unknown[]): MockObject;
  mock(...args: unknown[]): MockObject {
    const parsed = this.parseArguments([...args]);
    let constructorArgs = parsed.constructorArgs;
    if ((parsed.whiteList !== null || parsed.blackList.length > 0) && constructorArgs === null) {
      constructorArgs = [];
    }
    let parent: AnyClass | null = null;
    const parts: string[] = [];
    for (const target of parsed.targets) {
      const resolved = typeof target === "string" ? lookupClass(target) : target;
      if (parent === null && resolved !== null && parsed.partialObject === null) {
        parent = resolved;
        continue;
      }
      parts.push(typeof target === "string" ? target : (classNameOf(target) ?? "class@anonymous"));
    }
    if (parsed.partialObject !== null) {
      parent = (Object.getPrototypeOf(parsed.partialObject) as { constructor?: unknown } | null)?.constructor as AnyClass | null;
      if (!isClass(parent)) {
        parent = null;
      }
    }
    const spec: MockSpec = {
      parent,
      token: parsed.token,
      contracts: parsed.contracts,
      parts,
      partialObject: parsed.partialObject,
      whiteList: parsed.whiteList,
      blackList: parsed.blackList,
      constructorArgs,
    };
    const mock = Mock.build(this, spec);
    if (parsed.quickDefinitions !== null) {
      mock.shouldReceive(parsed.quickDefinitions).byDefault();
    }
    if (parsed.closure !== null) {
      parsed.closure(mock);
    }
    this._mocks.push(mock);
    return mock;
  }

  /** The last mock remembered (`Mockery::self()`). */
  self(): MockObject {
    const mock = this._mocks.at(-1);
    if (mock === undefined) {
      throw new LogicException("You have not declared any mocks yet");
    }
    return mock;
  }

  getMocks(): readonly MockObject[] {
    return this._mocks;
  }

  mockery_allocateOrder(): number {
    return ++this._allocatedOrder;
  }

  /** Resets the container: tears down each mock and forgets them all. */
  mockery_close(): void {
    for (const mock of this._mocks) {
      mock.mockery_teardown();
    }
    this._mocks = [];
  }

  mockery_getCurrentOrder(): number {
    return this._currentOrder;
  }

  /** The number of call-count-constrained expectations of every mock (what PHPUnit adds to its assertion count). */
  mockery_getExpectationCount(): number {
    let count = 0;
    for (const mock of this._mocks) {
      count += mock.mockery_getExpectationCount();
    }
    return count;
  }

  mockery_getGroups(): ReadonlyMap<string, number> {
    return this._groups;
  }

  mockery_setCurrentOrder(order: number): void {
    this._currentOrder = order;
  }

  mockery_setGroup(group: string | number, order: number): void {
    this._groups.set(String(group), order);
  }

  /** Verifies every mock; on the first failure it closes the container and rethrows. */
  mockery_teardown(): void {
    try {
      this.mockery_verify();
    } catch (error) {
      this.mockery_close();
      throw error;
    }
  }

  mockery_thrownExceptions(): unknown[] {
    const exceptions: unknown[] = [];
    for (const mock of this._mocks) {
      exceptions.push(...mock.mockery_thrownExceptions());
    }
    return exceptions;
  }

  mockery_validateOrder(method: string, order: number, mock: LegacyMockInterface): void {
    if (order < this._currentOrder) {
      const invalidOrderException = new InvalidOrderException(`Method ${method} called out of order: expected order ${order}, was ${this._currentOrder}`);
      invalidOrderException.setMock(mock).setMethodName(method).setExpectedOrder(order).setActualOrder(this._currentOrder);
      throw invalidOrderException;
    }
    this.mockery_setCurrentOrder(order);
  }

  /** Verifies each mock, in the order they were made. */
  mockery_verify(): void {
    for (const mock of this._mocks) {
      mock.mockery_verify();
    }
  }

  private parseArguments(args: unknown[]): Parsed {
    const parsed: Parsed = { closure: null, targets: [], token: null, contracts: [], partialObject: null, whiteList: null, blackList: [], quickDefinitions: null, constructorArgs: null };
    if (args.length >= 2) {
      const last = args.at(-1);
      if (isClosure(last)) {
        parsed.closure = args.pop() as (mock: MockObject) => unknown;
      }
    }
    while (args.length > 0) {
      const argument = args.shift();
      if (typeof argument === "string") {
        this.parseStringArgument(argument, parsed);
        continue;
      }
      if (isClass(argument)) {
        parsed.targets.push(argument);
        continue;
      }
      if (typeof argument === "symbol") {
        // A contract token (ESC-4.5-1 item 3).
        parsed.token = argument;
        continue;
      }
      if (isContractToken(argument)) {
        // A contract token object (ESC-14.1-11 option 1), before the PHP-array test that would read it as quick
        // definitions.
        if (contractTokenName(argument) === null) {
          throw new Exception("Unable to parse arguments sent to Mockery\\Container::mock()");
        }
        if (!parsed.contracts.includes(argument)) {
          parsed.contracts.push(argument);
        }
        continue;
      }
      if (argument === null) {
        // `Mockery.mock(null)`: no target, as Story 4.5 reads it.
        continue;
      }
      if (isPhpArray(argument)) {
        this.parseArrayArgument(argument, parsed);
        continue;
      }
      if (isPhpObject(argument)) {
        parsed.partialObject = argument;
        continue;
      }
      throw new Exception("Unable to parse arguments sent to Mockery\\Container::mock()");
    }
    return parsed;
  }

  private parseArrayArgument(argument: unknown, parsed: Parsed): void {
    if (Array.isArray(argument)) {
      parsed.constructorArgs = [...(argument as unknown[])];
      return;
    }
    const entries = arrayEntries(argument);
    if (entries.every(([key], index) => key === index)) {
      parsed.constructorArgs = entries.map(([, value]) => value);
      return;
    }
    parsed.quickDefinitions = Object.fromEntries(entries.map(([key, value]) => [String(key), value]));
  }

  private parseStringArgument(argument: string, parsed: Parsed): void {
    for (const type of argument.split("|")) {
      if (argument === "null") {
        continue;
      }
      if (type.includes(",") && !type.includes("]")) {
        parsed.targets.push(...type.replace(/ /g, "").split(","));
        continue;
      }
      if (type.startsWith("alias:") || type.startsWith("overload:")) {
        throw new InvalidArgumentException(`Mockery.mock('${argument}'): alias: and overload: mocks are PHP-only (PHP class aliasing and autoload interception have no JS analogue; ESC-4.6-1 item 3)`);
      }
      if (type.endsWith("]")) {
        const [className = "", methods = ""] = type.split("[");
        const resolved = lookupClass(className);
        if (resolved === null) {
          throw new Exception("Can only create a partial mock from an existing class or interface");
        }
        parsed.targets.push(resolved);
        const partialMethods = methods
          .replace(/ /g, "")
          .replace(/\]+$/, "")
          .toLowerCase()
          .split(",")
          .filter((method) => method !== "");
        for (const partialMethod of partialMethods) {
          if (partialMethod.startsWith("!")) {
            parsed.blackList.push(partialMethod.slice(1));
          } else {
            (parsed.whiteList ??= []).push(partialMethod);
          }
        }
        continue;
      }
      parsed.targets.push(type);
    }
  }
}
