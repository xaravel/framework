// Test-side comparison for XT-assert-8..10: runs each assertion matrix of
// operands.ts in TS and compares every cell with the Oracle's (a signed
// fixture, or a local evaluate.php run during development).
//
// A cell passes, fails with `[message, expectedAsString, actualAsString]`, or
// throws `['throws', class short name, message]`. Object handles and resource
// ids differ between PHP and this process, so both sides read
// `Object #<n>` and `resource(<n>)`.
import { AssertionFailedError, ExpectationFailedException, phpStrictEquals } from "../../src/index";
import type { Matrix, Pair, RequestSpec } from "./operands";
import { decode, type DecodedObject, type Output, PHP_PROPS, PHP_RESOURCE } from "./oracle-values";

type Cell = { kind: "pass" } | { kind: "fail"; message: string; expected: string | null; actual: string | null } | { kind: "throws"; name: string; message: string };

function normalize(text: string | null): string | null {
  return text === null ? null : text.replace(/Object #\d+/g, "Object #<n>").replace(/resource\(\d+\)/g, "resource(<n>)");
}

/** PHP's cell: PHPUnit's getMessage(), and the comparison failure's exported values when it has one. */
function oracleCell(value: unknown, where: string): Cell {
  if (value === null) {
    return { kind: "pass" };
  }
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${where}: not a cell: ${JSON.stringify(value)}`);
  }
  const [first, second, third] = value as [unknown, unknown, unknown];
  if (first === "throws") {
    return { kind: "throws", name: String(second), message: String(third) };
  }
  return { kind: "fail", message: String(first), expected: second as string | null, actual: third as string | null };
}

function tsCell(run: () => void): Cell {
  try {
    run();
    return { kind: "pass" };
  } catch (error) {
    if (error instanceof ExpectationFailedException) {
      const failure = error.getComparisonFailure();
      const expected = failure?.getExpectedAsString() ?? "";
      const actual = failure?.getActualAsString() ?? "";
      // The JS message is getMessage() and, when there are compared values, both of them (for bun's output).
      const block = expected === "" && actual === "" ? "" : `\n--- Expected\n${expected}\n+++ Actual\n${actual}`;
      const message = error instanceof AssertionFailedError && error.message === `${error.getMessage()}${block}` ? error.getMessage() : `[malformed JS message] ${error.message}`;
      return { kind: "fail", message, expected: failure?.getExpectedAsString() ?? null, actual: failure?.getActualAsString() ?? null };
    }
    if (error instanceof Error) {
      return { kind: "throws", name: error.name, message: error.message };
    }
    return { kind: "throws", name: typeof error, message: String(error) };
  }
}

function sameCell(oracle: Cell, got: Cell): boolean {
  if (oracle.kind !== got.kind) {
    return false;
  }
  if (oracle.kind === "throws" && got.kind === "throws") {
    // PHP's engine TypeError ends with the PHP call site (", called in <file> on line <n>"), so that tail is dropped;
    // the method, argument, parameter, type and given type before it must be equal. The `xt_contains_only` shim
    // (ESC-4.3-1 item 7) takes the test case first, so its argument #n is assertContainsOnly's #n-1.
    if (oracle.name === "TypeError") {
      const message = oracle.message
        .replace(/, called in [\s\S]*$/, "")
        .replace(/^xt_contains_only\(\): Argument #(\d+)/, (_, n: string) => `PHPUnit\\Framework\\Assert::assertContainsOnly(): Argument #${Number(n) - 1}`);
      return got.name === "TypeError" && message === got.message;
    }
    return oracle.name === got.name && oracle.message === got.message;
  }
  if (oracle.kind === "fail" && got.kind === "fail") {
    return (
      normalize(oracle.message) === normalize(got.message) &&
      (oracle.expected === null) === (got.expected === null) &&
      normalize(oracle.expected) === normalize(got.expected) &&
      normalize(oracle.actual) === normalize(got.actual)
    );
  }
  return true;
}

function show(cell: Cell): string {
  switch (cell.kind) {
    case "pass":
      return "passes";
    case "throws":
      return `throws ${cell.name}: ${JSON.stringify(cell.message)}`;
    default:
      return `fails ${JSON.stringify(normalize(cell.message))} (comparison failure: ${cell.expected === null ? "none" : JSON.stringify([normalize(cell.expected), normalize(cell.actual)])})`;
  }
}

// ---------------------------------------------------------------------------
// Pairing guard: each decoded PHP operand is its TS twin.

function propsOf(value: object): unknown {
  const props = (value as { [PHP_PROPS]?: () => unknown })[PHP_PROPS];
  return typeof props === "function" ? props.call(value) : Object.fromEntries(Object.entries(value));
}

function className(value: object): string {
  const constructor: unknown = (Object.getPrototypeOf(value) as { constructor?: unknown } | null)?.constructor;
  if (typeof constructor !== "function" || constructor === Object) {
    return "stdClass";
  }
  const name: unknown = (constructor as unknown as Record<symbol, unknown>)[Symbol.for("xaravel.class.fqcn")];
  return typeof name === "string" ? name : constructor.name;
}

