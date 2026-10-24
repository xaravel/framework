// Illuminate\Contracts\Pagination\Paginator, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const PaginatorBrand: unique symbol;

export interface Paginator {
  readonly [Paginator.brand]: true;

  /** Get the URL for a given page. */
  url(page: number): string;

  /** Add a set of query string values to the paginator. */
  appends(key: PhpArrayLike | string | null, value?: string | null): this;

  /** Get the URL fragment to be appended to URLs; given a fragment, set it. */
  fragment(fragment?: null): string | null;
  fragment(fragment: string): this;

  /** Add all current query string values to the paginator. */
  withQueryString(): this;

  /** The URL for the next page, or null. */
  nextPageUrl(): string | null;

  /** Get the URL for the previous page, or null. */
  previousPageUrl(): string | null;

  /** Get all of the items being paginated. */
  items(): PhpArrayLike;

  /** Get the "index" of the first item being paginated. */
  firstItem(): number | null;

  /** Get the "index" of the last item being paginated. */
  lastItem(): number | null;

  /** Determine how many items are being shown per page. */
  perPage(): number;

  /** Determine the current page being paginated. */
  currentPage(): number;

  /** Determine if there are enough items to split into multiple pages. */
  hasPages(): boolean;

  /** Determine if there are more items in the data store. */
  hasMorePages(): boolean;

  /** Get the base path for paginator generated URLs. */
  path(): string | null;

  /** Determine if the list of items is empty or not. */
  isEmpty(): boolean;

  /** Determine if the list of items is not empty. */
  isNotEmpty(): boolean;

  /**
   * Render the paginator using a given view.
   * Renders a view (AD-11, the spine's Compilation: each compiled view module exports `render(ctx): Promise<string>`).
   * @asyncRoot callback
   */
  render(view?: string | null, data?: PhpArrayLike): Promise<string>;
  render(options?: { view?: string | null; data?: PhpArrayLike }): Promise<string>;
}

export const Paginator = contract<Paginator, typeof PaginatorBrand>(
  "Illuminate\\Contracts\\Pagination\\Paginator",
  {
    appends: ["key", "value"],
    currentPage: [],
    firstItem: [],
    fragment: ["fragment"],
    hasMorePages: [],
    hasPages: [],
    isEmpty: [],
    isNotEmpty: [],
    items: [],
    lastItem: [],
    nextPageUrl: [],
    path: [],
    perPage: [],
    previousPageUrl: [],
    render: ["view", "data"],
    url: ["page"],
    withQueryString: [],
  },
);
