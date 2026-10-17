// Xaravel Tests for Story 2.8 (Baseline Pin bump tool, FR-7, UJ-7;
// decisions/ESC-2.8-1.md). These run under plain `bun test` until the harness
// lands in Epic 5. Every test runs the CLI against a hermetic temp root: a git
// repository whose commits hold `conformance/baseline-pin` and
// `conformance/inventory/*.jsonl`, fixture AD-15 Expectations shards, a fixture
// sprint status and, for move mode, local `file://` remotes. Nothing here
// touches the network.
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { UPSTREAM_REPOS } from "../../../tools/upstream/upstream";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "pin-bump", "pin-bump.ts");

// ---------------------------------------------------------------------------
// Fixture

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
  const proc = Bun.spawnSync(["git", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], { cwd, env: gitEnv(home), stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString().trim();
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/** One Inventory line, keys in the Inventory's order. */
function entry(id: string, component: string, hash: string): string {
  const file = id.includes("/tests/") ? `${id.split("::")[0]}` : `framework/tests/${component}/X.php`;
  return JSON.stringify({ id, component, kind: "unit", backends: ["none"], source: `${file}:1-2`, hash: hash.repeat(64), assertions: null, oracle: {} });
}

/** An Inventory file's text, sorted by id. */
function inventory(lines: string[]): string {
  return lines
    .map((line) => ({ line, id: (JSON.parse(line) as { id: string }).id }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ line }) => `${line}\n`)
    .join("");
}

/** One AD-15 Expectations line. */
function expectation(id: string, variant: string, status: string, reason: string | null, adapted: string | null = null, escalation: string | null = null): string {
  return JSON.stringify({ id, variant, status, reason, adapted, escalation });
}

const SUPPORT = "Illuminate\\Tests\\Support\\SupportStrTest";
const BUS = "Illuminate\\Tests\\Bus\\BusTest";
const AI = "ai/tests/Feature/AgentTest.php";

const SPRINT_DONE = ["development_status:", "  epic-1: done", "  epic-1-retrospective: optional", "  2-8-baseline-pin-bump-tool: in-progress", "  epic-2: done", ""].join("\n");
const SPRINT_IN_FLIGHT = ["development_status:", "  epic-1: done", "  epic-3: in-progress", "  epic-3-retrospective: in-progress", "  epic-5: in-progress", "  epic-10: in-progress", "  epic-11: backlog", ""].join("\n");

const FAKE = (c: string) => c.repeat(40);
const PIN_HEADER = "# fixture pin\n#   <repo> <tag> <commit> <tree>\n";
function pinText(framework: string): string {
  return `${PIN_HEADER}${framework}\nlaravel/ai        v1.2.3   ${FAKE("a")} ${FAKE("b")}\nlaravel/mcp       v1.0.2   ${FAKE("c")} ${FAKE("d")}\nlaravel/boost     v2.10.3  ${FAKE("e")} ${FAKE("f")}\n`;
}

interface Fixture {
  dir: string;
  home: string;
  root: string;
}

/**
 * A root whose HEAD~1 pins `v1.0.0` with `before` as the Inventory, and whose HEAD (and working tree) pins
 * `v1.1.0` with `after`; `extra` is written into the working tree uncommitted.
 */
function diffFixture(before: Record<string, string>, after: Record<string, string>, extra: Record<string, string> = {}, sprint = SPRINT_DONE): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-pin-bump-"));
  const home = join(dir, "home");
  const repo = join(dir, "repo");
  mkdirSync(home);
  mkdirSync(repo);
  git(repo, home, "init", "--quiet");
  const inv = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).map(([name, text]) => [`conformance/inventory/${name}`, text]));
  write(repo, {
    "conformance/baseline-pin": pinText(`laravel/framework v1.0.0 ${FAKE("1")} ${FAKE("2")}`),
    "conformance/inventory/oracle-nondeterminism.jsonl": "not an inventory file\n",
    "_bmad-output/implementation-artifacts/sprint-status.yaml": sprint,
    ...inv(before),
  });
  git(repo, home, "add", "-A");
  git(repo, home, "commit", "--quiet", "-m", "old pin");
  rmSync(join(repo, "conformance", "inventory"), { recursive: true });
  write(repo, {
    "conformance/baseline-pin": pinText(`laravel/framework v1.1.0 ${FAKE("3")} ${FAKE("4")}`),
    "conformance/inventory/oracle-nondeterminism.jsonl": "not an inventory file\n",
    ...inv(after),
  });
  git(repo, home, "add", "-A");
  git(repo, home, "commit", "--quiet", "-m", "new pin");
  write(repo, extra);
  return { dir, home, root: repo };
}

