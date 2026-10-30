// `GrahamCampbell\ResultType\Error` (graham-campbell/result-type 1.2.0, MIT, Copyright Graham Campbell), ported line
// for line (ESC-15.2-4). Inside this module the class name shadows the JS global `Error`, as Upstream's does PHP's
// `\Error` in its namespace. A callable's `undefined` result is `null` (AD-9).
import { registerClass } from "@xaravel/runtime";
import { None } from "../../PhpOption/None";
import type { Option } from "../../PhpOption/Option";
import { Some } from "../../PhpOption/Some";
import { Result } from "./Result";
import { Error as PhpError } from "@xaravel/runtime/php";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Error");

/** An error value: Result Type's `Error`. */
export class Error<E> extends Result<never, E> {
  private readonly value: E;

  /** Internal constructor for an error value. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE, value: E) {
    super();
    if (key !== CREATE) {
      throw new PhpError("Call to private GrahamCampbell\\ResultType\\Error::__construct() from global scope");
    }
    this.value = value;
  }

  /** Create a new error value. */
  static create<F>(value: F): Error<F> {
    return new Error(CREATE, value);
  }

  /** Get the success option value. */
  success(): Option<never> {
    return None.create();
  }

  /** Map over the success value. */
  map<S>(f: (value: never) => S): Result<S, E> {
    void f;
    return Error.create(this.value);
  }

  /** Flat map over the success value. */
  flatMap<S, F>(f: (value: never) => Result<S, F>): Result<S, E | F> {
    void f;
    return Error.create(this.value);
  }

  /** Get the error option value. */
  error(): Option<E> {
    return Some.create(this.value);
  }

  /** Map over the error value. */
  mapError<F>(f: (error: E) => F): Result<never, F> {
    return Error.create((f(this.value) ?? null) as F);
  }
}

registerClass("GrahamCampbell\\ResultType\\Error", Error);
