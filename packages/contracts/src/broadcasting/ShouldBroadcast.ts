// Illuminate\Contracts\Broadcasting\ShouldBroadcast, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Channel } from "../structural/Channel";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const ShouldBroadcastBrand: unique symbol;

export interface ShouldBroadcast {
  readonly [ShouldBroadcast.brand]: true;

  /** Get the channels the event should broadcast on: a channel, a channel name, or a list of either. */
  broadcastOn(): Channel | PhpArrayLike | string;
}

export const ShouldBroadcast = contract<ShouldBroadcast, typeof ShouldBroadcastBrand>(
  "Illuminate\\Contracts\\Broadcasting\\ShouldBroadcast",
  {
    broadcastOn: [],
  },
);
