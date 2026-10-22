// Test-side helpers for XT-assert-1 and XT-assert-17: read a signed Oracle
// fixture and decode the evaluator's value encoding (tools/oracle/evaluate.php
// header) into the AD-9 value model. The package tsconfig cannot reach tools/,
// so this uses node:crypto and node:fs only.
import { createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export const PHP_ARRAY = Symbol.for("xaravel.php.array");
export const PHP_PROPS = Symbol.for("xaravel.php.props");
export const PHP_RESOURCE = Symbol.for("xaravel.php.resource");
export const PHP_FLOAT = Symbol.for("xaravel.php.float");
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

/** The domain prefix of every fixture signature (tools/oracle/fixtures.ts). */
const FIXTURE_DOMAIN = "xaravel-oracle-fixture-v1\n";

type Key = number | bigint | string;

/** A test-side ordered PHP array: branded, iterating `[key, value]` pairs in insertion order. */
export class BrandedArray implements Iterable<readonly [Key, unknown]> {
  readonly [PHP_ARRAY] = true;
  private readonly entries: (readonly [Key, unknown])[];

  constructor(entries: Iterable<readonly [Key, unknown]>) {
    this.entries = [...entries];
  }

  *[Symbol.iterator](): Iterator<readonly [Key, unknown]> {
    yield* this.entries;
  }
}

/**
 * A test-side marked float (XT-assert-17): the runtime's float brand only, as `BrandedArray` simulates the array brand;
 * `Number(v)` is its value. The grader never imports the runtime (AD-2), so it must read this as it reads `float(n)`.
 */
export class BrandedFloat {
  readonly [PHP_FLOAT] = true;

  constructor(private readonly value: number) {}

  valueOf(): number {
    return this.value;
  }
}

/** How `decode` represents a PHP float: a plain `number` (XT-assert-1, DIV-9) or a `BrandedFloat` (XT-assert-17). */
export interface DecodeOptions {
  readonly floats?: "number" | "branded";
}

/**
 * A decoded PHP object: one class per PHP class name, its public props behind the props protocol. Its protected and
 * private props (an exception's `message`, `code`, `previous`, …) are in `phpHidden`, by name, outside the protocol.
 */
export interface DecodedObject {
  readonly phpClass: string;
  readonly phpHidden: ReadonlyMap<string, unknown>;
  [PHP_PROPS](): unknown;
}

const classes = new Map<string, new (props: unknown, hidden: ReadonlyMap<string, unknown>) => DecodedObject>();

function classFor(name: string): new (props: unknown, hidden: ReadonlyMap<string, unknown>) => DecodedObject {
  let known = classes.get(name);
  if (known === undefined) {
    known = class {
      static readonly [CLASS_FQCN] = name;
      readonly #props: unknown;
      readonly phpClass = name;
      readonly phpHidden: ReadonlyMap<string, unknown>;

      constructor(props: unknown, hidden: ReadonlyMap<string, unknown>) {
        this.#props = props;
        this.phpHidden = hidden;
      }

      [PHP_PROPS](): unknown {
        return this.#props;
      }
    };
    classes.set(name, known);
  }
  return known;
}

function decodeInt(text: string): number | bigint {
  const big = BigInt(text);
  return Number.isSafeInteger(Number(big)) ? Number(big) : big;
}

function decodeFloat(text: string): number {
  switch (text) {
    case "INF":
      return Infinity;
    case "-INF":
      return -Infinity;
    case "NAN":
      return NaN;
    default:
      return Number(text);
  }
}

function decodeKey(key: unknown): Key {
  if (typeof key === "string") {
    return key;
  }
  if (typeof key === "object" && key !== null && "int" in key && typeof key.int === "string") {
    return decodeInt(key.int);
  }
  throw new Error(`unknown array key encoding: ${JSON.stringify(key)}`);
}

/** A PHP array as AD-9 has it: a list, a plain object (all string keys) or a branded map. */
function phpArray(entries: (readonly [Key, unknown])[]): unknown {
  if (entries.every(([key], index) => key === index)) {
    return entries.map(([, value]) => value);
  }
  if (entries.every(([key]) => typeof key === "string")) {
    return Object.fromEntries(entries);
  }
  return new BrandedArray(entries);
}

/** Decodes one value of the evaluator's encoding; every PHP float a `BrandedFloat` when `options.floats` is `"branded"`. */
export function decode(encoded: unknown, options: DecodeOptions = {}): unknown {
  if (encoded === null || typeof encoded === "boolean" || typeof encoded === "string") {
    return encoded;
  }
  if (typeof encoded !== "object") {
    throw new Error(`unknown value encoding: ${JSON.stringify(encoded)}`);
  }
  const value = encoded as Record<string, unknown>;
  if (typeof value["int"] === "string") {
    return decodeInt(value["int"]);
  }
  if (typeof value["float"] === "string") {
    const number = decodeFloat(value["float"]);
    return options.floats === "branded" ? new BrandedFloat(number) : number;
  }
  if (Array.isArray(value["array"])) {
    return phpArray((value["array"] as unknown[][]).map(([key, item]) => [decodeKey(key), decode(item, options)] as const));
  }
  if (typeof value["resource"] === "string") {
    return { [PHP_RESOURCE]: value["resource"] };
  }
  if (typeof value["recursion"] === "string") {
    return { recursion: value["recursion"] };
  }
  if (typeof value["object"] === "string" && Array.isArray(value["properties"])) {
    const props: (readonly [Key, unknown])[] = [];
    const hidden = new Map<string, unknown>();
    for (const [name, scope, item] of value["properties"] as unknown[][]) {
      if (scope === "") {
        props.push([decodeKey(name), decode(item, options)]);
      } else {
        hidden.set(String(name), decode(item, options));
      }
    }
    return new (classFor(value["object"]))(phpArray(props), hidden);
  }
  throw new Error(`value encoding not in the table: ${JSON.stringify(encoded)}`);
}

export interface Request {
  id: string;
  sha256: string;
  setup: string[];
  exprs: string[];
}

/** The requests of a per-Story request file. */
export function readRequests(path: string): Request[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const parsed = JSON.parse(line) as { id: string; sha256: string; input: { setup?: string[]; exprs: string[] } };
      return { id: parsed.id, sha256: parsed.sha256, setup: parsed.input.setup ?? [], exprs: parsed.input.exprs };
    });
}

