// Oracle requests (Story 3.1, decisions/ESC-3.1-1.md, FR-6, AD-15).
//
// A request is one JSON line with exactly the keys `id`, `kind`, `input` and
// `sha256`, in that order:
//
//   {"id":"<Test ID or XT ID>","kind":"<kind>","input":{…},"sha256":"<hex>"}
//
// `sha256` is the lowercase hex SHA-256 of the UTF-8 bytes of the canonical
// JSON of `{id, kind, input}`: object keys sorted by UTF-16 code unit at every
// depth, no whitespace, `/` unescaped, non-ASCII unescaped, strings escaped as
// JSON.stringify escapes them (`\"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t`,
// `\u00XX` for other control characters, lone surrogates as `\uXXXX`). The
// serializer writes every string and key itself, never by building a JS
// object, which would reorder integer-like keys. Story 3.2 names fixtures by
// that hash.
//
// `conformance/oracle/schema.json` (JSON Schema 2020-12) is the contract;
// `validateRequest` interprets the subset of it the schema uses, then checks
// the hash. The rendered line keeps each `input` object's own key order (PHP
// array order matters to the Oracle, for example a validator's rules); only
// the hash input is sorted.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ORACLE_DIR } from "./oracle";

export type Json = null | boolean | number | string | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

export const SCHEMA_FILE = `${ORACLE_DIR}/schema.json`;
export const REQUESTS_DIR = `${ORACLE_DIR}/requests`;

export const KINDS = ["php-expr", "sql-grammar", "blade-render", "validation-message", "date-format"] as const;
export type RequestKind = (typeof KINDS)[number];
export const GRAMMARS = ["base", "sqlite", "pgsql", "mysql", "mariadb", "sqlsrv"] as const;
export type Grammar = (typeof GRAMMARS)[number];

/** The `input` key order of each kind. */
export const INPUT_KEYS: Readonly<Record<RequestKind, readonly string[]>> = {
  "php-expr": ["bindings", "setup", "exprs"],
  "sql-grammar": ["grammar", "setup", "exprs"],
  "blade-render": ["template", "data"],
  "validation-message": ["lines", "data", "rules", "messages", "attributes", "format", "exprs"],
  "date-format": ["now", "timezone", "setup", "exprs"],
};

export interface PhpExprInput {
  bindings: Record<string, string>;
  setup: string[];
  exprs: string[];
}
export interface SqlGrammarInput {
  grammar: Grammar;
  setup: string[];
  exprs: string[];
}
export interface BladeRenderInput {
  template: string;
  data: JsonObject;
}
export interface ValidationMessageInput {
  lines: JsonObject;
  data: JsonObject;
  rules: JsonObject;
  messages: JsonObject;
  attributes: JsonObject;
  format: string | null;
  exprs: string[];
}
export interface DateFormatInput {
  now: string | null;
  timezone: string;
  setup: string[];
  exprs: string[];
}

export interface InputByKind {
  "php-expr": PhpExprInput;
  "sql-grammar": SqlGrammarInput;
  "blade-render": BladeRenderInput;
  "validation-message": ValidationMessageInput;
  "date-format": DateFormatInput;
}

export interface OracleRequest {
  id: string;
  kind: RequestKind;
  input: JsonObject;
  sha256: string;
}

export function compareUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeJson(value: unknown, sorted: boolean): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${value} has no JSON form`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => writeJson(item, sorted)).join(",")}]`;
  }
  if (isObject(value)) {
    const keys = Object.keys(value);
    if (sorted) {
      keys.sort(compareUnits);
    }
    return `{${keys.map((key) => `${JSON.stringify(key)}:${writeJson(value[key], sorted)}`).join(",")}}`;
  }
  throw new Error(`a ${typeof value} has no JSON form`);
}

/** The canonical JSON of `value`: keys sorted by UTF-16 code unit at every depth, no whitespace. */
export function canonicalJson(value: Json): string {
  return writeJson(value, true);
}

/** Compact JSON keeping each object's key order. */
export function renderJson(value: Json): string {
  return writeJson(value, false);
}

/** The lowercase hex SHA-256 of the canonical `{id, kind, input}`. */
export function requestHash(id: string, kind: string, input: Json): string {
  const canonical = `{${[
    ["id", id],
    ["input", input],
    ["kind", kind],
  ]
    .map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value as Json)}`)
    .join(",")}}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** A request with its input keys in the kind's order and its hash. */
