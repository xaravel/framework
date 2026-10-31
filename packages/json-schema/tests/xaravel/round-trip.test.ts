// Xaravel Test for Story 16.2. XT-json-schema-2: every schema Story 16.1's tests build survives
// serialize → `JsonSchema::fromArray` → serialize unchanged, as Upstream's own Deserializer gives it.
//
// The schemas are not copied by hand. The test reads Story 16.1's manifest (`stories/16.1.md`): its `test_ids` name the
// Ported Test files (`tests/ported/framework/tests/JsonSchema/<Class>.test.ts`, the `TypeTest` datasets among them) and
// its `xaravel_test_ids` the Xaravel Test files (XT-json-schema-1's `serializer.test.ts` and its cases). It runs those
// files in a child `bun test` with the capture preload `round-trip.capture.ts`, which records the round trip of every
// schema the tests serialize, as they build it (see that file). The child must pass, as the files pass on their own.
//
// `round-trip.probe.php` runs Upstream's illuminate/json-schema at the Pin over the same serialized schemas with the
// host's PHP 8.5.11, and `round-trip.probe.txt` is its record (`<first>\t<second>`; how to regenerate it is in
// `round-trip.probe.php`'s header). The captured schemas and the record's must be the same set, both ways. For each
// schema the test checks that the port's second serialization is Upstream's, byte for byte, and, where Upstream's own
// round trip is the identity, that the port's is too: `Serializer.serialize(fromArray(serialize(s)))` is `===`
// (`identical`) to `serialize(s)`. A schema whose round trip Upstream itself changes is never dropped: it must be in
// `NOT_ROUND_TRIPPED_BY_UPSTREAM`, which must be exactly that set and is named in decisions/ESC-16.2-1.md (the
// Maintainer's ruling, option 1: no divergence), and the test still checks it against Upstream's bytes. `fromArray`
// and `Deserializer.deserialize` return synchronously, never a Promise or thenable (AD-6.2).
//
// It also checks Deserializer cases that no Upstream test reaches, against Upstream's own results on PHP 8.5.11
// (`round-trip.errors.probe.php`, recorded in `round-trip.errors.probe.txt`): a `$ref` to a non-array target, a schema
// expanding past `MAX_NODES`, JSON-pointer unescaping (`~1`, `~0`, `%20`), a list-index segment, one `$ref` used twice
// (the cache), numeric-string bounds and an integral-float bound on an integer, each by its exception class and message
// or its exact `toString()` bytes plus a `JSON_PRESERVE_ZERO_FRACTION` encoding; and that `fromArray` copies a
// `default` by value, as PHP passes arrays.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { float, fqcn, JSON_PRESERVE_ZERO_FRACTION, jsonEncode } from "@xaravel/runtime";
import { Deserializer, JsonSchema } from "../../src";
import type { RoundTripRecord } from "./round-trip.capture";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const REPO = resolve(PACKAGE_DIR, "..", "..");
const PORTED = join(PACKAGE_DIR, "tests", "ported", "framework", "tests", "JsonSchema");
const RULING = join(REPO, "decisions", "ESC-16.2-1.md");

/**
 * The serialized schemas whose round trip Upstream's own Deserializer changes (round-trip.probe.txt): the set
 * ESC-16.2-1's ruling (decisions/ESC-16.2-1.md, option 1: no divergence) accepts on Upstream's bytes, each named in it.
 */
const NOT_ROUND_TRIPPED_BY_UPSTREAM: readonly string[] = ['{"type":["string"]}'];

/** The parent's environment without the harness's own variables, `BUN_OPTIONS` and `NODE_OPTIONS`. */
function childEnv(out: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "BUN_OPTIONS" && key !== "NODE_OPTIONS" && !key.startsWith("XARAVEL_")) {
      env[key] = value;
    }
  }
  env["JSON_SCHEMA_ROUND_TRIP_OUT"] = out;
  return env;
}

