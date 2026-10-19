// The quarantine and promotion bots and the Oracle Escalation collector (Story 5.8; FR-3, AD-16, AD-28).
//
//   bun tools/bots/bots.ts detect --root <dir> --ref <r> --out <file> [--runs <k>]
//       (`bun run bots detect …`) runs the harness over the root in full
//       (`runHarness(root, {env})`) and takes every difference with a concrete
//       Test ID (not `-`) as a candidate key `<id> [<variant>]`, sorted. Over
//       50 candidates it proposes nothing and prints
//         BOTS-CAP <n> candidates exceed 50; no proposals
//       (a mass failure is not flakiness). Otherwise it reruns the candidate
//       IDs `k` times (default 3) with `runHarness(root, {env, ids})`; a glob
//       that matches extra IDs is harmless, as only candidate keys are read. A
//       key's observations are the first run's difference kind, then per rerun
//       `match`, that run's difference kind, or `missing` when the run has no
//       result for it. Each key is then:
//         mixed (a `match` and a difference): a quarantine when its line is
//           `pass` or `fail-known`; any other status gets no proposal;
//         an unexpected pass on every run: a promotion when no open Story
//           (`openManifests`, `ownersOf`) owns the ID, otherwise none;
//         an unexpected failure on every run, or anything else: none (a real
//           failure keeps the Ratchet red).
//       It writes the plan to <file> and prints, per key,
//         BOT-QUARANTINE <id> [<v>] runs=<o1,o2,…>
//         BOT-PROMOTE <id> [<v>]
//         BOT-NONE <id> [<v>] <why>
//       then `BOTS ref=<r> quarantine=<q> promote=<p> none=<n>`. The harness
//       report goes to stderr.
//
//   bun tools/bots/bots.ts collect --from <dir> --source <url> --out <file>
//       reads every `ESC-bot-*.md` under <dir> at any depth (the Oracle's
//       `oracle-escalation` and `oracle-determinism` artifacts); each must
//       pass `parseEscalation`, or it exits 1 naming the file. It writes a plan
//       with one `escalation` proposal per file and prints
//       `BOT-ESCALATION <file>` per file, then `BOTS collected=<n>`.
//       A missing <dir> holds no file.
//
//   bun tools/bots/bots.ts apply --plan <file> --repo <owner/name>
//       turns a plan into `bot/*` branches and PRs through the GitHub API
//       (`GITHUB_API_URL`, default https://api.github.com; token `GH_TOKEN`,
//       the xaravel-bot App's), based on `main`'s tip:
//         quarantine  `bot/quarantine-<sha8(<id> [<variant>])>`, one per key;
//         promotion   `bot/promote-<sha8(sorted keys)>`, one per plan;
//         escalation  `bot/oracle-esc-<sha8(file text)>`.
//       A branch that exists prints `BOT-SKIP <branch> exists`; an escalation
//       or promotion while an open PR of that kind (`bot/oracle-esc-`,
//       `bot/promote-`) exists prints `BOT-SKIP <branch> pending`; a planned
//       `before` line that is no longer in main's shard prints
//       `BOT-SKIP <branch> stale`. It never trusts the plan's `after`: it
//       rebuilds each line from `before` (a quarantine sets `quarantined`,
//       reason null and its new `ESC-bot-<n>`; a promotion `pass`, reason null,
//       escalation kept) and replaces exactly that line with `serialiseLine`,
//       keeping every other byte. Each new `ESC-bot-<n>` is one past the
//       highest on main's `conformance/escalations/` and in every open PR
//       whose head is `bot/*`; every whole-word `ESC-bot-<old>` in an Oracle
//       Escalation (its heading included) is rewritten to match. A
//       quarantine's evidence records the full previous line. Before any write it runs ownership's
//       `botValueProblems` and `parseEscalation` on the change and refuses on
//       any problem (`BOT-REFUSE <branch> <problem>`). It writes through the
//       Git data API (blobs, a tree on main's, a commit, the ref), opens a PR
//       to `main` with the evidence and prints `BOT-PR <url>`; when the PR
//       cannot be opened it deletes the branch it created. It never merges.
//
// Exit codes: 0 done (skips included), 1 a thrown error, an invalid collected
// file or, for apply, any failed write (`BOT-FAIL <branch> <message>`), 2 a
// usage error.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { runHarness, type HarnessOptions, type HarnessResult } from "../../conformance/harness/harness";
import type { DifferenceKind } from "../../conformance/harness/compare";
import { ESCALATIONS_DIR, parseEscalation, parseEscalationId } from "../escalations/escalations";
import { serialiseLine, type ExpectationLine } from "../expectations/expectations";
import { compareUnits } from "../inventory/inventory";
import { botValueProblems } from "../ownership/ownership";
import { readExpectations } from "../pin-bump/pin-bump";
import { GitHub, type PrFile } from "../protected-paths/protected-paths";
import { openManifests, ownersOf } from "../ratchet/ratchet";

