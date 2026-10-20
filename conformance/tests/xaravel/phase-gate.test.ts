// Xaravel Tests for Story 8.8 (the Phase 1 gate; FR-8, AD-16).
//
// `ownership pr` fails a Phase 1 or later Story PR unless the base checkout
// holds `PORTING.md` passing `checkPorting`, DIV-1..12, the pilot report and a
// Maintainer-signed `decisions/PHASE-0-EXIT.md` (tools/ownership/phase-gate.ts).
// The base checkouts here are hermetic temp roots: `gateRoot()` copies the
// real gate inputs and writes a signed fixture exit file (the real one is the
// Maintainer's to write); each failing case mutates its own copy. The CLI runs
// against a `Bun.serve` fake of the GitHub API.
import { afterAll, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EPICS, STORIES_DIR } from "../../../tools/ownership/ownership";
import { DIV_RECORDS, exitSignatureProblems, PHASE_0_EXIT, PHASE_0_LAST_EPIC, PILOT_REPORT, phase0Epics, phaseGateViolations, PORTING } from "../../../tools/ownership/phase-gate";
import { gateRoot, put, SIGNED_EXIT } from "./phase-gate-fixtures";
import type { PrFile } from "../../../tools/protected-paths/protected-paths";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "ownership", "ownership.ts");
const SUFFIX = "(FR-8, Story 8.8)";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tracked(dir: string): string {
  dirs.push(dir);
  return dir;
}

/** A base checkout with the manifests of Stories 9.1 (support), 8.8 (conformance) and 14.1 (collections); the gate open unless `open` is false. */
function base(open: boolean): string {
  const dir = tracked(open ? gateRoot() : mkdtempSync(join(tmpdir(), "xt-phase-gate-")));
  for (const [id, component] of [
    ["9.1", "support"],
    ["8.8", "conformance"],
    ["14.1", "collections"],
  ] as const) {
    put(dir, `${STORIES_DIR}/${id}.md`, `---\nstory_id: "${id}"\nepic: ${id.split(".")[0]}\ncomponent: ${component}\nstatus: in-progress\ntest_ids:\n  - "T-${id}"\n---\n\n# Story ${id}\n`);
  }
  return dir;
}

const added = (filename: string): PrFile => ({ filename, status: "added" });
const removed = (filename: string): PrFile => ({ filename, status: "removed" });

