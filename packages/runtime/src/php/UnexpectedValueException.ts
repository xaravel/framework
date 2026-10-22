// PHP's `UnexpectedValueException` (Story 9.10, AD-19): a value that does not match a list of values.
import { registerClass } from "../registry/registry";
import { RuntimeException } from "./RuntimeException";

export class UnexpectedValueException extends RuntimeException {}

registerClass("UnexpectedValueException", UnexpectedValueException);
