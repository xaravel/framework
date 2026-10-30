// `Dotenv\Loader\LoaderInterface` (vlucas/phpdotenv v5.7.0) as a contract token (AD-1, AD-9.5).
import { contract } from "@xaravel/contracts";
import type { PhpArrayLike } from "@xaravel/contracts/config";
import type { Entry } from "../Parser/Entry";
import type { RepositoryInterface } from "../Repository/RepositoryInterface";

declare const LoaderInterfaceBrand: unique symbol;

/** Loads parsed entries into a repository. */
export interface LoaderInterface {
  readonly [LoaderInterface.brand]: true;

  /** Load the given entries into the repository: `array<string, string|null>`. */
  load(repository: RepositoryInterface, entries: readonly Entry[]): PhpArrayLike;
}

export const LoaderInterface = contract<LoaderInterface, typeof LoaderInterfaceBrand>("Dotenv\\Loader\\LoaderInterface", { load: ["repository", "entries"] });
