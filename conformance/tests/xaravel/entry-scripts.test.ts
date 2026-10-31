// Xaravel Test for the entry-script check (ESC-15.3-1, FR-20.2,
// `tools/entry-scripts/entry-scripts.ts`): every `bun` command in a
// package.json script carries `--no-env-file`. Story 15.3's XT-config-6 runs
// the same tool from the config package's tests.
import { expect } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkEntryScripts, checkPackageJson, commandsLackingFlag, lacksFlag, packageFiles, PM_SUBCOMMANDS, splitCommands } from "../../../tools/entry-scripts/entry-scripts";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "entry-scripts", "entry-scripts.ts");

const message = (file: string, name: string): string => `entry-scripts: ${file}: scripts.${name}: bun command lacks --no-env-file (FR-20.2)`;

/**
 * A temporary root holding `package.json` files at the given repo-relative paths, each with `scripts`, and a root
 * `bunfig.toml` holding `bunfig` (by default the repository's `env = false`; null writes none).
 */
function withRoot(files: Record<string, Record<string, string>>, body: (dir: string) => void, bunfig: string | null = "env = false\n"): void {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-entry-scripts-test-"));
  try {
    if (bunfig !== null) {
      writeFileSync(join(dir, "bunfig.toml"), bunfig);
    }
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

const binMessage = (file: string, name: string): string =>
  `entry-scripts: ${file}: scripts.${name}: bunx or a package bin cannot carry --no-env-file; Bun's .env autoload reaches its child process (FR-20.2)`;
const unreadable = (file: string, name: string, reason: string): string => `entry-scripts: ${file}: scripts.${name}: cannot be read as a shell command: ${reason} (FR-20.2)`;

/** Runs `argv` in `cwd` with a clean environment holding only PATH (Bun's directory first) and HOME (`home`); returns its trimmed stdout. */
function bunIn(cwd: string, argv: string[], home: string): string {
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home };
  const proc = Bun.spawnSync(argv, { cwd, env, stdout: "pipe", stderr: "pipe" });
  return `${proc.stdout.toString().trim()}${proc.exitCode === 0 ? "" : ` (exit ${proc.exitCode}: ${proc.stderr.toString().trim()})`}`;
}

// XT-conformance-273
xaravelTest("XT-conformance-273", "entry-scripts:check reads each script as a quote-aware shell script: env/exec/time/command/nohup wrappers, NAME=value prefixes with quoted values, path-qualified bun, subshells, groups, $( ), backticks and sh -c are all checked, quoted text is not; bunx and package-bin launches fail outside the root package.json (where bunfig.toml env = false does not reach, proved by running them) and pass in it; an unreadable script and a non-array workspaces fail closed; every workspaces glob's package.json is read except under node_modules/ or fixtures/ (epic 15 retro L1, ESC-15.3-1, FR-20.2)", () => {
  // Wrappers, prefixes, paths, subshells and substitutions: each lacks the flag.
  const lacking = [
    "env A=1 bun test",
    "env -i -u X bun t.ts",
    "exec bun test",
    "time -p bun test",
    "command bun t.ts",
    "nohup bun t.ts",
    "A='x y' bun test",
    'A="a;b" bun test',
    "./node_modules/.bin/bun test",
    "/usr/bin/bun t.ts",
    "(bun test)",
    "{ bun test; }",
    "echo $(bun x.ts)",
    "echo `bun x.ts`",
    'echo "$(bun x.ts)"',
    "sh -c 'bun t.ts'",
    "bun --no-env-file a.ts & bun b.ts",
    "time bun test",
    "time -o out bun t.ts",
    "time -f fmt bun t.ts",
    "env -S 'bun t.ts'",
    "env -S'bun t.ts'",
    "bun --no-env-file exec 'bun t.ts'",
    "cat <(bun t.ts)",
    "bun t.ts |& cat",
    "A=1 \\\n bun t.ts",
    "env \\\n bun t.ts",
    "echo ${X:-$(bun a.ts)}",
    "echo $(( $(bun a.ts) + 1 ))",
    'echo "${X:-`bun a.ts`}"',
    "bash -O extglob -c 'bun t.ts'",
    "function f { bun t.ts; }",
  ];
  for (const command of lacking) {
    expect([command, lacksFlag(command)]).toEqual([command, true]);
  }
  // Quoted text and redirections: no bun command lacks it.
  for (const command of ['echo "bun t.ts; bun u.ts"', "echo 'bun x'", "2>&1 bun --no-env-file t.ts", "env A=1 bun --no-env-file test", "/usr/bin/bun --no-env-file t.ts", "echo $(bun --no-env-file x.ts)", "command -v bun"]) {
    expect([command, lacksFlag(command)]).toEqual([command, false]);
  }
  expect(splitCommands('A="a;b" bun test && (bun --no-env-file t.ts) | echo "x|y"')).toEqual(['A="a;b" bun test', "bun --no-env-file t.ts", 'echo "x|y"']);
  expect(commandsLackingFlag("bun --no-env-file a.ts & bun b.ts")).toEqual(["bun b.ts"]);

  // Through the CLI over a fixture root: one script per matrix input, exact lines, exit 1.
  const names = lacking.map((_, i) => `l${String(i).padStart(2, "0")}`);
  const passing = { q1: 'echo "bun t.ts; bun u.ts"', q2: "echo 'bun x'", q3: "2>&1 bun --no-env-file t.ts", q4: "command -v bun" };
  withRoot({ "package.json": { ...Object.fromEntries(lacking.map((command, i) => [names[i]!, command])), ...passing } }, (dir) => {
    const result = run("check", "--root", dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(names.map((name) => `${message("package.json", name)}\n`).join(""));
  });
  withRoot({ "package.json": passing }, (dir) => {
    const result = run("check", "--root", dir);
    expect([result.code, result.stderr]).toEqual([0, ""]);
  });

  // Bin forms: a violation in a workspace package, a pass in the root; non-bins pass in both.
  const bins = { a: "bunx tsc", b: "bun --no-env-file x tsc", c: "bun --no-env-file --bun tsc", d: "bun --no-env-file run tsc" };
  const notBins = { e: "bun --no-env-file run other", other: "bun --no-env-file test", g: "bun --no-env-file src/x.ts", h: "bun --no-env-file x.mjs", i: "bun --no-env-file index.html" };
  withRoot({ "package.json": { ...bins, ...notBins }, "packages/a/package.json": { ...bins, ...notBins } }, (dir) => {
    const result = run("check", "--root", dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(["a", "b", "c", "d"].map((name) => `${binMessage("packages/a/package.json", name)}\n`).join(""));
  });
  // In the root they pass only when the root's bunfig.toml sets env = false at its top level, and the script does not change directory.
  withRoot({ "packages/a/package.json": notBins, "package.json": bins }, (dir) => {
    writeFileSync(join(dir, "bunfig.toml"), "# root\nenv = false\n[test]\nroot = \".\"\n");
    const result = run("check", "--root", dir);
    expect([result.code, result.stderr]).toEqual([0, ""]);
  });
  const rootBinLines = ["a", "b", "c", "d"].map((name) => `${binMessage("package.json", name)}\n`).join("");
  for (const bunfig of [null, "env = true\n", "[run]\nenv = false\n"]) {
    withRoot(
      { "package.json": bins },
      (dir) => {
        const result = run("check", "--root", dir);
        expect([bunfig, result.code, result.stderr]).toEqual([bunfig, 1, rootBinLines]);
      },
      bunfig,
    );
  }
  const moving = { m1: "cd x && bunx tsc", m2: "pushd x; bunx tsc", m3: "bun --cwd packages/a --no-env-file x tsc", m4: "bun --no-env-file run --cwd x tsc", ok: "bunx tsc" };
  withRoot({ "package.json": moving }, (dir) => {
    const result = run("check", "--root", dir);
    expect([result.code, result.stderr]).toEqual([1, ["m1", "m2", "m3", "m4"].map((name) => `${binMessage("package.json", name)}\n`).join("")]);
  });
  // A bin form lacking the flag in a package reports both rules, in that order.
  expect(checkPackageJson("packages/a/package.json", JSON.stringify({ scripts: { t: "bun --bun tsc" } })).violations).toEqual([
    message("packages/a/package.json", "t"),
    binMessage("packages/a/package.json", "t"),
  ]);

  // Unreadable scripts fail closed.
  const unreadables: [string, string][] = [
    ['bun "a.ts', "unterminated double quote"],
    ["echo $(bun a.ts", "unterminated $( substitution"],
    ["bun a.ts)", "unmatched )"],
    ["bun --no-env-file a.ts >", "a redirection has no target"],
    ["cat <<EOF", "here-documents are not read"],
    ["(bun --no-env-file a.ts", "unterminated ("],
    ["$BUN t.ts", "a command name built from an expansion"],
    ["${BUN:-bun} t.ts", "a command name built from an expansion"],
    ['"$(which bun)" t.ts', "a command name built from an expansion"],
    ["`which bun` t.ts", "a command name built from an expansion"],
  ];
  withRoot({ "package.json": Object.fromEntries(unreadables.map(([script], i) => [`u${i}`, script])) }, (dir) => {
    const result = run("check", "--root", dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(unreadables.map(([, reason], i) => `${unreadable("package.json", `u${i}`, reason)}\n`).join(""));
  });

  // Workspaces: every glob's package.json is read, except under node_modules/ or fixtures/; the object form too.
  const workspaceRoot = (workspaces: unknown, body: (dir: string) => void): void =>
    withRoot({ "tools/t/package.json": { t: "bun t.ts" }, "tools/t/fixtures/x/package.json": { x: "bun x.ts" }, "tools/node_modules/package.json": { n: "bun n.ts" } }, (dir) => {
      writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "fixture", workspaces, scripts: { ok: "bun --no-env-file test" } })}\n`);
      body(dir);
    });
  for (const workspaces of [["tools/*"], ["tools/**"], { packages: ["tools/*"] }]) {
    workspaceRoot(workspaces, (dir) => {
      const result = run("check", "--root", dir);
      expect([JSON.stringify(workspaces), result.code, result.stderr]).toEqual([JSON.stringify(workspaces), 1, `${message("tools/t/package.json", "t")}\n`]);
      expect(packageFiles(dir)).toEqual(["package.json", "tools/t/package.json"]);
    });
  }
  workspaceRoot(["tools/*", "!tools/t"], (dir) => {
    expect(packageFiles(dir)).toEqual(["package.json"]);
    expect([run("check", "--root", dir).code]).toEqual([0]);
  });
  for (const workspaces of [3, "tools/*", [1], { packages: "tools/*" }, { packages: null }]) {
    workspaceRoot(workspaces, (dir) => {
      const result = run("check", "--root", dir);
      expect([JSON.stringify(workspaces), result.code, result.stderr]).toEqual([
        JSON.stringify(workspaces),
        1,
        "entry-scripts: package.json: workspaces is not an array of glob strings or an object whose packages is one (FR-20.2)\n",
      ]);
    });
  }

  // Why root bin launches pass and package ones fail, run on Bun: a fake bin printing a .env key, a .env beside the root
  // and the package; with the root bunfig.toml's env = false the root's launches see no key, the package's see it.
  const dir = mkdtempSync(join(tmpdir(), "xaravel-entry-scripts-bins-"));
  try {
    mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
    mkdirSync(join(dir, "packages", "a"), { recursive: true });
    writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "fixture", private: true, workspaces: ["packages/*"] })}\n`);
    writeFileSync(join(dir, "packages", "a", "package.json"), `${JSON.stringify({ name: "a", private: true })}\n`);
    const bin = join(dir, "node_modules", ".bin", "xt-show-env");
    writeFileSync(bin, `#!${process.execPath}\nconsole.log(\`key=\${process.env["XT_ENTRY_SCRIPTS_KEY"] ?? "none"}\`);\n`);
    chmodSync(bin, 0o755);
    writeFileSync(join(dir, ".env"), "XT_ENTRY_SCRIPTS_KEY=leaked\n");
    writeFileSync(join(dir, "packages", "a", ".env"), "XT_ENTRY_SCRIPTS_KEY=leaked\n");
    const launches = [["x", "xt-show-env"], ["--no-env-file", "x", "xt-show-env"], ["--no-env-file", "--bun", "xt-show-env"], ["--no-env-file", "run", "xt-show-env"]].map((args) => [process.execPath, ...args]);
    const bunx = join(dirname(process.execPath), "bunx");
    if (existsSync(bunx)) {
      launches.push([bunx, "xt-show-env"]);
    }
    const seen = (cwd: string): string[][] => launches.map((argv) => [argv.join(" "), bunIn(cwd, argv, dir)]);
    // Without bunfig.toml the root leaks too, so it is env = false that covers the root.
    expect(seen(dir)).toEqual(launches.map((argv) => [argv.join(" "), "key=leaked"]));
    writeFileSync(join(dir, "bunfig.toml"), "env = false\n");
    expect(seen(dir)).toEqual(launches.map((argv) => [argv.join(" "), "key=none"]));
    expect(seen(join(dir, "packages", "a"))).toEqual(launches.map((argv) => [argv.join(" "), "key=leaked"]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // The real repository, now read with every workspace, passes.
  const real = run("check");
  expect([real.code, real.stderr]).toEqual([0, ""]);
});