function cleanup(fx: Fixture): void {
  Bun.spawnSync(["chmod", "-R", "u+w", fx.dir]);
  rmSync(fx.dir, { recursive: true, force: true });
}

async function withFixture(fx: Fixture, body: (fx: Fixture) => Promise<void>): Promise<void> {
  try {
    await body(fx);
  } finally {
    cleanup(fx);
  }
}

async function bump(fx: Fixture, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args, "--root", fx.root], { cwd: root, env: { PATH: process.env["PATH"] ?? "", HOME: fx.home, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

/** Every file under `dir` except `.git`, with its content. */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (path: string): void => {
    for (const name of readdirSync(path).sort()) {
      const full = join(path, name);
      if (name === ".git") {
        continue;
      }
      if (statSync(full).isDirectory()) {
        visit(full);
      } else {
        out[relative(dir, full)] = readFileSync(full, "utf8");
      }
    }
  };
  visit(dir);
  return out;
}

const read = (fx: Fixture, path: string): string => readFileSync(join(fx.root, path), "utf8");
const records = (text: string): Record<string, unknown>[] => text.trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
const RECORD = "conformance/pin-bumps/v1.0.0-to-v1.1.0.jsonl";
const SHARD_STR = "conformance/expectations/support/Support/SupportStrTest.jsonl";
/** The Oracle Dockerfile; this file reaches the Oracle tool only through `bun run` scripts, offline. */
const DOCKERFILE = "conformance/oracle/Dockerfile";
const SHARD_STR2 = "conformance/expectations/support/Support/SupportStrExtraTest.jsonl";

/** Four fixture remotes; framework has `v1.0.0` (lightweight) and `v1.1.0` (annotated, a later commit). The repo holds the real Oracle Dockerfile and its dockerignore. */
function moveFixture(sprint = SPRINT_DONE): Fixture & { base: string; pin: string; commits: Record<string, string>; trees: Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-pin-bump-"));
  const home = join(dir, "home");
  const repo = join(dir, "repo");
  const base = join(dir, "remotes");
  mkdirSync(home);
  mkdirSync(repo);
  const lines: string[] = [];
  const commits: Record<string, string> = {};
  const trees: Record<string, string> = {};
  const tags: Record<string, string> = { framework: "v1.0.0", ai: "v1.2.3", mcp: "v1.0.2", boost: "v2.10.3" };
  for (const { repo: name, name: short } of UPSTREAM_REPOS) {
    const remote = join(base, `${name}.git`);
    mkdirSync(remote, { recursive: true });
    git(remote, home, "init", "--quiet");
    write(remote, { "composer.json": `{"name": "${name}"}\n` });
    git(remote, home, "add", "-A");
    git(remote, home, "commit", "--quiet", "-m", "release");
    git(remote, home, "tag", tags[short]!);
    lines.push(`${name}${short === "framework" ? "  " : " "}${tags[short]} ${git(remote, home, "rev-parse", "HEAD")} ${git(remote, home, "rev-parse", "HEAD^{tree}")}  # ${short}`);
    if (short === "framework") {
      write(remote, { "src/New.php": "<?php\n" });
      git(remote, home, "add", "-A");
      git(remote, home, "commit", "--quiet", "-m", "next release");
      git(remote, home, "tag", "-a", "-m", "v1.1.0", "v1.1.0");
      commits["v1.1.0"] = git(remote, home, "rev-parse", "HEAD");
      trees["v1.1.0"] = git(remote, home, "rev-parse", "HEAD^{tree}");
    }
  }
  const pin = `${PIN_HEADER}\n${lines.join("\n")}\n`;
  git(repo, home, "init", "--quiet");
  write(repo, {
    "conformance/baseline-pin": pin,
    "conformance/inventory/support.jsonl": inventory([entry(`${SUPPORT}::testA`, "support", "1")]),
    "_bmad-output/implementation-artifacts/sprint-status.yaml": sprint,
    [DOCKERFILE]: readFileSync(join(root, DOCKERFILE), "utf8"),
    [`${DOCKERFILE}.dockerignore`]: readFileSync(join(root, `${DOCKERFILE}.dockerignore`), "utf8"),
  });
  git(repo, home, "add", "-A");
  git(repo, home, "commit", "--quiet", "-m", "pin v1.0.0");
  return { dir, home, root: repo, base, pin, commits, trees };
}

// ---------------------------------------------------------------------------
// XT-conformance-62

test("XT-conformance-62: given two Pins, bun run pin:bump <tag> moves the framework line, then in diff mode prints the added, changed (same ID, different hash) and removed Test IDs and writes the bump record (FR-7)", async () => {
  // Move mode: the framework line names another tag.
  const mv = moveFixture();
  await withFixture(mv, async () => {
    const missing = await bump(mv, "v9.9.9", "--remote", `file://${mv.base}`);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("v9.9.9");
    expect(read(mv, "conformance/baseline-pin")).toBe(mv.pin);

    const fromRev = git(mv.root, mv.home, "rev-parse", "HEAD");
    const dockerfile = read(mv, DOCKERFILE);
    const moved = await bump(mv, "v1.1.0", "--remote", `file://${mv.base}`, "--apply");
    expect(moved.stderr).toBe("");
    expect(moved.code).toBe(0);
    const frameworkLine = mv.pin.split("\n").find((line) => line.startsWith("laravel/framework"))!;
    expect(read(mv, "conformance/baseline-pin")).toBe(mv.pin.replace(frameworkLine, `laravel/framework v1.1.0 ${mv.commits["v1.1.0"]} ${mv.trees["v1.1.0"]}`));
    expect(readFileSync(join(mv.root, "conformance", "upstream", "framework", "src", "New.php"), "utf8")).toBe("<?php\n");
    // The Dockerfile needs no edit: its root-version list comes from the Pin.
    // oracle:check (offline) passes it and derives the moved build argument;
    // its only problems are the fixture's missing locks.
    expect(read(mv, DOCKERFILE)).toBe(dockerfile);
    const check = Bun.spawnSync([process.execPath, "run", "oracle:check", "--root", mv.root], { cwd: root, env: { PATH: process.env["PATH"] ?? "", HOME: mv.home }, stdout: "pipe", stderr: "pipe" });
    expect(check.exitCode).toBe(1);
    expect(check.stdout.toString()).toContain(`${DOCKERFILE} builds with --build-arg XARAVEL_ROOT_VERSIONS=framework:1.1.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3\n`);
    expect(check.stderr.toString()).toContain("conformance/oracle/locks/framework/composer.lock is missing");
    expect(check.stderr.toString()).not.toContain(DOCKERFILE);
    // The printed steps: exact commands, the tag and the pre-move revision substituted.
    expect(fromRev).toMatch(/^[0-9a-f]{40}$/);
    const steps = [
      "bun run oracle:lock",
      'tag="$(bun run --silent oracle:tag)" && bun run oracle:build "xaravel-oracle:$tag"',
      "bun run inventory",
      'b="$(git branch --show-current)" && test -n "$b" && test "$b" != main && git add conformance/baseline-pin conformance/oracle/locks conformance/inventory && git commit -m "pin bump: laravel/framework v1.1.0, regenerated locks and Inventory" && git push -u origin HEAD && gh workflow run baseline.yml --ref "$b"',
      `sleep 15 && run="$(gh run list --workflow baseline.yml --event workflow_dispatch --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId --jq '.[0].databaseId')" && test -n "$run" && gh run watch "$run"`,
      'test -n "$run" && dl="$(mktemp -d)" && gh run download "$run" --name inventory --dir "$dl" && rm -rf conformance/inventory && mv "$dl" conformance/inventory',
      'git add conformance/inventory && git commit -m "pin bump: laravel/framework v1.1.0, baselined Inventory" && git push',
      `bun run pin:bump v1.1.0 --from ${fromRev}`,
    ];
    expect(moved.stdout).toEndWith(`\nThe Pin moved. Regenerate, then report the diff, by running these lines in order in one shell at the repository root:\n\n${steps.map((step) => `${step}\n`).join("")}`);
    // The dispatch and download steps rely on baseline.yml: a workflow_dispatch
    // trigger, and a merge job that uploads conformance/inventory/ as the
    // artifact the download step names, before its committed-equals-output check.
    const workflow = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "baseline.yml"), "utf8")) as {
      on: Record<string, unknown>;
      jobs: { merge: { steps: { uses?: string; run?: string; with?: Record<string, unknown> }[] } };
    };
    expect(Object.keys(workflow.on)).toContain("workflow_dispatch");
    const mergeSteps = workflow.jobs.merge.steps;
    const upload = mergeSteps.findIndex((step) => (step.uses ?? "").startsWith("actions/upload-artifact@") && step.with?.["name"] === "inventory");
    const committedCheck = mergeSteps.findIndex((step) => (step.run ?? "").includes("git diff --exit-code --stat conformance/inventory"));
    expect(upload).toBeGreaterThanOrEqual(0);
    expect(mergeSteps[upload]!.with?.["path"]).toBe("conformance/inventory/");
    expect(committedCheck).toBeGreaterThan(upload);
    const download = steps.find((step) => step.includes("gh run download"))!;
    expect(/--name (\S+)/.exec(download)![1]).toBe(String(mergeSteps[upload]!.with?.["name"]));
    // Move mode writes no record, stubs or Expectations, even with --apply.
    expect(existsSync(join(mv.root, "conformance", "pin-bumps"))).toBe(false);
    expect(existsSync(join(mv.root, "_bmad-output", "implementation-artifacts", "pin-bump"))).toBe(false);

    // The printed steps run: the shell parses them, and each `bun run` step
    // names a real script whose CLI accepts its arguments. Each runs from the
    // repository root with `--root <fixture>` appended and only bun, git and
    // sh on PATH (no container runtime, no Composer), so the steps that need
    // them fail closed (exit 1), never with a usage error (exit 2).
    const syntax = Bun.spawnSync(["sh", "-n", "-c", steps.join("\n")], { stdout: "pipe", stderr: "pipe" });
    expect([syntax.exitCode, syntax.stderr.toString()]).toEqual([0, ""]);
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    const bin = join(mv.dir, "bin");
    mkdirSync(bin);
    for (const name of ["git", "sh"]) {
      symlinkSync(Bun.which(name)!, join(bin, name));
    }
    symlinkSync(process.execPath, join(bin, "bun"));
    expect(readdirSync(bin).sort()).toEqual(["bun", "git", "sh"]);
    const runs = steps.filter((step) => /(^|&& )bun run /.test(step));
    expect(runs.length).toBe(4);
    for (const step of runs) {
      for (const [, script] of step.matchAll(/bun run (?:--silent )?([\w:-]+)/g)) {
        expect([script, scripts[script!] !== undefined]).toEqual([script, true]);
      }
      const proc = Bun.spawnSync([join(bin, "sh"), "-c", `${step} --root "$FIXTURE_ROOT"`], {
        cwd: root,
        env: { PATH: bin, HOME: mv.home, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", FIXTURE_ROOT: mv.root },
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
      expect([step, proc.exitCode !== 2, output.includes("Usage:")]).toEqual([step, true, false]);
    }
  });

  // Diff mode: the working tree already names v1.1.0; --from HEAD~1 names v1.0.0.
  const before = {
    "support.jsonl": inventory([entry(`${SUPPORT}::testA`, "support", "1"), entry(`${SUPPORT}::testB`, "support", "2"), entry(`${SUPPORT}::testC`, "support", "3")]),
    "ai.jsonl": inventory([entry(`${AI}::x`, "ai", "4")]),
  };
  const after = {
    "support.jsonl": inventory([entry(`${SUPPORT}::testA`, "support", "1"), entry(`${SUPPORT}::testB`, "support", "5"), entry(`${SUPPORT}::testD`, "support", "6")]),
    "ai.jsonl": inventory([entry(`${AI}::x`, "ai", "4"), entry(`${AI}::y`, "ai", "7")]),
  };
  const fx = diffFixture(before, after);
  await withFixture(fx, async () => {
    const usage = await bump(fx);
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain("Usage:");

    const same = await bump(fx, "v1.1.0", "--from", "HEAD");
    expect(same.code).toBe(1);
    expect(same.stderr).toContain("--from HEAD already pins v1.1.0");
    expect(existsSync(join(fx.root, RECORD))).toBe(false);
    // The default --from is HEAD, which already pins v1.1.0.
    const sameDefault = await bump(fx, "v1.1.0");
    expect(sameDefault.code).toBe(1);
    expect(sameDefault.stderr).toContain("--from HEAD already pins v1.1.0");
    expect(existsSync(join(fx.root, RECORD))).toBe(false);

    const fromRev = git(fx.root, fx.home, "rev-parse", "HEAD~1");
    // Diff mode never touches the network: an unreachable remote changes nothing.
    const result = await bump(fx, "v1.1.0", "--from", "HEAD~1", "--remote", "file:///nonexistent");
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toStartWith(
      [
        `Pin bump v1.0.0 -> v1.1.0 (from ${fromRev})`,
        "Added (2)",
        `  ${AI}::y`,
        `  ${SUPPORT}::testD`,
        "Changed (1)",
        `  ${SUPPORT}::testB`,
        "Removed (1)",
        `  ${SUPPORT}::testC`,
        "Renamed (0)",
        "",
      ].join("\n"),
    );
    expect(read(fx, RECORD)).toBe(
      [
        JSON.stringify({ from: "v1.0.0", to: "v1.1.0", from_rev: fromRev, applied: false }),
        JSON.stringify({ change: "added", id: `${AI}::y`, component: "ai", hash: "7".repeat(64) }),
        JSON.stringify({ change: "added", id: `${SUPPORT}::testD`, component: "support", hash: "6".repeat(64) }),
        JSON.stringify({ change: "changed", id: `${SUPPORT}::testB`, component: "support", hash: "5".repeat(64), previous_hash: "2".repeat(64), expectations: [] }),
        JSON.stringify({ change: "removed", id: `${SUPPORT}::testC`, component: "support", hash: "3".repeat(64), expectations: [] }),
        "",
      ].join("\n"),
    );
    // Without --apply nothing else is written; a second report overwrites an unapplied record.
    expect(existsSync(join(fx.root, "_bmad-output", "implementation-artifacts", "pin-bump"))).toBe(false);
    const again = await bump(fx, "v1.1.0", "--from", "HEAD~1");
    expect(again.code).toBe(0);
    expect(again.stdout).toBe(result.stdout);
  });

  // --apply on an empty diff (the Inventory was not regenerated) writes nothing, so it cannot block the real apply.
  const stale = diffFixture(before, before);
  await withFixture(stale, async () => {
    const snapshot = tree(stale.root);
    const result = await bump(stale, "v1.1.0", "--from", "HEAD~1", "--apply");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("the Inventory matches --from HEAD~1");
    expect(tree(stale.root)).toEqual(snapshot);
  });

  // A --from revision with no Inventory files fails instead of reporting every ID as added.
  const empty = diffFixture({}, after);
  await withFixture(empty, async () => {
    const snapshot = tree(empty.root);
    const result = await bump(empty, "v1.1.0", "--from", "HEAD~1");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`revision ${git(empty.root, empty.home, "rev-parse", "HEAD~1")} has no Inventory files`);
    expect(tree(empty.root)).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// XT-conformance-63

test("XT-conformance-63: --apply resets a changed Test ID's Expectations lines to skip / not-ported-yet / null / null in their original shard, and the record keeps the prior status (FR-7)", async () => {
  const before = { "support.jsonl": inventory([entry(`${SUPPORT}::testA`, "support", "1"), entry(`${SUPPORT}::testB`, "support", "2")]) };
  const after = { "support.jsonl": inventory([entry(`${SUPPORT}::testA`, "support", "1"), entry(`${SUPPORT}::testB`, "support", "5")]) };
  const shard = [
    expectation(`${SUPPORT}::testA`, "none", "pass", null),
    // Keys out of AD-15 order: the rewritten line comes back in order.
    JSON.stringify({ variant: "sqlite", id: `${SUPPORT}::testB`, escalation: "ESC-9.1-1", adapted: "DIV-9.2", reason: null, status: "pass" }),
    expectation(`${SUPPORT}::testB`, "none", "skip", "blocked-by:database"),
    "",
  ].join("\n");
  const fx = diffFixture(before, after, { [SHARD_STR]: shard });
  await withFixture(fx, async () => {
    const result = await bump(fx, "v1.1.0", "--from", "HEAD~1", "--apply");
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(read(fx, SHARD_STR)).toBe(
      [expectation(`${SUPPORT}::testA`, "none", "pass", null), expectation(`${SUPPORT}::testB`, "sqlite", "skip", "not-ported-yet"), expectation(`${SUPPORT}::testB`, "none", "skip", "not-ported-yet"), ""].join("\n"),
    );
    const lines = records(read(fx, RECORD));
    expect(lines[0]!["applied"]).toBe(true);
    expect(lines[1]).toEqual({
      change: "changed",
      id: `${SUPPORT}::testB`,
      component: "support",
      hash: "5".repeat(64),
      previous_hash: "2".repeat(64),
      expectations: [
        { shard: SHARD_STR, variant: "none", status: "skip", reason: "blocked-by:database" },
        { shard: SHARD_STR, variant: "sqlite", status: "pass", reason: null },
      ],
    });
    // Re-apply: the record is already applied, so nothing changes.
    const snapshot = tree(fx.root);
    const reapply = await bump(fx, "v1.1.0", "--from", "HEAD~1", "--apply");
    expect(reapply.code).toBe(1);
    expect(reapply.stderr).toContain("already applied");
    expect(tree(fx.root)).toEqual(snapshot);
  });

  // A shard line that is not valid JSON fails the run before anything is written.
  const bad = diffFixture(before, after, { [SHARD_STR]: `${expectation(`${SUPPORT}::testB`, "none", "pass", null)}\n{not json\n` });
  await withFixture(bad, async () => {
    const snapshot = tree(bad.root);
    const result = await bump(bad, "v1.1.0", "--from", "HEAD~1", "--apply");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${SHARD_STR}:2: malformed JSON`);
    expect(tree(bad.root)).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// XT-conformance-64

test("XT-conformance-64: --apply rewrites a renamed Test ID's lines (same hash and component) to the new ID keeping status, reason, adapted and escalation, and the record keeps both IDs and the prior expectations (FR-7)", async () => {
  const before = {
    "support.jsonl": inventory([entry(`${SUPPORT}::testOld`, "support", "8"), entry(`${SUPPORT}::testTwinA`, "support", "9"), entry(`${SUPPORT}::testTwinB`, "support", "9")]),
    "bus.jsonl": inventory([entry(`${BUS}::testMoved`, "bus", "a")]),
  };
  const after = {
    "support.jsonl": inventory([entry(`${SUPPORT}::testNew`, "support", "8"), entry(`${SUPPORT}::testTwinC`, "support", "9"), entry(`${SUPPORT}::testMovedHere`, "support", "a")]),
  };
  const fx = diffFixture(before, after, {
    [SHARD_STR]: `${expectation(`${SUPPORT}::testOld`, "sqlite", "skip", "blocked-by:database", null, "ESC-5.1-2")}\n${expectation(`${SUPPORT}::testTwinA`, "none", "pass", null)}\n`,
    [SHARD_STR2]: `${expectation(`${SUPPORT}::testOld`, "pgsql", "pass", null, "DIV-9.1")}\n`,
  });
  await withFixture(fx, async () => {
    const result = await bump(fx, "v1.1.0", "--from", "HEAD~1", "--apply");
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Renamed (1)\n  ${SUPPORT}::testOld -> ${SUPPORT}::testNew\n`);
    // Ambiguous hash (two removed twins, one added) and a cross-Component match are not renames.
    expect(result.stdout).toContain(`Added (2)\n  ${SUPPORT}::testMovedHere\n  ${SUPPORT}::testTwinC\n`);
    expect(result.stdout).toContain(`Removed (3)\n  ${BUS}::testMoved\n  ${SUPPORT}::testTwinA\n  ${SUPPORT}::testTwinB\n`);
    expect(read(fx, SHARD_STR)).toBe(`${expectation(`${SUPPORT}::testNew`, "sqlite", "skip", "blocked-by:database", null, "ESC-5.1-2")}\n`);
    expect(read(fx, SHARD_STR2)).toBe(`${expectation(`${SUPPORT}::testNew`, "pgsql", "pass", null, "DIV-9.1")}\n`);
    for (const shard of [SHARD_STR, SHARD_STR2]) {
      expect(read(fx, shard)).not.toContain("testOld");
    }
    const renamed = records(read(fx, RECORD)).find((line) => line["change"] === "renamed");
    expect(renamed).toEqual({
      change: "renamed",
      id: `${SUPPORT}::testOld`,
      to: `${SUPPORT}::testNew`,
      component: "support",
      hash: "8".repeat(64),
      expectations: [
        { shard: SHARD_STR2, variant: "pgsql", status: "pass", reason: null },
        { shard: SHARD_STR, variant: "sqlite", status: "skip", reason: "blocked-by:database" },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// XT-conformance-65

test("XT-conformance-65: --apply deletes a removed Test ID's Expectations lines (and a shard left empty), and the record keeps the ID, shard, variant and last status (FR-7)", async () => {
  const before = { "support.jsonl": inventory([entry(`${SUPPORT}::testA`, "support", "1"), entry(`${SUPPORT}::testC`, "support", "3")]) };
  const after = { "support.jsonl": inventory([entry(`${SUPPORT}::testA`, "support", "1")]) };
  const fx = diffFixture(before, after, {
    [SHARD_STR]: `${expectation(`${SUPPORT}::testA`, "none", "pass", null)}\n${expectation(`${SUPPORT}::testC`, "sqlite", "fail", null)}\n`,
    [SHARD_STR2]: `${expectation(`${SUPPORT}::testC`, "none", "skip", "not-ported-yet")}\n`,
  });
  await withFixture(fx, async () => {
    const result = await bump(fx, "v1.1.0", "--from", "HEAD~1", "--apply");
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(read(fx, SHARD_STR)).toBe(`${expectation(`${SUPPORT}::testA`, "none", "pass", null)}\n`);
    expect(existsSync(join(fx.root, SHARD_STR2))).toBe(false);
    const lines = records(read(fx, RECORD));
    expect(lines[1]).toEqual({
      change: "removed",
      id: `${SUPPORT}::testC`,
      component: "support",
      hash: "3".repeat(64),
      expectations: [
        { shard: SHARD_STR2, variant: "none", status: "skip", reason: "not-ported-yet" },
        { shard: SHARD_STR, variant: "sqlite", status: "fail", reason: null },
      ],
    });
    // A Component with only removed IDs gets no stub.
    expect(existsSync(join(fx.root, "_bmad-output", "implementation-artifacts", "pin-bump", "v1.1.0", "support.md"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// XT-conformance-66

test("XT-conformance-66: given added and changed Test IDs in two Components, --apply writes one backlog stub per Component listing them (FR-7)", async () => {
  const before = {
    "support.jsonl": inventory([entry(`${SUPPORT}::testB`, "support", "2"), entry(`${SUPPORT}::testOld`, "support", "8")]),
    "bus.jsonl": inventory([entry(`${BUS}::testB`, "bus", "2")]),
  };
  const after = {
    "support.jsonl": inventory([entry(`${SUPPORT}::testB`, "support", "5"), entry(`${SUPPORT}::testD`, "support", "6"), entry(`${SUPPORT}::testNew`, "support", "8")]),
    "bus.jsonl": inventory([entry(`${BUS}::testB`, "bus", "5"), entry(`${BUS}::testD`, "bus", "6")]),
  };
  const fx = diffFixture(before, after, {
    [SHARD_STR]: `${expectation(`${SUPPORT}::testB`, "none", "pass", null)}\n`,
    [SHARD_STR2]: `${expectation(`${SUPPORT}::testB`, "sqlite", "pass", null)}\n`,
  });
  await withFixture(fx, async () => {
    const result = await bump(fx, "v1.1.0", "--from", "HEAD~1", "--apply");
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const dir = join(fx.root, "_bmad-output", "implementation-artifacts", "pin-bump", "v1.1.0");
    expect(readdirSync(dir).sort()).toEqual(["bus.md", "support.md"]);
    expect(readFileSync(join(dir, "support.md"), "utf8")).toBe(
      [
        "# Pin bump v1.0.0 → v1.1.0: support",
        "",
        "## Added",
        "",
        "New Upstream tests to port.",
        "",
        `- \`${SUPPORT}::testD\``,
        "",
        "## Changed",
        "",
        "Upstream changed these tests; re-port them. Their Expectations were reset to `skip` / `not-ported-yet`.",
        "",
        `- \`${SUPPORT}::testB\`: \`${SHARD_STR2}\`, \`${SHARD_STR}\``,
        "",
        "## Renamed",
        "",
        "Update the `portedTest` ID of each.",
        "",
        `- \`${SUPPORT}::testOld -> ${SUPPORT}::testNew\``,
        "",
      ].join("\n"),
    );
    const bus = readFileSync(join(dir, "bus.md"), "utf8");
    expect(bus).toStartWith("# Pin bump v1.0.0 → v1.1.0: bus\n");
    expect(bus).toContain(`- \`${BUS}::testD\`\n`);
    expect(bus).toContain(`- \`${BUS}::testB\`: (no Expectations)\n`);
    expect(bus).not.toContain("## Renamed");
  });
});

// ---------------------------------------------------------------------------
// XT-conformance-67

test("XT-conformance-67: while any epic-<N> is in-progress in sprint status, pin:bump exits 1, lists the in-flight Epics and changes no file, in both move and diff mode (FR-7)", async () => {
  const expected = "  epic-3\n  epic-5\n  epic-10\n";
  const mv = moveFixture(SPRINT_IN_FLIGHT);
  await withFixture(mv, async () => {
    const snapshot = tree(mv.root);
    const result = await bump(mv, "v1.1.0", "--remote", `file://${mv.base}`, "--apply");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(expected);
    expect(result.stderr).not.toContain("retrospective");
    expect(tree(mv.root)).toEqual(snapshot);
  });

  const before = { "support.jsonl": inventory([entry(`${SUPPORT}::testA`, "support", "1"), entry(`${SUPPORT}::testC`, "support", "3")]) };
  const after = { "support.jsonl": inventory([entry(`${SUPPORT}::testA`, "support", "2")]) };
  const fx = diffFixture(before, after, { [SHARD_STR]: `${expectation(`${SUPPORT}::testA`, "none", "pass", null)}\n` }, SPRINT_IN_FLIGHT);
  await withFixture(fx, async () => {
    const snapshot = tree(fx.root);
    const result = await bump(fx, "v1.1.0", "--from", "HEAD~1", "--apply");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(expected);
    expect(result.stdout).toBe("");
    expect(tree(fx.root)).toEqual(snapshot);
  });

  // Without a sprint status file the freeze point cannot be checked, so the tool fails closed.
  const nostatus = diffFixture(before, after);
  await withFixture(nostatus, async () => {
    rmSync(join(nostatus.root, "_bmad-output", "implementation-artifacts", "sprint-status.yaml"));
    const snapshot = tree(nostatus.root);
    const result = await bump(nostatus, "v1.1.0", "--from", "HEAD~1", "--apply");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("does not exist");
    expect(tree(nostatus.root)).toEqual(snapshot);
  });
});
