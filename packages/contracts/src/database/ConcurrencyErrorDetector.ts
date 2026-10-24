// Illuminate\Contracts\Database\ConcurrencyErrorDetector, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ConcurrencyErrorDetectorBrand: unique symbol;

export interface ConcurrencyErrorDetector {
  readonly [ConcurrencyErrorDetector.brand]: true;

  /** Determine if the given exception was caused by a concurrency error such as a deadlock or serialization failure. */
  causedByConcurrencyError(e: Error): boolean;
}

export const ConcurrencyErrorDetector = contract<ConcurrencyErrorDetector, typeof ConcurrencyErrorDetectorBrand>(
  "Illuminate\\Contracts\\Database\\ConcurrencyErrorDetector",
  {
    causedByConcurrencyError: ["e"],
  },
);
