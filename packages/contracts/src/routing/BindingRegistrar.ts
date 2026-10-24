// Illuminate\Contracts\Routing\BindingRegistrar, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";

declare const BindingRegistrarBrand: unique symbol;

export interface BindingRegistrar {
  readonly [BindingRegistrar.brand]: true;

  /** Add a new route parameter binder. */
  bind(key: string, binder: Closure | string): void;

  /** Get the binding callback for a given binding. */
  getBindingCallback(key: string): Closure | null;
}

export const BindingRegistrar = contract<BindingRegistrar, typeof BindingRegistrarBrand>(
  "Illuminate\\Contracts\\Routing\\BindingRegistrar",
  {
    bind: ["key", "binder"],
    getBindingCallback: ["key"],
  },
);
