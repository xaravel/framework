// Xaravel Tests for Story 8.2 (`PORTING.md` and the mechanical PHP → TS
// expression rule; FR-8, FR-48, AD-26). Fixture roots are hermetic temp
// directories holding copies of `PORTING.md`, the spine, the DIV-12 scan, the
// expression fixture and the Oracle request files; the real repository is
// only read, never written.
import { afterAll, expect } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { checkPorting, DIV12_BEGIN, DIV12_END, DIV12_FILE, FIXTURE_FILE, PORTING_FILE, readDiv12, renderDiv12, SPINE_FILE, translateEntry } from "../../../tools/porting/porting";
import { translateBladeTemplate, translateExpression, UntranslatableExpression } from "../../../tools/porting/translate";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "porting", "porting.ts");
const TRANSLATE_CLI = join(root, "tools", "porting", "translate.ts");
const REQUESTS = "conformance/oracle/requests";
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function run(cli: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync([process.execPath, cli, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

const read = (path: string): string => readFileSync(join(root, path), "utf8");

/** A fixture root copying the real inputs, with files overridden or removed (`null`). */
function fixture(files: Record<string, string | null> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-porting-"));
  roots.push(dir);
  for (const path of [PORTING_FILE, SPINE_FILE, DIV12_FILE, FIXTURE_FILE, REQUESTS]) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    cpSync(join(root, path), join(dir, path), { recursive: true });
  }
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(join(dir, path), { force: true });
    } else {
      writeFileSync(join(dir, path), content);
    }
  }
  return dir;
}

/** The lines of one `## ` section of a Markdown text (heading excluded). */
function section(text: string, heading: string): string[] {
  const lines = text.split("\n");
  const start = lines.indexOf(heading);
  expect(start).toBeGreaterThan(-1);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length && !lines[i]!.startsWith("## "); i++) {
    out.push(lines[i]!);
  }
  return out;
}

/** First cells of the data rows of the first Markdown table in `lines` (separator and header skipped). */
function firstCells(lines: readonly string[]): string[] {
  const rows = lines.map((line) => line.trim()).filter((line) => line.startsWith("|"));
  return rows.slice(2).map((row) => row.slice(1, row.indexOf(" |", 2)).trim());
}

/** The AD-26 construct names, read from the spine without the tool's parser. */
function spineConstructNames(): string[] {
  const spine = read(SPINE_FILE);
  const body = spine.slice(spine.indexOf("### AD-26"), spine.indexOf("### AD-27"));
  return firstCells(body.split("\n"));
}

// ---------------------------------------------------------------------------
// XT-conformance-153

