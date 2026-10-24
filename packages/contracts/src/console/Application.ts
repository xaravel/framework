// Illuminate\Contracts\Console\Application, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { OutputInterface } from "../structural/OutputInterface";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const ApplicationBrand: unique symbol;

export interface Application {
  readonly [Application.brand]: true;

  /**
   * Run an Artisan console command by name.
   * Runs the command's handler, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  call(command: string, parameters?: PhpArrayLike, outputBuffer?: OutputInterface | null): Promise<number>;
  call(command: string, options?: { parameters?: PhpArrayLike; outputBuffer?: OutputInterface | null }): Promise<number>;

  /** Get the output from the last command. */
  output(): string;
}

export const Application = contract<Application, typeof ApplicationBrand>(
  "Illuminate\\Contracts\\Console\\Application",
  {
    call: ["command", "parameters", "outputBuffer"],
    output: [],
  },
);
