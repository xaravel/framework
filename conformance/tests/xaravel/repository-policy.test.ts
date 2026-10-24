// Xaravel Tests for Story 1.7 (repository ruleset, workflow permissions and dependency audit).
// These run under plain `bun test` until the harness lands in Epic 5.
import { expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  diffRulesets,
  identityViolations,
  normalize,
  policyViolations,
  prFromMergeGroupRef,
  readCommitted,
  requestBody,
  REQUIRED_CHECKS,
  type ActiveRule,
  type Json,
} from "../../../tools/ruleset/ruleset";
import { PHP_VERSION } from "../../../tools/inventory/inventory";
import { ALLOWED_WRITE_JOBS, checkWorkflow, checkWorkflows } from "../../../tools/workflow-permissions/workflow-permissions";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const RULESET_CLI = join(root, "tools", "ruleset", "ruleset.ts");
const WORKFLOWS_CLI = join(root, "tools", "workflow-permissions", "workflow-permissions.ts");

type Ruleset = Record<string, unknown> & { rules: Record<string, unknown>[]; bypass_actors: Record<string, unknown>[] };

function committed(name: string): Ruleset {
  return JSON.parse(readFileSync(join(root, ".github", "rulesets", name), "utf8")) as Ruleset;
}

/** The request body `apply` must send for a committed ruleset. */
function bodyOf(ruleset: Ruleset): Record<string, Json> {
  return requestBody(ruleset as Record<string, Json>);
}

function byString(a: unknown, b: unknown): number {
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A live API rendering of a committed ruleset: extra fields, reversed rules and keys, a numeric admin actor_id. */
function liveOf(ruleset: Ruleset, id: number): Record<string, unknown> {
  const reverseKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(reverseKeys);
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .reverse()
          .map(([key, inner]) => [key, reverseKeys(inner)]),
      );
    }
    return value;
  };
  const copy = clone(ruleset);
  copy.rules.reverse();
  for (const rule of copy.rules) {
    const parameters = rule["parameters"] as Record<string, unknown> | undefined;
    const checks = parameters?.["required_status_checks"];
    if (Array.isArray(checks)) {
      checks.reverse();
    }
  }
  const conditions = copy["conditions"] as { ref_name: { include: string[]; exclude: string[] } };
  conditions.ref_name.exclude.reverse();
  copy.bypass_actors = copy.bypass_actors.map((actor) => ({ ...actor, actor_id: actor["actor_type"] === "OrganizationAdmin" ? 1 : actor["actor_id"] }));
  return {
    id,
    source_type: "Repository",
    source: "xaravel/framework",
    node_id: `RRS_${id}`,
    current_user_can_bypass: "always",
    _links: { self: { href: `https://api.github.com/repos/xaravel/framework/rulesets/${id}` } },
    ...(reverseKeys(copy) as Record<string, unknown>),
  };
}

