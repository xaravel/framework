// Illuminate\Http\Request, as a contract names it (AD-1.2): a subset of its public methods, so the later
// `@xaravel/http` port satisfies it without contracts importing it.

/** An HTTP request. */
export interface Request {
  /** Get the request method. */
  method(): string;

  /** Get the root URL for the application. */
  root(): string;

  /** Get the URL (no query string) for the request. */
  url(): string;

  /** Get the full URL for the request. */
  fullUrl(): string;

  /** Get the current path info for the request. */
  path(): string;

  /** Determine if the request is the result of an AJAX call. */
  ajax(): boolean;
}
