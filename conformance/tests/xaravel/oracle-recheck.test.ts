// Xaravel Test for Story 5.7 (the nightly Oracle fixture recheck; Epic 3
// retro S5; FR-6, AD-15, AD-28). It runs under plain `bun test` until the
// harness's `xaravelTest` lands in Story 5.9.
//
// The recheck runs against hermetic fixture roots: the schema, batch
// requests, a listing, two Story manifests and their per-Story request files,
// committed fixtures, and a stand-in image runner that answers for
// tools/oracle/evaluate.php. The evaluator itself runs for real with `--local`
// against the locked local install in /tmp/xaravel-inv/framework when it is
// present; when `php` is not on PATH that test is skipped and its name gives
// the reason, and with XARAVEL_PHP_FIXTURES=require it fails instead. This
// file never imports tools/oracle/oracle.ts directly or names its image
// runner (XT-conformance-44); image mode runs only through the stand-in.
import { afterAll, expect } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PHP_VERSION, type ImageRunner } from "../../../tools/inventory/inventory";
import { EVALUATE_SCRIPT, FIXTURES_DIR, NONDETERMINISM_FILE, outputDigest, renderNondeterminism } from "../../../tools/oracle/fixtures";
import { main, recheck, recheckItems } from "../../../tools/oracle/recheck";
import { makeRequest, renderRequest, renderRequests, REQUESTS_DIR, SCHEMA_FILE, type Json, type OracleRequest } from "../../../tools/oracle/request";
import { STORY_REQUESTS_DIR } from "../../../tools/oracle/story-requests";
import { Assert, xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const REQUIRE = process.env["XARAVEL_PHP_FIXTURES"] === "require";
const PHP = Bun.which("php");
const LOCAL_INSTALL = "/tmp/xaravel-inv/framework";
const TIMEOUT = 120_000;
const IMAGE = "xaravel-oracle:test";
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixture roots

const STR = "Illuminate\\Tests\\Support\\SupportStrTest";
const UPPER = makeRequest(`${STR}::testUpper`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::upper('a')"] });
const UUID = makeRequest(`${STR}::testUuid`, "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::uuid()"] });
const LOWER = makeRequest(`${STR}::testLower`, "php-expr", { bindings: { value: "'ABC'" }, setup: [], exprs: ["\\Illuminate\\Support\\Str::lower($value)"] });
const ECHO = makeRequest("Illuminate\\Tests\\View\\Blade\\BladeEchoTest::testEchos", "blade-render", { template: "{{ $a }}", data: { a: "x" } });
const XT = makeRequest("XT-support-1", "php-expr", { bindings: {}, setup: [], exprs: ["\\Illuminate\\Support\\Str::slug('Hello World')"] });

function manifest(storyId: string, component: string, testIds: string[], xaravelTestIds: string[]): string {
  const list = (items: string[]): string => (items.length === 0 ? " []" : `\n${items.map((item) => `  - '${item}'`).join("\n")}`);
  return `---\nstory_id: "${storyId}"\nepic: ${storyId.split(".")[0]}\ncomponent: ${component}\nstatus: in-progress\ntitle: "A Story"\ntest_ids:${list(testIds)}\nxaravel_test_ids:${list(xaravelTestIds)}\n---\n\n# Story ${storyId}\n`;
}

const lines = (...requests: OracleRequest[]): string => requests.map((request) => `${renderRequest(request)}\n`).join("");

/** The deterministic output the stand-in gives a request: its id, echoed. */
function outputFor(request: OracleRequest): Json {
  return { error: null, results: [{ value: request.id }] };
}

function fixtureText(request: OracleRequest, output: Json): string {
  // The recheck reads only `output`; the signature is the verify-fixtures check's business.
  return `${JSON.stringify({ sha256: request.sha256, output, signature: "unchecked" })}\n`;
}

const fixturePath = (component: string, request: OracleRequest): string => `${FIXTURES_DIR}/${component}/${request.sha256}.json`;

/**
 * Batch: support holds UPPER and the listed UUID; view holds ECHO (no fixture) and LOWER, which Story 9.1's merged
 * file holds. Story 9.1 (support) has LOWER and XT; Story 9.2 (validation) has LOWER too, shadowed by 9.1. Every
 * covered request has a fixture of its stand-in output, except view/ECHO; the listed and held ones have bogus fixtures
 * the recheck must never compare.
 */
