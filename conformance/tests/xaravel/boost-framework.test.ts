// Xaravel Tests for Stories 7.3 and 7.4 (Boost framework mode: the read-only
// MCP server `tools/boost-framework/src/server.ts` and its `.mcp.json`
// registration; FR-109, UJ-4).
//
// XT-boost-1..3 (Story 7.3) cover the tools, `inventory.get`'s source and
// assertions, and the registration. XT-boost-4..6 (Story 7.4) prove framework
// mode is read-only: the tool list and a static guard over src/ (with evasion
// probes it must flag); the real-path data scope, symlinks over stdio, a
// locked-down subprocess probe and a `--preload` recorder of every open; and
// a worktree snapshot before and after every tool is called.
//
// The server is driven over stdio by a raw newline-delimited JSON-RPC client
// (spawn, initialize, calls matched by id, kill). Fixture roots are hermetic
// temp directories; the real repository is only read. Where the server mirrors
// another tool's rule (it cannot import tools/*), the test compares it with
// that tool on the fixture and on the real repository.
import { afterAll, expect } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { computeReport } from "../../../tools/conformance-report/report";
import { escalationDigest, escalationStatus } from "../../../tools/escalations/escalations";
import { readManifests } from "../../../tools/ownership/ownership";
import { readExpectations, readWorkingInventory } from "../../../tools/pin-bump/pin-bump";
import { globToRegExp as harnessGlob } from "../../harness/select";
import { callTool, computeBuckets, DataScopeError, dataPath, globToRegExp, inScope, inventoryGet, parseSource, ReadOnlyError, storyTests, type ToolDefinition } from "../../../tools/boost-framework/src/index";
import { readExpectationShards, readInventory } from "../../../tools/boost-framework/src/data";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const SERVER = join(root, "tools", "boost-framework", "src", "server.ts");
const TOOL_NAMES = ["conformance.rate", "divergence.get", "escalations.open", "expectations.status", "inventory.get", "story.tests"];
const TIMEOUT = 120_000;

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `xaravel-${prefix}-`)));
  dirs.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// A raw stdio JSON-RPC client

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface RpcResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

class StdioClient {
  private readonly proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  private readonly waiting = new Map<number, { resolve: (response: RpcResponse) => void; reject: (error: Error) => void }>();
  private stderr = "";
  private exited = false;
  private nextId = 1;
  private buffer = "";
  private readonly done: Promise<void>;

  private constructor(command: readonly string[], cwd: string) {
    this.proc = Bun.spawn([...command], { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    this.done = Promise.all([this.read(), this.drainStderr()]).then(() => undefined);
    void this.proc.exited.then((code) => {
      this.exited = true;
      this.failAll(new Error(`server exited with code ${code} before replying; stderr:\n${this.stderr}`));
    });
  }

  private async drainStderr(): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of this.proc.stderr) {
      this.stderr += decoder.decode(chunk, { stream: true });
    }
  }

  private failAll(error: Error): void {
    for (const waiter of this.waiting.values()) {
      waiter.reject(error);
    }
    this.waiting.clear();
  }

  /** Spawns `command` in `cwd` and completes the MCP handshake. */
  static async start(command: readonly string[], cwd: string = root): Promise<{ client: StdioClient; init: Record<string, unknown> }> {
    const client = new StdioClient(command, cwd);
    const init = await client.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "xt-boost", version: "0.0.0" } });
    client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    return { client, init };
  }

  private async read(): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of this.proc.stdout) {
      this.buffer += decoder.decode(chunk, { stream: true });
      let newline = this.buffer.indexOf("\n");
      while (newline !== -1) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        newline = this.buffer.indexOf("\n");
        if (line === "") {
          continue;
        }
        const message = JSON.parse(line) as RpcResponse;
        const waiter = this.waiting.get(message.id);
        if (waiter !== undefined) {
          this.waiting.delete(message.id);
          waiter.resolve(message);
        }
      }
    }
  }

  private send(message: Record<string, Json>): void {
    void this.proc.stdin.write(`${JSON.stringify(message)}\n`);
    void this.proc.stdin.flush();
  }

  async request(method: string, params: Record<string, Json> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    if (this.exited) {
      throw new Error(`${method}: server already exited; stderr:\n${this.stderr}`);
    }
    const response = new Promise<RpcResponse>((resolveFn, rejectFn) => {
      this.waiting.set(id, { resolve: resolveFn, reject: rejectFn });
    });
    this.send({ jsonrpc: "2.0", id, method, params });
    const message = await response;
    if (message.error !== undefined) {
      throw new Error(`${method}: JSON-RPC error ${message.error.code}: ${message.error.message}`);
    }
    return message.result!;
  }

  async call(name: string, args: Record<string, Json> = {}): Promise<ToolResult> {
    return (await this.request("tools/call", { name, arguments: args })) as unknown as ToolResult;
  }

  /** The structured value of a successful call; it equals the text content parsed. */
  async value(name: string, args: Record<string, Json> = {}): Promise<Record<string, unknown>> {
    const result = await this.call(name, args);
    if (result.isError === true) {
      throw new Error(`${name} failed: ${result.content[0]?.text ?? ""}`);
    }
    expect(result.content.length).toBe(1);
    expect(result.content[0]!.type).toBe("text");
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent!);
    return result.structuredContent!;
  }

  async close(): Promise<void> {
    this.proc.kill();
    await this.proc.exited;
    await this.done;
  }
}

