// Story 6.4 failing fixture: a public Promise-returning method with no @asyncRoot tag.

/** The repository. */
export class Repository {
  /** Stores a value. */
  put(key: string): Promise<void> {
    return Promise.resolve(void key);
  }
}
