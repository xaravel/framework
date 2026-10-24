// Illuminate\Contracts\Pagination\LengthAwarePaginator, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { Paginator } from "./Paginator";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const LengthAwarePaginatorBrand: unique symbol;

export interface LengthAwarePaginator extends Paginator {
  readonly [LengthAwarePaginator.brand]: true;

  /** Create a range of pagination URLs. */
  getUrlRange(start: number, end: number): PhpArrayLike;

  /** Determine the total number of items in the data store. */
  total(): number;

  /** Get the page number of the last available page. */
  lastPage(): number;
}

export const LengthAwarePaginator = contract<LengthAwarePaginator, typeof LengthAwarePaginatorBrand>(
  "Illuminate\\Contracts\\Pagination\\LengthAwarePaginator",
  {
    getUrlRange: ["start", "end"],
    lastPage: [],
    total: [],
  },
  [Paginator],
);
