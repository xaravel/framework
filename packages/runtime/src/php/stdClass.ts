// PHP's `stdClass` (Story 9.7): the class with no members, which `(object) [...]`, `unserialize()` and `jsonDecode`
// build. A dynamic property is a plain property write (PORTING.md § Mechanical expression rule / By hand), so the class
// declares an index signature and, beside it, only the non-enumerable prototype method
// `[Symbol.for('xaravel.php.props')]()`. That hook gives its own enumerable string properties, in order, as a PHP
// array, so `==` and `<=>` compare two stdClass objects by their properties as PHP's `zend_std_compare_objects` does
// (DIV-9, PHP comparison; action item epic-14-retro-item-6-stdclass-props-hook). It lists the same properties
// `objectProps` read before it existed, so `jsonEncode`, `phpSerialize` and the `(array)` cast are unchanged.
// "In order" is JS key order: `Object.keys` lists integer-like names first, so a stdClass mixing integer-like and string
// names compares (`<=>`) in that order, not PHP's insertion order (the same limit `jsonDecode.ts`'s header notes).
import { registerClass } from "../registry/registry";
import { PhpArray } from "./PhpArray";

const PHP_PROPS = Symbol.for("xaravel.php.props");

export class stdClass {
  [property: string]: unknown;

  /** The own enumerable string properties, in order, as a PHP array; a value `undefined` reads as `null`. */
  [PHP_PROPS](): PhpArray {
    return new PhpArray(Object.keys(this).map((key) => [key, this[key] ?? null] as const));
  }
}

registerClass("stdClass", stdClass);
