// Story 6.5 fixture: the DIV-12 pairs (conformance/scans/div12-pairs.jsonl in the temp root).

/** Stands in for `@xaravel/runtime/registry`'s `registerClass` (never run). */
declare function registerClass(fqcn: string, value: object): void;

/** The model. */
export class Model {
  /** `model-config`: the property is expected. */
  fillable: string[] = [];

  /** `model-config`: Upstream's `fillable(array $fillable)` under its decided DIV-12 name (DIV12_RENAMES): matched. */
  setFillable(fillable: string[]): this {
    this.fillable = fillable;
    return this;
  }

  /** `option-pair` (AD-26): one Xaravel form of `middleware` satisfies the pair (both records div12; not extra). */
  middleware: string[] = [];

  /** `method-plus-state`: the method is expected (the property is div12). */
  status(): number {
    return 200;
  }
}

registerClass("Demo\\Model", Model);
