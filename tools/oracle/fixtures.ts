// Batch Oracle fixture generation and Ed25519 signing (Story 3.2,
// decisions/ESC-3.2-1.md; FR-6, AD-15).
//
//   bun tools/oracle/fixtures.ts [--root <dir>] [--out <dir>] [--image <ref> | --local <dir> [--php <bin>]]
//       evaluates every committed request (`conformance/oracle/requests/*.jsonl`)
//       twice with tools/oracle/evaluate.php, compares the two passes per
//       request, signs each output with the Ed25519 key in env
//       ORACLE_SIGNING_KEY (PKCS#8 PEM; never read from anywhere else, never
//       written anywhere), and writes `<out>/<component>/<sha256>.json`
//       (`<out>` defaults to `conformance/fixtures`). It replaces the `*.json`
//       files of each Component it writes, deleting stray ones, and never
//       touches `conformance/fixtures/generators/` or the fixture of an
//       accepted per-Story request (`conformance/oracle-requests/`, Story 3.4)
//       in its manifest's Component directory. The key's public half must
//       equal `conformance/oracle/oracle.pub` (SPKI PEM). By default
//       evaluate.php runs in the Oracle image (`xaravel-oracle:<oracle tag>`,
//       or `--image <ref>`) through tools/oracle's `runInImage`, with the
//       script and the request files mounted read-only; with `--local <dir>`
//       it runs with the local PHP (or `--php <bin>`) against a locked install
//       of the framework snapshot in `<dir>`.
//
//   … --determinism
//       the same two passes and comparison, without a key; writes no fixtures.
//
//   … fingerprint [--root <dir>]
//       prints the lowercase hex SHA-256 of `conformance/oracle/oracle.pub`'s
//       SPKI DER, the fingerprint docs/ops/oracle.md records.
//
// Determinism (ESC-3.2-1): `conformance/oracle/nondeterminism.jsonl` lists the
// known random requests, one `{"sha256","id","reason"}` line each, sorted by
// `id` then `sha256`. A listed request gets no fixture. A difference in an
// unlisted request writes no fixture, writes
// `conformance/escalations/ESC-bot-<n>.md` (the next free `n`) and fails. A
// listed `sha256` that is not a committed request, whose `id` differs from
// the request's, or whose two outputs are identical fails the run too.
//
// A fixture is one line: {"sha256":…,"output":<canonical JSON>,"signature":…}
// and LF. `signature` is the base64 Ed25519 signature of `fixtureMessage`: the
// UTF-8 bytes of `xaravel-oracle-fixture-v1\n` and `canonicalJson({output,
// sha256})`. Ed25519 is deterministic, so two runs give identical bytes.
//
// Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error.
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEscalation, parseEscalationId, ESCALATIONS_DIR } from "../escalations/escalations";
import { checkLocalCopy, oracleImage, type ImageRunner } from "../inventory/inventory";
import { upstreamPath, UPSTREAM_DIR } from "../upstream/upstream";
import { IMAGE_UPSTREAM_DIR, ORACLE_DIR, PHP_VERSION, runInImage } from "./oracle";
import { canonicalJson, compareUnits, parseRequests, readSchema, renderJson, REQUESTS_DIR, type Json, type OracleRequest } from "./request";
import { readStoryRequestFiles, STORY_REQUESTS_DIR, type StoryRequestFile } from "./story-requests";

export const FIXTURES_DIR = "conformance/fixtures";
/**
 * A Component name: the form the `story` job's commit step in .github/workflows/oracle.yml accepts for
 * `conformance/fixtures/<component>/<sha256>.json`, and the one tools/ownership/ownership.ts checks, so the batch
 * never signs a fixture for a name the commit step refuses (XT-conformance-77 derives the commit pattern from it).
 */
