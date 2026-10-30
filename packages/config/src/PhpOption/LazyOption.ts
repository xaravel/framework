// `PhpOption\LazyOption` (phpoption/phpoption 1.10.0, Apache-2.0, Copyright 2012 Johannes M. Schmitt), ported line
// for line (ESC-15.2-4): the callback runs once, through `call_user_func_array`, on first use.
import { registerClass } from "@xaravel/runtime";
import { call_user_func_array, type Exception, InvalidArgumentException, is_callable, RuntimeException, sprintf, type Traversable } from "@xaravel/runtime/php";
import { Option } from "./Option";

/** An option whose value a callback computes on first use: PhpOption's `LazyOption`. */
export class LazyOption<T> extends Option<T> {
  private readonly callback: unknown;

  private readonly arguments: unknown[];

  private option_: Option<T> | null = null;

  static create<S>(callback: unknown, args: unknown[] = []): LazyOption<S> {
    return new LazyOption<S>(callback, args);
  }

  constructor(callback: unknown, args: unknown[] = []) {
    super();
    if (!is_callable(callback)) {
      throw new InvalidArgumentException("Invalid callback given");
    }

    this.callback = callback;
    this.arguments = args;
  }

  isDefined(): boolean {
    return this.option().isDefined();
  }

  isEmpty(): boolean {
    return this.option().isEmpty();
  }

  get(): T {
    return this.option().get();
  }

  getOrElse<S>(defaultValue: S): T | S {
    return this.option().getOrElse(defaultValue);
  }

  getOrCall<S>(callable: () => S): T | S {
    return this.option().getOrCall(callable);
  }

  getOrThrow(ex: Exception): T {
    return this.option().getOrThrow(ex);
  }

  orElse<S>(elseOption: Option<S>): Option<T> | Option<S> {
    return this.option().orElse(elseOption);
  }

  ifDefined(callable: (value: T) => unknown): void {
    this.option().forAll(callable);
  }

  forAll(callable: (value: T) => unknown): Option<T> {
    return this.option().forAll(callable);
  }

  map<S>(callable: (value: T) => S): Option<S> {
    return this.option().map(callable);
  }

  flatMap<S>(callable: (value: T) => Option<S>): Option<S> {
    return this.option().flatMap(callable);
  }

  filter(callable: (value: T) => unknown): Option<T> {
    return this.option().filter(callable);
  }

  filterNot(callable: (value: T) => unknown): Option<T> {
    return this.option().filterNot(callable);
  }

  select(value: unknown): Option<T> {
    return this.option().select(value);
  }

  reject(value: unknown): Option<T> {
    return this.option().reject(value);
  }

  getIterator(): Traversable {
    return this.option().getIterator();
  }

  foldLeft<S>(initialValue: S, callable: (accumulator: S, value: T) => S): S {
    return this.option().foldLeft(initialValue, callable);
  }

  foldRight<S>(initialValue: S, callable: (value: T, accumulator: S) => S): S {
    return this.option().foldRight(initialValue, callable);
  }

  private option(): Option<T> {
    if (null === this.option_) {
      const option: unknown = call_user_func_array(this.callback, this.arguments);
      if (option instanceof Option) {
        this.option_ = option as Option<T>;
      } else {
        throw new RuntimeException(sprintf("Expected instance of %s", "PhpOption\\Option"));
      }
    }

    return this.option_;
  }
}

registerClass("PhpOption\\LazyOption", LazyOption);
