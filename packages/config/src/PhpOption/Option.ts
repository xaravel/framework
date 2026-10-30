// `PhpOption\Option` (phpoption/phpoption 1.10.0, Apache-2.0, Copyright 2012 Johannes M. Schmitt), ported line for
// line; `@xaravel/config` owns it beside vlucas/phpdotenv (ESC-15.2-4, decisions/MAINT-2026-10-30-story-15-2.md).
//
// PHP's `IteratorAggregate` is a brand getter (AD-9.5) plus `[Symbol.iterator]` and `entries()`, which iterate what
// `getIterator()` returns. `Option` names its subclasses `None`, `Some` and `LazyOption`, which extend it, so it
// reaches them through the Class Registry by FQCN (AD-10) rather than a static import, which would evaluate a
// subclass before its parent. `===` on the option's value is `identical` (PORTING.md § Idiom table). A callable is
// a JS function; `null` is the only absent value (AD-9).
import { registerClass, resolveClass } from "@xaravel/runtime";
import { array_reduce, ArrayAccess, call_user_func_array, arrayEntries, type Exception, identical, is_array, IteratorAggregate, normalizeKey, PhpArray, Traversable } from "@xaravel/runtime/php";
import type { LazyOption } from "./LazyOption";
import type { None } from "./None";
import type { Some } from "./Some";

/** `None::create()`, through the Class Registry. */
function none(): None {
  return (resolveClass("PhpOption\\None") as unknown as typeof None).create();
}

/** `new Some($value)`, through the Class Registry. */
function some<T>(value: T): Some<T> {
  return new (resolveClass("PhpOption\\Some") as unknown as typeof Some<T>)(value);
}

/** `new LazyOption($callback, $arguments)`, through the Class Registry. */
function lazy<T>(callback: (...args: unknown[]) => unknown, args: unknown[] = []): LazyOption<T> {
  return new (resolveClass("PhpOption\\LazyOption") as unknown as typeof LazyOption<T>)(callback, args);
}

/** PHP's `isset($array[$key])` for a PHP array or an `ArrayAccess` object, and the value it reads. */
function arrayValue(array: unknown, key: unknown): { found: boolean; value: unknown } {
  if (array instanceof ArrayAccess) {
    const access = array as unknown as { offsetExists(offset: unknown): boolean; offsetGet(offset: unknown): unknown };
    if (!access.offsetExists(key)) {
      return { found: false, value: null };
    }
    return { found: true, value: access.offsetGet(key) ?? null };
  }
  const normalized = normalizeKey(key);
  if (array instanceof PhpArray) {
    const value: unknown = array.get(normalized);
    return { found: value !== null, value };
  }
  const entry = arrayEntries(array as object).find(([candidate]) => candidate === normalized);
  return entry === undefined || entry[1] === null ? { found: false, value: null } : { found: true, value: entry[1] };
}

/** An optional value: PhpOption's `Option`. */
export abstract class Option<T> implements IteratorAggregate {
  /** The `IteratorAggregate` brand: an `instanceof IteratorAggregate` check finds this class (AD-9.5). */
  get [IteratorAggregate.brand](): true {
    return true;
  }

  /** The `Traversable` brand: an `instanceof Traversable` check finds this class (AD-9.5). */
  get [Traversable.brand](): true {
    return true;
  }

  /**
   * Creates an option given a return value.
   *
   * This is intended for consuming existing APIs and allows you to easily convert them to an option. By default, we
   * treat `null` as the None case, and everything else as Some.
   */
  static fromValue<S>(value: S, noneValue: unknown = null): Option<S> {
    if (identical(value, noneValue)) {
      return none();
    }

    return some(value);
  }

