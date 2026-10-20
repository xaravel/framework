// Xaravel Tests for Story 8.1 (Divergence Records DIV-1 to DIV-12, and the
// `adapted` marker check; FR-8, FR-113, AD-15, ESC-5.3-2). Fixture roots are
// hermetic temp directories holding twelve minimal records, an Expectations
// shard and a Ported Test; the real repository is only read, never written.
import { afterAll, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseFrontmatter } from "../../../tools/boost-framework/src/data";
import { divergenceClauses } from "../../../tools/boost-framework/src/tools";
import { checkDivergence } from "../../../tools/divergence/divergence";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "divergence", "divergence.ts");
const PRD = "_bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md";
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixture

/** A minimal valid record with `clauses` clauses. */
function record(n: number, clauses = 2, fields: Record<string, string> = {}): string {
  const front = { div: String(n), title: `"Title ${n}"`, cites: "[]", sources: "[]", fewer_assertions: "[]", ...fields };
  const items = Array.from({ length: clauses }, (_, i) => `- **DIV-${n}.${i + 1}** Clause ${i + 1}.`).join("\n");
  return `---\n${Object.entries(front).map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n\n# DIV-${n}: Title ${n}\n\n## Rationale\n\nWhy.\n\n## Behaviour\n\nWhat.\n\n## Adaptation clauses\n\n${items}\n`;
}