async function withServer<T>(serverRoot: string | null, fn: (client: StdioClient) => Promise<T>, options: { cwd?: string; preload?: string } = {}): Promise<T> {
  const args = serverRoot === null ? [] : ["--root", serverRoot];
  const preload = options.preload === undefined ? [] : ["--preload", options.preload];
  const { client } = await StdioClient.start(["bun", ...preload, "--no-env-file", SERVER, ...args], options.cwd ?? root);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function errorText(result: ToolResult): string {
  expect(result.isError).toBe(true);
  return result.content.map((item) => item.text).join("\n");
}

// ---------------------------------------------------------------------------
// Fixture

const HASH = "0".repeat(64);
const PIN_TEXT = [
  "# The Baseline Pin (fixture).",
  `laravel/framework v13.37.0 ${"a".repeat(40)} ${"b".repeat(40)}`,
  `laravel/ai v1.2.3 ${"c".repeat(40)} ${"d".repeat(40)}`,
  `laravel/mcp v1.0.2 ${"e".repeat(40)} ${"f".repeat(40)}`,
  `laravel/boost v2.10.3 ${"1".repeat(40)} ${"2".repeat(40)}`,
  "",
].join("\n");
const B1 = "Illuminate\\Tests\\A\\BTest::testOne";
const B2 = "Illuminate\\Tests\\A\\BTest::testTwo";
const D1 = "Illuminate\\Tests\\C\\DTest::testThree";
const ROW = `${B2}#first`;

function row(name: string, phase: number): string {
  return JSON.stringify({ name, dir: `packages/${name}`, npm: `@xaravel/${name}`, phase, kind: "upstream", upstream: null, private: false, require: [], suggest: [] });
}

function entry(id: string, component: string, source: string, assertions: Record<string, number> | null): string {
  return JSON.stringify({ id, component, kind: "unit", backends: ["none"], source, hash: HASH, assertions, oracle: assertions === null ? {} : { none: "pass" } });
}

function expectation(id: string, variant: string, status: string, reason: string | null = null, adapted: string | null = null, escalation: string | null = null): string {
  return JSON.stringify({ id, variant, status, reason, adapted, escalation });
}

function escalation(testIds: readonly string[], proposed: string): string {
  return ["---", "test_ids:", ...testIds.map((id) => `  - ${JSON.stringify(id)}`), "trigger: flaky", `proposed: ${JSON.stringify(proposed)}`, 'evidence: "It flakes."', "---", "", "Body.", ""].join("\n");
}

function decision(escalationText: string): string {
  return ["---", "decision: approved", `escalation_sha256: "${escalationDigest(escalationText)}"`, "---", "", "Approved.", ""].join("\n");
}

const OPEN = escalation([D1], "Quarantine it.");
const BOUND = escalation([B1], "Bound.");
const STALE = escalation([B2], "Stale now.");
const OTHER = escalation([B1], "Another Story's.");
const REJECTED = escalation([B1], "Rejected one.");
const NO_RATIONALE = escalation([B2], "Heading-only ruling.");

const DIV_3 = [
  "---",
  "id: DIV-3",
  "title: Fixture divergence",
  "---",
  "",
  "# DIV-3: Fixture divergence",
  "",
  "Intro text.",
  "",
  "- **DIV-3.1** The first clause,",
  "  continued.",
  "- DIV-3.2: The second clause.",
  "",
  "## DIV-3.3 A heading clause",
  "",
  "Its body.",
  "",
  "1. DIV-3.4 A numbered clause.",
  "DIV-3.5: A bare clause.",
  "",
  "## Notes",
  "",
  "Not part of a clause.",
  "",
].join("\n");

const FILES: Readonly<Record<string, string>> = {
  "tools/scaffold/packages.jsonl": `${row("cache", 5)}\n${row("support", 2)}\n`,
  "conformance/baseline-pin": PIN_TEXT,
  "conformance/inventory/support.jsonl": [
    entry(B1, "support", "framework/tests/A/BTest.php:11-18", { assertSame: 2 }),
    entry(B2, "support", "framework/tests/A/BTest.php:20-30", { assertSame: 3, assertTrue: 1 }),
    entry(ROW, "support", "framework/tests/A/BTest.php:20-30", null),
    "",
  ].join("\n"),
  "conformance/inventory/cache.jsonl": `${entry(D1, "cache", "framework/tests/C/DTest.php:5-9", { assertNull: 1 })}\n`,
  "conformance/inventory/oracle-nondeterminism.jsonl": `${JSON.stringify({ id: "Illuminate\\Tests\\A\\BTest::testNondeterministic", variant: "none", attempts: [], record: {} })}\n`,
  "conformance/expectations/support/framework/tests/A/BTest.jsonl": [
    expectation(B1, "sqlite", "fail-known", null, null, "ESC-9.9-2"),
    expectation(B1, "none", "pass", null, "DIV-3.1"),
    expectation(B2, "none", "skip", "not-ported-yet"),
    expectation(ROW, "none", "skip", "blocked-by:database"),
    "",
  ].join("\n"),
  "conformance/expectations/cache/framework/tests/C/DTest.jsonl": [
    expectation(D1, "none", "quarantined", null, null, "ESC-9.9-1"),
    expectation(D1, "sqlite", "skip", "php-only"),
    expectation(D1, "pgsql", "skip", "intentional-divergence:DIV-3"),
    "",
  ].join("\n"),
  "conformance/escalations/ESC-9.9-1.md": OPEN,
  "conformance/escalations/ESC-9.9-2.md": BOUND,
  "conformance/escalations/ESC-9.9-3.md": STALE,
  "conformance/escalations/ESC-9.8-1.md": OTHER,
  "decisions/ESC-9.9-2.md": decision(BOUND),
  "conformance/escalations/ESC-9.9-5.md": REJECTED,
  "decisions/ESC-9.9-5.md": decision(REJECTED).replace("decision: approved", "decision: rejected"),
  "conformance/escalations/ESC-9.9-6.md": NO_RATIONALE,
  "decisions/ESC-9.9-6.md": decision(NO_RATIONALE).replace("\nApproved.\n", "\n# Heading only\n\n"),
  "decisions/ESC-9.9-3.md": decision(escalation([B2], "What it said before.")),
  "decisions/DIV-3.md": DIV_3,
  "stories/9.9.md": ["---", 'story_id: "9.9"', "epic: 9", "component: support", "status: in-progress", 'title: "Fixture Story"', "test_ids:", `  - ${JSON.stringify(B1)}`, `  - ${JSON.stringify(B2)}`, "xaravel_test_ids:", "  - XT-support-1", "---", "", "# Story 9.9", ""].join("\n"),
  "stories/9.8.md": "no frontmatter\n",
};

function fixture(): string {
  const dir = tempDir("boost");
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function openEscalations(repo: string): string[] {
  const dir = join(repo, "conformance", "escalations");
  return readdirSync(dir)
    .filter((name) => name.startsWith("ESC-") && name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .filter((id) => escalationStatus(id, repo) === "open")
    .sort();
}

// ---------------------------------------------------------------------------
// XT-boost-1

xaravelTest(
  "XT-boost-1",
  "tools/boost-framework, whose only dependency is @modelcontextprotocol/server 2.3.1, offers inventory.get, expectations.status, conformance.rate, story.tests, divergence.get and escalations.open over stdio, each annotated read-only (FR-109.1)",
  async () => {
    // The dependency, and nothing but it and node:/relative imports.
    const manifest = JSON.parse(readFileSync(join(root, "tools", "boost-framework", "package.json"), "utf8")) as Record<string, unknown>;
    expect(manifest["dependencies"]).toEqual({ "@modelcontextprotocol/server": "2.3.1" });
    for (const field of ["devDependencies", "peerDependencies", "optionalDependencies", "peerDependenciesMeta", "bundledDependencies"]) {
      expect(`${field}: ${String(field in manifest)}`).toBe(`${field}: false`);
    }
    const srcDir = join(root, "tools", "boost-framework", "src");
    for (const name of readdirSync(srcDir).filter((file) => file.endsWith(".ts"))) {
      const text = readFileSync(join(srcDir, name), "utf8");
      const specs = [
        ...text.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm),
        ...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
        ...text.matchAll(/\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g),
      ];
      // A dynamic import must use a literal specifier, so the guard above sees it.
      expect(/\bimport\s*\(\s*[^"'`\s]/.test(text.replace(/\/\/.*$/gm, ""))).toBe(false);
      for (const match of specs) {
        const spec = match[1]!;
        const allowed = spec.startsWith("./") || spec.startsWith("node:") || spec === "@modelcontextprotocol/server" || spec === "@modelcontextprotocol/server/stdio";
        expect(`${name}: ${spec} ${allowed ? "allowed" : "not allowed"}`).toBe(`${name}: ${spec} allowed`);
      }
      expect(/\b(?:zod|ajv)\b/.test(text.replace(/\/\/.*$/gm, ""))).toBe(false);
    }

    // The mirrored Bucket equals computeReport on the fixture.
    const fix = fixture();
    const report = computeReport(fix);
    const buckets = computeBuckets(fix);
    expect(JSON.stringify(buckets.overall)).toBe(JSON.stringify(report.overall));
    expect(JSON.stringify(buckets.components)).toBe(JSON.stringify(report.components));
    expect(report.overall.statuses).toEqual({ pass: 1, "fail-known": 1, skip: 4, quarantined: 1 });

    await withServer(fix, async (client) => {
      // tools/list
      const listed = (await client.request("tools/list")) as { tools: { name: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> }[] };
      expect(listed.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
      for (const tool of listed.tools) {
        expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
        expect(tool.inputSchema["type"]).toBe("object");
        expect(tool.inputSchema["additionalProperties"]).toBe(false);
      }

      // inventory.get: the rule on id/glob, and SDK input validation.
      expect(errorText(await client.call("inventory.get", {}))).toContain("exactly one of id and glob");
      expect(errorText(await client.call("inventory.get", { id: B1, glob: "*" }))).toContain("exactly one of id and glob");
      expect(errorText(await client.call("inventory.get", { nope: 1 }))).toContain("Input validation error");
      expect(errorText(await client.call("inventory.get", { glob: "*", limit: 0 }))).toContain("Input validation error");
      expect(await client.value("inventory.get", { id: "Illuminate\\Tests\\Nope::testNope" })).toEqual({ entries: [], total: 0, truncated: false });
      const all = await client.value("inventory.get", { glob: "*" });
      expect((all["entries"] as { id: string }[]).map((item) => item.id)).toEqual([B1, B2, ROW, D1].sort());

      // expectations.status
      const status = await client.value("expectations.status", { id: B1 });
      expect(status).toEqual({
        id: B1,
        inInventory: true,
        lines: [
          { variant: "none", status: "pass", reason: null, adapted: "DIV-3.1", escalation: null, shard: "conformance/expectations/support/framework/tests/A/BTest.jsonl" },
          { variant: "sqlite", status: "fail-known", reason: null, adapted: null, escalation: "ESC-9.9-2", shard: "conformance/expectations/support/framework/tests/A/BTest.jsonl" },
        ],
      });
      expect(((await client.value("expectations.status", { id: B1, variant: "sqlite" }))["lines"] as unknown[]).length).toBe(1);
      expect(await client.value("expectations.status", { id: "X::nope" })).toEqual({ id: "X::nope", inInventory: false, lines: [] });
      expect(((await client.value("expectations.status", { id: ROW }))["lines"] as { reason: string }[]).map((line) => line.reason)).toEqual(["blocked-by:database"]);

      // conformance.rate
      const overall = await client.value("conformance.rate");
      expect(JSON.stringify(overall)).toBe(JSON.stringify({ scope: "overall", bucket: report.overall, components: ["cache", "support"] }));
      for (const component of ["cache", "support"]) {
        expect(JSON.stringify(await client.value("conformance.rate", { component }))).toBe(JSON.stringify({ scope: component, bucket: report.components[component], components: ["cache", "support"] }));
      }
      expect(await client.value("conformance.rate", { component: "nope" })).toEqual({ scope: "nope", bucket: null, components: ["cache", "support"] });
      expect((await client.value("conformance.rate", { component: "constructor" }))["bucket"]).toBeNull();
      expect((await client.call("conformance.rate", {})).content[0]!.text).not.toContain("alpha");

      // story.tests
      expect(await client.value("story.tests", { story: "9.9" })).toEqual({ story: "9.9", epic: 9, component: "support", title: "Fixture Story", status: "in-progress", testIds: [B1, B2], xaravelTestIds: ["XT-support-1"] });
      expect(errorText(await client.call("story.tests", { story: "9.7" }))).toContain("stories/9.7.md");
      expect(errorText(await client.call("story.tests", { story: "9.8" }))).toContain("stories/9.8.md");
      expect(errorText(await client.call("story.tests", { story: "../x" }))).toContain("Story ID");

      // divergence.get
      const div = await client.value("divergence.get", { id: "DIV-3" });
      expect(div["exists"]).toBe(true);
      expect(div["path"]).toBe("decisions/DIV-3.md");
      expect(div["frontmatter"]).toEqual({ id: "DIV-3", title: "Fixture divergence" });
      expect(div["text"]).toBe(DIV_3);
      expect(div["clauses"]).toEqual([
        { id: "DIV-3.1", text: "- **DIV-3.1** The first clause,\n  continued." },
        { id: "DIV-3.2", text: "- DIV-3.2: The second clause." },
        { id: "DIV-3.3", text: "## DIV-3.3 A heading clause\n\nIts body." },
        { id: "DIV-3.4", text: "1. DIV-3.4 A numbered clause." },
        { id: "DIV-3.5", text: "DIV-3.5: A bare clause." },
      ]);
      const clause = await client.value("divergence.get", { id: "DIV-3.2" });
      expect(clause["clauses"]).toEqual([{ id: "DIV-3.2", text: "- DIV-3.2: The second clause." }]);
      expect("text" in clause).toBe(false);
      expect(clause["exists"]).toBe(true);
      expect("note" in clause).toBe(false);
      // A clause the existing record does not have (Epic 8 retro item 7).
      const noClause = await client.value("divergence.get", { id: "DIV-3.99" });
      expect(noClause).toMatchObject({ id: "DIV-3.99", path: "decisions/DIV-3.md", exists: false, frontmatter: { id: "DIV-3", title: "Fixture divergence" }, clauses: [] });
      expect("text" in noClause).toBe(false);
      expect(String(noClause["note"])).toContain("DIV-3.99");
      const missing = await client.value("divergence.get", { id: "DIV-4" });
      expect(missing).toMatchObject({ id: "DIV-4", path: "decisions/DIV-4.md", exists: false, frontmatter: null, clauses: [] });
      expect(String(missing["note"])).toContain("Story 8.1");
      expect(errorText(await client.call("divergence.get", { id: "DIV-x" }))).toContain("DIV-<n>");

      // The real-record check: the fixture's DIV-3 is clean; misnamed records and unparsable clauses are reported.
      expect(await divergenceRecordProblems(client, fix)).toEqual([]);
      const bad = { "DIV-02.md": "- DIV-2.1 Misnamed.\n", "div-5.md": "- DIV-5.1 Lowercase.\n", "DIV-6.md": "# DIV-6\n\n- DIV 6.1 Not a clause start.\n" };
      for (const [name, text] of Object.entries(bad)) {
        writeFileSync(join(fix, "decisions", name), text);
      }
      expect(await divergenceRecordProblems(client, fix)).toEqual(["DIV-02.md: not a DIV-<n>.md name", "DIV-6: no clause the parser recognises", "div-5.md: not a DIV-<n>.md name"]);
      for (const name of Object.keys(bad)) {
        rmSync(join(fix, "decisions", name));
      }

      // escalations.open: the open and the stale one, not the bound one.
      const open = await client.value("escalations.open");
      expect(open).toEqual({
        escalations: [
          { id: "ESC-9.8-1", path: "conformance/escalations/ESC-9.8-1.md", trigger: "flaky", testIds: [B1], proposed: "Another Story's." },
          { id: "ESC-9.9-1", path: "conformance/escalations/ESC-9.9-1.md", trigger: "flaky", testIds: [D1], proposed: "Quarantine it." },
          { id: "ESC-9.9-3", path: "conformance/escalations/ESC-9.9-3.md", trigger: "flaky", testIds: [B2], proposed: "Stale now." },
          { id: "ESC-9.9-6", path: "conformance/escalations/ESC-9.9-6.md", trigger: "flaky", testIds: [B2], proposed: "Heading-only ruling." },
        ],
      });
      expect(escalationStatus("ESC-9.9-5", fix)).toBe("rejected");
      expect((open["escalations"] as { id: string }[]).map((item) => item.id)).toEqual(openEscalations(fix));
      expect(((await client.value("escalations.open", { story: "9.9" }))["escalations"] as { id: string }[]).map((item) => item.id)).toEqual(["ESC-9.9-1", "ESC-9.9-3", "ESC-9.9-6"]);

      // Fresh reads: an edit made while the server runs shows up at once.
      writeFileSync(join(fix, "conformance", "escalations", "ESC-9.9-4.md"), "not an escalation\n");
      const after = (await client.value("escalations.open", { story: "9.9" }))["escalations"] as { id: string; trigger: unknown }[];
      expect(after.map((item) => [item.id, item.trigger])).toEqual([
        ["ESC-9.9-1", "flaky"],
        ["ESC-9.9-3", "flaky"],
        ["ESC-9.9-4", null],
        ["ESC-9.9-6", "flaky"],
      ]);
    });

    // The real repository: rate == computeReport, open set == escalationStatus, story ids == readManifests.
    const real = computeReport(root);
    const realBuckets = computeBuckets(root);
    expect(JSON.stringify(realBuckets.overall)).toBe(JSON.stringify(real.overall));
    expect(JSON.stringify(realBuckets.components)).toBe(JSON.stringify(real.components));
    await withServer(null, async (client) => {
      const overall = await client.value("conformance.rate");
      expect(JSON.stringify(overall)).toBe(JSON.stringify({ scope: "overall", bucket: real.overall, components: Object.keys(real.components) }));
      const first = Object.keys(real.components)[0]!;
      expect(JSON.stringify((await client.value("conformance.rate", { component: first }))["bucket"])).toBe(JSON.stringify(real.components[first]));
      expect(((await client.value("escalations.open"))["escalations"] as { id: string }[]).map((item) => item.id)).toEqual(openEscalations(root));
      expect((await client.value("story.tests", { story: "7.3" }))["xaravelTestIds"]).toEqual(["XT-boost-1", "XT-boost-2", "XT-boost-3"]);

      // Every real Divergence Record is addressable and has at least one clause the parser recognises.
      expect(existsSync(join(root, "decisions"))).toBe(true);
      expect(await divergenceRecordProblems(client, root)).toEqual([]);
      if (!readdirSync(join(root, "decisions")).some((name) => /^div/i.test(name))) {
        // None yet (Story 8.1 writes them): the missing-record path is explicit, not silent.
        expect(await client.value("divergence.get", { id: "DIV-1" })).toMatchObject({ id: "DIV-1", exists: false, clauses: [] });
      }
    });
    const { manifests } = readManifests(root);
    expect(manifests.length).toBeGreaterThan(0);
    for (const item of manifests) {
      const value = storyTests(root, { story: item.storyId });
      expect(value).toMatchObject({ story: item.storyId, epic: item.epic, component: item.component, status: item.status, testIds: item.testIds, xaravelTestIds: item.xaravelTestIds });
    }

    // The mirrored Expectations walk and glob semantics.
    expect(readExpectationShards(root).map((shard) => [shard.path, shard.lines.length])).toEqual(readExpectations(root).map((shard) => [shard.path, shard.lines.length]));
    const pathological = "*t".repeat(14) + "!";
    const longId = `Illuminate\\Tests\\${"t".repeat(60)}::test${"t".repeat(10)}`;
    for (const glob of ["*", "?", "a*b", "*SupportStrTest::*", "X\\Y::t?st*", "a.b(c)[d]{e}|f^g$h+i/j", "*#*", "*a*1*", pathological]) {
      for (const candidate of ["", "a", "ab", "aXb", "X\\Y::test1", "a.b(c)[d]{e}|f^g$h+i/j", "a#b", "Illuminate\\Tests\\Support\\SupportStrTest::testX", "xa1", longId, `${longId}!`]) {
        expect(`${glob} ~ ${candidate}: ${globToRegExp(glob).test(candidate)}`).toBe(`${glob} ~ ${candidate}: ${harnessGlob(glob).test(candidate)}`);
      }
    }
    // The mirror compiles the same source as the harness, on the list above and on seeded random globs.
    let state = 0x5eed;
    const random = (n: number): number => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return (state >>> 16) % n;
    };
    const randomGlobs = Array.from({ length: 300 }, () => Array.from({ length: random(10) }, () => "ab1.\\*?"[random(7)]!).join(""));
    for (const glob of ["*", "?", "a*b", "*SupportStrTest::*", "X\\Y::t?st*", "a.b(c)[d]{e}|f^g$h+i/j", "*#*", "*a*1*", pathological, ...randomGlobs]) {
      expect(`${glob}: ${globToRegExp(glob).source}`).toBe(`${glob}: ${harnessGlob(glob).source}`);
    }
    // A glob that backtracked exponentially as [\s\S]* per * (epic 7 retro L2) matches every real Inventory ID quickly.
    expect(inventoryGet(root, { glob: pathological })).toMatchObject({ entries: [] });
    const ids = readInventory(root).map(({ raw }) => raw["id"] as string);
    expect(ids.length).toBeGreaterThan(0);
    const compiled = globToRegExp(pathological);
    const started = performance.now();
    const hits = ids.filter((id) => compiled.test(id));
    expect(performance.now() - started).toBeLessThan(1000);
    expect(hits).toEqual([]);

    // A bad flag: usage on stderr, exit 2, nothing on stdout.
    const bad = Bun.spawnSync(["bun", "--no-env-file", SERVER, "--nope"], { cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    expect(bad.exitCode).toBe(2);
    expect(bad.stdout.toString()).toBe("");
    expect(bad.stderr.toString()).toContain("Usage: bun --no-env-file tools/boost-framework/src/server.ts [--root <dir>]");
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-boost-2

xaravelTest(
  "XT-boost-2",
  "given a Test ID, inventory.get returns its source path and line range in conformance/upstream/ and the Upstream assertion multiset (FR-109)",
  async () => {
    const fix = fixture();
    await withServer(fix, async (client) => {
      const one = await client.value("inventory.get", { id: B1 });
      expect(one).toEqual({
        entries: [
          {
            id: B1,
            component: "support",
            kind: "unit",
            backends: ["none"],
            hash: HASH,
            oracle: { none: "pass" },
            assertions: { assertSame: 2 },
            source: { path: "conformance/upstream/framework/tests/A/BTest.php", start: 11, end: 18 },
          },
        ],
        total: 1,
        truncated: false,
      });
      const glob = await client.value("inventory.get", { glob: "*BTest::*", limit: 1 });
      expect(glob["total"]).toBe(3);
      expect(glob["truncated"]).toBe(true);
      expect((glob["entries"] as { id: string }[]).map((item) => item.id)).toEqual([B1]);
      const two = await client.value("inventory.get", { glob: "*BTest::testT??", limit: 5 });
      expect(two).toMatchObject({ total: 1, truncated: false, entries: [{ id: B2, assertions: { assertSame: 3, assertTrue: 1 }, source: { start: 20, end: 30 } }] });
      expect((await client.value("inventory.get", { glob: "*testNondeterministic" }))["total"]).toBe(0);
    });

    // The real Inventory: every source parses; the file filter matches; a sample's assertions equal the file's.
    const inventory = readWorkingInventory(root);
    for (const item of inventory) {
      const source = parseSource(item.source);
      if (source === null || source.start < 1 || source.end < source.start) {
        throw new Error(`${item.id}: source ${JSON.stringify(item.source)} does not parse as <path>:<start>-<end>`);
      }
    }
    const step = Math.max(1, Math.floor(inventory.length / 40));
    const sample = inventory.filter((_, index) => index % step === 0);
    await withServer(null, async (client) => {
      const everything = await client.value("inventory.get", { glob: "*", limit: 1 });
      expect(everything["total"]).toBe(inventory.length);
      for (const item of sample) {
        const value = await client.value("inventory.get", { id: item.id });
        const entries = value["entries"] as { id: string; component: string; assertions: unknown; source: { path: string; start: number; end: number } }[];
        expect(entries.length).toBe(1);
        const got = entries[0]!;
        expect(got.id).toBe(item.id);
        expect(got.component).toBe(item.component);
        expect(got.assertions).toEqual(item.assertions);
        const colon = item.source.lastIndexOf(":");
        expect(`${got.source.path}:${got.source.start}-${got.source.end}`).toBe(`conformance/upstream/${item.source}`);
        expect(got.source.path).toBe(`conformance/upstream/${item.source.slice(0, colon)}`);
        // The snapshot is synced locally (`bun run upstream:sync`), not committed; check the range when it is there.
        const file = join(root, got.source.path);
        if (existsSync(file)) {
          expect(got.source.end).toBeLessThanOrEqual(readFileSync(file, "utf8").split("\n").length);
        }
      }
    });
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-boost-3

xaravelTest(
  "XT-boost-3",
  "the repo's tracked .mcp.json registers boost-framework, and its command, spawned from the repository root, serves the six tools (FR-109, UJ-4)",
  async () => {
    const tracked = Bun.spawnSync(["git", "ls-files", "--error-unmatch", ".mcp.json"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(`${tracked.exitCode} ${tracked.stdout.toString().trim()}`).toBe("0 .mcp.json");
    const config = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8")) as { mcpServers: Record<string, { command: string; args: string[] }> };
    expect(config).toEqual({ mcpServers: { "boost-framework": { command: "bun", args: ["--no-env-file", "tools/boost-framework/src/server.ts"] } } });
    const server = config.mcpServers["boost-framework"]!;
    const { client, init } = await StdioClient.start([server.command, ...server.args], root);
    try {
      expect(init["serverInfo"]).toMatchObject({ name: "boost-framework" });
      const listed = (await client.request("tools/list")) as { tools: { name: string }[] };
      expect(listed.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
      expect((await client.value("story.tests", { story: "7.3" }))["component"]).toBe("boost");
    } finally {
      await client.close();
    }
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-boost-4: the tool list and the static guard

const SRC = join(root, "tools", "boost-framework", "src");
const FS_READS = ["readFileSync", "readdirSync", "statSync", "lstatSync", "existsSync", "realpathSync"];
const ALLOWED_SPECIFIERS = ["@modelcontextprotocol/server", "@modelcontextprotocol/server/stdio", "node:path", "node:crypto"];
const transpiler = new Bun.Transpiler({ loader: "ts" });
/** Every entry under src/, recursively: exactly these files, and no directory. */
const SRC_FILES = ["data.ts", "index.ts", "lockdown.ts", "mcp.ts", "scope.ts", "server.ts", "tools.ts"];
/** The relative specifiers allowed: `./<name>` (or `./<name>.ts`) naming a src file. */
const SRC_SPECIFIER = /^\.\/([A-Za-z0-9_-]+)(?:\.ts)?$/;

function srcEntries(dir: string, prefix: string = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = `${prefix}${entry.name}`;
    return entry.isDirectory() ? [`${rel}/`, ...srcEntries(join(dir, entry.name), `${rel}/`)] : [rel];
  });
}

function relativeAllowed(spec: string): boolean {
  const match = SRC_SPECIFIER.exec(spec);
  return match !== null && SRC_FILES.includes(`${match[1]!}.ts`);
}

/**
 * The static guard's violations in the source of src/<name> (Story 7.4). It scans Bun.Transpiler output, so
 * comments are gone: only code can pass or fail it.
 */
function guardViolations(name: string, source: string): string[] {
  const code = transpiler.transformSync(source);
  const found: string[] = [];
  const specifier = (spec: string, clause: string | null): void => {
    if (relativeAllowed(spec) || ALLOWED_SPECIFIERS.includes(spec)) {
      return;
    }
    if (spec === "node:fs" && name === "data.ts" && clause !== null) {
      const named = /^\s*\{([^}]*)\}\s*$/.exec(clause);
      const names = named === null ? null : named[1]!.split(",").map((item) => item.trim()).filter((item) => item !== "").map((item) => item.split(/\s+as\s+/)[0]!.trim());
      if (names !== null && /^\s*import\b/.test(clause) === false && names.every((item) => FS_READS.includes(item))) {
        return;
      }
      found.push(`node:fs imported as ${JSON.stringify(clause.trim())}`);
      return;
    }
    found.push(`specifier ${spec}`);
  };
  for (const match of code.matchAll(/\b(import|export)\b([^;"'`]*?)\bfrom\s*["']([^"']+)["']/g)) {
    specifier(match[3]!, match[1] === "import" ? match[2]! : `export ${match[2]!}`);
  }
  for (const match of code.matchAll(/\bimport\s*["']([^"']+)["']/g)) {
    specifier(match[1]!, null);
  }
  for (const match of code.matchAll(/\bimport\s*\(([^)]*)\)/g)) {
    const literal = /^\s*["']([^"']*)["']\s*$/.exec(match[1]!);
    if (literal === null || !relativeAllowed(literal[1]!)) {
      found.push(`import(${match[1]!.trim()})`);
    }
  }
  for (const match of code.matchAll(/\bBun\b/g)) {
    if (!code.startsWith("Bun.YAML.parse(", match.index)) {
      found.push(`Bun: ${code.slice(match.index, match.index + 24)}`);
    }
  }
  for (const match of code.matchAll(/\bprocess\b/g)) {
    const rest = code.slice(match.index);
    if (!/^process\.argv\b/.test(rest) && !rest.startsWith("process.stderr.write(") && !rest.startsWith("process.exit(")) {
      found.push(`process: ${rest.slice(0, 24)}`);
    }
  }
  for (const banned of [
    /\brequire\b/,
    /\bglobalThis\b/,
    /\bself\b/,
    /\bglobal\b/,
    /\bwindow\b/,
    /\bReflect\b/,
    /\bWorker\b/,
    /\bfetch\b/,
    /\bWebSocket\b/,
    /\beval\b/,
    /\bFunction\b/,
    /getBuiltinModule/,
    /import\.meta\.require/,
    // A computed member built from pieces, such as `x["constr" + "uctor"]`.
    /\[\s*["'`][^"'`]*["'`]\s*\+/,
  ]) {
    if (banned.test(code)) {
      found.push(`banned ${banned.source}`);
    }
  }
  // `constructor` only as a class constructor declaration, never as a member (`(() => {}).constructor(...)`).
  const constructors = [...code.matchAll(/\bconstructor\b/g)].length - [...code.matchAll(/^[ \t]*constructor\s*\(/gm)].length;
  if (constructors !== 0) {
    found.push("constructor used as a member");
  }
  return found;
}

/** The static import and export specifiers of a source file (after transpiling). */
function staticSpecifiers(source: string): string[] {
  const code = transpiler.transformSync(source);
  return [...[...code.matchAll(/\b(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']/g)].map((match) => match[1]!), ...[...code.matchAll(/\bimport\s*["']([^"']+)["']/g)].map((match) => match[1]!)].sort();
}

const EVASION_PROBES: readonly (readonly [string, string])[] = [
  ["tools.ts", 'Bun["spawn"](["touch", "x"]);'],
  ["tools.ts", 'const B = Bun;\nB.spawn(["touch", "x"]);'],
  ["tools.ts", 'globalThis.Bun.write("x", "y");'],
  ["tools.ts", 'const cp = require("child_process");\ncp.execSync("x");'],
  ["tools.ts", 'const cp = await import("node:child_process");\ncp.execSync("x");'],
  ["tools.ts", 'import cp from "child_process";\ncp.execSync("x");'],
  ["data.ts", 'import { writeFileSync } from "node:fs";\nwriteFileSync("x", "y");'],
  ["data.ts", 'import * as fs from "node:fs";\nfs.readFileSync("x");'],
  ["data.ts", 'import fs from "node:fs";\nfs.readFileSync("x");'],
  ["tools.ts", 'import { readFileSync } from "node:fs";\nreadFileSync("x");'],
  ["data.ts", 'import { readFileSync as r, writeFileSync as w } from "node:fs";\nr("x");\nw("x", "y");'],
  ["tools.ts", 'const fs = process.getBuiltinModule("node:fs");\nfs.writeFileSync("x", "y");'],
  ["tools.ts", 'const b = process["binding"];\nb("fs");'],
  ["tools.ts", 'eval("1");'],
  ["tools.ts", 'new Function("return 1")();'],
  ["tools.ts", 'import.meta.require("node:fs").writeFileSync("x", "y");'],
  ["tools.ts", 'const name = "./x";\nawait import(name);'],
  ["tools.ts", 'self["pro" + "cess"].binding("fs");'],
  ["tools.ts", 'self["B" + "un"].write("x", "y");'],
  ["tools.ts", 'self.Bun.write("x", "y");'],
  ["tools.ts", 'global.x = 1;'],
  ["tools.ts", 'window.Bun.write("x", "y");'],
  ["tools.ts", '(() => {}).constructor("return 1")();'],
  ["tools.ts", '(() => {})["constr" + "uctor"]("return 1")();'],
  ["tools.ts", 'Reflect.get(self, "Bun");'],
  ["tools.ts", 'new Worker("./w.ts");'],
  ["tools.ts", 'await fetch("file:///etc/hosts");'],
  ["tools.ts", 'new WebSocket("ws://x");'],
  ["tools.ts", 'await import("../../../package.json");'],
  ["tools.ts", 'import pkg from "../package.json";\nvoid pkg;'],
  ["tools.ts", 'import { x } from "./sub/x";\nvoid x;'],
  ["tools.ts", 'import { x } from "./nope";\nvoid x;'],
  ["tools.ts", 'import { x } from "./data.js";\nvoid x;'],
];

xaravelTest(
  "XT-boost-4",
  "given the server's tool list, no tool writes files, runs commands or changes git state: every tool is annotated read-only and closed-world, and a static guard over src/ admits no write, spawn or module escape (FR-109)",
  async () => {
    // The tool list over stdio: exactly the six, read-only, non-destructive, closed-world; tools are the only capability.
    const fix = fixture();
    const { client, init } = await StdioClient.start(["bun", "--no-env-file", SERVER, "--root", fix]);
    try {
      expect(Object.keys(init["capabilities"] as Record<string, unknown>)).toEqual(["tools"]);
      const listed = (await client.request("tools/list")) as { tools: { name: string; annotations: Record<string, unknown> }[] };
      expect(listed.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
      for (const tool of listed.tools) {
        expect(`${tool.name}: ${JSON.stringify([tool.annotations["readOnlyHint"], tool.annotations["destructiveHint"], tool.annotations["openWorldHint"]])}`).toBe(`${tool.name}: [true,false,false]`);
      }
    } finally {
      await client.close();
    }

    // The static guard: the real src/ is clean.
    const files = srcEntries(SRC).sort();
    expect(files).toEqual(SRC_FILES);
    for (const file of files.filter((item) => item !== "scope.ts" && item !== "lockdown.ts")) {
      expect(`${file}: ${JSON.stringify(guardViolations(file, readFileSync(join(SRC, file), "utf8")))}`).toBe(`${file}: []`);
    }
    // The entry order: server.ts links only ./lockdown and node:path; lockdown.ts only ./scope; scope.ts only node:path.
    expect(staticSpecifiers(readFileSync(join(SRC, "server.ts"), "utf8"))).toEqual(["./lockdown", "node:path"]);
    expect(staticSpecifiers(readFileSync(join(SRC, "lockdown.ts"), "utf8"))).toEqual(["./scope", "./scope"]);
    expect(staticSpecifiers(readFileSync(join(SRC, "scope.ts"), "utf8"))).toEqual(["node:path"]);
    expect(transpiler.transformSync(readFileSync(join(SRC, "server.ts"), "utf8"))).toContain('await import("./mcp")');

    // Every evasion probe is flagged.
    for (const [file, probe] of EVASION_PROBES) {
      expect(`${JSON.stringify(probe)}: ${guardViolations(file, probe).length > 0 ? "flagged" : "clean"}`).toBe(`${JSON.stringify(probe)}: flagged`);
    }
    // And the allowed forms pass.
    for (const [file, ok] of [
      ["data.ts", 'import { readFileSync, existsSync as e } from "node:fs";\nreadFileSync("x");\ne("x");'],
      ["data.ts", 'const v = Bun.YAML.parse("a: 1");'],
      ["tools.ts", 'import { createHash } from "node:crypto";\ncreateHash("sha256");'],
      ["server.ts", 'const m = await import("./mcp");\nprocess.stderr.write("x");\nprocess.exit(process.argv.length);'],
    ] as const) {
      expect(`${JSON.stringify(ok)}: ${JSON.stringify(guardViolations(file, ok))}`).toBe(`${JSON.stringify(ok)}: []`);
    }
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-boost-5: the server process reads only the data scope

const STORY_9_7 = ["---", 'story_id: "9.7"', "epic: 9", "component: support", "status: backlog", 'title: "Linked Story"', "test_ids: []", "xaravel_test_ids: []", "---", "", "# Story 9.7", ""].join("\n");

/** The fixture, plus symlinks out of the data scope (and one inside it); returns the root and the outside directory. */
function symlinkFixture(): { fix: string; outside: string } {
  const fix = fixture();
  const outside = tempDir("boost-outside");
  writeFileSync(join(outside, "story.md"), FILES["stories/9.9.md"]!.replace('story_id: "9.9"', 'story_id: "9.8"'));
  rmSync(join(fix, "stories", "9.8.md"));
  symlinkSync(join(outside, "story.md"), join(fix, "stories", "9.8.md"));
  mkdirSync(join(outside, "escalations"));
  renameSync(join(fix, "conformance", "escalations"), join(outside, "escalations", "moved"));
  symlinkSync(join(outside, "escalations", "moved"), join(fix, "conformance", "escalations"));
  mkdirSync(join(fix, "tools"), { recursive: true });
  writeFileSync(join(fix, "tools", "x"), FILES["conformance/inventory/cache.jsonl"]!);
  symlinkSync(join(fix, "tools", "x"), join(fix, "conformance", "inventory", "z.jsonl"));
  symlinkSync(join(fix, "nowhere.md"), join(fix, "decisions", "DIV-7.md"));
  writeFileSync(join(fix, "conformance", "m.md"), STORY_9_7);
  symlinkSync(join(fix, "conformance", "m.md"), join(fix, "stories", "9.7.md"));
  writeFileSync(join(fix, "AGENTS.md"), "outside the data scope\n");
  return { fix, outside };
}

function refusedBy(fn: () => unknown): string {
  try {
    fn();
    return "allowed";
  } catch (error) {
    return error instanceof DataScopeError ? "DataScopeError" : `other: ${String(error)}`;
  }
}

const PROBE = `
import { lockdown } from ${JSON.stringify(join(SRC, "lockdown.ts"))};
const [fix, outside] = process.argv.slice(2);
lockdown(fix);
const fs = process.getBuiltinModule("node:fs");
const cp = process.getBuiltinModule("node:child_process");
const target = fix + "/conformance/w.txt";
// A stream opens asynchronously: it resolves on "open" and rejects with the error it emits.
const settle = (stream) => new Promise((resolve, reject) => {
  stream.on("open", () => resolve(null));
  stream.on("error", reject);
});
const ops = {
  "fs.writeFileSync": () => fs.writeFileSync(target, "x"),
  "fs.writeFileSync outside": () => fs.writeFileSync(outside + "/w.txt", "x"),
  "fs.appendFileSync": () => fs.appendFileSync(target, "x"),
  "fs.mkdirSync": () => fs.mkdirSync(fix + "/conformance/newdir"),
  "fs.rmSync": () => fs.rmSync(fix + "/stories/9.9.md"),
  "fs.renameSync": () => fs.renameSync(fix + "/stories/9.9.md", fix + "/stories/9.9b.md"),
  "fs.copyFileSync": () => fs.copyFileSync(fix + "/stories/9.9.md", target),
  "fs.symlinkSync": () => fs.symlinkSync(fix + "/stories/9.9.md", target),
  "fs.openSync": () => fs.openSync(target, "w"),
  "fs.openSync read": () => fs.openSync(fix + "/stories/9.9.md", "r"),
  "fs.createWriteStream": () => fs.createWriteStream(target),
  "fs.promises.writeFile": () => fs.promises.writeFile(target, "x"),
  "fs.writeFile": () => fs.writeFile(target, "x", () => {}),
  "fs.readFile": () => fs.readFile(fix + "/stories/9.9.md", () => {}),
  "child_process.execSync": () => cp.execSync("touch " + target),
  "child_process.spawn": () => cp.spawn("touch", [target]),
  "Bun.spawn": () => Bun.spawn(["touch", target]),
  "Bun.spawnSync": () => Bun.spawnSync(["touch", target]),
  "Bun.$": () => Bun.$\`touch \${target}\`,
  "Bun.write": () => Bun.write(target, "x"),
  "Bun.file": () => Bun.file(target),
  "import(node:fs).writeFileSync": async () => (await import("node:fs")).writeFileSync(target, "x"),
  "import(node:fs).default.writeFileSync": async () => (await import("node:fs")).default.writeFileSync(target, "x"),
  "read AGENTS.md": () => fs.readFileSync(fix + "/AGENTS.md", "utf8"),
  "read /etc/hosts": () => fs.readFileSync("/etc/hosts", "utf8"),
  "read relative": () => fs.readFileSync("conformance/baseline-pin", "utf8"),
  "read fd 0": () => fs.readFileSync(0),
  "read outside symlink": () => fs.readFileSync(fix + "/stories/9.8.md", "utf8"),
  "readdir root": () => fs.readdirSync(fix),
  "exists outside": () => fs.existsSync(outside),
  "realpath.native outside": () => fs.realpathSync.native(outside),
  "lockdown twice": () => lockdown(fix),
  "readFileSync flag w": () => fs.readFileSync(fix + "/stories/9.9.md", { flag: "w" }),
  "readFileSync flag a+": () => fs.readFileSync(target, { flag: "a+" }),
  "readFileSync flag wx": () => fs.readFileSync(target, { encoding: "utf8", flag: "wx" }),
  "statSync outside": () => fs.statSync(outside),
  "lstatSync outside": () => fs.lstatSync(fix + "/AGENTS.md"),
  "realpathSync outside": () => fs.realpathSync(outside),
  "fs.promises.readFile outside": () => fs.promises.readFile("/etc/hosts"),
  "import(fs).writeFileSync": async () => (await import("fs")).writeFileSync(target, "x"),
  "import.meta.require(fs).writeFileSync": () => import.meta.require("fs").writeFileSync(target, "x"),
  "new fs.WriteStream": () => settle(new fs.WriteStream(target)),
  "new fs.ReadStream outside": () => settle(new fs.ReadStream("/etc/hosts")),
  "new Worker": () => new Worker(outside + "/worker.ts"),
  "worker_threads.Worker": () => new (process.getBuiltinModule("node:worker_threads").Worker)(outside + "/worker.ts"),
  "fetch file://": async () => (await fetch("file:///etc/hosts")).text(),
  "WebSocket": () => new WebSocket("ws://127.0.0.1:9"),
  "Bun.Glob": () => [...new Bun.Glob("*").scanSync("/etc")],
  "bun:sqlite Database": async () => new (await import("bun:sqlite")).Database(fix + "/conformance/x.db"),
  "bun:sqlite default": async () => new (await import("bun:sqlite")).default(fix + "/conformance/y.db"),
  "bun:ffi dlopen": async () => (await import("bun:ffi")).dlopen("libc.dylib", {}),
  "Bun.build": () => Bun.build({ entrypoints: [outside + "/worker.ts"], outdir: fix + "/conformance/built" }),
  "Bun.Archive.write": () => Bun.Archive.write(fix + "/conformance/a.tar", { "a.txt": "x" }),
  "new Bun.FileSystemRouter": () => new Bun.FileSystemRouter({ dir: fix + "/tools", style: "nextjs" }).routes,
  "Bun.secrets.get": () => Bun.secrets.get({ service: "xaravel-boost-probe", name: "x" }),
  "Bun.redis.get": () => Bun.redis.get("x"),
  "new Bun.RedisClient": () => new Bun.RedisClient("redis://127.0.0.1:9"),
  "new Bun.Terminal": () => new Bun.Terminal({}),
  "Bun.s3.file": () => Bun.s3.file("x"),
  "Bun.which": () => Bun.which("ls"),
  "node:sqlite DatabaseSync": () => new (process.getBuiltinModule("node:sqlite").DatabaseSync)(fix + "/conformance/z.db"),
  "import(node:sqlite) DatabaseSync": async () => new (await import("node:sqlite")).DatabaseSync(fix + "/conformance/z2.db"),
  "text import AGENTS.md": async () => (await import(fix + "/AGENTS.md", { with: { type: "text" } })).default,
  "require outside data.json": () => require(outside + "/data.json"),
  "require root package.json": () => require(fix + "/package.json"),
  "text import file:// AGENTS.md": async () => (await import("file://" + fix + "/AGENTS.md", { with: { type: "text" } })).default,
  "text import relative note.md": async () => (await import("./note.md", { with: { type: "text" } })).default,
  "text import AGENTS.md?x.ts": async () => (await import(fix + "/AGENTS.md?x.ts", { with: { type: "text" } })).default,
  "text import .env": async () => (await import(fix + "/.env", { with: { type: "text" } })).default,
  "Bun.plugin.clearAll": () => Bun.plugin.clearAll(),
};
const results = {};
for (const [name, op] of Object.entries(ops)) {
  try {
    await op();
    results[name] = "allowed";
  } catch (error) {
    results[name] = error instanceof Error ? error.name : String(error);
  }
}
results["in-scope read"] = fs.readFileSync(fix + "/stories/9.9.md", "utf8").startsWith("---") ? "read" : "wrong";
results["in-scope readdir"] = fs.readdirSync(fix + "/stories").includes("9.9.md") ? "read" : "wrong";
results["in-scope text import"] = (await import(fix + "/stories/9.9.md", { with: { type: "text" } })).default.startsWith("---") ? "read" : "wrong";
results["in-scope require data.json"] = require(fix + "/conformance/data.json").inScope === true ? "read" : "wrong";
// What docs/framework-mode.md § Limits lists as open: "open" while it reads, so a later fix flips the case.
const openWhenRead = async (read) => {
  try {
    return (await read()).length > 0 ? "open" : "wrong";
  } catch (error) {
    return error instanceof Error ? error.name : String(error);
  }
};
results["open Bun.fetch file://"] = await openWhenRead(async () => (await Bun.fetch("file:///etc/hosts")).text());
results["open text import /etc/hosts"] = await openWhenRead(async () => (await import("/etc/hosts", { with: { type: "text" } })).default);
results["kept Bun.YAML.parse"] = Bun.YAML.parse("a: 1").a === 1 ? "kept" : "wrong";
results["kept Bun.CryptoHasher"] = new Bun.CryptoHasher("sha256").update("x").digest("hex").length === 64 ? "kept" : "wrong";
console.log(JSON.stringify(results));
`;

// A --preload recorder. It runs before the server's lockdown and turns every function export lockdown replaces
// (node:fs, node:fs/promises, node:child_process, node:worker_threads, bun:sqlite, bun:ffi, and globalThis
// Worker/fetch/WebSocket) into
// an accessor. The getter returns a logger of calls that reach the original; the setter, which lockdown's
// assignment triggers, wraps lockdown's replacement in a logger of calls that throw. So both the reads that pass
// and every refusal, by lockdown or below it, are recorded. (Bun's members are not configurable, so refusals of
// Bun.* are not observable here; the static guard keeps Bun out of src/ but for Bun.YAML.parse.)
const RECORDER = String.raw`
const fs = process.getBuiltinModule("node:fs");
const append = fs.appendFileSync;
const log = import.meta.dir + "/opens.log";
const canary = import.meta.dir + "/canary.txt";
const describe = (arg) => (typeof arg === "string" ? arg : "<" + typeof arg + ">");
const record = (fields) => append(log, fields.join("\t") + "\n");
const invoke = (fn, self, args, target) => (target ? Reflect.construct(fn, args) : fn.apply(self, args));
let checked = false;
// On the first data read of a .jsonl file (a tool call, so after the server's lockdown), a write must be refused.
function checkLocked() {
  if (checked) return;
  checked = true;
  try {
    fs.writeFileSync(canary, "x");
    record(["canary", "unlocked"]);
  } catch (error) {
    record(["canary", error.name]);
  }
}
function intercept(label, mod, name) {
  const original = mod[name];
  const full = label + "." + name;
  let current = function (...args) {
    if (name === "readFileSync" && typeof args[0] === "string" && args[0].endsWith(".jsonl")) checkLocked();
    record(["call", full, describe(args[0])]);
    return invoke(original, this, args, new.target);
  };
  if (typeof original.native === "function") current.native = original.native;
  Object.defineProperty(mod, name, {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (replacement) => {
      current = function (...args) {
        try {
          return invoke(replacement, this, args, new.target);
        } catch (error) {
          record(["refused", full, error && error.name, describe(args[0])]);
          throw error;
        }
      };
      if (typeof replacement.native === "function") current.native = replacement.native;
    },
  });
}
for (const [label, mod, lowercaseOnly] of [
  ["node:fs", fs, true],
  ["node:fs/promises", fs.promises, true],
  ["node:child_process", process.getBuiltinModule("node:child_process"), false],
  ["node:worker_threads", process.getBuiltinModule("node:worker_threads"), false],
]) {
  for (const name of Object.keys(mod)) {
    if (typeof mod[name] === "function" && (!lowercaseOnly || /^[a-z]/.test(name))) intercept(label, mod, name);
  }
}
for (const name of ["Worker", "fetch", "WebSocket"]) intercept("globalThis", globalThis, name);
for (const label of ["bun:sqlite", "bun:ffi"]) {
  const mod = process.getBuiltinModule(label);
  for (const name of Object.keys(mod)) if (typeof mod[name] === "function") intercept(label, mod, name);
}
`;

/** The recorder's log: the calls that reached a read, the refusals (canary's excluded), and the canary outcome. */
function readRecorder(dir: string): { calls: [string, string][]; refusals: string[]; canary: string[] } {
  const lines = readFileSync(join(dir, "opens.log"), "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("\t"));
  return {
    calls: lines.filter((fields) => fields[0] === "call").map((fields) => [fields[1]!, fields[2]!]),
    refusals: lines.filter((fields) => fields[0] === "refused" && fields[3] !== join(dir, "canary.txt")).map((fields) => fields.slice(1).join(" ")),
    canary: lines.filter((fields) => fields[0] === "canary").map((fields) => fields[1]!),
  };
}

const OPENS = ["node:fs.readFileSync", "node:fs.readdirSync"];
const READ_CALLS = FS_READS.map((name) => `node:fs.${name}`);

function insideData(fix: string, path: string): boolean {
  return ["conformance", "stories", "decisions"].some((dir) => path === join(fix, dir) || path.startsWith(`${join(fix, dir)}/`));
}

xaravelTest(
  "XT-boost-5",
  "given the server process, it opens only paths under conformance/, stories/ and decisions/, read-only, and attempts outside those paths (symlinks included) are refused (FR-109)",
  async () => {
    const { fix, outside } = symlinkFixture();

    // dataPath: the lexical checks.
    for (const rel of ["../x", "/etc/hosts", "conformance/../AGENTS.md", "tools/x", "conformance-x/a", "a\0b", ".", ""]) {
      expect(`${JSON.stringify(rel)}: ${refusedBy(() => dataPath(fix, rel))}`).toBe(`${JSON.stringify(rel)}: DataScopeError`);
    }
    // dataPath: the real-path check.
    for (const rel of ["stories/9.8.md", "conformance/escalations", "conformance/escalations/ESC-9.9-1.md", "conformance/inventory/z.jsonl", "decisions/DIV-7.md", "stories/missing/../../AGENTS.md"]) {
      expect(`${rel}: ${refusedBy(() => dataPath(fix, rel))}`).toBe(`${rel}: DataScopeError`);
    }
    expect(dataPath(fix, "stories/9.7.md")).toBe(join(fix, "stories", "9.7.md"));
    expect(dataPath(fix, "stories/not-yet.md")).toBe(join(fix, "stories", "not-yet.md"));
    expect(dataPath(fix, "conformance")).toBe(join(fix, "conformance"));
    // inScope: the rule itself.
    expect(inScope(fix, join(fix, "stories", "9.9.md"))).toBe(true);
    expect(inScope(fix, join(fix, "decisions"))).toBe(true);
    expect(inScope(fix, join(fix, "stories", "9.7.md"))).toBe(true);
    expect(inScope(fix, join(fix, "stories", "new", "deeper.md"))).toBe(true);
    for (const value of ["stories/9.9.md", 0, null, join(fix, "AGENTS.md"), join(fix, "decisions", "DIV-7.md"), join(fix, "stories", "9.8.md"), join(fix, "stories", "..", "AGENTS.md"), join(outside, "story.md"), fix]) {
      expect(`${String(value)}: ${inScope(fix, value)}`).toBe(`${String(value)}: false`);
    }

    // The tools over the symlinks, over stdio: refused, and the in-scope symlink is read. The recorder shows the
    // refusals come from dataPath (no fs call is made, so nothing reaches lockdown), not from lockdown.
    const symlinkRecorder = tempDir("boost-recorder");
    writeFileSync(join(symlinkRecorder, "recorder.ts"), RECORDER);
    await withServer(fix, async (client) => {
      for (const [name, args] of [
        ["story.tests", { story: "9.8" }],
        ["divergence.get", { id: "DIV-7" }],
        ["escalations.open", {}],
        ["inventory.get", { glob: "*" }],
        ["inventory.get", { id: B1 }],
      ] as const) {
        const text = errorText(await client.call(name, args));
        expect(`${name}: ${text.slice(0, 8)}`).toBe(`${name}: refused:`);
      }
      expect(await client.value("story.tests", { story: "9.7" })).toMatchObject({ story: "9.7", title: "Linked Story", testIds: [] });
      expect((await client.value("story.tests", { story: "9.9" }))["testIds"]).toEqual([B1, B2]);
    }, { preload: join(symlinkRecorder, "recorder.ts") });
    const symlinkLog = readRecorder(symlinkRecorder);
    expect(symlinkLog.refusals).toEqual([]);
    expect(symlinkLog.calls.some(([name, path]) => name === "node:fs.readFileSync" && path === join(fix, "stories", "9.7.md"))).toBe(true);
    for (const [name, path] of symlinkLog.calls) {
      expect(`${name} ${path}: ${READ_CALLS.includes(name) ? "a read" : "not a read"}`).toBe(`${name} ${path}: a read`);
    }

    // A locked-down subprocess: every write, spawn and out-of-scope read is refused, and nothing is created.
    const scripts = tempDir("boost-scripts");
    writeFileSync(join(scripts, "probe.ts"), PROBE);
    // A worker that would write if it ever ran (a fresh realm has an unpatched node:fs).
    writeFileSync(join(outside, "worker.ts"), `require("node:fs").writeFileSync(${JSON.stringify(join(outside, "from-worker.txt"))}, "x");\n`);
    // A data file outside the scope, for the require probe.
    writeFileSync(join(outside, "data.json"), '{"outside": true}\n');
    // Out-of-scope files the resolve hook must refuse (the fixture root's package.json and .env, a note beside the
    // probe script for a relative import) and an in-scope JSON file it lets through.
    writeFileSync(join(fix, "package.json"), '{"name": "fixture"}\n');
    writeFileSync(join(fix, ".env"), "SECRET=x\n");
    writeFileSync(join(scripts, "note.md"), "outside the data scope\n");
    writeFileSync(join(fix, "conformance", "data.json"), '{"inScope": true}\n');
    const run = Bun.spawnSync(["bun", "--no-env-file", join(scripts, "probe.ts"), fix, outside], { cwd: fix, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    expect(`${run.exitCode} ${run.stderr.toString()}`).toBe("0 ");
    const results = JSON.parse(run.stdout.toString()) as Record<string, string>;
    const refusedReads = ["read AGENTS.md", "read /etc/hosts", "read relative", "read fd 0", "read outside symlink", "readdir root", "exists outside", "realpath.native outside", "statSync outside", "lstatSync outside", "realpathSync outside", "text import AGENTS.md", "require outside data.json", "require root package.json", "text import file:// AGENTS.md", "text import relative note.md", "text import AGENTS.md?x.ts", "text import .env"];
    for (const [name, outcome] of Object.entries(results)) {
      const expected = name.startsWith("in-scope") ? "read" : name.startsWith("kept") ? "kept" : name.startsWith("open") ? "open" : name === "lockdown twice" ? "Error" : refusedReads.includes(name) ? "DataScopeError" : "ReadOnlyError";
      expect(`${name}: ${outcome}`).toBe(`${name}: ${expected}`);
    }
    expect(Object.keys(results).length).toBe(78);
    await Bun.sleep(200);
    for (const path of [join(fix, "conformance", "w.txt"), join(outside, "w.txt"), join(fix, "conformance", "newdir"), join(fix, "stories", "9.9b.md"), join(outside, "from-worker.txt"), join(fix, "conformance", "built"), join(fix, "conformance", "x.db"), join(fix, "conformance", "y.db"), join(fix, "conformance", "a.tar"), join(fix, "conformance", "z.db"), join(fix, "conformance", "z2.db")]) {
      expect(`${path}: ${existsSync(path)}`).toBe(`${path}: false`);
    }
    expect(readFileSync(join(fix, "stories", "9.9.md"), "utf8")).toBe(FILES["stories/9.9.md"]!);

    // A Bun build that adds a non-writable member on neither of lockdown's lists: lockdown throws naming it, before
    // it patches anything.
    writeFileSync(
      join(scripts, "unknown.ts"),
      [
        'Object.defineProperty(Bun, "probeOpen", { value: 1, writable: false, configurable: false, enumerable: true });',
        `const { lockdown } = await import(${JSON.stringify(join(SRC, "lockdown.ts"))});`,
        'const fs = process.getBuiltinModule("node:fs");',
        "const writeFileSync = fs.writeFileSync;",
        "const spawnSync = Bun.spawnSync;",
        'try { lockdown(process.argv[2]); console.log("locked"); } catch (error) { console.log(error.name + ": " + error.message); }',
        'console.log("fs.writeFileSync " + (fs.writeFileSync === writeFileSync ? "original" : "patched"));',
        'console.log("Bun.spawnSync " + (Bun.spawnSync === spawnSync ? "original" : "patched"));',
        "",
      ].join("\n"),
    );
    const unknown = Bun.spawnSync(["bun", "--no-env-file", join(scripts, "unknown.ts"), fix], { cwd: fix, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    expect(`${unknown.exitCode} ${unknown.stdout.toString()}${unknown.stderr.toString()}`).toBe("0 Error: lockdown: Bun.probeOpen cannot be replaced and is on neither the kept nor the known-open list\nfs.writeFileSync original\nBun.spawnSync original\n");

    // The recorder on a clean fixture: every call is one of the six reads, each open is inside the data scope.
    const clean = fixture();
    const recorder = tempDir("boost-recorder");
    writeFileSync(join(recorder, "recorder.ts"), RECORDER);
    await withServer(
      clean,
      async (client) => {
        await callEveryTool(client, { story: "9.9", id: B1, div: "DIV-3" });
      },
      { preload: join(recorder, "recorder.ts") },
    );
    const { calls, refusals, canary } = readRecorder(recorder);
    // The server process was locked down before its first data read, and a full tool run hits no refusal.
    expect(canary).toEqual(["ReadOnlyError"]);
    expect(existsSync(join(recorder, "canary.txt"))).toBe(false);
    expect(refusals).toEqual([]);
    // The canary's own write is the one refusal, and the recorder saw it at lockdown's layer.
    expect(readFileSync(join(recorder, "opens.log"), "utf8")).toContain(`refused\tnode:fs.writeFileSync\tReadOnlyError\t${join(recorder, "canary.txt")}\n`);
    const opens = calls.filter(([name]) => OPENS.includes(name));
    expect(opens.length).toBeGreaterThan(10);
    expect(opens.some(([name, path]) => name === "node:fs.readFileSync" && path === join(clean, "stories", "9.9.md"))).toBe(true);
    for (const [name, path] of calls) {
      expect(`${name}: ${READ_CALLS.includes(name) ? "a read" : "not a read"}`).toBe(`${name}: a read`);
      if (OPENS.includes(name)) {
        expect(`${name} ${path}: ${insideData(clean, path) ? "inside" : "outside"}`).toBe(`${name} ${path}: inside`);
      }
    }

    // A ReadOnlyError is a known tool error: `refused: ...`, never "internal error:".
    const refusing: ToolDefinition = {
      name: "probe.refuse",
      description: "throws ReadOnlyError",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: () => {
        throw new ReadOnlyError("node:fs.writeFileSync");
      },
    };
    const refusal = callTool(refusing, clean, {});
    expect(refusal.isError).toBe(true);
    expect((refusal.content[0] as { text: string }).text).toBe("refused: node:fs.writeFileSync (framework mode is read-only)");
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// The Divergence Records under a root, checked through divergence.get

/** One message per problem with `<dataRoot>/decisions/div*`: a name that is not `DIV-<n>.md`, an error, a missing record, no clause, a clause id not `DIV-<n>.<k>`. */
async function divergenceRecordProblems(client: StdioClient, dataRoot: string): Promise<string[]> {
  const problems: string[] = [];
  const names = readdirSync(join(dataRoot, "decisions")).filter((name) => /^div/i.test(name)).sort();
  for (const file of names) {
    const match = /^DIV-([1-9]\d*)\.md$/.exec(file);
    if (match === null) {
      problems.push(`${file}: not a DIV-<n>.md name`);
      continue;
    }
    const id = `DIV-${match[1]!}`;
    const record = await client.call("divergence.get", { id });
    if (record.isError === true) {
      problems.push(`${id}: error ${record.content[0]?.text ?? ""}`);
      continue;
    }
    const value = record.structuredContent ?? {};
    if (value["exists"] !== true) {
      problems.push(`${id}: exists ${String(value["exists"])}`);
      continue;
    }
    const clauses = Array.isArray(value["clauses"]) ? (value["clauses"] as { id: unknown }[]) : [];
    if (clauses.length === 0) {
      problems.push(`${id}: no clause the parser recognises`);
    }
    for (const clause of clauses) {
      if (typeof clause.id !== "string" || !new RegExp(`^${id}\\.[1-9]\\d*$`).test(clause.id)) {
        problems.push(`${id}: clause ${String(clause.id)} is not ${id}.<k>`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// XT-boost-6: the worktree is unchanged

/** Calls every tool with valid and invalid arguments (and the refused ones the fixture can raise). */
async function callEveryTool(client: StdioClient, ids: { story: string; id: string; div: string }, refused: boolean = false): Promise<number> {
  const calls: [string, Record<string, Json>][] = [
    ["inventory.get", { id: ids.id }],
    ["inventory.get", { glob: "*", limit: 5 }],
    ["inventory.get", {}],
    ["inventory.get", { nope: 1 }],
    ["expectations.status", { id: ids.id }],
    ["expectations.status", { id: ids.id, variant: "sqlite" }],
    ["expectations.status", {}],
    ["conformance.rate", {}],
    ["conformance.rate", { component: "support" }],
    ["conformance.rate", { component: 7 }],
    ["story.tests", { story: ids.story }],
    ["story.tests", { story: "../../AGENTS" }],
    ["story.tests", { story: "0.0" }],
    ["divergence.get", { id: ids.div }],
    ["divergence.get", { id: `${ids.div}.1` }],
    ["divergence.get", { id: "../x" }],
    ["escalations.open", {}],
    ["escalations.open", { story: ids.story }],
    ["escalations.open", { story: 1 }],
  ];
  if (refused) {
    calls.push(["story.tests", { story: "9.8" }], ["divergence.get", { id: "DIV-7" }]);
  }
  let errors = 0;
  const successes = new Map<string, number>();
  for (const [name, args] of calls) {
    const result = await client.call(name, args);
    expect(result.content.length).toBeGreaterThan(0);
    const failed = result.isError === true;
    errors += failed ? 1 : 0;
    successes.set(name, (successes.get(name) ?? 0) + (failed ? 0 : 1));
  }
  // Every tool was called, each one succeeded at least once, and some calls failed.
  expect([...successes.keys()].sort()).toEqual([...TOOL_NAMES].sort());
  for (const name of TOOL_NAMES) {
    const count = successes.get(name) ?? 0;
    expect(`${name}: ${count > 0 ? "succeeded" : "never succeeded"}`).toBe(`${name}: succeeded`);
  }
  expect(errors).toBeGreaterThan(0);
  expect(errors).toBeLessThan(calls.length);
  return errors;
}

/** A stat snapshot of every entry under `dir` (lstat; symlinks not followed); `hash` adds file digests and link targets. */
function snapshot(dir: string, hash: boolean, skip: (rel: string) => boolean = () => false): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const path = rel === "" ? dir : join(dir, rel);
    const stat = lstatSync(path);
    const kind = stat.isSymbolicLink() ? "link" : stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other";
    let detail = "";
    if (hash && kind === "file") {
      detail = createHash("sha256").update(readFileSync(path)).digest("hex");
    } else if (hash && kind === "link") {
      detail = readlinkSync(path);
    }
    out.push(`${rel}\t${kind}\t${stat.mode}\t${stat.size}\t${stat.mtimeMs}\t${detail}`);
    if (kind === "dir") {
      for (const name of readdirSync(path).sort()) {
        const child = rel === "" ? name : `${rel}/${name}`;
        if (!skip(child)) {
          walk(child);
        }
      }
    }
  };
  walk("");
  return out;
}

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-c", "user.name=XT", "-c", "user.email=xt@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

xaravelTest(
  "XT-boost-6",
  "given a test that calls every tool, the worktree is unchanged afterwards: a git fixture's every file, link and directory (.git/ included) and the real repository's git state and data directories (FR-109)",
  async () => {
    // A git fixture with a commit, one modified and one untracked file, and a dangling symlink to refuse.
    const fix = fixture();
    const outside = tempDir("boost-outside");
    writeFileSync(join(outside, "story.md"), "outside\n");
    rmSync(join(fix, "stories", "9.8.md"));
    symlinkSync(join(outside, "story.md"), join(fix, "stories", "9.8.md"));
    symlinkSync(join(fix, "nowhere.md"), join(fix, "decisions", "DIV-7.md"));
    git(fix, "init", "-q");
    git(fix, "add", "-A");
    git(fix, "commit", "-q", "-m", "fixture");
    writeFileSync(join(fix, "stories", "9.9.md"), `${FILES["stories/9.9.md"]!}\nModified.\n`);
    writeFileSync(join(fix, "conformance", "untracked.txt"), "untracked\n");
    const skipIndex = (rel: string): boolean => rel === ".git/index";
    const before = snapshot(fix, true, skipIndex);
    expect(before.some((line) => line.startsWith(".git/HEAD\t"))).toBe(true);
    await withServer(fix, (client) => callEveryTool(client, { story: "9.9", id: B1, div: "DIV-3" }, true), { cwd: fix });
    expect(snapshot(fix, true, skipIndex)).toEqual(before);
    expect(git(fix, "status", "--porcelain", "-uall")).toBe(" M stories/9.9.md\n?? conformance/untracked.txt\n");

    // The real repository, at its default root.
    const state = (): string[] => [
      git(root, "status", "--porcelain", "-uall"),
      git(root, "rev-parse", "HEAD"),
      git(root, "for-each-ref"),
      git(root, "stash", "list"),
      ...["conformance", "stories", "decisions"].flatMap((dir) => (existsSync(join(root, dir)) ? snapshot(join(root, dir), false).map((line) => `${dir}/${line}`) : [])),
    ];
    const repoBefore = state();
    const inventoryId = readWorkingInventory(root)[0]!.id;
    await withServer(null, (client) => callEveryTool(client, { story: "7.4", id: inventoryId, div: "DIV-1" }));
    expect(state()).toEqual(repoBefore);
  },
  TIMEOUT,
);