export const COMPONENT_NAME = /^[a-z][a-z0-9-]*$/;
/** Reference files for generator output (never Oracle-generated); the batch never touches them. */
export const GENERATORS = "generators";
export const PUBLIC_KEY_FILE = `${ORACLE_DIR}/oracle.pub`;
export const NONDETERMINISM_FILE = `${ORACLE_DIR}/nondeterminism.jsonl`;
export const EVALUATE_SCRIPT = "tools/oracle/evaluate.php";
export const SIGNING_KEY_ENV = "ORACLE_SIGNING_KEY";
/** The domain prefix of every signed fixture message, so a fixture signature is never valid for another object. */
export const FIXTURE_DOMAIN = "xaravel-oracle-fixture-v1\n";

/** Where image mode mounts the evaluator and the request files. */
const IMAGE_EVALUATE = "/xaravel/evaluate.php";
const IMAGE_REQUESTS = "/xaravel/requests";

const SHA256 = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Fixtures and signatures

export interface Fixture {
  sha256: string;
  output: Json;
  signature: string;
}

/** The bytes a fixture's signature covers: the domain prefix and the canonical `{output, sha256}`. */
export function fixtureMessage(sha256: string, output: Json): Buffer {
  return Buffer.from(`${FIXTURE_DOMAIN}${canonicalJson({ output, sha256 })}`, "utf8");
}

/** The fixture file's text: one compact line (`output` canonical) and LF. */
export function renderFixture(fixture: Fixture): string {
  return `{"sha256":${JSON.stringify(fixture.sha256)},"output":${canonicalJson(fixture.output)},"signature":${JSON.stringify(fixture.signature)}}\n`;
}

/** The signed fixture of one output. */
export function signFixture(sha256: string, output: Json, key: KeyObject): Fixture {
  return { sha256, output, signature: sign(null, fixtureMessage(sha256, output), key).toString("base64") };
}

/** The SPKI DER of a public key PEM (or of a key object's public half). */
function spkiDer(key: KeyObject): Buffer {
  return key.export({ type: "spki", format: "der" });
}

/** Parses an Ed25519 public key PEM; throws naming `label` when it is not one. */
export function readPublicKey(pem: string, label: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({ key: pem, format: "pem" });
  } catch (error) {
    throw new Error(`${label} is not a PEM public key: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`${label} is not an Ed25519 key (it is ${key.asymmetricKeyType ?? "unknown"})`);
  }
  return key;
}

/** The lowercase hex SHA-256 of the key's SPKI DER. */
export function keyFingerprint(key: KeyObject): string {
  return createHash("sha256").update(spkiDer(key)).digest("hex");
}

/**
 * The problems of one fixture file's text, or [] when it is a valid fixture whose signature verifies with
 * `publicKey` (and, when given, whose `sha256` is `sha256`). Story 3.3 verifies committed fixtures with this.
 */
export function verifyFixture(text: string, publicKey: KeyObject | string, sha256: string | null = null): string[] {
  let key: KeyObject;
  try {
    key = typeof publicKey === "string" ? readPublicKey(publicKey, "the public key") : publicKey;
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return [`not JSON: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).join(",") !== "sha256,output,signature") {
    return ["expected an object with the keys sha256, output, signature in that order"];
  }
  const fixture = value as Fixture;
  const problems: string[] = [];
  if (typeof fixture.sha256 !== "string" || !SHA256.test(fixture.sha256)) {
    problems.push("sha256 is not 64 lowercase hex characters");
  } else if (sha256 !== null && fixture.sha256 !== sha256) {
    problems.push(`sha256 ${fixture.sha256} is not ${sha256}`);
  }
  if (
    typeof fixture.signature !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(fixture.signature) ||
    Buffer.from(fixture.signature, "base64").toString("base64") !== fixture.signature ||
    Buffer.from(fixture.signature, "base64").length !== 64
  ) {
    problems.push("signature is not the canonical base64 of 64 bytes");
  }
  if (problems.length > 0) {
    return problems;
  }
  let rendered: string;
  try {
    rendered = renderFixture(fixture);
  } catch (error) {
    return [`output has no JSON form: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (rendered !== text) {
    problems.push("the file is not in canonical form (one compact line, output in canonical JSON, LF)");
  }
  if (!verify(null, fixtureMessage(fixture.sha256, fixture.output), key, Buffer.from(fixture.signature, "base64"))) {
    problems.push("the signature does not verify");
  }
  return problems;
}

/**
 * The signing key from the PEM in `pem` (env ORACLE_SIGNING_KEY), checked against `conformance/oracle/oracle.pub`
 * under `root`. Throws naming what is missing, or `signing key does not match …`.
 */
export function signingKey(root: string, pem: string | null | undefined): KeyObject {
  if (pem === null || pem === undefined || pem.trim() === "") {
    throw new Error(`${SIGNING_KEY_ENV} is not set; the batch signs fixtures only with the key from the Oracle job's secret`);
  }
  const pubFile = join(root, PUBLIC_KEY_FILE);
  if (!existsSync(pubFile)) {
    throw new Error(`${PUBLIC_KEY_FILE} is missing; the Maintainer commits it with its fingerprint in docs/ops/oracle.md`);
  }
  const pub = readPublicKey(readFileSync(pubFile, "utf8"), PUBLIC_KEY_FILE);
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: pem, format: "pem" });
  } catch {
    // Never echo the key material or the parser's view of it.
    throw new Error(`${SIGNING_KEY_ENV} is not a PEM private key`);
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`${SIGNING_KEY_ENV} is not an Ed25519 key`);
  }
  if (!spkiDer(createPublicKey(key)).equals(spkiDer(pub))) {
    throw new Error(`signing key does not match ${PUBLIC_KEY_FILE}`);
  }
  return key;
}

