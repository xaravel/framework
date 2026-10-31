// The capture preload of XT-json-schema-2 (round-trip.test.ts). The test runs Story 16.1's own test files in a child
// `bun test --preload <this file>`, so every schema those tests build is replayed as they build it, not copied by
// hand. This file wraps `Serializer.serialize` before any test file loads: each outermost call (a Type's `toArray()`,
// `toString()` or a direct `Serializer.serialize`, not the nested calls the Serializer makes for children) records
// the schema's round trip, `serialize(fromArray(serialize(type)))`, and then returns a fresh `serialize(type)`, so the
// tests see exactly what they would see without it. A schema whose serialization throws (Upstream's anonymous Type)
// records nothing and the throw is the test's. It also wraps `JsonSchemaTypeFactory`'s eight builders, which
// `JsonSchema`'s static delegators call, so a schema a test builds but never serializes is recorded too: a global
// `afterEach` serializes each built Type no outermost call recorded, in its state at the end of the test, and skips
// only one whose serialization itself throws. It appends one JSON line per distinct serialized schema to the file
// `JSON_SCHEMA_ROUND_TRIP_OUT` names. The lines are tool data, so they are written with `JSON.stringify`; the
// schemas inside them are framework values, encoded with `jsonEncode` (AD-23).
import { appendFileSync } from "node:fs";
import { get_debug_type, identical, JSON_PRESERVE_ZERO_FRACTION, jsonEncode } from "@xaravel/runtime";
import { afterEach } from "bun:test";
import { Deserializer, JsonSchema, JsonSchemaTypeFactory, Serializer, type Type } from "../../src";

/** One distinct schema's round trip, as the child writes it. */
export interface RoundTripRecord {
  /** The test file (relative to the package's `tests/`) whose code serialized, or built, the schema first. */
  readonly file: string;
  /** `jsonEncode(serialize(type))`, with `JSON_PRESERVE_ZERO_FRACTION` so a float marker shows. */
  readonly first: string;
  /** `jsonEncode(serialize(fromArray(serialize(type))))`, or null when `fromArray` threw. */
  readonly second: string | null;
  /** `serialize(fromArray(first)) === first`, by PHP's `===` (`identical`). */
  readonly identical: boolean;
  /** Whether `Deserializer.deserialize(first)` gives the same serialization as `fromArray(first)`. */
  readonly deserializeAgrees: boolean;
  /** Whether `fromArray` or `Deserializer.deserialize` returned a Promise or another thenable. */
  readonly thenable: boolean;
  /** The class and message `fromArray` threw, or null. */
  readonly error: string | null;
}

const out = process.env["JSON_SCHEMA_ROUND_TRIP_OUT"] ?? "";
const original = Serializer.serialize.bind(Serializer);
const seen = new Map<string, RoundTripRecord>();
let depth = 0;
/** The Types an outermost `serialize` or the end-of-test pass has recorded. */
const captured = new WeakSet<Type>();
/** The Types the builders returned that the end-of-test pass has not looked at yet, with their test files. */
const built: [Type, string][] = [];

/** `value` as `jsonEncode` writes it, floats with their `.0`. */
function json(value: unknown): string {
  const encoded = jsonEncode(value, JSON_PRESERVE_ZERO_FRACTION);
  if (encoded === false) {
    throw new globalThis.Error("jsonEncode failed");
  }
  return encoded;
}

/** Whether `value` is a Promise or another thenable. */
function isThenable(value: unknown): boolean {
  return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as { then?: unknown }).then === "function";
}

/** The first stack frame under the package's `tests/`, as `<path>` relative to it. */
function callerFile(): string {
  const stack = new globalThis.Error().stack ?? "";
  for (const match of stack.matchAll(/\/packages\/json-schema\/tests\/([^:)\s]+\.ts)/g)) {
    if (!match[1]!.endsWith("round-trip.capture.ts")) {
      return match[1]!;
    }
  }
  return "(unknown)";
}

/**
 * Records the round trip of `type`, once per distinct serialization, attributed to `file`. Only the throw of the first
 * `serialize(type)` itself (Upstream's anonymous Type) is skipped; `fromArray` or `deserialize` throwing is recorded
 * as the record's `error`, which the test asserts is null; any other error propagates and fails the run.
 */
function record(type: Type, file: string): void {
  captured.add(type);
  let first: Record<string, unknown>;
  try {
    first = original(type);
  } catch {
    return;
  }
  const key = json(first);
  if (seen.has(key)) {
    return;
  }
  let rebuilt: Type | null = null;
  let direct: Type | null = null;
  let error: string | null = null;
  try {
    rebuilt = JsonSchema.fromArray(first);
    direct = Deserializer.deserialize(first);
  } catch (thrown) {
    error = thrown instanceof globalThis.Error ? `${get_debug_type(thrown)}: ${thrown.message}` : String(thrown);
  }
  let second: string | null = null;
  let same = false;
  let agrees = false;
  const thenable = isThenable(rebuilt) || isThenable(direct);
  if (rebuilt !== null && direct !== null && !thenable) {
    const again = original(rebuilt);
    second = json(again);
    same = identical(first, again);
    agrees = identical(again, original(direct));
  }
  const line: RoundTripRecord = { file, first: key, second, identical: same, deserializeAgrees: agrees, thenable, error };
  seen.set(key, line);
  if (out !== "") {
    appendFileSync(out, `${JSON.stringify(line)}\n`);
  }
}

/** Runs `fn` as an outermost call: the Serializer's nested calls inside it record nothing. */
function outermost(fn: () => void): void {
  depth++;
  try {
    fn();
  } finally {
    depth--;
  }
}

Serializer.serialize = function serialize(type: Type): Record<string, unknown> {
  if (depth === 0) {
    outermost(() => record(type, callerFile()));
  }
  depth++;
  try {
    return original(type);
  } finally {
    depth--;
  }
};

// Every Type a builder returns, through the factory (which JsonSchema's static delegators use), with its test file.
const BUILDERS = ["object", "array", "string", "integer", "number", "boolean", "union", "anyOf"] as const;
const prototype = JsonSchemaTypeFactory.prototype as unknown as Record<string, (...args: unknown[]) => Type>;
for (const name of BUILDERS) {
  const builder = prototype[name]!;
  prototype[name] = function (this: JsonSchemaTypeFactory, ...args: unknown[]): Type {
    const type = builder.apply(this, args);
    built.push([type, callerFile()]);
    return type;
  };
}

// After each test, each built Type no outermost `serialize` has recorded is serialized and recorded in its final state.
afterEach(() => {
  const pending = built.splice(0);
  for (const [type, file] of pending) {
    if (!captured.has(type)) {
      outermost(() => record(type, file));
    }
  }
});