/** A fixture root with twelve minimal records, overridden or removed (`null`) by `files`. */
function fixture(files: Record<string, string | null> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-divergence-"));
  roots.push(dir);
  const all: Record<string, string | null> = {};
  for (let n = 1; n <= 12; n++) {
    all[`decisions/DIV-${n}.md`] = record(n);
  }
  Object.assign(all, files);
  for (const [path, content] of Object.entries(all)) {
    if (content === null) {
      continue;
    }
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync([process.execPath, CLI, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

const SHARD = "conformance/expectations/support/framework/tests/Support/SupportStrTest.jsonl";
const PORTED = "packages/x/tests/ported/A.test.ts";
const ID = "Illuminate\\Tests\\Support\\SupportStrTest::testA";

function shard(...adapted: unknown[]): string {
  return adapted.map((value) => `${JSON.stringify({ id: ID, variant: "none", status: "pass", reason: null, adapted: value, escalation: null })}\n`).join("");
}

function skipLine(adapted: string): string {
  return `${JSON.stringify({ id: ID, variant: "none", status: "skip", reason: "not-ported-yet", adapted, escalation: null })}\n`;
}

// ---------------------------------------------------------------------------
// The real records

const EXPECTED_CITES: Record<number, string[]> = {
  1: ["AD-6"],
  2: ["AD-8"],
  3: ["AD-4"],
  4: ["AD-14"],
  5: [],
  6: [],
  7: [],
  8: [],
  9: ["AD-9"],
  10: [],
  11: ["AD-5", "AD-25", "AD-13"],
  12: ["AD-26"],
};

interface RealRecord {
  fields: Record<string, unknown>;
  clauses: { id: string; text: string }[];
}

function realRecord(n: number): RealRecord {
  const parsed = parseFrontmatter(readFileSync(join(root, "decisions", `DIV-${n}.md`), "utf8"));
  if (parsed === null || typeof parsed === "string") {
    throw new Error(`DIV-${n}: bad frontmatter: ${String(parsed)}`);
  }
  return { fields: parsed.fields, clauses: divergenceClauses(String(n), parsed.body) };
}

/** The PRD §5.2 bold titles: `**DIV-<n> <Title>.**`. */
function prdTitles(): Map<number, string> {
  const titles = new Map<number, string>();
  for (const match of readFileSync(join(root, PRD), "utf8").matchAll(/\*\*DIV-([1-9]\d*) ([^*]+?)\.\*\*/g)) {
    titles.set(Number(match[1]), match[2]!);
  }
  return titles;
}

// ---------------------------------------------------------------------------
// XT-conformance-149

xaravelTest("XT-conformance-149", "decisions/DIV-1.md to DIV-12.md exist with PRD titles, AD cites, numbered adaptation clauses, the ESC-owed clauses and empty fewer_assertions; malformed records fail (FR-8.3, FR-113.2)", () => {
  const report = checkDivergence(root);
  expect(report.violations).toEqual([]);
  expect(report.records).toBe(12);

  const titles = prdTitles();
  const owed: Record<6 | 9, string[]> = { 6: [], 9: [] };
  for (let n = 1; n <= 12; n++) {
    const { fields, clauses } = realRecord(n);
    expect(fields["div"]).toBe(n);
    expect(titles.get(n)).toBeDefined();
    expect(fields["title"]).toBe(titles.get(n)!);
    expect(fields["cites"]).toEqual(EXPECTED_CITES[n]!);
    expect(Array.isArray(fields["sources"])).toBe(true);
    for (const source of fields["sources"] as string[]) {
      expect(source).toMatch(/^decisions\/ESC-[\d.-]+\.md$/);
      expect(existsSync(join(root, source))).toBe(true);
    }
    expect(fields["fewer_assertions"]).toEqual([]);
    expect(clauses.map((clause) => clause.id)).toEqual(clauses.map((_, i) => `DIV-${n}.${i + 1}`));
    if (n === 6 || n === 9) {
      owed[n].push(...clauses.map((clause) => clause.text));
    }
  }
  for (const phrase of ["alias:", "overload:", "visibility", "test doubles", "Double", "closure equality", "ExceptionComparator", "trace", "stack frames"]) {
    expect([...owed[6], ...owed[9]].some((text) => text.includes(phrase))).toBe(true);
  }
  // The ESC-owed clauses cite their rulings, each in the record it belongs to.
  for (const ruling of ["ESC-4.6-1 item 3", "ESC-4.6-1 item 4", "ESC-4.7-1 item 2", "ESC-4.8-1 item 3"]) {
    expect(owed[6].some((text) => text.includes(ruling))).toBe(true);
  }
  for (const ruling of ["ESC-4.3-1 item 9", "ESC-4.3-1 item 10", "ESC-4.3-1 item 13", "ESC-4.4-2 item 3", "ESC-4.7-1 item 3"]) {
    expect(owed[9].some((text) => text.includes(ruling))).toBe(true);
  }

  // Fixtures: a valid root passes; each malformed record fails with exit 1.
  expect(run(["check", "--root", fixture()]).code).toBe(0);
  const failing: [Record<string, string | null>, string][] = [
    [{ "decisions/DIV-3.md": record(3).replace("## Behaviour\n", "") }, "decisions/DIV-3.md: missing section ## Behaviour"],
    [{ "decisions/DIV-3.md": record(3).replace("## Rationale\n", "") }, "decisions/DIV-3.md: missing section ## Rationale"],
    [{ "decisions/DIV-3.md": record(3).replace("## Adaptation clauses\n", "") }, "decisions/DIV-3.md: missing section ## Adaptation clauses"],
    [{ "decisions/DIV-3.md": record(3, 3).replace("DIV-3.2**", "DIV-3.4**") }, "decisions/DIV-3.md: clauses must be numbered 1..3 in order"],
    [{ "decisions/DIV-3.md": record(3, 3).replace("DIV-3.3**", "DIV-3.2**") }, "decisions/DIV-3.md: duplicate clause DIV-3.2"],
    [{ "decisions/DIV-3.md": record(3, 0) }, "decisions/DIV-3.md: no adaptation clause"],
    [{ "decisions/DIV-3.md": record(3, 2, { div: "4" }) }, "decisions/DIV-3.md: div must be 3"],
    [{ "decisions/DIV-3.md": record(3, 2, { title: "[unclosed" }) }, "decisions/DIV-3.md: frontmatter is not valid YAML"],
    [{ "decisions/DIV-3.md": record(3, 2, { sources: '["decisions/ESC-9.9-9.md"]' }) }, "decisions/DIV-3.md: sources item"],
    [{ "decisions/DIV-7.md": null }, "decisions/DIV-7.md: missing Divergence Record"],
    [{ "decisions/DIV-13.md": record(13) }, "decisions/DIV-13.md: not a Divergence Record name (DIV-1..DIV-12)"],
    [{ "decisions/DIV-02.md": record(2) }, "decisions/DIV-02.md: not a Divergence Record name (DIV-1..DIV-12)"],
    // Lower case: `div-13.md`, not `div-5.md`, which a case-insensitive file system would write over DIV-5.md.
    [{ "decisions/div-13.md": record(13) }, "decisions/div-13.md: not a Divergence Record name (DIV-1..DIV-12)"],
    [{ "decisions/DIV-2.md": record(2, 2, { fewer_assertions: "[2]" }) }, 'decisions/DIV-2.md: fewer_assertions item 2 must be a quoted string'],
    [{ "decisions/DIV-2.md": record(2, 2, { fewer_assertions: '["9"]' }) }, 'decisions/DIV-2.md: fewer_assertions item "9" names no clause'],
    [{ "decisions/DIV-2.md": record(2, 2, { fewer_assertions: '"2"' }) }, "decisions/DIV-2.md: fewer_assertions must be a list"],
  ];
  for (const [files, expected] of failing) {
    const result = run(["check", "--root", fixture(files)]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(expected);
  }
  // A quoted item naming an existing clause is valid (it is the waiver ESC-5.3-2 defines).
  expect(run(["check", "--root", fixture({ "decisions/DIV-2.md": record(2, 2, { fewer_assertions: '["2"]' }) })]).code).toBe(0);
});

// ---------------------------------------------------------------------------
// XT-conformance-150

xaravelTest("XT-conformance-150", "DIV-11 has the clause 'no pcntl; job timeouts are enforced by the supervisor process', citing AD-13 (FR-8.3)", () => {
  const { fields, clauses } = realRecord(11);
  const timeout = clauses.filter((clause) => clause.text.includes("no pcntl; job timeouts are enforced by the supervisor process"));
  expect(timeout.length).toBe(1);
  expect(timeout[0]!.text).toContain("AD-13");
  expect(timeout[0]!.text).toContain(`adapted:${timeout[0]!.id}`);
  expect(fields["cites"]).toContain("AD-13");
});

// ---------------------------------------------------------------------------
// XT-conformance-151

xaravelTest("XT-conformance-151", "DIV-12's clauses cover collection.get(0), setFillable, isTouching and no dynamic wheres or finders (FR-8.3)", () => {
  const { clauses } = realRecord(12);
  for (const phrase of ["collection.get(0)", "setFillable", "isTouching", "whereEmail()", "where('email', v)"]) {
    expect(clauses.some((clause) => clause.text.includes(phrase))).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-152

xaravelTest("XT-conformance-152", "an adapted:DIV-<n>.<k> marker in an Expectations entry or on a Ported Test assertion line must name an existing clause (AD-15.1, AD-15.2)", () => {
  const cases: [Record<string, string | null>, number, string][] = [
    [{ [SHARD]: shard("DIV-3.9") }, 1, `${SHARD}:1: ${ID} × none: adapted DIV-3.9: clause does not exist`],
    [{ [SHARD]: shard(null, "DIV-6") }, 1, `${SHARD}:2: ${ID} × none: adapted DIV-6: not DIV-<n>.<k>`],
    [{ [SHARD]: shard("DIV-3.x") }, 1, "adapted DIV-3.x: not DIV-<n>.<k>"],
    [{ [SHARD]: shard("DIV-3.0") }, 1, "adapted DIV-3.0: not DIV-<n>.<k>"],
    [{ [SHARD]: shard("DIV-13.1") }, 1, "adapted DIV-13.1: clause does not exist"],
    [{ [SHARD]: shard(3) }, 1, "adapted 3: not DIV-<n>.<k>"],
    [{ [SHARD]: "{not json\n" }, 1, "(run bun run expectations:check)"],
    [{ [PORTED]: "assertSame(1, x); // adapted:DIV-12.99\n" }, 1, `${PORTED}:1: adapted:DIV-12.99: clause does not exist`],
    [{ [PORTED]: "\n  assertSame(1, x); // adapted:DIV-12\n" }, 1, `${PORTED}:2: adapted:DIV-12: not DIV-<n>.<k>`],
    [{ [SHARD]: skipLine("DIV-3.1") }, 1, `${SHARD}:1: ${ID} × none: adapted DIV-3.1: only a pass line may carry adapted`],
    // A blank after the colon still counts as a marker.
    [{ [PORTED]: "assertSame(1, x); // adapted: DIV-99.1\n" }, 1, `${PORTED}:1: adapted:DIV-99.1: clause does not exist`],
    [{ [PORTED]: "assertSame(1, x); // adapted:\n" }, 1, `${PORTED}:1: adapted:: not DIV-<n>.<k>`],
    // A block comment counts, and its closing `*/` is not part of the token.
    [{ [PORTED]: "assertSame(1, x); /* adapted:DIV-99.1 */\n" }, 1, `${PORTED}:1: adapted:DIV-99.1: clause does not exist`],
    [{ [PORTED]: "assertSame(1, x); /* adapted:DIV-99.1*/\n" }, 1, `${PORTED}:1: adapted:DIV-99.1: clause does not exist`],
    // Every marker on a line is checked, not only the first.
    [{ [PORTED]: "assertSame(1, x); // adapted:DIV-12.1 adapted:DIV-12.99\n" }, 1, `${PORTED}:1: adapted:DIV-12.99: clause does not exist`],
  ];
  for (const [files, code, expected] of cases) {
    const result = run(["check", "--root", fixture(files)]);
    expect(result.code).toBe(code);
    expect(result.stderr).toContain(expected);
  }

  const ok = run(["check", "--root", fixture({ [SHARD]: shard("DIV-3.2", null, "DIV-12.1"), [PORTED]: "assertSame(1, x); // adapted:DIV-12.1\nassertSame(2, y); /* adapted: DIV-3.2 */\nconst adapted = 'adapted:DIV-99.1';\n" })]);
  expect(ok.stderr).toBe("");
  expect(ok.code).toBe(0);
  expect(ok.stdout).toBe("Divergence OK: 12 record(s), 24 clause(s); 2 Expectations marker(s), 2 assertion marker(s) checked.\n");

  for (const args of [["check", "--bogus"], ["check", "--root"], ["frobnicate"], []]) {
    const usage = run(args);
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain("Usage: bun tools/divergence/divergence.ts check [--root <dir>]");
  }

  const real = run(["check"]);
  expect(real.code).toBe(0);
  expect(real.stdout).toMatch(/^Divergence OK: 12 record\(s\), \d+ clause\(s\); \d+ Expectations marker\(s\), \d+ assertion marker\(s\) checked\.\n$/);
  const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  const job = /\n {2}check:\n((?: {4}.*\n|\n)*)/.exec(ci);
  expect(job).not.toBeNull();
  expect(job![1]!).toMatch(/- name: Check the Divergence Records and adapted markers\n\s+run: bun run divergence:check\n/);
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["divergence:check"]).toBe("bun --no-env-file tools/divergence/divergence.ts check");
});
