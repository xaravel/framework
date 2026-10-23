// Illuminate\Contracts\Support\CanBeEscapedWhenCastToString, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const CanBeEscapedWhenCastToStringBrand: unique symbol;

export interface CanBeEscapedWhenCastToString {
  readonly [CanBeEscapedWhenCastToString.brand]: true;

  /** Indicate that the object's string representation should be escaped when __toString is invoked. */
  escapeWhenCastingToString(escape?: boolean): this;
}

export const CanBeEscapedWhenCastToString = contract<CanBeEscapedWhenCastToString, typeof CanBeEscapedWhenCastToStringBrand>(
  "Illuminate\\Contracts\\Support\\CanBeEscapedWhenCastToString",
  {
    escapeWhenCastingToString: ["escape"],
  },
);
