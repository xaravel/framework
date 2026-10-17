// Xaravel Tests for Story 1.1 (root workspace and repository baseline).
// These run under plain `bun test` until the harness lands in Epic 5.
import { expect, test } from "bun:test";
import { existsSync, openSync, closeSync, readFileSync, rmSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "..", "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

test(
  "XT-conformance-1: Bun matches .bun-version, root manifest declares the four workspaces, 0.0.0 and engines.bun >= 1.4, and bun install succeeds (FR Bun-only toolchain)",
  async () => {
    const pinned = read(".bun-version").trim();
    expect(pinned).toBe("1.4.3");
    if (Bun.version !== pinned) {
      throw new Error(`Bun ${Bun.version} is running, but .bun-version pins ${pinned}`);
    }

    const manifest = readJson("package.json");
    expect(manifest.private).toBe(true);
    expect(manifest.version).toBe("0.0.0");
    expect(manifest.type).toBe("module");
    expect(manifest.workspaces).toEqual(["packages/*", "skeleton", "installer", "tools/*"]);
    expect((manifest.engines as Record<string, unknown>).bun).toBe(">=1.4");
    expect(manifest.devDependencies).toEqual({
      "@types/bun": "1.4.3",
      oxlint: "1.88.0",
      "oxlint-tsgolint": "7.0.2004",
      typescript: "7.0.2",
    });

    const proc = Bun.spawn([process.execPath, "install", "--frozen-lockfile"], {
      cwd: root,
      stdout: "ignore",
      stderr: "pipe",
    });
    const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    if (code !== 0) {
      throw new Error(`bun install --frozen-lockfile exited ${code}:\n${stderr}`);
    }
  },
  60_000,
);

test("XT-conformance-2: tsconfig.base.json is strict and ESM-resolving, and no tsconfig sets experimentalDecorators (AD-4)", async () => {
  const base = readJson("tsconfig.base.json");
  const options = base.compilerOptions as Record<string, unknown>;
  expect(options.strict).toBe(true);
  expect(options.module).toBe("esnext");
  expect(options.moduleResolution).toBe("bundler");
  expect("experimentalDecorators" in options).toBe(false);

  const offenders: string[] = [];
  // Tracked and untracked-but-not-ignored files only, so node_modules and
  // other worktrees under .claude/worktrees/ are never scanned.
  const listed = Bun.spawnSync(["git", "ls-files", "-co", "--exclude-standard"], { cwd: root });
  expect(listed.exitCode).toBe(0);
  const tsconfigName = new Bun.Glob("tsconfig*.json");
  const candidates = listed.stdout
    .toString()
    .split("\n")
    .filter((path) => path !== "" && tsconfigName.match(path.split("/").pop() ?? ""));
  expect(candidates).toContain("tsconfig.base.json");
  for (const path of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(read(path));
    } catch (error) {
      throw new Error(`${path} is not valid JSON: ${String(error)}`);
    }
    const compilerOptions = (parsed as Record<string, unknown> | null)?.compilerOptions;
    if (typeof compilerOptions === "object" && compilerOptions !== null && "experimentalDecorators" in compilerOptions) {
      offenders.push(path);
    }
  }
  if (offenders.length > 0) {
    throw new Error(`experimentalDecorators is set in: ${offenders.join(", ")}`);
  }
});

test(
  "XT-conformance-3: with the root bunfig.toml, a root .env does not reach process.env (Bun .env autoload off)",
  async () => {
    const bunfig = Bun.TOML.parse(read("bunfig.toml")) as Record<string, unknown>;
    expect(bunfig.env).toBe(false);

    const envPath = join(root, ".env");
    if (existsSync(envPath)) {
      throw new Error(`${envPath} already exists; move it aside so this test can probe .env loading`);
    }

    const key = `XARAVEL_ENV_PROBE_${crypto.randomUUID().replaceAll("-", "_").toUpperCase()}`;
    // "wx" fails rather than overwrite a file created since the check above.
    let fd: number | null = openSync(envPath, "wx");
    try {
      writeSync(fd, `${key}=leaked\n`);
      closeSync(fd);
      fd = null;
      const proc = Bun.spawn([process.execPath, "-e", `console.log(process.env[${JSON.stringify(key)}] ?? "absent")`], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      if (code !== 0) {
        throw new Error(`bun -e exited ${code}:\n${stderr}`);
      }
      expect(stdout.trim()).toBe("absent");
    } finally {
      if (fd !== null) {
        closeSync(fd);
      }
      rmSync(envPath, { force: true });
    }
  },
  30_000,
);

test("XT-conformance-4: .oxlintrc.json, .gitattributes (LF for *.jsonl, *.ts) and conformance/baseline-pin v13.37.0 exist (Protected root config)", () => {
  for (const path of [".oxlintrc.json", ".gitattributes", "conformance/baseline-pin"]) {
    expect(existsSync(join(root, path))).toBe(true);
  }

  const oxlint = readJson(".oxlintrc.json");
  expect((oxlint.categories as Record<string, unknown>).correctness).toBe("error");

  const proc = Bun.spawnSync(["git", "check-attr", "eol", "--", "x.ts", "x.jsonl"], { cwd: root });
  expect(proc.exitCode).toBe(0);
  expect(proc.stdout.toString().trim().split("\n")).toEqual(["x.ts: eol: lf", "x.jsonl: eol: lf"]);

  expect(read("conformance/baseline-pin").trim()).toBe("v13.37.0");
});

test("XT-conformance-5: LICENSE carries both notices, README the description and non-affiliation statement, SECURITY.md a disclosure process (legal and security baseline)", () => {
  const license = read("LICENSE");
  expect(license).toContain("MIT License");
  expect(license).toContain("Xaravel contributors");
  expect(license).toContain("Copyright (c) Taylor Otwell");

  const readme = read("README.md");
  expect(readme).toContain("A TypeScript port of Laravel");
  expect(readme).toContain("not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.");

  const security = read("SECURITY.md");
  expect(security).toContain("## Supported versions");
  expect(security).toContain("https://github.com/xaravel/framework/security/advisories/new");
  expect(security).toContain("Do not open a public issue");
  expect(security).toContain("Acknowledgement");
  expect(security).toContain("## Coordinated disclosure");
  expect(security).toContain("## Scope");

  const formerName = ["Jar", "avel"].join("");
  for (const [name, text] of [
    ["LICENSE", license],
    ["README.md", readme],
    ["SECURITY.md", security],
  ] as const) {
    if (text.toLowerCase().includes(formerName.toLowerCase())) {
      throw new Error(`${name} uses the former name ${formerName}`);
    }
  }
});
