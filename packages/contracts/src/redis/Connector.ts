// Illuminate\Contracts\Redis\Connector, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { RedisConnection } from "../structural/RedisConnection";

declare const ConnectorBrand: unique symbol;

export interface Connector {
  readonly [Connector.brand]: true;

  /**
   * Create a connection to a Redis cluster.
   * (Upstream's docblock, swapped with connectToCluster's at the Pin.)
   */
  connect(config: PhpArrayLike, options: PhpArrayLike): RedisConnection;

  /**
   * Create a connection to a Redis instance.
   * (Upstream's docblock, swapped with connect's at the Pin.)
   */
  connectToCluster(config: PhpArrayLike, clusterOptions: PhpArrayLike, options: PhpArrayLike): RedisConnection;
}

export const Connector = contract<Connector, typeof ConnectorBrand>(
  "Illuminate\\Contracts\\Redis\\Connector",
  {
    connect: ["config", "options"],
    connectToCluster: ["config", "clusterOptions", "options"],
  },
);
