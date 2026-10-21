// Xaravel Tests for Story 8.1 (Divergence Records DIV-1 to DIV-12, and the
// `adapted` marker check; FR-8, FR-113, AD-15, ESC-5.3-2). Fixture roots are
// hermetic temp directories holding twelve minimal records, an Expectations
// shard and a Ported Test; the real repository is only read, never written.
// XT-conformance-149 reads each record's expected AD cites from the architecture
// spine's `Binds:` lines, so a spine edit can fail it (Epic 8 retro item 6).
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
const SPINE = "_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md";
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

/** What one spine AD section says about the DIVs: the ones its `Binds:` line binds, and every one its text names. */
interface AdSection {
  hasBinds: boolean;
  binds: Set<number>;
  names: Set<number>;
}

/** DIV numbers in `text` (`DIV-11` is 11, never 1; `DIV-11.3` is 11). */
function divNumbers(text: string): Set<number> {
  return new Set([...text.matchAll(/\bDIV-([1-9]\d*)(?!\d)/g)].map((match) => Number(match[1])));
}

/** Parses the spine's `### AD-<n>` sections, each ending at the next `### ` or `## ` heading; throws on a duplicate AD heading or a DIV range in a Binds line. */
function spineBindings(spine: string): Map<string, AdSection> {
  const sections = new Map<string, AdSection>();
  const headings = [...spine.matchAll(/^#{2,3} .*$/gm)];
  headings.forEach((heading, i) => {
    const ad = /^### (AD-[1-9]\d*) /.exec(heading[0]);
    if (ad === null) {
      return;
    }
    if (sections.has(ad[1]!)) {
      throw new Error(`spine: duplicate heading ${ad[1]}`);
    }
    const end = i + 1 < headings.length ? headings[i + 1]!.index : spine.length;
    const text = spine.slice(heading.index, end);
    const binds = /^- \*\*Binds:\*\* (.*)$/m.exec(text);
    if (binds !== null && /DIV-\d+\.\./.test(binds[1]!)) {
      throw new Error(`spine: ${ad[1]} Binds line has a DIV range: ${binds[1]}`);
    }
    sections.set(ad[1]!, { hasBinds: binds !== null, binds: divNumbers(binds?.[1] ?? ""), names: divNumbers(text) });
  });
  return sections;
}

/** Why DIV-`n`'s `cites` disagrees with the spine: an AD binding it is missing, a cite whose AD section never names it, or a duplicate. */
function citeProblems(n: number, cites: string[], bindings: Map<string, AdSection>): string[] {
  const problems: string[] = [];
  for (const [ad, section] of bindings) {
    if (section.binds.has(n) && !cites.includes(ad)) {
      problems.push(`DIV-${n}: missing ${ad}, whose Binds line binds DIV-${n}`);
    }
  }
  const seen = new Set<string>();
  for (const cite of cites) {
    if (seen.has(cite)) {
      problems.push(`DIV-${n}: duplicate cite ${cite}`);
      continue;
    }
    seen.add(cite);
    const section = bindings.get(cite);
    if (section === undefined) {
      problems.push(`DIV-${n}: cites ${cite}, which is no AD section of the spine`);
    } else if (!section.names.has(n)) {
      problems.push(`DIV-${n}: cites ${cite}, whose section never names DIV-${n}`);
    }
  }
  return problems;
}

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

  // The AD cites come from the spine: sanity-check the parse, then the comparison on synthetic inputs.
  const bindings = spineBindings(readFileSync(join(root, SPINE), "utf8"));
  expect([...bindings.keys()]).toEqual(Array.from({ length: 28 }, (_, i) => `AD-${i + 1}`));
  expect([...bindings.values()].every((section) => section.hasBinds)).toBe(true);
  expect([...bindings.values()].some((section) => section.binds.size > 0)).toBe(true);
  const synthetic = new Map<string, AdSection>([
    ["AD-1", { hasBinds: true, binds: new Set([5]), names: new Set([5]) }],
    ["AD-2", { hasBinds: true, binds: new Set(), names: new Set([5]) }],
    ["AD-3", { hasBinds: true, binds: new Set(), names: new Set([6]) }],
  ]);
  expect(citeProblems(5, ["AD-1"], synthetic)).toEqual([]);
  expect(citeProblems(5, [], synthetic)).toEqual(["DIV-5: missing AD-1, whose Binds line binds DIV-5"]);
  expect(citeProblems(5, ["AD-1", "AD-2"], synthetic)).toEqual([]);
  expect(citeProblems(5, ["AD-1", "AD-3"], synthetic)).toEqual(["DIV-5: cites AD-3, whose section never names DIV-5"]);
  expect(citeProblems(5, ["AD-1", "AD-9"], synthetic)).toEqual(["DIV-5: cites AD-9, which is no AD section of the spine"]);
  expect(citeProblems(5, ["AD-1", "AD-1"], synthetic)).toEqual(["DIV-5: duplicate cite AD-1"]);
  expect(citeProblems(5, ["AD-1", "AD-9", "AD-9"], synthetic)).toEqual(["DIV-5: cites AD-9, which is no AD section of the spine", "DIV-5: duplicate cite AD-9"]);
  expect(citeProblems(6, [], synthetic)).toEqual([]);
  // A DIV bound by two ADs that cites only one (the DIV-1 / DIV-4 pattern).
  const twice = new Map(synthetic).set("AD-4", { hasBinds: true, binds: new Set([5]), names: new Set([5]) });
  expect(citeProblems(5, ["AD-1"], twice)).toEqual(["DIV-5: missing AD-4, whose Binds line binds DIV-5"]);
  expect(citeProblems(5, ["AD-1", "AD-4"], twice)).toEqual([]);
  // A duplicate AD heading or a DIV range in a Binds line fails loudly instead of being under-read.
  expect(() => spineBindings("### AD-1 — A\n\n- **Binds:** DIV-1\n\n### AD-1 — B\n\n- **Binds:** DIV-2\n")).toThrow("spine: duplicate heading AD-1");
  expect(() => spineBindings("### AD-1 — A\n\n- **Binds:** DIV-5..DIV-7\n")).toThrow("spine: AD-1 Binds line has a DIV range");
  expect([...divNumbers("DIV-11, DIV-1.2; xDIV-3")]).toEqual([11, 1]);

  const titles = prdTitles();
  const owed: Record<6 | 9, string[]> = { 6: [], 9: [] };
  for (let n = 1; n <= 12; n++) {
    const { fields, clauses } = realRecord(n);
    expect(fields["div"]).toBe(n);
    expect(titles.get(n)).toBeDefined();
    expect(fields["title"]).toBe(titles.get(n)!);
    expect(Array.isArray(fields["cites"])).toBe(true);
    expect(citeProblems(n, fields["cites"] as string[], bindings)).toEqual([]);
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
