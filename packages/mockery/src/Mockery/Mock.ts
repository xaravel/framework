// `Mockery\Mock` (Mockery 1.6.15, Mock.php) and the mock-class generator's
// naming (Generator/MockNameBuilder.php, MockConfiguration::generateName).
// Internal: the package exports the mock objects it builds, not this class.
//
// A mock of a class `X` is an instance of a generated class
// `Mockery_<n>_X extends X`. It is made by `Object.create`, so `X`'s
// constructor never runs (Mockery's Instantiator), unless the mock has
// constructor arguments or is a `X[m]` partial: then `new Mockery_<n>_X(...args)`
// runs it. The instance is wrapped in a Proxy whose `get` resolves a string
// key in this order:
//
//   0. on a `X[m]` partial, a declared method that is not mocked -> X's own
//      method (never recorded, as PHP never reaches `__call`);
//   1. a method with an ExpectationDirector (exact name, then case-insensitive)
//      -> a dispatcher;
//   2. a Mockery API member (`shouldReceive`, `allows`, `mockery_*`,
//      `toString`, ...) -> itself, bound to this Mock;
//   3. a function declared on `X`'s prototype chain above Object.prototype
//      -> a dispatcher;
//   (3a) on a mocked model, a member defined through the mock (AD-7, below);
//   4. any other property present on the object, and `then` -> Reflect.get
//      (an absent `then` is undefined, so `await mock` is no method call);
//   5. any other string -> a dispatcher.
//
// Symbol keys always use Reflect.get. A dispatcher runs
// `_mockery_handleMethodCall(name, args)`, in Mockery's order (Mock.php
// 1007-1114): record the call; the method's director (a
// NoMatchingExpectationException falls through when the mock ignores or
// defers missing calls); a proxied partial's own method; with `makePartial()`,
// X's method, called with the mock as `this`; `__toString`; with
// `shouldIgnoreMissing()`, the default return value; else
// BadMethodCallException. TS visibility does not exist at run time, so every
// method is mockable and `shouldAllowMockingProtectedMethods()` only sets its
// flag (ESC-4.6-1 item 4).
//
// Mocked models (AD-7, ESC-4.6-1 item 1). A model instance carries
// `MODEL_STATE` (`Symbol.for('xaravel.model.state')`), and its constructor may
// return a Proxy whose `defineProperty` trap must never see a string key from
// the grader. When the mocked class's prototype chain declares `MODEL_STATE`
// and the instance has no own slot, Mockery defines one (`{}`) by symbol key.
// A string-keyed `defineProperty` on the mock then lands in the escape slot
// `instance[MODEL_STATE][Symbol.for('xaravel.mockery.members')]` (a
// null-prototype record of descriptors), which `get` reads at step 3a; a
// string-keyed `set` goes to the model itself (`Reflect.set` on the instance,
// the model's own set path, as PHP's `__set`). Mockery never defines a
// string-keyed property on a mock instance itself.
//
// Contract token targets (ESC-14.1-11 option 1). A mock of an `@xaravel/contracts`
// token or a runtime PHP-interface token implements it as Mockery's generated
// class implements an interface: the generated prototype carries the token's
// brand `Symbol.for(<FQCN>)` and the brand of every contract in its parents
// closure (`defineContractBrand` over `contractParentBrands`, as JMac's
// ClassGenerator does), so the mock is `instanceof` each. The token's FQCN is
// a name part after the class parts (the parent's, the symbol token's, then
// the other targets'), as generateName puts the interfaces last
// (`Mockery_0_Illuminate_Contracts_Support_Arrayable`). A method the token
// lists (`contractMethods`) counts as declared in the Proxy's `get` (step 3,
// and the AvoidMethodClashPass check of `allows` / `expects`) and in the
// unexpected-call message `Received <mock>::<m>(), but no expectations were
// specified`; `_mockery_declaresMethod`, partials and passthru read the
// class only. Known limit: a token's built-ins get no JS protocol here.
// A symbol target still defines no brand.
import { contractMethods, contractParentBrands, contractTokenName, defineContractBrand } from "@xaravel/assert";
import { InvalidArgumentException as PhpInvalidArgumentException } from "../php/InvalidArgumentException";
import { classNameOf, FQCN, getClass, objectId } from "../support/values";
import { CompositeExpectation } from "./CompositeExpectation";
import type { Container } from "./Container";
import { Exception } from "./Exception";
import { BadMethodCallException } from "./Exception/BadMethodCallException";
import { InvalidArgumentException } from "./Exception/InvalidArgumentException";
import { InvalidOrderException } from "./Exception/InvalidOrderException";
import { NoMatchingExpectationException } from "./Exception/NoMatchingExpectationException";
import { Expectation } from "./Expectation";
import { ExpectationDirector } from "./ExpectationDirector";
import { ExpectsHigherOrderMessage } from "./ExpectsHigherOrderMessage";
import { HigherOrderMessage } from "./HigherOrderMessage";
import type { LegacyMockInterface, MethodNames, MockObject } from "./LegacyMockInterface";
import { MethodCall } from "./MethodCall";
import { ReceivedMethodCalls } from "./ReceivedMethodCalls";
import { VerificationDirector } from "./VerificationDirector";
import { VerificationExpectation } from "./VerificationExpectation";

