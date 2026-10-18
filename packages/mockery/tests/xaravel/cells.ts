// Test-side comparison for XT-mockery-1..3: each scenario's TS outcome against
// the Oracle's value for its expr, cell by cell, after normalising
// `Mockery_<digits>` to `Mockery_<n>` and `#<32 hex>` identities to `#<id>`.
import type { Mockery as MockeryClass } from "../../src/index";
import { decode, type Output } from "../../../assert/tests/xaravel/oracle-values";
import { runScenario, type Scenario } from "./scenarios";

/** Replaces the generated-class counter and the object identities, which differ run to run. */
export function normalize(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/Mockery_\d+/g, "Mockery_<n>").replace(/#[0-9a-f]{32}/g, "#<id>");
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

/** A stable text of an outcome; `undefined` is spelled out so it is never taken for null (AD-9). */
export function show(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(show).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return `<object ${String((value as { constructor?: { name?: string } }).constructor?.name)}>`;
    }
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}:${show(item)}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return String(value);
  }
  return JSON.stringify(value);
}

/** The Oracle's normalised outcome of expr `index`. */
export function oracleCell(output: Output, index: number, label: string): unknown {
  if (output.error !== null) {
    throw new Error(`${label}: the Oracle reported an error: ${JSON.stringify(output.error)}`);
  }
  const result = output.results[index];
  if (result === undefined || !("value" in result)) {
    throw new Error(`${label}: result ${index} is not a value: ${JSON.stringify(result ?? null)}`);
  }
  return normalize(decode(result.value));
}

/** Runs each scenario's TS twin and lists every cell that differs from the Oracle's. */
export function scenarioMismatches(label: string, scenarios: readonly Scenario[], output: Output, Mockery: typeof MockeryClass): { cells: number; mismatches: string[] } {
  if (output.error !== null) {
    throw new Error(`${label}: the Oracle reported an error: ${JSON.stringify(output.error)}`);
  }
  if (output.results.length !== scenarios.length) {
    throw new Error(`${label}: ${output.results.length} results for ${scenarios.length} scenarios`);
  }
  const mismatches: string[] = [];
  let cells = 0;
  scenarios.forEach((scenario, index) => {
    const expected = show(oracleCell(output, index, label));
    const actual = show(normalize(runScenario(Mockery, scenario)));
    cells++;
    if (expected !== actual) {
      mismatches.push(`${label}: ${scenario.id} "${scenario.label}":\n  Oracle ${expected}\n  got    ${actual}`);
    }
  });
  return { cells, mismatches };
}
