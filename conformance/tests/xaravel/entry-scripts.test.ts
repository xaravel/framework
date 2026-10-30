// Xaravel Test for the entry-script check (ESC-15.3-1, FR-20.2,
// `tools/entry-scripts/entry-scripts.ts`): every `bun` command in a
// package.json script carries `--no-env-file`. Story 15.3's XT-config-6 runs
// the same tool from the config package's tests.
import { expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkEntryScripts, commandsLackingFlag, lacksFlag, PM_SUBCOMMANDS, splitCommands } from "../../../tools/entry-scripts/entry-scripts";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "entry-scripts", "entry-scripts.ts");

const message = (file: string, name: string): string => `entry-scripts: ${file}: scripts.${name}: bun command lacks --no-env-file (FR-20.2)`;

/** A temporary root holding `package.json` files at the given repo-relative paths, each with `scripts`. */
function withRoot(files: Record<string, Record<string, string>>, body: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-entry-scripts-test-"));
  try {
    for (const [path, scripts] of Object.entries(files)) {
      const full = join(dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, `${JSON.stringify({ name: "fixture", scripts }, null, 2)}\n`);
    }
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function run(...args: string[]): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync([process.execPath, "--no-env-file", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

// XT-conformance-272
xaravelTest("XT-conformance-272", "entry-scripts:check fails each package.json script (root, skeleton/, packages/*) holding a bun command without --no-env-file before its subcommand or entry file, naming it; package-manager subcommands are exempt; scripts split on &&, ||, ; and |; ci.yml's check job runs it next to the lint; the real repository passes (ESC-15.3-1, FR-20.2)", () => {
  // The split and the per-command rule.
  expect(splitCommands("bun --no-env-file a.ts && bun b.ts || bun c.ts; bun d.ts | bun e.ts")).toEqual([
    "bun --no-env-file a.ts",
    "bun b.ts",
    "bun c.ts",
    "bun d.ts",
    "bun e.ts",
  ]);
  expect(commandsLackingFlag("bun --no-env-file a.ts && bun b.ts")).toEqual(["bun b.ts"]);
  expect(commandsLackingFlag("bun a.ts || bun --no-env-file b.ts")).toEqual(["bun a.ts"]);
  expect(commandsLackingFlag("bun --no-env-file a.ts; bun c.ts")).toEqual(["bun c.ts"]);
  expect(commandsLackingFlag("bun --no-env-file a.ts | bun d.ts")).toEqual(["bun d.ts"]);
  for (const command of ["bun test", "bun run x", "bun --bun tsc -b", "bun tools/x.ts", "bun test --no-env-file", "bun tools/x.ts --no-env-file", "bun", "X=1 bun test"]) {
    expect([command, lacksFlag(command)]).toEqual([command, true]);
  }
  for (const command of ["bun --no-env-file test", "bun --no-env-file run x", "bun --no-env-file --bun tsc -b", "bun --bun --no-env-file tsc -b", "bun --no-env-file tools/x.ts", "X=1 bun --no-env-file test", "composer install", "bunx tsc", "echo bun"]) {
    expect([command, lacksFlag(command)]).toEqual([command, false]);
  }
  expect([...PM_SUBCOMMANDS]).toEqual(["install", "add", "remove", "update", "pm", "link", "unlink", "outdated", "patch", "publish"]);
  for (const sub of PM_SUBCOMMANDS) {
    expect([sub, lacksFlag(`bun ${sub}`), lacksFlag(`bun --frozen-lockfile ${sub}`)]).toEqual([sub, false, false]);
  }

  // A root script lacking the flag fails naming it with the exact message, exit 1.
  withRoot({ "package.json": { good: "bun --no-env-file tools/x.ts", bad: "bun tools/x.ts", chained: "bun --no-env-file a.ts && bun b.ts" } }, (dir) => {
    const result = run("check", "--root", dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(`${message("package.json", "bad")}\n${message("package.json", "chained")}\n`);
    expect(checkEntryScripts(dir).violations).toEqual([message("package.json", "bad"), message("package.json", "chained")]);
  });

  // With the flag everywhere, and package-manager subcommands and non-bun commands without it, the check passes.
  withRoot({ "package.json": { test: "bun --no-env-file test", lint: "bun --no-env-file --bun oxlint && bun --no-env-file run x", deps: "bun install --frozen-lockfile && bun pm ls", php: "composer install" } }, (dir) => {
    const result = run("check", "--root", dir);
    expect([result.code, result.stderr]).toEqual([0, ""]);
    expect(result.stdout).toContain("Entry scripts OK");
  });

  // skeleton/package.json and every packages/*/package.json are scanned too; packages are reported in sorted order.
  withRoot(
    {
      "package.json": { ok: "bun --no-env-file test" },
      "skeleton/package.json": { serve: "bun app.ts" },
      "packages/zeta/package.json": { build: "bun --no-env-file build.ts" },
      "packages/alpha/package.json": { test: "bun test" },
      "elsewhere/package.json": { ignored: "bun test" },
    },
    (dir) => {
      const result = run("check", "--root", dir);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe(`${message("skeleton/package.json", "serve")}\n${message("packages/alpha/package.json", "test")}\n`);
    },
  );

  // Fail closed: no root package.json, or a script value that is not a string.
  withRoot({ "skeleton/package.json": { ok: "bun --no-env-file test" } }, (dir) => {
    expect(run("check", "--root", dir).code).toBe(1);
  });
  withRoot({}, (dir) => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { odd: 1 } }));
    expect(run("check", "--root", dir).code).toBe(1);
  });

  // Usage errors exit 2.
  expect(run().code).toBe(2);
  expect(run("lint").code).toBe(2);
  expect(run("check", "--root").code).toBe(2);
  expect(run("check", "--bogus").code).toBe(2);

  // The root script and ci.yml's check job, which runs it right after the lint.
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["entry-scripts:check"]).toBe("bun --no-env-file tools/entry-scripts/entry-scripts.ts check");
  const ci = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as { jobs: Record<string, { steps: { run?: string }[] }> };
  const runs = ci.jobs["check"]!.steps.map((step) => step.run ?? "");
  expect(runs.indexOf("bun run entry-scripts:check")).toBe(runs.indexOf("bun run lint") + 1);

  // The real repository passes.
  const real = run("check");
  expect([real.code, real.stderr]).toEqual([0, ""]);
});
