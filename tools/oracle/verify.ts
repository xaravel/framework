// Oracle fixture verification (Story 3.3; FR-6, AD-15).
//
//   bun tools/oracle/verify.ts [--root <dir>]
//       checks every committed fixture `conformance/fixtures/<component>/<sha256>.json`:
//       its Ed25519 signature verifies against `conformance/oracle/oracle.pub`
//       and its form is the canonical one (tools/oracle/fixtures.ts's
//       `verifyFixture`), its file name is `<its sha256>.json`, and that
//       `sha256` names a committed request in its Component's request file
//       `conformance/oracle/requests/<component>.jsonl` that is not listed in
//       `conformance/oracle/nondeterminism.jsonl` (a listed request gets no
//       fixture, ESC-3.2-1), or an accepted per-Story request (Story 3.4)
//       in `conformance/oracle-requests/<story-id>.jsonl` whose manifest
//       `stories/<story-id>.md` names that Component. Any other file or
//       directory under `conformance/fixtures/` fails too.
//       `conformance/fixtures/generators/` (generator reference files, never
//       signed) is skipped.
//
//       Every per-Story request file is judged as tools/oracle/story-requests.ts
//       judges it: each rejected line is a violation `<path>:<line>: …` (a
//       malformed or non-canonical line, an id the Story does not own, a
//       repeated sha256, a batch request, a listed request, a request already
//       in another per-Story file), and so is a file without a valid manifest.
//
// `conformance/fixtures/` is not a Protected Path and has no CODEOWNERS owner:
// fixtures are protected by signature, not by path, and this check is what
// makes that hold. CI's `check` job runs it on every PR, merge-queue run and
// push to main. It is pure Bun: no container, no PHP, no network.
//
// Each violation is one stderr line prefixed with the file's repo-relative
// path. A missing or invalid oracle.pub, or an unreadable request file or
// listing, fails closed naming the cause. No fixtures (or no
// `conformance/fixtures/`) passes.
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
import type { KeyObject } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { FIXTURES_DIR, GENERATORS, NONDETERMINISM_FILE, PUBLIC_KEY_FILE, readCommittedRequests, readNondeterminism, readPublicKey, readStoryRequests, verifyFixture } from "./fixtures";
import { compareUnits, REQUESTS_DIR } from "./request";
import { renderRejection, STORY_REQUESTS_DIR } from "./story-requests";

const FIXTURE_NAME = /^([0-9a-f]{64})\.json$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Where a committed request lives: its Component and the repo-relative file that holds it. */
export interface RequestSource {
  component: string;
  file: string;
  id: string;
  /** The Story of a per-Story request (Story 3.4), or null for a batch request. */
  storyId: string | null;
}

export interface CommittedRequests {
  requests: Map<string, RequestSource>;
  /** The Components with a batch request file. */
  components: Set<string>;
  /** The Components with an accepted per-Story request and no batch request file. */
  storyComponents: Set<string>;
  /** One line per rejected per-Story request or request file, `<path>[:<line>]: …`. */
  violations: string[];
}

/**
 * Every committed request a fixture may be for, by `sha256`: the batch's (`conformance/oracle/requests/`) and each
 * accepted per-Story request (`conformance/oracle-requests/`, in its manifest's Component). This is the one lookup
 * the verifier uses.
 */
export function committedRequests(root: string): CommittedRequests {
  const requests = new Map<string, RequestSource>();
  const components = new Set<string>();
  const batch = readCommittedRequests(root);
  for (const { component, file, requests: list } of batch) {
    components.add(component);
    for (const request of list) {
      requests.set(request.sha256, { component, file: `${REQUESTS_DIR}/${file}`, id: request.id, storyId: null });
    }
  }
  const storyComponents = new Set<string>();
  const violations: string[] = [];
  for (const story of readStoryRequests(root, batch, readNondeterminism(root))) {
    violations.push(...story.rejections.map((rejection) => renderRejection(story.file, rejection)));
    if (story.component === null) {
      continue;
    }
    for (const { request } of story.accepted) {
      requests.set(request.sha256, { component: story.component, file: story.file, id: request.id, storyId: story.storyId });
    }
    if (story.accepted.length > 0 && !components.has(story.component)) {
      storyComponents.add(story.component);
    }
  }
  return { requests, components, storyComponents, violations };
}

