// Illuminate\Contracts\Foundation\CachesRoutes, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const CachesRoutesBrand: unique symbol;

export interface CachesRoutes {
  readonly [CachesRoutes.brand]: true;

  /** Determine if the application routes are cached. */
  routesAreCached(): boolean;

  /** Get the path to the routes cache file. */
  getCachedRoutesPath(): string;
}

export const CachesRoutes = contract<CachesRoutes, typeof CachesRoutesBrand>(
  "Illuminate\\Contracts\\Foundation\\CachesRoutes",
  {
    getCachedRoutesPath: [],
    routesAreCached: [],
  },
);
