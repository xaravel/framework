// ESC-14.8-1 fixture: a trait using a trait (`class Counts extends mixin(null, Resets)`), used by `Widget`.
import { mixin, registerClass } from "../support/mixin";

/** An unregistered trait: PHP lists its members on each class using it, directly or through `Counts`. */
export class Resets {
  /** Upstream `Counts::reset()` and `Widget::reset()`: supplied through `Counts`, matched. */
  reset(): void {}
}

/** Upstream trait `Mix\Traits\Counts`. */
export class Counts extends mixin(null, Resets) {
  /** Upstream `count()`: matched. */
  count(): number {
    return 0;
  }

  /** Upstream `tally($items, $by)`: mismatch, parameter name, here and on `Widget`. */
  tally(items: unknown[], step: number): number {
    return items.length * step;
  }
}

registerClass("Mix\\Traits\\Counts", Counts);
