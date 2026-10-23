// Illuminate\Contracts\Support\DeferringDisplayableValue, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Htmlable } from "./Htmlable";

declare const DeferringDisplayableValueBrand: unique symbol;

export interface DeferringDisplayableValue {
  readonly [DeferringDisplayableValue.brand]: true;

  /** Resolve the displayable value that the class is deferring. */
  resolveDisplayableValue(): Htmlable | string;
}

export const DeferringDisplayableValue = contract<DeferringDisplayableValue, typeof DeferringDisplayableValueBrand>(
  "Illuminate\\Contracts\\Support\\DeferringDisplayableValue",
  {
    resolveDisplayableValue: [],
  },
);
