// Xaravel Tests for Story 5.6 (Expectations line ownership; FR-3, AD-16).
// These run under plain `bun test` until the harness's `xaravelTest` lands in
// Story 5.9. The base checkout is a hermetic temp root holding the Story
// manifests, Escalations and decisions; the PR's content at its merge base and
// head comes from a map, through `evaluatePr`'s `content`, or from a
// `Bun.serve` fake of the GitHub API for the `pr` command.
import { afterAll, expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { escalationDigest } from "../../../tools/escalations/escalations";
import { BOT_LOGIN, type ContentSide, evaluatePr } from "../../../tools/ownership/ownership";
import { scanPortedBlocks } from "../../../tools/ownership/ported-blocks";
import type { PrFile } from "../../../tools/protected-paths/protected-paths";
import { xaravelTest } from "../../../packages/assert/src/index";
import { writeGateInputs } from "./phase-gate-fixtures";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "ownership", "ownership.ts");
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixture

const CLASS = "Illuminate\\Tests\\Support\\SupportLinesTest";
const A = `${CLASS}::testA`;
const B = `${CLASS}::testB`;
const X = `${CLASS}::testX`;
const Y = `${CLASS}::testY`;
const Z = `${CLASS}::testZ`;
const S1 = "conformance/expectations/support/framework/tests/Support/SupportLinesTest.jsonl";
const S2 = "conformance/expectations/support/framework/tests/Support/SupportOtherTest.jsonl";
const PORTED = "packages/support/tests/ported/Support/SupportLinesTest.test.ts";
const BASE_SHA = "b".repeat(40);
const HEAD_SHA = "a".repeat(40);

/** Story 11.1 (component support) owns A, the dataset test X (so its rows X#k) and the one row Z#1. */
function manifest(storyId: string, testIds: string[]): string {
  return `---\nstory_id: "${storyId}"\nepic: ${storyId.split(".")[0]}\ncomponent: support\nstatus: in-progress\ntest_ids:\n${testIds.map((id) => `  - ${JSON.stringify(id)}`).join("\n")}\n---\n\n# Story ${storyId}\n`;
}

function line(id: string, status: string, variant = "none"): string {
  return `${JSON.stringify({ id, variant, status, reason: status === "skip" ? "not-ported-yet" : null, adapted: null, escalation: null })}\n`;
}

function escalation(testIds: string[]): string {
  return `---\ntest_ids:\n${testIds.map((id) => `  - ${JSON.stringify(id)}`).join("\n")}\ntrigger: upstream-test-wrong\nproposed: "Demote the line."\nevidence: "The Oracle disagrees."\n---\n\nWhy.\n`;
}

function decision(escalationText: string, verdict = "approved"): string {
  return `---\ndecision: ${verdict}\nescalation_sha256: "${escalationDigest(escalationText)}"\n---\n\nRuled.\n`;
}

