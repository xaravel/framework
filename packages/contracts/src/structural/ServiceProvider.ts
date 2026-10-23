// Illuminate\Support\ServiceProvider, as a contract names it (AD-1.2): a subset of its public methods.
import type { PhpArrayLike } from "./PhpArrayLike";

/** A service provider. */
export interface ServiceProvider {
  /** Register any application services. */
  register(): void;

  /** Get the services provided by the provider. */
  provides(): PhpArrayLike;

  /** Get the events that trigger this service provider to register. */
  when(): PhpArrayLike;

  /** Determine if the provider is deferred. */
  isDeferred(): boolean;
}
