// Xaravel Tests for Story 7.3 (Boost framework mode: the read-only MCP server
// `tools/boost-framework/src/server.ts` and its `.mcp.json` registration;
// FR-109, UJ-4).
//
// The server is driven over stdio by a raw newline-delimited JSON-RPC client
// (spawn, initialize, calls matched by id, kill). Fixture roots are hermetic
// temp directories; the real repository is only read. Where the server mirrors
// another tool's rule (it cannot import tools/*), the test compares it with
// that tool on the fixture and on the real repository.
import { afterAll, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { computeReport } from "../../../tools/conformance-report/report";
import { escalationDigest, escalationStatus } from "../../../tools/escalations/escalations";
import { readManifests } from "../../../tools/ownership/ownership";
import { readExpectations, readWorkingInventory } from "../../../tools/pin-bump/pin-bump";
import { globToRegExp as harnessGlob } from "../../harness/select";
import { computeBuckets, globToRegExp, parseSource, storyTests } from "../../../tools/boost-framework/src/index";
import { readExpectationShards } from "../../../tools/boost-framework/src/data";
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

async function withServer<T>(serverRoot: string | null, fn: (client: StdioClient) => Promise<T>): Promise<T> {
  const args = serverRoot === null ? [] : ["--root", serverRoot];
  const { client } = await StdioClient.start(["bun", "--no-env-file", SERVER, ...args]);
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
      const missing = await client.value("divergence.get", { id: "DIV-4" });
      expect(missing).toMatchObject({ id: "DIV-4", path: "decisions/DIV-4.md", exists: false, frontmatter: null, clauses: [] });
      expect(String(missing["note"])).toContain("Story 8.1");
      expect(errorText(await client.call("divergence.get", { id: "DIV-x" }))).toContain("DIV-<n>");

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
    });
    const { manifests } = readManifests(root);
    expect(manifests.length).toBeGreaterThan(0);
    for (const item of manifests) {
      const value = storyTests(root, { story: item.storyId });
      expect(value).toMatchObject({ story: item.storyId, epic: item.epic, component: item.component, status: item.status, testIds: item.testIds, xaravelTestIds: item.xaravelTestIds });
    }

    // The mirrored Expectations walk and glob semantics.
    expect(readExpectationShards(root).map((shard) => [shard.path, shard.lines.length])).toEqual(readExpectations(root).map((shard) => [shard.path, shard.lines.length]));
    for (const glob of ["*", "?", "a*b", "*SupportStrTest::*", "X\\Y::t?st*", "a.b(c)[d]{e}|f^g$h+i/j", "*#*"]) {
      for (const candidate of ["", "a", "ab", "aXb", "X\\Y::test1", "a.b(c)[d]{e}|f^g$h+i/j", "a#b", "Illuminate\\Tests\\Support\\SupportStrTest::testX"]) {
        expect(`${glob} ~ ${candidate}: ${globToRegExp(glob).test(candidate)}`).toBe(`${glob} ~ ${candidate}: ${harnessGlob(glob).test(candidate)}`);
      }
    }

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
