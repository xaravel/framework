// `GrahamCampbell\ResultType\Success` (graham-campbell/result-type 1.2.0, MIT, Copyright Graham Campbell), ported line
// for line (ESC-15.2-4). A callable's `undefined` result is `null` (AD-9).
import { registerClass } from "@xaravel/runtime";
import { None } from "../../PhpOption/None";
import type { Option } from "../../PhpOption/Option";
import { Some } from "../../PhpOption/Some";
import { Result } from "./Result";
import { Error as PhpError } from "@xaravel/runtime/php";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Success");

/** A success value: Result Type's `Success`. */
export class Success<T> extends Result<T, never> {
  private readonly value: T;

  /** Internal constructor for a success value. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE, value: T) {
    super();
    if (key !== CREATE) {
      throw new PhpError("Call to private GrahamCampbell\\ResultType\\Success::__construct() from global scope");
    }
    this.value = value;
  }

  /** Create a new success value. */
  static create<S>(value: S): Success<S> {
    return new Success(CREATE, value);
  }

  /** Get the success option value. */
  success(): Option<T> {
    return Some.create(this.value);
  }

  /** Map over the success value. */
  map<S>(f: (value: T) => S): Result<S, never> {
    return Success.create((f(this.value) ?? null) as S);
  }

  /** Flat map over the success value. */
  flatMap<S, F>(f: (value: T) => Result<S, F>): Result<S, F> {
    return f(this.value);
  }

  /** Get the error option value. */
  error(): Option<never> {
    return None.create();
  }

  /** Map over the error value. */
  mapError<F>(f: (error: never) => F): Result<T, F> {
    void f;
    return Success.create(this.value);
  }
}

registerClass("GrahamCampbell\\ResultType\\Success", Success);
