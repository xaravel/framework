// Xaravel Tests for Story 8.6 (Framework Agent operating instructions and stop
// rules; FR-114, UJ-4, NFR-10, ESC-8.6-1).
//
// The Maintainer wrote the `## Story loop and stop rules` section of
// `AGENTS.md` under ESC-8.6-1. These tests pin its required elements (the
// loop steps in order, every FR-114 trigger slug) and the fixed rule phrases
// ESC-8.6-1 item 2 allows (the own-Test-IDs, carry-on and no-stub rules), not
// the whole prose. They read the real `AGENTS.md`
// and the tracked files read-only; every mutation runs on an in-memory copy.
// A missing marker, section, file or `git` failure is a violation, never a
// skip.
import { expect } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { TRIGGERS } from "../../../tools/escalations/escalations";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const OPEN_MARKER = "<!-- bmad:context -->";
const CLOSE_MARKER = "<!-- /bmad:context -->";
const HEADING = "## Story loop and stop rules";
const PRD = join(root, "_bmad-output", "planning-artifacts", "prds", "prd-xaravel-2026-10-15", "prd.md");

function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

const AGENTS = readOrNull(join(root, "AGENTS.md"));
const REAL = AGENTS ?? "";

/** The indexes of the `lines` that equal `marker` once trimmed. */
function markerLines(lines: readonly string[], marker: string): number[] {
  const found: number[] = [];
  lines.forEach((line, i) => {
    if (line.trim() === marker) {
      found.push(i);
    }
  });
  return found;
}

/**
 * The `## Story loop and stop rules` section of `text` (heading excluded, up to the next `## ` heading or EOF), and
 * the violations of the marker and placement rules. A missing section yields an empty section.
 */
export function storyLoopSection(text: string | null): { section: string; violations: string[] } {
  if (text === null) {
    return { section: "", violations: ["AGENTS.md missing"] };
  }
  const violations: string[] = [];
  const lines = text.split("\n");
  const opens = markerLines(lines, OPEN_MARKER);
  const closes = markerLines(lines, CLOSE_MARKER);
  if (opens.length !== 1) {
    violations.push(`expected exactly one ${OPEN_MARKER} marker, found ${opens.length}`);
  }
  if (closes.length !== 1) {
    violations.push(`expected exactly one ${CLOSE_MARKER} marker, found ${closes.length}`);
  }
  if (opens.length === 1 && closes.length === 1 && opens[0]! > closes[0]!) {
    violations.push(`${OPEN_MARKER} must come before ${CLOSE_MARKER}`);
  }
  const headings = lines.flatMap((line, i) => (line.trim() === HEADING ? [i] : []));
  if (headings.length === 0) {
    violations.push(`"${HEADING}" section missing`);
    return { section: "", violations };
  }
  if (headings.length > 1) {
    violations.push(`"${HEADING}" appears ${headings.length} times`);
  }
  const start = headings[0]!;
  if (closes.length !== 1 || start < closes[0]!) {
    violations.push(`"${HEADING}" must sit outside the managed block, after ${CLOSE_MARKER}`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i]!) || lines[i]!.trim() === OPEN_MARKER || lines[i]!.trim() === CLOSE_MARKER) {
      end = i;
      break;
    }
  }
  return { section: lines.slice(start + 1, end).join("\n"), violations };
}

/** The seven loop steps, in order: a label for the message and the test each item must pass. */
const LOOP_STEPS: ReadonlyArray<{ label: string; matches: (item: string) => boolean }> = [
  { label: "read stories/<story-id>.md, PORTING.md and the DIV- records", matches: (item) => item.includes("stories/<story-id>.md") && item.includes("PORTING.md") && item.includes("DIV-") },
  { label: "translate", matches: (item) => /\btranslate\b/i.test(item) },
  { label: "harness --fast --story", matches: (item) => item.includes("harness --fast --story") },
  { label: "implement", matches: (item) => /\bimplement\b/i.test(item) },
  { label: "own Expectations lines", matches: (item) => /own Expectations lines/.test(item) },
  { label: "full Story tests with harness --story", matches: (item) => /full Story tests/.test(item) && item.includes("harness --story") },
  { label: "open the PR", matches: (item) => /open the PR/i.test(item) },
];

