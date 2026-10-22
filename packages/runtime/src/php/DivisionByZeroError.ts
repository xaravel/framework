// PHP's `DivisionByZeroError` (Story 9.10, AD-19): a division or modulo by zero.
import { registerClass } from "../registry/registry";
import { ArithmeticError } from "./ArithmeticError";

export class DivisionByZeroError extends ArithmeticError {}

registerClass("DivisionByZeroError", DivisionByZeroError);
