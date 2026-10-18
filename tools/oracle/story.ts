// Per-Story Oracle requests: judge, evaluate and sign (Story 3.4; FR-6,
// AD-15, AD-16).
//
//   bun tools/oracle/story.ts check <story-id> [--root <dir>] [--requests <file>] [--report <file>]
//       judges every line of the Story's request file (default
//       `<root>/conformance/oracle-requests/<story-id>.jsonl`) against
//       conformance/oracle/schema.json and the manifest `stories/<story-id>.md`
//       under `<root>` (tools/oracle/story-requests.ts), without evaluating.
//
//   bun tools/oracle/story.ts generate <story-id> [--root <dir>] [--requests <file>] [--report <file>]
//                                     [--out <dir>] [--image <ref> | --local <dir> [--php <bin>]]
//       the same judgement, then evaluates the accepted requests twice with
//       tools/oracle/evaluate.php, as the batch does (in the Oracle image
//       `xaravel-oracle:<oracle tag>` or `--image <ref>` through `runInImage`,
//       the script and a directory holding only the accepted requests mounted
//       read-only; or with `--local`/`--php` against a locked local install).
//       A request whose two outputs differ is rejected (`differs between two
//       evaluations`) and gets no fixture. Each other one is signed exactly as
//       the batch signs (`signFixture`/`renderFixture`) with the Ed25519 key in
//       env ORACLE_SIGNING_KEY (checked against conformance/oracle/oracle.pub
//       before anything runs) and written to
//       `<out>/<component>/<sha256>.json`, where `<component>` is the
//       manifest's and `<out>` defaults to `<root>/conformance/fixtures`. It
//       writes nothing else there.
//
// `--report <file>` writes a markdown summary (the PR comment of
// `oracle.yml#story`): the fixtures written or the requests accepted, and
// every rejection with its reason. In CI `<root>` is main's checkout, never
// the PR's, and the request file is the PR's, read from the API as data.
//
// Exit codes: 0 every request accepted (and, for generate, signed), 1 any
// rejection or failure (fail closed: no manifest, no key or a key that is not
// oracle.pub's half writes no fixture), 2 usage error.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ImageRunner } from "../inventory/inventory";
import type { Manifest } from "../ownership/ownership";
import {
  batchRequestFiles,
  checkLocalInstall,
  evaluateOnce,
  FIXTURES_DIR,
  GENERATORS,
  parsePass,
  readCommittedRequests,
  readNondeterminism,
  renderFixture,
  signFixture,
  signingKey,
  SIGNING_KEY_ENV,
} from "./fixtures";
import { canonicalJson, readSchema, renderRequest, type Json } from "./request";
import { judgeStoryRequests, readStoryManifest, readStoryRequestFiles, renderRejection, STORY_REQUESTS_DIR, type AcceptedRequest, type Rejection } from "./story-requests";

const STORY_ID = /^[1-9]\d*\.[1-9]\d*$/;

export type StoryMode = "check" | "generate";

export interface StoryOptions {
  mode: StoryMode;
  storyId: string;
  root: string;
  /** The request file; default `<root>/conformance/oracle-requests/<story-id>.jsonl`. */
  requests?: string;
  /** Where the markdown report goes. */
  report?: string;
  /** The fixture root; default `<root>/conformance/fixtures`. */
  out?: string;
  image?: string;
  local?: string;
  php?: string;
  /** Runs evaluate.php in the image; default `runInImage`. */
  runner?: ImageRunner;
}

export interface StoryResult {
  storyId: string;
  /** The request file's repo-relative label, `conformance/oracle-requests/<story-id>.jsonl`. */
  file: string;
  component: string;
  mode: StoryMode;
  /** Request lines judged. */
  total: number;
  accepted: AcceptedRequest[];
  rejections: Rejection[];
  /** The fixtures written (generate), as displayed paths, in request order. */
  written: { path: string; id: string }[];
}

/** The repo-relative label of a Story's request file. */
export function storyRequestsFile(storyId: string): string {
  return `${STORY_REQUESTS_DIR}/${storyId}.jsonl`;
}

/** `path` relative to `root` when it is inside it, else absolute. */
function display(root: string, path: string): string {
  const rel = relative(root, path);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? path : rel.split("\\").join("/");
}

/**
 * Judges the Story's requests and, in `generate` mode, evaluates the accepted ones twice and signs and writes their
 * fixtures. Throws (fail closed, nothing written) on a missing or wrong key, a missing or invalid manifest, a missing
 * request file, or an evaluation that fails as a whole.
 */
