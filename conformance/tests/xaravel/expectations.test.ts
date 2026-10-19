// Xaravel Tests for Story 5.1 (Variant vocabulary and Expectations File,
// FR-3, AD-15; decisions/ESC-5.1-1.md). These run under plain `bun test`
// until the harness's `xaravelTest` lands in Story 5.9. Fixture roots are
// hermetic temp directories holding `conformance/variants`,
// `conformance/inventory/*.jsonl` and `conformance/expectations/`; the real
// repository is only read, never written.
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { check, init, initialLine, parseVariants, readVariants, serialiseLine, shardPathFor, VARIANTS_FILE } from "../../../tools/expectations/expectations";
import { ALPHA_VARIANTS } from "../../../tools/inventory/inventory";
import { applyBump, EXPECTATION_KEYS, readExpectations, readWorkingInventory } from "../../../tools/pin-bump/pin-bump";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "expectations", "expectations.ts");
const REAL_VARIANTS = readFileSync(join(root, VARIANTS_FILE), "utf8");

// ---------------------------------------------------------------------------
// Fixture

const HASH = "0".repeat(64);

function entry(id: string, component: string, backends: string[], source: string): string {
  return `${JSON.stringify({ id, component, kind: "unit", backends, source, hash: HASH, assertions: null, oracle: {} })}\n`;
}

const A = "Illuminate\\Tests\\Support\\SupportStrTest::testA";
const B = "Illuminate\\Tests\\Support\\SupportStrTest::testB";
const AI = "ai/tests/Feature/AgentTest.php::it works";
const SUPPORT_SHARD = "conformance/expectations/support/framework/tests/Support/SupportStrTest.jsonl";
const AI_SHARD = "conformance/expectations/ai/ai/tests/Feature/AgentTest.jsonl";

const INVENTORY: Record<string, string> = {
  "support.jsonl": entry(A, "support", ["none"], "framework/tests/Support/SupportStrTest.php:10-12") + entry(B, "support", ["mysql", "sqlite"], "framework/tests/Support/SupportStrTest.php:14-20"),
  "ai.jsonl": entry(AI, "ai", ["none"], "ai/tests/Feature/AgentTest.php:3-5"),
};

function fixture(inventory: Record<string, string> = INVENTORY, variants: string = REAL_VARIANTS): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-expectations-"));
  write(dir, VARIANTS_FILE, variants);
  for (const [name, text] of Object.entries(inventory)) {
    write(dir, `conformance/inventory/${name}`, text);
  }
  return dir;
}

function write(dir: string, path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
}

function read(dir: string, path: string): string {
  return readFileSync(join(dir, path), "utf8");
}

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (sub: string): void => {
    for (const name of readdirSync(join(dir, sub), { withFileTypes: true })) {
      const path = `${sub}/${name.name}`;
      if (name.isDirectory()) {
        walk(path);
      } else {
        out[path] = read(dir, path);
      }
    }
  };
  if (existsSync(join(dir, "conformance/expectations"))) {
    walk("conformance/expectations");
  }
  return out;
}

function run(...args: string[]): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

function line(id: string, variant: string, reason = "not-ported-yet"): string {
  return `{"id":${JSON.stringify(id)},"variant":"${variant}","status":"skip","reason":"${reason}","adapted":null,"escalation":null}`;
}

