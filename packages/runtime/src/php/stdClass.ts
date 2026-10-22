// PHP's `stdClass` (Story 9.7): the class with no members, which `(object) [...]` and `unserialize()` build. A dynamic
// property is a plain property write (PORTING.md § Mechanical expression rule / By hand), so the class declares an
// index signature and nothing else.
import { registerClass } from "../registry/registry";

export class stdClass {
  [property: string]: unknown;
}

registerClass("stdClass", stdClass);
