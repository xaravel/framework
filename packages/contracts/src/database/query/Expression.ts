// Illuminate\Contracts\Database\Query\Expression, from laravel/framework v13.37.0.
import { contract } from "../../Contract";
import type { Grammar } from "../../structural/Grammar";

declare const ExpressionBrand: unique symbol;

export interface Expression {
  readonly [Expression.brand]: true;

  /** Get the value of the expression. */
  getValue(grammar: Grammar): string | number;
}

export const Expression = contract<Expression, typeof ExpressionBrand>(
  "Illuminate\\Contracts\\Database\\Query\\Expression",
  {
    getValue: ["grammar"],
  },
);
