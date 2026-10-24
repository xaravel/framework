// Symfony\Component\HttpFoundation\StreamedJsonResponse, as a contract names it (AD-1.2): a subset of its documented
// public methods and its parent's.
import type { StreamedResponse } from "./StreamedResponse";

/** A streamed response whose content is JSON. */
export interface StreamedJsonResponse extends StreamedResponse {
  /** Sets the JSON encoding options. */
  setEncodingOptions(encodingOptions: number): this;
}