xaravelTest("XT-conformance-153", "PORTING.md holds every AD-26 construct row decided, the eleven sections, the AD-5 frame slots, the APP_KEY forms, the Promise.all allow-list and the generated DIV-12 pair list; porting:check fails closed (FR-8.4)", () => {
  // The real repo.
  const report = checkPorting(root);
  expect(report.violations).toEqual([]);
  expect(report.constructs).toBe(17);
  expect(report.sections).toBe(12);
  expect(report.fixtures).toBe(20);
  const porting = read(PORTING_FILE);
  const headings = porting.split("\n").filter((line) => line.startsWith("## "));
  expect(headings).toEqual([
    "## Construct mapping (AD-26)",
    "## Idiom table",
    "## Test-adaptation rules",
    "## Mechanical expression rule",
    "## By-reference parameters",
    "## Exceptions",
    "## Scalar coercion (AD-9)",
    "## Frame slots (AD-5)",
    "## APP_KEY forms (AD-23)",
    "## Promise.all allow-list (AD-6)",
    "## PCRE conversion (DIV-10)",
    "## DIV-12 pair list",
  ]);

  // The construct names equal the spine table's, read independently; every row is decided.
  const spineNames = spineConstructNames();
  expect(spineNames.length).toBe(17);
  const constructRows = section(porting, "## Construct mapping (AD-26)").filter((line) => line.startsWith("|")).slice(2);
  expect(firstCells(section(porting, "## Construct mapping (AD-26)"))).toEqual(spineNames);
  for (const row of constructRows) {
    expect(row.endsWith("| decided |")).toBe(true);
  }

  // Frame slots: one bullet per AD-5 item, read from the spine's list.
  const spine = read(SPINE_FILE);
  const listText = /in instance fields: (.+?)\. The list is kept in `PORTING\.md`/.exec(spine)![1]!;
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const c of listText) {
    depth += c === "(" ? 1 : c === ")" ? -1 : 0;
    if (c === "," && depth === 0) {
      items.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  items.push(current.trim());
  const lastAnd = items[items.length - 1]!.split(" and ");
  items.splice(items.length - 1, 1, ...lastAnd.map((item) => item.trim()));
  expect(items.length).toBe(13);
  const slotBullets = section(porting, "## Frame slots (AD-5)").filter((line) => line.startsWith("- "));
  expect(slotBullets.length).toBe(13);
  for (const item of items) {
    expect(slotBullets.filter((bullet) => bullet.includes(item)).length).toBeGreaterThanOrEqual(1);
  }
  const slotText = section(porting, "## Frame slots (AD-5)").join("\n");
  expect(slotText).toContain("tools/lint-rules/singletons.json");
  expect(slotText).toContain("conformance/boot-only-state");

  // APP_KEY: each of the four consumers with its form.
  const keyBullets = section(porting, "## APP_KEY forms (AD-23)").filter((line) => line.startsWith("- "));
  const forms: [string, RegExp][] = [
    ["Encrypter", /→ `raw\(\)`$/],
    ["signed URLs", /→ `configString\(\)` with `previous\(\)`$/],
    ["closures", /→ `configString\(\)` with `previous\(\)`$/],
    ["cookie prefix", /→ `raw\(\)`$/],
  ];
  expect(keyBullets.length).toBe(4);
  for (const [consumer, form] of forms) {
    const bullet = keyBullets.find((line) => line.startsWith(`- **${consumer}**`));
    expect(bullet).toBeDefined();
    expect(bullet!).toMatch(form);
  }

  // Promise.all: exactly the four entries.
  const allowBullets = section(porting, "## Promise.all allow-list (AD-6)").filter((line) => line.startsWith("- "));
  expect(allowBullets).toEqual(["- `Http.pool`", "- `Concurrency.run`", "- `Process.pool`", "- batch dispatch"]);

  // PCRE: the conversions and the no-equivalent list, citing ESC-4.3-1 item 5.
  const pcre = section(porting, "## PCRE conversion (DIV-10)").join("\n");
  for (const phrase of ["(?P<n>", "(?<n>", "`\\A` → `^`", "`\\z` → `$`", "possessive", "atomic", "(?R)", "conditionals", "`\\G`", "`\\Z`", "the `x` flag", "inline flag groups", "`\\K`", "ESC-4.3-1 item 5", "DIV-10.1"]) {
    expect(pcre).toContain(phrase);
  }

  // The DIV-12 region equals renderDiv12 of the jsonl.
  const rows = readDiv12(root);
  const region = porting.slice(porting.indexOf(DIV12_BEGIN), porting.indexOf(DIV12_END) + DIV12_END.length);
  expect(region).toBe(renderDiv12(rows));
  expect(region).toContain("setFillable");
  expect(region).toContain("isTouching");
  expect(region).toContain(`${rows.length} pairs in `);

  // The CLI on the real repo.
  const real = run(CLI, ["check"]);
  expect(real.stderr).toBe("");
  expect(real.code).toBe(0);
  expect(real.stdout).toBe(`PORTING OK: 17 construct row(s) decided, 12 section(s), ${rows.length} DIV-12 pair(s), 20 fixture translation(s).\n`);

  // Fixture roots: an unchanged copy passes; each broken one fails with exit 1 and the matrix message.
  expect(run(CLI, ["check", "--root", fixture()]).code).toBe(0);
  const portingLines = porting.split("\n");
  const beginLine = portingLines.indexOf(DIV12_BEGIN);
  const driftLine = beginLine + 4;
  const drifted = portingLines.map((line, index) => (index === driftLine ? line.replace("|", "| x") : line)).join("\n");
  const fixtureLines = read(FIXTURE_FILE).split("\n");
  const mismatchIndex = fixtureLines.findIndex((line) => line.includes('"mode":"expr"'));
  const mismatchEntry = JSON.parse(fixtureLines[mismatchIndex]!) as { source: string; mode: string; php: string; ts: string };
  const mismatched = fixtureLines.map((line, index) => (index === mismatchIndex ? JSON.stringify({ ...mismatchEntry, ts: `${mismatchEntry.ts} + 1` }) : line)).join("\n");
  const toStringRow = constructRows.find((row) => row.startsWith("| `__toString` |"))!;
  const traitsRow = constructRows.find((row) => row.startsWith("| Traits |"))!;
  // A section's body (heading kept) removed up to the next `## ` heading.
  const emptied = (heading: string): string => {
    const start = portingLines.indexOf(heading);
    expect(start).toBeGreaterThan(-1);
    let end = start + 1;
    while (end < portingLines.length && !portingLines[end]!.startsWith("## ")) {
      end++;
    }
    return [...portingLines.slice(0, start + 1), "", ...portingLines.slice(end)].join("\n");
  };
  const contentRules: [string, string, string][] = [
    ["## Idiom table", "table row", "The parity rule"],
    ["## Test-adaptation rules", "rule line", "Never weaken an expected value"],
    ["## Mechanical expression rule", "table row", "syntax-directed"],
    ["## By-reference parameters", "prose line", "`Ref<T>`"],
    ["## Exceptions", "rule line", "`registerClass('<FQCN>', X)`"],
  ];
  const idiomTable = section(porting, "## Idiom table").filter((line) => line.startsWith("|"));
  // Every table's data rows removed from the Idiom table, headers and separators kept.
  const idiomRowsRemoved = (() => {
    const start = portingLines.indexOf("## Idiom table");
    expect(start).toBeGreaterThan(-1);
    let end = start + 1;
    while (end < portingLines.length && !portingLines[end]!.startsWith("## ")) {
      end++;
    }
    const kept = portingLines.slice(start + 1, end).filter((line, index, all) => !line.startsWith("|") || /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(line) || /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(all[index + 1] ?? ""));
    return [...portingLines.slice(0, start + 1), ...kept, ...portingLines.slice(end)].join("\n");
  })();
  expect(idiomTable.length).toBeGreaterThan(2);
  expect(idiomRowsRemoved).toContain(idiomTable.slice(0, 2).join("\n"));
  const mechanicalStart = porting.indexOf("\n## Mechanical expression rule\n");
  const mechanicalEnd = porting.indexOf("\n## By-reference parameters\n");
  expect(mechanicalStart).toBeGreaterThan(-1);
  expect(mechanicalEnd).toBeGreaterThan(-1);
  const mechanicalBody = porting.slice(mechanicalStart, mechanicalEnd);
  const anchorReworded = porting.slice(0, mechanicalStart) + mechanicalBody.replaceAll("syntax-directed", "syntax-led") + porting.slice(mechanicalEnd);
  // The By-reference body replaced by a prose line with the anchor only inside a code fence.
  const byRefStart = porting.indexOf("\n## By-reference parameters\n") + "\n## By-reference parameters\n".length;
  const byRefEnd = porting.indexOf("\n## Exceptions\n");
  expect(byRefStart).toBeGreaterThan("\n## By-reference parameters\n".length - 1);
  expect(byRefEnd).toBeGreaterThan(-1);
  const anchorInFence = `${porting.slice(0, byRefStart)}\nA by-reference parameter takes a box.\n\n\`\`\`ts\nconst box: \`Ref<T>\`;\n\`\`\`\n${porting.slice(byRefEnd)}`;
  const failing: [Record<string, string | null>, string][] = [
    [{ [PORTING_FILE]: idiomRowsRemoved }, 'PORTING.md: section "## Idiom table" has no table row'],
    [{ [PORTING_FILE]: anchorReworded }, 'PORTING.md: section "## Mechanical expression rule" lacks "syntax-directed"'],
    [{ [PORTING_FILE]: anchorInFence }, 'PORTING.md: section "## By-reference parameters" lacks "`Ref<T>`"'],
    [{ [PORTING_FILE]: null }, "PORTING.md: missing"],
    [{ [PORTING_FILE]: porting.replace("\n## Idiom table\n", "\n## Idioms\n") }, 'PORTING.md: missing section "## Idiom table"'],
    [{ [PORTING_FILE]: porting.replace("\n## Exceptions\n", "\n## Exceptionz\n") }, 'PORTING.md: missing section "## Exceptions"'],
    [{ [PORTING_FILE]: porting.replace(/(\| Traits \|.*\| )decided \|/, "$1open |") }, 'PORTING.md: AD-26 row "Traits" not decided (open)'],
    [{ [PORTING_FILE]: porting.replace("\n## Idiom table\n", "\n## Idioms and more\n## Idiom table\n") }, 'PORTING.md: unexpected section "## Idioms and more"'],
    [{ [PORTING_FILE]: `${porting}\n## Idiom table\n` }, 'PORTING.md: duplicate section "## Idiom table"'],
    [{ [PORTING_FILE]: porting.replace(`${traitsRow}\n`, `${traitsRow}\n| Goto | none | decided |\n`) }, 'PORTING.md: AD-26 row "Goto" not in the spine'],
    [{ [PORTING_FILE]: porting.replace(`${traitsRow}\n`, `${traitsRow}\n${traitsRow}\n`) }, 'PORTING.md: AD-26 row "Traits" duplicate'],
    [{ [PORTING_FILE]: porting.replace(`${traitsRow}\n`, "| Traits |  | decided |\n") }, 'PORTING.md: AD-26 row "Traits" has no Xaravel form'],
    [{ [DIV12_FILE]: `${JSON.stringify({ class: "X\\Model", name: "table", classification: "model-config", property: { declaredIn: "X\\Model", static: false }, method: { declaredIn: "X\\Model", static: false } })}\n` }, `${DIV12_FILE}: no AD-7 rename for table`],
    [{ [PORTING_FILE]: porting.replace(`${toStringRow}\n`, "") }, 'PORTING.md: AD-26 row "`__toString`" missing'],
    [{ [PORTING_FILE]: drifted }, `PORTING.md: div12-pairs region drift at line ${driftLine + 1}; run bun run porting:generate`],
    [{ [PORTING_FILE]: porting.replace(`${DIV12_END}`, "") }, `PORTING.md: div12-pairs region drift at line ${beginLine + 1}; run bun run porting:generate`],
    [{ [SPINE_FILE]: spine.replace("### AD-26", "### AD-twenty-six") }, `${SPINE_FILE}: AD-26 construct table not found`],
    [{ [FIXTURE_FILE]: mismatched }, `${FIXTURE_FILE}:${mismatchIndex + 1}: translation differs: expected ${JSON.stringify(`${mismatchEntry.ts} + 1`)}, got ${JSON.stringify(mismatchEntry.ts)}`],
    [{ [FIXTURE_FILE]: fixtureLines.slice(1).join("\n") }, `${FIXTURE_FILE}: 19 line(s), expected 20`],
    [{ [FIXTURE_FILE]: fixtureLines.map((line, index) => (index === mismatchIndex ? "{not json" : line)).join("\n") }, `${FIXTURE_FILE}:${mismatchIndex + 1}: not valid JSON`],
    [{ [FIXTURE_FILE]: fixtureLines.map((line, index) => (index === mismatchIndex ? JSON.stringify({ ...mismatchEntry, php: `${mismatchEntry.php} ` }) : line)).join("\n") }, `${FIXTURE_FILE}:${mismatchIndex + 1}: php not found at ${mismatchEntry.source}`],
    [{ [FIXTURE_FILE]: fixtureLines.map((line, index) => (index === mismatchIndex ? JSON.stringify({ ...mismatchEntry, ts: "a +" }) : line)).join("\n") }, `${FIXTURE_FILE}:${mismatchIndex + 1}: ts does not parse`],
  ];
  for (const [files, expected] of failing) {
    const result = run(CLI, ["check", "--root", fixture(files)]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(expected);
  }
  // Each content section emptied: exit 1 with both its `has no` and `lacks` messages.
  for (const [heading, kind, anchor] of contentRules) {
    const result = run(CLI, ["check", "--root", fixture({ [PORTING_FILE]: emptied(heading) })]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`PORTING.md: section "${heading}" has no ${kind}\n`);
    expect(result.stderr).toContain(`PORTING.md: section "${heading}" lacks "${anchor}"\n`);
  }
  // Idiom rows removed: no table row, but the anchor is still there.
  expect(run(CLI, ["check", "--root", fixture({ [PORTING_FILE]: idiomRowsRemoved })]).stderr).not.toContain('section "## Idiom table" lacks');
  // Mechanical anchor reworded: the table rows still count.
  expect(run(CLI, ["check", "--root", fixture({ [PORTING_FILE]: anchorReworded })]).stderr).not.toContain('section "## Mechanical expression rule" has no table row');
  // A By-reference body of only a bullet and a table has no prose line, though it holds the anchor.
  const byRefNoProse = run(CLI, ["check", "--root", fixture({ [PORTING_FILE]: `${porting.slice(0, byRefStart)}\n- \`Ref<T>\` box\n\n| A | B |\n| --- | --- |\n| a | b |\n${porting.slice(byRefEnd)}` })]);
  expect(byRefNoProse.code).toBe(1);
  expect(byRefNoProse.stderr).toContain('PORTING.md: section "## By-reference parameters" has no prose line');
  expect(byRefNoProse.stderr).not.toContain('section "## By-reference parameters" lacks');
  // The Exceptions body inside a code fence: its rule lines do not count.
  const exceptionsStart = porting.indexOf("\n## Exceptions\n") + "\n## Exceptions\n".length;
  const exceptionsEnd = porting.indexOf("\n## Frame slots (AD-5)\n");
  expect(exceptionsStart).toBeGreaterThan("\n## Exceptions\n".length - 1);
  expect(exceptionsEnd).toBeGreaterThan(-1);
  const exceptionsFenced = run(CLI, ["check", "--root", fixture({ [PORTING_FILE]: `${porting.slice(0, exceptionsStart)}\n\`\`\`\n${porting.slice(exceptionsStart, exceptionsEnd)}\n\`\`\`\n${porting.slice(exceptionsEnd)}` })]);
  expect(exceptionsFenced.code).toBe(1);
  expect(exceptionsFenced.stderr).toContain('PORTING.md: section "## Exceptions" has no rule line');
  // The fenced case fails only on the anchor: its prose line counts.
  expect(run(CLI, ["check", "--root", fixture({ [PORTING_FILE]: anchorInFence })]).stderr).not.toContain('section "## By-reference parameters" has no prose line');
  // A missing section is reported only as missing, with no content violations.
  const renamed = run(CLI, ["check", "--root", fixture({ [PORTING_FILE]: porting.replace("\n## Idiom table\n", "\n## Idioms\n") })]);
  expect(renamed.stderr).toContain('PORTING.md: missing section "## Idiom table"');
  expect(renamed.stderr).not.toContain('section "## Idiom table" has no');
  expect(renamed.stderr).not.toContain('section "## Idiom table" lacks');

  // generate repairs the drift fixture, leaving the rest of the file byte-identical; check then passes.
  const repairRoot = fixture({ [PORTING_FILE]: drifted });
  const generated = run(CLI, ["generate", "--root", repairRoot]);
  expect(generated.code).toBe(0);
  expect(generated.stdout).toBe(`PORTING.md: div12-pairs region regenerated (${rows.length} pairs).\n`);
  expect(readFileSync(join(repairRoot, PORTING_FILE), "utf8")).toBe(porting);
  expect(run(CLI, ["check", "--root", repairRoot]).code).toBe(0);
  expect(run(CLI, ["generate", "--root", repairRoot]).stdout).toBe(`PORTING.md: div12-pairs region up to date (${rows.length} pairs).\n`);

  // Usage errors exit 2.
  for (const args of [["check", "--bogus"], ["check", "--root"], ["frobnicate"], []]) {
    const usage = run(CLI, args);
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain("Usage: bun tools/porting/porting.ts check|generate [--root <dir>]");
  }

  // CI runs the gate in the required `check` job, and the scripts exist.
  const ci = read(".github/workflows/ci.yml");
  const job = /\n {2}check:\n((?: {4}.*\n|\n)*)/.exec(ci);
  expect(job).not.toBeNull();
  expect(job![1]!).toMatch(/- name: Check PORTING\.md\n\s+run: bun run porting:check\n/);
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["porting:check"]).toBe("bun --no-env-file tools/porting/porting.ts check");
  expect(scripts["porting:generate"]).toBe("bun --no-env-file tools/porting/porting.ts generate");
  expect(scripts["porting:translate"]).toBe("bun --no-env-file tools/porting/translate.ts translate");
});

// ---------------------------------------------------------------------------
// XT-conformance-154

interface Entry {
  source: string;
  mode: string;
  php: string;
  ts: string;
}

/** Whether `php` occurs in the request's `exprs`, `setup` or `template`. */
function occursInRequest(source: string, php: string): boolean {
  const cut = source.indexOf("#");
  const file = source.slice(0, cut);
  const id = source.slice(cut + 1);
  expect(file.startsWith(`${REQUESTS}/`)).toBe(true);
  return read(file)
    .split("\n")
    .filter((line) => line !== "")
    .some((line) => {
      const request = JSON.parse(line) as { id: string; input: { exprs?: string[]; setup?: string[]; template?: string } };
      if (request.id !== id) {
        return false;
      }
      const texts = [...(request.input.exprs ?? []), ...(request.input.setup ?? []), ...(request.input.template === undefined ? [] : [request.input.template])];
      return texts.some((text) => text.includes(php));
    });
}

/** The coverage list of the spec's Boundaries, as (name, test over an entry). */
const COVERAGE: [string, (entry: Entry) => boolean][] = [
  ["a static call on an FQCN", (e) => /\\[A-Z]\w*(?:\\[A-Z]\w*)+::[a-z]\w*\(/.test(e.php)],
  ["a method chain", (e) => /\)->\w+\(/.test(e.php)],
  ["fn closures", (e) => /\bfn\s*\(/.test(e.php)],
  ["a list array", (e) => /\[\s*'[^']*'(?:\s*,\s*'[^']*')+\s*\]/.test(e.php) && /\['[^']*'(?:, '[^']*')+\]/.test(e.ts)],
  ["a keyed array", (e) => /'\w+' =>/.test(e.php) && /\{ \w+: /.test(e.ts)],
  ["a mixed or int-keyed array", (e) => /=>/.test(e.php) && e.ts.includes("new PhpArray([")],
  ["double-quoted interpolation", (e) => /"[^"]*(?:\{\$|\$\w)[^"]*"/.test(e.php) && e.ts.includes("toPhpString(")],
  ["`.` concatenation", (e) => /'\s*\.\s*\$/.test(e.php) && /' \+ toPhpString\(/.test(e.ts)],
  ["`==`", (e) => / == /.test(e.php) && e.ts.includes("looseEquals(")],
  ["a cast", (e) => /\((?:string|int|float|bool)\)/.test(e.php)],
  ["`X::class`", (e) => /::class\b/.test(e.php)],
  ["`new`", (e) => /\bnew \\?[A-Z]/.test(e.php)],
  ["a named argument", (e) => /,\s*[a-z]\w*: /.test(e.php) && /\{ [a-z]\w*: /.test(e.ts)],
  ["a ternary or `isset`", (e) => /\bisset\(| \? /.test(e.php)],
];

xaravelTest("XT-conformance-154", "the mechanical PHP → TS expression rule reproduces each of 20 real Upstream inputs (at least 3 Blade templates) and throws UntranslatableExpression naming the construct for what it does not cover (FR-8.4)", () => {
  const lines = read(FIXTURE_FILE).split("\n");
  expect(lines.pop()).toBe("");
  expect(lines.length).toBe(20);
  const entries = lines.map((line) => JSON.parse(line) as Entry);
  const upstreamSynced = existsSync(join(root, "conformance", "upstream", "framework", "src"));
  for (const [index, entry] of entries.entries()) {
    const label = `${FIXTURE_FILE}:${index + 1}`;
    expect(Object.keys(entry).sort()).toEqual(["mode", "php", "source", "ts"]);
    expect(["expr", "blade"]).toContain(entry.mode);
    // Per entry: the translation equals `ts`.
    expect({ label, out: translateEntry(entry.mode, entry.php) }).toEqual({ label, out: entry.ts });
    // `php` occurs at `source`.
    const upstream = /^((?:framework|ai|mcp|boost)\/[^:\s]+):([1-9]\d*)$/.exec(entry.source);
    if (upstream === null) {
      expect({ label, found: occursInRequest(entry.source, entry.php) }).toEqual({ label, found: true });
    } else if (upstreamSynced) {
      const text = read(`conformance/upstream/${upstream[1]}`);
      const fileLines = text.split("\n");
      const lineNumber = Number(upstream[2]);
      expect({ label, inFile: lineNumber <= fileLines.length }).toEqual({ label, inFile: true });
      const lineStart = fileLines.slice(0, lineNumber - 1).reduce((sum, line) => sum + line.length + 1, 0);
      const lineEnd = lineStart + fileLines[lineNumber - 1]!.length;
      const at = text.indexOf(entry.php, lineStart);
      expect({ label, onLine: at !== -1 && at <= lineEnd }).toEqual({ label, onLine: true });
    } else {
      // The `upstream` CI job syncs the snapshot before running this test, so there the check must run.
      expect(process.env["GITHUB_JOB"]).not.toBe("upstream");
      console.warn(`porting.test.ts: conformance/upstream is not synced; ${label}'s Upstream source is not checked`);
    }
    // Each expr-mode `ts` parses as one TypeScript expression.
    if (entry.mode === "expr") {
      const parsed = parseSync("entry.ts", `(${entry.ts});\n`, { lang: "ts" });
      expect({ label, errors: parsed.errors.map((error) => error.message) }).toEqual({ label, errors: [] });
      expect((parsed.program as unknown as { body: unknown[] }).body.length).toBe(1);
    }
  }
  const blade = entries.filter((entry) => entry.mode === "blade");
  expect(blade.length).toBeGreaterThanOrEqual(3);
  for (const entry of blade) {
    expect(entry.source.startsWith(`${REQUESTS}/view.jsonl#`)).toBe(true);
  }
  for (const [name, covers] of COVERAGE) {
    expect({ name, covered: entries.some(covers) }).toEqual({ name, covered: true });
  }

  // The untranslatable examples throw, naming the construct.
  const untranslatable: [string, string][] = [
    ["match ($x) { 1 => 'a', default => 'b' }", "match"],
    ["throw new \\RuntimeException('x')", "throw"],
    ["(array) $value", "(array)"],
    ["static::create()", "static::"],
    ["<<<EOT\nHello $name\nEOT", "heredoc with interpolation"],
    ["$x = 1;", "statement"],
  ];
  for (const [php, construct] of untranslatable) {
    let thrown: unknown = null;
    try {
      translateExpression(php);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UntranslatableExpression);
    expect((thrown as UntranslatableExpression).construct).toBe(construct);
    expect((thrown as UntranslatableExpression).message.startsWith(construct)).toBe(true);
  }
  // One hand-derived case per rule-table row the fixture does not cover, and per translator refinement.
  const RULES: [string, string][] = [
    ["$a != $b", "!looseEquals(a, b)"],
    ["$a <> $b", "!looseEquals(a, b)"],
    ["$a <=> $b", "spaceship(a, b)"],
    ["$a ?: 'x'", "toBool(a) ? a : 'x'"],
    ["empty($a)", "!toBool(a ?? null)"],
    ["1.0", "float(1)"],
    ["7.12", "7.12"],
    ["017", "0o17"],
    ["0o17", "0o17"],
    ["0_17", "0o17"],
    ["$a?->b", "a?.b"],
    ["\\A\\C::$p", "C.p"],
    ["C::K", "C.K"],
    ["strlen(...)", "strlen"],
    ["$o->m(...)", "o.m.bind(o)"],
    ["!$a", "!toBool(a)"],
    ["$a && $b", "toBool(a) && toBool(b)"],
    ["$a || $b === 1", "toBool(a) || b === 1"],
    ["$a ? 1 : 2", "toBool(a) ? 1 : 2"],
    ["$a ? 1 : ($b ? 2 : 3)", "toBool(a) ? 1 : toBool(b) ? 2 : 3"],
    ["function ($a) use ($b) { return $a + $b; }", "(a) => a + b"],
    ["fn (int $a = 1, ...$rest): int => $a", "(a = 1, ...rest) => a"],
    ["$a = 1", "a = 1"],
    ["__DIR__", "import.meta.dir"],
    ["[...$a, 1]", "[...a, 1]"],
    ["f(...$a)", "f(...a)"],
    ["array(1, 2)", "[1, 2]"],
    ["array('a' => 1)", "{ a: 1 }"],
    ["['b-c' => 1]", "{ 'b-c': 1 }"],
    ["['1' => 'a', 'b']", "new PhpArray([['1', 'a'], [2, 'b']])"],
    ["TRUE", "true"],
    ["Null", "null"],
    ["(int) $a", "toInt(a)"],
    ["(float) $a", "toFloat(a)"],
    ["(double) $a", "toFloat(a)"],
    ["(bool) $a", "toBool(a)"],
    ["(string) $a", "toPhpString(a)"],
    ["(integer) $a", "toInt(a)"],
    ["(boolean) $a", "toBool(a)"],
    ["(binary) $a", "toPhpString(a)"],
    ["$a instanceof \\A\\B", "a instanceof B"],
    ["$a ?? $b", "a ?? b"],
    ["$a[$k]", "a[k]"],
    ["new C", "new C()"],
    ["new \\A\\C(1, b: 2)", "new C(1, { b: 2 })"],
    ["str_repeat('b', PHP_EOL)", "str_repeat('b', PHP_EOL)"],
    ['"s\\t$v {$o->p}"', "'s\\t' + toPhpString(v) + ' ' + toPhpString(o.p)"],
    ['"$a[0] $a[k] $a->p"', "toPhpString(a[0]) + ' ' + toPhpString(a['k']) + ' ' + toPhpString(a.p)"],
    ["'it\\'s'", "'it\\'s'"],
    ["(-2) ** 2", "(-2) ** 2"],
    ["(!$a) ** 2", "(!toBool(a)) ** 2"],
    ["isset($a->b->c)", "(a?.b?.c ?? null) !== null"],
    ["isset($a['x']['y'], $b)", "(a?.['x']?.['y'] ?? null) !== null && (b ?? null) !== null"],
    ["empty($a->b)", "!toBool(a?.b ?? null)"],
    ["$a->b->c ?? 1", "a?.b?.c ?? 1"],
    ["\\A\\Collection::make() + \\A\\Collection::wrap()", "Collection.make() + Collection.wrap()"],
    ["7 % 2", "7 % 2"],
    ["'a' < 'b'", "'a' < 'b'"],
    ["7.5 + 2", "7.5 + 2"],
    ["$a + 1", "a + 1"],
    ["$a < 'x'", "a < 'x'"],
    ["$a % 2", "a % 2"],
    ["'10a' < '9'", "'10a' < '9'"],
    ["'10' < 'abc'", "'10' < 'abc'"],
    ["1 < 2", "1 < 2"],
  ];
  for (const [php, ts] of RULES) {
    expect({ php, out: translateExpression(php) }).toEqual({ php, out: ts });
  }
  expect(translateExpression("$user->name", { blade: true })).toBe("$user.name");
  const BLADE: [string, string][] = [
    ["<style>@media (max-width: 600px) { a { b: c } }</style>", "<style>@media (max-width: 600px) { a { b: c } }</style>"],
    ["@supports (display: grid) {{ $a->b }}", "@supports (display: grid) {{ $a.b }}"],
    ["@if($a->b) x @endif {{-- {{ $a-> }} --}} @{{ $raw }} @@if($x)", "@if($a.b) x @endif {{-- {{ $a-> }} --}} @{{ $raw }} @@if($x)"],
    ["@forelse ($users->all() as $user) {!! $user->name !!} @endforelse", "@forelse ($users.all() as $user) {!! $user.name !!} @endforelse"],
  ];
  for (const [src, ts] of BLADE) {
    expect({ src, out: translateBladeTemplate(src) }).toEqual({ src, out: ts });
  }
  const REFUSED: [string, string][] = [
    ["[$k => 1, 2]", "implicit key after a non-literal key"],
    ["self::make()", "self::"],
    ["parent::make()", "parent::"],
    ["(object) $a", "(object)"],
    ["(unset) $a", "(unset)"],
    ["(real) $a", "(real)"],
    ["@f()", "@"],
    ["print 1", "print"],
    ["echo 1", "echo"],
    ["exit(1)", "exit"],
    ["list($a) = $b", "list()"],
    ["[$a, $b] = $c", "destructuring"],
    ["$a and $b", "and"],
    ["$a or $b", "or"],
    ["$a xor $b", "xor"],
    ["new class {}", "new class"],
    ["__FILE__", "__FILE__"],
    ["`ls`", "`"],
    ["function () { $x = 1; return $x; }", "function body"],
    ["$a ? 1 : $b ? 2 : 3", "nested ternary without parentheses"],
    ["new $a->b", "new"],
    ["new $a['k']", "new"],
    ["new $a::$p", "new"],
    ["function () use (&$x) { return $x; }", "by-reference parameter"],
    ["fn (&$x) => $x", "by-reference parameter"],
    ["['a' => 1, 'a' => 2]", "duplicate array key"],
    ["$eval", "variable named a reserved word"],
    ["$arguments", "variable named a reserved word"],
    ["$class", "variable named a reserved word"],
    ["\\A\\Collection::make() + \\B\\Collection::make()", "short class name collision"],
    ["$a->b() ?: 1", "`?:` on an operand that is not a variable or literal"],
    ["$a .= 'x'", "compound assignment `.=`"],
    ['"5" + "5"', "string operand of `+`"],
    ["'2' * 3", "string operand of `*`"],
    ['"$a" - 1', "string operand of `-`"],
    ["($a . 'x') + 1", "string operand of `+`"],
    ["(string) $a + 1", "string operand of `+`"],
    ["'a' | 'b'", "string operand of `|`"],
    ["7.5 % 2", "float operand of `%`"],
    ["7 % -2.5", "float operand of `%`"],
    ['1 < "a"', "comparison of a string with a non-string literal"],
    ["null < 'a'", "comparison of a string with a non-string literal"],
    ['"10" < "9"', "comparison of two numeric strings"],
    ["'a' / 2", "string operand of `/`"],
    ["'a' ** 2", "string operand of `**`"],
    ["'a' & 1", "string operand of `&`"],
    ["'a' ^ 1", "string operand of `^`"],
    ["'a' << 1", "string operand of `<<`"],
    ["'a' >> 1", "string operand of `>>`"],
    ["'a' % 2", "string operand of `%`"],
    ["(binary) $a + 1", "string operand of `+`"],
    ["+7.5 % 2", "float operand of `%`"],
    ["'a' > 1", "comparison of a string with a non-string literal"],
    ["true < 'a'", "comparison of a string with a non-string literal"],
    ["-1 >= 'a'", "comparison of a string with a non-string literal"],
    ["'1' <= 2", "comparison of a string with a non-string literal"],
    ["'1e3' < '2'", "comparison of two numeric strings"],
    ["' 1.5' > '-2'", "comparison of two numeric strings"],
  ];
  for (const [php, construct] of REFUSED) {
    let thrown: unknown = null;
    try {
      translateExpression(php);
    } catch (error) {
      thrown = error;
    }
    expect({ php, construct: thrown instanceof UntranslatableExpression ? thrown.construct : String(thrown) }).toEqual({ php, construct });
  }
  for (const [src, construct] of [["@for ($i = 0; $i < 3; $i++) x @endfor", "@for"], ["@php $x = 1; @endphp", "@php"]] as const) {
    let thrown: unknown = null;
    try {
      translateBladeTemplate(src);
    } catch (error) {
      thrown = error;
    }
    expect({ src, construct: thrown instanceof UntranslatableExpression ? thrown.construct : String(thrown) }).toEqual({ src, construct });
  }

  const cli = run(TRANSLATE_CLI, ["translate", "match ($x) { default => 1 }"]);
  expect(cli.code).toBe(1);
  expect(cli.stderr).toStartWith("UntranslatableExpression: match");
  const ok = run(TRANSLATE_CLI, ["translate", '\\Illuminate\\Support\\Str::words("\\t\\t\\t")']);
  expect(ok.code).toBe(0);
  expect(ok.stdout).toBe("Str.words('\\t\\t\\t')\n");
  const bladeCli = run(TRANSLATE_CLI, ["translate", "--blade", "Hello {{ $user->name }}"]);
  expect(bladeCli.stdout).toBe("Hello {{ $user.name }}\n");
  expect(run(TRANSLATE_CLI, ["translate", "--bogus", "x"]).code).toBe(2);
  expect(run(TRANSLATE_CLI, []).code).toBe(2);
});
