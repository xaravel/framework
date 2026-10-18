// `Mockery\LegacyMockInterface` (Mockery 1.6.15): the Mockery API every mock
// object answers, as a type. Story 4.5's subset; Story 4.6 adds the rest.
import type { CompositeExpectation } from "./CompositeExpectation";
import type { Container } from "./Container";
import type { BadMethodCallException } from "./Exception/BadMethodCallException";
import type { ExpectationDirector } from "./ExpectationDirector";

export interface LegacyMockInterface {
  shouldReceive(...methodNames: (string | Readonly<Record<string, unknown>>)[]): CompositeExpectation;
  mockery_getName(): string;
  mockery_getContainer(): Container;
  mockery_verify(): void;
  mockery_teardown(): void;
  mockery_getExpectationCount(): number;
  mockery_getExpectations(): ReadonlyMap<string, ExpectationDirector>;
  mockery_getExpectationsFor(method: string): ExpectationDirector | null;
  mockery_setExpectationsFor(method: string, director: ExpectationDirector): void;
  mockery_allocateOrder(): number;
  mockery_setGroup(group: string | number, order: number): void;
  mockery_getGroups(): ReadonlyMap<string, number>;
  mockery_setCurrentOrder(order: number): void;
  mockery_getCurrentOrder(): number;
  mockery_validateOrder(method: string, order: number): void;
  mockery_thrownExceptions(): BadMethodCallException[];
  toString(): string;
}

/** A mock of `T`: `T`'s members plus the Mockery API; any other method name dispatches to its expectations. */
export type MockObject<T extends object = object> = T & LegacyMockInterface & { [method: string]: any };
