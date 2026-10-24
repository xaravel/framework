// Illuminate\Contracts\Database\Eloquent\Castable, from laravel/framework v13.37.0.
// Upstream's only member is the static `castUsing(array $arguments)`. A TypeScript interface cannot declare a static
// member, so it is `CastableStatic`, the constructor side an implementing class satisfies
// (`class Address { static castUsing(args) {…} }`, `Address satisfies CastableStatic`; decisions/ESC-10.2-1.md).
import { contract } from "../../Contract";
import type { CastsAttributes } from "./CastsAttributes";
import type { CastsInboundAttributes } from "./CastsInboundAttributes";
import type { ClassString } from "../../structural/ClassString";
import type { PhpArrayLike } from "../../structural/PhpArrayLike";

declare const CastableBrand: unique symbol;

export interface Castable {
  readonly [Castable.brand]: true;
}

/** The static side of `Castable`, satisfied by an implementing class's constructor. */
export interface CastableStatic {
  /**
   * Get the name of the caster class to use when casting from / to this cast target.
   * Upstream's `$arguments` is `args`, `arguments` being a reserved word.
   */
  castUsing(args: PhpArrayLike): ClassString | CastsAttributes | CastsInboundAttributes;
}

export const Castable = contract<Castable, typeof CastableBrand>("Illuminate\\Contracts\\Database\\Eloquent\\Castable");
