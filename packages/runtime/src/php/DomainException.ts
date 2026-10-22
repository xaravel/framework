// PHP's `DomainException` (Story 9.10, AD-19): a value outside a defined data domain.
import { registerClass } from "../registry/registry";
import { LogicException } from "./LogicException";

export class DomainException extends LogicException {}

registerClass("DomainException", DomainException);
