// PHP's `class-string` (an abstract a container binds or resolves), as Xaravel takes it: a class, a contract token or
// a string name (AD-1: abstracts are `string | token | class`, as Upstream's are strings).
import type { ContractToken } from "../Contract";

/** A class, a contract token, or a class or alias name. */
export type ClassString = string | (abstract new (...args: never[]) => unknown) | ContractToken<object>;
