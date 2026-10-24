// Illuminate\Contracts\Database\LostConnectionDetector, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const LostConnectionDetectorBrand: unique symbol;

export interface LostConnectionDetector {
  readonly [LostConnectionDetector.brand]: true;

  /** Determine if the given exception was caused by a lost connection. */
  causedByLostConnection(e: Error): boolean;
}

export const LostConnectionDetector = contract<LostConnectionDetector, typeof LostConnectionDetectorBrand>(
  "Illuminate\\Contracts\\Database\\LostConnectionDetector",
  {
    causedByLostConnection: ["e"],
  },
);
