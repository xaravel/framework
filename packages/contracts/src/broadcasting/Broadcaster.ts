// Illuminate\Contracts\Broadcasting\Broadcaster, from laravel/framework v13.37.0.
// A broadcaster is AD-6's broadcasting root: `auth` and `broadcast` reach the broadcast service and are their own
// roots. `validAuthenticationResponse` signs the response locally, so it stays sync.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { Request } from "../structural/Request";

declare const BroadcasterBrand: unique symbol;

export interface Broadcaster {
  readonly [Broadcaster.brand]: true;

  /**
   * Authenticate the incoming request for a given channel.
   * @asyncRoot Broadcasting\Broadcaster.auth
   */
  auth(request: Request): Promise<unknown>;

  /** Return the valid authentication response. */
  validAuthenticationResponse(request: Request, result: unknown): unknown;

  /**
   * Broadcast the given event; rejects with a `BroadcastException` when the broadcast fails.
   * @asyncRoot Broadcasting\Broadcaster.broadcast
   */
  broadcast(channels: PhpArrayLike, event: string, payload?: PhpArrayLike): Promise<void>;
}

export const Broadcaster = contract<Broadcaster, typeof BroadcasterBrand>(
  "Illuminate\\Contracts\\Broadcasting\\Broadcaster",
  {
    auth: ["request"],
    broadcast: ["channels", "event", "payload"],
    validAuthenticationResponse: ["request", "result"],
  },
);
