// Symfony\Component\HttpFoundation\StreamedResponse, as a contract names it (AD-1.2): a subset of its documented
// public methods.
import type { Closure } from "./Closure";
import type { Response } from "./Response";

/** A response whose content a callback streams. */
export interface StreamedResponse extends Response {
  /** Sets the PHP callback associated with this Response. */
  setCallback(callback: Closure): this;

  /** Returns the PHP callback associated with this Response. */
  getCallback(): Closure | null;
}
