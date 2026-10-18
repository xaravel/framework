// sebastian/diff 9.0.1's `StrictUnifiedDiffOutputBuilder` (Story 4.4), with
// the options `ComparisonFailure::getDiff()` passes. Internal to the grader.
import { ADDED, DIFF_LINE_END_WARNING, type DiffOutputBuilder, NO_LINE_END_EOF_WARNING, OLD, REMOVED } from "./Differ";
import type { DiffEntry } from "./MyersDiff";

export interface StrictUnifiedDiffOptions {
  readonly header: string;
  readonly addLineNumbers: boolean;
  readonly collapseRanges?: boolean;
  readonly commonLineThreshold?: number;
  readonly contextLines: number;
  readonly emitDiffLineEndWarning: boolean;
  readonly emitNoLineEndEofWarning: boolean;
}

export class StrictUnifiedDiffOutputBuilder implements DiffOutputBuilder {
  private readonly header: string;
  private readonly addLineNumbers: boolean;
  private readonly collapseRanges: boolean;
  private readonly commonLineThreshold: number;
  private readonly contextLines: number;
  private readonly emitDiffLineEndWarning: boolean;
  private readonly emitNoLineEndEofWarning: boolean;
  private changed = false;

  constructor(options: StrictUnifiedDiffOptions) {
    this.header = options.header;
    this.addLineNumbers = options.addLineNumbers;
    this.collapseRanges = options.collapseRanges ?? true;
    this.commonLineThreshold = options.commonLineThreshold ?? 6;
    this.contextLines = options.contextLines;
    this.emitDiffLineEndWarning = options.emitDiffLineEndWarning;
    this.emitNoLineEndEofWarning = options.emitNoLineEndEofWarning;
  }

  getDiff(diff: DiffEntry[]): string {
    if (diff.length === 0) {
      return "";
    }
    this.changed = false;
    const buffer: string[] = [];
    if (this.header !== "") {
      buffer.push(this.header);
      if (!this.header.endsWith("\n")) {
        buffer.push("\n");
      }
    }
    this.writeDiffHunks(buffer, [...diff]);
    if (!this.changed) {
      return "";
    }
    const text = buffer.join("");
    const last = text.slice(-1);
    return last !== "\n" && last !== "\r" ? `${text}\n` : text;
  }

  private writeDiffHunks(output: string[], diff: DiffEntry[]): void {
    const upperLimit = diff.length;
    if (diff[upperLimit - 1]![1] === OLD) {
      if (diff[upperLimit - 1]![0].slice(-1) !== "\n") {
        diff.splice(upperLimit, 0, ["\n\\ No newline at end of file\n", NO_LINE_END_EOF_WARNING]);
      }
    } else {
      const toFind = new Set<number>([ADDED, REMOVED]);
      for (let i = upperLimit - 1; i >= 0; i--) {
        if (toFind.has(diff[i]![1])) {
          toFind.delete(diff[i]![1]);
          if (diff[i]![0].slice(-1) !== "\n") {
            diff.splice(i + 1, 0, ["\n\\ No newline at end of file\n", NO_LINE_END_EOF_WARNING]);
          }
          if (toFind.size === 0) {
            break;
          }
        }
      }
    }

    const cutOff = Math.max(this.commonLineThreshold, this.contextLines);
    let hunkCapture: number | false = false;
    let sameCount = 0;
    let toRange = 0;
    let fromRange = 0;
    let toStart = 1;
    let fromStart = 1;
    let i = 0;
    for (i = 0; i < diff.length; i++) {
      const entry = diff[i]!;
      if (entry[1] === OLD) {
        if (hunkCapture === false) {
          fromStart++;
          toStart++;
          continue;
        }
        sameCount++;
        toRange++;
        fromRange++;
        if (sameCount === cutOff) {
          const contextStartOffset = hunkCapture - this.contextLines < 0 ? hunkCapture : this.contextLines;
          this.writeHunk(
            diff,
            hunkCapture - contextStartOffset,
            i - cutOff + this.contextLines + 1,
            fromStart - contextStartOffset,
            fromRange - cutOff + contextStartOffset + this.contextLines,
            toStart - contextStartOffset,
            toRange - cutOff + contextStartOffset + this.contextLines,
            output,
          );
          fromStart += fromRange;
          toStart += toRange;
          hunkCapture = false;
          sameCount = 0;
          toRange = 0;
          fromRange = 0;
        }
        continue;
      }
      sameCount = 0;
      if (entry[1] === NO_LINE_END_EOF_WARNING) {
        continue;
      }
      this.changed = true;
      if (hunkCapture === false) {
        hunkCapture = i;
      }
      if (entry[1] === ADDED) {
        toRange++;
      }
      if (entry[1] === REMOVED) {
        fromRange++;
      }
    }
    if (hunkCapture === false) {
      return;
    }
    // The loop ran to the end: `$i` is the last index, as PHP's foreach leaves it.
    const last = diff.length - 1;
    const contextStartOffset = hunkCapture - this.contextLines < 0 ? hunkCapture : this.contextLines;
    const contextEndOffset = Math.min(sameCount, this.contextLines);
    fromRange -= sameCount;
    toRange -= sameCount;
    this.writeHunk(
      diff,
      hunkCapture - contextStartOffset,
      last - sameCount + contextEndOffset + 1,
      fromStart - contextStartOffset,
      fromRange + contextStartOffset + contextEndOffset,
      toStart - contextStartOffset,
      toRange + contextStartOffset + contextEndOffset,
      output,
    );
  }

  private writeHunk(diff: readonly DiffEntry[], diffStartIndex: number, diffEndIndex: number, fromStart: number, fromRange: number, toStart: number, toRange: number, output: string[]): void {
    if (this.addLineNumbers) {
      output.push(`@@ -${fromStart}`);
      if (!this.collapseRanges || fromRange !== 1) {
        output.push(`,${fromRange}`);
      }
      output.push(` +${toStart}`);
      if (!this.collapseRanges || toRange !== 1) {
        output.push(`,${toRange}`);
      }
      output.push(" @@\n");
    } else {
      output.push("@@ @@\n");
    }
    for (let i = diffStartIndex; i < diffEndIndex; i++) {
      const entry = diff[i];
      if (entry === undefined) {
        continue;
      }
      if (entry[1] === ADDED) {
        this.changed = true;
        output.push(`+${entry[0]}`);
      } else if (entry[1] === REMOVED) {
        this.changed = true;
        output.push(`-${entry[0]}`);
      } else if (entry[1] === OLD) {
        output.push(` ${entry[0]}`);
      } else if (entry[1] === NO_LINE_END_EOF_WARNING) {
        output.push(this.emitNoLineEndEofWarning ? entry[0] : "\n");
      } else if (this.emitDiffLineEndWarning && entry[1] === DIFF_LINE_END_WARNING) {
        output.push(` ${entry[0]}`);
      }
    }
  }
}
