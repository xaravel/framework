// Epic 10 retro item 10 fixture: the near-misses of `xaravel/no-token-string-coercion` done right; lints clean at
// every placement (AD-9.8).
import { fqcn } from "./support";
// @ts-expect-error TS2307: the fixtures run without the framework packages; the rule reads only the specifier.
import { Arrayable, CLASS_FQCN, contract } from "@xaravel/contracts";
// @ts-expect-error TS2307: as above.
import { canonicalToken } from "@xaravel/contracts/aliases";
// @ts-expect-error TS2307: as above.
import * as support from "@xaravel/contracts/support";

const Local = contract("App\\Contracts\\Local");

/** A tagged template reads its substitutions as values, never as strings. */
function tag(strings: TemplateStringsArray, ...values: unknown[]): string {
  return `${strings.length}:${values.length}`;
}

/** A token named with fqcn(), a camelCase import, a non-token constant, a tagged template and a camelCase namespace member. */
export function messages(): string[] {
  return [`${fqcn(Arrayable)}`, String(fqcn(support.Arrayable)), "x" + fqcn(Local), `${String(canonicalToken)}`, `${typeof CLASS_FQCN}`, tag`${Arrayable}`, `${support.arrayable}`];
}
