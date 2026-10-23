// Illuminate\Contracts\Support\Jsonable, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const JsonableBrand: unique symbol;

export interface Jsonable {
  readonly [Jsonable.brand]: true;

  /** Convert the object to its JSON representation. */
  toJson(options?: number): string;
}

export const Jsonable = contract<Jsonable, typeof JsonableBrand>(
  "Illuminate\\Contracts\\Support\\Jsonable",
  {
    toJson: ["options"],
  },
);