type AnyClass = abstract new (...args: never[]) => object;

/** What `Container.mock` accepts as a single target: a class, a class-name string (or contract token), or nothing. */
export type MockTarget = AnyClass | string | symbol | null;

/** What `Container.mock` parsed its arguments into (Container::parseArguments). */
export interface MockSpec {
  /** The class the generated class extends (the first class target), or null. */
  readonly parent: AnyClass | null;
  /** A contract token target (ESC-4.5-1 item 3), or null. */
  readonly token: symbol | null;
  /** The contract token objects the mock implements (ESC-14.1-11 option 1), in order; each has a non-empty FQCN. */
  readonly contracts: readonly object[];
  /** The name parts after the parent's: the other targets' names, in order. */
  readonly parts: readonly string[];
  /** The proxied-partial object, or null. */
  readonly partialObject: object | null;
  /** `X[m1,!m2]`: the mocked methods (lower case), or null for a mock of every method. */
  readonly whiteList: readonly string[] | null;
  /** `X[!m2]`: the methods left to `X` (lower case). */
  readonly blackList: readonly string[];
  /** Arguments for the real constructor, or null when it does not run. */
  readonly constructorArgs: readonly unknown[] | null;
}

interface Generated {
  readonly name: string;
  readonly generated: new (...args: unknown[]) => object;
  /** The lower-cased names of the methods the contract targets list (`contractMethods`). */
  readonly contractMethods: ReadonlySet<string>;
}

const MODEL_STATE = Symbol.for("xaravel.model.state");
const MEMBERS = Symbol.for("xaravel.mockery.members");

/** Mockery's process-wide `MockNameBuilder::$mockCounter`; a configuration seen before reuses its class. */
let mockCounter = 0;
/** Generated classes by parent class, then contract token, then the rest of the configuration. */
const generatedByTarget = new Map<unknown, Map<unknown, Map<string, Generated>>>();
const NO_TARGET = Symbol("no target");
/** A process-wide id per contract token object, so the cache keys on the token itself, never only on its name. */
const contractIds = new WeakMap<object, number>();
let contractIdCounter = 0;

function contractId(token: object): number {
  let id = contractIds.get(token);
  if (id === undefined) {
    id = contractIdCounter++;
    contractIds.set(token, id);
  }
  return id;
}

/** A contract token's FQCN (`contractTokenName`); a token with none cannot be parsed, as Container::mock() reports. */
function tokenName(token: object): string {
  const name = contractTokenName(token);
  if (name === null) {
    throw new Exception("Unable to parse arguments sent to Mockery\\Container::mock()");
  }
  return name;
}

