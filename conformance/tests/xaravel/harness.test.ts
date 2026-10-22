// Xaravel Tests for Story 5.3 (harness runner and greppable report; FR-3,
// FR-9, FR-113, AD-15). These run under plain `bun test` until the harness's
// `xaravelTest` lands in Story 5.9. Fixture roots are hermetic temp
// directories holding a root `bunfig.toml`, an Inventory, Expectations
// shards, `conformance/variants` and Ported Test files that import
// `portedTest` from the real `packages/assert` by absolute path; the harness
// runs them with its real preload. The real repository is only read.
import { afterAll, expect } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { backendFor, probe } from "../../harness/backends";
import { compare, type HarnessLine, type VariantRun } from "../../harness/compare";
import { runHarness } from "../../harness/harness";
import { parseJunit } from "../../harness/junit";
import { escalationStatus, parseEscalation } from "../../../tools/escalations/escalations";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const ASSERT = join(root, "packages", "assert", "src", "index.ts");
const COUNTER = join(root, "packages", "assert", "src", "declarations", "AssertionCounter.ts");
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixture

const HASH = "0".repeat(64);
const CLASS = "Illuminate\\Tests\\Support\\SupportHarnessTest";
const A = `${CLASS}::testA`;
const B = `${CLASS}::testB`;
const C = `${CLASS}::testC`;
const D = `${CLASS}::testD`;
const E = `${CLASS}::testE`;
const SHARD = "conformance/expectations/support/framework/tests/Support/SupportHarnessTest.jsonl";
/** Deliberately mirrors no Expectations shard (SHARD is under `framework/tests/`), so it loads on every Variant (ESC-5.3-4). */
const TEST_FILE = "packages/support/tests/ported/Support/SupportHarnessTest.test.ts";
const VARIANTS = "mysql\nnone\npgsql\nredis\nsqlite\n";

interface Entry {
  id: string;
  backends?: string[];
  /** The Inventory `assertions`; null means not yet run on an alpha variant. */
  assertions?: Record<string, number> | null;
}

interface Line {
  id: string;
  variant?: string;
  status: string;
  reason?: string | null;
  adapted?: string | null;
}

const ALPHA = new Set(["none", "pgsql", "redis", "sqlite"]);

function inventory(entries: readonly Entry[]): string {
  return entries
    .map((entry, index) => {
      const backends = entry.backends ?? ["none"];
      const assertions = entry.assertions === undefined ? { assertTrue: 1 } : entry.assertions;
      const oracle = assertions === null ? {} : Object.fromEntries(backends.filter((backend) => ALPHA.has(backend)).map((backend) => [backend, "pass"]));
      return `${JSON.stringify({ id: entry.id, component: "support", kind: "unit", backends, source: `framework/tests/Support/SupportHarnessTest.php:${10 * (index + 1)}-${10 * (index + 1) + 1}`, hash: HASH, assertions, oracle })}\n`;
    })
    .join("");
}

function shard(lines: readonly Line[]): string {
  return lines
    .map((line) => `${JSON.stringify({ id: line.id, variant: line.variant ?? "none", status: line.status, reason: line.reason ?? (line.status === "skip" ? "not-ported-yet" : null), adapted: line.adapted ?? null, escalation: null })}\n`)
    .join("");
}

/** A Ported Test file: the grader import, then `body`. */
function ported(body: string): string {
  return `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\n${body}`;
}

function makeRoot(entries: readonly Entry[], lines: readonly Line[], files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "xt-harness-"));
  roots.push(dir);
  const all: Record<string, string> = {
    "bunfig.toml": "env = false\n",
    "conformance/variants": VARIANTS,
    "conformance/inventory/support.jsonl": inventory(entries),
    [SHARD]: shard(lines),
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  // The harness runs only at the top level of a git worktree (AD-17).
  Bun.spawnSync(["git", "init", "-q", dir]);
  return dir;
}

/** A hash of every file path and content under `dir`, outside `.cache` and `.git`. */
function treeDigest(dir: string): string {
  const hash = createHash("sha256");
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      if (name === ".cache" || name === ".git") {
        continue;
      }
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        hash.update(`${path}\0`).update(readFileSync(path)).update("\0");
      }
    }
  };
  walk(dir);
  return hash.digest("hex");
}

/** A TCP port nothing listens on. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

async function listening(): Promise<{ server: Server; port: number }> {
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { server, port: (server.address() as { port: number }).port };
}

/** A `redis-server` path that does not exist, so a local run never starts one. */
const NO_REDIS_SERVER = join(tmpdir(), "xt-harness-no-redis-server", "redis-server");

/** The env for a fixture run: no CI, Postgres and Redis pointed at a closed port, and no local redis-server, unless overridden. */
async function env(extra: Record<string, string> = {}): Promise<Record<string, string | undefined>> {
  const port = String(await closedPort());
  return { ...process.env, CI: undefined, PGHOST: "127.0.0.1", PGPORT: port, REDIS_HOST: "127.0.0.1", REDIS_PORT: port, XARAVEL_REDIS_SERVER: NO_REDIS_SERVER, ...extra };
}

// ---------------------------------------------------------------------------
// XT-conformance-101

