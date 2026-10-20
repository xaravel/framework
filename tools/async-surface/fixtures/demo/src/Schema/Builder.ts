// Retro 6 item 12 fixture: a class with a thenable's short name (`Builder`) but
// another FQCN (`Illuminate\Database\Schema\Builder`, not in the thenable list),
// so a method returning it is not a thenable method.

/** Stands in for the Schema Builder. */
export class Builder {
  readonly connection: string;

  constructor(connection: string) {
    this.connection = connection;
  }
}

const registry = new Map<string, object>();

/** The Class Registry stand-in (AD-10). */
function registerClass(fqcn: string, value: object): void {
  registry.set(fqcn, value);
}

registerClass("Illuminate\\Database\\Schema\\Builder", Builder);
