// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\AbstractInvocationImplementation`
// (Story 4.7): `method()` and the `will*()` stubs of one matcher.
//
// A method name is matched case-insensitively against the double's
// configurable methods. `willReturnMap` rows that do not have one element per
// declared parameter plus the return value are normalized as PHPUnit's
// `normalizeValueMap` does: each missing position that has a declared default
// gets it (ConfigurableMethod: the signature row's defaults, Story 9.11; with
// no row, `null` at every position). No return value is type-checked against
// the declared return type (the Story 9.11 decision for ESC-4.7-1 item 2).
// `toString` names a double's built-in `__toString` (ESC-10.2-4) when it has
// one and no configurable `toString`.
import { Constraint } from "../../Constraint";
import { isThrowable } from "../../Throwable";
import { isBuiltin, type ConfigurableMethod } from "../ConfigurableMethod";
import { MethodCannotBeConfiguredException } from "../Exception/MethodCannotBeConfiguredException";
import { MethodNameAlreadyConfiguredException } from "../Exception/MethodNameAlreadyConfiguredException";
import { MethodNameNotConfiguredException } from "../Exception/MethodNameNotConfiguredException";
import { MethodParametersAlreadyConfiguredException } from "../Exception/MethodParametersAlreadyConfiguredException";
import type { InvocationStubber } from "./Interface/InvocationStubber";
import type { InvocationHandler } from "./InvocationHandler";
import type { Matcher } from "./Matcher";
import { MethodName } from "./Rule/MethodName";
import { ConsecutiveCalls } from "./Stub/ConsecutiveCalls";
import { Exception } from "./Stub/Exception";
import { ReturnCallback } from "./Stub/ReturnCallback";
import { ReturnSelf } from "./Stub/ReturnSelf";
import { ReturnStub } from "./Stub/ReturnStub";
import { ReturnValueMap } from "./Stub/ReturnValueMap";
import { isStub, type Stub } from "./Stub/Stub";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export abstract class AbstractInvocationImplementation implements InvocationStubber {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\AbstractInvocationImplementation";

  protected readonly invocationHandler: InvocationHandler;
  protected readonly matcher: Matcher;
  protected readonly configurableMethods: readonly ConfigurableMethod[];

  constructor(handler: InvocationHandler, matcher: Matcher, configurableMethods: readonly ConfigurableMethod[]) {
    this.invocationHandler = handler;
    this.matcher = matcher;
    this.configurableMethods = configurableMethods;
  }

  method(constraint: Constraint | string): this {
    if (this.matcher.hasMethodNameRule()) {
      throw new MethodNameAlreadyConfiguredException();
    }
    if (typeof constraint === "string") {
      constraint = this.#builtinToStringAlias(constraint);
      const name = constraint.toLowerCase();
      if (!this.configurableMethods.some((method) => method.name().toLowerCase() === name)) {
        throw new MethodCannotBeConfiguredException(constraint);
      }
    } else if (!(constraint instanceof Constraint)) {
      throw new TypeError(`PHPUnit\\Framework\\MockObject\\InvocationStubber::method(): Argument #1 ($constraint) must be of type PHPUnit\\Framework\\Constraint\\Constraint|string, ${typeof constraint} given`);
    }
    this.matcher.setMethodNameRule(new MethodName(constraint));
    return this;
  }

  /**
   * `toString` names the built-in `__toString` (ESC-10.2-4: one any token of the closure lists as a built-in, read
   * through `isBuiltin`, which the double's `toString()` calls) when there is one and no configurable `toString`;
   * any other name is itself.
   */
  #builtinToStringAlias(name: string): string {
    if (name.toLowerCase() !== "tostring" || this.configurableMethods.some((method) => method.name().toLowerCase() === "tostring")) {
      return name;
    }
    const builtin = this.configurableMethods.find((method) => method.name().toLowerCase() === "__tostring" && isBuiltin(method));
    return builtin === undefined ? name : builtin.name();
  }

  will(stub: Stub): this {
    this.matcher.setStub(stub);
    return this;
  }

  willReturn(value: unknown, ...nextValues: unknown[]): this {
    // PHPUnit's return type check, which needs the method name rule (there are no types to check).
    this.#configuredMethod();
    if (nextValues.length === 0) {
      return this.will(isStub(value) ? value : new ReturnStub(value));
    }
    return this.will(new ConsecutiveCalls([value, ...nextValues]));
  }

  willReturnMap(valueMap: readonly (readonly unknown[])[]): this {
    return this.will(new ReturnValueMap(this.#normalizeValueMap(valueMap)));
  }

  willReturnCallback(callback: (...args: any[]) => unknown): this {
    if (typeof callback !== "function") {
      throw new TypeError(`PHPUnit\\Framework\\MockObject\\InvocationStubber::willReturnCallback(): Argument #1 ($callback) must be of type callable, ${typeof callback} given`);
    }
    return this.will(new ReturnCallback(callback));
  }

  willReturnSelf(): this {
    return this.will(new ReturnSelf());
  }

  willReturnOnConsecutiveCalls(...values: unknown[]): this {
    return this.will(new ConsecutiveCalls(values));
  }

  willThrowException(exception: Error): this {
    if (!isThrowable(exception)) {
      throw new TypeError(`PHPUnit\\Framework\\MockObject\\InvocationStubber::willThrowException(): Argument #1 ($exception) must be of type Throwable, ${typeof exception} given`);
    }
    return this.will(new Exception(exception));
  }

  protected ensureParametersCanBeConfigured(): void {
    if (!this.matcher.hasMethodNameRule()) {
      throw new MethodNameNotConfiguredException();
    }
    if (this.matcher.hasParametersRule()) {
      throw new MethodParametersAlreadyConfiguredException();
    }
  }

  /** The one configurable method the method name rule names, else null. */
  #configuredMethod(): ConfigurableMethod | null {
    let configured: ConfigurableMethod | null = null;
    for (const method of this.configurableMethods) {
      if (this.matcher.methodNameRule().matchesName(method.name())) {
        if (configured !== null) {
          return null;
        }
        configured = method;
      }
    }
    return configured;
  }

  #normalizeValueMap(valueMap: readonly (readonly unknown[])[]): unknown[] {
    const method = this.#configuredMethod();
    if (method === null) {
      // No single configured method: the map is used as given.
      return [...valueMap];
    }
    const row = method.signature();
    const numberOfParameters = method.numberOfParameters(row);
    const defaultValues = method.defaultParameterValues(row);
    const hasDefaultValues = defaultValues.size > 0;
    return [...valueMap].map((mapping) => {
      if (!Array.isArray(mapping) || mapping.length - 1 === numberOfParameters || !hasDefaultValues) {
        return mapping;
      }
      const row = [...(mapping as unknown[])];
      const returnValue = row.pop();
      const normalized: unknown[] = [];
      for (let index = 0; index < numberOfParameters; index++) {
        const defaultValue = defaultValues.get(index);
        if (index < row.length) {
          normalized.push(row[index]);
        } else if (defaultValue !== undefined) {
          normalized.push(defaultValue());
        }
      }
      normalized.push(returnValue);
      return normalized;
    });
  }
}
