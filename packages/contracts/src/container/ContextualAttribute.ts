// Illuminate\Contracts\Container\ContextualAttribute, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ContextualAttributeBrand: unique symbol;

export interface ContextualAttribute {
  readonly [ContextualAttribute.brand]: true;
}

export const ContextualAttribute = contract<ContextualAttribute, typeof ContextualAttributeBrand>("Illuminate\\Contracts\\Container\\ContextualAttribute");
