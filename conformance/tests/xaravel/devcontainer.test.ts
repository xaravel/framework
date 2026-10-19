// Xaravel Tests for Story 5.10 (the portable development environment:
// `.devcontainer/`; AD-17, AD-28, NFR-1, NFR-7).
//
// The devcontainer's files and `devcontainer.yml` are read and parsed
// (`Bun.YAML.parse`, `JSON.parse`); the image build and the run inside it are
// live-only and proven by the workflow's own run (docs/ops/devcontainer.md).
// The workflow's commands are matched with patterns that ignore the container
// CLI's name, and no container CLI, real or fake, is ever run: the workflow's
// alpha gate is tested through tools/devcontainer/alpha.ts, and the in-container
// runtime check through its pure helpers. The pin check runs on the real root
// and on hermetic temp roots copied from it; the native harness run uses a
// hermetic git root, a PATH holding only `git` and `bun`, and Postgres at a
// closed port. The real repository is only read.
import { afterAll, expect } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runHarness, type HarnessResult } from "../../harness/harness";
import { MAX_SOCKET_BYTES } from "../../harness/isolation";
import { ALPHA_VARIANTS } from "../../../tools/inventory/inventory";
import { alphaNotRun } from "../../../tools/devcontainer/alpha";
import { runRatchet } from "../../../tools/ratchet/ratchet";
import { checkPins, runtimeBun, runtimeRedis, runtimeUser, SPINE_FILE } from "../../../tools/devcontainer/pins";
import { checkWorkflows } from "../../../tools/workflow-permissions/workflow-permissions";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const ASSERT = join(root, "packages", "assert", "src", "index.ts");
const PINS = join(root, "tools", "devcontainer", "pins.ts");
const ALPHA = join(root, "tools", "devcontainer", "alpha.ts");
const CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const WORKSPACE = "/workspaces/xaravel";
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

type Service = { image?: string; init?: boolean; build?: { context: string; args?: Record<string, string> }; volumes?: string[]; environment?: Record<string, string>; depends_on?: unknown; healthcheck?: { test: unknown }; tmpfs?: string[]; platform?: string; env_file?: unknown };
type Compose = { services: Record<string, Service>; volumes?: Record<string, unknown> };
type Step = { name?: string; uses?: string; if?: string; with?: Record<string, unknown>; env?: Record<string, string>; run?: string };
type Job = { "runs-on": string; strategy?: unknown; services?: Record<string, { image: string }>; permissions?: unknown; steps: Step[] };
type Workflow = { on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, Job> };

function compose(): Compose {
  return Bun.YAML.parse(read(".devcontainer/compose.yaml")) as Compose;
}

function workflow(file: string): Workflow {
  return Bun.YAML.parse(read(`.github/workflows/${file}`)) as Workflow;
}

