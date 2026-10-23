// Illuminate\Contracts\Process\ProcessResult, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";

declare const ProcessResultBrand: unique symbol;

export interface ProcessResult {
  readonly [ProcessResult.brand]: true;

  /** Get the original command executed by the process. */
  command(): string;

  /** Determine if the process was successful. */
  successful(): boolean;

  /** Determine if the process failed. */
  failed(): boolean;

  /** Get the exit code of the process. */
  exitCode(): number | null;

  /** Get the standard output of the process. */
  output(): string;

  /** Determine if the output contains the given string. */
  seeInOutput(output: string): boolean;

  /** Get the error output of the process. */
  errorOutput(): string;

  /** Determine if the error output contains the given string. */
  seeInErrorOutput(output: string): boolean;

  /** Throw an exception if the process failed. */
  throw(callback?: Closure | null): this;

  /** Throw an exception if the process failed and the given condition is true. */
  throwIf(condition: boolean, callback?: Closure | null): this;
}

export const ProcessResult = contract<ProcessResult, typeof ProcessResultBrand>(
  "Illuminate\\Contracts\\Process\\ProcessResult",
  {
    command: [],
    errorOutput: [],
    exitCode: [],
    failed: [],
    output: [],
    seeInErrorOutput: ["output"],
    seeInOutput: ["output"],
    successful: [],
    throw: ["callback"],
    throwIf: ["condition", "callback"],
  },
);
