// Xaravel Test for Story 15.3's Epic-close row (XT-config-7): Epic 15 closes only when `api-surface:gate config`
// passes, the package docs are written and name every root export, every public API has a docblock,
// `async-surface.json` is current, the README gives each dependency and ported library its reason (NFR-2), LICENSE
// keeps Laravel's MIT notice, and no Expectations line is `blocked-by:config`. A content check over the package and
// the repository, with no Oracle request: every expectation is derived from the source (the exports of `src/index.ts`,
// the `adapted:DIV-` markers in `tests/`, `src/`'s top-level directories, `package.json`'s dependencies, the
// Expectations files), never from a hard-coded copy.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const REPO = resolve(PACKAGE_DIR, "..", "..");
const SRC = join(PACKAGE_DIR, "src");
const DOCS = join(PACKAGE_DIR, "docs");

/** Every file under `dir` whose name ends with `suffix`, recursively, sorted. */
function filesUnder(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...filesUnder(path, suffix));
    } else if (entry.name.endsWith(suffix)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Every name `src/index.ts` exports, values and types. Only `export { … } from "…"` lists are understood; any other
 * export form throws, so a new form cannot slip past the check unread.
 */
function exportedNames(): string[] {
  const source = readFileSync(join(SRC, "index.ts"), "utf8");
  const lists = [...source.matchAll(/^export\s*\{([^}]*)\}\s*(?:from\s*"[^"]*"\s*)?;/gm)];
  const statements = source.match(/^export\b/gm) ?? [];
  if (lists.length !== statements.length) {
    throw new Error(`src/index.ts: ${statements.length - lists.length} export statement(s) in a form epic-close.test.ts cannot read`);
  }
  const names = new Set<string>();
  for (const match of lists) {
    for (const raw of match[1]!.split(",")) {
      const text = raw.trim().replace(/^type\s+/, "");
      if (text === "") {
        continue;
      }
      const parsed = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(text);
      if (parsed === null) {
        throw new Error(`src/index.ts: cannot read the export entry "${text}"`);
      }
      names.add(parsed[2] ?? parsed[1]!);
    }
  }
  return [...names];
}

/** The text of the `## <title>` section of a Markdown page, up to the next `## ` heading; null when it is absent. */
function section(markdown: string, title: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === `## ${title}`);
  if (start < 0) {
    return null;
  }
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n");
}

/** Whether `text` names the clause `clause` (`DIV-12.6`), not merely a longer one (`DIV-12.61`). */
function namesClause(text: string, clause: string): boolean {
  return new RegExp(`${clause.replace(/\./g, "\\.")}(?![\\d.]*\\d)`).test(text);
}

/**
 * The exported declarations and public methods under `src/` with no docblock, as `<path>:<line>: <name>`. A line
 * `export [declare] [abstract] class|interface|function|type|enum|const <Name>`, or a member line at class-body
 * indentation `  <modifiers> name(` inside a class or interface, must follow a line that closes a docblock, decorator lines
 * skipped. Constructors, `private`, `protected` and `#private` members are exempt; an overload's further signatures
 * share the first's docblock; a contract token (`export const X = contract(…)`) follows its documented interface.
 */
function undocumented(): string[] {
  const out: string[] = [];
  for (const file of filesUnder(SRC, ".ts")) {
    const lines = readFileSync(file, "utf8").split("\n");
    let inBody = false;
    let previousMember: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      let name: string | null = null;
      const declaration = /^export\s+(?:declare\s+)?(?:abstract\s+)?(class|interface|function|type|enum|const)\s+([A-Za-z_$][\w$]*)/.exec(line);
      if (declaration !== null && !(declaration[1] === "const" && /=\s*contract\b/.test(line))) {
        name = declaration[2]!;
      }
      if (inBody && /^ {2}\S/.test(line)) {
        const member = /^ {2}((?:(?:public|static|abstract|readonly|override|async|protected|private|declare|get|set)\s+)*)(?:\*\s*)?(#?[A-Za-z_$][\w$]*|\[[^\]]+\])\??\s*(?:<.*>)?\s*\(/.exec(line);
        if (member !== null) {
          const exempt = /\b(?:private|protected)\b/.test(member[1]!) || member[2]!.startsWith("#") || member[2] === "constructor";
          if (!exempt && member[2] !== previousMember) {
            name = member[2]!;
          }
          previousMember = member[2]!;
        } else if (!/^\s*@/.test(line)) {
          previousMember = null;
        }
      }
      if (name !== null) {
        let j = i - 1;
        while (j >= 0 && /^\s*@/.test(lines[j]!)) {
          j--;
        }
        if (j < 0 || !opensDocblock(lines, j)) {
          out.push(`${relative(PACKAGE_DIR, file)}:${i + 1}: ${name}`);
        }
      }
      if (/^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface)\s/.test(line)) {
        inBody = !line.trimEnd().endsWith("}");
        previousMember = null;
      } else if (line.startsWith("}")) {
        inBody = false;
      }
    }
  }
  return out;
}