function fixtureRoot(output: (request: OracleRequest) => Json = outputFor): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-recheck-"));
  dirs.push(dir);
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  mkdirSync(join(dir, REQUESTS_DIR), { recursive: true });
  mkdirSync(join(dir, "tools", "oracle"), { recursive: true });
  copyFileSync(join(root, SCHEMA_FILE), join(dir, SCHEMA_FILE));
  copyFileSync(join(root, EVALUATE_SCRIPT), join(dir, EVALUATE_SCRIPT));
  for (const [component, text] of renderRequests([
    { component: "support", request: UPPER },
    { component: "support", request: UUID },
    { component: "view", request: ECHO },
    { component: "view", request: LOWER },
  ])) {
    write(`${REQUESTS_DIR}/${component}.jsonl`, text);
  }
  write(NONDETERMINISM_FILE, `${renderNondeterminism({ sha256: UUID.sha256, id: UUID.id, reason: "Str::uuid() is random" })}\n`);
  write("stories/9.1.md", manifest("9.1", "support", [LOWER.id], [XT.id]));
  write("stories/9.2.md", manifest("9.2", "validation", [LOWER.id], []));
  write(`${STORY_REQUESTS_DIR}/9.1.jsonl`, lines(LOWER, XT));
  write(`${STORY_REQUESTS_DIR}/9.2.jsonl`, lines(LOWER));
  for (const [component, request] of [
    ["support", UPPER],
    ["support", LOWER],
    ["support", XT],
    ["validation", LOWER],
  ] as const) {
    write(fixturePath(component, request), fixtureText(request, output(request)));
  }
  const bogus: Json = { error: null, results: [{ value: "never compared" }] };
  write(fixturePath("support", UUID), fixtureText(UUID, bogus));
  write(fixturePath("view", LOWER), fixtureText(LOWER, bogus));
  return dir;
}

interface Stand {
  runner: ImageRunner;
  calls: { image: string; command: string[]; requests: string[]; modes: number[] }[];
}

/** A stand-in image runner for evaluate.php; `answer` gives each request's output. */
function standIn(answer: (request: OracleRequest) => Json = outputFor): Stand {
  const calls: Stand["calls"] = [];
  const runner: ImageRunner = (image, mounts, command) => {
    const requestsMount = mounts.find((mount) => mount.container === "/xaravel/requests")!;
    const out: string[] = [];
    const seen: string[] = [];
    const modes = [statSync(requestsMount.host).mode & 0o777];
    for (const file of command.slice(4)) {
      const host = join(requestsMount.host, file.slice("/xaravel/requests/".length));
      modes.push(statSync(host).mode & 0o777);
      for (const line of readFileSync(host, "utf8").split("\n").filter((entry) => entry !== "")) {
        const request = JSON.parse(line) as OracleRequest;
        seen.push(request.id);
        out.push(JSON.stringify({ sha256: request.sha256, output: answer(request) }));
      }
    }
    calls.push({ image, command: [...command], requests: seen, modes });
    return out.map((line) => `${line}\n`).join("");
  };
  return { runner, calls };
}

