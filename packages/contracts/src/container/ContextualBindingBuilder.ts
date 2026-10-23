// Illuminate\Contracts\Container\ContextualBindingBuilder, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { ClassString } from "../structural/ClassString";
import type { Closure } from "../structural/Closure";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const ContextualBindingBuilderBrand: unique symbol;

export interface ContextualBindingBuilder {
  readonly [ContextualBindingBuilder.brand]: true;

  /** Define the abstract target that depends on the context. */
  needs(abstract: ClassString): this;

  /** Define the implementation for the contextual binding. */
  give(implementation: Closure | ClassString | PhpArrayLike): this;

  /** Define tagged services to be used as the implementation for the contextual binding. */
  giveTagged(tag: string): this;

  /**
   * Specify the configuration item to bind as a primitive.
   * Upstream's `$default` is `defaultValue`, `default` being a reserved word.
   */
  giveConfig(key: string, defaultValue?: unknown): this;
}

export const ContextualBindingBuilder = contract<ContextualBindingBuilder, typeof ContextualBindingBuilderBrand>(
  "Illuminate\\Contracts\\Container\\ContextualBindingBuilder",
  {
    give: ["implementation"],
    giveConfig: ["key", "default"],
    giveTagged: ["tag"],
    needs: ["abstract"],
  },
);
