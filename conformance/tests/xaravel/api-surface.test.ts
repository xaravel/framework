// Xaravel Tests for Story 3.5 (API-surface export; FR-6, AD-15, PRD §5.1).
// These run under plain `bun test` until the harness lands in Epic 5. The
// image mode runs only through a stand-in runner in a temporary root, so
// nothing here reaches the Oracle image. The real-PHP parts run
// tools/oracle/api-surface.php with the local `php` against the committed
// fixture php-fixtures/api-surface/ (PHP code a tool runs needs a test that
// executes it); they are skipped with the reason when `php` is absent, and
// fail instead under XARAVEL_PHP_FIXTURES=require.
import { expect } from "bun:test";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { ImageRunner } from "../../../tools/inventory/inventory";
import {
  API_SURFACE_DIR,
  API_SURFACE_SCRIPT,
  buildSurface,
  checkCitations,
  citationProblems,
  defErrors,
  exportSurface,
  main,
  parseOptions,
  readSurfaceSchema,
  UsageError,
} from "../../../tools/oracle/api-surface";
import { compareUnits, renderJson, type Json, type JsonObject } from "../../../tools/oracle/request";
import { activePhases, isProtected, LIST_PATH, parseList } from "../../../tools/protected-paths/protected-paths";
import { Assert, xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const FIXTURE = join(import.meta.dir, "php-fixtures", "api-surface");
const SCRIPT = join(root, API_SURFACE_SCRIPT);
const REQUIRE = process.env["XARAVEL_PHP_FIXTURES"] === "require";
const PHP = Bun.which("php");
const TIMEOUT = 60_000;
/** The snapshots inside the Oracle image (docs/ops/oracle.md), written out because Xaravel Tests do not import tools/oracle/oracle.ts (XT-conformance-44). */
const IMAGE_UPSTREAM = "/oracle/upstream";
const schema = readSurfaceSchema(root);
const IMAGE = "xaravel-oracle:test";
let warned = false;

/** A test that runs the real PHP: skipped with the reason when `php` is absent, failed under XARAVEL_PHP_FIXTURES=require. */
function phpTest(id: string, consequence: string, body: () => void): void {
  if (PHP === null && !REQUIRE && !warned) {
    warned = true;
    console.warn("api-surface.test.ts: skipping the real-PHP runs: php not on PATH");
  }
  xaravelTest(
    id,
    consequence,
    () => {
      if (PHP === null) {
        if (REQUIRE) {
          throw new Error("XARAVEL_PHP_FIXTURES=require: php not on PATH");
        }
        Assert.markTestSkipped("php not on PATH");
      }
      body();
    },
    TIMEOUT,
  );
}

// ---------------------------------------------------------------------------
// Fixture root

/** A four-repository snapshot: Auth and Support in the framework, plus ai, mcp and boost. */
const SNAPSHOT: Record<string, string> = {
  "framework/src/Illuminate/Auth/AuthManager.php": "<?php\n\nnamespace Illuminate\\Auth;\n\nclass AuthManager\n{\n}\n",
  "framework/src/Illuminate/Support/Str.php": "<?php\n\nnamespace Illuminate\\Support;\n\nclass Str\n{\n}\n",
  "framework/src/Illuminate/Support/Traits/Macroable.php": "<?php\n\nnamespace Illuminate\\Support\\Traits;\n\ntrait Macroable\n{\n}\n",
  "framework/src/Illuminate/Support/helpers.php": "<?php\n\nfunction str() {}\n",
  "ai/src/Agent.php": "<?php\n\nnamespace Laravel\\Ai;\n\ninterface Agent\n{\n}\n",
  "mcp/src/Server.php": "<?php\n\nnamespace Laravel\\Mcp;\n\nclass Server\n{\n}\n",
  "boost/src/Boost.php": "<?php\n\nnamespace Laravel\\Boost;\n\nclass Boost\n{\n}\n",
};

const MAP_LINES = [
  '{"component":"ai","tests":[],"namespaces":["Fixture\\\\","Laravel\\\\Ai\\\\"],"classes":[],"aliases":[]}',
  '{"component":"auth","tests":[],"namespaces":["Illuminate\\\\Auth\\\\"],"classes":[],"aliases":[]}',
  '{"component":"boost","tests":[],"namespaces":["Laravel\\\\Boost\\\\"],"classes":[],"aliases":[]}',
  '{"component":"macroable","tests":[],"namespaces":[],"classes":["Illuminate\\\\Support\\\\Traits\\\\Macroable"],"aliases":[]}',
  '{"component":"mcp","tests":[],"namespaces":["Laravel\\\\Mcp\\\\"],"classes":[],"aliases":[]}',
  '{"component":"support","tests":[],"namespaces":["Illuminate\\\\Support\\\\"],"classes":[],"aliases":[]}',
];

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

interface Fixture {
  dir: string;
  /** The runner's calls: [repo, command]. */
  calls: [string, string[]][];
}

function withRoot(body: (fx: Fixture) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-api-surface-test-"));
  try {
    for (const file of ["tools/scaffold/packages.jsonl", API_SURFACE_SCRIPT, `${API_SURFACE_DIR}/schema.json`]) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      copyFileSync(join(root, file), join(dir, file));
    }
    writeFiles(join(dir, "conformance", "upstream"), SNAPSHOT);
    writeFiles(dir, {
      "conformance/component-map": `# fixture map\n${MAP_LINES.join("\n")}\n`,
      [`${API_SURFACE_DIR}/additions.jsonl`]: "",
      [`${API_SURFACE_DIR}/exceptions.jsonl`]: "",
    });
    body({ dir, calls: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const decl = (fqcn: string, kind = "class"): string => `{"member":null,"kind":"${kind}","fqcn":${JSON.stringify(fqcn)},"stubbed":[]}`;
const method = (fqcn: string, name: string): string =>
  `{"fqcn":${JSON.stringify(fqcn)},"kind":"method","member":"${name}","static":true,"parameters":[{"byRef":false,"variadic":false,"optional":true,"default":"null","nullable":true,"type":null,"name":"value"}],"returns":"string","nullable":false}`;

/** The canned PHP output per repository, with members listed out of order and keys out of order. */
function cannedOutput(repo: string, classes: readonly string[]): string {
  const lines: string[] = [];
  for (const fqcn of classes) {
    lines.push(decl(fqcn, fqcn.endsWith("Macroable") ? "trait" : fqcn.endsWith("Agent") ? "interface" : "class"));
    if (fqcn === "Illuminate\\Support\\Str") {
      lines.push(method(fqcn, "upper"), method(fqcn, "lower"));
      lines.push(`{"fqcn":"Illuminate\\\\Support\\\\Str","kind":"property","member":"cache","static":true,"type":"array","nullable":false}`);
      lines.push(`{"fqcn":"Illuminate\\\\Support\\\\Str","kind":"constant","member":"INVISIBLE","static":true}`);
    }
  }
  if (repo === "framework") {
    lines.push(`{"fqcn":"str","kind":"function","member":null,"static":false,"parameters":[],"returns":null,"nullable":true,"file":"Illuminate/Support/helpers.php"}`);
  }
  return lines.map((line) => `${line}\n`).join("");
}

/** A stand-in image runner: it reads the mounted class list and answers `output(repo, classes, pass)`. */
function standIn(fx: Fixture, output: (repo: string, classes: string[], pass: number) => string = (repo, classes) => cannedOutput(repo, classes)): ImageRunner {
  const passes = new Map<string, number>();
  return (image, mounts, command) => {
    expect(image).toBe(IMAGE);
    const listPath = command[4]!;
    const mount = mounts.find((entry) => listPath.startsWith(`${entry.container}/`))!;
    const classes = readFileSync(join(mount.host, basename(listPath)), "utf8").split("\n").filter((line) => line !== "");
    const repo = basename(listPath, ".txt");
    expect(command.slice(2, 4)).toEqual([`${IMAGE_UPSTREAM}/${repo}/vendor/autoload.php`, `${IMAGE_UPSTREAM}/${repo}/src`]);
    expect(mounts.find((entry) => entry.container === command[1])!.host).toBe(join(fx.dir, API_SURFACE_SCRIPT));
    fx.calls.push([repo, [...command]]);
    const pass = (passes.get(repo) ?? 0) + 1;
    passes.set(repo, pass);
    return output(repo, classes, pass);
  };
}

/** Runs `main` with stdout and stderr captured. */
function run(argv: readonly string[], runner: ImageRunner): { code: number; stdout: string; stderr: string } {
  const out: string[] = [];
  const err: string[] = [];
  const saved = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
  process.stdout.write = ((chunk: string) => out.push(chunk) > 0) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => err.push(chunk) > 0) as typeof process.stderr.write;
  try {
    // A stand-in needs no real image tag (which would read the fixture root's Pin).
    const code = main(argv.includes("--root") && !argv.includes("--local") ? [...argv, "--image", IMAGE] : argv, { runner });
    return { code, stdout: out.join(""), stderr: err.join("") };
  } finally {
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
}

/** The `*.jsonl` files of the fixture's surface directory with their text. */
function surfaceFiles(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const base = join(dir, API_SURFACE_DIR);
  for (const name of readdirSync(base).filter((entry) => entry.endsWith(".jsonl")).sort(compareUnits)) {
    out[name] = readFileSync(join(base, name), "utf8");
  }
  return out;
}

/** Runs the real exporter on the fixture; returns stdout. */
function runFixture(classes: readonly string[]): { code: number; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-api-surface-php-"));
  try {
    writeFileSync(join(dir, "classes.txt"), classes.map((fqcn) => `${fqcn}\n`).join(""));
    const proc = Bun.spawnSync([PHP!, SCRIPT, join(FIXTURE, "autoload.php"), join(FIXTURE, "src"), join(dir, "classes.txt")], { stdout: "pipe", stderr: "pipe" });
    return { code: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const FIXTURE_CLASSES = ["Fixture\\Base", "Fixture\\Broken", "Fixture\\Contracts\\Shape", "Fixture\\Greets", "Fixture\\Options", "Fixture\\Size", "Fixture\\SubBroken", "Fixture\\Widget"];

const p = (name: string, type: string | null, nullable: boolean, def: string | null, optional: boolean, variadic = false, byRef = false): string =>
  `{"name":"${name}","type":${JSON.stringify(type)},"nullable":${nullable},"default":${JSON.stringify(def)},"optional":${optional},"variadic":${variadic},"byRef":${byRef}}`;

/** The exporter's exact output for the fixture, in its print order. */
const FIXTURE_LINES = [
  '{"fqcn":"Fixture\\\\Base","kind":"class","member":null,"stubbed":[]}',
  '{"fqcn":"Fixture\\\\Base","kind":"method","member":"inheritedMethod","static":false,"parameters":[],"returns":"void","nullable":false}',
  '{"fqcn":"Fixture\\\\Base","kind":"property","member":"inherited","static":false,"type":null,"nullable":true}',
  '{"fqcn":"Fixture\\\\Broken","kind":"class","member":null,"stubbed":["Missing\\\\Contract"]}',
  '{"fqcn":"Fixture\\\\Broken","kind":"method","member":"run","static":false,"parameters":[],"returns":"?int","nullable":true}',
  '{"fqcn":"Fixture\\\\Contracts\\\\Shape","kind":"interface","member":null,"stubbed":[]}',
  '{"fqcn":"Fixture\\\\Contracts\\\\Shape","kind":"method","member":"area","static":false,"parameters":[],"returns":"float","nullable":false}',
  '{"fqcn":"Fixture\\\\Contracts\\\\Shape","kind":"constant","member":"SIDES","static":true}',
  '{"fqcn":"Fixture\\\\Greets","kind":"trait","member":null,"stubbed":[]}',
  `{"fqcn":"Fixture\\\\Greets","kind":"method","member":"greet","static":false,"parameters":[${p("who", "string", false, "'world'", true)}],"returns":"string","nullable":false}`,
  '{"fqcn":"Fixture\\\\Options","kind":"class","member":null,"stubbed":[]}',
  `{"fqcn":"Fixture\\\\Options","kind":"method","member":"__construct","static":false,"parameters":[${p("level", "int", false, null, false)}],"returns":null,"nullable":true}`,
  '{"fqcn":"Fixture\\\\Options","kind":"property","member":"level","static":false,"type":"int","nullable":false}',
  '{"fqcn":"Fixture\\\\Size","kind":"enum","member":null,"stubbed":[]}',
  '{"fqcn":"Fixture\\\\Size","kind":"method","member":"cases","static":true,"parameters":[],"returns":"array","nullable":false}',
  `{"fqcn":"Fixture\\\\Size","kind":"method","member":"from","static":true,"parameters":[${p("value", "string|int", false, null, false)}],"returns":"static","nullable":false}`,
  `{"fqcn":"Fixture\\\\Size","kind":"method","member":"tryFrom","static":true,"parameters":[${p("value", "string|int", false, null, false)}],"returns":"?static","nullable":true}`,
  '{"fqcn":"Fixture\\\\Size","kind":"property","member":"name","static":false,"type":"string","nullable":false}',
  '{"fqcn":"Fixture\\\\Size","kind":"property","member":"value","static":false,"type":"string","nullable":false}',
  '{"fqcn":"Fixture\\\\Size","kind":"case","member":"Small","static":true}',
  '{"fqcn":"Fixture\\\\Size","kind":"case","member":"Large","static":true}',
  '{"fqcn":"Fixture\\\\Size","kind":"constant","member":"DEFAULT","static":true}',
  '{"fqcn":"Fixture\\\\SubBroken","kind":"class","member":null,"stubbed":["Missing\\\\Contract"]}',
  '{"fqcn":"Fixture\\\\Widget","kind":"class","member":null,"stubbed":[]}',
  `{"fqcn":"Fixture\\\\Widget","kind":"method","member":"__construct","static":false,"parameters":[${p("size", "int", false, "PHP_INT_MAX", true)}],"returns":null,"nullable":true}`,
  `{"fqcn":"Fixture\\\\Widget","kind":"method","member":"make","static":true,"parameters":[${[p("name", "?string", true, null, false), p("size", "Fixture\\Size", false, "Fixture\\Size::Small", true), p("tags", "array", false, "['*']", true), p("rest", null, true, null, true, true)].join(",")}],"returns":"static","nullable":false}`,
  '{"fqcn":"Fixture\\\\Widget","kind":"method","member":"area","static":false,"parameters":[],"returns":"float","nullable":false}',
  `{"fqcn":"Fixture\\\\Widget","kind":"method","member":"fill","static":false,"parameters":[${[p("into", "array", false, null, false, false, true), p("options", "Fixture\\Options", false, "new \\Fixture\\Options(1)", true), p("mode", "int", false, "self::LIMIT", true), p("map", "array", false, "['a' => 1]", true)].join(",")}],"returns":"void","nullable":false}`,
  `{"fqcn":"Fixture\\\\Widget","kind":"method","member":"greet","static":false,"parameters":[${p("who", "string", false, "'world'", true)}],"returns":"string","nullable":false}`,
  '{"fqcn":"Fixture\\\\Widget","kind":"property","member":"label","static":false,"type":"?string","nullable":true}',
  '{"fqcn":"Fixture\\\\Widget","kind":"property","member":"count","static":true,"type":null,"nullable":true}',
  '{"fqcn":"Fixture\\\\Widget","kind":"property","member":"size","static":false,"type":"int","nullable":false}',
  '{"fqcn":"Fixture\\\\Widget","kind":"constant","member":"LIMIT","static":true}',
  `{"fqcn":"fixture_helper","kind":"function","member":null,"static":false,"parameters":[${p("value", null, true, "null", true)},${p("strict", "bool", false, "false", true)}],"returns":null,"nullable":true,"file":"functions.php"}`,
  `{"fqcn":"Fixture\\\\namespaced","kind":"function","member":null,"static":false,"parameters":[${p("parts", "string", false, null, true, true)}],"returns":"string","nullable":false,"file":"functions.php"}`,
];

// ---------------------------------------------------------------------------
// XT-conformance-80

xaravelTest("XT-conformance-80", "the export writes conformance/api-surface/<component>.jsonl, one schema-valid, sorted line per public declaration and member, from a stand-in image runner (FR-6, AD-15.5)", () => {
  withRoot((fx) => {
    // A stray Component file goes; the citation files stay.
    writeFileSync(join(fx.dir, API_SURFACE_DIR, "stale.jsonl"), "{}\n");
    const result = run(["--root", fx.dir], standIn(fx));
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      ["ai: 1 lines", "auth: 1 lines", "boost: 1 lines", "macroable: 1 lines", "mcp: 1 lines", "support: 6 lines", `removed ${API_SURFACE_DIR}/stale.jsonl`, "API surface: 11 lines in 6 files.", ""].join("\n"),
    );
    // Two passes per repository, in pin order, with the image paths.
    expect(fx.calls.map(([repo]) => repo)).toEqual(["framework", "framework", "ai", "ai", "mcp", "mcp", "boost", "boost"]);
    expect(fx.calls[0]![1].slice(0, 2)).toEqual(["php", "/xaravel/api-surface.php"]);
    const files = surfaceFiles(fx.dir);
    expect(Object.keys(files)).toEqual(["additions.jsonl", "ai.jsonl", "auth.jsonl", "boost.jsonl", "exceptions.jsonl", "macroable.jsonl", "mcp.jsonl", "support.jsonl"]);
    expect(files["additions.jsonl"]).toBe("");
    expect(files["exceptions.jsonl"]).toBe("");
    expect(files["ai.jsonl"]).toBe('{"fqcn":"Laravel\\\\Ai\\\\Agent","kind":"interface","member":null,"stubbed":[]}\n');
    expect(files["macroable.jsonl"]).toBe('{"fqcn":"Illuminate\\\\Support\\\\Traits\\\\Macroable","kind":"trait","member":null,"stubbed":[]}\n');
    // Key order re-rendered, sorted by fqcn, then kind rank (declaration, constant, property, method), then member; the
    // function's Component is its directory's, and its `file` is dropped.
    const param = '{"name":"value","type":null,"nullable":true,"default":"null","optional":true,"variadic":false,"byRef":false}';
    expect(files["support.jsonl"]).toBe(
      [
        '{"fqcn":"Illuminate\\\\Support\\\\Str","kind":"class","member":null,"stubbed":[]}',
        '{"fqcn":"Illuminate\\\\Support\\\\Str","kind":"constant","member":"INVISIBLE","static":true}',
        '{"fqcn":"Illuminate\\\\Support\\\\Str","kind":"property","member":"cache","static":true,"type":"array","nullable":false}',
        `{"fqcn":"Illuminate\\\\Support\\\\Str","kind":"method","member":"lower","static":true,"parameters":[${param}],"returns":"string","nullable":false}`,
        `{"fqcn":"Illuminate\\\\Support\\\\Str","kind":"method","member":"upper","static":true,"parameters":[${param}],"returns":"string","nullable":false}`,
        '{"fqcn":"str","kind":"function","member":null,"static":false,"parameters":[],"returns":null,"nullable":true}',
        "",
      ].join("\n"),
    );
    for (const [name, text] of Object.entries(files)) {
      for (const line of text.split("\n").filter((entry) => entry !== "")) {
        expect([name, defErrors(JSON.parse(line), "surface", schema)]).toEqual([name, []]);
      }
    }

    // --check: byte-identical passes; a changed, missing or stray file is drift, and nothing is written.
    expect(run(["--check", "--root", fx.dir], standIn(fx)).code).toBe(0);
    writeFileSync(join(fx.dir, API_SURFACE_DIR, "auth.jsonl"), "{}\n");
    rmSync(join(fx.dir, API_SURFACE_DIR, "mcp.jsonl"));
    writeFileSync(join(fx.dir, API_SURFACE_DIR, "stray.jsonl"), "");
    const drift = run(["--check", "--root", fx.dir], standIn(fx));
    expect(drift.code).toBe(1);
    expect(drift.stderr).toBe(
      [
        `api surface drift: ${API_SURFACE_DIR}/auth.jsonl differs from the exported surface (first difference at line 1)`,
        `api surface drift: ${API_SURFACE_DIR}/mcp.jsonl is missing`,
        `api surface drift: ${API_SURFACE_DIR}/stray.jsonl is not generated`,
        "API surface check failed: 3 file(s) drifted, 0 citation problem(s).",
        "",
      ].join("\n"),
    );
    expect(readFileSync(join(fx.dir, API_SURFACE_DIR, "auth.jsonl"), "utf8")).toBe("{}\n");
    expect(existsSync(join(fx.dir, API_SURFACE_DIR, "mcp.jsonl"))).toBe(false);
    // A bad citation file fails the check too.
    expect(run(["--root", fx.dir], standIn(fx)).code).toBe(0);
    writeFileSync(join(fx.dir, API_SURFACE_DIR, "additions.jsonl"), '{"component":"support","fqcn":"Illuminate\\\\Support\\\\Str","member":"x"}\n');
    const cited = run(["--check", "--root", fx.dir], standIn(fx));
    expect(cited.code).toBe(1);
    expect(cited.stderr).toContain(`${API_SURFACE_DIR}/additions.jsonl:1: $: missing "citation"`);
    writeFileSync(join(fx.dir, API_SURFACE_DIR, "additions.jsonl"), "");

    // Failures write nothing: an unowned class, an unknown function Component, a non-JSON line, a schema-invalid line.
    const before = surfaceFiles(fx.dir);
    const failing: [string, (repo: string, classes: string[]) => string, string][] = [
      ["unowned", (repo, classes) => (repo === "mcp" ? `${decl("Other\\Thing")}\n` : cannedOutput(repo, classes)), "mcp line 1: Other\\Thing has no Component in conformance/component-map"],
      [
        "function",
        (repo, classes) => cannedOutput(repo, classes).replace("Illuminate/Support/helpers.php", "Illuminate/Bogus/helpers.php"),
        "framework line 8: str's Component bogus is not in conformance/component-map",
      ],
      ["not JSON", (repo, classes) => (repo === "boost" ? "Deprecated: something\n" : cannedOutput(repo, classes)), "boost line 1: not JSON"],
      ["schema", (repo, classes) => (repo === "ai" ? '{"fqcn":"Laravel\\\\Ai\\\\Agent","kind":"interface","member":null}\n' : cannedOutput(repo, classes)), 'ai line 1: fails the surface schema: $: missing "stubbed"'],
      ["extra key", (repo, classes) => cannedOutput(repo, classes).replace('"static":true}', '"static":true,"value":1}'), 'framework line 6: fails the surface schema: $: unexpected key "value"'],
      ["duplicate", (repo, classes) => (repo === "boost" ? cannedOutput(repo, classes).repeat(2) : cannedOutput(repo, classes)), "Laravel\\Boost\\Boost (class) is exported twice"],
    ];
    for (const [label, output, message] of failing) {
      const result = run(["--root", fx.dir], standIn(fx, output));
      expect([label, result.code]).toEqual([label, 1]);
      expect([label, result.stderr]).toEqual([label, expect.stringContaining(message)]);
      expect([label, surfaceFiles(fx.dir)]).toEqual([label, before]);
    }
    // The script itself failing (exit 1) fails the run with its message.
    const crash = run(["--root", fx.dir], () => {
      throw new Error("php /xaravel/api-surface.php … failed (exit 1): api-surface: X failed to load");
    });
    expect(crash.code).toBe(1);
    expect(crash.stderr).toContain("API surface export failed: api-surface.php failed for framework: php /xaravel/api-surface.php … failed (exit 1): api-surface: X failed to load");
  });

  // --local: the PHP runs against <dir>/<repo>, which must hold vendor/autoload.php and a copy of the snapshot.
  withRoot((fx) => {
    const local = join(fx.dir, "local");
    for (const repo of ["framework", "ai", "mcp", "boost"]) {
      cpSync(join(fx.dir, "conformance", "upstream", repo, "src"), join(local, repo, "src"), { recursive: true });
    }
    const missing = run(["--root", fx.dir, "--local", local], () => "");
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain(`--local ${local}/framework has no vendor/autoload.php; it must be a locked install of the framework snapshot`);
    // A fake php prints the canned output kept beside each autoload.php; the result equals the image mode's.
    const classes: Record<string, string[]> = { framework: ["Illuminate\\Auth\\AuthManager", "Illuminate\\Support\\Str", "Illuminate\\Support\\Traits\\Macroable"], ai: ["Laravel\\Ai\\Agent"], mcp: ["Laravel\\Mcp\\Server"], boost: ["Laravel\\Boost\\Boost"] };
    for (const [repo, list] of Object.entries(classes)) {
      writeFiles(local, { [`${repo}/vendor/autoload.php`]: "<?php\n", [`${repo}/vendor/canned.txt`]: cannedOutput(repo, list) });
    }
    const php = join(fx.dir, "fake-php");
    writeFileSync(php, '#!/bin/sh\n[ "$#" = 4 ] || exit 3\ncat "$(dirname "$2")/canned.txt"\n', { mode: 0o755 });
    const viaLocal = buildSurface(fx.dir, { local, php });
    expect(viaLocal).toEqual(buildSurface(fx.dir, { runner: standIn(fx), image: IMAGE }));
    // A local source file that differs from the snapshot fails before any PHP runs.
    writeFileSync(join(local, "mcp", "src", "Server.php"), "<?php\n");
    expect(() => buildSurface(fx.dir, { local, php })).toThrow(`${join(local, "mcp")}/src/Server.php differs from conformance/upstream/mcp/src/Server.php`);
  });

  // CLI shape.
  expect(parseOptions(["--root", "/r", "--check", "--image", "img:1"])).toEqual({ root: "/r", check: true, image: "img:1" });
  expect(parseOptions(["--local", "/l", "--php", "/usr/bin/php"]).local).toBe("/l");
  for (const argv of [["--image", "a", "--local", "b"], ["--php", "p"], ["--bogus"], ["--root"], ["--check", "--check"]]) {
    expect(() => parseOptions(argv)).toThrow(UsageError);
  }
  expect(run(["--bogus"], () => "").code).toBe(2);
});

phpTest("XT-conformance-198", "api-surface.php reflects the fixture: declared members only, static, nullable, defaulted, new, constant-default, variadic and by-ref parameters, enum cases, functions and a stubbed missing interface; after the load it cross-checks the class list against every class-like declared under src/ and fails naming any it misses (FR-6, AD-15.5)", () => {
  const result = runFixture(FIXTURE_CLASSES);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  expect(result.stdout).toBe(FIXTURE_LINES.map((line) => `${line}\n`).join(""));
  for (const line of FIXTURE_LINES) {
    const value = JSON.parse(line) as JsonObject;
    delete value["file"];
    expect([line, defErrors(value, "surface", schema)]).toEqual([line, []]);
  }
  // `stubbed` does not depend on load order: SubBroken loaded first (it hits the missing interface) gives the same lines.
  const reversed = runFixture([...FIXTURE_CLASSES].reverse());
  expect(reversed.code).toBe(0);
  const declarations = (stdout: string): string[] => stdout.split("\n").filter((line) => line.includes('"stubbed":["'));
  expect(declarations(reversed.stdout)).toEqual([...declarations(result.stdout)].reverse());
  expect(declarations(result.stdout).length).toBe(2);
  // The class-list cross-check (Story 6.5): a list that omits a loaded trait (Greets, used by Widget) and a class
  // (Options) fails, naming both with their files under src/, sorted, and prints nothing on stdout.
  const omitted = runFixture(FIXTURE_CLASSES.filter((fqcn) => fqcn !== "Fixture\\Greets" && fqcn !== "Fixture\\Options"));
  expect(omitted.code).toBe(1);
  expect(omitted.stdout).toBe("");
  expect(omitted.stderr).toBe(["api-surface: the class list misses Fixture\\Greets (declared in Greets.php)", "api-surface: the class list misses Fixture\\Options (declared in Options.php)", ""].join("\n"));
  // A class-like never loaded (nothing references the enum Size once it is off the list) is found by the tokenizer.
  const unloaded = runFixture(FIXTURE_CLASSES.filter((fqcn) => fqcn !== "Fixture\\Size" && fqcn !== "Fixture\\Widget"));
  expect(unloaded.code).toBe(1);
  expect(unloaded.stdout).toBe("");
  expect(unloaded.stderr).toBe(["api-surface: the class list misses Fixture\\Size (declared in Size.php)", "api-surface: the class list misses Fixture\\Widget (declared in Widget.php)", ""].join("\n"));

  // A class that is not found, or a non-autoload failure, exits 1 naming it.
  const missing = runFixture(["Fixture\\Nope"]);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toBe("api-surface: Fixture\\Nope is not found\n");

  // End to end: the fixture stands in for the ai repository, through buildSurface and a runner that runs the real PHP.
  withRoot((fx) => {
    rmSync(join(fx.dir, "conformance", "upstream", "ai", "src"), { recursive: true });
    cpSync(join(FIXTURE, "src"), join(fx.dir, "conformance", "upstream", "ai", "src"), { recursive: true });
    const runner = standIn(fx, (repo, classes) => {
      if (repo !== "ai") {
        return cannedOutput(repo, classes);
      }
      expect(classes).toEqual(FIXTURE_CLASSES);
      return runFixture(classes).stdout;
    });
    const files = buildSurface(fx.dir, { runner, image: IMAGE });
    const ai = files.get("ai")!.split("\n").filter((line) => line !== "");
    const expected = FIXTURE_LINES.map((line) => {
      const value = JSON.parse(line) as JsonObject;
      delete value["file"];
      return renderJson(value as Json);
    });
    expect(ai.length).toBe(expected.length);
    expect([...ai].sort()).toEqual([...expected].sort());
    // Enum cases sort before constants; trait-imported greet is Widget's own member.
    const size = ai.filter((line) => line.startsWith('{"fqcn":"Fixture\\\\Size"')).map((line) => (JSON.parse(line) as { kind: string; member: string | null }).kind + ":" + String((JSON.parse(line) as { member: string | null }).member));
    expect(size).toEqual(["enum:null", "case:Large", "case:Small", "constant:DEFAULT", "property:name", "property:value", "method:cases", "method:from", "method:tryFrom"]);
  });
});

xaravelTest("XT-conformance-199", "the committed conformance/api-surface/<component>.jsonl files are schema-valid, canonical, sorted and LF-terminated (AD-15.5)", () => {
  const dir = join(root, API_SURFACE_DIR);
  const names = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".jsonl") && name !== "additions.jsonl" && name !== "exceptions.jsonl") : [];
  // The export is committed (bun run oracle:api-surface --local …), so at least one Component file exists.
  expect(names.length).toBeGreaterThan(0);
  const rank: Record<string, number> = { class: 0, interface: 0, trait: 0, enum: 0, function: 0, case: 1, constant: 2, property: 3, method: 4 };
  for (const name of names) {
    const text = readFileSync(join(dir, name), "utf8");
    expect([name, text.endsWith("\n") && !text.includes("\r")]).toEqual([name, true]);
    let previous: [string, number, string] | null = null;
    for (const line of text.slice(0, -1).split("\n")) {
      const value = JSON.parse(line) as JsonObject;
      const errors = defErrors(value, "surface", schema);
      if (errors.length > 0) {
        expect([name, line, errors]).toEqual([name, line, []]);
      }
      const key: [string, number, string] = [value["fqcn"] as string, rank[value["kind"] as string]!, (value["member"] as string | null) ?? ""];
      if (previous !== null) {
        const order = compareUnits(previous[0], key[0]) || previous[1] - key[1] || compareUnits(previous[2], key[2]);
        if (order > 0) {
          expect([name, line, "not sorted"]).toEqual([name, line, "sorted"]);
        }
      }
      previous = key;
    }
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-81

xaravelTest("XT-conformance-81", "two exports of one snapshot give identical bytes, and a second pass that differs fails the run and writes nothing (FR-6)", () => {
  withRoot((fx) => {
    expect(run(["--root", fx.dir], standIn(fx)).code).toBe(0);
    const first = surfaceFiles(fx.dir);
    expect(run(["--root", fx.dir], standIn(fx)).code).toBe(0);
    expect(surfaceFiles(fx.dir)).toEqual(first);
    expect(exportSurface(fx.dir, { runner: standIn(fx), image: IMAGE, check: true }).drift).toEqual([]);

    // The ai repository's second pass prints a different second line.
    rmSync(join(fx.dir, API_SURFACE_DIR, "ai.jsonl"));
    const before = surfaceFiles(fx.dir);
    const flaky = standIn(fx, (repo, classes, pass) => (repo === "ai" && pass === 2 ? `${cannedOutput(repo, classes)}${decl("Laravel\\Ai\\Late")}\n` : cannedOutput(repo, classes)));
    const result = run(["--root", fx.dir], flaky);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("api surface not deterministic: ai (first difference at line 2)\n");
    expect(surfaceFiles(fx.dir)).toEqual(before);
  });
});

phpTest("XT-conformance-200", "the real api-surface.php run twice on the fixture gives identical output (FR-6)", () => {
  const first = runFixture(FIXTURE_CLASSES);
  const second = runFixture(FIXTURE_CLASSES);
  expect(first.code).toBe(0);
  expect(second.stdout).toBe(first.stdout);
});

// ---------------------------------------------------------------------------
// XT-conformance-82

xaravelTest("XT-conformance-82", "additions.jsonl and exceptions.jsonl exist empty and Protected, and their schema requires a citation on every line: FR or DIV for additions, DIV or deferred: for exceptions (AD-15.5, AD-16.1)", () => {
  const entries = parseList(readFileSync(join(root, LIST_PATH), "utf8"));
  const phases = activePhases(root);
  for (const name of ["additions.jsonl", "exceptions.jsonl", "schema.json", "support.jsonl"]) {
    const path = `${API_SURFACE_DIR}/${name}`;
    expect([path, existsSync(join(root, path))]).toEqual([path, true]);
    expect([path, isProtected(entries, phases, path)]).toEqual([path, true]);
  }
  expect(statSync(join(root, API_SURFACE_DIR, "additions.jsonl")).size).toBe(0);
  expect(statSync(join(root, API_SURFACE_DIR, "exceptions.jsonl")).size).toBe(0);
  expect(checkCitations(root)).toEqual([]);

  const line = (citation: string | null, member: string | null = "hxRedirect", component = "http", fqcn = "Illuminate\\Http\\RedirectResponse"): JsonObject =>
    citation === null ? { component, fqcn, member } : { component, fqcn, member, citation };
  // Accepted.
  for (const citation of ["FR-41", "DIV-1", "DIV-12", "DIV-3.2"]) {
    expect([citation, defErrors(line(citation), "addition", schema)]).toEqual([citation, []]);
  }
  for (const citation of ["DIV-9", "DIV-9.1", "deferred:foundation-cloud"]) {
    expect([citation, defErrors(line(citation, null), "exception", schema)]).toEqual([citation, []]);
  }
  // Rejected: no citation, an FR in exceptions, a deferred: item in additions, a DIV outside 1..12, an extra key.
  expect(defErrors(line(null), "addition", schema)).toEqual(['$: missing "citation"']);
  expect(defErrors(line(null), "exception", schema)).toEqual(['$: missing "citation"']);
  expect(defErrors(line("FR-41"), "exception", schema).length).toBe(1);
  expect(defErrors(line("deferred:foundation-cloud"), "addition", schema).length).toBe(1);
  expect(defErrors(line("DIV-13"), "addition", schema).length).toBe(1);
  expect(defErrors(line("DIV-0"), "exception", schema).length).toBe(1);
  expect(defErrors(line(""), "addition", schema).length).toBe(1);
  expect(defErrors({ ...line("FR-41"), note: "x" }, "addition", schema)).toEqual(['$: unexpected key "note"']);

  // The file rules: sorted by component, fqcn, member, no duplicates, canonical key order, LF-terminated.
  const render = (value: JsonObject): string => `${renderJson(value as Json)}\n`;
  const a = line("FR-41", null);
  const b = line("FR-41", "hxRedirect");
  const c = line("DIV-1", "thenAsync", "support", "Illuminate\\Support\\Str");
  expect(citationProblems(render(a) + render(b) + render(c), "additions.jsonl", "addition", schema)).toEqual([]);
  expect(citationProblems("", "additions.jsonl", "addition", schema)).toEqual([]);
  expect(citationProblems(render(b) + render(a), "additions.jsonl", "addition", schema)).toEqual(["additions.jsonl:2: not sorted (by component, fqcn, member)"]);
  expect(citationProblems(render(b) + render({ ...b, citation: "DIV-2" }), "additions.jsonl", "addition", schema)).toEqual([
    "additions.jsonl:2: duplicates the line before it (http Illuminate\\Http\\RedirectResponse hxRedirect)",
  ]);
  expect(citationProblems(render(b).slice(0, -1), "additions.jsonl", "addition", schema)).toEqual(["additions.jsonl: the file must end with a newline"]);
  expect(citationProblems(`${renderJson({ citation: "FR-41", component: "http", fqcn: "X", member: null })}\n`, "additions.jsonl", "addition", schema)).toEqual([
    'additions.jsonl:1: the line is not in canonical form (compact JSON, keys component, fqcn, member, citation); expected {"component":"http","fqcn":"X","member":null,"citation":"FR-41"}',
  ]);
  expect(citationProblems(render(line("FR-41")), "exceptions.jsonl", "exception", schema)).toEqual([
    'exceptions.jsonl:1: $.citation: "FR-41" does not match ^(?:DIV-(?:[1-9]|1[0-2])(?:\\.[1-9][0-9]*)?|deferred:[a-z0-9]+(?:-[a-z0-9]+)*)$',
  ]);
  expect(citationProblems("not json\n", "exceptions.jsonl", "exception", schema)[0]).toStartWith("exceptions.jsonl:1: malformed JSON");

  // checkCitations reads both files under a root and reports a missing one.
  withRoot((fx) => {
    expect(checkCitations(fx.dir)).toEqual([]);
    rmSync(join(fx.dir, API_SURFACE_DIR, "exceptions.jsonl"));
    writeFileSync(join(fx.dir, API_SURFACE_DIR, "additions.jsonl"), render(line(null)));
    expect(checkCitations(fx.dir)).toEqual([`${API_SURFACE_DIR}/additions.jsonl:1: $: missing "citation"`, `${API_SURFACE_DIR}/exceptions.jsonl is missing`]);
  });
});