export class UsageError extends Error {}

/** The most candidate keys `detect` judges; above it, a mass failure, it proposes nothing. */
export const CANDIDATE_CAP = 50;
export const DEFAULT_RUNS = 3;

export type Observation = "match" | DifferenceKind | "missing";

/** One Expectations line a bot changes: its shard, key and current text. */
export interface LineChange {
  shard: string;
  id: string;
  variant: string;
  /** The line's text on the ref the plan was made from. */
  before: string;
  /** The line the detector proposes; `apply` rebuilds it from `before`. */
  after: ExpectationLine;
}

export interface QuarantineProposal extends LineChange {
  kind: "quarantine";
  observations: Observation[];
}

export interface PromotionProposal {
  kind: "promotion";
  changes: LineChange[];
}

export interface EscalationProposal {
  kind: "escalation";
  /** The artifact's file name, `ESC-bot-<n>.md`. */
  file: string;
  text: string;
  source: string;
}

export type Proposal = QuarantineProposal | PromotionProposal | EscalationProposal;

export interface Plan {
  ref: string;
  sha: string;
  /** The run URL, or `local`. */
  run: string;
  proposals: Proposal[];
}

export interface BotRun {
  code: 0 | 1;
  /** Bot lines (stdout). */
  out: string[];
  /** Diagnostics and the harness report (stderr). */
  err: string[];
  plan: Plan | null;
}

type Env = Readonly<Record<string, string | undefined>>;

const SHARD_PATH = /^conformance\/expectations\/(?:[^/]+\/)*[^/]+\.jsonl$/;
const BOT_ESCALATION_FILE = /^ESC-bot-[1-9]\d*\.md$/;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The first 8 hex characters of the SHA-256 of `text`. */
export function sha8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
}

const keyOf = (id: string, variant: string): string => `${id} [${variant}]`;

/** The run URL from the Actions environment, or `local`. */
export function runUrl(env: Env): string {
  const server = env["GITHUB_SERVER_URL"];
  const repository = env["GITHUB_REPOSITORY"];
  const id = env["GITHUB_RUN_ID"];
  return server && repository && id ? `${server.replace(/\/+$/, "")}/${repository}/actions/runs/${id}` : "local";
}

/** The root's checked-out commit (`git rev-parse HEAD`), else `GITHUB_SHA`, else `unknown`. Under `workflow_run`, `GITHUB_SHA` is main's tip, not the commit checked out. */
function headSha(root: string, env: Env): string {
  const git = Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "ignore" });
  const sha = git.stdout.toString().trim();
  if (git.exitCode === 0 && /^[0-9a-f]{40,64}$/.test(sha)) {
    return sha;
  }
  return env["GITHUB_SHA"] || "unknown";
}

// ---------------------------------------------------------------------------
// Detect

export interface DetectOptions {
  ref: string;
  runs?: number;
  env?: Env;
  /** Runs the harness (internal: tests may substitute it); default `runHarness`. */
  harness?: (root: string, options: HarnessOptions) => Promise<HarnessResult>;
}

interface Located {
  shard: string;
  text: string;
  record: Record<string, unknown>;
}

