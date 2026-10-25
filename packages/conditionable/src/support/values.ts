// Value helpers shared by `Conditionable` and `HigherOrderWhenProxy` (Story 12.1). Internal: not exported from the
// package.
import { fqcn } from "@xaravel/runtime";

/** Whether `value` is a thenable: an object or function with a callable `then` (DIV-1.6). */
export function isThenable(value: unknown): boolean {
  return ((typeof value === "object" && value !== null) || typeof value === "function") && typeof (value as { then?: unknown }).then === "function";
}

/** The class name PHP's messages give an object: its FQCN, else `class@anonymous`. */
export function classNameOf(object: unknown): string {
  try {
    return fqcn(object as object);
  } catch {
    return "class@anonymous";
  }
}
