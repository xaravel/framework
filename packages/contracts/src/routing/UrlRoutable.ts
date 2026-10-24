// Illuminate\Contracts\Routing\UrlRoutable, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Model } from "../structural/Model";

declare const UrlRoutableBrand: unique symbol;

export interface UrlRoutable {
  readonly [UrlRoutable.brand]: true;

  /** Get the value of the model's route key. */
  getRouteKey(): unknown;

  /** Get the route key for the model. */
  getRouteKeyName(): string;

  /**
   * Retrieve the model for a bound value.
   * @asyncRoot Database\ConnectionInterface.select
   */
  resolveRouteBinding(value: unknown, field?: string | null): Promise<Model | null>;

  /**
   * Retrieve the child model for a bound value.
   * @asyncRoot Database\ConnectionInterface.select
   */
  resolveChildRouteBinding(childType: string, value: unknown, field: string | null): Promise<Model | null>;
}

export const UrlRoutable = contract<UrlRoutable, typeof UrlRoutableBrand>(
  "Illuminate\\Contracts\\Routing\\UrlRoutable",
  {
    getRouteKey: [],
    getRouteKeyName: [],
    resolveChildRouteBinding: ["childType", "value", "field"],
    resolveRouteBinding: ["value", "field"],
  },
);
