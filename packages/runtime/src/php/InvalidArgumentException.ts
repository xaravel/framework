// PHP's `InvalidArgumentException` (Story 9.10, AD-19): an argument that is not of the expected value.
import { registerClass } from "../registry/registry";
import { LogicException } from "./LogicException";

export class InvalidArgumentException extends LogicException {}

registerClass("InvalidArgumentException", InvalidArgumentException);
