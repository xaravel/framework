// Illuminate\Contracts\Support\Htmlable, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const HtmlableBrand: unique symbol;

export interface Htmlable {
  readonly [Htmlable.brand]: true;

  /** Get content as a string of HTML. */
  toHtml(): string;
}

export const Htmlable = contract<Htmlable, typeof HtmlableBrand>(
  "Illuminate\\Contracts\\Support\\Htmlable",
  {
    toHtml: [],
  },
);