/** The fingerprint of `conformance/oracle/oracle.pub` under `root`. */
export function fingerprint(root: string): string {
  const file = join(root, PUBLIC_KEY_FILE);
  if (!existsSync(file)) {
    throw new Error(`${PUBLIC_KEY_FILE} is missing`);
  }
  return keyFingerprint(readPublicKey(readFileSync(file, "utf8"), PUBLIC_KEY_FILE));
}

// ---------------------------------------------------------------------------
// Requests and the non-determinism list

export interface ComponentRequests {
  component: string;
  /** The request file name, `<component>.jsonl`. */
  file: string;
  requests: OracleRequest[];
}

/** Every committed request file under `root`, parsed and validated, sorted by Component. */
export function readCommittedRequests(root: string): ComponentRequests[] {
  const dir = join(root, REQUESTS_DIR);
  if (!existsSync(dir)) {
    throw new Error(`${REQUESTS_DIR} is missing; run bun run oracle:extract`);
  }
  const schema = readSchema(root);
  const out: ComponentRequests[] = [];
  const seen = new Map<string, string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort(compareUnits)) {
    const component = file.slice(0, -".jsonl".length);
    if (component === GENERATORS || !COMPONENT_NAME.test(component)) {
      throw new Error(`${REQUESTS_DIR}/${file} is not a Component's request file`);
    }
    const requests = parseRequests(readFileSync(join(dir, file), "utf8"), `${REQUESTS_DIR}/${file}`, schema);
    for (const request of requests) {
      const other = seen.get(request.sha256);
      if (other !== undefined) {
        throw new Error(`${REQUESTS_DIR}/${file}: request ${request.sha256} is also in ${other}`);
      }
      seen.set(request.sha256, `${REQUESTS_DIR}/${file}`);
    }
    out.push({ component, file, requests });
  }
  if (out.length === 0) {
    throw new Error(`${REQUESTS_DIR} holds no request files; run bun run oracle:extract`);
  }
  return out;
}

export interface NondeterministicRequest {
  sha256: string;
  id: string;
  reason: string;
  /** 1-based line in the file. */
  line: number;
}

/** The line of one listing, without the newline. */
export function renderNondeterminism(entry: Pick<NondeterministicRequest, "sha256" | "id" | "reason">): string {
  return renderJson({ sha256: entry.sha256, id: entry.id, reason: entry.reason });
}

