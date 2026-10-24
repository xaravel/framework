// Illuminate\Http\ResponseTrait, as the responses a contract names use it (AD-1.2): a subset of the trait's public
// methods, shared by the structural `HttpResponse`, `JsonResponse` and `RedirectResponse`.
import type { PhpArrayLike } from "./PhpArrayLike";
import type { Response } from "./Response";

/** Laravel's response helpers over a Symfony response. */
export interface ResponseTrait extends Response {
  /** Get the status code for the response. */
  status(): number;

  /** Get the content of the response. */
  content(): string;

  /** Get the original response content. */
  getOriginalContent(): unknown;

  /** Set a header on the Response. */
  header(key: string, values: PhpArrayLike | string, replace?: boolean): this;

  /** Add an array of headers to the response. */
  withHeaders(headers: PhpArrayLike): this;
}
