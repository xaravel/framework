// Illuminate\Contracts\View\View, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import { Renderable } from "../support/Renderable";

declare const ViewBrand: unique symbol;

export interface View extends Renderable {
  readonly [View.brand]: true;

  /** Get the name of the view. */
  name(): string;

  /** Add a piece of data to the view. */
  with(key: PhpArrayLike | string, value?: unknown): this;

  /** Get the array of view data. */
  getData(): PhpArrayLike;
}

export const View = contract<View, typeof ViewBrand>(
  "Illuminate\\Contracts\\View\\View",
  {
    getData: [],
    name: [],
    with: ["key", "value"],
  },
  [Renderable],
);
