// `Mockery\LegacyMockInterface` (Mockery 1.6.15): the Mockery API every mock
// object answers, as a type.
import type { CompositeExpectation } from "./CompositeExpectation";
import type { Container } from "./Container";
import type { BadMethodCallException } from "./Exception/BadMethodCallException";
import type { ExpectationDirector } from "./ExpectationDirector";
import type { VerificationDirector } from "./VerificationDirector";

/** A method name, or a string-keyed map of method names to return values. */
export type MethodNames = (string | Readonly<Record<string, unknown>>)[];

export interface LegacyMockInterface {
  /** With no name: a HigherOrderMessage (`m.shouldReceive().foo(1)`). */
  shouldReceive(): any;
  shouldReceive(...methodNames: MethodNames): CompositeExpectation;
  /** With no name: a HigherOrderMessage. */
  shouldNotReceive(): any;
  shouldNotReceive(...methodNames: MethodNames): CompositeExpectation;
  /** A method name expects it; a map expects each and returns its value (the mock); nothing gives a HigherOrderMessage. */
  allows(something?: string | Readonly<Record<string, unknown>> | readonly unknown[] | null): any;
  /** A method name expects it once; nothing gives an ExpectsHigherOrderMessage. */
  expects(something?: string | null): any;
  shouldIgnoreMissing(returnValue?: unknown, recursive?: boolean): this;
  shouldAllowMockingProtectedMethods(): this;
  makePartial(): this;
  shouldDeferMissing(): this;
  byDefault(): this;
  /** With no name: a HigherOrderMessage. */
  shouldHaveReceived(): any;
  shouldHaveReceived(method: string, args?: readonly unknown[] | ((...args: any[]) => unknown) | null): VerificationDirector;
  /** With no name: a HigherOrderMessage. */
  shouldNotHaveReceived(): any;
  shouldNotHaveReceived(method: string, args?: readonly unknown[] | ((...args: any[]) => unknown) | null): null;
  shouldHaveBeenCalled(): VerificationDirector;
  shouldNotHaveBeenCalled(args?: readonly unknown[] | null): null;
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
  mockery_returnValueForMethod(name: string): unknown;
  mockery_callSubjectMethod(name: string, args: readonly unknown[]): unknown;
  toString(): string;
}

/** A mock of `T`: `T`'s members plus the Mockery API; any other method name dispatches to its expectations. */
export type MockObject<T extends object = object> = T & LegacyMockInterface & { [method: string]: any };
