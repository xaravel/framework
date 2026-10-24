// Illuminate\Contracts\Broadcasting\ShouldRescue, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ShouldRescueBrand: unique symbol;

export interface ShouldRescue {
  readonly [ShouldRescue.brand]: true;
}

export const ShouldRescue = contract<ShouldRescue, typeof ShouldRescueBrand>("Illuminate\\Contracts\\Broadcasting\\ShouldRescue");