async function run(cli: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, cli, ...args], {
    cwd: root,
    env: { PATH: process.env["PATH"] ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

interface FakeGitHub {
  /** Live rulesets by id. */
  rulesets?: Record<number, Record<string, unknown>>;
  admins?: string[];
  /** Active rules by branch name. */
  branchRules?: Record<string, ActiveRule[]>;
  /** Repository role by login. */
  roles?: Record<string, string>;
  /** Paths (after `/repos/xaravel/framework`, or absolute for `/orgs/...`) that answer HTTP 500. */
  fail?: string[];
  /** Every successful POST or PUT, in order (filled in by the fake). */
  writes?: { method: string; path: string; body: unknown }[];
  /** Every request received, authorised or not (counted by the fake). */
  requests?: number;
}

/** Runs the ruleset CLI against a `Bun.serve` fake of the GitHub API on port 0. */
async function runRuleset(args: string[], fake: FakeGitHub, token: string | null = "test-token"): Promise<{ code: number; stdout: string; stderr: string }> {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      fake.requests = (fake.requests ?? 0) + 1;
      if (request.headers.get("authorization") !== "Bearer test-token") {
        return new Response("unauthorized", { status: 401 });
      }
      const base = "/repos/xaravel/framework";
      const rel = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname;
      if ((fake.fail ?? []).includes(rel)) {
        return new Response("boom", { status: 500 });
      }
      const page = Number(url.searchParams.get("page") ?? "1");
      const paged = (items: unknown[]): Response => Response.json(page === 1 ? items : []);
      const rulesets = (fake.rulesets ??= {});
      if (request.method === "POST" && rel === "/rulesets") {
        // Create: a new id, stored like a live ruleset.
        const body = (await request.json()) as Record<string, unknown>;
        const id = Math.max(900, ...Object.keys(rulesets).map(Number)) + 1;
        rulesets[id] = { id, ...body };
        (fake.writes ??= []).push({ method: "POST", path: rel, body });
        return Response.json(rulesets[id], { status: 201 });
      }
      const put = request.method === "PUT" ? /^\/rulesets\/(\d+)$/.exec(rel) : null;
      if (put !== null) {
        // Update: replace the stored ruleset.
        const id = Number(put[1]);
        if (rulesets[id] === undefined) {
          return new Response("not found", { status: 404 });
        }
        const body = (await request.json()) as Record<string, unknown>;
        rulesets[id] = { id, ...body };
        (fake.writes ??= []).push({ method: "PUT", path: rel, body });
        return Response.json(rulesets[id]);
      }
      if (request.method !== "GET") {
        return new Response("method not allowed", { status: 405 });
      }
      if (rel === "/rulesets") {
        return paged(Object.values(rulesets).map((ruleset) => ({ id: ruleset["id"], name: ruleset["name"], target: ruleset["target"] })));
      }
      const one = /^\/rulesets\/(\d+)$/.exec(rel);
      if (one !== null) {
        const ruleset = rulesets[Number(one[1])];
        return ruleset === undefined ? new Response("not found", { status: 404 }) : Response.json(ruleset);
      }
      if (url.pathname === "/orgs/xaravel/members" && url.searchParams.get("role") === "admin") {
        return paged((fake.admins ?? []).map((login) => ({ login })));
      }
      if (rel.startsWith("/rules/branches/")) {
        return paged((fake.branchRules ?? {})[rel.slice("/rules/branches/".length)] ?? []);
      }
      const permission = /^\/collaborators\/([^/]+)\/permission$/.exec(rel);
      if (permission !== null) {
        const role = (fake.roles ?? {})[permission[1]!];
        return role === undefined ? new Response("not found", { status: 404 }) : Response.json({ permission: role, role_name: role });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    return await run(RULESET_CLI, [...args, "--repo", "xaravel/framework"], {
      GITHUB_API_URL: `http://localhost:${server.port}`,
      ...(token === null ? {} : { GH_TOKEN: token }),
    });
  } finally {
    await server.stop(true);
  }
}

const MAIN = committed("main.json");
/** What verify, apply and identity print when GH_TOKEN is unset or empty. */
const NO_TOKEN = 'Ruleset check failed: GH_TOKEN is not set, so the live rulesets cannot be read; run with GH_TOKEN="$(gh auth token)" (AD-16)\n';
const PUSH = committed("agent-push.json");
const TAGS = committed("agent-tags.json");

function liveSet(overrides: { main?: Ruleset | null; push?: Ruleset | null; tags?: Ruleset | null } = {}): Record<number, Record<string, unknown>> {
  const out: Record<number, Record<string, unknown>> = {};
  const add = (id: number, ruleset: Ruleset | null | undefined, fallback: Ruleset) => {
    const chosen = ruleset === undefined ? fallback : ruleset;
    if (chosen !== null) {
      out[id] = liveOf(chosen, id);
    }
  };
  add(25223480, overrides.main, MAIN);
  add(101, overrides.push, PUSH);
  add(102, overrides.tags, TAGS);
  return out;
}

function ruleOf(ruleset: Ruleset, type: string): Record<string, unknown> {
  const rule = ruleset.rules.find((item) => item["type"] === type);
  if (rule === undefined) {
    throw new Error(`no ${type} rule`);
  }
  return rule;
}

function checksOf(ruleset: Ruleset): { context: string; integration_id: number }[] {
  return (ruleOf(ruleset, "required_status_checks")["parameters"] as { required_status_checks: { context: string; integration_id: number }[] }).required_status_checks;
}

const SHA = "0123456789abcdef0123456789abcdef01234567";

/** A hermetic root holding the given committed rulesets. */
async function withRulesets(files: Record<string, unknown>, body: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-rulesets-"));
  try {
    mkdirSync(join(dir, ".github", "rulesets"), { recursive: true });
    for (const [name, ruleset] of Object.entries(files)) {
      writeFileSync(join(dir, ".github", "rulesets", name), JSON.stringify(ruleset));
    }
    await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

xaravelTest("XT-conformance-30", ".github/rulesets/main.json matches the live ruleset and requires protected-paths and ownership, linear history, the merge queue and only the Maintainer as bypass; any difference exits 1 naming it (AD-16.2, AD-28.2, AD-28.7)", async () => {
  // The committed main ruleset carries every invariant.
  expect(MAIN["name"]).toBe("Protect main");
  expect(MAIN["target"]).toBe("branch");
  expect(MAIN["enforcement"]).toBe("active");
  expect(MAIN["conditions"]).toEqual({ ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } });
  expect(MAIN.rules.map((rule) => rule["type"]).sort(byString)).toEqual(
    ["deletion", "merge_queue", "non_fast_forward", "pull_request", "required_linear_history", "required_status_checks"].sort(byString),
  );
  expect(ruleOf(MAIN, "pull_request")["parameters"]).toMatchObject({
    required_approving_review_count: 0,
    require_code_owner_review: true,
    dismiss_stale_reviews_on_push: true,
    allowed_merge_methods: ["squash"],
  });
  const statusParameters = ruleOf(MAIN, "required_status_checks")["parameters"] as Record<string, unknown>;
  expect(statusParameters["strict_required_status_checks_policy"]).toBe(false);
  // Story 5.7: `ratchet` is required too.
  expect(checksOf(MAIN).map((check) => check.context).sort(byString)).toEqual(["audit", "check", "fixtures", "ownership", "protected-paths", "ratchet"]);
  for (const check of checksOf(MAIN)) {
    expect(check.integration_id).toBe(15368);
  }
  expect(ruleOf(MAIN, "merge_queue")["parameters"]).toMatchObject({
    merge_method: "SQUASH",
    grouping_strategy: "ALLGREEN",
    max_entries_to_build: 5,
    max_entries_to_merge: 5,
    min_entries_to_merge: 1,
    min_entries_to_merge_wait_minutes: 5,
    check_response_timeout_minutes: 60,
  });
  for (const ruleset of [MAIN, PUSH, TAGS]) {
    expect(ruleset.bypass_actors.map((actor) => [actor["actor_type"], actor["bypass_mode"]])).toEqual([["OrganizationAdmin", "always"]]);
  }
  expect(policyViolations(MAIN, { "main.json": MAIN, "agent-push.json": PUSH, "agent-tags.json": TAGS }, ["edanisko"])).toEqual([]);
  expect(REQUIRED_CHECKS).toContain("protected-paths");
  expect(REQUIRED_CHECKS).toContain("ownership");
  expect(REQUIRED_CHECKS).toContain("fixtures");
  expect(REQUIRED_CHECKS).toContain("check");
  // Story 5.7: `ratchet` is a required check.
  expect(REQUIRED_CHECKS).toContain("ratchet");

  // Normalisation: order, extra API fields and the admin actor_id do not matter.
  const live = liveOf(MAIN, 25223480);
  expect(normalize(live)).toEqual(normalize(MAIN));
  expect(Object.keys(normalize(live)).sort(byString)).toEqual(["bypass_actors", "conditions", "enforcement", "name", "rules", "target"]);
  expect(diffRulesets("main.json", MAIN, live)).toEqual([]);
  expect(diffRulesets("agent-push.json", PUSH, liveOf(PUSH, 101))).toEqual([]);

  // Drift: a missing rule, a changed check, a changed parameter, an extra live parameter.
  const noQueue = clone(MAIN);
  noQueue.rules = noQueue.rules.filter((rule) => rule["type"] !== "merge_queue");
  const queueDrift = diffRulesets("main.json", MAIN, liveOf(noQueue, 1));
  expect(queueDrift).toHaveLength(1);
  expect(queueDrift[0]).toMatch(/^ruleset drift: main\.json rules\[merge_queue\]: committed \{.*\}, live missing \(AD-16\)$/);

  const otherCheck = clone(MAIN);
  checksOf(otherCheck)[1]!.context = "lint";
  const checkDrift = diffRulesets("main.json", MAIN, liveOf(otherCheck, 1));
  expect(checkDrift.length).toBeGreaterThan(0);
  expect(checkDrift.every((line) => line.startsWith("ruleset drift: main.json rules[required_status_checks].parameters.required_status_checks["))).toBe(true);

  const otherParam = clone(MAIN);
  (ruleOf(otherParam, "merge_queue")["parameters"] as Record<string, unknown>)["merge_method"] = "MERGE";
  expect(diffRulesets("main.json", MAIN, liveOf(otherParam, 1))).toEqual([
    'ruleset drift: main.json rules[merge_queue].parameters.merge_method: committed "SQUASH", live "MERGE" (AD-16)',
  ]);

  const extraParam = clone(MAIN);
  (ruleOf(extraParam, "pull_request")["parameters"] as Record<string, unknown>)["automatic_copilot_code_review_enabled"] = false;
  expect(diffRulesets("main.json", MAIN, liveOf(extraParam, 1))).toEqual([
    "ruleset drift: main.json rules[pull_request].parameters.automatic_copilot_code_review_enabled: committed missing, live false (AD-16)",
  ]);

  // Policy: a committed main.json without a required check, linear history or the queue; extra bypass; a second admin.
  const noOwnership = clone(MAIN);
  (ruleOf(noOwnership, "required_status_checks")["parameters"] as Record<string, unknown>)["required_status_checks"] = checksOf(MAIN).filter(
    (check) => check.context !== "ownership",
  );
  expect(policyViolations(noOwnership, {}, ["edanisko"])).toEqual(["policy: .github/rulesets/main.json does not require the `ownership` check (AD-16)"]);
  const bare = clone(MAIN);
  bare.rules = bare.rules.filter((rule) => rule["type"] !== "required_linear_history" && rule["type"] !== "merge_queue");
  expect(policyViolations(bare, {}, ["edanisko"])).toEqual([
    "policy: .github/rulesets/main.json has no `required_linear_history` rule (AD-16)",
    "policy: .github/rulesets/main.json has no `merge_queue` rule (AD-16)",
  ]);
  const team = clone(MAIN);
  team.bypass_actors.push({ actor_id: 42, actor_type: "Team", bypass_mode: "always" });
  expect(policyViolations(MAIN, { live: team }, ["edanisko"])).toEqual([
    'policy: live has bypass actor {"actor_id":42,"actor_type":"Team","bypass_mode":"always"}; only OrganizationAdmin may bypass (AD-16)',
  ]);
  expect(policyViolations(MAIN, {}, ["edanisko", "eve"])).toEqual([
    'policy: the org\'s admins are ["edanisko","eve"]; they must be exactly ["edanisko"] (the Maintainer) (AD-16)',
  ]);
  expect(policyViolations(MAIN, {}, ["EdAnisko"])).toEqual([]);
  expect(policyViolations(MAIN, {}, [])).toHaveLength(1);
  // Policy: a required check not pinned to GitHub Actions, so any status writer could satisfy it.
  for (const check of REQUIRED_CHECKS) {
    for (const integrationId of [undefined, 1]) {
      const unpinned = clone(MAIN);
      const entry = checksOf(unpinned).find((item) => item.context === check)!;
      if (integrationId === undefined) {
        delete (entry as { integration_id?: number }).integration_id;
      } else {
        entry.integration_id = integrationId;
      }
      expect(policyViolations(unpinned, {}, ["edanisko"])).toEqual([
        `policy: .github/rulesets/main.json does not pin the \`${check}\` check to GitHub Actions (\`integration_id: 15368\`); any status writer could satisfy it (AD-16)`,
      ]);
    }
  }
  // Policy: main not enforced, a missing deletion, force-push or PR rule, a PR rule without Code Owner review.
  for (const enforcement of ["evaluate", "disabled"]) {
    expect(policyViolations({ ...clone(MAIN), enforcement }, {}, ["edanisko"])).toEqual([
      `policy: .github/rulesets/main.json enforcement is "${enforcement}", not "active" (AD-16)`,
    ]);
  }
  const unenforced: Record<string, unknown> = clone(MAIN);
  delete unenforced["enforcement"];
  expect(policyViolations(unenforced, {}, ["edanisko"])).toEqual(['policy: .github/rulesets/main.json enforcement is missing, not "active" (AD-16)']);
  for (const type of ["pull_request", "non_fast_forward", "deletion"]) {
    const dropped = clone(MAIN);
    dropped.rules = dropped.rules.filter((rule) => rule["type"] !== type);
    expect(policyViolations(dropped, {}, ["edanisko"])).toEqual([`policy: .github/rulesets/main.json has no \`${type}\` rule (AD-16)`]);
  }
  for (const value of [false, undefined, "true"]) {
    const noCodeOwners = clone(MAIN);
    const parameters = ruleOf(noCodeOwners, "pull_request")["parameters"] as Record<string, unknown>;
    if (value === undefined) {
      delete parameters["require_code_owner_review"];
    } else {
      parameters["require_code_owner_review"] = value;
    }
    expect(policyViolations(noCodeOwners, {}, ["edanisko"])).toEqual([
      "policy: .github/rulesets/main.json `pull_request` rule does not set `require_code_owner_review: true` (AD-16)",
    ]);
  }
  // Policy: main.json applies to the default branch and nothing else.
  expect(policyViolations({ ...clone(MAIN), target: "tag" }, {}, ["edanisko"])).toEqual(['policy: .github/rulesets/main.json target is "tag", not "branch" (AD-16)']);
  for (const include of [["refs/heads/main"], [], "~DEFAULT_BRANCH"]) {
    expect(policyViolations({ ...clone(MAIN), conditions: { ref_name: { include, exclude: [] } } }, {}, ["edanisko"])).toEqual([
      "policy: .github/rulesets/main.json does not include ~DEFAULT_BRANCH (AD-16)",
    ]);
  }
  for (const exclude of [["refs/heads/main"], "refs/heads/main", null]) {
    expect(policyViolations({ ...clone(MAIN), conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude } } }, {}, ["edanisko"])).toEqual([
      `policy: .github/rulesets/main.json excludes ${JSON.stringify(exclude)}, which leaves the default branch unguarded (AD-16)`,
    ]);
  }
  // Null admins (apply) skip only the org-admin check.
  expect(policyViolations(MAIN, {}, null)).toEqual([]);
  expect(policyViolations({ ...clone(MAIN), target: "tag" }, {}, null)).toHaveLength(1);
  // The committed main.json, as read from disk, still yields no policy lines.
  expect(policyViolations(committed("main.json"), {}, ["edanisko"])).toEqual([]);

  // Two committed files naming the same ruleset are refused, naming both.
  await withRulesets({ "a.json": PUSH, "b.json": { ...PUSH, target: "tag" } }, (dir) => {
    expect(() => readCommitted(dir)).toThrow('.github/rulesets/a.json and .github/rulesets/b.json both name the ruleset "Agent pushes"');
  });

  // verify against the fake API: match.
  const ok = await runRuleset(["verify"], { rulesets: liveSet(), admins: ["edanisko"] });
  expect(ok.stderr).toBe("");
  expect(ok.code).toBe(0);
  expect(ok.stdout).toContain("Rulesets OK: 3 committed ruleset(s)");

  // Drift: live lacks merge_queue.
  const drift = await runRuleset(["verify"], { rulesets: liveSet({ main: noQueue }), admins: ["edanisko"] });
  expect(drift.code).toBe(1);
  expect(drift.stderr).toContain("ruleset drift: .github/rulesets/main.json rules[merge_queue]: committed {");

  // Missing: no live "Agent pushes".
  const missing = await runRuleset(["verify"], { rulesets: liveSet({ push: null }), admins: ["edanisko"] });
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain('missing ruleset: .github/rulesets/agent-push.json "Agent pushes" has no live ruleset of that name (AD-16)');

  // Extra bypass: drift and policy.
  const bypass = await runRuleset(["verify"], { rulesets: liveSet({ main: team }), admins: ["edanisko"] });
  expect(bypass.code).toBe(1);
  expect(bypass.stderr).toContain("ruleset drift: .github/rulesets/main.json bypass_actors: committed ");
  expect(bypass.stderr).toContain('policy: live "Protect main" (25223480) has bypass actor {"actor_id":42,"actor_type":"Team","bypass_mode":"always"}');

  // Second admin.
  const admins = await runRuleset(["verify"], { rulesets: liveSet(), admins: ["edanisko", "eve"] });
  expect(admins.code).toBe(1);
  expect(admins.stderr).toContain("policy: the org's admins are [\"edanisko\",\"eve\"]");

  // API failures fail closed.
  for (const fail of ["/rulesets", "/rulesets/101", "/orgs/xaravel/members"]) {
    const broken = await runRuleset(["verify"], { rulesets: liveSet(), admins: ["edanisko"], fail: [fail] });
    expect(broken.code).toBe(1);
    expect(broken.stderr).toMatch(/^Ruleset check failed: GET .*HTTP 500.*\(AD-16\)\n$/);
  }
  const unauthorized = await runRuleset(["verify"], { rulesets: liveSet(), admins: ["edanisko"] }, "wrong-token");
  expect(unauthorized.code).toBe(1);
  expect(unauthorized.stderr).toContain("HTTP 401");

  // No token (empty or unset): verify and apply fail closed before any request.
  await withRulesets({ "main.json": MAIN, "agent-push.json": PUSH, "agent-tags.json": TAGS }, async (dir) => {
    for (const args of [["verify"], ["apply", "--root", dir]]) {
      for (const token of ["", null]) {
        const fake: FakeGitHub = { rulesets: liveSet(), admins: ["edanisko"] };
        const result = await runRuleset(args, fake, token);
        expect(result.code).toBe(1);
        expect(result.stderr).toBe(NO_TOKEN);
        expect(result.stdout).toBe("");
        expect(fake.requests ?? 0).toBe(0);
        expect(fake.writes ?? []).toEqual([]);
      }
    }
  });

  // apply: creates the committed ruleset missing live and replaces the others, matched by name.
  await withRulesets({ "main.json": MAIN, "agent-push.json": PUSH, "agent-tags.json": TAGS }, async (dir) => {
    const fake: FakeGitHub = { rulesets: liveSet({ tags: null }), admins: ["edanisko"] };
    const applied = await runRuleset(["apply", "--root", dir], fake);
    expect(applied.stderr).toBe("");
    expect(applied.code).toBe(0);
    const writes = fake.writes ?? [];
    expect(writes.filter((write) => write.method === "POST")).toEqual([{ method: "POST", path: "/rulesets", body: bodyOf(TAGS) }]);
    expect(writes.filter((write) => write.method === "PUT").sort((a, b) => byString(a.path, b.path))).toEqual([
      { method: "PUT", path: "/rulesets/101", body: bodyOf(PUSH) },
      { method: "PUT", path: "/rulesets/25223480", body: bodyOf(MAIN) },
    ]);
    expect(writes).toHaveLength(3);
    // After apply, verify passes against the same fake.
    expect(await runRuleset(["verify", "--root", dir], fake)).toMatchObject({ code: 0, stderr: "" });

    // Two live rulesets share a committed name: nothing is written.
    const ambiguous: FakeGitHub = { rulesets: { ...liveSet(), 103: liveOf(MAIN, 103) }, admins: ["edanisko"] };
    const refused = await runRuleset(["apply", "--root", dir], ambiguous);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('2 live rulesets are named "Protect main"');
    expect(ambiguous.writes ?? []).toEqual([]);

    // A failing write fails closed.
    const failing = await runRuleset(["apply", "--root", dir], { rulesets: liveSet(), admins: ["edanisko"], fail: ["/rulesets/101"] });
    expect(failing.code).toBe(1);
    expect(failing.stderr).toMatch(/^Ruleset check failed: PUT \/repos\/xaravel\/framework\/rulesets\/101: HTTP 500.*\(AD-16\)\n$/);
  });

  // apply: a committed main.json that breaks policy (an unpinned check) is refused before any write.
  const unpinnedMain = clone(MAIN);
  delete (checksOf(unpinnedMain).find((item) => item.context === "audit") as { integration_id?: number }).integration_id;
  await withRulesets({ "main.json": unpinnedMain, "agent-push.json": PUSH, "agent-tags.json": TAGS }, async (dir) => {
    const fake: FakeGitHub = { rulesets: liveSet(), admins: ["edanisko"] };
    const refused = await runRuleset(["apply", "--root", dir], fake);
    expect(refused.code).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toBe(
      "Ruleset violations (AD-16):\n  policy: .github/rulesets/main.json does not pin the `audit` check to GitHub Actions (`integration_id: 15368`); any status writer could satisfy it (AD-16)\n",
    );
    expect(fake.writes ?? []).toEqual([]);
  });

  // merge-group-pr.
  expect(prFromMergeGroupRef(`refs/heads/gh-readonly-queue/main/pr-12-${SHA}`)).toBe(12);
  expect(prFromMergeGroupRef(`refs/heads/gh-readonly-queue/release/v1/pr-7-${SHA}`)).toBe(7);
  for (const ref of [
    `refs/heads/gh-readonly-queue/main/pr-0-${SHA}`,
    `refs/heads/gh-readonly-queue/main/pr-12-${SHA.slice(1)}`,
    `refs/heads/gh-readonly-queue/main/pr-12-${SHA.toUpperCase()}`,
    `refs/heads/story/1.7`,
    `gh-readonly-queue/main/pr-12-${SHA}`,
    `refs/heads/gh-readonly-queue/main/pr-12-${SHA}\nx`,
  ]) {
    expect(prFromMergeGroupRef(ref)).toBeNull();
  }
  const printed = await run(RULESET_CLI, ["merge-group-pr", `refs/heads/gh-readonly-queue/main/pr-12-${SHA}`]);
  expect(printed).toEqual({ code: 0, stdout: "12\n", stderr: "" });
  const other = await run(RULESET_CLI, ["merge-group-pr", "refs/heads/main"]);
  expect(other.code).toBe(1);
  expect(other.stdout).toBe("");
  expect((await run(RULESET_CLI, ["merge-group-pr"])).code).toBe(2);
  expect((await run(RULESET_CLI, ["verify", "--repo", "bad"])).code).toBe(2);
  expect((await run(RULESET_CLI, ["nope"])).code).toBe(2);
});

/** A hermetic root holding the given workflow files. */
async function withWorkflows(files: Record<string, string>, body: (dir: string) => void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-workflows-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(join(dir, ".github", "workflows", name), text);
    }
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function workflow(top: string, jobs = "  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"): string {
  return `name: x\non: push\n${top}jobs:\n${jobs}`;
}

const READ = "permissions:\n  contents: read\n";

xaravelTest("XT-conformance-31", "every workflow's top-level permissions are contents: read, and write scopes appear only in the oracle, dashboard and release jobs (AD-16.3, AD-28)", async () => {
  expect([...ALLOWED_WRITE_JOBS]).toEqual(["oracle.yml#oracle", "dashboard.yml#dashboard", "release.yml#release"]);
  const check = (text: string) => checkWorkflow(".github/workflows/x.yml", text);

  expect(check(workflow(READ))).toEqual([]);
  // Top-level wrong: write-all, missing, extra scope, read-all, write.
  for (const top of ["permissions: write-all\n", "", "permissions:\n  contents: read\n  issues: read\n", "permissions: read-all\n", "permissions:\n  contents: write\n"]) {
    const violations = check(workflow(top));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/^workflow permissions: \.github\/workflows\/x\.yml top-level permissions must be exactly \{contents: read\}, got .* \(AD-16\)$/);
  }

  // A job write outside the allow-list.
  const job = (id: string, permissions: string) => `  ${id}:\n    runs-on: ubuntu-latest\n    permissions:${permissions}\n    steps:\n      - run: echo hi\n`;
  expect(check(workflow(READ, job("build", "\n      contents: write")))).toEqual([
    "workflow permissions: .github/workflows/x.yml job build holds contents: write; write scopes are allowed only in oracle.yml#oracle, dashboard.yml#dashboard, release.yml#release (AD-16)",
  ]);
  expect(check(workflow(READ, job("build", " write-all")))).toHaveLength(1);
  expect(check(workflow(READ, job("build", "\n      id-token: write\n      contents: read")))[0]).toContain("job build holds id-token: write");
  expect(check(workflow(READ, job("build", "\n      contents: read\n      pull-requests: read")))).toEqual([]);
  expect(check(workflow(READ, job("build", " read-all")))).toEqual([]);
  expect(check(workflow(READ, job("build", "\n      contents: admin")))[0]).toContain("job build has malformed permissions");
  // Allowed jobs may hold write scopes, each in its own workflow file.
  for (const key of ALLOWED_WRITE_JOBS) {
    const [name, id] = key.split("#") as [string, string];
    expect(checkWorkflow(`.github/workflows/${name}`, workflow(READ, job(id, "\n      id-token: write\n      contents: write")))).toEqual([]);
  }
  expect(checkWorkflow(".github/workflows/release.yml", workflow(READ, job("release", "\n      id-token: write")))).toEqual([]);
  // An allowed job id in another file, another job in an allowed file, and a .yaml twin are all rejected.
  expect(check(workflow(READ, job("release", "\n      contents: write")))).toEqual([
    "workflow permissions: .github/workflows/x.yml job release holds contents: write; write scopes are allowed only in oracle.yml#oracle, dashboard.yml#dashboard, release.yml#release (AD-16)",
  ]);
  for (const id of ["oracle", "dashboard"]) {
    expect(check(workflow(READ, job(id, " write-all")))).toEqual([
      `workflow permissions: .github/workflows/x.yml job ${id} holds write-all; write scopes are allowed only in oracle.yml#oracle, dashboard.yml#dashboard, release.yml#release (AD-16)`,
    ]);
  }
  expect(checkWorkflow(".github/workflows/release.yml", workflow(READ, job("gate", "\n      contents: write")))).toEqual([
    "workflow permissions: .github/workflows/release.yml job gate holds contents: write; write scopes are allowed only in oracle.yml#oracle, dashboard.yml#dashboard, release.yml#release (AD-16)",
  ]);
  expect(checkWorkflow(".github/workflows/release.yaml", workflow(READ, job("release", "\n      id-token: write")))).toEqual([
    "workflow permissions: .github/workflows/release.yaml job release holds id-token: write; write scopes are allowed only in oracle.yml#oracle, dashboard.yml#dashboard, release.yml#release (AD-16)",
  ]);
  // Read-only scopes pass in any file, under any job id.
  for (const file of ["x.yml", "release.yml", "release.yaml"]) {
    for (const id of ["build", "release", "oracle"]) {
      expect(checkWorkflow(`.github/workflows/${file}`, workflow(READ, job(id, "\n      contents: read\n      id-token: none")))).toEqual([]);
    }
  }
  expect(check("jobs: [unclosed\n")[0]).toContain("is not valid YAML");

  // Fixture roots, through the library and the CLI (.yml and .yaml).
  await withWorkflows(
    { "a.yml": workflow(READ), "c.yaml": workflow(READ, job("build", " read-all")), "release.yml": workflow(READ, job("release", "\n      id-token: write")) },
    (dir) => {
      expect(checkWorkflows(dir)).toEqual({ files: [".github/workflows/a.yml", ".github/workflows/c.yaml", ".github/workflows/release.yml"], violations: [] });
    },
  );
  // A job named release outside release.yml may not hold a write scope.
  await withWorkflows({ "a.yml": workflow(READ), "x.yml": workflow(READ, job("release", "\n      contents: write")) }, (dir) => {
    expect(checkWorkflows(dir).violations).toEqual([
      "workflow permissions: .github/workflows/x.yml job release holds contents: write; write scopes are allowed only in oracle.yml#oracle, dashboard.yml#dashboard, release.yml#release (AD-16)",
    ]);
  });
  await withWorkflows({ "a.yml": workflow(READ), "b.yaml": workflow("permissions: write-all\n") }, (dir) => {
    const result = checkWorkflows(dir);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toStartWith("workflow permissions: .github/workflows/b.yaml ");
  });
  const fixture = mkdtempSync(join(tmpdir(), "xaravel-workflows-"));
  try {
    mkdirSync(join(fixture, ".github", "workflows"), { recursive: true });
    writeFileSync(join(fixture, ".github", "workflows", "bad.yml"), workflow(READ, job("build", "\n      contents: write")));
    const bad = await run(WORKFLOWS_CLI, ["check", "--root", fixture]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("workflow permissions: .github/workflows/bad.yml job build holds contents: write");
    writeFileSync(join(fixture, ".github", "workflows", "bad.yml"), workflow(READ, job("release", "\n      contents: write")));
    const misplaced = await run(WORKFLOWS_CLI, ["check", "--root", fixture]);
    expect(misplaced.code).toBe(1);
    expect(misplaced.stderr).toContain(
      "workflow permissions: .github/workflows/bad.yml job release holds contents: write; write scopes are allowed only in oracle.yml#oracle, dashboard.yml#dashboard, release.yml#release (AD-16)",
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
  expect((await run(WORKFLOWS_CLI, ["check", "--bogus"])).code).toBe(2);
  // A root without .github/workflows (a mistyped --root) fails closed.
  const empty = mkdtempSync(join(tmpdir(), "xaravel-workflows-"));
  try {
    expect(checkWorkflows(empty)).toEqual({ files: [], violations: ["workflow permissions: .github/workflows does not exist (AD-16)"] });
    const missing = await run(WORKFLOWS_CLI, ["check", "--root", empty]);
    expect(missing.code).toBe(1);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("workflow permissions: .github/workflows does not exist (AD-16)");
    // So does a .github/workflows that holds no workflows.
    mkdirSync(join(empty, ".github", "workflows"), { recursive: true });
    writeFileSync(join(empty, ".github", "workflows", "README.md"), "not a workflow\n");
    expect(checkWorkflows(empty)).toEqual({ files: [], violations: ["workflow permissions: .github/workflows has no workflows (AD-16)"] });
    const none = await run(WORKFLOWS_CLI, ["check", "--root", empty]);
    expect(none.code).toBe(1);
    expect(none.stdout).toBe("");
    expect(none.stderr).toContain("workflow permissions: .github/workflows has no workflows (AD-16)");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }

  // The repository's own workflows pass.
  expect(checkWorkflows(root).violations).toEqual([]);
  const repo = await run(WORKFLOWS_CLI, ["check"]);
  expect(repo.code).toBe(0);
  expect(repo.stdout).toMatch(/^Workflow permissions OK: \d+ workflow\(s\) checked\.\n$/);
});

const OK_RULES: Record<string, ActiveRule[]> = {
  "planning/probe": [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
  "bot/probe": [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
  "release/probe": [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
  main: [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "pull_request" }, { type: "merge_queue" }],
  "story/probe": [],
};

xaravelTest("XT-conformance-32", "the agent push identity is limited to story/* by live rules, `bun run ruleset:identity` verifies it, and docs/ops/identities.md documents the setup (AD-16.3, AD-28)", async () => {
  const tags = liveOf(TAGS, 102);
  expect(identityViolations(OK_RULES, tags)).toEqual([]);
  expect(identityViolations(OK_RULES, tags, { login: "bot", roleName: "write", orgAdmin: false })).toEqual([]);
  expect(identityViolations(OK_RULES, tags, { login: "bot", roleName: "triage", orgAdmin: false })).toEqual([]);

  // story/probe restricted.
  expect(identityViolations({ ...OK_RULES, "story/probe": [{ type: "update" }] }, tags)).toEqual([
    "identity: story/probe has an active `update` rule; the agent must be able to push story/* (AD-16)",
  ]);
  // planning/probe open.
  expect(identityViolations({ ...OK_RULES, "planning/probe": [{ type: "update" }] }, tags)).toEqual([
    "identity: planning/probe has no active `creation` rule; only story/* may be open to the agent (AD-16)",
  ]);
  // main without PRs.
  expect(identityViolations({ ...OK_RULES, main: [{ type: "deletion" }] }, tags)).toEqual([
    "identity: main has no active `pull_request` rule; changes must arrive by PR (AD-16)",
  ]);
  // No tags ruleset, or an inactive one.
  expect(identityViolations(OK_RULES, null)).toEqual(['identity: there is no live "Agent tags" ruleset (AD-16)']);
  expect(identityViolations(OK_RULES, { ...tags, enforcement: "evaluate" })).toEqual(['identity: "Agent tags" enforcement is "evaluate", not "active" (AD-16)']);
  // A tags ruleset that excludes some tags leaves them open.
  expect(identityViolations(OK_RULES, { ...tags, conditions: { ref_name: { include: ["~ALL"], exclude: ["refs/tags/**"] } } })).toEqual([
    'identity: "Agent tags" excludes ["refs/tags/**"], which leaves those tags open to the agent (AD-16)',
  ]);
  // So does any other exclude that is not an empty array.
  for (const exclude of ["refs/tags/**", null, {}]) {
    expect(identityViolations(OK_RULES, { ...tags, conditions: { ref_name: { include: ["~ALL"], exclude } } })).toEqual([
      `identity: "Agent tags" excludes ${JSON.stringify(exclude)}, which leaves those tags open to the agent (AD-16)`,
    ]);
  }
  // Admin agent.
  expect(identityViolations(OK_RULES, tags, { login: "bot", roleName: "admin", orgAdmin: true })).toEqual([
    'identity: agent bot has repository role "admin"; it must be write or triage (AD-16)',
    "identity: agent bot is an org admin, so it bypasses every ruleset (AD-16)",
  ]);

  // identity against the fake API.
  const ok = await runRuleset(["identity", "--agent", "bot"], { rulesets: liveSet(), admins: ["edanisko"], branchRules: OK_RULES, roles: { bot: "write" } });
  expect(ok.stderr).toBe("");
  expect(ok.code).toBe(0);
  const story = await runRuleset(["identity"], { rulesets: liveSet(), branchRules: { ...OK_RULES, "story/probe": [{ type: "update" }] } });
  expect(story.code).toBe(1);
  expect(story.stderr).toContain("identity: story/probe has an active `update` rule");
  const planning = await runRuleset(["identity"], { rulesets: liveSet(), branchRules: { ...OK_RULES, "planning/probe": [{ type: "update" }] } });
  expect(planning.code).toBe(1);
  expect(planning.stderr).toContain("identity: planning/probe has no active `creation` rule");
  const admin = await runRuleset(["identity", "--agent", "bot"], { rulesets: liveSet(), admins: ["edanisko", "bot"], branchRules: OK_RULES, roles: { bot: "admin" } });
  expect(admin.code).toBe(1);
  expect(admin.stderr).toContain('identity: agent bot has repository role "admin"');
  expect(admin.stderr).toContain("identity: agent bot is an org admin");
  const noTags = await runRuleset(["identity"], { rulesets: liveSet({ tags: null }), branchRules: OK_RULES });
  expect(noTags.code).toBe(1);
  expect(noTags.stderr).toContain('identity: there is no live "Agent tags" ruleset');
  const broken = await runRuleset(["identity"], { rulesets: liveSet(), branchRules: OK_RULES, fail: ["/rules/branches/main"] });
  expect(broken.code).toBe(1);
  expect(broken.stderr).toContain("HTTP 500");
  // No token (empty or unset): identity fails closed before any request.
  for (const token of ["", null]) {
    const fake: FakeGitHub = { rulesets: liveSet(), admins: ["edanisko"], branchRules: OK_RULES };
    const result = await runRuleset(["identity"], fake, token);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(NO_TOKEN);
    expect(result.stdout).toBe("");
    expect(fake.requests ?? 0).toBe(0);
    expect(fake.writes ?? []).toEqual([]);
  }

  // The agent-push ruleset excludes exactly story/**, main and the merge queue's branches; tags are closed too.
  expect(PUSH["name"]).toBe("Agent pushes");
  expect(PUSH["target"]).toBe("branch");
  // Disabled through Phase 0 by the Maintainer's Epic 1 ruling (decisions/MAINT-2026-10-17-epic-1-items.md, items 9 and 12): no
  // non-admin identity pushes yet, and its gh-readonly-queue/** exclusion blocked the merge queue. Re-enabled at the Epic 8 checkpoint.
  expect(PUSH["enforcement"]).toBe("disabled");
  const pushConditions = (PUSH["conditions"] as { ref_name: { include: string[]; exclude: string[] } }).ref_name;
  expect(pushConditions.include).toEqual(["~ALL"]);
  expect([...pushConditions.exclude].sort(byString)).toEqual(["refs/heads/gh-readonly-queue/**", "refs/heads/main", "refs/heads/story/**"]);
  expect(PUSH.rules.map((rule) => rule["type"]).sort(byString)).toEqual(["creation", "deletion", "update"]);
  expect(TAGS["name"]).toBe("Agent tags");
  expect(TAGS["target"]).toBe("tag");
  expect((TAGS["conditions"] as { ref_name: { include: string[] } }).ref_name.include).toEqual(["~ALL"]);
  expect(TAGS.rules.map((rule) => rule["type"]).sort(byString)).toEqual(["creation", "deletion", "update"]);

  // The setup is documented, naming the check and the apply command.
  const doc = readFileSync(join(root, "docs", "ops", "identities.md"), "utf8");
  expect(doc).toContain("bun run ruleset:identity --agent <login>");
  expect(doc).toContain("bun run ruleset:apply");
  expect(doc).toMatch(/\bwrite\b/);
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["ruleset:identity"]).toBe("bun tools/ruleset/ruleset.ts identity");
  expect(scripts["ruleset:verify"]).toBe("bun tools/ruleset/ruleset.ts verify");
  expect(scripts["ruleset:apply"]).toBe("bun tools/ruleset/ruleset.ts apply");
  expect(scripts["workflows:check"]).toBe("bun tools/workflow-permissions/workflow-permissions.ts check");
});

/**
 * The `php-fixtures` step that prepares the Oracle's PHP image: git, a checksum-verified Composer and, on the line
 * ending `PCNTL_INSTALL` (the image's own extension installer), pcntl plus the gmp and ftp extensions the locked
 * framework install requires (ESC-9.3-1).
 */
const PCNTL_INSTALL = "-php-ext-install gmp ftp pcntl";
const PHP_FIXTURES_SETUP = [
  "set -euo pipefail",
  "apt-get update",
  "apt-get install -y --no-install-recommends git unzip libgmp-dev $PHPIZE_DEPS",
  "curl -fsSLo /usr/local/bin/composer https://getcomposer.org/download/2.10.3/composer.phar",
  'echo "7a2d379d5b8ffdaa028580ef26494c36d2feef4b178d3dd1473a4dbc5e17c8d6  /usr/local/bin/composer" | sha256sum -c -',
  "chmod +x /usr/local/bin/composer",
  'git config --global --add safe.directory "$GITHUB_WORKSPACE"',
  "",
].join("\n");

/** The `php-fixtures` step that builds the locked framework install the real-PHP Oracle tests need (docs/ops/inventory.md). */
/** The awk program the install step uses to read the framework version from conformance/baseline-pin. */
const PIN_VERSION_AWK = `$1 == "laravel/framework" { sub(/^v/, "", $2); print $2 }`;
const FRAMEWORK_INSTALL = [
  "set -euo pipefail",
  `version="$(awk '${PIN_VERSION_AWK}' conformance/baseline-pin)"`,
  'test -n "$version"',
  "rm -rf /tmp/xaravel-inv/framework",
  "mkdir -p /tmp/xaravel-inv",
  "cp -R conformance/upstream/framework /tmp/xaravel-inv/framework",
  "chmod -R u+w /tmp/xaravel-inv/framework",
  "cp conformance/oracle/locks/framework/composer.lock /tmp/xaravel-inv/framework/composer.lock",
  'COMPOSER_ROOT_VERSION="$version" composer install --no-interaction --no-progress --no-plugins --no-scripts --prefer-dist --working-dir=/tmp/xaravel-inv/framework',
  "",
].join("\n");

xaravelTest("XT-conformance-33", "on any PR the required `audit` check runs `bun audit` and fails on high or critical advisories (AD-16.3, AD-28.5, NFR-5)", () => {
  const text = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  const ci = Bun.YAML.parse(text) as {
    on: Record<string, unknown>;
    permissions: unknown;
    jobs: Record<string, Record<string, unknown> & { permissions?: unknown; steps: (Record<string, unknown> & { uses?: string; with?: Record<string, unknown>; run?: string })[] }>;
  };
  expect(Object.keys(ci.on).sort(byString)).toEqual(["merge_group", "pull_request", "push"]);
  expect(ci.on["pull_request"]).toEqual({ branches: ["main"] });
  expect(ci.on["merge_group"]).toEqual({ types: ["checks_requested"] });
  expect(ci.on["push"]).toEqual({ branches: ["main"] });
  expect(ci.permissions).toEqual({ contents: "read" });
  expect(Object.keys(ci.jobs).sort(byString)).toEqual(["audit", "check", "fixtures", "php-fixtures", "upstream", "workflow-permissions"]);

  const audit = ci.jobs["audit"]!;
  expect(audit.permissions).toBeUndefined();
  // Nothing lets the audit pass without running or past a failure.
  for (const node of [audit, ...audit.steps]) {
    expect(node["continue-on-error"]).toBeUndefined();
    expect(node["if"]).toBeUndefined();
  }
  const runs = audit.steps.map((step) => step.run).filter((run): run is string => run !== undefined);
  expect(runs).toEqual(["bun install --frozen-lockfile --ignore-scripts", "bun audit --audit-level=high"]);
  expect(audit.steps[0]).toEqual({ uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", with: { "persist-credentials": false } });
  expect(audit.steps[1]).toEqual({ uses: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6", with: { "bun-version-file": ".bun-version" } });
  const permissionsJob = ci.jobs["workflow-permissions"]!;
  expect(permissionsJob.steps.map((step) => step.run).filter(Boolean)).toEqual(["bun tools/workflow-permissions/workflow-permissions.ts check"]);

  // `check` runs every repository gate on the frozen lockfile (Epic 1 retro R1), with nothing to skip a gate or pass past a failure.
  const check = ci.jobs["check"]!;
  expect(check.permissions).toBeUndefined();
  for (const node of [check, ...check.steps]) {
    expect(node["continue-on-error"]).toBeUndefined();
    expect(node["if"]).toBeUndefined();
  }
  // Story 5.6 AC5 (Epic 3 retro R5): the test run verifies the committed per-Story Oracle requests in merge order, which needs full history.
  expect(check.steps[0]).toEqual({ ...audit.steps[0]!, with: { "persist-credentials": false, "fetch-depth": 0 } });
  expect(check.steps[1]).toEqual(audit.steps[1]!);
  expect(check.steps.map((step) => step.run).filter((run): run is string => run !== undefined)).toEqual([
    "bun install --frozen-lockfile --ignore-scripts",
    // ESC-10.2-8: the Xaravel Tests whose expectations come from the Upstream snapshot run against it, not skip.
    "bun run upstream:sync",
    // MAINT-2026-10-24-epic-10-items item 7: the synced snapshot is verified against the pin, with no network.
    "bun run upstream:check",
    // Story 5.9: every Xaravel Test under the harness; UNDECLARED, LATE and FAIL results gate the merge (FR-115, AD-15).
    // It is the job's only test run: every test file is one the harness runs (XT-conformance-119), so a plain
    // `bun run test` would run them all a second time.
    "bun run harness --xaravel",
    // Story 5.1: the Expectations File check (FR-3, AD-15, XT-conformance-91).
    "bun run expectations:check",
    // Story 5.2: the Skip Reason rule checks (FR-3, SM-C1, XT-conformance-92..99).
    "bun run expectations:reasons",
    // Story 8.1: the Divergence Record and `adapted` marker check (FR-8, AD-15, XT-conformance-152).
    "bun run divergence:check",
    // Story 8.2: the PORTING.md gate (FR-8, AD-26, XT-conformance-153, XT-conformance-154).
    "bun run porting:check",
    // Story 8.3: the Bun primitive probes against the job's four services (OQ-11, XT-conformance-155).
    "bun run probes:check --require-backends",
    "bun run typecheck",
    // Story 6.4: the async-surface drift check (AD-6, AD-28, XT-conformance-136).
    "bun run async-surface --all --check",
    "bun run lint",
    "bun run scaffold:check",
    // Story 6.6: the duplicate-FQCN and registration scan (AD-10, AD-22, XT-conformance-142).
    "bun run registration:check",
    "bun run graph:check",
    // Story 4.4: the grader's assertion coverage report (FR-116, ESC-4.4-1, ESC-4.4-2 item 4).
    "bun run assert:coverage",
    // Story 4.6: the grader's Mockery API coverage report (FR-100, ESC-4.6-1 item 7).
    "bun run mockery:coverage",
  ]);
  expect(check.steps.filter((step) => step.uses !== undefined).length).toBe(2);
  // ESC-10.2-8: a missing snapshot fails the snapshot-reading tests instead of skipping them.
  expect(check.steps.find((step) => step.run === "bun run harness --xaravel")!["env"]).toEqual({ XARAVEL_UPSTREAM: "require" });
  expect(check["timeout-minutes"]).toBe(30);
  // `fixtures` verifies every committed Oracle fixture, with no install, nothing to skip it and nothing past a failure (Epic 3 retro S2).
  const fixtures = ci.jobs["fixtures"]!;
  expect(fixtures.permissions).toBeUndefined();
  for (const node of [fixtures, ...fixtures.steps]) {
    expect(node["continue-on-error"]).toBeUndefined();
    expect(node["if"]).toBeUndefined();
  }
  // Story 5.6 AC5 (Epic 3 retro R5): oracle:verify-fixtures reads the per-Story request files in merge order, which needs full history.
  expect(fixtures.steps[0]).toEqual({ ...audit.steps[0]!, with: { "persist-credentials": false, "fetch-depth": 0 } });
  expect(fixtures.steps[1]).toEqual(audit.steps[1]!);
  expect(fixtures.steps.map((step) => step.run).filter((run): run is string => run !== undefined)).toEqual(["bun run oracle:verify-fixtures"]);
  expect(fixtures.steps.length).toBe(3);
  expect(fixtures["timeout-minutes"]).toBe(10);
  // The gates run through package.json scripts, so pin what each script runs.
  const checkScripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(checkScripts["test"]).toBe("bun test");
  expect(checkScripts["typecheck"]).toBe("bun --bun tsc -b");
  expect(checkScripts["lint"]).toBe("bun --bun oxlint --type-aware && bun run lint:disables");
  expect(checkScripts["scaffold:check"]).toBe("bun tools/scaffold/scaffold.ts --check");
  expect(checkScripts["graph:check"]).toBe("bun tools/graph/graph.ts");
  expect(checkScripts["oracle:verify-fixtures"]).toBe("bun tools/oracle/verify.ts");

  // `php-fixtures` runs the PHP scripts for real against the fixtures, with a missing PHP or vendor/ failing (Epic 2 retro R5).
  const phpFixtures = ci.jobs["php-fixtures"]!;
  expect(phpFixtures.permissions).toEqual({ contents: "read" });
  expect(phpFixtures["timeout-minutes"]).toBe(20);
  for (const node of [phpFixtures, ...phpFixtures.steps]) {
    expect(node["continue-on-error"]).toBeUndefined();
    expect(node["if"]).toBeUndefined();
  }
  // It runs in the Oracle image's own PHP base image, pinned by digest, so its PHP is exactly PHP_VERSION and the two
  // pins move together; a newer 8.5 patch on the runner cannot reach it (ESC-9.3-1).
  const oracleBase = /^FROM (php:\S+)/m.exec(readFileSync(join(root, "conformance", "oracle", "Dockerfile"), "utf8"))?.[1];
  expect(oracleBase).toStartWith(`php:${PHP_VERSION}-`);
  expect(oracleBase).toContain("@sha256:");
  expect(phpFixtures["container"]).toEqual({ image: oracleBase });
  expect(phpFixtures["env"]).toEqual({ COMPOSER_ALLOW_SUPERUSER: "1" });
  // Its first step installs git (for the full-history checkout), pcntl, gmp, ftp and a checksum-verified Composer.
  const setup = phpFixtures.steps[0]!.run!;
  expect(setup.split("\n").filter((line) => line.endsWith(PCNTL_INSTALL)).length).toBe(1);
  expect(setup.split("\n").filter((line) => !line.endsWith(PCNTL_INSTALL)).join("\n")).toBe(PHP_FIXTURES_SETUP);
  // Its oracle-story tests verify the real repository, whose per-Story requests are read in merge order (Story 5.6 AC5).
  expect(phpFixtures.steps[1]).toEqual({ ...audit.steps[0]!, with: { "persist-credentials": false, "fetch-depth": 0 } });
  expect(phpFixtures.steps[2]).toEqual(audit.steps[1]!);
  expect(phpFixtures.steps.filter((step) => step.uses !== undefined).length).toBe(2);
  expect(phpFixtures.steps.map((step) => step.run).filter((run): run is string => run !== undefined)).toEqual([
    setup,
    "bun install --frozen-lockfile --ignore-scripts",
    "bun run php-fixtures:install",
    "bun run upstream:sync",
    FRAMEWORK_INSTALL,
    // Story 5.7: plus the real-PHP block of oracle-recheck.test.ts (XT-conformance-188).
    "XARAVEL_PHP_FIXTURES=require bun test conformance/tests/xaravel/php-scripts.test.ts conformance/tests/xaravel/api-surface.test.ts conformance/tests/xaravel/oracle-fixtures.test.ts conformance/tests/xaravel/oracle-story.test.ts conformance/tests/xaravel/oracle-extract.test.ts conformance/tests/xaravel/oracle-recheck.test.ts",
  ]);
  // The real-PHP Oracle blocks run against the locked framework install docs/ops/inventory.md documents, at the version
  // conformance/baseline-pin names, never a version written into the workflow (Epic 3 retro item 3).
  const pinnedFramework = readFileSync(join(root, "conformance", "baseline-pin"), "utf8").split("\n").find((line) => line.startsWith("laravel/framework "));
  expect(pinnedFramework).toBeDefined();
  const pinnedVersion = pinnedFramework!.split(/\s+/)[1]!.replace(/^v/, "");
  expect(FRAMEWORK_INSTALL).not.toContain(pinnedVersion);
  const awk = Bun.spawnSync(["awk", PIN_VERSION_AWK, "conformance/baseline-pin"], { cwd: root, stdout: "pipe" });
  expect(awk.exitCode).toBe(0);
  expect(awk.stdout.toString().trim()).toBe(pinnedVersion);
  expect(checkScripts["php-fixtures:install"]).toBe(
    "composer install --no-interaction --no-progress --no-plugins --no-scripts --working-dir=conformance/tests/xaravel/php-fixtures/phpunit && composer install --no-interaction --no-progress --no-plugins --no-scripts --working-dir=conformance/tests/xaravel/php-fixtures/pest",
  );
  expect(text).not.toContain("pull_request_target");
  expect(text).not.toMatch(/id-token|secrets\./);

  // `audit` is a required check on main.
  expect(checksOf(MAIN).map((check) => check.context)).toContain("audit");
  expect(REQUIRED_CHECKS).toContain("audit");
  expect(policyViolations(
    (() => {
      const copy = clone(MAIN);
      (ruleOf(copy, "required_status_checks")["parameters"] as Record<string, unknown>)["required_status_checks"] = checksOf(MAIN).filter((check) => check.context !== "audit");
      return copy;
    })(),
    {},
    ["edanisko"],
  )).toEqual(["policy: .github/rulesets/main.json does not require the `audit` check (AD-16)"]);
});
