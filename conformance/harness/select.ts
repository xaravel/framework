// The harness's Test ID selection (Story 5.4; FR-9): filters, the seeded fast
// sample and the `bun test -t` name pattern. Pure: everything it reads is
// passed in.
//
//   --component <c>  IDs whose Component (the first path segment of their shard
//                    under `conformance/expectations/`) is `c`
//   --id <glob>      IDs the glob matches as a whole: `*` matches any run of
//                    characters, `?` matches one, everything else is literal
//                    (including `\`); matching takes time proportional to
//                    |glob| × |ID|, with no exponential backtracking (see
//                    `globSource`)
//   --story <s>      the `test_ids` of `stories/<s>.md` (read by the caller),
//                    matched as ownership's `covers` does: a listed `X` also
//                    selects its dataset rows `X#<key>`
//
// A repeated filter takes the union of its values; different filters
// intersect. The fast sample is the first `min(size, n)` IDs ranked by the hex
// SHA-256 of `<seed>\n<id>`, ties broken by `compareUnits`, so it depends only
// on the seed and the selected set.
import { createHash } from "node:crypto";
import { compareUnits } from "../../tools/inventory/inventory";
import { covers } from "../../tools/ownership/ownership";

/** The fast-mode sample size. */
export const FAST_SAMPLE = 100;

/** A seed the CLI accepts. */
export const SEED = /^[A-Za-z0-9._-]{1,64}$/;

export interface Filters {
  /** `--component` values; empty means no component filter. */
  readonly components: readonly string[];
  /** `--id` globs; empty means no id filter. */
  readonly ids: readonly string[];
  /** The Story manifest's `test_ids` (a listed `X` also admits its rows `X#<key>`), or null without `--story`. */
  readonly story: readonly string[] | null;
}

const SYNTAX = /[\^$\\.*+?()[\]{}|/]/;

/** One `*`-free glob segment as RegExp source: `?` one character, the rest literal. */
function segmentSource(segment: string): string {
  let source = "";
  for (const char of segment) {
    if (char === "?") {
      source += "[\\s\\S]";
    } else {
      source += SYNTAX.test(char) ? `\\${char}` : char;
    }
  }
  return source;
}

/**
 * The unanchored RegExp source for `glob`, numbering its capture groups from
 * `firstGroup`, and how many it uses. The caller anchors it at the start and
 * puts what must follow the glob (`$`, or `: ` for a test name) after it.
 *
 * Matching takes time proportional to |glob| × |candidate|, with no exponential
 * backtracking: every segment between two `*`s is an atomic lazy search,
 * `(?=([\s\S]*?<seg>))\<n>`, that takes the segment's earliest occurrence
 * and is never backtracked into. Earliest occurrence is exact for a glob, and
 * only the last segment searches up to the tail, unlike the exponential
 * backtracking of `[\s\S]*` per `*`.
 */
export function globSource(glob: string, firstGroup: number): { source: string; groups: number } {
  const segments = glob.split("*");
  let source = segmentSource(segments[0]!);
  let groups = 0;
  for (let index = 1; index < segments.length - 1; index++) {
    const segment = segments[index]!;
    if (segment === "") {
      continue;
    }
    // (?:\n) keeps a following literal digit out of the backreference.
    source += `(?=([\\s\\S]*?${segmentSource(segment)}))(?:\\${firstGroup + groups})`;
    groups++;
  }
  if (segments.length > 1) {
    source += `[\\s\\S]*${segmentSource(segments.at(-1)!)}`;
  }
  return { source, groups };
}

/** A whole-string RegExp for `glob`: `*` any run, `?` one character, the rest literal; matching takes time proportional to |glob| × |candidate|, with no exponential backtracking. */
export function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${globSource(glob, 1).source}$`, "u");
}

/** The first `min(size, ids.length)` of `ids` ranked by SHA-256(`<seed>\n<id>`), sorted by `compareUnits`. */
export function sampleIds(ids: Iterable<string>, seed: string, size: number): string[] {
  const ranked = [...new Set(ids)].map((id) => ({ id, rank: createHash("sha256").update(`${seed}\n${id}`).digest("hex") }));
  ranked.sort((a, b) => compareUnits(a.rank, b.rank) || compareUnits(a.id, b.id));
  return ranked
    .slice(0, Math.max(0, size))
    .map((entry) => entry.id)
    .sort(compareUnits);
}

/** The IDs of `universe` (id → Component) that every given filter admits, sorted by `compareUnits`. */
export function selectIds(universe: ReadonlyMap<string, string>, filters: Filters): string[] {
  const components = new Set(filters.components);
  const globs = filters.ids.map(globToRegExp);
  const story = filters.story === null ? null : new Set(filters.story);
  const selected: string[] = [];
  for (const [id, component] of universe) {
    if (components.size > 0 && !components.has(component)) {
      continue;
    }
    if (globs.length > 0 && !globs.some((glob) => glob.test(id))) {
      continue;
    }
    if (story !== null && !covers(story, id)) {
      continue;
    }
    selected.push(id);
  }
  return selected.sort(compareUnits);
}

/** The `bun test -t` pattern that matches exactly `ids` as whole test names. */
export function namePattern(ids: Iterable<string>): string {
  return `^(?:${[...ids].map((id) => id.replace(/[\^$\\.*+?()[\]{}|/]/g, "\\$&")).join("|")})$`;
}
