// Story 6.4 fixture: a thenable by its registered FQCN (`Builder` registers
// `Illuminate\Database\Query\Builder`, in the tool's fallback list) and a type
// that is a thenable only under the temp `@xaravel/contracts/async` list
// (`Lazy`, registered as `X\Lazy`). The fixture tsconfig has `types: []`, so
// `registerClass` is a local stand-in for the Class Registry (AD-10).

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

const registry = new Map<string, object>();

/** The Class Registry stand-in (AD-10). */
function registerClass(fqcn: string, value: object): void {
  registry.set(fqcn, value);
}

registerClass("Illuminate\\Database\\Query\\Builder", Builder);
registerClass("X\\Lazy", Lazy);
