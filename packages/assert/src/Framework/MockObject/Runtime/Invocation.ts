// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Invocation` (Story 4.7): one
// call of a doubled method.
//
// `parameters` are the call's arguments as the generated method collected
// them: every declared parameter, an omitted one as its declared default (or
// `null` with no signature row: JS's `undefined`, AD-9), then any extra
// arguments.
//
// Story 9.11 (ESC-4.7-1 item 2, DIV-6.4): with a signature row the Invocation
// gets the declared return type as PHPUnit's constructor gets it from
// sebastian/type (`self` and `parent` already resolved by the Generator): a
// leading `?` is stripped and marks the call nullable, `toString()` appends
// `: <type>` when the type is non-empty, and `generateReturnValue()` follows
// PHPUnit's (`never` throws NeverReturningMethodException, nullable is `null`,
// else ReturnValueGenerator). With no row the type is `''`: no suffix and a
// `null` return, as PHPUnit's for an untyped method.
import { shortenedExport } from "../../../exporter/Exporter";
import { NeverReturningMethodException } from "../Exception/NeverReturningMethodException";
import type { ReturnValueGenerator } from "./ReturnValueGenerator";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class Invocation {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Invocation";

  readonly #className: string;
  readonly #methodName: string;
  readonly #parameters: readonly unknown[];
  readonly #object: object;
  readonly #parameterNames: readonly string[];
  readonly #returnType: string;
  readonly #isReturnTypeNullable: boolean;
  readonly #generator: ReturnValueGenerator | null;

  /**
   * `parameterNames`: `$name` per declared parameter (from the signature row or the method's source), or empty
   * (Parameters uses the index). `returnType`: the declared type string, `''` when untyped or unknown. `generator`
   * makes the value of an unconfigured call; with none it is `null`.
   */
  constructor(
    className: string,
    methodName: string,
    parameters: readonly unknown[],
    object: object,
    parameterNames: readonly string[] = [],
    returnType: string = "",
    generator: ReturnValueGenerator | null = null,
  ) {
    this.#className = className;
    this.#methodName = methodName;
    this.#parameters = Object.freeze([...parameters]);
    this.#object = object;
    this.#parameterNames = parameterNames;
    this.#isReturnTypeNullable = returnType.startsWith("?");
    this.#returnType = this.#isReturnTypeNullable ? returnType.slice(1) : returnType;
    this.#generator = generator;
  }

  className(): string {
    return this.#className;
  }

  methodName(): string {
    return this.#methodName;
  }

  parameters(): readonly unknown[] {
    return this.#parameters;
  }

  /** The declared parameters' names (`$x`), by position. Internal: PHPUnit reads them by reflection. */
  parameterNames(): readonly string[] {
    return this.#parameterNames;
  }

  generateReturnValue(): unknown {
    if (this.#returnType === "never") {
      throw new NeverReturningMethodException(this.#className, this.#methodName);
    }
    if (this.#isReturnTypeNullable || this.#generator === null) {
      return null;
    }
    return this.#generator.generate(this.#className, this.#methodName, this.#object, this.#returnType);
  }

  toString(): string {
    const suffix = this.#returnType === "" ? "" : `: ${this.#returnType}`;
    return `${this.#className}::${this.#methodName}(${this.#parameters.map((parameter) => shortenedExport(parameter)).join(", ")})${suffix}`;
  }

  object(): object {
    return this.#object;
  }
}
