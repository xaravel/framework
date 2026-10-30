// Xaravel Tests for Story 1.8 (Lockstep release workflow with provenance).
// These run under plain `bun test` until the harness lands in Epic 5.
import { expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  authorityViolations,
  checkAuthority,
  environmentDecision,
  internalVersionMismatches,
  lockedVersions,
  mainDecision,
  manifestLeaks,
  PUBLISH_COMMAND,
  repositoryProblems,
  PUBLISH_TAG,
  releaseNotes,
  stamp,
  tagDecision,
  versionMismatches,
  workspaces,
} from "../../../tools/release/release";
import { frameworkTag } from "../../../tools/upstream/upstream";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "release", "release.ts");

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** A fixture `conformance/baseline-pin` in the table format, with `framework` as the laravel/framework tag. */
function pinTable(framework: string): string {
  const sha = (digit: string): string => digit.repeat(40);
  return [
    "# fixture pin",
    `laravel/framework ${framework} ${sha("1")} ${sha("2")}`,
    `laravel/ai v1.2.3 ${sha("3")} ${sha("4")}`,
    `laravel/mcp v1.0.2 ${sha("5")} ${sha("6")}`,
    `laravel/boost v2.10.3 ${sha("7")} ${sha("8")}`,
    "",
  ].join("\n");
}

/** A fixture monorepo: root 0.1.0, two public packages (one with workspace:* edges), a private skeleton. */
function fixtureFiles(packageVersion = "0.0.0", rootVersion = "0.1.0"): Record<string, string> {
  return {
    "package.json": json({ name: "fixture", version: rootVersion, private: true, workspaces: ["packages/*", "skeleton"] }),
    "packages/alpha/package.json": json({
      name: "@fixture/alpha",
      version: packageVersion,
      description: "Alpha.",
      license: "MIT",
      repository: { type: "git", url: "git+https://github.com/xaravel/framework.git", directory: "packages/alpha" },
      type: "module",
      exports: { ".": "./src/index.ts" },
      dependencies: { "@fixture/beta": "workspace:*" },
      peerDependencies: { "@fixture/beta": "workspace:*" },
    }),
    "packages/alpha/src/index.ts": "export const alpha = 1;\n",
    "packages/beta/package.json": json({
      name: "@fixture/beta",
      version: packageVersion,
      repository: { type: "git", url: "git+https://github.com/xaravel/framework.git", directory: "packages/beta" },
      type: "module",
      exports: { ".": "./src/index.ts" },
    }),
    "packages/beta/src/index.ts": "export const beta = 1;\n",
    "packages/no-manifest/README.md": "not a workspace\n",
    "skeleton/package.json": json({ name: "@fixture/skeleton", version: packageVersion, private: true, type: "module" }),
    "conformance/baseline-pin": pinTable("v13.37.0"),
  };
}

