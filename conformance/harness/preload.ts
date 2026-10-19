// The harness preload (Stories 5.3 and 5.4, AD-15, ESC-4.2-1 items 1 and 4,
// ESC-4.8-1 item 1, ESC-5.3-4).
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
//        `{"late":{"id":<id>,"kind":<kind>}}` the same way;
//   3. installs `Symbol.for('xaravel.api.signature')`, the API signature
//      lookup (./signatures.ts), non-writable and non-enumerable but
//      configurable, so a test that saves and restores the descriptor (Mockery's
//      `double-scenarios.ts`) still works. It reads the directory named by
//      `XARAVEL_API_SURFACE` (the harness sets `<root>/conformance/api-surface`),
//      by default this file's sibling `../api-surface`;
//   4. when `XARAVEL_VARIANT` and `XARAVEL_INVENTORY` are both non-empty (the
//      harness sets both on a Ported Test Variant run only, never on the
//      Xaravel run), installs `Symbol.for('xaravel.harness.member')`,
//      non-writable and non-configurable: `(id) => boolean`, whether the full
//      Test ID belongs to that Variant by the Inventory in the directory
//      `XARAVEL_INVENTORY` names (./membership.ts; it reads the Inventory on
//      its first call). `portedTest` declares with bun only the rows it admits
//      (ESC-5.3-4). Without it, every row is declared.
//
// Without `XARAVEL_HARNESS_OUT` both functions still exist and write nothing.
// The lines are tool data, not framework values, so they are written with
// JSON.stringify (AD-23 covers framework values).
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { hardenIntrinsics } from "./intrinsics";
import { membership } from "./membership";
import { signatureLookup } from "./signatures";

// Captured at load, before any test can reassign a global.
const stringify = JSON.stringify;
const freeze = Object.freeze;
const defineProperty = Object.defineProperty;
const append = appendFileSync;

const REPORT = Symbol.for("xaravel.harness.report");
const LATE = Symbol.for("xaravel.harness.late");
const SIGNATURE = Symbol.for("xaravel.api.signature");
const MEMBER = Symbol.for("xaravel.harness.member");

hardenIntrinsics();

const out = process.env["XARAVEL_HARNESS_OUT"];

function write(record: Readonly<Record<string, unknown>>): void {
  if (out !== undefined && out !== "") {
    append(out, `${stringify(record)}\n`);
  }
}

function install(key: symbol, value: (arg: never) => unknown): void {
  defineProperty(globalThis, key, { value: freeze(value), writable: false, enumerable: false, configurable: false });
}

install(REPORT, (report: unknown): void => {
  write({ report });
});

install(LATE, (late: unknown): void => {
  const value = (typeof late === "object" && late !== null ? late : {}) as { id?: unknown; kind?: unknown };
  write({ late: { id: value.id ?? null, kind: value.kind ?? null } });
});

const surface = process.env["XARAVEL_API_SURFACE"];
defineProperty(globalThis, SIGNATURE, {
  value: freeze(signatureLookup(surface !== undefined && surface !== "" ? surface : join(import.meta.dir, "..", "api-surface"))),
  writable: false,
  enumerable: false,
  configurable: true,
});

const variant = process.env["XARAVEL_VARIANT"];
const inventory = process.env["XARAVEL_INVENTORY"];
if (variant !== undefined && variant !== "" && inventory !== undefined && inventory !== "") {
  install(MEMBER, membership(inventory, variant));
}
