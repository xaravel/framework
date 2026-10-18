// Xaravel Tests for Story 3.3 (fixture signature verification in CI, FR-6,
// AD-15, AD-16). These run under plain `bun test` until the harness lands in
// Epic 5.
//
// The verifier runs against hermetic fixture roots: the schema, a few
// requests, and an Ed25519 key pair generated here for the test only (never
// committed, never the Oracle's) whose public half is the root's oracle.pub.
// Fixtures are signed with tools/oracle/fixtures.ts's `signFixture`, exactly
// as the batch signs them. Nothing here runs a container or PHP.
import { expect, test } from "bun:test";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FIXTURES_DIR, NONDETERMINISM_FILE, PUBLIC_KEY_FILE, renderFixture, renderNondeterminism, signFixture } from "../../../tools/oracle/fixtures";
import { canonicalJson, compareUnits, makeRequest, renderRequests, REQUESTS_DIR, SCHEMA_FILE, type Json, type OracleRequest } from "../../../tools/oracle/request";
import { verifyFixtures } from "../../../tools/oracle/verify";
import { activePhases, CODEOWNERS_PATH, isProtected, LIST_PATH, matches, parseList } from "../../../tools/protected-paths/protected-paths";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "oracle", "verify.ts");
const PROTECTED_PATHS_CLI = join(root, "tools", "protected-paths", "protected-paths.ts");

// ---------------------------------------------------------------------------
// Fixture roots

