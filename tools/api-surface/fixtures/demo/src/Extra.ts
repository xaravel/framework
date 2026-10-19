// Story 6.5 fixture: a registered class the Upstream file lacks (extra, explained by additions.jsonl).

/** Stands in for `@xaravel/runtime/registry`'s `registerClass` (never run). */
declare function registerClass(fqcn: string, value: object): void;

/** Xaravel-only. */
export class Extra {
  run(): number {
    return 1;
  }
}

registerClass("Demo\\Extra", Extra);
