// PHP's `LogicException` (Story 9.10, AD-19): the SPL root of errors in the program logic.
import { registerClass } from "../registry/registry";
import { Exception } from "./Exception";

export class LogicException extends Exception {}

registerClass("LogicException", LogicException);