export function makeRequest<K extends RequestKind>(id: string, kind: K, input: InputByKind[K]): OracleRequest {
  const source = input as unknown as JsonObject;
  const ordered: JsonObject = Object.fromEntries(INPUT_KEYS[kind].map((key) => [key, source[key]!]));
  return { id, kind, input: ordered, sha256: requestHash(id, kind, ordered) };
}

/** The request's line, without the newline. */
export function renderRequest(request: OracleRequest): string {
  return `{"id":${JSON.stringify(request.id)},"kind":${JSON.stringify(request.kind)},"input":${renderJson(request.input)},"sha256":${JSON.stringify(request.sha256)}}`;
}

/**
 * The file text per Component, Components sorted: lines sorted by `id` then `sha256` (UTF-16 order), identical
 * requests once, LF, trailing newline. Throws when two different lines share a `sha256`.
 */
export function renderRequests(requests: readonly { component: string; request: OracleRequest }[]): Map<string, string> {
  const byHash = new Map<string, string>();
  const groups = new Map<string, Map<string, OracleRequest>>();
  for (const { component, request } of requests) {
    const line = renderRequest(request);
    const seen = byHash.get(request.sha256);
    if (seen !== undefined && seen !== line) {
      throw new Error(`two different requests share sha256 ${request.sha256}:\n  ${seen}\n  ${line}`);
    }
    byHash.set(request.sha256, line);
    const group = groups.get(component) ?? new Map<string, OracleRequest>();
    group.set(request.sha256, request);
    groups.set(component, group);
  }
  const files = new Map<string, string>();
  for (const component of [...groups.keys()].sort(compareUnits)) {
    const list = [...groups.get(component)!.values()].sort((a, b) => compareUnits(a.id, b.id) || compareUnits(a.sha256, b.sha256));
    files.set(component, list.map((request) => `${renderRequest(request)}\n`).join(""));
  }
  return files;
}

// ---------------------------------------------------------------------------
// Validation

/** Reads `conformance/oracle/schema.json` under `root`. */
export function readSchema(root: string): JsonObject {
  const file = join(root, SCHEMA_FILE);
  if (!existsSync(file)) {
    throw new Error(`${SCHEMA_FILE} is missing`);
  }
  const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (!isObject(value)) {
    throw new Error(`${SCHEMA_FILE} is not a JSON object`);
  }
  return value;
}

const ANNOTATIONS = new Set(["$schema", "$id", "$comment", "$defs", "title", "description", "examples"]);

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(value: unknown, type: string): boolean {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
}

function equal(a: unknown, b: unknown): boolean {
  return renderJson(a as Json) === renderJson(b as Json);
}

/**
 * The errors of `value` against `schema` (a JSON Schema 2020-12 subset: type, enum, const, pattern, minLength,
 * properties, required, additionalProperties, propertyNames, items, minItems, allOf, if/then/else, and local `$ref`
 * to `#/$defs/<name>`). An unsupported keyword throws, so the interpreter fails closed.
 */
