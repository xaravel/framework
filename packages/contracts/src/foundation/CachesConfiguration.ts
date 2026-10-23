// Illuminate\Contracts\Foundation\CachesConfiguration, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const CachesConfigurationBrand: unique symbol;

export interface CachesConfiguration {
  readonly [CachesConfiguration.brand]: true;

  /** Determine if the application configuration is cached. */
  configurationIsCached(): boolean;

  /** Get the path to the configuration cache file. */
  getCachedConfigPath(): string;

  /** Get the path to the cached services.php file. */
  getCachedServicesPath(): string;
}

export const CachesConfiguration = contract<CachesConfiguration, typeof CachesConfigurationBrand>(
  "Illuminate\\Contracts\\Foundation\\CachesConfiguration",
  {
    configurationIsCached: [],
    getCachedConfigPath: [],
    getCachedServicesPath: [],
  },
);
