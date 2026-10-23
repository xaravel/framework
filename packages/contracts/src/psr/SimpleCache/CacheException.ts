// Psr\SimpleCache\CacheException, from psr/simple-cache 3.0.0 (ESC-10.1-4). PHP's `Throwable` parent becomes `Error`:
// Xaravel's throwables are JS `Error`s.
import { contract } from "../../Contract";

declare const CacheExceptionBrand: unique symbol;

/** Interface used for all types of exceptions thrown by the implementing library. */
export interface CacheException extends Error {
  readonly [CacheException.brand]: true;
}

export const CacheException = contract<CacheException, typeof CacheExceptionBrand>("Psr\\SimpleCache\\CacheException");
