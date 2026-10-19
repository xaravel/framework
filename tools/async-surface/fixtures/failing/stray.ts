// Story 6.4 failing fixture: an @asyncRoot tag on a method that returns neither a Promise nor a thenable.

/** The repository. */
export class Repository {
  /** @asyncRoot Cache\Store.get */
  getPrefix(): string {
    return "cache:";
  }
}