const STR = "Illuminate\\Tests\\Support\\SupportStrTest";
const REQUESTS: { component: string; request: OracleRequest }[] = [
  { component: "support", request: makeRequest(`${STR}::testUpper`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::upper('a')"] }) },
  { component: "support", request: makeRequest(`${STR}::testUuid`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::uuid()"] }) },
  { component: "view", request: makeRequest("Illuminate\\Tests\\View\\Blade\\BladeEchoTest::testEchos", "blade-render", { template: "{{ $a }}", data: { a: "x" } }) },
];
const UPPER = REQUESTS[0]!.request;
const UUID = REQUESTS[1]!.request;
const ECHO = REQUESTS[2]!.request;

interface Root {
  dir: string;
  key: KeyObject;
}

/** A root with the schema, the requests above, a listing naming UUID, and a test oracle.pub; `key` is its private half. */
function fixtureRoot(): Root {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-verify-"));
  mkdirSync(join(dir, REQUESTS_DIR), { recursive: true });
  copyFileSync(join(root, SCHEMA_FILE), join(dir, SCHEMA_FILE));
  for (const [component, text] of renderRequests(REQUESTS)) {
    writeFileSync(join(dir, REQUESTS_DIR, `${component}.jsonl`), text);
  }
  writeFileSync(join(dir, NONDETERMINISM_FILE), `${renderNondeterminism({ sha256: UUID.sha256, id: UUID.id, reason: "Str::uuid() is random" })}\n`);
  const pair = generateKeyPairSync("ed25519");
  writeFileSync(join(dir, PUBLIC_KEY_FILE), pair.publicKey.export({ type: "spki", format: "pem" }).toString());
  return { dir, key: pair.privateKey };
}

function outputFor(request: OracleRequest): Json {
  return { error: null, results: [{ value: request.id }] };
}

/** Writes `conformance/fixtures/<component>/<name>` (default `<sha256>.json`) and returns its repo-relative path. */
function writeFixture(fx: Root, component: string, request: OracleRequest, options: { key?: KeyObject; name?: string; output?: Json } = {}): string {
  const fixture = signFixture(request.sha256, options.output ?? outputFor(request), options.key ?? fx.key);
  const path = `${FIXTURES_DIR}/${component}/${options.name ?? `${request.sha256}.json`}`;
  mkdirSync(join(fx.dir, FIXTURES_DIR, component), { recursive: true });
  writeFileSync(join(fx.dir, path), renderFixture(fixture));
  return path;
}

/** The valid fixtures: one per committed, unlisted request. */
function writeValid(fx: Root): string[] {
  return [writeFixture(fx, "support", UPPER), writeFixture(fx, "view", ECHO)];
}

async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}

function withRoot(body: (fx: Root) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const fx = fixtureRoot();
    try {
      await body(fx);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  };
}

/** The stderr lines that name `path`. */
function linesFor(stderr: string, path: string): string[] {
  return stderr.split("\n").filter((line) => line.startsWith(`${path}:`) || line.startsWith(`${path}/:`));
}

// ---------------------------------------------------------------------------
// XT-conformance-74

test(
  "XT-conformance-74: fixtures signed with oracle.pub's key, each for a committed unlisted request, pass; generators/ is skipped (FR-6, AD-15)",
  withRoot(async (fx) => {
    writeValid(fx);
    mkdirSync(join(fx.dir, FIXTURES_DIR, "generators", "nested"), { recursive: true });
    writeFileSync(join(fx.dir, FIXTURES_DIR, "generators", "nested", "reference.txt"), "never signed\n");
    expect(verifyFixtures(fx.dir)).toEqual({ count: 2, violations: [] });
    expect(await cli(["--root", fx.dir])).toEqual({ code: 0, stdout: `Oracle fixtures OK: 2 fixtures verify against ${PUBLIC_KEY_FILE}.\n`, stderr: "" });
  }),
);

test(
  "XT-conformance-74: a fixture whose signature does not verify against oracle.pub, or whose request hash does not match its request, fails naming the file (FR-6, AD-15)",
  withRoot(async (fx) => {
    const valid = writeValid(fx);
    const other = generateKeyPairSync("ed25519").privateKey;
    const bad: Record<string, string> = {
      // Forged with another key: a valid signature, but not oracle.pub's.
      forged: writeFixture(fx, "support", UPPER, { key: other, name: `${"a".repeat(64)}.json` }),
      // The name is not the fixture's sha256.
      renamed: writeFixture(fx, "support", UPPER, { name: `${"b".repeat(64)}.json` }),
      // The name is not <64 hex>.json.
      nonHex: writeFixture(fx, "support", UPPER, { name: "upper.json" }),
      // A sha256 that is no committed request.
      unknown: writeFixture(fx, "support", { ...UPPER, sha256: "c".repeat(64) }),
      // A committed request, but another Component's.
      wrongComponent: writeFixture(fx, "support", ECHO),
      // A request listed in nondeterminism.jsonl gets no fixture.
      listed: writeFixture(fx, "support", UUID),
      // A Component without a request file.
      noRequests: writeFixture(fx, "gone", UPPER),
    };
    writeFileSync(join(fx.dir, FIXTURES_DIR, "README"), "stray\n");
    // `view-x` sorts before `view/…` by code unit, though it is listed after the `view` directory.
    writeFileSync(join(fx.dir, FIXTURES_DIR, "view-x"), "stray\n");
    mkdirSync(join(fx.dir, FIXTURES_DIR, "view", "nested"), { recursive: true });
    writeFileSync(join(fx.dir, FIXTURES_DIR, "view", "nested", "x.json"), "{}\n");

    const result = verifyFixtures(fx.dir);
    const stderr = result.violations.join("\n");
    expect(linesFor(stderr, bad["forged"]!)).toContain(`${bad["forged"]!}: the signature does not verify`);
    expect(linesFor(stderr, bad["forged"]!)).toContain(`${bad["forged"]!}: the file name is not its sha256 ${UPPER.sha256}`);
    expect(linesFor(stderr, bad["renamed"]!)).toEqual([`${bad["renamed"]!}: the file name is not its sha256 ${UPPER.sha256}`]);
    expect(linesFor(stderr, bad["nonHex"]!)).toEqual([`${bad["nonHex"]!}: the file name is not <sha256>.json (64 lowercase hex characters)`]);
    expect(linesFor(stderr, bad["unknown"]!)).toContain(`${bad["unknown"]!}: no committed request with sha256 ${"c".repeat(64)} in ${REQUESTS_DIR}/support.jsonl`);
    expect(linesFor(stderr, bad["wrongComponent"]!)).toEqual([`${bad["wrongComponent"]!}: request ${ECHO.sha256} is in ${REQUESTS_DIR}/view.jsonl, not ${REQUESTS_DIR}/support.jsonl`]);
    expect(linesFor(stderr, bad["listed"]!)).toEqual([`${bad["listed"]!}: request ${UUID.sha256} (${UUID.id}) is listed in ${NONDETERMINISM_FILE}:1; a listed request gets no fixture`]);
    expect(linesFor(stderr, bad["noRequests"]!)).toEqual([`${bad["noRequests"]!}: no committed request file ${REQUESTS_DIR}/gone.jsonl for Component gone`]);
    const stray = `not a Component directory; ${FIXTURES_DIR}/ holds only <component>/<sha256>.json fixtures and generators/`;
    expect(linesFor(stderr, `${FIXTURES_DIR}/README`)).toEqual([`${FIXTURES_DIR}/README: ${stray}`]);
    expect(linesFor(stderr, `${FIXTURES_DIR}/view-x`)).toEqual([`${FIXTURES_DIR}/view-x: ${stray}`]);
    expect(linesFor(stderr, `${FIXTURES_DIR}/view/nested`)).toEqual([`${FIXTURES_DIR}/view/nested/: a directory; a Component directory holds only <sha256>.json fixtures`]);
    // Sorted by path (the whole line, by code unit), not per directory level.
    expect(result.violations).toEqual([...result.violations].sort(compareUnits));
    expect(result.violations.findIndex((line) => line.startsWith(`${FIXTURES_DIR}/view-x:`))).toBeLessThan(result.violations.findIndex((line) => line.startsWith(`${FIXTURES_DIR}/view/`)));
    // Only <sha256>.json names count as fixtures: the two valid ones and the six bad ones so named (not upper.json).
    expect(result.count).toBe(8);
    for (const path of valid) {
      expect(linesFor(stderr, path)).toEqual([]);
    }
    // Every violation line starts with a repo-relative path under conformance/fixtures/.
    for (const line of result.violations) {
      expect(line.startsWith(`${FIXTURES_DIR}/`)).toBe(true);
    }

    const run = await cli(["--root", fx.dir]);
    expect(run.code).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe(`${result.violations.join("\n")}\nOracle fixture verification failed: ${result.violations.length} problem(s) under ${FIXTURES_DIR}/ (${result.count} fixtures examined).\n`);
  }),
);

test(
  "XT-conformance-74: no conformance/fixtures/, or only generators/, passes with 0 fixtures (FR-6)",
  withRoot(async (fx) => {
    expect(await cli(["--root", fx.dir])).toEqual({ code: 0, stdout: `Oracle fixtures OK: 0 fixtures verify against ${PUBLIC_KEY_FILE}.\n`, stderr: "" });
    mkdirSync(join(fx.dir, FIXTURES_DIR, "generators"), { recursive: true });
    writeFileSync(join(fx.dir, FIXTURES_DIR, "generators", "reference.txt"), "never signed\n");
    expect(await cli(["--root", fx.dir])).toEqual({ code: 0, stdout: `Oracle fixtures OK: 0 fixtures verify against ${PUBLIC_KEY_FILE}.\n`, stderr: "" });
  }),
);

test(
  "XT-conformance-74: a missing or non-Ed25519 oracle.pub, or an unreadable request file or listing, fails closed naming the cause; bad arguments exit 2 (FR-6, AD-15)",
  withRoot(async (fx) => {
    writeValid(fx);
    rmSync(join(fx.dir, PUBLIC_KEY_FILE));
    const missing = await cli(["--root", fx.dir]);
    expect(missing).toEqual({ code: 1, stdout: "", stderr: `Oracle fixture verification failed: ${PUBLIC_KEY_FILE} is missing; fixtures cannot be verified without it\n` });

    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
    writeFileSync(join(fx.dir, PUBLIC_KEY_FILE), rsa.export({ type: "spki", format: "pem" }).toString());
    const notEd = await cli(["--root", fx.dir]);
    expect(notEd.code).toBe(1);
    expect(notEd.stderr).toContain(`${PUBLIC_KEY_FILE} is not an Ed25519 key`);

    writeFileSync(join(fx.dir, PUBLIC_KEY_FILE), "not a key\n");
    const garbage = await cli(["--root", fx.dir]);
    expect(garbage.code).toBe(1);
    expect(garbage.stderr).toContain(`${PUBLIC_KEY_FILE} is not a PEM public key`);

    const fresh = fixtureRoot();
    try {
      writeFileSync(join(fresh.dir, NONDETERMINISM_FILE), "not json\n");
      const listing = await cli(["--root", fresh.dir]);
      expect(listing.code).toBe(1);
      expect(listing.stderr).toContain(`${NONDETERMINISM_FILE}:1: malformed JSON`);

      writeFileSync(join(fresh.dir, NONDETERMINISM_FILE), "");
      writeFileSync(join(fresh.dir, REQUESTS_DIR, "support.jsonl"), "{}\n");
      const requests = await cli(["--root", fresh.dir]);
      expect(requests.code).toBe(1);
      expect(requests.stderr).toContain(`${REQUESTS_DIR}/support.jsonl`);

      rmSync(join(fresh.dir, REQUESTS_DIR), { recursive: true });
      const none = await cli(["--root", fresh.dir]);
      expect(none.code).toBe(1);
      expect(none.stderr).toContain(`${REQUESTS_DIR} is missing`);
    } finally {
      rmSync(fresh.dir, { recursive: true, force: true });
    }

    expect((await cli(["--bogus"])).code).toBe(2);
    expect((await cli(["--root"])).code).toBe(2);
    expect(await cli(["--root", ""])).toMatchObject({ code: 2, stdout: "" });
    expect((await cli(["--root", ""])).stderr).toContain("--root needs a value");
    expect((await cli(["--root", fx.dir, "--root", fx.dir])).code).toBe(2);
  }),
);

test("XT-conformance-74: the committed repository verifies, and ci.yml's check job runs oracle:verify-fixtures on pull_request, merge_group and push (FR-6, AD-15)", async () => {
  const run = await cli([]);
  expect(run.stderr).toBe("");
  expect(run.code).toBe(0);
  expect(run.stdout).toMatch(/^Oracle fixtures OK: \d+ fixtures verify against conformance\/oracle\/oracle\.pub\.\n$/);

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
  expect(pkg.scripts["oracle:verify-fixtures"]).toBe("bun tools/oracle/verify.ts");

  const workflow = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as {
    on: Record<string, unknown>;
    jobs: Record<string, { steps: { name?: string; run?: string; if?: string }[]; if?: string }>;
  };
  expect(Object.keys(workflow.on)).toEqual(expect.arrayContaining(["pull_request", "merge_group", "push"]));
  const check = workflow.jobs["check"]!;
  expect(check.if).toBeUndefined();
  const step = check.steps.find((entry) => entry.run === "bun run oracle:verify-fixtures");
  expect(step?.name).toBe("Verify the Oracle fixtures");
  expect(step?.if).toBeUndefined();
});

// ---------------------------------------------------------------------------
// XT-conformance-75

test(
  "XT-conformance-75: a signed fixture whose output is hand-edited in the file fails the CLI, naming that file and not the unedited one (FR-6, AD-15)",
  withRoot(async (fx) => {
    const [edited, untouched] = writeValid(fx);
    const file = join(fx.dir, edited!);
    const original = readFileSync(file, "utf8");
    const changed = original.replace(canonicalJson(outputFor(UPPER)), canonicalJson({ error: null, results: [{ value: "forged" }] }));
    expect(changed).not.toBe(original);
    writeFileSync(file, changed);

    const run = await cli(["--root", fx.dir]);
    expect(run.code).toBe(1);
    expect(linesFor(run.stderr, edited!)).toEqual([`${edited!}: the signature does not verify`]);
    expect(run.stderr).not.toContain(untouched!);
    expect(run.stdout).toBe("");
  }),
);

// ---------------------------------------------------------------------------
// XT-conformance-76

test("XT-conformance-76: CODEOWNERS gives conformance/fixtures/ no owner, it is not a Protected Path, and Story 1.4's codeowners --check passes (FR-6, AD-16)", async () => {
  const path = `${FIXTURES_DIR}/support/${"0".repeat(64)}.json`;
  const rules = readFileSync(join(root, CODEOWNERS_PATH), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/));
  const last = rules.filter(([pattern]) => matches(pattern!, path)).at(-1);
  expect(last).toEqual([`/${FIXTURES_DIR}/`]);

  const entries = parseList(readFileSync(join(root, LIST_PATH), "utf8"));
  expect(isProtected(entries, activePhases(root), path)).toBe(false);

  const proc = Bun.spawn([process.execPath, PROTECTED_PATHS_CLI, "codeowners", "--check", "--root", root], { stdout: "pipe", stderr: "pipe" });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  expect(stderr).toBe("");
  expect(code).toBe(0);
});
