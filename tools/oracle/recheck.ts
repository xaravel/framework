// The nightly Oracle fixture recheck (Story 5.7, Epic 3 retro S5; FR-6, AD-15,
// AD-28).
//
//   bun tools/oracle/recheck.ts [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]
//       (`bun run oracle:recheck`) re-evaluates every committed request once
//       and compares the output with its committed fixture. A fixture's
//       signature binds neither the Baseline Pin nor the image, so without
//       this a fixture signed before a Pin bump could stay stale unnoticed.
//
// The requests: every batch request (`conformance/oracle/requests/*.jsonl`)
// under its Component, except those listed in
// `conformance/oracle/nondeterminism.jsonl` (they get no fixture) and those an
// accepted merged per-Story file holds (`storyHeldShas`: that Story's fixture
// covers them); plus every per-Story request
// (`conformance/oracle-requests/<story-id>.jsonl`), accepted or shadowed,
// under its manifest's Component. Each `(Component, sha256)` counts once.
//
// Each request whose fixture `conformance/fixtures/<component>/<sha256>.json`
// exists is evaluated once with tools/oracle/evaluate.php (`evaluateOnce`,
// `parsePass`), in the Oracle image (default `oracleImage(root)`, the locally
// built image at the current tag; or `--image <ref>`) or, with `--local <dir>`,
// with the local PHP (or `--php <bin>`) against a locked install of the
// framework snapshot. Its canonical JSON is compared with the fixture's
// `output`. Each differing fixture prints
//
//   stale fixture: conformance/fixtures/<c>/<sha>.json (<id>): committed <digest> vs evaluated <digest>
//
// (digests are `outputDigest`, the SHA-256 of the canonical JSON), then
//
//   Oracle recheck: <n> fixtures compared, <d> differ, <m> requests without a fixture
//
// all on stdout. A request with no fixture is counted, never failed (the
// verify-fixtures check owns missing fixtures). It never signs or writes
// anything outside a temp directory.
//
// Exit codes: 0 when no fixture differs, 1 when one does or anything fails
// (an unreadable fixture, a failed evaluation; `Oracle recheck failed: …` on
// stderr), 2 on a usage error.
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkLocalInstall, evaluateOnce, FIXTURES_DIR, outputDigest, parsePass, readCommittedRequests, readNondeterminism, readStoryRequests, storyHeldShas, type FixturesOptions } from "./fixtures";
import { canonicalJson, compareUnits, renderRequest, type Json, type OracleRequest } from "./request";

export class UsageError extends Error {}

export type RecheckOptions = Pick<FixturesOptions, "image" | "local" | "php" | "runner">;

export interface StaleFixture {
  /** Repo-relative fixture path. */
  readonly file: string;
  readonly id: string;
  readonly committed: string;
  readonly evaluated: string;
}

export interface RecheckResult {
  readonly compared: number;
  readonly stale: StaleFixture[];
  readonly withoutFixture: number;
}

interface Item {
  readonly component: string;
  readonly request: OracleRequest;
}

/** Every request the recheck covers, each `(component, sha256)` once, sorted by Component then sha256. */
export function recheckItems(root: string): Item[] {
  const listing = readNondeterminism(root);
  const listed = new Set(listing.map((entry) => entry.sha256));
  const held = storyHeldShas(root);
  const items = new Map<string, Item>();
  const add = (component: string, request: OracleRequest): void => {
    const key = `${component}/${request.sha256}`;
    if (!items.has(key)) {
      items.set(key, { component, request });
    }
  };
  for (const entry of readCommittedRequests(root)) {
    for (const request of entry.requests) {
      if (!listed.has(request.sha256) && !held.has(request.sha256)) {
        add(entry.component, request);
      }
    }
  }
  for (const story of readStoryRequests(root, listing)) {
    if (story.component === null) {
      continue;
    }
    for (const { request } of [...story.accepted, ...story.shadowed]) {
      add(story.component, request);
    }
  }
  return [...items.values()].sort((a, b) => compareUnits(a.component, b.component) || compareUnits(a.request.sha256, b.request.sha256));
}

