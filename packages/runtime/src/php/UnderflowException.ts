// PHP's `UnderflowException` (Story 9.10, AD-19): an operation on an empty container.
import { registerClass } from "../registry/registry";
import { RuntimeException } from "./RuntimeException";

export class UnderflowException extends RuntimeException {}

registerClass("UnderflowException", UnderflowException);
