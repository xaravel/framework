// `JMac\Testing\Engine\Mode` (jasonmccreary/double v1.0.1): a double's one mode, set once. PHP's enum is a class
// with one frozen instance per case. Internal.
import { FQCN } from "../../../support/values";

export class Mode {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\Mode";

  static readonly Loose: Mode = Object.freeze(new Mode("Loose"));
  static readonly Strict: Mode = Object.freeze(new Mode("Strict"));
  static readonly Passthru: Mode = Object.freeze(new Mode("Passthru"));

  private constructor(readonly name: string) {}

  static cases(): Mode[] {
    return [Mode.Loose, Mode.Strict, Mode.Passthru];
  }
}
