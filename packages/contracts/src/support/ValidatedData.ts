// Illuminate\Contracts\Support\ValidatedData, from laravel/framework v13.37.0.
// PHP's built-in `ArrayAccess` and `IteratorAggregate` parents are no contract token: the interface extends the structural
// forms from `src/structural/`, and the token records no parent for them; it lists their methods as built-ins
// (decisions/ESC-10.2-4.md), so a test double can configure them.
import { contract } from "../Contract";
import { Arrayable } from "./Arrayable";
import type { ArrayAccess } from "../structural/ArrayAccess";
import type { IteratorAggregate } from "../structural/IteratorAggregate";

declare const ValidatedDataBrand: unique symbol;

export interface ValidatedData extends Arrayable, ArrayAccess, IteratorAggregate {
  readonly [ValidatedData.brand]: true;
}

export const ValidatedData = contract<ValidatedData, typeof ValidatedDataBrand>("Illuminate\\Contracts\\Support\\ValidatedData", {}, [Arrayable], {}, [
  "offsetExists",
  "offsetGet",
  "offsetSet",
  "offsetUnset",
  "getIterator",
]);
