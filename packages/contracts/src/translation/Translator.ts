// Illuminate\Contracts\Translation\Translator, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Countable } from "../structural/Countable";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const TranslatorBrand: unique symbol;

export interface Translator {
  readonly [Translator.brand]: true;

  /** Get the translation for a given key. */
  get(key: string, replace?: PhpArrayLike, locale?: string | null): unknown;
  get(key: string, options?: { replace?: PhpArrayLike; locale?: string | null }): unknown;

  /** Get a translation according to an integer value. */
  choice(key: string, number: Countable | number | PhpArrayLike, replace?: PhpArrayLike, locale?: string | null): string;
  choice(key: string, number: Countable | number | PhpArrayLike, options?: { replace?: PhpArrayLike; locale?: string | null }): string;

  /** Get the default locale being used. */
  getLocale(): string;

  /** Set the default locale. */
  setLocale(locale: string): void;
}

export const Translator = contract<Translator, typeof TranslatorBrand>(
  "Illuminate\\Contracts\\Translation\\Translator",
  {
    choice: ["key", "number", "replace", "locale"],
    get: ["key", "replace", "locale"],
    getLocale: [],
    setLocale: ["locale"],
  },
);
