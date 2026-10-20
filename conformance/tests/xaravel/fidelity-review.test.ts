// Xaravel Tests for Story 8.5 (the Fidelity Review workflow; FR-111, AD-15.8,
// AD-16).
//
// The checklist and the workflow are read from the real repository. The
// review CLI runs against hermetic fixture roots (the real checklist, a Story
// manifest, an Inventory and an Upstream snapshot file) with the GitHub API
// and the Anthropic Messages API as `Bun.serve` fakes on port 0. Nothing here
// contacts GitHub or Anthropic.
import { afterAll, expect } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildPrompt, CHECKLIST_FILE, decideEvent, DEFAULT_MODEL, NO_EVIDENCE, NO_TEXTUAL_CHANGE, parseChecklist, parseVerdict, precedenceSection, PROMPT_CAP, renderReviewBody, runReview, VERDICT_TOOL, verdictTool, type ChecklistItem } from "../../../tools/fidelity-review/fidelity-review";
import { approvalsClause, type Review } from "../../../tools/story-check/story-check";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CHECKLIST = readFileSync(join(root, CHECKLIST_FILE), "utf8");
const ITEMS: ChecklistItem[] = parseChecklist(CHECKLIST);
const IDS = Array.from({ length: 10 }, (_, i) => `F-${i + 1}`);
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const AUTHOR = "edanisko";
const TEST_ID = "Illuminate\\Tests\\Support\\SupportFidelityTest::testA";
const MISSING_ID = "Illuminate\\Tests\\Support\\SupportFidelityTest::testGone";
/** A data-provider test: the manifest lists `DATASET_ID`, the Inventory has its rows `#a` and `#b`. */
const DATASET_ID = "Illuminate\\Tests\\Support\\SupportFidelityTest::testRows";
/** A real committed batch request whose real signed fixture is an error (`Cannot 'continue' 2 levels`). */
const ERROR_REQUEST_ID = "Illuminate\\Tests\\View\\Blade\\BladeContinueStatementsTest::testContinueStatementsWithArgumentAreCompiled";
const ERROR_FIXTURE = "conformance/fixtures/view/02cb543f0363e6d73c44b9b5d52589def1238cbd68c4eeab68dab554487db0c2.json";

/**
 * A fixture root: the real checklist, conformance/README.md, DIV-1, DIV-9 and consequence file, a Story 9.1 manifest,
 * an Inventory and an Upstream snapshot file. With `oracle`, also the real `conformance/oracle/` (batch requests,
 * schema, key) and one real error fixture, whose request id the manifest assigns.
 */
function makeRoot(options: { oracle?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "xt-fidelity-"));
  roots.push(dir);
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
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  for (const rel of ["conformance/README.md", "decisions/DIV-1.md", "decisions/DIV-9.md", "conformance/xaravel-consequences/conformance.jsonl", ...(options.oracle === true ? ["conformance/oracle", ERROR_FIXTURE] : [])]) {
    cpSync(join(root, rel), join(dir, rel), { recursive: true });
  }
  return dir;
}

interface PrFake {
  number: number;
  user: { login: string };
  head: { sha: string; ref: string };
  changed_files: number;
}

interface FakeState {
  pr: PrFake;
  files: { filename: string; status: string; patch?: string; changes?: number }[];
  contents: Record<string, string>;
  /** Every posted review, with the token's identity as its user. */
  posted: { user: { login: string }; state: string; commit_id: string; body: string; event: string }[];
  /** The login each bearer token acts as. */
  tokens: Record<string, string>;
  /** The Messages API response body. */
  message: unknown;
  /** Responses served, in order, before `message`: each a status and a body. */
  responses: { status: number; body: unknown }[];
  /** When set, every `GET /pulls/<n>` after the first answers with this head sha (a push during the review). */
  headAfter: string | null;
  /** How many times `GET /pulls/<n>` was served. */
  prGets: number;
  /** The status of `POST /pulls/<n>/reviews`; a non-2xx records nothing. */
  reviewStatus: number;
  /** Every Messages API request body, and its headers. */
  requests: { body: Record<string, unknown>; version: string | null; key: string | null }[];
}

function fakeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    pr: { number: 7, user: { login: AUTHOR }, head: { sha: SHA, ref: "story/9.1" }, changed_files: 2 },
    files: [
      { filename: "packages/support/src/Str.ts", status: "modified", patch: "@@ -1 +1 @@\n-old\n+new" },
      { filename: "conformance/oracle-requests/9.1.jsonl", status: "added", patch: "@@ -0,0 +1 @@\n+{\"id\":\"x\"}" },
    ],
    contents: { "conformance/oracle-requests/9.1.jsonl": '{"id":"x","kind":"php-expr","input":{"setup":[],"exprs":["1 + 2"]}}\n' },
    posted: [],
    tokens: { "token-1": "xaravel-fidelity-1[bot]", "token-2": "xaravel-fidelity-2[bot]" },
    message: verdictMessage(answers()),
    responses: [],
    headAfter: null,
    prGets: 0,
    reviewStatus: 200,
    requests: [],
    ...overrides,
  };
}

