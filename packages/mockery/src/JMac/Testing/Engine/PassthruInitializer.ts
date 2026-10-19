// `JMac\Testing\Engine\PassthruInitializer` (jasonmccreary/double v1.0.1): readies a double for passthru. With a
// real instance, it must be an instance of the target (else PassthruTypeMismatchException), and its own enumerable
// fields are copied onto the double (Reflection's initialized properties; JS has no uninitialized typed property).
// With none, the double stays as made (no constructor ran), except that an interface (a contract token) has no
// method bodies to run (PassthruAutoInstantiationException). Internal.
import { FQCN, getClass } from "../../../support/values";
import { PassthruAutoInstantiationException } from "../Exceptions/PassthruAutoInstantiationException";
import { PassthruTypeMismatchException } from "../Exceptions/PassthruTypeMismatchException";
import type { DoubleTarget } from "./DoubleTarget";

export class PassthruInitializer {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\PassthruInitializer";

  static assertConstructible(target: DoubleTarget): void {
    if (target.isInterface()) {
      throw PassthruAutoInstantiationException.isInterface(target.name);
    }
  }

  static copyState(double: object, realInstance: object, target: DoubleTarget): void {
    if (!target.isInstance(realInstance)) {
      throw new PassthruTypeMismatchException(target.name, getClass(realInstance));
    }
    for (const key of Object.keys(realInstance)) {
      Object.defineProperty(double, key, { value: (realInstance as Record<string, unknown>)[key], writable: true, enumerable: true, configurable: true });
    }
  }
}
