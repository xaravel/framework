// PHP's `RangeException` (Story 9.10, AD-19): a range error during program execution.
import { registerClass } from "../registry/registry";
import { RuntimeException } from "./RuntimeException";

export class RangeException extends RuntimeException {}

registerClass("RangeException", RangeException);
