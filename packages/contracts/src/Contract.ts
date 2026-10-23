// The contract token mechanism (AD-1, AD-9, DIV-3, ESC-10.1-1). A contract is a TypeScript interface plus a
// same-named runtime token made by `contract<T, B>(fqcn, members)`:
//
//   declare const ArrayableBrand: unique symbol;
//   export interface Arrayable { readonly [Arrayable.brand]: true; toArray(): unknown }
//   export const Arrayable = contract<Arrayable, typeof ArrayableBrand>("Illuminate\\Contracts\\Support\\Arrayable", { toArray: [] });
//
// The token is a frozen, non-function object (both test doubles take every function as a class). Its `brand` is
// `Symbol.for('<FQCN>')`, the key `@xaravel/runtime`'s `hasBrand` and `jsonEncode` and the grader already read, and its
// `Symbol.toPrimitive` returns that key, so `get [Token]()` and `get [Token.brand]()` name the same property. It is not
// a class, so it is never passed to `registerClass` (ESC-10.1-3).

/** The grader's class-name key (ESC-4.3-1 item 1), the same key `@xaravel/runtime/registry` sets on a class. */
export const CLASS_FQCN: unique symbol = Symbol.for("xaravel.class.fqcn");
/** A token's method names, read by Mockery's `DoubleTarget` and PHPUnit's `Generator` (ESC-4.5-1 item 3). */
export const CONTRACT_METHODS: unique symbol = Symbol.for("xaravel.contract.methods");
/** A token's `{ <method>: [<param>, …] }` record (ESC-10.1-1 (b)). */
export const CONTRACT_PARAMETERS: unique symbol = Symbol.for("xaravel.contract.parameters");

/** A contract's runtime token: `x instanceof Token` reads the brand, and `Token.brand` is the interface's brand key. */
export type ContractToken<T extends object, B extends symbol = symbol> = {
  readonly brand: B;
  [Symbol.hasInstance](value: unknown): value is T;
  [Symbol.toPrimitive](hint: string): B;
  readonly [CLASS_FQCN]: string;
  readonly [CONTRACT_METHODS]: readonly string[];
  readonly [CONTRACT_PARAMETERS]: Readonly<Record<string, readonly string[]>>;
};

/** A PHP FQCN without a leading `\`: identifier segments joined by single `\` (the Registry's grammar). */
const FQCN_SHAPE = /^[A-Za-z_\x80-\uFFFF][A-Za-z0-9_\x80-\uFFFF]*(?:\\[A-Za-z_\x80-\uFFFF][A-Za-z0-9_\x80-\uFFFF]*)*$/;

/** `fqcn` without its leading `\`; throws a `TypeError` when it is not a PHP FQCN. */
function normaliseFqcn(fqcn: unknown): string {
  if (typeof fqcn !== "string") {
    throw new TypeError(`contract(): the FQCN must be a string, got ${fqcn === null ? "null" : typeof fqcn}`);
  }
  const name = fqcn.startsWith("\\") ? fqcn.slice(1) : fqcn;
  if (!FQCN_SHAPE.test(name)) {
    throw new TypeError(`contract(): "${fqcn}" is not a class name`);
  }
  return name;
}

/** A frozen copy of `members`' parameter lists, keyed by method name in insertion order. */
function copyMembers(name: string, members: unknown): Readonly<Record<string, readonly string[]>> {
  if (typeof members !== "object" || members === null || Array.isArray(members)) {
    throw new TypeError(`contract(): the members of ${name} must be a { <method>: [<param>, …] } record`);
  }
  const entries: [string, readonly string[]][] = [];
  for (const [method, parameters] of Object.entries(members)) {
    if (!Array.isArray(parameters) || !Array.from(parameters as unknown[]).every((parameter) => typeof parameter === "string")) {
      throw new TypeError(`contract(): the parameters of ${name}::${method}() must be a list of names`);
    }
    entries.push([method, Object.freeze([...(parameters as string[])])]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * Makes the runtime token of the contract `fqcn` (a leading `\` is dropped). `members` maps each method name to its
 * parameter names; the token keeps frozen copies. `B` is the contract's phantom `unique symbol`, the type of `brand`.
 */
export function contract<T extends object, B extends symbol = symbol>(fqcn: string, members: Readonly<Record<string, readonly string[]>> = {}): ContractToken<T, B> {
  const name = normaliseFqcn(fqcn);
  const parameters = copyMembers(name, members);
  const brand = Symbol.for(name);
  const token = {
    brand,
    [CLASS_FQCN]: name,
    [CONTRACT_METHODS]: Object.freeze(Object.keys(parameters)),
    [CONTRACT_PARAMETERS]: parameters,
    [Symbol.hasInstance](value: unknown): boolean {
      return ((typeof value === "object" && value !== null) || typeof value === "function") && (value as Record<symbol, unknown>)[brand] === true;
    },
    [Symbol.toPrimitive](): symbol {
      return brand;
    },
  };
  return Object.freeze(token) as unknown as ContractToken<T, B>;
}
