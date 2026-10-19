// Xaravel Tests for Story 2.2 (Oracle container image, FR-6, OQ-9, AD-16).
// These run under plain `bun test` until the harness lands in Epic 5. Nothing
// here needs Docker, PHP or the network: `docker` and `composer` are recording
// fakes put first on PATH (the XT-41 technique), and every root but the
// repository's own is a temp fixture. CI's `oracle / build` job builds twice
// for real.
import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  checkDockerfile,
  checkLocks,
  contentHash,
  expectedPackages,
  IMAGE_NAME,
  IMAGE_UPSTREAM_DIR,
  imageHash,
  imageTag,
  installedPackages,
  lockPath,
  LOCKS_DIR,
  ORACLE_DIR,
  PHP_VERSION,
  REQUIRED_PACKAGES,
  rootVersions,
  runInImage,
} from "../../../tools/oracle/oracle";
import { readPin, UPSTREAM_REPOS } from "../../../tools/upstream/upstream";
import { ALLOWED_WRITE_JOBS, checkWorkflows } from "../../../tools/workflow-permissions/workflow-permissions";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "oracle", "oracle.ts");
const PIN = readPin(root);
const md5 = (text: string): string => createHash("md5").update(text).digest("hex");

// ---------------------------------------------------------------------------
// Fixtures

interface Pkg {
  name: string;
  version: string;
  reference: string;
}

const tool = (name: string): Pkg => ({ name, version: "1.0.0", reference: `${name.replace(/\W/g, "")}-ref` });
const pinned = (repo: string): Pkg => {
  const entry = PIN.find((e) => e.repo === repo)!;
  return { name: repo, version: entry.tag, reference: entry.commit };
};

function defaultPackages(name: string): Pkg[] {
  const packages = REQUIRED_PACKAGES[name as keyof typeof REQUIRED_PACKAGES].map(tool);
  if (name !== "framework") {
    packages.push(pinned("laravel/framework"), tool("pestphp/pest-plugin"));
  }
  return packages;
}

const composerJson = (name: string): string => `{\n    "name": "laravel/${name}",\n    "require": {\n        "php": "^8.3"\n    },\n    "extra": {}\n}\n`;

const raw = (pkg: Pkg) => ({ name: pkg.name, version: pkg.version, source: { type: "git", url: `https://example.invalid/${pkg.name}.git`, reference: pkg.reference }, dist: { type: "zip", reference: pkg.reference } });

function lockText(json: string, packages: Pkg[], php: string = PHP_VERSION): string {
  const half = Math.ceil(packages.length / 2);
  return `${JSON.stringify(
    {
      _readme: ["fixture"],
      "content-hash": contentHash(json),
      packages: packages.slice(0, half).map(raw),
      "packages-dev": packages.slice(half).map(raw),
      "platform-overrides": { php },
    },
    null,
    4,
  )}\n`;
}

const installedText = (packages: Pkg[]): string => JSON.stringify({ packages: packages.map(raw), dev: true, "dev-package-names": [] });

interface Fixture {
  dir: string;
  repo: string;
  bin: string;
  /** The fake docker's state directory: calls.log, iid, images/<image>/... */
  docker: string;
  calls(): { args: string[]; token: string | null }[];
}

/** A repository root with the real pin and Dockerfile, fixture snapshots and current locks, and a fake docker and composer. */
function fixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-oracle-"));
  const repo = join(dir, "repo");
  const bin = join(dir, "bin");
  const docker = join(dir, "docker");
  mkdirSync(join(repo, ORACLE_DIR), { recursive: true });
  mkdirSync(bin);
  mkdirSync(join(docker, "images"), { recursive: true });
  copyFileSync(join(root, "conformance", "baseline-pin"), join(repo, "conformance", "baseline-pin"));
  copyFileSync(join(root, ORACLE_DIR, "Dockerfile"), join(repo, ORACLE_DIR, "Dockerfile"));
  copyFileSync(join(root, ORACLE_DIR, "Dockerfile.dockerignore"), join(repo, ORACLE_DIR, "Dockerfile.dockerignore"));
  for (const { name } of UPSTREAM_REPOS) {
    const json = composerJson(name);
    write(join(repo, "conformance", "upstream", name, "composer.json"), json);
    write(lockPath(repo, name), lockText(json, defaultPackages(name)));
  }
  writeFileSync(join(docker, "iid"), "sha256:rebuilt\n");
  writeExecutable(join(bin, "docker"), FAKE_DOCKER);
  writeExecutable(join(bin, "composer"), FAKE_COMPOSER);
  mkdirSync(join(dir, "bun-only"));
  symlinkSync(process.execPath, join(dir, "bun-only", "bun"));
  return {
    dir,
    repo,
    bin,
    docker,
    calls: () =>
      existsSync(join(docker, "calls.log"))
        ? readFileSync(join(docker, "calls.log"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { args: string[]; token: string | null })
        : [],
  };
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, `#!${process.execPath}\n${body}`);
  chmodSync(path, 0o755);
}

/** A recording docker: `build` writes the iidfile, `run --entrypoint cat` serves images/<image>/<path>, `php --version` serves images/<image>/php-version. */
const FAKE_DOCKER = `
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.env.FAKE_DOCKER_DIR;
const args = process.argv.slice(2);
appendFileSync(join(dir, "calls.log"), JSON.stringify({ args, token: process.env.GITHUB_TOKEN ?? null }) + "\\n");
if (args[0] === "build") {
  const at = args.indexOf("--iidfile");
  if (at >= 0) writeFileSync(args[at + 1], readFileSync(join(dir, "iid"), "utf8"));
  process.exit(existsSync(join(dir, "build-fails")) ? 1 : 0);
}
if (args[0] === "run") {
  let i = 1;
  let entrypoint = null;
  while (args[i].startsWith("--")) {
    if (args[i] === "--rm") { i++; continue; }
    if (args[i] === "--entrypoint") entrypoint = args[i + 1];
    i += 2;
  }
  const base = join(dir, "images", encodeURIComponent(args[i]));
  const command = args.slice(i + 1);
  const serve = (path) => {
    if (!existsSync(path)) { process.stderr.write("cat: " + path + ": No such file or directory\\n"); process.exit(1); }
    process.stdout.write(readFileSync(path));
    process.exit(0);
  };
  if (entrypoint === "cat") serve(join(base, command[0]));
  if (command.join(" ") === "php --version") serve(join(base, "php-version"));
  if (command[0] === "echo") { process.stdout.write(command.slice(1).join(" ") + "\\n"); process.exit(0); }
  // exit <code> [stderr...]: with no stderr it stands in for an OOM kill, which often writes nothing.
  if (command[0] === "exit") { if (command.length > 2) process.stderr.write(command.slice(2).join(" ") + "\\n"); process.exit(Number(command[1])); }
}
process.stderr.write("fake docker: unexpected call\\n");
process.exit(2);
`;

/** A recording composer: writes a composer.lock for the composer.json in its cwd and records its args and environment. */
const FAKE_COMPOSER = `
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.env.FAKE_COMPOSER_DIR;
const home = process.env.COMPOSER_HOME;
appendFileSync(join(dir, "composer.log"), JSON.stringify({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  rootVersion: process.env.COMPOSER_ROOT_VERSION ?? null,
  config: JSON.parse(readFileSync(join(home, "config.json"), "utf8")),
}) + "\\n");
const json = readFileSync("composer.json", "utf8");
const name = JSON.parse(json).name.split("/")[1];
writeFileSync("composer.lock", readFileSync(join(dir, name + ".lock"), "utf8"));
`;

function cleanup(fx: Fixture): void {
  rmSync(fx.dir, { recursive: true, force: true });
}

