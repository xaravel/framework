// The Xaravel consequence files (Story 5.9; FR-115, AD-15).
//
//   bun tools/xt-coverage/consequences.ts [--root <dir>] [--check]
//       (`bun run xt:consequences`) writes, for each Component in
//       `CONSEQUENCE_SOURCES`, `conformance/xaravel-consequences/<component>.jsonl`
//       from the PRD's FR consequences and the spine's AD rules; `--check`
//       writes nothing and fails naming each file that differs from what it
//       would write (the drift check: the files are never edited by hand)
//
// Consequence IDs are mechanical:
//   FR-<n>.<k>  the k-th (1-based) top-level bullet of FR-n's
//               `**Consequences (testable):**` list in the PRD
//   AD-<n>.<k>  the k-th top-level bullet of AD-n's `**Rule:**` list in the
//               spine
// A bullet's text is the bullet without its `- ` marker, with its nested lines,
// whitespace collapsed to single spaces. A list ends at the first non-blank
// line that is neither one of its bullets (`- ` at the bullets' indent) nor
// indented deeper than them (or at the section's end).
//
// Each line is `{"id","text"}` (JSON.stringify: tool data, not a framework
// value), LF-terminated; every FR line (by n, then k) comes before every AD
// line (by n, then k). An FR without a consequence list, or an AD without a
// rule list, fails the run, naming it.
//
// Exit codes: 0 written or up to date, 1 drift or a failure, 2 usage error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PRD_FILE = "_bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md";
export const SPINE_FILE = "_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md";
export const CONSEQUENCES_DIR = "conformance/xaravel-consequences";

