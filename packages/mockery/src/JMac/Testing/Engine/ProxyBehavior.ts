// `JMac\Testing\Engine\ProxyBehavior` (jasonmccreary/double v1.0.1): what every doubled method calls. Internal.
//
// `intercept` records the call, then picks an expectation: specific ones (with a constraint) before generic ones,
// last-registered first within each tier, and an exhausted match as the fallback. With no match, a method that has
// any `expects()` throws ExpectationCallMismatch at the call; otherwise the mode decides: Strict throws
// UnexpectedCall, Loose gives the safe default, Passthru runs the target's real method with the double as `this`.
// A match over its limit throws ExpectationCallLimitExceeded at the call. `ordered()` is not ported (ESC-4.8-1
// item 4).
import { FQCN } from "../../../support/values";
import type { ArgumentComparison } from "../Diagnostics/ArgumentComparison";
import { ArgumentFormatter } from "../Diagnostics/ArgumentFormatter";
import { ArgumentLabeler } from "./ArgumentLabeler";
import { DoubleIdentity } from "./DoubleIdentity";
import type { DoubleState } from "./DoubleState";
import { ExceptionFactory } from "./ExceptionFactory";
import { MethodExpectation } from "./MethodExpectation";
import { Mode } from "./Mode";
import { SafeDefaultResolver } from "./SafeDefaultResolver";

function findMatchInTier(candidates: readonly MethodExpectation[], args: readonly unknown[], fallback: { value: MethodExpectation | null }): MethodExpectation | null {
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i]!;
    if (!candidate.matchesArguments(args)) {
      continue;
    }
    if (candidate.timesMatched() < candidate.maximumCalls()) {
      return candidate;
    }
    fallback.value ??= candidate;
  }
  return null;
}

function findMatch(candidates: readonly MethodExpectation[], args: readonly unknown[]): MethodExpectation | null {
  const specific = candidates.filter((candidate) => candidate.isSpecific());
  const generic = candidates.filter((candidate) => !candidate.isSpecific());
  const fallback: { value: MethodExpectation | null } = { value: null };
  return findMatchInTier(specific, args, fallback) ?? findMatchInTier(generic, args, fallback) ?? fallback.value;
}

function countOtherMatchingExpectations(state: DoubleState, method: string, args: readonly unknown[], selected: MethodExpectation): number {
  return state.expectationsFor(method).filter((candidate) => candidate !== selected && candidate.matchesArguments(args)).length;
}

function comparisonsAgainstThePriorCall(state: DoubleState, method: string, args: readonly unknown[], otherRawCalls: readonly (readonly unknown[])[]): ArgumentComparison[] | null {
  if (otherRawCalls.length !== 1) {
    return null;
  }
  const comparison = new MethodExpectation(method, false).with(...otherRawCalls[0]!).compareArguments(args);
  return comparison?.kind === "comparisons" ? ArgumentLabeler.label(state.parameterNames(method), comparison.comparisons) : null;
}

function comparisonsAgainstTheOnlyCandidate(state: DoubleState, method: string, args: readonly unknown[], candidates: readonly MethodExpectation[]): ArgumentComparison[] | null {
  if (candidates.length !== 1) {
    return null;
  }
  const comparison = candidates[0]!.compareArguments(args);
  return comparison?.kind === "comparisons" ? ArgumentLabeler.label(state.parameterNames(method), comparison.comparisons) : null;
}

function unexpectedCall(state: DoubleState, method: string, args: readonly unknown[]): Error {
  const otherRawCalls = state.callsFor(method).slice(0, -1);
  return ExceptionFactory.unexpectedCall(
    state.label(),
    method,
    ArgumentFormatter.describe(args),
    state.isFabricated(),
    otherRawCalls.map((call) => ArgumentFormatter.describe(call)),
    comparisonsAgainstThePriorCall(state, method, args, otherRawCalls),
  );
}

function expectationCallMismatch(state: DoubleState, method: string, args: readonly unknown[], candidates: readonly MethodExpectation[]): Error {
  return ExceptionFactory.expectationCallMismatch(
    state.label(),
    method,
    ArgumentFormatter.describe(args),
    state.isFabricated(),
    candidates.map((candidate) => candidate.describeArguments()),
    comparisonsAgainstTheOnlyCandidate(state, method, args, candidates),
    state.mode() === Mode.Passthru,
  );
}

function handleUnmatchedCall(state: DoubleState, method: string, args: readonly unknown[], double: object): unknown {
  const mode = state.mode();
  if (mode === Mode.Strict) {
    throw unexpectedCall(state, method, args);
  }
  if (mode === Mode.Passthru) {
    const real = state.declaringCandidate(method)?.realMethod(method) ?? null;
    if (real === null) {
      throw new TypeError(`Call to undefined method ${state.target()}::${method}()`);
    }
    // AD-9: a real method that returns nothing gives null.
    return real.apply(double, [...args]) ?? null;
  }
  return SafeDefaultResolver.resolveForMethod(state, method, double);
}

export class ProxyBehavior {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\ProxyBehavior";

  static intercept(double: object, method: string, args: readonly unknown[]): unknown {
    const state = DoubleIdentity.stateOf(double);
    if (state === null) {
      throw new TypeError(`${method}() was called on an object that is not a Double-generated double`);
    }
    state.recordCall(method, args);
    const candidates = state.expectationsFor(method);
    const expectation = findMatch(candidates, args);
    if (expectation === null) {
      if (candidates.some((candidate) => candidate.isRequired())) {
        throw expectationCallMismatch(state, method, args, candidates);
      }
      return handleUnmatchedCall(state, method, args, double);
    }
    expectation.recordMatch();
    if (expectation.exceedsMaximum()) {
      throw ExceptionFactory.expectationCallLimitExceeded(
        state.label(),
        method,
        ArgumentFormatter.describe(args),
        expectation.maximumCalls(),
        expectation.timesMatched(),
        state.isFabricated(),
        countOtherMatchingExpectations(state, method, args, expectation),
      );
    }
    if (!expectation.hasReturnConfigured()) {
      return SafeDefaultResolver.resolveForMethod(state, method, double);
    }
    return expectation.resolveReturn(args);
  }
}