async function withRoot(files: Record<string, string>, body: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-release-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runCli(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], {
    cwd: root,
    env: { PATH: process.env["PATH"] ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

const PROTECTED = {
  name: "release",
  can_admins_bypass: false,
  protection_rules: [
    { id: 1, type: "wait_timer", wait_timer: 0 },
    { id: 2, type: "required_reviewers", prevent_self_review: false, reviewers: [{ type: "User", reviewer: { login: "edanisko", id: 1 } }] },
  ],
};

interface FakeEnvironment {
  status?: number;
  body?: unknown;
}

/** The fake compare answer: an HTTP status, a JSON body, or a raw (non-JSON) text body; default `identical`. */
interface FakeCompare {
  status?: number;
  body?: unknown;
  text?: string;
}

/** The tagged commit `runGate` passes by default. */
const SHA = "0123456789abcdef0123456789abcdef01234567";
const COMPARE_PATH = `/repos/xaravel/framework/compare/refs/heads/main...${SHA}`;

interface GateOptions {
  token?: string | null;
  root?: string;
  compare?: FakeCompare;
}

/** Runs `gate` against a `Bun.serve` fake of the GitHub API; returns the result and the GITHUB_OUTPUT lines. */
async function runGate(
  tag: string,
  environment: FakeEnvironment,
  options: GateOptions = {},
): Promise<{ code: number; stdout: string; stderr: string; output: string; hits: string[] }> {
  const hits: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      hits.push(url.pathname);
      if (request.headers.get("authorization") !== "Bearer test-token") {
        return new Response("unauthorized", { status: 401 });
      }
      if (url.pathname === COMPARE_PATH) {
        const compare = options.compare ?? {};
        if (compare.status !== undefined) {
          return new Response("status", { status: compare.status });
        }
        if (compare.text !== undefined) {
          return new Response(compare.text, { headers: { "content-type": "text/html" } });
        }
        return Response.json(compare.body ?? { status: "identical" });
      }
      if (url.pathname === "/repos/xaravel/framework/environments/release") {
        return environment.status !== undefined ? new Response("status", { status: environment.status }) : Response.json(environment.body ?? PROTECTED);
      }
      return new Response("not found", { status: 404 });
    },
  });
  const dir = mkdtempSync(join(tmpdir(), "xaravel-gate-"));
  const outputFile = join(dir, "github-output");
  try {
    const token = options.token === undefined ? "test-token" : options.token;
    const args = ["gate", "--tag", tag, "--repo", "xaravel/framework", "--sha", SHA, "--github-output", outputFile];
    if (options.root !== undefined) {
      args.push("--root", options.root);
    }
    const result = await runCli(args, { GITHUB_API_URL: `http://localhost:${server.port}`, ...(token === null ? {} : { GH_TOKEN: token }) });
    const output = existsSync(outputFile) ? readFileSync(outputFile, "utf8") : "";
    return { ...result, output, hits };
  } finally {
    await server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}
interface Job {
  needs?: unknown;
  if?: unknown;
  environment?: unknown;
  concurrency?: unknown;
  permissions?: unknown;
  steps: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions: unknown;
  jobs: Record<string, Job>;
}

function workflow(name: string): { text: string; data: Workflow } {
  const text = readFileSync(join(root, ".github", "workflows", name), "utf8");
  return { text, data: Bun.YAML.parse(text) as Workflow };
}

const PINNED = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/;

xaravelTest("XT-conformance-34", "`bun run release:stamp` copies the root version into every package, and `release:check` fails CI when any package differs (AD-18, FR-13)", async () => {
  await withRoot(fixtureFiles(), async (dir) => {
    expect(workspaces(dir).map((workspace) => [workspace.dir, workspace.private])).toEqual([
      ["packages/alpha", false],
      ["packages/beta", false],
      ["skeleton", true],
    ]);
    const before = Object.fromEntries(["packages/alpha", "packages/beta", "skeleton"].map((d) => [d, readFileSync(join(dir, d, "package.json"), "utf8")]));
    expect(versionMismatches(dir)).toEqual([
      "version mismatch: packages/alpha/package.json has 0.0.0, root has 0.1.0",
      "version mismatch: packages/beta/package.json has 0.0.0, root has 0.1.0",
      "version mismatch: skeleton/package.json has 0.0.0, root has 0.1.0",
    ]);

    // Stamp: only the version value changes, byte for byte, private workspaces included.
    expect(stamp(dir)).toEqual(["packages/alpha/package.json", "packages/beta/package.json", "skeleton/package.json"]);
    for (const [d, text] of Object.entries(before)) {
      expect(readFileSync(join(dir, d, "package.json"), "utf8")).toBe(text.replace('"version": "0.0.0"', '"version": "0.1.0"'));
    }
    expect(versionMismatches(dir)).toEqual([]);
    // Stamp refreshed bun.lock, which `bun pm pack` reads internal versions from.
    expect([...lockedVersions(dir)]).toEqual([
      ["packages/alpha", "0.1.0"],
      ["packages/beta", "0.1.0"],
      ["skeleton", "0.1.0"],
    ]);
    const lock = readFileSync(join(dir, "bun.lock"), "utf8");
    const stamped = Object.fromEntries(Object.keys(before).map((d) => [d, readFileSync(join(dir, d, "package.json"), "utf8")]));
    // Idempotent.
    expect(stamp(dir)).toEqual([]);
    for (const [d, text] of Object.entries(stamped)) {
      expect(readFileSync(join(dir, d, "package.json"), "utf8")).toBe(text);
    }
    expect(readFileSync(join(dir, "bun.lock"), "utf8")).toBe(lock);
    const ok = await runCli(["check", "--root", dir]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toBe("Versions OK: 3 workspace(s) at 0.1.0.\n");

    // Drift: one package at 0.0.1.
    writeFileSync(join(dir, "packages/beta/package.json"), stamped["packages/beta"]!.replace('"0.1.0"', '"0.0.1"'));
    expect(versionMismatches(dir)).toEqual(["version mismatch: packages/beta/package.json has 0.0.1, root has 0.1.0"]);
    const drift = await runCli(["check", "--root", dir]);
    expect(drift.code).toBe(1);
    expect(drift.stdout).toBe("");
    expect(drift.stderr).toContain("version mismatch: packages/beta/package.json has 0.0.1, root has 0.1.0");

    // The CLI stamp fixes it.
    const fixed = await runCli(["stamp", "--root", dir]);
    expect(fixed.code).toBe(0);
    expect(fixed.stdout).toContain("packages/beta/package.json");
    expect(readFileSync(join(dir, "packages/beta/package.json"), "utf8")).toBe(stamped["packages/beta"]!);
    expect(readFileSync(join(dir, "bun.lock"), "utf8")).toBe(lock);

    // A stale bun.lock entry fails check, even when every manifest matches.
    const stale = lock.replace(/("packages\/beta": \{\s*"name": "@fixture\/beta",\s*"version": )"0\.1\.0"/, '$1"0.0.0"');
    expect(stale).not.toBe(lock);
    writeFileSync(join(dir, "bun.lock"), stale);
    expect(versionMismatches(dir)).toEqual(["version mismatch: bun.lock workspace packages/beta has 0.0.0, root has 0.1.0"]);
    const staleCheck = await runCli(["check", "--root", dir]);
    expect(staleCheck.code).toBe(1);
    expect(staleCheck.stderr).toContain("version mismatch: bun.lock workspace packages/beta has 0.0.0, root has 0.1.0");
    // Stamp fixes a stale lock even when no manifest changes.
    expect(stamp(dir)).toEqual([]);
    expect(readFileSync(join(dir, "bun.lock"), "utf8")).toBe(lock);
    expect(versionMismatches(dir)).toEqual([]);
  });

  // check also enforces the provenance repository on each public source package.json.
  const noRepository = fixtureFiles("0.1.0");
  noRepository["packages/beta/package.json"] = json({ name: "@fixture/beta", version: "0.1.0", type: "module" });
  await withRoot(noRepository, async (dir) => {
    const missing = await runCli(["check", "--root", dir]);
    expect(missing.code).toBe(1);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain('repository: @fixture/beta packages/beta/package.json field repository.url is missing; provenance needs "git+https://github.com/xaravel/framework.git" (AD-18)');
    expect(missing.stderr).toContain('repository: @fixture/beta packages/beta/package.json field repository.directory is missing; provenance needs "packages/beta" (AD-18)');
    expect(missing.stderr).not.toContain("@fixture/alpha");
    expect(missing.stderr).not.toContain("skeleton");
  });

  // The repository passes, and the scripts and the `versions` job exist.
  expect(versionMismatches(root)).toEqual([]);
  const repo = await runCli(["check"]);
  expect(repo.code).toBe(0);
  expect(repo.stdout).toMatch(/^Versions OK: \d+ workspace\(s\) at \d+\.\d+\.\d+\.\n$/);
  const dirs = workspaces(root).map((workspace) => workspace.dir);
  expect(dirs).toContain("installer");
  expect(dirs).toContain("skeleton");
  expect(dirs).toContain("tools/boost-framework");
  expect(dirs).toContain("packages/support");
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["release:stamp"]).toBe("bun --no-env-file tools/release/release.ts stamp");
  expect(scripts["release:check"]).toBe("bun --no-env-file tools/release/release.ts check");
  expect(scripts["release:authority"]).toBe("bun --no-env-file tools/release/release.ts authority");
  const checks = workflow("release-checks.yml").data;
  expect(checks.jobs["versions"]!.steps.map((step) => step.run).filter(Boolean)).toEqual(["bun tools/release/release.ts check"]);
});

xaravelTest("XT-conformance-35", "a v0.<n>.<p> tag equal to the root version publishes, in the protected release environment, each public package packed with `bun pm pack` and published with `npm publish <tgz> --provenance`, with no `workspace:` in a packed manifest (AD-18, FR-13, NFR-11)", async () => {
  // Decisions.
  for (const [tag, version] of [["v0.1.0", "0.1.0"], ["v0.0.0", "0.0.0"], ["v0.12.34", "0.12.34"]] as const) {
    expect(PUBLISH_TAG.test(tag)).toBe(true);
    expect(tagDecision(tag, version).publish).toBe(true);
  }
  expect(environmentDecision(PROTECTED).publish).toBe(true);
  expect(environmentDecision({ can_admins_bypass: false, protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "EdAnisko" } }] }] }).publish).toBe(true);
  // The tagged commit is main's tip or an ancestor of main.
  for (const status of ["identical", "behind"]) {
    expect(mainDecision(SHA, { status, ahead_by: 0 })).toEqual({ publish: true, reason: `commit ${SHA} is on main (compare main...${SHA}: ${status})` });
  }

  // gate against the fake API, on the repository root at its own version.
  const rootVersion = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
  const ok = await runGate(`v${rootVersion}`, {});
  expect(ok.stderr).toBe("");
  expect(ok.code).toBe(0);
  expect(ok.output).toStartWith("publish=true\nreason=");
  expect(ok.stdout).toStartWith("Publishing: ");
  expect(ok.hits).toEqual([COMPARE_PATH, "/repos/xaravel/framework/environments/release"]);
  expect(ok.output).toContain(`commit ${SHA} is on main (compare main...${SHA}: identical)`);
  // behind (an ancestor of main) publishes too.
  const behind = await runGate(`v${rootVersion}`, {}, { compare: { body: { status: "behind" } } });
  expect(behind.output).toStartWith("publish=true\n");
  expect(behind.hits).toEqual([COMPARE_PATH, "/repos/xaravel/framework/environments/release"]);

  // pack on a fixture with workspace:* edges.
  await withRoot(fixtureFiles("0.1.0"), async (dir) => {
    const install = Bun.spawnSync([process.execPath, "install", "--ignore-scripts"], { cwd: dir, env: { PATH: process.env["PATH"] ?? "" }, stdout: "pipe", stderr: "pipe" });
    expect(install.exitCode).toBe(0);
    const out = join(dir, "dist");
    const packed = await runCli(["pack", "--root", dir, "--out", out]);
    expect(packed.stderr).toBe("");
    expect(packed.code).toBe(0);
    const tarballs = readdirSync(out).sort();
    expect(tarballs).toEqual(["fixture-alpha-0.1.0.tgz", "fixture-beta-0.1.0.tgz"]);
    for (const tarball of tarballs) {
      const manifest = Bun.spawnSync(["tar", "-xzOf", join(out, tarball), "package/package.json"]).stdout.toString();
      expect(manifest).not.toContain("workspace:");
      expect(manifestLeaks(tarball, JSON.parse(manifest))).toEqual([]);
    }
    const alpha = JSON.parse(Bun.spawnSync(["tar", "-xzOf", join(out, tarballs[0]!), "package/package.json"]).stdout.toString()) as { dependencies: Record<string, string> };
    expect(alpha.dependencies["@fixture/beta"]).toBe("0.1.0");
    // A second pack into the same directory refuses rather than mixing tarballs.
    const again = await runCli(["pack", "--root", dir, "--out", out]);
    expect(again.code).toBe(1);
  });

  const install = (dir: string): void => {
    const result = Bun.spawnSync([process.execPath, "install", "--ignore-scripts"], { cwd: dir, env: { PATH: process.env["PATH"] ?? "" }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(0);
  };
  // The CLI fails on a packed manifest that keeps a `workspace:` string, naming the package and the field.
  const leaky = fixtureFiles("0.1.0");
  leaky["packages/beta/package.json"] = leaky["packages/beta/package.json"]!.replace('"name": "@fixture/beta",', '"name": "@fixture/beta",\n  "description": "Uses workspace:* ranges.",');
  await withRoot(leaky, async (dir) => {
    install(dir);
    const leak = await runCli(["pack", "--root", dir, "--out", join(dir, "dist")]);
    expect(leak.code).toBe(1);
    expect(leak.stdout).toBe("");
    expect(leak.stderr).toContain('pack: @fixture/beta packed package.json field description is "Uses workspace:* ranges."');
  });
  // A stale bun.lock (manifests at 0.1.0, lock at 0.0.0) packs an internal dependency on the old version: the CLI fails.
  await withRoot(fixtureFiles("0.0.0"), async (dir) => {
    install(dir);
    for (const d of ["packages/alpha", "packages/beta", "skeleton"]) {
      const file = join(dir, d, "package.json");
      writeFileSync(file, readFileSync(file, "utf8").replace('"version": "0.0.0"', '"version": "0.1.0"'));
    }
    const stale = await runCli(["pack", "--root", dir, "--out", join(dir, "dist")]);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain(
      'pack: @fixture/alpha packed package.json field dependencies.@fixture/beta is "0.0.0"; internal dependencies must be the root version 0.1.0 (AD-18)',
    );
    expect(stale.stderr).toContain('pack: @fixture/alpha packed package.json field peerDependencies.@fixture/beta is "0.0.0"');
  });
  // A public package without the provenance `repository` fails.
  const noRepository = fixtureFiles("0.1.0");
  noRepository["packages/beta/package.json"] = json({ name: "@fixture/beta", version: "0.1.0", type: "module", exports: { ".": "./src/index.ts" } });
  await withRoot(noRepository, async (dir) => {
    install(dir);
    const missing = await runCli(["pack", "--root", dir, "--out", join(dir, "dist")]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('pack: @fixture/beta packed package.json field repository.url is missing; provenance needs "git+https://github.com/xaravel/framework.git" (AD-18)');
    expect(missing.stderr).toContain('pack: @fixture/beta packed package.json field repository.directory is missing; provenance needs "packages/beta" (AD-18)');
    expect(missing.stderr).not.toContain("@fixture/alpha packed");
  });
  expect(internalVersionMismatches("@x/a", { dependencies: { "@x/b": "^0.1.0", lodash: "4.0.0" }, optionalDependencies: { "@x/b": "0.1.0" } }, new Set(["@x/b"]), "0.1.0")).toEqual([
    'pack: @x/a packed package.json field dependencies.@x/b is "^0.1.0"; internal dependencies must be the root version 0.1.0 (AD-18)',
  ]);
  expect(repositoryProblems("@x/a", { repository: { type: "git", url: "git+https://github.com/other/repo.git", directory: "packages/a" } }, "packages/a")).toEqual([
    'pack: @x/a packed package.json field repository.url is "git+https://github.com/other/repo.git"; provenance needs "git+https://github.com/xaravel/framework.git" (AD-18)',
  ]);
  // Every public workspace of the repository carries the provenance repository.
  for (const workspace of workspaces(root).filter((w) => !w.private)) {
    const manifest = JSON.parse(readFileSync(join(root, workspace.dir, "package.json"), "utf8")) as unknown;
    expect(repositoryProblems(workspace.name ?? workspace.dir, manifest, workspace.dir)).toEqual([]);
  }

  // manifestLeaks names the package and the field.
  expect(manifestLeaks("@xaravel/support", { name: "@xaravel/support", dependencies: { "@xaravel/runtime": "workspace:*" }, files: ["a", "workspace:^"] })).toEqual([
    '@xaravel/support packed package.json field dependencies.@xaravel/runtime is "workspace:*"; a published manifest must not hold workspace: (AD-18)',
    '@xaravel/support packed package.json field files[1] is "workspace:^"; a published manifest must not hold workspace: (AD-18)',
  ].map((line) => `pack: ${line}`));

  // release.yml: the release job.
  const { data, text } = workflow("release.yml");
  expect(data.permissions).toEqual({ contents: "read" });
  expect(Object.keys(data.jobs).sort()).toEqual(["gate", "release"]);
  const release = data.jobs["release"]!;
  expect(release.needs).toBe("gate");
  expect(release.if).toBe("needs.gate.outputs.publish == 'true'");
  expect(release.environment).toBe("release");
  expect(release.concurrency).toBe("release");
  expect(release.permissions).toEqual({ contents: "write", "id-token": "write" });
  const runs = release.steps.map((step) => step.run).filter((run): run is string => run !== undefined);
  expect(runs[0]).toBe("bun install --frozen-lockfile --ignore-scripts");
  expect(runs).toContain("bun tools/release/release.ts check");
  expect(runs).toContain("npm install -g --ignore-scripts npm@11.5.1");
  expect(runs).toContain("bun tools/release/release.ts pack --out dist");
  const publish = runs.find((run) => run.includes("npm publish"))!;
  expect(publish).toContain('npm publish "$tgz" --provenance --access public');
  expect(publish).toContain("for tgz in dist/*.tgz");
  // Safe to re-run: a version npm already has is skipped.
  expect(publish).toContain('tar -xzOf "$tgz" package/package.json');
  expect(publish).toContain('npm view "$name@$version" version');
  expect(publish).toMatch(/npm view [^\n]*= "\$version" \]; then\n\s*echo "Skipping [^\n]*\n\s*continue\n/);
  expect(publish.indexOf("npm view")).toBeLessThan(publish.indexOf("npm publish"));
  expect(runs.indexOf("bun tools/release/release.ts pack --out dist")).toBeLessThan(runs.indexOf(publish));
  const notes = runs.find((run) => run.includes("gh release create"))!;
  expect(notes).toContain('bun tools/release/release.ts notes --tag "$TAG"');
  expect(notes).toContain('gh release create "$TAG" --verify-tag');
  expect(notes).toContain("--notes-file");
  expect(notes).toMatch(/if gh release view "\$TAG"[^\n]*; then\n[^\n]*\n\s*exit 0\n\s*fi\n/);
  expect(notes.indexOf("gh release view")).toBeLessThan(notes.indexOf("gh release create"));
  const node = release.steps.find((step) => step.uses?.startsWith("actions/setup-node@"))!;
  expect(node.uses).toBe("actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1");
  expect(node.with).toEqual({ "node-version": "24", "registry-url": "https://registry.npmjs.org" });
  // Every action is pinned by SHA, and no checkout persists credentials.
  for (const job of Object.values(data.jobs)) {
    for (const step of job.steps.filter((s) => s.uses !== undefined)) {
      expect(step.uses!).toMatch(PINNED);
      if (step.uses!.startsWith("actions/checkout@")) {
        expect(step.with).toEqual({ "persist-credentials": false });
      }
    }
  }
  // Trusted publishing only: no stored npm token.
  expect(text).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./);
  // Node and npm only in the release job.
  const gate = data.jobs["gate"]!;
  expect(JSON.stringify(gate)).not.toMatch(/setup-node|\bnpm\b|\bnode\b|pnpm/);
  expect(gate.permissions).toEqual({ contents: "read", actions: "read" });
  expect(gate.steps.map((step) => step.run).filter(Boolean)).toEqual([
    'set -euo pipefail\nbun tools/release/release.ts gate --tag "$TAG" --repo "$REPO" --sha "$SHA" --github-output "$GITHUB_OUTPUT" | tee -a "$GITHUB_STEP_SUMMARY"\n',
  ]);
  // The tagged commit comes from github.sha.
  const decide = gate.steps.find((step) => step.run !== undefined)!;
  expect(decide.env).toEqual({ GH_TOKEN: "${{ github.token }}", TAG: "${{ github.ref_name }}", REPO: "${{ github.repository }}", SHA: "${{ github.sha }}" });
});

