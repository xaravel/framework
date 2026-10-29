// ESC-14.8-1 fixture: PHP's `class Widget extends Base { use Greets, Counts; }`. Upstream lists the trait members on
// `Mix\Widget`, and the members PHP's `Widget` overrides; the TS class declares only `id` and `greet`.
import { Base } from "./Base";
import { mixin, registerClass } from "./support/mixin";
import { Counts } from "./Traits/Counts";
import { Greets } from "./Traits/Greets";

/** Upstream `Mix\Widget`: also `vanish()`, which nothing declares (missing). */
export class Widget extends mixin(Base, Greets, Counts) {
  /** Upstream `id()`: own, matched. */
  id(): number {
    return 1;
  }

  /** Upstream `greet($who)`: own, matched, as the class's own member wins over the trait's `greet($name)`. */
  override greet(who: string): string {
    return `hi ${who}`;
  }
}

registerClass("Mix\\Widget", Widget);
