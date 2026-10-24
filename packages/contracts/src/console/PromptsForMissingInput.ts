// Illuminate\Contracts\Console\PromptsForMissingInput, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const PromptsForMissingInputBrand: unique symbol;

export interface PromptsForMissingInput {
  readonly [PromptsForMissingInput.brand]: true;
}

export const PromptsForMissingInput = contract<PromptsForMissingInput, typeof PromptsForMissingInputBrand>("Illuminate\\Contracts\\Console\\PromptsForMissingInput");