/** A Component's sources: its FRs and its ADs (the spine's Capability Map row). */
export interface ConsequenceSource {
  readonly frs: readonly number[];
  readonly ads: readonly number[];
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * The Components with a consequence file. The Conformance System takes FR-1..9 and FR-111..116 and the ADs of its
 * Capability Map row. `runtime` takes the ADs the spine gives `packages/runtime` that have a Rule list (AD-26's is a
 * table) and no FRs (ESC-9.1-3). From `contracts` on, a Component's row is what its Epic declares on its `**Covers:**`
 * line (the ADs it covers or implements, with a Rule list, and the FRs it covers or supports, with a consequence
 * list; an FR without one, such as FR-26, is dropped), plus AD-2 and AD-6 for every package
 * (MAINT-2026-10-22-consequence-rows). Each is added in an Infrastructure change before the Component's first Story
 * with Xaravel Tests (ESC-5.9-1, ESC-9.1-3).
 */
export const CONSEQUENCE_SOURCES: Readonly<Record<string, ConsequenceSource>> = {
  conformance: { frs: [...range(1, 9), ...range(111, 116)], ads: [15, 16, 17, 21, 28] },
  runtime: { frs: [], ads: [2, 5, 6, 9, 10, 23] },
  // Epic 10: "Covers: AD-1, AD-27; supports FR-10, FR-19 and FR-21", plus AD-2 and AD-6.
  contracts: { frs: [10, 19, 21], ads: [1, 2, 6, 27] },
  // Epic 11: "Covers: FR-26." FR-26 has no consequence list, so only AD-2 and AD-6.
  macroable: { frs: [], ads: [2, 6] },
  // Epic 12: "Covers: FR-26." FR-26 has no consequence list, so only AD-2 and AD-6.
  conditionable: { frs: [], ads: [2, 6] },
  // Epic 13: "Covers: FR-26." FR-26 has no consequence list, so only AD-2 and AD-6.
  reflection: { frs: [], ads: [2, 6] },
  // Epic 14: "Covers: FR-23.", plus AD-2 and AD-6.
  collections: { frs: [23], ads: [2, 6] },
};

export interface Consequence {
  readonly id: string;
  readonly text: string;
}

/** A consequence ID a Xaravel Test's consequence string may declare, as a whole token. */
export const CONSEQUENCE_TOKEN = /(?<![\w.-])(?:FR|AD)-\d+\.\d+(?![\w.])/g;

/** The consequence IDs `consequence` declares (whole tokens; a bare `FR-3` declares nothing), in order, unique. */
export function declaredConsequences(consequence: string): string[] {
  return [...new Set(consequence.match(CONSEQUENCE_TOKEN) ?? [])];
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function collapse(lines: readonly string[]): string {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The top-level bullets of the list that starts after line `start` in `lines`, which are indented `indent` spaces,
 * stopping at `end` (exclusive). Blank lines before the first bullet are skipped; null when no bullet follows.
 */
function bulletsAfter(lines: readonly string[], start: number, end: number, indent: number): string[] | null {
  let i = start + 1;
  while (i < end && lines[i]!.trim() === "") {
    i++;
  }
  const marker = `${" ".repeat(indent)}- `;
  if (i >= end || !lines[i]!.startsWith(marker)) {
    return null;
  }
  const bullets: string[][] = [];
  for (; i < end; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      bullets.at(-1)!.push("");
      continue;
    }
    if (line.startsWith(marker)) {
      bullets.push([line.slice(marker.length)]);
      continue;
    }
    if (indentOf(line) > indent) {
      bullets.at(-1)!.push(line);
      continue;
    }
    break;
  }
  return bullets.map(collapse);
}

/** The sections of `text` whose heading matches `heading` (group 1 the number), each as [number, first line, end line]. */
function sections(lines: readonly string[], heading: RegExp): Map<number, { start: number; end: number }> {
  const found = new Map<number, { start: number; end: number }>();
  for (let i = 0; i < lines.length; i++) {
    const match = heading.exec(lines[i]!);
    if (match === null) {
      continue;
    }
    let end = i + 1;
    while (end < lines.length && !/^#{1,6} /.test(lines[end]!)) {
      end++;
    }
    found.set(Number(match[1]), { start: i, end });
  }
  return found;
}

/** Every FR's consequence bullets in the PRD text, by FR number. */
export function prdConsequences(text: string): Map<number, string[]> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = new Map<number, string[]>();
  for (const [n, { start, end }] of sections(lines, /^#### FR-(\d+):/)) {
    const at = lines.slice(start, end).findIndex((line) => line.trim() === "**Consequences (testable):**");
    if (at === -1) {
      continue;
    }
    const bullets = bulletsAfter(lines, start + at, end, 0);
    if (bullets !== null) {
      out.set(n, bullets);
    }
  }
  return out;
}

/** Every AD's rule bullets in the spine text, by AD number. */
export function spineRules(text: string): Map<number, string[]> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = new Map<number, string[]>();
  for (const [n, { start, end }] of sections(lines, /^### AD-(\d+) /)) {
    const at = lines.slice(start, end).findIndex((line) => line === "- **Rule:**");
    if (at === -1) {
      continue;
    }
    const bullets = bulletsAfter(lines, start + at, end, 2);
    if (bullets !== null) {
      out.set(n, bullets);
    }
  }
  return out;
}

/** The consequences of `source` from the PRD and spine texts; throws naming an FR or AD with no list. */
export function consequencesFor(source: ConsequenceSource, prd: string, spine: string): Consequence[] {
  const frs = prdConsequences(prd);
  const ads = spineRules(spine);
  const out: Consequence[] = [];
  for (const n of [...source.frs].sort((a, b) => a - b)) {
    const bullets = frs.get(n);
    if (bullets === undefined) {
      throw new Error(`${PRD_FILE}: FR-${n} has no **Consequences (testable):** list`);
    }
    bullets.forEach((text, k) => out.push({ id: `FR-${n}.${k + 1}`, text }));
  }
  for (const n of [...source.ads].sort((a, b) => a - b)) {
    const bullets = ads.get(n);
    if (bullets === undefined) {
      throw new Error(`${SPINE_FILE}: AD-${n} has no - **Rule:** list`);
    }
    bullets.forEach((text, k) => out.push({ id: `AD-${n}.${k + 1}`, text }));
  }
  return out;
}

/** The file text of `consequences`. */
export function renderConsequences(consequences: readonly Consequence[]): string {
  return consequences.map((consequence) => `${JSON.stringify({ id: consequence.id, text: consequence.text })}\n`).join("");
}

/** The repo-relative consequence file of `component`. */
export function consequenceFile(component: string): string {
  return `${CONSEQUENCES_DIR}/${component}.jsonl`;
}

/** Reads `component`'s consequence file under `root`; throws when it does not exist or a line is not `{"id","text"}`. */
export function readConsequences(root: string, component: string): Consequence[] {
  const file = consequenceFile(component);
  const path = join(root, file);
  if (!existsSync(path)) {
    throw new Error(`${file} does not exist`);
  }
  const out: Consequence[] = [];
  const ids = new Set<string>();
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (line === "") {
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${index + 1}: not JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      const record = value as { id?: unknown; text?: unknown };
      if (typeof value !== "object" || value === null || typeof record.id !== "string" || typeof record.text !== "string") {
        throw new Error(`${file}:${index + 1}: expected {"id","text"}`);
      }
      if (ids.has(record.id)) {
        throw new Error(`${file}:${index + 1}: ${record.id} repeats`);
      }
      ids.add(record.id);
      out.push({ id: record.id, text: record.text });
    });
  return out;
}

/** Every consequence file's expected text under `root`, by repo-relative path. */
export function expectedFiles(root: string): Map<string, string> {
  const prd = readFileSync(join(root, PRD_FILE), "utf8");
  const spine = readFileSync(join(root, SPINE_FILE), "utf8");
  const files = new Map<string, string>();
  for (const [component, source] of Object.entries(CONSEQUENCE_SOURCES)) {
    files.set(consequenceFile(component), renderConsequences(consequencesFor(source, prd, spine)));
  }
  return files;
}

class UsageError extends Error {}

export function main(argv: readonly string[]): number {
  let root = resolve(import.meta.dir, "..", "..");
  let check = false;
  try {
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i]!;
      if (arg === "--check") {
        check = true;
      } else if (arg === "--root") {
        const value = argv[++i];
        if (value === undefined || value === "") {
          throw new UsageError("--root needs a value");
        }
        root = resolve(value);
      } else {
        throw new UsageError(`Unknown argument: ${arg}`);
      }
    }
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\nUsage: bun tools/xt-coverage/consequences.ts [--root <dir>] [--check]\n`);
      return 2;
    }
    throw error;
  }
  let files: Map<string, string>;
  try {
    files = expectedFiles(root);
  } catch (error) {
    process.stderr.write(`xt:consequences: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  if (check) {
    const drift = [...files].filter(([file, text]) => !existsSync(join(root, file)) || readFileSync(join(root, file), "utf8") !== text).map(([file]) => file);
    for (const file of drift) {
      process.stderr.write(`xt:consequences: ${file} differs from ${PRD_FILE} and ${SPINE_FILE}; run bun run xt:consequences\n`);
    }
    if (drift.length > 0) {
      return 1;
    }
    process.stdout.write(`xt:consequences: ${files.size} file(s) up to date\n`);
    return 0;
  }
  for (const [file, text] of files) {
    mkdirSync(join(root, CONSEQUENCES_DIR), { recursive: true });
    writeFileSync(join(root, file), text);
    process.stdout.write(`Wrote ${file} (${text === "" ? 0 : text.split("\n").length - 1} consequences).\n`);
  }
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
