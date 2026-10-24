// Illuminate\Http\Response, as a contract names it (AD-1.2): a subset of its public methods and its trait's. Named
// for its namespace, `Response` being Symfony's, which it extends.
import type { ResponseTrait } from "./ResponseTrait";

/** An HTTP response. */
export interface HttpResponse extends ResponseTrait {
  /** Set the content on the response; an Arrayable, a Jsonable or an array is JSON-encoded. */
  setContent(content: unknown): this;
}
