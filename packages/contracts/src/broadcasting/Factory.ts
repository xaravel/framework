// Illuminate\Contracts\Broadcasting\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Broadcaster } from "./Broadcaster";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Get a broadcaster implementation by name. */
  connection(name?: string | null): Broadcaster;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Broadcasting\\Factory",
  {
    connection: ["name"],
  },
);
