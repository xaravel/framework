// PHP's `ArithmeticError` (Story 9.10, AD-19): an error in a mathematical operation.
import { registerClass } from "../registry/registry";
import { Error } from "./Error";

export class ArithmeticError extends Error {}

registerClass("ArithmeticError", ArithmeticError);
