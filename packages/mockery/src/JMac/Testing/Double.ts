// `JMac\Testing\Double` (jasonmccreary/double v1.0.1): the entry point of the Double port (Story 4.8), in the
// subset the ai, mcp and boost suites use: `for`, `enableAutoVerify` and `verifyAll`, with the internals the
// control verbs call. `received`, `unused`, `verify`, `listen`, `bypassFinals` and the pause/resume API have no
// Upstream use and are not ported (ESC-4.8-1 item 4).
//
// `Double.for(...targets, options?)`. A target is a class, a contract token (a symbol `Symbol.for('<FQCN>')` or an
// AD-1 token object), a class-name string (resolved through the class-lookup protocol) or a real instance (its
// class is the target, and `passthru()` copies it). A trailing plain object is PHP's named arguments: `{ override:
// true }` stands for `override: true`. Several targets must all be tokens (interfaces). The double `instanceof` its
// class target, and carries each token's brand. On a double with a token's built-in `__toString` and no target that
// lists methods declaring `toString` (a bare symbol declares every name), `expects('toString')` /
// `allows('toString')` configure `__toString`, which the double's `toString()` calls (ESC-10.2-4).
//
// Auto-verification (VerifiesDoubles, ESC-4.8-1 item 2). `enableAutoVerify()` (VerifiesDoubles' `#[Before]`) makes
// every double created afterwards pending, and `verifyAll()` checks and drains them. The state lives in the Mockery
// run's slot (support/slots.ts), the process slot outside a run. A run in which auto-verify was enabled performs
// VerifiesDoubles' `#[After]` after `Mockery.close()` (Mockery.ts). One `assertTrue` is recorded per double that
// passes (`PhpUnitIntegration::registerPass`).
import { InvalidArgumentException } from "../../php/InvalidArgumentException";
import { LogicException } from "../../php/LogicException";
import { lookupClass, lookupContract } from "../../support/classes";
import { currentSlot } from "../../support/slots";
import { FQCN, getDebugType, isPhpArray } from "../../support/values";
import { ArgumentFormatter } from "./Diagnostics/ArgumentFormatter";
import { DidYouMean } from "./Diagnostics/DidYouMean";
import { UnsatisfiedExpectation } from "./Diagnostics/UnsatisfiedExpectation";
import type { DoubleInterface } from "./DoubleInterface";
import { ArgumentLabeler } from "./Engine/ArgumentLabeler";
import { ClassGenerator, type Generated } from "./Engine/ClassGenerator";
import { DoubleIdentity } from "./Engine/DoubleIdentity";
import { DoubleState } from "./Engine/DoubleState";
import { DoubleTarget, isContractToken } from "./Engine/DoubleTarget";
import { ExceptionFactory } from "./Engine/ExceptionFactory";
import { MethodExpectation } from "./Engine/MethodExpectation";
import { Mode } from "./Engine/Mode";
import { PassthruInitializer } from "./Engine/PassthruInitializer";
import { PhpUnitIntegration } from "./Engine/PhpUnitIntegration";
import { InvalidDoubleTargetException } from "./Exceptions/InvalidDoubleTargetException";
import { MagicMethodException } from "./Exceptions/MagicMethodException";
import { StaticMethodException } from "./Exceptions/StaticMethodException";
import { UnknownMethodException } from "./Exceptions/UnknownMethodException";
import { OverriddenDouble } from "./OverriddenDouble";

/** PHP's named arguments of `Double::for()`. */
export interface DoubleForOptions {
  readonly override?: boolean;
}

