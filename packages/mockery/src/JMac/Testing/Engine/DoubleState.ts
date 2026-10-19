// `JMac\Testing\Engine\DoubleState` (jasonmccreary/double v1.0.1): one double's targets, label, mode,
// expectations (in registration order) and every observed call. Internal.
import { FQCN } from "../../../support/values";
import { AmbiguousExpectation } from "../Diagnostics/AmbiguousExpectation";
import { ModeConfigurationException } from "../Exceptions/ModeConfigurationException";
import type { DoubleTarget } from "./DoubleTarget";
import type { MethodExpectation } from "./MethodExpectation";
import { Mode } from "./Mode";

export interface RecordedCall {
  readonly method: string;
  readonly arguments: readonly unknown[];
}

export class DoubleState {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\DoubleState";

  readonly #targets: readonly DoubleTarget[];
  readonly #label: string;
  readonly #expectations: MethodExpectation[] = [];
  readonly #calls: RecordedCall[] = [];
  #mode: Mode | null = null;
  #knownInstance: object | null = null;
  #fabricationDepth = 0;

  constructor(targets: readonly DoubleTarget[], label: string) {
    this.#targets = targets;
    this.#label = label;
  }

  /** The target names, `&`-joined for an intersection. */
  target(): string {
    return this.#targets.map((target) => target.name).join("&");
  }

  targetCandidates(): readonly DoubleTarget[] {
    return this.#targets;
  }

  /** The first target that declares `method`, or null. */
  declaringCandidate(method: string): DoubleTarget | null {
    return this.#targets.find((target) => target.declares(method)) ?? null;
  }

  isStatic(declaringCandidate: DoubleTarget, method: string): boolean {
    return declaringCandidate.isStatic(method);
  }

  parameterNames(method: string): string[] {
    return this.declaringCandidate(method)?.parameterNames(method) ?? [];
  }

  /** Every method name of every target, for DidYouMean. */
  declarableMethodNames(): string[] {
    const names: string[] = [];
    for (const target of this.#targets) {
      for (const name of target.methodNames()) {
        if (!names.includes(name)) {
          names.push(name);
        }
      }
    }
    return names;
  }

  label(): string {
    return this.#label;
  }

  /** Loose unless set. */
  mode(): Mode {
    return this.#mode ?? Mode.Loose;
  }

  setMode(mode: Mode): void {
    if (this.#mode !== null) {
      throw new ModeConfigurationException(this.#label, this.#mode.name, mode.name, this.isFabricated());
    }
    this.#mode = mode;
  }

  configurePassthru(): void {
    this.setMode(Mode.Passthru);
  }

  rememberRealInstance(instance: object): void {
    this.#knownInstance = instance;
  }

  knownInstance(): object | null {
    return this.#knownInstance;
  }

  markFabricated(depth: number): void {
    this.#fabricationDepth = depth;
  }

  fabricationDepth(): number {
    return this.#fabricationDepth;
  }

  isFabricated(): boolean {
    return this.#fabricationDepth > 0;
  }

  registerExpectation(expectation: MethodExpectation): void {
    this.#expectations.push(expectation);
  }

  expectationsFor(method: string): MethodExpectation[] {
    return this.#expectations.filter((expectation) => expectation.method() === method);
  }

  recordCall(method: string, args: readonly unknown[]): void {
    this.#calls.push({ method, arguments: args });
  }

  callsFor(method: string): (readonly unknown[])[] {
    return this.#calls.filter((call) => call.method === method).map((call) => call.arguments);
  }

  calls(): readonly RecordedCall[] {
    return this.#calls;
  }

  unmetExpectations(): MethodExpectation[] {
    return this.#expectations.filter((expectation) => !expectation.isSatisfied());
  }

  /** Groups of two or more expectations of one method with identical argument matching, each with a finite limit. */
  ambiguousExpectations(): AmbiguousExpectation[] {
    const bySignature = new Map<string, { method: string; arguments: string; members: MethodExpectation[] }>();
    for (const expectation of this.#expectations) {
      const key = `${expectation.method()}\0${expectation.describeArguments()}`;
      let group = bySignature.get(key);
      if (group === undefined) {
        group = { method: expectation.method(), arguments: expectation.describeArguments(), members: [] };
        bySignature.set(key, group);
      }
      group.members.push(expectation);
    }
    const ambiguities: AmbiguousExpectation[] = [];
    for (const group of bySignature.values()) {
      if (group.members.length >= 2 && group.members.every((expectation) => expectation.hasFiniteCallLimit())) {
        ambiguities.push(new AmbiguousExpectation(group.method, group.arguments, group.members.length));
      }
    }
    return ambiguities;
  }
}
