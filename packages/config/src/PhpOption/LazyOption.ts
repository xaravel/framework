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

  /** Creates a `LazyOption` whose `callback` runs with `args` on first use. */
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

  /** {@inheritDoc Option.isDefined} */
  isDefined(): boolean {
    return this.option().isDefined();
  }

  /** {@inheritDoc Option.isEmpty} */
  isEmpty(): boolean {
    return this.option().isEmpty();
  }

  /** {@inheritDoc Option.get} */
  get(): T {
    return this.option().get();
  }

  /** {@inheritDoc Option.getOrElse} */
  getOrElse<S>(defaultValue: S): T | S {
    return this.option().getOrElse(defaultValue);
  }

  /** {@inheritDoc Option.getOrCall} */
  getOrCall<S>(callable: () => S): T | S {
    return this.option().getOrCall(callable);
  }

  /** {@inheritDoc Option.getOrThrow} */
  getOrThrow(ex: Exception): T {
    return this.option().getOrThrow(ex);
  }

  /** {@inheritDoc Option.orElse} */
  orElse<S>(elseOption: Option<S>): Option<T> | Option<S> {
    return this.option().orElse(elseOption);
  }

  /** {@inheritDoc Option.ifDefined} */
  ifDefined(callable: (value: T) => unknown): void {
    this.option().forAll(callable);
  }

  /** {@inheritDoc Option.forAll} */
  forAll(callable: (value: T) => unknown): Option<T> {
    return this.option().forAll(callable);
  }

  /** {@inheritDoc Option.map} */
  map<S>(callable: (value: T) => S): Option<S> {
    return this.option().map(callable);
  }

  /** {@inheritDoc Option.flatMap} */
  flatMap<S>(callable: (value: T) => Option<S>): Option<S> {
    return this.option().flatMap(callable);
  }

  /** {@inheritDoc Option.filter} */
  filter(callable: (value: T) => unknown): Option<T> {
    return this.option().filter(callable);
  }

  /** {@inheritDoc Option.filterNot} */
  filterNot(callable: (value: T) => unknown): Option<T> {
    return this.option().filterNot(callable);
  }

  /** {@inheritDoc Option.select} */
  select(value: unknown): Option<T> {
    return this.option().select(value);
  }

  /** {@inheritDoc Option.reject} */
  reject(value: unknown): Option<T> {
    return this.option().reject(value);
  }

  /** {@inheritDoc Option.getIterator} */
  getIterator(): Traversable {
    return this.option().getIterator();
  }

  /** {@inheritDoc Option.foldLeft} */
  foldLeft<S>(initialValue: S, callable: (accumulator: S, value: T) => S): S {
    return this.option().foldLeft(initialValue, callable);
  }

  /** {@inheritDoc Option.foldRight} */
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
