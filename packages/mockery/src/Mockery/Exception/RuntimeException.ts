// `Mockery\Exception\RuntimeException` (Mockery 1.6.15): extends PHP's `\Exception`.
import { Exception } from "../../php/Exception";
import { FQCN } from "../../support/values";

export class RuntimeException extends Exception {
  static override readonly [FQCN]: string = "Mockery\\Exception\\RuntimeException";
}
