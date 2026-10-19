// Story 6.2 fixture: fails `xaravel/no-ported-bun-expect` only, under a
// `tests/ported/` directory; clean under `tests/xaravel/`.
import { expect as e } from "bun:test";

export function check(value: unknown): void {
  e(value).toBe(1);
}
