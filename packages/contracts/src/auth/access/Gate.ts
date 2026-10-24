// Illuminate\Contracts\Auth\Access\Gate, from laravel/framework v13.37.0.
// Upstream's `$class` is `className` and `$arguments` is `args`, both reserved words.
import { contract } from "../../Contract";
import type { AuthAccessResponse } from "../../structural/AuthAccessResponse";
import type { Closure } from "../../structural/Closure";
import type { PhpArrayLike } from "../../structural/PhpArrayLike";
import type { PhpIterable } from "../../structural/PhpIterable";
import type { UnitEnum } from "../../structural/UnitEnum";

declare const GateBrand: unique symbol;

export interface Gate {
  readonly [Gate.brand]: true;

  /** Determine if a given ability has been defined. */
  has(ability: UnitEnum | string): boolean;

  /** Define a new ability. */
  define(ability: UnitEnum | string, callback: Closure | string): this;

  /** Define abilities for a resource. */
  resource(name: string, className: string, abilities?: PhpArrayLike | null): this;

  /** Define a policy class for a given class type. */
  policy(className: string, policy: string): this;

  /** Register a callback to run before all Gate checks. */
  before(callback: Closure): this;

  /** Register a callback to run after all Gate checks. */
  after(callback: Closure): this;

  /**
   * Determine if all of the given abilities should be granted for the current user.
   * Runs the ability callbacks, policies and before / after callbacks, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  allows(ability: PhpIterable | UnitEnum | string, args?: unknown): Promise<boolean>;

  /**
   * Determine if any of the given abilities should be denied for the current user.
   * Runs the ability callbacks, policies and before / after callbacks, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  denies(ability: PhpIterable | UnitEnum | string, args?: unknown): Promise<boolean>;

  /**
   * Determine if all of the given abilities should be granted for the current user.
   * Runs the ability callbacks, policies and before / after callbacks, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  check(abilities: PhpIterable | UnitEnum | string, args?: unknown): Promise<boolean>;

  /**
   * Determine if any one of the given abilities should be granted for the current user.
   * Runs the ability callbacks, policies and before / after callbacks, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  any(abilities: PhpIterable | UnitEnum | string, args?: unknown): Promise<boolean>;

  /**
   * Determine if the given ability should be granted for the current user; rejects with an `AuthorizationException`
   * when it is denied. Runs the ability callbacks, policies and before / after callbacks, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  authorize(ability: UnitEnum | string, args?: unknown): Promise<AuthAccessResponse>;

  /**
   * Inspect the user for the given ability.
   * Runs the ability callbacks, policies and before / after callbacks, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  inspect(ability: UnitEnum | string, args?: unknown): Promise<AuthAccessResponse>;

  /**
   * Get the raw result from the authorization callback.
   * Runs the ability callbacks, policies and before / after callbacks, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  raw(ability: string, args?: unknown): Promise<unknown>;

  /** Get a policy instance for a given class; throws an `InvalidArgumentException` for an invalid class. */
  getPolicyFor(className: object | string): unknown;

  /** Get a guard instance for the given user. */
  forUser(user: unknown): this;

  /** Get all of the defined abilities. */
  abilities(): PhpArrayLike;
}

export const Gate = contract<Gate, typeof GateBrand>(
  "Illuminate\\Contracts\\Auth\\Access\\Gate",
  {
    abilities: [],
    after: ["callback"],
    allows: ["ability", "arguments"],
    any: ["abilities", "arguments"],
    authorize: ["ability", "arguments"],
    before: ["callback"],
    check: ["abilities", "arguments"],
    define: ["ability", "callback"],
    denies: ["ability", "arguments"],
    forUser: ["user"],
    getPolicyFor: ["class"],
    has: ["ability"],
    inspect: ["ability", "arguments"],
    policy: ["class", "policy"],
    raw: ["ability", "arguments"],
    resource: ["name", "class", "abilities"],
  },
);
