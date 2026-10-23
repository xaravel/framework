// Illuminate\Contracts\Support\HasOnceHash, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const HasOnceHashBrand: unique symbol;

export interface HasOnceHash {
  readonly [HasOnceHash.brand]: true;

  /** Compute the hash that should be used to represent the object when given to a function using "once". */
  onceHash(): string;
}

export const HasOnceHash = contract<HasOnceHash, typeof HasOnceHashBrand>(
  "Illuminate\\Contracts\\Support\\HasOnceHash",
  {
    onceHash: [],
  },
);
