// Xaravel Test for Story 16.1. XT-json-schema-1: a schema built with the fluent API serializes to the bytes Upstream
// gives for the same schema. `serializer.probe.php` loads Upstream's illuminate/json-schema from
// `conformance/upstream/framework/src` with the host's PHP 8.5.11 and prints each case as
// `<label>\t<json_encode((string) $schema)>`; `serializer.probe.txt` is its output (`php -d error_reporting=0
// serializer.probe.php > serializer.probe.txt`). Each case below builds the same schema with @xaravel/json-schema, in
// the same order of calls, and its `toString()` (Upstream's `json_encode($this->toArray(), JSON_PRETTY_PRINT)`, through
// the runtime's `jsonEncode`) is compared with the record, byte for byte. Not recorded, as it has no PHP counterpart:
// the package's dependency edges (AD-2.1, AD-2.2) and that every builder and serializer call returns synchronously
// (AD-6.2).
import { readdirSync, readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import { float, JSON_PRETTY_PRINT, jsonDecode, jsonEncode, PhpArray, registerClass } from "@xaravel/runtime";
import { JsonSchema, JsonSchemaTypeFactory, Serializer, type Type } from "../../src";

/** The probe's `Status`: a string-backed AD-26 enum. */
class Status {
  static readonly backingType = "string";
  static readonly Draft: Status = Object.freeze(new Status("Draft", "draft"));
  static readonly Published: Status = Object.freeze(new Status("Published", "published"));

  constructor(
    readonly name: string,
    readonly value: string,
  ) {}

  static cases(): Status[] {
    return [Status.Draft, Status.Published];
  }
}

registerClass("XaravelFixture\\JsonSchema\\Status", Status);

/** The probe's `Level`: an int-backed AD-26 enum. */
class Level {
  static readonly backingType = "int";
  static readonly Low: Level = Object.freeze(new Level("Low", 1));
  static readonly High: Level = Object.freeze(new Level("High", 3));

  constructor(
    readonly name: string,
    readonly value: number,
  ) {}

  static cases(): Level[] {
    return [Level.Low, Level.High];
  }
}

registerClass("XaravelFixture\\JsonSchema\\Level", Level);

/** The probe's cases, in its order. */
const CASES: readonly (readonly [string, () => Type])[] = [
  ["string-all", () => JsonSchema.string().title("Name").description("Full name").min(1).max(80).pattern("^[A-Za-z /]+$").format("email").default("a/b").enum(["a/b", "é"]).nullable()],
  ["integer-all", () => JsonSchema.integer().min(-5).max(120).multipleOf(5).default(10).enum([0, 5, 10]).title("Age")],
  ["number-all", () => JsonSchema.number().min(float(0)).max(10.5).multipleOf(0.25).default(float(1)).enum([1, 2.5, float(3)])],
  ["boolean-all", () => JsonSchema.boolean().default(false).enum([true, false]).description("Flag").nullable()],
  ["array-all", () => JsonSchema.array().items(JsonSchema.string().max(3)).min(1).max(5).unique().default(["a", "b"]).title("Tags")],
  ["array-unset-unique", () => JsonSchema.array().unique().unique(false).enum([[], ["x"]])],
  ["object-nested", () => JsonSchema.object({
    id: JsonSchema.integer().required(),
    profile: JsonSchema.object({
      name: JsonSchema.string().required(),
      tags: JsonSchema.array().items(JsonSchema.string()),
    }).withoutAdditionalProperties().required(),
    meta: JsonSchema.object().default({ a: 1, b: [1, 2] }),
  }).title("User").description("A user")],
  ["object-numeric-keys", () => JsonSchema.object(new PhpArray<string, Type>([
    ["10", JsonSchema.string().required()],
    ["2", JsonSchema.string()],
    ["x", JsonSchema.boolean().required()],
  ]))],
  ["object-closure", () => JsonSchema.object((schema: JsonSchemaTypeFactory) => ({
    a: schema.string().required().required(false),
    b: schema.number().nullable().nullable(false),
  }))],
  ["object-empty", () => JsonSchema.object([]).withoutAdditionalProperties().enum([{ a: 1 }, []])],
  ["union-null", () => JsonSchema.union(["number", "null", "string", "number"]).title("Value").nullable()],
  ["union-plain", () => JsonSchema.union(["integer", "boolean"]).enum([1, true]).description("Mixed")],
  ["anyof-nullable", () => JsonSchema.anyOf([
    JsonSchema.string().min(2),
    JsonSchema.object({ k: JsonSchema.integer().required() }),
  ]).title("Either").nullable().required()],
  ["anyof-closure", () => JsonSchema.anyOf((schema: JsonSchemaTypeFactory) => [schema.boolean(), schema.array()])],
  ["enum-string-backed", () => JsonSchema.string().enum(Status)],
  ["enum-int-backed", () => JsonSchema.integer().enum(Level)],
  ["unicode-and-slashes", () => JsonSchema.string().description("Line\nTab\t\"quote\" \\ / ünï 😀")],
];

/** Each label's recorded `json_encode((string) $schema)`, in the probe's order. */
const evidence: [string, string][] = readFileSync(`${import.meta.dir}/serializer.probe.txt`, "utf8").trim().split("\n").map((line) => {
  const [label, value] = line.split("\t") as [string, string];
  return [label, value];
});

/** `value` as the probe records it. */
function json(value: unknown): string {
  const encoded = jsonEncode(value);
  if (encoded === false) {
    throw new globalThis.Error("jsonEncode failed");
  }
  return encoded;
}

/** Whether `value` is a Promise or another thenable. */
function isThenable(value: unknown): boolean {
  return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as { then?: unknown }).then === "function";
}

