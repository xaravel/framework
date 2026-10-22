// PHP's `BadMethodCallException` (Story 9.10, AD-19): a call to an undefined method or with missing arguments.
import { registerClass } from "../registry/registry";
import { BadFunctionCallException } from "./BadFunctionCallException";

export class BadMethodCallException extends BadFunctionCallException {}

registerClass("BadMethodCallException", BadMethodCallException);
