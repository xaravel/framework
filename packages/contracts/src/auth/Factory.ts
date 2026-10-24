// Illuminate\Contracts\Auth\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Guard } from "./Guard";
import type { StatefulGuard } from "./StatefulGuard";
import type { UnitEnum } from "../structural/UnitEnum";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Get a guard instance by name. */
  guard(name?: UnitEnum | string | null): Guard | StatefulGuard;

  /** Set the default guard the factory should serve. */
  shouldUse(name: UnitEnum | string | null): void;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Auth\\Factory",
  {
    guard: ["name"],
    shouldUse: ["name"],
  },
);