/** Runs `ownership pr` for PR 7 (head `ref`, `files`) against `rootDir`; the fake serves no contents, and records every path asked for. */
async function runPr(ref: string, files: PrFile[], rootDir: string): Promise<{ code: number; stdout: string; stderr: string; paths: string[] }> {
  const paths: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      paths.push(url.pathname);
      const repo = "/repos/xaravel/framework";
      if (url.pathname === `${repo}/pulls/7`) {
        return Response.json({ number: 7, head: { sha: "a".repeat(40), ref }, base: { sha: "c".repeat(40) }, changed_files: files.length });
      }
      if (url.pathname === `${repo}/pulls/7/files`) {
        return Response.json(files);
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const proc = Bun.spawn([process.execPath, CLI, "pr", "--repo", "xaravel/framework", "--pr", "7", "--root", rootDir], {
      cwd: root,
      env: { PATH: process.env["PATH"] ?? "", GITHUB_API_URL: `http://127.0.0.1:${server.port}`, GH_TOKEN: "t" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    return { code, stdout, stderr, paths };
  } finally {
    await server.stop(true);
  }
}

const gateLines = (stderr: string): string[] =>
  stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("phase gate:"));

const LEAD = "phase gate: Story 9.1 (epic 9, Phase 1 or later) needs";

xaravelTest("XT-conformance-168", "a Story manifest with an epic in Phase 1 or later fails ownership pr with a phase gate: line for each unmet condition unless main has PORTING.md passing checkPorting, DIV-1..12, the pilot report and a Maintainer-signed PHASE-0-EXIT.md (FR-8)", async () => {
  // Phase 0 is the Epic List's `### Phase 0` epics, 1..PHASE_0_LAST_EPIC.
  const epics = phase0Epics(readFileSync(join(root, EPICS), "utf8"));
  expect(epics).toEqual(Array.from({ length: PHASE_0_LAST_EPIC }, (_, i) => i + 1));
  expect(PHASE_0_LAST_EPIC).toBe(8);
  expect(phase0Epics("### Phase 0: X\n\n#### Epic 1: A\n#### Epic 2: B\n\n### Phase 1: Y\n\n#### Epic 3: C\n")).toEqual([1, 2]);

  // The gate open: no violation.
  const open = tracked(gateRoot());
  expect(await phaseGateViolations(open, "9.1", 9)).toEqual([]);

  const gate = async (mutate: (dir: string) => void): Promise<string[]> => {
    const dir = tracked(gateRoot());
    mutate(dir);
    return phaseGateViolations(dir, "9.1", 9);
  };

  // PORTING.md missing, or failing porting:check (a required section removed): the first 3 violations and the count.
  expect(await gate((dir) => rmSync(join(dir, PORTING)))).toEqual([`${LEAD} PORTING.md on main: missing ${SUFFIX}`]);
  const failing = await gate((dir) => {
    const text = readFileSync(join(dir, PORTING), "utf8");
    expect(text).toContain("\n## Idiom table\n");
    writeFileSync(join(dir, PORTING), text.replace("\n## Idiom table\n", "\n"));
  });
  expect(failing).toHaveLength(1);
  expect(failing[0]).toStartWith(`${LEAD} PORTING.md on main passing porting:check: `);
  expect(failing[0]).toMatch(/: [1-9]\d* violation\(s\), first: /);
  expect(failing[0]).toContain('PORTING.md: missing section "## Idiom table"');
  expect(failing[0]).toEndWith(SUFFIX);
  // At most 3 violations are quoted.
  const many = await gate((dir) => writeFileSync(join(dir, PORTING), "## A\n## B\n## C\n## D\n"));
  expect(many).toHaveLength(1);
  expect(many[0]!.split("; ")).toHaveLength(3);

  // A DIV record missing.
  expect(await gate((dir) => rmSync(join(dir, "decisions/DIV-7.md")))).toEqual([`${LEAD} DIV-1..12 on main: missing decisions/DIV-7.md ${SUFFIX}`]);

  // The pilot report missing or blank.
  expect(await gate((dir) => rmSync(join(dir, PILOT_REPORT)))).toEqual([`${LEAD} the pilot report ${PILOT_REPORT} on main: missing ${SUFFIX}`]);
  expect(await gate((dir) => writeFileSync(join(dir, PILOT_REPORT), " \n\n"))).toEqual([`${LEAD} the pilot report ${PILOT_REPORT} on main: blank ${SUFFIX}`]);

  // The exit file missing or unsigned: each names the file and the failed field.
  const exitLine = (problem: string): string[] => [`${LEAD} a Maintainer-signed ${PHASE_0_EXIT} on main: ${problem} ${SUFFIX}`];
  expect(await gate((dir) => rmSync(join(dir, PHASE_0_EXIT)))).toEqual(exitLine("missing"));
  const cases: [string, string][] = [
    ["# Phase 0 exit\n\nApproved.\n", "has no frontmatter"],
    [SIGNED_EXIT.replace("decided_by: Maintainer", "decided_by: orchestrator (Maintainer's session)"), 'decided_by is "orchestrator (Maintainer\'s session)", not "Maintainer"'],
    [SIGNED_EXIT.replace("decision: approved", "decision: rejected"), 'decision is "rejected", not "approved"'],
    [SIGNED_EXIT.replace("date: 2026-10-20", "date: 2026-13-45"), 'date is "2026-13-45", not a YYYY-MM-DD date'],
    [SIGNED_EXIT.replace("date: 2026-10-20", "date: 20 October 2026"), 'date is "20 October 2026", not a YYYY-MM-DD date'],
    [SIGNED_EXIT.replace("date: 2026-10-20\n", ""), "date is null, not a YYYY-MM-DD date"],
    ["---\ndecision: approved\ndecided_by: Maintainer\ndate: 2026-10-20\n---\n\n# Phase 0 exit\n\n", "body has no text beyond headings"],
    ["---\ndecision: [\n---\n\nText.\n", "frontmatter is not valid YAML"],
  ];
  for (const [text, problem] of cases) {
    const lines = await gate((dir) => writeFileSync(join(dir, PHASE_0_EXIT), text));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith(`${LEAD} a Maintainer-signed ${PHASE_0_EXIT} on main: ${problem}`);
    expect(lines[0]).toEndWith(SUFFIX);
  }
  // Every unmet field is reported, not just the first.
  expect(exitSignatureProblems("---\ndecision: pending\n---\n")).toEqual([
    'decision is "pending", not "approved"',
    'decided_by is null, not "Maintainer"',
    "date is null, not a YYYY-MM-DD date",
    "body has no text beyond headings",
  ]);
  // The form matches the Maintainer's existing signed rulings.
  expect(exitSignatureProblems(readFileSync(join(root, "decisions/MAINT-2026-10-19-epic-6-items.md"), "utf8"))).toEqual([]);
  expect(exitSignatureProblems(SIGNED_EXIT)).toEqual([]);

  // Everything missing: one line per unmet condition, the twelve DIVs on one line.
  const empty = tracked(mkdtempSync(join(tmpdir(), "xt-phase-gate-")));
  const all = await phaseGateViolations(empty, "9.1", 9);
  expect(all).toEqual([
    `${LEAD} PORTING.md on main: missing ${SUFFIX}`,
    `${LEAD} DIV-1..12 on main: missing ${DIV_RECORDS.join(", ")} ${SUFFIX}`,
    `${LEAD} the pilot report ${PILOT_REPORT} on main: missing ${SUFFIX}`,
    `${LEAD} a Maintainer-signed ${PHASE_0_EXIT} on main: missing ${SUFFIX}`,
  ]);

  // The CLI: a story/9.1 PR within its scope on a base without the inputs exits 1 with the phase gate: lines.
  const closed = base(false);
  const run = await runPr("story/9.1", [added("packages/support/src/A.ts")], closed);
  expect(run.code).toBe(1);
  expect(run.stdout).toBe("");
  expect(gateLines(run.stderr)).toEqual(all);
  expect(run.stderr).toBe(`Ownership violations (AD-16):\n${all.map((line) => `  ${line}`).join("\n")}\n`);
  // Other violations are still reported beside the gate's.
  const both = await runPr("story/9.1", [added("tools/x.ts")], closed);
  expect(both.code).toBe(1);
  expect(both.stderr).toContain("out of scope: tools/x.ts");
  expect(gateLines(both.stderr)).toEqual(all);

  // The workflow installs the base checkout's locked dependencies, with no scripts, right before the check.
  const workflow = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ownership.yml"), "utf8")) as {
    jobs: Record<string, { steps: { name?: string; run?: string }[] }>;
  };
  const steps = workflow.jobs["ownership"]!.steps;
  const install = steps.findIndex((step) => step.run === "bun install --frozen-lockfile --ignore-scripts");
  expect(install).toBeGreaterThan(-1);
  expect(steps[install + 1]!.name).toBe("Check edit ownership");
});

xaravelTest("XT-conformance-169", "once the gate passes, no later Phase 1 Story PR gets a phase gate: violation, whatever its head holds; Phase 0 Stories and non-Story branches are never gated, and CI keeps the inputs valid (FR-8)", async () => {
  const open = base(true);
  for (const epic of [9, 14, 71]) {
    expect(await phaseGateViolations(open, `${epic}.1`, epic)).toEqual([]);
  }

  // A sequence of Phase 1 Story PRs on the same base all pass.
  for (const files of [[added("packages/support/src/A.ts")], [added("packages/support/src/B.ts"), added("conformance/escalations/ESC-9.1-1.md")], [added("conformance/oracle-requests/9.1.jsonl")]]) {
    expect(await runPr("story/9.1", files, open)).toMatchObject({ code: 0, stdout: "Ownership OK: PR #7: every file is within Story 9.1's allowed paths.\n", stderr: "" });
  }
  expect(await runPr("story/14.1", [added("packages/collections/src/Collection.ts")], open)).toMatchObject({ code: 0, stderr: "" });

  // A head that deletes the gate inputs: only the path rule fails it; the gate reads the base, never the head.
  const deleting = [PORTING, ...DIV_RECORDS, PILOT_REPORT, PHASE_0_EXIT].map(removed);
  const head = await runPr("story/9.1", deleting, open);
  expect(head.code).toBe(1);
  expect(gateLines(head.stderr)).toEqual([]);
  for (const prFile of deleting) {
    expect(head.stderr).toContain(`out of scope: ${prFile.filename} `);
  }
  expect(head.paths.some((path) => path.includes("/contents/"))).toBe(false);

  // A Phase 0 Story, planning/* and bot/* branches are never gated, even on a base with none of the inputs.
  const closed = base(false);
  expect(await phaseGateViolations(closed, "8.8", 8)).toEqual([]);
  expect(await phaseGateViolations(closed, "1.1", 1)).toEqual([]);
  expect(await runPr("story/8.8", [added("packages/conformance/x.ts")], closed)).toMatchObject({ code: 0, stderr: "" });
  expect(await runPr("planning/x", [added("docs/x.md")], closed)).toMatchObject({ code: 0, stderr: "" });
  const bot = await runPr("bot/x", [added("docs/x.md")], closed);
  expect(bot.code).toBe(1);
  expect(gateLines(bot.stderr)).toEqual([]);

  // The required check job keeps the inputs valid on every PR into main.
  const ci = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as { jobs: Record<string, { steps: { run?: string }[] }> };
  const runs = ci.jobs["check"]!.steps.map((step) => step.run);
  expect(runs).toContain("bun run porting:check");
  expect(runs).toContain("bun run divergence:check");
});