/** A workflow command run through the container CLI, whatever its name: `<cli> compose <rest>` on a line of its own. */
function composeCommand(rest: string): RegExp {
  return new RegExp(`^ *[a-z]+ compose ${rest.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m");
}

/** The devcontainer job's step named `name`. */
function stepNamed(job: Job, name: string): Step {
  const step = job.steps.find((candidate) => candidate.name === name);
  if (step === undefined) {
    throw new Error(`devcontainer.yml: no step named ${JSON.stringify(name)}`);
  }
  return step;
}

/** The Dockerfile's instructions, comments and blank lines dropped, continuations joined. */
function instructions(text: string): string[] {
  return text
    .replace(/\\\n/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

function devcontainerFiles(): { name: string; text: string }[] {
  return readdirSync(join(root, ".devcontainer"))
    .sort()
    .map((name) => ({ name, text: read(`.devcontainer/${name}`) }));
}

// ---------------------------------------------------------------------------
// XT-conformance-190

xaravelTest("XT-conformance-190", "the devcontainer is a non-root workspace with Bun at .bun-version, a frozen-lockfile install, CI's redis-server and a Postgres sidecar from CI's image, with .cache/ on a volume and no container-engine socket (AD-17.6, NFR-7)", () => {
  // The Dockerfile: Bun from oven/bun, the final stage on CI's Redis image, a non-root user last.
  const image = instructions(read(".devcontainer/Dockerfile"));
  const froms = image.filter((line) => line.startsWith("FROM "));
  expect(froms).toEqual(["FROM oven/bun:${BUN_VERSION} AS bun", "FROM ${REDIS_IMAGE}"]);
  expect(image).toContain(`ARG BUN_VERSION=${read(".bun-version").trim()}`);
  const baselineRedis = Object.values(workflow("baseline.yml").jobs).find((job) => job.services?.["redis"] !== undefined)!.services!["redis"]!.image;
  expect(image).toContain(`ARG REDIS_IMAGE=${baselineRedis}`);
  const users = image.filter((line) => line.startsWith("USER "));
  expect(users.at(-1)).toBe("USER xaravel");
  expect(image.filter((line) => /^USER\s+(root|0)(:|$)/.test(line))).toEqual([]);
  expect(image).toContain("ARG XARAVEL_UID=1000");
  expect(image).toContain("ARG XARAVEL_GID=1000");
  expect(image.join("\n")).toMatch(/useradd .*--uid "\$\{XARAVEL_UID\}" --gid "\$\{XARAVEL_GID\}".* xaravel/);
  expect(image.join("\n")).toContain("git config --system safe.directory /workspaces/xaravel");
  expect(image).toContain("COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun");
  expect(image.at(-1)).toBe('CMD ["/usr/local/bin/xaravel-start"]');
  expect(image).toContain("ENTRYPOINT []");
  // uid or gid 0 fails the build; start.sh is COPYed then chmodded (the legacy builder rejects COPY --chmod).
  const userRun = image.find((line) => line.includes("useradd"))!;
  expect(userRun).toContain('if [ "${XARAVEL_UID}" = "0" ] || [ "${XARAVEL_GID}" = "0" ]; then');
  expect(userRun.indexOf("exit 1")).toBeLessThan(userRun.indexOf("useradd"));
  expect(image.filter((line) => line.includes("--chmod"))).toEqual([]);
  const copy = image.indexOf("COPY start.sh /usr/local/bin/xaravel-start");
  expect(copy).toBeGreaterThan(-1);
  expect(image[copy + 1]).toBe("RUN chmod 0755 /usr/local/bin/xaravel-start");
  expect(image.indexOf("USER xaravel")).toBeGreaterThan(copy + 1);

  // The start script: CI's install, then ready.
  const start = read(".devcontainer/start.sh");
  const install = start.indexOf("bun install --frozen-lockfile --ignore-scripts");
  expect(install).toBeGreaterThan(-1);
  expect(start.indexOf("touch /tmp/xaravel-ready")).toBeGreaterThan(install);
  expect(statSync(join(root, ".devcontainer", "start.sh")).mode & 0o111).not.toBe(0);

  // Compose: Postgres is baseline.yml's image; .cache/ and node_modules/ are named volumes.
  const data = compose();
  expect(Object.keys(data.services).sort()).toEqual(["postgres", "workspace"]);
  const baselinePostgres = Object.values(workflow("baseline.yml").jobs).find((job) => job.services?.["postgres"] !== undefined)!.services!["postgres"]!.image;
  expect(data.services["postgres"]!.image).toBe(baselinePostgres);
  const workspace = data.services["workspace"]!;
  expect(workspace.build?.context).toBe(".");
  expect(workspace.volumes).toEqual([`..:${WORKSPACE}`, `xaravel-cache:${WORKSPACE}/.cache`, `xaravel-node-modules:${WORKSPACE}/node_modules`]);
  expect(Object.keys(data.volumes ?? {}).sort()).toEqual(["xaravel-cache", "xaravel-node-modules"]);
  expect(workspace.depends_on).toEqual({ postgres: { condition: "service_healthy" } });
  expect(workspace.healthcheck?.test).toEqual(["CMD", "test", "-f", "/tmp/xaravel-ready"]);
  expect(workspace.init).toBe(true);
  // Postgres is healthy only over TCP: initdb's temporary server listens only on the socket.
  expect(data.services["postgres"]!.healthcheck?.test).toEqual(["CMD-SHELL", "pg_isready -h 127.0.0.1 -U postgres"]);

  // devcontainer.json is plain JSON, with no mounts.
  const json = JSON.parse(read(".devcontainer/devcontainer.json")) as Record<string, unknown>;
  expect(json).toMatchObject({ dockerComposeFile: "compose.yaml", service: "workspace", workspaceFolder: WORKSPACE, remoteUser: "xaravel", updateRemoteUserUID: true });
  expect(json["mounts"]).toBeUndefined();

  // No engine socket and no platform pin: no service volume names a socket or sets `platform:`,
  // no Dockerfile instruction pins `--platform` or declares a VOLUME, and devcontainer.json has no platform key.
  for (const [name, service] of Object.entries(data.services)) {
    expect([name, "platform" in service, (service.volumes ?? []).filter((volume) => volume.includes(".sock"))]).toEqual([name, false, []]);
  }
  expect(image.filter((line) => /--platform\b/.test(line) || /^VOLUME\b/.test(line))).toEqual([]);
  expect(Object.keys(json).filter((key) => /platform|mount/i.test(key))).toEqual([]);
});

// ---------------------------------------------------------------------------
// XT-conformance-191

xaravelTest("XT-conformance-191", "inside the container the harness runs every alpha Variant: the PG* env reaches the sidecar, no CI or REDIS_* is set so the worktree's own redis-server starts on .cache/redis.sock, the runtime is non-root with the pinned Bun and redis-server, and CI fails when an alpha Variant is NOT-RUN in a full run (AD-17.4, AD-17.6, FR-9.4)", async () => {
  const data = compose();
  const postgres = data.services["postgres"]!.environment!;
  const env = data.services["workspace"]!.environment!;
  expect(env).toEqual({ PGHOST: "postgres", PGPORT: "5432", PGUSER: postgres["POSTGRES_USER"]!, PGPASSWORD: postgres["POSTGRES_PASSWORD"]! });
  for (const key of Object.keys(env)) {
    expect([key, key === "CI" || key.startsWith("REDIS_") || key === "XARAVEL_REDIS_SERVER"]).toEqual([key, false]);
  }
  // Nor does the image set them.
  expect(instructions(read(".devcontainer/Dockerfile")).filter((line) => /^ENV\b/.test(line) && /\b(CI|REDIS_[A-Z]+|XARAVEL_REDIS_SERVER)\b/.test(line))).toEqual([]);
  // The socket the harness starts fits the unix-socket limit.
  expect(Buffer.byteLength(`${WORKSPACE}/.cache/redis.sock`)).toBeLessThanOrEqual(MAX_SOCKET_BYTES);
  expect(MAX_SOCKET_BYTES).toBe(103);

  // The workflow: both pin checks, then the Ratchet over a full harness run (no --scope), judged by its verdict, whose
  // merged report goes to devcontainer:alpha (retro 5 item 11).
  const job = workflow("devcontainer.yml").jobs["devcontainer"]!;
  expect(job.steps.map((step) => step.run ?? "").join("\n")).not.toMatch(/--fast|--seed|--scope/);
  const pins = stepNamed(job, "Check the pins inside the container").run!;
  expect(pins).toMatch(/^set -euo pipefail$/m);
  expect(pins).toMatch(composeCommand("exec -T workspace bun run devcontainer:pins"));
  expect(pins).toMatch(composeCommand("exec -T workspace bun run devcontainer:pins runtime"));
  const harnessStep = stepNamed(job, "Run the harness inside the container");
  expect(harnessStep.env).toEqual({ REF: "${{ github.head_ref || github.ref_name }}" });
  const harness = harnessStep.run!;
  expect(harness).not.toMatch(/\$\{\{/);
  expect(harness).toMatch(/^set -uo pipefail$/m);
  expect(harness).toMatch(composeCommand('exec -T -e GITHUB_ACTIONS=true workspace bun run ratchet run --ref "$REF" 2>&1 | tee "$RUNNER_TEMP/harness.txt" || status=$?'));
  expect(harness).not.toMatch(/\bbun run harness\b/);
  expect(harness).toMatch(/^if \[ "\$status" -ne 0 \]; then\n {2}exit "\$status"\nfi$/m);
  expect(harness).toMatch(composeCommand('exec -T workspace bun run devcontainer:alpha < "$RUNNER_TEMP/harness.txt"'));
  expect(harness.trimEnd().split("\n").at(-1)).toMatch(/ bun run devcontainer:alpha < /);
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["devcontainer:alpha"]).toBe("bun --no-env-file tools/devcontainer/alpha.ts");
  expect(scripts["ratchet"]).toBe("bun tools/ratchet/ratchet.ts");

  // The alpha gate: non-alpha NOT-RUN passes; an alpha NOT-RUN, or no SUMMARY, fails naming it.
  expect(ALPHA_VARIANTS).toContain("redis");
  expect(ALPHA_VARIANTS).toContain("pgsql");
  expect(ALPHA_VARIANTS).toContain("queue-redis@redis");
  const nonAlpha = ["mysql", "sqlsrv", "queue-beanstalkd@beanstalkd"].map((variant) => `NOT-RUN [${variant}] 1 line(s): no backend`);
  const passing = [...nonAlpha, "SUMMARY variants=10 run=7 not-run=3 checked=10 differ=0"].join("\n");
  expect(alphaNotRun(passing)).toEqual([]);
  for (const variant of ["redis", "pgsql", "queue-redis@redis"]) {
    const line = `NOT-RUN [${variant}] 1 line(s): backend down`;
    const violations = alphaNotRun([...nonAlpha, line, "SUMMARY variants=10 run=6 not-run=4 checked=9 differ=0"].join("\n"));
    expect(violations).toEqual([`devcontainer alpha: ${variant} is NOT-RUN: ${line}`]);
  }
  expect(alphaNotRun("harness: .cache/harness.lock is held")).toEqual(["devcontainer alpha: the harness report has no SUMMARY line"]);
  expect(alphaNotRun("")).toEqual(["devcontainer alpha: the harness report has no SUMMARY line"]);
  // The CLI, on stdin.
  const cli = (report: string): { code: number; out: string; err: string } => {
    const result = Bun.spawnSync([process.execPath, "--no-env-file", ALPHA], { stdin: Buffer.from(report), stdout: "pipe", stderr: "pipe" });
    return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
  };
  expect(cli(passing)).toEqual({ code: 0, out: `devcontainer alpha: not-run=0 over ${ALPHA_VARIANTS.length} alpha variant(s)\n`, err: "" });
  const failing = cli(`NOT-RUN [redis] 1 line(s): redis-server not found on PATH (AD-17)\n${passing}`);
  expect([failing.code, failing.err]).toEqual([1, "devcontainer alpha: redis is NOT-RUN: NOT-RUN [redis] 1 line(s): redis-server not found on PATH (AD-17)\n"]);
  expect(cli("no summary here\n").code).toBe(1);

  // End to end, as the step runs it: the Ratchet over a run whose only difference is an unexpected pass owned by no
  // open Story, with every alpha Variant run, warns and exits 0, and its merged output (stderr's harness report, then
  // stdout's verdict, as `2>&1` gives) passes the alpha gate; the same output with an alpha NOT-RUN fails it. The
  // failure and no-SUMMARY rows are covered by XT-conformance-115 in ratchet.test.ts.
  const ratchetRoot = tempDir("xt-dc-ratchet-");
  mkdirSync(join(ratchetRoot, "stories"));
  const passId = "Illuminate\\Tests\\Support\\SupportDevcontainerTest::testA";
  const passLine = `UNEXPECTED-PASS ${passId} [sqlite] expected=fail-known actual=pass asserts=1/1`;
  const report = (notRun: readonly string[]): HarnessResult => ({
    code: 1,
    out: [passLine, ...notRun, `SUMMARY variants=10 run=${10 - notRun.length} not-run=${notRun.length} checked=10 differ=1`],
    err: [],
    results: [],
    differences: [{ id: passId, variant: "sqlite", kind: "unexpected-pass", text: passLine, detail: null }],
    sample: null,
    worktree: null,
    xaravel: null,
  });
  const merged = (run: { out: string[]; err: string[] }): string => [...run.err, ...run.out].join("\n");
  const warned = await runRatchet(ratchetRoot, "main", { env: {}, harness: () => Promise.resolve(report(nonAlpha)) });
  expect(warned.code).toBe(0);
  expect(warned.out).toEqual([`WARNING ${passLine} (owned by no open Story)`, "RATCHET ref=main scope=full failures=0 passes=0 warnings=1"]);
  expect(warned.err).toContain(report(nonAlpha).out.at(-1)!);
  expect(alphaNotRun(merged(warned))).toEqual([]);
  const pgsqlDown = "NOT-RUN [pgsql] 1 line(s): backend down";
  const down = await runRatchet(ratchetRoot, "main", { env: {}, harness: () => Promise.resolve(report([...nonAlpha, pgsqlDown])) });
  expect(down.code).toBe(0);
  expect(down.out.filter((line) => line.startsWith("UNEXPECTED-FAILURE"))).toEqual([]);
  expect(alphaNotRun(merged(down))).toEqual([`devcontainer alpha: pgsql is NOT-RUN: ${pgsqlDown}`]);

  // The runtime helpers the in-container `devcontainer:pins runtime` uses.
  expect(runtimeUser(1000)).toBeNull();
  expect(runtimeUser(0)).toBe("devcontainer pins: runtime user is root (uid 0); the workspace must run as a non-root user");
  expect(runtimeBun("1.4.3", "1.4.3")).toBeNull();
  expect(runtimeBun("1.4.2", "1.4.3")).toBe("devcontainer pins: runtime Bun is 1.4.2, but .bun-version is 1.4.3");
  const redisOut = "Redis server v=8.10.2 sha=00000000:0 malloc=jemalloc-5.3.0 bits=64 build=0123456789abcdef\n";
  expect(runtimeRedis(redisOut, "redis:8.10.2")).toBeNull();
  expect(runtimeRedis(redisOut.replace("v=8.10.2", "v=8.10.1"), "redis:8.10.2")).toBe("devcontainer pins: runtime redis-server --version reports 8.10.1, but .devcontainer/Dockerfile ARG REDIS_IMAGE is redis:8.10.2");
  expect(runtimeRedis(null, "redis:8.10.2")).toBe("devcontainer pins: runtime redis-server not found on PATH");
  expect(runtimeRedis("garbage", "redis:8.10.2")).toBe('devcontainer pins: runtime redis-server --version reports "garbage", but .devcontainer/Dockerfile ARG REDIS_IMAGE is redis:8.10.2');
});

// ---------------------------------------------------------------------------
// XT-conformance-192

/** A temp root holding copies of the real pin sources. */
function pinRoot(): string {
  const dir = tempDir("xt-dc-pins-");
  for (const path of [".bun-version", ".devcontainer", ".github/workflows", SPINE_FILE]) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    cpSync(join(root, path), join(dir, path), { recursive: true });
  }
  return dir;
}

function edit(dir: string, path: string, from: string | RegExp, to: string): void {
  const text = readFileSync(join(dir, path), "utf8");
  const next = text.replace(from, to);
  expect([path, next !== text]).toEqual([path, true]);
  writeFileSync(join(dir, path), next);
}

function runPins(dir: string, path: string = process.env["PATH"] ?? "", mode: string[] = []): { code: number; out: string; err: string } {
  const result = Bun.spawnSync([process.execPath, "--no-env-file", PINS, "check", ...mode, "--root", dir], { env: { ...process.env, PATH: path }, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}

xaravelTest("XT-conformance-192", "the pin check fails closed, naming the file and both values, when the devcontainer's Bun, Postgres or Redis differs from .bun-version, CI's service images or the spine's Stack table (AD-17.6, AD-28.1)", () => {
  // The real root passes.
  expect(checkPins(root)).toEqual([]);
  const real = runPins(root);
  expect([real.code, real.out]).toEqual([0, "devcontainer pins: ok\n"]);
  expect(checkPins(pinRoot())).toEqual([]);
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["devcontainer:pins"]).toBe("bun --no-env-file tools/devcontainer/pins.ts check");

  const spine = SPINE_FILE;
  const cases: { path: string; from: string | RegExp; to: string; expected: string }[] = [
    // Bun, in each source.
    { path: ".devcontainer/Dockerfile", from: "ARG BUN_VERSION=1.4.3", to: "ARG BUN_VERSION=1.4.2", expected: "devcontainer pins: Bun .devcontainer/Dockerfile ARG BUN_VERSION is 1.4.2, but .bun-version is 1.4.3" },
    { path: ".bun-version", from: "1.4.3", to: "1.4.4", expected: "devcontainer pins: Bun .devcontainer/Dockerfile ARG BUN_VERSION is 1.4.3, but .bun-version is 1.4.4" },
    { path: spine, from: "| Bun (exact CI pin, `.bun-version`) | 1.4.3", to: "| Bun (exact CI pin, `.bun-version`) | 1.4.1", expected: `devcontainer pins: Bun ${spine} Stack row is 1.4.1, but .bun-version is 1.4.3` },
    // Postgres, in each source.
    { path: ".devcontainer/compose.yaml", from: "image: postgres:18", to: "image: postgres:17", expected: "devcontainer pins: Postgres .devcontainer/compose.yaml postgres image is postgres:17, but .github/workflows/baseline.yml has postgres:18" },
    { path: ".github/workflows/ratchet.yml", from: "image: postgres:18", to: "image: postgres:18.1", expected: "devcontainer pins: Postgres .github/workflows/ratchet.yml postgres service image is postgres:18.1, but .github/workflows/baseline.yml has postgres:18" },
    { path: spine, from: "| PostgreSQL (CI) | 18 |", to: "| PostgreSQL (CI) | 17 |", expected: `devcontainer pins: Postgres ${spine} Stack row is 17, but .github/workflows/baseline.yml has postgres:18` },
    // Redis, in each source.
    { path: ".devcontainer/Dockerfile", from: "ARG REDIS_IMAGE=redis:8.10.2", to: "ARG REDIS_IMAGE=redis:8.10.1", expected: "devcontainer pins: Redis .devcontainer/Dockerfile ARG REDIS_IMAGE is redis:8.10.1, but .github/workflows/baseline.yml has redis:8.10.2" },
    { path: ".github/workflows/nightly.yml", from: "image: redis:8.10.2", to: "image: redis:8.10.3", expected: "devcontainer pins: Redis .github/workflows/nightly.yml redis service image is redis:8.10.3, but .github/workflows/baseline.yml has redis:8.10.2" },
    { path: spine, from: "| Redis (CI; minimum supported 7.2) | 8.10.2 |", to: "| Redis (CI; minimum supported 7.2) | 8.10.1 |", expected: `devcontainer pins: Redis ${spine} Stack row is 8.10.1, but .github/workflows/baseline.yml has redis:8.10.2` },
    // Missing sources fail closed.
    { path: ".github/workflows/baseline.yml", from: /\n {6}redis:\n {8}image: redis:8\.10\.2\n/, to: "\n", expected: "devcontainer pins: Redis redis service image in .github/workflows/baseline.yml not found" },
    { path: spine, from: "| PostgreSQL (CI) | 18 |\n", to: "", expected: `devcontainer pins: Postgres Stack-table PostgreSQL row in ${spine} not found` },
    { path: ".devcontainer/Dockerfile", from: "ARG BUN_VERSION=1.4.3\n", to: "", expected: "devcontainer pins: Bun ARG BUN_VERSION in .devcontainer/Dockerfile not found" },
    { path: ".devcontainer/Dockerfile", from: "ARG REDIS_IMAGE=redis:8.10.2\n", to: "", expected: "devcontainer pins: Redis ARG REDIS_IMAGE in .devcontainer/Dockerfile not found" },
    { path: ".bun-version", from: "1.4.3", to: "", expected: "devcontainer pins: Bun .bun-version not found" },
    { path: ".devcontainer/compose.yaml", from: /\n {2}postgres:\n {4}image: postgres:18\n/, to: "\n  postgres:\n", expected: "devcontainer pins: Postgres postgres service image in .devcontainer/compose.yaml not found" },
    { path: ".github/workflows/baseline.yml", from: /\n {6}postgres:\n {8}image: postgres:18\n/, to: "\n", expected: "devcontainer pins: Postgres postgres service image in .github/workflows/baseline.yml not found" },
    { path: spine, from: "| Bun (exact CI pin, `.bun-version`) | 1.4.3 (engines `>=1.4`) |\n", to: "", expected: `devcontainer pins: Bun Stack-table Bun row in ${spine} not found` },
    { path: spine, from: "| Redis (CI; minimum supported 7.2) | 8.10.2 |\n", to: "", expected: `devcontainer pins: Redis Stack-table Redis row in ${spine} not found` },
    // Unparseable workflows and build-arg overrides fail closed too.
    { path: ".github/workflows/ratchet.yml", from: /^/, to: "jobs: [unclosed\n", expected: "devcontainer pins: .github/workflows/ratchet.yml could not be parsed" },
    { path: ".devcontainer/compose.yaml", from: "        XARAVEL_UID: ${XARAVEL_UID:-1000}\n", to: "        XARAVEL_UID: ${XARAVEL_UID:-1000}\n        BUN_VERSION: 1.4.3\n", expected: "devcontainer pins: .devcontainer/compose.yaml workspace build.args sets BUN_VERSION; the pin is the Dockerfile's ARG BUN_VERSION" },
    { path: ".devcontainer/compose.yaml", from: "        XARAVEL_UID: ${XARAVEL_UID:-1000}\n", to: "        XARAVEL_UID: ${XARAVEL_UID:-1000}\n        REDIS_IMAGE: redis:8.10.2\n", expected: "devcontainer pins: .devcontainer/compose.yaml workspace build.args sets REDIS_IMAGE; the pin is the Dockerfile's ARG REDIS_IMAGE" },
    { path: ".devcontainer/devcontainer.json", from: /^/, to: "{ not json\n", expected: "devcontainer pins: .devcontainer/devcontainer.json could not be parsed" },
    { path: ".devcontainer/devcontainer.json", from: '"service": "workspace",', to: '"service": "workspace",\n  "build": { "args": { "REDIS_IMAGE": "redis:8.10.2" } },', expected: "devcontainer pins: .devcontainer/devcontainer.json sets REDIS_IMAGE; the pin is the Dockerfile's ARG REDIS_IMAGE" },
  ];
  for (const drift of cases) {
    const dir = pinRoot();
    edit(dir, drift.path, drift.from, drift.to);
    expect(checkPins(dir)).toContain(drift.expected);
    const run = runPins(dir);
    expect([drift.expected, run.code, run.err.split("\n")]).toEqual([drift.expected, 1, expect.arrayContaining([drift.expected]) as unknown as string[]]);
  }
  // Missing files, and a baseline.yml that is gone.
  const noCompose = pinRoot();
  rmSync(join(noCompose, ".devcontainer", "compose.yaml"));
  expect(checkPins(noCompose)).toEqual(["devcontainer pins: Postgres .devcontainer/compose.yaml not found"]);
  const noBunFile = pinRoot();
  rmSync(join(noBunFile, ".bun-version"));
  expect(checkPins(noBunFile)).toEqual(["devcontainer pins: Bun .bun-version not found"]);
  const noDockerfile = pinRoot();
  rmSync(join(noDockerfile, ".devcontainer", "Dockerfile"));
  expect(checkPins(noDockerfile)).toEqual(["devcontainer pins: Bun .devcontainer/Dockerfile not found", "devcontainer pins: Redis .devcontainer/Dockerfile not found"]);
  const noBaseline = pinRoot();
  rmSync(join(noBaseline, ".github", "workflows", "baseline.yml"));
  expect(checkPins(noBaseline)).toEqual(["devcontainer pins: Postgres postgres service image in .github/workflows/baseline.yml not found", "devcontainer pins: Redis redis service image in .github/workflows/baseline.yml not found"]);
  // The runtime check, run as it is in the container: against a fake redis-server on PATH.
  const runtimeRoot = pinRoot();
  const fakeBin = tempDir("xt-dc-redis-");
  const fakeRedis = (version: string): void => {
    writeFileSync(join(fakeBin, "redis-server"), `#!/bin/sh\necho "Redis server v=${version} sha=00000000:0 malloc=jemalloc-5.3.0 bits=64 build=0"\n`, { mode: 0o755 });
  };
  fakeRedis("8.10.1");
  const wrongRedis = runPins(runtimeRoot, fakeBin, ["runtime"]);
  expect([wrongRedis.code, wrongRedis.err]).toEqual([1, "devcontainer pins: runtime redis-server --version reports 8.10.1, but .devcontainer/Dockerfile ARG REDIS_IMAGE is redis:8.10.2\n"]);
  fakeRedis("8.10.2");
  const rightRuntime = runPins(runtimeRoot, fakeBin, ["runtime"]);
  expect([rightRuntime.code, rightRuntime.out]).toEqual([0, "devcontainer pins: runtime ok\n"]);
  writeFileSync(join(runtimeRoot, ".bun-version"), "0.0.0\n");
  const wrongBun = runPins(runtimeRoot, fakeBin, ["runtime"]);
  expect([wrongBun.code, wrongBun.err]).toEqual([1, `devcontainer pins: runtime Bun is ${Bun.version}, but .bun-version is 0.0.0\n`]);
  // Usage errors exit 2.
  expect(Bun.spawnSync([process.execPath, PINS], { stdout: "pipe", stderr: "pipe" }).exitCode).toBe(2);
  expect(Bun.spawnSync([process.execPath, PINS, "check", "--nope"], { stdout: "pipe", stderr: "pipe" }).exitCode).toBe(2);
  expect(Bun.spawnSync([process.execPath, PINS, "check", "runtime", "--nope"], { stdout: "pipe", stderr: "pipe" }).exitCode).toBe(2);
});