/** Every Expectations line under `root` by key, with its shard and exact text. */
function locateLines(root: string): Map<string, Located> {
  const located = new Map<string, Located>();
  for (const shard of readExpectations(root)) {
    const text = readFileSync(join(root, shard.path), "utf8");
    const raw = (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
    shard.lines.forEach((record, index) => {
      const key = keyOf(String(record["id"]), String(record["variant"]));
      if (!located.has(key)) {
        located.set(key, { shard: shard.path, text: raw[index]!, record });
      }
    });
  }
  return located;
}

function lineOf(record: Record<string, unknown>): ExpectationLine {
  const nullable = (value: unknown): string | null => (typeof value === "string" ? value : null);
  return {
    id: String(record["id"]),
    variant: String(record["variant"]),
    status: String(record["status"]),
    reason: nullable(record["reason"]),
    adapted: nullable(record["adapted"]),
    escalation: nullable(record["escalation"]),
  };
}

/** Runs the detector over `root` (see the header). */
export async function detect(rootArg: string, options: DetectOptions): Promise<BotRun> {
  const root = resolve(rootArg);
  const env = options.env ?? process.env;
  const runs = options.runs ?? DEFAULT_RUNS;
  const harness = options.harness ?? runHarness;
  const out: string[] = [];
  const err: string[] = [];
  const plan: Plan = { ref: options.ref, sha: headSha(root, env), run: runUrl(env), proposals: [] };
  const summary = (q: number, p: number, n: number): string => `BOTS ref=${options.ref} quarantine=${q} promote=${p} none=${n}`;

  const open = openManifests(root);
  const first = await harness(root, { env });
  err.push(...first.out, ...first.err);
  if (!first.out.some((line) => line.startsWith("SUMMARY "))) {
    throw new Error("the harness failed a precondition before it compared anything");
  }
  const firstKinds = new Map<string, DifferenceKind>();
  for (const difference of first.differences) {
    if (difference.id !== "-") {
      const key = keyOf(difference.id, difference.variant);
      if (!firstKinds.has(key)) {
        firstKinds.set(key, difference.kind);
      }
    }
  }
  const keys = [...firstKinds.keys()].sort(compareUnits);
  if (keys.length > CANDIDATE_CAP) {
    out.push(`BOTS-CAP ${keys.length} candidates exceed ${CANDIDATE_CAP}; no proposals`, summary(0, 0, 0));
    return { code: 0, out, err, plan };
  }
  const observations = new Map<string, Observation[]>(keys.map((key) => [key, [firstKinds.get(key)!]]));
  const idOf = new Map<string, { id: string; variant: string }>();
  for (const difference of first.differences) {
    if (difference.id !== "-") {
      idOf.set(keyOf(difference.id, difference.variant), { id: difference.id, variant: difference.variant });
    }
  }
  const ids = [...new Set(keys.map((key) => idOf.get(key)!.id))].sort(compareUnits);
  for (let run = 0; run < runs && ids.length > 0; run++) {
    const rerun = await harness(root, { env, ids });
    err.push(`bots: rerun ${run + 1} of ${runs}`, ...rerun.out, ...rerun.err);
    if (!rerun.out.some((line) => line.startsWith("SUMMARY "))) {
      throw new Error(`rerun ${run + 1}: the harness failed a precondition before it compared anything`);
    }
    const kinds = new Map<string, DifferenceKind>();
    for (const difference of rerun.differences) {
      const key = keyOf(difference.id, difference.variant);
      if (!kinds.has(key)) {
        kinds.set(key, difference.kind);
      }
    }
    const seen = new Set(rerun.results.map((result) => keyOf(result.id, result.variant)));
    for (const key of keys) {
      observations.get(key)!.push(kinds.get(key) ?? (seen.has(key) ? "match" : "missing"));
    }
  }

  const located = locateLines(root);
  const promotions: LineChange[] = [];
  let quarantines = 0;
  let none = 0;
  for (const key of keys) {
    const { id, variant } = idOf.get(key)!;
    const seen = observations.get(key)!;
    const hasMatch = seen.includes("match");
    const hasDifference = seen.some((kind) => kind === "unexpected-pass" || kind === "unexpected-failure");
    const line = located.get(key) ?? null;
    const noProposal = (why: string): void => {
      none++;
      out.push(`BOT-NONE ${key} ${why}`);
    };
    if (line === null) {
      noProposal(`no Expectations line; runs=${seen.join(",")}`);
      continue;
    }
    const status = String(line.record["status"]);
    if (hasMatch && hasDifference) {
      if (status !== "pass" && status !== "fail-known") {
        noProposal(`mixed results on a ${status} line; runs=${seen.join(",")}`);
        continue;
      }
      quarantines++;
      const before = lineOf(line.record);
      plan.proposals.push({
        kind: "quarantine",
        shard: line.shard,
        id,
        variant,
        before: line.text,
        after: { ...before, status: "quarantined", reason: null, escalation: "ESC-bot-1" },
        observations: seen,
      });
      out.push(`BOT-QUARANTINE ${key} runs=${seen.join(",")}`);
      continue;
    }
    if (seen.every((kind) => kind === "unexpected-pass")) {
      const owners = ownersOf(open, id);
      if (owners.length > 0) {
        noProposal(`owned by open ${owners.map((owner) => `Story ${owner}`).join(", ")}`);
        continue;
      }
      const before = lineOf(line.record);
      promotions.push({ shard: line.shard, id, variant, before: line.text, after: { ...before, status: "pass", reason: null } });
      out.push(`BOT-PROMOTE ${key}`);
      continue;
    }
    if (seen.every((kind) => kind === "unexpected-failure")) {
      noProposal("consistent failure");
      continue;
    }
    noProposal(`no consistent result; runs=${seen.join(",")}`);
  }
  if (promotions.length > 0) {
    plan.proposals.push({ kind: "promotion", changes: promotions });
  }
  out.push(summary(quarantines, promotions.length, none));
  return { code: 0, out, err, plan };
}

// ---------------------------------------------------------------------------
// Collect

/** Every `ESC-bot-*.md` under `dir`, at any depth, as paths relative to it, sorted. */
function escalationFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (at: string): void => {
    for (const name of readdirSync(at).sort(compareUnits)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (/^ESC-bot-.*\.md$/.test(name)) {
        found.push(relative(dir, path).split("\\").join("/"));
      }
    }
  };
  if (existsSync(dir)) {
    walk(dir);
  }
  return found.sort(compareUnits);
}

