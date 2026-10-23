// Illuminate\Contracts\Hashing\Hasher, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const HasherBrand: unique symbol;

export interface Hasher {
  readonly [Hasher.brand]: true;

  /** Get information about the given hashed value. */
  info(hashedValue: string): PhpArrayLike;

  /** Hash the given value. */
  make(value: string, options?: PhpArrayLike): string;

  /** Check the given plain value against a hash. */
  check(value: string, hashedValue: string, options?: PhpArrayLike): boolean;

  /** Check if the given hash has been hashed using the given options. */
  needsRehash(hashedValue: string, options?: PhpArrayLike): boolean;
}

export const Hasher = contract<Hasher, typeof HasherBrand>(
  "Illuminate\\Contracts\\Hashing\\Hasher",
  {
    check: ["value", "hashedValue", "options"],
    info: ["hashedValue"],
    make: ["value", "options"],
    needsRehash: ["hashedValue", "options"],
  },
);