  /**
   * Creates an option from an array's value.
   *
   * If the key does not exist in the array, the array is not actually an array, or the array's value at the given key
   * is null, None is returned. Otherwise, Some is returned wrapping the value at the given key.
   */
  static fromArraysValue<S>(array: unknown, key: unknown): Option<S> {
    if (key === null || key === undefined || !(is_array(array) || array instanceof ArrayAccess)) {
      return none();
    }
    const { found, value } = arrayValue(array, key);
    if (!found) {
      return none();
    }

    return some(value as S);
  }

  /**
   * Creates a lazy-option with the given callback.
   *
   * This is also a helper constructor for lazy-consuming existing APIs where the return value is not yet an option.
   * By default, we treat `null` as the None case, and everything else as Some.
   */
  static fromReturn<S>(callback: (...args: never[]) => S, args: unknown[] = [], noneValue: unknown = null): LazyOption<S> {
    return lazy<S>(() => {
      const result: unknown = (callback as (...args: unknown[]) => unknown)(...args) ?? null;

      if (identical(result, noneValue)) {
        return none();
      }

      return some(result);
    });
  }

  /**
   * Option factory, which creates new option based on passed value.
   *
   * If the value is already an option, it is returned as is. If the value is callable, a LazyOption invoking it is
   * returned; should the callback return an Option, it is used directly, otherwise the result is passed to
   * Option::fromValue(). In all other cases, the value is passed to Option::fromValue() directly.
   */
  static ensure<S>(value: S | Option<S> | (() => S | Option<S>), noneValue: unknown = null): Option<S> {
    if (value instanceof Option) {
      return value as Option<S>;
    } else if (typeof value === "function") {
      return lazy<S>(() => {
        const result: unknown = (value as () => unknown)() ?? null;

        if (result instanceof Option) {
          return result;
        } else {
          return Option.fromValue(result, noneValue);
        }
      });
    } else {
      return Option.fromValue(value as S, noneValue);
    }
  }

  /**
   * Lift a function so that it accepts Option as parameters.
   *
   * We return a new closure that wraps the original callback. If any of the parameters passed to the lifted function
   * is empty, the function will return None. Otherwise, we will pass all parameters to the original callback and
   * return the value inside a new Option, unless an Option is returned from the function, in which case, we use that.
   *
   * The arguments fold with PHP's `array_reduce` from `@xaravel/runtime/php` (ESC-15.2-6); `func_get_args()` is the
   * rest parameter, `array_map` over a list is `Array.prototype.map`, and the callback runs through PHP's
   * `call_user_func_array`, so every PHP callable form works; an `undefined` result reads as `null` (AD-9).
   */
  static lift<S>(callback: (...args: never[]) => S, noneValue: unknown = null): (...args: Option<unknown>[]) => Option<S> {
    return (...args: Option<unknown>[]): Option<S> => {
      const reducedArgs = array_reduce(
        args,
        (status: unknown, o: Option<unknown>): unknown => {
          return o.isEmpty() ? true : status;
        },
        false,
      );
      // if at least one parameter is empty, return None
      if (reducedArgs) {
        return none();
      }

      const values = args.map((o: Option<unknown>): unknown => {
        // it is safe to do so because the fold above checked
        // that all arguments are of type Some
        return o.get();
      });

      return Option.ensure((call_user_func_array(callback, values) ?? null) as S | Option<S>, noneValue) as Option<S>;
    };
  }

  /** Returns the value if available, or throws an exception otherwise. */
  abstract get(): T;

  /** Returns the value if available, or the default value if not. */
  abstract getOrElse<S>(defaultValue: S): T | S;

  /**
   * Returns the value if available, or the results of the callable.
   *
   * This is preferable over `getOrElse` if the computation of the default value is expensive.
   */
  abstract getOrCall<S>(callable: () => S): T | S;

  /** Returns the value if available, or throws the passed exception. */
  abstract getOrThrow(ex: Exception): T;

  /** Returns true if no value is available, false otherwise. */
  abstract isEmpty(): boolean;

  /** Returns true if a value is available, false otherwise. */
  abstract isDefined(): boolean;

