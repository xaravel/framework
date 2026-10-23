// Illuminate\Contracts\Queue\Interruptible, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const InterruptibleBrand: unique symbol;

export interface Interruptible {
  readonly [Interruptible.brand]: true;

  /** Handle a signal received by the queue worker. */
  interrupted(signal: number): void;
}

export const Interruptible = contract<Interruptible, typeof InterruptibleBrand>(
  "Illuminate\\Contracts\\Queue\\Interruptible",
  {
    interrupted: ["signal"],
  },
);
