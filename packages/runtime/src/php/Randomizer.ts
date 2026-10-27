// PHP's `Random\Randomizer` (action item epic-14-item-5-runtime-array-functions, ESC-14.2-1), with `pickArrayKeys` and `shuffleArray`, a port of PHP 8.5.11's `ext/random/randomizer.c` and `php_array_pick_keys` (`ext/standard/array.c`) in
// coercive typing mode. `new Randomizer()` uses a secure engine, as PHP's default `Random\Engine\Secure` is
// (`crypto.getRandomValues`). No engine is ported: passing one throws a JS `TypeError` naming the limit, the `engine`
// property is absent, and the keys PHP picks for a given engine seed are not reproduced. The other methods
// (`nextInt`, `getInt`, …) are not ported. Registered as `Random\Randomizer`.
import { registerClass } from "../registry/registry";
import { arrayParameter, intParameter } from "./phpArguments";
import type { PhpArrayKey } from "./PhpArray";
import { valueCopy } from "./valueCopy";
import { ValueError } from "./ValueError";

const PICK_ARRAY_KEYS = "Random\\Randomizer::pickArrayKeys";

/** A uniform random integer in `[0, bound)`, `bound` at most 2^32, from the secure engine (rejection sampling). */
function randomBelow(bound: number): number {
  const word = new Uint32Array(1);
  const limit = 2 ** 32 - (2 ** 32 % bound);
  for (;;) {
    crypto.getRandomValues(word);
    if (word[0]! < limit) {
      return word[0]! % bound;
    }
  }
}

export class Randomizer {
  /**
   * PHP's `new Random\Randomizer(?Engine $engine = null)`, with the secure engine. Throws a JS `TypeError` for an
   * engine, which the runtime does not port.
   */
  constructor(engine: unknown = null) {
    if (engine !== null && engine !== undefined) {
      throw new TypeError("Random\\Randomizer::__construct(): Argument #1 ($engine) is not ported by Xaravel; omit it for the secure engine");
    }
  }

  /** PHP's shuffleArray: a uniformly shuffled, reindexed value copy, using the default secure engine. */
  shuffleArray(array: unknown): unknown[] {
    const values = arrayParameter("Random\\Randomizer::shuffleArray", 1, "array", array).map(([, value]) => valueCopy(value));
    for (let remaining = values.length; remaining > 1; remaining--) {
      const chosen = randomBelow(remaining);
      [values[remaining - 1], values[chosen]] = [values[chosen], values[remaining - 1]];
    }
    return values;
  }

  /**
   * PHP's `pickArrayKeys(array $array, int $num): array`: `num` distinct keys of `array`, as a list in the array's
   * order, each subset of that size equally likely. Throws PHP's `ValueError` for an empty array and for a `num` below
   * 1 or above the count, and PHP's `TypeError` for a non-array and a `num` that is no int.
   */
  pickArrayKeys(array: unknown, num: unknown): PhpArrayKey[] {
    const entries = arrayParameter(PICK_ARRAY_KEYS, 1, "array", array);
    const requested = BigInt(intParameter(PICK_ARRAY_KEYS, 2, "num", num));
    if (entries.length === 0) {
      throw new ValueError(`${PICK_ARRAY_KEYS}(): Argument #1 ($array) must not be empty`);
    }
    const available = entries.length;
    if (requested <= 0n || requested > BigInt(available)) {
      throw new ValueError(`${PICK_ARRAY_KEYS}(): Argument #2 ($num) must be between 1 and the number of elements in argument #1 ($array)`);
    }
    // PHP marks the positions it keeps, or, for more than half, the positions it leaves out.
    let marked = Number(requested);
    const negative = marked > available >> 1;
    if (negative) {
      marked = available - marked;
    }
    const chosen = new Set<number>();
    while (chosen.size < marked) {
      chosen.add(randomBelow(available));
    }
    return entries.filter((_, position) => chosen.has(position) !== negative).map(([key]) => key);
  }
}

registerClass("Random\\Randomizer", Randomizer);