  /**
   * Returns this option if non-empty, or the passed option otherwise.
   *
   * This can be used to try multiple alternatives, and is especially useful with lazy evaluating options.
   */
  abstract orElse<S>(elseOption: Option<S>): Option<T> | Option<S>;

  /**
   * This is similar to map() below except that the return value has no meaning; the passed callable is simply
   * executed if the option is non-empty, and ignored if the option is empty.
   *
   * @deprecated Use forAll() instead.
   */
  abstract ifDefined(callable: (value: T) => unknown): void;

  /**
   * This is similar to map() except that the return value of the callable has no meaning.
   *
   * The passed callable is simply executed if the option is non-empty, and ignored if the option is empty. This
   * method is preferred for callables with side-effects, while map() is intended for callables without side-effects.
   */
  abstract forAll(callable: (value: T) => unknown): Option<T>;

  /**
   * Applies the callable to the value of the option if it is non-empty, and returns the return value of the callable
   * wrapped in Some().
   *
   * If the option is empty, then the callable is not applied.
   */
  abstract map<S>(callable: (value: T) => S): Option<S>;

  /**
   * Applies the callable to the value of the option if it is non-empty, and returns the return value of the callable
   * directly.
   *
   * In contrast to `map`, the return value of the callable is expected to be an Option itself; it is not
   * automatically wrapped in Some().
   */
  abstract flatMap<S>(callable: (value: T) => Option<S>): Option<S>;

  /**
   * If the option is empty, it is returned immediately without applying the callable.
   *
   * If the option is non-empty, the callable is applied, and if it returns true, the option itself is returned;
   * otherwise, None is returned.
   */
  abstract filter(callable: (value: T) => unknown): Option<T>;

  /**
   * If the option is empty, it is returned immediately without applying the callable.
   *
   * If the option is non-empty, the callable is applied, and if it returns false, the option itself is returned;
   * otherwise, None is returned.
   */
  abstract filterNot(callable: (value: T) => unknown): Option<T>;

  /**
   * If the option is empty, it is returned immediately.
   *
   * If the option is non-empty, and its value does not equal the passed value (via a shallow comparison ===), then
   * None is returned. Otherwise, the Option is returned.
   *
   * In other words, this will filter all but the passed value.
   */
  abstract select(value: unknown): Option<T>;

  /**
   * If the option is empty, it is returned immediately.
   *
   * If the option is non-empty, and its value does equal the passed value (via a shallow comparison ===), then None
   * is returned; otherwise, the Option is returned.
   *
   * In other words, this will let all values through except the passed value.
   */
  abstract reject(value: unknown): Option<T>;

  /**
   * Binary operator for the initial value and the option's value.
   *
   * If empty, the initial value is returned. If non-empty, the callable receives the initial value and the option's
   * value as arguments.
   */
  abstract foldLeft<S>(initialValue: S, callable: (accumulator: S, value: T) => S): S;

  /** foldLeft() but with reversed arguments for the callable. */
  abstract foldRight<S>(initialValue: S, callable: (value: T, accumulator: S) => S): S;

  /** PHP's `IteratorAggregate::getIterator()`. */
  abstract getIterator(): Traversable;

  /** The values `getIterator()` yields, as PHP's `foreach ($option as $v)` reads them. */
  *[Symbol.iterator](): Generator<unknown, void, undefined> {
    yield* this.getIterator() as unknown as Iterable<unknown>;
  }

  /** The `[key, value]` pairs `getIterator()` yields, as `foreach ($option as $k => $v)` reads them. */
  *entries(): Generator<[unknown, unknown], void, undefined> {
    yield* (this.getIterator() as unknown as { entries(): Iterable<[unknown, unknown]> }).entries();
  }

  /** The keys `getIterator()` yields. */
  *keys(): Generator<unknown, void, undefined> {
    yield* (this.getIterator() as unknown as { keys(): Iterable<unknown> }).keys();
  }
}

registerClass("PhpOption\\Option", Option);