function answers(results: Record<string, "pass" | "fail" | "n/a"> = {}, findings: Record<string, { path: string; detail: string }[]> = {}): Record<string, unknown>[] {
  return IDS.map((id) => ({ id, result: results[id] ?? "pass", note: `checked ${id}`, findings: findings[id] ?? [] }));
}

function verdictMessage(items: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: DEFAULT_MODEL,
    stop_reason: "tool_use",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "tool_use", id: "toolu_1", name: VERDICT_TOOL, input: { items } },
    ],
    ...extra,
  };
}

/** Serves `state` as the GitHub API of `acme/xaravel` and the Anthropic API while `body` runs. */
async function withFakes<T>(state: FakeState, body: (github: string, anthropic: string) => Promise<T>): Promise<T> {
  const github = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
      const login = state.tokens[token];
      if (login === undefined) {
        return new Response("unauthorized", { status: 401 });
      }
      const base = "/repos/acme/xaravel";
      if (!url.pathname.startsWith(base)) {
        return new Response("not found", { status: 404 });
      }
      const path = url.pathname.slice(base.length);
      if (request.method === "GET" && path === `/pulls/${state.pr.number}`) {
        state.prGets++;
        return Response.json(state.prGets > 1 && state.headAfter !== null ? { ...state.pr, head: { ...state.pr.head, sha: state.headAfter } } : state.pr);
      }
      if (request.method === "GET" && path === `/pulls/${state.pr.number}/files`) {
        const page = Number(url.searchParams.get("page") ?? "1");
        return Response.json(state.files.slice((page - 1) * 100, page * 100));
      }
      if (request.method === "GET" && path.startsWith("/contents/")) {
        const file = decodeURIComponent(path.slice("/contents/".length));
        const text = url.searchParams.get("ref") === state.pr.head.sha ? state.contents[file] : undefined;
        return text === undefined ? new Response("not found", { status: 404 }) : new Response(text);
      }
      if (request.method === "POST" && path === `/pulls/${state.pr.number}/reviews`) {
        const posted = (await request.json()) as { commit_id: string; body: string; event: string };
        if (state.reviewStatus !== 200) {
          return Response.json({ message: "Unprocessable Entity: review body too long" }, { status: state.reviewStatus });
        }
        const stateName = posted.event === "APPROVE" ? "APPROVED" : posted.event === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : "COMMENTED";
        state.posted.push({ user: { login }, state: stateName, commit_id: posted.commit_id, body: posted.body, event: posted.event });
        return Response.json({ id: state.posted.length }, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  const anthropic = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== "POST" || url.pathname !== "/v1/messages") {
        return new Response("not found", { status: 404 });
      }
      state.requests.push({ body: (await request.json()) as Record<string, unknown>, version: request.headers.get("anthropic-version"), key: request.headers.get("x-api-key") });
      const next = state.responses.shift();
      return next === undefined ? Response.json(state.message) : Response.json(next.body, { status: next.status });
    },
  });
  try {
    return await body(`http://localhost:${github.port}`, `http://localhost:${anthropic.port}`);
  } finally {
    await github.stop(true);
    await anthropic.stop(true);
  }
}

function env(github: string, anthropic: string, token: string, extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { GH_TOKEN: token, ANTHROPIC_API_KEY: "test-model-key", GITHUB_REPOSITORY: "acme/xaravel", GITHUB_API_URL: github, ANTHROPIC_BASE_URL: anthropic, XARAVEL_FIDELITY_RETRY_DELAY_MS: "0", ...extra };
}

function args(dir: string, reviewer: 1 | 2, login: string, sha = SHA): string[] {
  return ["review", "--pr", "7", "--sha", sha, "--reviewer", String(reviewer), "--login", login, "--root", dir];
}

// ---------------------------------------------------------------------------
// XT-conformance-160 (AC1, AC4): the checklist