// ---------------------------------------------------------------------------
// XT-conformance-193

xaravelTest("XT-conformance-193", "one linux-x64 devcontainer job builds the image and runs the harness inside it on .devcontainer/** PRs and nightly, read-only, without duplicating the nightly matrix (AD-17.6, AD-28.3)", () => {
  const data = workflow("devcontainer.yml");
  expect(Object.keys(data.on)).toEqual(["pull_request", "schedule", "workflow_dispatch"]);
  // Retro 5 item 18 (decisions/MAINT-2026-10-19-epic-5-items.md, item 10): the harness and the root pins too.
  expect(data.on["pull_request"]).toEqual({
    paths: [
      ".bun-version",
      ".devcontainer/**",
      ".github/workflows/devcontainer.yml",
      "bun.lock",
      "conformance/harness/**",
      "package.json",
      "tools/devcontainer/**",
    ],
  });
  expect(data.on["schedule"]).toEqual([{ cron: expect.stringMatching(/^\d+ \d+ \* \* \*$/) as unknown as string }]);
  expect(data.on["workflow_dispatch"]).toBeNull();
  expect(data.permissions).toEqual({ contents: "read" });
  expect(Object.keys(data.jobs)).toEqual(["devcontainer"]);
  const job = data.jobs["devcontainer"]!;
  expect(job["runs-on"]).toBe("ubuntu-24.04");
  expect(job.strategy).toBeUndefined();
  expect(job.services).toBeUndefined();
  expect(job.permissions).toBeUndefined();
  expect(job.steps[0]).toEqual({ uses: `${CHECKOUT}`, with: { "persist-credentials": false, "fetch-depth": 0 } });
  expect(job.steps.filter((step) => step.uses !== undefined).map((step) => step.uses)).toEqual([CHECKOUT]);
  const text = read(".github/workflows/devcontainer.yml");
  expect(text).not.toMatch(/secrets\./);
  expect(text).toContain(`${CHECKOUT} # v7.0.1`);
  // Create the nested mount points, then build and start with the runner's ids; logs on failure; always tear down.
  const start = stepNamed(job, "Build and start the devcontainer").run!;
  const mkdir = start.indexOf("mkdir -p .cache node_modules\n");
  expect(mkdir).toBeGreaterThan(-1);
  expect(start).toContain("$(id -u)");
  expect(start).toContain("$(id -g)");
  expect(start).toMatch(composeCommand("build"));
  expect(start).toMatch(composeCommand("up --detach --wait --wait-timeout 900"));
  expect(mkdir).toBeLessThan(start.search(composeCommand("up --detach --wait --wait-timeout 900")));
  const logs = stepNamed(job, "Dump the container logs");
  expect(logs.if).toBe("failure()");
  expect(logs.run).toMatch(composeCommand("logs --no-color"));
  const stop = stepNamed(job, "Stop the devcontainer");
  expect(stop.if).toBe("always()");
  expect(stop.run).toMatch(composeCommand("down -v"));
  expect(job.steps.at(-1)).toBe(stop);

  // Every compose command uses one and the same CLI.
  const clis = new Set(job.steps.flatMap((step) => (step.run ?? "").split("\n")).flatMap((line) => /^ *([a-z]+) compose /.exec(line)?.[1] ?? []));
  expect(clis.size).toBe(1);

  // The permissions check passes, and the nightly matrix is untouched.
  expect(checkWorkflows(root).violations).toEqual([]);
  expect(Object.keys(workflow("nightly.yml").jobs)).toEqual(["linux", "macos", "bench"]);
  expect(Object.keys(workflow("ci.yml").jobs)).not.toContain("devcontainer");
});

