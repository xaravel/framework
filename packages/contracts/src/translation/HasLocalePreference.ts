// Illuminate\Contracts\Translation\HasLocalePreference, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const HasLocalePreferenceBrand: unique symbol;

export interface HasLocalePreference {
  readonly [HasLocalePreference.brand]: true;

  /** Get the preferred locale of the entity. */
  preferredLocale(): string | null;
}

export const HasLocalePreference = contract<HasLocalePreference, typeof HasLocalePreferenceBrand>(
  "Illuminate\\Contracts\\Translation\\HasLocalePreference",
  {
    preferredLocale: [],
  },
);
