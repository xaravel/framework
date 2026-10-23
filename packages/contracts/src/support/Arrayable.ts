// Illuminate\Contracts\Support\Arrayable, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const ArrayableBrand: unique symbol;

export interface Arrayable {
  readonly [Arrayable.brand]: true;

  /** Get the instance as an array. */
  toArray(): PhpArrayLike;
}

export const Arrayable = contract<Arrayable, typeof ArrayableBrand>(
  "Illuminate\\Contracts\\Support\\Arrayable",
  {
    toArray: [],
  },
);
