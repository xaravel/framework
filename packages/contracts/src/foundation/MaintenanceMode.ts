// Illuminate\Contracts\Foundation\MaintenanceMode, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const MaintenanceModeBrand: unique symbol;

export interface MaintenanceMode {
  readonly [MaintenanceMode.brand]: true;

  /**
   * Take the application down for maintenance.
   * @asyncRoot Cache\Store.put
   */
  activate(payload: PhpArrayLike): Promise<void>;

  /**
   * Take the application out of maintenance.
   * @asyncRoot Cache\Store.forget
   */
  deactivate(): Promise<void>;

  /**
   * Determine if the application is currently down for maintenance.
   * @asyncRoot Cache\Store.get
   */
  active(): Promise<boolean>;

  /**
   * Get the data array which was provided when the application was placed into maintenance.
   * @asyncRoot Cache\Store.get
   */
  data(): Promise<PhpArrayLike>;
}

export const MaintenanceMode = contract<MaintenanceMode, typeof MaintenanceModeBrand>(
  "Illuminate\\Contracts\\Foundation\\MaintenanceMode",
  {
    activate: ["payload"],
    active: [],
    data: [],
    deactivate: [],
  },
);
