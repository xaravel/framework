// Xaravel Test for Story 9.10's Epic-close row (XT-runtime-37): the runtime's `docs/` describes every primitive, and
// the package commits an up-to-date `async-surface.json` (Epic 9: "docs/ describes every runtime primitive, and the
// package commits async-surface.json"). A content check, with no Oracle request: the docs are Xaravel's own.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const REPO = resolve(PACKAGE_DIR, "..", "..");
const DOCS = join(PACKAGE_DIR, "docs");

/** The pages each primitive group must have (spec 9.10, Epic close). */
const PAGES = ["scope-frames.md", "class-registry.md", "php-values.md", "codecs.md", "exceptions.md", "traits-and-inject.md"] as const;

/** The entries whose exports the docs must name: the package root and its subpaths. */
const ENTRIES = ["src/index.ts", "src/scope/index.ts", "src/registry/index.ts", "src/php/index.ts"] as const;

/**
 * Every name `entry` exports, values and types (`type X` entries included). Only `export { … } from "…"` and
 * `export { … };` lists are understood; any other export form (`export *`, `export const`, `export default`, …) throws,
 * so a new form cannot slip past the check unread.
 */
function exportedNames(entry: string): string[] {
  const source = readFileSync(join(PACKAGE_DIR, entry), "utf8");
  const lists = [...source.matchAll(/^export\s*\{([^}]*)\}\s*(?:from\s*"[^"]*"\s*)?;/gm)];
  const statements = source.match(/^export\b/gm) ?? [];
  if (lists.length !== statements.length) {
    throw new Error(`${entry}: ${statements.length - lists.length} export statement(s) in a form docs.test.ts cannot read`);
  }
  const names = new Set<string>();
  for (const match of lists) {
    for (const raw of match[1]!.split(",")) {
      const entryText = raw.trim().replace(/^type\s+/, "");
      if (entryText === "") {
        continue;
      }
      const parsed = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(entryText);
      if (parsed === null) {
        throw new Error(`${entry}: cannot read the export entry "${entryText}"`);
      }
      names.add(parsed[2] ?? parsed[1]!);
    }
  }
  return [...names];
}

xaravelTest(
  "XT-runtime-37",
  "the runtime package's docs/ has a page per primitive group, linked from its README, naming every export of src/index.ts and its subpath entries in backticks, and its committed async-surface.json is current (Epic 9 close)",
  () => {
    const present = readdirSync(DOCS).filter((file) => file.endsWith(".md"));
    for (const page of PAGES) {
      Assert.assertTrue(existsSync(join(DOCS, page)), `docs/${page} exists`);
    }
    const readme = readFileSync(join(PACKAGE_DIR, "README.md"), "utf8");
    for (const page of present) {
      Assert.assertTrue(readme.includes(`](docs/${page})`), `README.md links docs/${page}`);
    }

    const text = present.map((page) => readFileSync(join(DOCS, page), "utf8")).join("\n");
    for (const entry of ENTRIES) {
      const names = exportedNames(entry);
      Assert.assertTrue(names.length > 0, `${entry} exports names`);
      // The name itself in backticks: \`Name\` or a call \`Name(…\`.
      const missing = names.filter((name) => !text.includes(`\`${name}\``) && !text.includes(`\`${name}(`));
      Assert.assertSame("", missing.join(", "), `every export of ${entry} is named in backticks in docs/`);
    }

    // The committed async-surface.json is what the generator gives today.
    const check = Bun.spawnSync([process.execPath, "--no-env-file", join(REPO, "tools", "async-surface", "async-surface.ts"), "--check", "runtime"], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
    Assert.assertSame(0, check.exitCode, check.stdout.toString() + check.stderr.toString());
  },
  60_000,
);