xaravelTest("XT-conformance-36", "a tag that does not match v0.<n>.<p>, or does not equal the root version, exits without publishing and says why (AD-18, FR-13)", async () => {
  for (const tag of ["v1.0.0", "v0.1", "v0.01.0", "v0.1.0-rc.1", "foo", "0.1.0", "v0.1.00"]) {
    const decision = tagDecision(tag, "0.1.0");
    expect(decision.publish).toBe(false);
    expect(decision.reason).toContain(PUBLISH_TAG.source);
    expect(decision.reason).toContain(tag);
  }
  const mismatch = tagDecision("v0.2.0", "0.1.0");
  expect(mismatch.publish).toBe(false);
  expect(mismatch.reason).toContain("v0.2.0");
  expect(mismatch.reason).toContain("0.1.0");

  // Environment decisions without the Maintainer as a required reviewer.
  for (const body of [
    {},
    { can_admins_bypass: false, protection_rules: [] },
    { can_admins_bypass: false, protection_rules: [{ type: "wait_timer", wait_timer: 5 }] },
    { can_admins_bypass: false, protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "someone-else" } }] }] },
    { can_admins_bypass: false, protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "Team", reviewer: { slug: "edanisko", name: "edanisko" } }] }] },
    { can_admins_bypass: false, protection_rules: [{ type: "required_reviewers", reviewers: [] }] },
    // A second reviewer or a team beside the Maintainer could approve alone.
    {
      can_admins_bypass: false,
      protection_rules: [
        { type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "edanisko" } }, { type: "User", reviewer: { login: "someone-else" } }] },
      ],
    },
    {
      can_admins_bypass: false,
      protection_rules: [
        { type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "edanisko" } }, { type: "Team", reviewer: { slug: "maintainers" } }] },
      ],
    },
    null,
    // Administrators can bypass the reviewer: true, or missing (GitHub's default is true).
    { ...PROTECTED, can_admins_bypass: true },
    { name: "release", protection_rules: PROTECTED.protection_rules },
  ]) {
    const decision = environmentDecision(body);
    expect(decision.publish).toBe(false);
    expect(decision.reason).toContain("@edanisko");
  }

  // Main decisions: a commit main lacks, or no usable status, refuses and names the commit and main.
  for (const status of ["ahead", "diverged"]) {
    expect(mainDecision(SHA, { status })).toEqual({ publish: false, reason: `commit ${SHA} is not on main (compare main...${SHA}: ${status}), so nothing is published` });
  }
  for (const body of [{}, null, [], "identical", { status: 1 }, { status: "unknown" }, { status: "Behind" }]) {
    const decision = mainDecision(SHA, body);
    expect(decision.publish).toBe(false);
    expect(decision.reason).toContain(`commit ${SHA}`);
    expect(decision.reason).toContain("main");
  }

  // Through gate: each refuses with exit 0, publish=false and a reason.
  await withRoot(fixtureFiles("0.1.0"), async (dir) => {
    const cases: [string, FakeEnvironment, GateOptions, RegExp][] = [
      ["v1.0.0", {}, { root: dir }, /does not match/],
      ["v0.1", {}, { root: dir }, /does not match/],
      ["v0.01.0", {}, { root: dir }, /does not match/],
      ["v0.1.0-rc.1", {}, { root: dir }, /does not match/],
      ["foo", {}, { root: dir }, /does not match/],
      ["v0.2.0", {}, { root: dir }, /v0\.2\.0 does not equal v0\.1\.0/],
      ["v0.1.0", { status: 404 }, { root: dir }, /does not exist .*HTTP 404/],
      ["v0.1.0", { status: 500 }, { root: dir }, /HTTP 500/],
      ["v0.1.0", { body: { can_admins_bypass: false, protection_rules: [] } }, { root: dir }, /no required_reviewers rule naming the Maintainer/],
      ["v0.1.0", { body: { ...PROTECTED, can_admins_bypass: true } }, { root: dir }, /administrators can bypass/],
      ["v0.1.0", { body: { name: "release", protection_rules: PROTECTED.protection_rules } }, { root: dir }, /administrators can bypass/],
      [
        "v0.1.0",
        { body: { can_admins_bypass: false, protection_rules: [{ type: "required_reviewers", reviewers: [...PROTECTED.protection_rules[1]!.reviewers!, { type: "User", reviewer: { login: "someone-else" } }] }] } },
        { root: dir },
        /required reviewer User someone-else, but only the Maintainer \(@edanisko\)/,
      ],
      [
        "v0.1.0",
        { body: { can_admins_bypass: false, protection_rules: [{ type: "required_reviewers", reviewers: [...PROTECTED.protection_rules[1]!.reviewers!, { type: "Team", reviewer: { slug: "maintainers" } }] }] } },
        { root: dir },
        /required reviewer Team maintainers, but only the Maintainer/,
      ],
      ["v0.1.0", {}, { root: dir, token: null }, /GH_TOKEN is not set/],
      // The tagged commit is not on main, or main cannot be verified.
      ["v0.1.0", {}, { root: dir, compare: { body: { status: "ahead" } } }, new RegExp(`commit ${SHA} is not on main \\(compare main\\.\\.\\.${SHA}: ahead\\)`)],
      ["v0.1.0", {}, { root: dir, compare: { body: { status: "diverged" } } }, new RegExp(`commit ${SHA} is not on main \\(compare main\\.\\.\\.${SHA}: diverged\\)`)],
      ["v0.1.0", {}, { root: dir, compare: { status: 404 } }, new RegExp(`commit ${SHA} .*main.*HTTP 404`)],
      ["v0.1.0", {}, { root: dir, compare: { status: 500 } }, new RegExp(`HTTP 500, so commit ${SHA} cannot be verified to be on main`)],
      ["v0.1.0", {}, { root: dir, compare: { text: "<html>not json</html>" } }, new RegExp(`did not return JSON, so commit ${SHA} cannot be verified to be on main`)],
      ["v0.1.0", {}, { root: dir, compare: { body: { ahead_by: 0 } } }, new RegExp(`returned no status, so commit ${SHA} cannot be verified to be on main`)],
    ];
    for (const [tag, environment, options, reason] of cases) {
      const result = await runGate(tag, environment, options);
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
      const lines = result.output.split("\n");
      expect(lines[0]).toBe("publish=false");
      expect(lines[1]).toMatch(/^reason=.+/);
      expect(lines[1]).toMatch(reason);
      expect(result.stdout).toMatch(reason);
      expect(result.stdout).toStartWith("Not publishing: ");
    }
    // A bad tag never reaches the API.
    expect((await runGate("v1.0.0", {}, { root: dir })).hits).toEqual([]);
    // A commit off main never reaches the environment check.
    expect((await runGate("v0.1.0", {}, { root: dir, compare: { body: { status: "ahead" } } })).hits).toEqual([COMPARE_PATH]);
    expect((await runGate("v0.1.0", {}, { root: dir, compare: { status: 404 } })).hits).toEqual([COMPARE_PATH]);
    // No token: nothing is fetched at all.
    expect((await runGate("v0.1.0", {}, { root: dir, token: null })).hits).toEqual([]);
    // The compare request itself fails (nothing listens): refused, exit 0.
    const outputFile = join(dir, "github-output");
    const unreachable = await runCli(["gate", "--tag", "v0.1.0", "--repo", "xaravel/framework", "--sha", SHA, "--github-output", outputFile, "--root", dir], {
      GITHUB_API_URL: "http://127.0.0.1:1",
      GH_TOKEN: "test-token",
    });
    expect(unreachable.code).toBe(0);
    const unreachableLines = readFileSync(outputFile, "utf8").split("\n");
    expect(unreachableLines[0]).toBe("publish=false");
    expect(unreachableLines[1]).toMatch(new RegExp(`^reason=GET .* failed \\(.*\\), so commit ${SHA} cannot be verified to be on main`));
    // And the fixture's matching tag passes, so the refusals above are not vacuous.
    expect((await runGate("v0.1.0", {}, { root: dir })).output).toStartWith("publish=true\n");
  });

  // Usage errors exit 2; an unreadable root fails closed with 1.
  expect((await runCli(["gate", "--tag", "v0.1.0"])).code).toBe(2);
  expect((await runCli(["gate", "--tag", "v0.1.0", "--repo", "not a repo"])).code).toBe(2);
  expect((await runCli(["nope"])).code).toBe(2);
  // --sha is required, and must be 40 lowercase hex characters.
  const noSha = await runCli(["gate", "--tag", "v0.1.0", "--repo", "x/y"]);
  expect(noSha.code).toBe(2);
  expect(noSha.stderr).toContain("--sha <commit>");
  for (const sha of ["abc", SHA.toUpperCase(), `${SHA}0`, SHA.slice(1), `g${SHA.slice(1)}`]) {
    const bad = await runCli(["gate", "--tag", "v0.1.0", "--repo", "x/y", "--sha", sha]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("--sha must be a 40-character lowercase hex commit");
  }
  // It still records `publish=false` and the reason before failing.
  await withRoot({}, async (dir) => {
    const outputFile = join(dir, "github-output");
    const unreadable = await runCli(["gate", "--tag", "v0.1.0", "--repo", "x/y", "--sha", SHA, "--github-output", outputFile, "--root", join(dir, "missing")]);
    expect(unreadable.code).toBe(1);
    expect(readFileSync(outputFile, "utf8")).toMatch(/^publish=false\nreason=gate failed: [^\n]+\n$/);
    expect(unreadable.stdout).toMatch(/^Not publishing: gate failed: /);
    expect(unreadable.stderr).toContain("Release gate failed: ");
  });

  // release.yml triggers on every tag, and only on tags.
  const { data } = workflow("release.yml");
  expect(data.on).toEqual({ push: { tags: ["**"] } });
});

