// Xaravel Tests for Story 8.5 (the Fidelity Review), as rebuilt by Epic 8
// action item 1 under ESC-8.5-1 (FR-111, FR-115.3, AD-15.8, AD-16).
//
// The checklist is read from the real repository. The review runs against
// hermetic fixture git repositories (the real checklist, a Story manifest, an
// Inventory, an Upstream snapshot file and a Story spec whose
// `baseline_revision` is the fixture's first commit), with the reviewer CLIs
// replaced by fake `claude` and `codex` executables selected through
// `XARAVEL_FIDELITY_CLAUDE_BIN` / `XARAVEL_FIDELITY_CODEX_BIN`. Each fake
// records its argv, working directory (and that directory's entries) and
// stdin, then answers from a per-CLI plan. Nothing here runs a real agent CLI
// or contacts a model.
import { afterAll, expect } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  appendRecords,
  buildPrompt,
  CHECKLIST_FILE,
  classifyUnavailable,
  consequenceEntries,
  dataFileExcerpt,
  dataFileReads,
  decideVerdict,
  decisionEvidence,
  EXCERPT_CAP,
  fidelityVerdicts,
  fidelityWaivers,
  evidenceGapNotes,
  evidenceGapReject,
  CORE_ITEMS,
  type FidelityWaiver,
  waivedReject,
  fileImports,
  gatherEvidence,
  importedDeclarations,
  inItemScope,
  itemXaravelTestIds,
  touchedTestFixtures,
  fitTestFixtures,
  compactOracleValue,
  COMPACT_FIXTURE_NOTE,
  inStoryScope,
  ITEM_NOTE,
  fileInStoryScope,
  findStorySpec,
  MANIFEST_STATUS_PLACEHOLDER,
  namedRuleCitations,
  normaliseManifestStatus,
  NO_PRIOR,
  PRIOR_HEADING,
  priorFindings,
  NO_EVIDENCE,
  noMention,
  parseChecklist,
  parseRecords,
  parseVerdict,
  phpDeclarationLines,
  precedenceSection,
  PROMPT_CAP,
  RECORD_KIND,
  RECORDS_HEADING,
  readActionItem,
  renderRecord,
  RETRO_ITEM_ID,
  REVIEWER_TIMEOUT_MS,
  reviewDiff,
  reviewTree,
  runFidelity,
  runReviewer,
  sourceDocComments,
  sourceSurface,
  spineRuleText,
  standingRejects,
  testUnits,
  UPSTREAM_SNAPSHOT_DIR,
  upstreamReadDirs,
  upstreamSourcesNamed,
  usedDeclarations,
  verdictSchema,
  WHOLE_FILE_CAP,
  wholeFileEvidence,
  withWholeFiles,
  xaravelTestEvidence,
  type ChecklistItem,
  type PriorFinding,
  type VerdictRecord,
} from "../../../tools/fidelity-review/fidelity-review";
import { escalationDigest } from "../../../tools/escalations/escalations";
import { approvalsClause, renderClause } from "../../../tools/story-check/story-check";
import { SPINE_FILE, spineRules } from "../../../tools/xt-coverage/consequences";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CHECKLIST = readFileSync(join(root, CHECKLIST_FILE), "utf8");
const ITEMS: ChecklistItem[] = parseChecklist(CHECKLIST);
const IDS = Array.from({ length: 10 }, (_, i) => `F-${i + 1}`);
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

const TEST_ID = "Illuminate\\Tests\\Support\\SupportFidelityTest::testA";
const MISSING_ID = "Illuminate\\Tests\\Support\\SupportFidelityTest::testGone";
/** A data-provider test: the manifest lists `DATASET_ID`, the Inventory has its rows `#a` and `#b`. */
const DATASET_ID = "Illuminate\\Tests\\Support\\SupportFidelityTest::testRows";
/** A real committed batch request whose real signed fixture is an error (`Cannot 'continue' 2 levels`). */
const ERROR_REQUEST_ID = "Illuminate\\Tests\\View\\Blade\\BladeContinueStatementsTest::testContinueStatementsWithArgumentAreCompiled";
const ERROR_FIXTURE = "conformance/fixtures/view/02cb543f0363e6d73c44b9b5d52589def1238cbd68c4eeab68dab554487db0c2.json";
const SPEC = "_bmad-output/implementation-artifacts/spec-9-1-fidelity.md";
const CHANGED = "packages/support/src/Str.ts";
const REQUESTS = "conformance/oracle-requests/9.1.jsonl";
const EPICS = "_bmad-output/planning-artifacts/epics.md";
const SPRINT = "_bmad-output/implementation-artifacts/sprint-status.yaml";
const OTHER_SPEC = "_bmad-output/implementation-artifacts/spec-9-2-other.md";
const OTHER_MANIFEST = "stories/9.2.md";

function git(dir: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { stdout: "pipe", stderr: "pipe" });
  expect([args[0], result.exitCode, result.stderr.toString()]).toEqual([args[0], 0, ""]);
  return result.stdout.toString().trim();
}

function commitAll(dir: string, message = "change"): string {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/**
 * A fixture repository: the real checklist, conformance/README.md, DIV-1, DIV-9 and consequence file, a Story 9.1
 * manifest, an Inventory and an Upstream snapshot file, committed as the base; the Story spec (baseline_revision = the
 * base); and, uncommitted, the Story's change: `CHANGED` and its Oracle request file. With `oracle`, the base also has the
 * real `conformance/oracle/` and one real error fixture, whose request id the manifest assigns.
 */
/** The sample Xaravel Tests the fixture Story assigns, so its review treats them as its own (ESC-9.10-3). */
const SAMPLE_XT_IDS = ["XT-sample-1", "XT-sample-2", "XT-sample-3", "XT-sample-4"];

function makeRepo(options: { oracle?: boolean; change?: boolean } = {}): { dir: string; base: string; spec: string } {
  const dir = tempDir("xt-fidelity-");
  const testIds = [TEST_ID, MISSING_ID, DATASET_ID, ...(options.oracle === true ? [ERROR_REQUEST_ID] : [])];
  const row = (id: string, source: string): string => JSON.stringify({ id, component: "support", kind: "unit", backends: ["none"], source, hash: "0".repeat(64), assertions: { assertSame: 1 }, oracle: { none: "pass" } });
  const files: Record<string, string> = {
    [CHECKLIST_FILE]: CHECKLIST,
    "stories/9.1.md": `---\nstory_id: "9.1"\nepic: 9\ncomponent: support\nstatus: in-progress\ntest_ids:\n${testIds.map((id) => `  - ${JSON.stringify(id)}\n`).join("")}xaravel_test_ids:\n${SAMPLE_XT_IDS.map((id) => `  - ${JSON.stringify(id)}\n`).join("")}---\n\n# Story 9.1\n`,
    "conformance/inventory/support.jsonl": [
      row(TEST_ID, "framework/tests/Support/SupportFidelityTest.php:3-5"),
      row(MISSING_ID, "framework/tests/Support/Nowhere.php:1-2"),
      row(`${DATASET_ID}#a`, "framework/tests/Support/SupportFidelityTest.php:7-7"),
      row(`${DATASET_ID}#b`, "framework/tests/Support/SupportFidelityTest.php:8-8"),
      "",
    ].join("\n"),
    "conformance/upstream/framework/tests/Support/SupportFidelityTest.php": "<?php\nclass SupportFidelityTest {\n  public function testA() {\n    $this->assertSame(3, sum(1, 2));\n  }\n  public static function rows() { return [\n    'a' => [$this->assertSame('row-a', rowA())],\n    'b' => [$this->assertSame('row-b', rowB())],\n  ]; }\n}\n",
    "packages/support/src/Base.ts": "export const base = 0;\n",
    [EPICS]: "# Epics\n\n### Story 9.1: Fidelity\n",
    // A second Story's spec and manifest: the binding leaves out only Story 9.1's spec, and every manifest's status.
    [OTHER_SPEC]: "---\ntitle: 'Story 9.2'\n---\n\n# Story 9.2\n",
    [OTHER_MANIFEST]: '---\nstory_id: "9.2"\nepic: 9\ncomponent: support\nstatus: backlog\ntest_ids: []\nxaravel_test_ids: []\n---\n\n# Story 9.2\n',
  };
  for (const [path, text] of Object.entries(files)) {
    write(dir, path, text);
  }
  for (const rel of ["conformance/README.md", "decisions/DIV-1.md", "decisions/DIV-9.md", "decisions/ESC-6.4-1.md", SPINE_FILE, "conformance/xaravel-consequences/conformance.jsonl", ...(options.oracle === true ? ["conformance/oracle", ERROR_FIXTURE] : [])]) {
    cpSync(join(root, rel), join(dir, rel), { recursive: true });
  }
  git(dir, "init", "-q");
  const base = commitAll(dir, "base");
  write(dir, SPEC, `---\ntitle: 'Story 9.1'\nbaseline_revision: '${base}'\nstatus: 'in-review'\n---\n\n# Story 9.1\n\n## Spec Change Log\n\n## Auto Run Result\n\nNot yet.\n`);
  if (options.change !== false) {
    write(dir, CHANGED, "export const added = 1; // FR-111.1\n");
    write(dir, REQUESTS, '{"id":"x","kind":"php-expr","input":{"setup":[],"exprs":["1 + 2"]}}\n');
  }
  return { dir, base, spec: join(dir, SPEC) };
}

// ---------------------------------------------------------------------------
// Fake reviewer CLIs

type Step = { kind: "answer" | "needs-token"; answer: unknown; model?: string; token?: string } | { kind: "raw"; stdout?: string; stderr?: string; code: number; echo?: boolean } | { kind: "sleep"; ms: number } | { kind: "hang" };

interface Call {
  argv: string[];
  cwd: string;
  cwdEntries: string[];
  stdin: string;
  /** The names in the fake's env. */
  env: string[];
}

const FAKE = `
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [cli, ...argv] = process.argv.slice(2);
const dir = process.env["FAKE_DIR"];
const plan = JSON.parse(readFileSync(join(dir, cli + ".json"), "utf8"));
let n = 0;
for (;; n++) {
  try { mkdirSync(join(dir, cli + "-slot-" + n)); break; } catch {}
}
const stdin = await Bun.stdin.text();
writeFileSync(join(dir, cli + "-call-" + n + ".json"), JSON.stringify({ argv, cwd: process.cwd(), cwdEntries: readdirSync(process.cwd()), stdin, env: Object.keys(process.env) }));
const step = plan[Math.min(n, plan.length - 1)];
if (step.kind === "hang") {
  // A grandchild holds stdout and stderr open; the fake itself never exits.
  Bun.spawn(["sleep", "30"], { stdout: "inherit", stderr: "inherit" });
  await Bun.sleep(30000);
}
if (step.kind === "sleep") {
  await Bun.sleep(step.ms);
  process.exit(0);
}
if (step.kind === "needs-token" && process.env["CLAUDE_CODE_OAUTH_TOKEN"] !== step.token) {
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login", modelUsage: {} }));
  process.exit(0);
}
if (step.kind === "raw") {
  // Codex echoes the prompt it was given ("user", then the prompt).
  process.stdout.write((step.echo ? "user\\n" + stdin + "\\n" : "") + (step.stdout ?? ""));
  process.stderr.write(step.stderr ?? "");
  process.exit(step.code);
}
if (cli === "claude") {
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "", structured_output: step.answer, modelUsage: { [step.model ?? "claude-fake-1"]: { inputTokens: 1 } } }));
  process.exit(0);
}
process.stderr.write("OpenAI Codex (fake)\\n--------\\nmodel: " + (step.model ?? "gpt-fake-1") + "\\nprovider: openai\\n--------\\n");
writeFileSync(argv[argv.indexOf("-o") + 1], JSON.stringify(step.answer));
process.exit(0);
`;

interface Fakes {
  env: Record<string, string | undefined>;
  calls: (cli: "claude" | "codex") => Call[];
}

/** Fake `claude` and `codex` binaries answering from `plans` (the k-th call takes step k, the last step repeating); `missing` names a CLI whose binary does not exist. */
function fakes(plans: { claude?: Step[]; codex?: Step[] }, missing: ("claude" | "codex")[] = [], extra: Record<string, string | undefined> = {}): Fakes {
  const dir = tempDir("xt-fidelity-fakes-");
  writeFileSync(join(dir, "fake.ts"), FAKE);
  const bins: Record<string, string> = {};
  for (const cli of ["claude", "codex"] as const) {
    writeFileSync(join(dir, `${cli}.json`), JSON.stringify(plans[cli] ?? [pass()]));
    const bin = join(dir, cli);
    bins[cli] = missing.includes(cli) ? join(dir, "nowhere", cli) : bin;
    writeFileSync(bin, `#!/bin/sh\nFAKE_DIR="${dir}" exec "${process.execPath}" "${join(dir, "fake.ts")}" ${cli} "$@"\n`);
    chmodSync(bin, 0o755);
  }
  return {
    env: { PATH: process.env["PATH"], HOME: process.env["HOME"], XARAVEL_FIDELITY_CLAUDE_BIN: bins["claude"], XARAVEL_FIDELITY_CODEX_BIN: bins["codex"], ...extra },
    calls: (cli) =>
      readdirSync(dir)
        .filter((name) => name.startsWith(`${cli}-call-`))
        .sort((a, b) => Number(/(\d+)\.json$/.exec(a)![1]) - Number(/(\d+)\.json$/.exec(b)![1]))
        .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as Call),
  };
}

function answers(results: Record<string, "pass" | "fail" | "n/a"> = {}, findings: Record<string, { path: string; detail: string; kind?: string }[]> = {}): Record<string, unknown>[] {
  return IDS.map((id) => ({ id, result: results[id] ?? "pass", note: `checked ${id}`, findings: findings[id] ?? [] }));
}

/** An `addressed` answer for each prior finding id, fixed unless named in `unfixed`. */
function addressed(ids: string[], unfixed: string[] = []): { id: string; fixed: boolean; note: string }[] {
  return ids.map((id) => ({ id, fixed: !unfixed.includes(id), note: `checked ${id}` }));
}

function pass(model?: string): Step {
  return { kind: "answer", answer: { items: answers() }, ...(model === undefined ? {} : { model }) };
}

function review(dir: string, env: Record<string, string | undefined>, ...extra: string[]): ReturnType<typeof runFidelity> {
  return runFidelity(["review", "--story", "9.1", "--root", dir, ...extra], env);
}

function status(dir: string): ReturnType<typeof runFidelity> {
  return runFidelity(["status", "--story", "9.1", "--root", dir], {});
}

function records(spec: string): VerdictRecord[] {
  return parseRecords(readFileSync(spec, "utf8")).map((entry) => {
    expect(entry.problem).toBeNull();
    return entry.record!;
  });
}

// ---------------------------------------------------------------------------
// XT-conformance-160 (AC1, AC4): the checklist

xaravelTest(
  "XT-conformance-160",
  "conformance/review/fidelity.md covers the Fidelity Review checklist F-1..F-10 (assertions match Upstream, no weakened expected value, no removed assertion without a DIV clause, Skip Reason precedence citing conformance/README.md#precedence and ESC-5.2-1, adapted markers, Oracle error fixtures, Xaravel Test consequences, no stub or fake of another Component, @asyncRoot tags, Oracle request setup and exprs); F-7 makes the review check that each Xaravel Test verifies the behaviour it claims; the reviewer prompt and verdict schema are built from it (FR-111.1, FR-111.4, FR-115.3)",
  () => {
    expect(ITEMS.map((item) => item.id)).toEqual(IDS);
    const byId = new Map(ITEMS.map((item) => [item.id, `${item.title}\n${item.body}`]));
    const phrases: Record<string, string[]> = {
      "F-1": ["Upstream", "assertion"],
      "F-2": ["expected value", "weakened"],
      "F-3": ["removed", "DIV clause"],
      "F-4": ["Skip Reason", "precedence", "(../README.md#precedence)", "ESC-5.2-1"],
      "F-5": ["adapted", "clause"],
      "F-6": ["Oracle", "error", "Upstream's test expects", "Epic 5 retro item 9"],
      "F-7": ["Xaravel Test", "consequence", "ESC-5.9-1"],
      "F-8": ["stub", "fake", "partial implementation", "another Component"],
      "F-9": ["@asyncRoot"],
      "F-10": ["`setup`", "`exprs`", "recorded reason", "Epic 3 retro R4"],
    };
    for (const [id, needed] of Object.entries(phrases)) {
      for (const phrase of needed) {
        expect(`${id}: ${byId.get(id)!.includes(phrase)}`).toBe(`${id}: true`);
      }
    }
    for (const item of ITEMS) {
      expect(item.body.startsWith("**Check.**")).toBe(true);
    }
    // The precedence link resolves: conformance/README.md has the `## Precedence` heading.
    expect(readFileSync(join(root, "conformance", "README.md"), "utf8").split("\n")).toContain("## Precedence");

    // The prompt names every item; the verdict schema enumerates exactly the parsed ids.
    const precedence = precedenceSection(readFileSync(join(root, "conformance", "README.md"), "utf8"));
    expect(precedence!.startsWith("## Precedence\n")).toBe(true);
    expect(precedence).toContain("When in doubt, pick the reason that counts against conformance.");
    expect(precedence).not.toContain("## Ratchet");
    const prompt = buildPrompt({ checklistText: CHECKLIST, items: ITEMS, precedence, storyId: "9.1", tree: "a".repeat(40), base: "b".repeat(40), manifestText: "---\n---\n", inventory: [], oracleRequests: [], files: [{ filename: "a.ts", status: "added", patch: "+x" }], evidence: NO_EVIDENCE });
    for (const item of ITEMS) {
      expect(prompt.system).toContain(`### ${item.id}: ${item.title}`);
    }
    // F-4's precedence is in the prompt itself, not only as a link.
    expect(prompt.system).toContain(precedence!);
    expect(prompt.system).toContain("Fail when unsure");
    expect(prompt.system).toContain("Do not use any tool, command or file: judge only the material given in this prompt.");
    expect(prompt.user.startsWith(`# Story 9.1: tree ${"a".repeat(40)} against base ${"b".repeat(40)}\n`)).toBe(true);
    expect(prompt.length).toBe(prompt.system.length + prompt.user.length);
    expect(PROMPT_CAP).toBe(1_000_000);
    const schema = verdictSchema(ITEMS) as { additionalProperties: boolean; required: string[]; properties: { items: { items: { required: string[]; properties: { id: { enum: string[] }; result: { enum: string[] } } } } } };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["items"]);
    expect(schema.properties.items.items.required).toEqual(["id", "result", "note", "findings"]);
    expect(schema.properties.items.items.properties.id.enum).toEqual(IDS);
    expect(schema.properties.items.items.properties.result.enum).toEqual(["pass", "fail", "n/a"]);

    // Malformed and duplicate checklists are rejected.
    expect(() => parseChecklist("# Fidelity\n\nNo items here.\n")).toThrow(/has no/);
    expect(() => parseChecklist("### F-1: One\n\nx\n\n### F-1: Again\n\ny\n")).toThrow(/duplicate item id F-1/);
    expect(() => parseChecklist("### F-1: One\n\nx\n\n### F-2 no colon\n\ny\n")).toThrow(/malformed item heading/);
    expect(() => parseChecklist("### F-1: One\n\nx\n\n## F-2: wrong level\n")).toThrow(/malformed item heading/);
    expect(parseChecklist("intro\n### F-1: One\nbody one\n## Other\nnot in F-1\n### F-2: Two\nbody two\n")).toEqual([
      { id: "F-1", title: "One", body: "body one" },
      { id: "F-2", title: "Two", body: "body two" },
    ]);
  },
);

// ---------------------------------------------------------------------------
// XT-conformance-161 (AC2): two fresh-context reviewers, one cross-model, verdicts recorded with the Story