/** Collects the Oracle's Escalation files under `from` into a plan (see the header). */
export function collect(fromArg: string, source: string, env: Env = process.env): BotRun {
  const from = resolve(fromArg);
  const out: string[] = [];
  const err: string[] = [];
  const plan: Plan = { ref: "main", sha: env["GITHUB_SHA"] || "unknown", run: runUrl(env), proposals: [] };
  let invalid = false;
  for (const path of escalationFiles(from)) {
    const name = path.split("/").pop()!;
    const text = readFileSync(join(from, path), "utf8");
    const parsed = parseEscalation(`${ESCALATIONS_DIR}/${name}`, text);
    if (parsed.escalation === null || !BOT_ESCALATION_FILE.test(name)) {
      invalid = true;
      err.push(`bots collect: ${path} is not a valid ESC-bot-<n>.md: ${parsed.violations.join("; ") || "bad file name"}`);
      continue;
    }
    plan.proposals.push({ kind: "escalation", file: name, text, source });
    out.push(`BOT-ESCALATION ${path}`);
  }
  if (invalid) {
    return { code: 1, out, err, plan: null };
  }
  out.push(`BOTS collected=${plan.proposals.length}`);
  return { code: 0, out, err, plan };
}

// ---------------------------------------------------------------------------
// Apply

/** Parses and checks a plan file's value; throws naming the first problem. */
export function parsePlan(value: unknown): Plan {
  const bad = (problem: string): never => {
    throw new Error(`the plan is invalid: ${problem}`);
  };
  const isRecord = (item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item);
  if (!isRecord(value) || typeof value["ref"] !== "string" || typeof value["sha"] !== "string" || typeof value["run"] !== "string" || !Array.isArray(value["proposals"])) {
    return bad('expected {"ref","sha","run","proposals":[…]}');
  }
  const change = (item: unknown, at: string): LineChange => {
    if (!isRecord(item) || typeof item["shard"] !== "string" || typeof item["id"] !== "string" || typeof item["variant"] !== "string" || typeof item["before"] !== "string" || !isRecord(item["after"])) {
      return bad(`${at} needs shard, id, variant, before and after`);
    }
    const shard = item["shard"];
    if (!SHARD_PATH.test(shard) || shard.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
      return bad(`${at}: ${JSON.stringify(shard)} is not an Expectations shard path`);
    }
    return { shard, id: item["id"], variant: item["variant"], before: item["before"], after: lineOf(item["after"]) };
  };
  const proposals = (value["proposals"] as unknown[]).map((item, index): Proposal => {
    const at = `proposal ${index + 1}`;
    if (!isRecord(item)) {
      return bad(`${at} is not an object`);
    }
    if (item["kind"] === "quarantine") {
      const observations = item["observations"];
      if (!Array.isArray(observations) || !observations.every((entry) => ["match", "unexpected-pass", "unexpected-failure", "missing"].includes(entry as string))) {
        return bad(`${at} needs observations`);
      }
      return { kind: "quarantine", ...change(item, at), observations: observations as Observation[] };
    }
    if (item["kind"] === "promotion") {
      const changes = item["changes"];
      if (!Array.isArray(changes) || changes.length === 0) {
        return bad(`${at} needs changes`);
      }
      return { kind: "promotion", changes: changes.map((entry, n) => change(entry, `${at} change ${n + 1}`)) };
    }
    if (item["kind"] === "escalation") {
      if (typeof item["file"] !== "string" || !BOT_ESCALATION_FILE.test(item["file"]) || typeof item["text"] !== "string" || typeof item["source"] !== "string") {
        return bad(`${at} needs file ESC-bot-<n>.md, text and source`);
      }
      return { kind: "escalation", file: item["file"], text: item["text"], source: item["source"] };
    }
    return bad(`${at} has an unknown kind ${JSON.stringify(item["kind"])}`);
  });
  return { ref: value["ref"], sha: value["sha"], run: value["run"], proposals };
}

