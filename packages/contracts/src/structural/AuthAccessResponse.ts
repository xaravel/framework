// Illuminate\Auth\Access\Response, as a contract names it (AD-1.2): a subset of its public methods, so the later
// `@xaravel/auth` port satisfies it without contracts importing it. Named for its namespace, `Response` being Symfony's.
import type { PhpArrayLike } from "./PhpArrayLike";

/** The result of an authorization check. */
export interface AuthAccessResponse {
  /** Determine if the response was allowed. */
  allowed(): boolean;

  /** Determine if the response was denied. */
  denied(): boolean;

  /** Get the response message. */
  message(): string | null;

  /** Get the response code / reason. */
  code(): unknown;

  /** Throw authorization exception if response was denied. */
  authorize(): this;

  /** Get the HTTP status code. */
  status(): number | null;

  /** Convert the response to an array. */
  toArray(): PhpArrayLike;
}
