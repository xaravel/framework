// PHP's `OutOfBoundsException` (Story 9.10, AD-19): an invalid key, detectable only at run time.
import { registerClass } from "../registry/registry";
import { RuntimeException } from "./RuntimeException";

export class OutOfBoundsException extends RuntimeException {}

registerClass("OutOfBoundsException", OutOfBoundsException);
