// The harness preload (Story 5.3, AD-15, ESC-4.2-1 items 1 and 4).
//
// `bun run harness` passes this file to `bun test --preload`, so it runs
// before any Ported Test file loads. It imports nothing graded. In order, it:
//
//   1. hardens the intrinsics (./intrinsics.ts);
//   2. installs, non-writable and non-configurable on `globalThis`:
//      - `Symbol.for('xaravel.harness.report')`, the ESC-4.2-1 reporter, which
//        appends `{"report":<report>}` as one JSON line to the file named by
//        `XARAVEL_HARNESS_OUT`;
//      - `Symbol.for('xaravel.harness.late')`, the late-assertion hook
//        (packages/assert's AssertionCounter), which appends
//        `{"late":{"id":<id>,"kind":<kind>}}` the same way.
//
// Without `XARAVEL_HARNESS_OUT` both functions still exist and write nothing.
// The lines are tool data, not framework values, so they are written with
// JSON.stringify (AD-23 covers framework values).
import { appendFileSync } from "node:fs";
import { hardenIntrinsics } from "./intrinsics";

// Captured at load, before any test can reassign a global.
const stringify = JSON.stringify;
const freeze = Object.freeze;
const defineProperty = Object.defineProperty;
const append = appendFileSync;

const REPORT = Symbol.for("xaravel.harness.report");
const LATE = Symbol.for("xaravel.harness.late");

hardenIntrinsics();

const out = process.env["XARAVEL_HARNESS_OUT"];

function write(record: Readonly<Record<string, unknown>>): void {
  if (out !== undefined && out !== "") {
    append(out, `${stringify(record)}\n`);
  }
}

function install(key: symbol, value: (arg: unknown) => void): void {
  defineProperty(globalThis, key, { value: freeze(value), writable: false, enumerable: false, configurable: false });
}

install(REPORT, (report: unknown): void => {
  write({ report });
});

install(LATE, (late: unknown): void => {
  const value = (typeof late === "object" && late !== null ? late : {}) as { id?: unknown; kind?: unknown };
  write({ late: { id: value.id ?? null, kind: value.kind ?? null } });
});
