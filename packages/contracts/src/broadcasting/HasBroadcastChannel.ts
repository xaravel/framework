// Illuminate\Contracts\Broadcasting\HasBroadcastChannel, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const HasBroadcastChannelBrand: unique symbol;

export interface HasBroadcastChannel {
  readonly [HasBroadcastChannel.brand]: true;

  /** Get the broadcast channel route definition that is associated with the given entity. */
  broadcastChannelRoute(): string;

  /** Get the broadcast channel name that is associated with the given entity. */
  broadcastChannel(): string;
}

export const HasBroadcastChannel = contract<HasBroadcastChannel, typeof HasBroadcastChannelBrand>(
  "Illuminate\\Contracts\\Broadcasting\\HasBroadcastChannel",
  {
    broadcastChannel: [],
    broadcastChannelRoute: [],
  },
);
