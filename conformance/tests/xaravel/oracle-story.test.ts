// Xaravel Tests for Story 3.4 (per-Story Oracle requests, FR-6, AD-15,
// AD-16). These run under plain `bun test` until the harness lands in Epic 5.
//
// The tool runs against hermetic fixture roots: the schema, a few batch
// requests, a listing, a Story manifest, a per-Story request file, a stand-in
// image runner that answers for tools/oracle/evaluate.php, and an Ed25519 key
// pair generated here for the test only (never committed, never the
// Oracle's). The evaluator itself runs for real on an Xaravel Test ID request
// against the locked local install in /tmp/xaravel-inv/framework when it is
// present; when `php` is not on PATH that test is skipped and its name gives
// the reason, and with XARAVEL_PHP_FIXTURES=require it fails instead. The
// live workflow (the App, its secret, a real PR run) is Maintainer-run; this
// file checks the job's shape. Nothing here runs a container.
import { expect, test } from "bun:test";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PHP_VERSION, type ImageRunner } from "../../../tools/inventory/inventory";
import { COMPONENT_NAME, EVALUATE_SCRIPT, FIXTURES_DIR, generateFixtures, NONDETERMINISM_FILE, PUBLIC_KEY_FILE, renderFixture, renderNondeterminism, signFixture, verifyFixture } from "../../../tools/oracle/fixtures";
import { makeRequest, renderRequest, renderRequests, REQUESTS_DIR, SCHEMA_FILE, type Json, type OracleRequest } from "../../../tools/oracle/request";
import { main, renderReport } from "../../../tools/oracle/story";
import { STORY_REQUESTS_DIR } from "../../../tools/oracle/story-requests";
import { verifyFixtures } from "../../../tools/oracle/verify";
import { allowedPath } from "../../../tools/ownership/ownership";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "oracle", "story.ts");
const REQUIRE = process.env["XARAVEL_PHP_FIXTURES"] === "require";
const PHP = Bun.which("php");
const LOCAL_INSTALL = "/tmp/xaravel-inv/framework";
const TIMEOUT = 120_000;

// ---------------------------------------------------------------------------
// Fixture roots