xaravelTest(
  "XT-conformance-161",
  "the review step's Fidelity Review runs two reviewer subprocesses, each in a fresh empty directory with no tools and only the prompt the tool builds, reviewer 1 on the other agent CLI from the loop's (Codex for a claude loop, Claude for a Codex loop) or on the loop's CLI with the recorded reason when the other is not installed, not signed in or at a usage limit; each verdict is appended to the Story's spec bound to the reviewed tree, and story:check's approvals passes on two pass verdicts for the head tree; no workflow calls a model (FR-111.1, FR-111.2, FR-111.5, AD-15.8)",
  async () => {
    const script = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts["fidelity:review"];
    expect(script).toBe("bun --no-env-file tools/fidelity-review/fidelity-review.ts");
    // The GitHub Actions path is retired: no fidelity.yml, and no workflow runs the review or reaches a model API.
    const workflows = join(root, ".github", "workflows");
    expect(existsSync(join(workflows, "fidelity.yml"))).toBe(false);
    for (const name of readdirSync(workflows)) {
      const text = readFileSync(join(workflows, name), "utf8");
      expect(`${name}: ${/fidelity:review|ANTHROPIC|anthropic\.com|OPENAI|openai\.com|claude -p|codex exec/.test(text)}`).toBe(`${name}: false`);
    }

    // Both pass, cross-model: a claude loop puts reviewer 1 on codex and reviewer 2 on claude.
    const repo = makeRepo();
    const tree = reviewTree(repo.dir, "worktree", SPEC);
    const both = fakes({ codex: [pass("gpt-fake-1")], claude: [pass("claude-fake-1")] }, [], { GH_TOKEN: "ghp-parent-secret", LC_ALL: "C" });
    const run = await review(repo.dir, both.env, "--loop-cli", "claude");
    expect(run.err).toEqual([]);
    expect(run.out).toEqual(["reviewer 1: pass (codex/gpt-fake-1)", "reviewer 2: pass (claude/claude-fake-1)", `recorded 2 verdict(s) in ${SPEC} for tree ${tree}`]);
    expect(run.code).toBe(0);
    const recorded = records(repo.spec);
    expect(recorded.map((record) => [record.reviewer, record.verdict, record.tree, record.base, record.cli, record.model, record.loop_cli, record.fallback])).toEqual([
      [1, "pass", tree, repo.base, "codex", "gpt-fake-1", "claude", null],
      [2, "pass", tree, repo.base, "claude", "claude-fake-1", "claude", null],
    ]);
    expect(recorded[0]!.items as unknown).toEqual(answers());
    // The records sit in a `## Fidelity Review` section, after the spec's existing sections, each headed and tabled.
    const specText = readFileSync(repo.spec, "utf8");
    expect(specText.startsWith(`---\ntitle: 'Story 9.1'\nbaseline_revision: '${repo.base}'\n`)).toBe(true);
    expect(specText.indexOf("## Auto Run Result")).toBeLessThan(specText.indexOf(RECORDS_HEADING));
    expect(specText).toContain(`### Reviewer 1: pass at tree ${tree}`);
    expect(specText).toContain(`### Reviewer 2: pass at tree ${tree}`);
    expect(specText).toContain(`| ${ITEMS[9]!.id}: ${ITEMS[9]!.title} | pass | checked F-10 |`);
    // The record JSON round-trips through parseRecords.
    for (const record of recorded) {
      expect(parseRecords(appendRecords("# s\n", [renderRecord(record, ITEMS)])).map((entry) => entry.record)).toEqual([record]);
    }

    // Isolation: one call each, in a fresh empty directory that is not the repository and is removed afterwards; the
    // prompt on stdin; no tools, no project settings, no session; the schema enumerates the checklist ids.
    const [codexCall] = both.calls("codex");
    const [claudeCall] = both.calls("claude");
    expect([both.calls("codex").length, both.calls("claude").length]).toEqual([1, 1]);
    for (const call of [codexCall!, claudeCall!]) {
      expect(call.cwdEntries).toEqual([]);
      // The child env is allow-listed: the loop's GH_TOKEN and the tool's own settings never reach a reviewer.
      expect(call.env).not.toContain("GH_TOKEN");
      expect(call.env).not.toContain("XARAVEL_FIDELITY_CLAUDE_BIN");
      expect(call.env).toContain("LC_ALL");
      expect(call.cwd.startsWith(repo.dir)).toBe(false);
      expect(existsSync(call.cwd)).toBe(false);
      expect(call.stdin).toContain(`### ${CHANGED} (added)`);
      expect(call.stdin).toContain("+export const added = 1; // FR-111.1");
    }
    // An action item's review (amendment 2026-10-22): --item needs --spec, the item's scope decides the diff, and its
    // verdicts are recorded in the item's spec, which status then reads.
    const itemId = "epic-9-retro-item-3-support-fix";
    const itemSpec = "_bmad-output/implementation-artifacts/spec-retro-9-support-fix.md";
    expect((await runFidelity(["review", "--item", itemId, "--root", repo.dir, "--loop-cli", "claude"], {})).err[0]).toBe("--item needs --spec: an action item's spec cannot be found from its id");
    expect((await runFidelity(["status", "--item", itemId, "--story", "9.1", "--spec", itemSpec, "--root", repo.dir], {})).err[0]).toBe("pass --story or --item, not both");
    expect((await runFidelity(["status", "--item", "9.1", "--spec", itemSpec, "--root", repo.dir], {})).code).toBe(2);
    const itemRepo = makeRepo();
    write(itemRepo.dir, SPRINT, `action_items:\n  - id: "${itemId}"\n    epic: 9\n    action: "packages/support: fix Str (L1)"\n    owner: "orchestrator"\n    status: open\n    ref: "r.md"\n`);
    write(itemRepo.dir, itemSpec, `---\ntitle: 'Retro 9 support fix'\nbaseline_revision: '${itemRepo.base}'\nstatus: 'in-review'\n---\n\n# Retro 9 support fix\n`);
    const itemTree = reviewTree(itemRepo.dir, "worktree", itemSpec);
    const itemFakes = fakes({ codex: [pass("gpt-fake-1")], claude: [pass("claude-fake-1")] });
    const itemRun = await runFidelity(["review", "--item", itemId, "--spec", itemSpec, "--root", itemRepo.dir, "--loop-cli", "claude"], itemFakes.env);
    expect(itemRun.out).toEqual(["reviewer 1: pass (codex/gpt-fake-1)", "reviewer 2: pass (claude/claude-fake-1)", `recorded 2 verdict(s) in ${itemSpec} for tree ${itemTree}`]);
    expect(itemRun.code).toBe(0);
    const itemStdin = itemFakes.calls("codex")[0]!.stdin;
    expect(itemStdin).toContain(`# Retrospective action item ${itemId}: tree ${itemTree}`);
    expect(itemStdin).toContain('components: ["support"]');
    expect(itemStdin).toContain("+export const added = 1; // FR-111.1");
    // The Story-named Oracle request file is not the item's: it is named, not shown.
    expect(itemStdin).toContain(`Left out as outside the Story's scope (ESC-9.10-4): \`${REQUESTS}\``);
    expect(itemStdin).not.toContain("## Manifest");
    expect((await runFidelity(["status", "--item", itemId, "--spec", itemSpec, "--root", itemRepo.dir], {})).out[0]).toStartWith("current: ");
    expect(readFileSync(itemRepo.spec, "utf8")).not.toContain(RECORDS_HEADING);
    // An item whose action names no package has nothing to review: refused before any reviewer runs.
    write(itemRepo.dir, SPRINT, `action_items:\n  - id: "${itemId}"\n    epic: 9\n    action: "rule the route (P5)"\n`);
    write(itemRepo.dir, CHANGED, "export const added = 2; // FR-111.1\n");
    const refused = await runFidelity(["review", "--item", itemId, "--spec", itemSpec, "--root", itemRepo.dir, "--loop-cli", "claude"], itemFakes.env);
    expect([refused.code, refused.err.at(-1)]).toEqual([1, `fidelity-review: action item ${itemId} names no packages/<component>, so it has no scope to review; nothing recorded`]);
    expect(itemFakes.calls("codex").length).toBe(1);

    const claudeArgv = claudeCall!.argv;
    const flag = (name: string): string => claudeArgv[claudeArgv.indexOf(name) + 1]!;
    expect(claudeArgv.slice(0, 3)).toEqual(["-p", "--output-format", "json"]);
    for (const name of ["--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]) {
      expect(claudeArgv).toContain(name);
    }
    expect([flag("--tools"), flag("--setting-sources")]).toEqual(["", ""]);
    expect(JSON.parse(flag("--json-schema"))).toEqual(verdictSchema(ITEMS));
    expect(flag("--system-prompt")).toContain(CHECKLIST.trim());
    expect(claudeArgv).not.toContain("--model");
    expect(claudeCall!.stdin).not.toContain("### F-1: ");
    const codexArgv = codexCall!.argv;
    const schemaFile = codexArgv[codexArgv.indexOf("--output-schema") + 1]!;
    const outputFile = codexArgv[codexArgv.indexOf("-o") + 1]!;
    expect(codexArgv).toEqual(["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--color", "never", "-C", codexCall!.cwd, "--output-schema", schemaFile, "-o", outputFile, "-"]);
    expect(dirname(schemaFile)).not.toBe(codexCall!.cwd);
    expect(existsSync(schemaFile)).toBe(false);
    // Codex has no system prompt flag: the system text is prepended to the prompt on stdin.
    expect(codexCall!.stdin.startsWith("You are a Fidelity Reviewer for Xaravel")).toBe(true);
    expect(codexCall!.stdin).toContain(CHECKLIST.trim());
    // The prompt carries the Story's evidence.
    const user = claudeCall!.stdin;
    expect(user).toContain(`# Story 9.1: tree ${tree} against base ${repo.base}`);
    expect(user).toContain("$this->assertSame(3, sum(1, 2));");
    expect(user).toContain(`### ${MISSING_ID}`);
    expect(user.split("Upstream source unavailable").length - 1).toBe(1);
    expect(user).toContain(`### ${DATASET_ID}#a`);
    expect(user).toContain(`### ${DATASET_ID}#b`);
    expect(user).toContain("$this->assertSame('row-a', rowA())");
    expect(user).toContain("$this->assertSame('row-b', rowB())");
    expect(user).toContain('"exprs":["1 + 2"]');
    expect(user).not.toContain(SPEC);
    expect(user).toContain("No added line carries an `adapted:DIV-<n>.<k>` marker or cites a `DIV-<n>.<k>` clause.");
    // (d): no added line has `@asyncRoot`, but the change edits packages/support/src/, so the rules come anyway (ESC-9.2-2).
    expect(user).toContain("### (d) The rules for @asyncRoot tags: DIV-1, ESC-6.4-1 and AD-6 (F-9)\n\n#### decisions/DIV-1.md");
    expect(user).not.toContain("No added line contains `@asyncRoot`");
    // (e): the change edits only packages/support/src/, so no Xaravel Test is touched.
    expect(user).toContain("### (e) Xaravel Tests the change touches, in full, with their consequences (F-2, F-7)");
    expect(user).toContain("No Xaravel Test is touched: the change edits no Xaravel Test's lines, no test helper or fixture one uses, and no test file's top-level setup.");
    // (g): the changed packages/support/src/ file's declaration-and-tag listing; the removed Base.ts has none (ESC-9.3-2).
    expect(user).toContain(`### (g) Every declaration and @asyncRoot tag of each changed framework source file, with its docblock (F-9, ESC-9.3-2)\n\n#### ${CHANGED}\n\n\`\`\`ts\n@asyncRoot tags: none.\nDeclarations: 1.\n\n1| export const added = 1; // FR-111.1\n\`\`\``);
    expect(user).not.toContain("#### packages/support/src/Base.ts");

    // status: current for the working tree. Committed unchanged, the head tree is the reviewed tree: approvals passes.
    expect(await status(repo.dir)).toEqual({ code: 0, out: [`current: 2 pass verdicts for tree ${tree} (reviewer 1: codex/gpt-fake-1, reviewer 2: claude/claude-fake-1)`], err: [] });
    commitAll(repo.dir);
    expect(reviewTree(repo.dir, "head", SPEC)).toBe(tree);
    expect(renderClause(approvalsClause(repo.dir, "9.1"))).toEqual([`PASS approvals: 2 pass verdicts for tree ${tree} (reviewer 1: codex/gpt-fake-1, reviewer 2: claude/claude-fake-1)`]);
    // Bookkeeping only: the spec and sprint status change and are committed; the verdicts stay current.
    writeFileSync(repo.spec, `${readFileSync(repo.spec, "utf8")}\nFinalized.\n`);
    write(repo.dir, "_bmad-output/implementation-artifacts/sprint-status.yaml", "development_status:\n  9-1-fidelity: done\n");
    commitAll(repo.dir, "bookkeeping");
    expect((await status(repo.dir)).out[0]).toStartWith("current: ");
    expect(renderClause(approvalsClause(repo.dir, "9.1"))[0]).toStartWith("PASS approvals: 2 pass verdicts for tree ");
    // A manifest status edit is bookkeeping too (ESC-8.8-1): stories/ is outside the binding tree, before and after a commit.
    const manifestPath = join(repo.dir, "stories", "9.1.md");
    writeFileSync(manifestPath, readFileSync(manifestPath, "utf8").replace("status: in-progress", "status: done"));
    expect(reviewTree(repo.dir, "worktree", SPEC)).toBe(tree);
    expect((await status(repo.dir)).out[0]).toStartWith("current: ");
    commitAll(repo.dir, "story done");
    expect(reviewTree(repo.dir, "head", SPEC)).toBe(tree);
    expect(renderClause(approvalsClause(repo.dir, "9.1"))).toEqual([`PASS approvals: 2 pass verdicts for tree ${tree} (reviewer 1: codex/gpt-fake-1, reviewer 2: claude/claude-fake-1)`]);
    // The diff still shows a stories/ change; only the binding tree leaves it out.
    expect(reviewDiff(repo.dir, repo.base).files.map((file) => file.filename)).toContain("stories/9.1.md");
    // The binding leaves out the bookkeeping set ESC-8.8-1 names, as Epic 8 action item 4 narrows it: sprint status, the
    // Story's own spec and each manifest's status line. Named or not (the tool and story:check name it), the Story's spec
    // is left out; a named spec must be a .md under _bmad-output/implementation-artifacts/.
    expect(reviewTree(repo.dir, "worktree", SPEC)).toBe(tree);
    expect(reviewTree(repo.dir, "worktree", repo.spec)).toBe(tree);
    expect(reviewTree(repo.dir, "head", SPEC)).toBe(tree);
    const manifestText = readFileSync(manifestPath, "utf8");
    expect(normaliseManifestStatus(manifestText)).toBe(manifestText.replace("status: done", MANIFEST_STATUS_PLACEHOLDER));
    expect(normaliseManifestStatus("---\nstory_id: x\n---\nstatus: body, not frontmatter\n")).toBe("---\nstory_id: x\n---\nstatus: body, not frontmatter\n");
    expect(normaliseManifestStatus("no frontmatter\nstatus: x\n")).toBe("no frontmatter\nstatus: x\n");
    const bound = async (edit: () => void, undo: () => void): Promise<string[]> => {
      edit();
      const result = [reviewTree(repo.dir, "worktree", SPEC) === tree ? "same tree" : "new tree", (await status(repo.dir)).out[0]!.split(":")[0]!];
      undo();
      return result;
    };
    const restore = (path: string): (() => void) => {
      const text = readFileSync(join(repo.dir, path), "utf8");
      return () => writeFileSync(join(repo.dir, path), text);
    };
    // A manifest's test_ids edit, added or removed, is bound: the verdicts are stale.
    expect(await bound(() => writeFileSync(manifestPath, manifestText.replace("test_ids:\n", `test_ids:\n  - ${JSON.stringify(`${TEST_ID}B`)}\n`)), restore("stories/9.1.md"))).toEqual(["new tree", "stale"]);
    expect(await bound(() => writeFileSync(manifestPath, manifestText.replace(`  - ${JSON.stringify(MISSING_ID)}\n`, "")), restore("stories/9.1.md"))).toEqual(["new tree", "stale"]);
    expect(manifestText).toContain(`  - ${JSON.stringify(MISSING_ID)}\n`);
    // Planning artifacts and other specs are bound too; sprint status and the Story's own spec are not.
    expect(await bound(() => writeFileSync(join(repo.dir, EPICS), `${readFileSync(join(repo.dir, EPICS), "utf8")}- a new criterion\n`), restore(EPICS))).toEqual(["new tree", "stale"]);
    expect(() => reviewTree(repo.dir, "worktree", "packages/support/src/Base.ts")).toThrow("the spec packages/support/src/Base.ts is not a file under _bmad-output/implementation-artifacts/");
    expect(() => reviewTree(repo.dir, "worktree", "../elsewhere/spec-9-1-x.md")).toThrow("is not a file under _bmad-output/implementation-artifacts/");
    expect(await bound(() => write(repo.dir, OTHER_SPEC, "# Story 9.2\n\nEdited.\n"), restore(OTHER_SPEC))).toEqual(["new tree", "stale"]);
    // Another manifest's status line is bookkeeping too: two manifests' blobs are normalised in one batch.
    const otherManifest = readFileSync(join(repo.dir, OTHER_MANIFEST), "utf8");
    expect(await bound(() => write(repo.dir, OTHER_MANIFEST, otherManifest.replace("status: backlog", "status: ready-for-dev")), restore(OTHER_MANIFEST))).toEqual(["same tree", "current"]);
    expect(await bound(() => write(repo.dir, SPRINT, "development_status:\n  9-1-fidelity: rewritten\n"), restore(SPRINT))).toEqual(["same tree", "current"]);
    expect(await bound(() => writeFileSync(repo.spec, `${readFileSync(repo.spec, "utf8")}\nFinalized again.\n`), restore(SPEC))).toEqual(["same tree", "current"]);
    // Committed: a test_ids edit after two passes fails approvals; status and spec edits keep it passing.
    expect(reviewTree(repo.dir, "worktree", SPEC)).toBe(tree);
    writeFileSync(manifestPath, manifestText.replace(`  - ${JSON.stringify(MISSING_ID)}\n`, ""));
    commitAll(repo.dir, "drop a test id");
    expect(renderClause(approvalsClause(repo.dir, "9.1"))[0]).toStartWith("FAIL approvals: 0 of 2 pass verdicts for tree ");
    writeFileSync(manifestPath, manifestText);
    commitAll(repo.dir, "restore the test id");
    expect(renderClause(approvalsClause(repo.dir, "9.1"))[0]).toStartWith("PASS approvals: 2 pass verdicts for tree ");
    // Committed: another Story's spec edit fails approvals; another manifest's status edit keeps both modes' tree.
    const otherSpecText = readFileSync(join(repo.dir, OTHER_SPEC), "utf8");
    write(repo.dir, OTHER_SPEC, "# Story 9.2\n\nEdited.\n");
    commitAll(repo.dir, "other spec edit");
    expect(renderClause(approvalsClause(repo.dir, "9.1"))[0]).toStartWith("FAIL approvals: 0 of 2 pass verdicts for tree ");
    write(repo.dir, OTHER_SPEC, otherSpecText);
    commitAll(repo.dir, "other spec restored");
    expect(renderClause(approvalsClause(repo.dir, "9.1"))[0]).toStartWith("PASS approvals: 2 pass verdicts for tree ");
    write(repo.dir, OTHER_MANIFEST, otherManifest.replace("status: backlog", "status: in-progress"));
    expect(reviewTree(repo.dir, "worktree", SPEC)).toBe(tree);
    commitAll(repo.dir, "other story started");
    expect(reviewTree(repo.dir, "head", SPEC)).toBe(tree);
    expect(renderClause(approvalsClause(repo.dir, "9.1"))[0]).toStartWith("PASS approvals: 2 pass verdicts for tree ");
    write(repo.dir, `${EPICS}`, `${readFileSync(join(repo.dir, EPICS), "utf8")}- a new criterion\n`);
    commitAll(repo.dir, "epics edit");
    expect(renderClause(approvalsClause(repo.dir, "9.1"))[0]).toStartWith("FAIL approvals: 0 of 2 pass verdicts for tree ");
    expect((await status(repo.dir)).out[0]).toStartWith("stale: ");

    // The other CLI not installed: reviewer 1 falls back to claude, recording why; approvals still passes.
    const noCodex = makeRepo();
    const noCodexFakes = fakes({}, ["codex"], { XARAVEL_FIDELITY_CLAUDE_MODEL: "opus-test" });
    const noCodexRun = await review(noCodex.dir, noCodexFakes.env, "--loop-cli", "claude");
    expect(noCodexRun.code).toBe(0);
    const [fellBack, second] = records(noCodex.spec);
    expect([fellBack!.cli, fellBack!.loop_cli, second!.cli]).toEqual(["claude", "claude", "claude"]);
    expect(fellBack!.fallback).toStartWith("codex unavailable: not installed: ");
    expect(fellBack!.fallback).toContain("nowhere/codex");
    expect(second!.fallback).toBeNull();
    expect(noCodexRun.out[0]).toBe(`reviewer 1: pass (claude/claude-fake-1); fallback: ${fellBack!.fallback}`);
    // XARAVEL_FIDELITY_CLAUDE_MODEL is passed as --model; the recorded model is the one the result reports.
    expect(noCodexFakes.calls("claude").map((call) => call.argv[call.argv.indexOf("--model") + 1])).toEqual(["opus-test", "opus-test"]);
    commitAll(noCodex.dir);
    expect(renderClause(approvalsClause(noCodex.dir, "9.1"))[0]).toStartWith("PASS approvals: 2 pass verdicts for tree ");

    // A usage limit or a missing sign-in, recognised from the CLI's output, is a fallback with that reason.
    const limits: [Step, string][] = [
      [{ kind: "raw", stderr: "ERROR: You've hit your usage limit. Upgrade to Pro or try again later.\n", code: 1 }, "codex unavailable: usage limit: ERROR: You've hit your usage limit. Upgrade to Pro or try again later."],
      [{ kind: "raw", stderr: "Not signed in. Please run `codex login` first.\n", code: 1 }, "codex unavailable: not signed in: Not signed in. Please run `codex login` first."],
    ];
    for (const [step, reason] of limits) {
      const limited = makeRepo();
      const limitedFakes = fakes({ codex: [step] });
      const limitedRun = await review(limited.dir, limitedFakes.env, "--loop-cli", "claude");
      expect(limitedRun.code).toBe(0);
      expect(records(limited.spec)[0]!.fallback).toBe(reason);
      expect(limitedFakes.calls("codex")).toHaveLength(1);
      expect(limitedFakes.calls("claude")).toHaveLength(2);
    }
    // A Codex loop puts reviewer 1 on claude; claude's own "not logged in" error result (exit 0) falls back to codex.
    const codexLoop = makeRepo();
    const notLoggedIn = JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login", modelUsage: {} });
    const codexLoopFakes = fakes({ claude: [{ kind: "raw", stdout: notLoggedIn, code: 0 }] });
    const codexLoopRun = await review(codexLoop.dir, { ...codexLoopFakes.env, XARAVEL_LOOP_CLI: "codex" });
    expect(codexLoopRun.code).toBe(0);
    expect(records(codexLoop.spec).map((record) => [record.cli, record.loop_cli, record.fallback])).toEqual([
      ["codex", "codex", "claude unavailable: not signed in: Not logged in · Please run /login"],
      ["codex", "codex", null],
    ]);
    // Claude Code strips CLAUDE_CODE_OAUTH_TOKEN from tool subprocesses: the claude child gets it from the token file,
    // trimmed, and it never reaches the output or the spec.
    const tokenRepo = makeRepo();
    const tokenDir = tempDir("xt-fidelity-token-");
    const secret = "sk-ant-oat-test-secret-0123";
    writeFileSync(join(tokenDir, "token"), `  ${secret}\n`);
    const needsToken: Step = { kind: "needs-token", answer: { items: answers() }, token: secret };
    const tokenFakes = fakes({ claude: [needsToken] }, [], { XARAVEL_FIDELITY_CLAUDE_TOKEN_FILE: join(tokenDir, "token") });
    const tokenRun = await review(tokenRepo.dir, tokenFakes.env, "--loop-cli", "codex");
    expect(tokenRun.code).toBe(0);
    expect(records(tokenRepo.spec).map((record) => [record.cli, record.fallback])).toEqual([["claude", null], ["codex", null]]);
    expect(`${tokenRun.out.join("\n")}\n${tokenRun.err.join("\n")}\n${readFileSync(tokenRepo.spec, "utf8")}`).not.toContain(secret);
    // Without the file the same fake answers "Not logged in", and reviewer 1 falls back.
    const noTokenRepo = makeRepo();
    const noTokenRun = await review(noTokenRepo.dir, fakes({ claude: [needsToken] }, [], { XARAVEL_FIDELITY_CLAUDE_TOKEN_FILE: join(tokenDir, "absent") }).env, "--loop-cli", "codex");
    expect(records(noTokenRepo.spec)[0]!.fallback).toBe("claude unavailable: not signed in: Not logged in · Please run /login");
    expect(noTokenRun.code).toBe(0);
    // With XARAVEL_FIDELITY_CODEX_BIN unset and no codex on PATH, the codex binary is ~/.local/bin/codex;
    // XARAVEL_FIDELITY_CODEX_MODEL is passed as -m.
    const homeRepo = makeRepo();
    const homeFakes = fakes({});
    const home = tempDir("xt-fidelity-home-");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    cpSync(homeFakes.env["XARAVEL_FIDELITY_CODEX_BIN"]!, join(home, ".local", "bin", "codex"));
    chmodSync(join(home, ".local", "bin", "codex"), 0o755);
    const homeRun = await review(homeRepo.dir, { ...homeFakes.env, XARAVEL_FIDELITY_CODEX_BIN: undefined, PATH: "/usr/bin:/bin", HOME: home, XARAVEL_FIDELITY_CODEX_MODEL: "gpt-test-m" }, "--loop-cli", "claude");
    expect(homeRun.code).toBe(0);
    expect(records(homeRepo.spec).map((record) => [record.cli, record.fallback])).toEqual([["codex", null], ["claude", null]]);
    const homeArgv = homeFakes.calls("codex")[0]!.argv;
    expect(homeArgv[homeArgv.indexOf("-m") + 1]).toBe("gpt-test-m");

    // Excerpts are capped.
    expect(classifyUnavailable({ output: `usage limit ${"x".repeat(500)}` })!.excerpt.length).toBeLessThanOrEqual(EXCERPT_CAP);
    expect(classifyUnavailable({ output: "segmentation fault" })).toBeNull();

    // The loop CLI: --loop-cli, else XARAVEL_LOOP_CLI, else claude under CLAUDECODE; otherwise a usage error.
    const loopRepo = makeRepo();
    const loopFakes = fakes({});
    expect((await review(loopRepo.dir, { ...loopFakes.env, CLAUDECODE: "1" })).code).toBe(0);
    expect(loopFakes.calls("codex")).toHaveLength(1);
    for (const [env, args] of [[loopFakes.env, []], [loopFakes.env, ["--loop-cli", "gemini"]], [{ ...loopFakes.env, XARAVEL_LOOP_CLI: "gemini" }, []]] as const) {
      const usage = await review(loopRepo.dir, env, ...args);
      expect(usage.code).toBe(2);
      expect(usage.err.at(-1)).toContain("Usage:");
    }
    expect((await runFidelity(["review", "--loop-cli", "claude"], {})).code).toBe(2);
    expect((await runFidelity(["review", "--story", "x", "--loop-cli", "claude"], {})).code).toBe(2);
    expect((await runFidelity([], {})).code).toBe(2);
    expect((await runFidelity(["status"], {})).code).toBe(2);

    // Refusals, each exit 1 with nothing recorded and no reviewer run: an empty diff, a missing manifest, a missing or
    // ambiguous spec, a missing baseline, a prompt over the cap.
    const refusals: [string, (dir: string) => void, string][] = [
      [
        "empty diff",
        (dir) => {
          rmSync(join(dir, CHANGED));
          rmSync(join(dir, REQUESTS));
        },
        "is empty",
      ],
      ["no manifest", (dir) => rmSync(join(dir, "stories", "9.1.md")), "stories/9.1.md does not exist"],
      ["no spec", (dir) => rmSync(join(dir, SPEC)), "no spec matches _bmad-output/implementation-artifacts/spec-9-1-*.md"],
      ["two specs", (dir) => write(dir, "_bmad-output/implementation-artifacts/spec-9-1-other.md", "x\n"), "2 specs match"],
      ["no baseline", (dir) => write(dir, SPEC, "---\ntitle: x\n---\n"), "has no baseline_revision"],
      ["too large", (dir) => write(dir, "packages/support/src/Big.ts", `${"x".repeat(PROMPT_CAP)}\n`), "over the 1000000 cap, of which section (e), the touched Xaravel Tests, is 0; the diff and its evidence are too large to review"],
    ];
    for (const [name, mutate, expected] of refusals) {
      const refused = makeRepo();
      mutate(refused.dir);
      const before = existsSync(refused.spec) ? readFileSync(refused.spec, "utf8") : null;
      const refusedFakes = fakes({});
      const result = await review(refused.dir, refusedFakes.env, "--loop-cli", "claude");
      expect(`${name}: ${result.code}`).toBe(`${name}: 1`);
      expect(`${name}: ${result.err.join("\n")}`).toContain(expected);
      expect(result.err.join("\n")).toContain("nothing recorded");
      expect(existsSync(refused.spec) ? readFileSync(refused.spec, "utf8") : null).toBe(before);
      expect([refusedFakes.calls("claude").length, refusedFakes.calls("codex").length]).toEqual([0, 0]);
    }
    // --spec and --base override the lookup and the baseline.
    const explicit = makeRepo();
    write(explicit.dir, "_bmad-output/implementation-artifacts/spec-9-1-other.md", "---\nbaseline_revision: 'nope'\n---\n");
    const explicitRun = await review(explicit.dir, fakes({}).env, "--loop-cli", "claude", "--spec", SPEC, "--base", explicit.base);
    expect(explicitRun.code).toBe(0);
    expect(records(explicit.spec)).toHaveLength(2);

    // The diff is HEAD plus tracked changes and untracked files, without _bmad-output/; the real index is untouched.
    // A tracked _bmad-output/ file that changed since the base (as the spec does) is left out of both trees.
    const diffRepo = makeRepo();
    git(diffRepo.dir, "add", SPEC);
    git(diffRepo.dir, "commit", "-q", "-m", "spec");
    const specBase = git(diffRepo.dir, "rev-parse", "HEAD");
    write(diffRepo.dir, SPEC, `${readFileSync(diffRepo.spec, "utf8")}\nEdited.\n`);
    git(diffRepo.dir, "commit", "-q", "-am", "spec edited");
    write(diffRepo.dir, SPEC, `${readFileSync(diffRepo.spec, "utf8")}\nEdited again.\n`);
    git(diffRepo.dir, "add", CHANGED);
    const index = git(diffRepo.dir, "ls-files", "--stage");
    const diff = reviewDiff(diffRepo.dir, specBase, SPEC);
    // A symbolic base is resolved and recorded as its commit sha.
    expect(reviewDiff(diffRepo.dir, "HEAD").base).toBe(git(diffRepo.dir, "rev-parse", "HEAD"));
    expect(diff.base).toBe(specBase);
    expect(diff.files.map((file) => [file.filename, file.status])).toEqual([
      [REQUESTS, "added"],
      [CHANGED, "added"],
    ]);
    expect(diff.tree).toBe(reviewTree(diffRepo.dir, "worktree", SPEC));
    expect(git(diffRepo.dir, "ls-files", "--stage")).toBe(index);
    expect(git(diffRepo.dir, "diff", "--cached", "--name-only")).toBe(CHANGED);
    // A removal, a modification and a binary file each show; the removed file's lines are not "added" evidence.
    rmSync(join(diffRepo.dir, "packages", "support", "src", "Base.ts"));
    writeFileSync(join(diffRepo.dir, "conformance", "README.md"), `${readFileSync(join(diffRepo.dir, "conformance", "README.md"), "utf8")}\nMore.\n`);
    writeFileSync(join(diffRepo.dir, "logo.bin"), new Uint8Array([0, 1, 2, 0, 255]));
    const statuses = Object.fromEntries(reviewDiff(diffRepo.dir, diffRepo.base).files.map((file) => [file.filename, [file.status, file.patch === null]]));
    expect(statuses).toEqual({ [REQUESTS]: ["added", false], [CHANGED]: ["added", false], "conformance/README.md": ["modified", false], "logo.bin": ["added, binary", true], "packages/support/src/Base.ts": ["removed", false] });

    // The evidence (a)-(d): DIV records cited by adapted markers, consequence lines, error fixtures, the @asyncRoot rules.
    const evidenceRepo = makeRepo({ oracle: true, change: false });
    write(
      evidenceRepo.dir,
      "packages/support/tests/Evidence.test.ts",
      [
        "  assertSame(0.1 + 0.2, x); // adapted:DIV-9.1",
        "  assertSame(1, y); // adapted:DIV-77.1",
        'xaravelTest("XT-conformance-999", "covers FR-111.1 and FR-999.9", () => {});',
        '{"id":"x","variant":"none","status":"pass","reason":null,"adapted":"DIV-55.1"}',
        '{"id":"y","variant":"none","status":"skip","reason":"intentional-divergence:DIV-66"}',
        "/** @asyncRoot */",
        "export async function get(): Promise<string> { return ''; }",
        "// per ESC-6.4-1 and decisions/ESC-404-1.md; ESC-6.4-1 again, DIV-9.1 is evidence (a)",
        "",
      ].join("\n"),
    );
    const evidenceFakes = fakes({});
    expect((await review(evidenceRepo.dir, evidenceFakes.env, "--loop-cli", "claude")).code).toBe(0);
    const evidenceUser = evidenceFakes.calls("claude")[0]!.stdin;
    const evidenceSystem = (({ argv }) => argv[argv.indexOf("--system-prompt") + 1]!)(evidenceFakes.calls("claude")[0]!);
    expect(evidenceSystem).toContain("When in doubt, pick the reason that counts against conformance.");
    const div9 = readFileSync(join(root, "decisions", "DIV-9.md"), "utf8");
    expect(evidenceUser).toContain("### (a) DIV records cited by added adapted markers or DIV clauses (F-3, F-5)");
    expect(evidenceUser).toContain(`#### decisions/DIV-9.md\n\n\`\`\`markdown\n${div9}`);
    expect(evidenceUser).toContain("fewer_assertions:");
    expect(evidenceUser).toContain("unavailable: decisions/DIV-77.md does not exist");
    expect(evidenceUser).toContain("unavailable: decisions/DIV-55.md does not exist");
    expect(evidenceUser).toContain("unavailable: decisions/DIV-66.md does not exist");
    expect(evidenceUser).toContain("### (b) Consequences cited on added lines, and the spine Rule bullets an `AD-<n>` citation names (F-7, F-9)");
    const fr1111 = readFileSync(join(root, "conformance", "xaravel-consequences", "conformance.jsonl"), "utf8").split("\n").find((line) => line.startsWith('{"id":"FR-111.1"'))!;
    expect(evidenceUser).toContain(`conformance/xaravel-consequences/conformance.jsonl: ${fr1111}`);
    expect(evidenceUser).toContain("unknown consequence id FR-999.9");
    expect(evidenceUser).toContain("### (c) Oracle fixtures whose output is an error (F-6)");
    expect(evidenceUser).toContain(`#### ${ERROR_REQUEST_ID} (${ERROR_FIXTURE})`);
    expect(evidenceUser).toContain("Cannot 'continue' 2 levels");
    expect(evidenceUser).toContain("### (d) The rules for @asyncRoot tags: DIV-1, ESC-6.4-1 and AD-6 (F-9)");
    expect(evidenceUser).toContain(`#### decisions/DIV-1.md\n\n\`\`\`markdown\n${readFileSync(join(root, "decisions", "DIV-1.md"), "utf8")}`);
    // ESC-9.1-4: the `@asyncRoot callback` tag's ruling and AD-6's Derivation and Enforcement bullets come with DIV-1.
    expect(evidenceUser).toContain(`#### decisions/ESC-6.4-1.md\n\n\`\`\`markdown\n${readFileSync(join(root, "decisions", "ESC-6.4-1.md"), "utf8")}`);
    const ad6 = spineRules(readFileSync(join(root, SPINE_FILE), "utf8")).get(6)!;
    for (const lead of ["**Derivation.**", "**Enforcement.**"]) {
      const k = ad6.findIndex((bullet) => bullet.startsWith(lead));
      expect(k).toBeGreaterThan(-1);
      expect(evidenceUser).toContain(`#### ${SPINE_FILE} AD-6.${k + 1}\n\n\`\`\`markdown\n${ad6[k]}`);
    }
    expect(evidenceUser).toContain("@asyncRoot callback");
    // ESC-9.2-1: (f) carries each decision record an added line cites, once, in full, or why it is unavailable.
    // Section (f) alone: (h) after it names (f)'s records again, as shown above.
    const sectionF = evidenceUser.slice(evidenceUser.indexOf("### (f) Decision records cited on added lines, by touched Xaravel Tests and in changed source files' docblocks (any item, ESC-9.2-1, ESC-9.10-1)"), evidenceUser.indexOf("### (g) "));
    expect(evidenceUser).toContain("### (h) Whole files: each changed file in full, the decision and DIV records they cite, the repository files they import, and the data files and Upstream sources changed tests read (any item)");
    expect(sectionF).toContain(`#### decisions/ESC-6.4-1.md\n\n\`\`\`markdown\n${readFileSync(join(root, "decisions", "ESC-6.4-1.md"), "utf8")}`);
    expect(sectionF.split("#### decisions/ESC-6.4-1.md").length).toBe(2);
    expect(sectionF).toContain("unavailable: decisions/ESC-404-1.md does not exist");
    expect(sectionF).not.toContain("#### decisions/DIV-9.md");
    // ESC-9.2-2: (d) comes with any packages/*/src/ change, tagged or not, and not with an untagged change elsewhere.
    const changed = (filename: string) => [{ filename, status: "modified", patch: "@@ -1 +1 @@\n-a\n+b\n" }];
    const none = { testIds: [], xaravelTestIds: [] };
    expect(gatherEvidence(root, changed("packages/runtime/src/scope/scope.ts"), none).asyncRoot.map((entry) => entry.label.split(" ")[0])).toEqual([
      "decisions/DIV-1.md",
      "decisions/ESC-6.4-1.md",
      SPINE_FILE,
      SPINE_FILE,
    ]);
    expect(gatherEvidence(root, changed("packages/runtime/tests/xaravel/scope.test.ts"), none).asyncRoot).toEqual([]);
    expect(gatherEvidence(root, changed("tools/graph/graph.ts"), none).asyncRoot).toEqual([]);
    // ESC-9.3-2: (g) lists every declaration and @asyncRoot tag of each added or modified packages/*/src/ file, the
    // parts the diff's hunks leave out included; a test file, a file elsewhere and a removed file get none.
    const surface = gatherEvidence(root, changed("packages/runtime/src/scope/interleave.ts"), none).sourceSurface;
    expect(surface.map((entry) => entry.label)).toEqual(["packages/runtime/src/scope/interleave.ts"]);
    const interleave = readFileSync(join(root, "packages", "runtime", "src", "scope", "interleave.ts"), "utf8").split("\n");
    const tagLine = interleave.findIndex((line) => line.includes("@asyncRoot callback")) + 1;
    expect(surface[0]!.text).toStartWith(`@asyncRoot tags: line ${tagLine} (\`@asyncRoot callback\`).`);
    expect(surface[0]!.text).toContain(`${tagLine}| ${interleave[tagLine - 1]}`);
    expect(surface[0]!.text).toContain("| export async function interleave<T>(");
    expect(gatherEvidence(root, changed("packages/runtime/tests/xaravel/scope.test.ts"), none).sourceSurface).toEqual([]);
    expect(gatherEvidence(root, changed("tools/graph/graph.ts"), none).sourceSurface).toEqual([]);
    expect(gatherEvidence(root, [{ filename: "packages/runtime/src/scope/interleave.ts", status: "removed", patch: null }], none).sourceSurface).toEqual([]);
    expect(gatherEvidence(root, changed("packages/runtime/src/Missing.ts"), none).sourceSurface).toEqual([
      { label: "packages/runtime/src/Missing.ts", text: null, unavailable: "packages/runtime/src/Missing.ts does not exist" },
    ]);
    // ESC-9.8-2: (c) names each assigned committed request's fixture that is present, verifies and is not an error, so
    // it never reads as missing; an error fixture stays an error entry only.
    const presentSha256 = "0141ced17058032654212541dd1135320f1ad78662373cb6b1d3437819c8f2c4";
    const presentFixture = `conformance/fixtures/runtime/${presentSha256}.json`;
    const present = gatherEvidence(root, [], { testIds: [], xaravelTestIds: ["XT-runtime-29"] });
    expect(present.errorFixtures).toEqual([]);
    expect(present.presentFixtures).toEqual([
      { label: `XT-runtime-29 (${presentFixture})`, text: JSON.stringify({ id: "XT-runtime-29", sha256: presentSha256, path: presentFixture, verified: true, error: null }), unavailable: null },
    ]);
    const errored = gatherEvidence(root, [], { testIds: [ERROR_REQUEST_ID], xaravelTestIds: [] });
    expect(errored.errorFixtures.map((entry) => entry.label)).toEqual([`${ERROR_REQUEST_ID} (${ERROR_FIXTURE})`]);
    expect(errored.presentFixtures).toEqual([]);
    const presentUser = buildPrompt({ checklistText: CHECKLIST, items: ITEMS, precedence: null, storyId: "9.8", tree: "a".repeat(40), base: "b".repeat(40), manifestText: "", inventory: [], oracleRequests: [], files: [], evidence: { ...NO_EVIDENCE, presentFixtures: present.presentFixtures } }).user;
    expect(presentUser).toContain(`### (c) Oracle fixtures that are present, verify against oracle.pub and are not errors (F-6)\n\n#### XT-runtime-29 (${presentFixture})`);
    // ESC-9.8-2: (a) supplies the DIV record of a `DIV-<n>.<k>` clause an added line cites outside an adapted marker; a
    // DIV path, a bare DIV number and a longer token are not clause citations.
    const divCited = (line: string) => gatherEvidence(root, [{ filename: "packages/runtime/tests/xaravel/json.test.ts", status: "modified", patch: `@@ -1 +1 @@\n-a\n+${line}\n` }], none).divRecords.map((entry) => [entry.label, entry.text !== null]);
    expect(divCited("// ESC-9.8-1 part 1, DIV-9.8")).toEqual([["decisions/DIV-9.md", true]]);
    expect(divCited("// decisions/DIV-9.md, DIV-9, xDIV-9.8, a/DIV-9.8")).toEqual([]);
    // ESC-10.2-7 (b): an added line naming a Rule bullet ("AD-5, the spine's Lifecycle") carries that bullet in (b);
    // one citing the same bullet by its dotted id keeps the consequence line instead, and one naming none adds nothing.
    const namedCited = (line: string) => gatherEvidence(root, [{ filename: "packages/runtime/tests/xaravel/json.test.ts", status: "modified", patch: `@@ -1 +1 @@\n-a\n+${line}\n` }], none).consequences.map((entry) => entry.label.split(" ")[0]);
    const lifecycleId = `AD-5.${spineRules(readFileSync(join(root, SPINE_FILE), "utf8")).get(5)!.findIndex((bullet) => bullet.startsWith("**Lifecycle.**")) + 1}`;
    expect(namedCited("// a sync boot() (AD-5, the spine's Lifecycle)")).toEqual([lifecycleId]);
    expect(namedCited(`// a sync boot() (AD-5, the spine's Lifecycle; ${lifecycleId})`)).toEqual([lifecycleId]);
    expect(namedCited("// a sync boot() (AD-5, see the spine)")).toEqual([]);
    // Top-level declarations with or without a docblock, documented members, a one-line body and a multi-line signature.
    expect(
      sourceSurface(
        [
          "// header",
          "import { x } from './x';",
          "/**",
          " * Runs it.",
          " * @asyncRoot callback",
          " */",
          "export async function run(",
          "  fn: () => Promise<void>,",
          "): Promise<void> {",
          "  await fn();",
          "}",
          "function noop(): void {}",
          "export class Box {",
          "  /** The value. */",
          "  get(): number {",
          "    return 1;",
          "  }",
          "  untagged(): void {}",
          "}",
          "export { x };",
        ].join("\n"),
      ),
    ).toBe(
      [
        "@asyncRoot tags: line 5 (`@asyncRoot callback`).",
        "Declarations: 5.",
        "",
        "3| /**",
        "4|  * Runs it.",
        "5|  * @asyncRoot callback",
        "6|  */",
        "7| export async function run(",
        "8|   fn: () => Promise<void>,",
        "9| ): Promise<void> {",
        "",
        "12| function noop(): void {}",
        "",
        "13| export class Box {",
        "",
        "14|   /** The value. */",
        "15|   get(): number {",
        "",
        "20| export { x };",
      ].join("\n"),
    );
    // Every citation form, each once; a DIV path, a partial id and a longer token are not decision citations.
    const cited = decisionEvidence(root, [
      "MAINT-2026-10-16-unattended-orchestrator and OQ-12, then PHASE-0-EXIT",
      "decisions/ESC-8.5-1.md, ESC-9.1-1 twice: ESC-9.1-1; decisions/DIV-1.md; ESC-9; xESC-9.1-1; ESC-9.1-1x",
    ]);
    expect(cited.map((entry) => [entry.label, entry.text !== null])).toEqual([
      ["decisions/ESC-8.5-1.md", true],
      ["decisions/ESC-9.1-1.md", true],
      ["decisions/MAINT-2026-10-16-unattended-orchestrator.md", true],
      ["decisions/OQ-12.md", true],
      ["decisions/PHASE-0-EXIT.md", true],
    ]);
    // With no error fixture, (c) never claims the change has none: it points to the changed-fixture list.
    const bare = buildPrompt({ checklistText: CHECKLIST, items: ITEMS, precedence: null, storyId: "9.1", tree: "a".repeat(40), base: "b".repeat(40), manifestText: "", inventory: [], oracleRequests: [], files: [], evidence: NO_EVIDENCE }).user;
    expect(bare).toContain("No base fixture of an assigned committed Oracle request is an error; the changed fixtures are listed below.");
    expect(bare).toContain("No fixture the change adds or modifies is an error.");
    expect(bare).toContain("No added line cites a decision record (`ESC-…`, `MAINT-…`, `OQ-…`, `PHASE-0-EXIT` or `decisions/<name>.md`).");

    // (c) for changed fixtures: a Story's own error fixture, added with its request, reaches the prompt.
    const fixtureRepo = makeRepo({ change: false });
    const headSha256 = "c".repeat(64);
    const headFixture = `conformance/fixtures/support/${headSha256}.json`;
    write(fixtureRepo.dir, REQUESTS, `${JSON.stringify({ id: TEST_ID, kind: "php-expr", input: { bindings: {}, setup: [], exprs: ["intdiv(1, 0)"] }, sha256: headSha256 })}\n`);
    write(fixtureRepo.dir, headFixture, JSON.stringify({ sha256: headSha256, output: { error: { class: "DivisionByZeroError", message: "Division by zero", stage: "setup" }, results: [] }, signature: "x" }));
    const fixtureFakes = fakes({});
    expect((await review(fixtureRepo.dir, fixtureFakes.env, "--loop-cli", "claude")).code).toBe(0);
    const fixtureUser = fixtureFakes.calls("claude")[0]!.stdin;
    expect(fixtureUser).toContain(`#### ${TEST_ID} (${headFixture}, changed)`);
    expect(fixtureUser).toContain("Division by zero");

    // (e) Xaravel Tests the change touches (ESC-8.8-1). A base with a test file, a fixture module it imports and a JSON
    // fixture that module reads; the helper's string and regex hold braces the scanner must not count.
    const sampleTest = "conformance/tests/xaravel/sample.test.ts";
    const sampleFixtures = "conformance/tests/xaravel/sample-fixtures.ts";
    const sampleJson = "conformance/tests/xaravel/fixtures/sample.json";
    const sampleText = [
      'import { xaravelTest } from "../../../packages/assert/src/index";',
      'import { sharedRoot } from "./sample-fixtures";',
      "",
      '// A helper with a brace in a string, a template and a regex: "}" /}/',
      "function baseRoot(): string {",
      '  return "}" + `${"{"}` + String(/}/.source);',
      "}",
      "",
      "function wrapRoot(): string {",
      "  return `${baseRoot()}/wrapped`;",
      "}",
      "",
      "beforeEach(() => {});",
      "",
      'xaravelTest("XT-sample-1", "covers FR-111.1 and FR-999.9", () => {',
      "  const value = 1;",
      "});",
      "",
      "xaravelTest(",
      '  "XT-sample-2",',
      '  "uses a helper through another (FR-111.2)",',
      "  () => {",
      "    wrapRoot();",
      "  },",
      ");",
      "",
      'xaravelTest("XT-sample-3", "uses the imported fixture", () => {',
      "  sharedRoot();",
      "});",
      "",
      'xaravelTest("XT-sample-4", "uses the helper directly", () => {',
      "  baseRoot();",
      "});",
      "",
    ].join("\n");
    const fixturesText = 'import { readFileSync } from "node:fs";\n\nexport function sharedRoot(): string {\n  return readFileSync("fixtures/sample.json", "utf8");\n}\n';
    expect(testUnits(sampleText).map((unit) => [unit.kind, unit.name ?? unit.ids.join(","), unit.from, unit.to])).toEqual([
      ["import", "", 1, 1],
      ["import", "", 2, 2],
      ["declaration", "baseRoot", 4, 7],
      ["declaration", "wrapRoot", 9, 11],
      ["setup", "", 13, 13],
      ["xt", "XT-sample-1", 15, 17],
      ["xt", "XT-sample-2", 19, 25],
      ["xt", "XT-sample-3", 27, 29],
      ["xt", "XT-sample-4", 31, 33],
    ]);
    expect(testUnits(sampleText).map((unit) => unit.consequence)).toEqual([null, null, null, null, null, "covers FR-111.1 and FR-999.9", "uses a helper through another (FR-111.2)", "uses the imported fixture", "uses the helper directly"]);
    const xtRepo = makeRepo({ change: false });
    write(xtRepo.dir, sampleTest, sampleText);
    write(xtRepo.dir, sampleFixtures, fixturesText);
    write(xtRepo.dir, sampleJson, '{"root":"a"}\n');
    const xtBase = commitAll(xtRepo.dir, "sample tests");
    const touchedIn = (dir: string, base: string, edit: [string, string, string][]): [string, string, string][] => {
      for (const [path, from, to] of edit) {
        write(dir, path, readFileSync(join(dir, path), "utf8").replace(from, to));
      }
      const entries = xaravelTestEvidence(dir, reviewDiff(dir, base).files);
      git(dir, "checkout", "-q", "--", ".");
      return entries.map((entry) => [entry.ids.join(","), `${entry.path}:${entry.from}-${entry.to}`, entry.reasons.join("; ")]);
    };
    const touched = (edit: [string, string, string][]): [string, string, string][] => touchedIn(xtRepo.dir, xtBase, edit);
    // A changed helper: every XT that uses it, directly or through another helper, with a reason naming it.
    const baseRootChanged = "the changed helper `baseRoot` (conformance/tests/xaravel/sample.test.ts:4-7)";
    expect(touched([[sampleTest, 'String(/}/.source)', 'String(/{/.source)']])).toEqual([
      ["XT-sample-2", `${sampleTest}:19-25`, `it uses \`wrapRoot\`, which depends on ${baseRootChanged}`],
      ["XT-sample-4", `${sampleTest}:31-33`, `it uses ${baseRootChanged}`],
    ]);
    // A helper in an imported test module, and a JSON fixture under tests/ (matched by basename) that module names.
    expect(touched([[sampleFixtures, '"utf8"', '"latin1"']])).toEqual([["XT-sample-3", `${sampleTest}:27-29`, `it uses the changed helper \`sharedRoot\` (${sampleFixtures}:3-5)`]]);
    expect(touched([[sampleJson, '"a"', '"b"']])).toEqual([["XT-sample-3", `${sampleTest}:27-29`, `it uses \`sharedRoot\`, which depends on the changed file \`sample.json\` (${sampleJson})`]]);
    // Top-level setup: every XT in the file.
    const setupReason = `the file's top-level setup changes (${sampleTest}:13-13)`;
    expect(touched([[sampleTest, "beforeEach(() => {});", "beforeEach(() => { void 0; });"]])).toEqual([
      ["XT-sample-1", `${sampleTest}:15-17`, setupReason],
      ["XT-sample-2", `${sampleTest}:19-25`, setupReason],
      ["XT-sample-3", `${sampleTest}:27-29`, setupReason],
      ["XT-sample-4", `${sampleTest}:31-33`, setupReason],
    ]);
    // Removed lines inside an XT touch it; a whole removed XT touches no other one.
    expect(touched([[sampleTest, "  const value = 1;\n", ""]])).toEqual([["XT-sample-1", `${sampleTest}:15-16`, "its lines change"]]);
    expect(touched([[sampleTest, '\nxaravelTest("XT-sample-4", "uses the helper directly", () => {\n  baseRoot();\n});\n', ""]])).toEqual([]);
    // A change outside any test file touches none.
    expect(touched([["packages/support/src/Base.ts", "0", "1"]])).toEqual([]);
    // An XT's own lines: the full review's prompt carries its full body, path:lines, the reason and each cited consequence.
    write(xtRepo.dir, sampleTest, sampleText.replace("const value = 1;", "const value = 2;"));
    const xtFakes = fakes({});
    expect((await review(xtRepo.dir, xtFakes.env, "--loop-cli", "claude", "--base", xtBase)).code).toBe(0);
    const xtUser = xtFakes.calls("claude")[0]!.stdin;
    expect(xtUser).toContain(
      [
        `#### XT-sample-1 (${sampleTest}:15-17)`,
        "",
        "Included because: its lines change.",
        "",
        "```ts",
        'xaravelTest("XT-sample-1", "covers FR-111.1 and FR-999.9", () => {',
        "  const value = 2;",
        "});",
        "```",
        "",
        "The consequences its consequence string cites:",
        "",
        "- FR-111.1:",
        "",
        "```jsonl",
        `conformance/xaravel-consequences/conformance.jsonl: ${fr1111}`,
        "```",
        "",
        "- FR-999.9:",
        "",
        "unavailable: unknown consequence id FR-999.9: no line in conformance/xaravel-consequences/*.jsonl has it",
      ].join("\n"),
    );
    expect(xtUser).not.toContain("#### XT-sample-2");

    // Aliased and namespace imports of a changed helper, an XT naming a changed fixture itself, a helper module
    // `helpers/index.ts` imported as `./helpers` and used only in top-level setup, and a replaced line directly below
    // another XT.
    const aliasTest = "conformance/tests/xaravel/alias.test.ts";
    const indexHelper = "conformance/tests/xaravel/helpers/index.ts";
    const aliasRepo = makeRepo({ change: false });
    write(aliasRepo.dir, sampleFixtures, fixturesText);
    write(aliasRepo.dir, sampleJson, '{"root":"a"}\n');
    write(aliasRepo.dir, indexHelper, 'export function indexRoot(): string {\n  return "index";\n}\n');
    write(
      aliasRepo.dir,
      aliasTest,
      [
        'import { readFileSync } from "node:fs";',
        'import { sharedRoot as fixtureRoot } from "./sample-fixtures";',
        'import * as fx from "./sample-fixtures";',
        'import { indexRoot } from "./helpers";',
        "",
        "beforeEach(() => indexRoot());",
        "",
        'xaravelTest("XT-alias-1", "aliased import", () => {',
        "  fixtureRoot();",
        "});",
        "",
        'xaravelTest("XT-alias-2", "namespace import", () => {',
        "  fx.sharedRoot();",
        "});",
        "",
        'xaravelTest("XT-alias-3", "names the fixture", () => {',
        '  readFileSync("fixtures/sample.json", "utf8");',
        "});",
        "",
        'xaravelTest("XT-alias-4", "first", () => {});',
        'xaravelTest("XT-alias-5", "second", () => {});',
        "",
      ].join("\n"),
    );
    const aliasBase = commitAll(aliasRepo.dir, "alias tests");
    const sharedRootChanged = `the changed helper \`sharedRoot\` (${sampleFixtures}:3-5)`;
    expect(touchedIn(aliasRepo.dir, aliasBase, [[sampleFixtures, '"utf8"', '"latin1"']])).toEqual([
      ["XT-alias-1", `${aliasTest}:8-10`, `it uses \`fixtureRoot\`, which depends on ${sharedRootChanged}`],
      ["XT-alias-2", `${aliasTest}:12-14`, `it uses \`fx\`, which depends on ${sharedRootChanged}`],
    ]);
    const jsonChanged = `the changed file \`sample.json\` (${sampleJson})`;
    expect(touchedIn(aliasRepo.dir, aliasBase, [[sampleJson, '"a"', '"b"']])).toEqual([
      ["XT-alias-1", `${aliasTest}:8-10`, `it uses \`fixtureRoot\`, which depends on ${jsonChanged}`],
      ["XT-alias-2", `${aliasTest}:12-14`, `it uses \`fx\`, which depends on ${jsonChanged}`],
      ["XT-alias-3", `${aliasTest}:16-18`, `it names ${jsonChanged}`],
    ]);
    const indexSetup = `the file's top-level setup (${aliasTest}:6-6) uses the changed helper \`indexRoot\` (${indexHelper}:1-3)`;
    expect(touchedIn(aliasRepo.dir, aliasBase, [[indexHelper, '"index"', '"changed"']])).toEqual([
      ["XT-alias-1", `${aliasTest}:8-10`, indexSetup],
      ["XT-alias-2", `${aliasTest}:12-14`, indexSetup],
      ["XT-alias-3", `${aliasTest}:16-18`, indexSetup],
      ["XT-alias-4", `${aliasTest}:20-20`, indexSetup],
      ["XT-alias-5", `${aliasTest}:21-21`, indexSetup],
    ]);
    expect(touchedIn(aliasRepo.dir, aliasBase, [[aliasTest, '"second"', '"second, changed"']])).toEqual([["XT-alias-5", `${aliasTest}:21-21`, "its lines change"]]);
    // An unavailable entry is headed by its path; an XT with no literal consequence string cites from its text.
    const eOnly = (xaravelTests: Parameters<typeof buildPrompt>[0]["evidence"]["xaravelTests"]): string => buildPrompt({ checklistText: CHECKLIST, items: ITEMS, precedence: null, storyId: "9.1", tree: "a".repeat(40), base: "b".repeat(40), manifestText: "", inventory: [], oracleRequests: [], files: [], evidence: { ...NO_EVIDENCE, xaravelTests } }).user;
    expect(eOnly([{ ids: [], path: "conformance/tests/xaravel/gone.test.ts", from: 0, to: 0, reasons: [], body: null, unavailable: "gone", consequences: [], citesFrom: "text" }])).toContain("#### unavailable (conformance/tests/xaravel/gone.test.ts)\n\nunavailable: gone");
    const loopText = 'for (const id of ["XT-loop-1"]) {\n  xaravelTest(id, "FR-111.1", () => {});\n}';
    const [loopUnit] = testUnits(loopText);
    expect([loopUnit!.kind, loopUnit!.ids, loopUnit!.consequence]).toEqual(["xt", ["XT-loop-1"], null]);
    expect(eOnly([{ ids: ["XT-loop-1"], path: "a.test.ts", from: 1, to: 3, reasons: ["its lines change"], body: loopText, unavailable: null, consequences: [{ label: "FR-111.1", text: "x", unavailable: null }], citesFrom: "text" }])).toContain("The consequences its text (it has no literal consequence string) cites:");

    // ESC-9.9-4: (e) carries every declaration in the test's own file it uses, directly or through another, to a fixed
    // point and in file order: helpers it calls, and class fixtures they or it name. An import is not a declaration.
    const sampleUnits = testUnits(sampleText);
    const helpersOf = (all: ReturnType<typeof testUnits>, id: string): [string, number, number][] => usedDeclarations(all, all.find((unit) => unit.ids.includes(id))!).map((helper) => [helper.name, helper.from, helper.to]);
    expect(helpersOf(sampleUnits, "XT-sample-1")).toEqual([]);
    expect(helpersOf(sampleUnits, "XT-sample-2")).toEqual([["baseRoot", 4, 7], ["wrapRoot", 9, 11]]);
    expect(helpersOf(sampleUnits, "XT-sample-3")).toEqual([]);
    const fixtureUnits = testUnits(
      [
        "class SetsName {",
        '  name = "set";',
        "}",
        "class Other {}",
        "class Uses extends mixin(null, SetsName) {}",
        'registerClass("App\\\\Uses", Uses);',
        "function check(): void {",
        "  new Uses();",
        "}",
        'xaravelTest("XT-fixture-1", "uses a fixture through a helper", () => {',
        "  check();",
        "});",
      ].join("\n"),
    );
    expect(helpersOf(fixtureUnits, "XT-fixture-1")).toEqual([["SetsName", 1, 3], ["Uses", 5, 5], ["check", 7, 9]]);
    // The real case: XT-runtime-31 calls checkComposition and checkDefaultLimits, which use SetsName.
    const traitsUnits = testUnits(readFileSync(join(root, "packages", "runtime", "tests", "xaravel", "traits.test.ts"), "utf8"));
    expect(helpersOf(traitsUnits, "XT-runtime-31").map(([name]) => name)).toEqual(expect.arrayContaining(["checkComposition", "checkDefaultLimits", "SetsName"]));
    // A changed helper's tests carry it; a helper several tests use is shown in full once, then named.
    write(xtRepo.dir, sampleTest, sampleText.replace("String(/}/.source)", "String(/{/.source)"));
    const helperEntries = xaravelTestEvidence(xtRepo.dir, reviewDiff(xtRepo.dir, xtBase).files);
    git(xtRepo.dir, "checkout", "-q", "--", ".");
    expect(helperEntries.map((entry) => [entry.ids.join(","), (entry.helpers ?? []).map((helper) => helper.name)])).toEqual([
      ["XT-sample-2", ["baseRoot", "wrapRoot"]],
      ["XT-sample-4", ["baseRoot"]],
    ]);
    const helperUser = eOnly(helperEntries);
    expect(helperUser).toContain(`The declarations it uses from its own file, directly or through another, in full (ESC-9.9-4):\n\n- \`baseRoot\` (${sampleTest}:4-7):\n\n\`\`\`ts\n// A helper with a brace`);
    expect(helperUser).toContain(`- \`wrapRoot\` (${sampleTest}:9-11):\n\n\`\`\`ts\nfunction wrapRoot(): string {`);
    expect(helperUser).toContain(`- \`baseRoot\` (${sampleTest}:4-7): shown above.`);
    expect(helperUser.split("function baseRoot(): string {")).toHaveLength(2);
    expect(eOnly([{ ids: ["XT-loop-1"], path: "a.test.ts", from: 1, to: 3, reasons: ["its lines change"], body: loopText, unavailable: null, consequences: [], citesFrom: "text" }])).not.toContain("The declarations it uses");

    // The reviewed tree sees a same-size edit made in the second the real index was written (racy git): the temporary
    // index keeps the real index's mtime.
    const racy = tempDir("xt-fidelity-racy-");
    git(racy, "init", "-q");
    write(racy, "a.txt", "value 1\n");
    const racySecond = 1_700_000_000;
    utimesSync(join(racy, "a.txt"), racySecond, racySecond);
    git(racy, "add", "a.txt");
    const racyBefore = reviewTree(racy, "worktree", SPEC);
    write(racy, "a.txt", "value 2\n");
    utimesSync(join(racy, "a.txt"), racySecond, racySecond);
    utimesSync(join(racy, ".git", "index"), racySecond, racySecond);
    expect(reviewTree(racy, "worktree", SPEC)).not.toBe(racyBefore);

    // A removed Oracle request file is not read; the review still records its verdicts.
    const removedRepo = makeRepo({ change: false });
    write(removedRepo.dir, REQUESTS, '{"id":"x"}\n');
    const removedBase = commitAll(removedRepo.dir, "requests");
    rmSync(join(removedRepo.dir, REQUESTS));
    const removedRun = await review(removedRepo.dir, fakes({}).env, "--loop-cli", "claude", "--base", removedBase);
    expect(removedRun.code).toBe(0);
    expect(records(removedRepo.spec)).toHaveLength(2);

    // ESC-9.9-5: a bare `AD-<n>` no consequence line has carries its Rule from the spine: a bullet Rule as numbered
    // bullets, a table Rule as its Rule line and table; an AD the spine lacks, or an unreadable spine, stays unavailable.
    const spineText = [
      "### AD-1 — Bullets",
      "",
      "- **Binds:** FR-1",
      "- **Rule:**",
      "  - **First.** One.",
      "  - **Second.** Two.",
      "",
      "### AD-2 — Table",
      "",
      "- **Rule:** Every row is bound:",
      "",
      "  | A | B |",
      "  | --- | --- |",
      "  | x | y |",
      "",
      "- **Enforcement:** CI.",
      "",
      "### AD-3 — None",
      "",
      "- **Binds:** FR-3",
      "",
    ].join("\n");
    const spineEntry = { label: SPINE_FILE, text: spineText, unavailable: null };
    const noLines = (): Map<string, string[]> => new Map([["AD-1.1", ["conformance/xaravel-consequences/x.jsonl: one"]]]);
    const spineLabel = (id: string): string => `${id} (no line in conformance/xaravel-consequences/*.jsonl has it; its Rule from ${SPINE_FILE})`;
    expect(consequenceEntries(["AD-1", "AD-1.2", "AD-2", "AD-3", "AD-9", "FR-9"], () => new Map(), () => spineEntry)).toEqual([
      { label: spineLabel("AD-1"), text: "AD-1.1: **First.** One.\nAD-1.2: **Second.** Two.", unavailable: null, lang: "markdown" },
      { label: "AD-1.2", text: null, unavailable: "unknown consequence id AD-1.2: no line in conformance/xaravel-consequences/*.jsonl has it" },
      { label: spineLabel("AD-2"), text: "- **Rule:** Every row is bound:\n\n  | A | B |\n  | --- | --- |\n  | x | y |", unavailable: null, lang: "markdown" },
      { label: "AD-3", text: null, unavailable: `unknown consequence id AD-3: no line in conformance/xaravel-consequences/*.jsonl has it, and ${SPINE_FILE} has no AD-3 Rule` },
      { label: "AD-9", text: null, unavailable: `unknown consequence id AD-9: no line in conformance/xaravel-consequences/*.jsonl has it, and ${SPINE_FILE} has no AD-9 Rule` },
      { label: "FR-9", text: null, unavailable: "unknown consequence id FR-9: no line in conformance/xaravel-consequences/*.jsonl has it" },
    ]);
    // A consequence line still wins over the spine, and the spine is not read for it.
    expect(consequenceEntries(["AD-1"], noLines, () => { throw new Error("spine read"); })).toEqual([{ label: "AD-1", text: "conformance/xaravel-consequences/x.jsonl: one", unavailable: null }]);
    expect(consequenceEntries(["AD-1"], () => "conformance/xaravel-consequences does not exist", () => ({ label: SPINE_FILE, text: null, unavailable: `${SPINE_FILE} does not exist` }))).toEqual([
      { label: "AD-1", text: null, unavailable: `conformance/xaravel-consequences does not exist, and ${SPINE_FILE} does not exist` },
    ]);
    // The real spine: AD-4's bullets and AD-26's table, the two Rules Story 9.9's tests cite.
    const realSpine = readFileSync(join(root, SPINE_FILE), "utf8");
    const ad4 = spineRules(realSpine).get(4)!;
    expect(spineRuleText(realSpine, 4)).toBe(ad4.map((bullet, k) => `AD-4.${k + 1}: ${bullet}`).join("\n"));
    expect(spineRuleText(realSpine, 26)).toContain("| Traits | `mixin(Base, ...Traits)`;");
    expect(spineRuleText(realSpine, 26)).not.toContain("### AD-27");
    // ESC-10.2-7 (b): a bare AD-<n> whose clause names one of its Rule bullets by its bold lead cites that bullet, without
    // case or backticks; a clause naming none, a bare AD-<n> with no clause, an AD the spine lacks and a dotted id add
    // nothing, and the spine is not read unless some citation has a clause.
    const namedSpine = { label: SPINE_FILE, text: spineText.replace("**Second.** Two.", "**Writes before `sealed`** Two."), unavailable: null };
    const namedLabel = (id: string, lead: string): string => `${id} (${id.split(".")[0]}'s ${lead} rule, cited by name; from ${SPINE_FILE})`;
    expect(namedRuleCitations(["// Sync (AD-1, the spine's first rule).", " * as AD-1's writes before sealed say; AD-1, Writes Before `Sealed`", "(AD-1)", "AD-1, unrelated", "AD-9, First", "AD-1.2, First"], () => namedSpine)).toEqual([
      { label: namedLabel("AD-1.1", "First"), text: "AD-1.1: **First.** One.", unavailable: null, lang: "markdown" },
      { label: namedLabel("AD-1.2", "Writes before sealed"), text: "AD-1.2: **Writes before `sealed`** Two.", unavailable: null, lang: "markdown" },
    ]);
    expect(namedRuleCitations(["(AD-1)", "AD-1.2, First"], () => { throw new Error("spine read"); })).toEqual([]);
    expect(namedRuleCitations(["AD-1, First"], () => ({ label: SPINE_FILE, text: null, unavailable: `${SPINE_FILE} does not exist` }))).toEqual([
      { label: `${SPINE_FILE} (Rule bullets cited by name)`, text: null, unavailable: `${SPINE_FILE} does not exist` },
    ]);
    // The ESC-10.2-7 case: Story 10.2's Application.ts cites "AD-5, the spine's Lifecycle", which is AD-5.2.
    const ad5 = spineRules(realSpine).get(5)!;
    const lifecycle = ad5.findIndex((bullet) => bullet.startsWith("**Lifecycle.**"));
    const realNamed = namedRuleCitations([" * Sync: a deferred provider has a sync `boot()` (AD-5, the spine's Lifecycle)."], () => ({ label: SPINE_FILE, text: realSpine, unavailable: null }));
    expect(realNamed).toEqual([{ label: namedLabel(`AD-5.${lifecycle + 1}`, "Lifecycle"), text: `AD-5.${lifecycle + 1}: ${ad5[lifecycle]!}`, unavailable: null, lang: "markdown" }]);
    expect(realNamed[0]!.text).toContain("Deferred providers have a sync `boot()`.");
    // In the prompt, a spine Rule is fenced as markdown.
    write(xtRepo.dir, sampleTest, sampleText.replace("covers FR-111.1 and FR-999.9", "covers AD-26").replace("const value = 1;", "const value = 2;"));
    const ruleFakes = fakes({});
    expect((await review(xtRepo.dir, ruleFakes.env, "--loop-cli", "claude", "--base", xtBase)).code).toBe(0);
    expect(ruleFakes.calls("claude")[0]!.stdin).toContain(["- " + spineLabel("AD-26") + ":", "", "```markdown", "- **Rule:** `PORTING.md` must contain"].join("\n"));
    git(xtRepo.dir, "checkout", "-q", "--", ".");

    // ESC-9.10-1 (1): a name after a spread is a use, so a helper called as `...inherited()` is carried; a member
    // access (`env.inherited`) still is not.
    const spreadUnits = testUnits(
      [
        "function inherited(): Record<string, string> {",
        "  return {};",
        "}",
        "function member(): void {}",
        "function child(): Record<string, string> {",
        "  return { ...inherited(), a: env.member };",
        "}",
        'xaravelTest("XT-spread-1", "spreads a helper", () => {',
        "  child();",
        "});",
      ].join("\n"),
    );
    expect(helpersOf(spreadUnits, "XT-spread-1")).toEqual([["inherited", 1, 3], ["child", 5, 7]]);
    // The real case: XT-runtime-1 calls child(), which spreads inherited().
    const scopeUnits = testUnits(readFileSync(join(root, "packages", "runtime", "tests", "xaravel", "scope.test.ts"), "utf8"));
    expect(helpersOf(scopeUnits, "XT-runtime-1").map(([name]) => name)).toEqual(expect.arrayContaining(["child", "inherited"]));

    // ESC-9.10-1 (2): (e) also carries, with its own path:lines, each declaration a touched test uses (to the same fixed
    // point) that its file binds from a repository test module: a static relative import, or the dynamic-import idiom
    // `const { X } = (await import(PATH)) as …` whose PATH is a `join`/`resolve` of `import.meta.dir`, a const and
    // string literals. A namespace import, an unresolvable path, a non-test module and a name the module does not
    // declare stay unlisted.
    const importer = "pkg/tests/xaravel/uses.test.ts";
    const modules: Record<string, string> = {
      [importer]: [
        'import { join, resolve } from "node:path";',
        'import { staticHelper as local } from "./static-helpers";',
        'import * as everything from "./static-helpers";',
        'import { notThere } from "./static-helpers";',
        'import { srcThing } from "../../src/thing";',
        "",
        'const REPO = resolve(import.meta.dir, "..", "..", "..");',
        'const HELPERS = join(REPO, "shared", "tests", "helpers.ts");',
        "const { Branded, renamed: other, unused } = (await import(HELPERS)) as Helpers;",
        "const { lost } = (await import(somewhere())) as Helpers;",
        "",
        "function own(): unknown {",
        "  return new Branded([]);",
        "}",
        "",
        'xaravelTest("XT-uses-1", "uses imported helpers", () => {',
        "  own();",
        "  local();",
        "  other();",
        "  everything.namespaced();",
        "  notThere();",
        "  srcThing();",
        "  lost();",
        "});",
      ].join("\n"),
      "pkg/tests/xaravel/static-helpers.ts": ["export function staticHelper(): void {}", "export function namespaced(): void {}", ""].join("\n"),
      "shared/tests/helpers.ts": [
        'import { deep } from "./deeper";',
        "export class Branded extends Array<unknown> {",
        "  tag = tagOf();",
        "}",
        "function tagOf(): string {",
        "  return deep();",
        "}",
        "export function renamed(): void {}",
        "export function unused(): void {}",
        "",
      ].join("\n"),
      "shared/tests/deeper.ts": "export function deep(): string {\n  return \"d\";\n}\n",
      "pkg/src/thing.ts": "export function srcThing(): void {}\n",
    };
    const moduleUnits = (path: string): ReturnType<typeof testUnits> => (modules[path] === undefined ? [] : testUnits(modules[path]!));
    const isModule = (path: string): boolean => modules[path] !== undefined && /(?:^|\/)tests\//.test(path);
    const importerUnits = moduleUnits(importer);
    const usesUnit = importerUnits.find((unit) => unit.ids.includes("XT-uses-1"))!;
    const ownHelpers = usedDeclarations(importerUnits, usesUnit);
    expect(ownHelpers.map((helper) => helper.name)).toEqual(["own"]);
    expect(importedDeclarations(importer, [usesUnit.text, ...ownHelpers.map((helper) => helper.text)], moduleUnits, isModule).map((helper) => [helper.path, helper.name, helper.from, helper.to])).toEqual([
      ["pkg/tests/xaravel/static-helpers.ts", "staticHelper", 1, 1],
      ["shared/tests/deeper.ts", "deep", 1, 3],
      ["shared/tests/helpers.ts", "Branded", 2, 4],
      ["shared/tests/helpers.ts", "tagOf", 5, 7],
      ["shared/tests/helpers.ts", "renamed", 8, 8],
    ]);
    // The real case: XT-runtime-22's file binds BrandedArray from the grader's oracle-values.ts by a dynamic import.
    const semanticsPath = "packages/runtime/tests/xaravel/semantics.test.ts";
    const realUnits = (path: string): ReturnType<typeof testUnits> => (existsSync(join(root, path)) ? testUnits(readFileSync(join(root, path), "utf8")) : []);
    const semanticsUnits = realUnits(semanticsPath);
    const xt22 = semanticsUnits.find((unit) => unit.ids.includes("XT-runtime-22"))!;
    const xt22Own = usedDeclarations(semanticsUnits, xt22);
    const xt22Imported = importedDeclarations(semanticsPath, [xt22.text, ...xt22Own.map((helper) => helper.text)], realUnits, (path) => existsSync(join(root, path)));
    expect(xt22Imported.filter((helper) => helper.name === "BrandedArray").map((helper) => helper.path)).toEqual(["packages/assert/tests/xaravel/oracle-values.ts"]);
    // In the prompt, an imported declaration is shown with its own path:lines, under a heading that says so.
    const importedUser = eOnly([
      { ids: ["XT-uses-1"], path: importer, from: usesUnit.from, to: usesUnit.to, reasons: ["its lines change"], body: usesUnit.text, unavailable: null, consequences: [], citesFrom: "consequence", helpers: [ownHelpers[0]!, { path: "shared/tests/helpers.ts", name: "renamed", from: 8, to: 8, text: "export function renamed(): void {}" }] },
    ]);
    expect(importedUser).toContain("The declarations it uses from its own file and from the repository test modules it imports, directly or through another, in full (ESC-9.9-4, ESC-9.10-1):");
    expect(importedUser).toContain(`- \`own\` (${importer}:12-14):`);
    expect(importedUser).toContain("- `renamed` (shared/tests/helpers.ts:8-8):\n\n```ts\nexport function renamed(): void {}");
    // Through xaravelTestEvidence: a touched test's entry carries the imported declaration with its path.
    write(xtRepo.dir, "conformance/tests/xaravel/sample-fixtures.ts", `${fixturesText}\nexport function spareRoot(): string {\n  return "spare";\n}\n`);
    write(xtRepo.dir, sampleTest, sampleText.replace("const value = 1;", "const value = sharedRoot();"));
    const importedEntries = xaravelTestEvidence(xtRepo.dir, reviewDiff(xtRepo.dir, xtBase).files);
    git(xtRepo.dir, "checkout", "-q", "--", ".");
    expect(importedEntries.find((entry) => entry.ids.includes("XT-sample-1"))!.helpers).toEqual([{ path: sampleFixtures, name: "sharedRoot", from: 3, to: 5, text: 'export function sharedRoot(): string {\n  return readFileSync("fixtures/sample.json", "utf8");\n}' }]);

    // ESC-9.10-1 (3): (f) also carries each decision record cited in a docblock (g) lists for a changed packages/*/src/
    // file, on an unchanged line too; a plain comment, and a file outside packages/*/src/, add none.
    expect(sourceDocComments(["/** Cites decisions/ESC-1.1-1.md. */", "export function a(): void {}", "// ESC-2.2-2 in a plain comment", "export function b(): void {}", "class C {", "  /**", "   * @asyncRoot (ESC-3.3-3)", "   */", "  run(): void {}", "}"].join("\n"))).toEqual([
      "/** Cites decisions/ESC-1.1-1.md. */",
      "  /**\n   * @asyncRoot (ESC-3.3-3)\n   */",
    ]);
    const registryPath = "packages/runtime/src/registry/registry.ts";
    const registryPatch = (path: string): { filename: string; status: string; patch: string }[] => [{ filename: path, status: "modified", patch: "@@ -1,1 +1,1 @@\n-x\n+y" }];
    expect(gatherEvidence(root, registryPatch(registryPath), none).decisions.map((entry) => entry.label)).toContain("decisions/ESC-9.4-1.md");
    expect(gatherEvidence(root, registryPatch("packages/runtime/tests/xaravel/registry.test.ts"), none).decisions.map((entry) => entry.label)).not.toContain("decisions/ESC-9.4-1.md");

    // MAINT-2026-10-22-fidelity-whole-files: (h) shows each changed file in full, the records the changed files cite
    // anywhere, and the repository files they import, so a reviewer never has to ask for a file the change relies on.
    const read = (path: string): string => readFileSync(join(root, path), "utf8");
    const semanticsTest = "packages/runtime/tests/xaravel/semantics.test.ts";
    const oracleValues = "packages/assert/tests/xaravel/oracle-values.ts";
    // Imports: a relative static import, a re-export, a side-effect import, a literal dynamic import and the dynamic
    // idiom with a join(REPO, …) path resolve; a package import and a path outside the repository do not.
    const known = new Set(["a/b/helper.ts", "a/shared.ts", "a/b/setup.ts", "a/b/lazy.ts", "pkg/tests/values.ts"]);
    const importerText = [
      'import { helper } from "./helper";',
      'export { shared } from "../shared";',
      'import "./setup";',
      'const lazy = import("./lazy");',
      'import { runtime } from "@xaravel/runtime";',
      'import { gone } from "../../../outside";',
      'const REPO = join(import.meta.dir, "..", "..");',
      'const { Values } = (await import(join(REPO, "pkg", "tests", "values.ts"))) as { Values: unknown };',
    ].join("\n");
    expect(fileImports("a/b/c.test.ts", importerText, (path) => known.has(path))).toEqual(["a/b/helper.ts", "a/b/lazy.ts", "a/b/setup.ts", "a/shared.ts", "pkg/tests/values.ts"]);
    expect(fileImports(semanticsTest, read(semanticsTest), (path) => existsSync(join(root, path)))).toContain(oracleValues);
    // The ESC-9.10-1 cases come with no case-by-case rule: the imported grader module, and the decision a changed
    // source file's unchanged docblock cites, are shown in full; the changed files are too.
    const whole = wholeFileEvidence(root, [...registryPatch(registryPath), ...registryPatch(semanticsTest)], new Map(), 400_000);
    const entry = (path: string) => whole.find((item) => item.path === path);
    expect(entry("decisions/ESC-9.4-1.md")).toEqual({ path: "decisions/ESC-9.4-1.md", reason: `cited by ${registryPath}`, text: read("decisions/ESC-9.4-1.md"), note: null });
    expect(entry(oracleValues)).toEqual({ path: oracleValues, reason: `imported by ${semanticsTest}`, text: read(oracleValues), note: null });
    expect(entry(registryPath)).toEqual({ path: registryPath, reason: "changed", text: read(registryPath), note: null });
    expect(entry(semanticsTest)!.text).toBe(read(semanticsTest));
    expect(whole.filter((item) => item.path === registryPath)).toHaveLength(1);
    // Order: cited records and a changed test's imports, which no other section shows, come before the changed files.
    const order = whole.map((item) => item.path);
    expect(order.indexOf("decisions/ESC-9.4-1.md")).toBeLessThan(order.indexOf(registryPath));
    expect(order.indexOf(oracleValues)).toBeLessThan(order.indexOf(registryPath));
    // A file another section shows in full is named, not repeated.
    const named = wholeFileEvidence(root, registryPatch(registryPath), new Map([["decisions/ESC-9.4-1.md", "(f)"]]), 400_000);
    expect(named.find((item) => item.path === "decisions/ESC-9.4-1.md")).toEqual({ path: "decisions/ESC-9.4-1.md", reason: `cited by ${registryPath}`, text: null, note: "shown in full above, in (f)" });
    // Past the budget every file is still named, as omitted for size; none is dropped.
    const tight = wholeFileEvidence(root, [...registryPatch(registryPath), ...registryPatch(semanticsTest)], new Map(), 100);
    expect(tight.map((item) => item.path)).toEqual(order);
    expect(tight.every((item) => item.text === null && item.note!.startsWith("omitted for size:"))).toBe(true);
    // A file over the one-file limit is named with it; a removed or binary file and an Oracle fixture are not shown.
    const toolPath = "tools/fidelity-review/fidelity-review.ts";
    expect(read(toolPath).length).toBeGreaterThan(WHOLE_FILE_CAP);
    expect(wholeFileEvidence(root, registryPatch(toolPath), new Map(), 400_000).find((item) => item.path === toolPath)!.note).toBe(
      `omitted for size: ${read(toolPath).length} characters, over the ${WHOLE_FILE_CAP}-character limit for one file; its diff is above`,
    );
    expect(
      wholeFileEvidence(root, [
        { filename: "a/removed.ts", status: "removed", patch: null },
        { filename: "a/image.png", status: "added, binary", patch: null },
        { filename: "conformance/fixtures/runtime/x.json", status: "added", patch: "@@ -0,0 +1 @@\n+{}" },
      ], new Map(), 400_000),
    ).toEqual([]);
    // ESC-10.1-5: (h) also shows the repository files a changed test file reads as data, with its helpers and fixtures.
    // A read's path resolves as an import's does: import.meta.dir, a file const, join/resolve and string literals.
    const dataKnown = new Set(["a/rows.jsonl", "a/b/one.json", "pkg/data.txt"]);
    const readerText = [
      'const REPO = join(import.meta.dir, "..", "..");',
      'const DATA = join(REPO, "pkg", "data.txt");',
      'const rows = readFileSync(join(import.meta.dir, "..", "rows.jsonl"), "utf8");',
      'const one = await readFile(join(import.meta.dir, "one.json"));',
      "const text = await Bun.file(DATA).text();",
      'readFileSync(join(root, "unresolved.json"));',
      'readFileSync(join(import.meta.dir, "missing.json"));',
      'readFileSync(join(import.meta.dir, "..", "..", "..", "outside.json"));',
    ].join("\n");
    expect(dataFileReads("a/b/c.test.ts", readerText, (path) => dataKnown.has(path))).toEqual(["a/b/one.json", "a/rows.jsonl", "pkg/data.txt"]);
    const psrTest = "packages/contracts/tests/xaravel/psr.test.ts";
    const contractsRows = "conformance/api-surface/contracts.jsonl";
    expect(dataFileReads(psrTest, read(psrTest), (path) => existsSync(join(root, path)))).toEqual([contractsRows]);
    // A data file under the one-file limit is shown whole, before the changed files; a changed file that is not a test
    // adds none.
    const dataRoot = tempDir("fidelity-data-");
    mkdirSync(join(dataRoot, "a", "tests"), { recursive: true });
    writeFileSync(join(dataRoot, "a", "rows.json"), '{"rows":[1,2]}\n');
    const dataReader = 'const rows = readFileSync(join(import.meta.dir, "..", "rows.json"), "utf8");\n';
    writeFileSync(join(dataRoot, "a", "tests", "rows.test.ts"), dataReader);
    writeFileSync(join(dataRoot, "a", "source.ts"), dataReader.replace('"..", ', ""));
    writeFileSync(join(dataRoot, "a", "tests", "rows.json"), "{}\n");
    const dataWhole = wholeFileEvidence(dataRoot, [{ filename: "a/tests/rows.test.ts", status: "added", patch: "@@ -0,0 +1 @@\n+x" }], new Map(), 400_000);
    expect(dataWhole.map((item) => [item.path, item.reason])).toEqual([["a/rows.json", "read by a/tests/rows.test.ts"], ["a/tests/rows.test.ts", "changed"]]);
    expect(dataWhole[0]!.text).toBe('{"rows":[1,2]}\n');
    expect(wholeFileEvidence(dataRoot, [{ filename: "a/source.ts", status: "added", patch: "@@ -0,0 +1 @@\n+x" }], new Map(), 400_000).map((item) => item.path)).toEqual(["a/source.ts"]);
    // One over the limit shows the lines the test's string literals select, most selective first, each literal whole
    // or not at all within the limit, in file order; a literal matching nearly every line is left out.
    const common = Array.from({ length: 6_000 }, (_, index) => `{"kind":"method","n":${index},"pad":"${"x".repeat(30)}"}`);
    const dataText = [`{"fqcn":"Psr\\\\Log\\\\LoggerInterface","kind":"interface"}`, ...common.slice(0, 1_000), `{"fqcn":"Psr\\\\Log\\\\LogLevel","kind":"class"}`, ...common.slice(1_000)].join("\n");
    expect(dataText.length).toBeGreaterThan(WHOLE_FILE_CAP);
    const excerpt = dataFileExcerpt(dataText, 'const NS = "Psr\\\\Log\\\\";\nrow.kind === "method";\nconst no = "absent";\n')!;
    expect(excerpt).toEqual({ text: `{"fqcn":"Psr\\\\Log\\\\LoggerInterface","kind":"interface"}\n{"fqcn":"Psr\\\\Log\\\\LogLevel","kind":"class"}\n`, lines: 2, of: 6_002, literals: ["Psr\\\\Log\\\\"] });
    expect(dataFileExcerpt(dataText, 'const no = "absent";\n')).toBeNull();
    // The ESC-10.1-5 case: XT-contracts-4 reads contracts.jsonl. Under the 200,000-character limit
    // (MAINT-2026-10-24-evidence-gaps) it is shown whole, so (h) shows every PSR row it reads, and every other row.
    expect(read(contractsRows).length).toBeLessThanOrEqual(WHOLE_FILE_CAP);
    const psrWhole = wholeFileEvidence(root, registryPatch(psrTest), new Map(), 400_000);
    const rowsEntry = psrWhole.find((item) => item.path === contractsRows)!;
    expect(rowsEntry.reason).toBe(`read by ${psrTest}`);
    expect(rowsEntry.text).toBe(read(contractsRows));
    const psrRows = read(contractsRows).split("\n").filter((line) => line.startsWith('{"fqcn":"Psr\\\\'));
    expect(psrRows.length).toBe(28);
    expect(psrWhole.findIndex((item) => item.path === contractsRows)).toBeLessThan(psrWhole.findIndex((item) => item.path === psrTest));
    // ESC-10.2-7 (c): a file a changed test copies into a fixture (copyFileSync's source) is shown like a data file.
    expect(dataFileReads("a/b/c.test.ts", 'copyFileSync(join(import.meta.dir, "one.json"), join(tmp, "one.json"));\ncopyFileSync(join(tmp, "x"), "y");', (path) => dataKnown.has(path))).toEqual(["a/b/one.json"]);
    const structuralTest = "packages/contracts/tests/xaravel/structural.test.ts";
    expect(dataFileReads(structuralTest, read(structuralTest), (path) => existsSync(join(root, path)))).toContain("tsconfig.base.json");
    // ESC-10.2-7 (a): a changed test that reads Upstream sources through a computed path (a directory walk, a file
    // name built from a class name) gets the sources of the classes a changed file names in a string literal, under
    // the longest constant directory of the read; a name only in a comment, a class outside that directory and a read
    // outside the snapshot add none.
    const upRoot = tempDir("fidelity-upstream-");
    const contractsDir = `${UPSTREAM_SNAPSHOT_DIR}/framework/src/Illuminate/Contracts`;
    const arrayablePhp = "<?php\n\nnamespace Illuminate\\Contracts\\Support;\n\nuse Stringable;\n\n/**\n * @template TKey\n */\ninterface Arrayable extends\n    Stringable\n{\n    public function toArray();\n}\n";
    const upstreamFiles: Record<string, string> = {
      [`${contractsDir}/Support/Arrayable.php`]: arrayablePhp,
      [`${contractsDir}/Bus/Dispatcher.php`]: "<?php\n\nnamespace Illuminate\\Contracts\\Bus;\n\ninterface Dispatcher\n{\n}\n",
      [`${contractsDir}/Bus/Unported.php`]: "<?php\n\nnamespace Illuminate\\Contracts\\Bus;\n\ninterface Unported\n{\n}\n",
      [`${UPSTREAM_SNAPSHOT_DIR}/framework/src/Illuminate/Support/Collection.php`]: "<?php\n\nnamespace Illuminate\\Support;\n\nclass Collection\n{\n}\n",
      [`${UPSTREAM_SNAPSHOT_DIR}/framework/src/Illuminate/Bus/Batch.php`]: "<?php\n\nnamespace Illuminate\\Bus;\n\nclass Batch\n{\n}\n",
      "packages/x/src/support/Arrayable.ts": '// Illuminate\\Contracts\\Support\\Arrayable; returns an Illuminate\\Support\\Collection.\nexport const Arrayable = contract("Illuminate\\\\Contracts\\\\Support\\\\Arrayable");\n',
      "packages/x/src/bus/Dispatcher.ts": 'registerClass("Illuminate\\\\Contracts\\\\Bus\\\\Dispatcher", Dispatcher);\nregisterClass("Illuminate\\\\Bus\\\\Batch", Batch);\n',
      "packages/x/tests/walk.test.ts": [
        'const REPO = join(import.meta.dir, "..", "..", "..");',
        'const NAMESPACES = ["Support", "Bus"];',
        "for (const ns of NAMESPACES) {",
        '  const dir = join(REPO, "conformance", "upstream", "framework", "src", "Illuminate", "Contracts", ns);',
        '  for (const entry of readdirSync(dir).filter((name) => name.endsWith(".php"))) {',
        '    const source = readFileSync(join(dir, entry), "utf8");',
        "  }",
        "}",
        'readdirSync(join(REPO, "packages"));',
        "",
      ].join("\n"),
      "packages/x/tests/name.test.ts": 'const REPO = join(import.meta.dir, "..", "..", "..");\nfunction declaration(name: string): string {\n  const path = join(REPO, "conformance", "upstream", "framework", "src", ...name.split("\\\\")) + ".php";\n  return readFileSync(path, "utf8");\n}\n',
    };
    for (const [path, text] of Object.entries(upstreamFiles)) {
      mkdirSync(dirname(join(upRoot, path)), { recursive: true });
      writeFileSync(join(upRoot, path), text);
    }
    const isUpDir = (path: string) => existsSync(join(upRoot, path)) && !path.endsWith(".php") && !path.endsWith(".ts");
    expect(upstreamReadDirs("packages/x/tests/walk.test.ts", upstreamFiles["packages/x/tests/walk.test.ts"]!, isUpDir)).toEqual([contractsDir]);
    expect(upstreamReadDirs("packages/x/tests/name.test.ts", upstreamFiles["packages/x/tests/name.test.ts"]!, isUpDir)).toEqual([`${UPSTREAM_SNAPSHOT_DIR}/framework/src`]);
    expect(upstreamReadDirs("a/x.test.ts", 'readFileSync(join(root, "conformance", "upstream", "framework"));\nreaddirSync(join(import.meta.dir, "..", "..", "outside", "upstream"));\nreadFileSync(join(import.meta.dir, "..", "conformance", "upstream", "framework", "src", "Illuminate", "Contracts", "Bus", "Dispatcher.php"));', isUpDir)).toEqual([]);
    const upTexts = Object.entries(upstreamFiles).filter(([path]) => path.startsWith("packages/"));
    expect(upstreamSourcesNamed(upRoot, [contractsDir], upTexts).map((source) => [source.path, source.fqcn, source.by, source.dir])).toEqual([
      [`${contractsDir}/Bus/Dispatcher.php`, "Illuminate\\Contracts\\Bus\\Dispatcher", "packages/x/src/bus/Dispatcher.ts", contractsDir],
      [`${contractsDir}/Support/Arrayable.php`, "Illuminate\\Contracts\\Support\\Arrayable", "packages/x/src/support/Arrayable.ts", contractsDir],
    ]);
    expect(upstreamSourcesNamed(upRoot, [`${UPSTREAM_SNAPSHOT_DIR}/framework/src`], upTexts).map((source) => source.path)).toEqual([
      `${UPSTREAM_SNAPSHOT_DIR}/framework/src/Illuminate/Bus/Batch.php`,
      `${contractsDir}/Bus/Dispatcher.php`,
      `${contractsDir}/Support/Arrayable.php`,
    ]);
    expect(upstreamSourcesNamed(upRoot, [], upTexts)).toEqual([]);
    expect(upstreamSourcesNamed(tempDir("fidelity-no-upstream-"), [contractsDir], upTexts)).toEqual([]);
    // The declaration lines: namespace, top-level use, and the declaration up to its `{`, extends lists included.
    expect(phpDeclarationLines(arrayablePhp)).toBe("namespace Illuminate\\Contracts\\Support;\nuse Stringable;\ninterface Arrayable extends\n    Stringable\n{\n");
    expect(phpDeclarationLines("<?php\n\nreturn [];\n")).toBe("");
    // In (h) they come with the files changed tests read, each once and before the changed files; a changed source
    // is not repeated.
    const upChanged = ["packages/x/tests/walk.test.ts", "packages/x/src/support/Arrayable.ts", "packages/x/src/bus/Dispatcher.ts"].map((filename) => ({ filename, status: "added", patch: "@@ -0,0 +1 @@\n+x" }));
    const upWhole = wholeFileEvidence(upRoot, upChanged, new Map(), 400_000);
    const reader = (fqcn: string, by: string) => `read by packages/x/tests/walk.test.ts from ${contractsDir}/: the Upstream source of ${fqcn}, which ${by} names`;
    expect(upWhole.map((item) => [item.path, item.reason])).toEqual([
      [`${contractsDir}/Bus/Dispatcher.php`, reader("Illuminate\\Contracts\\Bus\\Dispatcher", "packages/x/src/bus/Dispatcher.ts")],
      [`${contractsDir}/Support/Arrayable.php`, reader("Illuminate\\Contracts\\Support\\Arrayable", "packages/x/src/support/Arrayable.ts")],
      ["packages/x/tests/walk.test.ts", "changed"],
      ["packages/x/src/support/Arrayable.ts", "changed"],
      ["packages/x/src/bus/Dispatcher.ts", "changed"],
    ]);
    expect(upWhole[1]!.text).toBe(arrayablePhp);
    // A changed file that is not a test reads none.
    expect(wholeFileEvidence(upRoot, upChanged.slice(1), new Map(), 400_000).map((item) => item.path)).toEqual(["packages/x/src/support/Arrayable.ts", "packages/x/src/bus/Dispatcher.ts"]);
    // One that does not fit shows its declaration lines, its room reserved before the whole files take theirs.
    // The budget is each entry's reserved heading room (220 beyond its path and reason) plus the two declarations' room.
    const headings = upWhole.reduce((sum, item) => sum + item.path.length + item.reason.length + 220, 0);
    const declarationRoom = [arrayablePhp, upstreamFiles[`${contractsDir}/Bus/Dispatcher.php`]!].reduce((sum, text) => sum + phpDeclarationLines(text).length + 20, 0);
    const upTight = wholeFileEvidence(upRoot, upChanged, new Map(), headings + declarationRoom);
    expect(upTight[1]!.text).toBe(phpDeclarationLines(arrayablePhp));
    expect(upTight[1]!.reason).toStartWith(`${reader("Illuminate\\Contracts\\Support\\Arrayable", "packages/x/src/support/Arrayable.ts")}; its declaration lines only, the file omitted for size: ${arrayablePhp.length} characters`);
    expect(upTight[1]!.note).toBeNull();
    // The prompt: (h) fills what the cap leaves, names (a)/(d)/(f) files instead of repeating them, and says what a
    // file named without its text means.
    const promptBase = { checklistText: CHECKLIST, items: ITEMS, precedence: null, storyId: "9.10", tree: "a".repeat(40), base: "b".repeat(40), manifestText: "", inventory: [], oracleRequests: [], files: registryPatch(registryPath) };
    const filled = withWholeFiles(root, { ...promptBase, evidence: { ...NO_EVIDENCE, decisions: gatherEvidence(root, registryPatch(registryPath), none).decisions } });
    expect(filled.evidence.wholeFiles.find((item) => item.path === "decisions/ESC-9.4-1.md")!.note).toBe("shown in full above, in (f)");
    const wholeUser = buildPrompt(filled).user;
    expect(wholeUser).toContain("### (h) Whole files: each changed file in full, the decision and DIV records they cite, the repository files they import, and the data files and Upstream sources changed tests read (any item)");
    expect(wholeUser).toContain("A file named here without its text is shown in full in another section, omitted for size, or unavailable, as its note says");
    expect(wholeUser).toContain(`#### ${registryPath} (changed)\n\n\`\`\`ts\n${read(registryPath)}`);
    expect(buildPrompt(filled).length).toBeLessThanOrEqual(PROMPT_CAP);
    expect(buildPrompt({ ...promptBase, files: [], evidence: NO_EVIDENCE }).user).toContain("### (h) Whole files: each changed file in full, the decision and DIV records they cite, the repository files they import, and the data files and Upstream sources changed tests read (any item)\n\nThe change adds or modifies no file this section shows.");
    // (h) reserves room for every entry's heading and note, so a prompt near the cap still fits with it: many files,
    // nearly all omitted for size, never push it over.
    const many = [...new Bun.Glob("packages/runtime/src/**/*.ts").scanSync({ cwd: root })].sort().map((filename) => ({ filename, status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" }));
    const nearCap = { ...promptBase, files: many, manifestText: "x".repeat(PROMPT_CAP - 120_000), evidence: NO_EVIDENCE };
    expect(buildPrompt(nearCap).length).toBeLessThan(PROMPT_CAP);
    const nearFilled = withWholeFiles(root, nearCap);
    expect(nearFilled.evidence.wholeFiles.some((item) => item.note?.startsWith("omitted for size:"))).toBe(true);
    expect(buildPrompt(nearFilled).length).toBeLessThanOrEqual(PROMPT_CAP);
    // With almost no room left (Story 9.11's review: 615,865 characters with (h)), the named files fold into one
    // summary entry, and with none at all (h) is one note: the prompt never goes over the cap.
    const unpadded = buildPrompt({ ...promptBase, files: many, evidence: NO_EVIDENCE }).length;
    const leaving = (headroom: number) => ({ ...promptBase, files: many, manifestText: "x".repeat(PROMPT_CAP - headroom - unpadded), evidence: NO_EVIDENCE });
    for (const headroom of [6_000, 600, 20]) {
      expect(buildPrompt(leaving(headroom)).length).toBe(PROMPT_CAP - headroom);
      const filled = withWholeFiles(root, leaving(headroom));
      expect([headroom, buildPrompt(filled).length <= PROMPT_CAP]).toEqual([headroom, true]);
      const paths = filled.evidence.wholeFiles.map((item) => item.path);
      expect(paths.filter((path) => path === "(other files)" || path === "(no files)").length).toBeLessThanOrEqual(1);
    }
    const summarised = withWholeFiles(root, leaving(6_000)).evidence.wholeFiles;
    expect(summarised.at(-1)).toMatchObject({ path: "(other files)", reason: "named only", text: null });
    expect(summarised.at(-1)!.note).toStartWith("named without their text (omitted for size, shown in full in another section, or unavailable): `");

    // ESC-9.10-3: (e) and (h) belong to the Story's own change. A path the Story may edit, or a test declaring an XT id
    // its manifest assigns, is in scope; a file another PR in the base range changed is not.
    const story = { storyId: "9.10", component: "runtime", xaravelTestIds: ["XT-runtime-35"] };
    expect(inStoryScope(story, "packages/runtime/tests/xaravel/exceptions.test.ts")).toBe(true);
    expect(inStoryScope(story, "conformance/tests/xaravel/fidelity-review.test.ts")).toBe(false);
    expect(inStoryScope(story, "conformance/tests/xaravel/fidelity-review.test.ts", ["XT-conformance-161"])).toBe(false);
    expect(inStoryScope(story, "conformance/tests/xaravel/other.test.ts", ["XT-runtime-35"])).toBe(true);
    expect(inStoryScope(story, "conformance/oracle-requests/9.10.jsonl")).toBe(true);
    // (e) names the touched tests it leaves out, never drops them silently.
    const scopedUser = buildPrompt({ ...promptBase, evidence: { ...NO_EVIDENCE, outOfScopeTests: ["conformance/tests/xaravel/fidelity-review.test.ts"] } }).user;
    expect(scopedUser).toContain("Left out as outside the Story's scope (ESC-9.10-3): the touched Xaravel Tests in `conformance/tests/xaravel/fidelity-review.test.ts`.");
    expect(buildPrompt({ ...promptBase, evidence: NO_EVIDENCE }).user).not.toContain("Left out as outside the Story's scope");
    // (h) puts a changed file outside the Story's scope last, and says so.
    const outside = "tools/graph/graph.ts";
    const scopedWhole = wholeFileEvidence(root, [...registryPatch(outside), ...registryPatch(registryPath)], new Map(), 400_000, (path) => inStoryScope(story, path));
    expect(scopedWhole.at(-1)).toMatchObject({ path: outside, reason: "changed, outside the Story's scope" });
    expect(scopedWhole.find((item) => item.path === registryPath)!.reason).toBe("changed");

    // ESC-9.10-4: the diff itself is the Story's own change. Its manifest, a path it may edit and a test file declaring
    // an XT id it assigns are in scope; another PR's tool, checklist or test file is not.
    expect(fileInStoryScope(root, story, "stories/9.10.md")).toBe(true);
    expect(fileInStoryScope(root, story, registryPath)).toBe(true);
    expect(fileInStoryScope(root, story, "tools/fidelity-review/fidelity-review.ts")).toBe(false);
    expect(fileInStoryScope(root, story, "conformance/review/fidelity.md")).toBe(false);
    expect(fileInStoryScope(root, story, "conformance/tests/xaravel/fidelity-review.test.ts")).toBe(false);
    expect(fileInStoryScope(root, { ...story, xaravelTestIds: ["XT-conformance-161"] }, "conformance/tests/xaravel/fidelity-review.test.ts")).toBe(true);
    expect(fileInStoryScope(root, story, "conformance/tests/xaravel/no-such.test.ts")).toBe(false);
    // The diff section names the files it leaves out, and only when there are any.
    const leftOutUser = buildPrompt({ ...promptBase, outOfScopeFiles: ["tools/fidelity-review/fidelity-review.ts"], evidence: NO_EVIDENCE }).user;
    expect(leftOutUser).toContain("## Diff\n\nLeft out as outside the Story's scope (ESC-9.10-4): `tools/fidelity-review/fidelity-review.ts`.");
    expect(buildPrompt({ ...promptBase, evidence: NO_EVIDENCE }).user).not.toContain("(ESC-9.10-4)");

    // MAINT-2026-10-16, amendment 2026-10-22: a retrospective action item from Epic 9 on is reviewed as a Story is. Its
    // sprint status entry stands in for a manifest, and its scope is what a Story of each component its action names
    // may edit.
    // Retrospective items, and items a Maintainer ruling adds (ESC-10.1-4, ESC-10.1-6, #343).
    expect(["epic-9-retro-item-3-scope-registry-gaps", "epic-12-retro-item-10-x", "epic-10-item-2-double-parent-brands", "epic-9-item-1-consequence-rows"].map((id) => RETRO_ITEM_ID.test(id))).toEqual([true, true, true, true]);
    expect(["9.1", "epic-9-retro-item-3", "epic-9-item-3", "epic-9-retro-item-3-Bad", "epic-9-retro-3-x", "epic-0-item-1-x"].map((id) => RETRO_ITEM_ID.test(id))).toEqual([false, false, false, false, false, false]);
    const statusOf = (...items: { id: string; action: string }[]): string =>
      `development_status:\n  epic-9: done\naction_items:\n${items.map((item) => `  - id: "${item.id}"\n    epic: 9\n    action: "${item.action}"\n    owner: "orchestrator"\n    status: open\n    ref: "r.md"\n`).join("")}`;
    const grader = "epic-9-retro-item-5-grader-runtime-protocols";
    const graderItem = readActionItem(root, statusOf({ id: grader, action: "packages/assert and packages/mockery: freeze the parents; packages/assert again (L9)" }), grader);
    expect(typeof graderItem === "string" ? graderItem : graderItem.components).toEqual(["assert", "mockery"]);
    expect(typeof graderItem === "string" ? "" : graderItem.text).toContain('action: "packages/assert and packages/mockery: freeze the parents; packages/assert again (L9)"');
    expect(readActionItem(root, statusOf({ id: grader, action: "x" }), "epic-9-retro-item-9-gone")).toBe("_bmad-output/implementation-artifacts/sprint-status.yaml has no action item epic-9-retro-item-9-gone");
    expect(readActionItem(root, statusOf({ id: grader, action: "rule the route (P5)" }), grader)).toBe(`action item ${grader} names no packages/<component>, so it has no scope to review`);
    expect(readActionItem(root, statusOf({ id: grader, action: "packages/nowhere: x" }), grader)).toBe(`action item ${grader} names packages/nowhere, which does not exist`);
    const scoped = { id: grader, components: ["assert", "mockery"] };
    expect(["packages/assert/src/Assert.ts", "packages/mockery/tests/x.test.ts", "packages/runtime/src/Registry.ts", "tools/fidelity-review/fidelity-review.ts", "conformance/tests/xaravel/fidelity-review.test.ts"].map((path) => inItemScope(scoped, path))).toEqual([true, true, false, false, false]);
    const itemUser = buildPrompt({ ...promptBase, subject: "item", storyId: grader, manifestText: "id: x", evidence: NO_EVIDENCE }).user;
    expect(itemUser.startsWith(`# Retrospective action item ${grader}: tree `)).toBe(true);
    expect(itemUser).toContain(`## Action item\n\n${ITEM_NOTE}\n\n\`\`\`yaml\nid: x\n\`\`\``);
    expect(itemUser).toContain("The action item assigns no Ported Test IDs.");
    expect(itemUser).not.toContain("## Manifest");
    // An item's assigned Xaravel Test ids are those its touched tests declare, so evidence (c) shows the Oracle fixtures
    // of a test it changes, as a manifest's ids do for a Story (Epic 9 retro item 4, #326: XT-runtime-22's fixture).
    expect(itemXaravelTestIds([{ ids: ["XT-runtime-22"] }, { ids: ["XT-runtime-22", "XT-runtime-23"] }, { ids: [] }])).toEqual(["XT-runtime-22", "XT-runtime-23"]);
    const itemFixtures = gatherEvidence(root, [], { testIds: [], xaravelTestIds: itemXaravelTestIds([{ ids: ["XT-runtime-22"] }]) });
    expect([...itemFixtures.errorFixtures, ...itemFixtures.presentFixtures].map((entry) => entry.label.split(" ")[0])).toContain("XT-runtime-22");
    const noIds = gatherEvidence(root, [], { testIds: [], xaravelTestIds: itemXaravelTestIds([]) });
    expect([noIds.errorFixtures, noIds.presentFixtures]).toEqual([[], []]);
    // (c) also shows, in full, the request line and fixture output of each id a touched Xaravel Test declares, so a
    // reviewer can check the operands and expected values it compares (Epic 9 retro item 4: XT-runtime-22's 9.6 row).
    const runtime22Sha = "1ff7702e40a6d33e0990903eef69e749a47d40a64faa31ed0c6b39e6cecb9bc3";
    const runtime22Fixture = `conformance/fixtures/runtime/${runtime22Sha}.json`;
    const testFixtures = touchedTestFixtures(root, [{ ids: ["XT-runtime-22"] }]);
    expect(testFixtures.map((entry) => entry.label)).toEqual([`XT-runtime-22 (conformance/oracle-requests/9.6.jsonl; ${runtime22Fixture})`]);
    const shownFixture = JSON.parse(testFixtures[0]!.text!) as { request: { id: string; sha256: string; input: { setup: string[] } }; fixture: { path: string; verified: boolean; output: unknown } };
    expect([shownFixture.request.id, shownFixture.request.sha256, shownFixture.fixture.path, shownFixture.fixture.verified]).toEqual(["XT-runtime-22", runtime22Sha, runtime22Fixture, true]);
    expect(shownFixture.request.input.setup[0]).toStartWith("$v = [null, true, false, 0,");
    expect(shownFixture.fixture.output).toEqual((JSON.parse(readFileSync(join(root, runtime22Fixture), "utf8")) as { output: unknown }).output);
    // An error fixture is (c)'s error section's, and an id with no committed request, or no touched test, shows nothing.
    expect(touchedTestFixtures(root, [{ ids: [ERROR_REQUEST_ID] }])).toEqual([]);
    expect(touchedTestFixtures(root, [{ ids: ["XT-runtime-9999"] }, { ids: [] }])).toEqual([]);
    const testFixtureUser = buildPrompt({ ...promptBase, evidence: { ...NO_EVIDENCE, testFixtures } }).user;
    expect(testFixtureUser).toContain(`### (c) The Oracle requests and fixture outputs of the touched Xaravel Tests, in full (F-7)\n\n#### ${testFixtures[0]!.label}\n\n\`\`\`json\n${testFixtures[0]!.text}`);
    expect(buildPrompt({ ...promptBase, evidence: NO_EVIDENCE }).user).toContain("No touched Xaravel Test declares an id with a committed Oracle request whose fixture is present, verifies and is not an error.");
    // One that does not fit the cap is named as omitted for size, longest first, so the prompt without (h) still fits.
    const huge = { label: "XT-sample-9 (x.jsonl; y.json)", text: "x".repeat(PROMPT_CAP), unavailable: null };
    const fitted = fitTestFixtures({ ...promptBase, evidence: { ...NO_EVIDENCE, testFixtures: [testFixtures[0]!, huge] } });
    expect(fitted.evidence.testFixtures.map((entry) => entry.text === null)).toEqual([false, true]);
    expect(fitted.evidence.testFixtures[1]!.unavailable).toStartWith(`omitted for size: ${PROMPT_CAP} characters`);
    expect(buildPrompt(fitted).user.length).toBeLessThanOrEqual(PROMPT_CAP);
    // One whose full output does not fit is first shown in a compact form that loses nothing: an int is its bare
    // decimal, a 0..n-1 array a JSON array, and every other value keeps the Oracle encoding (Epic 9 retro item 4:
    // XT-runtime-22's fixture, omitted for size at tree e9bfb33).
    expect(compactOracleValue({ array: [[{ int: "0" }, null], [{ int: "1" }, { float: "1.5" }], [{ int: "2" }, "1"], [{ int: "3" }, { int: "-9223372036854775808" }]] })).toBe('[null,{"float":"1.5"},"1",-9223372036854775808]');
    expect(compactOracleValue({ array: [[{ int: "1" }, true], [{ int: "0" }, false]] })).toBe('{"array":[[1,true],[0,false]]}');
    expect(compactOracleValue({ array: [[{ int: "0" }, { int: "1" }], ["a", { array: [] }]] })).toBe('{"array":[[0,1],["a",[]]]}');
    expect(compactOracleValue({ object: "stdClass", properties: [["a", "", { int: "1" }]] })).toBe('{"object":"stdClass","properties":[["a","",1]]}');
    expect(compactOracleValue({ results: [{ value: 1 }] })).toBeNull();
    const roomy = "y".repeat(PROMPT_CAP - buildPrompt({ ...promptBase, evidence: { ...NO_EVIDENCE, testFixtures } }).user.length + Math.floor(testFixtures[0]!.text!.length / 2));
    const squeezed = fitTestFixtures({ ...promptBase, evidence: { ...NO_EVIDENCE, testFixtures, consequences: [{ label: "pad", text: roomy, unavailable: null }] } });
    const compactEntry = squeezed.evidence.testFixtures[0]!;
    expect(compactEntry.label).toBe(`${testFixtures[0]!.label} (${COMPACT_FIXTURE_NOTE})`);
    const compactShown = JSON.parse(compactEntry.text!) as { request: unknown; fixture: { path: string; verified: boolean; output: { results: { value: unknown }[] } } };
    expect([compactShown.request, compactShown.fixture.path, compactShown.fixture.verified]).toEqual([shownFixture.request, runtime22Fixture, true]);
    expect(compactShown.fixture.output.results[1]!.value).toBeArrayOfSize(73);
    expect(compactEntry.text!.length).toBeLessThan(testFixtures[0]!.text!.length / 2);
    expect(buildPrompt(squeezed).user.length).toBeLessThanOrEqual(PROMPT_CAP);
  },
  180_000,
);

// ---------------------------------------------------------------------------
// XT-conformance-162 (AC3): a rejecting verdict, and failing closed

xaravelTest(
  "XT-conformance-162",
  "a failing Fidelity Review item records a reject verdict in the Story's spec and prints each finding for triage, so the Story returns to its implementer, and story:check's approvals then fails; a malformed or missing verdict, or an unclassified CLI failure, is retried once then records nothing and fails closed; verdicts for an older tree are stale, and two from the same slot or two on the loop's CLI without a recorded reason never pass (FR-111.3, AD-15.8)",
  async () => {
    // Reject: reviewer 1 fails F-2 with a finding.
    const finding = { path: "conformance/tests/support/SupportStrTest.test.ts", detail: "assertSame(3, …) became assertEquals('3', …)" };
    const repo = makeRepo();
    const tree = reviewTree(repo.dir, "worktree", SPEC);
    const rejecting = fakes({ codex: [{ kind: "answer", answer: { items: answers({ "F-2": "fail", "F-9": "n/a" }, { "F-2": [finding] }) } }] });
    const run = await review(repo.dir, rejecting.env, "--loop-cli", "claude");
    expect(run.code).toBe(1);
    expect(run.err).toEqual([]);
    expect(run.out).toEqual(["reviewer 1: reject (codex/gpt-fake-1)", "reviewer 2: pass (claude/claude-fake-1)", `F-2 ${finding.path}: ${finding.detail}`, `recorded 2 verdict(s) in ${SPEC} for tree ${tree}`]);
    const [rejected] = records(repo.spec);
    expect([rejected!.verdict, rejected!.tree]).toEqual(["reject", tree]);
    const specText = readFileSync(repo.spec, "utf8");
    expect(specText).toContain(`### Reviewer 1: reject at tree ${tree}`);
    expect(specText).toContain("| F-2: No expected value is weakened | fail | checked F-2 |");
    expect(specText).toContain("| F-9: Every `@asyncRoot` tag is true | n/a | checked F-9 |");
    expect(specText).toContain(`- **F-2** \`${finding.path}\`: ${finding.detail}`);
    const status1 = await status(repo.dir);
    expect(status1.code).toBe(1);
    expect(status1.out).toEqual([`missing: 1 of 2 pass verdicts for tree ${tree}`, `  reviewer 1: reject at tree ${tree}`, `  reviewer 2: pass at tree ${tree}`]);
    commitAll(repo.dir);
    expect(renderClause(approvalsClause(repo.dir, "9.1"))).toEqual([`FAIL approvals: 1 of 2 pass verdicts for tree ${tree}`, `  reviewer 1: reject at tree ${tree}`, `  reviewer 2: pass at tree ${tree}`]);
    // The reject stands on the unchanged tree (ESC-8.8-1), bookkeeping edits included: a re-run runs no reviewer, records
    // nothing, prints the standing reject and its findings, and exits 1.
    const manifestPath = join(repo.dir, "stories", "9.1.md");
    writeFileSync(manifestPath, readFileSync(manifestPath, "utf8").replace("status: in-progress", "status: review"));
    write(repo.dir, "_bmad-output/implementation-artifacts/sprint-status.yaml", "development_status:\n  9-1-fidelity: review\n");
    expect(reviewTree(repo.dir, "worktree", SPEC)).toBe(tree);
    const rerunSpec = readFileSync(repo.spec, "utf8");
    const rerunFakes = fakes({});
    const rerun = await review(repo.dir, rerunFakes.env, "--loop-cli", "claude", "--base", repo.base);
    expect(rerun.code).toBe(1);
    expect(rerun.out).toEqual([`STANDING reviewer 1: reject at tree ${tree}`, `F-2 ${finding.path}: ${finding.detail}`]);
    expect(rerun.err).toEqual([
      `fidelity-review: reviewer 1's reject at tree ${tree} stands (ESC-8.8-1): fix its findings, which changes the reviewed tree, or supply the evidence it asks for, then review again; a re-run on the same tree is not allowed and runs no reviewer; nothing recorded`,
    ]);
    expect([rerunFakes.calls("claude").length, rerunFakes.calls("codex").length]).toEqual([0, 0]);
    expect(readFileSync(repo.spec, "utf8")).toBe(rerunSpec);
    const standing = standingRejects(parseRecords(rerunSpec), tree);
    expect(standing.map((entry) => [entry.reviewer, entry.entry.record!.verdict, entry.laterPasses.length])).toEqual([[1, "reject", 0]]);
    expect(standingRejects(parseRecords(rerunSpec), "f".repeat(40))).toEqual([]);
    commitAll(repo.dir, "bookkeeping");
    // A Maintainer waiver of F-2 (ESC-10.2-9): the same reject now counts beside the pass, so `review` exits 0 and says
    // so, `status` is current, story:check's approvals pass, and a re-run on the tree runs no reviewer and exits 0.
    const waiverRepo = makeRepo();
    const waivedEscalation = "---\ntest_ids:\n  - XT-support-1\ntrigger: protected-path\nproposed: x\nevidence: y\n---\n\n# ESC-9.1-1\n";
    write(waiverRepo.dir, "conformance/escalations/ESC-9.1-1.md", waivedEscalation);
    write(waiverRepo.dir, "decisions/ESC-9.1-1.md", `---\ndecision: approved\ndecided_by: Maintainer\ndate: 2026-10-23\nescalation_sha256: "${escalationDigest(waivedEscalation)}"\nfidelity_waiver:\n  subject: "9.1"\n  items: [F-2]\n---\n\nF-2 is waived.\n`);
    const waiverTree = reviewTree(waiverRepo.dir, "worktree", SPEC);
    const waiverFakes = fakes({ codex: [{ kind: "answer", answer: { items: answers({ "F-2": "fail", "F-9": "n/a" }, { "F-2": [finding] }) } }] });
    const waivedReview = await review(waiverRepo.dir, waiverFakes.env, "--loop-cli", "claude");
    expect(waivedReview.code).toBe(0);
    expect(waivedReview.out).toContain("waived: decisions/ESC-9.1-1.md (F-2)");
    const waivedDetail = `1 pass verdict and reviewer 1's reject waived by decisions/ESC-9.1-1.md (F-2) for tree ${waiverTree} (reviewer 1: codex/gpt-fake-1 reject, reviewer 2: claude/claude-fake-1 pass)`;
    expect(await status(waiverRepo.dir)).toMatchObject({ code: 0, out: [`current: ${waivedDetail}`] });
    commitAll(waiverRepo.dir);
    expect(renderClause(approvalsClause(waiverRepo.dir, "9.1"))).toEqual([`PASS approvals: ${waivedDetail}`]);
    const waivedRerunFakes = fakes({});
    expect(await review(waiverRepo.dir, waivedRerunFakes.env, "--loop-cli", "claude", "--base", waiverRepo.base)).toMatchObject({ code: 0, out: [`current: ${waivedDetail}`] });
    expect([waivedRerunFakes.calls("claude").length, waivedRerunFakes.calls("codex").length]).toEqual([0, 0]);
    // An evidence gap (MAINT-2026-10-24-evidence-gaps): a reject that fails F-7 on missing evidence only counts, with no
    // waiver; `review` exits 0 and prints the note, and story:check's approvals pass.
    const gapRepo = makeRepo();
    const gapTree = reviewTree(gapRepo.dir, "worktree", SPEC);
    const gapFakes = fakes({ codex: [{ kind: "answer", answer: { items: answers({ "F-7": "fail", "F-9": "n/a" }, { "F-7": [{ ...finding, kind: "missing-evidence" }] }) } }] });
    const gapReview = await review(gapRepo.dir, gapFakes.env, "--loop-cli", "claude");
    expect(gapReview.code).toBe(0);
    expect(gapReview.out).toContain(`evidence gap noted: reviewer 1 F-7 ${finding.path}: ${finding.detail}`);
    expect(readFileSync(gapRepo.spec, "utf8")).toContain(`- **F-7** \`${finding.path}\`: ${finding.detail} _(missing evidence)_`);
    commitAll(gapRepo.dir);
    expect(renderClause(approvalsClause(gapRepo.dir, "9.1"))).toEqual([
      `PASS approvals: 1 pass verdict and reviewer 1's reject noted as an evidence gap (F-7: missing evidence only) for tree ${gapTree} (reviewer 1: codex/gpt-fake-1 reject, reviewer 2: claude/claude-fake-1 pass)`,
    ]);
    // Rejects standing in both slots: both are printed, a finding's path is one line, and stderr speaks of both.
    const bothRepo = makeRepo();
    const bothTree = reviewTree(bothRepo.dir, "worktree", SPEC);
    const twoLine = { path: "a.ts\nb.ts", detail: "two\nlines" };
    const rejectBoth: Step = { kind: "answer", answer: { items: answers({ "F-2": "fail" }, { "F-2": [twoLine] }) } };
    expect((await review(bothRepo.dir, fakes({ codex: [rejectBoth], claude: [rejectBoth] }).env, "--loop-cli", "claude")).code).toBe(1);
    const bothFakes = fakes({});
    const bothRun = await review(bothRepo.dir, bothFakes.env, "--loop-cli", "claude");
    expect(bothRun.code).toBe(1);
    expect(bothRun.out).toEqual([`STANDING reviewer 1: reject at tree ${bothTree}`, "F-2 a.ts b.ts: two lines", `STANDING reviewer 2: reject at tree ${bothTree}`, "F-2 a.ts b.ts: two lines"]);
    expect(bothRun.err).toEqual([
      `fidelity-review: reviewer 1's and reviewer 2's rejects at tree ${bothTree} stand (ESC-8.8-1): fix their findings, which changes the reviewed tree, or supply the evidence they ask for, then review again; a re-run on the same tree is not allowed and runs no reviewer; nothing recorded`,
    ]);
    expect([bothFakes.calls("claude").length, bothFakes.calls("codex").length]).toEqual([0, 0]);
    // A later review of the fixed tree appends; the earlier records are never edited. It carries the latest reject's
    // findings (ESC-8.8-1 item 3): both reviewers see each as P-<k>, their schema requires `addressed`, and the records
    // hold `prior` with each answer.
    write(repo.dir, CHANGED, "export const added = 2;\n");
    const fixedTree = reviewTree(repo.dir, "worktree", SPEC);
    const before = readFileSync(repo.spec, "utf8");
    const expectedPrior: PriorFinding[] = [{ id: "P-1", reviewer: 1, item: "F-2", path: finding.path, detail: finding.detail }];
    expect(priorFindings(parseRecords(before), fixedTree)).toEqual(expectedPrior);
    expect(priorFindings(parseRecords(before), tree)).toEqual([]);
    const addressing: Step = { kind: "answer", answer: { items: answers(), addressed: addressed(["P-1"]) } };
    const fixedFakes = fakes({ codex: [addressing], claude: [addressing] });
    expect((await review(repo.dir, fixedFakes.env, "--loop-cli", "claude", "--base", repo.base)).code).toBe(0);
    for (const call of [fixedFakes.calls("codex")[0]!, fixedFakes.calls("claude")[0]!]) {
      expect(call.stdin).toContain(`${PRIOR_HEADING}\n\nAddress each in \`addressed\`; one that is not fixed makes its item fail.\n\n- P-1 (reviewer 1, F-2) ${finding.path}: ${finding.detail}\n`);
    }
    const fixedArgv = fixedFakes.calls("claude")[0]!.argv;
    for (const system of [fixedFakes.calls("codex")[0]!.stdin, fixedArgv[fixedArgv.indexOf("--system-prompt") + 1]!]) {
      expect(system).toContain('Your answer must also hold "addressed": exactly one entry per P id');
      expect(system).toContain("A finding that is not fixed makes its checklist item fail");
    }
    const firstArgv = rejecting.calls("claude")[0]!.argv;
    expect(firstArgv[firstArgv.indexOf("--system-prompt") + 1]).not.toContain("addressed");
    const priorSchema = JSON.parse(fixedArgv[fixedArgv.indexOf("--json-schema") + 1]!) as { required: string[]; properties: { addressed: { items: { required: string[]; properties: { id: { enum: string[] } } } } } };
    expect(priorSchema.required).toEqual(["items", "addressed"]);
    expect(priorSchema.properties.addressed.items.required).toEqual(["id", "fixed", "note"]);
    expect(priorSchema.properties.addressed.items.properties.id.enum).toEqual(["P-1"]);
    expect(priorSchema as unknown).toEqual(verdictSchema(ITEMS, expectedPrior));
    const after = readFileSync(repo.spec, "utf8");
    expect(after.startsWith(before.trimEnd())).toBe(true);
    expect(records(repo.spec).map((record) => [record.reviewer, record.verdict, record.tree, record.prior ?? null])).toEqual([
      [1, "reject", tree, []],
      [2, "pass", tree, []],
      [1, "pass", fixedTree, [{ ...expectedPrior[0], fixed: true, note: "checked P-1" }]],
      [2, "pass", fixedTree, [{ ...expectedPrior[0], fixed: true, note: "checked P-1" }]],
    ]);
    expect(after).toContain(`- **P-1** (reviewer 1, F-2) \`${finding.path}\`: ${finding.detail} **fixed**: checked P-1`);
    expect((await status(repo.dir)).out[0]).toStartWith("current: ");
    // With no earlier reject the prompt says so, and the schema is today's: no `addressed`.
    expect(fixedFakes.calls("claude")[0]!.stdin).not.toContain(NO_PRIOR);
    expect(JSON.parse(rejecting.calls("claude")[0]!.argv[rejecting.calls("claude")[0]!.argv.indexOf("--json-schema") + 1]!)).toEqual(verdictSchema(ITEMS));
    expect(rejecting.calls("claude")[0]!.stdin).toContain(`${PRIOR_HEADING}\n\n${NO_PRIOR}\n`);
    expect(verdictSchema(ITEMS)).not.toHaveProperty("properties.addressed");

    // After rejects in both slots, a changed tree carries both slots' findings. An answer without `addressed`, or one
    // that leaves a finding unfixed while its item passes, is malformed: retried once, then no verdict, nothing recorded.
    write(bothRepo.dir, CHANGED, "export const added = 4;\n");
    const bothPrior: PriorFinding[] = [
      { id: "P-1", reviewer: 1, item: "F-2", path: twoLine.path, detail: twoLine.detail },
      { id: "P-2", reviewer: 2, item: "F-2", path: twoLine.path, detail: twoLine.detail },
    ];
    expect(priorFindings(parseRecords(readFileSync(bothRepo.spec, "utf8")), reviewTree(bothRepo.dir, "worktree", SPEC))).toEqual(bothPrior);
    const unaddressed = fakes({ codex: [pass()], claude: [{ kind: "answer", answer: { items: answers(), addressed: addressed(["P-1", "P-2"], ["P-1"]) } }] });
    const unaddressedRun = await review(bothRepo.dir, unaddressed.env, "--loop-cli", "claude");
    expect(unaddressedRun.code).toBe(1);
    expect([unaddressed.calls("codex").length, unaddressed.calls("claude").length]).toEqual([2, 2]);
    expect(unaddressed.calls("codex")[0]!.stdin).toContain("- P-1 (reviewer 1, F-2) a.ts b.ts: two lines\n- P-2 (reviewer 2, F-2) a.ts b.ts: two lines\n");
    expect(unaddressedRun.err).toEqual([
      "fidelity-review: reviewer 1: codex attempt 1 of 2: malformed verdict: addressed is missing: the answer must address each finding of the latest reject (P-1, P-2)",
      "fidelity-review: reviewer 1: codex attempt 2 of 2: malformed verdict: addressed is missing: the answer must address each finding of the latest reject (P-1, P-2)",
      "fidelity-review: reviewer 1: no verdict from codex after 2 attempts",
      "fidelity-review: reviewer 2: claude attempt 1 of 2: malformed verdict: P-1 is not fixed, so F-2 must fail",
      "fidelity-review: reviewer 2: claude attempt 2 of 2: malformed verdict: P-1 is not fixed, so F-2 must fail",
      "fidelity-review: reviewer 2: no verdict from claude after 2 attempts",
    ]);
    expect(records(bothRepo.spec)).toHaveLength(2);
    // An unfixed finding answered with its item failing is a reject, recorded with its answers.
    const unfixed: Step = { kind: "answer", answer: { items: answers({ "F-2": "fail" }, { "F-2": [{ path: "a.ts", detail: "still two lines" }] }), addressed: addressed(["P-2", "P-1"], ["P-2"]) } };
    const unfixedRun = await review(bothRepo.dir, fakes({ codex: [unfixed], claude: [{ kind: "answer", answer: { items: answers(), addressed: addressed(["P-1", "P-2"]) } }] }).env, "--loop-cli", "claude");
    expect(unfixedRun.code).toBe(1);
    expect(unfixedRun.out).toContain("F-2 a.ts: still two lines");
    expect(records(bothRepo.spec).slice(2).map((entry) => [entry.reviewer, entry.verdict, entry.prior!.map((answer) => [answer.id, answer.reviewer, answer.fixed])])).toEqual([
      [1, "reject", [["P-1", 1, true], ["P-2", 2, false]]],
      [2, "pass", [["P-1", 1, true], ["P-2", 2, true]]],
    ]);
    // The pure rules: missing, extra and duplicate P ids, a missing note, and `addressed` with no prior finding.
    const priorBad = (answer: Record<string, unknown>, prior: PriorFinding[] = bothPrior): string[] => {
      const result = parseVerdict(ITEMS, { items: answers(), ...answer }, prior);
      return result.ok ? [] : result.errors;
    };
    expect(priorBad({ addressed: addressed(["P-1", "P-2"]) })).toEqual([]);
    expect(priorBad({ addressed: addressed(["P-1"]) })).toEqual(["missing prior finding id P-2"]);
    expect(priorBad({ addressed: addressed(["P-1", "P-2", "P-3"]) })).toEqual(["addressed[2]: extra prior finding id P-3"]);
    expect(priorBad({ addressed: addressed(["P-1", "P-2", "P-1"]) })).toEqual(["addressed[2]: duplicate prior finding id P-1"]);
    expect(priorBad({ addressed: [{ id: "P-1", fixed: true, note: " " }, ...addressed(["P-2"])] })).toEqual(["P-1: note is missing or empty"]);
    expect(priorBad({ addressed: [{ id: "P-1", fixed: "yes", note: "x" }, ...addressed(["P-2"])] })).toEqual(["P-1: fixed is not true or false"]);
    expect(priorBad({ addressed: addressed(["P-1"]) }, [])).toEqual(["addressed[0]: extra prior finding id P-1"]);
    expect(priorBad({ addressed: [] }, [])).toEqual([]);
    expect(priorBad({})).toEqual(["addressed is missing: the answer must address each finding of the latest reject (P-1, P-2)"]);

    // Stale: a reviewed file changes after the verdicts; status says stale, and once committed approvals finds none.
    write(repo.dir, CHANGED, "export const added = 3;\n");
    const staleTree = reviewTree(repo.dir, "worktree", SPEC);
    expect(await status(repo.dir)).toEqual({ code: 1, out: [`stale: 0 of 2 pass verdicts for tree ${staleTree}`, `  reviewer 1: none for tree ${staleTree}`, `  reviewer 2: none for tree ${staleTree}`], err: [] });
    commitAll(repo.dir);
    expect(renderClause(approvalsClause(repo.dir, "9.1"))).toEqual([`FAIL approvals: 0 of 2 pass verdicts for tree ${staleTree}`, `  reviewer 1: none for tree ${staleTree}`, `  reviewer 2: none for tree ${staleTree}`]);

    // Malformed answer twice: retried once, then no record for that reviewer; stderr names the id; exit 1.
    const malformedRepo = makeRepo();
    const missingF9: Step = { kind: "answer", answer: { items: answers().filter((entry) => entry["id"] !== "F-9") } };
    const malformed = fakes({ codex: [missingF9] });
    const malformedRun = await review(malformedRepo.dir, malformed.env, "--loop-cli", "claude");
    expect(malformedRun.code).toBe(1);
    expect(malformed.calls("codex")).toHaveLength(2);
    expect(malformed.calls("claude")).toHaveLength(1);
    expect(malformedRun.err).toEqual([
      "fidelity-review: reviewer 1: codex attempt 1 of 2: malformed verdict: missing item id F-9",
      "fidelity-review: reviewer 1: codex attempt 2 of 2: malformed verdict: missing item id F-9",
      "fidelity-review: reviewer 1: no verdict from codex after 2 attempts",
    ]);
    // The missing verdict is on stdout too, so the review layer reports it as a finding.
    expect(malformedRun.out).toContain("NO-VERDICT reviewer 1: no verdict from codex after 2 attempts");
    expect(records(malformedRepo.spec).map((record) => record.reviewer)).toEqual([2]);
    commitAll(malformedRepo.dir);
    expect(renderClause(approvalsClause(malformedRepo.dir, "9.1"))[1]).toStartWith("  reviewer 1: none for tree ");
    // Malformed once, then well-formed: the retry's verdict is recorded.
    const retryRepo = makeRepo();
    const retry = fakes({ codex: [{ kind: "answer", answer: { items: answers({ "F-1": "yes" as "pass" }) } }, pass()] });
    const retryRun = await review(retryRepo.dir, retry.env, "--loop-cli", "claude");
    expect(retryRun.code).toBe(0);
    expect(retryRun.err).toEqual(['fidelity-review: reviewer 1: codex attempt 1 of 2: malformed verdict: F-1: result "yes" is not pass, fail or n/a']);
    expect(records(retryRepo.spec).map((record) => record.cli)).toEqual(["codex", "claude"]);
    // An answer that is not JSON at all, from claude, counts as malformed too.
    const notJson = makeRepo();
    const notJsonFakes = fakes({ claude: [{ kind: "raw", stdout: "All good!", code: 0 }] });
    const notJsonRun = await review(notJson.dir, notJsonFakes.env, "--loop-cli", "claude");
    expect(notJsonRun.code).toBe(1);
    expect(notJsonRun.err.join("\n")).toContain("claude exited 0 without a JSON result: All good!");
    expect(records(notJson.spec).map((record) => [record.reviewer, record.cli])).toEqual([[1, "codex"]]);

    // Unclassified failure twice: no fallback (claude is asked only for reviewer 2), no record, exit 1.
    const crashRepo = makeRepo();
    const crash = fakes({ codex: [{ kind: "raw", stderr: "thread 'main' panicked at core.rs:1\n", code: 3 }] });
    const crashRun = await review(crashRepo.dir, crash.env, "--loop-cli", "claude");
    expect(crashRun.code).toBe(1);
    expect(crash.calls("codex")).toHaveLength(2);
    expect(crash.calls("claude")).toHaveLength(1);
    expect(crashRun.err.join("\n")).toContain("codex exited 3: thread 'main' panicked at core.rs:1");
    expect(records(crashRepo.spec).map((record) => [record.reviewer, record.fallback])).toEqual([[2, null]]);
    // Codex echoes its prompt; a diff that says "usage limit" or "not logged in" must not make an unrelated failure look
    // like an unavailable CLI: no fallback, fail closed.
    const echoRepo = makeRepo();
    write(echoRepo.dir, CHANGED, "// When the usage limit is hit you are not logged in.\nexport const added = 1;\n");
    const echo = fakes({ codex: [{ kind: "raw", echo: true, code: 3 }] });
    const echoRun = await review(echoRepo.dir, echo.env, "--loop-cli", "claude");
    expect(echoRun.code).toBe(1);
    expect(echo.calls("codex")).toHaveLength(2);
    expect(echo.calls("claude")).toHaveLength(1);
    expect(echoRun.out).toContain("NO-VERDICT reviewer 1: no verdict from codex after 2 attempts");
    expect(records(echoRepo.spec).map((record) => [record.reviewer, record.fallback])).toEqual([[2, null]]);
    // Unavailable with no fallback left: both CLIs missing; nothing is recorded.
    const noneRepo = makeRepo();
    const noneRun = await review(noneRepo.dir, fakes({}, ["claude", "codex"]).env, "--loop-cli", "claude");
    expect(noneRun.code).toBe(1);
    expect(noneRun.err.filter((line) => line.endsWith("no fallback is left"))).toHaveLength(2);
    expect(parseRecords(readFileSync(noneRepo.spec, "utf8"))).toEqual([]);
    expect(readFileSync(noneRepo.spec, "utf8")).not.toContain(RECORDS_HEADING);
    // A timeout is a failure, retried once; the subprocess is killed.
    const sleepy = fakes({ claude: [{ kind: "sleep", ms: 10_000 }] });
    const prompt = buildPrompt({ checklistText: CHECKLIST, items: ITEMS, precedence: null, storyId: "9.1", tree: "a".repeat(40), base: "b".repeat(40), manifestText: "", inventory: [], oracleRequests: [], files: [], evidence: NO_EVIDENCE });
    const timedOut = await runReviewer({ cli: "claude", env: sleepy.env, prompt, items: ITEMS, timeoutMs: 300 });
    expect(timedOut.kind).toBe("failed");
    expect(timedOut.log).toEqual(["claude attempt 1 of 2: claude timed out after 300 ms", "claude attempt 2 of 2: claude timed out after 300 ms"]);
    expect(REVIEWER_TIMEOUT_MS).toBe(15 * 60 * 1000);
    // A grandchild holding stdout open does not keep an attempt past its timeout; the process group is killed.
    const hung = fakes({ claude: [{ kind: "hang" }] });
    const started = Date.now();
    const hungOutcome = await runReviewer({ cli: "claude", env: hung.env, prompt, items: ITEMS, timeoutMs: 300 });
    expect(hungOutcome.kind).toBe("failed");
    expect(Date.now() - started).toBeLessThan(5_000);

    // Counting: hand-written records. Two on the loop's CLI with no reason fail on the fallback rule; same-slot passes
    // count once; a record for another tree never counts.
    const t = "d".repeat(40);
    const record = (reviewer: 1 | 2, cli: "claude" | "codex", extra: Partial<VerdictRecord> = {}): VerdictRecord => ({ kind: RECORD_KIND, reviewer, verdict: "pass", tree: t, base: "e".repeat(40), cli, model: `${cli}-m`, loop_cli: "claude", fallback: null, date: "2026-10-20T00:00:00.000Z", items: answers() as unknown as VerdictRecord["items"], ...extra });
    const count = (list: VerdictRecord[], tree2 = t) => fidelityVerdicts(parseRecords(appendRecords("# spec\n", list.map((entry) => renderRecord(entry, ITEMS)))), tree2, ITEMS);
    expect(count([record(1, "codex"), record(2, "claude")]).pass).toBe(true);
    const sameCli = count([record(1, "claude"), record(2, "claude")]);
    expect(sameCli.pass).toBe(false);
    expect(sameCli.items.at(-1)).toContain("reviewer 1 ran on claude, the loop's own CLI, and recorded no fallback reason");
    expect(count([record(1, "claude", { fallback: "codex unavailable: usage limit: x" }), record(2, "claude")]).pass).toBe(true);
    expect(count([record(1, "codex"), record(1, "codex")]).pass).toBe(false);
    expect(count([record(2, "claude"), record(2, "claude")]).pass).toBe(false);
    expect(count([record(1, "codex"), record(2, "claude")], "f".repeat(40)).pass).toBe(false);
    expect(count([record(1, "codex"), record(2, "claude", { tree: "f".repeat(40) })]).items).toEqual([`reviewer 1: pass at tree ${t}`, `reviewer 2: none for tree ${t}`]);
    // A reject stands against a later pass in the same slot on the same tree (ESC-8.8-1); an item names the pass that does not count.
    const rejectRecord = record(1, "codex", { verdict: "reject", items: answers({ "F-2": "fail" }, { "F-2": [finding] }) as unknown as VerdictRecord["items"] });
    const reRolledText = appendRecords("# spec\n", [rejectRecord, record(2, "claude"), record(1, "codex")].map((entry) => renderRecord(entry, ITEMS)));
    const [rejectLine, , laterLine] = parseRecords(reRolledText).map((entry) => entry.line);
    const reRolled = fidelityVerdicts(parseRecords(reRolledText), t, ITEMS);
    expect(reRolled.pass).toBe(false);
    expect(reRolled.slots[0]).toEqual(rejectRecord);
    expect(reRolled.items).toEqual([
      `reviewer 1: reject at tree ${t}`,
      `reviewer 2: pass at tree ${t}`,
      `reviewer 1: the later pass at tree ${t} (record at line ${laterLine}) does not count: the reject at line ${rejectLine} stands until the reviewed tree changes (ESC-8.8-1)`,
    ]);
    // A Maintainer waiver (ESC-10.2-9): a reject that fails only waived items counts as a pass, standing or not, in one
    // slot or both (a carried finding makes the other reviewer fail the item too, ESC-8.8-1 item 3); a reject that also
    // fails an unwaived item, or the cross-model rule failing, still fail.
    const waive = (items: string[]): FidelityWaiver[] => [{ decision: "decisions/ESC-9.1-1.md", subject: "9.1", items }];
    const waivedCount = (list: VerdictRecord[], waivers: FidelityWaiver[]) => fidelityVerdicts(parseRecords(appendRecords("# spec\n", list.map((entry) => renderRecord(entry, ITEMS)))), t, ITEMS, waivers);
    const waivedRun = waivedCount([rejectRecord, record(2, "claude")], waive(["F-2"]));
    expect(waivedRun.pass).toBe(true);
    expect(waivedRun.detail).toBe(`1 pass verdict and reviewer 1's reject waived by decisions/ESC-9.1-1.md (F-2) for tree ${t} (reviewer 1: codex/codex-m reject, reviewer 2: claude/claude-m pass)`);
    expect(fidelityVerdicts(parseRecords(reRolledText), t, ITEMS, waive(["F-2"])).pass).toBe(true);
    expect(waivedCount([rejectRecord, record(2, "claude")], waive(["F-3"])).pass).toBe(false);
    expect(waivedCount([rejectRecord, record(2, "claude")], []).pass).toBe(false);
    const twoFails = record(1, "codex", { verdict: "reject", items: answers({ "F-2": "fail", "F-3": "fail" }, { "F-2": [finding], "F-3": [finding] }) as unknown as VerdictRecord["items"] });
    expect(waivedCount([twoFails, record(2, "claude")], waive(["F-2"])).pass).toBe(false);
    expect(waivedCount([twoFails, record(2, "claude")], waive(["F-2", "F-3"])).pass).toBe(true);
    const otherReject = record(2, "claude", { verdict: "reject", items: answers({ "F-2": "fail" }, { "F-2": [finding] }) as unknown as VerdictRecord["items"] });
    const bothWaived = waivedCount([rejectRecord, otherReject], waive(["F-2"]));
    expect(bothWaived.pass).toBe(true);
    expect(bothWaived.detail).toBe(`reviewer 1's and reviewer 2's rejects waived by decisions/ESC-9.1-1.md (F-2) for tree ${t} (reviewer 1: codex/codex-m reject, reviewer 2: claude/claude-m reject)`);
    expect(waivedCount([twoFails, otherReject], waive(["F-2"])).pass).toBe(false);
    expect(waivedCount([record(1, "claude", { verdict: "reject", items: answers({ "F-2": "fail" }, { "F-2": [finding] }) as unknown as VerdictRecord["items"] }), record(2, "claude")], waive(["F-2"])).pass).toBe(false);
    // An evidence gap (MAINT-2026-10-24-evidence-gaps): a reject whose fail items are outside F-2, F-3 and F-8 and hold
    // only missing-evidence findings counts as a pass, in one slot or both, and the detail notes it; a defect finding,
    // a finding with no kind, or a core item still fails, and so does the cross-model rule.
    const gapFinding = { ...finding, kind: "missing-evidence" };
    const gapRecord = (reviewer: 1 | 2, cli: "claude" | "codex", item: string, found: Record<string, unknown>[] = [gapFinding]) =>
      record(reviewer, cli, { verdict: "reject", items: answers({ [item]: "fail" }, { [item]: found as { path: string; detail: string }[] }) as unknown as VerdictRecord["items"] });
    const gapOne = waivedCount([gapRecord(1, "codex", "F-7"), record(2, "claude")], []);
    expect(gapOne.pass).toBe(true);
    expect(gapOne.detail).toBe(`1 pass verdict and reviewer 1's reject noted as an evidence gap (F-7: missing evidence only) for tree ${t} (reviewer 1: codex/codex-m reject, reviewer 2: claude/claude-m pass)`);
    expect(evidenceGapNotes(gapOne.slots)).toEqual([`evidence gap noted: reviewer 1 F-7 ${finding.path}: ${finding.detail}`]);
    expect(waivedCount([gapRecord(1, "codex", "F-7"), gapRecord(2, "claude", "F-1")], []).detail).toBe(
      `reviewer 1's reject noted as an evidence gap (F-7: missing evidence only) and reviewer 2's reject noted as an evidence gap (F-1: missing evidence only) for tree ${t} (reviewer 1: codex/codex-m reject, reviewer 2: claude/claude-m reject)`,
    );
    expect(waivedCount([gapRecord(1, "codex", "F-7"), otherReject], waive(["F-2"])).pass).toBe(true);
    for (const core of CORE_ITEMS) {
      expect([core, waivedCount([gapRecord(1, "codex", core), record(2, "claude")], []).pass]).toEqual([core, false]);
    }
    expect(waivedCount([gapRecord(1, "codex", "F-7", [{ ...finding, kind: "defect" }]), record(2, "claude")], []).pass).toBe(false);
    expect(waivedCount([gapRecord(1, "codex", "F-7", [gapFinding, finding]), record(2, "claude")], []).pass).toBe(false);
    expect(waivedCount([gapRecord(1, "claude", "F-7"), record(2, "claude")], []).pass).toBe(false);
    expect(evidenceGapReject(record(1, "codex"))).toBe(false);
    expect(evidenceGapReject(null)).toBe(false);
    // A finding's kind is checked: absent is allowed (an older record, a defect), any other value is not.
    expect(parseVerdict(ITEMS, { items: answers({ "F-7": "fail" }, { "F-7": [{ ...finding, kind: "maybe" }] }) })).toMatchObject({ ok: false, errors: [`F-7: findings[0] kind "maybe" is not defect or missing-evidence`] });
    expect(parseVerdict(ITEMS, { items: answers({ "F-7": "fail" }, { "F-7": [gapFinding] }) })).toMatchObject({ ok: true });
    expect(waivedReject(rejectRecord, waive(["F-2"]))).toBe(true);
    expect(waivedReject(record(1, "codex"), waive(["F-2"]))).toBe(false);
    expect(waivedReject(null, waive(["F-2"]))).toBe(false);
    // `fidelityWaivers` reads a waiver only from an approved, current ESC decision the Maintainer decided.
    const waiverRoot = tempDir("xaravel-fidelity-waivers-");
    const escalationText = "---\ntest_ids:\n  - XT-support-1\ntrigger: protected-path\nproposed: x\nevidence: y\n---\n\n# ESC-9.1-1\n";
    mkdirSync(join(waiverRoot, "conformance", "escalations"), { recursive: true });
    mkdirSync(join(waiverRoot, "decisions"));
    writeFileSync(join(waiverRoot, "conformance", "escalations", "ESC-9.1-1.md"), escalationText);
    const decisionText = (fields: string, digest = escalationDigest(escalationText)) => `---\ndecision: approved\ndecided_by: Maintainer\ndate: 2026-10-23\nescalation_sha256: "${digest}"\n${fields}---\n\nWaived.\n`;
    const writeDecision = (text: string) => writeFileSync(join(waiverRoot, "decisions", "ESC-9.1-1.md"), text);
    writeDecision(decisionText('fidelity_waiver:\n  subject: "9.1"\n  items: [F-7]\n'));
    expect(fidelityWaivers(waiverRoot, "9.1")).toEqual([{ decision: "decisions/ESC-9.1-1.md", subject: "9.1", items: ["F-7"] }]);
    expect(fidelityWaivers(waiverRoot, "9.2")).toEqual([]);
    for (const bad of [
      decisionText('fidelity_waiver:\n  subject: "9.1"\n  items: [F-7]\n', "0".repeat(64)),
      decisionText('fidelity_waiver:\n  subject: "9.1"\n  items: [F-7]\n').replace("decided_by: Maintainer", "decided_by: orchestrator"),
      decisionText('fidelity_waiver:\n  subject: "9.1"\n  items: []\n'),
      decisionText('fidelity_waiver:\n  subject: "9.1"\n  items: [all]\n'),
      decisionText(""),
    ]) {
      writeDecision(bad);
      expect(fidelityWaivers(waiverRoot, "9.1")).toEqual([]);
    }
    // A reject on another tree does not stand on this one, and a reject in one slot leaves the other slot's count alone.
    // The records after it must address its findings (`prior`, ESC-8.8-1 item 3); one that omits them is malformed.
    const p1 = { id: "P-1", reviewer: 1 as const, item: "F-2", path: finding.path, detail: finding.detail, fixed: true, note: "fixed" };
    const earlier = record(1, "codex", { ...rejectRecord, tree: "f".repeat(40), date: "2026-10-19T00:00:00.000Z" });
    expect(count([earlier, record(1, "codex", { prior: [p1] }), record(2, "claude", { prior: [p1] })]).pass).toBe(true);
    const omits = count([earlier, record(1, "codex", { prior: [p1] }), record(2, "claude")]);
    expect(omits.pass).toBe(false);
    expect(omits.detail).toBe("1 malformed Fidelity Review record(s)");
    expect(omits.items).toEqual([expect.stringMatching(new RegExp(`^record at line \\d+ does not address the findings of the latest reject before its run \\(ESC-8\\.8-1\\): it omits P-1 \\(reviewer 1, F-2\\) ${finding.path.replace(/[.]/g, "\\.")}: `))]);
    const malformedPrior = (prior: VerdictRecord["prior"], items?: VerdictRecord["items"]): string => count([earlier, record(1, "codex", { prior, ...(items === undefined ? {} : { items, verdict: "reject" }) }), record(2, "claude", { prior: [p1] })]).items.join("\n");
    expect(malformedPrior([{ ...p1, fixed: false }])).toContain("P-1 is not fixed, so F-2 must fail");
    expect(count([earlier, record(1, "codex", { prior: [{ ...p1, fixed: false }], verdict: "reject", items: rejectRecord.items }), record(2, "claude", { prior: [p1] })]).items[0]).toBe(`reviewer 1: reject at tree ${t}`);
    expect(malformedPrior([{ ...p1, detail: "another finding" }])).toContain("its P-1 is not P-1 (reviewer 1, F-2)");
    expect(malformedPrior([p1, { ...p1, id: "P-2" }])).toContain("extra prior finding id P-2");
    // A prior without an earlier reject is an extra; a record before the reject, or in the reject's own run, needs none.
    expect(count([record(1, "codex", { prior: [p1] }), record(2, "claude")]).items[0]).toContain("extra prior finding id P-1");
    expect(count([record(1, "codex"), record(2, "claude"), earlier]).pass).toBe(true);
    expect(count([record(1, "codex", { ...rejectRecord, tree: "f".repeat(40) }), record(2, "claude", { tree: "f".repeat(40) })], "f".repeat(40)).items[0]).toBe(`reviewer 1: reject at tree ${"f".repeat(40)}`);
    // A malformed prior shape is a malformed record, and a record with prior round-trips.
    expect(parseRecords(appendRecords("# s\n", [renderRecord(record(1, "codex", { prior: [{ ...p1, id: "Q-1" }] }), ITEMS)]))[0]!.problem).toBe('prior[0] is not a {id: "P-<k>", reviewer, item, path, detail, fixed, note} answer');
    expect(parseRecords(appendRecords("# s\n", [renderRecord(record(1, "codex", { prior: [p1] }), ITEMS)]))[0]!.record).toEqual(record(1, "codex", { prior: [p1] }));
    // A finding answered `fixed: false` is carried on even when its item failed with another finding: the next review
    // gets the reject's own finding and the unfixed one.
    const g = "a".repeat(40);
    const other = { path: "packages/support/src/Other.ts", detail: "another problem" };
    const stillFailing = record(1, "codex", { tree: g, date: "2026-10-19T12:00:00.000Z", verdict: "reject", items: answers({ "F-2": "fail" }, { "F-2": [other] }) as unknown as VerdictRecord["items"], prior: [{ ...p1, fixed: false }] });
    const carriedOn = [earlier, stillFailing, record(2, "claude", { tree: g, date: "2026-10-19T12:00:00.000Z", prior: [p1] })];
    const carried = priorFindings(parseRecords(appendRecords("# spec\n", carriedOn.map((entry) => renderRecord(entry, ITEMS)))), t);
    expect(carried).toEqual([
      { id: "P-1", reviewer: 1, item: "F-2", path: other.path, detail: other.detail },
      { id: "P-2", reviewer: 1, item: "F-2", path: finding.path, detail: finding.detail },
    ]);
    // The same finding listed again by the item is not carried twice.
    const relisted = record(1, "codex", { ...stillFailing, items: answers({ "F-2": "fail" }, { "F-2": [finding] }) as unknown as VerdictRecord["items"] });
    expect(priorFindings(parseRecords(appendRecords("# spec\n", [earlier, relisted].map((entry) => renderRecord(entry, ITEMS)))), t).map((entry) => entry.id)).toEqual(["P-1"]);
    const answering = carried.map((entry) => ({ ...entry, fixed: true, note: "fixed" }));
    expect(count([...carriedOn, record(1, "codex", { prior: answering }), record(2, "claude", { prior: answering })]).pass).toBe(true);
    const dropsCarried = count([...carriedOn, record(1, "codex", { prior: answering.slice(0, 1) }), record(2, "claude", { prior: answering })]);
    expect(dropsCarried.items.join("\n")).toContain(`it omits P-2 (reviewer 1, F-2) ${finding.path}: ${finding.detail}`);
    expect(count([record(2, "claude", { verdict: "reject", items: rejectRecord.items }), record(1, "codex"), record(2, "claude")]).items[0]).toBe(`reviewer 1: pass at tree ${t}`);

    // Records live only in the `## Fidelity Review` section, and appending keeps the sections after it in place.
    const withLater = appendRecords(`# s\n\n${RECORDS_HEADING}\n\nold\n\n## Auto Run Result\n\nDone.\n`, [renderRecord(record(1, "codex"), ITEMS)]);
    expect(withLater.indexOf("### Reviewer 1")).toBeLessThan(withLater.indexOf("## Auto Run Result"));
    expect(withLater.endsWith("## Auto Run Result\n\nDone.\n")).toBe(true);
    expect(parseRecords(withLater)).toHaveLength(1);
    expect(parseRecords(`# s\n\n\`\`\`json\n${JSON.stringify(record(1, "codex"))}\n\`\`\`\n`)).toEqual([]);
    expect(parseRecords(`${RECORDS_HEADING}\n\n\`\`\`json\n{"kind":"other"}\n\`\`\`\n`)[0]!.problem).toBe('kind is "other", not fidelity-verdict');

    // The rendered record: findings only for fail items, and model text cannot @-mention.
    const stray = { path: "packages/support/src/Stray.ts", detail: "a note on a passing item" };
    const strayVerdict = parseVerdict(ITEMS, { items: answers({ "F-2": "fail" }, { "F-2": [finding], "F-3": [stray] }) });
    expect(strayVerdict.ok).toBe(true);
    const strayText = strayVerdict.ok ? renderRecord(record(1, "codex", { verdict: decideVerdict(strayVerdict.verdict), items: strayVerdict.verdict }), ITEMS) : "";
    expect(strayText.split("```json")[0]).toContain(finding.path);
    expect(strayText.split("```json")[0]).not.toContain(stray.path);
    expect(renderRecord(record(1, "codex"), ITEMS)).toContain("Findings:\n\nNone.");
    const mention = parseVerdict(ITEMS, { items: answers({ "F-2": "fail" }, { "F-2": [{ path: "a/@team.ts", detail: "ping @xaravel/maintainers" }] }).map((entry) => (entry["id"] === "F-1" ? { ...entry, note: "cc @edanisko" } : entry)) });
    const mentionText = mention.ok ? renderRecord(record(1, "codex", { verdict: "reject", items: mention.verdict }), ITEMS).split("```json")[0]! : "";
    expect(mentionText).toContain("cc @\u200Bedanisko");
    expect(mentionText).toContain("`a/@\u200Bteam.ts`: ping @\u200Bxaravel/maintainers");
    expect(/@(?!\u200B)(edanisko|xaravel|team)/.test(mentionText)).toBe(false);
    expect(noMention("@a")).toBe("@\u200Ba");

    // The pure verdict rules.
    const ok = parseVerdict(ITEMS, { items: answers() });
    expect(ok.ok && decideVerdict(ok.verdict)).toBe("pass");
    const naOnly = parseVerdict(ITEMS, { items: answers({ "F-9": "n/a" }) });
    expect(naOnly.ok && decideVerdict(naOnly.verdict)).toBe("pass");
    const failed = parseVerdict(ITEMS, { items: answers({ "F-2": "fail" }, { "F-2": [finding] }) });
    expect(failed.ok && decideVerdict(failed.verdict)).toBe("reject");
    const bad = (input: unknown): string[] => {
      const result = parseVerdict(ITEMS, input);
      return result.ok ? [] : result.errors;
    };
    expect(bad({ items: answers().filter((entry) => entry["id"] !== "F-9") })).toEqual(["missing item id F-9"]);
    expect(bad({ items: [...answers(), { id: "F-11", result: "pass", note: "x", findings: [] }] })).toEqual(["items[10]: extra item id F-11"]);
    expect(bad({ items: [...answers(), answers()[0]] })).toEqual(["items[10]: duplicate item id F-1"]);
    expect(bad({ items: answers({ "F-3": "maybe" as "pass" }) })).toEqual(['F-3: result "maybe" is not pass, fail or n/a']);
    expect(bad({ items: answers({ "F-4": "fail" }) })).toEqual(["F-4: a fail needs at least one finding"]);
    expect(bad({ items: answers().map((entry) => (entry["id"] === "F-5" ? { ...entry, note: " " } : entry)) })).toEqual(["F-5: note is missing or empty"]);
    expect(bad({ items: answers({ "F-6": "fail" }, { "F-6": [{ path: "", detail: "x" }] }) })).toEqual(["F-6: findings[0] needs a non-empty path and detail"]);
    expect(bad(null)).toEqual(["the verdict is not an object with an items array"]);

    // Model text with newlines, fences and headings cannot swallow the record's JSON block.
    const hostile = parseVerdict(ITEMS, { items: answers({ "F-2": "fail" }, { "F-2": [{ path: "a.ts\n```", detail: "x\n```\n## Fidelity Review\n# Top\n```json\n{}" }] }).map((entry) => (entry["id"] === "F-1" ? { ...entry, note: "n\n```\n## Other" } : entry)) });
    expect(hostile.ok).toBe(true);
    const hostileRecord = record(1, "codex", { verdict: "reject", items: hostile.ok ? hostile.verdict : [] });
    const hostileText = appendRecords("# spec\n", [renderRecord(hostileRecord, ITEMS)]);
    expect(parseRecords(hostileText)).toEqual([{ line: expect.any(Number), record: hostileRecord, problem: null }]);
    expect(hostileText.split("```json")[0]).not.toContain("```");
    // Counted records are re-validated against the checklist: a missing item, an empty note or a fail with no finding is malformed.
    const thin = (items: unknown[]): VerdictRecord => record(1, "codex", { items: items as VerdictRecord["items"] });
    for (const items of [answers().filter((entry) => entry["id"] !== "F-4"), answers().map((entry) => (entry["id"] === "F-3" ? { ...entry, note: "" } : entry))]) {
      const result = count([thin(items), record(2, "claude")]);
      expect(result.pass).toBe(false);
      expect(result.detail).toBe("1 malformed Fidelity Review record(s)");
    }
    const failNoFinding = count([record(1, "codex", { verdict: "reject", items: answers({ "F-2": "fail" }) as unknown as VerdictRecord["items"] }), record(2, "claude")]);
    expect(failNoFinding.items[0]).toContain("F-2: a fail needs at least one finding");

    // The review layer and its Finalize re-check are wired into bmad-build-auto.
    const custom = Bun.TOML.parse(readFileSync(join(root, "_bmad", "custom", "bmad-build-auto.toml"), "utf8")) as { workflow: { review_layers: { id: string; when?: string; instruction: string }[] } };
    const layer = custom.workflow.review_layers.find((entry) => entry.id === "fidelity-review")!;
    expect(layer.when).toContain("stories/<id>.md");
    expect(layer.instruction).toContain("bun run fidelity:review review --story <id> --spec {spec_file} --loop-cli <cli>");
    expect(layer.instruction).toContain("Finalize re-check: `bun run fidelity:review status --story <id> --spec {spec_file}`");
    expect(layer.instruction).toContain("NO-VERDICT");
    // A retrospective action item from epic 9 on runs the same layer with --item (MAINT-2026-10-16, amendment 2026-10-22).
    expect(layer.when).toContain("retrospective action item from epic 9 on");
    expect(layer.instruction).toContain("pass `--item <action item id>` in place of `--story <id>`, here and in the Finalize re-check below");
    const step4 = readFileSync(join(root, ".claude", "skills", "bmad-build-auto", "step-04-review.md"), "utf8");
    expect(step4).toContain("A review layer may name a Finalize re-check.");
    expect(step4).toContain("review repair loop exceeded 5 iterations (non-convergence)");

    // Spec lookup: exactly one spec-<a>-<b>-*.md; spec-9-10-* is not Story 9.1's.
    const lookup = tempDir("xt-fidelity-lookup-");
    write(lookup, "_bmad-output/implementation-artifacts/spec-9-10-x.md", "x");
    expect(() => findStorySpec(lookup, "9.1")).toThrow("no spec matches _bmad-output/implementation-artifacts/spec-9-1-*.md");
    write(lookup, "_bmad-output/implementation-artifacts/spec-9-1-x.md", "x");
    expect(findStorySpec(lookup, "9.1")).toBe(join(lookup, "_bmad-output/implementation-artifacts/spec-9-1-x.md"));
  },
  180_000,
);
