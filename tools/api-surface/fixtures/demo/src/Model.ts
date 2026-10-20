// Story 6.5 fixture: the DIV-12 pairs (conformance/scans/div12-pairs.jsonl in the temp root).

/** Stands in for `@xaravel/runtime/registry`'s `registerClass` (never run). */
declare function registerClass(fqcn: string, value: object): void;

/** The model. */
export class Model {
  /** `model-config`: the property is expected (the method is div12). */
  fillable: string[] = [];

  /** `model-config`: Upstream's `fillable(array)` under its new name: extra, explained by additions.jsonl citing DIV-12. */
  setFillable(fillable: string[]): this {
    this.fillable = fillable;
    return this;
  }

  /** `method-plus-state`: the method is expected (the property is div12). */
  status(): number {
    return 200;
  }
}

registerClass("Demo\\Model", Model);
