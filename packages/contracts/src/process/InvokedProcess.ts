// Illuminate\Contracts\Process\InvokedProcess, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";
import type { ProcessProcessResult } from "../structural/ProcessProcessResult";

declare const InvokedProcessBrand: unique symbol;

export interface InvokedProcess {
  readonly [InvokedProcess.brand]: true;

  /** Get the process ID if the process is still running. */
  id(): number | null;

  /** Get the command line for the process. */
  command(): string;

  /** Send a signal to the process. */
  signal(signal: number): this;

  /** Determine if the process is still running. */
  running(): boolean;

  /** Get the standard output for the process. */
  output(): string;

  /** Get the error output for the process. */
  errorOutput(): string;

  /** Get the latest standard output for the process. */
  latestOutput(): string;

  /** Get the latest error output for the process. */
  latestErrorOutput(): string;

  /**
   * Wait for the process to finish.
   * @asyncRoot Process\InvokedProcess.wait
   */
  wait(output?: Closure | null): Promise<ProcessProcessResult>;

  /**
   * Wait until the given callback returns true.
   * @asyncRoot Process\InvokedProcess.waitUntil
   */
  waitUntil(output?: Closure | null): Promise<ProcessProcessResult>;
}

export const InvokedProcess = contract<InvokedProcess, typeof InvokedProcessBrand>(
  "Illuminate\\Contracts\\Process\\InvokedProcess",
  {
    command: [],
    errorOutput: [],
    id: [],
    latestErrorOutput: [],
    latestOutput: [],
    output: [],
    running: [],
    signal: ["signal"],
    wait: ["output"],
    waitUntil: ["output"],
  },
);