xaravelTest(
  "XT-conformance-160",
  "conformance/review/fidelity.md covers the Fidelity Review checklist F-1..F-10 (assertions match Upstream, no weakened expected value, no removed assertion without a DIV clause, Skip Reason precedence citing conformance/README.md#precedence and ESC-5.2-1, adapted markers, Oracle error fixtures, Xaravel Test consequences, no stub or fake of another Component, @asyncRoot tags, Oracle request setup and exprs); F-7 makes the review check that each Xaravel Test verifies the behaviour it claims; the reviewer prompt and verdict tool are built from it (FR-111.1, FR-111.4, FR-115.3)",
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

    // The prompt names every item; the tool enumerates exactly the parsed ids.
    const precedence = precedenceSection(readFileSync(join(root, "conformance", "README.md"), "utf8"));
    expect(precedence!.startsWith("## Precedence\n")).toBe(true);
    expect(precedence).toContain("When in doubt, pick the reason that counts against conformance.");
    expect(precedence).not.toContain("## Ratchet");
    const prompt = buildPrompt({ checklistText: CHECKLIST, items: ITEMS, precedence, storyId: "9.1", prNumber: 7, sha: SHA, manifestText: "---\n---\n", inventory: [], oracleRequests: [], files: [{ filename: "a.ts", status: "added", patch: "+x" }], evidence: NO_EVIDENCE });
    for (const item of ITEMS) {
      expect(prompt.system).toContain(`### ${item.id}: ${item.title}`);
    }
    // F-4's precedence is in the prompt itself, not only as a link.
    expect(prompt.system).toContain(precedence!);
    expect(prompt.system).toContain("Fail when unsure");
    expect(prompt.length).toBe(prompt.system.length + prompt.user.length);
    expect(PROMPT_CAP).toBe(600_000);
    const tool = verdictTool(ITEMS);
    expect(tool.name).toBe(VERDICT_TOOL);
    const schema = tool.input_schema as { properties: { items: { items: { properties: { id: { enum: string[] }; result: { enum: string[] } } } } } };
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
// XT-conformance-161 (AC2): two reviewer identities post PR reviews

interface Job {
  if: string;
  "timeout-minutes": number;
  environment: string;
  permissions: Record<string, string>;
  concurrency: { group: string };
  steps: { name?: string; uses?: string; if?: string; id?: string; with?: Record<string, unknown>; env?: Record<string, string>; run?: string }[];
}

xaravelTest(
  "XT-conformance-161",
  "a Story PR gets two Fidelity Reviews from two distinct reviewer App identities (xaravel-fidelity-1[bot], xaravel-fidelity-2[bot]), neither the PR author, each a GitHub PR review on the head commit whose body holds the verdict and findings, stored with the Story PR; story:check's approvals clause counts them (FR-111.1, FR-111.2, AD-15.8)",
  async () => {
    const script = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts["fidelity:review"];
    expect(script).toBe("bun --no-env-file tools/fidelity-review/fidelity-review.ts");

    // The workflow: two reviewer jobs, identical but for their App variable, secret and reviewer number.
    const workflow = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "fidelity.yml"), "utf8")) as { on: Record<string, { types: string[] }>; permissions: Record<string, string>; jobs: Record<string, Job> };
    expect(Object.keys(workflow.on)).toEqual(["pull_request_target"]);
    expect(workflow.on["pull_request_target"]!.types).toEqual(["opened", "synchronize", "reopened", "ready_for_review"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.jobs).sort()).toEqual(["reviewer-1", "reviewer-2"]);
    for (const n of [1, 2]) {
      const job = workflow.jobs[`reviewer-${n}`]!;
      expect(job.if).toContain("github.event.pull_request.head.repo.full_name == github.repository");
      expect(job.if).toContain("startsWith(github.event.pull_request.head.ref, 'story/')");
      expect(job.if).toContain("github.event.pull_request.base.ref == 'main'");
      expect(job.if).toContain("github.event.pull_request.draft == false");
      expect(job.permissions).toEqual({ contents: "read" });
      expect(job.environment).toBe("fidelity");
      // 3 model attempts of up to 8 minutes each, plus their delays, fit in the job.
      expect(job["timeout-minutes"]).toBe(45);
      expect(job.concurrency.group).toBe(`fidelity-\${{ github.event.pull_request.number }}-reviewer-${n}`);
      const configured = job.steps[0]!;
      expect(configured.id).toBe("configured");
      expect(configured.env).toEqual({ APP_ID: `\${{ vars.XARAVEL_FIDELITY_${n}_APP_ID }}`, HAS_APP_KEY: `\${{ secrets.XARAVEL_FIDELITY_${n}_APP_KEY != '' }}`, HAS_MODEL_KEY: "${{ secrets.ANTHROPIC_API_KEY != '' }}" });
      expect(configured.run).toContain("::warning::");
      expect(configured.run).toContain(`vars.XARAVEL_FIDELITY_${n}_APP_ID`);
      expect(configured.run).toContain(`secrets.XARAVEL_FIDELITY_${n}_APP_KEY`);
      for (const step of job.steps.slice(1)) {
        expect(step.if).toBe("steps.configured.outputs.ok == 'true'");
      }
      const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@") === true)!;
      expect(checkout.with).toEqual({ ref: "${{ github.event.pull_request.base.sha }}", "persist-credentials": false });
      const app = job.steps.find((step) => step.uses?.startsWith("actions/create-github-app-token@") === true)!;
      expect(app.uses).toBe("actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510");
      expect(app.with).toEqual({ "app-id": `\${{ vars.XARAVEL_FIDELITY_${n}_APP_ID }}`, "private-key": `\${{ secrets.XARAVEL_FIDELITY_${n}_APP_KEY }}`, "permission-pull-requests": "write", "permission-contents": "read" });
      expect(job.steps.some((step) => step.run === "bun run upstream:sync")).toBe(true);
      const review = job.steps.at(-1)!;
      expect(review.run).toBe(`bun run fidelity:review review --pr "$PR" --sha "$SHA" --reviewer ${n} --login "\${APP_SLUG}[bot]"`);
      expect(review.env!["XARAVEL_FIDELITY_MODEL"]).toBe("${{ vars.XARAVEL_FIDELITY_MODEL || 'claude-opus-5-5' }}");
      expect(review.env!["GH_TOKEN"]).toBe("${{ steps.app.outputs.token }}");
    }
    const normalise = (job: Job): string => JSON.stringify(job).replace(/XARAVEL_FIDELITY_[12]_/g, "XARAVEL_FIDELITY_N_").replace(/reviewer-[12]/g, "reviewer-N").replace(/--reviewer [12]/g, "--reviewer N");
    expect(normalise(workflow.jobs["reviewer-1"]!)).toBe(normalise(workflow.jobs["reviewer-2"]!));
    expect(JSON.stringify(workflow.jobs["reviewer-1"])).not.toContain("XARAVEL_FIDELITY_2_");
    expect(JSON.stringify(workflow.jobs["reviewer-2"])).not.toContain("XARAVEL_FIDELITY_1_");

    // Two all-pass runs under two App identities post two APPROVE reviews on --sha; approvals passes for the author.
    const dir = makeRoot();
    const state = fakeState();
    await withFakes(state, async (github, anthropic) => {
      const first = await runReview(args(dir, 1, "xaravel-fidelity-1[bot]"), env(github, anthropic, "token-1"));
      expect(first.err).toEqual([]);
      expect(first.code).toBe(0);
      expect(first.out[0]).toBe(`posted APPROVE on PR #7 at ${SHA} as xaravel-fidelity-1[bot] (reviewer 1)`);
      const second = await runReview(args(dir, 2, "xaravel-fidelity-2[bot]"), env(github, anthropic, "token-2"));
      expect(second.code).toBe(0);
    });
    expect(state.posted.map((review) => [review.user.login, review.event, review.commit_id])).toEqual([
      ["xaravel-fidelity-1[bot]", "APPROVE", SHA],
      ["xaravel-fidelity-2[bot]", "APPROVE", SHA],
    ]);
    for (const [index, review] of state.posted.entries()) {
      expect(review.body.startsWith(`Fidelity Review (reviewer ${index + 1}) of Story 9.1 at ${SHA}\n`)).toBe(true);
      for (const item of ITEMS) {
        expect(review.body).toContain(`| ${item.id}: ${item.title} | pass | checked ${item.id} |`);
      }
    }
    const reviews: Review[] = state.posted.map((review) => ({ user: review.user, state: review.state, commit_id: review.commit_id }));
    const clause = approvalsClause(7, AUTHOR, SHA, reviews);
    expect(clause.pass).toBe(true);
    expect(clause.detail).toBe("PR #7: 2 approvals (xaravel-fidelity-1[bot], xaravel-fidelity-2[bot])");

    // The model request: the Messages API, the verdict tool, the evidence.
    expect(state.requests).toHaveLength(2);
    const request = state.requests[0]!;
    expect(request.version).toBe("2023-06-01");
    expect(request.key).toBe("test-model-key");
    expect(request.body["model"]).toBe(DEFAULT_MODEL);
    expect((request.body["tools"] as { name: string }[]).map((tool) => tool.name)).toEqual([VERDICT_TOOL]);
    // Opus 5.5 rejects a forced tool_choice, so the request asks with auto and a strict tool; the force is ours.
    expect(request.body["tool_choice"]).toEqual({ type: "auto", disable_parallel_tool_use: true });
    expect((request.body["tools"] as { strict?: unknown }[])[0]!.strict).toBe(true);
    const user = (request.body["messages"] as { content: string }[])[0]!.content;
    expect(user).toContain("$this->assertSame(3, sum(1, 2));");
    expect(user).toContain(`### ${MISSING_ID}`);
    // The "Upstream source unavailable" prefix appears once, for the one unreadable source.
    expect(user.split("Upstream source unavailable").length - 1).toBe(1);
    expect(user).toContain("Upstream source unavailable: ");
    // A listed dataset id X brings in both of its rows X#a and X#b, each with its Upstream line.
    expect(user).toContain(`### ${DATASET_ID}#a`);
    expect(user).toContain(`### ${DATASET_ID}#b`);
    expect(user).toContain("$this->assertSame('row-a', rowA())");
    expect(user).toContain("$this->assertSame('row-b', rowB())");
    expect(user).toContain('"exprs":["1 + 2"]');
    expect(user).toContain("### packages/support/src/Str.ts (modified)");
    expect(String(request.body["system"])).toContain("### F-10: Oracle requests match the Upstream test's inputs");

    // Self-review (case-insensitive): refused, nothing posted.
    const self = fakeState({ tokens: { "token-1": AUTHOR } });
    const selfRun = await withFakes(self, (github, anthropic) => runReview(args(dir, 1, "EdAnisko"), env(github, anthropic, "token-1")));
    expect(selfRun.code).toBe(1);
    expect(selfRun.err.join("\n")).toContain("is the PR author");
    expect(self.posted).toEqual([]);
    expect(self.requests).toEqual([]);

    // Not a Story branch: refused.
    const planning = fakeState({ pr: { ...fakeState().pr, head: { sha: SHA, ref: "planning/x" } } });
    const planningRun = await withFakes(planning, (github, anthropic) => runReview(args(dir, 1, "xaravel-fidelity-1[bot]"), env(github, anthropic, "token-1")));
    expect(planningRun.code).toBe(1);
    expect(planningRun.err.join("\n")).toContain("planning/x, not story/<id>");
    expect(planning.posted).toEqual([]);

    // A Story whose manifest is missing: refused.
    const unknown = fakeState({ pr: { ...fakeState().pr, head: { sha: SHA, ref: "story/9.2" } } });
    const unknownRun = await withFakes(unknown, (github, anthropic) => runReview(args(dir, 1, "xaravel-fidelity-1[bot]"), env(github, anthropic, "token-1")));
    expect(unknownRun.code).toBe(1);
    expect(unknownRun.err.join("\n")).toContain("stories/9.2.md does not exist");
    expect(unknown.posted).toEqual([]);

    // Superseded: the PR head moved on; nothing posted, exit 0.
    const superseded = fakeState();
    const supersededRun = await withFakes(superseded, (github, anthropic) => runReview(args(dir, 1, "xaravel-fidelity-1[bot]", OTHER_SHA), env(github, anthropic, "token-1")));
    expect(supersededRun.code).toBe(0);
    expect(supersededRun.out[0]!.startsWith("superseded")).toBe(true);
    expect(superseded.posted).toEqual([]);
    expect(superseded.requests).toEqual([]);

    // Too large: a file without a patch, a truncated file list, or a prompt over the cap.
    const noPatch = fakeState({ files: [{ filename: "big.bin", status: "added" }], pr: { ...fakeState().pr, changed_files: 1 } });
    const noPatchRun = await withFakes(noPatch, (github, anthropic) => runReview(args(dir, 1, "xaravel-fidelity-1[bot]"), env(github, anthropic, "token-1")));
    expect(noPatchRun.code).toBe(1);
    expect(noPatchRun.err.join("\n")).toContain("without a patch");
    expect(noPatch.posted).toEqual([]);
    const truncated = fakeState({ pr: { ...fakeState().pr, changed_files: 3001 } });
    const truncatedRun = await withFakes(truncated, (github, anthropic) => runReview(args(dir, 1, "xaravel-fidelity-1[bot]"), env(github, anthropic, "token-1")));
    expect(truncatedRun.code).toBe(1);
    expect(truncated.posted).toEqual([]);
    const huge = fakeState({ files: [{ filename: "packages/support/src/Big.ts", status: "added", patch: `+${"x".repeat(PROMPT_CAP)}` }], pr: { ...fakeState().pr, changed_files: 1 } });
    const hugeRun = await withFakes(huge, (github, anthropic) => runReview(args(dir, 1, "xaravel-fidelity-1[bot]"), env(github, anthropic, "token-1")));
    expect(hugeRun.code).toBe(1);
    expect(hugeRun.err.join("\n")).toContain("over the 600000 cap");
    expect(huge.posted).toEqual([]);
    expect(huge.requests).toEqual([]);

    // Usage: a missing option or env var is exit 2.
    const base = { GH_TOKEN: "t", ANTHROPIC_API_KEY: "k", GITHUB_REPOSITORY: "acme/xaravel" };
    for (const drop of ["--pr", "--sha", "--reviewer", "--login"]) {
      const argv = args(dir, 1, "x");
      argv.splice(argv.indexOf(drop), 2);
      const usage = await runReview(argv, base);
      expect(`${drop}: ${usage.code}`).toBe(`${drop}: 2`);
      expect(usage.err.join("\n")).toContain(`${drop} is required`);
    }
    for (const name of ["GH_TOKEN", "ANTHROPIC_API_KEY"]) {
      const usage = await runReview(args(dir, 1, "x"), { ...base, [name]: undefined });
      expect(usage.code).toBe(2);
      expect(usage.err[0]).toBe(`${name} is not set`);
      expect(usage.err.join("\n")).not.toContain("acme");
    }
    expect((await runReview([], base)).code).toBe(2);
    expect((await runReview(["review", "--pr", "7", "--sha", SHA, "--reviewer", "3", "--login", "x"], base)).code).toBe(2);

    const login1 = "xaravel-fidelity-1[bot]";

    // Superseded mid-review: a push lands while the model answers; the second head check stops the post.
    const moved = fakeState({ headAfter: OTHER_SHA });
    const movedRun = await withFakes(moved, (github, anthropic) => runReview(args(dir, 1, login1), env(github, anthropic, "token-1")));
    expect(movedRun.code).toBe(0);
    expect(movedRun.out[0]!.startsWith("superseded")).toBe(true);
    expect(movedRun.out[0]).toContain(OTHER_SHA);
    expect(moved.requests).toHaveLength(1);
    expect(moved.prGets).toBe(2);
    expect(moved.posted).toEqual([]);

    // A file without a patch but with `changes: 0` (a pure rename) is reviewed, not refused.
    const renamed = fakeState({ files: [...fakeState().files, { filename: "docs/renamed.md", status: "renamed", changes: 0 }], pr: { ...fakeState().pr, changed_files: 3 } });
    const renamedRun = await withFakes(renamed, (github, anthropic) => runReview(args(dir, 1, login1), env(github, anthropic, "token-1")));
    expect(renamedRun.err).toEqual([]);
    expect(renamedRun.code).toBe(0);
    expect(renamed.posted.map((review) => review.event)).toEqual(["APPROVE"]);
    expect((renamed.requests[0]!.body["messages"] as { content: string }[])[0]!.content).toContain(`### docs/renamed.md (renamed)\n\n${NO_TEXTUAL_CHANGE}`);
    // A missing patch on a file with changes is still refused.
    const binary = fakeState({ files: [{ filename: "big.bin", status: "modified", changes: 12 }], pr: { ...fakeState().pr, changed_files: 1 } });
    const binaryRun = await withFakes(binary, (github, anthropic) => runReview(args(dir, 1, login1), env(github, anthropic, "token-1")));
    expect(binaryRun.code).toBe(1);
    expect(binaryRun.err.join("\n")).toContain("without a patch (too large or binary): big.bin");
    expect(binary.posted).toEqual([]);

    // The evidence (a)-(d): DIV records cited by adapted markers, consequence lines, error fixtures, DIV-1 for @asyncRoot.
    const evidenceRoot = makeRoot({ oracle: true });
    const evidencePatch = [
      "@@ -0,0 +1,6 @@",
      "+  assertSame(0.1 + 0.2, x); // adapted:DIV-9.1",
      "+  assertSame(1, y); // adapted:DIV-77.1",
      '+xaravelTest("XT-conformance-999", "covers FR-111.1 and FR-999.9", () => {});',
      '+{"id":"x","variant":"none","status":"pass","reason":null,"adapted":"DIV-55.1"}',
      '+{"id":"y","variant":"none","status":"skip","reason":"intentional-divergence:DIV-66"}',
      "+/** @asyncRoot */",
      "+export async function get(): Promise<string> { return ''; }",
      "+",
    ].join("\n");
    const evidence = fakeState({ files: [{ filename: "packages/support/tests/Evidence.test.ts", status: "added", patch: evidencePatch }], pr: { ...fakeState().pr, changed_files: 1 } });
    const evidenceRun = await withFakes(evidence, (github, anthropic) => runReview(args(evidenceRoot, 1, login1), env(github, anthropic, "token-1")));
    expect(evidenceRun.err).toEqual([]);
    expect(evidenceRun.code).toBe(0);
    const evidenceUser = (evidence.requests[0]!.body["messages"] as { content: string }[])[0]!.content;
    const evidenceSystem = String(evidence.requests[0]!.body["system"]);
    expect(evidenceSystem).toContain("When in doubt, pick the reason that counts against conformance.");
    const div9 = readFileSync(join(root, "decisions", "DIV-9.md"), "utf8");
    expect(evidenceUser).toContain("### (a) DIV records cited by added adapted markers (F-3, F-5)");
    expect(evidenceUser).toContain(`#### decisions/DIV-9.md\n\n\`\`\`markdown\n${div9}`);
    expect(evidenceUser).toContain("fewer_assertions:");
    expect(evidenceUser).toContain("unavailable: decisions/DIV-77.md does not exist");
    // An Expectations `"adapted"` field and an `intentional-divergence` Skip Reason cite their DIV record too.
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
    // Without such lines, each section says so instead.
    expect(user).toContain("No added line carries an `adapted:DIV-<n>.<k>` marker.");
    expect(user).toContain("No added line cites an `FR-<n>.<k>` or `AD-<n>.<k>` consequence.");
    expect(user).toContain("No added line contains `@asyncRoot`.");
    // With no error fixture, (c) never claims the PR has none: it points to the PR-head list.
    const bare = buildPrompt({ checklistText: CHECKLIST, items: ITEMS, precedence: null, storyId: "9.1", prNumber: 7, sha: SHA, manifestText: "", inventory: [], oracleRequests: [], files: [], evidence: NO_EVIDENCE }).user;
    expect(bare).toContain("No base-branch fixture of an assigned committed Oracle request is an error; the PR-head fixtures are listed below.");
    expect(bare).toContain("No fixture the pull request adds or modifies is an error.");

    // (c) at the PR head: a Story's own error fixture, committed only to its branch, reaches the prompt.
    const headSha256 = "c".repeat(64);
    const headFixture = `conformance/fixtures/support/${headSha256}.json`;
    const headRequest = `${JSON.stringify({ id: TEST_ID, kind: "php-expr", input: { bindings: {}, setup: [], exprs: ["intdiv(1, 0)"] }, sha256: headSha256 })}\n`;
    const withFixture = fakeState({
      files: [
        { filename: "conformance/oracle-requests/9.1.jsonl", status: "added", patch: "@@ -0,0 +1 @@\n+{}" },
        { filename: headFixture, status: "added", patch: "@@ -0,0 +1 @@\n+{}" },
      ],
      contents: { "conformance/oracle-requests/9.1.jsonl": headRequest, [headFixture]: JSON.stringify({ sha256: headSha256, output: { error: { class: "DivisionByZeroError", message: "Division by zero", stage: "setup" }, results: [] }, signature: "x" }) },
      pr: { ...fakeState().pr, changed_files: 2 },
    });
    const withFixtureRun = await withFakes(withFixture, (github, anthropic) => runReview(args(dir, 1, login1), env(github, anthropic, "token-1")));
    expect(withFixtureRun.err).toEqual([]);
    expect(withFixtureRun.code).toBe(0);
    const withFixtureUser = (withFixture.requests[0]!.body["messages"] as { content: string }[])[0]!.content;
    expect(withFixtureUser).toContain(`#### ${TEST_ID} (${headFixture}, PR head)`);
    expect(withFixtureUser).toContain("Division by zero");

    // A removed Oracle request file is not read at the head; the review is still posted.
    const removed = fakeState({ files: [{ filename: "conformance/oracle-requests/9.1.jsonl", status: "removed", patch: '@@ -1 +0,0 @@\n-{"id":"x"}' }], contents: {}, pr: { ...fakeState().pr, changed_files: 1 } });
    const removedRun = await withFakes(removed, (github, anthropic) => runReview(args(dir, 1, login1), env(github, anthropic, "token-1")));
    expect(removedRun.err).toEqual([]);
    expect(removedRun.code).toBe(0);
    expect(removed.posted).toHaveLength(1);

    // The model call: an overload (529) is retried once and the review is posted.
    const overloaded = fakeState({ responses: [{ status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }] });
    const overloadedRun = await withFakes(overloaded, (github, anthropic) => runReview(args(dir, 1, login1), env(github, anthropic, "token-1")));
    expect(overloadedRun.code).toBe(0);
    expect(overloaded.requests).toHaveLength(2);
    expect(overloaded.posted.map((review) => review.event)).toEqual(["APPROVE"]);
    expect(overloadedRun.err.join("\n")).toContain("HTTP 529");
    // A 400 fails at once, quoting the response body; nothing is posted.
    const rejected = fakeState({ responses: [{ status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "tool_choice is not supported" } } }] });
    const rejectedRun = await withFakes(rejected, (github, anthropic) => runReview(args(dir, 1, login1), env(github, anthropic, "token-1")));
    expect(rejectedRun.code).toBe(1);
    expect(rejected.requests).toHaveLength(1);
    expect(rejectedRun.err.join("\n")).toContain("HTTP 400");
    expect(rejectedRun.err.join("\n")).toContain("tool_choice is not supported");
    expect(rejectedRun.err.join("\n")).not.toContain("test-model-key");
    expect(rejected.posted).toEqual([]);
    // Three overloads in a row exhaust the attempts.
    const down = fakeState({ responses: [529, 500, 429].map((status) => ({ status, body: { type: "error" } })) });
    const downRun = await withFakes(down, (github, anthropic) => runReview(args(dir, 1, login1), env(github, anthropic, "token-1")));
    expect(downRun.code).toBe(1);
    expect(down.requests).toHaveLength(3);
    expect(downRun.err.join("\n")).toContain("attempt 3 of 3");
    expect(down.posted).toEqual([]);

    // A review POST that GitHub refuses (422) is exit 1, with the body quoted.
    const unprocessable = fakeState({ reviewStatus: 422 });
    const unprocessableRun = await withFakes(unprocessable, (github, anthropic) => runReview(args(dir, 1, login1), env(github, anthropic, "token-1")));
    expect(unprocessableRun.code).toBe(1);
    expect(unprocessableRun.err.join("\n")).toContain("HTTP 422");
    expect(unprocessableRun.err.join("\n")).toContain("review body too long");
    expect(unprocessable.posted).toEqual([]);
  },
  120_000,
);

