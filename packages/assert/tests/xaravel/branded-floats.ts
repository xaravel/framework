// Test-side helpers for XT-assert-17 (Story 9.11): the runtime's float marker
// simulated by its brand only (`BrandedFloat`, as `BrandedArray` simulates the
// array brand), the evaluator's encoding decoded with every PHP float as a
// `BrandedFloat`, and the `===`/`==` matrix checked over those values. They
// reuse oracle-values.ts through its exports only: `decode` runs on an encoding
// whose floats are swapped for placeholder strings, which are then replaced.
import { BrandedArray, decode, LOOSE_EXPR, type Output, type Request, STRICT_EXPR } from "./oracle-values";

export const PHP_FLOAT = Symbol.for("xaravel.php.float");

/**
 * A test-side marked float: the runtime's float brand only; `Number(v)` is its value. The grader never imports the
 * runtime (AD-2), so it must read this as it reads `float(n)`.
 */
export class BrandedFloat {
  readonly [PHP_FLOAT] = true;

  constructor(private readonly value: number) {}

  valueOf(): number {
    return this.value;
  }
}

/** A string no PHP value of these requests holds: the placeholder of a PHP float, its `var_export` text after it. */
const PLACEHOLDER = "\u0000xt-branded-float\u0000";

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

/** The encoding with each `{"float": s}` replaced by its placeholder string. */
function markFloats(encoded: unknown): unknown {
  if (Array.isArray(encoded)) {
    return encoded.map(markFloats);
  }
  if (typeof encoded === "object" && encoded !== null) {
    const value = encoded as Record<string, unknown>;
    if (Object.keys(value).length === 1 && typeof value["float"] === "string") {
      return `${PLACEHOLDER}${value["float"]}`;
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, markFloats(item)]));
  }
  return encoded;
}

/** The decoded value with each placeholder string replaced by a `BrandedFloat`. */
function brandFloats(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith(PLACEHOLDER)) {
    return new BrandedFloat(decodeFloat(value.slice(PLACEHOLDER.length)));
  }
  if (Array.isArray(value)) {
    return value.map(brandFloats);
  }
  if (value instanceof BrandedArray) {
    return new BrandedArray([...value].map(([key, item]) => [key, brandFloats(item)] as const));
  }
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, brandFloats(item)]));
  }
  return value;
}

/** Decodes one value of the evaluator's encoding, every PHP float a `BrandedFloat`. */
export function decodeBranded(encoded: unknown): unknown {
  return brandFloats(decode(markFloats(encoded)));
}

function resultValue(output: Output, index: number, label: string): unknown {
  const result = output.results[index];
  if (result === undefined || !("value" in result)) {
    throw new Error(`${label}: result ${index} is not a value: ${JSON.stringify(result ?? null)}`);
  }
  return decodeBranded(result.value);
}

/**
 * oracle-values.ts's `matrixMismatches` with every PHP float of `$v` a `BrandedFloat`: every ordered pair whose
 * `compare` result differs from the Oracle's matrix, one line each.
 */
export function brandedMatrixMismatches(
  label: string,
  request: Request,
  output: Output,
  compare: { loose: (a: unknown, b: unknown) => boolean; strict: (a: unknown, b: unknown) => boolean },
): { pairs: number; mismatches: string[] } {
  if (output.error !== null) {
    throw new Error(`${label}: the Oracle reported an error: ${JSON.stringify(output.error)}`);
  }
  if (request.exprs[0] !== "$v" || output.results.length !== request.exprs.length) {
    throw new Error(`${label}: expected $v first and one result per expr`);
  }
  const values = resultValue(output, 0, label);
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
