// Psr\SimpleCache\InvalidArgumentException, from psr/simple-cache 3.0.0 (ESC-10.1-4).
import { contract } from "../../Contract";
import { CacheException } from "./CacheException";

declare const InvalidArgumentExceptionBrand: unique symbol;

/** Exception interface for invalid cache arguments. */
export interface InvalidArgumentException extends CacheException {
  readonly [InvalidArgumentException.brand]: true;
}

export const InvalidArgumentException = contract<InvalidArgumentException, typeof InvalidArgumentExceptionBrand>("Psr\\SimpleCache\\InvalidArgumentException");
