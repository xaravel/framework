// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Invocation` (Story 4.7): one
// call of a doubled method.
//
// `parameters` are the call's arguments as the generated method collected
// them: every declared parameter, an omitted one as `null` (JS's `undefined`,
// AD-9), then any extra arguments. There are no PHP return types (ESC-4.7-1
// item 2), so `toString()` has no `: <type>` suffix and `generateReturnValue()`
// is `null`, as PHPUnit's is for an untyped method.
import { shortenedExport } from "../../../exporter/Exporter";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class Invocation {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Invocation";

  readonly #className: string;
  readonly #methodName: string;
  readonly #parameters: readonly unknown[];
  readonly #object: object;
  readonly #parameterNames: readonly string[];

  /** `parameterNames`: `$name` per declared parameter, read from the method's source, or empty (Parameters uses the index). */
  constructor(className: string, methodName: string, parameters: readonly unknown[], object: object, parameterNames: readonly string[] = []) {
    this.#className = className;
    this.#methodName = methodName;
    this.#parameters = Object.freeze([...parameters]);
    this.#object = object;
    this.#parameterNames = parameterNames;
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
    return null;
  }

  toString(): string {
    return `${this.#className}::${this.#methodName}(${this.#parameters.map((parameter) => shortenedExport(parameter)).join(", ")})`;
  }

  object(): object {
    return this.#object;
  }
}