function cliInProcess(argv: string[], runner?: ImageRunner): { code: number; stdout: string; stderr: string } {
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
    const code = main(argv, runner === undefined ? {} : { runner });
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

/** Every file under `dir`, relative, sorted. */
function tree(dir: string): string[] {
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

// ---------------------------------------------------------------------------
// XT-conformance-188

xaravelTest("XT-conformance-188", "the nightly re-evaluates each committed request, batch and per-Story, in the image and fails naming each fixture whose output differs; listed and Story-held batch requests are skipped (FR-6.1, AD-15.4, AD-28)", () => {
  const dir = fixtureRoot();
  const before = tree(dir).map((path) => [path, readFileSync(join(dir, path), "utf8")]);

  // What it covers: batch requests under their Component (not the listed UUID, not the held view/LOWER), and per-Story
  // requests, accepted (9.1) and shadowed (9.2), under their manifest's Component.
  expect(recheckItems(dir).map((item) => `${item.component}/${item.request.id}`)).toEqual(
    [
      ["support", UPPER],
      ["support", LOWER],
      ["support", XT],
      ["validation", LOWER],
      ["view", ECHO],
    ]
      .map(([component, request]) => [component as string, request as OracleRequest] as const)
      .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x.sha256 < y.sha256 ? -1 : 1))
      .map(([component, request]) => `${component}/${request.id}`),
  );

  // Fresh fixtures: one evaluation in the image, each request once, readable by the image user; exit 0.
  const fresh = standIn();
  const ok = cliInProcess(["--root", dir, "--image", IMAGE], fresh.runner);
  expect(ok).toEqual({ code: 0, stdout: "Oracle recheck: 4 fixtures compared, 0 differ, 1 requests without a fixture\n", stderr: "" });
  expect(fresh.calls).toHaveLength(1);
  expect(fresh.calls[0]!.image).toBe(IMAGE);
  expect(fresh.calls[0]!.command.slice(0, 4)).toEqual(["php", "/xaravel/evaluate.php", "/oracle/upstream/framework", PHP_VERSION]);
  expect([...fresh.calls[0]!.requests].sort()).toEqual([LOWER.id, UPPER.id, XT.id].sort());
  expect(fresh.calls[0]!.modes).toEqual([0o755, 0o644]);
  expect(fresh.calls[0]!.requests).not.toContain(UUID.id);
  expect(fresh.calls[0]!.requests).not.toContain(ECHO.id);

  // One tampered batch fixture: named exactly, with both digests; exit 1.
  const tampered: Json = { error: null, results: [{ value: "stale" }] };
  writeFileSync(join(dir, fixturePath("support", UPPER)), fixtureText(UPPER, tampered));
  const stale = cliInProcess(["--root", dir, "--image", IMAGE], standIn().runner);
  expect(stale).toEqual({
    code: 1,
    stdout: `stale fixture: ${fixturePath("support", UPPER)} (${UPPER.id}): committed ${outputDigest(tampered)} vs evaluated ${outputDigest(outputFor(UPPER))}\nOracle recheck: 4 fixtures compared, 1 differ, 1 requests without a fixture\n`,
    stderr: "",
  });

  // An image whose output for a per-Story request changed (as after a Pin bump): both of its Components' fixtures,
  // accepted and shadowed, are named; the unchanged ones are not.
  const bumped = standIn((request) => (request.sha256 === LOWER.sha256 ? { error: null, results: [{ value: "abc" }] } : outputFor(request)));
  const result = recheck(dir, { image: IMAGE, runner: bumped.runner });
  expect(result.compared).toBe(4);
  expect(result.withoutFixture).toBe(1);
  expect(result.stale.map((entry) => entry.file).sort()).toEqual([fixturePath("support", LOWER), fixturePath("support", UPPER), fixturePath("validation", LOWER)].sort());

  // The listed request's and the held request's bogus fixtures were never compared; nothing was written or signed.
  writeFileSync(join(dir, fixturePath("support", UPPER)), fixtureText(UPPER, outputFor(UPPER)));
  expect(tree(dir).map((path) => [path, readFileSync(join(dir, path), "utf8")])).toEqual(before);

  // An evaluation that fails as a whole fails the run with its message; so does an unreadable fixture.
  const broken = cliInProcess(["--root", dir, "--image", IMAGE], () => {
    throw new Error("the image is not there");
  });
  expect(broken).toEqual({ code: 1, stdout: "", stderr: "Oracle recheck failed: evaluate.php failed: the image is not there\n" });
  const short = cliInProcess(["--root", dir, "--image", IMAGE], () => "");
  expect(short.code).toBe(1);
  expect(short.stderr).toBe("Oracle recheck failed: recheck pass: evaluate.php printed 0 lines for 3 requests\n");
  writeFileSync(join(dir, fixturePath("validation", LOWER)), "not json\n");
  const unreadable = cliInProcess(["--root", dir, "--image", IMAGE], standIn().runner);
  expect(unreadable.code).toBe(1);
  expect(unreadable.stderr).toStartWith(`Oracle recheck failed: ${fixturePath("validation", LOWER)} is not JSON: `);

  // No fixture at all: nothing to evaluate, nothing fails.
  const bare = fixtureRoot();
  rmSync(join(bare, FIXTURES_DIR), { recursive: true });
  const none = standIn();
  expect(cliInProcess(["--root", bare, "--image", IMAGE], none.runner)).toEqual({ code: 0, stdout: "Oracle recheck: 0 fixtures compared, 0 differ, 5 requests without a fixture\n", stderr: "" });
  expect(none.calls).toEqual([]);

  // Usage errors exit 2; the package.json script.
  for (const args of [["--bogus"], ["--image", "a", "--local", "b"], ["--php", "php"], ["--root"], ["--image", "a", "--image", "b"], ["--determinism"]]) {
    expect([args.join(" "), cliInProcess(args).code]).toEqual([args.join(" "), 2]);
  }
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["oracle:recheck"]).toBe("bun tools/oracle/recheck.ts");
});

