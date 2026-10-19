// `JMac\Testing\Exceptions\InvalidDoubleTargetException` (jasonmccreary/double v1.0.1): a target that cannot be
// doubled. Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";

export class InvalidDoubleTargetException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\InvalidDoubleTargetException";

  constructor(
    readonly target: string,
    readonly reason: string,
  ) {
    super(DoubleException.lead(`Can't create a double for \`${target}\` since ${reason}.`));
  }

  static doesNotExist(target: string): InvalidDoubleTargetException {
    return new InvalidDoubleTargetException(target, "no such class or interface exists");
  }

  static mustBeInterface(target: string): InvalidDoubleTargetException {
    return new InvalidDoubleTargetException(target, "it's a class. When multiple targets are passed to `Double::for()`, they must all be interfaces");
  }

  static duplicateTarget(target: string): InvalidDoubleTargetException {
    return new InvalidDoubleTargetException(target, "it was passed more than once");
  }
}
