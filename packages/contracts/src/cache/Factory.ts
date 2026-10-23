// Illuminate\Contracts\Cache\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Repository } from "./Repository";
import type { UnitEnum } from "../structural/UnitEnum";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Get a cache store instance by name. */
  store(name?: UnitEnum | string | null): Repository;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Cache\\Factory",
  {
    store: ["name"],
  },
);
