// `PhpOption\None` (phpoption/phpoption 1.10.0, Apache-2.0, Copyright 2012 Johannes M. Schmitt), ported line for
// line (ESC-15.2-4). The one instance `create()` returns is immutable process state, not per-request state (AD-5).
// Upstream's `getIterator()` returns PHP's `EmptyIterator`, which `@xaravel/runtime` does not export yet
// (ESC-15.2-6), so it throws `BlockedByComponentError(runtime)`.
import { BlockedByComponentError, registerClass } from "@xaravel/runtime";
import { type Exception, RuntimeException, type Traversable, Error as PhpError } from "@xaravel/runtime/php";
import { Option } from "./Option";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("None");

/** The empty option: PhpOption's `None`. */
export class None extends Option<never> {
  private static instance: None | null = null;

  static create(): None {
    if (null === None.instance) {
      None.instance = new None(CREATE);
    }

    return None.instance;
  }

  get(): never {
    throw new RuntimeException("None has no value.");
  }

  getOrCall<S>(callable: () => S): S {
    return (callable() ?? null) as S;
  }

  getOrElse<S>(defaultValue: S): S {
    return defaultValue;
  }

  getOrThrow(ex: Exception): never {
    throw ex;
  }

  isEmpty(): boolean {
    return true;
  }

  isDefined(): boolean {
    return false;
  }

  orElse<S>(elseOption: Option<S>): Option<S> {
    return elseOption;
  }

  ifDefined(callable: (value: never) => unknown): void {
    // Just do nothing in that case.
    void callable;
  }

  forAll(callable: (value: never) => unknown): None {
    void callable;
    return this;
  }

  map<S>(callable: (value: never) => S): None {
    void callable;
    return this;
  }

  flatMap<S>(callable: (value: never) => Option<S>): None {
    void callable;
    return this;
  }

  filter(callable: (value: never) => unknown): None {
    void callable;
    return this;
  }

  filterNot(callable: (value: never) => unknown): None {
    void callable;
    return this;
  }

  select(value: unknown): None {
    void value;
    return this;
  }

  reject(value: unknown): None {
    void value;
    return this;
  }

  getIterator(): Traversable {
    throw new BlockedByComponentError("runtime", "EmptyIterator (ESC-15.2-6)");
  }

  foldLeft<S>(initialValue: S, callable: (accumulator: S, value: never) => S): S {
    void callable;
    return initialValue;
  }

  foldRight<S>(initialValue: S, callable: (value: never, accumulator: S) => S): S {
    void callable;
    return initialValue;
  }

  /** Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    super();
    if (key !== CREATE) {
      throw new PhpError("Call to private PhpOption\\None::__construct() from global scope");
    }
  }
}

registerClass("PhpOption\\None", None);
