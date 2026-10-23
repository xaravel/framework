// Illuminate\Contracts\Validation\Validator, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { MessageProvider } from "../support/MessageProvider";
import type { Closure } from "../structural/Closure";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { SupportMessageBag } from "../structural/SupportMessageBag";

declare const ValidatorBrand: unique symbol;

export interface Validator extends MessageProvider {
  readonly [Validator.brand]: true;

  /**
   * Run the validator's rules against its data.
   * Runs validation rule objects and closures, which AD-6's Derivation makes async.
   * @asyncRoot callback
   */
  validate(): Promise<PhpArrayLike>;

  /**
   * Get the attributes and values that were validated.
   * Runs validation rule objects and closures, which AD-6's Derivation makes async.
   * @asyncRoot callback
   */
  validated(): Promise<PhpArrayLike>;

  /**
   * Determine if the data fails the validation rules.
   * Runs validation rule objects and closures, which AD-6's Derivation makes async.
   * @asyncRoot callback
   */
  fails(): Promise<boolean>;

  /** Get the failed validation rules. */
  failed(): PhpArrayLike;

  /** Add conditions to a given field based on a Closure. */
  sometimes(attribute: string | PhpArrayLike, rules: string | PhpArrayLike, callback: Closure): this;

  /** Add an after validation callback. */
  after(callback: Closure | string): this;

  /**
   * Get all of the validation error messages.
   * Runs the validation rules when no messages exist yet, so it is async as `fails()` is (AD-6).
   * @asyncRoot callback
   */
  errors(): Promise<SupportMessageBag>;
}

export const Validator = contract<Validator, typeof ValidatorBrand>(
  "Illuminate\\Contracts\\Validation\\Validator",
  {
    after: ["callback"],
    errors: [],
    failed: [],
    fails: [],
    sometimes: ["attribute", "rules", "callback"],
    validate: [],
    validated: [],
  },
  [MessageProvider],
);
