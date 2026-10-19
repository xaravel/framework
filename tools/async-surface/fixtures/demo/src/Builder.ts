// Story 6.4 fixture: a thenable by name (`Builder` is in the tool's fallback list) and a
// type that is a thenable only under the temp `@xaravel/contracts/async` list (`Lazy`).

/** Stands in for the Query Builder. */
export class Builder {
  readonly table: string;

  constructor(table: string) {
    this.table = table;
  }
}

/** Stands in for a type the contracts list names. */
export class Lazy {
  readonly key: string;

  constructor(key: string) {
    this.key = key;
  }
}
