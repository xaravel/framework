// `Dotenv\Store\StoreInterface` (vlucas/phpdotenv v5.7.0) as a contract token (AD-1, AD-9.5). Sync (AD-6,
// ESC-15.2-3).
import { contract } from "@xaravel/contracts";

declare const StoreInterfaceBrand: unique symbol;

/** A source of environment file content. */
export interface StoreInterface {
  readonly [StoreInterface.brand]: true;

  /** Read the content of the environment file(s). */
  read(): string;
}

export const StoreInterface = contract<StoreInterface, typeof StoreInterfaceBrand>("Dotenv\\Store\\StoreInterface", { read: [] });
