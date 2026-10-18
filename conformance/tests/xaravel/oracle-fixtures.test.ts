// Xaravel Tests for Story 3.2 (batch fixture generation and Ed25519 signing,
// FR-6, AD-15, decisions/ESC-3.2-1.md). These run under plain `bun test` until
// the harness lands in Epic 5.
//
// The batch runs against hermetic fixture roots: a few requests, a stand-in
// image runner that answers for tools/oracle/evaluate.php, and an Ed25519 key
// pair generated here for the test only (never committed, never the Oracle's).
// The evaluator itself runs for real (PHP code a tool runs needs a test that
// executes it) against the locked local install in /tmp/xaravel-inv/framework
// when it is present; when `php` is not on PATH those tests are skipped and
// their name gives the reason, and with XARAVEL_PHP_FIXTURES=require they fail
// instead. This file never imports tools/oracle/oracle.ts directly or names
// its image runner (XT-conformance-44); image mode runs only through the
// stand-in.
import { expect, test } from "bun:test";
import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkRecords, parseEscalation } from "../../../tools/escalations/escalations";
import { PHP_VERSION, type ImageRunner } from "../../../tools/inventory/inventory";
import {
  EVALUATE_SCRIPT,
  fingerprint,
  FIXTURE_DOMAIN,
  fixtureMessage,
  FIXTURES_DIR,
  generateFixtures,
  main,
  NONDETERMINISM_FILE,
  parseNondeterminism,
  PUBLIC_KEY_FILE,
  readCommittedRequests,
  renderNondeterminism,
  verifyFixture,
  type FixturesOptions,
} from "../../../tools/oracle/fixtures";
import { activePhases, isProtected, parseList } from "../../../tools/protected-paths/protected-paths";
import { canonicalJson, makeRequest, renderRequests, REQUESTS_DIR, SCHEMA_FILE, type Json, type OracleRequest } from "../../../tools/oracle/request";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "oracle", "fixtures.ts");
const REQUIRE = process.env["XARAVEL_PHP_FIXTURES"] === "require";
const PHP = Bun.which("php");
const LOCAL_INSTALL = "/tmp/xaravel-inv/framework";
const TIMEOUT = 120_000;

// ---------------------------------------------------------------------------
// Fixture roots

