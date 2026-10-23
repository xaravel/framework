// Illuminate\Contracts\Validation\ImplicitRule, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { Rule } from "./Rule";

declare const ImplicitRuleBrand: unique symbol;

export interface ImplicitRule extends Rule {
  readonly [ImplicitRule.brand]: true;
}

export const ImplicitRule = contract<ImplicitRule, typeof ImplicitRuleBrand>("Illuminate\\Contracts\\Validation\\ImplicitRule", {}, [Rule]);