function generatedFor(spec: MockSpec): Generated {
  const parentKey = spec.parent ?? NO_TARGET;
  const tokenKey = spec.token ?? NO_TARGET;
  const config = JSON.stringify([spec.partialObject === null ? null : getClass(spec.partialObject), spec.contracts.map(contractId), spec.parts, spec.whiteList, spec.blackList, spec.constructorArgs !== null]);
  let byToken = generatedByTarget.get(parentKey);
  let byConfig = byToken?.get(tokenKey);
  const known = byConfig?.get(config);
  if (known !== undefined) {
    return known;
  }
  const brands: symbol[] = [];
  const methods = new Set<string>();
  const contractNames: string[] = [];
  for (const contract of spec.contracts) {
    const name = tokenName(contract);
    const brand = Symbol.for(name);
    contractNames.push(name);
    brands.push(brand, ...contractParentBrands(contract, brand, tokenName));
    for (const method of contractMethods(contract, tokenName)) {
      methods.add(method.name.toLowerCase());
    }
  }
  const parts: string[] = [];
  if (spec.partialObject !== null) {
    parts.push(getClass(spec.partialObject));
  }
  if (spec.parent !== null) {
    parts.push(classNameOf(spec.parent) ?? "class@anonymous");
  }
  if (spec.token !== null) {
    parts.push(spec.token.description ?? "");
  }
  parts.push(...spec.parts, ...contractNames);
  const name = ["Mockery", String(mockCounter++), ...parts.map((part) => part.replace(/\\/g, "_"))].join("_");
  const generated: new (...args: unknown[]) => object = spec.parent !== null ? class extends (spec.parent as unknown as new (...args: unknown[]) => object) {} : class {};
  Object.defineProperty(generated, "name", { value: name });
  Object.defineProperty(generated, FQCN, { value: name });
  for (const brand of brands) {
    defineContractBrand(generated.prototype as object, brand);
  }
  const entry: Generated = { name, generated, contractMethods: methods };
  if (byToken === undefined) {
    byToken = new Map();
    generatedByTarget.set(parentKey, byToken);
  }
  if (byConfig === undefined) {
    byConfig = new Map();
    byToken.set(tokenKey, byConfig);
  }
  byConfig.set(config, entry);
  return entry;
}

/** The Mockery API members the Proxy answers itself (step 2). */
const API_MEMBERS: ReadonlySet<string> = new Set([
  "allows",
  "byDefault",
  "expects",
  "makePartial",
  "shouldAllowMockingProtectedMethods",
  "shouldDeferMissing",
  "shouldHaveBeenCalled",
  "shouldHaveReceived",
  "shouldIgnoreMissing",
  "shouldNotHaveBeenCalled",
  "shouldNotHaveReceived",
  "shouldNotReceive",
  "shouldReceive",
  "toString",
]);

/** The API members Mockery drops when the mocked class declares a method of that name (AvoidMethodClashPass). */
const CLASHABLE: ReadonlySet<string> = new Set(["allows", "expects"]);

function isApiMember(key: string): boolean {
  return API_MEMBERS.has(key) || (key.startsWith("mockery_") && typeof (Mock.prototype as unknown as Record<string, unknown>)[key] === "function");
}

/** The value a descriptor from the escape slot gives for `receiver`. */
function readDescriptor(descriptor: PropertyDescriptor, receiver: unknown): unknown {
  if (descriptor.get !== undefined) {
    return descriptor.get.call(receiver);
  }
  // AD-9: a descriptor without a value reads as null, never undefined.
  return descriptor.value === undefined ? null : (descriptor.value as unknown);
}

export class Mock implements LegacyMockInterface {
  static readonly [FQCN]: string = "Mockery\\Mock";