// ---------------------------------------------------------------------------
// XT-conformance-194

xaravelTest("XT-conformance-194", "docs/ops/devcontainer.md explains starting the container, the harness and a headless agent inside it, the two worktree keys, the Oracle and Inventory tools outside it, and that no secret or APP_KEY is baked in, with .env autoload off (AD-17.6, AD-16)", () => {
  const doc = read("docs/ops/devcontainer.md");
  const topics: [string, RegExp][] = [
    ["devcontainer CLI", /devcontainer up --workspace-folder/],
    ["compose", /[a-z]+ compose -p [a-z-]+ -f \.devcontainer\/compose\.yaml up --build --detach --wait/],
    ["running the harness", /bun run harness/],
    ["headless agent via exec", /headless[\s\S]*[a-z]+ compose -p [a-z-]+ -f \.devcontainer\/compose\.yaml exec -T -e /],
    ["credentials at run time", /credentials at run time/],
    ["installs lost on recreate", /is lost when the container is recreated/],
    ["two AD-17 keys", /two keys, and so two sets of `xaravel_test_<key>` databases/],
    ["main checkout, not a git worktree", /Mount a main checkout, not a `git worktree`/],
    ["Oracle and Inventory outside", /The Oracle and Inventory tools[^\n]*run on the host or in CI/],
    ["no engine socket", /The container gets no [A-Z][a-z]+ socket/],
    ["Oracle and Inventory need the engine", /The Oracle and Inventory tools do need [A-Z][a-z]+, and they run on the host or in CI/],
    ["Ported Tests only in the container", /The in-container `bun run harness` runs Ported Tests only/],
    ["PHP-fixture tests on the host", /PHP-fixture Xaravel Tests[^\n]*need PHP[^\n]*run them on the host/],
    ["no secret or APP_KEY", /No secret, credential or `APP_KEY` is baked into the image/],
    [".env autoload off", /\.env` autoload stays off/],
    ["never required", /The container is never required/],
    ["native path without the engine", /The harness, `story:check` and the pin checks never need [A-Z][a-z]+/],
    ["mkdir before the first up", /Linux [A-Z][a-z]+ Engine host[^\n]*create the nested mount points first[\s\S]*before the first `up`:\n\n```sh\nmkdir -p \.cache node_modules\n/],
    ["down -v after a UID change", /After changing `XARAVEL_UID` or `XARAVEL_GID`, delete the volumes[\s\S]*compose -p [a-z-]+ -f \.devcontainer\/compose\.yaml down -v/],
    ["a distinct -p per checkout", /Every checkout needs its own Compose project name/],
    ["arm64 unverified", /arm64 is unverified in CI/],
    ["the pin check", /bun run devcontainer:pins/],
    ["the runtime pin check", /bun run devcontainer:pins runtime/],
    ["the alpha gate", /bun run devcontainer:alpha/],
  ];
  for (const [topic, pattern] of topics) {
    expect([topic, pattern.test(doc)]).toEqual([topic, true]);
  }
  // Every compose command example names its project (-p), and the devcontainer CLI example sets COMPOSE_PROJECT_NAME.
  const examples = doc.split("\n").filter((line) => /^[a-z]+ compose /.test(line));
  expect(examples.length).toBeGreaterThan(0);
  expect(examples.filter((line) => !/^[a-z]+ compose -p [a-z-]+ /.test(line))).toEqual([]);
  expect(doc).toMatch(/COMPOSE_PROJECT_NAME=[a-z-]+\ndevcontainer up --workspace-folder/);
  expect(read("docs/ops/ci.md")).toContain("[devcontainer.md](devcontainer.md)");
  expect(read("docs/ops/harness.md")).toContain("[devcontainer.md](devcontainer.md)");
  // No .devcontainer/ file names an APP_KEY, an env_file or a .env file.
  for (const file of devcontainerFiles()) {
    expect([file.name, /APP_KEY|env_file|\.env\b/.test(file.text)]).toEqual([file.name, false]);
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-195

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
}

xaravelTest(
  "XT-conformance-195",
  "without a container engine, the harness, the tools and story:check run natively: a backend that isn't running is NOT-RUN, the pin check still passes, and no harness or done-check path references the container CLI or .devcontainer/ (AD-17.6, FR-9.3, NFR-1)",
  async () => {
    // A PATH with only git and bun: no container CLI, no redis-server.
    const bin = tempDir("xt-dc-path-");
    for (const tool of ["git", "bun"]) {
      const found = tool === "bun" ? process.execPath : Bun.which(tool);
      expect(found).not.toBeNull();
      symlinkSync(found!, join(bin, tool));
    }
    expect(readdirSync(bin).sort()).toEqual(["bun", "git"]);
    expect(Bun.which("redis-server", { PATH: bin })).toBeNull();

    // A hermetic harness root: one test on none, one on pgsql and redis.
    const test = "Illuminate\\Tests\\Support\\SupportDevcontainerTest";
    const plain = `${test}::testA`;
    const backed = `${test}::testB`;
    const dir = tempDir("xt-dc-root-");
    const lines: [string, string][] = [[plain, "none"], [backed, "pgsql"], [backed, "redis"]];
    const entry = (id: string, backends: string[], at: number): string => `${JSON.stringify({ id, component: "support", kind: "unit", backends, source: `framework/tests/Support/SupportDevcontainerTest.php:${at}-${at + 1}`, hash: "0".repeat(64), assertions: null, oracle: {} })}\n`;
    write(dir, {
      "bunfig.toml": "env = false\n",
      "conformance/variants": "none\npgsql\nredis\nsqlite\n",
      "conformance/inventory/support.jsonl": entry(plain, ["none"], 10) + entry(backed, ["pgsql", "redis"], 20),
      "conformance/expectations/support/framework/tests/Support/SupportDevcontainerTest.jsonl": lines.map(([id, variant]) => `${JSON.stringify({ id, variant, status: "pass", reason: null, adapted: null, escalation: null })}\n`).join(""),
      "packages/support/tests/ported/Support/SupportDevcontainerTest.test.ts": `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\nfor (const id of ${JSON.stringify([plain, backed])}) { portedTest(id, {}, () => { Assert.assertTrue(true); }); }\n`,
    });
    Bun.spawnSync(["git", "init", "-q", dir]);
    const port = String(await closedPort());
    const env = { ...process.env, PATH: bin, CI: undefined, GITHUB_ACTIONS: undefined, PGHOST: "127.0.0.1", PGPORT: port, REDIS_HOST: "127.0.0.1", REDIS_PORT: port, XARAVEL_REDIS_SERVER: undefined, XARAVEL_API_SURFACE: undefined };
    const run = await runHarness(dir, { env });
    expect(run.code).toBe(0);
    expect(run.out).toEqual([
      `NOT-RUN [pgsql] 1 line(s): Postgres at 127.0.0.1:${port} is not reachable (ECONNREFUSED)`,
      "NOT-RUN [redis] 1 line(s): redis-server not found on PATH (AD-17)",
      "SUMMARY variants=3 run=1 not-run=2 checked=1 differ=0",
    ]);
    // The workflow's alpha gate fails on that real report, naming both alpha Variants.
    expect(alphaNotRun(run.out.join("\n"))).toEqual([
      `devcontainer alpha: pgsql is NOT-RUN: NOT-RUN [pgsql] 1 line(s): Postgres at 127.0.0.1:${port} is not reachable (ECONNREFUSED)`,
      "devcontainer alpha: redis is NOT-RUN: NOT-RUN [redis] 1 line(s): redis-server not found on PATH (AD-17)",
    ]);

    // The pin check runs with that PATH too.
    const pins = runPins(root, bin);
    expect([pins.code, pins.out]).toEqual([0, "devcontainer pins: ok\n"]);

    // Nothing native references the container: no harness or story:check file names .devcontainer/ or runs a
    // compose command, and no root script but devcontainer:pins names .devcontainer/. That none of these files or
    // scripts names the container CLI itself is XT-conformance-44's static scan (only tools/oracle may).
    for (const file of [...walk(join(root, "conformance", "harness")), ...walk(join(root, "tools", "story-check"))]) {
      expect([file, /\.devcontainer|\bcompose (build|up|exec|down)\b/i.test(readFileSync(file, "utf8"))]).toEqual([file, false]);
    }
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
    for (const [name, command] of Object.entries(scripts)) {
      expect([name, name !== "devcontainer:pins" && /\.devcontainer|\bcompose\b/i.test(command)]).toEqual([name, false]);
    }
  },
  120_000,
);
