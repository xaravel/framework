// Per-Story Oracle requests (Story 3.4; FR-6, AD-15, AD-16).
//
// A Story asks the Oracle for expected values the batch does not cover (an
// Xaravel Differential suite, a dataset the extraction missed) by committing
// `conformance/oracle-requests/<story-id>.jsonl`: request lines in the batch's
// format (conformance/oracle/schema.json, tools/oracle/request.ts). Each line
// is judged on its own; a rejected line names `<file>:<line>` and its reason,
// and the other lines still count. A line is rejected when:
//
//   - it is not valid JSON, not {id, kind, input, sha256} in that order, fails
//     the schema, has a wrong `sha256`, or is not byte-identical to its
//     canonical rendering (Story 3.1's `validateRequest` / `renderRequest`);
//   - its `id` is in neither the manifest's `test_ids` nor its
//     `xaravel_test_ids` (`id <id> is not owned by Story <id>`);
//   - its `sha256` repeats an earlier line of the file;
//   - its `sha256` is a batch request (`conformance/oracle/requests/`): the
//     batch already evaluates and signs it (a candidate only, below);
//   - it is listed in `conformance/oracle/nondeterminism.jsonl`: a listed
//     request gets no fixture;
//   - its `id` is a Pest Test ID (`<suite>/tests/<file>::<description>`, a
//     suite of tools/inventory's `PEST_SUITES`): evaluate.php binds a request to a PHPUnit
//     TestCase, so a Pest ID would only ever become a signed `fatal` fixture
//     (Story 5.9, Epic 3 retro R6). The fixture generators refuse one too.
//
// Candidate and committed state (Story 5.6 AC5, Epic 3 retro R5). A candidate
// (`judgeStoryRequests` with the batch, as `oracle:story` judges a Story's file
// before it merges) is rejected for a batch request or a request another
// committed per-Story file holds. Once merged, the file stays valid:
// `readStoryRequestFiles` judges committed files with no batch, in merge order
// (./merge-order.ts), and a request an earlier-merged file holds is shadowed in
// a later file, not rejected. The earlier-merged Story owns it, and the batch
// extraction skips every request a merged per-Story file holds.
//
// A file that does not end with LF has one more, file-level problem; its last
// line is judged as it is. The manifest is `stories/<story-id>.md`, read by
// tools/ownership's `parseManifest`; the caller decides which checkout it
// comes from (in CI, main's).
//
// This module only reads and judges. tools/oracle/story.ts evaluates and signs
// the accepted requests, tools/oracle/verify.ts treats them as fixture
// sources, and tools/oracle/fixtures.ts keeps their fixtures. It never imports
// fixtures.ts (which imports it).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PEST_SUITES } from "../inventory/inventory";
import { parseManifest, STORIES_DIR, type Manifest } from "../ownership/ownership";
import { mergeOrder } from "./merge-order";
import { ORACLE_DIR } from "./oracle";
import { renderRequest, validateRequest, type JsonObject, type OracleRequest } from "./request";

export const STORY_REQUESTS_DIR = "conformance/oracle-requests";
const LISTING_FILE = `${ORACLE_DIR}/nondeterminism.jsonl`;
const STORY_ID = /^[1-9]\d*\.[1-9]\d*$/;
const STORY_FILE = /^([1-9]\d*\.[1-9]\d*)\.jsonl$/;
/** A Pest Test ID: `<suite>/tests/<file>.php::<description>[#<dataset>]` of a Pest suite (tools/inventory's `pestTestId`). */
const PEST_ID = new RegExp(`^(?:${PEST_SUITES.join("|")})/tests/[^\\n]*?\\.php::`);

/** Whether `id` is a Pest Test ID, which the Oracle cannot evaluate (Epic 3 retro R6). */
export function isPestTestId(id: string): boolean {
  return PEST_ID.test(id);
}

/** The rejection reason of a Pest Test ID request. */
export function pestReason(id: string): string {
  return `id ${id} is a Pest Test ID; the Oracle evaluates requests bound to a PHPUnit TestCase, so a Pest request can only fail with a fatal error and is never evaluated or signed`;
}

/** What the judge needs of a Story manifest. */
export type StoryManifest = Pick<Manifest, "storyId" | "component" | "testIds" | "xaravelTestIds">;

