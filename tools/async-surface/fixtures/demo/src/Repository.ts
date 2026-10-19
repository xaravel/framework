// Story 6.4 passing fixture: every listed and unlisted shape of the I/O matrix.
import { Builder, Lazy } from "./Builder";

/** Stands in for a cache store contract. */
export interface Store {
  /** @asyncRoot Cache\Store.get */
  get(key: string): Promise<string | null>;
  /** @asyncRoot Cache\Store.put */
  put: (key: string, value: string) => Promise<void>;
  name(): string;
  size: number;
}

/** The repository. */
export class Repository {
  #secret = 0;
  private hidden = 1;

  /** @asyncRoot Cache\Store.get */
  get(key: string): Promise<string | null> {
    return Promise.resolve(key === "" ? null : key);
  }

  /** @asyncRoot callback */
  where(table: string): Builder {
    return new Builder(table);
  }

  /** The prefix (sync, untagged). */
  getPrefix(): string {
    return "cache:";
  }

  /** Overloads: one signature is async; the tag sits on the first. */
  /** @asyncRoot Cache\Store.many */
  many(keys: string[]): Promise<string[]>;
  many(keys: string[], sync: true): string[];
  many(keys: string[], sync?: true): Promise<string[]> | string[] {
    return sync === true ? keys : Promise.resolve(keys);
  }

  /** @asyncRoot Cache\Store.flush */
  static flushAll(): Promise<void> {
    return Promise.resolve();
  }

  /** @asyncRoot callback */
  remember = (key: string, callback: () => Promise<string>): Promise<string> => callback().then((value) => key + value);

  /** @asyncRoot Cache\Store.get */
  get ready(): Promise<boolean> {
    return Promise.resolve(this.#secret === this.hidden - 1);
  }

  /** A sync getter. */
  get size(): number {
    return this.hidden;
  }

  /** A lazy value: not a thenable under the tool's fallback list. */
  lazy(key: string): Lazy {
    return new Lazy(key);
  }

  protected refresh(): Promise<void> {
    return Promise.resolve();
  }

  private load(): Promise<void> {
    return Promise.resolve();
  }

  /** Uses the non-public members so they are not unused. */
  touch(): void {
    void this.refresh();
    void this.load();
  }
}

/** Not exported: never listed. */
class Internal {
  run(): Promise<void> {
    return Promise.resolve();
  }
}

/** Exported below under another name. */
class Jobs {
  /** @asyncRoot Queue\Queue.push */
  push(job: string): Promise<string> {
    return new Internal().run().then(() => job);
  }

  size(): number {
    return 0;
  }
}

export { Jobs as Queue };

/** @asyncRoot Cache\Store.get */
export function fetchValue(key: string): Promise<string> {
  return Promise.resolve(key);
}

/** A sync function. */
export function prefix(): string {
  return "cache:";
}

/** @asyncRoot callback */
export const later: (callback: () => void) => Promise<void> = (callback) => Promise.resolve().then(callback);
