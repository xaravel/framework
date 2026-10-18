// `Mockery\Container` (Mockery 1.6.15, Container.php): the mocks of one test,
// verified and torn down together, and the global call order.
//
// `mock()` takes a class, a class-name string (or contract token) or nothing;
// Mockery's other argument forms are not in Story 4.5 (ESC-4.5-1 item 6).
import { FQCN, isClass } from "../support/values";
import { InvalidArgumentException } from "./Exception/InvalidArgumentException";
import { InvalidOrderException } from "./Exception/InvalidOrderException";
import type { LegacyMockInterface, MockObject } from "./LegacyMockInterface";
import { Mock, type MockTarget } from "./Mock";

export class Container {
  static readonly [FQCN]: string = "Mockery\\Container";

  protected _allocatedOrder = 0;
  protected _currentOrder = 0;
  protected _groups = new Map<string, number>();
  protected _mocks: MockObject[] = [];

  /** A new mock of `target`, remembered by this container. */
  mock<T extends object>(target: abstract new (...args: never[]) => T): MockObject<T>;
  mock(target?: string | symbol): MockObject;
  mock(...args: unknown[]): MockObject {
    if (args.length > 1) {
      throw new InvalidArgumentException("Mockery.mock() takes a class, a class-name string or nothing; other argument forms are not supported yet (ESC-4.5-1 item 6)");
    }
    const target: unknown = args.length === 0 ? null : args[0];
    if (target !== null && !isClass(target) && typeof target !== "string" && typeof target !== "symbol") {
      throw new InvalidArgumentException("Mockery.mock() takes a class, a class-name string or nothing; other argument forms are not supported yet (ESC-4.5-1 item 6)");
    }
    if (typeof target === "string" && (target.includes(",") || target.includes("[") || /^(alias|overload):/.test(target))) {
      throw new InvalidArgumentException(`Mockery.mock('${target}'): interface lists, partials and alias:/overload: mocks are not supported yet (ESC-4.5-1 item 6)`);
    }
    const mock = Mock.build(this, target as MockTarget);
    this._mocks.push(mock);
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
}
