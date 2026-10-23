// Illuminate\Contracts\Filesystem\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Filesystem } from "./Filesystem";
import type { UnitEnum } from "../structural/UnitEnum";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Get a filesystem implementation. */
  disk(name?: UnitEnum | string | null): Filesystem;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Filesystem\\Factory",
  {
    disk: ["name"],
  },
);
