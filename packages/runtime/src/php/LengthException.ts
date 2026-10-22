// PHP's `LengthException` (Story 9.10, AD-19): an invalid length.
import { registerClass } from "../registry/registry";
import { LogicException } from "./LogicException";

export class LengthException extends LogicException {}

registerClass("LengthException", LengthException);
