// `Mockery\Expectation` (Mockery 1.6.15, Expectation.php): one expected call
// of a mock method, with its argument list, call count, return queue and
// order. Story 4.5 ports the core API (AC 1): `once`, `twice`, `times`,
// `never`, `atLeast`, `atMost`, `with`, `withArgs`, `withAnyArgs`,
// `andReturn`, `andReturnValues`, `andThrow` and `ordered`. The rest of
// Mockery's Expectation API is Story 4.6's.
import { phpLooseEquals } from "@xaravel/assert";
import { Mockery } from "../Mockery";
import { InvalidArgumentException } from "../php/InvalidArgumentException";
import { classNameOf, FQCN, instanceOfName, isClass, isPhpObject, phpString } from "../support/values";
import { AtLeast } from "./CountValidator/AtLeast";
import { AtMost } from "./CountValidator/AtMost";
import type { CountValidatorAbstract } from "./CountValidator/CountValidatorAbstract";
import { Exact } from "./CountValidator/Exact";
import type { LegacyMockInterface } from "./LegacyMockInterface";
import { AnyArgs } from "./Matcher/AnyArgs";
import { MatcherAbstract } from "./Matcher/MatcherAbstract";
import { MultiArgumentClosure } from "./Matcher/MultiArgumentClosure";
import { NoArgs } from "./Matcher/NoArgs";

type CountValidatorClass = new (expectation: Expectation, limit: number) => CountValidatorAbstract;

/** Something `ordered()` allocates order numbers from: a mock, or (with `globally()`, Story 4.6) the container. */
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

  /**
   * The call throws `exception`: an error object, or a class constructed as `new exception(message, code, previous)`.
   * A class-name string cannot be resolved in JS (ESC-4.5-1 item 6).
   */
  andThrow(exception: unknown, message: string = "", code: number = 0, previous: Error | null = null): this {
    this._throw = true;
    if (isPhpObject(exception) && !isClass(exception)) {
      return this.andReturn(exception);
    }
    if (isClass(exception)) {
      return this.andReturn(new (exception as unknown as new (message: string, code: number, previous: Error | null) => unknown)(message, code, previous));
    }
    throw new InvalidArgumentException(`andThrow() needs an exception object or class, got ${typeof exception === "string" ? `the class-name string '${exception}', which cannot be resolved (ESC-4.5-1 item 6)` : typeof exception}`);
  }

  atLeast(): this {
    this._countValidatorClass = AtLeast;
    return this;
  }

  atMost(): this {
    this._countValidatorClass = AtMost;
    return this;
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

  times(limit: number | null = null): this {
    if (limit === null || limit === undefined) {
      return this;
    }
    if (typeof limit !== "number" || !Number.isInteger(limit)) {
      throw new InvalidArgumentException("The passed Times limit should be an integer value");
    }
    // Mockery's E_USER_DEPRECATED after never() has no channel here (ESC-4.5-1 item 6).
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
    // No declared return types in JS: Mockery's `mockery_returnValueForMethod` gives null (AD-9).
    return null;
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
      this._expectedArgs = [new NoArgs()];
      return this;
    }
    this._expectedArgs = [...args];
    return this;
  }
}
