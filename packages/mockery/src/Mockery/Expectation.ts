// `Mockery\Expectation` (Mockery 1.6.15, Expectation.php): one expected call
// of a mock method, with its argument list, call count, return queue and
// order. Story 4.5 ported the core API; Story 4.6 adds the `andReturn*`
// family, `andThrow` with a class-name string, `andThrowExceptions`,
// `because`, `byDefault`, `globally`, `passthru`, `withNoArgs`,
// `withSomeOfArgs` and `zeroOrMoreTimes`. Demeter chains, `andYield`,
// `andSet`/`set`, `between` and `withAndOthers` are not ported (no Upstream
// use is scanned).
import { phpLooseEquals, phpStrictEquals } from "@xaravel/assert";
import { Mockery } from "../Mockery";
import { InvalidArgumentException } from "../php/InvalidArgumentException";
import { OutOfBoundsException } from "../php/OutOfBoundsException";
import { graderExceptionClass } from "../support/classes";
import { classNameOf, FQCN, instanceOfName, isClass, isPhpObject, phpString } from "../support/values";
import { AtLeast } from "./CountValidator/AtLeast";
import { AtMost } from "./CountValidator/AtMost";
import type { CountValidatorAbstract } from "./CountValidator/CountValidatorAbstract";
import { Exact } from "./CountValidator/Exact";
import { Exception } from "./Exception";
import type { LegacyMockInterface } from "./LegacyMockInterface";
import { AnyArgs } from "./Matcher/AnyArgs";
import { MatcherAbstract } from "./Matcher/MatcherAbstract";
import { MultiArgumentClosure } from "./Matcher/MultiArgumentClosure";
import { NoArgs } from "./Matcher/NoArgs";

type CountValidatorClass = new (expectation: Expectation, limit: number) => CountValidatorAbstract;

/** Something `ordered()` allocates order numbers from: a mock, or (with `globally()`) the container. */
interface Ordering {
  mockery_getGroups(): ReadonlyMap<string, number>;
  mockery_allocateOrder(): number;
  mockery_setGroup(group: string | number, order: number): void;
}

export class Expectation {
  static readonly [FQCN]: string = "Mockery\\Expectation";

  protected _actualCount = 0;
  protected _because: string | null = null;
  protected _closureQueue: ((...args: unknown[]) => unknown)[] = [];
  protected _countValidatorClass: CountValidatorClass = Exact;
  protected _countValidators = new Map<CountValidatorClass, CountValidatorAbstract>();
  protected _expectedArgs: unknown[] = [];
  protected _expectedCount = -1;
  protected _globalOrderNumber: number | null = null;
  protected _globally = false;
  protected readonly _mock: LegacyMockInterface;
  protected readonly _name: string;
  protected _orderNumber: number | null = null;
  protected _passthru = false;
  protected _returnQueue: unknown[] = [];
  protected _throw = false;

  constructor(mock: LegacyMockInterface, name: string) {
    this._mock = mock;
    this._name = name;
    this.withAnyArgs();
  }

  toString(): string {
    return Mockery.formatArgs(this._name, this._expectedArgs);
  }

  /** The values the calls return, in turn; the last one repeats. */
  andReturn(...args: unknown[]): this {
    this._returnQueue = args;
    return this;
  }

  /** `andReturn(...values)`. */
  andReturnValues(values: readonly unknown[]): this {
    if (!Array.isArray(values)) {
      throw new TypeError(`Mockery\\Expectation::andReturnValues(): Argument #1 ($values) must be of type array, ${values === null ? "null" : typeof values} given`);
    }
    return this.andReturn(...values);
  }