/** Violations of the loop rule: exactly seven numbered items, item i matching step i. */
export function loopViolations(section: string): string[] {
  const items = section.split("\n").filter((line) => /^\d+\. /.test(line));
  const violations: string[] = [];
  if (items.length !== LOOP_STEPS.length) {
    violations.push(`the loop must have ${LOOP_STEPS.length} numbered steps, found ${items.length}`);
  }
  LOOP_STEPS.forEach((step, i) => {
    const item = items[i];
    if (item === undefined) {
      violations.push(`loop step ${i + 1} must say ${step.label}, got: nothing`);
    } else if (!step.matches(item)) {
      violations.push(`loop step ${i + 1} must say ${step.label}, got: ${JSON.stringify(item)}`);
    }
  });
  return violations;
}

/** Violations of the trigger rule: every slug appears as (`<slug>`) on a bullet line. */
export function triggerViolations(section: string, triggers: readonly string[]): string[] {
  const bullets = section.split("\n").filter((line) => /^\s*[-*] /.test(line));
  return triggers.filter((slug) => !bullets.some((line) => line.includes(`(\`${slug}\`)`))).map((slug) => `trigger \`${slug}\` missing: no bullet names (\`${slug}\`)`);
}

/** Violations of the stop rules: an Escalation stops only its own Test IDs, and the agent carries on with the others. */
export function stopRuleViolations(section: string): string[] {
  const violations: string[] = [];
  if (!/Escalation stops work on its own Test IDs only/.test(section)) {
    violations.push("missing rule: an Escalation stops work on its own Test IDs only");
  }
  if (!/Carry on with [^.]*other Test IDs/i.test(section)) {
    violations.push("missing rule: carry on with the other Test IDs");
  }
  return violations;
}

/** Violations of the stub rule: never stub another Component, and `blocked-by:<component>` for a later one. */
export function stubRuleViolations(section: string): string[] {
  const violations: string[] = [];
  if (!/Never stub, fake or partially implement another Component/.test(section)) {
    violations.push("missing rule: never stub, fake or partially implement another Component");
  }
  if (!section.includes("`blocked-by:<component>`")) {
    violations.push("missing rule: a test that needs a later Component is marked `blocked-by:<component>`");
  }
  return violations;
}

/** Violations among tracked `paths`: any whose basename is CLAUDE.md in any case, plus a present root CLAUDE.md. */
export function claudeMdPathViolations(paths: readonly string[], rootPresent: boolean): string[] {
  const violations = paths.filter((path) => basename(path).toLowerCase() === "claude.md").map((path) => `CLAUDE.md must not exist: ${path} is tracked`);
  if (rootPresent) {
    violations.push("CLAUDE.md must not exist: CLAUDE.md is present at the repository root");
  }
  return violations;
}

/** Violations of the no-CLAUDE.md rule for the repository at `dir`, via `git ls-files -z`. A git failure is a violation. */
export function claudeMdViolations(dir: string): string[] {
  let proc: Bun.SyncSubprocess<"pipe", "pipe">;
  try {
    proc = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    return [`git ls-files failed: ${String(error)}`];
  }
  if (proc.exitCode !== 0) {
    return [`git ls-files failed with exit ${proc.exitCode}: ${proc.stderr.toString().trim()}`];
  }
  const paths = proc.stdout
    .toString()
    .split("\0")
    .filter((path) => path !== "");
  const rootPresent = existsSync(join(dir, "CLAUDE.md")) || existsSync(join(dir, "claude.md"));
  return claudeMdPathViolations(paths, rootPresent);
}

/** The `- ` bullets of the PRD's `#### FR-114` block, before `**Consequences (testable):**`; null when either is missing. */
function fr114Bullets(prd: string | null): string[] | null {
  if (prd === null) {
    return null;
  }
  const lines = prd.split("\n");
  const start = lines.findIndex((line) => line.startsWith("#### FR-114"));
  if (start < 0) {
    return null;
  }
  const end = lines.findIndex((line, i) => i > start && line.startsWith("**Consequences (testable):**"));
  if (end < 0) {
    return null;
  }
  return lines.slice(start + 1, end).filter((line) => line.startsWith("- "));
}

/** `text` with `from` replaced by `to`; fails the test when `from` is absent, so a mutation never silently no-ops. */
function mutate(text: string, from: string, to: string): string {
  expect(`${text.includes(from)}: ${from}`).toBe(`true: ${from}`);
  return text.replace(from, () => to);
}

function sectionOf(text: string): string {
  return storyLoopSection(text).section;
}

/** The section of `AGENTS.md` with `from` replaced by `to` inside the section only (the managed block is untouched). */
function mutatedSection(from: string, to: string): string {
  const at = REAL.indexOf(HEADING);
  expect(at).toBeGreaterThanOrEqual(0);
  return sectionOf(REAL.slice(0, at) + mutate(REAL.slice(at), from, to));
}


