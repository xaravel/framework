// `JMac\Testing\Engine\SafeDefaultResolver` (jasonmccreary/double v1.0.1): the value of a call with no configured
// return, by the method's declared return type. Internal.
//
// JS has no return types, so the declared PHP type is read through the return-type lookup protocol (ESC-4.8-1
// item 1): `globalThis[Symbol.for('xaravel.api.signature')]`, a function `(fqcn, member) => { returns, nullable } |
// null`, the row shape of `conformance/api-surface/*.jsonl`, asked for the class that declares the method. With no
// lookup, or no row, the method is untyped and the default is null, as PHP's for an untyped method.
//
// A type string reads as PHP's `ReflectionType`: nullable (or a union with `null`) is null; a union takes its
// first member; `A&B` is an intersection. A builtin gives PHP's default (`bool` false, `int` and `float` 0, `string`
// '', `array` and `iterable` []; the rest null). `self`, `static` or the declaring class give the double itself. Any
// other name is resolved through the class-lookup protocol (support/classes.ts): a class, an enum (a class with a
// static `cases()`: its first case) or a contract token. A name nothing resolves throws a LogicException naming it,
// never null. One level of doubles is fabricated; past it, a double that already satisfies the type is returned,
// otherwise FabricationLimitExceeded.
import { LogicException } from "../../../php/LogicException";
import { lookupClass, lookupContract } from "../../../support/classes";
import { FQCN } from "../../../support/values";
import { Double } from "../Double";
import type { DoubleState } from "./DoubleState";
import { DoubleTarget } from "./DoubleTarget";
import { ExceptionFactory } from "./ExceptionFactory";

const SIGNATURE = Symbol.for("xaravel.api.signature");
const MAX_FABRICATION_DEPTH = 1;
const BUILTINS: ReadonlySet<string> = new Set(["bool", "int", "float", "string", "array", "iterable", "object", "callable", "false", "true", "never", "void", "mixed", "null"]);

/** A parsed PHP type: a named type, or an intersection of names. */
type Member = { readonly kind: "named"; readonly name: string } | { readonly kind: "intersection"; readonly names: readonly string[] };

interface Signature {
  readonly returns: string | null;
  readonly nullable: boolean;
}

function signatureOf(fqcn: string, member: string): Signature | null {
  const lookup: unknown = (globalThis as Record<symbol, unknown>)[SIGNATURE];
  if (typeof lookup !== "function") {
    return null;
  }
  const row: unknown = (lookup as (fqcn: string, member: string) => unknown)(fqcn, member);
  if (typeof row !== "object" || row === null) {
    return null;
  }
  const returns: unknown = (row as { returns?: unknown }).returns;
  const nullable: unknown = (row as { nullable?: unknown }).nullable;
  return { returns: typeof returns === "string" && returns !== "" ? returns : null, nullable: nullable === true };
}

/** The members of a type string, in its order: `A|B`, `(A&B)|C`, `A&B`, `?A` (its `?` read through `nullable`). */
function parse(type: string): Member[] {
  const text = type.replace(/^\?/, "");
  const members: Member[] = [];
  for (const part of text.split("|")) {
    const trimmed = part.trim().replace(/^\(/, "").replace(/\)$/, "");
    const names = trimmed.split("&").map((name) => name.trim().replace(/^\\/, ""));
    members.push(names.length > 1 ? { kind: "intersection", names } : { kind: "named", name: names[0]! });
  }
  return members;
}

/** A class-or-interface name as a target: a class, a contract token, or null. */
function resolveTarget(name: string): DoubleTarget | null {
  const found = lookupClass(name) ?? lookupContract(name);
  return found === null ? null : DoubleTarget.of(found);
}

function unresolvable(name: string, label: string, method: string): LogicException {
  return new LogicException(
    `Double cannot resolve the return type \`${name}\` of \`${label}::${method}()\`: neither Symbol.for('xaravel.class.lookup') nor a contract token resolves it (ESC-4.8-1 item 1)`,
  );
}

function limitExceeded(label: string, method: string, returnType: string): Error {
  return ExceptionFactory.fabricationLimitExceeded(label, method, returnType, MAX_FABRICATION_DEPTH);
}

function resolveIntersection(names: readonly string[], double: object, depth: number, label: string, method: string): unknown {
  const targets = names.map((name) => {
    const target = resolveTarget(name);
    if (target === null) {
      throw unresolvable(name, label, method);
    }
    return target;
  });
  if (depth >= MAX_FABRICATION_DEPTH) {
    if (targets.every((target) => target.isInstance(double))) {
      return double;
    }
    throw limitExceeded(label, method, names.join("&"));
  }
  return Double.fabricateIntersection(targets, depth + 1);
}

function resolveNamed(name: string, double: object, depth: number, declaringClass: string | null, label: string, method: string): unknown {
  const lower = name.toLowerCase();
  if (BUILTINS.has(lower)) {
    switch (lower) {
      case "bool":
        return false;
      case "int":
      case "float":
        return 0;
      case "string":
        return "";
      case "array":
      case "iterable":
        return [];
      default:
        return null;
    }
  }
  if (lower === "self" || lower === "static" || (declaringClass !== null && lower === declaringClass.replace(/^\\/, "").toLowerCase())) {
    return double;
  }
  const target = resolveTarget(name);
  if (target === null) {
    throw unresolvable(name, label, method);
  }
  const cases: unknown = target.ctor === null ? null : (target.ctor as unknown as { cases?: unknown }).cases;
  if (typeof cases === "function") {
    const all: unknown = (cases as () => unknown).call(target.ctor);
    return Array.isArray(all) && all.length > 0 ? (all[0] as unknown) : null;
  }
  if (depth >= MAX_FABRICATION_DEPTH) {
    if (target.isInstance(double)) {
      return double;
    }
    throw limitExceeded(label, method, name);
  }
  return Double.fabricate(target, depth + 1);
}

export class SafeDefaultResolver {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\SafeDefaultResolver";

  static resolveForMethod(state: DoubleState, method: string, double: object): unknown {
    const declaringTarget = state.declaringCandidate(method);
    const declaringClass = declaringTarget === null ? null : declaringTarget.declaringClassName(method);
    const signature = declaringClass === null ? null : signatureOf(declaringClass, method);
    if (signature === null || signature.returns === null || signature.nullable) {
      return null;
    }
    const members = parse(signature.returns);
    if (members.some((member) => member.kind === "named" && member.name.toLowerCase() === "null")) {
      return null;
    }
    const first = members[0]!;
    const depth = state.fabricationDepth();
    return first.kind === "intersection"
      ? resolveIntersection(first.names, double, depth, state.label(), method)
      : resolveNamed(first.name, double, depth, declaringClass, state.label(), method);
  }
}