/** Story 16.1's test files, from its manifest: one Ported Test file per Upstream test class, then its Xaravel Test files. */
function storyFiles(): string[] {
  const manifest = readFileSync(join(REPO, "stories", "16.1.md"), "utf8");
  const classes = [...new Set([...manifest.matchAll(/"Illuminate\\\\Tests\\\\JsonSchema\\\\(\w+)::/g)].map((match) => match[1]!))].sort();
  const files = classes.map((name) => join(PORTED, `${name}.test.ts`));
  const xts = [...manifest.matchAll(/^\s+- (XT-json-schema-\d+)$/gm)].map((match) => match[1]!);
  const xaravelDir = join(PACKAGE_DIR, "tests", "xaravel");
  for (const id of xts) {
    const declaring = readdirSync(xaravelDir).filter((file) => file.endsWith(".test.ts") && readFileSync(join(xaravelDir, file), "utf8").includes(`"${id}"`));
    Assert.assertCount(1, declaring, `one file declares ${id}`);
    files.push(join(xaravelDir, declaring[0]!));
  }
  return files;
}

/**
 * A schema whose `$ref` chain fans out: `d<i>` is an object with two properties that both reference `d<i+1>`, 15
 * levels deep, so building `d0` would expand 2^16 - 1 fragments, past `MAX_NODES`, with no circular `$ref`.
 */
function fanOutSchema(): Record<string, unknown> {
  const defs: Record<string, unknown> = {};
  for (let i = 0; i < 15; i++) {
    defs[`d${i}`] = { type: "object", properties: { a: { $ref: `#/$defs/d${i + 1}` }, b: { $ref: `#/$defs/d${i + 1}` } } };
  }
  defs["d15"] = { type: "string" };
  return { $ref: "#/$defs/d0", $defs: defs };
}

/** The raw schemas of `round-trip.errors.probe.php`, in its order, built as it builds them. */
const DESERIALIZER_CASES: readonly (readonly [string, () => Record<string, unknown>])[] = [
  ["ref-non-schema-target", () => ({ $ref: "#/$defs/x", $defs: { x: "str" } })],
  ["max-nodes-fan-out", fanOutSchema],
  ["ref-escaped-slash", () => ({ $ref: "#/$defs/a~1b", $defs: { "a/b": { type: "string", minLength: 1 } } })],
  ["ref-escaped-tilde", () => ({ $ref: "#/$defs/a~0b", $defs: { "a~b": { type: "integer", minimum: 2 } } })],
  ["ref-percent-encoded", () => ({ $ref: "#/$defs/a%20b", $defs: { "a b": { type: "boolean" } } })],
  ["ref-list-index", () => ({ $ref: "#/$defs/list/0", $defs: { list: [{ type: "number", maximum: 3 }] } })],
  ["ref-used-twice", () => ({
    type: "object",
    properties: {
      x: { $ref: "#/$defs/n", description: "X" },
      y: { $ref: "#/$defs/n" },
    },
    $defs: { n: { type: "string", description: "N" } },
  })],
  ["number-numeric-string-bound", () => ({ type: "number", minimum: "7.0" })],
  ["integer-string-and-float-bounds", () => ({ type: "integer", minimum: "5", maximum: float(7) })],
];

/** `value` encoded by `jsonEncode` with `flags`; throws when it cannot be encoded. */
function json(value: unknown, flags: number = 0): string {
  const encoded = jsonEncode(value, flags);
  if (encoded === false) {
    throw new globalThis.Error("jsonEncode failed");
  }
  return encoded;
}

/** A case's result as the errors probe records it: `[json_encode($value), <floats>]`. */
function deserializerResult(build: () => Record<string, unknown>): [string, string] {
  try {
    const type = JsonSchema.fromArray(build());
    return [json(type.toString()), json(type.toArray(), JSON_PRESERVE_ZERO_FRACTION)];
  } catch (thrown) {
    if (!(thrown instanceof globalThis.Error)) {
      throw thrown;
    }
    return [json(`!${fqcn(thrown)}: ${thrown.message}`), ""];
  }
}

/** Whether `value` is a Promise or another thenable. */
function isThenable(value: unknown): boolean {
  return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as { then?: unknown }).then === "function";
}

xaravelTest(
  "XT-json-schema-2",
  "every schema Story 16.1's tests build or serialize (the TypeTest dataset schemas, every fluent schema in its other Ported Test files and XT-json-schema-1's cases, replayed by running those files, not copied) round-trips through Serializer.serialize, JsonSchema.fromArray and Serializer.serialize again to Upstream's own result byte for byte, which is identical (===) to the first serialization wherever Upstream's round trip is the identity, the captured set equals the probe's both ways, and the schemas Upstream itself does not round-trip are exactly the test's list, each named in ESC-16.2-1's ruling, which accepts them on Upstream's bytes (no divergence); Deserializer.deserialize agrees with fromArray, and both return synchronously, never a Promise or thenable (AD-6.2); it also compares with Upstream's recorded results cases Upstream's tests do not reach: a $ref to a non-array target and a schema expanding past MAX_NODES (Upstream's InvalidArgumentException class and message), JSON-pointer unescaping (~1, ~0, %20), a list-index segment, one $ref used twice, numeric-string bounds and an integral-float integer bound (exact toString bytes and float encoding); and fromArray copies an array or object default by value",
  () => {
    const files = storyFiles();
    Assert.assertTrue(files.some((file) => file.endsWith("/TypeTest.test.ts")), "16.1's files include TypeTest");
    Assert.assertTrue(files.some((file) => file.endsWith("/serializer.test.ts")), "16.1's files include XT-json-schema-1's");
    for (const file of files) {
      Assert.assertTrue(existsSync(file), `${file} exists`);
    }

    // Replay 16.1's tests with the capture preload.
    const dir = mkdtempSync(join(tmpdir(), "xaravel-json-schema-round-trip-"));
    const out = join(dir, "records.jsonl");
    let records: RoundTripRecord[];
    try {
      const child = Bun.spawnSync(
        [process.execPath, "--no-env-file", "test", "--preload", join(import.meta.dir, "round-trip.capture.ts"), ...files],
        { cwd: REPO, env: childEnv(out), timeout: 120_000, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
      );
      Assert.assertSame(0, child.exitCode, `16.1's tests pass under the capture preload\n${child.stdout.toString()}${child.stderr.toString()}`);
      records = existsSync(out)
        ? readFileSync(out, "utf8").trim().split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as RoundTripRecord)
        : [];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    Assert.assertNotEmpty(records, "16.1's tests serialize schemas");
    Assert.assertTrue(records.some((record) => record.file.endsWith("/TypeTest.test.ts")), "the TypeTest schemas are replayed");
    Assert.assertTrue(records.some((record) => record.file.endsWith("/serializer.test.ts")), "XT-json-schema-1's schemas are replayed");

    // Upstream's round trip of each schema, from the probe.
    const upstream = new Map<string, string>();
    for (const line of readFileSync(join(import.meta.dir, "round-trip.probe.txt"), "utf8").split("\n")) {
      if (line === "") {
        continue;
      }
      const tab = line.indexOf("\t");
      upstream.set(line.slice(0, tab), line.slice(tab + 1));
    }

    const captured = new Set(records.map((record) => record.first));
    const missing = [...captured].filter((first) => !upstream.has(first));
    Assert.assertSame("", missing.join("\n"), `every captured schema is in round-trip.probe.txt (regenerate it as round-trip.probe.php's header says); missing: ${missing.join(", ")}`);
    const stale = [...upstream.keys()].filter((first) => !captured.has(first));
    Assert.assertSame("", stale.join("\n"), `every round-trip.probe.txt schema is captured; not captured: ${stale.join(", ")}`);

    const notRoundTripped: string[] = [];
    for (const record of records) {
      const label = `${record.file}: ${record.first}`;
      Assert.assertNull(record.error, `${label}: fromArray accepts the schema`);
      Assert.assertFalse(record.thenable, `${label}: fromArray and Deserializer.deserialize are sync`);
      Assert.assertTrue(record.deserializeAgrees, `${label}: Deserializer.deserialize agrees with fromArray`);
      const expected = upstream.get(record.first) ?? null;
      Assert.assertSame(expected, record.second, `${label}: the round trip is Upstream's, byte for byte`);
      if (expected === record.first) {
        Assert.assertSame(record.first, record.second, `${label}: serialize(fromArray(serialize(s))) is serialize(s)`);
        Assert.assertTrue(record.identical, `${label}: serialize(fromArray(serialize(s))) === serialize(s)`);
      } else {
        notRoundTripped.push(record.first);
      }
    }
    // The set ESC-16.2-1's ruling (option 1: no divergence) accepts on Upstream's bytes, each named in the ruling.
    Assert.assertSame([...NOT_ROUND_TRIPPED_BY_UPSTREAM].sort(), notRoundTripped.sort(), "the schemas Upstream itself does not round-trip are exactly NOT_ROUND_TRIPPED_BY_UPSTREAM");
    Assert.assertTrue(existsSync(RULING), "decisions/ESC-16.2-1.md exists");
    const ruling = readFileSync(RULING, "utf8");
    for (const first of NOT_ROUND_TRIPPED_BY_UPSTREAM) {
      Assert.assertStringContainsString(`\`${first}\``, ruling, `ESC-16.2-1's ruling names ${first}`);
    }

    // Cases Upstream's tests do not reach, against Upstream's recorded results.
    const errorsProbe = readFileSync(join(import.meta.dir, "round-trip.errors.probe.txt"), "utf8").trim().split("\n").map((line) => line.split("\t") as [string, string, string]);
    Assert.assertSame(errorsProbe.map(([label]) => label), DESERIALIZER_CASES.map(([label]) => label), "the cases are the errors probe's, in its order");
    for (const [index, [label, build]] of DESERIALIZER_CASES.entries()) {
      const [, value, floats] = errorsProbe[index]!;
      const [actualValue, actualFloats] = deserializerResult(build);
      Assert.assertSame(value, actualValue, `${label}: Upstream's exception or toString() bytes`);
      Assert.assertSame(floats, actualFloats, `${label}: Upstream's toArray() with JSON_PRESERVE_ZERO_FRACTION`);
    }

    // fromArray copies a default by value: a later change to the caller's array changes no Type.
    const listDefault: unknown[] = ["a", ["b"]];
    const withListDefault = JsonSchema.fromArray({ type: "array", default: listDefault });
    const listBytes = withListDefault.toString();
    listDefault.push("c");
    (listDefault[1] as unknown[]).push("d");
    Assert.assertSame(listBytes, withListDefault.toString(), "fromArray copies an array default");
    const objectDefault: Record<string, unknown> = { a: [1], b: { c: 2 } };
    const withObjectDefault = JsonSchema.fromArray({ type: "object", default: objectDefault });
    const objectBytes = withObjectDefault.toString();
    (objectDefault["a"] as unknown[]).push(2);
    (objectDefault["b"] as Record<string, unknown>)["c"] = 3;
    objectDefault["d"] = true;
    Assert.assertSame(objectBytes, withObjectDefault.toString(), "fromArray copies an object default");

    // AD-6.2: fromArray and deserialize return synchronously.
    Assert.assertFalse(isThenable(JsonSchema.fromArray({ type: "string" })), "JsonSchema.fromArray is sync");
    Assert.assertFalse(isThenable(Deserializer.deserialize({ type: "object", properties: { a: { type: "integer" } } })), "Deserializer.deserialize is sync");
  },
  180_000,
);