/** A fixture root after `init`. */
function initialised(): string {
  const dir = fixture();
  init(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// XT-conformance-89: the closed Variant vocabulary

test("XT-conformance-89: conformance/variants is the closed vocabulary and every Inventory backend is a member", () => {
  const { variants, violations } = readVariants(root);
  expect(violations).toEqual([]);
  expect(variants).toEqual([
    "mariadb",
    "mysql",
    "none",
    "pgsql",
    "queue-beanstalkd@beanstalkd",
    "queue-database@pgsql",
    "queue-database@sqlite",
    "queue-redis@redis",
    "queue-sync@none",
    "redis",
    "session-redis@redis",
    "sqlite",
    "sqlsrv",
  ]);
  for (const core of ["none", "sqlite", "pgsql", "redis", "queue-database@pgsql", "session-redis@redis"]) {
    expect(variants).toContain(core);
  }
  for (const alpha of ALPHA_VARIANTS) {
    expect(variants).toContain(alpha);
  }
  const backends = new Set(readWorkingInventory(root).flatMap((item) => item.backends));
  for (const backend of backends) {
    expect(variants).toContain(backend);
  }
});

test("XT-conformance-89: a malformed, duplicated or unsorted vocabulary line is a violation naming the line", () => {
  expect(parseVariants("# c\n\nnone\nsqlite\n").violations).toEqual([]);
  expect(parseVariants("MySQL\nnone\n").violations).toEqual([`${VARIANTS_FILE}:1: not a Variant: "MySQL"`]);
  expect(parseVariants("none\nnone\n").violations).toEqual([`${VARIANTS_FILE}:2: duplicate Variant none`]);
  expect(parseVariants("sqlite\nnone\n").violations).toEqual([`${VARIANTS_FILE}:2: Variant none is not sorted after sqlite`]);
  expect(parseVariants("none\r\nsqlite\n").violations).toEqual([`${VARIANTS_FILE}:1: CR line ending`]);
  expect(parseVariants("none\nsqlite").violations).toEqual([`${VARIANTS_FILE}: missing final LF`]);
  expect(parseVariants(new Uint8Array([0x6e, 0xff, 0x0a])).violations).toEqual([`${VARIANTS_FILE}: invalid UTF-8`]);
  expect(parseVariants("# only\n").violations).toEqual([`${VARIANTS_FILE}: lists no Variant`]);
  const empty = mkdtempSync(join(tmpdir(), "xaravel-expectations-"));
  try {
    expect(readVariants(empty)).toEqual({ variants: [], violations: [`${VARIANTS_FILE}: does not exist`] });
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
  for (const bad of ["queue@", "@redis", "a--b@c", "Queue-sync@none", "x@y@z", " none"]) {
    expect(parseVariants(`${bad}\n`).violations.length).toBeGreaterThan(0);
  }

  const dir = fixture(INVENTORY, "MySQL\nnone\n");
  try {
    expect(() => init(dir)).toThrow("not a Variant");
    expect(check(dir).violations).toContain(`${VARIANTS_FILE}:1: not a Variant: "MySQL"`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("XT-conformance-89: an Inventory backend outside the vocabulary fails init and check, naming the id and backend", () => {
  const dir = fixture({ "support.jsonl": entry(A, "support", ["oracle"], "framework/tests/Support/SupportStrTest.php:10-12") });
  try {
    expect(() => init(dir)).toThrow(`unknown backend: ${A} has backend oracle`);
    expect(existsSync(join(dir, "conformance/expectations"))).toBe(false);
    const cli = run("init", "--root", dir);
    expect(cli.code).toBe(1);
    expect(cli.stderr).toContain(`${A} has backend oracle`);
    expect(check(dir).violations).toContain(`unknown backend: ${A} has backend oracle, which is not in ${VARIANTS_FILE}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-90: init

test("XT-conformance-90: init writes one sorted shard per source file, skip / not-ported-yet, deferred:ai-sdk for ai", () => {
  const dir = fixture();
  try {
    expect(init(dir)).toEqual({ added: 4, shards: [AI_SHARD, SUPPORT_SHARD] });
    expect(Object.keys(snapshot(dir)).sort()).toEqual([AI_SHARD, SUPPORT_SHARD]);
    expect(read(dir, SUPPORT_SHARD)).toBe(`${line(A, "none")}\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`);
    expect(read(dir, AI_SHARD)).toBe(`${line(AI, "none", "deferred:ai-sdk")}\n`);
    expect(check(dir)).toEqual({ violations: [], lines: 4, shards: 2, pairs: 4 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("XT-conformance-90: re-running init changes nothing and keeps an edited line", () => {
  const dir = initialised();
  try {
    const edited = read(dir, SUPPORT_SHARD).replace(`${line(A, "none")}`, line(A, "none").replace('"status":"skip"', '"status":"pass"'));
    write(dir, SUPPORT_SHARD, edited);
    const before = snapshot(dir);
    expect(init(dir)).toEqual({ added: 0, shards: [] });
    expect(snapshot(dir)).toEqual(before);
    expect(read(dir, SUPPORT_SHARD)).toContain('"status":"pass"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("XT-conformance-90: init adds only missing pairs and re-sorts only the shards it touches", () => {
  const dir = initialised();
  try {
    write(dir, SUPPORT_SHARD, `${line(B, "mysql")}\n${line(B, "sqlite")}\n`);
    write(dir, AI_SHARD, `${line(AI, "none", "custom")}\n`);
    expect(init(dir)).toEqual({ added: 1, shards: [SUPPORT_SHARD] });
    expect(read(dir, SUPPORT_SHARD)).toBe(`${line(A, "none")}\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`);
    expect(read(dir, AI_SHARD)).toBe(`${line(AI, "none", "custom")}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("XT-conformance-90: init refuses, writing nothing, when an existing shard has a fault", () => {
  const faulty: [string, string | Uint8Array, string][] = [
    ["malformed JSON", `{not json\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`, `${SUPPORT_SHARD}:1: malformed JSON`],
    ["invalid UTF-8", new Uint8Array([...new TextEncoder().encode(`${line(B, "mysql")}\n`), 0xff, 0x0a]), `${SUPPORT_SHARD}: invalid UTF-8`],
    ["CRLF", `${line(B, "mysql")}\r\n${line(B, "sqlite")}\n`, `${SUPPORT_SHARD}:1: CR line ending`],
    ["duplicate pair", `${line(B, "mysql")}\n${line(B, "mysql")}\n`, `${SUPPORT_SHARD}:2: ${B} × mysql is already on ${SUPPORT_SHARD}:1`],
  ];
  for (const [name, content, expected] of faulty) {
    // Every case also leaves ${A} × none missing, so init would otherwise touch the shard.
    const dir = initialised();
    try {
      write(dir, SUPPORT_SHARD, content);
      const before = snapshot(dir);
      expect(() => init(dir)).toThrow(expected);
      expect(() => init(dir)).toThrow("run expectations:check");
      const cli = run("init", "--root", dir);
      expect({ name, code: cli.code }).toEqual({ name, code: 1 });
      expect(cli.stderr).toContain(expected);
      expect(snapshot(dir)).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("XT-conformance-90: bun run expectations:init --root works and prints the summary", () => {
  const dir = fixture();
  try {
    const proc = Bun.spawnSync(["bun", "run", "expectations:init", "--root", dir], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(proc.stdout.toString()).toContain("Expectations init: added 4 line(s) in 2 shard(s).");
    expect(proc.exitCode).toBe(0);
    const again = run("init", "--root", dir);
    expect(again).toEqual({ code: 0, stdout: "Expectations init: added 0 line(s) in 0 shard(s).\n", stderr: "" });
    expect(run("bogus").code).toBe(2);
    expect(run("init", "--root").code).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("XT-conformance-90: a serialised line has AD-15's six keys in order, as pin-bump writes and reads them", () => {
  const id = "Illuminate\\Tests\\Integration\\Support\\AuthFacadeTest::testItFailsIfTheUiPackageIsMissing";
  const serialised = serialiseLine(initialLine({ id, component: "support" }, "none"));
  expect(serialised).toBe(String.raw`{"id":"Illuminate\\Tests\\Integration\\Support\\AuthFacadeTest::testItFailsIfTheUiPackageIsMissing","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":null}`);
  const parsed = JSON.parse(serialised) as Record<string, unknown>;
  expect(Object.keys(parsed)).toEqual([...EXPECTATION_KEYS]);
  expect(shardPathFor({ component: "support", source: "framework/tests/Integration/Support/AuthFacadeTest.php:11-18" })).toBe("conformance/expectations/support/framework/tests/Integration/Support/AuthFacadeTest.jsonl");

  const dir = initialised();
  try {
    const shards = readExpectations(dir);
    expect(shards.map((shard) => shard.path)).toEqual([AI_SHARD, SUPPORT_SHARD]);
    expect(shards[1]!.lines[0]).toEqual({ id: A, variant: "none", status: "skip", reason: "not-ported-yet", adapted: null, escalation: null });
    // pin-bump's real writer (a rename through applyBump) produces the bytes serialiseLine does.
    const renamedId = "ai/tests/Feature/AgentTest.php::it still works";
    const edits = applyBump(shards, { added: [], changed: [], removed: [], renamed: [{ id: AI, component: "ai", hash: HASH, to: renamedId }] });
    const rewritten = edits.get(AI_SHARD);
    expect(rewritten).toBe(`${serialiseLine({ ...initialLine({ id: AI, component: "ai" }, "none"), id: renamedId })}\n`);
    write(dir, AI_SHARD, rewritten!);
    expect(check(dir).violations.filter((violation) => violation.startsWith(`${AI_SHARD}`))).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-91: check

test("XT-conformance-91: a pair on two shards is a duplicate listing both paths", () => {
  const dir = initialised();
  try {
    write(dir, "conformance/expectations/a.jsonl", `${line(A, "none")}\n`);
    write(dir, "conformance/expectations/b/slice.jsonl", `${line(A, "none")}\n`);
    const { violations } = check(dir);
    expect(violations).toContain(`duplicate: ${A} × none in conformance/expectations/a.jsonl:1, conformance/expectations/b/slice.jsonl:1, ${SUPPORT_SHARD}:1`);
    const cli = run("check", "--root", dir);
    expect(cli.code).toBe(1);
    expect(cli.stderr).toContain(`duplicate: ${A} × none in conformance/expectations/a.jsonl:1`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("XT-conformance-91: a deleted line is missing, a fake id is unknown", () => {
  const dir = initialised();
  try {
    write(dir, SUPPORT_SHARD, `${line(A, "none")}\n${line(B, "mysql")}\n${line(`${B}Fake`, "none")}\n`);
    const { violations } = check(dir);
    expect(violations).toContain(`missing: ${B} × sqlite`);
    expect(violations).toContain(`unknown: ${B}Fake × none (${SUPPORT_SHARD}:3) is not an Inventory pair`);
    expect(violations).toHaveLength(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("XT-conformance-91: each format fault is one violation naming file:line", () => {
  const EXTRA = "conformance/expectations/support/framework/tests/Support/Extra.jsonl";
  const extra: [string, string, string][] = [
    ["empty shard", "", `${EXTRA}: empty shard`],
    ["malformed JSON", "{not json\n", `${EXTRA}:1: malformed JSON: `],
    ["seventh key", `${line(A, "none").slice(0, -1)},"extra":1}\n`, `${EXTRA}:1: expected an object with exactly the keys id, variant, status, reason, adapted, escalation in that order`],
  ];
  for (const [name, content, expected] of extra) {
    const dir = initialised();
    try {
      write(dir, EXTRA, content);
      const { violations } = check(dir);
      expect({ name, violations: violations.map((violation) => (violation.startsWith(expected) ? expected : violation)) }).toEqual({ name, violations: [expected] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const cases: [string, string | Uint8Array, string][] = [
    ["CRLF", `${line(A, "none")}\r\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`, `${SUPPORT_SHARD}:1: CR line ending`],
    ["no final LF", `${line(A, "none")}\n${line(B, "mysql")}\n${line(B, "sqlite")}`, `${SUPPORT_SHARD}: missing final LF`],
    ["unsorted", `${line(B, "mysql")}\n${line(A, "none")}\n${line(B, "sqlite")}\n`, `${SUPPORT_SHARD}:2: ${A} × none is not sorted after ${B} × mysql`],
    ["blank line", `${line(A, "none")}\n\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`, `${SUPPORT_SHARD}:2: blank line`],
    ["BOM", `﻿${line(A, "none")}\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`, `${SUPPORT_SHARD}: starts with a BOM`],
    ["within-shard duplicate", `${line(A, "none")}\n${line(A, "none")}\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`, `duplicate: ${A} × none in ${SUPPORT_SHARD}:1, ${SUPPORT_SHARD}:2`],
    ["spaced line", `${line(A, "none").replaceAll(",", ", ")}\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`, `${SUPPORT_SHARD}:1: not in canonical form`],
    ["repeated key", `${line(A, "none").slice(0, -1)},"variant":"none"}\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`, `${SUPPORT_SHARD}:1: not in canonical form`],
    [
      "key order",
      `{"variant":"none","id":${JSON.stringify(A)},"status":"skip","reason":"not-ported-yet","adapted":null,"escalation":null}\n${line(B, "mysql")}\n${line(B, "sqlite")}\n`,
      `${SUPPORT_SHARD}:1: expected an object with exactly the keys id, variant, status, reason, adapted, escalation in that order`,
    ],
    ["non-string id", `${line(A, "none")}\n${line(B, "mysql")}\n${line(B, "sqlite")}\n{"id":1,"variant":"none","status":"skip","reason":null,"adapted":null,"escalation":null}\n`, `${SUPPORT_SHARD}:4: id and variant must be strings`],
    ["unknown Variant", `${line(A, "none")}\n${line(B, "mysql")}\n${line(B, "sqlite")}\n${line(B, "oracle")}\n`, `${SUPPORT_SHARD}:4: Variant "oracle" is not in ${VARIANTS_FILE}`],
  ];
  for (const [name, content, expected] of cases) {
    const dir = initialised();
    try {
      write(dir, SUPPORT_SHARD, content);
      const { violations } = check(dir);
      expect({ name, has: violations.includes(expected) }).toEqual({ name, has: true });
      if (!["key order", "unknown Variant"].includes(name)) {
        expect({ name, violations }).toEqual({ name, violations: [expected] });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const faulty = initialised();
  try {
    write(faulty, SUPPORT_SHARD, `${line(A, "none")}\n${line(B, "mysql")}\n${line(B, "sqlite")}`);
    const cli = run("check", "--root", faulty);
    expect(cli).toEqual({ code: 1, stdout: "", stderr: `${SUPPORT_SHARD}: missing final LF\n` });
  } finally {
    rmSync(faulty, { recursive: true, force: true });
  }

  const dir = initialised();
  try {
    const bytes = new TextEncoder().encode(read(dir, AI_SHARD));
    write(dir, AI_SHARD, new Uint8Array([...bytes.slice(0, 10), 0xff, ...bytes.slice(10)]));
    write(dir, "conformance/expectations/README.md", "x\n");
    write(dir, "conformance/expectations/auth/framework/tests/Support/SupportStrTest.jsonl", `${line(A, "none")}\n`);
    const { violations } = check(dir);
    expect(violations).toContain(`${AI_SHARD}: invalid UTF-8`);
    expect(violations).toContain("conformance/expectations/README.md: not a .jsonl shard");
    expect(violations).toContain(`conformance/expectations/auth/framework/tests/Support/SupportStrTest.jsonl:1: ${A} belongs to Component support, but the shard is not under conformance/expectations/support/`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("XT-conformance-91: check passes on the repository and the package scripts run the tool", () => {
  const report = check(root);
  expect(report.violations).toEqual([]);
  const pairs = readWorkingInventory(root).reduce((sum, item) => sum + item.backends.length, 0);
  expect(report.pairs).toBe(pairs);
  expect(report.lines).toBe(pairs);
  const cli = run("check");
  expect(cli.code).toBe(0);
  expect(cli.stdout).toBe(`Expectations OK: ${pairs} line(s) in ${report.shards} shard(s) cover ${pairs} Test ID × Variant pair(s).\n`);

  const scripts = (JSON.parse(read(root, "package.json")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["expectations:init"]).toBe("bun tools/expectations/expectations.ts init");
  expect(scripts["expectations:check"]).toBe("bun tools/expectations/expectations.ts check");
});
