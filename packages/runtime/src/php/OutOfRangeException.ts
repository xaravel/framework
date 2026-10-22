// PHP's `OutOfRangeException` (Story 9.10, AD-19): an invalid index, detectable at compile time.
import { registerClass } from "../registry/registry";
import { LogicException } from "./LogicException";

export class OutOfRangeException extends LogicException {}

registerClass("OutOfRangeException", OutOfRangeException);