/**
 * Parses `conformance/oracle/nondeterminism.jsonl`; throws `<file>:<line>: …` on a line that is not
 * `{"sha256","id","reason"}` in compact canonical form, out of order, or a duplicate.
 */
export function parseNondeterminism(text: string, file: string = NONDETERMINISM_FILE): NondeterministicRequest[] {
  if (text !== "" && !text.endsWith("\n")) {
    throw new Error(`${file}: the file must end with a newline`);
  }
  const lines = text === "" ? [] : text.slice(0, -1).split("\n");
  const out: NondeterministicRequest[] = [];
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).join(",") !== "sha256,id,reason") {
      throw new Error(`${at}: expected the keys sha256, id, reason in that order`);
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry["sha256"] !== "string" || !SHA256.test(entry["sha256"])) {
      throw new Error(`${at}: sha256 is not 64 lowercase hex characters`);
    }
    if (typeof entry["id"] !== "string" || entry["id"] === "") {
      throw new Error(`${at}: id must be a non-empty string`);
    }
    if (typeof entry["reason"] !== "string" || entry["reason"].trim() === "") {
      throw new Error(`${at}: reason must name the random or time source`);
    }
    const parsed: NondeterministicRequest = { sha256: entry["sha256"], id: entry["id"], reason: entry["reason"], line: index + 1 };
    if (renderNondeterminism(parsed) !== line) {
      throw new Error(`${at}: the line is not in canonical form; expected ${renderNondeterminism(parsed)}`);
    }
    if (seen.has(parsed.sha256)) {
      throw new Error(`${at}: ${parsed.sha256} is listed twice`);
    }
    seen.add(parsed.sha256);
    const previous = out.at(-1);
    if (previous !== undefined && (compareUnits(previous.id, parsed.id) || compareUnits(previous.sha256, parsed.sha256)) > 0) {
      throw new Error(`${at}: lines must be sorted by id then sha256`);
    }
    out.push(parsed);
  });
  return out;
}

/** The listing under `root`, or [] when the file does not exist. */
export function readNondeterminism(root: string): NondeterministicRequest[] {
  const file = join(root, NONDETERMINISM_FILE);
  return existsSync(file) ? parseNondeterminism(readFileSync(file, "utf8")) : [];
}

/** Each batch request's `sha256` and its repo-relative request file. */
export function batchRequestFiles(files: readonly ComponentRequests[]): Map<string, string> {
  return new Map(files.flatMap((entry) => entry.requests.map((request) => [request.sha256, `${REQUESTS_DIR}/${entry.file}`] as const)));
}

/**
 * Every committed per-Story request file under `root` (Story 3.4), judged against the listing in merge order. A
 * merged file is never judged against the batch (Story 5.6 AC5): the batch skips what it holds.
 */
export function readStoryRequests(root: string, listing: readonly NondeterministicRequest[]): StoryRequestFile[] {
  return readStoryRequestFiles(root, readSchema(root), new Map(listing.map((entry) => [entry.sha256, entry.line])));
}

/** Every `sha256` an accepted merged per-Story request file owns under `root` (Story 5.6 AC5): the batch skips them. */
export function storyHeldShas(root: string): Set<string> {
  const held = new Set<string>();
  if (!existsSync(join(root, STORY_REQUESTS_DIR))) {
    return held;
  }
  for (const story of readStoryRequests(root, readNondeterminism(root))) {
    if (story.component !== null) {
      story.accepted.forEach(({ request }) => held.add(request.sha256));
    }
  }
  return held;
}

// ---------------------------------------------------------------------------
// Evaluation

export interface FixturesOptions {
  image?: string;
  local?: string;
  php?: string;
  /** Runs evaluate.php in the image; default `runInImage`. */
  runner?: ImageRunner;
  /** Compare only: no key, no fixtures. */
  determinism?: boolean;
  /** The fixture root; default `<root>/conformance/fixtures`. */
  out?: string;
  /** The PKCS#8 PEM of the signing key (the CLI passes env ORACLE_SIGNING_KEY). */
  signingKey?: string | null;
}

