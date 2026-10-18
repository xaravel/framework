// Xaravel Tests for Story 2.1 (Upstream snapshot and Pin record, FR-1, AD-15).
// These run under plain `bun test` until the harness lands in Epic 5. Every
// remote is a hermetic `file://` fixture; nothing here touches the network.
import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  check,
  frameworkTag,
  parsePin,
  readPin,
  readUpstream,
  treeHash,
  UPSTREAM_REPOS,
  upstreamPath,
} from "../../../tools/upstream/upstream";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "upstream", "upstream.ts");
const SHA = /^[0-9a-f]{40}$/;

/** A hermetic environment for the fixture's own git calls: no system or global config. */
function gitEnv(home: string): Record<string, string> {
  return {
    PATH: process.env["PATH"] ?? "",
    HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
}

function git(cwd: string, home: string, ...args: string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd, env: gitEnv(home), stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString().trim();
}

/** Writes `files` under `dir`; a value `{ link }` is a symlink, `{ exec }` an executable file. */
type Spec = Record<string, string | { link: string } | { exec: string }>;
function writeTree(dir: string, files: Spec): void {
  for (const [path, value] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    if (typeof value === "string") {
      writeFileSync(full, value);
    } else if ("link" in value) {
      symlinkSync(value.link, full);
    } else {
      writeFileSync(full, value.exec);
      chmodSync(full, 0o755);
    }
  }
}

/** Makes everything under `dir` writable again, so a read-only snapshot can be edited or removed. */
function writable(dir: string): void {
  if (existsSync(dir)) {
    Bun.spawnSync(["chmod", "-R", "u+w", dir]);
  }
}

const FRAMEWORK: Spec = {
  "composer.json": '{"name": "laravel/framework"}\n',
  "a.b": "dot\n",
  "a/x.php": "<?php\n",
  "a-b": "dash\n",
  "src/Illuminate/Support/Str.php": "<?php\nclass Str {}\n",
  "src/Illuminate/Support/Arr.php": "<?php\nclass Arr {}\n",
  "tests/Support/SupportStrTest.php": "<?php\n// test\n",
  "bin/release.sh": { exec: "#!/bin/sh\necho release\n" },
  "link-to-str": { link: "src/Illuminate/Support/Str.php" },
  "crlf.txt": "line one\r\nline two\r\n",
};

interface Fixture {
  dir: string;
  home: string;
  /** The fixture repository root, with `conformance/baseline-pin`. */
  repo: string;
  /** The remote base: `<base>/laravel/<name>.git` are the fixture remotes. */
  base: string;
  tags: Record<string, string>;
}

/** Four fixture remotes, each with one tagged commit, and a repository root whose pin records them. */
function fixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-upstream-"));
  const home = join(dir, "home");
  const repo = join(dir, "repo");
  const base = join(dir, "remotes");
  mkdirSync(home);
  mkdirSync(join(repo, "conformance"), { recursive: true });
  const tags: Record<string, string> = { framework: "v13.37.0", ai: "v1.2.3", mcp: "v1.0.2", boost: "v2.10.3" };
  const lines = ["# fixture pin"];
  for (const { repo: name, name: short } of UPSTREAM_REPOS) {
    const remote = join(base, `${name}.git`);
    mkdirSync(remote, { recursive: true });
    git(remote, home, "init", "--quiet");
    writeTree(remote, short === "framework" ? FRAMEWORK : { ".gitattributes": "* text=auto\n", "composer.json": `{"name": "${name}"}\n`, "src/Thing.php": "<?php\n" });
    git(remote, home, "add", "-A");
    git(remote, home, "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "release");
    git(remote, home, "-c", "tag.gpgsign=false", "tag", tags[short]!);
    lines.push(`${name} ${tags[short]} ${git(remote, home, "rev-parse", "HEAD")} ${git(remote, home, "rev-parse", "HEAD^{tree}")}`);
  }
  writeFileSync(join(repo, "conformance", "baseline-pin"), `${lines.join("\n")}\n`);
  return { dir, home, repo, base, tags };
}

async function withFixture(body: (fx: Fixture) => Promise<void>): Promise<void> {
  const fx = fixture();
  try {
    await body(fx);
  } finally {
    writable(fx.dir);
    rmSync(fx.dir, { recursive: true, force: true });
  }
}

async function run(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

const syncCli = (fx: Fixture, env: Record<string, string> = {}) =>
  run(["sync", "--remote", `file://${fx.base}`, "--root", fx.repo], { PATH: process.env["PATH"] ?? "", HOME: fx.home, ...env });
const checkCli = (fx: Fixture, env: Record<string, string> = {}) =>
  run(["check", "--root", fx.repo], { PATH: process.env["PATH"] ?? "", HOME: fx.home, ...env });

const snapshot = (fx: Fixture, name: string): string => join(fx.repo, "conformance", "upstream", name);

test("XT-conformance-39: bun run upstream:sync checks out each of the four repos at its pinned tag into conformance/upstream/{framework,ai,mcp,boost}/ (FR-1, AD-15)", async () => {
  // The repository's pin: exactly four entries, at the recorded tags, with full SHAs.
  const pin = readPin(root);
  expect(pin.map((entry) => [entry.repo, entry.tag])).toEqual([
    ["laravel/framework", "v13.37.0"],
    ["laravel/ai", "v1.2.3"],
    ["laravel/mcp", "v1.0.2"],
    ["laravel/boost", "v2.10.3"],
  ]);
  for (const entry of pin) {
    expect(entry.commit).toMatch(SHA);
    expect(entry.tree).toMatch(SHA);
  }
  expect(frameworkTag(root)).toBe("v13.37.0");

  // The wiring: scripts, gitignore, typecheck and lint exclusions, the CI job.
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["upstream:sync"]).toBe("bun tools/upstream/upstream.ts sync");
  expect(scripts["upstream:check"]).toBe("bun tools/upstream/upstream.ts check");
  expect(readFileSync(join(root, ".gitignore"), "utf8").split("\n")).toContain("/conformance/upstream/");
  const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as { include: string[]; exclude: string[] };
  expect(tsconfig.include).toContain("tools/upstream/**/*.ts");
  expect(tsconfig.exclude).toEqual(["conformance/upstream"]);
  const oxlint = JSON.parse(readFileSync(join(root, ".oxlintrc.json"), "utf8")) as { ignorePatterns: string[] };
  expect(oxlint.ignorePatterns).toContain("conformance/upstream/**");
  const ci = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as {
    jobs: Record<string, Record<string, unknown> & { steps: { uses?: string; with?: Record<string, unknown>; run?: string }[] }>;
  };
  const job = ci.jobs["upstream"]!;
  expect(job.permissions).toBeUndefined();
  expect(job.steps.map((step) => step.run).filter((step) => step !== undefined)).toEqual([
    "bun run upstream:sync",
    "bun run upstream:check",
    "bun run scan:facades --check",
    "bun run scan:singletons --check",
    "bun test conformance/tests/xaravel/scans.test.ts",
  ]);
  expect(job.steps[0]).toEqual({ uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", with: { "persist-credentials": false } });
  for (const node of [job, ...job.steps]) {
    expect(node["continue-on-error" as keyof typeof node]).toBeUndefined();
    expect(node["if" as keyof typeof node]).toBeUndefined();
  }

  await withFixture(async (fx) => {
    // Fresh sync: four read-only directories, without .git, holding the tagged trees.
    const fresh = await syncCli(fx);
    expect(fresh.stderr).toBe("");
    expect(fresh.code).toBe(0);
    expect(readdirSync(join(fx.repo, "conformance", "upstream")).sort()).toEqual(["ai", "boost", "framework", "mcp"]);
    for (const { repo, name } of UPSTREAM_REPOS) {
      expect(fresh.stdout).toContain(`${repo} ${fx.tags[name]}: synced conformance/upstream/${name}`);
      expect(existsSync(join(snapshot(fx, name), ".git"))).toBe(false);
      expect(lstatSync(snapshot(fx, name)).mode & 0o222).toBe(0);
      expect(lstatSync(join(snapshot(fx, name), "composer.json")).mode & 0o222).toBe(0);
      expect(lstatSync(join(snapshot(fx, name), "src")).mode & 0o222).toBe(0);
    }
    const framework = snapshot(fx, "framework");
    expect(readFileSync(join(framework, "src/Illuminate/Support/Str.php"), "utf8")).toBe("<?php\nclass Str {}\n");
    expect(readFileSync(join(framework, "crlf.txt"), "utf8")).toBe("line one\r\nline two\r\n");
    expect(lstatSync(join(framework, "bin/release.sh")).mode & 0o100).toBe(0o100);
    expect(lstatSync(join(framework, "link-to-str")).isSymbolicLink()).toBe(true);
    expect((await checkCli(fx)).code).toBe(0);

    // Already synced: nothing is fetched, even with every remote gone.
    renameSync(fx.base, `${fx.base}-gone`);
    const again = await syncCli(fx);
    expect(again.code).toBe(0);
    for (const { repo, name } of UPSTREAM_REPOS) {
      expect(again.stdout).toContain(`${repo} ${fx.tags[name]}: conformance/upstream/${name} is up to date`);
    }
    renameSync(`${fx.base}-gone`, fx.base);

    // An up-to-date sync restores read-only after a `chmod -R u+w`.
    writable(snapshot(fx, "framework"));
    expect(lstatSync(join(snapshot(fx, "framework"), "composer.json")).mode & 0o200).toBe(0o200);
    expect((await syncCli(fx)).code).toBe(0);
    for (const path of ["", "composer.json", "src", "src/Illuminate/Support/Str.php"]) {
      expect([path, lstatSync(join(snapshot(fx, "framework"), path)).mode & 0o222]).toEqual([path, 0]);
    }

    // A stale temp clone from a killed sync is removed by the next sync, even when read-only.
    const stale = join(fx.repo, "conformance", "upstream", ".ai.tmp-STALE");
    mkdirSync(join(stale, "src"), { recursive: true });
    writeFileSync(join(stale, "src", "x.php"), "<?php\n");
    Bun.spawnSync(["chmod", "-R", "a-w", stale]);
    expect((await syncCli(fx)).code).toBe(0);
    expect(existsSync(stale)).toBe(false);

    // Tag moved: the remote tag now resolves to another commit. Sync fails naming the repo,
    // leaves the old (here locally edited) directory as it was, and removes the temp clone.
    const remote = join(fx.base, "laravel", "ai.git");
    writeFileSync(join(remote, "src", "Thing.php"), "<?php\n// moved\n");
    git(remote, fx.home, "-c", "commit.gpgsign=false", "commit", "--quiet", "-am", "moved");
    git(remote, fx.home, "-c", "tag.gpgsign=false", "tag", "-f", fx.tags["ai"]!);
    const ai = snapshot(fx, "ai");
    writable(ai);
    writeFileSync(join(ai, "local.txt"), "a local edit\n");
    const moved = await syncCli(fx);
    expect(moved.code).toBe(1);
    expect(moved.stderr).toContain(`laravel/ai ${fx.tags["ai"]}: tag ${fx.tags["ai"]} resolves to commit ${git(remote, fx.home, "rev-parse", "HEAD")}`);
    expect(moved.stderr).not.toContain("laravel/framework");
    expect(readFileSync(join(ai, "local.txt"), "utf8")).toBe("a local edit\n");
    expect(readFileSync(join(ai, "src", "Thing.php"), "utf8")).toBe("<?php\n");
    expect(readdirSync(join(fx.repo, "conformance", "upstream")).sort()).toEqual(["ai", "boost", "framework", "mcp"]);
  });

  // A user's CRLF settings (core.autocrlf=true, core.eol=crlf) do not rewrite `* text=auto` files on checkout.
  await withFixture(async (fx) => {
    writeFileSync(join(fx.home, ".gitconfig"), "[core]\n\tautocrlf = true\n\teol = crlf\n");
    const synced = await syncCli(fx);
    expect(synced.stderr).toBe("");
    expect(synced.code).toBe(0);
    expect(readFileSync(join(snapshot(fx, "ai"), "composer.json"), "utf8")).toBe('{"name": "laravel/ai"}\n');
    expect(check(fx.repo).problems).toEqual([]);
    expect(treeHash(snapshot(fx, "ai"))).toBe(readPin(fx.repo)[1]!.tree);
  });

  // Bad pins fail naming the file and the line.
  const good = "laravel/framework v13.37.0 " + "1".repeat(40) + " " + "2".repeat(40);
  const rest = ["laravel/ai v1.2.3", "laravel/mcp v1.0.2", "laravel/boost v2.10.3"].map((line) => `${line} ${"3".repeat(40)} ${"4".repeat(40)}`);
  const pinText = (...lines: string[]): string => `${lines.join("\n")}\n`;
  expect(parsePin(pinText("# c", good, "", ...rest)).map((entry) => entry.name)).toEqual(["framework", "ai", "mcp", "boost"]);
  const bad: [string, string][] = [
    ["", "conformance/baseline-pin is empty"],
    ["# only a comment\n\n", "conformance/baseline-pin is empty"],
    [pinText("# c", "laravel/framework v13.37.0", ...rest), 'conformance/baseline-pin:2: expected "<repo> <tag> <commit> <tree>"'],
    [pinText(good, ...rest, good), "conformance/baseline-pin:5: duplicate entry for laravel/framework"],
    [pinText(good, ...rest.slice(1)), "conformance/baseline-pin: missing entry for laravel/ai"],
    [pinText(good, ...rest, `laravel/horizon v5.0.0 ${"1".repeat(40)} ${"2".repeat(40)}`), 'conformance/baseline-pin:5: unknown repository "laravel/horizon"'],
    [pinText(good.replace("1".repeat(40), "ABC"), ...rest), "conformance/baseline-pin:1: laravel/framework commit"],
    [pinText(good.replace("2".repeat(40), "2".repeat(39)), ...rest), "conformance/baseline-pin:1: laravel/framework tree"],
    [pinText(good.replace("v13.37.0", "--upload-pack=x"), ...rest), "conformance/baseline-pin:1: laravel/framework tag"],
  ];
  for (const [text, message] of bad) {
    expect(() => parsePin(text)).toThrow(message);
  }
  await withFixture(async (fx) => {
    writeFileSync(join(fx.repo, "conformance", "baseline-pin"), pinText(good, ...rest, good));
    const dup = await syncCli(fx);
    expect(dup.code).toBe(1);
    expect(dup.stderr).toContain("conformance/baseline-pin:5: duplicate entry for laravel/framework");
    rmSync(join(fx.repo, "conformance", "baseline-pin"));
    for (const result of [await syncCli(fx), await checkCli(fx)]) {
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("conformance/baseline-pin does not exist");
    }
    expect(existsSync(join(fx.repo, "conformance", "upstream"))).toBe(false);
  });
});

test("XT-conformance-40: each snapshot directory's tree hash matches the pin, and any local modification fails the snapshot check (FR-1, AD-15)", async () => {
  // treeHash is git's own: nested dirs, `a.b` before `a/`, the exec bit, a symlink, CRLF bytes.
  const dir = mkdtempSync(join(tmpdir(), "xaravel-tree-"));
  try {
    const work = join(dir, "work");
    const home = join(dir, "home");
    mkdirSync(home);
    writeTree(work, FRAMEWORK);
    git(dir, home, "--git-dir", join(dir, "git"), "--work-tree", work, "init", "--quiet");
    git(dir, home, "--git-dir", join(dir, "git"), "--work-tree", work, "add", "-A");
    expect(treeHash(work)).toBe(git(dir, home, "--git-dir", join(dir, "git"), "--work-tree", work, "write-tree"));
    const empty = join(dir, "empty");
    mkdirSync(empty);
    expect(treeHash(empty)).toBe("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  await withFixture(async (fx) => {
    expect((await syncCli(fx)).code).toBe(0);
    const ok = await checkCli(fx);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("Upstream snapshot OK: 4 directories verified.");
    expect(check(fx.repo).problems).toEqual([]);
    const framework = snapshot(fx, "framework");
    const expected = readPin(fx.repo)[0]!.tree;

    const edits: [string, () => void][] = [
      ["a changed file", () => writeFileSync(join(framework, "composer.json"), '{"name": "edited"}\n')],
      ["an added file", () => writeFileSync(join(framework, "src", "New.php"), "<?php\n")],
      ["a removed file", () => rmSync(join(framework, "a-b"))],
      ["an added empty directory", () => mkdirSync(join(framework, "src", "Empty"))],
      ["a changed exec bit", () => chmodSync(join(framework, "bin", "release.sh"), 0o644)],
    ];
    for (const [what, edit] of edits) {
      writable(framework);
      edit();
      const actual = treeHash(framework);
      expect(actual).not.toBe(expected);
      const failed = await checkCli(fx);
      expect([what, failed.code]).toEqual([what, 1]);
      expect(failed.stderr).toContain(`conformance/upstream/framework (laravel/framework v13.37.0) is modified: expected tree ${expected}, actual ${actual}`);
      expect(failed.stderr).not.toContain("conformance/upstream/ai");
      // The next sync replaces the directory.
      const restored = await syncCli(fx);
      expect(restored.code).toBe(0);
      expect(restored.stdout).toContain("laravel/framework v13.37.0: synced conformance/upstream/framework");
      expect(restored.stdout).toContain("laravel/ai v1.2.3: conformance/upstream/ai is up to date");
      expect((await checkCli(fx)).code).toBe(0);
    }

    // Unexpected entries in conformance/upstream/ fail the check, each named.
    const upstream = join(fx.repo, "conformance", "upstream");
    mkdirSync(join(upstream, ".boost.tmp-abc123"));
    mkdirSync(join(upstream, "horizon"));
    const extra = await checkCli(fx);
    expect(extra.code).toBe(1);
    expect(extra.stderr).toContain("conformance/upstream/.boost.tmp-abc123 is a stale temp clone; run bun run upstream:sync to remove it");
    expect(extra.stderr).toContain("conformance/upstream/horizon is not in conformance/baseline-pin; remove it");
    expect(extra.stderr).not.toContain("conformance/upstream/framework");
    rmSync(join(upstream, ".boost.tmp-abc123"), { recursive: true });
    rmSync(join(upstream, "horizon"), { recursive: true });
    expect((await checkCli(fx)).code).toBe(0);

    // A missing directory fails with the sync hint.
    writable(snapshot(fx, "mcp"));
    rmSync(snapshot(fx, "mcp"), { recursive: true });
    const missing = await checkCli(fx);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("conformance/upstream/mcp (laravel/mcp v1.0.2) is missing; run bun run upstream:sync");
  });
});

test("XT-conformance-41: with no network, tools read Upstream source only from conformance/upstream/ and never fetch; the check and the reader never run git (FR-1, AD-15)", async () => {
  await withFixture(async (fx) => {
    expect((await syncCli(fx)).code).toBe(0);

    // A fake git first on PATH records every call.
    const bin = join(fx.dir, "fake-bin");
    const log = join(fx.dir, "git-calls.log");
    mkdirSync(bin);
    writeFileSync(join(bin, "git"), `#!/bin/sh\necho "git $*" >> "${log}"\nexit 1\n`);
    chmodSync(join(bin, "git"), 0o755);
    const offline = { PATH: `${bin}:${process.env["PATH"] ?? ""}` };

    const checked = await checkCli(fx, offline);
    expect(checked.code).toBe(0);
    const script = join(fx.dir, "reader.ts");
    writeFileSync(
      script,
      [
        `import { check, readUpstream } from ${JSON.stringify(join(root, "tools", "upstream", "upstream.ts"))};`,
        `const root = ${JSON.stringify(fx.repo)};`,
        `process.stdout.write(readUpstream(root, "framework", "src/Illuminate/Support/Str.php"));`,
        `process.stdout.write(String(check(root).problems.length));`,
      ].join("\n"),
    );
    const reader = Bun.spawnSync([process.execPath, script], { cwd: fx.dir, env: { ...offline, HOME: fx.home }, stdout: "pipe", stderr: "pipe" });
    expect(reader.stderr.toString()).toBe("");
    expect(reader.stdout.toString()).toBe("<?php\nclass Str {}\n0");
    expect(existsSync(log)).toBe(false);

    // The fake records calls: a sync that must fetch goes through it.
    writable(snapshot(fx, "boost"));
    writeFileSync(join(snapshot(fx, "boost"), "local.txt"), "x\n");
    expect((await syncCli(fx, offline)).code).toBe(1);
    expect(readFileSync(log, "utf8")).toContain("clone");

    // The reader stays inside the snapshot.
    expect(readUpstream(fx.repo, "ai", "composer.json")).toBe('{"name": "laravel/ai"}\n');
    expect(upstreamPath(fx.repo, "framework", "a/x.php")).toBe(join(snapshot(fx, "framework"), "a", "x.php"));
    expect(() => readUpstream(fx.repo, "framework", "../x")).toThrow("is outside conformance/upstream/framework");
    expect(() => readUpstream(fx.repo, "framework", "../ai/composer.json")).toThrow("is outside");
    expect(() => readUpstream(fx.repo, "framework", "/etc/hosts")).toThrow("is outside");
    expect(() => readUpstream(fx.repo, "horizon", "composer.json")).toThrow('unknown Upstream "horizon"');
    writable(snapshot(fx, "framework"));
    symlinkSync("../ai/composer.json", join(snapshot(fx, "framework"), "escape"));
    expect(() => readUpstream(fx.repo, "framework", "escape")).toThrow("resolves outside");
    writable(snapshot(fx, "mcp"));
    rmSync(snapshot(fx, "mcp"), { recursive: true });
    expect(() => readUpstream(fx.repo, "mcp", "composer.json")).toThrow("conformance/upstream/mcp is missing; run bun run upstream:sync");
  });
});
