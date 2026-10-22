// PHP's `OverflowException` (Story 9.10, AD-19): adding an element to a full container.
import { registerClass } from "../registry/registry";
import { RuntimeException } from "./RuntimeException";

export class OverflowException extends RuntimeException {}

registerClass("OverflowException", OverflowException);
