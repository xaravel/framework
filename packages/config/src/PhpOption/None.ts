// `PhpOption\None` (phpoption/phpoption 1.10.0, Apache-2.0, Copyright 2012 Johannes M. Schmitt), ported line for
// line (ESC-15.2-4). The one instance `create()` returns is immutable process state, not per-request state (AD-5).
// `getIterator()` returns PHP's `EmptyIterator` from `@xaravel/runtime/php` (ESC-15.2-6).
import { registerClass } from "@xaravel/runtime";
import { EmptyIterator, type Exception, RuntimeException, Error as PhpError } from "@xaravel/runtime/php";
import { Option } from "./Option";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("None");

/** The empty option: PhpOption's `None`. */
export class None extends Option<never> {
  private static instance: None | null = null;

  /** Returns the one `None` instance, creating it on first use. */
  static create(): None {
    if (null === None.instance) {
      None.instance = new None(CREATE);
    }

    return None.instance;
  }

  /** {@inheritDoc Option.get} */
  get(): never {
    throw new RuntimeException("None has no value.");
  }

  /** {@inheritDoc Option.getOrCall} */
  getOrCall<S>(callable: () => S): S {
    return (callable() ?? null) as S;
  }

  /** {@inheritDoc Option.getOrElse} */
  getOrElse<S>(defaultValue: S): S {
    return defaultValue;
  }

  /** {@inheritDoc Option.getOrThrow} */
  getOrThrow(ex: Exception): never {
    throw ex;
  }

  /** {@inheritDoc Option.isEmpty} */
  isEmpty(): boolean {
    return true;
  }

  /** {@inheritDoc Option.isDefined} */
  isDefined(): boolean {
    return false;
  }

  /** {@inheritDoc Option.orElse} */
  orElse<S>(elseOption: Option<S>): Option<S> {
    return elseOption;
  }

  /** {@inheritDoc Option.ifDefined} */
  ifDefined(callable: (value: never) => unknown): void {
    // Just do nothing in that case.
    void callable;
  }

  /** {@inheritDoc Option.forAll} */
  forAll(callable: (value: never) => unknown): None {
    void callable;
    return this;
  }

  /** {@inheritDoc Option.map} */
  map<S>(callable: (value: never) => S): None {
    void callable;
    return this;
  }

  /** {@inheritDoc Option.flatMap} */
  flatMap<S>(callable: (value: never) => Option<S>): None {
    void callable;
    return this;
  }

  /** {@inheritDoc Option.filter} */
  filter(callable: (value: never) => unknown): None {
    void callable;
    return this;
  }

  /** {@inheritDoc Option.filterNot} */
  filterNot(callable: (value: never) => unknown): None {
    void callable;
    return this;
  }

  /** {@inheritDoc Option.select} */
  select(value: unknown): None {
    void value;
    return this;
  }

  /** {@inheritDoc Option.reject} */
  reject(value: unknown): None {
    void value;
    return this;
  }

  /** {@inheritDoc Option.getIterator} */
  getIterator(): EmptyIterator {
    return new EmptyIterator();
  }

  /** {@inheritDoc Option.foldLeft} */
  foldLeft<S>(initialValue: S, callable: (accumulator: S, value: never) => S): S {
    void callable;
    return initialValue;
  }

  /** {@inheritDoc Option.foldRight} */
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