/** Runs the CLI with exactly `env` (plus a temp HOME). */
async function cli(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { cwd: root, env: { HOME: tmpdir(), ...env }, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

/** A PATH with the fakes first (shadowing any real docker), then bun, then the system tools. */
const withFakes = (fx: Fixture): Record<string, string> => ({
  PATH: `${fx.bin}:${join(fx.dir, "bun-only")}:${process.env["PATH"] ?? "/usr/bin:/bin"}`,
  FAKE_DOCKER_DIR: fx.docker,
  FAKE_COMPOSER_DIR: fx.dir,
});
/** A PATH holding only bun, so no docker is on it at all (GitHub's runners have /usr/bin/docker). */
const noDocker = (fx: Fixture): Record<string, string> => ({ PATH: join(fx.dir, "bun-only") });

/** Puts an image into the fake docker: each snapshot's installed.json and composer.json (and the Pest plugin manifest when it installs pestphp/pest-plugin), and its php --version. */
function addImage(fx: Fixture, image: string, packages: (name: string) => Pkg[], php: string = `PHP ${PHP_VERSION} (cli) (built: Sep 22 2026 13:32:06) (NTS)`): void {
  const base = join(fx.docker, "images", encodeURIComponent(image));
  for (const { name } of UPSTREAM_REPOS) {
    write(join(base, IMAGE_UPSTREAM_DIR, name, "vendor", "composer", "installed.json"), installedText(packages(name)));
    write(join(base, IMAGE_UPSTREAM_DIR, name, "composer.json"), composerJson(name));
    if (packages(name).some((pkg) => pkg.name === "pestphp/pest-plugin")) {
      write(join(base, IMAGE_UPSTREAM_DIR, name, "vendor", "pest-plugins.json"), '[\n    "Pest\\\\Plugins\\\\Bail"\n]');
    }
  }
  writeFileSync(join(base, "php-version"), `${php}\nCopyright (c) The PHP Group\n`);
}

function setLock(fx: Fixture, name: string, packages: Pkg[], json: string = composerJson(name)): void {
  writeFileSync(lockPath(fx.repo, name), lockText(json, packages));
}

// ---------------------------------------------------------------------------

test("XT-conformance-42: the image built from conformance/oracle/Dockerfile and the committed locks holds PHP 8.5.11 and the snapshot with its dev dependencies, and two builds install the same package set (FR-6, OQ-9)", async () => {
  // Composer's content-hash, emulated: the relevant keys ksorted, json_encode with flags 0.
  expect(contentHash('{"name":"a/b","description":"ignored","require":{"php":"^8.3"},"extra":{}}')).toBe(md5('{"extra":[],"name":"a\\/b","require":{"php":"^8.3"}}'));
  expect(contentHash('{"name":"x","extra":{"label":"café 😀","path":"A\\\\B"}}')).toBe(md5('{"extra":{"label":"caf\\u00e9 \\ud83d\\ude00","path":"A\\\\B"},"name":"x"}'));
  expect(contentHash('{"name":"x","extra":{"1":"a","0":"b"},"prefer-stable":true}')).toBe(md5('{"extra":{"1":"a","0":"b"},"name":"x","prefer-stable":true}'));
  expect(contentHash('{"name":"x","extra":{"0":"a","1":"b"},"version":"1.0"}')).toBe(md5('{"extra":["a","b"],"name":"x","version":"1.0"}'));
  expect(contentHash('{"name":"x","config":{"sort-packages":true,"platform":{"php":"8.5.11"}}}')).toBe(md5('{"config":{"platform":{"php":"8.5.11"}},"name":"x"}'));
  expect(contentHash('{"name":"x","config":{"sort-packages":true}}')).toBe(md5('{"name":"x"}'));
  expect(contentHash('{"name":"x","extra":{"n":10,"f":1.5,"w":2.0}}')).toBe(md5('{"extra":{"n":10,"f":1.5,"w":2.0},"name":"x"}'));
  expect(() => contentHash("[1]")).toThrow("not a JSON object");
  expect(() => contentHash('{"name":"x\n"}')).toThrow("invalid string");
  expect(() => contentHash('{"name":"x}')).toThrow("unterminated string");

  // Package sets: a lock's packages and packages-dev, and installed.json in Composer 2's form or the older bare list, sorted by name.
  const sample = [tool("b/b"), tool("a/a")];
  expect(expectedPackages(lockText("{}", sample)).map((pkg) => pkg.name)).toEqual(["a/a", "b/b"]);
  expect(installedPackages(installedText(sample))).toEqual(expectedPackages(lockText("{}", sample)));
  expect(installedPackages(JSON.stringify(sample.map(raw)))).toEqual(installedPackages(installedText(sample)));

  // The Dockerfile, statically: digest-pinned bases, PHP 8.5.11, only `composer install` from the locks, the token only as a secret mount.
  const dockerfile = readFileSync(join(root, ORACLE_DIR, "Dockerfile"), "utf8");
  const code = dockerfile.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  expect(code).toContain("FROM php:8.5.11-cli-trixie@sha256:01a109229f4465bc9ef042d9198f09a4d9da7775a825dbd8572dcdbd8756c4d3");
  expect(code).toContain("FROM composer:2.10.3@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac AS composer");
  expect(code).toContain("composer install");
  expect(code).not.toMatch(/composer\s+update/);
  expect(code).toContain("--mount=type=secret,id=github_token");
  expect(code).not.toMatch(/^\s*(ARG|ENV)\b[^\n]*(TOKEN|AUTH)/im);
  expect(code).toContain("docker-php-ext-install");
  // The root-version list is a build argument derived from the Pin, never a literal list.
  expect(code).toMatch(/^ARG XARAVEL_ROOT_VERSIONS$/m);
  expect(code).toContain("for pair in $XARAVEL_ROOT_VERSIONS; do");
  expect(code).toContain(': "${XARAVEL_ROOT_VERSIONS:?');
  // Two install passes: the secret RUN downloads with no plugin or script code; a token-less RUN runs plugins and scripts.
  const runs = code.replace(/\\\n\s*/g, " ").split("\n").filter((line) => line.startsWith("RUN "));
  const secretRuns = runs.filter((run) => run.includes("--mount=type=secret,id=github_token"));
  expect(secretRuns.length).toBe(1);
  expect(secretRuns[0]).toContain('COMPOSER_ROOT_VERSION="${pair#*:}" composer install --no-progress --prefer-dist --no-plugins --no-scripts;');
  expect(secretRuns[0]).toContain("COMPOSER_AUTH");
  expect(secretRuns[0]!.match(/composer install/g)).toEqual(["composer install"]);
  const fullRuns = runs.filter((run) => !run.includes("--mount=type=secret") && run.includes("composer install"));
  expect(fullRuns.length).toBe(1);
  expect(fullRuns[0]).toContain('COMPOSER_ROOT_VERSION="${pair#*:}" composer install --no-progress --prefer-dist;');
  expect(fullRuns[0]).toContain("for pair in $XARAVEL_ROOT_VERSIONS; do");
  expect(fullRuns[0]).not.toMatch(/--no-plugins|--no-scripts|COMPOSER_AUTH|github_token/);
  expect(rootVersions(root)).toBe(PIN.map((entry) => `${entry.name}:${entry.tag.replace(/^v/, "")}`).join(" "));
  expect(code).toContain('LABEL org.opencontainers.image.source="https://github.com/xaravel/framework" \\\n      org.opencontainers.image.licenses="MIT"');
  for (const { name } of UPSTREAM_REPOS) {
    expect(code).toContain(`COPY conformance/upstream/${name} ${IMAGE_UPSTREAM_DIR}/${name}\n`);
    expect(code).toContain(`COPY ${LOCKS_DIR}/${name}/composer.lock ${IMAGE_UPSTREAM_DIR}/${name}/composer.lock\n`);
  }
  expect(checkDockerfile(root)).toEqual([]);
  expect(readFileSync(join(root, ORACLE_DIR, "Dockerfile.dockerignore"), "utf8").split("\n").filter((line) => line !== "" && !line.startsWith("#"))).toEqual([
    "*",
    "!conformance/upstream/",
    "!conformance/oracle/locks/",
  ]);

  // The committed locks: one per snapshot, for PHP 8.5.11, holding the test tools, with every other Upstream package on its Pin.
  expect(readdirSync(join(root, LOCKS_DIR)).sort()).toEqual(["ai", "boost", "framework", "mcp"]);
  for (const entry of PIN) {
    const text = readFileSync(lockPath(root, entry.name), "utf8");
    const lock = JSON.parse(text) as Record<string, unknown>;
    expect([entry.name, (lock["platform-overrides"] as Record<string, string>)["php"]]).toEqual([entry.name, PHP_VERSION]);
    const names = new Set(expectedPackages(text).map((pkg) => pkg.name));
    for (const required of ["phpunit/phpunit", "mockery/mockery"]) {
      expect([entry.name, required, names.has(required)]).toEqual([entry.name, required, true]);
    }
    expect([entry.name, names.has(entry.name === "framework" ? "orchestra/testbench-core" : "orchestra/testbench")]).toEqual([entry.name, true]);
    if (entry.name !== "framework") {
      expect([entry.name, names.has("pestphp/pest"), names.has("laravel/framework")]).toEqual([entry.name, true, true]);
    }
    for (const pkg of expectedPackages(text)) {
      const other = PIN.find((e) => e.repo === pkg.name);
      if (other !== undefined) {
        expect([entry.name, pkg.name, pkg.version, pkg.reference]).toEqual([entry.name, pkg.name, other.tag, other.commit]);
      }
    }
  }
  // Against the real snapshot when one is synced: Composer's own content-hash equals the emulation, and the check passes.
  if (existsSync(join(root, "conformance", "upstream", "framework", "composer.json"))) {
    for (const entry of PIN) {
      const lock = JSON.parse(readFileSync(lockPath(root, entry.name), "utf8")) as Record<string, string>;
      expect([entry.name, contentHash(readFileSync(join(root, "conformance", "upstream", entry.name, "composer.json"), "utf8"))]).toEqual([entry.name, lock["content-hash"]!]);
    }
    expect(checkLocks(root).problems).toEqual([]);
  }

  const fx = fixture();
  try {
    const env = withFakes(fx);
    // Locks current: the check passes and prints the tag.
    const ok = await cli(["check", "--root", fx.repo], env);
    expect(ok.stderr).toBe("");
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain(`Oracle locks OK: 4 locks current. Image tag: ${imageTag(fx.repo)}`);

    // The tag: the framework Pin, then the first 12 hex of the SHA-256 of the
    // four locks in pin order, then the Dockerfile, then its dockerignore,
    // each framed as `<relative path>\0<byte length>\0<bytes>`, then the
    // XARAVEL_ROOT_VERSIONS build argument framed as
    // `build-arg XARAVEL_ROOT_VERSIONS\0<byte length>\0<value>`.
    const all = createHash("sha256");
    const inputs = [
      ...UPSTREAM_REPOS.map(({ name }) => `${LOCKS_DIR}/${name}/composer.lock`),
      `${ORACLE_DIR}/Dockerfile`,
      `${ORACLE_DIR}/Dockerfile.dockerignore`,
    ];
    for (const relative of inputs) {
      const bytes = readFileSync(join(fx.repo, relative));
      all.update(`${relative}\0${bytes.length}\0`);
      all.update(bytes);
    }
    const versions = Buffer.from("framework:13.37.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3");
    expect(rootVersions(fx.repo)).toBe(versions.toString());
    all.update(`build-arg XARAVEL_ROOT_VERSIONS\0${versions.length}\0`);
    all.update(versions);
    expect(imageHash(fx.repo)).toBe(all.digest("hex").slice(0, 12));
    expect(imageTag(fx.repo)).toBe(`v13.37.0-${imageHash(fx.repo)}`);
    expect((await cli(["tag", "--root", fx.repo], env)).stdout).toBe(`${imageTag(fx.repo)}\n`);
    const before = imageTag(fx.repo);
    setLock(fx, "boost", [...defaultPackages("boost"), tool("extra/package")]);
    expect(imageTag(fx.repo)).not.toBe(before);
    setLock(fx, "boost", defaultPackages("boost"));
    expect(imageTag(fx.repo)).toBe(before);
    // Only the ai Pin tag moving (the build argument changes) moves the tag; restoring it restores the tag.
    const pinFile = join(fx.repo, "conformance", "baseline-pin");
    const pinBytes = readFileSync(pinFile, "utf8");
    const aiTag = PIN.find((entry) => entry.name === "ai")!.tag;
    writeFileSync(pinFile, pinBytes.replace(new RegExp(`^(laravel/ai\\s+)${aiTag.replace(/\./g, "\\.")}(\\s)`, "m"), "$1v1.2.4$2"));
    expect(rootVersions(fx.repo)).toBe("framework:13.37.0 ai:1.2.4 mcp:1.0.2 boost:2.10.3");
    expect(imageTag(fx.repo)).not.toBe(before);
    expect(imageTag(fx.repo).startsWith("v13.37.0-")).toBe(true);
    writeFileSync(pinFile, pinBytes);
    expect(imageTag(fx.repo)).toBe(before);
    // A Dockerfile or dockerignore edit moves the tag; restoring it restores the tag.
    for (const relative of [`${ORACLE_DIR}/Dockerfile`, `${ORACLE_DIR}/Dockerfile.dockerignore`]) {
      const file = join(fx.repo, relative);
      const original = readFileSync(file);
      writeFileSync(file, Buffer.concat([original, Buffer.from("\n")]));
      expect([relative, imageTag(fx.repo) === before]).toEqual([relative, false]);
      writeFileSync(file, original);
      expect(imageTag(fx.repo)).toBe(before);
    }
    // A missing Dockerfile makes the hash throw, naming it.
    const oracleDockerfile = join(fx.repo, ORACLE_DIR, "Dockerfile");
    const dockerfileBytes = readFileSync(oracleDockerfile);
    rmSync(oracleDockerfile);
    expect(() => imageHash(fx.repo)).toThrow(`${ORACLE_DIR}/Dockerfile is missing`);
    const noDockerfile = await cli(["tag", "--root", fx.repo], env);
    expect(noDockerfile.code).toBe(1);
    expect(noDockerfile.stderr).toContain(`${ORACLE_DIR}/Dockerfile is missing`);
    writeFileSync(oracleDockerfile, dockerfileBytes);
    expect(imageTag(fx.repo)).toBe(before);
    // A missing dockerignore makes the hash throw, naming it.
    const oracleDockerignore = join(fx.repo, ORACLE_DIR, "Dockerfile.dockerignore");
    const dockerignoreBytes = readFileSync(oracleDockerignore);
    rmSync(oracleDockerignore);
    expect(() => imageHash(fx.repo)).toThrow(`${ORACLE_DIR}/Dockerfile.dockerignore is missing`);
    const noDockerignore = await cli(["tag", "--root", fx.repo], env);
    expect(noDockerignore.code).toBe(1);
    expect(noDockerignore.stderr).toContain(`${ORACLE_DIR}/Dockerfile.dockerignore is missing`);
    writeFileSync(oracleDockerignore, dockerignoreBytes);
    expect(imageTag(fx.repo)).toBe(before);

    // Drifted lock: the snapshot composer.json changed.
    const aiJson = join(fx.repo, "conformance", "upstream", "ai", "composer.json");
    const edited = composerJson("ai").replace("^8.3", "^8.4");
    writeFileSync(aiJson, edited);
    const drift = await cli(["check", "--root", fx.repo], env);
    expect(drift.code).toBe(1);
    expect(drift.stderr).toContain(`${LOCKS_DIR}/ai/composer.lock is not current for conformance/upstream/ai/composer.json: expected content-hash ${contentHash(edited)}, actual ${contentHash(composerJson("ai"))}; run bun run oracle:lock`);
    expect(drift.stderr).not.toContain("locks/framework");
    writeFileSync(aiJson, composerJson("ai"));

    // Missing lock, missing snapshot.
    rmSync(lockPath(fx.repo, "mcp"));
    rmSync(join(fx.repo, "conformance", "upstream", "boost"), { recursive: true });
    const missing = await cli(["check", "--root", fx.repo], env);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain(`${LOCKS_DIR}/mcp/composer.lock is missing; run bun run oracle:lock`);
    expect(missing.stderr).toContain("conformance/upstream/boost/composer.json is missing; run bun run upstream:sync");
    expect((await cli(["tag", "--root", fx.repo], env)).stderr).toContain(`${LOCKS_DIR}/mcp/composer.lock is missing; run bun run oracle:lock`);
    write(join(fx.repo, "conformance", "upstream", "boost", "composer.json"), composerJson("boost"));
    setLock(fx, "mcp", defaultPackages("mcp"));

    // Off-pin Upstream package, and one at the pinned tag but another commit.
    setLock(fx, "ai", defaultPackages("ai").map((pkg) => (pkg.name === "laravel/framework" ? { ...pkg, version: "v13.36.0" } : pkg)));
    setLock(fx, "boost", [...defaultPackages("boost"), { ...pinned("laravel/mcp"), reference: "0".repeat(40) }]);
    const offPin = await cli(["check", "--root", fx.repo], env);
    expect(offPin.code).toBe(1);
    expect(offPin.stderr).toContain(`${LOCKS_DIR}/ai/composer.lock holds laravel/framework v13.36.0, but its Pin tag is v13.37.0; run bun run oracle:lock`);
    expect(offPin.stderr).toContain(`${LOCKS_DIR}/boost/composer.lock holds laravel/mcp v1.0.2 at ${"0".repeat(40)}, but its Pin commit is ${pinned("laravel/mcp").reference}`);
    setLock(fx, "ai", defaultPackages("ai"));
    setLock(fx, "boost", defaultPackages("boost"));

    // Missing tool, and a lock not resolved for PHP 8.5.11.
    setLock(fx, "framework", defaultPackages("framework").filter((pkg) => pkg.name !== "mockery/mockery"));
    setLock(fx, "mcp", defaultPackages("mcp").filter((pkg) => pkg.name !== "pestphp/pest"));
    writeFileSync(lockPath(fx.repo, "ai"), lockText(composerJson("ai"), defaultPackages("ai"), "8.4.0"));
    const tools = await cli(["check", "--root", fx.repo], env);
    expect(tools.code).toBe(1);
    expect(tools.stderr).toContain(`${LOCKS_DIR}/framework/composer.lock lacks mockery/mockery`);
    expect(tools.stderr).toContain(`${LOCKS_DIR}/mcp/composer.lock lacks pestphp/pest`);
    expect(tools.stderr).toContain(`${LOCKS_DIR}/ai/composer.lock was not resolved for PHP 8.5.11: platform-overrides.php is "8.4.0"`);
    for (const { name } of UPSTREAM_REPOS) {
      setLock(fx, name, defaultPackages(name));
    }

    // A Dockerfile that drifts from the Pin or the rules fails the check.
    const dockerfilePath = join(fx.repo, ORACLE_DIR, "Dockerfile");
    writeFileSync(
      dockerfilePath,
      dockerfile
        .replace("for pair in $XARAVEL_ROOT_VERSIONS;", "for pair in framework:13.37.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3;")
        .replace(/@sha256:[0-9a-f]{64} AS composer/, " AS composer")
        .replace("composer install --no-progress", "composer update --no-progress"),
    );
    const badDockerfile = await cli(["check", "--root", fx.repo], env);
    expect(badDockerfile.code).toBe(1);
    expect(badDockerfile.stderr).toContain(`the composer install loop must be "for pair in $XARAVEL_ROOT_VERSIONS;"`);
    expect(badDockerfile.stderr).toContain(`found "framework:13.37.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3"`);
    expect(badDockerfile.stderr).toContain("base image is not pinned by digest: FROM composer:2.10.3 AS composer");
    expect(badDockerfile.stderr).toContain("runs composer update");
    expect(badDockerfile.stderr).not.toContain("ARG XARAVEL_ROOT_VERSIONS");
    // Without the ARG (or with a default) the check fails, naming it.
    for (const arg of ["", "ARG XARAVEL_ROOT_VERSIONS=framework:13.37.0"]) {
      writeFileSync(dockerfilePath, dockerfile.replace("ARG XARAVEL_ROOT_VERSIONS\n", arg === "" ? "" : `${arg}\n`));
      const noArg = await cli(["check", "--root", fx.repo], env);
      expect([arg, noArg.code]).toEqual([arg, 1]);
      expect(noArg.stderr).toContain(`${ORACLE_DIR}/Dockerfile must declare "ARG XARAVEL_ROOT_VERSIONS" with no default`);
    }
    // A second ARG line with a default beside the bare one fails, naming it.
    writeFileSync(dockerfilePath, dockerfile.replace("ARG XARAVEL_ROOT_VERSIONS\n", "ARG XARAVEL_ROOT_VERSIONS\nARG XARAVEL_ROOT_VERSIONS=framework:13.37.0\n"));
    expect(checkDockerfile(fx.repo)).toEqual([`${ORACLE_DIR}/Dockerfile gives "ARG XARAVEL_ROOT_VERSIONS" a default; declare it with no default (oracle:build passes it from the Pin)`]);
    // Without the non-empty guard an empty list would loop zero times, so the check fails.
    writeFileSync(dockerfilePath, dockerfile.replace(/^\s*: "\$\{XARAVEL_ROOT_VERSIONS:\?[^\n]*\n/m, ""));
    expect(checkDockerfile(fx.repo)).toEqual([`${ORACLE_DIR}/Dockerfile must guard the build argument with \`: "\${XARAVEL_ROOT_VERSIONS:?…}"\`, so an unset or empty list fails the build`]);
    // Plugins or scripts under the token: the secret RUN lacks a flag, naming the RUN and the flag.
    const secretInstall = "composer install --no-progress --prefer-dist --no-plugins --no-scripts";
    const secretLine = dockerfile.split("\n").findIndex((line) => line.startsWith("RUN --mount=type=secret,id=github_token")) + 1;
    expect(secretLine).toBeGreaterThan(0);
    const underToken = (flags: string): string =>
      `${ORACLE_DIR}/Dockerfile:${secretLine}: the RUN that mounts a secret or sets COMPOSER_AUTH runs "${secretInstall.replace(` --no-plugins --no-scripts`, "")}${flags === "" ? "" : ` ${flags}`}" without `;
    for (const [flags, missing] of [["", "--no-plugins and --no-scripts"], ["--no-scripts", "--no-plugins"], ["--no-plugins", "--no-scripts"]] as const) {
      writeFileSync(dockerfilePath, dockerfile.replace(secretInstall, `composer install --no-progress --prefer-dist${flags === "" ? "" : ` ${flags}`}`));
      expect([flags, checkDockerfile(fx.repo)]).toEqual([flags, [`${underToken(flags)}${missing}; Composer plugin and script code would run while the token is readable`]]);
    }
    writeFileSync(dockerfilePath, dockerfile.replace(secretInstall, "composer install --no-progress --prefer-dist"));
    const pluginsUnderToken = await cli(["check", "--root", fx.repo], env);
    expect(pluginsUnderToken.code).toBe(1);
    expect(pluginsUnderToken.stderr).toContain(`${ORACLE_DIR}/Dockerfile:${secretLine}: the RUN that mounts a secret or sets COMPOSER_AUTH runs`);
    // Any composer command under the token needs both flags, not only composer install.
    const tokenCleanup = "    done; \\\n    rm -rf /tmp/composer-home /tmp/composer-cache; \\\n    groupadd";
    expect(dockerfile).toContain(tokenCleanup);
    writeFileSync(dockerfilePath, dockerfile.replace(tokenCleanup, tokenCleanup.replace("    rm -rf", "    composer dump-autoload; \\\n    rm -rf")));
    expect(checkDockerfile(fx.repo)).toEqual([
      `${ORACLE_DIR}/Dockerfile:${secretLine}: the RUN that mounts a secret or sets COMPOSER_AUTH runs "composer dump-autoload" without --no-plugins and --no-scripts; Composer plugin and script code would run while the token is readable`,
    ]);
    // No token-less pass: plugins and scripts would never run.
    const neverRun = `${ORACLE_DIR}/Dockerfile: no RUN without a secret mount or COMPOSER_AUTH runs composer install without --no-plugins and --no-scripts; Composer plugins and scripts would never run`;
    const fullInstall = 'composer install --no-progress --prefer-dist; \\\n    done; \\\n    rm -rf';
    expect(dockerfile).toContain(fullInstall);
    for (const flags of ["--no-plugins --no-scripts", "--no-plugins", "--no-scripts"]) {
      writeFileSync(dockerfilePath, dockerfile.replace(fullInstall, fullInstall.replace("--prefer-dist", `--prefer-dist ${flags}`)));
      expect([flags, checkDockerfile(fx.repo)]).toEqual([flags, [neverRun]]);
    }
    const noFullPass = await cli(["check", "--root", fx.repo], env);
    expect(noFullPass.code).toBe(1);
    expect(noFullPass.stderr).toContain(neverRun);
    // COMPOSER_AUTH in the second RUN makes it token-bearing: it runs plugins under a token and is no token-less pass.
    const fullRun = "RUN set -eu; \\\n    for pair";
    const fullLine = dockerfile.split("\n").findIndex((line) => line.startsWith("RUN set -eu; \\")) + 1;
    expect(fullLine).toBeGreaterThan(secretLine);
    writeFileSync(dockerfilePath, dockerfile.replace(fullRun, 'RUN set -eu; \\\n    export COMPOSER_AUTH="$(cat /tmp/auth.json)"; \\\n    for pair'));
    expect(checkDockerfile(fx.repo)).toEqual([
      `${ORACLE_DIR}/Dockerfile:${fullLine}: the RUN that mounts a secret or sets COMPOSER_AUTH runs "composer install --no-progress --prefer-dist" without --no-plugins and --no-scripts; Composer plugin and script code would run while the token is readable`,
      neverRun,
    ]);
    // Both installs in one secret RUN fails as plugins under the token (and leaves no token-less pass).
    const merged = dockerfile.replace(/(chmod -R u\+w \/oracle\/upstream)\n[\s\S]*?\nRUN set -eu; \\\n/, "$1; \\\n");
    expect(merged).not.toBe(dockerfile);
    writeFileSync(dockerfilePath, merged);
    expect(checkDockerfile(fx.repo)).toEqual([`${underToken("")}--no-plugins and --no-scripts; Composer plugin and script code would run while the token is readable`, neverRun]);
    writeFileSync(dockerfilePath, dockerfile);
    expect(checkDockerfile(fx.repo)).toEqual([]);
    expect(fx.calls()).toEqual([]);

    // verify-image: an image holding exactly the locks on PHP 8.5.11 passes and prints the sorted set.
    const image = `${IMAGE_NAME}:${imageTag(fx.repo)}`;
    addImage(fx, image, defaultPackages);
    const verified = await cli(["verify-image", image, "--root", fx.repo], env);
    expect(verified.stderr).toBe("");
    expect(verified.code).toBe(0);
    const frameworkLines = verified.stdout.split("\n").filter((line) => line.startsWith("framework: "));
    expect(frameworkLines).toEqual([...frameworkLines].sort());
    expect(frameworkLines).toContain("framework: mockery/mockery 1.0.0 mockerymockery-ref");
    expect(verified.stdout).toContain(`php: PHP ${PHP_VERSION} (cli)`);
    expect(verified.stdout).toContain(`Oracle image ${image} OK.`);
    expect(fx.calls().every((call) => call.args[0] === "run" && call.args.includes("--network") && call.args.includes(image))).toBe(true);

    // An extra, a missing and an other-version package, and another PHP, each listed.
    const bad = `${IMAGE_NAME}:bad`;
    addImage(
      fx,
      bad,
      (name) => {
        const packages = defaultPackages(name);
        if (name === "framework") {
          return [...packages.filter((pkg) => pkg.name !== "mockery/mockery"), tool("extra/package")];
        }
        if (name === "ai") {
          return packages.map((pkg) => (pkg.name === "pestphp/pest" ? { ...pkg, version: "4.0.0" } : pkg));
        }
        return packages;
      },
      "PHP 8.4.13 (cli) (built: Jan 1 2026 00:00:00) (NTS)",
    );
    const differs = await cli(["verify-image", bad, "--root", fx.repo], env);
    expect(differs.code).toBe(1);
    expect(differs.stderr).toContain(`framework: missing: mockery/mockery 1.0.0 mockerymockery-ref is in ${LOCKS_DIR}/framework/composer.lock but not in ${bad} ${IMAGE_UPSTREAM_DIR}/framework`);
    expect(differs.stderr).toContain(`framework: extra: extra/package 1.0.0 extrapackage-ref is in ${bad} ${IMAGE_UPSTREAM_DIR}/framework but not in ${LOCKS_DIR}/framework/composer.lock`);
    expect(differs.stderr).toContain(`ai: differs: pestphp/pest is 1.0.0 pestphppest-ref in ${LOCKS_DIR}/ai/composer.lock but 4.0.0 pestphppest-ref in ${bad}`);
    expect(differs.stderr).toContain(`${bad}: expected PHP 8.5.11, php --version reports "PHP 8.4.13 (cli) (built: Jan 1 2026 00:00:00) (NTS)"`);
    expect(differs.stderr).not.toContain("mcp:");
    // An image whose composer.json differs from the snapshot, or lacks it.
    const edit = `${IMAGE_NAME}:edited-json`;
    addImage(fx, edit, defaultPackages);
    const editBase = join(fx.docker, "images", encodeURIComponent(edit), IMAGE_UPSTREAM_DIR);
    writeFileSync(join(editBase, "mcp", "composer.json"), composerJson("mcp").replace("^8.3", "^8.4"));
    rmSync(join(editBase, "boost", "composer.json"));
    const edited2 = await cli(["verify-image", edit, "--root", fx.repo], env);
    expect(edited2.code).toBe(1);
    expect(edited2.stderr).toContain(`mcp: ${edit} ${IMAGE_UPSTREAM_DIR}/mcp/composer.json differs from conformance/upstream/mcp/composer.json`);
    expect(edited2.stderr).toContain(`boost: ${edit} ${IMAGE_UPSTREAM_DIR}/boost/composer.json cannot be read`);
    // A Pest suite without vendor/pest-plugins.json (its Composer plugin never ran) fails, naming each snapshot.
    const noManifest = `${IMAGE_NAME}:no-pest-manifest`;
    addImage(fx, noManifest, defaultPackages);
    const manifestBase = join(fx.docker, "images", encodeURIComponent(noManifest), IMAGE_UPSTREAM_DIR);
    expect(existsSync(join(manifestBase, "framework", "vendor", "pest-plugins.json"))).toBe(false);
    for (const name of ["ai", "mcp", "boost"]) {
      expect([name, existsSync(join(manifestBase, name, "vendor", "pest-plugins.json"))]).toEqual([name, true]);
    }
    rmSync(join(manifestBase, "mcp", "vendor", "pest-plugins.json"));
    const missingManifest = await cli(["verify-image", noManifest, "--root", fx.repo], env);
    expect(missingManifest.code).toBe(1);
    expect(missingManifest.stderr).toContain(`mcp: ${noManifest} ${IMAGE_UPSTREAM_DIR}/mcp/vendor/pest-plugins.json cannot be read, so pestphp/pest-plugin never ran`);
    expect(missingManifest.stderr).not.toContain("ai: ");
    expect(missingManifest.stderr).not.toContain("boost: ");
    expect(missingManifest.stderr).not.toContain("framework: ");
    // A missing local snapshot composer.json fails rather than skipping the comparison.
    const snapJson = join(fx.repo, "conformance", "upstream", "ai", "composer.json");
    rmSync(snapJson);
    const noSnap = await cli(["verify-image", image, "--root", fx.repo], env);
    expect(noSnap.code).toBe(1);
    expect(noSnap.stderr).toContain("ai: conformance/upstream/ai/composer.json is missing; run bun run upstream:sync");
    writeFileSync(snapJson, composerJson("ai"));
    const absent = await cli(["verify-image", `${IMAGE_NAME}:absent`, "--root", fx.repo], env);
    expect(absent.code).toBe(1);
    expect(absent.stderr).toContain(`${IMAGE_NAME}:absent ${IMAGE_UPSTREAM_DIR}/framework: cannot read vendor/composer/installed.json`);

    // build: two builds, the second with --no-cache, the token only as a BuildKit secret; equal sets pass.
    rmSync(join(fx.docker, "calls.log"), { force: true });
    addImage(fx, "sha256:rebuilt", defaultPackages);
    const built = await cli(["build", image, "--root", fx.repo], { ...env, GITHUB_TOKEN: "ghs_fixturetoken" });
    expect(built.stderr).toBe("");
    expect(built.code).toBe(0);
    expect(built.stdout).toContain(`build A (${image}) and build B (sha256:rebuilt) installed the same package sets`);
    const builds = fx.calls().filter((call) => call.args[0] === "build");
    expect(builds.map((call) => call.args)).toEqual([
      ["build", "--file", `${ORACLE_DIR}/Dockerfile`, "--build-arg", "XARAVEL_ROOT_VERSIONS=framework:13.37.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3", "--secret", "id=github_token,env=GITHUB_TOKEN", "--tag", image, "."],
      ["build", "--file", `${ORACLE_DIR}/Dockerfile`, "--build-arg", "XARAVEL_ROOT_VERSIONS=framework:13.37.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3", "--secret", "id=github_token,env=GITHUB_TOKEN", "--no-cache", "--iidfile", builds[1]!.args[9]!, "."],
    ]);
    expect(builds.every((call) => call.token === "ghs_fixturetoken")).toBe(true);
    expect(JSON.stringify(fx.calls().map((call) => call.args))).not.toContain("ghs_fixturetoken");
    const runs = fx.calls().filter((call) => call.args[0] === "run");
    expect(runs.some((call) => call.args.includes(image))).toBe(true);
    expect(runs.some((call) => call.args.includes("sha256:rebuilt"))).toBe(true);
    // Without a token there is no secret flag.
    rmSync(join(fx.docker, "calls.log"));
    expect((await cli(["build", image, "--root", fx.repo], env)).code).toBe(0);
    expect(fx.calls().filter((call) => call.args[0] === "build").every((call) => !call.args.includes("--secret"))).toBe(true);

    // Two builds that differ fail with the diff.
    addImage(fx, "sha256:rebuilt", (name) => (name === "boost" ? defaultPackages(name).map((pkg) => (pkg.name === "phpunit/phpunit" ? { ...pkg, reference: "other-ref" } : pkg)) : defaultPackages(name)));
    const split = await cli(["build", image, "--root", fx.repo], env);
    expect(split.code).toBe(1);
    expect(split.stdout).not.toContain("installed the same package sets");
    expect(split.stderr).toContain("boost: two builds differ: differs: phpunit/phpunit is 1.0.0 phpunitphpunit-ref in build A but 1.0.0 other-ref in build B");
    expect(split.stderr).toContain("build B: boost: differs: phpunit/phpunit");
    // A failed docker build fails the command; stale locks stop it before docker builds anything.
    writeFileSync(join(fx.docker, "build-fails"), "");
    const broken = await cli(["build", image, "--root", fx.repo], env);
    expect(broken.code).toBe(1);
    expect(broken.stderr).toContain("docker build --file conformance/oracle/Dockerfile --build-arg XARAVEL_ROOT_VERSIONS=framework:13.37.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3 --tag");
    rmSync(join(fx.docker, "build-fails"));
    rmSync(join(fx.docker, "calls.log"));
    writeFileSync(aiJson, edited);
    const stale = await cli(["build", image, "--root", fx.repo], env);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain(`${LOCKS_DIR}/ai/composer.lock is not current`);
    expect(fx.calls()).toEqual([]);
    writeFileSync(aiJson, composerJson("ai"));

    // lock: composer update --no-install in a temp copy, for PHP 8.5.11 through COMPOSER_HOME, the other Upstream packages pinned with --with.
    for (const { name } of UPSTREAM_REPOS) {
      writeFileSync(join(fx.dir, `${name}.lock`), lockText(composerJson(name), [...defaultPackages(name), tool("fresh/package")]));
    }
    const jsonBefore = readFileSync(aiJson, "utf8");
    const locked = await cli(["lock", "--composer", join(fx.bin, "composer"), "--root", fx.repo], env);
    expect(locked.stderr).toBe("");
    expect(locked.code).toBe(0);
    expect(locked.stdout).toContain(`laravel/ai v1.2.3: wrote ${LOCKS_DIR}/ai/composer.lock`);
    expect(locked.stdout).toContain(`Oracle locks written. Image tag: ${imageTag(fx.repo)}`);
    expect(readFileSync(lockPath(fx.repo, "ai"), "utf8")).toBe(readFileSync(join(fx.dir, "ai.lock"), "utf8"));
    expect(readFileSync(aiJson, "utf8")).toBe(jsonBefore);
    const composerCalls = readFileSync(join(fx.dir, "composer.log"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { args: string[]; cwd: string; rootVersion: string; config: unknown });
    expect(composerCalls.map((call) => call.rootVersion)).toEqual(["13.37.0", "1.2.3", "1.0.2", "2.10.3"]);
    for (const call of composerCalls) {
      expect(call.config).toEqual({ config: { platform: { php: PHP_VERSION } } });
      expect(call.args.slice(0, 2)).toEqual(["update", "--no-install"]);
      expect(call.args).not.toContain("install");
      for (const flag of ["--no-scripts", "--no-plugins", "--ignore-platform-req=ext-*"]) {
        expect(call.args).toContain(flag);
      }
      expect(call.cwd.startsWith(fx.repo)).toBe(false);
    }
    expect(composerCalls[1]!.args.filter((_, i, args) => args[i - 1] === "--with")).toEqual(["laravel/framework:13.37.0", "laravel/mcp:1.0.2", "laravel/boost:2.10.3"]);
    expect(fx.calls()).toEqual([]);

    // Usage errors.
    expect((await cli(["verify-image", "--root", fx.repo], env)).code).toBe(2);
    expect((await cli(["check", "extra", "--root", fx.repo], env)).code).toBe(2);
    expect((await cli(["bogus"], env)).code).toBe(2);
  } finally {
    cleanup(fx);
  }
}, 30_000);

test("XT-conformance-43: CI publishes the image to GHCR tagged <Pin>-<imagehash>, and only oracle.yml#oracle holds packages: write or pushes (FR-6, AD-16)", () => {
  const text = readFileSync(join(root, ".github", "workflows", "oracle.yml"), "utf8");
  type Step = Record<string, unknown> & { uses?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string>; if?: string };
  const workflow = Bun.YAML.parse(text) as {
    on: Record<string, unknown>;
    permissions: unknown;
    jobs: Record<string, Record<string, unknown> & { if?: string; permissions?: unknown; steps: Step[] }>;
  };
  expect(workflow.permissions).toEqual({ contents: "read" });
  // Story 3.4 adds `pull_request_target`, which runs only the per-Story `story` job; XT-conformance-77 checks its shape.
  expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "pull_request_target", "push", "schedule", "workflow_dispatch"]);
  const paths = ["conformance/baseline-pin", "conformance/oracle/**", "tools/oracle/**", "tools/upstream/**", ".github/workflows/oracle.yml", "package.json", "bun.lock", ".bun-version"];
  // Story 3.5: a PR touching the API surface's own inputs runs build's drift check; a push of them publishes nothing.
  // Retro 3 item 2: so does a PR touching the test lister that oracle:extract runs, or the package table its component map reads.
  const surfacePaths = ["conformance/api-surface/**", "conformance/component-map", "tools/component-map/**", "tools/inventory/**", "tools/scaffold/packages.jsonl", "tools/scaffold/table.ts"];
  expect(workflow.on["pull_request"]).toEqual({ branches: ["main"], paths: [...paths.slice(0, 2), ...surfacePaths, ...paths.slice(2)] });
  expect(workflow.on["push"]).toEqual({ branches: ["main"], paths });
  expect(workflow.on["pull_request_target"]).toEqual({ branches: ["main"], types: ["opened", "synchronize", "reopened"], paths: ["conformance/oracle-requests/**"] });
  expect(Object.keys(workflow.jobs).sort()).toEqual(["build", "determinism", "oracle", "story"]);
  expect(workflow.jobs["story"]!.if).toStartWith("github.event_name == 'pull_request_target' &&");
  for (const id of ["build", "oracle", "determinism"]) {
    expect([id, (workflow.jobs[id]!.if ?? "").includes("pull_request_target")]).toEqual([id, false]);
  }

  const runs = (job: { steps: Step[] }): string[] => job.steps.map((step) => step.run).filter((run): run is string => run !== undefined);
  const build = workflow.jobs["build"]!;
  const oracle = workflow.jobs["oracle"]!;
  // build: a PR builds twice and verifies, with no write scope, no login and no push.
  expect(build.if).toBe("github.event_name == 'pull_request'");
  expect(build.permissions).toBeUndefined();
  expect(runs(build)).toEqual([
    "bun run upstream:sync",
    "bun run upstream:check",
    "bun run oracle:check",
    'set -euo pipefail\ntag="$(bun tools/oracle/oracle.ts tag)"\nbun run oracle:build "xaravel-oracle:${tag}"\n',
    // Story 3.5: the API surface exported in the image just built must match the committed files.
    "bun run oracle:api-surface --check",
    // Retro 3 item 2: the requests re-extracted in that image must match the committed conformance/oracle/requests/.
    "bun run oracle:extract --check",
  ]);
  // oracle: only from main, on a push or a manual run; the only job with packages: write.
  expect(oracle.if).toBe("github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')");
  expect(oracle.permissions).toEqual({ contents: "read", packages: "write" });
  const oracleRuns = runs(oracle);
  expect(oracleRuns.slice(0, 3)).toEqual(["bun run upstream:sync", "bun run upstream:check", "bun run oracle:check"]);
  expect(oracleRuns[3]).toContain('tag="$(bun tools/oracle/oracle.ts tag)"');
  expect(oracleRuns[3]).toContain('echo "ref=ghcr.io/${OWNER,,}/xaravel-oracle:${tag}" >> "$GITHUB_OUTPUT"');
  expect(oracleRuns[4]).toBe('bun run oracle:build "$IMAGE"');
  expect(oracleRuns[5]).toBe('echo "$GH_TOKEN" | docker login ghcr.io --username "$ACTOR" --password-stdin');
  expect(oracleRuns[6]).toContain('docker push "$IMAGE"');
  // The push follows the build and its verification, and nothing lets a step pass past a failure.
  // determinism (Story 3.2): nightly, no write scope, no secret; builds and checks the API surface and the requests as build does, then compares two passes.
  const determinism = workflow.jobs["determinism"]!;
  expect(determinism.if).toBe("github.event_name == 'schedule'");
  expect(determinism.permissions).toBeUndefined();
  expect(determinism["environment"]).toBeUndefined();
  expect(runs(determinism)).toEqual([...runs(build), "bun run oracle:fixtures --determinism"]);
  // oracle (Story 3.2): after the push, the fixture batch in the pushed image, with the key only from environment oracle.
  expect(oracle["environment"]).toBe("oracle");
  expect(oracleRuns[8]).toBe('bun run oracle:fixtures --image "$IMAGE"');
  const batch = oracle.steps.find((step) => step.run === oracleRuns[8])!;
  expect(batch.env).toEqual({ ORACLE_SIGNING_KEY: "${{ secrets.ORACLE_SIGNING_KEY }}", IMAGE: "${{ steps.image.outputs.ref }}" });
  // Fresh fixtures are uploaded only after a successful batch; an Escalation always.
  const uploads = oracle.steps.filter((step) => (step.uses ?? "").startsWith("actions/upload-artifact@"));
  expect(uploads.map((step) => [step.if, step.with?.["path"]])).toEqual([
    ["success()", "conformance/fixtures/"],
    ["always()", "conformance/escalations/ESC-bot-*.md"],
  ]);
  expect(oracle.steps.indexOf(batch)).toBeGreaterThan(oracle.steps.findIndex((step) => (step.run ?? "").includes('docker push "$IMAGE"')));
  for (const job of [build, oracle, determinism]) {
    // Story 5.6 AC5 (Epic 3 retro R5): these jobs read per-Story request files in merge order, which needs full history.
    expect(job.steps[0]).toEqual({ uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", with: { "persist-credentials": false, "fetch-depth": 0 } });
    expect(job.steps[1]).toEqual({ uses: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6", with: { "bun-version-file": ".bun-version" } });
    for (const node of [job, ...job.steps]) {
      expect(node["continue-on-error"]).toBeUndefined();
    }
    const conditional = job.steps.filter((step) => step.if !== undefined).map((step) => [step.if, step.run ?? step.uses]);
    expect(conditional).toEqual(
      job === oracle
        ? [
            ["always()", "docker logout ghcr.io"],
            ["success()", "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9"],
            ["always()", "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9"],
          ]
        : job === determinism
          ? [["failure()", "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9"]]
          : [],
    );
  }
  expect(determinism.steps.some((step) => /docker (login|push)|ghcr\.io|secrets\./.test(`${step.run ?? ""}${JSON.stringify(step.env ?? {})}`))).toBe(false);
  expect(build.steps.some((step) => /docker (login|push)|ghcr\.io/.test(step.run ?? ""))).toBe(false);
  // The token reaches the build only as an env var, which oracle:build hands to BuildKit as a secret; the API-surface
  // check after it (Story 3.5) and the requests check (retro 3 item 2) get no token.
  for (const job of [build, determinism]) {
    const buildStep = job.steps.find((step) => (step.run ?? "").includes("bun run oracle:build "));
    expect(buildStep).toBeDefined();
    expect(buildStep!.env).toEqual({ GITHUB_TOKEN: "${{ github.token }}" });
    for (const run of ["bun run oracle:api-surface --check", "bun run oracle:extract --check"]) {
      const step = job.steps.find((candidate) => candidate.run === run);
      expect(step).toBeDefined();
      expect([run, step!.env, job.steps.indexOf(step!) > job.steps.indexOf(buildStep!)]).toEqual([run, undefined, true]);
    }
  }
  expect(text).not.toMatch(/build-arg/);
  // The only secrets are the fixture signing key, in the oracle job's batch step and the story job's generate step,
  // and the xaravel-oracle App's key in the story job (Story 3.4).
  expect(text.match(/secrets\.[A-Za-z_]+/g)).toEqual(["secrets.ORACLE_SIGNING_KEY", "secrets.ORACLE_SIGNING_KEY", "secrets.XARAVEL_ORACLE_APP_KEY"]);

  // No other workflow holds packages: write, logs in to GHCR or pushes an image.
  for (const file of readdirSync(join(root, ".github", "workflows")).filter((name) => /\.ya?ml$/.test(name) && name !== "oracle.yml")) {
    const other = readFileSync(join(root, ".github", "workflows", file), "utf8");
    expect([file, /packages:\s*write|ghcr\.io|docker (login|push)/.test(other)]).toEqual([file, false]);
  }
  expect(ALLOWED_WRITE_JOBS).toContain("oracle.yml#oracle");
  expect(checkWorkflows(root).violations).toEqual([]);

  // The tag is `<Pin>-<imagehash>` (locks, Dockerfile and dockerignore).
  expect(imageTag(root)).toMatch(/^v13\.37\.0-[0-9a-f]{12}$/);
  expect(imageTag(root)).toBe(`${PIN[0]!.tag}-${imageHash(root)}`);
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["oracle:check"]).toBe("bun tools/oracle/oracle.ts check");
  expect(scripts["oracle:tag"]).toBe("bun tools/oracle/oracle.ts tag");
  expect(scripts["oracle:lock"]).toBe("bun tools/oracle/oracle.ts lock");
  expect(scripts["oracle:verify-image"]).toBe("bun tools/oracle/oracle.ts verify-image");
  expect(scripts["oracle:build"]).toBe("bun tools/oracle/oracle.ts build");
  const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as { include: string[] };
  expect(tsconfig.include).toContain("tools/oracle/**/*.ts");
});

test("XT-conformance-44: for a contributor without Docker, bun test, oracle:check, oracle:tag and every non-oracle: script never call docker (FR-6, NFR)", async () => {
  const fx = fixture();
  try {
    const env = withFakes(fx);
    // With a recording docker first on PATH, check and tag succeed and docker is never called.
    expect((await cli(["check", "--root", fx.repo], env)).code).toBe(0);
    expect((await cli(["tag", "--root", fx.repo], env)).code).toBe(0);
    // Against the repository itself too (check fails without a synced snapshot, but still never calls docker).
    await cli(["check"], env);
    expect((await cli(["tag"], env)).stdout).toBe(`${imageTag(root)}\n`);
    expect(fx.calls()).toEqual([]);

    // The offline non-oracle: scripts, run as a contributor would, with the recording docker on PATH.
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    const offline = ["scaffold:check", "scaffold:table", "graph:check", "protected-paths:codeowners", "ownership:check", "escalations:check", "workflows:check", "release:check", "upstream:check"];
    for (const name of offline) {
      expect(scripts[name]).toBeDefined();
      const proc = Bun.spawn([process.execPath, "run", name], { cwd: root, env: { HOME: tmpdir(), ...env }, stdout: "ignore", stderr: "ignore" });
      await proc.exited;
    }
    expect(fx.calls()).toEqual([]);

    // Statically: only tools/oracle names docker, and only the oracle: scripts reach it, so bun test and every other script cannot call it.
    for (const [name, command] of Object.entries(scripts)) {
      expect([name, /docker/.test(command) || (command.includes("tools/oracle/") && !name.startsWith("oracle:"))]).toEqual([name, false]);
    }
    const mentions: string[] = [];
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== "vendor" && path !== join(root, "conformance", "upstream")) {
            scan(path);
          }
        } else if (/\.(ts|js|mjs|sh|toml|json)$/.test(entry.name) && /\bdocker\b/i.test(readFileSync(path, "utf8"))) {
          mentions.push(path.slice(root.length + 1));
        }
      }
    };
    for (const dir of ["tools", "packages", "skeleton", "installer", "conformance"]) {
      if (existsSync(join(root, dir))) {
        scan(join(root, dir));
      }
    }
    expect(mentions.sort()).toEqual(["conformance/tests/xaravel/oracle.test.ts", "tools/oracle/oracle.ts"]);
    // No other Xaravel Test imports tools/oracle/oracle.ts directly or names runInImage. Other tests may import tools
    // that import it (tools/inventory, tools/oracle/extract.ts), but they run image mode only through a stand-in
    // runner, so bun test reaches docker only through the fakes above.
    const testFiles = readdirSync(join(root, "conformance", "tests", "xaravel"), { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
    for (const file of testFiles.filter((name) => name !== "oracle.test.ts")) {
      const text = readFileSync(join(root, "conformance", "tests", "xaravel", file), "utf8");
      expect([file, /tools\/oracle\/oracle["']/.test(text) || text.includes("runInImage")]).toEqual([file, false]);
    }

    // With no docker on PATH at all: verify-image and build fail clearly; check and tag are unaffected.
    for (const args of [["verify-image", `${IMAGE_NAME}:x`], ["build", `${IMAGE_NAME}:x`]]) {
      const result = await cli([...args, "--root", fx.repo], noDocker(fx));
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("docker is not on PATH; oracle:build and oracle:verify-image need Docker (oracle:check and oracle:tag do not)");
    }
    expect((await cli(["check", "--root", fx.repo], noDocker(fx))).code).toBe(0);
    expect((await cli(["tag", "--root", fx.repo], noDocker(fx))).code).toBe(0);
    expect(fx.calls()).toEqual([]);

    // runInImage (the Inventory's image mode): docker run --rm --network none with the fixed resource limits and
    // read-only mounts; stdout passes through.
    const saved = { PATH: process.env["PATH"], FAKE_DOCKER_DIR: process.env["FAKE_DOCKER_DIR"] };
    try {
      Object.assign(process.env, withFakes(fx));
      const mounts = [{ host: "/h/lister.php", container: "/c/lister.php" }, { host: "/h/b", container: "/c/b" }];
      expect(runInImage("img:1", mounts, ["echo", "hello", "world"])).toBe("hello world\n");
      expect(fx.calls().map((call) => call.args)).toEqual([["run", "--rm", "--network", "none", "--memory", "4g", "--memory-swap", "4g", "--pids-limit", "512", "--cpus", "2", "--volume", "/h/lister.php:/c/lister.php:ro", "--volume", "/h/b:/c/b:ro", "img:1", "echo", "hello", "world"]]);
      expect(() => runInImage("img:1", [], ["php", "x"])).toThrow(new Error("php x in img:1 failed (exit 2): fake docker: unexpected call"));
      // Exit 137 (a SIGKILL) names the 4g memory limit as a possible cause, with or without stderr.
      expect(() => runInImage("img:1", [], ["exit", "137", "Killed"])).toThrow(new Error("exit 137 Killed in img:1 failed (exit 137): Killed; exit 137 is a SIGKILL, possibly at the container's 4g memory limit"));
      expect(() => runInImage("img:1", [], ["exit", "137"])).toThrow(new Error("exit 137 in img:1 failed (exit 137): exit 137 is a SIGKILL, possibly at the container's 4g memory limit"));
      process.env["PATH"] = noDocker(fx).PATH;
      expect(() => runInImage("img:1", [], ["echo"])).toThrow("docker is not on PATH; running in the Oracle image needs Docker");
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  } finally {
    cleanup(fx);
  }
}, 30_000);
