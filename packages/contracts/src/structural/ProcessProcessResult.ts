// Illuminate\Process\ProcessResult, as a contract names it (AD-1.2): the methods of the
// `Illuminate\Contracts\Process\ProcessResult` it implements, without the brand (it has no other public methods).
import type { Closure } from "./Closure";

/** The result of a finished process. */
export interface ProcessProcessResult {
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
