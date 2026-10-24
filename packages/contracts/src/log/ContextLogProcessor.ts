// Illuminate\Contracts\Log\ContextLogProcessor, from laravel/framework v13.37.0.
// Upstream extends Monolog's `ProcessorInterface`, which is no contract: the interface extends its structural form,
// and the token records no parent, as for a PHP built-in parent.
import { contract } from "../Contract";
import type { ProcessorInterface } from "../structural/ProcessorInterface";

declare const ContextLogProcessorBrand: unique symbol;

export interface ContextLogProcessor extends ProcessorInterface {
  readonly [ContextLogProcessor.brand]: true;
}

export const ContextLogProcessor = contract<ContextLogProcessor, typeof ContextLogProcessorBrand>("Illuminate\\Contracts\\Log\\ContextLogProcessor");
