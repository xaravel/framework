// Illuminate\Contracts\Http\Kernel, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Application as FoundationApplication } from "../foundation/Application";
import type { Response } from "../structural/Response";
import type { SymfonyRequest } from "../structural/SymfonyRequest";

declare const KernelBrand: unique symbol;

export interface Kernel {
  readonly [Kernel.brand]: true;

  /**
   * Bootstrap the application for HTTP requests.
   * Runs the bootstrappers and boots the providers, whose `boot()` may return a Promise (AD-5).
   * @asyncRoot callback
   */
  bootstrap(): Promise<void>;

  /**
   * Handle an incoming HTTP request.
   * Sends the request through the middleware and the router, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  handle(request: SymfonyRequest): Promise<Response>;

  /**
   * Perform any final actions for the request lifecycle.
   * Dispatches Upstream's `Terminating` event through `Events\Dispatcher::dispatch`, async since Story 10.2 because
   * its listeners may be, and runs the terminable middleware's `terminate` (AD-6, the spine's Derivation lists
   * middleware).
   * @asyncRoot callback
   */
  terminate(request: SymfonyRequest, response: Response): Promise<void>;

  /** Get the Laravel application instance. */
  getApplication(): FoundationApplication;
}

export const Kernel = contract<Kernel, typeof KernelBrand>(
  "Illuminate\\Contracts\\Http\\Kernel",
  {
    bootstrap: [],
    getApplication: [],
    handle: ["request"],
    terminate: ["request", "response"],
  },
);
