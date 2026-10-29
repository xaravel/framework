// ESC-14.8-1 fixture: an unregistered base class, which `Widget` extends through `mixin(Base, Greets, Counts)`.
// Each member's comment names the finding the diff gives `Mix\Widget` for it.

/** Xaravel's own base class: Upstream has no declaration for it. */
export class Base {
  /** Upstream `Widget::describe()`: inherited, matched. */
  describe(): string {
    return "base";
  }

  /** Upstream `Widget::rename($from, $into)`: inherited, mismatch, parameter name. */
  rename(from: string, to: string): string {
    return `${from}${to}`;
  }

  /** Upstream `Widget::label($prefix)` is the trait's: a trait member wins over the base's (PHP's order). */
  label(text: string): string {
    return text;
  }

  /** Not in Upstream for `Widget`: inherited, so never extra. */
  internal(): void {}
}
