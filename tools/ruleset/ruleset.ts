// Repository rulesets and the agent push identity (Story 1.7, AD-16, AD-28).
//
//   bun tools/ruleset/ruleset.ts verify [--repo <owner/name>] [--root <dir>]
//       compares every committed `.github/rulesets/*.json` with the live
//       ruleset of the same `name`, then checks the policy invariants
//
//   bun tools/ruleset/ruleset.ts apply [--repo <owner/name>] [--root <dir>]
//       creates (POST) or updates (PUT) each committed ruleset, matched by
//       name. It checks main.json's policy and matches every name first, so a
//       policy violation or an ambiguous name writes nothing. Only the
//       Maintainer or the orchestrator runs it, from an admin token; CI never
//       does
//
//   bun tools/ruleset/ruleset.ts identity [--repo <owner/name>] [--agent <login>]
//       reads the rules active on probe refs and checks that only `story/*`
//       is open to a non-admin identity; with `--agent`, also checks that
//       login's repository role
//
//   bun tools/ruleset/ruleset.ts merge-group-pr <ref>
//       prints <n> for `refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha>`,
//       exits 1 for any other ref
//
// API base `GITHUB_API_URL` (default https://api.github.com). `verify`, `apply`
// and `identity` require the token `GH_TOKEN`; unset or empty, they exit 1
// before sending any request.
// `--repo` defaults to `GITHUB_REPOSITORY`, then `xaravel/framework`.
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
// Every violation kind, one line each, on stderr:
//
//   ruleset drift:    a committed and a live ruleset differ at a JSON path
//   missing ruleset:  a committed ruleset has no live ruleset of that name
//   policy:           an invariant of main.json, a bypass actor other than
//                     OrganizationAdmin, or an org admin other than the
//                     Maintainer
//   identity:         a probe ref's active rules, the `Agent tags` ruleset or
//                     the agent login's role let the agent push outside story/*
//
// Normalisation: only name, target, enforcement, conditions, rules and
// bypass_actors are compared. Rules sort by `type`, required checks by
// `context`, ref patterns sort, and an OrganizationAdmin `actor_id` becomes
// null. Object keys compare order-free.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MAINTAINER } from "../protected-paths/protected-paths";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export const RULESETS_DIR = ".github/rulesets";
export const MAIN_FILE = "main.json";
export const TAGS_RULESET = "Agent tags";
export const COMPARED_FIELDS = ["name", "target", "enforcement", "conditions", "rules", "bypass_actors"] as const;
/** The checks main.json must require (AD-16, NFR-5). */
export const REQUIRED_CHECKS = ["protected-paths", "ownership", "audit"] as const;
/** The GitHub Actions app: each required check is pinned to it, so no other status writer can satisfy it. */
export const ACTIONS_INTEGRATION_ID = 15368;
/** Rules main.json must hold besides the required checks (AD-16). */
export const MAIN_RULES = ["deletion", "non_fast_forward", "pull_request", "required_linear_history", "merge_queue"] as const;
export const ALLOWED_BYPASS = "OrganizationAdmin";
/** Probe refs the agent must be able to push without restriction. */
export const STORY_PROBE = "story/probe";
/** Probe refs closed to the agent: `creation` and `update` must apply. */
export const CLOSED_PROBES = ["planning/probe", "bot/probe", "release/probe"] as const;
export const MAIN_REF = "main";
export const AGENT_ROLES = ["write", "triage"] as const;

const MERGE_GROUP_REF = /^refs\/heads\/gh-readonly-queue\/(.+)\/pr-([1-9]\d*)-([0-9a-f]{40})$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Deep copy with object keys sorted, so equal values serialise equally. */
function canonical(value: unknown): Json {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (isObject(value)) {
    const out: JsonObject = {};
    for (const key of Object.keys(value).sort(compare)) {
      out[key] = canonical(value[key]);
    }
    return out;
  }
  if (value === undefined) {
    return null;
  }
  return value as Json;
}

function sortStrings(value: Json): Json {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...(value as string[])].sort(compare) : value;
}

