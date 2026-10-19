// `JMac\Testing\Diagnostics\StringDiffer` (jasonmccreary/double v1.0.1): the differing regions of two long
// strings, line by line for a multi-line string and character by character (code points, as `mb_str_split`)
// for a single line, over one LCS edit script. Internal.
import { FQCN, varExport } from "../../../support/values";

type Op = readonly ["=" | "-" | "+", string];

const LINE_CONTEXT = 1;
const CHAR_CONTEXT = 12;
const MAX_TOKENS = 500;

function withinContext(ops: readonly Op[], index: number, radius: number): boolean {
  const count = ops.length;
  for (let k = Math.max(0, index - radius); k <= Math.min(count - 1, index + radius); k++) {
    if (ops[k]![0] !== "=") {
      return true;
    }
  }
  return false;
}

function diffTokens(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const lengths: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i]![j] = a[i] === b[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push(["=", a[i]!]);
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      ops.push(["-", a[i]!]);
      i++;
    } else {
      ops.push(["+", b[j]!]);
      j++;
    }
  }
  while (i < n) {
    ops.push(["-", a[i]!]);
    i++;
  }
  while (j < m) {
    ops.push(["+", b[j]!]);
    j++;
  }
  return ops;
}

function renderSide(ops: readonly Op[], side: "-" | "+", context: number): string {
  let out = "";
  let elided = false;
  ops.forEach(([type, token], index) => {
    if (type !== "=" && type !== side) {
      return;
    }
    if (type === "=" && !withinContext(ops, index, context)) {
      if (!elided) {
        out += "…";
        elided = true;
      }
      return;
    }
    out += token;
    elided = false;
  });
  return out;
}

function truncate(value: string, limit = 200): string {
  const chars = Array.from(value);
  return chars.length > limit ? `${chars.slice(0, limit).join("")}…` : value;
}

function plain(expected: string, actual: string): string {
  return `- ${varExport(truncate(expected))}\n+ ${varExport(truncate(actual))}\n(too large to diff in detail)`;
}

function lineDiff(expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  if (expectedLines.length > MAX_TOKENS || actualLines.length > MAX_TOKENS) {
    return plain(expected, actual);
  }
  const ops = diffTokens(expectedLines, actualLines);
  const rendered: string[] = [];
  ops.forEach(([type, line], index) => {
    if (type !== "=") {
      rendered.push(`${type === "-" ? "- " : "+ "}${line}`);
      return;
    }
    if (withinContext(ops, index, LINE_CONTEXT)) {
      rendered.push(`  ${line}`);
    } else if (rendered.length === 0 || rendered.at(-1) !== "  ...") {
      rendered.push("  ...");
    }
  });
  return rendered.join("\n");
}

function charDiff(expected: string, actual: string): string {
  const expectedChars = Array.from(expected);
  const actualChars = Array.from(actual);
  if (expectedChars.length > MAX_TOKENS || actualChars.length > MAX_TOKENS) {
    return plain(expected, actual);
  }
  const ops = diffTokens(expectedChars, actualChars);
  return `- ${varExport(renderSide(ops, "-", CHAR_CONTEXT))}\n+ ${varExport(renderSide(ops, "+", CHAR_CONTEXT))}`;
}

export class StringDiffer {
  static readonly [FQCN]: string = "JMac\\Testing\\Diagnostics\\StringDiffer";

  /** Below this combined byte length (`strlen`), a plain comparison is shown instead. */
  static readonly MIN_LENGTH_TO_DIFF = 40;

  static diff(expected: string, actual: string): string {
    return expected.includes("\n") || actual.includes("\n") ? lineDiff(expected, actual) : charDiff(expected, actual);
  }
}
