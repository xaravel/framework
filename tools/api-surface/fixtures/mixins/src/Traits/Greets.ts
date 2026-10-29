// ESC-14.8-1 fixture: a trait, used by `Widget`.
import { registerClass } from "../support/mixin";

/** Upstream trait `Mix\Traits\Greets`: every member matched, on itself and on `Mix\Widget`. */
export class Greets {
  /** Upstream `greet($name)`; `Widget` declares its own `greet($who)`, which wins over this one. */
  greet(name: string): string {
    return `hello ${name}`;
  }

  /** Upstream `label($prefix)`: wins over `Base::label` on `Widget`. */
  label(prefix: string): string {
    return prefix;
  }

  /** Upstream `static make()`: a trait's static side is supplied too. */
  static make(): Greets {
    return new Greets();
  }
}

registerClass("Mix\\Traits\\Greets", Greets);
