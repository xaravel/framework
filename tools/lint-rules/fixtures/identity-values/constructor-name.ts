// Story 6.2 fixture: fails `xaravel/no-identity-constructor-name` only, at any placement.
export function identity(value: object): string {
  return value.constructor.name;
}
