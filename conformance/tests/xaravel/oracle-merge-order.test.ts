// Xaravel Tests for Story 5.6 AC5 (Epic 3 retro R5: per-Story Oracle request
// ownership follows merge order; FR-6, AD-15, AD-16). These run under plain
// `bun test` until the harness's `xaravelTest` lands in Story 5.9. Fixture
// roots are hermetic git repositories holding the schema, a batch request
// file, Story manifests, per-Story request files committed in a chosen order,
// and a test oracle.pub whose Ed25519 key pair is generated here (never the
// Oracle's). Nothing here runs PHP or a container.
import { afterAll, expect } from "bun:test";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { COMPONENT_MAP_FILE } from "../../../tools/component-map/component-map";
import { LISTER, type ImageRunner, type RawTest } from "../../../tools/inventory/inventory";
import { extract, FAMILIES, TOKENS_SCRIPT } from "../../../tools/oracle/extract";
import { BLADE_BASE } from "../../../tools/oracle/extract/blade";
import { EVALUATE_SCRIPT, FIXTURES_DIR, generateFixtures, PUBLIC_KEY_FILE, readStoryRequests, renderFixture, signFixture, storyHeldShas } from "../../../tools/oracle/fixtures";
import { mergeOrder, SHALLOW_MESSAGE } from "../../../tools/oracle/merge-order";
import { makeRequest, parseRequests, readSchema, renderRequest, REQUESTS_DIR, SCHEMA_FILE, type OracleRequest } from "../../../tools/oracle/request";
import { STORY_REQUESTS_DIR } from "../../../tools/oracle/story-requests";
import { verifyFixtures } from "../../../tools/oracle/verify";
import { Assert, xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const STR = "Illuminate\\Tests\\Support\\SupportStrTest";
const UPPER = makeRequest(`${STR}::testUpper`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::upper('a')"] });
const SHARED = makeRequest("XT-support-1", "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::slug('Hello World')"] });
const OTHER = makeRequest("XT-testing-1", "php-expr", { bindings: {}, setup: [], exprs: ["1 + 1"] });

const lines = (...requests: OracleRequest[]): string => requests.map((request) => `${renderRequest(request)}\n`).join("");

function manifest(storyId: string, component: string, testIds: string[], xaravelTestIds: string[]): string {
  const list = (items: string[]): string => (items.length === 0 ? " []" : `\n${items.map((item) => `  - '${item}'`).join("\n")}`);
  return `---\nstory_id: "${storyId}"\nepic: ${storyId.split(".")[0]}\ncomponent: ${component}\nstatus: in-progress\ntest_ids:${list(testIds)}\nxaravel_test_ids:${list(xaravelTestIds)}\n---\n\n# Story ${storyId}\n`;
}