export function schemaErrors(value: unknown, schema: unknown, rootSchema: JsonObject, at = "$"): string[] {
  if (schema === true) {
    return [];
  }
  if (schema === false) {
    return [`${at}: not allowed`];
  }
  if (!isObject(schema)) {
    throw new Error(`schema at ${at} is not an object or boolean`);
  }
  const errors: string[] = [];
  for (const keyword of Object.keys(schema)) {
    const rule = schema[keyword];
    switch (keyword) {
      case "$ref": {
        const match = typeof rule === "string" ? /^#\/\$defs\/([^/]+)$/.exec(rule) : null;
        const defs = rootSchema["$defs"];
        if (match === null || !isObject(defs) || !(match[1]! in defs)) {
          throw new Error(`unsupported $ref ${JSON.stringify(rule)}`);
        }
        errors.push(...schemaErrors(value, defs[match[1]!], rootSchema, at));
        break;
      }
      case "type": {
        const types = (Array.isArray(rule) ? rule : [rule]).map((type) => (typeof type === "string" ? type : JSON.stringify(type)));
        if (!types.some((type) => typeMatches(value, type))) {
          errors.push(`${at}: expected ${types.join(" or ")}, got ${typeOf(value)}`);
        }
        break;
      }
      case "enum":
        if (!(rule as Json[]).some((option) => equal(option, value))) {
          errors.push(`${at}: ${renderJson(value as Json)} is not one of ${renderJson(rule)}`);
        }
        break;
      case "const":
        if (!equal(rule, value)) {
          errors.push(`${at}: expected ${renderJson(rule)}`);
        }
        break;
      case "pattern":
        if (typeof value === "string" && !new RegExp(rule as string, "u").test(value)) {
          errors.push(`${at}: ${JSON.stringify(value)} does not match ${rule as string}`);
        }
        break;
      case "minLength":
        if (typeof value === "string" && value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "_").length < (rule as number)) {
          errors.push(`${at}: shorter than ${rule as number}`);
        }
        break;
      case "minItems":
        if (Array.isArray(value) && value.length < (rule as number)) {
          errors.push(`${at}: fewer than ${rule as number} items`);
        }
        break;
      case "items":
        if (Array.isArray(value)) {
          value.forEach((item, index) => errors.push(...schemaErrors(item, rule, rootSchema, `${at}[${index}]`)));
        }
        break;
      case "required":
        if (isObject(value)) {
          for (const key of rule as string[]) {
            if (!Object.hasOwn(value, key)) {
              errors.push(`${at}: missing ${JSON.stringify(key)}`);
            }
          }
        }
        break;
      case "properties":
        if (isObject(value)) {
          for (const [key, sub] of Object.entries(rule as JsonObject)) {
            if (Object.hasOwn(value, key)) {
              errors.push(...schemaErrors(value[key], sub, rootSchema, `${at}.${key}`));
            }
          }
        }
        break;
      case "additionalProperties":
        if (isObject(value)) {
          const known = isObject(schema["properties"]) ? Object.keys(schema["properties"]) : [];
          for (const key of Object.keys(value)) {
            if (!known.includes(key)) {
              errors.push(...(rule === false ? [`${at}: unexpected key ${JSON.stringify(key)}`] : schemaErrors(value[key], rule, rootSchema, `${at}.${key}`)));
            }
          }
        }
        break;
      case "propertyNames":
        if (isObject(value)) {
          for (const key of Object.keys(value)) {
            errors.push(...schemaErrors(key, rule, rootSchema, `${at} key ${JSON.stringify(key)}`));
          }
        }
        break;
      case "allOf":
        (rule as Json[]).forEach((sub) => errors.push(...schemaErrors(value, sub, rootSchema, at)));
        break;
      case "if": {
        const branch = schemaErrors(value, rule, rootSchema, at).length === 0 ? schema["then"] : schema["else"];
        if (branch !== undefined) {
          errors.push(...schemaErrors(value, branch, rootSchema, at));
        }
        break;
      }
      case "then":
      case "else":
        break;
      default:
        if (!ANNOTATIONS.has(keyword)) {
          throw new Error(`unsupported schema keyword ${JSON.stringify(keyword)} at ${at}`);
        }
    }
  }
  return errors;
}

/** The errors of one parsed request: the schema's, then a `sha256` that is not the hash of the canonical request. */
export function validateRequest(value: unknown, schema: JsonObject): string[] {
  const errors = schemaErrors(value, schema, schema);
  if (errors.length === 0 && isObject(value)) {
    const expected = requestHash(value["id"] as string, value["kind"] as string, value["input"]!);
    if (value["sha256"] !== expected) {
      errors.push(`$.sha256: expected ${expected}, the hash of the canonical request`);
    }
  }
  return errors;
}

/**
 * Parses and validates one request file's text; throws `<file>:<line>: …` on malformed JSON, a key order other
 * than id, kind, input, sha256, a schema error, a wrong hash, or a line that is not byte-identical to its rendering.
 */
export function parseRequests(text: string, file: string, schema: JsonObject): OracleRequest[] {
  if (text !== "" && !text.endsWith("\n")) {
    throw new Error(`${file}: the file must end with a newline`);
  }
  const lines = text === "" ? [] : text.slice(0, -1).split("\n");
  return lines.map((line, index) => {
    const at = `${file}:${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isObject(value) || Object.keys(value).join(",") !== "id,kind,input,sha256") {
      throw new Error(`${at}: expected the keys id, kind, input, sha256 in that order`);
    }
    const errors = validateRequest(value, schema);
    if (errors.length > 0) {
      throw new Error(`${at}: ${errors.join("; ")}`);
    }
    const request = value as unknown as OracleRequest;
    if (renderRequest(request) !== line) {
      throw new Error(`${at}: the line is not in canonical form (compact JSON, no escaped "/", keys in order); expected ${renderRequest(request)}`);
    }
    return request;
  });
}
