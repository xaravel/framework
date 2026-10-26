// The type a Spec reads as (DIV-3.2, DIV-3.4), shared by `ReflectionParameter.getType()` and `getReturnType()`.
// Internal: the package entries do not export it.
import { isClassSpec, specOf } from "../metadata/specs";
import { fqcn } from "../registry/registry";
import { ReflectionIntersectionType } from "./ReflectionIntersectionType";
import { ReflectionNamedType } from "./ReflectionNamedType";
import { ReflectionUnionType } from "./ReflectionUnionType";

/** A type reflection gives. */
export type ReflectionTypeValue = ReflectionNamedType | ReflectionUnionType | ReflectionIntersectionType;

/** The builtin a constructor Spec stands for, else null. */
function builtinName(spec: unknown): string | null {
  return spec === String ? "string" : spec === Number ? "float" : spec === Boolean ? "bool" : null;
}

/** The named type of a single (non-union, non-intersection) Spec; `where` begins the `TypeError` for anything else. */
function namedType(spec: unknown, where: string): ReflectionNamedType {
  const builtin = builtinName(spec);
  if (builtin !== null) {
    return new ReflectionNamedType(builtin, true);
  }
  const kind = specOf(spec)?.kind ?? null;
  if (kind === "primitive") {
    return new ReflectionNamedType("mixed", true);
  }
  if (kind === "self" || kind === "parent" || kind === "static") {
    return new ReflectionNamedType(kind, false);
  }
  if (kind === null && isClassSpec(spec)) {
    return new ReflectionNamedType(fqcn(spec as object), false, spec as object);
  }
  throw new TypeError(`${where} is not a class, a token, String, Number, Boolean or a Spec value (DIV-3.2)`);
}

/**
 * The type `spec` reads as: a `ReflectionUnionType` for `oneOf(...)` (an `allOf(...)` member a
 * `ReflectionIntersectionType`), a `ReflectionIntersectionType` for `allOf(...)`, else a `ReflectionNamedType`.
 * Throws `TypeError`, beginning with `where`, for a value that is no Spec. Internal.
 */
export function typeOfSpec(spec: unknown, where: string): ReflectionTypeValue {
  const info = specOf(spec);
  if (info?.kind === "oneOf") {
    return new ReflectionUnionType(info.types.map((member) => (specOf(member)?.kind === "allOf" ? intersectionOf(member, where) : namedType(member, where))));
  }
  if (info?.kind === "allOf") {
    return intersectionOf(spec, where);
  }
  return namedType(spec, where);
}

function intersectionOf(spec: unknown, where: string): ReflectionIntersectionType {
  return new ReflectionIntersectionType(specOf(spec)!.types.map((member) => namedType(member, where)));
}
