// The package-internal read of a Type's state (DIV-12.2). Upstream's Serializer reads `get_object_vars($type)` from
// inside the type's scope, so it sees every protected property under its declared name, in PHP's declaration order:
// the parent's properties first (`required, title, description, default, enum, nullable`), then the subclass's. In the
// port a method keeps each name that Upstream shares between a method and a property (`title()`, `enum()`,
// `required()`, …), so the state lives under non-colliding names, and each Type class answers `[OBJECT_VARS]()` with
// Upstream's names and order. The symbol is not exported from the package index.

/** The key of a Type's `get_object_vars` accessor. Package-internal. */
export const OBJECT_VARS: unique symbol = Symbol("xaravel.json-schema.objectVars");

/** A value with the `get_object_vars` accessor: every Type. */
export interface HasObjectVars {
  [OBJECT_VARS](): Record<string, unknown>;
}

/**
 * PHP's `get_object_vars($type)`, called in the type's scope: its properties under Upstream's names, in PHP's
 * declaration order, as a by-value copy (a PHP array is copied; a Type inside it is shared by handle).
 */
export function objectVars(type: HasObjectVars): Record<string, unknown> {
  return type[OBJECT_VARS]();
}
