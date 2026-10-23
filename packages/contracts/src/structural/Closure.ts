// PHP's `Closure` class and `callable` type, as a contract names them: any JS function. A function type, so it is a
// `type` (AD-1.2).

/** A PHP `Closure` or `callable`: any function. */
export type Closure = (...args: never[]) => unknown;
