// Illuminate\Validation\Validator, as a contract names it (AD-1.2): the methods of the
// `Illuminate\Contracts\Validation\Validator` it implements, without the brand, and a subset of its own public methods.
import type { Closure } from "./Closure";
import type { PhpArrayLike } from "./PhpArrayLike";
import type { SupportMessageBag } from "./SupportMessageBag";

/** A validator. */
export interface ValidationValidator {
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
   * An alternative more semantic shortcut to the message container.
   * Runs the validation rules when no messages exist yet, so it is async as `fails()` is (AD-6).
   * @asyncRoot callback
   */
  errors(): Promise<SupportMessageBag>;

  /** Get the data under validation. */
  getData(): PhpArrayLike;

  /** Get the validation rules. */
  getRules(): PhpArrayLike;
}
