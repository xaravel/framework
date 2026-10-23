// PHP's `DateInterval`, as psr/simple-cache 3.0.0 names it in a `$ttl` (ESC-10.1-4). A concrete type named by a
// contract is a structural interface inside contracts (AD-1.2): PHP's public `DateInterval` properties, so a later
// `CarbonInterval` port that keeps them satisfies it.

/** A PHP `DateInterval`'s public properties. */
export interface DateInterval {
  readonly y: number;
  readonly m: number;
  readonly d: number;
  readonly h: number;
  readonly i: number;
  readonly s: number;
  readonly f: number;
  readonly invert: number;
  readonly days: number | false;
}
