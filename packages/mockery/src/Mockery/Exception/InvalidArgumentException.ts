// `Mockery\Exception\InvalidArgumentException` (Mockery 1.6.15).
import { InvalidArgumentException as PhpInvalidArgumentException } from "../../php/InvalidArgumentException";
import { FQCN } from "../../support/values";

export class InvalidArgumentException extends PhpInvalidArgumentException {
  static override readonly [FQCN]: string = "Mockery\\Exception\\InvalidArgumentException";
}
