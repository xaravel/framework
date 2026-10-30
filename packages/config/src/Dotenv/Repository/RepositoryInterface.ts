// `Dotenv\Repository\RepositoryInterface` (vlucas/phpdotenv v5.7.0) as a contract token (AD-1, AD-9.5).
import { contract } from "@xaravel/contracts";

declare const RepositoryInterfaceBrand: unique symbol;

/** An environment variable repository. */
export interface RepositoryInterface {
  readonly [RepositoryInterface.brand]: true;

  /** Determine if the given environment variable is defined. */
  has(name: string): boolean;

  /** Get an environment variable. */
  get(name: string): string | null;

  /** Set an environment variable. */
  set(name: string, value: string): boolean;

  /** Clear an environment variable. */
  clear(name: string): boolean;
}

export const RepositoryInterface = contract<RepositoryInterface, typeof RepositoryInterfaceBrand>("Dotenv\\Repository\\RepositoryInterface", {
  has: ["name"],
  get: ["name"],
  set: ["name", "value"],
  clear: ["name"],
});
