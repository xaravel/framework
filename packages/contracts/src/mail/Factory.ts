// Illuminate\Contracts\Mail\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Mailer } from "./Mailer";
import type { UnitEnum } from "../structural/UnitEnum";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Get a mailer instance by name. */
  mailer(name?: UnitEnum | string | null): Mailer;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Mail\\Factory",
  {
    mailer: ["name"],
  },
);
