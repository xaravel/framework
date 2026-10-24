// Illuminate\Contracts\Console\Isolatable, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const IsolatableBrand: unique symbol;

export interface Isolatable {
  readonly [Isolatable.brand]: true;
}

export const Isolatable = contract<Isolatable, typeof IsolatableBrand>("Illuminate\\Contracts\\Console\\Isolatable");
