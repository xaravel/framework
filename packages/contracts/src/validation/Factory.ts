// Illuminate\Contracts\Validation\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { Validator } from "./Validator";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Create a new Validator instance. */
  make(data: PhpArrayLike, rules: PhpArrayLike, messages?: PhpArrayLike, attributes?: PhpArrayLike): Validator;
  make(data: PhpArrayLike, rules: PhpArrayLike, options?: { messages?: PhpArrayLike; attributes?: PhpArrayLike }): Validator;

  /** Register a custom validator extension. */
  extend(rule: string, extension: Closure | string, message?: string | null): void;

  /** Register a custom implicit validator extension. */
  extendImplicit(rule: string, extension: Closure | string, message?: string | null): void;

  /** Register a custom implicit validator message replacer. */
  replacer(rule: string, replacer: Closure | string): void;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Validation\\Factory",
  {
    extend: ["rule", "extension", "message"],
    extendImplicit: ["rule", "extension", "message"],
    make: ["data", "rules", "messages", "attributes"],
    replacer: ["rule", "replacer"],
  },
);
