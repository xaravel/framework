// A by-reference parameter (AD-9.2, DIV-9.2): PHP's `function f(&$x)` takes a `Ref<T>` box. The callee writes through
// `value`, and the caller reads the new value back from it.
import { registerClass } from "../registry/registry";

export class Ref<T> {
  value: T;

  constructor(value: T) {
    this.value = value;
  }
}

registerClass("Xaravel\\Runtime\\Php\\Ref", Ref);
