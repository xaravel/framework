// Illuminate\Contracts\Database\Query\ConditionExpression, from laravel/framework v13.37.0.
import { contract } from "../../Contract";
import { Expression } from "./Expression";

declare const ConditionExpressionBrand: unique symbol;

export interface ConditionExpression extends Expression {
  readonly [ConditionExpression.brand]: true;
}

export const ConditionExpression = contract<ConditionExpression, typeof ConditionExpressionBrand>("Illuminate\\Contracts\\Database\\Query\\ConditionExpression", {}, [Expression]);
