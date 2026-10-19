// Story 6.2 fixture: a type-only `expect` import under `tests/ported/`; lints clean.
import type { expect } from "bun:test";

export type Expect = typeof expect;