/** One pass: each request's output, in request order. */
type Pass = Map<string, Json>;

/**
 * Runs evaluate.php once over the request files `names` in the host directory `dir` and returns its stdout. Image
 * mode mounts the script and `dir` read-only; `--local` reads the files where they are.
 */
export function evaluateOnce(root: string, dir: string, names: readonly string[], options: Pick<FixturesOptions, "image" | "local" | "php" | "runner">): string {
  const script = resolve(root, EVALUATE_SCRIPT);
  if (!existsSync(script)) {
    throw new Error(`${EVALUATE_SCRIPT} is missing`);
  }
  if (options.local !== undefined) {
    const local = resolve(options.local);
    const command = [options.php ?? "php", script, local, PHP_VERSION, ...names.map((name) => join(dir, name))];
    const proc = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    if (proc.exitCode !== 0) {
      throw new Error(`evaluate.php failed (exit ${proc.exitCode ?? "signal"}): ${proc.stderr.toString().trim()}`);
    }
    return proc.stdout.toString();
  }
  const run = options.runner ?? runInImage;
  try {
    return run(
      options.image ?? oracleImage(root),
      [
        { host: script, container: IMAGE_EVALUATE },
        { host: dir, container: IMAGE_REQUESTS },
      ],
      ["php", IMAGE_EVALUATE, `${IMAGE_UPSTREAM_DIR}/framework`, PHP_VERSION, ...names.map((name) => `${IMAGE_REQUESTS}/${name}`)],
    );
  } catch (error) {
    throw new Error(`evaluate.php failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** Throws unless `local` is a copy of the framework snapshot under `root` (test and source files equal). */
export function checkLocalInstall(root: string, local: string): void {
  const dir = resolve(local);
  if (!existsSync(dir)) {
    throw new Error(`--local ${dir} does not exist`);
  }
  const snapshot = upstreamPath(root, "framework", ".");
  if (!existsSync(join(snapshot, "tests"))) {
    throw new Error(`${UPSTREAM_DIR}/framework/tests is missing; run bun run upstream:sync`);
  }
  checkLocalCopy(snapshot, dir, "framework");
}

/** Parses one pass's stdout; throws unless it is one `{sha256, output}` line per request, in request order. */
export function parsePass(stdout: string, requests: readonly OracleRequest[], label: string): Pass {
  const lines = stdout === "" ? [] : stdout.replace(/\n$/, "").split("\n");
  if (lines.length !== requests.length) {
    throw new Error(`${label}: evaluate.php printed ${lines.length} lines for ${requests.length} requests`);
  }
  const pass: Pass = new Map();
  lines.forEach((line, index) => {
    const request = requests[index]!;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(`${label}: line ${index + 1} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const entry = value as { sha256?: unknown; output?: unknown };
    if (typeof value !== "object" || value === null || entry.sha256 !== request.sha256) {
      throw new Error(`${label}: line ${index + 1} is not the output of request ${request.sha256}`);
    }
    const output = entry.output as { error?: unknown; results?: unknown } | undefined;
    if (typeof output !== "object" || output === null || !("error" in output) || !Array.isArray(output.results)) {
      throw new Error(`${label}: line ${index + 1} (${request.sha256}) has no {error, results} output`);
    }
    pass.set(request.sha256, output as Json);
  });
  return pass;
}

/** The lowercase hex SHA-256 of an output's canonical JSON. */
export function outputDigest(output: Json): string {
  return createHash("sha256").update(canonicalJson(output), "utf8").digest("hex");
}

export interface Difference {
  sha256: string;
  id: string;
  component: string;
  first: string;
  second: string;
}

export interface FixturesResult {
  /** Requests evaluated (each twice). */
  total: number;
  /** Listed requests whose passes differ, as expected (no fixture). */
  exempt: number;
  /** Fixtures per Component, sorted by Component (write mode). */
  counts: Record<string, number>;
  written: number;
  removed: string[];
  /** Unlisted requests whose passes differ. */
  differences: Difference[];
  /** Stale or wrong lines of the listing. */
  stale: string[];
  /** The Escalation written for the differences, repo-relative, or null. */
  escalation: string | null;
}

