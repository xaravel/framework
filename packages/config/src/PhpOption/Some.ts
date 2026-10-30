// `PhpOption\Some` (phpoption/phpoption 1.10.0, Apache-2.0, Copyright 2012 Johannes M. Schmitt), ported line for
// line (ESC-15.2-4). `===` on the value is `identical` (PORTING.md § Idiom table); a callable's `undefined` result is
// `null` (AD-9).
import { registerClass } from "@xaravel/runtime";
import { ArrayIterator, type Exception, identical, RuntimeException } from "@xaravel/runtime/php";
import { None } from "./None";
import { Option } from "./Option";

/** An option holding a value: PhpOption's `Some`. */
export class Some<T> extends Option<T> {
  private readonly value: T;

  constructor(value: T) {
    super();
    this.value = value;
  }

  static create<S>(value: S): Some<S> {
    return new Some(value);
  }

  isDefined(): boolean {
    return true;
  }

  isEmpty(): boolean {
    return false;
  }

  get(): T {
    return this.value;
  }

  getOrElse<S>(defaultValue: S): T | S {
    void defaultValue;
    return this.value;
  }

  getOrCall<S>(callable: () => S): T | S {
    void callable;
    return this.value;
  }

  getOrThrow(ex: Exception): T {
    void ex;
    return this.value;
  }

  orElse<S>(elseOption: Option<S>): Option<T> | Option<S> {
    void elseOption;
    return this;
  }

  ifDefined(callable: (value: T) => unknown): void {
    this.forAll(callable);
  }

  forAll(callable: (value: T) => unknown): Option<T> {
    callable(this.value);

    return this;
  }

  map<S>(callable: (value: T) => S): Option<S> {
    return new Some((callable(this.value) ?? null) as S);
  }

  flatMap<S>(callable: (value: T) => Option<S>): Option<S> {
    const rs: unknown = callable(this.value);
    if (!(rs instanceof Option)) {
      throw new RuntimeException("Callables passed to flatMap() must return an Option. Maybe you should use map() instead?");
    }

    return rs as Option<S>;
  }

  filter(callable: (value: T) => unknown): Option<T> {
    if (true === callable(this.value)) {
      return this;
    }

    return None.create();
  }

  filterNot(callable: (value: T) => unknown): Option<T> {
    if (false === callable(this.value)) {
      return this;
    }

    return None.create();
  }

  select(value: unknown): Option<T> {
    if (identical(this.value, value)) {
      return this;
    }

    return None.create();
  }

  reject(value: unknown): Option<T> {
    if (identical(this.value, value)) {
      return None.create();
    }

    return this;
  }

  getIterator(): ArrayIterator {
    return new ArrayIterator([this.value]);
  }

  foldLeft<S>(initialValue: S, callable: (accumulator: S, value: T) => S): S {
    return (callable(initialValue, this.value) ?? null) as S;
  }

  foldRight<S>(initialValue: S, callable: (value: T, accumulator: S) => S): S {
    return (callable(this.value, initialValue) ?? null) as S;
  }
}

registerClass("PhpOption\\Some", Some);