function git(dir: string, ...args: string[]): string {
  const proc = Bun.spawnSync(["git", "-c", "user.name=XT", "-c", "user.email=xt@example.invalid", "-c", "commit.gpgsign=false", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString();
}

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/**
 * A git root: the schema, the batch (UPPER in support), Story 3.4 (support) and Story 10.1 (testing) both owning
 * SHARED, Story 11.1 (support) owning UPPER and SHARED, and oracle.pub; then each `[file, text]` of `commits`
 * committed in order, one commit each.
 */
function repo(commits: [string, string][]): { dir: string; priv: KeyObject } {
  const dir = mkdtempSync(join(tmpdir(), "xt-merge-order-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  write(dir, SCHEMA_FILE, "");
  copyFileSync(join(root, SCHEMA_FILE), join(dir, SCHEMA_FILE));
  write(dir, EVALUATE_SCRIPT, "");
  copyFileSync(join(root, EVALUATE_SCRIPT), join(dir, EVALUATE_SCRIPT));
  write(dir, `${REQUESTS_DIR}/support.jsonl`, lines(UPPER));
  write(dir, "stories/3.4.md", manifest("3.4", "support", [], [SHARED.id]));
  write(dir, "stories/10.1.md", manifest("10.1", "testing", [], [SHARED.id, OTHER.id]));
  write(dir, "stories/11.1.md", manifest("11.1", "support", [UPPER.id], [SHARED.id]));
  const pair = generateKeyPairSync("ed25519");
  write(dir, PUBLIC_KEY_FILE, pair.publicKey.export({ type: "spki", format: "pem" }).toString());
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  for (const [file, text] of commits) {
    write(dir, file, text);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", `add ${file}`);
  }
  return { dir, priv: pair.privateKey };
}

/** A stand-in image runner for evaluate.php: each request's output is `batch:<id>`, unlike `fixture`'s, so a re-signed fixture would differ. */
const standIn: ImageRunner = (_image, mounts, command) => {
  const requests = mounts.find((mount) => mount.container === "/xaravel/requests")!;
  const out: string[] = [];
  for (const file of command.filter((arg) => arg.startsWith("/xaravel/requests/"))) {
    for (const text of readFileSync(join(requests.host, file.slice("/xaravel/requests/".length)), "utf8").split("\n").filter(Boolean)) {
      const request = JSON.parse(text) as OracleRequest;
      out.push(`${JSON.stringify({ sha256: request.sha256, output: { error: null, results: [{ value: `batch:${request.id}` }] } })}\n`);
    }
  }
  return out.join("");
};

const pem = (priv: KeyObject): string => priv.export({ type: "pkcs8", format: "pem" }).toString();

function fixture(dir: string, priv: KeyObject, component: string, request: OracleRequest): string {
  const path = `${FIXTURES_DIR}/${component}/${request.sha256}.json`;
  write(dir, path, renderFixture(signFixture(request.sha256, { error: null, results: [{ value: request.id }] }, priv)));
  return path;
}

const FILE_34 = `${STORY_REQUESTS_DIR}/3.4.jsonl`;
const FILE_101 = `${STORY_REQUESTS_DIR}/10.1.jsonl`;

xaravelTest("XT-conformance-187", "between two Stories' files the earlier-merged one owns a shared request, whatever the file names; both stay valid (FR-6, AD-16)", () => {
  // 10.1.jsonl sorts before 3.4.jsonl by name, but merges after it.
  const { dir, priv } = repo([
    [FILE_34, lines(SHARED)],
    [FILE_101, lines(SHARED, OTHER)],
  ]);
  expect(mergeOrder(dir, ["10.1.jsonl", "3.4.jsonl"])).toEqual(["3.4.jsonl", "10.1.jsonl"]);
  const read = readStoryRequests(dir, []);
  expect(read.map((story) => [story.file, story.accepted.map((item) => item.request.sha256), story.shadowed.map((item) => [item.request.sha256, item.owner]), story.rejections])).toEqual([
    [FILE_34, [SHARED.sha256], [], []],
    [FILE_101, [OTHER.sha256], [[SHARED.sha256, `${FILE_34}:1`]], []],
  ]);
  // verify stays green, and the owner's Component is the shared request's source.
  const own = fixture(dir, priv, "support", SHARED);
  fixture(dir, priv, "testing", OTHER);
  expect(verifyFixtures(dir)).toEqual({ count: 2, violations: [] });
  // The later holder (10.1, Component testing) keeps a valid fixture of the shared request under its own Component.
  const later = fixture(dir, priv, "testing", SHARED);
  expect(verifyFixtures(dir)).toEqual({ count: 3, violations: [] });
  // A Component that holds it in no file still may not.
  const foreign = fixture(dir, priv, "view", SHARED);
  expect(verifyFixtures(dir).violations).toEqual([`${foreign}: no committed request file ${REQUESTS_DIR}/view.jsonl for Component view`]);
  rmSync(join(dir, foreign));
  // The batch rerun keeps both holders' fixtures: the owner's in support/ (which it writes) is neither deleted nor re-signed.
  const ownText = readFileSync(join(dir, own), "utf8");
  const laterText = readFileSync(join(dir, later), "utf8");
  const batch = generateFixtures(dir, { image: "xaravel-oracle:test", runner: standIn, signingKey: pem(priv) });
  expect([batch.differences, batch.counts, batch.removed]).toEqual([[], { support: 1 }, []]);
  expect([readFileSync(join(dir, own), "utf8"), readFileSync(join(dir, later), "utf8")]).toEqual([ownText, laterText]);
  rmSync(join(dir, later));
  rmSync(join(dir, own));
  rmSync(join(dir, FIXTURES_DIR, "support", `${UPPER.sha256}.json`));

  // The other merge order: 10.1 first, so 10.1 owns it and 3.4's line is the shadowed one.
  const reverse = repo([
    [FILE_101, lines(SHARED)],
    [FILE_34, lines(SHARED)],
  ]);
  expect(readStoryRequests(reverse.dir, []).map((story) => [story.file, story.accepted.length, story.shadowed.map((item) => item.owner)])).toEqual([
    [FILE_101, 1, []],
    [FILE_34, 0, [`${FILE_101}:1`]],
  ]);
  fixture(reverse.dir, reverse.priv, "testing", SHARED);
  expect(verifyFixtures(reverse.dir)).toEqual({ count: 1, violations: [] });

  // The most recent add counts: deleting and re-adding 10.1.jsonl moves it after 3.4.
  git(reverse.dir, "rm", "-q", FILE_101);
  git(reverse.dir, "commit", "-q", "-m", "drop 10.1");
  write(reverse.dir, FILE_101, lines(SHARED));
  git(reverse.dir, "add", "-A");
  git(reverse.dir, "commit", "-q", "-m", "re-add 10.1");
  expect(mergeOrder(reverse.dir, ["10.1.jsonl", "3.4.jsonl"])).toEqual(["3.4.jsonl", "10.1.jsonl"]);

  // An uncommitted file comes after every committed one; files of one commit, and outside git, sort by name.
  write(dir, `${STORY_REQUESTS_DIR}/1.1.jsonl`, "");
  expect(mergeOrder(dir, ["1.1.jsonl", "10.1.jsonl", "3.4.jsonl"])).toEqual(["3.4.jsonl", "10.1.jsonl", "1.1.jsonl"]);
  const together = repo([]);
  write(together.dir, FILE_34, lines(SHARED));
  write(together.dir, FILE_101, lines(SHARED));
  git(together.dir, "add", "-A");
  git(together.dir, "commit", "-q", "-m", "both");
  expect(mergeOrder(together.dir, ["3.4.jsonl", "10.1.jsonl"])).toEqual(["10.1.jsonl", "3.4.jsonl"]);
  const plain = mkdtempSync(join(tmpdir(), "xt-merge-order-plain-"));
  dirs.push(plain);
  expect(mergeOrder(plain, ["3.4.jsonl", "10.1.jsonl"])).toEqual(["10.1.jsonl", "3.4.jsonl"]);
});

xaravelTest("XT-conformance-225", "a merged per-Story request that the batch also produces keeps the file valid, and the batch skips it (FR-6, AD-15)", () => {
  const { dir, priv } = repo([[FILE_34, lines(SHARED)]]);
  // The batch extraction omits every request a merged per-Story file holds (tools/oracle/extract.ts filters by this set).
  expect([...storyHeldShas(dir)]).toEqual([SHARED.sha256]);
  // A batch file that still carries it (extracted before this rule): the merged file stays valid and owns it.
  write(dir, `${REQUESTS_DIR}/support.jsonl`, lines(UPPER, SHARED).split("\n").sort().filter(Boolean).map((text) => `${text}\n`).join(""));
  const own = fixture(dir, priv, "support", SHARED);
  expect(verifyFixtures(dir)).toEqual({ count: 1, violations: [] });
  expect(readStoryRequests(dir, [])[0]!.rejections).toEqual([]);
  // The batch evaluates it but signs no batch fixture for it: the per-Story fixture stays byte-identical, and counts leave it out.
  const before = readFileSync(join(dir, own), "utf8");
  const batch = generateFixtures(dir, { image: "xaravel-oracle:test", runner: standIn, signingKey: pem(priv) });
  expect([batch.differences, batch.counts, batch.removed]).toEqual([[], { support: 1 }, []]);
  expect(readFileSync(join(dir, own), "utf8")).toBe(before);
  expect(verifyFixtures(dir)).toEqual({ count: 2, violations: [] });
  // A listed or unowned request is still rejected in a merged file.
  write(dir, FILE_34, lines(SHARED, UPPER));
  expect(verifyFixtures(dir).violations).toEqual([`${FILE_34}:2: id ${UPPER.id} is not owned by Story 3.4; it is in neither test_ids nor xaravel_test_ids of stories/3.4.md`]);
});

const PHP = Bun.which("php");
const REQUIRE = process.env["XARAVEL_PHP_FIXTURES"] === "require";

// The extraction case runs the real PHP tokenizer (as oracle-extract.test.ts does): skipped with the reason without php, failed under XARAVEL_PHP_FIXTURES=require.
xaravelTest("XT-conformance-226", "oracle:extract leaves out of the batch a request a merged per-Story file holds, and --check agrees (FR-6, AD-15)", () => {
  if (PHP === null) {
    if (REQUIRE) {
      throw new Error("XARAVEL_PHP_FIXTURES=require: php not on PATH");
    }
    Assert.markTestSkipped("php not on PATH");
  }
  const { dir } = repo([]);
  for (const file of ["tools/scaffold/packages.jsonl", COMPONENT_MAP_FILE, LISTER, TOKENS_SCRIPT]) {
    write(dir, file, "");
    copyFileSync(join(root, file), join(dir, file));
  }
  // The snapshot: SupportStrTest with two readable pure calls, and a stub with one unreadable test in every other listed Differential file.
  const snapshot = join(dir, "conformance", "upstream", "framework");
  const strFile = "tests/Support/SupportStrTest.php";
  const raws: RawTest[] = [];
  const raw = (cls: string, method: string, file: string): RawTest => ({ id: `${cls}::${method}`, class: cls, method, dataset: null, file, source: { file, start: 1, end: 2 }, tokens: ["cfunction"], data: null, requiresDatabase: null, redis: false });
  write(snapshot, "phpunit.xml.dist", '<?xml version="1.0"?>\n<phpunit>\n    <php>\n        <ini name="date.timezone" value="UTC" />\n    </php>\n</phpunit>\n');
  write(snapshot, strFile, `<?php\n\nnamespace Illuminate\\Tests\\Support;\n\nuse Illuminate\\Support\\Str;\nuse PHPUnit\\Framework\\TestCase;\n\nclass SupportStrTest extends TestCase\n{\n    public function testUpper()\n    {\n        $this->assertSame('FOO', Str::upper('foo'));\n    }\n\n    public function testLower()\n    {\n        $this->assertSame('foo', Str::lower('FOO'));\n    }\n}\n`);
  raws.push(raw(STR, "testUpper", strFile), raw(STR, "testLower", strFile));
  for (const file of FAMILIES.flatMap((family) => family.files)) {
    if (file === strFile || file === BLADE_BASE) {
      continue;
    }
    const parts = file.replace(/\.php$/, "").split("/");
    const name = parts.pop()!;
    const namespace = ["Illuminate", "Tests", ...parts.slice(1)].join("\\");
    write(snapshot, file, `<?php\n\nnamespace ${namespace};\n\nclass ${name}\n{\n    public function testStub()\n    {\n        if (true) {\n        }\n    }\n}\n`);
    raws.push(raw(`${namespace}\\${name}`, "testStub", file));
  }
  const runner: ImageRunner = (_image, _mounts, command) => {
    if (command[1] === "/xaravel/lister.php") {
      return raws.map((entry) => `${JSON.stringify(entry)}\n`).join("");
    }
    const proc = Bun.spawnSync([PHP, join(dir, TOKENS_SCRIPT), snapshot, ...command.slice(3)], { stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) {
      throw new Error(proc.stderr.toString());
    }
    return proc.stdout.toString();
  };
  const options = { image: "xaravel-oracle:test", runner };
  const batch = (): OracleRequest[] => parseRequests(readFileSync(join(dir, REQUESTS_DIR, "support.jsonl"), "utf8"), "support.jsonl", readSchema(dir));

  // Without a per-Story file the batch holds both requests.
  extract(dir, options);
  const both = batch();
  expect(both.map((request) => request.id).sort()).toEqual([`${STR}::testLower`, `${STR}::testUpper`]);
  const upper = both.find((request) => request.id === `${STR}::testUpper`)!;

  // Story 3.5 merges a per-Story file holding the extracted testUpper request: the next extraction leaves it out.
  write(dir, "stories/3.5.md", manifest("3.5", "support", [upper.id], []));
  write(dir, `${STORY_REQUESTS_DIR}/3.5.jsonl`, lines(upper));
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "3.5 requests");
  extract(dir, options);
  expect(batch().map((request) => request.id)).toEqual([`${STR}::testLower`]);
  expect(extract(dir, { ...options, check: true }).drift).toEqual([]);
  // A batch that still carries it is drift.
  write(dir, `${REQUESTS_DIR}/support.jsonl`, lines(...both));
  expect(extract(dir, { ...options, check: true }).drift).toEqual([`oracle requests drift: ${REQUESTS_DIR}/support.jsonl differs from the extracted requests (first difference at line 2)`]);
});

xaravelTest("XT-conformance-227", "oracle:story still rejects a new candidate's batch request and a request a committed per-Story file holds (FR-6, AD-16)", () => {
  const { dir } = repo([[FILE_34, lines(SHARED)]]);
  const candidate = join(dir, "candidate.jsonl");
  writeFileSync(candidate, lines(UPPER, SHARED));
  const proc = Bun.spawnSync([process.execPath, join(root, "tools", "oracle", "story.ts"), "check", "11.1", "--root", dir, "--requests", candidate], { stdout: "pipe", stderr: "pipe" });
  expect(proc.exitCode).toBe(1);
  const file = `${STORY_REQUESTS_DIR}/11.1.jsonl`;
  expect(proc.stderr.toString()).toBe(
    [
      `${file}:1: request ${UPPER.sha256} is a batch request in ${REQUESTS_DIR}/support.jsonl; the batch already evaluates it`,
      `${file}:2: request ${SHARED.sha256} is also in ${FILE_34}:1`,
      `Oracle story requests failed: Story 11.1: 2 rejection(s) in ${file}; 0 accepted for Component support.`,
      "",
    ].join("\n"),
  );
});

xaravelTest("XT-conformance-228", "a shallow clone cannot tell merge order and fails closed (FR-6)", () => {
  const { dir } = repo([
    [FILE_34, lines(SHARED)],
    [FILE_101, lines(SHARED)],
  ]);
  const shallow = mkdtempSync(join(tmpdir(), "xt-merge-order-shallow-"));
  dirs.push(shallow);
  rmSync(shallow, { recursive: true });
  git(dir, "clone", "-q", "--depth", "1", `file://${dir}`, shallow);
  expect(SHALLOW_MESSAGE).toBe("oracle request merge order needs full git history (fetch-depth: 0)");
  expect(() => mergeOrder(shallow, ["3.4.jsonl", "10.1.jsonl"])).toThrow(SHALLOW_MESSAGE);
  expect(() => verifyFixtures(shallow)).toThrow(SHALLOW_MESSAGE);
  const proc = Bun.spawnSync([process.execPath, join(root, "tools", "oracle", "verify.ts"), "--root", shallow], { stdout: "pipe", stderr: "pipe" });
  expect([proc.exitCode, proc.stderr.toString()]).toEqual([1, `Oracle fixture verification failed: ${SHALLOW_MESSAGE}\n`]);
});
