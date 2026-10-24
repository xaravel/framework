// Illuminate\Contracts\Database\Eloquent\Builder, from laravel/framework v13.37.0.
// Upstream's interface is intentionally empty and exists to improve IDE support (`@mixin` the Eloquent builder).
import { contract } from "../../Contract";
import { Builder as QueryBuilder } from "../query/Builder";

declare const BuilderBrand: unique symbol;

export interface Builder extends QueryBuilder {
  readonly [Builder.brand]: true;
}

export const Builder = contract<Builder, typeof BuilderBrand>("Illuminate\\Contracts\\Database\\Eloquent\\Builder", {}, [QueryBuilder]);
