// Illuminate\Http\JsonResponse, as a contract names it (AD-1.2): a subset of its public methods and its trait's.
import type { ResponseTrait } from "./ResponseTrait";

/** A JSON HTTP response. */
export interface JsonResponse extends ResponseTrait {
  /** Sets the JSONP callback. */
  withCallback(callback?: string | null): this;

  /** Get the json_decoded data from the response. */
  getData(assoc?: boolean, depth?: number): unknown;

  /** Sets the data to be sent as JSON. */
  setData(data?: unknown): this;

  /** Sets options used while encoding data to JSON. */
  setEncodingOptions(options: number): this;

  /** Determine if a JSON encoding option is set. */
  hasEncodingOption(option: number): boolean;
}
