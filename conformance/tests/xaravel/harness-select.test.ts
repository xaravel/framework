// Xaravel Tests for Story 5.4 (fast mode, seeds and filters; FR-9, ESC-4.8-1
// item 1). These run under plain `bun test` until the harness's `xaravelTest`
// lands in Story 5.9. Fixture roots are hermetic temp directories holding a
// root `bunfig.toml`, two Components' Inventory and Expectations shards,
// `conformance/variants` and Ported Test files that import `portedTest` from
// the real `packages/assert` by absolute path; the harness runs them with its
// real preload. The real repository is only read.
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { MAX_PATTERN, PRELOAD, isFullRun, parseArgs, runHarness, type HarnessOptions } from "../../harness/harness";
import { FAST_SAMPLE, globToRegExp, namePattern, sampleIds, selectIds } from "../../harness/select";
import { signatureLookup } from "../../harness/signatures";

const root = resolve(import.meta.dir, "..", "..", "..");
const HARNESS = join(root, "conformance", "harness", "harness.ts");
const ASSERT = join(root, "packages", "assert", "src", "index.ts");
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixture: two Components, support and collections.

const HASH = "0".repeat(64);
const SUPPORT = "Illuminate\\Tests\\Support\\SupportSelectTest";
const COLLECTIONS = "Illuminate\\Tests\\Support\\SupportCollectionSelectTest";
const FILES = {
  support: { shard: "conformance/expectations/support/framework/tests/Support/SupportSelectTest.jsonl", test: "packages/support/tests/ported/Support/SupportSelectTest.test.ts", source: "framework/tests/Support/SupportSelectTest.php" },
  collections: { shard: "conformance/expectations/collections/framework/tests/Support/SupportCollectionSelectTest.jsonl", test: "packages/collections/tests/ported/Support/SupportCollectionSelectTest.test.ts", source: "framework/tests/Support/SupportCollectionSelectTest.php" },
} as const;
type Component = keyof typeof FILES;
const VARIANTS = "mysql\nnone\npgsql\nredis\nsqlite\n";
const ALPHA = new Set(["none", "pgsql", "redis", "sqlite"]);

interface Line {
  id: string;
  component?: Component;
  variant?: string;
  status?: string;
}

const s = (method: string): string => `${SUPPORT}::${method}`;
const c = (method: string): string => `${COLLECTIONS}::${method}`;

function inventory(component: Component, lines: readonly Line[]): string {
  const backends = new Map<string, string[]>();
  for (const line of lines.filter((l) => (l.component ?? "support") === component)) {
    const list = backends.get(line.id) ?? [];
    list.push(line.variant ?? "none");
    backends.set(line.id, list);
  }
  return [...backends]
    .map(([id, unsorted], index) => {
      const list = [...unsorted].sort();
      const oracle = Object.fromEntries(list.filter((backend) => ALPHA.has(backend)).map((backend) => [backend, "pass"]));
      return `${JSON.stringify({ id, component, kind: "unit", backends: list, source: `${FILES[component].source}:${10 * (index + 1)}-${10 * (index + 1) + 1}`, hash: HASH, assertions: { assertTrue: 1 }, oracle })}\n`;
    })
    .join("");
}

function shard(component: Component, lines: readonly Line[]): string {
  return lines
    .filter((line) => (line.component ?? "support") === component)
    .map((line) => {
      const status = line.status ?? "pass";
      return `${JSON.stringify({ id: line.id, variant: line.variant ?? "none", status, reason: status === "skip" ? "not-ported-yet" : null, adapted: null, escalation: null })}\n`;
    })
    .join("");
}

/** A Ported Test file that records its own load in `seen`, then passes one portedTest per id. */
function ported(ids: readonly string[], seen: string | null = null, extra = ""): string {
  const record = seen === null ? "" : `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(seen)}, import.meta.path + "\\n");\n`;
  return `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\n${record}${ids.map((id) => `portedTest(${JSON.stringify(id)}, {}, () => { Assert.assertTrue(true); });`).join("\n")}\n${extra}`;
}

