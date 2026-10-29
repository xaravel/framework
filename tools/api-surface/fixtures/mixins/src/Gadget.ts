// ESC-14.8-1 fixture: a plain `extends` of a registered class.
import { registerClass } from "./support/mixin";
import { Widget } from "./Widget";

/** Upstream `Mix\Gadget extends Mix\Widget`: also `explode()`, which nothing declares (missing). */
export class Gadget extends Widget {
  /** Upstream `spin()`: own, matched. */
  spin(): void {}
}

registerClass("Mix\\Gadget", Gadget);
