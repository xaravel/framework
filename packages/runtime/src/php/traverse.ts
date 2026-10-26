// PHP's traversal of an `iterable` (ESC-14.1-6; action item epic-14-item-2-runtime-generators-functions): the
// `get_iterator` handlers `foreach`, `yield from`, `iterator_to_array` and `iterator_count` read an object through.
// An `Iterator` is walked by its five methods (`zend_user_it_*`), an `IteratorAggregate` through `getIterator()`,
// repeated while it returns another aggregate (`zend_user_it_get_new_iterator`), and a `Generator` by its own methods
// once `zend_generator_get_iterator` has refused a closed one. A bare JS generator object is wrapped in `Generator`.
// A runtime Traversable with neither brand is walked through its `entries()`. Internal: the package does not export
// this module. It and `Generator.ts` import each other; every cross-use happens at call time, never at load.
import { arrayCount, arrayEntries, isTrue } from "./casts";
import { Exception } from "./Exception";
import { Generator, generatorTraversal, isGeneratorObject, isJsGenerator } from "./Generator";
import { Iterator } from "./Iterator";
import { IteratorAggregate } from "./IteratorAggregate";
import { foreachIterator, foreachValues, type IteratorMethods } from "./liveCursor";
import { PhpArray, type PhpKeyInput } from "./PhpArray";
import { className, phpType, phpTypeName } from "./phpType";
import { phpValueOf } from "./throwableArguments";
import { Traversable } from "./Traversable";
import { TypeError as PhpTypeError } from "./TypeError";

/** Whether `value` is a Traversable object: a runtime-branded one, or a bare JS generator object. */
export function isTraversable(value: unknown): value is object {
  return isJsGenerator(value) || ((typeof value === "object" || typeof value === "function") && value !== null && value instanceof Traversable);
}

/** A PHP `Iterator` read through its methods, as `zend_user_it_*` reads it: `valid()` by `zend_is_true`. */
function userIterator(iterator: Iterator): IteratorMethods {
  return {
    rewind: () => iterator.rewind(),
    valid: () => isTrue(iterator.valid()),
    current: () => (iterator.current() as unknown) ?? null,
    key: () => (iterator.key() as unknown) ?? null,
    next: () => iterator.next(),
  };
}

/** A runtime Traversable with neither `Iterator` nor `IteratorAggregate`, walked through its `entries()`. */
function entriesIterator(traversable: Traversable): IteratorMethods {
  let iterator: globalThis.Iterator<[unknown, unknown]> | null = null;
  let step: IteratorResult<[unknown, unknown]> | null = null;
  const advance = (): void => {
    step = iterator === null ? null : iterator.next();
  };
  return {
    rewind: () => {
      iterator = traversable.entries()[Symbol.iterator]();
      advance();
    },
    valid: () => step !== null && step.done !== true,
    current: () => (step === null || step.done === true ? null : (step.value[1] ?? null)),
    key: () => (step === null || step.done === true ? null : (step.value[0] ?? null)),
    next: () => advance(),
  };
}

/**
 * The iterator PHP's `get_iterator` gives for the Traversable `subject`. Throws PHP's `Exception` for a closed
 * generator, and for an `IteratorAggregate` whose `getIterator()` returns no Traversable, itself, or an aggregate the
 * chain already passed (PHP rejects the self-return; a longer cycle is refused with the same message).
 */
export function iteratorOf(subject: object): IteratorMethods {
  let current: unknown = subject;
  const visited = new Set<unknown>();
  for (;;) {
    if (isJsGenerator(current)) {
      current = new Generator(current);
    }
    if (isGeneratorObject(current)) {
      return generatorTraversal(current);
    }
    if (current instanceof Iterator) {
      return userIterator(current);
    }
    if (current instanceof IteratorAggregate) {
      visited.add(current);
      const next: unknown = current.getIterator();
      if (!isTraversable(next) || visited.has(next)) {
        throw new Exception(`Objects returned by ${className(current)}::getIterator() must be traversable or implement interface Iterator`);
      }
      current = next;
      continue;
    }
    return entriesIterator(current as Traversable);
  }
}

/** `Z_PARAM_ITERABLE`: `value` is an array or a Traversable, else PHP's `TypeError`. */
export function iterableArgument(fn: string, value: unknown): void {
  if ((typeof value === "object" && value !== null && phpType(value) === "array") || isTraversable(value)) {
    return;
  }
  throw new PhpTypeError(`${fn}(): Argument #1 ($iterator) must be of type Traversable|array, ${phpTypeName(phpValueOf(value ?? null))} given`);
}

/**
 * The entries of `iterator_to_array`'s result (`spl_iterator_to_array_apply`): an array's own, or each Traversable
 * pair set by `array_set_zval_key`, a later key overwriting an earlier one; with `preserveKeys` false, the values as a
 * list. Throws PHP's `TypeError` for a non-iterable and for a key no array takes.
 */
export function iterableToArray(fn: string, value: unknown, preserveKeys: boolean): PhpArray<PhpKeyInput, unknown> {
  iterableArgument(fn, value);
  const result = new PhpArray<PhpKeyInput, unknown>();
  if (phpType(value) === "array") {
    for (const [key, item] of arrayEntries(value as object)) {
      if (preserveKeys) {
        result.set(key, item);
      } else {
        result.push(item);
      }
    }
    return result;
  }
  const iterator = iteratorOf(value as object);
  if (preserveKeys) {
    for (const [key, item] of foreachIterator(iterator)) {
      result.set(key as PhpKeyInput, item);
    }
  } else {
    for (const item of foreachValues(iterator)) {
      result.push(item);
    }
  }
  return result;
}

/** `iterator_count`: an array's count, or the steps of PHP's protocol (`rewind`, then `valid` / `next`). */
export function iterableCount(fn: string, value: unknown): number {
  iterableArgument(fn, value);
  if (phpType(value) === "array") {
    return arrayCount(value as object);
  }
  const iterator = iteratorOf(value as object);
  let count = 0;
  iterator.rewind();
  while (iterator.valid()) {
    count++;
    iterator.next();
  }
  return count;
}