// ---------------------------------------------------------------------------
// XT-conformance-163 (AC1): the loop, outside the managed block, and no CLAUDE.md

xaravelTest(
  "XT-conformance-163",
  "AGENTS.md has exactly one bmad:context marker pair and the `## Story loop and stop rules` section after the close marker, whose numbered list holds the seven loop steps in order (manifest, PORTING.md and DIV records; translate; harness --fast --story; implement; own Expectations lines; full Story tests; open the PR); no CLAUDE.md is tracked at any depth or present at the root (FR-114, UJ-4, NFR-10)",
  () => {
    // The real repository.
    const real = storyLoopSection(AGENTS);
    expect(real.violations).toEqual([]);
    expect(real.section).not.toBe("");
    expect(loopViolations(real.section)).toEqual([]);
    expect(claudeMdViolations(root)).toEqual([]);

    // Missing file.
    expect(storyLoopSection(null).violations).toEqual(["AGENTS.md missing"]);

    // Section moved inside the managed block.
    const sectionText = REAL.slice(REAL.indexOf(HEADING));
    const before = REAL.slice(0, REAL.indexOf(HEADING));
    const inside = mutate(before, CLOSE_MARKER, `${sectionText}\n${CLOSE_MARKER}`);
    expect(storyLoopSection(inside).violations.some((v) => v.includes("outside the managed block"))).toBe(true);

    // Markers missing or duplicated.
    expect(storyLoopSection(mutate(REAL, OPEN_MARKER, "")).violations.some((v) => v.includes(OPEN_MARKER))).toBe(true);
    expect(storyLoopSection(mutate(REAL, CLOSE_MARKER, "")).violations.some((v) => v.includes(CLOSE_MARKER))).toBe(true);
    expect(storyLoopSection(mutate(REAL, OPEN_MARKER, `${OPEN_MARKER}\n${OPEN_MARKER}`)).violations.some((v) => v.includes(`exactly one ${OPEN_MARKER}`))).toBe(true);
    expect(storyLoopSection(mutate(REAL, CLOSE_MARKER, `${CLOSE_MARKER}\n${CLOSE_MARKER}`)).violations.some((v) => v.includes(`exactly one ${CLOSE_MARKER}`))).toBe(true);

    // Markers swapped: open after close.
    const swappedMarkers = mutate(mutate(mutate(REAL, OPEN_MARKER, "@@OPEN@@"), CLOSE_MARKER, OPEN_MARKER), "@@OPEN@@", CLOSE_MARKER);
    expect(storyLoopSection(swappedMarkers).violations).toContain(`${OPEN_MARKER} must come before ${CLOSE_MARKER}`);

    // Heading duplicated.
    expect(storyLoopSection(mutate(REAL, HEADING, `${HEADING}\n\n${HEADING}`)).violations).toContain(`"${HEADING}" appears 2 times`);

    // Section missing: reported, and every other check reports against the empty section.
    const missing = storyLoopSection(mutate(REAL, HEADING, "## Something else"));
    expect(missing.violations).toContain(`"${HEADING}" section missing`);
    expect(missing.section).toBe("");
    expect(loopViolations(missing.section).length).toBeGreaterThan(0);
    expect(triggerViolations(missing.section, TRIGGERS).length).toBe(TRIGGERS.length);
    expect(stopRuleViolations(missing.section).length).toBe(2);
    expect(stubRuleViolations(missing.section).length).toBe(2);

    // Loop steps reordered (3 and 4 swapped) or dropped (5 deleted).
    const lines = real.section.split("\n");
    const step3 = lines.find((line) => line.startsWith("3. "))!;
    const step4 = lines.find((line) => line.startsWith("4. "))!;
    const step5 = lines.find((line) => line.startsWith("5. "))!;
    const swapped = sectionOf(mutate(mutate(mutate(REAL, step3, "@@3@@"), step4, step3.replace(/^3\./, "4.")), "@@3@@", step4.replace(/^4\./, "3.")));
    const swappedViolations = loopViolations(swapped);
    expect(swappedViolations.some((v) => v.startsWith("loop step 3 must say harness --fast --story"))).toBe(true);
    expect(swappedViolations.some((v) => v.startsWith("loop step 4 must say implement"))).toBe(true);
    const dropped = loopViolations(mutatedSection(`${step5}\n`, ""));
    expect(dropped.some((v) => v.startsWith("loop step 5 must say own Expectations lines"))).toBe(true);
    expect(dropped.some((v) => v.includes("found 6"))).toBe(true);

    // CLAUDE.md, tracked at any depth in any case, or present at the root.
    expect(claudeMdPathViolations(["AGENTS.md", "packages/support/README.md"], false)).toEqual([]);
    expect(claudeMdPathViolations(["CLAUDE.md"], false)).toEqual(["CLAUDE.md must not exist: CLAUDE.md is tracked"]);
    expect(claudeMdPathViolations(["packages/support/claude.MD"], false)).toEqual(["CLAUDE.md must not exist: packages/support/claude.MD is tracked"]);
    expect(claudeMdPathViolations([], true)).toEqual(["CLAUDE.md must not exist: CLAUDE.md is present at the repository root"]);

    // A git failure is a violation: a directory that is not a repository, and one that does not exist.
    const notRepo = mkdtempSync(join(tmpdir(), "xt-agents-"));
    try {
      const outside = claudeMdViolations(notRepo);
      expect(outside.length).toBe(1);
      expect(outside[0]!.startsWith("git ls-files failed")).toBe(true);
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
    const absent = claudeMdViolations(join(notRepo, "gone"));
    expect(absent.length).toBe(1);
    expect(absent[0]!.startsWith("git ls-files failed")).toBe(true);
  },
);

// ---------------------------------------------------------------------------
// XT-conformance-164 (AC2): every FR-114 trigger, and own Test IDs only

xaravelTest(
  "XT-conformance-164",
  "the `## Story loop and stop rules` section lists every FR-114 trigger slug from TRIGGERS as (`<slug>`) on a bullet, the PRD's FR-114 trigger bullet count equals TRIGGERS.length, and it says an Escalation stops work on its own Test IDs only and the agent carries on with the other Test IDs (FR-114.2, UJ-4, NFR-10)",
  () => {
    // The trigger list matches the PRD on both sides.
    const bullets = fr114Bullets(readOrNull(PRD));
    expect(bullets).not.toBeNull();
    expect(TRIGGERS.length).toBeGreaterThan(0);
    expect(bullets!.length).toBe(TRIGGERS.length);
    expect(fr114Bullets(null)).toBeNull();
    expect(fr114Bullets("#### FR-114: x\n- a\n")).toBeNull();

    // The real section.
    const section = storyLoopSection(AGENTS).section;
    expect(section).not.toBe("");
    expect(triggerViolations(section, TRIGGERS)).toEqual([]);
    expect(stopRuleViolations(section)).toEqual([]);

    // A trigger dropped, for every slug; and a slug present only in prose, not on a bullet.
    for (const slug of TRIGGERS) {
      const without = mutatedSection(`(\`${slug}\`)`, "");
      expect(triggerViolations(without, TRIGGERS)).toEqual([`trigger \`${slug}\` missing: no bullet names (\`${slug}\`)`]);
    }
    expect(triggerViolations("Raise one (`flaky`) when a test flakes.", ["flaky"])).toEqual(["trigger `flaky` missing: no bullet names (`flaky`)"]);

    // The own-IDs and carry-on rules dropped.
    const ownIds = mutatedSection("An Escalation stops work on its own Test IDs only.", "");
    expect(stopRuleViolations(ownIds)).toEqual(["missing rule: an Escalation stops work on its own Test IDs only"]);
    const carryOn = mutatedSection("Carry on with the Story's other Test IDs.", "");
    expect(stopRuleViolations(carryOn)).toEqual(["missing rule: carry on with the other Test IDs"]);
  },
);

// ---------------------------------------------------------------------------
// XT-conformance-165 (AC3): no stubbing, and blocked-by:<component>

xaravelTest(
  "XT-conformance-165",
  "the `## Story loop and stop rules` section forbids stubbing, faking or partially implementing another Component, and names `blocked-by:<component>` for a test that needs a Component from a later Phase (FR-114, UJ-4, NFR-10)",
  () => {
    const section = storyLoopSection(AGENTS).section;
    expect(section).not.toBe("");
    expect(stubRuleViolations(section)).toEqual([]);

    const noStub = mutatedSection("Never stub, fake or partially implement another Component to make a test pass.", "");
    expect(stubRuleViolations(noStub)).toEqual(["missing rule: never stub, fake or partially implement another Component"]);
    const noBlocked = mutatedSection("`blocked-by:<component>`", "blocked");
    expect(stubRuleViolations(noBlocked)).toEqual(["missing rule: a test that needs a later Component is marked `blocked-by:<component>`"]);
  },
);
