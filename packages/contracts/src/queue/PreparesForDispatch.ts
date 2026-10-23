// Illuminate\Contracts\Queue\PreparesForDispatch, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const PreparesForDispatchBrand: unique symbol;

export interface PreparesForDispatch {
  readonly [PreparesForDispatch.brand]: true;

  /**
   * Run preparation logic before dispatch. Return false to abort.
   * Upstream's `bool|void`: a method that returns nothing is `null` here (AD-9).
   */
  prepareForDispatch(): boolean | null;
}

export const PreparesForDispatch = contract<PreparesForDispatch, typeof PreparesForDispatchBrand>(
  "Illuminate\\Contracts\\Queue\\PreparesForDispatch",
  {
    prepareForDispatch: [],
  },
);
