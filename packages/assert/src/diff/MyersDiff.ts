// sebastian/diff 9.0.1's `MyersDiff` (Story 4.4): Myers' linear-space diff,
// as `Differ` calls it. Internal to the grader.
import { ADDED, OLD, REMOVED } from "./Differ";

/** One diff entry: a token and its kind (`OLD`, `ADDED`, `REMOVED`, or a warning kind). */
export type DiffEntry = [token: string, kind: number];

export class MyersDiff {
  calculate(from: readonly string[], to: readonly string[]): DiffEntry[] {
    const diff: DiffEntry[] = [];
    this.diffRange(from, 0, from.length, to, 0, to.length, diff);
    return this.normalize(diff);
  }

  private normalize(diff: readonly DiffEntry[]): DiffEntry[] {
    const result: DiffEntry[] = [];
    let i = 0;
    const n = diff.length;
    while (i < n) {
      if (diff[i]![1] === OLD) {
        result.push(diff[i]!);
        i++;
        continue;
      }
      const adds: DiffEntry[] = [];
      while (i < n && diff[i]![1] !== OLD) {
        if (diff[i]![1] === REMOVED) {
          result.push(diff[i]!);
        } else {
          adds.push(diff[i]!);
        }
        i++;
      }
      result.push(...adds);
    }
    return result;
  }

  private diffRange(a: readonly string[], aLo: number, aHi: number, b: readonly string[], bLo: number, bHi: number, out: DiffEntry[]): void {
    while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) {
      out.push([a[aLo]!, OLD]);
      aLo++;
      bLo++;
    }
    const suffix: DiffEntry[] = [];
    while (aLo < aHi && bLo < bHi && a[aHi - 1] === b[bHi - 1]) {
      aHi--;
      bHi--;
      suffix.push([a[aHi]!, OLD]);
    }
    const n = aHi - aLo;
    const m = bHi - bLo;
    if (n === 0) {
      for (let j = bLo; j < bHi; j++) {
        out.push([b[j]!, ADDED]);
      }
    } else if (m === 0) {
      for (let i = aLo; i < aHi; i++) {
        out.push([a[i]!, REMOVED]);
      }
    } else {
      const [xs, ys, xe, ye] = this.findMiddleSnake(a, aLo, aHi, b, bLo, bHi);
      this.diffRange(a, aLo, aLo + xs, b, bLo, bLo + ys, out);
      for (let i = xs; i < xe; i++) {
        out.push([a[aLo + i]!, OLD]);
      }
      this.diffRange(a, aLo + xe, aHi, b, bLo + ye, bHi, out);
    }
    for (let i = suffix.length - 1; i >= 0; i--) {
      out.push(suffix[i]!);
    }
  }

  private findMiddleSnake(a: readonly string[], aLo: number, aHi: number, b: readonly string[], bLo: number, bHi: number): [number, number, number, number] {
    const n = aHi - aLo;
    const m = bHi - bLo;
    const delta = n - m;
    const deltaIsOdd = (delta & 1) !== 0;
    const maxD = Math.trunc((n + m + 1) / 2);
    const offset = maxD + 1;
    const size = 2 * maxD + 2;
    const vf: number[] = Array.from({ length: size }, () => 0);
    const vb: number[] = Array.from({ length: size }, () => 0);
    for (let d = 0; d <= maxD; d++) {
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && vf[offset + k - 1]! < vf[offset + k + 1]!) ? vf[offset + k + 1]! : vf[offset + k - 1]! + 1;
        let y = x - k;
        const xs = x;
        const ys = y;
        while (x < n && y < m && a[aLo + x] === b[bLo + y]) {
          x++;
          y++;
        }
        vf[offset + k] = x;
        if (deltaIsOdd) {
          const kb = delta - k;
          if (kb >= -(d - 1) && kb <= d - 1 && vf[offset + k]! + vb[offset + kb]! >= n) {
            return [xs, ys, x, y];
          }
        }
      }
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && vb[offset + k - 1]! < vb[offset + k + 1]!) ? vb[offset + k + 1]! : vb[offset + k - 1]! + 1;
        let y = x - k;
        const xs = x;
        const ys = y;
        while (x < n && y < m && a[aLo + n - 1 - x] === b[bLo + m - 1 - y]) {
          x++;
          y++;
        }
        vb[offset + k] = x;
        if (!deltaIsOdd) {
          const kf = delta - k;
          if (kf >= -d && kf <= d && vf[offset + kf]! + vb[offset + k]! >= n) {
            return [n - x, m - y, n - xs, m - ys];
          }
        }
      }
    }
    throw new Error("No middle snake found");
  }
}
