// Illuminate\Contracts\Queue\ShouldQueue, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ShouldQueueBrand: unique symbol;

export interface ShouldQueue {
  readonly [ShouldQueue.brand]: true;
}

export const ShouldQueue = contract<ShouldQueue, typeof ShouldQueueBrand>("Illuminate\\Contracts\\Queue\\ShouldQueue");
