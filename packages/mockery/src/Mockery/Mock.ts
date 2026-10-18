// `Mockery\Mock` (Mockery 1.6.15, Mock.php) and the mock-class generator's
// naming (Generator/MockNameBuilder.php). Internal: the package exports the
// mock objects it builds, not this class.
//
// A mock of a class `X` is an instance of a generated class
// `Mockery_<n>_X extends X`, made by `Object.create` so `X`'s constructor never
// runs (Mockery's Instantiator), and wrapped in a Proxy whose `get` resolves a
// string key in this order:
//
//   1. a method with an ExpectationDirector (exact name, then case-insensitive)
//      -> a dispatcher;
//   2. a Mockery API member (`shouldReceive`, `mockery_*`, `toString`) -> itself;
//   3. a function declared on `X`'s prototype chain above Object.prototype
//      -> a dispatcher;
//   4. any other property present on the object, and `then` -> Reflect.get
//      (an absent `then` is undefined, so `await mock` is no method call);
//   5. any other string -> a dispatcher.
//
// Symbol keys always use Reflect.get. A dispatcher runs
// `_mockery_handleMethodCall(name, args)`.
import { InvalidArgumentException as PhpInvalidArgumentException } from "../php/InvalidArgumentException";
import { classNameOf, FQCN, objectId } from "../support/values";
import { CompositeExpectation } from "./CompositeExpectation";
import type { Container } from "./Container";
import { BadMethodCallException } from "./Exception/BadMethodCallException";
import { InvalidArgumentException } from "./Exception/InvalidArgumentException";
import { InvalidOrderException } from "./Exception/InvalidOrderException";
import { Expectation } from "./Expectation";
import { ExpectationDirector } from "./ExpectationDirector";
import type { LegacyMockInterface, MockObject } from "./LegacyMockInterface";

/** What `Container.mock` accepts as a target: a class, a class-name string (or contract token), or nothing. */
export type MockTarget = (abstract new (...args: never[]) => object) | string | symbol | null;

interface Generated {
  readonly name: string;
  readonly generated: new () => object;
}

/** Mockery's process-wide `MockNameBuilder::$mockCounter`; a target seen before reuses its class. */
let mockCounter = 0;
const generatedByTarget = new Map<unknown, Generated>();
const NO_TARGET = Symbol("no target");

function generatedFor(target: MockTarget): Generated {
  const key = target ?? NO_TARGET;
  const known = generatedByTarget.get(key);
  if (known !== undefined) {
    return known;
  }
  let part: string | null;
  if (typeof target === "function") {
    part = classNameOf(target) ?? "class@anonymous";
  } else if (typeof target === "symbol") {
    part = target.description ?? "";
  } else {
    part = target;
  }
  const name = ["Mockery", String(mockCounter++), ...(part === null ? [] : [part.replace(/\\/g, "_")])].join("_");
  const generated: new () => object =
    typeof target === "function" ? class extends (target as unknown as new () => object) {} : class {};
  Object.defineProperty(generated, "name", { value: name });
  Object.defineProperty(generated, FQCN, { value: name });
  const entry: Generated = { name, generated };
  generatedByTarget.set(key, entry);
  return entry;
}

/** The Mockery API members the Proxy answers itself (step 2). */
let apiMembers: ReadonlySet<string> | null = null;

export class Mock implements LegacyMockInterface {
  static readonly [FQCN]: string = "Mockery\\Mock";

  protected _mockery_expectations = new Map<string, ExpectationDirector>();
  protected _mockery_expectations_count = 0;
  protected _mockery_name: string;
  protected _mockery_container: Container;
  protected _mockery_allocatedOrder = 0;
  protected _mockery_currentOrder = 0;
  protected _mockery_groups = new Map<string, number>();
  protected _mockery_verified = false;
  protected _mockery_thrownExceptions: BadMethodCallException[] = [];
  /** The object behind the Proxy: an instance of the generated class. */
  protected readonly _mockery_instance: object;
  /** The mock object itself (the Proxy), which expectations hold. */
  protected _mockery_self: MockObject;
  readonly #bound = new Map<string, unknown>();
  readonly #dispatchers = new Map<string, (...args: unknown[]) => unknown>();