export interface AcceptedRequest {
  request: OracleRequest;
  /** 1-based line in the request file. */
  line: number;
}

export interface Rejection {
  /** 1-based line, or null for a problem of the whole file. */
  line: number | null;
  /** The request's `id` when the line parsed as a request, else null. */
  id: string | null;
  /** The request's `sha256` when the line parsed as a request, else null. */
  sha256: string | null;
  reasons: string[];
}

export interface Judgement {
  accepted: AcceptedRequest[];
  rejections: Rejection[];
}

/** The rejection's line: `<file>:<line>: <reasons>` (or `<file>: …` for the file itself). */
export function renderRejection(file: string, rejection: Rejection): string {
  return `${rejection.line === null ? file : `${file}:${rejection.line}`}: ${rejection.reasons.join("; ")}`;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Judges one per-Story request file's text. `file` labels it (repo-relative); `batch` maps each batch request's
 * `sha256` to its repo-relative request file; `listed` maps each listed `sha256` to its line in the listing.
 */
export function judgeStoryRequests(
  text: string,
  file: string,
  manifest: StoryManifest,
  schema: JsonObject,
  batch: ReadonlyMap<string, string>,
  listed: ReadonlyMap<string, number>,
): Judgement {
  const accepted: AcceptedRequest[] = [];
  const rejections: Rejection[] = [];
  if (text === "") {
    return { accepted, rejections };
  }
  const terminated = text.endsWith("\n");
  const lines = (terminated ? text.slice(0, -1) : text).split("\n");
  const owned = new Set([...manifest.testIds, ...manifest.xaravelTestIds]);
  const seen = new Map<string, number>();
  lines.forEach((line, index) => {
    const number = index + 1;
    const reject = (reasons: string[], request: OracleRequest | null = null): void => {
      rejections.push({ line: number, id: request?.id ?? null, sha256: request?.sha256 ?? null, reasons });
    };
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch (error) {
      reject([`malformed JSON: ${error instanceof Error ? error.message : String(error)}`]);
      return;
    }
    if (!isObject(value) || Object.keys(value).join(",") !== "id,kind,input,sha256") {
      reject(["expected the keys id, kind, input, sha256 in that order"]);
      return;
    }
    const errors = validateRequest(value, schema);
    if (errors.length > 0) {
      reject(errors);
      return;
    }
    const request = value as unknown as OracleRequest;
    if (renderRequest(request) !== line) {
      reject([`the line is not in canonical form (compact JSON, no escaped "/", keys in order); expected ${renderRequest(request)}`], request);
      return;
    }
    const reasons: string[] = [];
    if (isPestTestId(request.id)) {
      reasons.push(pestReason(request.id));
    }
    if (!owned.has(request.id)) {
      reasons.push(`id ${request.id} is not owned by Story ${manifest.storyId}; it is in neither test_ids nor xaravel_test_ids of ${STORIES_DIR}/${manifest.storyId}.md`);
    }
    const earlier = seen.get(request.sha256);
    if (earlier !== undefined) {
      reasons.push(`sha256 ${request.sha256} repeats line ${earlier}`);
    } else {
      seen.set(request.sha256, number);
    }
    const batchFile = batch.get(request.sha256);
    if (batchFile !== undefined) {
      reasons.push(`request ${request.sha256} is a batch request in ${batchFile}; the batch already evaluates it`);
    }
    const listing = listed.get(request.sha256);
    if (listing !== undefined) {
      reasons.push(`request ${request.sha256} is listed in ${LISTING_FILE}:${listing}; a listed request gets no fixture`);
    }
    if (reasons.length > 0) {
      reject(reasons, request);
    } else {
      accepted.push({ request, line: number });
    }
  });
  if (!terminated) {
    rejections.push({ line: null, id: null, sha256: null, reasons: ["the file must end with a newline"] });
  }
  return { accepted, rejections };
}

export interface StoryRequestFile {
  /** Repo-relative path, `conformance/oracle-requests/<story-id>.jsonl`. */
  file: string;
  /** The Story ID from the file name, or null when the name is not `<story-id>.jsonl`. */
  storyId: string | null;
  /** The manifest's Component, or null when there is no valid manifest. */
  component: string | null;
  /** The requests this file owns: accepted, and held by no earlier-merged file. */
  accepted: AcceptedRequest[];
  /** Accepted requests an earlier-merged file already owns (Story 5.6 AC5): valid, but not this file's. */
  shadowed: ShadowedRequest[];
  rejections: Rejection[];
}

export interface ShadowedRequest extends AcceptedRequest {
  /** The owner's `<file>:<line>`. */
  owner: string;
}

/** The repo-relative manifest path of a Story. */
export function manifestPath(storyId: string): string {
  return `${STORIES_DIR}/${storyId}.md`;
}

/**
 * The manifest `stories/<id>.md` under `root`; throws naming the cause when the Story ID is malformed, the manifest
 * is missing, or it is invalid (fail closed).
 */
export function readStoryManifest(root: string, storyId: string): Manifest {
  if (!STORY_ID.test(storyId)) {
    throw new Error(`${JSON.stringify(storyId)} is not a Story ID <epic>.<story>`);
  }
  const file = manifestPath(storyId);
  const path = join(root, file);
  if (!existsSync(path)) {
    throw new Error(`${file} is missing; a per-Story request file needs its Story's manifest on the base branch`);
  }
  const parsed = parseManifest(file, readFileSync(path, "utf8"));
  if (parsed.manifest === null) {
    throw new Error(parsed.violations.join("; "));
  }
  return parsed.manifest;
}

/**
 * Reads and judges every committed `conformance/oracle-requests/*` entry under `root`, in merge order
 * (./merge-order.ts; throws on a shallow repository). A name other than `<story-id>.jsonl`, or a Story without a valid
 * manifest, is a file-level rejection with nothing accepted. Committed files are judged with no batch: a merged file
 * stays valid when the batch later produces one of its requests. A request accepted in an earlier-merged file is
 * shadowed in a later one, so each accepted `sha256` has one source, its owner. `skip` (a repo-relative path) is left
 * out.
 */
export function readStoryRequestFiles(root: string, schema: JsonObject, listed: ReadonlyMap<string, number>, skip: string | null = null): StoryRequestFile[] {
  const dir = join(root, STORY_REQUESTS_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`${STORY_REQUESTS_DIR} is not a directory`);
  }
  const out: StoryRequestFile[] = [];
  const owners = new Map<string, string>();
  const entries = new Map(readdirSync(dir, { withFileTypes: true }).map((entry) => [entry.name, entry] as const));
  const noBatch = new Map<string, string>();
  for (const entryName of mergeOrder(root, [...entries.keys()])) {
    const entry = entries.get(entryName)!;
    const file = `${STORY_REQUESTS_DIR}/${entry.name}`;
    if (file === skip) {
      continue;
    }
    const fileProblem = (reason: string, storyId: string | null = null): StoryRequestFile => ({ file, storyId, component: null, accepted: [], shadowed: [], rejections: [{ line: null, id: null, sha256: null, reasons: [reason] }] });
    const name = STORY_FILE.exec(entry.name);
    if (!entry.isFile() || name === null) {
      out.push(fileProblem(`not a per-Story request file; ${STORY_REQUESTS_DIR}/ holds only <story-id>.jsonl files`));
      continue;
    }
    const storyId = name[1]!;
    let manifest: Manifest;
    try {
      manifest = readStoryManifest(root, storyId);
    } catch (error) {
      out.push(fileProblem(`no valid manifest: ${error instanceof Error ? error.message : String(error)}`, storyId));
      continue;
    }
    const judged = judgeStoryRequests(readFileSync(join(dir, entry.name), "utf8"), file, manifest, schema, noBatch, listed);
    const accepted: AcceptedRequest[] = [];
    const shadowed: ShadowedRequest[] = [];
    for (const item of judged.accepted) {
      const owner = owners.get(item.request.sha256);
      if (owner !== undefined) {
        shadowed.push({ ...item, owner });
        continue;
      }
      owners.set(item.request.sha256, `${file}:${item.line}`);
      accepted.push(item);
    }
    out.push({ file, storyId, component: manifest.component, accepted, shadowed, rejections: judged.rejections });
  }
  return out;
}
