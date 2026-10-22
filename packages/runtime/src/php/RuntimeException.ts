// PHP's `RuntimeException` (Story 9.10, AD-19): the SPL root of errors only detectable at run time.
import { registerClass } from "../registry/registry";
import { Exception } from "./Exception";

export class RuntimeException extends Exception {}

registerClass("RuntimeException", RuntimeException);
