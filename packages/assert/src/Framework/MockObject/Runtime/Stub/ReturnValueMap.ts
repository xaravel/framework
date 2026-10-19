// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Stub\ReturnValueMap` (Story 4.7): `willReturnMap($map)`: the last element of the first row whose other elements are `===` the call's arguments (a Constraint element is evaluated), among the rows with one element more than the call has arguments; else `null`.
import { phpStrictEquals } from "../../../../comparison/PhpComparison";
import { Constraint } from "../../../Constraint";
import type { Invocation } from "../Invocation";
import { STUB, type Stub } from "./Stub";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ReturnValueMap implements Stub {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Stub\\ReturnValueMap";

  readonly [STUB] = true as const;
  readonly #valueMap: readonly unknown[];

  constructor(valueMap: readonly unknown[]) {
    this.#valueMap = valueMap;
  }

  invoke(invocation: Invocation): unknown {
    const parameters = invocation.parameters();
    for (const map of this.#valueMap) {
      if (!Array.isArray(map) || parameters.length !== map.length - 1) {
        continue;
      }
      const row = [...(map as unknown[])];
      const value = row.pop();
      if (parametersMatch(row, parameters)) {
        return value;
      }
    }
    return null;
  }
}

function parametersMatch(mapParameters: readonly unknown[], invocationParameters: readonly unknown[]): boolean {
  return mapParameters.every((expected, index) => {
    if (index >= invocationParameters.length) {
      return false;
    }
    if (expected instanceof Constraint) {
      return expected.evaluate(invocationParameters[index], "", true) !== false;
    }
    return phpStrictEquals(expected, invocationParameters[index]);
  });
}