xaravelTest("XT-conformance-229", "oracle.yml's nightly determinism job runs the recheck after the image build, even when the determinism step failed (AD-28.3)", () => {
  type Step = { name?: string; id?: string; if?: string; run?: string; env?: unknown };
  const workflow = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "oracle.yml"), "utf8")) as { jobs: Record<string, { if?: string; steps: Step[] }> };
  const job = workflow.jobs["determinism"]!;
  expect(job.if).toBe("github.event_name == 'schedule'");
  const build = job.steps.findIndex((step) => step.id === "build");
  expect(job.steps[build]!.run).toContain('bun run oracle:build "xaravel-oracle:${tag}"');
  const determinism = job.steps.findIndex((step) => step.run === "bun run oracle:fixtures --determinism");
  const step = job.steps.findIndex((candidate) => candidate.run === "bun run oracle:recheck");
  expect(build).toBeGreaterThan(-1);
  expect(step).toBeGreaterThan(determinism);
  expect(determinism).toBeGreaterThan(build);
  // No --image: the default is the image the build step just made at the current tag.
  expect(job.steps[step]!).toEqual({ name: "Re-evaluate every committed request against its fixture", if: "${{ !cancelled() && steps.build.outcome == 'success' }}", run: "bun run oracle:recheck" });
});

// ---------------------------------------------------------------------------
// Real PHP

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
  if (!existsSync(join(root, "conformance", "upstream", "framework", "tests"))) {
    return "the Upstream snapshot is not synced";
  }
  return null;
}

function phpTest(id: string, consequence: string, body: () => void): void {
  const reason = phpUnmet() ?? (existsSync(join(LOCAL_INSTALL, "vendor", "autoload.php")) ? null : `${LOCAL_INSTALL} is not a locked local install`);
  if (reason !== null && !REQUIRE) {
    console.warn(`oracle-recheck.test.ts: skipping the evaluator run: ${reason}`);
  }
  xaravelTest(
    id,
    consequence,
    () => {
      if (reason !== null) {
        if (REQUIRE) {
          throw new Error(`XARAVEL_PHP_FIXTURES=require: ${reason}`);
        }
        Assert.markTestSkipped(reason);
      }
      body();
    },
    TIMEOUT,
  );
}

phpTest("XT-conformance-230", "--local re-evaluates batch and per-Story requests through evaluate.php for real and names a stale fixture (FR-6.1, AD-15.4)", () => {
  const real = (request: OracleRequest): Json => {
    const values: Record<string, string> = { [UPPER.sha256]: "A", [LOWER.sha256]: "abc", [XT.sha256]: "hello-world" };
    return { error: null, results: [{ value: values[request.sha256] ?? null }] };
  };
  const dir = fixtureRoot(real);
  // The fixture root's snapshot is the repository's own, so the local install is checked against it.
  mkdirSync(join(dir, "conformance", "upstream"), { recursive: true });
  symlinkSync(join(root, "conformance", "upstream", "framework"), join(dir, "conformance", "upstream", "framework"));
  const ok = cliInProcess(["--root", dir, "--local", LOCAL_INSTALL, "--php", PHP!]);
  expect(ok).toEqual({ code: 0, stdout: "Oracle recheck: 4 fixtures compared, 0 differ, 1 requests without a fixture\n", stderr: "" });
  writeFileSync(join(dir, fixturePath("support", XT)), fixtureText(XT, { error: null, results: [{ value: "hello world" }] }));
  const stale = cliInProcess(["--root", dir, "--local", LOCAL_INSTALL, "--php", PHP!]);
  expect(stale.code).toBe(1);
  expect(stale.stdout).toBe(
    `stale fixture: ${fixturePath("support", XT)} (${XT.id}): committed ${outputDigest({ error: null, results: [{ value: "hello world" }] })} vs evaluated ${outputDigest(real(XT))}\nOracle recheck: 4 fixtures compared, 1 differ, 1 requests without a fixture\n`,
  );
});
