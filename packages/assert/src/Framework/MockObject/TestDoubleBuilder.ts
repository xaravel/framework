// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\TestDoubleBuilder` (Story 4.7):
// the configuration `getMockBuilder(X)` builds. By default every method is
// doubled and the original constructor runs, with the `setConstructorArgs`
// arguments. `onlyMethods([...])` doubles only those (the others stay the
// target's), and `onlyMethods([])` none of a class's. The APIs Upstream never
// calls (`doubleProperties`, `setMockClassName`, the auto-return-value
// toggles, …) are not ported.
import { CannotUseOnlyMethodsException } from "./Exception/CannotUseOnlyMethodsException";
import { type DoubleTarget, readTarget, testDouble } from "./Generator/Generator";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export abstract class TestDoubleBuilder {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\TestDoubleBuilder";

  protected readonly type: DoubleTarget;
  #methods: string[] = [];
  #emptyMethodsArray = false;
  #constructorArgs: unknown[] = [];
  #originalConstructor = true;

  constructor(type: DoubleTarget) {
    readTarget(type);
    this.type = type;
  }

  onlyMethods(methods: readonly string[]): this {
    if (!Array.isArray(methods)) {
      throw new TypeError(`PHPUnit\\Framework\\MockObject\\TestDoubleBuilder::onlyMethods(): Argument #1 ($methods) must be of type array, ${typeof methods} given`);
    }
    if (methods.length === 0) {
      this.#emptyMethodsArray = true;
      return this;
    }
    const target = readTarget(this.type);
    for (const method of methods) {
      if (typeof method !== "string" || !hasMethod(target.methods, method)) {
        throw new CannotUseOnlyMethodsException(target.name, String(method));
      }
    }
    this.#methods = [...this.#methods, ...methods];
    return this;
  }

  setConstructorArgs(arguments_: readonly unknown[]): this {
    if (!Array.isArray(arguments_)) {
      throw new TypeError(`PHPUnit\\Framework\\MockObject\\TestDoubleBuilder::setConstructorArgs(): Argument #1 ($arguments) must be of type array, ${typeof arguments_} given`);
    }
    this.#constructorArgs = [...arguments_];
    return this;
  }

  disableOriginalConstructor(): this {
    this.#originalConstructor = false;
    return this;
  }

  enableOriginalConstructor(): this {
    this.#originalConstructor = true;
    return this;
  }

  /** A no-op: `clone` of a double is not ported. */
  disableOriginalClone(): this {
    return this;
  }

  protected getTestDouble(mockObject: boolean, addToAssertionCount: (count: number) => void): object {
    return testDouble(this.type, mockObject, this.#emptyMethodsArray ? null : this.#methods, this.#constructorArgs, this.#originalConstructor, addToAssertionCount);
  }
}

/** `ReflectionClass::hasMethod`, case-insensitive as PHP's method names are. */
function hasMethod(methods: ReadonlyMap<string, unknown>, name: string): boolean {
  const lower = name.toLowerCase();
  return [...methods.keys()].some((method) => method.toLowerCase() === lower);
}
