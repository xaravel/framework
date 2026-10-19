// Story 6.2 fixture: fails `xaravel/no-model-private` only, placed as
// `packages/database/src/Eloquent/Model.ts` or under its `Concerns/`.
export class HasAttributes {
  #state: Map<string, unknown> = new Map();

  getAttribute(key: string): unknown {
    return this.#state.get(key) ?? null;
  }
}
