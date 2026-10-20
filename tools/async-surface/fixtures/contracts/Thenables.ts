// Story 6.4 fixture for the contracts list: with a `@xaravel/contracts/async` naming only
// `X\Lazy`, `lazy()` is a thenable line (untagged) and `where()` (a `Builder`) is not listed.
import { Builder, Lazy } from "./Builder";

/** The repository. */
export class Repository {
  /** A thenable under the contracts list. */
  lazy(key: string): Lazy {
    return new Lazy(key);
  }

  /** Not a thenable under the contracts list. */
  where(table: string): Builder {
    return new Builder(table);
  }
}
