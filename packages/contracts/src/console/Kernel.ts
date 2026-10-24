// Illuminate\Contracts\Console\Kernel, from laravel/framework v13.37.0.
// `all` and `output` stay sync: AD-5 forbids a lazy bootstrap, so Upstream's `bootstrap()` call in them is a no-op
// once the kernel is booted. `queue` returns a `PendingDispatch`, a thenable (AD-6), which dispatches when awaited.
import { contract } from "../Contract";
import type { InputInterface } from "../structural/InputInterface";
import type { OutputInterface } from "../structural/OutputInterface";
import type { PendingDispatch } from "../structural/PendingDispatch";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const KernelBrand: unique symbol;

export interface Kernel {
  readonly [Kernel.brand]: true;

  /**
   * Bootstrap the application for artisan commands.
   * Runs the bootstrappers and boots the providers, whose `boot()` may return a Promise (AD-5).
   * @asyncRoot callback
   */
  bootstrap(): Promise<void>;

  /**
   * Handle an incoming console command.
   * Runs the command's handler, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  handle(input: InputInterface, output?: OutputInterface | null): Promise<number>;

  /**
   * Run an Artisan console command by name.
   * Runs the command's handler, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  call(command: string, parameters?: PhpArrayLike, outputBuffer?: OutputInterface | null): Promise<number>;
  call(command: string, options?: { parameters?: PhpArrayLike; outputBuffer?: OutputInterface | null }): Promise<number>;

  /** Queue an Artisan console command by name. */
  queue(command: string, parameters?: PhpArrayLike): PendingDispatch;

  /** Get all of the commands registered with the console. */
  all(): PhpArrayLike;

  /** Get the output for the last run command. */
  output(): string;

  /**
   * Terminate the application.
   * Dispatches Upstream's `Terminating` event through `Events\Dispatcher::dispatch`, async since Story 10.2 because
   * its listeners may be (AD-6, the spine's Derivation).
   * @asyncRoot callback
   */
  terminate(input: InputInterface, status: number): Promise<void>;
}

export const Kernel = contract<Kernel, typeof KernelBrand>(
  "Illuminate\\Contracts\\Console\\Kernel",
  {
    all: [],
    bootstrap: [],
    call: ["command", "parameters", "outputBuffer"],
    handle: ["input", "output"],
    output: [],
    queue: ["command", "parameters"],
    terminate: ["input", "status"],
  },
);
