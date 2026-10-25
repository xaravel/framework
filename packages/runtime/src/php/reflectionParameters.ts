// The parameter list of a function or method, read from its own `inject` map (DIV-3.2, DIV-3.3). Internal: the
// package entries do not export it.
import { readInjectMetadata } from "../metadata/inject";
import type { ReflectionClass } from "./ReflectionClass";
import { ReflectionParameter } from "./ReflectionParameter";
import { RuntimeException } from "./RuntimeException";

/**
 * `fn`'s parameters, in `inject` key order, declared by `declaringClass` (null for a closure). A function with no
 * `inject` declaration throws `RuntimeException` `<subject> has no inject declaration, so its parameters cannot be
 * read; declare them with <form> (DIV-3.3)`.
 */
export function parametersOf(fn: unknown, declaringClass: ReflectionClass | null, subject: string, form: string): ReflectionParameter[] {
  const map = readInjectMetadata(fn);
  if (map === null) {
    throw new RuntimeException(`${subject} has no inject declaration, so its parameters cannot be read; declare them with ${form} (DIV-3.3)`);
  }
  return Object.keys(map).map((name) => new ReflectionParameter(name, map[name], declaringClass));
}
