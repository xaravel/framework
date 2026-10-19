// Story 6.1 fixture: a thenable query builder, as AD-6 makes Builders, Relations
// and `PendingRequest`. Awaiting one runs its terminal; leaving one unawaited is
// the floating-thenable mistake `no-floating-promises` with `checkThenables` catches.
export class Builder implements PromiseLike<readonly string[]> {
  readonly #wheres: string[] = [];

  where(column: string): this {
    this.#wheres.push(column);
    return this;
  }

  then<TResult1 = readonly string[], TResult2 = never>(
    onfulfilled?: ((value: readonly string[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve([...this.#wheres]).then(onfulfilled, onrejected);
  }
}

export function q(): Builder {
  return new Builder();
}

/** Runs `callback` for each item; the callback's return value is ignored. */
export function each(items: readonly string[], callback: (item: string) => void): void {
  for (const item of items) {
    callback(item);
  }
}
