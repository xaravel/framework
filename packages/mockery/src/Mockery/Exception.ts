// `Mockery\Exception` (Mockery 1.6.15, Exception.php): an UnexpectedValueException.
import { UnexpectedValueException } from "../php/UnexpectedValueException";
import { FQCN } from "../support/values";

export class Exception extends UnexpectedValueException {
  static override readonly [FQCN]: string = "Mockery\\Exception";
}