/** Fails naming each line whose `sha256` is not a committed request or whose `id` is not that request's. */
function checkListing(listing: readonly NondeterministicRequest[], byHash: ReadonlyMap<string, { request: OracleRequest; component: string }>): string[] {
  const problems: string[] = [];
  for (const entry of listing) {
    const committed = byHash.get(entry.sha256);
    if (committed === undefined) {
      problems.push(`${NONDETERMINISM_FILE}:${entry.line}: ${entry.sha256} is not a committed request`);
    } else if (committed.request.id !== entry.id) {
      problems.push(`${NONDETERMINISM_FILE}:${entry.line}: ${entry.sha256} is request ${JSON.stringify(committed.request.id)}, not ${JSON.stringify(entry.id)}`);
    }
  }
  return problems;
}

/** The next free `ESC-bot-<n>` under `root`. */
export function nextBotEscalation(root: string): string {
  const dir = join(root, ESCALATIONS_DIR);
  let max = 0;
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const id = name.endsWith(".md") ? parseEscalationId(name.slice(0, -".md".length)) : null;
      if (id !== null && id.storyId === null) {
        max = Math.max(max, id.n);
      }
    }
  }
  return `ESC-bot-${max + 1}`;
}

/** The text of the Escalation for `differences`, an open question on Oracle determinism. */
export function renderEscalation(id: string, differences: readonly Difference[]): string {
  const ids = [...new Set(differences.map((difference) => difference.id))].sort(compareUnits);
  const evidence = differences.map((difference) => `${JSON.stringify(difference.id)} request ${difference.sha256}: first pass output sha256 ${difference.first}, second pass output sha256 ${difference.second}`);
  return [
    "---",
    "test_ids:",
    ...ids.map((testId) => `  - ${JSON.stringify(testId)}`),
    "trigger: open-question",
    "proposed: >-",
    "  Find the random or time source in each request below. If Upstream itself is",
    `  random there, list the request in ${NONDETERMINISM_FILE} with that source as`,
    "  its reason (decisions/ESC-3.2-1.md); otherwise fix the evaluator so the two",
    "  evaluations agree. Nothing may seed or pin Upstream's randomness.",
    "evidence: |-",
    `  bun run oracle:fixtures evaluated every committed request twice; these unlisted`,
    `  requests gave different outputs (output digests are the SHA-256 of the canonical JSON):`,
    ...evidence.map((line) => `  - ${line}`),
    "---",
    "",
    `# ${id}: Oracle output differs between two evaluations`,
    "",
    `The Oracle batch (\`bun run oracle:fixtures\`, docs/ops/oracle.md "Fixtures") evaluated every committed request twice on the same Pin. ${differences.length} request(s) not listed in \`${NONDETERMINISM_FILE}\` gave different outputs, so the run wrote no fixtures and failed. The \`evidence\` above names each request and both output digests.`,
    "",
  ].join("\n");
}

/** Writes the Escalation for `differences` under `root` and returns its repo-relative path. */
function writeEscalation(root: string, differences: readonly Difference[]): string {
  const id = nextBotEscalation(root);
  const file = `${ESCALATIONS_DIR}/${id}.md`;
  const text = renderEscalation(id, differences);
  const { violations } = parseEscalation(file, text);
  if (violations.length > 0) {
    throw new Error(`the generated Escalation does not validate: ${violations.join("; ")}`);
  }
  mkdirSync(join(root, ESCALATIONS_DIR), { recursive: true });
  writeFileSync(join(root, file), text);
  return file;
}

/**
 * Evaluates every committed request under `root` twice, compares the passes and, unless `determinism`, signs and
 * writes the fixtures. Throws on any failure before the comparison; returns the differences and stale listings
 * (and writes nothing but the Escalation) when the comparison fails.
 */