/** Sorts every array of strings in a `conditions` block (ref patterns and the like). */
function normalizeConditions(value: Json): Json {
  if (Array.isArray(value)) {
    return sortStrings(value.map(normalizeConditions));
  }
  if (isObject(value)) {
    const out: JsonObject = {};
    for (const key of Object.keys(value)) {
      out[key] = normalizeConditions(value[key]!);
    }
    return out;
  }
  return value;
}

function normalizeRule(rule: Json): Json {
  if (!isObject(rule) || !isObject(rule["parameters"])) {
    return rule;
  }
  const parameters = rule["parameters"];
  const checks = parameters["required_status_checks"];
  if (Array.isArray(checks)) {
    return {
      ...rule,
      parameters: {
        ...parameters,
        required_status_checks: [...checks].sort((a, b) => compare(isObject(a) ? stringOf(a["context"]) : "", isObject(b) ? stringOf(b["context"]) : "")),
      },
    };
  }
  return rule;
}

function actorKey(actor: Json): string {
  return isObject(actor) ? `${stringOf(actor["actor_type"])}:${JSON.stringify(actor["actor_id"] ?? null)}` : JSON.stringify(actor);
}

/** The compared fields of a ruleset, normalised (see the header). Absent fields stay absent. */
export function normalize(ruleset: unknown): JsonObject {
  const source = isObject(ruleset) ? (canonical(ruleset) as JsonObject) : {};
  const out: JsonObject = {};
  for (const field of COMPARED_FIELDS) {
    if (!(field in source)) {
      continue;
    }
    let value: Json = source[field]!;
    if (field === "conditions") {
      value = normalizeConditions(value);
    } else if (field === "rules" && Array.isArray(value)) {
      value = value.map(normalizeRule).sort((a, b) => compare(isObject(a) ? stringOf(a["type"]) : "", isObject(b) ? stringOf(b["type"]) : ""));
    } else if (field === "bypass_actors" && Array.isArray(value)) {
      value = value
        .map((actor) => (isObject(actor) && actor["actor_type"] === ALLOWED_BYPASS ? { ...actor, actor_id: null } : actor))
        .sort((a, b) => compare(actorKey(a), actorKey(b)));
    }
    out[field] = value;
  }
  return out;
}

function show(value: Json | undefined): string {
  return value === undefined ? "missing" : JSON.stringify(value);
}

function equal(a: Json | undefined, b: Json | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The key that identifies an array item for a keyed diff, or null when the array is compared whole. */
function keyField(path: string): string | null {
  if (path === "rules") {
    return "type";
  }
  if (path.endsWith(".required_status_checks")) {
    return "context";
  }
  return null;
}

function keyed(items: Json[], field: string): Map<string, Json> | null {
  const map = new Map<string, Json>();
  for (const item of items) {
    const key = isObject(item) ? item[field] : undefined;
    if (typeof key !== "string" || map.has(key)) {
      return null;
    }
    map.set(key, item);
  }
  return map;
}

function walk(path: string, a: Json | undefined, b: Json | undefined, out: string[], file: string): void {
  if (equal(a, b)) {
    return;
  }
  const join = (key: string): string => (path === "" ? key : `${path}.${key}`);
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compare);
    for (const key of keys) {
      walk(join(key), a[key], b[key], out, file);
    }
    return;
  }
  const field = keyField(path);
  if (field !== null && Array.isArray(a) && Array.isArray(b)) {
    const left = keyed(a, field);
    const right = keyed(b, field);
    if (left !== null && right !== null) {
      const keys = [...new Set([...left.keys(), ...right.keys()])].sort(compare);
      for (const key of keys) {
        walk(`${path}[${key}]`, left.get(key), right.get(key), out, file);
      }
      return;
    }
  }
  out.push(`ruleset drift: ${file} ${path === "" ? "$" : path}: committed ${show(a)}, live ${show(b)} (AD-16)`);
}

/** One `ruleset drift:` line per difference between the normalised committed and live rulesets. */
export function diffRulesets(file: string, committed: unknown, live: unknown): string[] {
  const out: string[] = [];
  walk("", normalize(committed), normalize(live), out, file);
  return out;
}