  /** The first call returns argument `index` of the call; OutOfBoundsException when there is none. */
  andReturnArg(index: number): this {
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
      throw new InvalidArgumentException("Invalid argument index supplied. Index must be a non-negative integer.");
    }
    const closure = (...args: unknown[]): unknown => {
      if (index < args.length) {
        return args[index];
      }
      throw new OutOfBoundsException(`Cannot return an argument value. No argument exists for the index ${index}`);
    };
    this._closureQueue = [closure];
    return this;
  }

  andReturnFalse(): this {
    return this.andReturn(false);
  }

  andReturnNull(): this {
    return this.andReturn(null);
  }

  /** Returns the mock itself. */
  andReturnSelf(): this {
    return this.andReturn(this._mock);
  }

  andReturnTrue(): this {
    return this.andReturn(true);
  }

  /** Each call returns what the next closure returns for its arguments; the last closure repeats. */
  andReturnUsing(...args: ((...args: any[]) => unknown)[]): this {
    this._closureQueue = args;
    return this;
  }

  /** `andReturn(...args)`. */
  andReturns(...args: unknown[]): this {
    return this.andReturn(...args);
  }

  /**
   * The call throws `exception`: an error object; a class, constructed as `new exception(message, code, previous)`;
   * or a class-name string naming one of the exception classes the grader defines (PHP's SPL parents, `Exception`
   * and Mockery's exceptions). Any other name throws PHP's `Class "<name>" not found` here (ESC-4.6-1 item 9).
   */
  andThrow(exception: unknown, message: string = "", code: number = 0, previous: Error | null = null): this {
    this._throw = true;
    if (isPhpObject(exception) && !isClass(exception)) {
      return this.andReturn(exception);
    }
    let ctor: unknown = exception;
    if (typeof exception === "string") {
      ctor = graderExceptionClass(exception);
      if (ctor === null) {
        throw new Error(`Class "${exception.replace(/^\\/, "")}" not found`);
      }
    }
    if (isClass(ctor)) {
      return this.andReturn(new (ctor as unknown as new (message: string, code: number, previous: Error | null) => unknown)(message, code, previous));
    }
    throw new InvalidArgumentException(`andThrow() needs an exception object, class or class name, got ${typeof exception}`);
  }

  /** The calls throw each exception in turn; the last one repeats. */
  andThrowExceptions(exceptions: readonly unknown[]): this {
    this._throw = true;
    for (const exception of exceptions) {
      if (!isPhpObject(exception)) {
        throw new Exception("You must pass an array of exception objects to andThrowExceptions");
      }
    }
    return this.andReturn(...exceptions);
  }

  /** `andThrow(...)`. */
  andThrows(exception: unknown, message: string = "", code: number = 0, previous: Error | null = null): this {
    return this.andThrow(exception, message, code, previous);
  }

  atLeast(): this {
    this._countValidatorClass = AtLeast;
    return this;
  }

  atMost(): this {
    this._countValidatorClass = AtMost;
    return this;
  }

  /** The reason an unmet `Exact` count adds to its message. */
  because(message: string): this {
    this._because = message;
    return this;
  }

  /** Makes this expectation (the last one of its method) a default, which later expectations override. */
  byDefault(): this {
    const director = this._mock.mockery_getExpectationsFor(this._name);
    if (director !== null) {
      director.makeExpectationDefault(this);
    }
    return this;
  }

  /** A copy, as PHP's `clone`: the arrays copied, each count validator cloned (still bound to this expectation). */
  clone(): this {
    const copy = Object.create(Object.getPrototypeOf(this) as object) as this;
    Object.defineProperties(copy, Object.getOwnPropertyDescriptors(this));
    copy.__clone();
    return copy;
  }

  getExceptionMessage(): string | null {
    return this._because;
  }

  getMock(): LegacyMockInterface {
    return this._mock;
  }

  getName(): string {
    return this._name;
  }

  getOrderNumber(): number | null {
    return this._orderNumber;
  }

  /** The next `ordered()` call orders against every mock of the container. */
  globally(): this {
    this._globally = true;
    return this;
  }

  isCallCountConstrained(): boolean {
    return this._countValidators.size > 0;
  }

  isEligible(): boolean {
    for (const countValidator of this._countValidators.values()) {
      if (!countValidator.isEligible(this._actualCount)) {
        return false;
      }
    }
    return true;
  }

  matchArgs(args: readonly unknown[]): boolean {
    for (const expectedArg of this._expectedArgs) {
      if (!(expectedArg instanceof MatcherAbstract) || !expectedArg.isArgumentListMatcher()) {
        continue;
      }
      return this._matchArg(expectedArg, args);
    }
    if (args.length === this._expectedArgs.length) {
      return this._matchArgs(args);
    }
    return false;
  }

  never(): this {
    return this.times(0);
  }

  once(): this {
    return this.times(1);
  }

  ordered(group: string | number | null = null): this {
    if (this._globally) {
      this._globalOrderNumber = this._defineOrdered(group, this._mock.mockery_getContainer());
    } else {
      this._orderNumber = this._defineOrdered(group, this._mock);
    }
    this._globally = false;
    return this;
  }

  /** The call runs the mocked class's own method (`mockery_callSubjectMethod`), still matched and counted. */
  passthru(): this {
    // Mockery throws here for an instance of `Mockery\Mock` itself; a generated mock never is one.
    this._passthru = true;
    return this;
  }

  times(limit: number | null = null): this {
    if (limit === null || limit === undefined) {
      return this;
    }
    if (typeof limit !== "number" || !Number.isInteger(limit)) {
      throw new InvalidArgumentException("The passed Times limit should be an integer value");
    }
    // After never(), Mockery raises ERROR_ZERO_INVOCATION as E_USER_DEPRECATED through `@trigger_error`, which
    // suppresses it: nothing is observable.
    if (limit === 0) {
      this._countValidators.clear();
    }
    this._expectedCount = limit;
    this._countValidators.set(this._countValidatorClass, new this._countValidatorClass(this, limit));
    if (this._countValidatorClass !== Exact) {
      this._countValidatorClass = Exact;
      this._countValidators.delete(Exact);
    }
    return this;
  }

  twice(): this {
    return this.times(2);
  }

  validateOrder(): void {
    if (this._orderNumber) {
      this._mock.mockery_validateOrder(this.toString(), this._orderNumber);
    }
    if (this._globalOrderNumber) {
      this._mock.mockery_getContainer().mockery_validateOrder(this.toString(), this._globalOrderNumber, this._mock);
    }
  }

  verify(): void {
    for (const countValidator of this._countValidators.values()) {
      countValidator.validate(this._actualCount);
    }
  }

  verifyCall(args: readonly unknown[]): unknown {
    this.validateOrder();
    this._actualCount++;
    if (this._passthru) {
      return this._mock.mockery_callSubjectMethod(this._name, args);
    }
    const value = this._getReturnValue(args);
    this.throwAsNecessary(value);
    return value;
  }

  /** The expected argument list; `with()` with none expects no arguments. */
  with(...args: unknown[]): this {
    return this.withArgs(args);
  }

  withAnyArgs(): this {
    this._expectedArgs = [new AnyArgs()];
    return this;
  }

  /** An expected argument list, or a closure that matches a call when it returns exactly `true`. */
  withArgs(argsOrClosure: readonly unknown[] | ((...args: any[]) => unknown)): this {
    if (Array.isArray(argsOrClosure)) {
      return this.withArgsInArray(argsOrClosure);
    }
    if (typeof argsOrClosure === "function") {
      this._expectedArgs = [new MultiArgumentClosure(argsOrClosure)];
      return this;
    }
    throw new InvalidArgumentException(`Call to Mockery\\Expectation::withArgs with an invalid argument (${phpString(argsOrClosure)}), only array and closure are allowed`);
  }

  withNoArgs(): this {
    this._expectedArgs = [new NoArgs()];
    return this;
  }

  /** Matches a call whose arguments include each of `expectedArgs` (PHP `in_array(..., true)`). */
  withSomeOfArgs(...expectedArgs: unknown[]): this {
    return this.withArgs((...args: unknown[]): boolean => {
      for (const expectedArg of expectedArgs) {
        if (!args.some((arg) => phpStrictEquals(expectedArg, arg))) {
          return false;
        }
      }
      return true;
    });
  }

  /** `atLeast()->never()`: any number of calls, counted as an assertion. */
  zeroOrMoreTimes(): this {
    return this.atLeast().never();
  }

  /** PHP's `__clone` (Expectation.php 99-108): fresh arrays, each count validator cloned. */
  protected __clone(): void {
    this._closureQueue = [...this._closureQueue];
    this._expectedArgs = [...this._expectedArgs];
    this._returnQueue = [...this._returnQueue];
    const validators = new Map<CountValidatorClass, CountValidatorAbstract>();
    for (const [key, countValidator] of this._countValidators) {
      const copy = Object.create(Object.getPrototypeOf(countValidator) as object) as CountValidatorAbstract;
      Object.defineProperties(copy, Object.getOwnPropertyDescriptors(countValidator));
      validators.set(key, copy);
    }
    this._countValidators = validators;
  }

  protected _defineOrdered(group: string | number | null, ordering: Ordering): number {
    const groups = ordering.mockery_getGroups();
    if (group === null) {
      return ordering.mockery_allocateOrder();
    }
    const known = groups.get(String(group));
    if (known !== undefined) {
      return known;
    }
    const result = ordering.mockery_allocateOrder();
    ordering.mockery_setGroup(group, result);
    return result;
  }

  protected _getReturnValue(args: readonly unknown[]): unknown {
    if (this._closureQueue.length > 1) {
      return this._closureQueue.shift()!(...args);
    }
    if (this._closureQueue.length > 0) {
      return this._closureQueue[0]!(...args);
    }
    if (this._returnQueue.length > 1) {
      return this._returnQueue.shift();
    }
    if (this._returnQueue.length > 0) {
      return this._returnQueue[0];
    }
    // No declared return types in JS: `mockery_returnValueForMethod` gives null (AD-9).
    return this._mock.mockery_returnValueForMethod(this._name);
  }

  /**
   * `_matchArg` (Expectation.php 949-980): identity; a matcher; any other object (a closure included) never matches;
   * a class matches an instance of it, and a class-name string an object of that class; else PHP `==`.
   */
  protected _matchArg(expected: unknown, actual: unknown): boolean {
    if (expected === actual) {
      return true;
    }
    if (expected instanceof MatcherAbstract) {
      return expected.match(actual);
    }
    if (isClass(expected)) {
      // A class value stands in for PHP's `Foo::class` string, which also matches the string 'Foo' through `==`.
      if (typeof actual === "string") {
        return actual === classNameOf(expected);
      }
      return isPhpObject(actual) && actual instanceof (expected as unknown as abstract new () => object);
    }
    if (isPhpObject(expected)) {
      return false;
    }
    if (isPhpObject(actual) && typeof expected === "string" && instanceOfName(actual, expected)) {
      return true;
    }
    return phpLooseEquals(expected, actual);
  }

  protected _matchArgs(args: readonly unknown[]): boolean {
    for (let index = 0; index < this._expectedArgs.length; index++) {
      if (!this._matchArg(this._expectedArgs[index], args[index])) {
        return false;
      }
    }
    return true;
  }

  private throwAsNecessary(value: unknown): void {
    if (!(value instanceof Error)) {
      return;
    }
    if (!this._throw) {
      return;
    }
    throw value;
  }

  private withArgsInArray(args: readonly unknown[]): this {
    if (args.length === 0) {
      return this.withNoArgs();
    }
    this._expectedArgs = [...args];
    return this;
  }
}
