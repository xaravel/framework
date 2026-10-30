// `Dotenv\Loader\Loader` (vlucas/phpdotenv v5.7.0), ported line for line. `$vars` is a `PhpArray`, so a numeric name
// is the int key PHP makes it, and the result takes the PHP array form AD-9 gives its keys (`arrayFromEntries`).
import type { PhpArrayLike } from "@xaravel/contracts/config";
import { registerClass } from "@xaravel/runtime";
import { arrayFromEntries, PhpArray } from "@xaravel/runtime/php";
import type { Entry } from "../Parser/Entry";
import type { RepositoryInterface } from "../Repository/RepositoryInterface";
import { LoaderInterface } from "./LoaderInterface";
import { Resolver } from "./Resolver";

/** Loads parsed entries into a repository, resolving nested variables. */
export class Loader implements LoaderInterface {
  get [LoaderInterface.brand](): true {
    return true;
  }

  /**
   * Load the given entries into the repository.
   *
   * We'll substitute any nested variables, and send each variable to the repository, with the effect of actually
   * mutating the environment.
   */
  load(repository: RepositoryInterface, entries: readonly Entry[]): PhpArrayLike {
    const vars = new PhpArray<string | number, string | null>();

    for (const entry of entries) {
      const name = entry.getName();

      const value = entry.getValue();

      if (value.isDefined()) {
        const inner = Resolver.resolve(repository, value.get());
        if (repository.set(name, inner)) {
          vars.set(name, inner);
        }
      } else if (repository.clear(name)) {
        vars.set(name, null);
      }
    }

    return arrayFromEntries(vars) as PhpArrayLike;
  }
}

registerClass("Dotenv\\Loader\\Loader", Loader);