xaravelTest("XT-conformance-37", "the release notes state the Baseline Pin read from conformance/baseline-pin (AD-18, FR-13)", async () => {
  expect(releaseNotes({ version: "0.1.0", pin: "v13.37.0", packages: ["@xaravel/a", "create-xaravel"] })).toBe(
    "# Xaravel v0.1.0\n\nBaseline Pin: laravel/framework v13.37.0\n\nEvery package below is published at 0.1.0, with npm provenance.\n\n## Packages\n\n- `@xaravel/a@0.1.0`\n- `create-xaravel@0.1.0`\n",
  );

  // The repository's notes read the real pin.
  expect(frameworkTag(root)).toBe("v13.37.0");
  const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
  const repo = await runCli(["notes", "--tag", `v${version}`]);
  expect(repo.code).toBe(0);
  expect(repo.stdout).toContain("Baseline Pin: laravel/framework v13.37.0");
  expect(repo.stdout).toContain(`v${version}`);
  expect(repo.stdout).toContain(`- \`@xaravel/support@${version}\``);
  expect(repo.stdout).toContain(`- \`create-xaravel@${version}\``);
  expect(repo.stdout).not.toContain("@xaravel/skeleton");

  // A fixture pin proves it reads the file; private workspaces are not listed.
  await withRoot({ ...fixtureFiles("0.1.0"), "conformance/baseline-pin": `\n  ${pinTable("v99.1.2")}\n\n` }, async (dir) => {
    const notes = await runCli(["notes", "--tag", "v0.1.0", "--root", dir]);
    expect(notes.code).toBe(0);
    expect(notes.stdout).toContain("Baseline Pin: laravel/framework v99.1.2\n");
    expect(notes.stdout).toContain("- `@fixture/alpha@0.1.0`\n- `@fixture/beta@0.1.0`\n");
    expect(notes.stdout).not.toContain("skeleton");
    expect(notes.stdout).not.toContain("v13.37.0");
  });
  // A tag that is not the root version, or not a v0 tag, gets no notes.
  await withRoot(fixtureFiles("0.1.0"), async (dir) => {
    for (const tag of ["v0.2.0", "v1.0.0"]) {
      const refused = await runCli(["notes", "--tag", tag, "--root", dir]);
      expect(refused.code).toBe(1);
      expect(refused.stdout).toBe("");
      expect(refused.stderr).toContain(tag);
    }
  });
  // A missing or empty pin fails.
  const files = fixtureFiles("0.1.0");
  delete files["conformance/baseline-pin"];
  await withRoot(files, async (dir) => {
    const missing = await runCli(["notes", "--tag", "v0.1.0", "--root", dir]);
    expect(missing.code).toBe(1);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("conformance/baseline-pin does not exist");
  });
  await withRoot({ ...fixtureFiles("0.1.0"), "conformance/baseline-pin": " \n" }, async (dir) => {
    const empty = await runCli(["notes", "--tag", "v0.1.0", "--root", dir]);
    expect(empty.code).toBe(1);
    expect(empty.stderr).toContain("conformance/baseline-pin is empty");
  });
});

