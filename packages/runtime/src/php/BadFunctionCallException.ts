// PHP's `BadFunctionCallException` (Story 9.10, AD-19): a call to an undefined function or with missing arguments.
import { registerClass } from "../registry/registry";
import { LogicException } from "./LogicException";

export class BadFunctionCallException extends LogicException {}

registerClass("BadFunctionCallException", BadFunctionCallException);