  protected _mockery_expectations = new Map<string, ExpectationDirector>();
  protected _mockery_expectations_count = 0;
  protected _mockery_ignoreMissing = false;
  protected _mockery_ignoreMissingRecursive = false;
  protected _mockery_deferMissing = false;
  protected _mockery_verified = false;
  protected _mockery_name: string;
  protected _mockery_allocatedOrder = 0;
  protected _mockery_currentOrder = 0;
  protected _mockery_groups = new Map<string, number>();
  protected _mockery_container: Container;
  protected _mockery_partial: object | null;
  protected _mockery_allowMockingProtectedMethods = false;
  protected _mockery_receivedMethodCalls: ReceivedMethodCalls | null = null;
  protected _mockery_defaultReturnValue: unknown = null;
  protected _mockery_thrownExceptions: BadMethodCallException[] = [];
  /** The object behind the Proxy: an instance of the generated class. */
  protected readonly _mockery_instance: object;
  /** The mock object itself (the Proxy), which expectations hold. */
  protected _mockery_self: MockObject;
  /** `X[m]`: the mocked methods (lower case), or null when every method is mocked. */
  readonly #whiteList: readonly string[] | null;
  readonly #blackList: readonly string[];
  /** Whether the instance is a model (AD-7). */
  readonly #model: boolean;
  readonly #bound = new Map<string, unknown>();
  readonly #dispatchers = new Map<string, (...args: unknown[]) => unknown>();
  /** The lower-cased names of the methods the contract targets list, for the unexpected-call message. */
  readonly #contractMethods: ReadonlySet<string>;

