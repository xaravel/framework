// `JMac\Testing\Diagnostics\DidYouMean` (jasonmccreary/double v1.0.1): the closest candidate within a
// threshold of a third of the longer name, by PHP's byte-wise `levenshtein`. Internal.
import { FQCN } from "../../../support/values";

/** PHP's `levenshtein` (insert, replace and delete cost 1), over the UTF-8 bytes as PHP compares them. */
function levenshtein(a: string, b: string): number {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < right.length; j++) {
      const cost = left[i] === right[j] ? 0 : 1;
      current.push(Math.min(previous[j + 1]! + 1, current[j]! + 1, previous[j]! + cost));
    }
    previous = current;
  }
  return previous[right.length]!;
}

export class DidYouMean {
  static readonly [FQCN]: string = "JMac\\Testing\\Diagnostics\\DidYouMean";

  static suggest(needle: string, candidates: readonly string[]): string | null {
    let best: string | null = null;
    let bestDistance: number | null = null;
    for (const candidate of new Set(candidates)) {
      const distance = levenshtein(needle, candidate);
      const threshold = Math.max(1, Math.floor(Math.max(Buffer.byteLength(needle, "utf8"), Buffer.byteLength(candidate, "utf8")) / 3));
      if (distance > threshold) {
        continue;
      }
      if (bestDistance === null || distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }
}
