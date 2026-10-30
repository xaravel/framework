// Laravel's `Illuminate\Config\Repository` (v13.37.0), ported line for line over `Arr` from `@xaravel/collections`.
//
// The items the constructor receives are the Repository's base, a value copy that is never mutated afterwards. Every
// write (`set`, `push`, `prepend`, `offsetSet`, `offsetUnset`) copies the visible items with PHP's value semantics,
// applies `Arr.set` through a `Ref` and stores the copy in the overlay of the active unit frame, keyed by this
// Repository (AD-5.5): a concurrent unit keeps reading the base. With no active frame a write throws the
// `ScopeFrameException` the overlay throws (ESC-15.1-2). Reads see the innermost overlay this frame chain wrote, else
// the base. A config write made before the Application is `sealed` must change the base instead; that write needs the
// `sealed` state and its runtime seam, so it lands with them (Story 17.4 or 51.1), as ESC-15.1-2 rules.
//
// PHP's `ArrayAccess` and the config contract are brand getters (AD-9.5); index syntax is `get()` and the `offset*`
// methods (DIV-12.6, DIV-12.17). Upstream's `Macroable` waits on ESC-15.1-1. Config is sync (AD-6).
import { Arr, Collection } from "@xaravel/collections";
import { Repository as ConfigContract, type PhpArrayLike } from "@xaravel/contracts/config";
import {
  ArrayAccess,
  array_unshift,
  arrayAppend,
  arrayEntries,
  arrayFromEntries,
  gettype,
  InvalidArgumentException,
  is_array,
  is_bool,
  is_float,
  is_int,
  is_numeric,
  is_string,
  PhpArray,
  type PhpKeyInput,
  Ref,
  registerClass,
  sprintf,
  valueCopy,
} from "@xaravel/runtime";
import { frameOverlay } from "@xaravel/runtime/scope";

/** The overlay key under which a frame holds this Repository's written items. */
const ITEMS = Symbol.for("xaravel.config.Repository.items");

/** A configuration repository: Laravel's `Illuminate\Config\Repository`. */
export class Repository implements ConfigContract {
  /** All of the configuration items: the base, as the constructor received them. */
  protected readonly items: unknown;

  /** Create a new configuration repository. */
  constructor(items: PhpArrayLike = []) {
    this.items = valueCopy(items);
  }

  get [ArrayAccess.brand](): true {
    return true;
  }

  get [ConfigContract.brand](): true {
    return true;
  }

  /** The items this frame chain sees: the innermost overlay it wrote, else the base. */
  private visibleItems(): unknown {
    const overlay = frameOverlay(this);
    return overlay.has(ITEMS) ? overlay.get(ITEMS) : this.items;
  }

  /** Determine if the given configuration value exists. */
  has(key: unknown): boolean {
    return Arr.has(this.visibleItems(), key);
  }

  /**
   * Get the specified configuration value; an array of keys gets many (`getMany`). Upstream's `$default` is
   * `defaultValue`, `default` being a reserved word; a closure default is called, as `Arr::get` calls `value()`.
   */
  get(key: unknown, defaultValue: unknown = null): unknown {
    if (is_array(key)) {
      return this.getMany(key as PhpArrayLike);
    }

    return Arr.get(this.visibleItems(), key, defaultValue);
  }

  /**
   * Get many configuration values. A numeric key's value is the configuration key, with a `null` default; any other
   * key is the configuration key, and its value the default.
   */
  getMany(keys: PhpArrayLike): unknown {
    const items = this.visibleItems();
    const config = new PhpArray<PhpKeyInput, unknown>();

    for (let [key, default_] of arrayEntries(keys as object) as [unknown, unknown][]) {
      if (is_numeric(key)) {
        [key, default_] = [default_, null];
      }

      config.set(key as PhpKeyInput, Arr.get(items, key, default_));
    }

    return arrayFromEntries(config);
  }