export interface ApplyOptions {
  repo: string;
  /** The API root, e.g. https://api.github.com. */
  api: string;
  token: string | null;
}

/** The text of the flaky-test Escalation `escId` for a quarantine. */
export function quarantineEscalation(escId: string, plan: Pick<Plan, "ref" | "sha" | "run">, proposal: Pick<QuarantineProposal, "id" | "variant" | "shard" | "observations" | "before">, previous: string): string {
  const key = keyOf(proposal.id, proposal.variant);
  return [
    "---",
    "test_ids:",
    `  - ${JSON.stringify(proposal.id)}`,
    "trigger: flaky",
    "proposed: >-",
    `  Find and fix the cause of the inconsistent result, then return the line to its`,
    `  previous line (status ${previous}, recorded in full in the evidence) and close this Escalation.`,
    "evidence: |-",
    `  The quarantine bot (bun tools/bots/bots.ts detect) ran ${key} on ${plan.ref}`,
    `  at ${plan.sha} (run ${plan.run}) ${proposal.observations.length} times:`,
    ...proposal.observations.map((observation, index) => `  - run ${index + 1}: ${observation}`),
    `  The line before the quarantine, to restore once the cause is fixed:`,
    `  ${proposal.before}`,
    "---",
    "",
    `# ${escId}: ${key} is flaky on ${plan.ref}`,
    "",
    `The quarantine bot saw both a matching result and a difference for this Test ID × Variant across ${proposal.observations.length} runs, so its line in \`${proposal.shard}\` is \`quarantined\` until the cause is fixed. The \`evidence\` above lists each run's observation.`,
    "",
  ].join("\n");
}

/** Replaces exactly the line `before` (whose key is `id [variant]`) in `text` by `after`; null when no such line exists. */
function replaceLine(text: string, change: LineChange, after: string): string | null {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => {
    if (line !== change.before) {
      return false;
    }
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      return record["id"] === change.id && record["variant"] === change.variant;
    } catch {
      return false;
    }
  });
  if (index === -1) {
    return null;
  }
  lines[index] = after;
  return lines.join("\n");
}

/** The line a change becomes, rebuilt from its `before` text. */
function rebuilt(change: LineChange, triple: { status: string; escalation?: string }): string {
  const was = lineOf(JSON.parse(change.before) as Record<string, unknown>);
  return serialiseLine({ ...was, status: triple.status, reason: null, escalation: triple.escalation ?? was.escalation });
}

/** Rewrites every whole-word occurrence of `oldId` (`ESC-bot-<old>` not followed by a digit), the `# ESC-bot-<old>:` heading included, to `escId`. */
function renumber(text: string, oldId: string, escId: string): string {
  return text.replace(new RegExp(`(?<![\\w-])${oldId}(?!\\d)`, "g"), escId);
}

class Writer {
  constructor(
    private readonly api: string,
    private readonly repo: string,
    private readonly token: string | null,
  ) {}

  async delete(path: string): Promise<void> {
    const response = await fetch(`${this.api}/repos/${this.repo}${path}`, { method: "DELETE", headers: this.headers() });
    if (!response.ok) {
      throw new Error(`DELETE ${path}: HTTP ${response.status}`);
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "xaravel-bots",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token !== null) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.api}/repos/${this.repo}${path}`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    if (!response.ok) {
      throw new Error(`POST ${path}: HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }
}