export interface Output {
  error: unknown;
  results: ({ value: unknown } | { throws: unknown })[];
}

/**
 * The output of a signed fixture. Throws, naming the path, when the file is missing, is not one fixture line for
 * `sha256`, or its signature does not verify against `publicKeyPem`. The message is rebuilt from the line's raw
 * `output` text, which the Oracle writes canonical.
 */
export function readSignedFixture(path: string, sha256: string, publicKeyPem: string): Output {
  if (!existsSync(path)) {
    throw new Error(`missing signed fixture: ${path}`);
  }
  const text = readFileSync(path, "utf8");
  const match = /^\{"sha256":"([0-9a-f]{64})","output":(.*),"signature":"([A-Za-z0-9+/=]+)"\}\n$/s.exec(text);
  if (match === null) {
    throw new Error(`not a fixture line: ${path}`);
  }
  const [, lineSha, rawOutput, signature] = match as unknown as [string, string, string, string];
  if (lineSha !== sha256) {
    throw new Error(`${path}: fixture sha256 ${lineSha} is not the request's ${sha256}`);
  }
  const message = Buffer.from(`${FIXTURE_DOMAIN}{"output":${rawOutput},"sha256":"${sha256}"}`, "utf8");
  if (!verify(null, message, createPublicKey(publicKeyPem), Buffer.from(signature, "base64"))) {
    throw new Error(`${path}: the signature does not verify`);
  }
  return JSON.parse(rawOutput) as Output;
}

export const LOOSE_EXPR = "array_map(fn ($a) => array_map(fn ($b) => $a == $b, $v), $v)";
export const STRICT_EXPR = "array_map(fn ($a) => array_map(fn ($b) => $a === $b, $v), $v)";

function resultValue(output: Output, index: number, label: string, options: DecodeOptions = {}): unknown {
  const result = output.results[index];
  if (result === undefined || !("value" in result)) {
    throw new Error(`${label}: result ${index} is not a value: ${JSON.stringify(result ?? null)}`);
  }
  return decode(result.value, options);
}

/**
 * Every ordered pair of the request's `$v` whose `compare` result differs from the Oracle's matrix, one line each.
 * Throws when the output has an error or the request has no `$v` and matrix exprs.
 */
export function matrixMismatches(
  label: string,
  request: Request,
  output: Output,
  compare: { loose: (a: unknown, b: unknown) => boolean; strict: (a: unknown, b: unknown) => boolean },
  options: DecodeOptions = {},
): { pairs: number; mismatches: string[] } {
  if (output.error !== null) {
    throw new Error(`${label}: the Oracle reported an error: ${JSON.stringify(output.error)}`);
  }
  if (request.exprs[0] !== "$v" || output.results.length !== request.exprs.length) {
    throw new Error(`${label}: expected $v first and one result per expr`);
  }
  const values = resultValue(output, 0, label, options);
  if (!Array.isArray(values)) {
    throw new Error(`${label}: $v is not a list`);
  }
  let pairs = 0;
  const mismatches: string[] = [];
  for (let index = 1; index < request.exprs.length; index++) {
    const expr = request.exprs[index];
    const kind = expr === LOOSE_EXPR ? "loose" : expr === STRICT_EXPR ? "strict" : null;
    if (kind === null) {
      throw new Error(`${label}: unknown expr ${String(expr)}`);
    }
    const matrix = resultValue(output, index, label);
    if (!Array.isArray(matrix) || matrix.length !== values.length) {
      throw new Error(`${label}: the ${kind} matrix is not ${values.length} rows`);
    }
    const operator = kind === "loose" ? "==" : "===";
    for (let i = 0; i < values.length; i++) {
      const row: unknown = matrix[i];
      if (!Array.isArray(row) || row.length !== values.length) {
        throw new Error(`${label}: ${kind} row ${i} is not ${values.length} columns`);
      }
      for (let j = 0; j < values.length; j++) {
        const expected: unknown = row[j];
        if (typeof expected !== "boolean") {
          throw new Error(`${label}: ${kind}[${i}][${j}] is not a bool`);
        }
        pairs++;
        const actual = compare[kind](values[i], values[j]);
        if (actual !== expected) {
          const operands = output.results[0] as { value: { array: unknown[][] } };
          const a = JSON.stringify(operands.value.array[i]![1]);
          const b = JSON.stringify(operands.value.array[j]![1]);
          mismatches.push(`${label}: $v[${i}] ${operator} $v[${j}] (${a} ${operator} ${b}): Oracle ${String(expected)}, got ${String(actual)}`);
        }
      }
    }
  }
  return { pairs, mismatches };
}
