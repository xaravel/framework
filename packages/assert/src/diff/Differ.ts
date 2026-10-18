// sebastian/diff 9.0.1's `Differ` (Story 4.4), as far as
// `ComparisonFailure::getDiff()` needs it: two strings split into lines and
// diffed with MyersDiff. Internal to the grader.
//
// PHP diffs bytes: lines split at PCRE's `\R` (`\r\n`, `\n`, `\r`, `\x0b`,
// `\x0c` and the byte `\x85`) without the `u` flag. So both strings are
// diffed as Latin-1 strings of their UTF-8 bytes, and the output builder's
// result is decoded back from UTF-8.
import { MyersDiff, type DiffEntry } from "./MyersDiff";

export const OLD = 0;
export const ADDED = 1;
export const REMOVED = 2;
export const DIFF_LINE_END_WARNING = 3;
export const NO_LINE_END_EOF_WARNING = 4;

/** An output builder: the diff entries as text (of Latin-1 byte strings). */
export interface DiffOutputBuilder {
  getDiff(diff: DiffEntry[]): string;
}

/** A JS string as a Latin-1 string of its UTF-8 bytes. */
export function toByteString(value: string): string {
  return Buffer.from(value, "utf8").toString("latin1");
}

/** The inverse of `toByteString` (an invalid sequence decodes to U+FFFD). */
export function fromByteString(value: string): string {
  return Buffer.from(value, "latin1").toString("utf8");
}

export class Differ {
  constructor(private readonly outputBuilder: DiffOutputBuilder) {}

  /** The diff of two strings, as the output builder renders it. */
  diff(from: string, to: string): string {
    return fromByteString(this.outputBuilder.getDiff(this.diffToArray(toByteString(from), toByteString(to))));
  }

  /** `diffToArray` over two byte strings. */
  diffToArray(fromText: string, toText: string): DiffEntry[] {
    const from = splitStringByLines(fromText);
    const to = splitStringByLines(toText);
    // getArrayDiffParted: the common head and tail are not diffed.
    let head = 0;
    while (head < from.length && head < to.length && from[head] === to[head]) {
      head++;
    }
    let tail = 0;
    while (tail < from.length - head && tail < to.length - head && from[from.length - 1 - tail] === to[to.length - 1 - tail]) {
      tail++;
    }
    const diff: DiffEntry[] = [];
    for (let i = 0; i < head; i++) {
      diff.push([from[i]!, OLD]);
    }
    diff.push(...new MyersDiff().calculate(from.slice(head, from.length - tail), to.slice(head, to.length - tail)));
    for (let i = from.length - tail; i < from.length; i++) {
      diff.push([from[i]!, OLD]);
    }
    if (detectUnmatchedLineEndings(diff)) {
      diff.unshift(["#Warning: Strings contain different line endings!\n", DIFF_LINE_END_WARNING]);
    }
    return diff;
  }
}

/** `preg_split('/(.*\R)/', $input, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY)` over a byte string. */
function splitStringByLines(input: string): string[] {
  const lines: string[] = [];
  // oxlint-disable-next-line no-control-regex -- PCRE's \R: \r\n, \n, \r, \x0b, \x0c and the byte \x85
  const line = /[^\n]*(?:\r\n|[\n\r\x0b\x0c\x85])/y;
  let position = 0;
  while (position < input.length) {
    line.lastIndex = position;
    const match = line.exec(input);
    if (match === null) {
      break;
    }
    lines.push(match[0]);
    position = line.lastIndex;
  }
  if (position < input.length) {
    lines.push(input.slice(position));
  }
  return lines;
}

function linebreak(line: string): string {
  const last = line.slice(-1);
  if (last === "\r") {
    return "\r";
  }
  if (last !== "\n") {
    return "";
  }
  return line.endsWith("\r\n") ? "\r\n" : "\n";
}

function detectUnmatchedLineEndings(diff: readonly DiffEntry[]): boolean {
  const newBreaks = new Set<string>([""]);
  const oldBreaks = new Set<string>([""]);
  for (const [token, kind] of diff) {
    if (kind === OLD) {
      const ln = linebreak(token);
      oldBreaks.add(ln);
      newBreaks.add(ln);
    } else if (kind === ADDED) {
      newBreaks.add(linebreak(token));
    } else if (kind === REMOVED) {
      oldBreaks.add(linebreak(token));
    }
  }
  if (newBreaks.size === 1 || oldBreaks.size === 1) {
    return false;
  }
  return [...newBreaks].some((brk) => !oldBreaks.has(brk)) || [...oldBreaks].some((brk) => !newBreaks.has(brk));
}
