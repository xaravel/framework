// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\ConfigurableMethod` (Story 4.7):
// a doubled method that `method()` may configure.
//
// There are no PHP types or default values here (ESC-4.7-1 item 2): a JS
// parameter's "default" is the `null` an omitted argument becomes, so every
// declared parameter counts as having one, and `mayReturn` accepts any value.

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ConfigurableMethod {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\ConfigurableMethod";

  readonly #name: string;
  readonly #numberOfParameters: number;
  readonly #parameterNames: readonly string[];

  /** `parameterNames`: `$name` per declared parameter when the source names them all, else empty. */
  constructor(name: string, numberOfParameters: number, parameterNames: readonly string[]) {
    this.#name = name;
    this.#numberOfParameters = numberOfParameters;
    this.#parameterNames = Object.freeze([...parameterNames]);
  }

  name(): string {
    return this.#name;
  }

  numberOfParameters(): number {
    return this.#numberOfParameters;
  }

  parameterNames(): readonly string[] {
    return this.#parameterNames;
  }

  /** `null` at each declared position: what an omitted JS argument becomes. */
  defaultParameterValues(): readonly null[] {
    return Array.from({ length: this.#numberOfParameters }, () => null);
  }

  mayReturn(_value: unknown): boolean {
    return true;
  }
}