/** Every import specifier of every `.ts` file under the package's `src`, with its file. */
function sourceImports(): [string, string][] {
  const root = `${import.meta.dir}/../../src`;
  const found: [string, string][] = [];
  for (const file of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".ts")) {
      continue;
    }
    const text = readFileSync(`${root}/${file}`, "utf8");
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
      found.push([file, match[1] as string]);
    }
  }
  return found;
}

/** `type`'s serialized bytes, as the probe records them. */
function bytes(type: Type): string {
  return json(type.toString());
}

xaravelTest(
  "XT-json-schema-1",
  "a schema built with JsonSchema's fluent API (every Type, every modifier, nested objects, integer-like property names, closures, unions with null, nullable anyOf, BackedEnum classes and their registered FQCN strings, escaped and non-ASCII strings) serializes through jsonEncode to the exact bytes Upstream's json_encode gives for the same schema, and an array given to or returned by a Type is a PHP by-value copy; the package depends only on @xaravel/contracts and @xaravel/runtime, in its manifest and in every src import, mirroring illuminate/json-schema's require (AD-2.1, AD-2.2); and every builder, toArray, toString and Serializer.serialize call returns synchronously, never a Promise or thenable (AD-6.2)",
  async () => {
    Assert.assertSame(evidence.map(([label]) => label), CASES.map(([label]) => label));
    for (const [index, [label, build]] of CASES.entries()) {
      const schema = build();
      Assert.assertSame((evidence[index] as [string, string])[1], json(schema.toString()), label);
      Assert.assertSame(schema.toString(), String(schema), `${label}: String(schema)`);
      Assert.assertSame(json(schema.toString()), json(jsonEncode(Serializer.serialize(schema), JSON_PRETTY_PRINT)), `${label}: Serializer.serialize`);
      Assert.assertFalse(isThenable(schema.toArray()), `${label}: toArray is sync`);
      Assert.assertFalse(isThenable(schema.toString()), `${label}: toString is sync`);
      Assert.assertFalse(isThenable(Serializer.serialize(schema)), `${label}: Serializer.serialize is sync`);
    }

    // A BackedEnum's registered FQCN string resolves through the Class Registry as its class does.
    const recorded = new Map(evidence);
    Assert.assertSame(recorded.get("enum-string-backed"), bytes(JsonSchema.string().enum("XaravelFixture\\JsonSchema\\Status")), "enum(<FQCN string>), string-backed");
    Assert.assertSame(recorded.get("enum-int-backed"), bytes(JsonSchema.integer().enum("XaravelFixture\\JsonSchema\\Level")), "enum(<FQCN string>), int-backed");

    // AD-6.2: each builder, through JsonSchema's static delegators and through the factory, returns synchronously.
    const factory = new JsonSchemaTypeFactory();
    const built: [string, unknown][] = [
      ["JsonSchema.object", JsonSchema.object({ a: JsonSchema.string() })],
      ["JsonSchema.anyOf", JsonSchema.anyOf([JsonSchema.string()])],
      ["JsonSchema.integer", JsonSchema.integer()],
      ["JsonSchema.number", JsonSchema.number()],
      ["JsonSchema.string", JsonSchema.string()],
      ["JsonSchema.boolean", JsonSchema.boolean()],
      ["JsonSchema.array", JsonSchema.array()],
      ["JsonSchema.union", JsonSchema.union(["string"])],
      ["factory.object", factory.object({ a: factory.string() })],
      ["factory.anyOf", factory.anyOf([factory.string()])],
      ["factory.integer", factory.integer()],
      ["factory.number", factory.number()],
      ["factory.string", factory.string()],
      ["factory.boolean", factory.boolean()],
      ["factory.array", factory.array()],
      ["factory.union", factory.union(["string"])],
    ];
    for (const [label, type] of built) {
      Assert.assertFalse(isThenable(type), `${label} is sync`);
      Assert.assertFalse(isThenable((type as Type).toString()), `${label}: toString is sync`);
      Assert.assertFalse(isThenable(Serializer.serialize(type as Type)), `${label}: Serializer.serialize is sync`);
    }

    // PHP passes and returns arrays by value: a later change to the caller's array, or to a returned one, changes no Type.
    const properties: Record<string, Type> = { a: JsonSchema.string() };
    const object = JsonSchema.object(properties);
    const objectBytes = bytes(object);
    properties["b"] = JsonSchema.integer();
    Assert.assertSame(objectBytes, bytes(object), "object(properties) copies the array");

    const objectDefault: Record<string, unknown[]> = { a: [1] };
    const withObjectDefault = JsonSchema.object().default(objectDefault);
    const objectDefaultBytes = bytes(withObjectDefault);
    (objectDefault["a"] as unknown[]).push(2);
    objectDefault["b"] = [];
    Assert.assertSame(objectDefaultBytes, bytes(withObjectDefault), "ObjectType::default copies the array");

    const arrayDefault: unknown[] = ["a", ["b"]];
    const withArrayDefault = JsonSchema.array().default(arrayDefault);
    const arrayDefaultBytes = bytes(withArrayDefault);
    (arrayDefault[1] as unknown[]).push("c");
    arrayDefault.push("d");
    Assert.assertSame(arrayDefaultBytes, bytes(withArrayDefault), "ArrayType::default copies the array");

    const values: unknown[][] = [["a"]];
    const withEnum = JsonSchema.array().enum(values);
    const enumBytes = bytes(withEnum);
    (values[0] as unknown[]).push("b");
    values.push(["c"]);
    Assert.assertSame(enumBytes, bytes(withEnum), "enum(values) copies the array");

    const anyOf = JsonSchema.anyOf([JsonSchema.string()]);
    const anyOfBytes = bytes(anyOf);
    anyOf.schemas().push(JsonSchema.integer());
    Assert.assertSame(anyOfBytes, bytes(anyOf), "schemas() returns a copy");

    const union = JsonSchema.union(["string"]);
    const unionBytes = bytes(union);
    union.types().push("number");
    Assert.assertSame(unionBytes, bytes(union), "types() returns a copy");

    // AD-2.1, AD-2.2: the manifest and every src import name only @xaravel/contracts and @xaravel/runtime.
    const manifest = jsonDecode(readFileSync(`${import.meta.dir}/../../package.json`, "utf8"), true) as Record<string, unknown>;
    Assert.assertSame({ "@xaravel/contracts": "workspace:*", "@xaravel/runtime": "workspace:*" }, manifest["dependencies"]);
    for (const key of ["peerDependencies", "optionalDependencies"]) {
      const edges = manifest[key] ?? null;
      Assert.assertTrue(edges === null || (typeof edges === "object" && Object.keys(edges).length === 0), `package.json ${key} is absent or empty`);
    }
    const imports = sourceImports();
    Assert.assertTrue(imports.length > 0, "src has imports");
    for (const [file, specifier] of imports) {
      Assert.assertTrue(
        specifier.startsWith("./") || specifier.startsWith("../") || /^@xaravel\/(?:contracts|runtime)(?:\/.+)?$/.test(specifier),
        `src/${file} imports ${specifier}`,
      );
    }
  },
);
