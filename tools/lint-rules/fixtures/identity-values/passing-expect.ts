// Story 6.2 fixture: `expect` from `bun:test` outside `tests/ported/`; lints clean.
import { expect } from "bun:test";

export function check(value: unknown): void {
  expect(value).toBe(1);
}