  /** Get the specified string configuration value; throws `InvalidArgumentException` when it is not a string. */
  string(key: string, defaultValue: unknown = null): string {
    const value = this.get(key, defaultValue);

    if (!is_string(value)) {
      throw new InvalidArgumentException(
        sprintf("Configuration value for key [%s] must be a string, %s given.", key, gettype(value)),
      );
    }

    return value as string;
  }

  /** Get the specified integer configuration value; throws `InvalidArgumentException` when it is not an integer. */
  integer(key: string, defaultValue: unknown = null): number | bigint {
    const value = this.get(key, defaultValue);

    if (!is_int(value)) {
      throw new InvalidArgumentException(
        sprintf("Configuration value for key [%s] must be an integer, %s given.", key, gettype(value)),
      );
    }

    return value as number | bigint;
  }

  /** Get the specified float configuration value; throws `InvalidArgumentException` when it is not a float. */
  float(key: string, defaultValue: unknown = null): number {
    const value = this.get(key, defaultValue);

    if (!is_float(value)) {
      throw new InvalidArgumentException(
        sprintf("Configuration value for key [%s] must be a float, %s given.", key, gettype(value)),
      );
    }

    return value as number;
  }

  /** Get the specified boolean configuration value; throws `InvalidArgumentException` when it is not a boolean. */
  boolean(key: string, defaultValue: unknown = null): boolean {
    const value = this.get(key, defaultValue);

    if (!is_bool(value)) {
      throw new InvalidArgumentException(
        sprintf("Configuration value for key [%s] must be a boolean, %s given.", key, gettype(value)),
      );
    }

    return value as boolean;
  }

  /** Get the specified array configuration value; throws `InvalidArgumentException` when it is not an array. */
  array(key: string, defaultValue: unknown = null): PhpArrayLike {
    const value = this.get(key, defaultValue);

    if (!is_array(value)) {
      throw new InvalidArgumentException(
        sprintf("Configuration value for key [%s] must be an array, %s given.", key, gettype(value)),
      );
    }

    return value as PhpArrayLike;
  }

  /** Get the specified array configuration value as a collection. */
  collection(key: string, defaultValue: unknown = null): Collection {
    return new Collection(this.array(key, defaultValue));
  }

  /**
   * Set a given configuration value, or each value of an array of key/value pairs. The write goes to the active unit
   * frame's overlay; with no active frame it throws `ScopeFrameException` (AD-5.5).
   */
  set(key: unknown, value: unknown = null): void {
    const keys = is_array(key) ? (key as object) : new PhpArray<PhpKeyInput, unknown>([[key as PhpKeyInput, value]]);
    const items = new Ref<unknown>(valueCopy(this.visibleItems()));

    for (const [entryKey, entryValue] of arrayEntries(keys)) {
      Arr.set(items, entryKey, entryValue);
    }

    frameOverlay(this).set(ITEMS, items.value);
  }

  /** Prepend a value onto an array configuration value. */
  prepend(key: string, value: unknown): void {
    const array = new Ref<unknown>(this.get(key, []));

    array_unshift(array, value);

    this.set(key, array.value);
  }

  /** Push a value onto an array configuration value. */
  push(key: string, value: unknown): void {
    const array = new Ref<unknown>(this.get(key, []));

    arrayAppend(array, value);

    this.set(key, array.value);
  }

  /** Get all of the configuration items for the application, as a value copy. */
  all(): PhpArrayLike {
    return valueCopy(this.visibleItems()) as PhpArrayLike;
  }

  /** Determine if the given configuration option exists. */
  offsetExists(offset: unknown): boolean {
    return this.has(offset);
  }

  /** Get a configuration option. */
  offsetGet(offset: unknown): unknown {
    return this.get(offset);
  }

  /** Set a configuration option. */
  offsetSet(offset: unknown, value: unknown): void {
    this.set(offset, value);
  }

  /** Unset a configuration option: it is set to `null`, as Upstream does. */
  offsetUnset(offset: unknown): void {
    this.set(offset, null);
  }
}

registerClass("Illuminate\\Config\\Repository", Repository);
