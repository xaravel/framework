// PHP's `ReflectionNamedType` (DIV-3.2, DIV-3.4): a single type read from an `inject` or `returns` Spec. A class or
// token is named by `fqcn()` and is not builtin; `String`, `Number`, `Boolean` and `primitive` are the builtins
// `string`, `float`, `bool` and `mixed`; the markers `self`, `parent` and `static` keep their names unresolved and
// are not builtin, so `Reflector` resolves them against the declaring class.
import { registerClass } from "../registry/registry";

export class ReflectionNamedType {
  readonly #name: string;
  readonly #builtin: boolean;

  /** Built by the reflection classes; `name` is the type's name, `builtin` whether PHP calls it builtin. */
  constructor(name: string, builtin: boolean) {
    this.#name = name;
    this.#builtin = builtin;
  }

  /** PHP's `getName()`: the FQCN, the builtin's name, or `self` / `parent` / `static`. */
  getName(): string {
    return this.#name;
  }

  /** PHP's `isBuiltin()`. */
  isBuiltin(): boolean {
    return this.#builtin;
  }
}

registerClass("ReflectionNamedType", ReflectionNamedType);
