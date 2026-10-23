// Illuminate\Contracts\Validation\CompilableRules, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { StdClass } from "../structural/StdClass";

declare const CompilableRulesBrand: unique symbol;

export interface CompilableRules {
  readonly [CompilableRules.brand]: true;

  /** Compile the object into usable rules. */
  compile(attribute: string, value: unknown, data?: unknown, context?: unknown): StdClass;
  compile(attribute: string, value: unknown, options?: { data?: unknown; context?: unknown }): StdClass;
}

export const CompilableRules = contract<CompilableRules, typeof CompilableRulesBrand>(
  "Illuminate\\Contracts\\Validation\\CompilableRules",
  {
    compile: ["attribute", "value", "data", "context"],
  },
);
