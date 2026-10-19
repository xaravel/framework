// Story 6.4 failing fixture: an @asyncRoot tag whose value is neither `callback` nor `Name(\Name)*.method`.

/** The repository. */
export class Repository {
  /** @asyncRoot Cache\Store */
  forget(key: string): Promise<boolean> {
    return Promise.resolve(key !== "");
  }
}