// ---------------------------------------------------------------------------
// XT-conformance-162 (AC3): a rejecting review

xaravelTest(
  "XT-conformance-162",
  "a failing Fidelity Review item posts REQUEST_CHANGES with the findings, so the PR returns to its implementer, and approvals then counts only distinct identities' approvals on the head; a missing, extra, duplicate or malformed verdict posts nothing and fails closed (FR-111.3, AD-15.8)",
  async () => {
    const dir = makeRoot();
    const finding = { path: "conformance/tests/support/SupportStrTest.test.ts", detail: "assertSame(3, …) became assertEquals('3', …)" };
    const failing = fakeState({ message: verdictMessage(answers({ "F-2": "fail", "F-9": "n/a" }, { "F-2": [finding] })) });
    const run = await withFakes(failing, (github, anthropic) => runReview(args(dir, 2, "xaravel-fidelity-2[bot]"), env(github, anthropic, "token-2")));
    expect(run.err).toEqual([]);
    expect(run.code).toBe(0);
    expect(failing.posted).toHaveLength(1);
    const posted = failing.posted[0]!;
    expect(posted.event).toBe("REQUEST_CHANGES");
    expect(posted.commit_id).toBe(SHA);
    expect(posted.body).toContain("| F-2: No expected value is weakened | fail | checked F-2 |");
    expect(posted.body).toContain("| F-9: Every `@asyncRoot` tag is true | n/a | checked F-9 |");
    expect(posted.body).toContain(`- **F-2** \`${finding.path}\`: ${finding.detail}`);

    // Findings are listed only for fail items: a pass item's stray finding is not rendered.
    const stray = { path: "packages/support/src/Stray.ts", detail: "a note on a passing item" };
    const strayVerdict = parseVerdict(ITEMS, { items: answers({ "F-2": "fail" }, { "F-2": [finding], "F-3": [stray] }) });
    expect(strayVerdict.ok).toBe(true);
    const strayBody = strayVerdict.ok ? renderReviewBody({ reviewer: 1, storyId: "9.1", sha: SHA, model: DEFAULT_MODEL, items: ITEMS, verdict: strayVerdict.verdict }) : "";
    expect(strayBody).toContain(finding.path);
    expect(strayBody).not.toContain(stray.path);
    const approveWithStray = parseVerdict(ITEMS, { items: answers({}, { "F-3": [stray] }) });
    const approveBody = approveWithStray.ok ? renderReviewBody({ reviewer: 1, storyId: "9.1", sha: SHA, model: DEFAULT_MODEL, items: ITEMS, verdict: approveWithStray.verdict }) : "";
    expect(approveWithStray.ok && decideEvent(approveWithStray.verdict)).toBe("APPROVE");
    expect(approveBody).not.toContain(stray.path);
    expect(approveBody).toContain("## Findings\n\nNone.");

    // Model-written notes and findings cannot @-mention: every `@` is followed by U+200B.
    const mention = parseVerdict(ITEMS, { items: answers({ "F-2": "fail" }, { "F-2": [{ path: "a/@team.ts", detail: "ping @xaravel/maintainers" }] }).map((entry) => (entry["id"] === "F-1" ? { ...entry, note: "cc @edanisko" } : entry)) });
    const mentionBody = mention.ok ? renderReviewBody({ reviewer: 1, storyId: "9.1", sha: SHA, model: DEFAULT_MODEL, items: ITEMS, verdict: mention.verdict }) : "";
    expect(mentionBody).toContain("cc @\u200Bedanisko");
    expect(mentionBody).toContain("`a/@\u200Bteam.ts`: ping @\u200Bxaravel/maintainers");
    expect(/@(?!\u200B)(edanisko|xaravel|team)/.test(mentionBody)).toBe(false);

    // approvals over that rejection plus one approval fails, listing the rejecting reviewer.
    const reviews: Review[] = [{ user: { login: "xaravel-fidelity-1[bot]" }, state: "APPROVED", commit_id: SHA }, { user: posted.user, state: posted.state, commit_id: posted.commit_id }];
    const clause = approvalsClause(7, AUTHOR, SHA, reviews);
    expect(clause.pass).toBe(false);
    expect(clause.items).toContain("xaravel-fidelity-2[bot]: CHANGES_REQUESTED");

    // The pure verdict rules.
    const ok = parseVerdict(ITEMS, { items: answers() });
    expect(ok.ok).toBe(true);
    expect(ok.ok && decideEvent(ok.verdict)).toBe("APPROVE");
    const failed = parseVerdict(ITEMS, { items: answers({ "F-2": "fail" }, { "F-2": [finding] }) });
    expect(failed.ok && decideEvent(failed.verdict)).toBe("REQUEST_CHANGES");
    expect(failed.ok && renderReviewBody({ reviewer: 1, storyId: "9.1", sha: SHA, model: DEFAULT_MODEL, items: ITEMS, verdict: failed.verdict }).startsWith(`Fidelity Review (reviewer 1) of Story 9.1 at ${SHA}\n`)).toBe(true);
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

    // The missing-item and malformed rows: nothing posted, exit 1.
    const cases: [string, unknown, string][] = [
      ["missing F-9", verdictMessage(answers().filter((entry) => entry["id"] !== "F-9")), "missing item id F-9"],
      ["bad result", verdictMessage(answers({ "F-1": "yes" as "pass" })), 'F-1: result "yes"'],
      ["no tool call", { id: "m", type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "All good." }] }, "0 submit_verdict tool calls"],
      ["refusal", { id: "m", type: "message", role: "assistant", stop_reason: "refusal", content: [] }, "0 submit_verdict tool calls"],
      ["truncated", verdictMessage(answers(), { stop_reason: "max_tokens" }), "stop_reason \"max_tokens\""],
    ];
    for (const [name, message, expected] of cases) {
      const state = fakeState({ message });
      const result = await withFakes(state, (github, anthropic) => runReview(args(dir, 1, "xaravel-fidelity-1[bot]"), env(github, anthropic, "token-1")));
      expect(`${name}: ${result.code}`).toBe(`${name}: 1`);
      expect(result.err.join("\n")).toContain(expected);
      expect(result.err.join("\n")).toContain("no review posted");
      expect(result.err.join("\n")).not.toContain("test-model-key");
      expect(state.posted).toEqual([]);
    }
  },
  120_000,
);