function rulesOf(ruleset: JsonObject): JsonObject[] {
  const rules = ruleset["rules"];
  return Array.isArray(rules) ? rules.filter(isObject) : [];
}

/**
 * The `policy:` lines for the committed main ruleset, every ruleset's bypass
 * actors (keyed by a label such as `agent-push.json` or `live "Agent pushes"`),
 * and the org's admin logins; null admins skip the org-admin check (`apply`).
 */
export function policyViolations(main: unknown, rulesets: Readonly<Record<string, unknown>>, admins: readonly string[] | null): string[] {
  const out: string[] = [];
  const normalizedMain = normalize(main);
  if (normalizedMain["enforcement"] !== "active") {
    out.push(`policy: ${RULESETS_DIR}/${MAIN_FILE} enforcement is ${show(normalizedMain["enforcement"])}, not "active" (AD-16)`);
  }
  if (normalizedMain["target"] !== "branch") {
    out.push(`policy: ${RULESETS_DIR}/${MAIN_FILE} target is ${show(normalizedMain["target"])}, not "branch" (AD-16)`);
  }
  const conditions = normalizedMain["conditions"];
  const refName = isObject(conditions) && isObject(conditions["ref_name"]) ? conditions["ref_name"] : {};
  if (!(Array.isArray(refName["include"]) && refName["include"].includes("~DEFAULT_BRANCH"))) {
    out.push(`policy: ${RULESETS_DIR}/${MAIN_FILE} does not include ~DEFAULT_BRANCH (AD-16)`);
  }
  const exclude = refName["exclude"];
  if (exclude !== undefined && !(Array.isArray(exclude) && exclude.length === 0)) {
    out.push(`policy: ${RULESETS_DIR}/${MAIN_FILE} excludes ${JSON.stringify(exclude)}, which leaves the default branch unguarded (AD-16)`);
  }
  const mainRules = rulesOf(normalizedMain);
  const statusChecks = mainRules.find((rule) => rule["type"] === "required_status_checks");
  const parameters = statusChecks !== undefined && isObject(statusChecks["parameters"]) ? statusChecks["parameters"] : {};
  const checks = (Array.isArray(parameters["required_status_checks"]) ? parameters["required_status_checks"] : []).filter(isObject);
  const contexts = new Set(checks.map((check) => check["context"]));
  for (const check of REQUIRED_CHECKS) {
    if (!contexts.has(check)) {
      out.push(`policy: ${RULESETS_DIR}/${MAIN_FILE} does not require the \`${check}\` check (AD-16)`);
    } else if (checks.some((item) => item["context"] === check && item["integration_id"] !== ACTIONS_INTEGRATION_ID)) {
      out.push(
        `policy: ${RULESETS_DIR}/${MAIN_FILE} does not pin the \`${check}\` check to GitHub Actions (\`integration_id: ${ACTIONS_INTEGRATION_ID}\`); any status writer could satisfy it (AD-16)`,
      );
    }
  }
  for (const type of MAIN_RULES) {
    if (!mainRules.some((rule) => rule["type"] === type)) {
      out.push(`policy: ${RULESETS_DIR}/${MAIN_FILE} has no \`${type}\` rule (AD-16)`);
    }
  }
  const pullRequest = mainRules.find((rule) => rule["type"] === "pull_request");
  if (pullRequest !== undefined && !(isObject(pullRequest["parameters"]) && pullRequest["parameters"]["require_code_owner_review"] === true)) {
    out.push(`policy: ${RULESETS_DIR}/${MAIN_FILE} \`pull_request\` rule does not set \`require_code_owner_review: true\` (AD-16)`);
  }
  for (const label of Object.keys(rulesets).sort(compare)) {
    const ruleset = rulesets[label];
    const actors = isObject(ruleset) && Array.isArray(ruleset["bypass_actors"]) ? ruleset["bypass_actors"] : [];
    for (const actor of actors) {
      const type = isObject(actor) ? actor["actor_type"] : undefined;
      if (type !== ALLOWED_BYPASS) {
        out.push(`policy: ${label} has bypass actor ${JSON.stringify(canonical(actor))}; only ${ALLOWED_BYPASS} may bypass (AD-16)`);
      }
    }
  }
  if (admins !== null) {
    const maintainer = MAINTAINER.replace(/^@/, "").toLowerCase();
    const logins = [...new Set(admins.map((login) => login.toLowerCase()))].sort(compare);
    if (logins.length !== 1 || logins[0] !== maintainer) {
      out.push(`policy: the org's admins are ${JSON.stringify(logins)}; they must be exactly ["${maintainer}"] (the Maintainer) (AD-16)`);
    }
  }
  return out;
}

