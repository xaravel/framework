// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\ConfigurableMethod` (Story 4.7):
// a doubled method that `method()` may configure.
//
// Story 9.11 (ESC-4.7-1 item 2, DIV-6.4): a method knows the class that
// declares it (its `Symbol.for('xaravel.class.fqcn')` brand, as
// `ReflectionMethod::getDeclaringClass()` names it). When the signature lookup
// has a row for that class and method (Generator/Signature.ts, read at each
// call; a caller that needs several of these reads it once and passes it), the row gives the parameter count, the `$names` and the defaults:
// only a parameter with a declared default has one, and a default the grader
// cannot evaluate throws PHPUnit's `MockObject\RuntimeException` when it is
// needed. With no row, there are no PHP types or default values: a JS
// parameter's "default" is the `null` an omitted argument becomes, so every
// declared parameter counts as having one. `mayReturn` accepts any value:
// `willReturn` is not type-checked against the row (the Story's decision for
// ESC-4.7-1 item 2's open question, README).
import { RuntimeException } from "./Exception/RuntimeException";
import { evaluateDefault, signatureOf, type SignatureRow } from "./Generator/Signature";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

/** The class (or contract token) that declares a method: its FQCN, the value itself, and its parent's FQCN and class. */
export interface DeclaringClass {
  readonly name: string;
  readonly type: unknown;
  readonly parentName: string | null;
  readonly parentType: unknown;
}

/** The methods a double of a contract token takes as built-ins (ESC-10.2-4). Internal: not on the index. */
const BUILTINS = new WeakSet<ConfigurableMethod>();

/** @internal Marks `method` as a contract token's built-in (`contractMethods`' `builtin`, the union over the closure). */
export function markBuiltin(method: ConfigurableMethod): void {
  BUILTINS.add(method);
}

/** @internal Whether `method` is a contract token's built-in. */
export function isBuiltin(method: ConfigurableMethod): boolean {
  return BUILTINS.has(method);
}

export class ConfigurableMethod {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\ConfigurableMethod";

  readonly #name: string;
  readonly #numberOfParameters: number;
  readonly #parameterNames: readonly string[];
  readonly #declaringClass: DeclaringClass | null;

  /** `parameterNames`: `$name` per declared parameter when the source names them all, else empty. */
  constructor(name: string, numberOfParameters: number, parameterNames: readonly string[], declaringClass: DeclaringClass | null = null) {
    this.#name = name;
    this.#numberOfParameters = numberOfParameters;
    this.#parameterNames = Object.freeze([...parameterNames]);
    this.#declaringClass = declaringClass;
  }

  name(): string {
    return this.#name;
  }

  /** The declaring class, or null for a method the target does not have (`onlyMethods` of an unknown name). */
  declaringClass(): DeclaringClass | null {
    return this.#declaringClass;
  }

  /** The declared signature row, read now (never cached), or null. Internal. */
  signature(): SignatureRow | null {
    return signatureOf(this.#declaringClass?.name ?? null, this.#name);
  }

  /** PHP's `count($method->getParameters())` with a row (the variadic included); else the JS source's count. */
  numberOfParameters(row: SignatureRow | null = this.signature()): number {
    return row === null ? this.#numberOfParameters : row.parameters.length;
  }

  /** `$name` per declared parameter (a row's, its variadic included, as PHPUnit reflects them), or empty (Parameters uses the index). */
  parameterNames(row: SignatureRow | null = this.signature()): readonly string[] {
    return row === null ? this.#parameterNames : row.parameters.map((parameter) => `$${parameter.name}`);
  }

  /**
   * The declared defaults by position, each evaluated when it is read (PHPUnit's `defaultParameterValues()`, which
   * has an entry only for a parameter with a default). With no row, `null` at each declared position.
   */
  defaultParameterValues(row: SignatureRow | null = this.signature()): ReadonlyMap<number, () => unknown> {
    const defaults = new Map<number, () => unknown>();
    if (row === null) {
      for (let index = 0; index < this.#numberOfParameters; index++) {
        defaults.set(index, () => null);
      }
      return defaults;
    }
    row.parameters.forEach((parameter, index) => {
      const text = parameter.default;
      if (text !== null) {
        defaults.set(index, () => this.#evaluate(parameter.name, text));
      }
    });
    return defaults;
  }

  #evaluate(parameter: string, text: string): unknown {
    const evaluated = evaluateDefault(text);
    if (evaluated === null) {
      throw new RuntimeException(
        `Default value ${text} of parameter $${parameter} of ${this.#declaringClass?.name ?? ""}::${this.#name}() cannot be evaluated by @xaravel/assert; pass the argument`,
      );
    }
    return evaluated.value;
  }

  mayReturn(_value: unknown): boolean {
    return true;
  }
}