export function runStory(options: StoryOptions, signingKeyPem: string | null = null): StoryResult {
  const { root, storyId, mode } = options;
  // The key is checked before anything is read or evaluated, so a wrong or missing key costs nothing and writes nothing.
  const key = mode === "generate" ? signingKey(root, signingKeyPem) : null;
  const manifest: Manifest = readStoryManifest(root, storyId);
  if (manifest.component === GENERATORS) {
    throw new Error(`${manifest.file} names Component ${GENERATORS}; ${FIXTURES_DIR}/${GENERATORS}/ holds Protected generator reference files, never signed fixtures`);
  }
  const file = storyRequestsFile(storyId);
  const requestsPath = options.requests !== undefined ? resolve(options.requests) : join(root, file);
  if (!existsSync(requestsPath)) {
    throw new Error(`${options.requests !== undefined ? requestsPath : file} is missing`);
  }
  const text = readFileSync(requestsPath, "utf8");
  const listing = readNondeterminism(root);
  const schema = readSchema(root);
  const batch = batchRequestFiles(readCommittedRequests(root));
  const listed = new Map(listing.map((entry) => [entry.sha256, entry.line]));
  const judged = judgeStoryRequests(text, file, manifest, schema, batch, listed);
  // A request another committed per-Story file already holds gets no second fixture (verify-fixtures rejects it).
  const others = new Map<string, string>();
  for (const other of readStoryRequestFiles(root, schema, batch, listed, file)) {
    other.accepted.forEach(({ request, line }) => others.set(request.sha256, `${other.file}:${line}`));
  }
  judged.accepted = judged.accepted.filter((item) => {
    const other = others.get(item.request.sha256);
    if (other !== undefined) {
      judged.rejections.push({ line: item.line, id: item.request.id, sha256: item.request.sha256, reasons: [`request ${item.request.sha256} is also in ${other}`] });
    }
    return other === undefined;
  });
  judged.rejections.sort((x, y) => (x.line ?? Number.MAX_SAFE_INTEGER) - (y.line ?? Number.MAX_SAFE_INTEGER));
  const total = text === "" ? 0 : (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n").length;
  const result: StoryResult = { storyId, file, component: manifest.component, mode, total, accepted: judged.accepted, rejections: judged.rejections, written: [] };
  if (key === null || judged.accepted.length === 0) {
    return result;
  }

  if (options.local !== undefined) {
    checkLocalInstall(root, options.local);
  }
  const requests = judged.accepted.map(({ request }) => request);
  const dir = mkdtempSync(join(tmpdir(), "xaravel-oracle-story-"));
  let first: Map<string, Json>;
  let second: Map<string, Json>;
  try {
    // Only the accepted requests are evaluated: a rejected line never reaches PHP.
    const name = `${storyId}.jsonl`;
    writeFileSync(join(dir, name), requests.map((request) => `${renderRequest(request)}\n`).join(""));
    chmodSync(dir, 0o755);
    chmodSync(join(dir, name), 0o644);
    first = parsePass(evaluateOnce(root, dir, [name], options), requests, "first pass");
    second = parsePass(evaluateOnce(root, dir, [name], options), requests, "second pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const out = options.out !== undefined ? resolve(options.out) : join(root, FIXTURES_DIR);
  const signed: { path: string; id: string; text: string; line: number }[] = [];
  const accepted: AcceptedRequest[] = [];
  for (const item of judged.accepted) {
    const { request } = item;
    const a = first.get(request.sha256)!;
    const b = second.get(request.sha256)!;
    if (canonicalJson(a) !== canonicalJson(b)) {
      result.rejections.push({ line: item.line, id: request.id, sha256: request.sha256, reasons: [`request ${request.sha256} (${request.id}) differs between two evaluations; it gets no fixture`] });
      continue;
    }
    accepted.push(item);
    signed.push({ path: join(out, manifest.component, `${request.sha256}.json`), id: request.id, text: renderFixture(signFixture(request.sha256, a, key)), line: item.line });
  }
  result.rejections.sort((x, y) => (x.line ?? Number.MAX_SAFE_INTEGER) - (y.line ?? Number.MAX_SAFE_INTEGER));
  result.accepted = accepted;
  if (signed.length > 0) {
    mkdirSync(join(out, manifest.component), { recursive: true });
  }
  for (const fixture of signed) {
    if (!existsSync(fixture.path) || readFileSync(fixture.path, "utf8") !== fixture.text) {
      writeFileSync(fixture.path, fixture.text);
    }
    result.written.push({ path: display(root, fixture.path), id: fixture.id });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Report

/** `text` as an inline code span that no backtick in it can close, on one line. */
export function codeSpan(text: string): string {
  const flat = text.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  const longest = Math.max(0, ...[...flat.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${flat}${pad}${fence}`;
}

/** The markdown report of a run, or of a failure when `error` is given. */
export function renderReport(storyId: string, result: StoryResult | null, error: string | null = null): string {
  const lines = [`### Oracle requests: Story ${storyId}`, ""];
  if (result === null) {
    lines.push(`**Failed:** ${codeSpan(error ?? "unknown error")}. No request was evaluated and no fixture was written.`, "");
    return lines.join("\n");
  }
  const rejected = result.rejections.filter((rejection) => rejection.line !== null).length;
  const fileProblems = result.rejections.length - rejected;
  const done = result.mode === "generate" ? `${result.written.length} signed fixture(s) written` : `${result.accepted.length} accepted`;
  lines.push(`${codeSpan(result.file)}: ${result.total} request line(s); ${done}, ${rejected} rejected${fileProblems > 0 ? `, ${fileProblems} file problem(s)` : ""}.`, "");
  if (result.mode === "generate" && result.written.length > 0) {
    lines.push(`**Signed fixtures** (Component ${codeSpan(result.component)}):`, "");
    lines.push(...result.written.map((fixture) => `- ${codeSpan(fixture.path)}: ${codeSpan(fixture.id)}`), "");
  }
  if (result.mode === "check" && result.accepted.length > 0) {
    lines.push(`**Accepted** (Component ${codeSpan(result.component)}):`, "");
    lines.push(...result.accepted.map(({ request, line }) => `- ${codeSpan(`${result.file}:${line}`)}: ${codeSpan(request.id)}`), "");
  }
  if (result.rejections.length > 0) {
    lines.push("**Rejected** (no fixture):", "");
    lines.push(...result.rejections.map((rejection) => `- ${codeSpan(renderRejection(result.file, rejection))}`), "");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI

export class UsageError extends Error {}

const USAGE = [
  "Usage:",
  "  bun tools/oracle/story.ts check <story-id> [--root <dir>] [--requests <file>] [--report <file>]",
  "  bun tools/oracle/story.ts generate <story-id> [--root <dir>] [--requests <file>] [--report <file>] [--out <dir>] [--image <ref> | --local <dir> [--php <bin>]]",
].join("\n");

export function parseOptions(argv: readonly string[]): StoryOptions {
  const [mode, storyId, ...args] = argv;
  if (mode !== "check" && mode !== "generate") {
    throw new UsageError(mode === undefined ? "Missing command: check or generate" : `Unknown command: ${mode}`);
  }
  if (storyId === undefined || !STORY_ID.test(storyId)) {
    throw new UsageError(`${mode} needs a Story ID <epic>.<story>${storyId === undefined ? "" : `, got ${JSON.stringify(storyId)}`}`);
  }
  const options: StoryOptions = { mode, storyId, root: resolve(import.meta.dir, "..", "..") };
  const allowed = mode === "check" ? ["--root", "--requests", "--report"] : ["--root", "--requests", "--report", "--out", "--image", "--local", "--php"];
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!allowed.includes(arg)) {
      throw new UsageError(`Unknown argument for ${mode}: ${arg}`);
    }
    if (seen.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    seen.add(arg);
    const value = args[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    switch (arg) {
      case "--root":
        options.root = resolve(value);
        break;
      case "--requests":
        options.requests = value;
        break;
      case "--report":
        options.report = value;
        break;
      case "--out":
        options.out = value;
        break;
      case "--image":
        options.image = value;
        break;
      case "--local":
        options.local = value;
        break;
      default:
        options.php = value;
    }
  }
  if (options.image !== undefined && options.local !== undefined) {
    throw new UsageError("--image and --local are exclusive");
  }
  if (options.php !== undefined && options.local === undefined) {
    throw new UsageError("--php needs --local");
  }
  return options;
}

/** What `main` reads from its surroundings: the environment (for ORACLE_SIGNING_KEY) and, in tests, a stand-in image runner. */
export interface MainDeps {
  env?: Readonly<Record<string, string | undefined>>;
  runner?: ImageRunner;
}

export function main(argv: readonly string[], deps: MainDeps = {}): number {
  const env = deps.env ?? process.env;
  let options: StoryOptions;
  try {
    options = parseOptions(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
  if (deps.runner !== undefined) {
    options.runner = deps.runner;
  }
  const writeReport = (text: string): void => {
    if (options.report !== undefined) {
      writeFileSync(resolve(options.report), text);
    }
  };
  let result: StoryResult;
  try {
    result = runStory(options, options.mode === "generate" ? (env[SIGNING_KEY_ENV] ?? null) : null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Oracle story requests failed: ${message}\n`);
    try {
      writeReport(renderReport(options.storyId, null, message));
    } catch (reportError) {
      process.stderr.write(`cannot write the report: ${reportError instanceof Error ? reportError.message : String(reportError)}\n`);
    }
    return 1;
  }
  try {
    writeReport(renderReport(options.storyId, result));
  } catch (error) {
    process.stderr.write(`Oracle story requests failed: cannot write the report: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const out: string[] = result.written.map((fixture) => `wrote ${fixture.path}`);
  const done = result.mode === "generate" ? `${result.written.length} signed fixture(s) written for Component ${result.component}` : `${result.accepted.length} accepted for Component ${result.component}`;
  if (result.rejections.length > 0) {
    process.stdout.write(out.map((line) => `${line}\n`).join(""));
    process.stderr.write(result.rejections.map((rejection) => `${renderRejection(result.file, rejection)}\n`).join(""));
    process.stderr.write(`Oracle story requests failed: Story ${result.storyId}: ${result.rejections.length} rejection(s) in ${result.file}; ${done}.\n`);
    return 1;
  }
  out.push(`Oracle story requests: Story ${result.storyId}: ${result.total} request(s) in ${result.file}; ${done}.`);
  process.stdout.write(out.map((line) => `${line}\n`).join(""));
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