function baseRoot(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "xt-ownership-lines-"));
  dirs.push(dir);
  for (const [path, text] of Object.entries({ "stories/11.1.md": manifest("11.1", [A, X, `${Z}#1`]), ...files })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const modified = (filename: string): PrFile => ({ filename, status: "modified" });
const added = (filename: string): PrFile => ({ filename, status: "added" });
const removed = (filename: string): PrFile => ({ filename, status: "removed" });

/** Content at the merge base and the head from two maps; a missing path is absent there. */
function contents(base: Record<string, string>, head: Record<string, string>): (path: string, side: ContentSide) => string | null {
  return (path, side) => (side === "base" ? base : head)[path] ?? null;
}

function judge(dir: string, headRef: string, files: PrFile[], base: Record<string, string>, head: Record<string, string>, author: { login: string; type: string } | null = null): string[] {
  return evaluatePr(dir, { headRef, files, changedFiles: files.length, content: contents(base, head), mergeBase: BASE_SHA, headSha: HEAD_SHA, author }).violations;
}

const unownedLine = (key: string, shards: string): string => `unowned expectation: ${key} changes in ${shards}, but Story 11.1's test_ids do not list it (AD-16)`;

// ---------------------------------------------------------------------------
// XT-conformance-116

xaravelTest("XT-conformance-116", "a Story PR changing Expectations lines outside its test_ids fails and lists each one; its own lines, dataset rows of its tests and moved lines pass (FR-4.3, AD-16.5)", () => {
  const dir = baseRoot();
  const before = { [S1]: line(A, "skip") + line(B, "skip") + line(`${X}#0`, "skip") + line(`${Y}#0`, "skip") };

  // Its own line, and a row of its dataset test X: no violation.
  expect(judge(dir, "story/11.1", [modified(S1)], before, { [S1]: line(A, "pass") + line(B, "skip") + line(`${X}#0`, "pass") + line(`${Y}#0`, "skip") })).toEqual([]);

  // Another Story's lines (B, and the row Y#0 of an unlisted test), and a removed line: one violation each, sorted.
  expect(judge(dir, "story/11.1", [modified(S1)], before, { [S1]: line(A, "skip") + line(B, "fail-known") + line(`${X}#0`, "skip") + line(`${Y}#0`, "pass", "none") + line(B, "skip", "sqlite") })).toEqual([
    unownedLine(`${B} [none]`, S1),
    unownedLine(`${B} [sqlite]`, S1),
    unownedLine(`${Y}#0 [none]`, S1),
  ]);
  expect(judge(dir, "story/11.1", [modified(S1)], before, { [S1]: line(A, "skip") + line(`${X}#0`, "skip") + line(`${Y}#0`, "skip") })).toEqual([unownedLine(`${B} [none]`, S1)]);

  // A line moved unchanged to another shard is no change, whether by a rename or across two changed shards.
  const moved = { [S1]: line(A, "skip") + line(`${X}#0`, "skip") + line(`${Y}#0`, "skip"), [S2]: line(B, "skip") };
  expect(judge(dir, "story/11.1", [modified(S1), added(S2)], before, moved)).toEqual([]);
  expect(judge(dir, "story/11.1", [{ filename: S2, previous_filename: S1, status: "renamed" }], before, { [S2]: before[S1]! })).toEqual([]);
  // Moved and changed: a change, naming both shards.
  expect(judge(dir, "story/11.1", [modified(S1), added(S2)], before, { ...moved, [S2]: line(B, "pass") })).toEqual([unownedLine(`${B} [none]`, `${S2}, ${S1}`)]);
  // A shard the PR deletes: every line of it is removed, so changed.
  expect(judge(dir, "story/11.1", [removed(S2)], { [S2]: line(B, "skip") }, {})).toEqual([unownedLine(`${B} [none]`, S2)]);

  // Fail closed: an unparsable line, unreadable content, content the API had none of, and no content at all.
  expect(judge(dir, "story/11.1", [modified(S1)], before, { [S1]: `${line(A, "skip")}{"id":1}\n` })).toEqual([
    `unparsable expectation: ${S1}:2 at ${HEAD_SHA} is not an Expectations line with a string id, variant and status; failing closed (AD-16)`,
  ]);
  const throwing = (): string | null => {
    throw new Error("HTTP 500");
  };
  expect(evaluatePr(dir, { headRef: "story/11.1", files: [modified(S1)], changedFiles: 1, content: throwing, mergeBase: BASE_SHA, headSha: HEAD_SHA }).violations).toEqual([
    `unreadable content: ${S1} at ${BASE_SHA} could not be read; failing closed (AD-16)`,
    `unreadable content: ${S1} at ${HEAD_SHA} could not be read; failing closed (AD-16)`,
  ]);
  expect(judge(dir, "story/11.1", [modified(S1)], before, {})).toEqual([`unreadable content: ${S1} at ${HEAD_SHA} could not be read; failing closed (AD-16)`]);
  expect(evaluatePr(dir, { headRef: "story/11.1", files: [added(S2)], changedFiles: 1 }).violations).toEqual([`unreadable content: ${S2} at the head commit could not be read; failing closed (AD-16)`]);
});

xaravelTest("XT-conformance-244", "a Story PR changing portedTest blocks outside its test_ids fails and lists each one; a dynamic id or an unbalanced file fails closed (AD-16.5)", () => {
  const dir = baseRoot();
  const file = (blocks: string[]): string => [`import { Assert, portedTest } from "@xaravel/assert";`, `const BASE = ${JSON.stringify(CLASS)};`, ...blocks].join("\n") + "\n";
  const block = (id: string, body = "Assert.assertTrue(true);"): string => `portedTest(${JSON.stringify(id)}, {}, () => {\n  ${body}\n});`;
  const before = { [PORTED]: file([block(A), block(B), "portedTest(`${BASE}::testX`, { dataset: [[1]] }, (n) => {\n  Assert.assertTrue(n === 1);\n});", block(Z)]) };

  // Its own blocks (A, the template-id dataset test X, and Z whose row Z#1 it lists): no violation; a comment outside a block is no block change.
  const own = file([block(A, "Assert.assertTrue(1 === 1);"), block(B), "portedTest(`${BASE}::testX`, { dataset: [[1], [2]] }, (n) => {\n  Assert.assertTrue(n > 0);\n});", block(Z, "Assert.assertTrue(!false);")]);
  expect(judge(dir, "story/11.1", [modified(PORTED)], before, { [PORTED]: `// portedTest("${B}", {}, () => {});\n${own}` })).toEqual([]);

  // B's block changes: named with its head file and line.
  expect(judge(dir, "story/11.1", [modified(PORTED)], before, { [PORTED]: file([block(A), block(B, "Assert.assertTrue(false);"), before[PORTED]!.split("\n").slice(8).join("\n")]) })).toEqual([
    `unowned ported test: ${B} at ${PORTED}:6 changes, but Story 11.1's test_ids do not list it (AD-16)`,
  ]);
  // A removed block is a change too, named at its base line.
  expect(judge(dir, "story/11.1", [removed(PORTED)], before, {})).toEqual([`unowned ported test: ${B} at ${PORTED}:6 changes, but Story 11.1's test_ids do not list it (AD-16)`]);

  // A dynamic id fails closed, whatever it would resolve to.
  expect(judge(dir, "story/11.1", [modified(PORTED)], before, { [PORTED]: `${before[PORTED]!}portedTest(makeId(), {}, () => {});\n` })).toEqual([
    `unresolved ported test id: ${PORTED}:15 has a portedTest whose id is not a string literal or a template of top-level string constants; failing closed (AD-16)`,
  ]);
  // So does an unbalanced file.
  expect(judge(dir, "story/11.1", [modified(PORTED)], before, { [PORTED]: `${before[PORTED]!}portedTest("${A}", {}, () => {\n` })).toEqual([
    `unparsable ported test file: ${PORTED} at ${HEAD_SHA}: an unclosed "{" on line 15; failing closed (AD-16)`,
  ]);
  // A file outside packages/*/tests/ported/ is not read.
  expect(evaluatePr(dir, { headRef: "story/11.1", files: [modified("packages/support/src/A.ts")], changedFiles: 1 }).violations).toEqual([]);

  // The scanner itself: strings, templates, comments and regexes hide `portedTest(`; ids resolve only statically.
  const scanned = scanPortedBlocks(
    [
      `const ID = "T";`,
      `const s = "portedTest('no')"; const r = /portedTest\\(/; const t = \`portedTest(\${"no"})\`;`,
      `/* portedTest("no", {}, () => {}) */`,
      "portedTest(`${ID}#x`, {}, () => {});",
      `portedTest(ID, {}, () => {});`,
      `portedTest("a" + "b", {}, () => {});`,
      `const alias = portedTest;`,
      `import { portedTest as p } from "x";`,
    ].join("\n"),
  );
  expect(scanned.blocks?.map((entry) => [entry.id, entry.line])).toEqual([
    ["T#x", 4],
    [null, 5],
    [null, 6],
    [null, 7],
    [null, 8],
  ]);
  expect(scanPortedBlocks("const s = 'open").error).toBe("an unterminated string on line 1");
});

xaravelTest("XT-conformance-245", "the pr command reads changed shards at the merge base from the compare API and at the head, and lists each unowned line (FR-4.3, AD-16.5)", async () => {
  const dir = baseRoot();
  // Story 8.8: Story 11.1 is in Phase 1, so its base also holds the Phase 1 gate's inputs.
  writeGateInputs(dir);
  const paths: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      paths.push(`${url.pathname}${url.search}`);
      const repo = "/repos/xaravel/framework";
      if (url.pathname === `${repo}/pulls/7`) {
        return Response.json({ number: 7, head: { sha: HEAD_SHA, ref: "story/11.1" }, base: { sha: "c".repeat(40) }, changed_files: 1 });
      }
      if (url.pathname === `${repo}/pulls/7/files`) {
        return Response.json([modified(S1)]);
      }
      if (url.pathname === `${repo}/compare/${"c".repeat(40)}...${HEAD_SHA}`) {
        return Response.json({ merge_base_commit: { sha: BASE_SHA } });
      }
      if (url.pathname === `${repo}/contents/${S1}`) {
        const ref = url.searchParams.get("ref");
        return new Response(ref === BASE_SHA ? line(A, "skip") + line(B, "skip") : ref === HEAD_SHA ? line(A, "pass") + line(B, "pass") : "wrong ref");
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const proc = Bun.spawn([process.execPath, CLI, "pr", "--repo", "xaravel/framework", "--pr", "7", "--root", dir], {
      env: { PATH: process.env["PATH"] ?? "", GITHUB_API_URL: `http://127.0.0.1:${server.port}`, GH_TOKEN: "t" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    expect([code, stdout, stderr]).toEqual([1, "", `Ownership violations (AD-16):\n  ${unownedLine(`${B} [none]`, S1)}\n`]);
    expect(paths).toContain(`/repos/xaravel/framework/contents/${S1}?ref=${BASE_SHA}`);
    expect(paths).toContain(`/repos/xaravel/framework/contents/${S1}?ref=${HEAD_SHA}`);
  } finally {
    await server.stop(true);
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-117

xaravelTest("XT-conformance-117", "moving an entry from pass to any other status, or removing it, needs an approved Escalation listing its Test ID; bot/* branches are exempt here (FR-4.4, AD-16.8, AD-16.9)", () => {
  const ESC = "conformance/escalations/ESC-11.1-1.md";
  const DEC = "decisions/ESC-11.1-1.md";
  const before = { [S1]: line(A, "pass") + line(`${X}#0`, "pass") };
  const demoted = { [S1]: line(A, "fail-known") + line(`${X}#0`, "pass") };
  const demotion = (status: string): string => `pass demoted: ${A} [none] changes from pass to ${status} in ${S1} with no approved Escalation listing it (AD-16)`;

  // No Escalation: fails on a Story branch and on any other branch but bot/*.
  const none = baseRoot();
  expect(judge(none, "story/11.1", [modified(S1)], before, demoted)).toEqual([demotion("fail-known")]);
  expect(judge(none, "feature/x", [modified(S1)], before, demoted)).toEqual([demotion("fail-known")]);
  expect(judge(none, "story/11.1", [modified(S1)], before, { [S1]: line(A, "skip") + line(`${X}#0`, "pass") })).toEqual([demotion("skip")]);
  // A removed pass line is a demotion too.
  expect(judge(none, "story/11.1", [modified(S1)], before, { [S1]: line(`${X}#0`, "pass") })).toEqual([demotion("removed")]);
  // A pass that moves shards stays a pass; a promotion is no demotion.
  expect(judge(none, "story/11.1", [modified(S1), added(S2)], before, { [S1]: line(`${X}#0`, "pass"), [S2]: line(A, "pass") })).toEqual([]);
  expect(judge(none, "story/11.1", [modified(S1)], { [S1]: line(A, "fail-known") }, { [S1]: line(A, "pass") })).toEqual([]);
  // bot/* is exempt (Story 5.8 owns its value-level rules).
  // Story 5.8: the bot value rule allows only promotions and quarantines, so the exempt bot case is now a pass → quarantined
  // change from the xaravel-bot App with the ESC-bot it adds.
  const BOT = { login: BOT_LOGIN, type: "Bot" };
  const quarantined = `${JSON.stringify({ id: A, variant: "none", status: "quarantined", reason: null, adapted: null, escalation: "ESC-bot-1" })}\n`;
  expect(judge(none, "bot/quarantine", [modified(S1), added("conformance/escalations/ESC-bot-1.md")], before, { [S1]: quarantined + line(`${X}#0`, "pass") }, BOT)).toEqual([]);
  // Story 5.8: a bot pass → skip is no longer exempt; it fails the bot value rule.
  const skipped = judge(none, "bot/promote", [modified(S1)], before, { [S1]: line(A, "skip") + line(`${X}#0`, "pass") }, BOT);
  expect(skipped).toEqual([
    `bot value: ${A} [none] in ${S1}: status "skip" is neither pass (a promotion) nor quarantined (a quarantine) (AD-16)`,
    `bot value: ${A} [none] in ${S1}: reason must be null, got "not-ported-yet" (AD-16)`,
  ]);

  // An open Escalation (no decision) does not count.
  const text = escalation([A]);
  const open = baseRoot({ [ESC]: text });
  expect(judge(open, "story/11.1", [modified(S1)], before, demoted)).toEqual([demotion("fail-known")]);
  // Nor does a rejected one, or an approval bound to other text.
  expect(judge(baseRoot({ [ESC]: text, [DEC]: decision(text, "rejected") }), "story/11.1", [modified(S1)], before, demoted)).toEqual([demotion("fail-known")]);
  expect(judge(baseRoot({ [ESC]: text, [DEC]: decision(escalation([B])) }), "story/11.1", [modified(S1)], before, demoted)).toEqual([demotion("fail-known")]);

  // An approved Escalation on base listing A: passes.
  const approved = baseRoot({ [ESC]: text, [DEC]: decision(text) });
  expect(judge(approved, "story/11.1", [modified(S1)], before, demoted)).toEqual([]);
  // One listing X approves a row X#0.
  const rows = baseRoot({ [ESC]: escalation([X]), [DEC]: decision(escalation([X])) });
  expect(judge(rows, "story/11.1", [modified(S1)], before, { [S1]: line(A, "pass") + line(`${X}#0`, "fail-known") })).toEqual([]);
  // A PR that edits an approved Escalation unbinds its decision.
  expect(judge(approved, "story/11.1", [modified(S1), modified(ESC)], { ...before, [ESC]: text }, { ...demoted, [ESC]: escalation([A, B]) })).toEqual([demotion("fail-known")]);

  // An Escalation only in the PR head, whose base decision is approved and bound to that head text: passes.
  const headOnly = baseRoot({ [DEC]: decision(text) });
  expect(judge(headOnly, "story/11.1", [modified(S1), added(ESC)], before, { ...demoted, [ESC]: text })).toEqual([]);
  // Without that decision on base it is open; its head text unreadable fails closed.
  expect(judge(baseRoot(), "story/11.1", [modified(S1), added(ESC)], before, { ...demoted, [ESC]: text })).toEqual([demotion("fail-known")]);
  expect(judge(headOnly, "story/11.1", [modified(S1), added(ESC)], before, demoted)).toEqual([`unreadable content: ${ESC} at ${HEAD_SHA} could not be read; failing closed (AD-16)`]);
});