/** The committed fixture's output; throws naming the file when it is not a fixture. */
function committedOutput(root: string, file: string): Json {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(root, file), "utf8")) as unknown;
  } catch (error) {
    throw new Error(`${file} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("output" in value)) {
    throw new Error(`${file} has no output`);
  }
  return (value as { output: Json }).output;
}

/** Re-evaluates every covered request with a committed fixture and compares (see the header). */
export function recheck(rootArg: string, options: RecheckOptions = {}): RecheckResult {
  const root = resolve(rootArg);
  const items = recheckItems(root);
  const withFixture: { item: Item; file: string; output: Json }[] = [];
  let withoutFixture = 0;
  for (const item of items) {
    const file = `${FIXTURES_DIR}/${item.component}/${item.request.sha256}.json`;
    if (existsSync(join(root, file))) {
      withFixture.push({ item, file, output: committedOutput(root, file) });
    } else {
      withoutFixture++;
    }
  }
  const stale: StaleFixture[] = [];
  if (withFixture.length === 0) {
    return { compared: 0, stale, withoutFixture };
  }
  if (options.local !== undefined) {
    checkLocalInstall(root, options.local);
  }
  // Each request is evaluated once, however many Components hold its fixture.
  const unique = new Map<string, OracleRequest>();
  for (const { item } of withFixture) {
    unique.set(item.request.sha256, item.request);
  }
  const requests = [...unique.values()];
  const dir = mkdtempSync(join(tmpdir(), "xaravel-oracle-recheck-"));
  let pass: Map<string, Json>;
  try {
    const name = "recheck.jsonl";
    writeFileSync(join(dir, name), requests.map((request) => `${renderRequest(request)}\n`).join(""));
    // The image runs as another user: the directory and file must be readable to it.
    chmodSync(dir, 0o755);
    chmodSync(join(dir, name), 0o644);
    pass = parsePass(evaluateOnce(root, dir, [name], options), requests, "recheck pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const { item, file, output } of withFixture) {
    const evaluated = pass.get(item.request.sha256)!;
    if (canonicalJson(evaluated) !== canonicalJson(output)) {
      stale.push({ file, id: item.request.id, committed: outputDigest(output), evaluated: outputDigest(evaluated) });
    }
  }
  return { compared: withFixture.length, stale, withoutFixture };
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = "Usage: bun tools/oracle/recheck.ts [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]";

export function parseOptions(argv: readonly string[]): { root: string } & RecheckOptions {
  const options: { root: string } & RecheckOptions = { root: resolve(import.meta.dir, "..", "..") };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!["--root", "--image", "--local", "--php"].includes(arg)) {
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
    if (arg === "--root") {
      options.root = resolve(value);
    } else if (arg === "--image") {
      options.image = value;
    } else if (arg === "--local") {
      options.local = value;
    } else {
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

/** What `main` reads from its surroundings: in tests, a stand-in image runner. */
export interface MainDeps {
  runner?: RecheckOptions["runner"];
}

export function main(argv: readonly string[], deps: MainDeps = {}): number {
  try {
    const { root, ...options } = parseOptions(argv);
    if (deps.runner !== undefined) {
      options.runner = deps.runner;
    }
    const result = recheck(root, options);
    const lines = result.stale.map((entry) => `stale fixture: ${entry.file} (${entry.id}): committed ${entry.committed} vs evaluated ${entry.evaluated}`);
    lines.push(`Oracle recheck: ${result.compared} fixtures compared, ${result.stale.length} differ, ${result.withoutFixture} requests without a fixture`);
    process.stdout.write(lines.map((line) => `${line}\n`).join(""));
    return result.stale.length > 0 ? 1 : 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Oracle recheck failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