const READ = "permissions:\n  contents: read\n";
const job = (id: string, body: string): string => `  ${id}:\n    runs-on: ubuntu-latest\n${body}`;
const steps = (...runs: string[]): string => `    steps:\n${runs.map((run) => `      - run: ${run}\n`).join("")}`;
const wf = (top: string, ...jobs: string[]): string => `name: x\non: push\n${top}jobs:\n${jobs.join("")}`;

xaravelTest("XT-conformance-38", "no workflow but the release job has `id-token: write` or runs `npm publish`, the release-authority check fails if one does, and docs/ops/release.md documents the bootstrap publish (AD-18, NFR-11, AD-16.3)", async () => {
  const RELEASE = ".github/workflows/release.yml";
  const OTHER = ".github/workflows/other.yml";
  const ONLY = "only job release of .github/workflows/release.yml may (AD-18)";
  const releaseJob = job("release", "    permissions:\n      contents: write\n      id-token: write\n" + steps('npm publish "$tgz" --provenance'));

  // The release job of release.yml is allowed.
  expect(authorityViolations([{ file: RELEASE, text: wf(READ, releaseJob) }])).toEqual([]);

  // Another workflow with id-token: write, at job or top level.
  expect(authorityViolations([{ file: OTHER, text: wf(READ, job("build", "    permissions:\n      id-token: write\n" + steps("true"))) }])).toEqual([
    `release authority: ${OTHER} job build holds id-token: write; ${ONLY}`,
  ]);
  expect(authorityViolations([{ file: OTHER, text: wf("permissions:\n  id-token: write\n", job("build", steps("true"))) }])).toEqual([
    `release authority: ${OTHER} top-level permissions hold id-token: write; ${ONLY}`,
  ]);
  // A job named release in another workflow is not the release job.
  expect(authorityViolations([{ file: OTHER, text: wf(READ, releaseJob) }])).toEqual([
    `release authority: ${OTHER} job release holds id-token: write; ${ONLY}`,
    `release authority: ${OTHER} job release step 1 runs \`npm publish\`; ${ONLY}`,
  ]);
  // npm, bun, pnpm and yarn publish.
  for (const tool of ["npm", "bun", "pnpm", "yarn"]) {
    expect(authorityViolations([{ file: OTHER, text: wf(READ, job("ship", steps("echo hi", `cd x && ${tool}  publish --tag next`))) }])).toEqual([
      `release authority: ${OTHER} job ship step 2 runs \`${tool}  publish\`; ${ONLY}`,
    ]);
  }
  expect(authorityViolations([{ file: OTHER, text: wf(READ, job("ship", steps("npm publisher", "bun published"))) }])).toEqual([]);
  // Flags between the tool and the verb, within one shell command.
  for (const command of ["npm -w x publish", "pnpm -r publish", "npm --registry=r publish", "yarn --cwd pkg publish --access public", "bun -q --cwd=x publish"]) {
    const matched = PUBLISH_COMMAND.exec(command)?.[0] ?? null;
    expect(matched).toBe(command.replace(/ --access public$/, ""));
    expect(authorityViolations([{ file: OTHER, text: wf(READ, job("ship", steps(`cd x && ${command}`))) }])).toEqual([
      `release authority: ${OTHER} job ship step 1 runs \`${matched}\`; ${ONLY}`,
    ]);
  }
  for (const command of ["npm -w x publisher", "npm run build && echo publish", "npm ci; publish", "pnpm -r published", "npm test x publish"]) {
    expect(PUBLISH_COMMAND.test(command)).toBe(false);
  }
  // write-all.
  expect(authorityViolations([{ file: OTHER, text: wf(READ, job("build", "    permissions: write-all\n" + steps("true"))) }])).toEqual([
    `release authority: ${OTHER} job build holds write-all; ${ONLY}`,
  ]);
  expect(authorityViolations([{ file: RELEASE, text: wf("permissions: write-all\n", releaseJob) }])).toEqual([
    `release authority: ${RELEASE} top-level permissions hold write-all; ${ONLY}`,
  ]);
  // A non-release job in release.yml.
  expect(
    authorityViolations([{ file: RELEASE, text: wf(READ, job("gate", "    permissions:\n      id-token: write\n" + steps("bun publish")), releaseJob) }]),
  ).toEqual([`release authority: ${RELEASE} job gate holds id-token: write; ${ONLY}`, `release authority: ${RELEASE} job gate step 1 runs \`bun publish\`; ${ONLY}`]);
  // Other write scopes are the workflow-permissions check's business, not this one's.
  expect(authorityViolations([{ file: OTHER, text: wf(READ, job("oracle", "    permissions:\n      contents: write\n" + steps("true"))) }])).toEqual([]);
  expect(authorityViolations([{ file: OTHER, text: "[not: yaml" }])[0]).toStartWith(`release authority: ${OTHER} is not valid YAML`);

  // The CLI on fixture roots: a violation, a missing and an empty workflows directory.
  await withRoot({ ".github/workflows/other.yml": wf(READ, job("build", steps("npm publish"))), ".github/workflows/release.yml": wf(READ, releaseJob) }, async (dir) => {
    const bad = await runCli(["authority", "--root", dir]);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toBe("");
    expect(bad.stderr).toContain(`release authority: ${OTHER} job build step 1 runs \`npm publish\``);
    expect(bad.stderr).not.toContain(`release authority: ${RELEASE}`);
  });
  await withRoot({ "README.md": "x\n" }, async (dir) => {
    expect(checkAuthority(dir).violations).toEqual(["release authority: .github/workflows does not exist (AD-18)"]);
    expect((await runCli(["authority", "--root", dir])).code).toBe(1);
  });
  await withRoot({ ".github/workflows/README.md": "x\n" }, async (dir) => {
    expect(checkAuthority(dir).violations).toEqual(["release authority: .github/workflows has no workflows (AD-18)"]);
    expect((await runCli(["authority", "--root", dir])).code).toBe(1);
  });

  // The repository root passes.
  const repo = checkAuthority(root);
  expect(repo.violations).toEqual([]);
  expect(repo.files).toContain(RELEASE);
  const cli = await runCli(["authority"]);
  expect(cli.code).toBe(0);
  expect(cli.stdout).toMatch(/^Release authority OK: \d+ workflow\(s\) checked\.\n$/);

  // release-checks.yml runs authority on every PR, in the merge queue and on main.
  const checks = workflow("release-checks.yml");
  expect(checks.data.on).toEqual({ pull_request: { branches: ["main"] }, merge_group: { types: ["checks_requested"] }, push: { branches: ["main"] } });
  expect(checks.data.permissions).toEqual({ contents: "read" });
  expect(Object.keys(checks.data.jobs).sort()).toEqual(["release-authority", "versions"]);
  expect(checks.data.jobs["release-authority"]!.steps.map((step) => step.run).filter(Boolean)).toEqual(["bun tools/release/release.ts authority"]);
  for (const j of Object.values(checks.data.jobs)) {
    expect(j.permissions).toBeUndefined();
    for (const step of j.steps.filter((s) => s.uses !== undefined)) {
      expect(step.uses!).toMatch(PINNED);
    }
  }
  const code = checks.text.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  expect(code).not.toMatch(/id-token|secrets\.|pull_request_target/);

  // The docs cover the bootstrap publish and that agents never publish.
  const doc = readFileSync(join(root, "docs", "ops", "release.md"), "utf8");
  expect(doc).toContain("## Cutting a release");
  expect(doc).toContain("bun run release:stamp");
  expect(doc).toMatch(/### Bootstrap publish of a new package name/);
  expect(doc).toContain("Agents never publish");
  expect(doc).toContain("Required reviewers");
  expect(doc).toContain("v0.*");
  expect(doc).toContain("Trusted Publisher");
});
