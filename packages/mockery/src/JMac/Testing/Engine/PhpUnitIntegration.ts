// `JMac\Testing\Engine\PhpUnitIntegration` (jasonmccreary/double v1.0.1): `registerPass()` is
// `Assert::assertTrue(true)`, an outermost Assert call, so the port records one `assertTrue` assertion. Internal.
import { recordAssertion } from "@xaravel/assert";
import { FQCN } from "../../../support/values";

export class PhpUnitIntegration {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\PhpUnitIntegration";

  static registerPass(): void {
    recordAssertion("assertTrue");
  }
}
