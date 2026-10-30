// `GrahamCampbell\ResultType\Result` (graham-campbell/result-type 1.2.0, MIT, Copyright Graham Campbell), ported line
// for line; `@xaravel/config` owns it beside vlucas/phpdotenv (ESC-15.2-4, decisions/MAINT-2026-10-30-story-15-2.md).
import { registerClass } from "@xaravel/runtime";
import type { Option } from "../../PhpOption/Option";

/** A success value or an error value: Result Type's `Result`. */
export abstract class Result<T, E> {
  /** Get the success option value. */
  abstract success(): Option<T>;

  /** Map over the success value. */
  abstract map<S>(f: (value: T) => S): Result<S, E>;

  /** Flat map over the success value. */
  abstract flatMap<S, F>(f: (value: T) => Result<S, F>): Result<S, E | F>;

  /** Get the error option value. */
  abstract error(): Option<E>;

  /** Map over the error value. */
  abstract mapError<F>(f: (error: E) => F): Result<T, F>;
}

registerClass("GrahamCampbell\\ResultType\\Result", Result);
