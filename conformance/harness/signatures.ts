// The API signature lookup (Story 5.4, ESC-4.8-1 item 1). Imports nothing
// graded: it reads committed data, `conformance/api-surface/*.jsonl`.
//
// `signatureLookup(dir)` returns `(fqcn, member) => row | null`. On its first
// call it indexes every `*.jsonl` in `dir`, keeping only `kind: "method"`
// rows, keyed exactly on `fqcn` and `member`. Rows are deep-frozen, and every
// call for a key returns the same object. A missing `dir` gives a lookup that
// always returns null; a malformed line throws an `Error` naming `file:line`;
// non-string arguments return null.
import { existsSync as fsExistsSync, readdirSync as fsReaddirSync, readFileSync as fsReadFileSync, statSync as fsStatSync } from "node:fs";
import { join } from "node:path";

// Captured at load, before any test runs (or mocks node:fs).
const existsSync = fsExistsSync;
const readdirSync = fsReaddirSync;
const readFileSync = fsReadFileSync;
const statSync = fsStatSync;
const parse = JSON.parse;
const freeze = Object.freeze;
const isFrozen = Object.isFrozen;
const values = Object.values;

/** One parameter of a surface row. */
export interface SignatureParameter {
  readonly name: string;
  readonly type: string | null;
  readonly nullable: boolean;
  readonly default: unknown;
  readonly optional: boolean;
  readonly variadic: boolean;
  readonly byRef: boolean;
}

/** A `kind: "method"` row of `conformance/api-surface/*.jsonl`, as committed. */
export interface SignatureRow {
  readonly fqcn: string;
  readonly kind: "method";
  readonly member: string;
  readonly static: boolean;
  readonly parameters: readonly SignatureParameter[];
  readonly returns: string | null;
  readonly nullable: boolean;
}

export type SignatureLookup = (fqcn: unknown, member: unknown) => SignatureRow | null;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !isFrozen(value)) {
    for (const item of values(value)) {
      deepFreeze(item);
    }
    freeze(value);
  }
  return value;
}

function buildIndex(dir: string): Map<string, Map<string, SignatureRow>> {
  const index = new Map<string, Map<string, SignatureRow>>();
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return index;
  }
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort();
  for (const name of files) {
    const file = join(dir, name);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      if (text === "" && i === lines.length - 1) {
        return;
      }
      let row: unknown;
      try {
        row = parse(text);
      } catch (error) {
        throw new Error(`${file}:${i + 1}: malformed api-surface line: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (typeof row !== "object" || row === null || Array.isArray(row)) {
        throw new Error(`${file}:${i + 1}: malformed api-surface line: not a JSON object`);
      }
      const record = row as Record<string, unknown>;
      if (record["kind"] !== "method") {
        return;
      }
      const fqcn = record["fqcn"];
      const member = record["member"];
      if (typeof fqcn !== "string" || typeof member !== "string") {
        throw new Error(`${file}:${i + 1}: malformed api-surface line: a method row needs a string fqcn and member`);
      }
      const members = index.get(fqcn) ?? new Map<string, SignatureRow>();
      index.set(fqcn, members);
      if (!members.has(member)) {
        members.set(member, deepFreeze(record) as unknown as SignatureRow);
      }
    });
  }
  return index;
}

/** The lookup over the `*.jsonl` files of `dir` (see the header). */
export function signatureLookup(dir: string): SignatureLookup {
  let index: Map<string, Map<string, SignatureRow>> | null = null;
  return (fqcn: unknown, member: unknown): SignatureRow | null => {
    if (typeof fqcn !== "string" || typeof member !== "string") {
      return null;
    }
    index ??= buildIndex(dir);
    return index.get(fqcn)?.get(member) ?? null;
  };
}
