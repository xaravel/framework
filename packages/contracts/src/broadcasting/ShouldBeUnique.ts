// Illuminate\Contracts\Broadcasting\ShouldBeUnique, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ShouldBeUniqueBrand: unique symbol;

export interface ShouldBeUnique {
  readonly [ShouldBeUnique.brand]: true;
}

export const ShouldBeUnique = contract<ShouldBeUnique, typeof ShouldBeUniqueBrand>("Illuminate\\Contracts\\Broadcasting\\ShouldBeUnique");