xaravelTest("XT-conformance-101", "bun run harness runs bun test with the root bunfig.toml once per variant, setting XARAVEL_VARIANT, and fails first on a package-level bunfig.toml (FR-9, AD-15.1, AD-15.2, AD-15.9)", async () => {
  const script = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts["harness"];
  expect(script).toBe("bun --no-env-file conformance/harness/harness.ts");

  const probeDir = mkdtempSync(join(tmpdir(), "xt-harness-probe-"));
  roots.push(probeDir);
  const seen = join(probeDir, "seen");
  const body = ported(
    [
      `import { appendFileSync } from "node:fs";`,
      `appendFileSync(${JSON.stringify(seen)}, "variant=" + String(process.env["XARAVEL_VARIANT"]) + " marker=" + String((globalThis as any).__rootBunfigMarker === true) + "\\n");`,
      `portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`,
      `portedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(process.env["XARAVEL_VARIANT"] === "sqlite"); });`,
    ].join("\n"),
  );
  // The root bunfig.toml's own [test] preload proves the run used it.
  const files = {
    "bunfig.toml": 'env = false\n\n[test]\npreload = ["./marker.ts"]\n',
    "marker.ts": "(globalThis as any).__rootBunfigMarker = true;\n",
    [TEST_FILE]: body,
  };
  const entries = [{ id: A }, { id: B, backends: ["sqlite"] }];
  const lines = [{ id: A, status: "pass" }, { id: B, variant: "sqlite", status: "pass" }];
  const dir = makeRoot(entries, lines, files);
  const result = await runHarness(dir, { env: await env() });
  expect(result.err.some((line) => line.startsWith("harness: [none] "))).toBe(true);
  expect(result.err.some((line) => line.startsWith("harness: [sqlite] "))).toBe(true);
  expect(result.out).toEqual(["SUMMARY variants=2 run=2 not-run=0 checked=2 differ=0"]);
  expect(result.code).toBe(0);
  expect(readFileSync(seen, "utf8")).toBe("variant=none marker=true\nvariant=sqlite marker=true\n");

  // Package-level bunfig.toml files: named, nothing spawned, exit 1. Ignored directories don't count.
  rmSync(seen);
  const stray = makeRoot(entries, lines, {
    ...files,
    "packages/support/bunfig.toml": "",
    "packages/x/deep/bunfig.toml": "",
    "node_modules/pkg/bunfig.toml": "",
    "conformance/upstream/framework/bunfig.toml": "",
    ".cache/bunfig.toml": "",
  });
  const failed = await runHarness(stray, { env: await env() });
  expect(failed.code).toBe(1);
  expect(failed.out).toEqual([]);
  expect(failed.err.join("\n")).toContain("packages/support/bunfig.toml, packages/x/deep/bunfig.toml");
  expect(failed.err.join("\n")).not.toContain("node_modules");
  expect(failed.err.join("\n")).not.toContain("upstream");
  expect(() => readFileSync(seen)).toThrow();

  // A missing root bunfig.toml fails too.
  const bare = makeRoot(entries, lines, { [TEST_FILE]: body });
  rmSync(join(bare, "bunfig.toml"));
  const missing = await runHarness(bare, { env: await env() });
  expect(missing.code).toBe(1);
  expect(missing.err.join("\n")).toContain("the root bunfig.toml does not exist");

  // A run that writes no junit file fails the harness and quotes bun's stderr.
  const noJunit = await runHarness(dir, { env: await env(), bunArgs: ["--timeout=abc"] });
  expect(noJunit.code).toBe(1);
  expect(noJunit.out).toEqual([]);
  expect(noJunit.err.join("\n")).toMatch(/\[none\] bun test wrote no junit report \(exit 1\): .*Invalid timeout/);

  // An Expectations line whose Variant is not in conformance/variants fails before anything runs.
  const badVariant = makeRoot(entries, [...lines, { id: A, variant: "oracle", status: "pass" }], files);
  const unknownVariant = await runHarness(badVariant, { env: await env() });
  expect(unknownVariant.code).toBe(1);
  expect(unknownVariant.out).toEqual([]);
  expect(unknownVariant.err.join("\n")).toContain(`${SHARD}:3: Variant "oracle" is not in conformance/variants`);

  // The CLI: exit codes and streams.
  const cli = Bun.spawnSync([process.execPath, "--no-env-file", join(root, "conformance", "harness", "harness.ts"), "--root", stray], { env: await env(), stdout: "pipe", stderr: "pipe" });
  expect(cli.exitCode).toBe(1);
  expect(cli.stderr.toString()).toContain("packages/support/bunfig.toml");
  const usage = Bun.spawnSync([process.execPath, "--no-env-file", join(root, "conformance", "harness", "harness.ts"), "--bogus"], { stdout: "pipe", stderr: "pipe" });
  expect(usage.exitCode).toBe(2);
  expect(usage.stderr.toString()).toContain("Unknown argument: --bogus");
  const emptyRoot = Bun.spawnSync([process.execPath, "--no-env-file", join(root, "conformance", "harness", "harness.ts"), "--root", ""], { stdout: "pipe", stderr: "pipe" });
  expect(emptyRoot.exitCode).toBe(2);

  // With no Ported Test file nothing is spawned: every result is missing, and skip lines match it.
  const empty = makeRoot([{ id: A }, { id: B }], [{ id: A, status: "skip" }, { id: B, status: "pass" }]);
  const none = await runHarness(empty, { env: await env() });
  expect(none.out).toEqual([`MISSING ${B} [none] expected=pass actual=missing asserts=-/1`, "SUMMARY variants=1 run=1 not-run=0 checked=2 differ=1"]);
  expect(none.err).toEqual([]);

  // Variant membership (ESC-5.3-4): a Ported Test is declared only on its Inventory backends.
  // B (backends [sqlite]) neither runs nor reports on `none`; the unmapped TEST_FILE still loads on both runs.
  const ran = join(probeDir, "ran");
  const memberBody = ported(
    [
      `import { appendFileSync } from "node:fs";`,
      `portedTest(${JSON.stringify(A)}, {}, () => { appendFileSync(${JSON.stringify(ran)}, "A " + String(process.env["XARAVEL_VARIANT"]) + "\\n"); Assert.assertTrue(true); });`,
      `portedTest(${JSON.stringify(B)}, {}, () => { appendFileSync(${JSON.stringify(ran)}, "B " + String(process.env["XARAVEL_VARIANT"]) + "\\n"); Assert.assertTrue(true); });`,
    ].join("\n"),
  );
  const member = await runHarness(makeRoot(entries, lines, { [TEST_FILE]: memberBody }), { env: await env() });
  expect(member.out).toEqual(["SUMMARY variants=2 run=2 not-run=0 checked=2 differ=0"]);
  expect(readFileSync(ran, "utf8")).toBe(`A none\nB sqlite\n`);
  expect(member.err).toContain("harness: [none] bun test exited 0 over 1 file(s)");
  expect(member.err).toContain("harness: [sqlite] bun test exited 0 over 1 file(s)");

  // Without the harness's XARAVEL_INVENTORY (plain `bun test`), every row is declared.
  rmSync(ran);
  const plainDir = makeRoot(entries, lines, { [TEST_FILE]: memberBody });
  const plain = Bun.spawnSync([process.execPath, "--no-env-file", "test", "--preload", join(root, "conformance", "harness", "preload.ts"), join(plainDir, TEST_FILE)], { cwd: plainDir, env: { ...process.env, XARAVEL_VARIANT: "none", XARAVEL_INVENTORY: undefined, XARAVEL_HARNESS_OUT: undefined }, stdout: "pipe", stderr: "pipe" });
  expect(plain.exitCode).toBe(0);
  expect(readFileSync(ran, "utf8")).toBe(`A none\nB none\n`);

  // A file that mirrors a shard with lines only on `sqlite` (or a slice of it) is not given to the `none` run.
  const MIRROR_SHARD = "conformance/expectations/support/framework/tests/Support/SupportMirrorTest.jsonl";
  const mirrorFiles = {
    [TEST_FILE]: ported(`portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`),
    [MIRROR_SHARD]: shard([{ id: C, variant: "sqlite", status: "pass" }]),
    "packages/support/tests/ported/framework/tests/Support/SupportMirrorTest.test.ts": ported(`portedTest(${JSON.stringify(C)}, {}, () => { Assert.assertTrue(true); });`),
    "packages/support/tests/ported/framework/tests/Support/SupportMirrorTest/slice.test.ts": ported(`portedTest(${JSON.stringify(D)}, {}, () => { Assert.assertTrue(true); });`),
  };
  const mirrorRoot = makeRoot([{ id: A }, { id: C, backends: ["sqlite"] }, { id: D, backends: ["sqlite"] }], [{ id: A, status: "pass" }], mirrorFiles);
  const mirror = await runHarness(mirrorRoot, { env: await env() });
  // D has no Expectations line (an unknown id on sqlite), so it reports UNKNOWN there: the slice ran on sqlite.
  expect(mirror.out).toEqual([`UNKNOWN ${D} [sqlite] expected=- actual=pass asserts=1/-`, "SUMMARY variants=2 run=2 not-run=0 checked=2 differ=1"]);
  expect(mirror.err).toContain("harness: [none] bun test exited 0 over 1 file(s)");
  expect(mirror.err).toContain("harness: [sqlite] bun test exited 0 over 3 file(s)");

  // An id that is not in the Inventory is declared everywhere its file runs, and reports UNKNOWN.
  const Z = `${CLASS}::testNotInInventory`;
  const unknownBody = ported(`portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\nportedTest(${JSON.stringify(Z)}, {}, () => { Assert.assertTrue(true); });`);
  const unknownRun = await runHarness(makeRoot([{ id: A }], [{ id: A, status: "pass" }], { [TEST_FILE]: unknownBody }), { env: await env() });
  expect(unknownRun.out).toEqual([`UNKNOWN ${Z} [none] expected=- actual=pass asserts=1/-`, "SUMMARY variants=1 run=1 not-run=0 checked=1 differ=1"]);
  expect(unknownRun.code).toBe(1);

  // FR-2 still covers a row that is not declared: a duplicate non-member fails the file's import.
  const duplicateBody = ported(`portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\nportedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });\nportedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });`);
  const duplicate = await runHarness(makeRoot([{ id: A }, { id: B, backends: ["sqlite"] }], [{ id: A, status: "pass" }], { [TEST_FILE]: duplicateBody }), { env: await env() });
  expect(duplicate.code).toBe(1);
  expect(duplicate.err.join("\n")).toContain(`Test ID "${B}" is already declared (FR-2)`);

  // The unmapped TEST_FILE is named once per run it is given to.
  expect(mirror.err.filter((line) => line === `harness: ${TEST_FILE} mirrors no Expectations shard; it runs on every Variant`)).toHaveLength(2);
  // The mirror filter applies under a selection too.
  const mirrorSelected = await runHarness(mirrorRoot, { env: await env(), components: ["support"] });
  expect(mirrorSelected.err).toContain("harness: [none] bun test exited 0 over 1 file(s)");

  // A run whose files hold only non-member rows runs no test (bun writes no junit file): its lines are MISSING, the run completes.
  const noTestBody = ported(`portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`);
  const noTest = await runHarness(makeRoot([{ id: A }, { id: C, backends: ["sqlite"] }], [{ id: A, status: "pass" }, { id: C, variant: "sqlite", status: "pass" }], { [TEST_FILE]: noTestBody }), { env: await env() });
  expect(noTest.out).toEqual([`MISSING ${C} [sqlite] expected=pass actual=missing asserts=-/1`, "SUMMARY variants=2 run=2 not-run=0 checked=2 differ=1"]);
  expect(noTest.err).toContain("harness: [sqlite] bun test ran no test over 1 file(s)");

  // The Inventory reader skips oracle-nondeterminism.jsonl: membership is unchanged.
  rmSync(ran);
  const nondeterminism = `${JSON.stringify({ id: B, variant: "none", attempts: [{ assertTrue: 1 }, { assertTrue: 2 }], record: { assertTrue: 1 } })}\n`;
  const withRecord = await runHarness(makeRoot(entries, lines, { [TEST_FILE]: memberBody, "conformance/inventory/oracle-nondeterminism.jsonl": nondeterminism }), { env: await env() });
  expect(withRecord.out).toEqual(["SUMMARY variants=2 run=2 not-run=0 checked=2 differ=0"]);
  expect(readFileSync(ran, "utf8")).toBe(`A none\nB sqlite\n`);

  // A malformed Inventory line: the harness fails its precondition before spawning; the preload's reader names the file and line.
  const malformedDir = makeRoot(entries, lines, { [TEST_FILE]: memberBody, "conformance/inventory/zz.jsonl": `${JSON.stringify({ id: C, backends: ["none"] })}\n{not json\n` });
  const malformed = await runHarness(malformedDir, { env: await env() });
  expect(malformed.code).toBe(1);
  expect(malformed.out).toEqual([]);
  const malformedPlain = Bun.spawnSync([process.execPath, "--no-env-file", "test", "--preload", join(root, "conformance", "harness", "preload.ts"), join(malformedDir, TEST_FILE)], { cwd: malformedDir, env: { ...process.env, XARAVEL_VARIANT: "none", XARAVEL_INVENTORY: join(malformedDir, "conformance", "inventory"), XARAVEL_HARNESS_OUT: undefined }, stdout: "pipe", stderr: "pipe" });
  expect(malformedPlain.exitCode).not.toBe(0);
  expect(malformedPlain.stderr.toString()).toContain(`Inventory line ${join(malformedDir, "conformance", "inventory", "zz.jsonl")}:2 is malformed`);

  // Dataset rows: membership looks up the full `<id>#<key>`, so each row runs only on its own Variant.
  rmSync(ran);
  const X = `${CLASS}::testRows`;
  const rowsBody = ported(`import { appendFileSync } from "node:fs";\nportedTest(${JSON.stringify(X)}, { dataset: { a: ["a"], b: ["b"] } }, (key: string) => { appendFileSync(${JSON.stringify(ran)}, key + " " + String(process.env["XARAVEL_VARIANT"]) + "\\n"); Assert.assertTrue(true); });`);
  const rows = await runHarness(makeRoot([{ id: `${X}#a` }, { id: `${X}#b`, backends: ["sqlite"] }], [{ id: `${X}#a`, status: "pass" }, { id: `${X}#b`, variant: "sqlite", status: "pass" }], { [TEST_FILE]: rowsBody }), { env: await env() });
  expect(rows.out).toEqual(["SUMMARY variants=2 run=2 not-run=0 checked=2 differ=0"]);
  expect(readFileSync(ran, "utf8")).toBe("a none\nb sqlite\n");

  // A member report with no Expectations line on the run's Variant is UNKNOWN there, end to end.
  const knownBody = ported(`portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\nportedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });`);
  // (An Inventory `none` excludes other backends, so the two Variants here are both on SQLite.)
  const knownFiles = { [TEST_FILE]: knownBody, "conformance/variants": VARIANTS.replace("redis\n", "queue-database@sqlite\nredis\n") };
  const known = await runHarness(makeRoot([{ id: A, backends: ["queue-database@sqlite"], assertions: null }, { id: B, backends: ["queue-database@sqlite", "sqlite"], assertions: null }], [{ id: A, variant: "queue-database@sqlite", status: "pass" }, { id: B, variant: "sqlite", status: "pass" }], knownFiles), { env: await env() });
  expect(known.out).toEqual([`UNKNOWN ${B} [queue-database@sqlite] expected=- actual=pass asserts=1/-`, "SUMMARY variants=2 run=2 not-run=0 checked=2 differ=1"]);

  // compare: a report whose id has lines only on another variant is UNKNOWN on this one.
  const strayRun: VariantRun = { junit: new Map([[B, { outcome: "passed", type: null, message: null }]]), reports: new Map([[B, { type: "ported", id: B, assertions: { assertTrue: 1 } }]]), late: new Set(), duplicates: new Set() };
  const compared = compare({ variant: "none", lines: [], knownIds: new Set([A]), run: strayRun, inventory: new Map(), waived: () => false });
  expect(compared.differences.map((difference) => difference.text)).toEqual([`UNKNOWN ${B} [none] expected=- actual=pass asserts=1/-`]);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-102

xaravelTest("XT-conformance-102", "results that differ from the Expectations print one greppable line per differing Test ID × variant, sorted, then a summary line (FR-3, FR-4.1, FR-4.2, FR-9.2, FR-113.3)", async () => {
  const F = `${CLASS}::testF`;
  const G = `${CLASS}::testG`;
  const H = `${CLASS}::testH`;
  const K = `${CLASS}::testK`;
  const M = `${CLASS}::testM`;
  const U = `${CLASS}::testUnknown`;
  const body = ported(
    [
      `import { test } from "bun:test";`,
      `portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); throw new Error("boom"); });`,
      `portedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });`,
      `portedTest(${JSON.stringify(C)}, {}, () => { Assert.markTestSkipped("later"); });`,
      `test(${JSON.stringify(D)}, () => {});`,
      `portedTest(${JSON.stringify(E)}, {}, () => { Assert.assertTrue(false); });`,
      `portedTest(${JSON.stringify(F)}, {}, () => { Assert.assertTrue(true); });`,
      `portedTest(${JSON.stringify(G)}, {}, () => { Assert.assertTrue(true); });`,
      `portedTest(${JSON.stringify(H)}, {}, () => { throw new Error("quarantined anyway"); });`,
      `portedTest(${JSON.stringify(U)}, {}, () => { Assert.assertTrue(true); });`,
      `test.skip(${JSON.stringify(M)}, () => {});`,
    ].join("\n"),
  );
  const entries = [A, B, C, D, E, F, G, H, K, M].map((id) => ({ id }));
  const lines: Line[] = [
    { id: A, status: "pass" }, // FAIL
    { id: B, status: "skip" }, // UNEXPECTED-PASS
    { id: C, status: "pass" }, // SKIPPED
    { id: D, status: "pass" }, // FAIL, no report
    { id: E, status: "fail-known" }, // matches
    { id: F, status: "pass" }, // matches
    { id: G, status: "fail-known" }, // UNEXPECTED-PASS
    { id: H, status: "quarantined" }, // matches
    { id: K, status: "pass" }, // MISSING
    { id: M, status: "pass" }, // SKIPPED (junit <skipped>)
  ];
  const dir = makeRoot(entries, lines, { [TEST_FILE]: body });
  const result = await runHarness(dir, { env: await env() });
  expect(result.out).toEqual([
    `FAIL ${A} [none] expected=pass actual=fail asserts=1/1`,
    `UNEXPECTED-PASS ${B} [none] expected=skip:not-ported-yet actual=pass asserts=1/1`,
    `SKIPPED ${C} [none] expected=pass actual=skip asserts=0/1`,
    `FAIL ${D} [none] expected=pass actual=no-report asserts=-/1`,
    `UNEXPECTED-PASS ${G} [none] expected=fail-known actual=pass asserts=1/1`,
    `MISSING ${K} [none] expected=pass actual=missing asserts=-/1`,
    `SKIPPED ${M} [none] expected=pass actual=skip asserts=-/1`,
    `UNKNOWN ${U} [none] expected=- actual=pass asserts=1/-`,
    "SUMMARY variants=1 run=1 not-run=0 checked=10 differ=8",
  ]);
  expect(result.code).toBe(1);
  // A FAIL with a junit failure names it in the diagnostics.
  expect(result.err).toContain(`harness: ${A} [none]: Error: boom`);

  // A second report for an id (here forged by another test) makes that id fail.
  const forged = makeRoot([{ id: A, assertions: { assertSame: 5 } }, { id: B }], [{ id: A, status: "pass" }, { id: B, status: "pass" }], {
    [TEST_FILE]: ported(
      [
        `portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`,
        `portedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); (globalThis as any)[Symbol.for("xaravel.harness.report")]({ type: "ported", id: ${JSON.stringify(A)}, consequence: null, assertions: { assertSame: 5 } }); });`,
      ].join("\n"),
    ),
  });
  const forgedRun = await runHarness(forged, { env: await env() });
  expect(forgedRun.out).toEqual([`FAIL ${A} [none] expected=pass actual=fail asserts=5/5`, "SUMMARY variants=1 run=1 not-run=0 checked=2 differ=1"]);

  // bun exits non-zero with no failing testcase (a Ported Test file throws on import): one ERROR line, before the Variant's differences.
  const broken = makeRoot([{ id: A }, { id: B }], [{ id: A, status: "pass" }, { id: B, status: "skip" }], {
    [TEST_FILE]: ported(`portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`),
    "packages/support/tests/ported/Support/BrokenTest.test.ts": `throw new Error("import boom");\n`,
  });
  const brokenRun = await runHarness(broken, { env: await env() });
  expect(brokenRun.out).toEqual(["ERROR [none] bun test exited 1 with no failing testcase", "SUMMARY variants=1 run=1 not-run=0 checked=2 differ=1"]);
  expect(brokenRun.code).toBe(1);
  expect(brokenRun.err.join("\n")).toContain("import boom");

  // Lines sort by variant order, then id; matching runs exit 0.
  const two = makeRoot(
    [{ id: A, backends: ["sqlite"] }, { id: B }],
    [{ id: B, status: "skip" }, { id: A, variant: "sqlite", status: "skip" }],
    { [TEST_FILE]: ported(`portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\nportedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });`) },
  );
  const sorted = await runHarness(two, { env: await env() });
  expect(sorted.out).toEqual([
    `UNEXPECTED-PASS ${B} [none] expected=skip:not-ported-yet actual=pass asserts=1/1`,
    `UNEXPECTED-PASS ${A} [sqlite] expected=skip:not-ported-yet actual=pass asserts=1/1`,
    "SUMMARY variants=2 run=2 not-run=0 checked=2 differ=2",
  ]);
  const ok = makeRoot([{ id: A }], [{ id: A, status: "pass" }], { [TEST_FILE]: ported(`portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`) });
  const passing = await runHarness(ok, { env: await env() });
  expect(passing.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
  expect(passing.code).toBe(0);

  // The CLI prints the same lines on stdout.
  const cli = Bun.spawnSync([process.execPath, "--no-env-file", join(root, "conformance", "harness", "harness.ts"), "--root", two], { env: await env(), stdout: "pipe", stderr: "pipe" });
  expect(cli.exitCode).toBe(1);
  expect(cli.stdout.toString()).toBe(`${sorted.out.join("\n")}\n`);

  // junit parsing decodes entities and keeps the failure's type and message.
  const cases = parseJunit(`<testsuite><testcase name="A&amp;&lt;&quot;x"><failure type="E" message="m &lt;1&gt;">t</failure></testcase><testcase name="s"><skipped /></testcase><testcase name="p" /></testsuite>`);
  expect([...cases]).toEqual([
    ['A&<"x', { outcome: "failed", type: "E", message: "m <1>" }],
    ["s", { outcome: "skipped", type: null, message: null }],
    ["p", { outcome: "passed", type: null, message: null }],
  ]);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-103

xaravelTest("XT-conformance-103", "a pass whose assertion kinds fall below the Inventory's is a FLOOR failure unless its DIV clause allows fewer (ESC-5.3-2) (FR-113.2, FR-113.3)", async () => {
  const body = ported(
    [
      `portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertSame(1, 1); });`,
      `portedTest(${JSON.stringify(B)}, {}, () => { Assert.assertSame(1, 1); Assert.assertSame(2, 2); Assert.assertTrue(true); });`,
      `portedTest(${JSON.stringify(C)}, {}, () => { Assert.assertTrue(true); });`,
    ].join("\n"),
  );
  const entries = [
    { id: A, assertions: { assertSame: 2 } },
    { id: B, assertions: { assertSame: 2 } },
    { id: C, assertions: null },
  ];
  const below = makeRoot(entries, [{ id: A, status: "pass" }, { id: B, status: "pass" }, { id: C, status: "pass" }], { [TEST_FILE]: body });
  const failed = await runHarness(below, { env: await env() });
  expect(failed.out).toEqual([`FLOOR ${A} [none] expected=pass actual=pass asserts=1/2`, "SUMMARY variants=1 run=1 not-run=0 checked=3 differ=1"]);
  expect(failed.err).toContain(`harness: ${A} [none]: below the floor: assertSame 1<2`);
  expect(failed.code).toBe(1);

  // fail-known takes a below-floor pass.
  const known = makeRoot(entries, [{ id: A, status: "fail-known" }, { id: B, status: "pass" }, { id: C, status: "pass" }], { [TEST_FILE]: body });
  expect((await runHarness(known, { env: await env() })).code).toBe(0);

  // The waiver: adapted DIV-3.2, decisions/DIV-3.md having clause DIV-3.2 and listing "2" in fewer_assertions.
  const waivedLines = [{ id: A, status: "pass", adapted: "DIV-3.2" }, { id: B, status: "pass" }, { id: C, status: "pass" }];
  const clauses = "\n# DIV-3\n\n## Adaptation clauses\n\n- **DIV-3.1** One.\n- **DIV-3.2** Two.\n";
  const waived = makeRoot(entries, waivedLines, { [TEST_FILE]: body, "decisions/DIV-3.md": `---\nfewer_assertions: ["2"]\n---\n${clauses}` });
  const ok = await runHarness(waived, { env: await env() });
  expect(ok.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=3 differ=0"]);
  expect(ok.code).toBe(0);

  // No waiver without the record, when the record lists another clause, when the item is an unquoted number
  // (divergence:check rejects it), or when the record has no clause DIV-3.2 (Epic 8 retro item 7).
  const unwaivedFiles: Record<string, string>[] = [
    {},
    { "decisions/DIV-3.md": '---\nfewer_assertions: ["1"]\n---\n' },
    { "decisions/DIV-3.md": "# no frontmatter\n" },
    { "decisions/DIV-3.md": `---\nfewer_assertions: [2]\n---\n${clauses}` },
    { "decisions/DIV-3.md": '---\nfewer_assertions: ["2"]\n---\n\n# DIV-3\n\n- **DIV-3.1** One.\n' },
    { "decisions/DIV-3.md": "---\nfewer_assertions: [2]\n---\n\n# DIV-3\n" },
  ];
  for (const files of unwaivedFiles) {
    const unwaived = makeRoot(entries, waivedLines, { [TEST_FILE]: body, ...files });
    const run = await runHarness(unwaived, { env: await env() });
    expect(run.out[0]).toBe(`FLOOR ${A} [none] expected=pass actual=pass asserts=1/2`);
    expect(run.code).toBe(1);
  }

  const escalation = parseEscalation("conformance/escalations/ESC-5.3-2.md", readFileSync(join(root, "conformance", "escalations", "ESC-5.3-2.md"), "utf8"));
  expect(escalation.violations).toEqual([]);
  expect(escalation.escalation?.testIds).toEqual(["XT-conformance-103"]);
  expect(escalation.escalation?.trigger).toBe("contract");
  expect(["open", "approved"]).toContain(escalationStatus("ESC-5.3-2", root));
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-104

xaravelTest("XT-conformance-104", "skip:blocked-by:<c> matches only a BlockedByComponentError(<c>) failure; any other failure is a mismatch (ESC-5.3-1) (FR-3, AD-15.6)", async () => {
  const body = ported(
    [
      `class BlockedByComponentError extends Error { constructor(component: string) { super("BlockedByComponentError(" + component + "): Illuminate\\\\Database\\\\Capsule is not installed"); this.name = "BlockedByComponentError"; } }`,
      `portedTest(${JSON.stringify(A)}, {}, () => { throw new BlockedByComponentError("database"); });`,
      `portedTest(${JSON.stringify(B)}, {}, () => { throw new BlockedByComponentError("cache"); });`,
      `portedTest(${JSON.stringify(C)}, {}, () => { throw new Error("BlockedByComponentError(database)"); });`,
      `portedTest(${JSON.stringify(D)}, {}, () => { Assert.assertTrue(true); });`,
    ].join("\n"),
  );
  const blocked = { status: "skip", reason: "blocked-by:database" };
  const dir = makeRoot([{ id: A }, { id: B }, { id: C }, { id: D }], [A, B, C, D].map((id) => ({ id, ...blocked })), { [TEST_FILE]: body });
  const result = await runHarness(dir, { env: await env() });
  expect(result.out).toEqual([
    `FAIL ${B} [none] expected=skip:blocked-by:database actual=blocked-by:cache asserts=0/1`,
    `FAIL ${C} [none] expected=skip:blocked-by:database actual=fail asserts=0/1`,
    `UNEXPECTED-PASS ${D} [none] expected=skip:blocked-by:database actual=pass asserts=1/1`,
    "SUMMARY variants=1 run=1 not-run=0 checked=4 differ=3",
  ]);

  // A blocked-by failure is a failure for fail-known, and a mismatch for pass.
  const run: VariantRun = { junit: new Map([[A, { outcome: "failed", type: "BlockedByComponentError", message: "BlockedByComponentError(database): x" }]]), reports: new Map(), late: new Set(), duplicates: new Set() };
  const line = (status: string): HarnessLine => ({ id: A, variant: "none", status, reason: null, adapted: null });
  const inventory = new Map([[A, { assertTrue: 1 }]]);
  expect(compare({ variant: "none", lines: [line("fail-known")], knownIds: new Set([A]), run, inventory, waived: () => false }).differences).toEqual([]);
  expect(compare({ variant: "none", lines: [line("pass")], knownIds: new Set([A]), run, inventory, waived: () => false }).differences.map((d) => d.text)).toEqual([`FAIL ${A} [none] expected=pass actual=blocked-by:database asserts=-/1`]);

  const escalation = parseEscalation("conformance/escalations/ESC-5.3-1.md", readFileSync(join(root, "conformance", "escalations", "ESC-5.3-1.md"), "utf8"));
  expect(escalation.violations).toEqual([]);
  expect(escalation.escalation?.testIds).toEqual(["XT-conformance-104"]);
  expect(escalation.escalation?.trigger).toBe("contract");
  expect(["open", "approved"]).toContain(escalationStatus("ESC-5.3-1", root));
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-105

xaravelTest("XT-conformance-105", "a variant whose backend is not running locally is NOT-RUN, never a failure and never written; in CI an alpha variant must run (FR-9.3, FR-9.4)", async () => {
  const body = ported(`portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\nportedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });`);
  const entries = [{ id: A }, { id: B, backends: ["mysql", "pgsql", "redis"] }];
  const lines: Line[] = [
    { id: A, status: "pass" },
    { id: B, variant: "mysql", status: "pass" },
    { id: B, variant: "pgsql", status: "pass" },
    { id: B, variant: "redis", status: "pass" },
  ];
  const dir = makeRoot(entries, lines, { [TEST_FILE]: body });
  const before = treeDigest(dir);
  const port = await closedPort();
  const local = await runHarness(dir, { env: await env({ PGPORT: String(port), REDIS_PORT: String(port) }) });
  expect(local.out).toEqual([
    "NOT-RUN [mysql] 1 line(s): no local probe for backend mysql",
    `NOT-RUN [pgsql] 1 line(s): Postgres at 127.0.0.1:${port} is not reachable (ECONNREFUSED)`,
    `NOT-RUN [redis] 1 line(s): redis-server not found at ${NO_REDIS_SERVER} (AD-17)`,
    "SUMMARY variants=4 run=1 not-run=3 checked=1 differ=0",
  ]);
  expect(local.code).toBe(0);
  expect(treeDigest(dir)).toBe(before);

  // In CI, the unreachable alpha variants (pgsql, redis) are differences; mysql is not alpha.
  const ci = await runHarness(dir, { env: await env({ CI: "true", PGPORT: String(port), REDIS_PORT: String(port) }) });
  expect(ci.out).toEqual([
    "NOT-RUN [mysql] 1 line(s): no local probe for backend mysql",
    `NOT-RUN [pgsql] 1 line(s): Postgres at 127.0.0.1:${port} is not reachable (ECONNREFUSED); CI runs every alpha variant (FR-9)`,
    `NOT-RUN [redis] 1 line(s): Redis at 127.0.0.1:${port} is not reachable (ECONNREFUSED); CI runs every alpha variant (FR-9)`,
    "SUMMARY variants=4 run=1 not-run=3 checked=1 differ=2",
  ]);
  expect(ci.code).toBe(1);
  expect(treeDigest(dir)).toBe(before);

  // A reachable backend runs: Postgres "listening" on a port, Redis still down.
  const { server, port: open } = await listening();
  try {
    const noopAdmin = { list: async () => [], drop: async () => undefined, create: async () => undefined, close: async () => undefined };
    const reachable = await runHarness(dir, { env: await env({ PGPORT: String(open), REDIS_PORT: String(port) }), postgres: () => noopAdmin });
    expect(reachable.out).toEqual([
      "NOT-RUN [mysql] 1 line(s): no local probe for backend mysql",
      `NOT-RUN [redis] 1 line(s): redis-server not found at ${NO_REDIS_SERVER} (AD-17)`,
      "SUMMARY variants=4 run=2 not-run=2 checked=2 differ=0",
    ]);
  } finally {
    server.close();
  }

  // Probes: defaults, unix sockets, bad ports, variants.
  expect(backendFor("queue-redis@redis")).toBe("redis");
  expect(backendFor("pgsql")).toBe("pgsql");
  expect(await probe("none", {})).toEqual({ reachable: true });
  expect(await probe("sqlite", {})).toEqual({ reachable: true });
  expect(await probe("beanstalkd", {})).toEqual({ reachable: false, why: "no local probe for backend beanstalkd" });
  const socketDir = mkdtempSync(join(tmpdir(), "xt-pg-"));
  roots.push(socketDir);
  expect(await probe("pgsql", { PGHOST: socketDir, PGPORT: "5433" })).toEqual({ reachable: false, why: `Postgres at ${socketDir}/.s.PGSQL.5433 is not reachable (ENOENT)` });
  expect(await probe("pgsql", { PGPORT: "70000" })).toEqual({ reachable: false, why: 'PGPORT is not a port: "70000"' });
  expect(await probe("redis", { REDIS_PORT: "x" })).toEqual({ reachable: false, why: 'REDIS_PORT is not a port: "x"' });

  // The real repo, with Postgres and Redis down: they are NOT-RUN, nothing differs, and nothing is written.
  const realDirs = ["expectations", "inventory"].map((name) => join(root, "conformance", name));
  const realBefore = realDirs.map(treeDigest);
  const real = await runHarness(root, { env: await env() });
  expect(real.code).toBe(0);
  expect(real.out.some((line) => line.startsWith("NOT-RUN [pgsql] "))).toBe(true);
  expect(real.out.some((line) => line.startsWith("NOT-RUN [redis] "))).toBe(true);
  expect(real.out.at(-1)).toMatch(/^SUMMARY variants=\d+ run=\d+ not-run=\d+ checked=\d+ differ=0$/);
  expect(realDirs.map(treeDigest)).toEqual(realBefore);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-185

xaravelTest("XT-conformance-185", "under the harness, concurrent tests never mix counts, a late assertion fails its test, and the intrinsics are frozen before any Ported Test loads (AD-15.9, FR-113.3)", async () => {
  // Concurrent: A and B interleave (B checks that A is mid-run); each report holds only its own counts.
  const concurrent = ported(
    [
      `const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));`,
      `let aRunning = false;`,
      `portedTest(${JSON.stringify(A)}, {}, async () => { aRunning = true; Assert.assertSame(1, 1); await sleep(60); Assert.assertSame(2, 2); aRunning = false; });`,
      `portedTest(${JSON.stringify(B)}, {}, async () => { await sleep(10); Assert.assertTrue(aRunning); await sleep(10); Assert.assertTrue(true); Assert.assertTrue(true); });`,
    ].join("\n"),
  );
  const pairs = makeRoot([{ id: A, assertions: { assertSame: 2 } }, { id: B, assertions: { assertTrue: 3 } }], [{ id: A, status: "skip" }, { id: B, status: "skip" }], { [TEST_FILE]: concurrent });
  const mixed = await runHarness(pairs, { env: await env(), bunArgs: ["--concurrent"] });
  expect(mixed.out).toEqual([
    `UNEXPECTED-PASS ${A} [none] expected=skip:not-ported-yet actual=pass asserts=2/2`,
    `UNEXPECTED-PASS ${B} [none] expected=skip:not-ported-yet actual=pass asserts=3/3`,
    "SUMMARY variants=1 run=1 not-run=0 checked=2 differ=2",
  ]);

  // Late: A's un-awaited timer asserts while C runs; A fails as late, C is untouched.
  const late = ported(
    [
      `const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));`,
      `portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); void sleep(20).then(() => { Assert.assertTrue(true); }); });`,
      `portedTest(${JSON.stringify(C)}, {}, async () => { await sleep(100); Assert.assertTrue(true); });`,
    ].join("\n"),
  );
  const lateRoot = makeRoot([{ id: A }, { id: C }], [{ id: A, status: "pass" }, { id: C, status: "pass" }], { [TEST_FILE]: late });
  const lateRun = await runHarness(lateRoot, { env: await env() });
  expect(lateRun.out).toEqual([`FAIL ${A} [none] expected=pass actual=late asserts=1/1`, "SUMMARY variants=1 run=1 not-run=0 checked=2 differ=1"]);
  expect(lateRun.code).toBe(1);

  // Intrinsics: frozen at load; patching throws a TypeError; this.name = … and o.toString = … still work.
  const patch = (code: string): string => `(() => { try { ${code}; return false; } catch (error) { return error instanceof TypeError; } })()`;
  const intrinsics = ported(
    [
      `import { AsyncLocalStorage } from "node:async_hooks";`,
      `import { expect as bunExpect, test } from "bun:test";`,
      `import { AssertionFailedError, ExpectationFailedException } from ${JSON.stringify(ASSERT)};`,
      `const fails = (fn: () => void): boolean => { try { fn(); return false; } catch (error) { return error instanceof ExpectationFailedException || error instanceof AssertionFailedError; } };`,
      `const REPORT = Symbol.for("xaravel.harness.report");`,
      `const LATE = Symbol.for("xaravel.harness.late");`,
      `const frozenAtLoad = [Object.prototype, Array.prototype, Function.prototype, Promise.prototype, Error, JSON, Math, Reflect, AsyncLocalStorage.prototype, test, bunExpect].every((o) => Object.isExtensible(o) === false);`,
      `class MyError extends Error { constructor() { super("m"); this.name = "MyError"; } }`,
      `portedTest(${JSON.stringify(A)}, {}, () => {`,
      `  Assert.assertTrue(frozenAtLoad);`,
      // ESC-9.9-1: `Symbol.metadata` is installed before `Symbol` is frozen, as the registered symbol, and stays put.
      `  Assert.assertSame(Symbol.for("Symbol.metadata"), (Symbol as any).metadata);`,
      `  Assert.assertFalse(Object.isExtensible(Symbol));`,
      `  Assert.assertTrue(${patch(`(Symbol as any).metadata = Symbol("x")`)});`,
      `  Assert.assertTrue(${patch(`(Object.prototype as any).x = 1`)});`,
      `  Assert.assertTrue(${patch(`(AsyncLocalStorage.prototype as any).run = () => 1`)});`,
      `  Assert.assertTrue(${patch(`(test as any).each = () => 1`)});`,
      `  Assert.assertTrue(${patch(`(Array.prototype as any).map = () => 1`)});`,
      `  Assert.assertTrue(${patch(`(Promise.prototype as any).then = () => 1`)});`,
      `  Assert.assertTrue(${patch(`(JSON as any).stringify = () => "x"`)});`,
      `  Assert.assertTrue(${patch(`(Error.prototype as any).name = "x"`)});`,
      `  Assert.assertTrue(${patch(`(Object.getPrototypeOf([][Symbol.iterator]()) as any).next = () => 1`)});`,
      `  Assert.assertSame("MyError", new MyError().name);`,
      `  const o: any = {}; o.toString = () => "custom"; Assert.assertSame("custom", String(o));`,
      `  Assert.assertFalse(Object.hasOwn(Object.prototype, "x"));`,
      `  Error.stackTraceLimit = 50; Assert.assertSame(50, Error.stackTraceLimit);`,
      // The grader still tells built-ins apart through the tamed `constructor` accessors.
      `  Assert.assertTrue(fails(() => Assert.assertEquals(new Date(1), new Date(2))));`,
      `  Assert.assertTrue(fails(() => Assert.assertEquals(new Map([[1, 2]]), new Map([[1, 3]]))));`,
      // The harness globals and the global bindings can't be replaced; the test is still reported (no no-report).
      `  Assert.assertTrue(${patch(`(globalThis as any)[REPORT] = () => undefined`)});`,
      `  Assert.assertTrue(${patch(`(globalThis as any)[LATE] = () => undefined`)});`,
      `  Assert.assertTrue(${patch(`Object.defineProperty(globalThis, REPORT, { value: () => undefined })`)});`,
      `  Assert.assertTrue(${patch(`Object.defineProperty(globalThis, LATE, { value: () => undefined })`)});`,
      `  Assert.assertTrue(${patch(`(globalThis as any).JSON = {}`)});`,
      `});`,
    ].join("\n"),
  );
  const frozen = makeRoot([{ id: A, assertions: null }], [{ id: A, status: "pass" }], { [TEST_FILE]: intrinsics });
  const frozenRun = await runHarness(frozen, { env: await env() });
  expect(frozenRun.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);

  // The late hook itself: a frozen { id, kind }, kind null for the kind-less count; a throwing hook never throws.
  // Under the harness preload the hook is installed non-writable and non-configurable, so this part runs in a
  // child bun without the preload, which prints what it saw as one JSON line (Story 5.9).
  const hookDir = mkdtempSync(join(tmpdir(), "xt-harness-late-"));
  roots.push(hookDir);
  const hookScript = join(hookDir, "late-hook.ts");
  writeFileSync(
    hookScript,
    [
      `import { runCounted, recordAssertion, addToAssertionCount } from ${JSON.stringify(COUNTER)};`,
      `const LATE = Symbol.for("xaravel.harness.late");`,
      `const seen: unknown[] = [];`,
      `const global = globalThis as Record<symbol, unknown>;`,
      `let resume: () => void = () => undefined;`,
      `const leftover = new Promise<void>((done) => {`,
      `  resume = done;`,
      `});`,
      `let tail: Promise<void> = Promise.resolve();`,
      `let counted: unknown = null;`,
      `try {`,
      `  global[LATE] = (late: unknown) => {`,
      `    seen.push(late);`,
      `  };`,
      `  counted = await runCounted(() => {`,
      `    recordAssertion("assertTrue");`,
      `    tail = leftover.then(() => {`,
      `      recordAssertion("assertSame");`,
      `      addToAssertionCount(0);`,
      `      addToAssertionCount(2);`,
      `    });`,
      `  }, "X::y");`,
      `  resume();`,
      `  await tail;`,
      `  const frozen = seen.every((item) => Object.isFrozen(item));`,
      `  global[LATE] = () => {`,
      `    throw new Error("hook");`,
      `  };`,
      `  let again: () => void = () => undefined;`,
      `  const second = new Promise<void>((done) => {`,
      `    again = done;`,
      `  });`,
      `  let after: Promise<void> = Promise.resolve();`,
      `  await runCounted(() => {`,
      `    after = second.then(() => {`,
      `      recordAssertion("assertTrue");`,
      `    });`,
      `  }, "X::z");`,
      `  again();`,
      `  await after;`,
      `  console.log(JSON.stringify({ assertions: (counted as { assertions: unknown }).assertions, seen, frozen }));`,
      `} finally {`,
      `  delete global[LATE];`,
      `}`,
    ].join("\n"),
  );
  const hookEnv: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && name !== "BUN_OPTIONS" && name !== "NODE_OPTIONS") {
      hookEnv[name] = value;
    }
  }
  const hookRun = Bun.spawnSync([process.execPath, "--no-env-file", hookScript], { cwd: hookDir, env: hookEnv, stdout: "pipe", stderr: "pipe" });
  expect([hookRun.exitCode, hookRun.stderr.toString()]).toEqual([0, ""]);
  const hook = JSON.parse(hookRun.stdout.toString()) as { assertions: unknown; seen: unknown[]; frozen: boolean };
  expect(hook.assertions).toEqual({ assertTrue: 1 });
  expect(hook.seen).toEqual([
    { id: "X::y", kind: "assertSame" },
    { id: "X::y", kind: null },
  ]);
  expect(hook.frozen).toBe(true);
}, 60_000);
