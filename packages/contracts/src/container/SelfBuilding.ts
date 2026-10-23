// Illuminate\Contracts\Container\SelfBuilding, from laravel/framework v13.37.0.
// Upstream's docblock `@method static static newInstance()` is a class-side method, not an interface member: it has
// no API-surface row and is left to the implementing class.
import { contract } from "../Contract";

declare const SelfBuildingBrand: unique symbol;

export interface SelfBuilding {
  readonly [SelfBuilding.brand]: true;
}

export const SelfBuilding = contract<SelfBuilding, typeof SelfBuildingBrand>("Illuminate\\Contracts\\Container\\SelfBuilding");
