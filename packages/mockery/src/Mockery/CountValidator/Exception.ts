// `Mockery\CountValidator\Exception` (Mockery 1.6.15): an OutOfBoundsException.
import { OutOfBoundsException } from "../../php/OutOfBoundsException";
import { FQCN } from "../../support/values";

export class Exception extends OutOfBoundsException {
  static override readonly [FQCN]: string = "Mockery\\CountValidator\\Exception";
}
