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
  decideVerdict,
  EXCERPT_CAP,
  fidelityVerdicts,
  findStorySpec,
  NO_EVIDENCE,
  noMention,
  parseChecklist,
  parseRecords,
  parseVerdict,
  precedenceSection,
  PROMPT_CAP,
  RECORD_KIND,
  RECORDS_HEADING,
  renderRecord,
  REVIEWER_TIMEOUT_MS,
  reviewDiff,
  reviewTree,
  runFidelity,
  runReviewer,
  standingRejects,
  testUnits,
  verdictSchema,
  xaravelTestEvidence,
  type ChecklistItem,
  type VerdictRecord,
} from "../../../tools/fidelity-review/fidelity-review";
import { approvalsClause, renderClause } from "../../../tools/story-check/story-check";
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
function makeRepo(options: { oracle?: boolean; change?: boolean } = {}): { dir: string; base: string; spec: string } {
  const dir = tempDir("xt-fidelity-");
  const testIds = [TEST_ID, MISSING_ID, DATASET_ID, ...(options.oracle === true ? [ERROR_REQUEST_ID] : [])];
  const row = (id: string, source: string): string => JSON.stringify({ id, component: "support", kind: "unit", backends: ["none"], source, hash: "0".repeat(64), assertions: { assertSame: 1 }, oracle: { none: "pass" } });
  const files: Record<string, string> = {
    [CHECKLIST_FILE]: CHECKLIST,
    "stories/9.1.md": `---\nstory_id: "9.1"\nepic: 9\ncomponent: support\nstatus: in-progress\ntest_ids:\n${testIds.map((id) => `  - ${JSON.stringify(id)}\n`).join("")}xaravel_test_ids: []\n---\n\n# Story 9.1\n`,
    "conformance/inventory/support.jsonl": [
      row(TEST_ID, "framework/tests/Support/SupportFidelityTest.php:3-5"),
      row(MISSING_ID, "framework/tests/Support/Nowhere.php:1-2"),
      row(`${DATASET_ID}#a`, "framework/tests/Support/SupportFidelityTest.php:7-7"),
      row(`${DATASET_ID}#b`, "framework/tests/Support/SupportFidelityTest.php:8-8"),
      "",
    ].join("\n"),
    "conformance/upstream/framework/tests/Support/SupportFidelityTest.php": "<?php\nclass SupportFidelityTest {\n  public function testA() {\n    $this->assertSame(3, sum(1, 2));\n  }\n  public static function rows() { return [\n    'a' => [$this->assertSame('row-a', rowA())],\n    'b' => [$this->assertSame('row-b', rowB())],\n  ]; }\n}\n",
    "packages/support/src/Base.ts": "export const base = 0;\n",
  };
  for (const [path, text] of Object.entries(files)) {
    write(dir, path, text);
  }
  for (const rel of ["conformance/README.md", "decisions/DIV-1.md", "decisions/DIV-9.md", "conformance/xaravel-consequences/conformance.jsonl", ...(options.oracle === true ? ["conformance/oracle", ERROR_FIXTURE] : [])]) {
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

function answers(results: Record<string, "pass" | "fail" | "n/a"> = {}, findings: Record<string, { path: string; detail: string }[]> = {}): Record<string, unknown>[] {
  return IDS.map((id) => ({ id, result: results[id] ?? "pass", note: `checked ${id}`, findings: findings[id] ?? [] }));
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
    expect(PROMPT_CAP).toBe(600_000);
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
    const tree = reviewTree(repo.dir, "worktree");
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
    expect(user).toContain("No added line carries an `adapted:DIV-<n>.<k>` marker.");
    expect(user).toContain("No added line contains `@asyncRoot`.");
    // (e): the change edits only packages/support/src/, so no Xaravel Test is touched.
    expect(user).toContain("### (e) Xaravel Tests the change touches, in full, with their consequences (F-2, F-7)");
    expect(user).toContain("No Xaravel Test is touched: the change edits no Xaravel Test's lines, no test helper or fixture one uses, and no test file's top-level setup.");

    // status: current for the working tree. Committed unchanged, the head tree is the reviewed tree: approvals passes.
    expect(await status(repo.dir)).toEqual({ code: 0, out: [`current: 2 pass verdicts for tree ${tree} (reviewer 1: codex/gpt-fake-1, reviewer 2: claude/claude-fake-1)`], err: [] });
    commitAll(repo.dir);
    expect(reviewTree(repo.dir, "head")).toBe(tree);
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
    expect(reviewTree(repo.dir, "worktree")).toBe(tree);
    expect((await status(repo.dir)).out[0]).toStartWith("current: ");
    commitAll(repo.dir, "story done");
    expect(reviewTree(repo.dir, "head")).toBe(tree);
    expect(renderClause(approvalsClause(repo.dir, "9.1"))).toEqual([`PASS approvals: 2 pass verdicts for tree ${tree} (reviewer 1: codex/gpt-fake-1, reviewer 2: claude/claude-fake-1)`]);
    // The diff still shows a stories/ change; only the binding tree leaves it out.
    expect(reviewDiff(repo.dir, repo.base).files.map((file) => file.filename)).toContain("stories/9.1.md");

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
      ["too large", (dir) => write(dir, "packages/support/src/Big.ts", `${"x".repeat(PROMPT_CAP)}\n`), "over the 600000 cap, of which section (e), the touched Xaravel Tests, is 0; the diff and its evidence are too large to review"],
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
    const diff = reviewDiff(diffRepo.dir, specBase);
    // A symbolic base is resolved and recorded as its commit sha.
    expect(reviewDiff(diffRepo.dir, "HEAD").base).toBe(git(diffRepo.dir, "rev-parse", "HEAD"));
    expect(diff.base).toBe(specBase);
    expect(diff.files.map((file) => [file.filename, file.status])).toEqual([
      [REQUESTS, "added"],
      [CHANGED, "added"],
    ]);
    expect(diff.tree).toBe(reviewTree(diffRepo.dir, "worktree"));
    expect(git(diffRepo.dir, "ls-files", "--stage")).toBe(index);
    expect(git(diffRepo.dir, "diff", "--cached", "--name-only")).toBe(CHANGED);
    // A removal, a modification and a binary file each show; the removed file's lines are not "added" evidence.
    rmSync(join(diffRepo.dir, "packages", "support", "src", "Base.ts"));
    writeFileSync(join(diffRepo.dir, "conformance", "README.md"), `${readFileSync(join(diffRepo.dir, "conformance", "README.md"), "utf8")}\nMore.\n`);
    writeFileSync(join(diffRepo.dir, "logo.bin"), new Uint8Array([0, 1, 2, 0, 255]));
    const statuses = Object.fromEntries(reviewDiff(diffRepo.dir, diffRepo.base).files.map((file) => [file.filename, [file.status, file.patch === null]]));
    expect(statuses).toEqual({ [REQUESTS]: ["added", false], [CHANGED]: ["added", false], "conformance/README.md": ["modified", false], "logo.bin": ["added, binary", true], "packages/support/src/Base.ts": ["removed", false] });

    // The evidence (a)-(d): DIV records cited by adapted markers, consequence lines, error fixtures, DIV-1 for @asyncRoot.
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
        "",
      ].join("\n"),
    );
    const evidenceFakes = fakes({});
    expect((await review(evidenceRepo.dir, evidenceFakes.env, "--loop-cli", "claude")).code).toBe(0);
    const evidenceUser = evidenceFakes.calls("claude")[0]!.stdin;
    const evidenceSystem = (({ argv }) => argv[argv.indexOf("--system-prompt") + 1]!)(evidenceFakes.calls("claude")[0]!);
    expect(evidenceSystem).toContain("When in doubt, pick the reason that counts against conformance.");
    const div9 = readFileSync(join(root, "decisions", "DIV-9.md"), "utf8");
    expect(evidenceUser).toContain("### (a) DIV records cited by added adapted markers (F-3, F-5)");
    expect(evidenceUser).toContain(`#### decisions/DIV-9.md\n\n\`\`\`markdown\n${div9}`);
    expect(evidenceUser).toContain("fewer_assertions:");
    expect(evidenceUser).toContain("unavailable: decisions/DIV-77.md does not exist");
    expect(evidenceUser).toContain("unavailable: decisions/DIV-55.md does not exist");
    expect(evidenceUser).toContain("unavailable: decisions/DIV-66.md does not exist");
    expect(evidenceUser).toContain("### (b) Consequences cited on added lines (F-7)");
    const fr1111 = readFileSync(join(root, "conformance", "xaravel-consequences", "conformance.jsonl"), "utf8").split("\n").find((line) => line.startsWith('{"id":"FR-111.1"'))!;
    expect(evidenceUser).toContain(`conformance/xaravel-consequences/conformance.jsonl: ${fr1111}`);
    expect(evidenceUser).toContain("unknown consequence id FR-999.9");
    expect(evidenceUser).toContain("### (c) Oracle fixtures whose output is an error (F-6)");
    expect(evidenceUser).toContain(`#### ${ERROR_REQUEST_ID} (${ERROR_FIXTURE})`);
    expect(evidenceUser).toContain("Cannot 'continue' 2 levels");
    expect(evidenceUser).toContain("### (d) DIV-1 for @asyncRoot tags (F-9)");
    expect(evidenceUser).toContain(`#### decisions/DIV-1.md\n\n\`\`\`markdown\n${readFileSync(join(root, "decisions", "DIV-1.md"), "utf8")}`);
    // With no error fixture, (c) never claims the change has none: it points to the changed-fixture list.
    const bare = buildPrompt({ checklistText: CHECKLIST, items: ITEMS, precedence: null, storyId: "9.1", tree: "a".repeat(40), base: "b".repeat(40), manifestText: "", inventory: [], oracleRequests: [], files: [], evidence: NO_EVIDENCE }).user;
    expect(bare).toContain("No base fixture of an assigned committed Oracle request is an error; the changed fixtures are listed below.");
    expect(bare).toContain("No fixture the change adds or modifies is an error.");

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

    // The reviewed tree sees a same-size edit made in the second the real index was written (racy git): the temporary
    // index keeps the real index's mtime.
    const racy = tempDir("xt-fidelity-racy-");
    git(racy, "init", "-q");
    write(racy, "a.txt", "value 1\n");
    const racySecond = 1_700_000_000;
    utimesSync(join(racy, "a.txt"), racySecond, racySecond);
    git(racy, "add", "a.txt");
    const racyBefore = reviewTree(racy, "worktree");
    write(racy, "a.txt", "value 2\n");
    utimesSync(join(racy, "a.txt"), racySecond, racySecond);
    utimesSync(join(racy, ".git", "index"), racySecond, racySecond);
    expect(reviewTree(racy, "worktree")).not.toBe(racyBefore);

    // A removed Oracle request file is not read; the review still records its verdicts.
    const removedRepo = makeRepo({ change: false });
    write(removedRepo.dir, REQUESTS, '{"id":"x"}\n');
    const removedBase = commitAll(removedRepo.dir, "requests");
    rmSync(join(removedRepo.dir, REQUESTS));
    const removedRun = await review(removedRepo.dir, fakes({}).env, "--loop-cli", "claude", "--base", removedBase);
    expect(removedRun.code).toBe(0);
    expect(records(removedRepo.spec)).toHaveLength(2);
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
    const tree = reviewTree(repo.dir, "worktree");
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
    expect(reviewTree(repo.dir, "worktree")).toBe(tree);
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
    // Rejects standing in both slots: both are printed, a finding's path is one line, and stderr speaks of both.
    const bothRepo = makeRepo();
    const bothTree = reviewTree(bothRepo.dir, "worktree");
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
    // A later review of the fixed tree appends; the earlier records are never edited.
    write(repo.dir, CHANGED, "export const added = 2;\n");
    const fixedTree = reviewTree(repo.dir, "worktree");
    const before = readFileSync(repo.spec, "utf8");
    expect((await review(repo.dir, fakes({}).env, "--loop-cli", "claude", "--base", repo.base)).code).toBe(0);
    const after = readFileSync(repo.spec, "utf8");
    expect(after.startsWith(before.trimEnd())).toBe(true);
    expect(records(repo.spec).map((record) => [record.reviewer, record.verdict, record.tree])).toEqual([
      [1, "reject", tree],
      [2, "pass", tree],
      [1, "pass", fixedTree],
      [2, "pass", fixedTree],
    ]);
    expect((await status(repo.dir)).out[0]).toStartWith("current: ");

    // Stale: a reviewed file changes after the verdicts; status says stale, and once committed approvals finds none.
    write(repo.dir, CHANGED, "export const added = 3;\n");
    const staleTree = reviewTree(repo.dir, "worktree");
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
    // A reject on another tree does not stand on this one, and a reject in one slot leaves the other slot's count alone.
    expect(count([record(1, "codex", { ...rejectRecord, tree: "f".repeat(40) }), record(1, "codex"), record(2, "claude")]).pass).toBe(true);
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
