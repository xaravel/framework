// PHP's `ReflectionNamedType` (DIV-3.2, DIV-3.4): a single type read from an `inject` or `returns` Spec. A class or
// token is named by `fqcn()` and is not builtin; `String`, `Number`, `Boolean` and `primitive` are the builtins
// `string`, `float`, `bool` and `mixed`; the markers `self`, `parent` and `static` keep their names unresolved and
// are not builtin, so `Reflector` resolves them against the declaring class. A Xaravel addition (DIV-3.2;
// decisions/MAINT-2026-10-25-epic-13-items.md, item 5): `getClassOrToken()` gives the class or token the Spec holds,
// so a caller can reflect the type's own value rather than resolve its name again (two tokens recorded under one FQCN
// each stay themselves).
import { registerClass } from "../registry/registry";

export class ReflectionNamedType {
  readonly #name: string;
  readonly #builtin: boolean;
  readonly #value: object | null;

  /**
   * Built by the reflection classes; `name` is the type's name, `builtin` whether PHP calls it builtin, and `value`
   * the class or token the Spec holds (null for a builtin or a relative marker).
   */
  constructor(name: string, builtin: boolean, value: object | null = null) {
    this.#name = name;
    this.#builtin = builtin;
    this.#value = value;
  }

  /** PHP's `getName()`: the FQCN, the builtin's name, or `self` / `parent` / `static`. */
  getName(): string {
    return this.#name;
  }

  /** PHP's `isBuiltin()`. */
  isBuiltin(): boolean {
    return this.#builtin;
  }

  /**
   * A Xaravel addition (DIV-3.2; decisions/MAINT-2026-10-25-epic-13-items.md, item 5): the class or contract token the
   * Spec holds, the value `getName()` names; null for a builtin (`String`, `Number`, `Boolean`, `primitive`) or a
   * relative marker (`self`, `parent`, `static`).
   */
  getClassOrToken(): object | null {
    return this.#value;
  }
}

registerClass("ReflectionNamedType", ReflectionNamedType);
