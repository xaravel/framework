// Illuminate\Support\Defer\DeferredCallback, as a contract names it (AD-1.2): a subset of its public methods.

/** A callback deferred until after the response. */
export interface DeferredCallback {
  /** Specify the name of the deferred callback so it can be cancelled later. */
  name(name: string): this;

  /** Indicate that the deferred callback should run even on unsuccessful requests and jobs. */
  always(always?: boolean): this;
}