interface Prepared {
  branch: string;
  title: string;
  body: string;
  /** Repo path → new text. */
  files: Map<string, string>;
  /** Shard path → main's text, for the value self-check. */
  baseShards: Map<string, string>;
  addedEscalations: Set<string>;
}

/** Applies `plan` through the GitHub API (see the header). */
export async function apply(plan: Plan, options: ApplyOptions): Promise<BotRun> {
  const out: string[] = [];
  const err: string[] = [];
  const github = new GitHub(options.api, options.repo, options.token);
  const writer = new Writer(options.api, options.repo, options.token);
  if (plan.proposals.length === 0) {
    out.push("BOTS applied=0 failed=0 skipped=0");
    return { code: 0, out, err, plan };
  }

  const main = await github.json<{ object?: { sha?: unknown } }>("/git/ref/heads/main");
  const tip = main.object?.sha;
  if (typeof tip !== "string") {
    throw new Error("GET /git/ref/heads/main: missing object.sha");
  }
  const baseSha: string = tip;
  const refs = await github.json<{ ref?: unknown }[]>("/git/matching-refs/heads/bot/");
  const branches = new Set(refs.map((ref) => (typeof ref.ref === "string" ? ref.ref.replace(/^refs\/heads\//, "") : "")));

  // The next ESC-bot-<n>: past every one on main and in every open bot/* PR.
  let highest = 0;
  const note = (name: string): void => {
    const id = name.endsWith(".md") ? parseEscalationId(name.slice(0, -".md".length)) : null;
    if (id !== null && id.storyId === null) {
      highest = Math.max(highest, id.n);
    }
  };
  const listing = await github.json<{ name?: unknown }[]>(`/contents/${ESCALATIONS_DIR}?ref=${baseSha}`);
  for (const entry of listing) {
    if (typeof entry.name === "string") {
      note(entry.name);
    }
  }
  const pulls = await github.paged<{ number: number; head?: { ref?: unknown } }>("/pulls");
  // An open Oracle-Escalation or promotion PR makes a new one of that kind wait (`BOT-SKIP <branch> pending`).
  const pending = new Set<string>();
  for (const pull of pulls) {
    if (typeof pull.head?.ref === "string" && pull.head.ref.startsWith("bot/")) {
      for (const prefix of ["bot/oracle-esc-", "bot/promote-"]) {
        if (pull.head.ref.startsWith(prefix)) {
          pending.add(prefix);
        }
      }
      for (const file of await github.paged<PrFile>(`/pulls/${pull.number}/files`)) {
        if (file.status !== "removed" && file.filename.startsWith(`${ESCALATIONS_DIR}/`)) {
          note(file.filename.slice(ESCALATIONS_DIR.length + 1));
        }
      }
    }
  }
  const nextEscalation = (): string => `ESC-bot-${++highest}`;

  const shardCache = new Map<string, string | null>();
  const shardAt = async (path: string): Promise<string | null> => {
    if (!shardCache.has(path)) {
      shardCache.set(path, await github.contents(path, baseSha));
    }
    return shardCache.get(path)!;
  };

  let applied = 0;
  let failed = 0;
  let skipped = 0;
  for (const proposal of plan.proposals) {
    let prepared: Prepared | "stale";
    const branch =
      proposal.kind === "quarantine"
        ? `bot/quarantine-${sha8(keyOf(proposal.id, proposal.variant))}`
        : proposal.kind === "promotion"
          ? `bot/promote-${sha8(proposal.changes.map((change) => keyOf(change.id, change.variant)).sort(compareUnits).join("\n"))}`
          : `bot/oracle-esc-${sha8(proposal.text)}`;
    if (branches.has(branch)) {
      skipped++;
      out.push(`BOT-SKIP ${branch} exists`);
      continue;
    }
    const kindPrefix = proposal.kind === "escalation" ? "bot/oracle-esc-" : proposal.kind === "promotion" ? "bot/promote-" : null;
    if (kindPrefix !== null && pending.has(kindPrefix)) {
      skipped++;
      out.push(`BOT-SKIP ${branch} pending`);
      continue;
    }
    try {
      prepared = await prepare(proposal, branch);
    } catch (error) {
      failed++;
      out.push(`BOT-FAIL ${branch} ${message(error)}`);
      continue;
    }
    if (prepared === "stale") {
      skipped++;
      out.push(`BOT-SKIP ${branch} stale`);
      continue;
    }
    // Self-check: the ownership bot value rule and the Escalation format, before any write.
    const headShards = new Map([...prepared.files].filter(([path]) => SHARD_PATH.test(path)));
    const problems = [...botValueProblems(prepared.baseShards, headShards, prepared.addedEscalations)];
    for (const [path, text] of prepared.files) {
      if (path.startsWith(`${ESCALATIONS_DIR}/`)) {
        problems.push(...parseEscalation(path, text).violations);
      }
    }
    if (problems.length > 0) {
      failed++;
      out.push(`BOT-REFUSE ${branch} ${problems.join("; ")}`);
      continue;
    }
    try {
      const url = await write(prepared);
      branches.add(branch);
      applied++;
      out.push(`BOT-PR ${url}`);
    } catch (error) {
      failed++;
      out.push(`BOT-FAIL ${branch} ${message(error)}`);
    }
  }
  out.push(`BOTS applied=${applied} failed=${failed} skipped=${skipped}`);
  return { code: failed > 0 ? 1 : 0, out, err, plan };

  async function prepare(proposal: Proposal, branch: string): Promise<Prepared | "stale"> {
    const evidence = `Plan: ref \`${plan.ref}\` at \`${plan.sha}\`, run ${plan.run}.`;
    if (proposal.kind === "escalation") {
      const escId = nextEscalation();
      const oldId = proposal.file.slice(0, -".md".length);
      const text = renumber(proposal.text, oldId, escId);
      return {
        branch,
        title: `bot: commit the Oracle Escalation ${escId}`,
        body: [`Commits the Oracle's \`${proposal.file}\` as \`${ESCALATIONS_DIR}/${escId}.md\` (renumbered from ${oldId}).`, "", `Source: ${proposal.source}`, "", evidence].join("\n"),
        files: new Map([[`${ESCALATIONS_DIR}/${escId}.md`, text]]),
        baseShards: new Map(),
        addedEscalations: new Set([escId]),
      };
    }
    const changes = proposal.kind === "quarantine" ? [proposal] : proposal.changes;
    const texts = new Map<string, string>();
    const baseShards = new Map<string, string>();
    for (const change of changes) {
      const base = await shardAt(change.shard);
      if (base === null) {
        return "stale";
      }
      baseShards.set(change.shard, base);
    }
    if (proposal.kind === "quarantine") {
      const previous = String((JSON.parse(proposal.before) as Record<string, unknown>)["status"]);
      // Stale before numbering, so a skipped proposal takes no ESC-bot number.
      if (replaceLine(baseShards.get(proposal.shard)!, proposal, proposal.before) === null) {
        return "stale";
      }
      const escId = nextEscalation();
      const next = replaceLine(baseShards.get(proposal.shard)!, proposal, rebuilt(proposal, { status: "quarantined", escalation: escId }))!;
      const key = keyOf(proposal.id, proposal.variant);
      texts.set(proposal.shard, next);
      texts.set(`${ESCALATIONS_DIR}/${escId}.md`, quarantineEscalation(escId, plan, proposal, previous));
      return {
        branch,
        title: `bot: quarantine ${key}`,
        body: [
          `Quarantines \`${key}\` in \`${proposal.shard}\` (was \`${previous}\`) and opens ${escId} (trigger \`flaky\`).`,
          "",
          "Observations:",
          ...proposal.observations.map((observation, index) => `- run ${index + 1}: ${observation}`),
          "",
          evidence,
        ].join("\n"),
        files: texts,
        baseShards,
        addedEscalations: new Set([escId]),
      };
    }
    for (const change of changes) {
      const current = texts.get(change.shard) ?? baseShards.get(change.shard)!;
      const next = replaceLine(current, change, rebuilt(change, { status: "pass" }));
      if (next === null) {
        return "stale";
      }
      texts.set(change.shard, next);
    }
    return {
      branch,
      title: `bot: promote ${changes.length} unowned unexpected pass(es)`,
      body: [
        "Promotes each Expectations line below to `pass` (reason null): it passed on every run and no open Story owns it.",
        "",
        ...changes.map((change) => `- \`${keyOf(change.id, change.variant)}\` in \`${change.shard}\``),
        "",
        evidence,
      ].join("\n"),
      files: texts,
      baseShards,
      addedEscalations: new Set(),
    };
  }

  async function write(prepared: Prepared): Promise<string> {
    const tree: { path: string; mode: string; type: string; sha: string }[] = [];
    for (const [path, content] of [...prepared.files].sort(([a], [b]) => compareUnits(a, b))) {
      const blob = await writer.post<{ sha: string }>("/git/blobs", { content, encoding: "utf-8" });
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const commit = await github.json<{ tree?: { sha?: unknown } }>(`/git/commits/${baseSha}`);
    const baseTree = commit.tree?.sha;
    if (typeof baseTree !== "string") {
      throw new Error(`GET /git/commits/${baseSha}: missing tree.sha`);
    }
    const created = await writer.post<{ sha: string }>("/git/trees", { base_tree: baseTree, tree });
    const committed = await writer.post<{ sha: string }>("/git/commits", { message: prepared.title, tree: created.sha, parents: [baseSha] });
    await writer.post("/git/refs", { ref: `refs/heads/${prepared.branch}`, sha: committed.sha });
    try {
      const pull = await writer.post<{ html_url?: unknown }>("/pulls", { title: prepared.title, head: prepared.branch, base: "main", body: prepared.body, maintainer_can_modify: false });
      if (typeof pull.html_url !== "string") {
        throw new Error("POST /pulls: missing html_url");
      }
      return pull.html_url;
    } catch (error) {
      // No PR: delete the branch, or every later run would skip it as existing.
      try {
        await writer.delete(`/git/refs/heads/${prepared.branch}`);
      } catch (cleanup) {
        throw new Error(`${message(error)}; the branch could not be deleted: ${message(cleanup)}`);
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = [
  "Usage:",
  "  bun tools/bots/bots.ts detect --root <dir> --ref <r> --out <file> [--runs <k>]",
  "  bun tools/bots/bots.ts collect --from <dir> --source <url> --out <file>",
  "  bun tools/bots/bots.ts apply --plan <file> --repo <owner/name>",
].join("\n");

function parseFlags(argv: readonly string[], allowed: readonly string[], required: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!allowed.includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (flags.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    flags.set(arg, value);
  }
  const missing = required.filter((flag) => !flags.has(flag));
  if (missing.length > 0) {
    throw new UsageError(`missing ${missing.join(", ")}`);
  }
  return flags;
}

function writePlan(file: string, plan: Plan): void {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, `${JSON.stringify(plan)}\n`);
}

function print(result: BotRun): number {
  if (result.err.length > 0) {
    process.stderr.write(result.err.map((line) => `${line}\n`).join(""));
  }
  process.stdout.write(result.out.map((line) => `${line}\n`).join(""));
  return result.code;
}

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "detect") {
      const flags = parseFlags(rest, ["--root", "--ref", "--out", "--runs"], ["--root", "--ref", "--out"]);
      const runsText = flags.get("--runs") ?? String(DEFAULT_RUNS);
      if (!/^[1-9]\d*$/.test(runsText)) {
        throw new UsageError(`--runs must be a positive integer, got ${JSON.stringify(runsText)}`);
      }
      const result = await detect(flags.get("--root")!, { ref: flags.get("--ref")!, runs: Number(runsText) });
      writePlan(flags.get("--out")!, result.plan!);
      return print(result);
    }
    if (command === "collect") {
      const flags = parseFlags(rest, ["--from", "--source", "--out"], ["--from", "--source", "--out"]);
      const result = collect(flags.get("--from")!, flags.get("--source")!);
      if (result.plan !== null) {
        writePlan(flags.get("--out")!, result.plan);
      }
      return print(result);
    }
    if (command === "apply") {
      const flags = parseFlags(rest, ["--plan", "--repo"], ["--plan", "--repo"]);
      const repo = flags.get("--repo")!;
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
        throw new UsageError(`--repo must be <owner/name>, got ${JSON.stringify(repo)}`);
      }
      const plan = parsePlan(JSON.parse(readFileSync(flags.get("--plan")!, "utf8")) as unknown);
      const api = (process.env["GITHUB_API_URL"] || "https://api.github.com").replace(/\/+$/, "");
      return print(await apply(plan, { repo, api, token: process.env["GH_TOKEN"] || null }));
    }
    throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Bots failed: ${message(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
