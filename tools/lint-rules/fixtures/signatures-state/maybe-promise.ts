// Story 6.3 fixture: fails `xaravel/no-maybe-promise-return` only, at any placement.
export interface Value {
  readonly v: number;
}

export class Store {
  get(): Value | Promise<Value> {
    return { v: 1 };
  }
}