const STR = "Illuminate\\Tests\\Support\\SupportStrTest";
const REQUESTS: { component: string; request: OracleRequest }[] = [
  { component: "support", request: makeRequest(`${STR}::testUpper`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::upper('a')"] }) },
  { component: "support", request: makeRequest(`${STR}::testUuid`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::uuid()"] }) },
  { component: "view", request: makeRequest("Illuminate\\Tests\\View\\Blade\\BladeEchoTest::testEchos", "blade-render", { template: "{{ $a }}", data: { a: "x" } }) },
  {
    component: "database",
    request: makeRequest("Illuminate\\Tests\\Database\\DatabaseQueryBuilderTest::testBasicSelect", "sql-grammar", { grammar: "base", setup: ["$builder = $this->getBuilder();"], exprs: ["$builder->toSql()"] }),
  },
];
const UUID = REQUESTS[1]!.request;

interface Root {
  dir: string;
  pub: KeyObject;
  pem: string;
}

function keyPair(): { pub: KeyObject; pem: string } {
  const pair = generateKeyPairSync("ed25519");
  return { pub: pair.publicKey, pem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}

/** A fixture root: the schema, the requests above, evaluate.php, a test oracle.pub and (optionally) a listing. */
function fixtureRoot(listing: string | null = renderNondeterminism({ sha256: UUID.sha256, id: UUID.id, reason: "Str::uuid() is random" }) + "\n"): Root {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-fixtures-"));
  mkdirSync(join(dir, REQUESTS_DIR), { recursive: true });
  mkdirSync(join(dir, "tools", "oracle"), { recursive: true });
  copyFileSync(join(root, SCHEMA_FILE), join(dir, SCHEMA_FILE));
  copyFileSync(join(root, EVALUATE_SCRIPT), join(dir, EVALUATE_SCRIPT));
  for (const [component, text] of renderRequests(REQUESTS)) {
    writeFileSync(join(dir, REQUESTS_DIR, `${component}.jsonl`), text);
  }
  if (listing !== null) {
    writeFileSync(join(dir, NONDETERMINISM_FILE), listing);
  }
  const { pub, pem } = keyPair();
  writeFileSync(join(dir, PUBLIC_KEY_FILE), pub.export({ type: "spki", format: "pem" }).toString());
  return { dir, pub, pem };
}

/** The deterministic output the stand-in gives a request: its id, echoed. */
function outputFor(request: OracleRequest): Json {
  return { error: null, results: [{ value: request.id }] };
}

interface Stand {
  runner: ImageRunner;
  calls: { image: string; mounts: { host: string; container: string }[]; command: string[] }[];
}

/**
 * A stand-in image runner for evaluate.php: it reads the request files through their mounts and prints one
 * `{sha256, output}` line per request. `differ(sha256, pass)` makes a request's output depend on the pass.
 */
function standIn(differ: (sha256: string, pass: number) => boolean = (sha256) => sha256 === UUID.sha256): Stand {
  const calls: Stand["calls"] = [];
  const runner: ImageRunner = (image, mounts, command) => {
    calls.push({ image, mounts: mounts.map((mount) => ({ ...mount })), command: [...command] });
    const pass = calls.length;
    const requestsMount = mounts.find((mount) => mount.container === "/xaravel/requests")!;
    const lines: string[] = [];
    for (const file of command.slice(4)) {
      const text = readFileSync(join(requestsMount.host, file.slice("/xaravel/requests/".length)), "utf8");
      for (const line of text.split("\n").filter((entry) => entry !== "")) {
        const request = JSON.parse(line) as OracleRequest;
        const output = differ(request.sha256, pass) ? { error: null, results: [{ value: `pass ${pass}` }] } : outputFor(request);
        lines.push(JSON.stringify({ sha256: request.sha256, output }));
      }
    }
    return lines.map((line) => `${line}\n`).join("");
  };
  return { runner, calls };
}

function run(fx: Root, options: FixturesOptions = {}, stand: Stand = standIn()) {
  return generateFixtures(fx.dir, { image: "xaravel-oracle:test", runner: stand.runner, signingKey: fx.pem, ...options });
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

function snapshotTree(dir: string): Record<string, string> {
  return Object.fromEntries(tree(dir).map((file) => [file, readFileSync(join(dir, file), "utf8")]));
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

// ---------------------------------------------------------------------------
// XT-conformance-71

test("XT-conformance-71: the batch writes conformance/fixtures/<component>/<sha256>.json with the request hash, the output and an Ed25519 signature over both, verifiable with oracle.pub (FR-6, AD-15)", async () => {
  const fx = fixtureRoot();
  try {
    // Generators are reference files the batch never touches; a stray fixture is deleted.
    const out = join(fx.dir, FIXTURES_DIR);
    mkdirSync(join(out, "generators"), { recursive: true });
    writeFileSync(join(out, "generators", "keep.json"), "generator reference\n");
    mkdirSync(join(out, "support"), { recursive: true });
    writeFileSync(join(out, "support", `${"0".repeat(64)}.json`), "stale\n");
    writeFileSync(join(out, "support", "notes.txt"), "not a fixture\n");
    // A Component whose request file is gone keeps no fixtures.
    mkdirSync(join(out, "gone"), { recursive: true });
    writeFileSync(join(out, "gone", `${"1".repeat(64)}.json`), "stale\n");

    const stand = standIn();
    const result = run(fx, {}, stand);
    expect(result.differences).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.escalation).toBeNull();
    expect(result.exempt).toBe(1);
    expect(result.counts).toEqual({ database: 1, support: 1, view: 1 });
    expect(result.removed).toEqual([`support/${"0".repeat(64)}.json`, `gone/${"1".repeat(64)}.json`]);

    // Image mode: evaluate.php and the request directory mounted read-only, the image's framework, the Pin's PHP, twice.
    expect(stand.calls).toHaveLength(2);
    expect(stand.calls[0]).toEqual(stand.calls[1]!);
    expect(stand.calls[0]!.image).toBe("xaravel-oracle:test");
    expect(stand.calls[0]!.mounts).toEqual([
      { host: join(fx.dir, EVALUATE_SCRIPT), container: "/xaravel/evaluate.php" },
      { host: join(fx.dir, REQUESTS_DIR), container: "/xaravel/requests" },
    ]);
    expect(stand.calls[0]!.command).toEqual(["php", "/xaravel/evaluate.php", "/oracle/upstream/framework", PHP_VERSION, "/xaravel/requests/database.jsonl", "/xaravel/requests/support.jsonl", "/xaravel/requests/view.jsonl"]);

    // One fixture per unlisted request, at the right path; the listed random request gets none.
    const expected = REQUESTS.filter(({ request }) => request.sha256 !== UUID.sha256);
    expect(tree(out)).toEqual(["generators/keep.json", "support/notes.txt", ...expected.map(({ component, request }) => `${component}/${request.sha256}.json`)].sort());
    expect(readFileSync(join(out, "generators", "keep.json"), "utf8")).toBe("generator reference\n");
    expect(readFileSync(join(out, "support", "notes.txt"), "utf8")).toBe("not a fixture\n");
    const pubPem = readFileSync(join(fx.dir, PUBLIC_KEY_FILE), "utf8");
    for (const { component, request } of expected) {
      const text = readFileSync(join(out, component, `${request.sha256}.json`), "utf8");
      // One compact line: sha256, output (canonical JSON), signature; LF.
      expect(text.endsWith("}\n")).toBe(true);
      expect(text.split("\n")).toHaveLength(2);
      const fixture = JSON.parse(text) as { sha256: string; output: Json; signature: string };
      expect(Object.keys(fixture)).toEqual(["sha256", "output", "signature"]);
      expect(fixture.sha256).toBe(request.sha256);
      expect(fixture.output).toEqual(outputFor(request));
      expect(text).toBe(`{"sha256":"${request.sha256}","output":${canonicalJson(outputFor(request))},"signature":"${fixture.signature}"}\n`);
      // The signature is Ed25519 over the domain prefix and canonicalJson({output, sha256}), and verifies with oracle.pub.
      expect(fixtureMessage(request.sha256, fixture.output).toString("utf8")).toBe(`${FIXTURE_DOMAIN}{"output":${canonicalJson(fixture.output)},"sha256":"${request.sha256}"}`);
      expect(verifyFixture(text, pubPem, request.sha256)).toEqual([]);
      // A tampered output, hash or signature, another key, or a non-canonical file does not verify.
      const tampered = text.replace(JSON.stringify(request.id), JSON.stringify(`${request.id}x`));
      expect(verifyFixture(tampered, pubPem)).toEqual(["the signature does not verify"]);
      expect(verifyFixture(text, pubPem, "f".repeat(64))).toEqual([`sha256 ${request.sha256} is not ${"f".repeat(64)}`]);
      expect(verifyFixture(text, keyPair().pub)).toEqual(["the signature does not verify"]);
      expect(verifyFixture(text.replace(/"signature":"[^"]*"/, `"signature":"${Buffer.alloc(64).toString("base64")}"`), pubPem)).toEqual(["the signature does not verify"]);
      expect(verifyFixture(`${text.slice(0, -1)}\r\n`, pubPem)).toContain("the file is not in canonical form (one compact line, output in canonical JSON, LF)");
      expect(verifyFixture("{}", pubPem)).toEqual(["expected an object with the keys sha256, output, signature in that order"]);
      // A public key that is not an Ed25519 PEM is a problem, not a throw.
      expect(verifyFixture(text, "not a pem")[0]).toStartWith("the public key is not a PEM public key");
      const rsaPub = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
      expect(verifyFixture(text, rsaPub)).toEqual(["the public key is not an Ed25519 key (it is rsa)"]);
      // A signature in non-canonical base64 (trailing bits set) or not 64 bytes long is malformed.
      const signature = fixture.signature;
      const last = signature.at(-3)!;
      const loose = `${signature.slice(0, -3)}${String.fromCharCode(last.charCodeAt(0) + 1)}==`;
      expect(Buffer.from(loose, "base64").equals(Buffer.from(signature, "base64"))).toBe(true);
      expect(verifyFixture(text.replace(signature, loose), pubPem)).toEqual(["signature is not the canonical base64 of 64 bytes"]);
      expect(verifyFixture(text.replace(signature, Buffer.alloc(63).toString("base64")), pubPem)).toEqual(["signature is not the canonical base64 of 64 bytes"]);
    }

    // The committed request files are what the batch reads.
    expect(readCommittedRequests(fx.dir).map((entry) => entry.component)).toEqual(["database", "support", "view"]);

    // --out writes elsewhere and leaves conformance/fixtures alone.
    const before = snapshotTree(out);
    const elsewhere = join(fx.dir, "elsewhere");
    run(fx, { out: elsewhere });
    expect(snapshotTree(out)).toEqual(before);
    expect(tree(elsewhere)).toEqual(expected.map(({ component, request }) => `${component}/${request.sha256}.json`).sort());

    // The CLI, in-process with the stand-in: exit 0 and a summary.
    const ok = cliInProcess(["--root", fx.dir, "--image", "xaravel-oracle:test"], { ORACLE_SIGNING_KEY: fx.pem }, standIn().runner);
    expect(ok).toEqual({
      code: 0,
      stdout: `database: 1 fixtures\nsupport: 1 fixtures\nview: 1 fixtures\nOracle fixtures: 3 signed fixtures for 4 requests (1 listed in ${NONDETERMINISM_FILE} get none).\n`,
      stderr: "",
    });
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("XT-conformance-71: the private key comes only from ORACLE_SIGNING_KEY and must match oracle.pub; a wrong or missing key or pub writes nothing (FR-6, AD-15)", async () => {
  const fx = fixtureRoot();
  try {
    const out = join(fx.dir, FIXTURES_DIR);
    // No key: the process environment has none, so nothing runs and nothing is written.
    const none = await cli(["--root", fx.dir, "--image", "xaravel-oracle:test"]);
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("ORACLE_SIGNING_KEY is not set");
    expect(existsSync(out)).toBe(false);
    // A key that is not oracle.pub's private half.
    const wrong = await cli(["--root", fx.dir, "--image", "xaravel-oracle:test"], { ORACLE_SIGNING_KEY: keyPair().pem });
    expect(wrong.code).toBe(1);
    expect(wrong.stderr).toContain("signing key does not match conformance/oracle/oracle.pub");
    expect(existsSync(out)).toBe(false);
    // Not a key at all: the error never echoes the value.
    const garbage = await cli(["--root", fx.dir], { ORACLE_SIGNING_KEY: "not-a-key-secret-material" });
    expect(garbage.code).toBe(1);
    expect(garbage.stderr).toContain("ORACLE_SIGNING_KEY is not a PEM private key");
    expect(garbage.stderr).not.toContain("not-a-key-secret-material");
    // A key of another type.
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect((await cli(["--root", fx.dir], { ORACLE_SIGNING_KEY: rsa })).stderr).toContain("ORACLE_SIGNING_KEY is not an Ed25519 key");
    // No oracle.pub.
    rmSync(join(fx.dir, PUBLIC_KEY_FILE));
    const nopub = await cli(["--root", fx.dir], { ORACLE_SIGNING_KEY: fx.pem });
    expect(nopub.code).toBe(1);
    expect(nopub.stderr).toContain("conformance/oracle/oracle.pub is missing");
    expect(existsSync(out)).toBe(false);
    expect(() => run(fx)).toThrow("conformance/oracle/oracle.pub is missing");

    // Usage errors exit 2.
    for (const args of [["--bogus"], ["--image", "a", "--local", "b"], ["--php", "php"], ["--determinism", "--out", "x"], ["fingerprint", "--image", "a"], ["--root"]]) {
      expect([args, (await cli(args)).code]).toEqual([args, 2]);
    }
    // The key is never written to disk by the tool: nothing in the root holds it.
    for (const file of tree(fx.dir)) {
      expect([file, readFileSync(join(fx.dir, file), "utf8").includes("PRIVATE KEY")]).toEqual([file, false]);
    }
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
}, TIMEOUT);

// ---------------------------------------------------------------------------
// The evaluator, for real

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
    console.warn(`oracle-fixtures.test.ts: skipping the evaluator run: ${reason}`);
    test.skip(`${name} [skipped: ${reason}]`, body);
  }
}

phpTest("XT-conformance-71: evaluate.php evaluates one committed request of each kind in real PHP, records a throwing expr as throws and a failing stage as error (FR-6, AD-15)", () => {
  const committed = readCommittedRequests(root).flatMap((entry) => entry.requests);
  const listed = new Set(parseNondeterminism(readFileSync(join(root, NONDETERMINISM_FILE), "utf8")).map((entry) => entry.sha256));
  const kinds = ["php-expr", "sql-grammar", "blade-render", "validation-message", "date-format"] as const;
  const picked = kinds.map((kind) => committed.find((request) => request.kind === kind && !listed.has(request.sha256))!);
  const extra = [
    makeRequest(`${STR}::testUuid`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::of('a')->doesNotExist()", "\\Illuminate\\Support\\Str::upper('b')", "1.5", "[1 => 'x']", "(new \\ReflectionClass(\\Illuminate\\Support\\Str::class))->getFileName()"] }),
    makeRequest(`${STR}::testUuid`, "php-expr", { bindings: {}, setup: ["throw new \\RuntimeException('boom');"], exprs: ["1"] }),
    // A noisy request: none of its output reaches the protocol stream.
    makeRequest(`${STR}::testUuid`, "php-expr", {
      bindings: {},
      setup: [
        "echo 'echoed', PHP_EOL;",
        "print 'printed' . PHP_EOL;",
        "ini_set('display_errors', '1');",
        `$forged = fopen('php://stdout', 'w'); if ($forged !== false) { fwrite($forged, '{"sha256":"forged","output":{"error":null,"results":[]}}' . PHP_EOL); fflush($forged); }`,
        "trigger_error('displayed notice', E_USER_NOTICE);",
        "fwrite(\\STDOUT, 'to STDOUT' . PHP_EOL);",
        "dump('dumped');",
      ],
      exprs: ["1"],
    }),
    // A noisy request that dies of a fatal error.
    makeRequest(`${STR}::testUuid`, "php-expr", { bindings: {}, setup: ["echo 'before the fatal', PHP_EOL;", "eval('class NoisyFatal { abstract function f(); }');"], exprs: ["1"] }),
  ];
  const dir = mkdtempSync(join(tmpdir(), "xaravel-evaluate-"));
  try {
    // Two request files: evaluate.php answers file by file, line by line.
    const files = [join(dir, "a.jsonl"), join(dir, "b.jsonl")];
    writeFileSync(files[0]!, picked.map((request) => `${JSON.stringify(request)}\n`).join(""));
    writeFileSync(files[1]!, extra.map((request) => `${JSON.stringify(request)}\n`).join(""));
    const once = (): string => {
      const proc = Bun.spawnSync([PHP!, join(root, EVALUATE_SCRIPT), LOCAL_INSTALL, PHP_VERSION, ...files], { stdout: "pipe", stderr: "pipe" });
      expect([proc.exitCode, proc.exitCode === 0 ? "" : proc.stderr.toString()]).toEqual([0, ""]);
      return proc.stdout.toString();
    };
    const first = once();
    expect(once()).toBe(first);
    const lines = first.trimEnd().split("\n").map((line) => JSON.parse(line) as { sha256: string; output: { error: unknown; results: unknown[] } });
    expect(lines.map((line) => line.sha256)).toEqual([...picked, ...extra].map((request) => request.sha256));
    picked.forEach((request, index) => {
      const output = lines[index]!.output;
      expect([request.kind, output.error]).toEqual([request.kind, null]);
      const exprs = request.kind === "blade-render" ? 1 : (request.input["exprs"] as string[]).length;
      expect([request.kind, output.results.length]).toEqual([request.kind, exprs]);
    });
    const [throwing, stage] = [lines[picked.length]!.output, lines[picked.length + 1]!.output];
    expect(throwing.error).toBeNull();
    expect(throwing.results[0]).toEqual({ throws: { class: "BadMethodCallException", message: "Method Illuminate\\Support\\Stringable::doesNotExist does not exist." } });
    expect(throwing.results[1]).toEqual({ value: "B" });
    expect(throwing.results[2]).toEqual({ value: { float: "1.5" } });
    expect(throwing.results[3]).toEqual({ value: { array: [[{ int: "1" }, "x"]] } });
    // The framework directory in a string is `{root}`.
    expect((throwing.results[4] as { value: string }).value).toBe("{root}/src/Illuminate/Support/Str.php");
    expect(stage).toEqual({ error: { stage: "setup", class: "RuntimeException", message: "boom" }, results: [] });
    // The noisy requests' output stays out of stdout: exactly one line per request, no forged line.
    const [noisy, noisyFatal] = [lines[picked.length + 2]!.output, lines[picked.length + 3]!.output];
    expect(first.trimEnd().split("\n")).toHaveLength(picked.length + extra.length);
    expect(first).not.toContain("forged");
    for (const noise of ["echoed", "printed", "displayed notice", "to STDOUT", "dumped", "before the fatal"]) {
      expect([noise, first.includes(noise)]).toEqual([noise, false]);
    }
    expect(noisy).toEqual({ error: null, results: [{ value: { int: "1" } }] });
    expect(noisyFatal.error).toMatchObject({ stage: "fatal", class: null });
    expect((noisyFatal.error as { message: string }).message).toContain("NoisyFatal");
    expect(noisyFatal.results).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-72

test("XT-conformance-72: two passes over the same Pin and requests must be identical; an unlisted difference fails, writes no fixture and writes an Escalation (FR-6, AD-15, ESC-3.2-1)", async () => {
  const fx = fixtureRoot();
  try {
    // Identical passes: two runs give identical bytes.
    const a = join(fx.dir, "a");
    const b = join(fx.dir, "b");
    run(fx, { out: a });
    run(fx, { out: b });
    expect(snapshotTree(a)).toEqual(snapshotTree(b));
    expect(tree(a)).toHaveLength(3);

    // --determinism compares without a key and writes nothing.
    const det = cliInProcess(["--determinism", "--root", fx.dir, "--image", "xaravel-oracle:test"], {}, standIn().runner);
    expect(det).toEqual({ code: 0, stdout: `Oracle determinism OK: 4 requests evaluated twice; 3 identical, 1 listed in ${NONDETERMINISM_FILE} differ as expected.\n`, stderr: "" });
    expect(existsSync(join(fx.dir, FIXTURES_DIR))).toBe(false);

    // A second pass that differs on an unlisted request: exit 1, the id on stderr, no fixtures, a valid ESC-bot-<n>.
    const blade = REQUESTS[2]!.request;
    const sql = REQUESTS[3]!.request;
    const differ = (sha256: string, pass: number): boolean => sha256 === UUID.sha256 || ((sha256 === blade.sha256 || sha256 === sql.sha256) && pass === 2);
    mkdirSync(join(fx.dir, "conformance", "escalations"), { recursive: true });
    const failed = cliInProcess(["--root", fx.dir, "--image", "xaravel-oracle:test"], { ORACLE_SIGNING_KEY: fx.pem }, standIn(differ).runner);
    expect(failed.code).toBe(1);
    expect(failed.stdout).toBe("");
    expect(failed.stderr).toContain(`oracle nondeterminism: ${blade.id} (request ${blade.sha256}, view)`);
    expect(failed.stderr).toContain(`oracle nondeterminism: ${sql.id} (request ${sql.sha256}, database)`);
    expect(failed.stderr).toContain("wrote conformance/escalations/ESC-bot-1.md");
    expect(existsSync(join(fx.dir, FIXTURES_DIR))).toBe(false);
    const escalationFile = "conformance/escalations/ESC-bot-1.md";
    const text = readFileSync(join(fx.dir, escalationFile), "utf8");
    const parsed = parseEscalation(escalationFile, text);
    expect(parsed.violations).toEqual([]);
    expect(parsed.escalation!.trigger).toBe("open-question");
    expect(parsed.escalation!.testIds).toEqual([sql.id, blade.id].sort());
    const digest = (output: Json): string => createHash("sha256").update(canonicalJson(output), "utf8").digest("hex");
    for (const request of [blade, sql]) {
      expect(parsed.escalation!.evidence).toContain(`${JSON.stringify(request.id)} request ${request.sha256}: first pass output sha256 ${digest(outputFor(request))}, second pass output sha256 ${digest({ error: null, results: [{ value: "pass 2" }] })}`);
    }
    expect(checkRecords(fx.dir).violations).toEqual([]);
    // The next difference takes the next free number; --determinism escalates the same way and writes no fixtures.
    const again = cliInProcess(["--determinism", "--root", fx.dir, "--image", "xaravel-oracle:test"], {}, standIn(differ).runner);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("wrote conformance/escalations/ESC-bot-2.md");
    expect(existsSync(join(fx.dir, FIXTURES_DIR))).toBe(false);
    expect(checkRecords(fx.dir).violations).toEqual([]);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("XT-conformance-72: a stale nondeterminism.jsonl (unknown sha256, wrong id, identical outputs, bad form) fails the run with no fixtures and no Escalation (ESC-3.2-1)", () => {
  const line = (sha256: string, id: string): string => `${renderNondeterminism({ sha256, id, reason: "Str::uuid() is random" })}\n`;
  const upper = REQUESTS[0]!.request;
  const cases: { listing: string; message: string }[] = [
    { listing: line("a".repeat(64), UUID.id), message: `${NONDETERMINISM_FILE}:1: ${"a".repeat(64)} is not a committed request` },
    { listing: line(UUID.sha256, upper.id), message: `${NONDETERMINISM_FILE}:1: ${UUID.sha256} is request ${JSON.stringify(UUID.id)}, not ${JSON.stringify(upper.id)}` },
    { listing: line(upper.sha256, upper.id) + line(UUID.sha256, UUID.id), message: `${NONDETERMINISM_FILE}:1: ${upper.sha256} (${upper.id}) gave identical outputs in both evaluations; remove the line` },
  ];
  for (const { listing, message } of cases) {
    const fx = fixtureRoot(listing);
    try {
      const result = cliInProcess(["--root", fx.dir, "--image", "xaravel-oracle:test"], { ORACLE_SIGNING_KEY: fx.pem }, standIn().runner);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
      expect(existsSync(join(fx.dir, FIXTURES_DIR))).toBe(false);
      expect(existsSync(join(fx.dir, "conformance", "escalations"))).toBe(false);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  }
  // A stale listing and an unlisted difference in one run: both reported, still no Escalation.
  const both = fixtureRoot(line(upper.sha256, upper.id) + line(UUID.sha256, UUID.id));
  try {
    const blade = REQUESTS[2]!.request;
    const differ = (sha256: string, pass: number): boolean => sha256 === UUID.sha256 || (sha256 === blade.sha256 && pass === 2);
    const result = cliInProcess(["--root", both.dir, "--image", "xaravel-oracle:test"], { ORACLE_SIGNING_KEY: both.pem }, standIn(differ).runner);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`oracle nondeterminism: ${blade.id} (request ${blade.sha256}, view)`);
    expect(result.stderr).toContain(`${upper.sha256} (${upper.id}) gave identical outputs in both evaluations`);
    expect(result.stderr).not.toContain("wrote conformance/escalations/");
    expect(existsSync(join(both.dir, FIXTURES_DIR))).toBe(false);
    expect(existsSync(join(both.dir, "conformance", "escalations"))).toBe(false);
  } finally {
    rmSync(both.dir, { recursive: true, force: true });
  }

  // Without a listing, the random request is an unlisted difference.
  const bare = fixtureRoot(null);
  try {
    const result = run(bare);
    expect(result.differences.map((difference) => difference.sha256)).toEqual([UUID.sha256]);
    expect(result.escalation).toBe("conformance/escalations/ESC-bot-1.md");
    expect(existsSync(join(bare.dir, FIXTURES_DIR))).toBe(false);
  } finally {
    rmSync(bare.dir, { recursive: true, force: true });
  }
  // The file's form: keys in order, compact, sorted, no duplicates.
  const ok = line(UUID.sha256, UUID.id);
  expect(parseNondeterminism(ok)).toEqual([{ sha256: UUID.sha256, id: UUID.id, reason: "Str::uuid() is random", line: 1 }]);
  expect(() => parseNondeterminism(ok + ok)).toThrow(`${NONDETERMINISM_FILE}:2: ${UUID.sha256} is listed twice`);
  expect(() => parseNondeterminism(line("b".repeat(64), "B") + line("a".repeat(64), "A"))).toThrow(`${NONDETERMINISM_FILE}:2: lines must be sorted by id then sha256`);
  expect(() => parseNondeterminism(`{"id":"A","sha256":"${"a".repeat(64)}","reason":"r"}\n`)).toThrow("expected the keys sha256, id, reason in that order");
  expect(() => parseNondeterminism(`{"sha256":"${"a".repeat(64)}", "id":"A","reason":"r"}\n`)).toThrow("the line is not in canonical form");
  expect(() => parseNondeterminism(`{"sha256":"${"a".repeat(64)}","id":"A","reason":" "}\n`)).toThrow("reason must name the random or time source");
  expect(() => parseNondeterminism(ok.slice(0, -1))).toThrow("the file must end with a newline");
});

test("XT-conformance-72: a pass that is not one {sha256, output} line per request, in order, fails the run with no fixtures (FR-6)", () => {
  const mangle = (change: (lines: string[]) => string[]): ImageRunner => {
    const inner = standIn().runner;
    return (image, mounts, command) => `${change(inner(image, mounts, command).trimEnd().split("\n")).join("\n")}\n`;
  };
  const cases: { runner: ImageRunner; message: string }[] = [
    { runner: mangle((lines) => lines.slice(0, -1)), message: "first pass: evaluate.php printed 3 lines for 4 requests" },
    { runner: mangle((lines) => [lines[1]!, lines[0]!, ...lines.slice(2)]), message: "first pass: line 1 is not the output of request" },
    { runner: mangle((lines) => [lines[0]!.replace(/"output":.*$/, '"output":{"error":null}}'), ...lines.slice(1)]), message: "first pass: line 1 (" },
    { runner: mangle((lines) => ["not json", ...lines.slice(1)]), message: "first pass: line 1 is not JSON" },
  ];
  for (const { runner, message } of cases) {
    const fx = fixtureRoot();
    try {
      const result = cliInProcess(["--root", fx.dir, "--image", "xaravel-oracle:test"], { ORACLE_SIGNING_KEY: fx.pem }, runner);
      expect([message, result.code]).toEqual([message, 1]);
      expect(result.stderr).toContain(message);
      expect(existsSync(join(fx.dir, FIXTURES_DIR))).toBe(false);
      expect(existsSync(join(fx.dir, "conformance", "escalations"))).toBe(false);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  }
});

test("XT-conformance-72: --local runs evaluate.php with --php against the local install, and refuses a local copy that differs from the snapshot (FR-6)", async () => {
  const fx = fixtureRoot(null);
  try {
    // A tiny snapshot and an identical local copy.
    const snapshot = join(fx.dir, "conformance", "upstream", "framework");
    const local = join(fx.dir, "local");
    for (const base of [snapshot, local]) {
      mkdirSync(join(base, "tests"), { recursive: true });
      mkdirSync(join(base, "src"), { recursive: true });
      writeFileSync(join(base, "tests", "ATest.php"), "<?php\n");
      writeFileSync(join(base, "src", "A.php"), "<?php\n");
      writeFileSync(join(base, "phpunit.xml.dist"), "<phpunit/>\n");
    }
    // A fake php: records its arguments and answers each request with its id, as the stand-in does.
    const calls = join(fx.dir, "php-calls.jsonl");
    const fake = join(fx.dir, "fake-php.ts");
    writeFileSync(
      fake,
      [
        'import { appendFileSync, readFileSync } from "node:fs";',
        "const args = process.argv.slice(2);",
        `appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + "\\n");`,
        "for (const file of args.slice(3)) {",
        '  for (const line of readFileSync(file, "utf8").split("\\n").filter((entry) => entry !== "")) {',
        "    const request = JSON.parse(line);",
        '    process.stdout.write(JSON.stringify({ sha256: request.sha256, output: { error: null, results: [{ value: request.id }] } }) + "\\n");',
        "  }",
        "}",
      ].join("\n"),
    );
    const php = join(fx.dir, "fake-php");
    writeFileSync(php, `#!/bin/sh\nexec '${process.execPath}' '${fake}' "$@"\n`);
    chmodSync(php, 0o755);

    const ok = cliInProcess(["--determinism", "--root", fx.dir, "--local", local, "--php", php], {});
    expect(ok.stderr).toBe("");
    expect(ok.code).toBe(0);
    const argv = readFileSync(calls, "utf8").trimEnd().split("\n").map((entry) => JSON.parse(entry) as string[]);
    const expected = [join(fx.dir, EVALUATE_SCRIPT), local, PHP_VERSION, ...["database", "support", "view"].map((component) => join(fx.dir, REQUESTS_DIR, `${component}.jsonl`))];
    expect(argv).toEqual([expected, expected]);

    // A local copy that differs from the snapshot is refused before evaluate.php runs.
    writeFileSync(join(local, "src", "A.php"), "<?php // changed\n");
    rmSync(calls);
    const refused = cliInProcess(["--determinism", "--root", fx.dir, "--local", local, "--php", php], {});
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(`--local ${local} is not a copy of the snapshot`);
    expect(refused.stderr).toContain(`${join(local, "src", "A.php")} differs`);
    expect(existsSync(calls)).toBe(false);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
}, TIMEOUT);

test("XT-conformance-72: the committed nondeterminism.jsonl lists the 23 random requests of ESC-3.2-1, each a committed request with its id (ESC-3.2-1)", () => {
  const text = readFileSync(join(root, NONDETERMINISM_FILE), "utf8");
  const listing = parseNondeterminism(text);
  expect(listing).toHaveLength(23);
  const committed = new Map(readCommittedRequests(root).flatMap((entry) => entry.requests.map((request) => [request.sha256, request] as const)));
  for (const entry of listing) {
    expect([entry.sha256, committed.get(entry.sha256)?.id]).toEqual([entry.sha256, entry.id]);
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-73

test("XT-conformance-73: conformance/oracle/oracle.pub is a Protected Path and docs/ops/oracle.md records its fingerprint (FR-6, AD-16)", async () => {
  const entries = parseList(readFileSync(join(root, "conformance", "protected-paths"), "utf8"));
  const phases = activePhases(root);
  expect(isProtected(entries, phases, PUBLIC_KEY_FILE)).toBe(true);
  expect(isProtected(entries, phases, NONDETERMINISM_FILE)).toBe(true);
  // Fixtures are protected by signature, not by path, and have no CODEOWNERS owner.
  expect(isProtected(entries, phases, `${FIXTURES_DIR}/support/${"0".repeat(64)}.json`)).toBe(false);
  expect(readFileSync(join(root, ".github", "CODEOWNERS"), "utf8").split("\n")).toContain(`/${FIXTURES_DIR}/`);

  // The fingerprint is the lowercase hex SHA-256 of the SPKI DER, printed by `fingerprint`.
  const fx = fixtureRoot();
  try {
    const expected = createHash("sha256").update(fx.pub.export({ type: "spki", format: "der" })).digest("hex");
    expect(fingerprint(fx.dir)).toBe(expected);
    expect(await cli(["fingerprint", "--root", fx.dir])).toEqual({ code: 0, stdout: `${expected}\n`, stderr: "" });
    rmSync(join(fx.dir, PUBLIC_KEY_FILE));
    const missing = await cli(["fingerprint", "--root", fx.dir]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("conformance/oracle/oracle.pub is missing");
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }

  // When the Maintainer has committed oracle.pub, the docs record its fingerprint.
  const docs = readFileSync(join(root, "docs", "ops", "oracle.md"), "utf8");
  expect(docs).toContain("bun run oracle:fixtures fingerprint");
  if (existsSync(join(root, PUBLIC_KEY_FILE))) {
    expect(docs).toContain(`\`${fingerprint(root)}\``);
  }
});
