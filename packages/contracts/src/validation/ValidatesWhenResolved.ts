// Illuminate\Contracts\Validation\ValidatesWhenResolved, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ValidatesWhenResolvedBrand: unique symbol;

export interface ValidatesWhenResolved {
  readonly [ValidatesWhenResolved.brand]: true;

  /**
   * Validate the given class instance.
   * Runs validation rule objects and closures, which AD-6's Derivation makes async.
   * @asyncRoot callback
   */
  validateResolved(): Promise<void>;
}

export const ValidatesWhenResolved = contract<ValidatesWhenResolved, typeof ValidatesWhenResolvedBrand>(
  "Illuminate\\Contracts\\Validation\\ValidatesWhenResolved",
  {
    validateResolved: [],
  },
);