function isArrayValue(value: object): boolean {
  if (Array.isArray(value) || Symbol.for("xaravel.php.array") in value) {
    return true;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && !(PHP_PROPS in value);
}

/** Whether the decoded PHP operand `php` stands for the TS twin `ts`; `ancestors` are the TS objects being compared. */
function twins(php: unknown, ts: unknown, ancestors: readonly object[] = []): boolean {
  if (typeof ts === "function") {
    return typeof php === "object" && php !== null && className(php) === "Closure";
  }
  if (typeof ts === "number" && Number.isNaN(ts)) {
    return typeof php === "number" && Number.isNaN(php);
  }
  if (typeof ts !== "object" || ts === null || typeof php !== "object" || php === null) {
    return phpStrictEquals(php, ts);
  }
  if ("recursion" in php && Object.keys(php).length === 1) {
    // The evaluator's mark for an object already being encoded: the TS twin is the same ancestor.
    return ancestors.includes(ts) && className(ts) === (php as { recursion: unknown }).recursion;
  }
  const inner = [...ancestors, ts];
  if (ts instanceof Error) {
    // A PHP exception pairs on message, code and previous; file, line and trace have no JS counterpart.
    const hidden = (php as Partial<DecodedObject>).phpHidden;
    return (
      hidden !== undefined &&
      className(php) === className(ts) &&
      twins(hidden.get("message"), ts.message, inner) &&
      twins(hidden.get("code"), (ts as { code?: unknown }).code ?? 0, inner) &&
      twins(hidden.get("previous"), ts.cause ?? null, inner)
    );
  }
  if (PHP_RESOURCE in ts) {
    return PHP_RESOURCE in php && (php as Record<symbol, unknown>)[PHP_RESOURCE] === (ts as Record<symbol, unknown>)[PHP_RESOURCE];
  }
  if (isArrayValue(ts)) {
    if (!isArrayValue(php)) {
      return false;
    }
    const left = entries(php);
    const right = entries(ts);
    return left.length === right.length && left.every(([key, value], index) => key === right[index]![0] && twins(value, right[index]![1], inner));
  }
  return !isArrayValue(php) && className(php) === className(ts) && twins(propsOf(php), propsOf(ts), inner);
}

function entries(value: object): (readonly [unknown, unknown])[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => [index, item] as const);
  }
  if (Symbol.for("xaravel.php.array") in value) {
    return [...(value as Iterable<readonly [unknown, unknown]>)];
  }
  return Object.entries(value).map(([key, item]) => [/^(0|-?[1-9]\d*)$/.test(key) ? Number(key) : key, item] as const);
}

// ---------------------------------------------------------------------------

function resultValue(output: Output, index: number, label: string): unknown {
  const result = output.results[index];
  if (result === undefined || !("value" in result)) {
    throw new Error(`${label}: result ${index} is not a value: ${JSON.stringify(result ?? null)}`);
  }
  return decode(result.value);
}

function axis(matrix: Matrix, which: "rows" | "cols", operands: readonly (readonly Pair[])[]): readonly Pair[] {
  const value = matrix[which];
  if (value === "v") {
    return operands[0]!;
  }
  if (value === "u") {
    return operands[1]!;
  }
  return value ?? [];
}

/** Every cell of `spec` whose TS outcome differs from the Oracle's, one line each, and the assertion kinds that ran. */
export function requestMismatches(label: string, spec: RequestSpec, output: Output): { cells: number; mismatches: string[]; ran: Set<string> } {
  if (output.error !== null) {
    throw new Error(`${label}: the Oracle reported an error: ${JSON.stringify(output.error)}`);
  }
  const offset = spec.operands.length;
  if (output.results.length !== offset + spec.matrices.length) {
    throw new Error(`${label}: expected ${offset + spec.matrices.length} results, got ${output.results.length}`);
  }
  const mismatches: string[] = [];
  spec.operands.forEach((pairs, index) => {
    const decoded = resultValue(output, index, label);
    if (!Array.isArray(decoded) || decoded.length !== pairs.length) {
      throw new Error(`${label}: operand list ${index} is not ${pairs.length} values`);
    }
    pairs.forEach(([php, ts], position) => {
      if (!twins(decoded[position], ts)) {
        mismatches.push(`${label}: operand ${index}[${position}] ${php} is not its TS twin`);
      }
    });
  });
  let cells = 0;
  const ran = new Set<string>();
  spec.matrices.forEach((matrix, index) => {
    const where = `${label} ${matrix.php}`;
    const result = resultValue(output, offset + index, where);
    const cols = axis(matrix, "cols", spec.operands);
    const rows: readonly (Pair | null)[] = matrix.rows === null ? [null] : axis(matrix, "rows", spec.operands);
    const grid = matrix.rows === null ? [result] : result;
    if (!Array.isArray(grid) || grid.length !== rows.length) {
      throw new Error(`${where}: not ${rows.length} rows`);
    }
    rows.forEach((row, i) => {
      const line: unknown = grid[i];
      if (!Array.isArray(line) || line.length !== cols.length) {
        throw new Error(`${where}: row ${i} is not ${cols.length} cells`);
      }
      cols.forEach((col, j) => {
        cells++;
        // An assertion ran only when one of its cells did, never from a matrix label alone.
        ran.add(matrix.assertion);
        const oracle = oracleCell(line[j], `${where}[${i}][${j}]`);
        const got = tsCell(() => {
          matrix.ts(row?.[1], col[1]);
        });
        if (!sameCell(oracle, got)) {
          const args = row === null ? col[0] : `$a = ${row[0]}, $b = ${col[0]}`;
          mismatches.push(`${where} with ${args}:\n    Oracle ${show(oracle)}\n    got    ${show(got)}`);
        }
      });
    });
  });
  return { cells, mismatches, ran };
}