export function generateFixtures(root: string, options: FixturesOptions = {}): FixturesResult {
  const determinism = options.determinism === true;
  // The key is checked before anything runs, so a wrong or missing key costs no evaluation and writes nothing.
  const key = determinism ? null : signingKey(root, options.signingKey);
  const files = readCommittedRequests(root);
  const listing = readNondeterminism(root);
  const byHash = new Map<string, { request: OracleRequest; component: string }>();
  for (const entry of files) {
    for (const request of entry.requests) {
      byHash.set(request.sha256, { request, component: entry.component });
    }
  }
  const result: FixturesResult = { total: byHash.size, exempt: 0, counts: {}, written: 0, removed: [], differences: [], stale: checkListing(listing, byHash), escalation: null };
  if (result.stale.length > 0) {
    return result;
  }
  if (options.local !== undefined) {
    checkLocalInstall(root, options.local);
  }
  const all = files.flatMap((entry) => entry.requests);
  const requestsDir = join(root, REQUESTS_DIR);
  const names = files.map((entry) => entry.file);
  const first = parsePass(evaluateOnce(root, requestsDir, names, options), all, "first pass");
  const second = parsePass(evaluateOnce(root, requestsDir, names, options), all, "second pass");

  const listed = new Map(listing.map((entry) => [entry.sha256, entry]));
  for (const request of all) {
    const a = canonicalJson(first.get(request.sha256)!);
    const b = canonicalJson(second.get(request.sha256)!);
    const entry = listed.get(request.sha256);
    if (a === b) {
      if (entry !== undefined) {
        result.stale.push(`${NONDETERMINISM_FILE}:${entry.line}: ${entry.sha256} (${entry.id}) gave identical outputs in both evaluations; remove the line`);
      }
    } else if (entry !== undefined) {
      result.exempt++;
    } else {
      result.differences.push({
        sha256: request.sha256,
        id: request.id,
        component: byHash.get(request.sha256)!.component,
        first: outputDigest(first.get(request.sha256)!),
        second: outputDigest(second.get(request.sha256)!),
      });
    }
  }
  // A stale listing is fixed first: its run writes no Escalation, even for a difference it also found.
  if (result.differences.length > 0 && result.stale.length === 0) {
    result.escalation = writeEscalation(root, result.differences);
  }
  if (result.stale.length > 0 || result.differences.length > 0 || key === null) {
    return result;
  }

  const out = options.out !== undefined ? resolve(options.out) : join(root, FIXTURES_DIR);
  // The fixtures of accepted per-Story requests (Story 3.4) belong to their Story, not the batch: never deleted.
  // `accepted` holds each request's owner, the earlier-merged Story; a later holder's (`shadowed`) fixture is kept
  // under its own Component too (Story 5.6 AC5).
  const kept = new Map<string, Set<string>>();
  const owned = new Set<string>();
  for (const story of readStoryRequests(root, listing)) {
    if (story.component !== null) {
      const shas = kept.get(story.component) ?? new Set<string>();
      story.accepted.forEach(({ request }) => {
        shas.add(`${request.sha256}.json`);
        owned.add(request.sha256);
      });
      story.shadowed.forEach(({ request }) => shas.add(`${request.sha256}.json`));
      kept.set(story.component, shas);
    }
  }
  const stray = (component: string, name: string): boolean => name.endsWith(".json") && !(kept.get(component)?.has(name) ?? false);
  const rendered = new Map<string, Map<string, string>>();
  for (const entry of files) {
    const texts = new Map<string, string>();
    for (const request of entry.requests) {
      // A request a merged per-Story file owns is that Story's fixture, never re-signed by the batch (Story 5.6 AC5).
      if (!listed.has(request.sha256) && !owned.has(request.sha256)) {
        texts.set(`${request.sha256}.json`, renderFixture(signFixture(request.sha256, first.get(request.sha256)!, key)));
      }
    }
    rendered.set(entry.component, texts);
    result.counts[entry.component] = texts.size;
  }
  for (const [component, texts] of rendered) {
    const dir = join(out, component);
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir).filter((file) => stray(component, file) && !texts.has(file)).sort(compareUnits)) {
      rmSync(join(dir, name));
      result.removed.push(`${component}/${name}`);
    }
    for (const [name, text] of texts) {
      const file = join(dir, name);
      if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
        writeFileSync(file, text);
      }
      result.written++;
    }
  }
  // A Component whose request file is gone keeps no fixtures; generators/ is never touched.
  const others = readdirSync(out, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== GENERATORS && !rendered.has(entry.name))
    .map((entry) => entry.name)
    .sort(compareUnits);
  for (const component of others) {
    for (const name of readdirSync(join(out, component)).filter((file) => stray(component, file)).sort(compareUnits)) {
      rmSync(join(out, component, name));
      result.removed.push(`${component}/${name}`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI

export class UsageError extends Error {}

const USAGE = [
  "Usage:",
  "  bun tools/oracle/fixtures.ts [--root <dir>] [--out <dir>] [--image <ref> | --local <dir> [--php <bin>]]",
  "  bun tools/oracle/fixtures.ts --determinism [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]",
  "  bun tools/oracle/fixtures.ts fingerprint [--root <dir>]",
].join("\n");

export function parseOptions(argv: readonly string[]): { root: string; fingerprint: boolean } & FixturesOptions {
  const options: { root: string; fingerprint: boolean } & FixturesOptions = { root: resolve(import.meta.dir, "..", ".."), fingerprint: false };
  const args = [...argv];
  if (args[0] === "fingerprint") {
    options.fingerprint = true;
    args.shift();
  }
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!["--determinism", "--root", "--out", "--image", "--local", "--php"].includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (seen.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    seen.add(arg);
    if (options.fingerprint && arg !== "--root") {
      throw new UsageError(`fingerprint takes only --root, not ${arg}`);
    }
    if (arg === "--determinism") {
      options.determinism = true;
      continue;
    }
    const value = args[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
      options.root = resolve(value);
    } else if (arg === "--out") {
      options.out = value;
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
  if (options.out !== undefined && options.determinism === true) {
    throw new UsageError("--determinism writes no fixtures, so it takes no --out");
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
  try {
    const { root, fingerprint: printFingerprint, ...options } = parseOptions(argv);
    if (deps.runner !== undefined) {
      options.runner = deps.runner;
    }
    if (printFingerprint) {
      process.stdout.write(`${fingerprint(root)}\n`);
      return 0;
    }
    const result = generateFixtures(root, { ...options, signingKey: options.determinism === true ? null : (env[SIGNING_KEY_ENV] ?? null) });
    const failures: string[] = [];
    for (const difference of result.differences) {
      failures.push(`oracle nondeterminism: ${difference.id} (request ${difference.sha256}, ${difference.component}): output ${difference.first} vs ${difference.second}`);
    }
    failures.push(...result.stale.map((line) => `oracle nondeterminism listing: ${line}`));
    if (result.escalation !== null) {
      failures.push(`wrote ${result.escalation}`);
    }
    if (result.differences.length > 0 || result.stale.length > 0) {
      process.stderr.write(failures.map((line) => `${line}\n`).join(""));
      process.stderr.write(`Oracle fixtures failed: ${result.differences.length} unlisted request(s) differ between two evaluations, ${result.stale.length} listing problem(s); no fixtures written.\n`);
      return 1;
    }
    if (options.determinism === true) {
      process.stdout.write(`Oracle determinism OK: ${result.total} requests evaluated twice; ${result.total - result.exempt} identical, ${result.exempt} listed in ${NONDETERMINISM_FILE} differ as expected.\n`);
      return 0;
    }
    const lines = Object.entries(result.counts).map(([component, count]) => `${component}: ${count} fixtures`);
    lines.push(...result.removed.map((file) => `removed ${file}`));
    lines.push(`Oracle fixtures: ${result.written} signed fixtures for ${result.total} requests (${result.exempt} listed in ${NONDETERMINISM_FILE} get none).`);
    process.stdout.write(lines.map((line) => `${line}\n`).join(""));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Oracle fixtures failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
