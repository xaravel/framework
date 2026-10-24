// Illuminate\Contracts\Database\Query\Builder, from laravel/framework v13.37.0.
// Upstream's interface is intentionally empty and exists to improve IDE support (`@mixin` the query builder).
import { contract } from "../../Contract";

declare const BuilderBrand: unique symbol;

export interface Builder {
  readonly [Builder.brand]: true;
}

export const Builder = contract<Builder, typeof BuilderBrand>("Illuminate\\Contracts\\Database\\Query\\Builder");
