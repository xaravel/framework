// Illuminate\Contracts\Queue\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Queue } from "./Queue";
import type { UnitEnum } from "../structural/UnitEnum";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Resolve a queue connection instance. */
  connection(name?: UnitEnum | string | null): Queue;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Queue\\Factory",
  {
    connection: ["name"],
  },
);