export interface AgentRole {
  login: string;
  /** The login's repository `role_name`. */
  roleName: string;
  orgAdmin: boolean;
}

export interface ActiveRule {
  type: string;
}

/**
 * The `identity:` lines for the rules active on each probe ref (from
 * `GET /rules/branches/<ref>`), the live `Agent tags` ruleset (null when
 * absent) and, optionally, the agent login's role.
 */
export function identityViolations(
  rulesByRef: Readonly<Record<string, readonly ActiveRule[]>>,
  tagsRuleset: unknown,
  agent: AgentRole | null = null,
): string[] {
  const out: string[] = [];
  const types = (ref: string): Set<string> | null => {
    const rules = rulesByRef[ref];
    if (rules === undefined) {
      out.push(`identity: no active rules were read for ${ref} (AD-16)`);
      return null;
    }
    return new Set(rules.map((rule) => rule.type));
  };
  for (const ref of CLOSED_PROBES) {
    const active = types(ref);
    for (const type of ["creation", "update"]) {
      if (active !== null && !active.has(type)) {
        out.push(`identity: ${ref} has no active \`${type}\` rule; only story/* may be open to the agent (AD-16)`);
      }
    }
  }
  const main = types(MAIN_REF);
  if (main !== null && !main.has("pull_request")) {
    out.push(`identity: ${MAIN_REF} has no active \`pull_request\` rule; changes must arrive by PR (AD-16)`);
  }
  const story = types(STORY_PROBE);
  for (const type of ["creation", "update", "pull_request"]) {
    if (story !== null && story.has(type)) {
      out.push(`identity: ${STORY_PROBE} has an active \`${type}\` rule; the agent must be able to push story/* (AD-16)`);
    }
  }
  if (!isObject(tagsRuleset)) {
    out.push(`identity: there is no live "${TAGS_RULESET}" ruleset (AD-16)`);
  } else {
    const tags = normalize(tagsRuleset);
    if (tags["enforcement"] !== "active") {
      out.push(`identity: "${TAGS_RULESET}" enforcement is ${show(tags["enforcement"])}, not "active" (AD-16)`);
    }
    if (tags["target"] !== "tag") {
      out.push(`identity: "${TAGS_RULESET}" target is ${show(tags["target"])}, not "tag" (AD-16)`);
    }
    const conditions = isObject(tags["conditions"]) && isObject(tags["conditions"]["ref_name"]) ? tags["conditions"]["ref_name"] : {};
    const include = Array.isArray(conditions["include"]) ? conditions["include"] : [];
    if (!include.includes("~ALL")) {
      out.push(`identity: "${TAGS_RULESET}" does not include ~ALL (AD-16)`);
    }
    const exclude = conditions["exclude"];
    if (exclude !== undefined && !(Array.isArray(exclude) && exclude.length === 0)) {
      out.push(`identity: "${TAGS_RULESET}" excludes ${JSON.stringify(exclude)}, which leaves those tags open to the agent (AD-16)`);
    }
    const ruleTypes = new Set(rulesOf(tags).map((rule) => rule["type"]));
    for (const type of ["creation", "update", "deletion"]) {
      if (!ruleTypes.has(type)) {
        out.push(`identity: "${TAGS_RULESET}" has no \`${type}\` rule (AD-16)`);
      }
    }
  }
  if (agent !== null) {
    if (!(AGENT_ROLES as readonly string[]).includes(agent.roleName)) {
      out.push(`identity: agent ${agent.login} has repository role ${JSON.stringify(agent.roleName)}; it must be ${AGENT_ROLES.join(" or ")} (AD-16)`);
    }
    if (agent.orgAdmin) {
      out.push(`identity: agent ${agent.login} is an org admin, so it bypasses every ruleset (AD-16)`);
    }
  }
  return out;
}