/** Whether line `end` closes a comment whose opening `/*` begins `/**`: a docblock, not a plain block comment. */
function opensDocblock(lines: readonly string[], end: number): boolean {
  const last = lines[end]!.trimEnd();
  if (!last.endsWith("*/")) {
    return false;
  }
  for (let k = end; k >= 0; k--) {
    const text = k === end ? last.slice(0, -2) : lines[k]!;
    const at = text.lastIndexOf("/*");
    if (at >= 0) {
      return text.startsWith("/**", at);
    }
  }
  return false;
}

/** The parent's environment without `BUN_OPTIONS` and `NODE_OPTIONS`, as the harness spawns `bun test`. */
function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "BUN_OPTIONS" && key !== "NODE_OPTIONS") {
      env[key] = value;
    }
  }
  return env;
}

/** Runs a repository command as a child Bun process with `--no-env-file`. */
function bun(args: string[]): { exitCode: number; output: string } {
  const child = Bun.spawnSync([process.execPath, "--no-env-file", ...args], { cwd: REPO, env: childEnv(), timeout: 120_000, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  return { exitCode: child.exitCode ?? -1, output: child.stdout.toString() + child.stderr.toString() };
}

xaravelTest(
  "XT-config-7",
  "Epic 15 closes only when the config package meets every Epic-close check (FR-20, AD-2, AD-6, AD-15, NFR-2, NFR-9): bun run api-surface:gate config exits 0; docs/config.md exists, is linked from the README, names every export of src/index.ts in backticks and has a Divergences section naming every DIV clause the config tests' adapted markers cite, and only clauses decisions/ records; every exported declaration and public method under src/ has a docblock; async-surface.json is committed and current; the README gives a reason for each package.json dependency and each ported library under src/; LICENSE keeps Laravel's MIT notice beside Xaravel's and NOTICE names the three ported libraries; and no Expectations line is blocked-by:config",
  () => {
    // Docs: the page exists, the README links it, and it names every root export.
    Assert.assertTrue(existsSync(join(DOCS, "config.md")), "docs/config.md exists");
    const readme = readFileSync(join(PACKAGE_DIR, "README.md"), "utf8");
    const pages = readdirSync(DOCS).filter((file) => file.endsWith(".md")).sort();
    for (const page of pages) {
      Assert.assertStringContainsString(`](docs/${page})`, readme, `README.md links docs/${page}`);
    }
    const docs = pages.map((page) => readFileSync(join(DOCS, page), "utf8")).join("\n");
    const names = exportedNames();
    Assert.assertNotEmpty(names, "src/index.ts exports names");
    const unnamed = names.filter((name) => !docs.includes(`\`${name}\``) && !docs.includes(`\`${name}(`) && !docs.includes(`\`${name}.`));
    Assert.assertSame("", unnamed.join(", "), `docs/ names every export of src/index.ts in backticks; missing: ${unnamed.join(", ")}`);

    // Divergences: every clause an `adapted:DIV-` marker in tests/ cites is named in the section.
    const divergences = section(readFileSync(join(DOCS, "config.md"), "utf8"), "Divergences");
    Assert.assertNotNull(divergences, "docs/config.md has a ## Divergences section");
    const clauses = new Set<string>();
    for (const file of filesUnder(join(PACKAGE_DIR, "tests"), ".ts")) {
      for (const match of readFileSync(file, "utf8").matchAll(/adapted:(DIV-\d+(?:\.\d+)?)/g)) {
        clauses.add(match[1]!);
      }
    }
    Assert.assertNotEmpty([...clauses], "the config tests cite DIV clauses");
    const unexplained = [...clauses].sort().filter((clause) => !namesClause(divergences ?? "", clause));
    Assert.assertSame("", unexplained.join(", "), `the Divergences section names every clause the config tests cite; missing: ${unexplained.join(", ")}`);

    // ...and every clause the section names exists in its Divergence Record.
    const named = [...new Set([...(divergences ?? "").matchAll(/DIV-(\d+)\.(\d+)/g)].map((match) => `DIV-${match[1]}.${match[2]}`))].sort();
    const unknown = named.filter((clause) => {
      const record = join(REPO, "decisions", `${clause.slice(0, clause.indexOf("."))}.md`);
      return !existsSync(record) || !readFileSync(record, "utf8").includes(`**${clause}**`);
    });
    Assert.assertSame("", unknown.join(", "), `every clause the Divergences section names exists in decisions/; unknown: ${unknown.join(", ")}`);

    // Docblocks: every exported declaration and public method under src/.
    const bare = undocumented();
    Assert.assertSame("", bare.join("\n"), `every exported declaration and public method in src/ has a docblock; missing: ${bare.join(", ")}`);

    // async-surface.json: committed, and what the generator gives today.
    Assert.assertTrue(existsSync(join(PACKAGE_DIR, "async-surface.json")), "packages/config/async-surface.json exists");
    const surface = bun([join(REPO, "tools", "async-surface", "async-surface.ts"), "--check", "config"]);
    Assert.assertSame(0, surface.exitCode, `async-surface --check config\n${surface.output}`);

    // README: a reason for each dependency and each ported library.
    const dependenciesSection = section(readme, "Dependencies");
    Assert.assertNotNull(dependenciesSection, "README.md has a ## Dependencies section");
    const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    const dependencies = Object.keys(manifest.dependencies ?? {}).sort();
    Assert.assertNotEmpty(dependencies, "package.json has dependencies");
    for (const dependency of dependencies) {
      const bullet = (dependenciesSection ?? "").split("\n").find((line) => line.startsWith(`- \`${dependency}\``));
      Assert.assertMatchesRegularExpression(/\):\s+\S.{10,}/, bullet ?? "", `README.md gives ${dependency} a reason`);
    }
    const librariesSection = section(readme, "Ported libraries");
    Assert.assertNotNull(librariesSection, "README.md has a ## Ported libraries section");
    const libraries = readdirSync(SRC, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    Assert.assertNotEmpty(libraries, "src/ has ported-library directories");
    for (const library of libraries) {
      const bullet = (librariesSection ?? "").split("\n").find((line) => line.startsWith("- ") && line.includes(`\`src/${library}/`));
      Assert.assertNotNull(bullet ?? null, `README.md's Ported libraries names src/${library}/`);
      // The reason follows this library's own mention, after its closing backtick and an optional parenthesis.
      Assert.assertMatchesRegularExpression(new RegExp(`\`src/${library}/[^\`]*\`\\)?:\\s+\\S.{20,}`), bullet ?? "", `README.md gives src/${library}/ a reason`);
    }

    // LICENSE: Laravel's MIT notice beside Xaravel's.
    const license = readFileSync(join(PACKAGE_DIR, "LICENSE"), "utf8");
    Assert.assertStringContainsString("The MIT License", license, "LICENSE is MIT");
    Assert.assertStringContainsString("Copyright (c) Taylor Otwell", license, "LICENSE keeps Laravel's notice");
    Assert.assertStringContainsString("Xaravel", license, "LICENSE carries Xaravel's notice");

    // NOTICE: the three ported libraries' licenses.
    Assert.assertTrue(existsSync(join(PACKAGE_DIR, "NOTICE")), "NOTICE exists");
    const notice = readFileSync(join(PACKAGE_DIR, "NOTICE"), "utf8");
    for (const library of ["vlucas/phpdotenv", "phpoption/phpoption", "graham-campbell/result-type"]) {
      Assert.assertStringContainsString(library, notice, `NOTICE names ${library}`);
    }

    // Expectations: no line anywhere is still blocked on config.
    const blocked: string[] = [];
    for (const file of filesUnder(join(REPO, "conformance", "expectations"), ".jsonl")) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (/blocked-by:config(?![\w-])/.test(line)) {
          blocked.push(`${relative(REPO, file)}:${i + 1}`);
        }
      });
    }
    Assert.assertSame("", blocked.join("\n"), `no Expectations line is blocked-by:config; found: ${blocked.join(", ")}`);

    // The API surface gate: zero unexplained members.
    const gate = bun(["run", "api-surface:gate", "config"]);
    Assert.assertSame(0, gate.exitCode, `api-surface:gate config\n${gate.output}`);
    Assert.assertStringContainsString("api-surface:gate config: 0 unexplained", gate.output, "the gate reports zero unexplained");
  },
  300_000,
);