function isOptions(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || isContractToken(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** A target argument as a DoubleTarget and its real instance, or null when it is no target at all. */
function readTarget(argument: unknown): { target: DoubleTarget; instance: object | null } | null {
  if (typeof argument === "string") {
    const found = lookupClass(argument) ?? lookupContract(argument);
    const target = found === null ? null : DoubleTarget.of(found);
    if (target === null) {
      throw InvalidDoubleTargetException.doesNotExist(argument.replace(/^\\/, ""));
    }
    return { target, instance: null };
  }
  const target = DoubleTarget.of(argument);
  if (target !== null) {
    return { target, instance: null };
  }
  if (typeof argument === "object" && argument !== null && !isPhpArray(argument)) {
    const ctor: unknown = (Object.getPrototypeOf(argument) as { constructor?: unknown } | null)?.constructor;
    const instanceTarget = DoubleTarget.of(ctor);
    if (instanceTarget !== null) {
      return { target: instanceTarget, instance: argument };
    }
  }
  return null;
}

function stateOrThrow(double: unknown): DoubleState {
  const raw = double instanceof OverriddenDouble ? (double.instance() as unknown) : double;
  const state = DoubleIdentity.stateOf(raw);
  if (state === null) {
    throw new LogicException("Object is not a `Double`-generated double.");
  }
  return state;
}

function rawDouble(double: object): object {
  return double instanceof OverriddenDouble ? (double.instance() as object) : double;
}

function assertConfigurable(state: DoubleState, method: string): void {
  const declaringCandidate = state.declaringCandidate(method);
  if (declaringCandidate === null) {
    throw new UnknownMethodException(state.target(), method, state.isFabricated(), DidYouMean.suggest(method, state.declarableMethodNames()));
  }
  if (state.isStatic(declaringCandidate, method)) {
    throw new StaticMethodException(state.target(), method, state.isFabricated());
  }
  if (method.startsWith("__") && !ClassGenerator.DOUBLEABLE_MAGIC_METHODS.includes(method)) {
    throw new MagicMethodException(state.target(), method, state.isFabricated());
  }
}

function verifyAmbiguities(states: readonly DoubleState[]): void {
  for (const state of states) {
    const ambiguous = state.ambiguousExpectations();
    if (ambiguous.length > 0) {
      throw ExceptionFactory.ambiguousExpectations(state.label(), ambiguous, state.isFabricated());
    }
  }
}

function verifyState(state: DoubleState): void {
  const unmet = state.unmetExpectations();
  const ambiguous = state.ambiguousExpectations();
  if (unmet.length === 0 && ambiguous.length === 0) {
    PhpUnitIntegration.registerPass();
    return;
  }
  if (ambiguous.length > 0) {
    throw ExceptionFactory.ambiguousExpectations(state.label(), ambiguous, state.isFabricated());
  }
  throw ExceptionFactory.unsatisfiedExpectation(
    state.label(),
    unmet.map((expectation) => {
      const rawCalls = state.callsFor(expectation.method());
      const comparison = rawCalls.length === 1 ? expectation.compareArguments(rawCalls[0]!) : null;
      return new UnsatisfiedExpectation(
        expectation.method(),
        expectation.describe(),
        expectation.minimumCalls(),
        expectation.maximumCalls(),
        expectation.timesMatched(),
        rawCalls.map((call) => ArgumentFormatter.describe(call)),
        comparison?.kind === "arity" ? comparison.text : null,
        comparison?.kind === "comparisons" ? ArgumentLabeler.label(state.parameterNames(expectation.method()), comparison.comparisons) : null,
      );
    }),
    state.isFabricated(),
  );
}

function create(generated: Generated, targets: readonly DoubleTarget[], depth: number, knownInstance: object | null = null): object {
  const state = new DoubleState(
    targets,
    targets.map((target) => target.shortName()).join("&"),
  );
  if (depth > 0) {
    state.markFabricated(depth);
  }
  if (knownInstance !== null) {
    state.rememberRealInstance(knownInstance);
  }
  // A bare symbol token's methods are added when configured, so each such double gets its own prototype.
  const prototype = targets.some((target) => target.acceptsAnyMethod()) ? (Object.create(generated.prototype) as object) : generated.prototype;
  const instance = Object.create(prototype) as object;
  DoubleIdentity.register(instance, state);
  const run = currentSlot().double;
  if (run.enabled) {
    run.pending.push(state);
  }
  return instance;
}

export class Double {
  static readonly [FQCN]: string = "JMac\\Testing\\Double";

  private constructor() {}

  /** A double of `target`: the target and its control verbs (`expects`, `allows`, `strict`, `passthru`, `instance`). */
  static for<T extends object>(target: abstract new (...args: never[]) => T, options?: { readonly override?: false }): T & DoubleInterface<T & DoubleInterface<T>>;
  static for<T extends object>(target: abstract new (...args: never[]) => T, options: DoubleForOptions): DoubleInterface<T>;
  static for(...targets: unknown[]): any;
  static for(...args: unknown[]): unknown {
    let override = false;
    const targets = [...args];
    if (targets.length > 0 && isOptions(targets.at(-1))) {
      const options = targets.pop() as Record<string, unknown>;
      if ("override" in options) {
        if (typeof options["override"] !== "boolean") {
          throw new InvalidArgumentException(`The \`override\` option for \`Double::for()\` must be a \`bool\`, \`${getDebugType(options["override"])}\` given.`);
        }
        override = options["override"];
      }
    }
    const read = targets.map((argument) => {
      const target = readTarget(argument);
      if (target === null) {
        throw new InvalidArgumentException(
          `\`Double::for()\` only accepts targets (a class-string or an object), plus a named \`override\` argument. An unnamed \`${getDebugType(argument)}\` was passed.`,
        );
      }
      return target;
    });
    if (read.length === 0) {
      throw new InvalidArgumentException("`Double::for()` requires at least one target.");
    }
    if (read.length > 1) {
      if (override) {
        throw new InvalidArgumentException("`Double::for()`'s `override` option only supports a single target.");
      }
      if (read.some((entry) => entry.instance !== null)) {
        throw new InvalidArgumentException("`Double::for()` can't accept a real instance as a target when passing multiple targets.");
      }
      return Double.fabricateIntersection(
        read.map((entry) => entry.target),
        0,
      );
    }
    const only = read[0]!;
    return Double.fabricate(only.target, 0, only.instance, override);
  }

  /** @internal A double of one target at `depth` (0 for `for()`; SafeDefaultResolver fabricates at 1). */
  static fabricate(target: DoubleTarget, depth: number, knownInstance: object | null = null, override = false): object {
    const generated = ClassGenerator.generate(target, override);
    const instance = create(generated, [target], depth, knownInstance);
    return ClassGenerator.isControlled(instance) ? instance : new OverriddenDouble(instance);
  }

  /** @internal A double of several interfaces (contract tokens). */
  static fabricateIntersection(targets: readonly DoubleTarget[], depth: number): object {
    const generated = ClassGenerator.generateForIntersection(targets);
    return create(generated, targets, depth);
  }

  /** VerifiesDoubles' `#[Before]`: every double created from now on is pending until `verifyAll()`. */
  static enableAutoVerify(): void {
    const run = currentSlot().double;
    run.enabled = true;
    run.pending = [];
  }

  /**
   * Checks every pending double and turns auto-verification off; returns how many checks ran. With `testFailed`,
   * only ambiguous expectations are reported (VerifiesDoubles' `#[After]` after a failure).
   */
  static verifyAll(testFailed = false): number {
    const run = currentSlot().double;
    run.enabled = false;
    const pending = run.pending;
    run.pending = [];
    if (testFailed) {
      verifyAmbiguities(pending);
      return 0;
    }
    for (const state of pending) {
      verifyState(state);
    }
    return pending.length;
  }

  /** @internal The state of a double (or of the double an OverriddenDouble wraps). */
  static stateFor(double: object): DoubleState {
    return stateOrThrow(double);
  }

  /** @internal `expects()` (required) and `allows()`. */
  static registerExpectation(double: object, method: string, required: boolean): MethodExpectation {
    const state = stateOrThrow(double);
    // ESC-10.2-4: `toString` names the built-in `__toString` the double's `toString()` calls.
    // A bare-symbol target declares every name, so only a target that lists methods can declare its own `toString`.
    if (method === "toString" && !state.targetCandidates().some((target) => !target.acceptsAnyMethod() && target.declares("toString"))) {
      const builtin = state
        .targetCandidates()
        .filter((target) => target.builtins().has("__tostring"))
        .flatMap((target) => target.instanceMethods())
        .find((name) => name.toLowerCase() === "__tostring");
      if (builtin !== undefined) {
        method = builtin;
      }
    }
    assertConfigurable(state, method);
    const expectation = new MethodExpectation(method, required);
    state.registerExpectation(expectation);
    if (state.targetCandidates().some((target) => target.acceptsAnyMethod())) {
      ClassGenerator.ensureMethod(rawDouble(double), method);
    }
    return expectation;
  }

  /** @internal `strict()`. */
  static strict(double: object): void {
    stateOrThrow(double).setMode(Mode.Strict);
  }

  /** @internal `passthru()`: copies `realInstance` (else the instance given to `for()`), then sets Passthru mode. */
  static passthru(double: object, realInstance: object | null = null): void {
    const state = stateOrThrow(double);
    const real = realInstance ?? state.knownInstance();
    const target = state.targetCandidates()[0]!;
    if (real !== null) {
      PassthruInitializer.copyState(rawDouble(double), real, target);
    } else {
      PassthruInitializer.assertConstructible(target);
    }
    state.configurePassthru();
  }
}
