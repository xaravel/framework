// Epic 10 retro item 10 fixture: fails `xaravel/no-token-string-coercion` only, six times, under `packages/<p>/src/`
// or `installer/src/`; clean under `tests/`, `tools/` or `conformance/` (AD-9.8).
// @ts-expect-error TS2307: the fixtures run without the framework packages; the rule reads only the specifier.
import { Arrayable, contract } from "@xaravel/contracts";
// @ts-expect-error TS2307: as above.
import * as support from "@xaravel/contracts/support";

const Local = contract("App\\Contracts\\Local");

/** Each matrix row's coercion, and `+=`. */
export function messages(): string[] {
  let text = "token: ";
  text += Arrayable;
  return [`${Arrayable}`, String(support.Arrayable), "x" + Arrayable, Arrayable.toString(), `local ${Local}`, text];
}
