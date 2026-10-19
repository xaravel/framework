// `JMac\Testing\Exceptions\PassthruAutoInstantiationException` (jasonmccreary/double v1.0.1): passthru() with no
// instance on an interface (a contract token) double. Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";

export class PassthruAutoInstantiationException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\PassthruAutoInstantiationException";

  constructor(
    readonly target: string,
    readonly reason: string,
  ) {
    super(DoubleException.lead(`Can't auto-instantiate \`${target}\` to passthru. ${reason} You may need to pass an existing instance instead. For example: \`->passthru($existingInstance)\`.`));
  }

  static isInterface(target: string): PassthruAutoInstantiationException {
    return new PassthruAutoInstantiationException(target, "It's an interface — so there's no constructor to invoke.");
  }
}