/** The PR number in a merge queue ref `refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha>`, or null. */
export function prFromMergeGroupRef(ref: string): number | null {
  const match = MERGE_GROUP_REF.exec(ref);
  return match === null ? null : Number(match[2]);
}

export interface CommittedRuleset {
  /** Repo-relative path, e.g. `.github/rulesets/main.json`. */
  file: string;
  name: string;
  ruleset: JsonObject;
}

/** Every committed ruleset under `root`, sorted by file. Throws on unreadable or malformed files, or a repeated name. */
export function readCommitted(root: string): CommittedRuleset[] {
  const dir = join(root, RULESETS_DIR);
  if (!existsSync(dir)) {
    throw new Error(`${RULESETS_DIR} does not exist`);
  }
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort(compare);
  const fileByName = new Map<string, string>();
  return names.map((name) => {
    const file = `${RULESETS_DIR}/${name}`;
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch (error) {
      throw new Error(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isObject(data) || typeof data["name"] !== "string" || data["name"] === "") {
      throw new Error(`${file} must be a JSON object with a non-empty "name"`);
    }
    const other = fileByName.get(data["name"]);
    if (other !== undefined) {
      throw new Error(`${other} and ${file} both name the ruleset "${data["name"]}"`);
    }
    fileByName.set(data["name"], file);
    return { file, name: data["name"], ruleset: data };
  });
}

/** The request body for creating or updating a committed ruleset: its compared fields, as committed. */
export function requestBody(ruleset: JsonObject): JsonObject {
  const body: JsonObject = {};
  for (const field of COMPARED_FIELDS) {
    if (field in ruleset) {
      body[field] = ruleset[field]!;
    }
  }
  return body;
}

// ---------------------------------------------------------------------------
// GitHub API

export class Api {
  constructor(
    private readonly base: string,
    private readonly token: string | null,
  ) {}

  async request<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "xaravel-ruleset",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token !== null) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${this.base}${path}`, init);
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300).replace(/\s+/g, " ").trim();
      throw new Error(`${method} ${path}: HTTP ${response.status}${detail === "" ? "" : ` ${detail}`}`);
    }
    return (await response.json()) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async paged<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    const sep = path.includes("?") ? "&" : "?";
    for (let page = 1; ; page++) {
      const batch = await this.get<T[]>(`${path}${sep}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) {
        throw new Error(`GET ${path}: expected a JSON array`);
      }
      items.push(...batch);
      if (batch.length < 100) {
        return items;
      }
    }
  }
}

interface RulesetSummary {
  id: number;
  name: string;
}

async function liveSummaries(api: Api, repo: string): Promise<RulesetSummary[]> {
  const list = await api.paged<RulesetSummary>(`/repos/${repo}/rulesets?includes_parents=false`);
  for (const item of list) {
    if (!isObject(item) || typeof item.id !== "number" || typeof item.name !== "string") {
      throw new Error(`GET /repos/${repo}/rulesets: an entry has no numeric id or string name`);
    }
  }
  return list;
}