  private constructor(container: Container, generated: Generated, spec: MockSpec) {
    this._mockery_container = container;
    this._mockery_name = generated.name;
    this._mockery_partial = spec.partialObject;
    this.#whiteList = spec.whiteList;
    this.#blackList = spec.blackList;
    this.#contractMethods = generated.contractMethods;
    const instance = spec.constructorArgs === null ? (Object.create(generated.generated.prototype) as object) : (Reflect.construct(generated.generated, [...spec.constructorArgs]) as object);
    this.#model = MODEL_STATE in instance;
    if (this.#model && !Object.hasOwn(instance, MODEL_STATE)) {
      Reflect.defineProperty(instance, MODEL_STATE, { value: {}, writable: true, configurable: true, enumerable: false });
    }
    this._mockery_instance = instance;
    this._mockery_self = new Proxy(instance, this.#handler()) as MockObject;
  }

  /** Builds a mock in `container`: a Proxy over an instance of `Mockery_<n>[_<part>...]`. */
  static build(container: Container, spec: MockSpec): MockObject {
    return new Mock(container, generatedFor(spec), spec)._mockery_self;
  }

  /**
   * Expects calls of each named method (several names give one CompositeExpectation over all of them). A
   * string-keyed object expects each key and returns its value. With no name, a HigherOrderMessage.
   */
  shouldReceive(): any;
  shouldReceive(...methodNames: MethodNames): CompositeExpectation;
  shouldReceive(...methodNames: MethodNames): unknown {
    if (methodNames.length === 0) {
      return new HigherOrderMessage(this._mockery_self, "shouldReceive");
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

  /** A method name: `shouldReceive(name)`. A map: each method returns its value, and the mock is returned. Nothing: a HigherOrderMessage. */
  allows(something: string | Readonly<Record<string, unknown>> | readonly unknown[] | null = []): any {
    if (typeof something === "string") {
      return this.shouldReceive(something);
    }
    if (something === null) {
      // PHP's `empty(null)`.
      return this.shouldReceive();
    }
    const entries = Array.isArray(something) ? something.map((value, index): [string, unknown] => [String(index), value]) : Object.entries(something);
    if (entries.length === 0) {
      return this.shouldReceive();
    }
    for (const [method, returnValue] of entries) {
      this.shouldReceive(method).andReturn(returnValue);
    }
    return this._mockery_self;
  }

  /** A method name: `shouldReceive(name)->once()`. Nothing: an ExpectsHigherOrderMessage. */
  expects(something: string | null = null): any {
    if (typeof something === "string") {
      return this.shouldReceive(something).once();
    }
    return new ExpectsHigherOrderMessage(this._mockery_self);
  }

  /** Expects each named method never to be called; with no name, a HigherOrderMessage. */
  shouldNotReceive(): any;
  shouldNotReceive(...methodNames: MethodNames): CompositeExpectation;
  shouldNotReceive(...methodNames: MethodNames): unknown {
    if (methodNames.length === 0) {
      return new HigherOrderMessage(this._mockery_self, "shouldNotReceive");
    }
    let expectation: CompositeExpectation | null = null;
    for (const methodName of methodNames) {
      expectation = this.shouldReceive(methodName);
      expectation.never();
    }
    return expectation;
  }

  /** Calls with no expectation return `returnValue` (null: the method's default, or with `recursive` an ignore-missing mock). */
  shouldIgnoreMissing(returnValue: unknown = null, recursive: boolean = false): this {
    this._mockery_ignoreMissing = true;
    this._mockery_ignoreMissingRecursive = recursive;
    this._mockery_defaultReturnValue = returnValue;
    return this._mockery_self as unknown as this;
  }

  /** Sets the flag only: TS visibility does not exist at run time, so every method is already mockable (ESC-4.6-1 item 4). */
  shouldAllowMockingProtectedMethods(): this {
    this._mockery_allowMockingProtectedMethods = true;
    return this._mockery_self as unknown as this;
  }

  /** `makePartial()` (deprecated in Mockery 2.0). */
  shouldDeferMissing(): this {
    return this.makePartial();
  }

  /** Calls with no expectation run the mocked class's own method. */
  makePartial(): this {
    this._mockery_deferMissing = true;
    return this._mockery_self as unknown as this;
  }

  /** Turns every expectation of the mock into a default. */
  byDefault(): this {
    for (const mockeryExpectation of this._mockery_expectations.values()) {
      for (const expectation of mockeryExpectation.getExpectations()) {
        expectation.byDefault();
      }
    }
    return this._mockery_self as unknown as this;
  }

  /** Verifies now that `method` was received at least once (with `args`, when given); the result refines it. */
  shouldHaveReceived(): any;
  shouldHaveReceived(method: string, args?: readonly unknown[] | ((...args: any[]) => unknown) | null): VerificationDirector;
  shouldHaveReceived(method: string | null = null, args: readonly unknown[] | ((...args: any[]) => unknown) | null = null): unknown {
    if (method === null) {
      return new HigherOrderMessage(this._mockery_self, "shouldHaveReceived");
    }
    const verificationExpectation = new VerificationExpectation(this._mockery_self, method);
    if (args !== null) {
      verificationExpectation.withArgs(args);
    }
    verificationExpectation.atLeast().once();
    const verificationDirector = new VerificationDirector(this._mockery_getReceivedMethodCalls(), verificationExpectation);
    ++this._mockery_expectations_count;
    verificationDirector.verify();
    return verificationDirector;
  }

  shouldHaveBeenCalled(): VerificationDirector {
    return this.shouldHaveReceived("__invoke");
  }

  /** Verifies now that `method` was never received (with `args`, when given). */
  shouldNotHaveReceived(): any;
  shouldNotHaveReceived(method: string, args?: readonly unknown[] | ((...args: any[]) => unknown) | null): null;
  shouldNotHaveReceived(method: string | null = null, args: readonly unknown[] | ((...args: any[]) => unknown) | null = null): unknown {
    if (method === null) {
      return new HigherOrderMessage(this._mockery_self, "shouldNotHaveReceived");
    }
    const verificationExpectation = new VerificationExpectation(this._mockery_self, method);
    if (args !== null) {
      verificationExpectation.withArgs(args);
    }
    verificationExpectation.never();
    const verificationDirector = new VerificationDirector(this._mockery_getReceivedMethodCalls(), verificationExpectation);
    ++this._mockery_expectations_count;
    verificationDirector.verify();
    return null;
  }

  shouldNotHaveBeenCalled(args: readonly unknown[] | null = null): null {
    return this.shouldNotHaveReceived("__invoke", args);
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

  /** The return value for a method with no return value set: JS has no declared return types, so null (AD-9). */
  mockery_returnValueForMethod(_name: string): unknown {
    return null;
  }

  /** Calls the mocked class's own `name` with the mock as `this` (`passthru()`). */
  mockery_callSubjectMethod(name: string, args: readonly unknown[]): unknown {
    const method = this._mockery_parentMethod(name);
    if (method === null) {
      throw new Error(`Call to undefined method ${this._mockery_parentName()}::${name}()`);
    }
    return method.apply(this._mockery_self, [...args]);
  }

  toString(): string {
    return `${this._mockery_name}#${objectId(this._mockery_instance)}`;
  }

  protected _mockery_getReceivedMethodCalls(): ReceivedMethodCalls {
    this._mockery_receivedMethodCalls ??= new ReceivedMethodCalls();
    return this._mockery_receivedMethodCalls;
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

  /** The mocked class's own method `method` (a function above Object.prototype), or null. */
  protected _mockery_parentMethod(method: string): ((...args: unknown[]) => unknown) | null {
    if (method === "constructor") {
      return null;
    }
    for (let prototype: unknown = Object.getPrototypeOf(this._mockery_instance); typeof prototype === "object" && prototype !== null && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
      if (descriptor !== undefined) {
        return typeof descriptor.value === "function" ? (descriptor.value as (...args: unknown[]) => unknown) : null;
      }
    }
    return null;
  }

  /** `mockery_getMethod`: whether the mocked class declares `method`. */
  protected _mockery_declaresMethod(method: string): boolean {
    return this._mockery_parentMethod(method) !== null;
  }

  protected _mockery_handleMethodCall(method: string, args: unknown[]): unknown {
    this._mockery_getReceivedMethodCalls().push(new MethodCall(method, args));
    const expectationDirector = this._mockery_findExpectedMethodHandler(method);
    if (expectationDirector !== null) {
      try {
        return expectationDirector.call(args);
      } catch (error) {
        if (!(error instanceof NoMatchingExpectationException) || (!this._mockery_ignoreMissing && !this._mockery_deferMissing)) {
          throw error;
        }
      }
    }
    const partial = this._mockery_partial as Record<string, unknown> | null;
    if (partial !== null && typeof partial[method] === "function") {
      return (partial[method] as (...args: unknown[]) => unknown).apply(partial, args);
    }
    const parentMethod = this._mockery_parentMethod(method);
    if (this._mockery_deferMissing && parentMethod !== null) {
      return parentMethod.apply(this._mockery_self, args);
    }
    if (method === "__toString") {
      return `${this._mockery_name}#${objectId(this._mockery_instance)}`;
    }
    if (this._mockery_ignoreMissing) {
      if (this._mockery_defaultReturnValue === null) {
        if (this._mockery_ignoreMissingRecursive) {
          // No declared return types: every missing call returns an ignore-missing mock (ESC-4.6-1 item 5).
          const mock = (this._mockery_container.mock as () => MockObject)();
          mock.shouldIgnoreMissing(null, true);
          return mock;
        }
        return this.mockery_returnValueForMethod(method);
      }
      return this._mockery_defaultReturnValue;
    }
    const message =
      parentMethod !== null || this.#contractMethods.has(method.toLowerCase()) ? `Received ${this._mockery_name}::${method}(), but no expectations were specified` : `Method ${this._mockery_name}::${method}() does not exist on this mock object`;
    const badMethodCallException = new BadMethodCallException(message);
    this._mockery_thrownExceptions.push(badMethodCallException);
    throw badMethodCallException;
  }

  /** The mocked class's PHP name, for messages. */
  private _mockery_parentName(): string {
    const parent: unknown = Object.getPrototypeOf(Object.getPrototypeOf(this._mockery_instance) as object);
    const ctor: unknown = typeof parent === "object" && parent !== null && Object.hasOwn(parent, "constructor") ? (parent as { constructor: unknown }).constructor : null;
    return classNameOf(ctor) ?? "stdClass";
  }

  /** On a `X[m]` partial: whether `key` is a declared method left to `X` (not mocked). */
  #isRealMethod(key: string): boolean {
    if (this.#whiteList === null && this.#blackList.length === 0) {
      return false;
    }
    if (!this._mockery_declaresMethod(key)) {
      return false;
    }
    const lower = key.toLowerCase();
    if (this.#whiteList !== null && this.#whiteList.length > 0) {
      return !this.#whiteList.includes(lower);
    }
    return this.#blackList.includes(lower);
  }

  /** The escape slot of a mocked model (AD-7): a null-prototype record of descriptors. */
  #members(): Record<string, PropertyDescriptor> {
    const state = (this._mockery_instance as Record<symbol, unknown>)[MODEL_STATE] as Record<symbol, unknown>;
    let members = state[MEMBERS] as Record<string, PropertyDescriptor> | undefined;
    if (members === undefined) {
      members = Object.create(null) as Record<string, PropertyDescriptor>;
      state[MEMBERS] = members;
    }
    return members;
  }

  #expect(method: string): Expectation {
    if (method.includes("->")) {
      // Demeter chains are not ported: no Upstream use is scanned.
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
        if (this.#isRealMethod(key)) {
          return Reflect.get(target, key, receiver);
        }
        if (this._mockery_findExpectedMethodHandler(key) !== null) {
          return this.#dispatcher(key);
        }
        if (isApiMember(key)) {
          // Mockery's AvoidMethodClashPass: a class that declares its own `allows` or `expects` (Laravel's Gate)
          // keeps it, so the call is dispatched as a declared method.
          if (CLASHABLE.has(key) && (this._mockery_declaresMethod(key) || this.#contractMethods.has(key.toLowerCase()))) {
            return this.#dispatcher(key);
          }
          return this.#api(key);
        }
        if (this._mockery_declaresMethod(key) || this.#contractMethods.has(key.toLowerCase())) {
          return this.#dispatcher(key);
        }
        if (this.#model) {
          const descriptor = this.#members()[key];
          if (descriptor !== undefined) {
            return readDescriptor(descriptor, receiver);
          }
        }
        if (key in target || key === "then") {
          return Reflect.get(target, key, receiver);
        }
        return this.#dispatcher(key);
      },
      set: (target, key, value, receiver): boolean => {
        if (this.#model && typeof key === "string") {
          const members = this.#members();
          const descriptor = members[key];
          if (descriptor !== undefined) {
            if (descriptor.set !== undefined) {
              descriptor.set.call(receiver, value);
              return true;
            }
            if (descriptor.writable !== true) {
              return false;
            }
            members[key] = { ...descriptor, value };
            return true;
          }
          // The model's own set path (PHP's `__set`), never the mock's defineProperty.
          return Reflect.set(target, key, value);
        }
        return Reflect.set(target, key, value, receiver);
      },
      defineProperty: (target, key, descriptor): boolean => {
        if (this.#model && typeof key === "string") {
          if (descriptor.configurable !== true) {
            // A Proxy may not report a non-configurable property its target lacks.
            return false;
          }
          this.#members()[key] = { ...descriptor };
          return true;
        }
        return Reflect.defineProperty(target, key, descriptor);
      },
    };
  }
}
