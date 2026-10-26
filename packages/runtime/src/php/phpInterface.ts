// PHP's built-in interfaces as contract tokens (ESC-14.1-2, action item epic-14-item-1-runtime-php-types). Internal.
// `phpInterface(name, members, parents, builtins)` builds the frozen token `@xaravel/contracts`' `contract()` builds
// for the same arguments, with the same own keys, in the same order and with the same descriptors (XT-contracts-22
// pins the two equal): `CONTRACT_BUILTINS` when not empty, `brand` (`Symbol.for(name)`), the FQCN key, the method
// names, their parameter lists, the parents, and the `Symbol.hasInstance` / `Symbol.toPrimitive` methods. It copies
// the shape rather than sharing it, because the runtime never imports `@xaravel/contracts` (AD-2). The token is
// recorded with `registerContractToken`, so the class lookup, `interfaceExists` and reflection resolve its PHP name.
// `instanceTest`, when given, replaces the brand test in `Symbol.hasInstance` (the `UnitEnum` and `BackedEnum` tokens,
// whose AD-26 cases carry no brand; action item epic-14-item-3-runtime-type-tests-functions); every other token reads
// the brand.
// The arguments are the runtime's own constants, so nothing is validated here.
import { registerContractToken } from "../registry/registry";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const CONTRACT_PARAMETERS = Symbol.for("xaravel.contract.parameters");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");
const CONTRACT_BUILTINS = Symbol.for("xaravel.contract.builtins");

/** A PHP built-in interface's token: `x instanceof Token` reads the brand, and `Token.brand` is the brand key. */
export type PhpInterfaceToken<T extends object, B extends symbol> = {
  readonly brand: B;
  [Symbol.hasInstance](value: unknown): value is T;
  [Symbol.toPrimitive](hint: string): B;
};

/** Builds and records the token of the PHP interface `name` (see the header). */
export function phpInterface<T extends object, B extends symbol>(
  name: string,
  members: Readonly<Record<string, readonly string[]>> = {},
  parents: readonly object[] = [],
  builtins: readonly string[] = [],
  instanceTest: ((value: unknown) => boolean) | null = null,
): PhpInterfaceToken<T, B> {
  const parameters = Object.freeze(Object.fromEntries(Object.entries(members).map(([method, list]) => [method, Object.freeze([...list])])));
  const builtinMethods = Object.freeze([...builtins]);
  const brand = Symbol.for(name);
  const token = {
    ...(builtinMethods.length > 0 ? { [CONTRACT_BUILTINS]: builtinMethods } : {}),
    brand,
    [CLASS_FQCN]: name,
    [CONTRACT_METHODS]: Object.freeze(Object.keys(parameters)),
    [CONTRACT_PARAMETERS]: parameters,
    [CONTRACT_PARENTS]: Object.freeze([...parents]),
    [Symbol.hasInstance](value: unknown): boolean {
      if (instanceTest !== null) {
        return instanceTest(value);
      }
      return ((typeof value === "object" && value !== null) || typeof value === "function") && (value as Record<symbol, unknown>)[brand] === true;
    },
    [Symbol.toPrimitive](): symbol {
      return brand;
    },
  };
  const frozen = Object.freeze(token);
  registerContractToken(frozen);
  return frozen as unknown as PhpInterfaceToken<T, B>;
}
