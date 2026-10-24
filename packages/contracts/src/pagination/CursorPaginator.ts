// Illuminate\Contracts\Pagination\CursorPaginator, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Cursor } from "../structural/Cursor";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const CursorPaginatorBrand: unique symbol;

export interface CursorPaginator {
  readonly [CursorPaginator.brand]: true;

  /** Get the URL for a given cursor. */
  url(cursor: Cursor | null): string;

  /** Add a set of query string values to the paginator. */
  appends(key: PhpArrayLike | string | null, value?: string | null): this;

  /** Get the URL fragment to be appended to URLs; given a fragment, set it. */
  fragment(fragment?: null): string | null;
  fragment(fragment: string): this;

  /** Add all current query string values to the paginator. */
  withQueryString(): this;

  /** Get the URL for the previous page, or null. */
  previousPageUrl(): string | null;

  /** The URL for the next page, or null. */
  nextPageUrl(): string | null;

  /** Get all of the items being paginated. */
  items(): PhpArrayLike;

  /** Get the "cursor" of the previous set of items. */
  previousCursor(): Cursor | null;

  /** Get the "cursor" of the next set of items. */
  nextCursor(): Cursor | null;

  /** Determine how many items are being shown per page. */
  perPage(): number;

  /** Get the current cursor being paginated. */
  cursor(): Cursor | null;

  /** Determine if there are enough items to split into multiple pages. */
  hasPages(): boolean;

  /** Determine if there are more items in the data source. */
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

export const CursorPaginator = contract<CursorPaginator, typeof CursorPaginatorBrand>(
  "Illuminate\\Contracts\\Pagination\\CursorPaginator",
  {
    appends: ["key", "value"],
    cursor: [],
    fragment: ["fragment"],
    hasMorePages: [],
    hasPages: [],
    isEmpty: [],
    isNotEmpty: [],
    items: [],
    nextCursor: [],
    nextPageUrl: [],
    path: [],
    perPage: [],
    previousCursor: [],
    previousPageUrl: [],
    render: ["view", "data"],
    url: ["cursor"],
    withQueryString: [],
  },
);
