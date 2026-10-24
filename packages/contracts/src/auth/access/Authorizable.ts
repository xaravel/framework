// Illuminate\Contracts\Auth\Access\Authorizable, from laravel/framework v13.37.0.
import { contract } from "../../Contract";
import type { PhpIterable } from "../../structural/PhpIterable";
import type { UnitEnum } from "../../structural/UnitEnum";

declare const AuthorizableBrand: unique symbol;

export interface Authorizable {
  readonly [Authorizable.brand]: true;

  /**
   * Determine if the entity has a given ability.
   * Runs the gate's ability callbacks and policies, which DIV-1 lets be async. Upstream's `$arguments` is `args`, `arguments` being a reserved word.
   * @asyncRoot callback
   */
  can(abilities: UnitEnum | PhpIterable | string, args?: unknown): Promise<boolean>;
}

export const Authorizable = contract<Authorizable, typeof AuthorizableBrand>(
  "Illuminate\\Contracts\\Auth\\Access\\Authorizable",
  {
    can: ["abilities", "arguments"],
  },
);