const STR = "Illuminate\\Tests\\Support\\SupportStrTest";
const BATCH: { component: string; request: OracleRequest }[] = [
  { component: "support", request: makeRequest(`${STR}::testUpper`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::upper('a')"] }) },
  { component: "support", request: makeRequest(`${STR}::testUuid`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::uuid()"] }) },
  { component: "view", request: makeRequest("Illuminate\\Tests\\View\\Blade\\BladeEchoTest::testEchos", "blade-render", { template: "{{ $a }}", data: { a: "x" } }) },
];
const UPPER = BATCH[0]!.request;
const UUID = BATCH[1]!.request;

/** Story 9.1 (component support) owns one PHPUnit Test ID and one Xaravel Test ID. */
const OWNED_PHPUNIT = `${STR}::testLower`;
const OWNED_XT = "XT-support-1";
const LOWER = makeRequest(OWNED_PHPUNIT, "php-expr", { bindings: { value: "'ABC'" }, setup: [], exprs: ["\\Illuminate\\Support\\Str::lower($value)"] });
const XT = makeRequest(OWNED_XT, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::slug('Hello World')"] });
const UNOWNED = makeRequest(`${STR}::testSnake`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::snake('fooBar')"] });

function manifest(storyId: string, component: string, testIds: string[], xaravelTestIds: string[]): string {
  const list = (items: string[]): string => (items.length === 0 ? " []" : `\n${items.map((item) => `  - '${item}'`).join("\n")}`);
  const epic = storyId.split(".")[0]!;
  return `---\nstory_id: "${storyId}"\nepic: ${epic}\ncomponent: ${component}\nstatus: in-progress\ntitle: "A Story"\ntest_ids:${list(testIds)}\nxaravel_test_ids:${list(xaravelTestIds)}\n---\n\n# Story ${storyId}\n`;
}

interface Root {
  dir: string;
  pub: KeyObject;
  priv: KeyObject;
  pem: string;
}

function keyPair(): { pub: KeyObject; priv: KeyObject; pem: string } {
  const pair = generateKeyPairSync("ed25519");
  return { pub: pair.publicKey, priv: pair.privateKey, pem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}

const lines = (...requests: OracleRequest[]): string => requests.map((request) => `${renderRequest(request)}\n`).join("");

/** A root with the schema, the batch requests, a listing naming UUID, evaluate.php, a test oracle.pub, Story 9.1's manifest and (optionally) its request file. */
function fixtureRoot(requests: string | null = lines(LOWER, XT)): Root {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-story-"));
  mkdirSync(join(dir, REQUESTS_DIR), { recursive: true });
  mkdirSync(join(dir, "tools", "oracle"), { recursive: true });
  mkdirSync(join(dir, "stories"), { recursive: true });
  copyFileSync(join(root, SCHEMA_FILE), join(dir, SCHEMA_FILE));
  copyFileSync(join(root, EVALUATE_SCRIPT), join(dir, EVALUATE_SCRIPT));
  for (const [component, text] of renderRequests(BATCH)) {
    writeFileSync(join(dir, REQUESTS_DIR, `${component}.jsonl`), text);
  }
  writeFileSync(join(dir, NONDETERMINISM_FILE), `${renderNondeterminism({ sha256: UUID.sha256, id: UUID.id, reason: "Str::uuid() is random" })}\n`);
  writeFileSync(join(dir, "stories", "9.1.md"), manifest("9.1", "support", [OWNED_PHPUNIT, UPPER.id, UUID.id], [OWNED_XT]));
  if (requests !== null) {
    mkdirSync(join(dir, STORY_REQUESTS_DIR), { recursive: true });
    writeFileSync(join(dir, STORY_REQUESTS_DIR, "9.1.jsonl"), requests);
  }
  const { pub, priv, pem } = keyPair();
  writeFileSync(join(dir, PUBLIC_KEY_FILE), pub.export({ type: "spki", format: "pem" }).toString());
  return { dir, pub, priv, pem };
}

function withRoot(requests: string | null, body: (fx: Root) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const fx = fixtureRoot(requests);
    try {
      await body(fx);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  };
}

/** The deterministic output the stand-in gives a request: its id, echoed. */
function outputFor(request: OracleRequest): Json {
  return { error: null, results: [{ value: request.id }] };
}

interface Stand {
  runner: ImageRunner;
  calls: { image: string; mounts: { host: string; container: string }[]; command: string[]; requests: string[]; modes: number[] }[];
}

/** A stand-in image runner for evaluate.php; `differ(sha256, pass)` makes a request's output depend on the pass. */
function standIn(differ: (sha256: string, pass: number) => boolean = () => false): Stand {
  const calls: Stand["calls"] = [];
  const runner: ImageRunner = (image, mounts, command) => {
    const pass = calls.length + 1;
    const requestsMount = mounts.find((mount) => mount.container === "/xaravel/requests")!;
    const out: string[] = [];
    const seen: string[] = [];
    // The modes of the request directory and each request file at call time (the image user must read them).
    const modes = [statSync(requestsMount.host).mode];
    for (const file of command.slice(4)) {
      const host = join(requestsMount.host, file.slice("/xaravel/requests/".length));
      modes.push(statSync(host).mode);
      const text = readFileSync(host, "utf8");
      for (const line of text.split("\n").filter((entry) => entry !== "")) {
        seen.push(line);
        const request = JSON.parse(line) as OracleRequest;
        const output = differ(request.sha256, pass) ? { error: null, results: [{ value: `pass ${pass}` }] } : outputFor(request);
        out.push(JSON.stringify({ sha256: request.sha256, output }));
      }
    }
    calls.push({ image, mounts: mounts.map((mount) => ({ ...mount })), command: [...command], requests: seen, modes });
    return out.map((line) => `${line}\n`).join("");
  };
  return { runner, calls };
}

/** Every file under `dir`, relative, sorted. */
function tree(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  const walk = (sub: string): void => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      const path = sub === "" ? entry.name : `${sub}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path);
      } else {
        out.push(path);
      }
    }
  };
  walk("");
  return out.sort();
}

/** Runs main() in-process with captured stdout/stderr. */
function cliInProcess(argv: string[], env: Record<string, string | undefined>, runner?: ImageRunner): { code: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = main(argv, { env, ...(runner === undefined ? {} : { runner }) });
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

/** Runs the CLI as a process; the environment has no ORACLE_SIGNING_KEY unless given. */
async function cli(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const base = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "ORACLE_SIGNING_KEY")) as Record<string, string>;
  const proc = Bun.spawn([process.execPath, CLI, ...args], { env: { ...base, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}

const fixturePath = (component: string, request: OracleRequest): string => `${FIXTURES_DIR}/${component}/${request.sha256}.json`;

// ---------------------------------------------------------------------------
// The workflow

type Step = Record<string, unknown> & { name?: string; uses?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string>; if?: string; id?: string };
interface Workflow {
  on: Record<string, unknown>;
  permissions: unknown;
  jobs: Record<string, Record<string, unknown> & { if?: string; permissions?: unknown; steps: Step[] }>;
}

function storyJob(): { workflow: Workflow; job: Workflow["jobs"][string]; step: (id: string) => Step } {
  const workflow = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "oracle.yml"), "utf8")) as Workflow;
  const job = workflow.jobs["story"]!;
  return { workflow, job, step: (id) => job.steps.find((entry) => entry.id === id)! };
}

// ---------------------------------------------------------------------------
// XT-conformance-77

test(
  "XT-conformance-77: generate evaluates a Story's owned requests (a PHPUnit Test ID and an Xaravel Test ID) twice in the image and writes signed fixtures under the manifest's Component that verify with oracle.pub (FR-6, AD-15)",
  withRoot(lines(LOWER, XT), (fx) => {
    const stand = standIn();
    const report = join(fx.dir, "report.md");
    const before = tree(fx.dir);
    const result = cliInProcess(["generate", "9.1", "--root", fx.dir, "--image", "xaravel-oracle:test", "--report", report], { ORACLE_SIGNING_KEY: fx.pem }, stand.runner);
    expect(result).toEqual({
      code: 0,
      stdout: `wrote ${fixturePath("support", LOWER)}\nwrote ${fixturePath("support", XT)}\nOracle story requests: Story 9.1: 2 request(s) in ${STORY_REQUESTS_DIR}/9.1.jsonl; 2 signed fixture(s) written for Component support.\n`,
      stderr: "",
    });

    // Image mode, twice: evaluate.php and a directory holding only the accepted requests, both mounted read-only, as the batch mounts them.
    expect(stand.calls).toHaveLength(2);
    expect(stand.calls[0]).toEqual(stand.calls[1]!);
    const call = stand.calls[0]!;
    expect(call.image).toBe("xaravel-oracle:test");
    expect(call.mounts.map((mount) => mount.container)).toEqual(["/xaravel/evaluate.php", "/xaravel/requests"]);
    expect(call.mounts[0]!.host).toBe(join(fx.dir, EVALUATE_SCRIPT));
    expect(call.command).toEqual(["php", "/xaravel/evaluate.php", "/oracle/upstream/framework", PHP_VERSION, "/xaravel/requests/9.1.jsonl"]);
    expect(call.requests).toEqual([renderRequest(LOWER), renderRequest(XT)]);
    // The image user (uid 1001, not the host user) can read the mounted directory and its file.
    expect([call.modes.length, call.modes[0]! & 0o005, call.modes[1]! & 0o004]).toEqual([2, 0o005, 0o004]);
    // The temporary request directory is gone afterwards.
    expect(existsSync(call.mounts[1]!.host)).toBe(false);

    // It writes only the two fixtures (and the report it was asked for).
    expect(tree(fx.dir)).toEqual([...before, fixturePath("support", LOWER), fixturePath("support", XT), "report.md"].sort());
    const pubPem = readFileSync(join(fx.dir, PUBLIC_KEY_FILE), "utf8");
    for (const request of [LOWER, XT]) {
      const text = readFileSync(join(fx.dir, fixturePath("support", request)), "utf8");
      // Signed exactly as the batch signs.
      expect(text).toBe(renderFixture(signFixture(request.sha256, outputFor(request), fx.priv)));
      expect(verifyFixture(text, pubPem, request.sha256)).toEqual([]);
    }
    // Story 3.3's check verifies them on this root.
    expect(verifyFixtures(fx.dir)).toEqual({ count: 2, violations: [] });

    // The report lists them.
    const text = readFileSync(report, "utf8");
    expect(text).toContain("### Oracle requests: Story 9.1");
    expect(text).toContain("2 signed fixture(s) written, 0 rejected");
    expect(text).toContain(`- \`${fixturePath("support", LOWER)}\`: \`${OWNED_PHPUNIT}\``);
    expect(text).toContain(`- \`${fixturePath("support", XT)}\`: \`${OWNED_XT}\``);
    expect(text).not.toContain("Rejected");

    // --out writes under another root; a second run gives identical bytes.
    const elsewhere = join(fx.dir, "elsewhere");
    expect(cliInProcess(["generate", "9.1", "--root", fx.dir, "--image", "xaravel-oracle:test", "--out", elsewhere], { ORACLE_SIGNING_KEY: fx.pem }, standIn().runner).code).toBe(0);
    expect(tree(elsewhere)).toEqual([`support/${LOWER.sha256}.json`, `support/${XT.sha256}.json`].sort());
    expect(readFileSync(join(elsewhere, "support", `${XT.sha256}.json`), "utf8")).toBe(readFileSync(join(fx.dir, fixturePath("support", XT)), "utf8"));

    // --requests reads another file (CI's copy of the PR's file) but names the repo path.
    const copy = join(fx.dir, "pr-requests.jsonl");
    writeFileSync(copy, lines(XT));
    const fromCopy = cliInProcess(["check", "9.1", "--root", fx.dir, "--requests", copy], {});
    expect(fromCopy).toEqual({ code: 0, stdout: `Oracle story requests: Story 9.1: 1 request(s) in ${STORY_REQUESTS_DIR}/9.1.jsonl; 1 accepted for Component support.\n`, stderr: "" });
  }),
);

test(
  "XT-conformance-77: the key comes only from ORACLE_SIGNING_KEY and must match oracle.pub; no key, a wrong key, no oracle.pub or no valid manifest exits 1 naming the cause and writes nothing (FR-6, AD-15, AD-16)",
  withRoot(lines(LOWER, XT), async (fx) => {
    const out = join(fx.dir, FIXTURES_DIR);
    const args = ["generate", "9.1", "--root", fx.dir, "--image", "xaravel-oracle:test"];
    const none = await cli(args);
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("ORACLE_SIGNING_KEY is not set");
    const wrong = await cli(args, { ORACLE_SIGNING_KEY: keyPair().pem });
    expect(wrong.code).toBe(1);
    expect(wrong.stderr).toContain("signing key does not match conformance/oracle/oracle.pub");
    const garbage = await cli(args, { ORACLE_SIGNING_KEY: "not-a-key-secret-material" });
    expect(garbage.stderr).toContain("ORACLE_SIGNING_KEY is not a PEM private key");
    expect(garbage.stderr).not.toContain("not-a-key-secret-material");
    expect(existsSync(out)).toBe(false);

    // No evaluation happens before the key is checked.
    const stand = standIn();
    expect(cliInProcess(args, {}, stand.runner).code).toBe(1);
    expect(stand.calls).toEqual([]);

    // A failure is reported too, so the PR comment names it.
    const report = join(fx.dir, "report.md");
    expect(cliInProcess([...args, "--report", report], {}, stand.runner).code).toBe(1);
    expect(readFileSync(report, "utf8")).toContain("**Failed:** `ORACLE_SIGNING_KEY is not set");

    // No manifest, or an invalid one: fail closed, nothing evaluated or written.
    const manifestFile = join(fx.dir, "stories", "9.1.md");
    const text = readFileSync(manifestFile, "utf8");
    rmSync(manifestFile);
    const missing = cliInProcess(args, { ORACLE_SIGNING_KEY: fx.pem }, stand.runner);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("stories/9.1.md is missing");
    writeFileSync(manifestFile, text.replace("component: support", "component: Support"));
    const invalid = cliInProcess(args, { ORACLE_SIGNING_KEY: fx.pem }, stand.runner);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain("invalid manifest: stories/9.1.md: component");
    writeFileSync(manifestFile, text.replace("component: support", "component: generators"));
    const generators = cliInProcess(args, { ORACLE_SIGNING_KEY: fx.pem }, stand.runner);
    expect([generators.code, generators.stderr.includes("stories/9.1.md names Component generators")]).toEqual([1, true]);
    expect(stand.calls).toEqual([]);
    expect(existsSync(out)).toBe(false);
    writeFileSync(manifestFile, text);

    // No request file.
    rmSync(join(fx.dir, STORY_REQUESTS_DIR, "9.1.jsonl"));
    const noFile = cliInProcess(args, { ORACLE_SIGNING_KEY: fx.pem }, stand.runner);
    expect(noFile.code).toBe(1);
    expect(noFile.stderr).toContain(`${STORY_REQUESTS_DIR}/9.1.jsonl is missing`);

    // No oracle.pub.
    rmSync(join(fx.dir, PUBLIC_KEY_FILE));
    expect((await cli(args, { ORACLE_SIGNING_KEY: fx.pem })).stderr).toContain("conformance/oracle/oracle.pub is missing");
    expect(existsSync(out)).toBe(false);

    // Usage errors exit 2.
    for (const usage of [[], ["bogus"], ["check"], ["check", "x.y"], ["check", "9.1", "--image", "a"], ["generate", "9.1", "--image", "a", "--local", "b"], ["generate", "9.1", "--php", "php"], ["generate", "9.1", "--root"], ["check", "9.1", "--root", "a", "--root", "b"]]) {
      expect([usage, (await cli(usage)).code]).toEqual([usage, 2]);
    }
    // The key is never written to disk by the tool.
    for (const file of tree(fx.dir)) {
      expect([file, readFileSync(join(fx.dir, file), "utf8").includes("PRIVATE KEY")]).toEqual([file, false]);
    }
  }),
  TIMEOUT,
);

test(
  "XT-conformance-77: a request whose two evaluations differ gets no fixture and is rejected; the others are still written (FR-6, AD-15)",
  withRoot(lines(LOWER, XT), (fx) => {
    const stand = standIn((sha256, pass) => sha256 === XT.sha256 && pass === 2);
    const report = join(fx.dir, "report.md");
    const result = cliInProcess(["generate", "9.1", "--root", fx.dir, "--image", "xaravel-oracle:test", "--report", report], { ORACLE_SIGNING_KEY: fx.pem }, stand.runner);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe(`wrote ${fixturePath("support", LOWER)}\n`);
    const reason = `${STORY_REQUESTS_DIR}/9.1.jsonl:2: request ${XT.sha256} (${OWNED_XT}) differs between two evaluations; it gets no fixture`;
    expect(result.stderr).toContain(`${reason}\n`);
    expect(tree(join(fx.dir, FIXTURES_DIR))).toEqual([`support/${LOWER.sha256}.json`]);
    expect(readFileSync(report, "utf8")).toContain(`- \`${reason}\``);
  }),
);

function phpUnmet(): string | null {
  if (PHP === null) {
    return "php not on PATH";
  }
  const probe = Bun.spawnSync([PHP, "-r", 'echo PHP_VERSION, " ", extension_loaded("pcntl") ? 1 : 0;'], { stdout: "pipe" });
  const [version, pcntl] = probe.stdout.toString().split(" ");
  if (version !== PHP_VERSION) {
    return `php ${version ?? "?"} is not ${PHP_VERSION}`;
  }
  if (pcntl !== "1") {
    return "php lacks the pcntl extension";
  }
  return null;
}

function phpTest(name: string, body: () => void): void {
  const reason = phpUnmet() ?? (existsSync(join(LOCAL_INSTALL, "vendor", "autoload.php")) ? null : `${LOCAL_INSTALL} is not a locked local install`);
  if (reason === null) {
    test(name, body, TIMEOUT);
  } else if (REQUIRE) {
    test(name, () => {
      throw new Error(`XARAVEL_PHP_FIXTURES=require: ${reason}`);
    });
  } else {
    console.warn(`oracle-story.test.ts: skipping the evaluator run: ${reason}`);
    test.skip(`${name} [skipped: ${reason}]`, body);
  }
}

phpTest("XT-conformance-77: evaluate.php runs an Xaravel Test ID request bound to a bare PHPUnit TestCase in the global namespace, and a blade-render one in the bare Testbench case, in real PHP (FR-6, AD-15)", () => {
  const php = makeRequest("XT-support-1", "php-expr", { bindings: { value: "'Hello World'" }, setup: [], exprs: ["\\Illuminate\\Support\\Str::slug($value)", "__NAMESPACE__", "get_class($this)", "$this instanceof \\PHPUnit\\Framework\\TestCase"] });
  const blade = makeRequest("XT-view-1", "blade-render", { template: "{{ $a }}!", data: { a: "<b>" } });
  const dir = mkdtempSync(join(tmpdir(), "xaravel-evaluate-xt-"));
  try {
    const file = join(dir, "9.1.jsonl");
    writeFileSync(file, lines(php, blade));
    const once = (): string => {
      const proc = Bun.spawnSync([PHP!, join(root, EVALUATE_SCRIPT), LOCAL_INSTALL, PHP_VERSION, file], { stdout: "pipe", stderr: "pipe" });
      expect([proc.exitCode, proc.exitCode === 0 ? "" : proc.stderr.toString()]).toEqual([0, ""]);
      return proc.stdout.toString();
    };
    const first = once();
    expect(once()).toBe(first);
    const outputs = first.trimEnd().split("\n").map((line) => JSON.parse(line) as { sha256: string; output: Json });
    expect(outputs).toEqual([
      { sha256: php.sha256, output: { error: null, results: [{ value: "hello-world" }, { value: "" }, { value: "BareTestCase" }, { value: true }] } },
      { sha256: blade.sha256, output: { error: null, results: [{ value: "&lt;b&gt;!" }] } },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

phpTest("XT-conformance-77: generate --local runs the Story's XT request through evaluate.php for real and signs the result (FR-6, AD-15)", () => {
  const fx = fixtureRoot(lines(XT));
  try {
    // The fixture root's snapshot is the repository's own, so the local install is checked against it.
    mkdirSync(join(fx.dir, "conformance", "upstream"), { recursive: true });
    symlinkSync(join(root, "conformance", "upstream", "framework"), join(fx.dir, "conformance", "upstream", "framework"));
    const result = cliInProcess(["generate", "9.1", "--root", fx.dir, "--local", LOCAL_INSTALL, "--php", PHP!], { ORACLE_SIGNING_KEY: fx.pem });
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const text = readFileSync(join(fx.dir, fixturePath("support", XT)), "utf8");
    expect(text).toBe(renderFixture(signFixture(XT.sha256, { error: null, results: [{ value: "hello-world" }] }, fx.priv)));
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("XT-conformance-77: oracle.yml#story runs on a Story PR's request file under pull_request_target, from main's code only, with a read-only token, the oracle environment and the xaravel-oracle App (FR-6, AD-15, AD-16)", () => {
  const { workflow, job, step } = storyJob();
  // Trigger: a PR into main that touches conformance/oracle-requests/**.
  expect(workflow.on["pull_request_target"]).toEqual({ branches: ["main"], types: ["opened", "synchronize", "reopened"], paths: ["conformance/oracle-requests/**"] });
  expect(workflow.permissions).toEqual({ contents: "read" });
  // Guards: only this repository's story/* heads.
  expect(job.if).toBe("github.event_name == 'pull_request_target' && github.event.pull_request.head.repo.full_name == github.repository && startsWith(github.event.pull_request.head.ref, 'story/')");
  // Read-only GITHUB_TOKEN; the key lives only in the environment oracle.
  expect(job.permissions).toEqual({ contents: "read", packages: "read", "pull-requests": "read" });
  expect(job["environment"]).toBe("oracle");
  // The base commit, without persisted credentials; nothing checks out, installs or runs the PR's code.
  expect(job.steps[0]).toEqual({ uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", with: { ref: "${{ github.event.pull_request.base.sha }}", "persist-credentials": false } });
  expect(job.steps[1]).toEqual({ uses: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6", with: { "bun-version-file": ".bun-version" } });
  expect(job.steps.filter((entry) => (entry.uses ?? "").startsWith("actions/checkout@"))).toHaveLength(1);
  for (const entry of job.steps) {
    const run = entry.run ?? "";
    // No `${{ }}` inside a script: every event value reaches a script only through env.
    expect([entry.name, run.includes("${{")]).toEqual([entry.name, false]);
    expect([entry.name, /\b(bun|npm|yarn|pnpm) (install|ci)\b|git (fetch|checkout|clone)|composer/.test(run)]).toEqual([entry.name, false]);
    expect(entry["continue-on-error"]).toBeUndefined();
  }
  // The PR's request file comes from the API, at the head SHA, as data.
  const read = step("read");
  expect(read.env).toMatchObject({ GH_TOKEN: "${{ github.token }}", HEAD_SHA: "${{ github.event.pull_request.head.sha }}" });
  expect(read.run).toContain('gh api -H "Accept: application/vnd.github.raw" "repos/${REPO}/contents/conformance/oracle-requests/${STORY}.jsonl?ref=${HEAD_SHA}"');
  // The image is main's Oracle image on GHCR, named from oracle:tag; the read-only token only pulls it.
  const named = step("story");
  expect(named.run).toContain('tag="$(bun tools/oracle/oracle.ts tag)"');
  expect(named.run).toContain('echo "image=ghcr.io/${OWNER,,}/xaravel-oracle:${tag}" >> "$GITHUB_OUTPUT"');
  expect(named.run).toContain("^[1-9][0-9]*\\.[1-9][0-9]*$");
  const pull = job.steps.find((entry) => entry.name === "Pull the Oracle image")!;
  expect(pull.run).toContain(' pull "$IMAGE"');
  expect(pull.run).not.toContain(" push");
  // generate: main's tool, the key from the environment only, the PR's file as --requests.
  const generate = step("generate");
  expect(generate.env).toEqual({
    ORACLE_SIGNING_KEY: "${{ secrets.ORACLE_SIGNING_KEY }}",
    IMAGE: "${{ steps.story.outputs.image }}",
    STORY: "${{ steps.story.outputs.id }}",
    DIR: "${{ steps.story.outputs.dir }}",
  });
  expect(generate.run).toContain('bun tools/oracle/story.ts generate "$STORY" --image "$IMAGE" --requests "$DIR/requests.jsonl" --report "$DIR/report.md" --out "$DIR/fixtures"');
  // Only the generate step sees the signing key; the App key goes only to the pinned token action.
  const secretSteps = job.steps.filter((entry) => JSON.stringify(entry).includes("secrets."));
  expect(secretSteps.map((entry) => entry.id)).toEqual(["generate", "app"]);
  const app = step("app");
  expect(app.uses).toMatch(/^actions\/create-github-app-token@[0-9a-f]{40}$/);
  expect(app.with).toEqual({ "app-id": "${{ vars.XARAVEL_ORACLE_APP_ID }}", "private-key": "${{ secrets.XARAVEL_ORACLE_APP_KEY }}", "permission-contents": "write", "permission-pull-requests": "write" });
  expect(job.steps.indexOf(app)).toBeGreaterThan(job.steps.indexOf(generate));
  for (const entry of job.steps.filter((candidate) => candidate.uses !== undefined)) {
    expect(entry.uses).toMatch(/@[0-9a-f]{40}$/);
  }
  // The commit: the App's token, only conformance/fixtures/<component>/<sha256>.json, on the exact head SHA, fast-forward only.
  const commit = step("commit");
  expect(commit.env).toMatchObject({ GH_TOKEN: "${{ steps.app.outputs.token }}", HEAD_REF: "${{ github.event.pull_request.head.ref }}", HEAD_SHA: "${{ github.event.pull_request.head.sha }}" });
  expect(commit.run).toContain("^[a-z][a-z0-9-]*/[0-9a-f]{64}\\.json$");
  // The commit step's Component pattern is the one the batch checks request files against, so the two cannot drift.
  expect([COMPONENT_NAME.flags, COMPONENT_NAME.source.startsWith("^"), COMPONENT_NAME.source.endsWith("$")]).toEqual(["", true, true]);
  expect(commit.run).toContain(`${COMPONENT_NAME.source.slice(0, -1)}/[0-9a-f]{64}\\.json$`);
  expect(commit.run).toContain('--arg path "conformance/fixtures/${file}"');
  expect(commit.run).toContain('gh api "repos/${REPO}/git/commits/${HEAD_SHA}" --jq .tree.sha');
  expect(commit.run).toContain("parents: [$parent]");
  expect(commit.run).toContain('--arg parent "$HEAD_SHA"');
  expect(commit.run).toContain('current="$(gh api "repos/${REPO}/git/ref/heads/${HEAD_REF}" --jq .object.sha)"');
  expect(commit.run).toContain('if [ "$current" != "$HEAD_SHA" ]; then');
  expect(commit.run!.indexOf('if [ "$current" != "$HEAD_SHA" ]')).toBeLessThan(commit.run!.indexOf("--method PATCH"));
  expect(commit.run).toContain("{sha: $sha, force: false}");
  expect(commit.run).toContain('gh api --method PATCH "repos/${REPO}/git/refs/heads/${HEAD_REF}"');
  expect(commit.run).not.toMatch(/git push|force: true/);
  // A rejection fails the job, after the commit and the comment.
  const fail = job.steps.at(-1)!;
  expect(fail.name).toBe("Fail on a rejected request");
  expect(fail.if).toBe("steps.read.outputs.present == 'true' && steps.generate.outputs.status != '0'");
  expect(fail.run).toContain("exit 1");
  expect(generate.run).toContain('echo "status=${status}" >> "$GITHUB_OUTPUT"');
});

// ---------------------------------------------------------------------------
// XT-conformance-78

const BAD_HASH = { ...XT, sha256: "f".repeat(64) };

test(
  "XT-conformance-78: unowned, malformed, wrongly hashed, non-canonical, batch-duplicate, repeated and listed lines are rejected with reasons on stderr and in the report; the owned ones are still written; exit 1 (FR-6, AD-15, AD-16)",
  withRoot(
    [
      renderRequest(LOWER),
      renderRequest(UNOWNED),
      "{not json",
      `{"id":"${OWNED_XT}","kind":"php-expr","input":{"bindings":{},"setup":[],"exprs":[]},"sha256":"${"0".repeat(64)}"}`,
      renderRequest(BAD_HASH),
      renderRequest(XT).replace('"kind"', ' "kind"'),
      renderRequest(UPPER),
      renderRequest(LOWER),
      renderRequest(UUID),
      renderRequest(XT),
    ]
      .map((line) => `${line}\n`)
      .join(""),
    (fx) => {
      const file = `${STORY_REQUESTS_DIR}/9.1.jsonl`;
      const stand = standIn();
      const report = join(fx.dir, "report.md");
      const result = cliInProcess(["generate", "9.1", "--root", fx.dir, "--image", "xaravel-oracle:test", "--report", report], { ORACLE_SIGNING_KEY: fx.pem }, stand.runner);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe(`wrote ${fixturePath("support", LOWER)}\nwrote ${fixturePath("support", XT)}\n`);
      const stderr = result.stderr.split("\n");
      const expected = [
        `${file}:2: id ${UNOWNED.id} is not owned by Story 9.1; it is in neither test_ids nor xaravel_test_ids of stories/9.1.md`,
        `${file}:3: malformed JSON: `,
        `${file}:4: $.input.exprs: fewer than 1 items`,
        `${file}:5: $.sha256: expected ${XT.sha256}, the hash of the canonical request`,
        `${file}:6: the line is not in canonical form`,
        `${file}:7: request ${UPPER.sha256} is a batch request in ${REQUESTS_DIR}/support.jsonl; the batch already evaluates it`,
        `${file}:8: sha256 ${LOWER.sha256} repeats line 1`,
        `${file}:9: request ${UUID.sha256} is a batch request in ${REQUESTS_DIR}/support.jsonl; the batch already evaluates it; request ${UUID.sha256} is listed in ${NONDETERMINISM_FILE}:1; a listed request gets no fixture`,
      ];
      for (const [index, prefix] of expected.entries()) {
        expect([prefix, stderr[index]!.startsWith(prefix)]).toEqual([prefix, true]);
      }
      expect(stderr[expected.length]).toBe(`Oracle story requests failed: Story 9.1: 8 rejection(s) in ${file}; 2 signed fixture(s) written for Component support.`);
      // Only the accepted requests reached the evaluator; the rest got no fixture.
      expect(stand.calls[0]!.requests).toEqual([renderRequest(LOWER), renderRequest(XT)]);
      expect(tree(join(fx.dir, FIXTURES_DIR))).toEqual([`support/${LOWER.sha256}.json`, `support/${XT.sha256}.json`].sort());
      // The report names every rejection with its reason, in code spans, and the fixtures written.
      const text = readFileSync(report, "utf8");
      expect(text).toContain(`\`${file}\`: 10 request line(s); 2 signed fixture(s) written, 8 rejected.`);
      expect(text).toContain("**Rejected** (no fixture):");
      for (const prefix of expected) {
        expect([prefix, text.includes(`- \`${prefix}`)]).toEqual([prefix, true]);
      }
      expect(text).toContain(`- \`${fixturePath("support", XT)}\`: \`${OWNED_XT}\``);

      // A request already accepted in another committed per-Story file is rejected, naming that file.
      writeFileSync(join(fx.dir, "stories", "9.2.md"), manifest("9.2", "support", [OWNED_PHPUNIT], []));
      writeFileSync(join(fx.dir, STORY_REQUESTS_DIR, "9.2.jsonl"), lines(LOWER));
      expect(cliInProcess(["check", "9.1", "--root", fx.dir], {}).stderr).toContain(`${file}:1: request ${LOWER.sha256} is also in ${STORY_REQUESTS_DIR}/9.2.jsonl:1\n`);
    },
  ),
);

test(
  "XT-conformance-78: check gives the same judgement without evaluating or writing; a file without a final LF has its last line judged plus one file-level problem (FR-6, AD-16)",
  withRoot(lines(LOWER, UNOWNED, XT), async (fx) => {
    const file = `${STORY_REQUESTS_DIR}/9.1.jsonl`;
    const stand = standIn();
    const report = join(fx.dir, "report.md");
    const checked = cliInProcess(["check", "9.1", "--root", fx.dir, "--report", report], {}, stand.runner);
    expect(checked).toEqual({
      code: 1,
      stdout: "",
      stderr: `${file}:2: id ${UNOWNED.id} is not owned by Story 9.1; it is in neither test_ids nor xaravel_test_ids of stories/9.1.md\nOracle story requests failed: Story 9.1: 1 rejection(s) in ${file}; 2 accepted for Component support.\n`,
    });
    expect(stand.calls).toEqual([]);
    expect(existsSync(join(fx.dir, FIXTURES_DIR))).toBe(false);
    const text = readFileSync(report, "utf8");
    expect(text).toContain("**Accepted** (Component `support`):");
    expect(text).toContain(`- \`${file}:1\`: \`${OWNED_PHPUNIT}\``);
    expect(text).toContain(`- \`${file}:2: id ${UNOWNED.id} is not owned by Story 9.1`);

    // As a process: same exit code, no key needed.
    expect((await cli(["check", "9.1", "--root", fx.dir])).code).toBe(1);

    // All owned: exit 0.
    writeFileSync(join(fx.dir, file), lines(LOWER, XT));
    expect(cliInProcess(["check", "9.1", "--root", fx.dir], {})).toEqual({ code: 0, stdout: `Oracle story requests: Story 9.1: 2 request(s) in ${file}; 2 accepted for Component support.\n`, stderr: "" });

    // No final LF: the last line is still judged (and accepted), and the file has one problem.
    writeFileSync(join(fx.dir, file), lines(LOWER, XT).slice(0, -1));
    const unterminated = cliInProcess(["check", "9.1", "--root", fx.dir], {});
    expect(unterminated).toEqual({ code: 1, stdout: "", stderr: `${file}: the file must end with a newline\nOracle story requests failed: Story 9.1: 1 rejection(s) in ${file}; 2 accepted for Component support.\n` });

    // A backtick in a reason cannot break out of its code span.
    const tricky = renderReport("9.1", { storyId: "9.1", file, component: "support", mode: "check", total: 1, accepted: [], rejections: [{ line: 1, id: null, sha256: null, reasons: ["a `b` @someone"] }], written: [] });
    expect(tricky).toContain("- ``conformance/oracle-requests/9.1.jsonl:1: a `b` @someone``");
  }),
);

test("XT-conformance-78: the story job comments the report on the PR with the App token when a request was rejected or a commit was made (FR-6, AD-16)", () => {
  const { job, step } = storyJob();
  const comment = job.steps.find((entry) => entry.name === "Comment the report on the PR")!;
  expect(comment.if).toBe("steps.read.outputs.present == 'true' && always() && steps.generate.outputs.status != '' && steps.app.outputs.token != '' && (steps.generate.outputs.status != '0' || steps.commit.outputs.committed == 'true')");
  expect(comment.env).toEqual({
    GH_TOKEN: "${{ steps.app.outputs.token }}",
    REPO: "${{ github.repository }}",
    PR_NUMBER: "${{ github.event.pull_request.number }}",
    DIR: "${{ steps.story.outputs.dir }}",
  });
  // One comment per PR: the App edits its own last comment instead of stacking new ones.
  expect(comment.run).toBe('gh pr comment "$PR_NUMBER" --repo "$REPO" --body-file "$DIR/report.md" --edit-last --create-if-none');
  // The comment and the commit come after generate and the App token; the job fails afterwards.
  const order = ["generate", "app", "commit"].map((id) => job.steps.indexOf(step(id)));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(job.steps.indexOf(comment)).toBeGreaterThan(order.at(-1)!);
});

// ---------------------------------------------------------------------------
// XT-conformance-79

test(
  "XT-conformance-79: fixtures the story job generated verify under Story 3.3's check on a root with the committed request file; an unowned committed request, a missing manifest, a request in two Story files and a fixture in another Component's directory are violations (FR-6, AD-15)",
  withRoot(lines(LOWER, XT), async (fx) => {
    const run = (): number => cliInProcess(["generate", "9.1", "--root", fx.dir, "--image", "xaravel-oracle:test"], { ORACLE_SIGNING_KEY: fx.pem }, standIn().runner).code;
    expect(run()).toBe(0);
    expect(verifyFixtures(fx.dir)).toEqual({ count: 2, violations: [] });
    const verifyCli = Bun.spawnSync([process.execPath, join(root, "tools", "oracle", "verify.ts"), "--root", fx.dir], { stdout: "pipe", stderr: "pipe" });
    expect([verifyCli.exitCode, verifyCli.stdout.toString(), verifyCli.stderr.toString()]).toEqual([0, `Oracle fixtures OK: 2 fixtures verify against ${PUBLIC_KEY_FILE}.\n`, ""]);

    const file = `${STORY_REQUESTS_DIR}/9.1.jsonl`;
    // An unowned committed request is a violation (its fixture, signed by hand here, has no valid source either).
    writeFileSync(join(fx.dir, file), lines(LOWER, XT, UNOWNED));
    writeFileSync(join(fx.dir, fixturePath("support", UNOWNED)), renderFixture(signFixture(UNOWNED.sha256, outputFor(UNOWNED), fx.priv)));
    expect(verifyFixtures(fx.dir).violations).toEqual([
      `${fixturePath("support", UNOWNED)}: no committed request with sha256 ${UNOWNED.sha256} in ${REQUESTS_DIR}/support.jsonl`,
      `${file}:3: id ${UNOWNED.id} is not owned by Story 9.1; it is in neither test_ids nor xaravel_test_ids of stories/9.1.md`,
    ]);
    rmSync(join(fx.dir, fixturePath("support", UNOWNED)));
    writeFileSync(join(fx.dir, file), lines(LOWER, XT));

    // A fixture of the Story's request in another Component's directory.
    mkdirSync(join(fx.dir, FIXTURES_DIR, "view"), { recursive: true });
    copyFileSync(join(fx.dir, fixturePath("support", XT)), join(fx.dir, fixturePath("view", XT)));
    expect(verifyFixtures(fx.dir).violations).toEqual([`${fixturePath("view", XT)}: request ${XT.sha256} is in ${file}, a request of Story 9.1's Component support, not view`]);
    rmSync(join(fx.dir, fixturePath("view", XT)));

    // A request also in another Story's file: the later file's line is a violation.
    writeFileSync(join(fx.dir, "stories", "9.2.md"), manifest("9.2", "support", [], [OWNED_XT]));
    writeFileSync(join(fx.dir, STORY_REQUESTS_DIR, "9.2.jsonl"), lines(XT));
    expect(verifyFixtures(fx.dir).violations).toEqual([`${STORY_REQUESTS_DIR}/9.2.jsonl:1: request ${XT.sha256} is also in ${file}:2`]);
    rmSync(join(fx.dir, STORY_REQUESTS_DIR, "9.2.jsonl"));

    // A request file whose Story has no manifest: a violation, and its fixtures have no source.
    rmSync(join(fx.dir, "stories", "9.1.md"));
    const orphan = verifyFixtures(fx.dir).violations;
    expect(orphan).toContain(`${file}: no valid manifest: stories/9.1.md is missing; a per-Story request file needs its Story's manifest on the base branch`);
    expect(orphan).toContain(`${fixturePath("support", XT)}: no committed request with sha256 ${XT.sha256} in ${REQUESTS_DIR}/support.jsonl`);
    const failed = Bun.spawnSync([process.execPath, join(root, "tools", "oracle", "verify.ts"), "--root", fx.dir], { stdout: "pipe", stderr: "pipe" });
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr.toString()).toContain(`problem(s) under ${FIXTURES_DIR}/ and ${STORY_REQUESTS_DIR}/`);
    writeFileSync(join(fx.dir, "stories", "9.1.md"), manifest("9.1", "support", [OWNED_PHPUNIT], [OWNED_XT]));

    // A stray name in conformance/oracle-requests/.
    writeFileSync(join(fx.dir, STORY_REQUESTS_DIR, "notes.txt"), "x\n");
    expect(verifyFixtures(fx.dir).violations).toEqual([`${STORY_REQUESTS_DIR}/notes.txt: not a per-Story request file; ${STORY_REQUESTS_DIR}/ holds only <story-id>.jsonl files`]);
    rmSync(join(fx.dir, STORY_REQUESTS_DIR, "notes.txt"));
    expect(verifyFixtures(fx.dir)).toEqual({ count: 2, violations: [] });
  }),
);

test(
  "XT-conformance-79: a Story whose Component has no batch request file gets its fixtures verified there, and the batch rerun keeps every per-Story fixture while still deleting strays (FR-6, AD-15)",
  withRoot(lines(LOWER, XT), (fx) => {
    // Story 9.3 (component testing, no batch file) owns another XT request.
    const other = makeRequest("XT-testing-1", "php-expr", { bindings: {}, setup: [], exprs: ["1 + 1"] });
    writeFileSync(join(fx.dir, "stories", "9.3.md"), manifest("9.3", "testing", [], ["XT-testing-1"]));
    writeFileSync(join(fx.dir, STORY_REQUESTS_DIR, "9.3.jsonl"), lines(other));
    expect(cliInProcess(["generate", "9.1", "--root", fx.dir, "--image", "xaravel-oracle:test"], { ORACLE_SIGNING_KEY: fx.pem }, standIn().runner).code).toBe(0);
    expect(cliInProcess(["generate", "9.3", "--root", fx.dir, "--image", "xaravel-oracle:test"], { ORACLE_SIGNING_KEY: fx.pem }, standIn().runner).code).toBe(0);
    expect(verifyFixtures(fx.dir)).toEqual({ count: 3, violations: [] });
    const unknown = `${FIXTURES_DIR}/testing/${"9".repeat(64)}.json`;
    writeFileSync(join(fx.dir, unknown), renderFixture(signFixture("9".repeat(64), outputFor(other), fx.priv)));
    expect(verifyFixtures(fx.dir).violations).toEqual([`${unknown}: no committed request with sha256 ${"9".repeat(64)} in an accepted per-Story request file of Component testing`]);

    // The batch rerun: story fixtures in support/ (which has batch requests) and testing/ (which has none) stay; strays go.
    const stray = `${FIXTURES_DIR}/support/${"0".repeat(64)}.json`;
    writeFileSync(join(fx.dir, stray), "stale\n");
    const story = (path: string): string => readFileSync(join(fx.dir, path), "utf8");
    const kept = [fixturePath("support", LOWER), fixturePath("support", XT), fixturePath("testing", other)].map((path) => [path, story(path)] as const);
    const result = generateFixtures(fx.dir, { image: "xaravel-oracle:test", runner: standIn((sha256) => sha256 === UUID.sha256).runner, signingKey: fx.pem });
    expect(result.differences).toEqual([]);
    expect(result.removed.sort()).toEqual([`support/${"0".repeat(64)}.json`, `testing/${"9".repeat(64)}.json`]);
    for (const [path, text] of kept) {
      expect([path, existsSync(join(fx.dir, path)) && story(path) === text]).toEqual([path, true]);
    }
    // The batch never re-signs a per-Story fixture: it wrote only its own.
    expect(result.counts).toEqual({ support: 1, view: 1 });
    expect(verifyFixtures(fx.dir)).toEqual({ count: 5, violations: [] });
    expect(story(fixturePath("support", UPPER))).toBe(renderFixture(signFixture(UPPER.sha256, outputFor(UPPER), fx.priv)));
  }),
);

test("XT-conformance-79: a Story may commit signed fixtures only under its own Component's directory, and the committed repository still verifies (AD-16)", async () => {
  const support = { storyId: "9.1", component: "support" };
  for (const path of [`${FIXTURES_DIR}/support/${"a".repeat(64)}.json`, `${FIXTURES_DIR}/support/${"0123456789abcdef".repeat(4)}.json`]) {
    expect([path, allowedPath(support, path)]).toEqual([path, true]);
  }
  for (const path of [
    `${FIXTURES_DIR}/view/${"a".repeat(64)}.json`,
    `${FIXTURES_DIR}/supporting/${"a".repeat(64)}.json`,
    `${FIXTURES_DIR}/support/${"A".repeat(64)}.json`,
    `${FIXTURES_DIR}/support/${"a".repeat(63)}.json`,
    `${FIXTURES_DIR}/support/${"a".repeat(64)}.json.bak`,
    `${FIXTURES_DIR}/support/nested/${"a".repeat(64)}.json`,
    `${FIXTURES_DIR}/support/notes.txt`,
    `${FIXTURES_DIR}/generators/${"a".repeat(64)}.json`,
    `${FIXTURES_DIR}/support/../view/${"a".repeat(64)}.json`,
    `${FIXTURES_DIR}/${"a".repeat(64)}.json`,
  ]) {
    expect([path, allowedPath(support, path)]).toEqual([path, false]);
  }
  expect(allowedPath({ storyId: "9.1", component: "generators" }, `${FIXTURES_DIR}/generators/${"a".repeat(64)}.json`)).toBe(false);

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
  expect(pkg.scripts["oracle:story"]).toBe("bun tools/oracle/story.ts");
  const proc = Bun.spawn([process.execPath, "run", "oracle:verify-fixtures"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  expect(code).toBe(0);
  expect(stdout).toMatch(/^Oracle fixtures OK: \d+ fixtures verify against conformance\/oracle\/oracle\.pub\.\n$/);
});
