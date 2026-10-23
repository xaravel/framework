// Illuminate\Contracts\Support\DeferrableProvider, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const DeferrableProviderBrand: unique symbol;

export interface DeferrableProvider {
  readonly [DeferrableProvider.brand]: true;

  /** Get the services provided by the provider. */
  provides(): PhpArrayLike;
}

export const DeferrableProvider = contract<DeferrableProvider, typeof DeferrableProviderBrand>(
  "Illuminate\\Contracts\\Support\\DeferrableProvider",
  {
    provides: [],
  },
);
