// Story 6.4 failing fixture: overloads of one method with two different @asyncRoot tags.

/** The repository. */
export class Repository {
  /** @asyncRoot Cache\Store.get */
  pull(key: string): Promise<string>;
  /** @asyncRoot Cache\Store.forget */
  pull(key: string, fallback: string): Promise<string>;
  pull(key: string, fallback?: string): Promise<string> {
    return Promise.resolve(fallback ?? key);
  }
}
