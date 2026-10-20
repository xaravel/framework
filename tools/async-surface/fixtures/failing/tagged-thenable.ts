// Retro 6 item 12 failing fixture: a sync method that returns a thenable (the Query Builder) but carries an
// @asyncRoot tag, which only a Promise-returning method may carry (AD-6; MAINT-2026-10-19 item 7).
import { Builder } from "./Builder";

/** The repository. */
export class Repository {
  /** @asyncRoot callback */
  where(table: string): Builder {
    return new Builder(table);
  }
}
