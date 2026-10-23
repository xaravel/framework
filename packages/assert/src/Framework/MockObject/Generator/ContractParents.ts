// The parents walk of a contract token (ESC-10.1-6), shared by PHPUnit's Generator here and by @xaravel/mockery's
// DoubleTarget, so both test doubles of a child contract carry the same brands (Epic 4 lesson: one implementation).
//
// A token's parents are the contracts at `token[Symbol.for('xaravel.contract.parents')]` (each a token object or a
// bare symbol; absent or `null` is none), and their parents in turn, walked depth-first, each contract once,
// cycle-safe. A bare symbol is its own brand; a token object's brand is `Symbol.for(<its name>)`, the name read by
// the caller's own target-name rule.

const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");

function isContractToken(value: unknown): value is object {
  return typeof value === "object" && value !== null && typeof (value as { [Symbol.hasInstance]?: unknown })[Symbol.hasInstance] === "function";
}

/**
 * The brands of the contracts `token` extends, `ownBrand` excluded (a cycle back to `token` adds nothing), in walk
 * order. `nameOf` names a token object as the calling package names a target. Throws a TypeError for a parents value
 * that is not an iterable of contract tokens.
 */
export function contractParentBrands(token: object, ownBrand: symbol, nameOf: (token: object) => string): symbol[] {
  const brands: symbol[] = [];
  const visited = new Set<unknown>([token, ownBrand]);
  const walk = (contract: object, name: string): void => {
    const parents: unknown = (contract as Record<symbol, unknown>)[CONTRACT_PARENTS];
    if (parents === undefined || parents === null) {
      return;
    }
    if (typeof (parents as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
      throw new TypeError(`${name}: [Symbol.for('xaravel.contract.parents')] must be an iterable of contract tokens`);
    }
    for (const parent of parents as Iterable<unknown>) {
      if (typeof parent !== "symbol" && !isContractToken(parent)) {
        throw new TypeError(`${name}: [Symbol.for('xaravel.contract.parents')] must hold contract tokens, got ${parent === null ? "null" : typeof parent}`);
      }
      if (visited.has(parent)) {
        continue;
      }
      visited.add(parent);
      const parentName = typeof parent === "symbol" ? null : nameOf(parent);
      const brand = parentName === null ? (parent as symbol) : Symbol.for(parentName);
      if (brand !== ownBrand && !brands.includes(brand)) {
        brands.push(brand);
      }
      if (parentName !== null) {
        walk(parent as object, parentName);
      }
    }
  };
  walk(token, nameOf(token));
  return brands;
}
