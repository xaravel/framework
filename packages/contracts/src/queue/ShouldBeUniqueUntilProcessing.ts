// Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { ShouldBeUnique } from "./ShouldBeUnique";

declare const ShouldBeUniqueUntilProcessingBrand: unique symbol;

export interface ShouldBeUniqueUntilProcessing extends ShouldBeUnique {
  readonly [ShouldBeUniqueUntilProcessing.brand]: true;
}

export const ShouldBeUniqueUntilProcessing = contract<ShouldBeUniqueUntilProcessing, typeof ShouldBeUniqueUntilProcessingBrand>("Illuminate\\Contracts\\Queue\\ShouldBeUniqueUntilProcessing", {}, [ShouldBeUnique]);
