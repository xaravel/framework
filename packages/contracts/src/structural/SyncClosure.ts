// PHP's `Closure` / `callable`, for a callback that must stay sync (AD-6, DIV-1): container resolving callbacks and
// the application's booting, booted and terminating callbacks. A method generic in `F` takes `SyncClosure<F>`, which
// is `never`, so a type error, when `F` returns a Promise or another PromiseLike, alone or in a union
// (`void | Promise<void>`). An `any` return is not checked. A function type, so it is a `type`.

/** A callback `F` none of whose return types is a PromiseLike. */
export type SyncClosure<F extends (...args: never[]) => unknown> = 0 extends 1 & ReturnType<F>
  ? F
  : [Extract<ReturnType<F>, PromiseLike<unknown>>] extends [never]
    ? F
    : never;