function makeRoot(lines: readonly Line[], files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "xt-select-"));
  roots.push(dir);
  const all: Record<string, string> = {
    "bunfig.toml": "env = false\n",
    "conformance/variants": VARIANTS,
    "conformance/inventory/support.jsonl": inventory("support", lines),
    "conformance/inventory/collections.jsonl": inventory("collections", lines),
    [FILES.support.shard]: shard("support", lines),
    [FILES.collections.shard]: shard("collections", lines),
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** The env for a fixture run: no CI, and Postgres and Redis pointed at a closed port. */
async function env(): Promise<Record<string, string | undefined>> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = String((server.address() as { port: number }).port);
  await new Promise<void>((done) => server.close(() => done()));
  return { ...process.env, CI: undefined, PGHOST: "127.0.0.1", PGPORT: port, REDIS_HOST: "127.0.0.1", REDIS_PORT: port, XARAVEL_API_SURFACE: undefined };
}

async function harness(dir: string, options: HarnessOptions = {}): Promise<Awaited<ReturnType<typeof runHarness>>> {
  return runHarness(dir, { env: await env(), ...options });
}

function cli(args: readonly string[], extraEnv: Record<string, string | undefined> = {}): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync([process.execPath, "--no-env-file", HARNESS, ...args], { env: { ...process.env, ...extraEnv }, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

const range = (n: number, make: (i: number) => string): string[] => Array.from({ length: n }, (_, i) => make(i));
const pad = (i: number): string => String(i).padStart(3, "0");

// ---------------------------------------------------------------------------
// XT-conformance-106

test("XT-conformance-106: bun run harness --fast prints the seed it used and samples deterministically from it (FR-9)", async () => {
  // 150 Test IDs, none ported: nothing is spawned, every sampled line is missing, and skip lines match it.
  const ids = range(150, (i) => s(`test${pad(i)}`));
  const dir = makeRoot(ids.map((id) => ({ id, status: "skip" })));
  const fast = await harness(dir, { fast: true });
  expect(fast.out[0]).toMatch(/^FAST seed=[0-9a-f]{8} sample=100\/150$/);
  const seed = /seed=([0-9a-f]{8})/.exec(fast.out[0]!)![1]!;
  expect(fast.sample).toEqual({ seed, size: FAST_SAMPLE, of: 150 });
  expect(fast.out.at(-1)).toBe(`SUMMARY variants=1 run=1 not-run=0 checked=100 differ=0 mode=fast seed=${seed}`);
  expect(fast.code).toBe(0);
  expect(fast.results.map((result) => result.id)).toEqual(sampleIds(ids, seed, FAST_SAMPLE));
  expect(fast.results.every((result) => result.outcome === "missing")).toBe(true);

  // The printed seed reproduces the sample.
  const again = await harness(dir, { seed });
  expect(again.out).toEqual(fast.out);
  expect(again.results).toEqual(fast.results);

  // The sample depends only on the seed and the selected set: not on order, and stable when unrelated IDs are added.
  const sample = sampleIds(ids, "abc", FAST_SAMPLE);
  expect(sample).toHaveLength(100);
  expect(sampleIds([...ids].reverse(), "abc", FAST_SAMPLE)).toEqual(sample);
  expect(sampleIds(ids, "abd", FAST_SAMPLE)).not.toEqual(sample);
  const grown = sampleIds([...ids, ...range(50, (i) => c(`test${pad(i)}`))], "abc", 1000);
  const ranked = sampleIds(ids, "abc", 150);
  expect(grown.filter((id) => ids.includes(id))).toEqual(ranked);

  // Fewer than 100 selected: all of them.
  const small = makeRoot([s("testA"), s("testB"), s("testC")].map((id) => ({ id, status: "skip" })));
  const smallRun = await harness(small, { seed: "x" });
  expect(smallRun.out[0]).toBe("FAST seed=x sample=3/3");
  expect(smallRun.out.at(-1)).toBe("SUMMARY variants=1 run=1 not-run=0 checked=3 differ=0 mode=fast seed=x");

  // With Ported Tests, only the sampled tests run (bun -t): every sampled pass line passes, and the rest never report.
  const runIds = range(120, (i) => s(`test${pad(i)}`));
  const unknown = s("testNotInExpectations");
  const spawned = makeRoot(runIds.map((id) => ({ id })), { [FILES.support.test]: ported([...runIds, unknown]) });
  const sampled = await harness(spawned, { seed: "demo" });
  expect(sampled.out).toEqual(["FAST seed=demo sample=100/120", "SUMMARY variants=1 run=1 not-run=0 checked=100 differ=0 mode=fast seed=demo"]);
  expect(sampled.results.map((result) => result.id)).toEqual(sampleIds(runIds, "demo", FAST_SAMPLE));
  expect(sampled.results.every((result) => result.outcome === "pass")).toBe(true);

  // The CLI prints the seed first.
  const printed = cli(["--root", small, "--fast"], await env());
  expect(printed.code).toBe(0);
  expect(printed.stdout).toMatch(/^FAST seed=[0-9a-f]{8} sample=3\/3\n/);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-107

test("XT-conformance-107: --seed <s> run twice on the same tree runs the same sample, and malformed options are usage errors (FR-9)", async () => {
  const ids = range(150, (i) => s(`test${pad(i)}`));
  const passing = new Set(ids.filter((_, i) => i % 3 === 0));
  // Tests that pass where the line says skip make differences, so the output depends on which IDs were sampled.
  const dir = makeRoot(
    ids.map((id) => ({ id, status: passing.has(id) ? "skip" : "pass" })),
    { [FILES.support.test]: ported(ids) },
  );
  const environment = await env();
  const first = cli(["--root", dir, "--seed", "abc"], environment);
  const second = cli(["--root", dir, "--seed", "abc"], environment);
  expect(first.stdout).toBe(second.stdout);
  expect(first.code).toBe(second.code);
  const lines = first.stdout.trimEnd().split("\n");
  expect(lines[0]).toBe("FAST seed=abc sample=100/150");
  const expected = sampleIds(ids, "abc", FAST_SAMPLE).filter((id) => passing.has(id));
  expect(expected.length).toBeGreaterThan(0);
  expect(lines.slice(1, -1)).toEqual(expected.map((id) => `UNEXPECTED-PASS ${id} [none] expected=skip:not-ported-yet actual=pass asserts=1/1`));
  expect(lines.at(-1)).toBe(`SUMMARY variants=1 run=1 not-run=0 checked=100 differ=${expected.length} mode=fast seed=abc`);
  expect(first.code).toBe(1);
  // Another seed draws another sample.
  expect(cli(["--root", dir, "--seed", "abd"], environment).stdout).not.toBe(first.stdout);

  // --seed implies --fast; repeated filters accumulate.
  expect(parseArgs(["--seed", "a.b-C_9"]).options).toMatchObject({ fast: true, seed: "a.b-C_9" });
  expect(parseArgs(["--component", "a", "--component", "b", "--id", "x*", "--id", "y?", "--story", "5.4"]).options).toMatchObject({ fast: false, seed: null, components: ["a", "b"], ids: ["x*", "y?"], story: "5.4" });

  // Usage errors exit 2.
  for (const args of [["--seed"], ["--seed", "a b"], ["--seed", "x".repeat(65)], ["--seed", ""], ["--seed", "a", "--seed", "b"], ["--story", "5.3", "--story", "5.4"], ["--story", "../x"], ["--story", "5.4a"], ["--component"], ["--id", "--fast"], ["--bogus"]]) {
    const usage = cli(args);
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain("Usage:");
    expect(usage.stdout).toBe("");
  }
  expect(cli(["--story", "../x"]).stderr).toContain("--story must be a Story ID of the form <epic>.<story>");
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-108

test("XT-conformance-108: --component, --id and --story run only the matching Test IDs, and --story reads the manifest's test_ids (FR-9)", async () => {
  const seenDir = mkdtempSync(join(tmpdir(), "xt-select-seen-"));
  roots.push(seenDir);
  const seen = join(seenDir, "seen");
  const unknown = s("testUnknown");
  const lines: Line[] = [
    { id: s("testA") },
    { id: s("testB") },
    { id: s("testC"), variant: "sqlite" },
    { id: c("testA"), component: "collections" },
    { id: c("testB"), component: "collections", variant: "pgsql" },
  ];
  const files = {
    [FILES.support.test]: ported([s("testA"), s("testB"), s("testC"), unknown], seen),
    [FILES.collections.test]: ported([c("testA"), c("testB")], seen),
  };
  const dir = makeRoot(lines, files);
  /** The Ported Test files loaded since the last call, as their repo-relative suffix. */
  const loaded = (): string[] => {
    let text = "";
    try {
      text = readFileSync(seen, "utf8");
    } catch {
      // nothing loaded
    }
    rmSync(seen, { force: true });
    const all = Object.values(FILES).map((paths) => paths.test as string);
    return text
      .split("\n")
      .filter((line) => line !== "")
      .map((path) => all.find((file) => path.endsWith(file)) ?? path);
  };

  // --component support: only support's lines and file, on its Variants only (no pgsql NOT-RUN). Every support line
  // is selected, so there is no -t and the unknown report shows.
  const support = await harness(dir, { components: ["support"] });
  expect(support.out).toEqual([
    `UNKNOWN ${unknown} [none] expected=- actual=pass asserts=1/-`,
    `UNKNOWN ${unknown} [sqlite] expected=- actual=pass asserts=1/-`,
    "SUMMARY variants=2 run=2 not-run=0 checked=3 differ=2",
  ]);
  expect(support.sample).toBeNull();
  expect(loaded()).toEqual([FILES.support.test, FILES.support.test]);
  expect(support.results.map((result) => `${result.id} ${result.variant}`)).toEqual([`${s("testA")} none`, `${s("testB")} none`, `${s("testC")} sqlite`]);

  // A union of Components.
  const both = await harness(dir, { components: ["support", "collections"] });
  expect(both.out.at(-1)).toBe("SUMMARY variants=3 run=2 not-run=1 checked=4 differ=2");
  expect(loaded().sort()).toEqual([FILES.collections.test, FILES.support.test, FILES.support.test].sort());

  // --id: a whole-ID glob; a subset of support's lines gets -t, so the unknown test is filtered out.
  const glob = await harness(dir, { ids: [`${SUPPORT}::testA`] });
  expect(glob.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
  expect(glob.results.map((result) => [result.id, result.outcome])).toEqual([[s("testA"), "pass"]]);
  expect(loaded()).toEqual([FILES.support.test]);
  const globs = await harness(dir, { ids: ["*::testA", `${COLLECTIONS}::test?`] });
  // c(testB) is selected too, but its pgsql Variant is NOT-RUN.
  expect(globs.results.map((result) => result.id)).toEqual([c("testA"), s("testA")]);
  expect(globs.out[0]).toStartWith("NOT-RUN [pgsql] 1 line(s): ");
  expect(globs.out.at(-1)).toBe("SUMMARY variants=2 run=1 not-run=1 checked=2 differ=0");
  loaded();
  // Different filters intersect.
  const crossed = await harness(dir, { components: ["collections"], ids: ["*::testA"] });
  expect(crossed.results.map((result) => result.id)).toEqual([c("testA")]);
  loaded();

  // The glob grammar: * and ? only; \ and regex syntax are literal; it matches whole IDs.
  expect(globToRegExp("X\\T::test*").test("X\\T::testA")).toBe(true);
  expect(globToRegExp("X\\T::test*").test("X\\Tz::testA")).toBe(false);
  expect(globToRegExp("X\\T::test?").test("X\\T::testAB")).toBe(false);
  expect(globToRegExp("X\\T::test?").test("X\\T::testA")).toBe(true);
  expect(globToRegExp("a.b").test("axb")).toBe(false);
  expect(globToRegExp("t#(1)[x]").test("t#(1)[x]")).toBe(true);
  expect(globToRegExp("testA").test("testAB")).toBe(false);
  const universe = new Map([
    ["X\\T::testA", "support"],
    ["X\\Tz::testA", "support"],
    ["Y\\T::testA", "collections"],
  ]);
  expect(selectIds(universe, { components: [], ids: ["X\\T::test*"], story: null })).toEqual(["X\\T::testA"]);
  expect(selectIds(universe, { components: ["collections", "support"], ids: [], story: ["X\\Tz::testA", "Y\\T::testA"] })).toEqual(["X\\Tz::testA", "Y\\T::testA"]);
  // The -t pattern matches exactly its IDs.
  const pattern = new RegExp(namePattern(["X\\T::test(a)#x.y", "Z::b"]));
  expect(pattern.test("X\\T::test(a)#x.y")).toBe(true);
  expect(pattern.test("X\\T::test(a)#xzy")).toBe(false);
  expect(pattern.test("Z::bc")).toBe(false);

  // --story: the manifest's test_ids; a listed ID with no Expectations line is one stderr diagnostic.
  const manifest = (ids: readonly string[]): string => `---\nstory_id: "9.9"\nepic: 9\ncomponent: support\nstatus: in-progress\ntitle: "x"\ntest_ids:\n${ids.map((id) => `  - ${JSON.stringify(id)}`).join("\n")}\nxaravel_test_ids: []\n---\n\n# Story 9.9\n`;
  const withStory = makeRoot(lines, { ...files, "stories/9.9.md": manifest([s("testA"), s("testZ")]) });
  const story = await harness(withStory, { story: "9.9" });
  expect(story.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
  expect(story.results.map((result) => result.id)).toEqual([s("testA")]);
  expect(story.err.filter((line) => line.includes("no Expectations line"))).toEqual([`harness: stories/9.9.md lists 1 Test ID(s) with no Expectations line: ${s("testZ")}`]);
  loaded();
  // A missing or invalid manifest fails a precondition.
  const missing = await harness(dir, { story: "9.9" });
  expect(missing.code).toBe(1);
  expect(missing.out).toEqual([]);
  expect(missing.err.join("\n")).toContain("stories/9.9.md does not exist");
  const invalid = makeRoot(lines, { "stories/9.9.md": "---\nstory_id: \"9.8\"\n---\n" });
  const bad = await harness(invalid, { story: "9.9" });
  expect(bad.code).toBe(1);
  expect(bad.err.join("\n")).toContain("invalid manifest: stories/9.9.md");
  // A manifest with no test_ids (only Xaravel Tests) names that, not an empty selection.
  const noIds = makeRoot(lines, { "stories/9.9.md": manifest([]).replace("xaravel_test_ids: []", "xaravel_test_ids: [XT-support-1]").replace("test_ids:\n\n", "test_ids: []\n") });
  const empty = await harness(noIds, { story: "9.9" });
  expect(empty.code).toBe(1);
  expect(empty.err).toEqual(["harness: stories/9.9.md lists no test_ids"]);
  // The unknown-ID diagnostic shows the count and at most the first 10.
  const many = range(12, (i) => s(`testMissing${pad(i)}`));
  const manyRoot = makeRoot(lines, { "stories/9.9.md": manifest([s("testA"), ...many]) });
  const manyRun = await harness(manyRoot, { story: "9.9" });
  expect(manyRun.err.filter((line) => line.includes("no Expectations line"))).toEqual([`harness: stories/9.9.md lists 12 Test ID(s) with no Expectations line: ${many.slice(0, 10).join(", ")}, …`]);

  // An empty selection fails a precondition, naming the filters.
  const none = cli(["--root", dir, "--component", "nope"], await env());
  expect(none.code).toBe(1);
  expect(none.stdout).toBe("");
  expect(none.stderr).toContain("harness: no Test ID matches --component nope");
  const disjoint = await harness(withStory, { components: ["collections"], story: "9.9" });
  expect(disjoint.code).toBe(1);
  expect(disjoint.err).toContain("harness: no Test ID matches --component collections --story 9.9");

  // Selected IDs that no Ported Test declares: bun's -t matches 0 tests, the run is empty, and every line is missing.
  const zeroLines: Line[] = [{ id: s("testA") }, { id: s("testGhost"), status: "skip" }, { id: s("testGhost2"), status: "skip" }];
  const zero = makeRoot(zeroLines, { [FILES.support.test]: ported([s("testA")]) });
  const ghost = await harness(zero, { ids: ["*Ghost*"] });
  expect(ghost.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=2 differ=0"]);
  expect(ghost.results.map((result) => result.outcome)).toEqual(["missing", "missing"]);
  expect(ghost.code).toBe(0);

  // A partial selection whose -t pattern would exceed MAX_PATTERN runs without -t: the whole file runs, and only the
  // selected lines are checked.
  const long = range(400, (i) => s(`testLong${pad(i)}_${"x".repeat(200)}`));
  const unselected = s("testShort");
  expect(namePattern(long).length).toBeGreaterThan(MAX_PATTERN);
  const longRoot = makeRoot([...long, unselected].map((id) => ({ id })), { [FILES.support.test]: ported([...long, unselected]) });
  const longRun = await harness(longRoot, { ids: ["*::testLong*"] });
  expect(longRun.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=400 differ=0"]);
  expect(longRun.code).toBe(0);
  expect(longRun.results).toHaveLength(400);
  expect(longRun.results.every((result) => result.outcome === "pass")).toBe(true);
  expect(longRun.results.some((result) => result.id === unselected)).toBe(false);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-109

test("XT-conformance-109: a fast run says in its report that it is a sample, and its SUMMARY never counts as a full run for the done check (FR-9)", async () => {
  const dir = makeRoot([s("testA"), s("testB"), c("testA")].map((id, i) => ({ id, status: "skip", component: i === 2 ? "collections" : "support" })));
  const fast = await harness(dir, { seed: "s1", components: ["support"] });
  expect(fast.out).toEqual(["FAST seed=s1 sample=2/2", "SUMMARY variants=1 run=1 not-run=0 checked=2 differ=0 mode=fast seed=s1"]);
  expect(fast.sample).toEqual({ seed: "s1", size: 2, of: 2 });
  expect(isFullRun(fast.out.at(-1)!)).toBe(false);

  // A full run, and a filtered run, are full: their SUMMARY is 5.3's, and sample is null.
  const full = await harness(dir);
  expect(full.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=3 differ=0"]);
  expect(full.sample).toBeNull();
  expect(isFullRun(full.out.at(-1)!)).toBe(true);
  const filtered = await harness(dir, { components: ["collections"] });
  expect(filtered.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
  expect(filtered.sample).toBeNull();
  expect(isFullRun(filtered.out.at(-1)!)).toBe(true);
  expect(isFullRun("FAST seed=s1 sample=2/2")).toBe(false);
  expect(isFullRun("NOT-RUN [pgsql] 1 line(s): down")).toBe(false);

  // The docs bind Story 5.9's done check to isFullRun.
  const docs = readFileSync(join(root, "docs", "ops", "harness.md"), "utf8");
  expect(docs).toContain("isFullRun");
  expect(docs).toMatch(/Story 5\.9[^\n]*isFullRun/);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-186

test("XT-conformance-186: under the harness, a Ported Test sees globalThis[Symbol.for('xaravel.api.signature')] return the committed api-surface row, or null (ESC-4.8-1 item 1)", async () => {
  const row = { fqcn: "A\\B", kind: "method", member: "m", static: false, parameters: [{ name: "x", type: "int", nullable: false, default: null, optional: false, variadic: false, byRef: false }], returns: "?string", nullable: true };
  const surface = [
    JSON.stringify({ fqcn: "A\\B", kind: "class", member: null, stubbed: [] }),
    JSON.stringify(row),
    JSON.stringify({ fqcn: "A\\B", kind: "property", member: "p" }),
  ].join("\n");
  const body = [
    `const SIGNATURE = Symbol.for("xaravel.api.signature");`,
    `portedTest(${JSON.stringify(s("testA"))}, {}, () => {`,
    `  const lookup = (globalThis as any)[SIGNATURE];`,
    `  const descriptor = Object.getOwnPropertyDescriptor(globalThis, SIGNATURE)!;`,
    `  Assert.assertFalse(descriptor.writable);`,
    `  Assert.assertFalse(descriptor.enumerable);`,
    `  Assert.assertTrue(descriptor.configurable);`,
    `  const found = lookup("A\\\\B", "m");`,
    `  Assert.assertSame("?string", found.returns);`,
    `  Assert.assertTrue(found.nullable);`,
    `  Assert.assertSame("x", found.parameters[0].name);`,
    `  Assert.assertTrue(Object.isFrozen(found) && Object.isFrozen(found.parameters) && Object.isFrozen(found.parameters[0]));`,
    `  Assert.assertSame(found, lookup("A\\\\B", "m"));`,
    `  Assert.assertNull(lookup("A\\\\B", "nope"));`,
    `  Assert.assertNull(lookup("A\\\\B", "p"));`,
    `  Assert.assertNull(lookup("a\\\\b", "m"));`,
    `  Assert.assertNull(lookup(1, "m"));`,
    // The harness points the lookup at this root's api-surface, not the repo's.
    `  Assert.assertNull(lookup("Illuminate\\\\Support\\\\Arr", "__call"));`,
    `});`,
  ].join("\n");
  const dir = makeRoot([{ id: s("testA") }], {
    [FILES.support.test]: `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\n${body}\n`,
    "conformance/api-surface/support.jsonl": `${surface}\n`,
  });
  const result = await harness(dir);
  expect(result.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
  expect(result.results.map((r) => r.outcome)).toEqual(["pass"]);

  // signatureLookup directly: the row, deep-frozen, the same object each call; null otherwise.
  const lookup = signatureLookup(join(dir, "conformance", "api-surface"));
  const found = lookup("A\\B", "m");
  expect(found).toEqual(row as never);
  expect(Object.isFrozen(found) && Object.isFrozen(found!.parameters[0])).toBe(true);
  expect(lookup("A\\B", "m")).toBe(found);
  expect(lookup("A\\B", "nope")).toBeNull();
  expect(lookup(null, "m")).toBeNull();
  expect(signatureLookup(join(dir, "no-such-dir"))("A\\B", "m")).toBeNull();
  // A malformed line throws, naming file:line.
  const broken = join(dir, "conformance", "broken-surface");
  mkdirSync(broken);
  writeFileSync(join(broken, "x.jsonl"), `${JSON.stringify(row)}\n{not json\n`);
  expect(() => signatureLookup(broken)("A\\B", "m")).toThrow(`${join(broken, "x.jsonl")}:2: malformed api-surface line`);

  // The committed api-surface.
  const real = signatureLookup(join(root, "conformance", "api-surface"))("Illuminate\\Support\\Arr", "__call");
  expect(real?.parameters).toHaveLength(2);

  // Without XARAVEL_API_SURFACE the preload reads its sibling ../api-surface (the repo's).
  const probe = mkdtempSync(join(tmpdir(), "xt-select-preload-"));
  roots.push(probe);
  writeFileSync(join(probe, "bunfig.toml"), "env = false\n");
  writeFileSync(
    join(probe, "probe.test.ts"),
    `import { expect, test } from "bun:test";\ntest("probe", () => { const row = (globalThis as any)[Symbol.for("xaravel.api.signature")]("Illuminate\\\\Support\\\\Arr", "__call"); expect(row.parameters.length).toBe(2); });\n`,
  );
  const environment: Record<string, string | undefined> = { ...process.env };
  delete environment["XARAVEL_API_SURFACE"];
  const spawned = Bun.spawnSync([process.execPath, "--no-env-file", "test", "--preload", PRELOAD, join(probe, "probe.test.ts")], { cwd: probe, env: environment, stdout: "pipe", stderr: "pipe" });
  expect(spawned.stderr.toString()).toContain("1 pass");
  expect(spawned.exitCode).toBe(0);
}, 60_000);
