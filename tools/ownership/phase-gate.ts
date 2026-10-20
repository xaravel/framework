// The Phase 1 gate (Story 8.8; FR-8, AD-16).
//
// FR-8: `PORTING.md`, the Divergence Records DIV-1..12 and the pilot must be on
// `main` before any Phase 1 Story starts. `ownership pr` calls
// `phaseGateViolations` for a `story/<id>` PR whose base manifest's `epic` is
// above `PHASE_0_LAST_EPIC`. It reads only the base checkout (`main`), never
// the PR head, and reports one `phase gate:` line per unmet condition:
//   - `PORTING.md` exists and passes `checkPorting` (`porting:check`);
//   - `decisions/DIV-1.md` .. `DIV-12.md` all exist (one line listing the
//     missing ones);
//   - `docs/porting/pilot-report.md` exists and is not blank;
//   - `decisions/PHASE-0-EXIT.md` is signed by the Maintainer: frontmatter
//     `decision: approved`, `decided_by: Maintainer`, `date: YYYY-MM-DD`, and a
//     non-blank body line that is not a heading (`exitSignatureProblems`).
//
// The gate holds no state: it passes for every later Phase 1 PR while `main`
// keeps those files. They are Protected Paths, and the required `check` job's
// `porting:check` and `divergence:check` keep them valid on every PR into
// `main`. The check verifies the form of the signature, not who wrote it; only
// the Maintainer writes `PHASE-0-EXIT.md`.
//
// `checkPorting` imports `oxc-parser`, so it is loaded with a dynamic
// `import()` only when a Phase 1 manifest is judged: the tools that import
// ownership.ts never need it.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../boost-framework/src/data";

/** The last epic of Phase 0 (epics.md, `### Phase 0`); any higher epic is Phase 1 or later. */
export const PHASE_0_LAST_EPIC = 8;

/** The Maintainer-signed Phase 0 exit decision, repo-relative. */
export const PHASE_0_EXIT = "decisions/PHASE-0-EXIT.md";

/** The pilot report (Story 8.7), repo-relative. */
export const PILOT_REPORT = "docs/porting/pilot-report.md";

/** The porting rulebook, repo-relative (tools/porting/porting.ts `PORTING_FILE`). */
export const PORTING = "PORTING.md";

/** The Divergence Records the gate requires, repo-relative: `decisions/DIV-1.md` .. `DIV-12.md`. */
export const DIV_RECORDS: readonly string[] = Array.from({ length: 12 }, (_, i) => `decisions/DIV-${i + 1}.md`);

const SUFFIX = "(FR-8, Story 8.8)";

/** The epic numbers under `### Phase 0` in epics.md's Epic List (`#### Epic N` up to the next `### ` heading). */
export function phase0Epics(epicsText: string): number[] {
  const epics: number[] = [];
  let inPhase0 = false;
  for (const line of epicsText.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("### ")) {
      inPhase0 = /^### Phase 0\b/.test(line);
      continue;
    }
    const match = inPhase0 ? /^#### Epic ([1-9]\d*)\b/.exec(line) : null;
    if (match !== null) {
      epics.push(Number(match[1]));
    }
  }
  return epics;
}

/** A real calendar date `YYYY-MM-DD`. */
function isDate(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** Every reason `text` is not a Maintainer-signed decision; empty when it is. */
export function exitSignatureProblems(text: string): string[] {
  const parsed = parseFrontmatter(text);
  if (parsed === null) {
    return ["has no frontmatter"];
  }
  if (typeof parsed === "string") {
    return [parsed];
  }
  const problems: string[] = [];
  const { fields, body } = parsed;
  if (fields["decision"] !== "approved") {
    problems.push(`decision is ${JSON.stringify(fields["decision"] ?? null)}, not "approved"`);
  }
  if (fields["decided_by"] !== "Maintainer") {
    problems.push(`decided_by is ${JSON.stringify(fields["decided_by"] ?? null)}, not "Maintainer"`);
  }
  if (!isDate(fields["date"])) {
    problems.push(`date is ${JSON.stringify(fields["date"] ?? null)}, not a YYYY-MM-DD date`);
  }
  if (!body.split("\n").some((line) => line.trim() !== "" && !line.trimStart().startsWith("#"))) {
    problems.push("body has no text beyond headings");
  }
  return problems;
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The `phase gate:` violations of Story `storyId` in `epic`, judged against the base checkout at `root`. */
export async function phaseGateViolations(root: string, storyId: string, epic: number): Promise<string[]> {
  if (epic <= PHASE_0_LAST_EPIC) {
    return [];
  }
  const lead = `phase gate: Story ${storyId} (epic ${epic}, Phase 1 or later) needs`;
  const violations: string[] = [];

  if (!isFile(join(root, PORTING))) {
    violations.push(`${lead} ${PORTING} on main: missing ${SUFFIX}`);
  } else {
    try {
      const { checkPorting } = await import("../porting/porting");
      const found = checkPorting(root).violations;
      if (found.length > 0) {
        violations.push(`${lead} ${PORTING} on main passing porting:check: ${found.length} violation(s), first: ${found.slice(0, 3).join("; ")} ${SUFFIX}`);
      }
    } catch (error) {
      violations.push(`${lead} ${PORTING} on main passing porting:check: cannot run it: ${message(error)} ${SUFFIX}`);
    }
  }

  const missing = DIV_RECORDS.filter((path) => !isFile(join(root, path)));
  if (missing.length > 0) {
    violations.push(`${lead} DIV-1..12 on main: missing ${missing.join(", ")} ${SUFFIX}`);
  }

  const report = join(root, PILOT_REPORT);
  if (!isFile(report)) {
    violations.push(`${lead} the pilot report ${PILOT_REPORT} on main: missing ${SUFFIX}`);
  } else if (readFileSync(report, "utf8").trim() === "") {
    violations.push(`${lead} the pilot report ${PILOT_REPORT} on main: blank ${SUFFIX}`);
  }

  const exit = join(root, PHASE_0_EXIT);
  if (!isFile(exit)) {
    violations.push(`${lead} a Maintainer-signed ${PHASE_0_EXIT} on main: missing ${SUFFIX}`);
  } else {
    const problems = exitSignatureProblems(readFileSync(exit, "utf8"));
    if (problems.length > 0) {
      violations.push(`${lead} a Maintainer-signed ${PHASE_0_EXIT} on main: ${problems.join("; ")} ${SUFFIX}`);
    }
  }
  return violations;
}
