// PHP's `Closure` / `callable`, for a callback that must stay sync (AD-6, DIV-1): container resolving callbacks and
// the application's booting, booted and terminating callbacks. A method generic in `F` takes `SyncClosure<F>`, which
// is `never`, so a type error, when `F` returns a Promise or another PromiseLike. A function type, so it is a `type`.

/** A callback `F` that does not return a PromiseLike. */
export type SyncClosure<F extends (...args: never[]) => unknown> = ReturnType<F> extends PromiseLike<unknown> ? never : F;