/** The verification key `conformance/oracle/oracle.pub` under `root`; throws naming it when missing or not Ed25519. */
export function verificationKey(root: string): KeyObject {
  const file = join(root, PUBLIC_KEY_FILE);
  if (!existsSync(file)) {
    throw new Error(`${PUBLIC_KEY_FILE} is missing; fixtures cannot be verified without it`);
  }
  let pem: string;
  try {
    pem = readFileSync(file, "utf8");
  } catch (error) {
    throw new Error(`${PUBLIC_KEY_FILE} is unreadable: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return readPublicKey(pem, PUBLIC_KEY_FILE);
}

export interface VerifyResult {
  /** The fixture files examined: the files in a Component directory named `<sha256>.json`. */
  count: number;
  /** One line per problem, each `<repo-relative path>: <problem>`, sorted by path. */
  violations: string[];
}

/** The `sha256` field of a fixture's text, or null when the text has none in the right form. */
function fixtureSha(text: string): string | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const sha = (value as Record<string, unknown>)["sha256"];
      return typeof sha === "string" && SHA256.test(sha) ? sha : null;
    }
  } catch {
    // verifyFixture reports the parse problem.
  }
  return null;
}

/**
 * Verifies every committed fixture under `root`. Throws (fail closed) when oracle.pub is missing or invalid, or the
 * request files or the non-determinism listing cannot be read.
 */
export function verifyFixtures(root: string): VerifyResult {
  const key = verificationKey(root);
  const { requests, components, storyComponents, violations } = committedRequests(root);
  const listed = new Map(readNondeterminism(root).map((entry) => [entry.sha256, entry]));

  const dir = join(root, FIXTURES_DIR);
  if (!existsSync(dir)) {
    return { count: 0, violations: violations.sort(compareUnits) };
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`${FIXTURES_DIR} is not a directory`);
  }

  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => compareUnits(a.name, b.name))) {
    const at = `${FIXTURES_DIR}/${entry.name}`;
    if (entry.name === GENERATORS && entry.isDirectory()) {
      continue;
    }
    if (!entry.isDirectory()) {
      violations.push(`${at}: not a Component directory; ${FIXTURES_DIR}/ holds only <component>/<sha256>.json fixtures and ${GENERATORS}/`);
      continue;
    }
    const component = entry.name;
    const batchKnown = components.has(component);
    const known = batchKnown || storyComponents.has(component);
    for (const file of readdirSync(join(dir, component), { withFileTypes: true }).sort((a, b) => compareUnits(a.name, b.name))) {
      const path = `${at}/${file.name}`;
      if (file.isDirectory()) {
        violations.push(`${path}/: a directory; a Component directory holds only <sha256>.json fixtures`);
        continue;
      }
      if (!file.isFile()) {
        violations.push(`${path}: not a regular file`);
        continue;
      }
      const problems: string[] = [];
      const name = FIXTURE_NAME.exec(file.name);
      if (name !== null) {
        count++;
      } else {
        problems.push("the file name is not <sha256>.json (64 lowercase hex characters)");
      }
      let text: string | null = null;
      try {
        text = readFileSync(join(dir, component, file.name), "utf8");
      } catch (error) {
        problems.push(`unreadable: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (text !== null) {
        problems.push(...verifyFixture(text, key));
        const sha = fixtureSha(text);
        if (sha !== null && name !== null && name[1] !== sha) {
          problems.push(`the file name is not its sha256 ${sha}`);
        }
        const source = sha === null ? undefined : requests.get(sha);
        if (!known) {
          problems.push(`no committed request file ${REQUESTS_DIR}/${component}.jsonl for Component ${component}`);
        } else if (sha !== null && source === undefined) {
          problems.push(
            batchKnown
              ? `no committed request with sha256 ${sha} in ${REQUESTS_DIR}/${component}.jsonl`
              : `no committed request with sha256 ${sha} in an accepted per-Story request file of Component ${component}`,
          );
        } else if (sha !== null && source !== undefined && source.component !== component) {
          problems.push(
            source.storyId === null
              ? `request ${sha} is in ${source.file}, not ${REQUESTS_DIR}/${component}.jsonl`
              : `request ${sha} is in ${source.file}, a request of Story ${source.storyId}'s Component ${source.component}, not ${component}`,
          );
        }
        const entry = sha === null ? undefined : listed.get(sha);
        if (entry !== undefined) {
          problems.push(`request ${sha} (${entry.id}) is listed in ${NONDETERMINISM_FILE}:${entry.line}; a listed request gets no fixture`);
        }
      }
      violations.push(...problems.map((problem) => `${path}: ${problem}`));
    }
  }
  // Sort the lines themselves: per-directory name order is not path order (`view-x` < `view/…`).
  return { count, violations: violations.sort(compareUnits) };
}

// ---------------------------------------------------------------------------
// CLI

export class UsageError extends Error {}

const USAGE = ["Usage:", "  bun tools/oracle/verify.ts [--root <dir>]"].join("\n");

export function parseOptions(argv: readonly string[]): { root: string } {
  const options = { root: resolve(import.meta.dir, "..", "..") };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (seen.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    seen.add(arg);
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    options.root = resolve(value);
  }
  return options;
}

export function main(argv: readonly string[]): number {
  try {
    const { root } = parseOptions(argv);
    const { count, violations } = verifyFixtures(root);
    if (violations.length > 0) {
      process.stderr.write(violations.map((line) => `${line}\n`).join(""));
      const where = violations.some((line) => line.startsWith(`${STORY_REQUESTS_DIR}/`)) ? `${FIXTURES_DIR}/ and ${STORY_REQUESTS_DIR}/` : `${FIXTURES_DIR}/`;
      process.stderr.write(`Oracle fixture verification failed: ${violations.length} problem(s) under ${where} (${count} fixtures examined).\n`);
      return 1;
    }
    process.stdout.write(`Oracle fixtures OK: ${count} fixtures verify against ${PUBLIC_KEY_FILE}.\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Oracle fixture verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