  private constructor(container: Container, generated: Generated) {
    this._mockery_container = container;
    this._mockery_name = generated.name;
    this._mockery_instance = Object.create(generated.generated.prototype) as object;
    this._mockery_self = new Proxy(this._mockery_instance, this.#handler()) as MockObject;
  }

  /** Builds a mock of `target` in `container`: a Proxy over an instance of `Mockery_<n>[_<target>]`. */
  static build(container: Container, target: MockTarget): MockObject {
    return new Mock(container, generatedFor(target))._mockery_self;
  }

  /**
   * Expects calls of each named method (several names give one CompositeExpectation over all of them). A
   * string-keyed object expects each key and returns its value.
   */
  shouldReceive(...methodNames: (string | Readonly<Record<string, unknown>>)[]): CompositeExpectation {
    if (methodNames.length === 0) {
      // Mockery's HigherOrderMessage form is Story 4.6's.
      throw new InvalidArgumentException("shouldReceive() without a method name (a HigherOrderMessage) is not supported yet (Story 4.6)");
    }
    for (const method of methodNames) {
      if (method === "") {
        throw new PhpInvalidArgumentException("Received empty method name");
      }
    }
    const compositeExpectation = new CompositeExpectation();
    for (const arg of methodNames) {
      if (typeof arg === "string") {
        compositeExpectation.add(this.#expect(arg));
        continue;
      }
      if (typeof arg === "object" && arg !== null) {
        for (const [method, value] of Object.entries(arg)) {
          compositeExpectation.add(this.#expect(method).andReturn(value));
        }
      }
    }
    return compositeExpectation;
  }

  mockery_getName(): string {
    return this._mockery_name;
  }

  mockery_getContainer(): Container {
    return this._mockery_container;
  }

  mockery_verify(): void {
    if (this._mockery_verified) {
      return;
    }
    this._mockery_verified = true;
    for (const mockeryExpectation of this._mockery_expectations.values()) {
      mockeryExpectation.verify();
    }
  }

  mockery_teardown(): void {}

  mockery_getExpectationCount(): number {
    let count = this._mockery_expectations_count;
    for (const mockeryExpectation of this._mockery_expectations.values()) {
      count += mockeryExpectation.getExpectationCount();
    }
    return count;
  }

  mockery_getExpectations(): ReadonlyMap<string, ExpectationDirector> {
    return this._mockery_expectations;
  }

  mockery_getExpectationsFor(method: string): ExpectationDirector | null {
    return this._mockery_expectations.get(method) ?? null;
  }

  mockery_setExpectationsFor(method: string, director: ExpectationDirector): void {
    this._mockery_expectations.set(method, director);
  }

  mockery_allocateOrder(): number {
    return ++this._mockery_allocatedOrder;
  }

  mockery_setGroup(group: string | number, order: number): void {
    this._mockery_groups.set(String(group), order);
  }

  mockery_getGroups(): ReadonlyMap<string, number> {
    return this._mockery_groups;
  }

  mockery_setCurrentOrder(order: number): void {
    this._mockery_currentOrder = order;
  }

  mockery_getCurrentOrder(): number {
    return this._mockery_currentOrder;
  }

  mockery_validateOrder(method: string, order: number): void {
    if (order < this._mockery_currentOrder) {
      const invalidOrderException = new InvalidOrderException(
        `Method ${this._mockery_name}::${method}() called out of order: expected order ${order}, was ${this._mockery_currentOrder}`,
      );
      invalidOrderException.setMock(this._mockery_self).setMethodName(method).setExpectedOrder(order).setActualOrder(this._mockery_currentOrder);
      throw invalidOrderException;
    }
    this.mockery_setCurrentOrder(order);
  }

  mockery_thrownExceptions(): BadMethodCallException[] {
    return this._mockery_thrownExceptions;
  }

  toString(): string {
    return `${this._mockery_name}#${objectId(this._mockery_instance)}`;
  }

  /** `_mockery_findExpectedMethodHandler`: the director of `method`, exact name first, then case-insensitive. */
  protected _mockery_findExpectedMethodHandler(method: string): ExpectationDirector | null {
    const exact = this._mockery_expectations.get(method);
    if (exact !== undefined) {
      return exact;
    }
    const lowerCasedMethod = method.toLowerCase();
    for (const [name, director] of this._mockery_expectations) {
      if (name.toLowerCase() === lowerCasedMethod) {
        return director;
      }
    }
    return null;
  }

  /** `mockery_getMethod`: whether the mocked class declares `method` (a function above Object.prototype). */
  protected _mockery_declaresMethod(method: string): boolean {
    if (method === "constructor") {
      return false;
    }
    for (let prototype: unknown = Object.getPrototypeOf(this._mockery_instance); typeof prototype === "object" && prototype !== null && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
      if (descriptor !== undefined) {
        return typeof descriptor.value === "function";
      }
    }
    return false;
  }

  protected _mockery_handleMethodCall(method: string, args: unknown[]): unknown {
    const expectationDirector = this._mockery_findExpectedMethodHandler(method);
    if (expectationDirector !== null) {
      return expectationDirector.call(args);
    }
    const message = this._mockery_declaresMethod(method)
      ? `Received ${this._mockery_name}::${method}(), but no expectations were specified`
      : `Method ${this._mockery_name}::${method}() does not exist on this mock object`;
    const badMethodCallException = new BadMethodCallException(message);
    this._mockery_thrownExceptions.push(badMethodCallException);
    throw badMethodCallException;
  }

  #expect(method: string): Expectation {
    if (method.includes("->")) {
      // Demeter chains are not in Story 4.5 (ESC-4.5-1 item 6).
      throw new InvalidArgumentException(`shouldReceive('${method}'): demeter chains are not supported yet`);
    }
    let director = this.mockery_getExpectationsFor(method);
    if (director === null) {
      director = new ExpectationDirector(method, this._mockery_self);
      this.mockery_setExpectationsFor(method, director);
    }
    const expectation = new Expectation(this._mockery_self, method);
    director.addExpectation(expectation);
    return expectation;
  }

  #dispatcher(method: string): (...args: unknown[]) => unknown {
    let dispatcher = this.#dispatchers.get(method);
    if (dispatcher === undefined) {
      dispatcher = (...args: unknown[]): unknown => this._mockery_handleMethodCall(method, args);
      this.#dispatchers.set(method, dispatcher);
    }
    return dispatcher;
  }

  #api(member: string): unknown {
    let bound = this.#bound.get(member);
    if (bound === undefined) {
      bound = ((Mock.prototype as unknown as Record<string, (...args: unknown[]) => unknown>)[member] as (...args: unknown[]) => unknown).bind(this);
      this.#bound.set(member, bound);
    }
    return bound;
  }

  #handler(): ProxyHandler<object> {
    return {
      get: (target, key, receiver): unknown => {
        if (typeof key === "symbol") {
          return Reflect.get(target, key, receiver);
        }
        if (this._mockery_findExpectedMethodHandler(key) !== null) {
          return this.#dispatcher(key);
        }
        apiMembers ??= new Set(Object.getOwnPropertyNames(Mock.prototype).filter((name) => name === "shouldReceive" || name === "toString" || name.startsWith("mockery_")));
        if (apiMembers.has(key)) {
          return this.#api(key);
        }
        if (this._mockery_declaresMethod(key)) {
          return this.#dispatcher(key);
        }
        if (key in target || key === "then") {
          return Reflect.get(target, key, receiver);
        }
        return this.#dispatcher(key);
      },
    };
  }
}