async function orgAdmins(api: Api, org: string): Promise<string[]> {
  const members = await api.paged<{ login: string }>(`/orgs/${org}/members?role=admin`);
  return members.map((member) => {
    if (!isObject(member) || typeof member.login !== "string") {
      throw new Error(`GET /orgs/${org}/members: an entry has no login`);
    }
    return member.login;
  });
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

interface Options {
  root: string;
  repo: string;
  agent: string | null;
}

function repoRoot(): string {
  return resolve(import.meta.dir, "..", "..");
}

function parseOptions(argv: readonly string[], allowed: ReadonlySet<string>): Options {
  const options: Options = { root: repoRoot(), repo: process.env["GITHUB_REPOSITORY"] || "xaravel/framework", agent: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!allowed.has(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
      options.root = resolve(value);
    } else if (arg === "--repo") {
      options.repo = value;
    } else if (arg === "--agent") {
      if (!LOGIN.test(value)) {
        throw new UsageError(`--agent must be a GitHub login, got ${JSON.stringify(value)}`);
      }
      options.agent = value;
    }
  }
  if (!REPO.test(options.repo)) {
    throw new UsageError(`--repo must be <owner/name>, got ${JSON.stringify(options.repo)}`);
  }
  return options;
}

function client(): Api {
  const token = process.env["GH_TOKEN"] || null;
  if (token === null) {
    // Unauthenticated requests get partial public data, which would read as drift.
    throw new Error('GH_TOKEN is not set, so the live rulesets cannot be read; run with GH_TOKEN="$(gh auth token)"');
  }
  const base = (process.env["GITHUB_API_URL"] || "https://api.github.com").replace(/\/+$/, "");
  return new Api(base, token);
}

function report(title: string, violations: readonly string[]): void {
  process.stderr.write(`${title} (AD-16):\n${violations.map((line) => `  ${line}`).join("\n")}\n`);
}

/** The `policy:` lines for the committed main.json (one when it is absent) and the given rulesets and admins. */
function committedPolicy(committed: readonly CommittedRuleset[], rulesets: Readonly<Record<string, unknown>>, admins: readonly string[] | null): string[] {
  const main = committed.find((item) => item.file === `${RULESETS_DIR}/${MAIN_FILE}`);
  const missing = main === undefined ? [`policy: ${RULESETS_DIR}/${MAIN_FILE} does not exist (AD-16)`] : [];
  return [...missing, ...policyViolations(main?.ruleset ?? {}, rulesets, admins)];
}

async function verify(options: Options): Promise<number> {
  const committed = readCommitted(options.root);
  const api = client();
  const summaries = await liveSummaries(api, options.repo);
  const live = new Map<number, JsonObject>();
  for (const summary of summaries) {
    live.set(summary.id, await api.get<JsonObject>(`/repos/${options.repo}/rulesets/${summary.id}`));
  }

  const violations: string[] = [];
  const labelled: Record<string, unknown> = {};
  for (const item of committed) {
    labelled[item.file] = item.ruleset;
    const matches = summaries.filter((summary) => summary.name === item.name);
    if (matches.length === 0) {
      violations.push(`missing ruleset: ${item.file} "${item.name}" has no live ruleset of that name (AD-16)`);
      continue;
    }
    if (matches.length > 1) {
      violations.push(`ruleset drift: ${item.file} name: committed ${JSON.stringify(item.name)}, live ${matches.length} rulesets share it (AD-16)`);
      continue;
    }
    violations.push(...diffRulesets(item.file, item.ruleset, live.get(matches[0]!.id)));
  }
  for (const summary of summaries) {
    labelled[`live "${summary.name}" (${summary.id})`] = live.get(summary.id);
  }

  const org = options.repo.split("/")[0]!;
  const admins = await orgAdmins(api, org);
  violations.push(...committedPolicy(committed, labelled, admins));

  if (violations.length > 0) {
    report("Ruleset violations", violations);
    return 1;
  }
  process.stdout.write(`Rulesets OK: ${committed.length} committed ruleset(s) match ${options.repo}; policy holds.\n`);
  return 0;
}

async function apply(options: Options): Promise<number> {
  const committed = readCommitted(options.root);
  // Check policy before any write, so a main.json that verify would reject never goes live.
  const violations = committedPolicy(committed, Object.fromEntries(committed.map((item) => [item.file, item.ruleset])), null);
  if (violations.length > 0) {
    report("Ruleset violations", violations);
    return 1;
  }
  const api = client();
  const summaries = await liveSummaries(api, options.repo);
  // Match every committed ruleset before writing any, so an ambiguous name writes nothing.
  const plan = committed.map((item) => {
    const matches = summaries.filter((summary) => summary.name === item.name);
    if (matches.length > 1) {
      throw new Error(`${matches.length} live rulesets are named "${item.name}"; resolve by hand`);
    }
    return { item, id: matches.length === 0 ? null : matches[0]!.id };
  });
  for (const { item, id } of plan) {
    const body = requestBody(item.ruleset);
    if (id === null) {
      const created = await api.request<{ id: number }>("POST", `/repos/${options.repo}/rulesets`, body);
      process.stdout.write(`Created "${item.name}" (${created.id}) from ${item.file}.\n`);
    } else {
      await api.request<unknown>("PUT", `/repos/${options.repo}/rulesets/${id}`, body);
      process.stdout.write(`Updated "${item.name}" (${id}) from ${item.file}.\n`);
    }
  }
  return 0;
}

async function identity(options: Options): Promise<number> {
  const api = client();
  const refs = [...CLOSED_PROBES, MAIN_REF, STORY_PROBE];
  const rulesByRef: Record<string, ActiveRule[]> = {};
  for (const ref of refs) {
    const rules = await api.paged<ActiveRule>(`/repos/${options.repo}/rules/branches/${ref}`);
    rulesByRef[ref] = rules.map((rule) => {
      if (!isObject(rule) || typeof rule.type !== "string") {
        throw new Error(`GET /repos/${options.repo}/rules/branches/${ref}: a rule has no type`);
      }
      return { type: rule.type };
    });
  }
  const summaries = await liveSummaries(api, options.repo);
  const tagsSummaries = summaries.filter((summary) => summary.name === TAGS_RULESET);
  if (tagsSummaries.length > 1) {
    throw new Error(`${tagsSummaries.length} live rulesets are named "${TAGS_RULESET}"`);
  }
  const tags = tagsSummaries.length === 0 ? null : await api.get<JsonObject>(`/repos/${options.repo}/rulesets/${tagsSummaries[0]!.id}`);

  let agent: AgentRole | null = null;
  if (options.agent !== null) {
    const permission = await api.get<{ role_name?: unknown }>(`/repos/${options.repo}/collaborators/${options.agent}/permission`);
    const admins = await orgAdmins(api, options.repo.split("/")[0]!);
    agent = {
      login: options.agent,
      roleName: typeof permission.role_name === "string" ? permission.role_name : "",
      orgAdmin: admins.some((login) => login.toLowerCase() === options.agent!.toLowerCase()),
    };
  }

  const violations = identityViolations(rulesByRef, tags, agent);
  if (violations.length > 0) {
    report("Identity violations", violations);
    return 1;
  }
  const who = agent === null ? "" : ` Agent ${agent.login} has role ${agent.roleName} and is not an org admin.`;
  process.stdout.write(`Identity OK: only story/* is open to non-admin identities on ${options.repo}.${who}\n`);
  return 0;
}

function mergeGroupPr(argv: readonly string[]): number {
  if (argv.length !== 1 || argv[0]!.startsWith("--")) {
    throw new UsageError("merge-group-pr needs exactly one <ref>");
  }
  const n = prFromMergeGroupRef(argv[0]!);
  if (n === null) {
    process.stderr.write(`not a merge queue ref: ${JSON.stringify(argv[0])}; expected refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha> (AD-16)\n`);
    return 1;
  }
  process.stdout.write(`${n}\n`);
  return 0;
}

const USAGE = [
  "Usage:",
  "  bun tools/ruleset/ruleset.ts verify [--repo <owner/name>] [--root <dir>]",
  "  bun tools/ruleset/ruleset.ts apply [--repo <owner/name>] [--root <dir>]",
  "  bun tools/ruleset/ruleset.ts identity [--repo <owner/name>] [--agent <login>]",
  "  bun tools/ruleset/ruleset.ts merge-group-pr <ref>",
].join("\n");

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "verify") {
      return await verify(parseOptions(rest, new Set(["--repo", "--root"])));
    }
    if (command === "apply") {
      return await apply(parseOptions(rest, new Set(["--repo", "--root"])));
    }
    if (command === "identity") {
      return await identity(parseOptions(rest, new Set(["--repo", "--agent"])));
    }
    if (command === "merge-group-pr") {
      return mergeGroupPr(rest);
    }
    throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    // Anything else (an unreadable file, an API failure) fails closed.
    process.stderr.write(`Ruleset check failed: ${error instanceof Error ? error.message : String(error)} (AD-16)\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
