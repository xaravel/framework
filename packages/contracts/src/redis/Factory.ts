// Illuminate\Contracts\Redis\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { RedisConnection } from "../structural/RedisConnection";
import type { UnitEnum } from "../structural/UnitEnum";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Get a Redis connection by name. */
  connection(name?: UnitEnum | string | null): RedisConnection;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Redis\\Factory",
  {
    connection: ["name"],
  },
);
