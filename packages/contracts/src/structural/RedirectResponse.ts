// Illuminate\Http\RedirectResponse, as a contract names it (AD-1.2): a subset of its public methods, its trait's and
// its Symfony parent's.
import type { MessageProvider } from "../support/MessageProvider";
import type { PhpArrayLike } from "./PhpArrayLike";
import type { ResponseTrait } from "./ResponseTrait";

/** An HTTP redirect response. */
export interface RedirectResponse extends ResponseTrait {
  /** Flash a piece of data to the session. */
  with(key: PhpArrayLike | string, value?: unknown): this;

  /** Flash an array of input to the session. */
  withInput(input?: PhpArrayLike | null): this;

  /** Flash a container of errors to the session. */
  withErrors(provider: MessageProvider | PhpArrayLike | string, key?: string): this;

  /** Add a fragment identifier to the URL. */
  withFragment(fragment: string): this;

  /** Remove any fragment identifier from the response URL. */
  withoutFragment(): this;

  /** Returns the target URL. */
  getTargetUrl(): string;
}
