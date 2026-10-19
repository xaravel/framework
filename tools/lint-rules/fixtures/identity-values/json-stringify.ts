// Story 6.2 fixture: fails `xaravel/no-framework-json-stringify` only, under a
// non-grader `packages/<p>/src/`; clean under `packages/assert/src/` or `tests/`.
export function encode(value: unknown): string {
  return JSON.stringify(value);
}
