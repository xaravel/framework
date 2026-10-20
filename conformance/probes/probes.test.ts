// Xaravel Tests for Story 8.3 (the Bun primitive probes; OQ-11, AD-5, AD-20,
// FR-114). The probes run live in this process (backend probes without their
// XARAVEL_PROBE_* variable, so they are not-run). Fixture roots are hermetic
// temp directories holding copies of the record, the report, `.bun-version`
// and the Story's Escalations; the real repository is only read.
import { afterAll, expect } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEscalation } from "../../tools/escalations/escalations";
import { xaravelTest } from "../../packages/assert/src/index";
import {
  BUN_VERSION_FILE,
  IMAGE_OPERATIONS,
  checkProbes,
  ESCALATIONS_DIR,
  GROUPS,
  type LiveResult,
  PROBE_ENV,
  PROBES,
  type ProbeRecord,
  readRecord,
  renderReport,
  REPORT_FILE,
  RESULTS_FILE,
  runProbes,
  serializeRecord,
} from "./probes";

const root = resolve(import.meta.dir, "..", "..");
const CLI = join(root, "conformance", "probes", "probes.ts");
const TIMEOUT = 240_000;
/** Each CLI run's budget, below TIMEOUT, so a hung probe fails the test instead of outliving it. */
const CLI_TIMEOUT = 60_000;
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** The probe list of the Story 8.3 spec, in order. */
const EXPECTED_IDS = [
  "bun-test.failing",
  "bun-test.skipIf",
  "bun-test.assertion-counts",
  "bun-test.setSystemTime",
  "bun-test.preload-afterEach",
  "bun-sql.pgsql.raw-bindings",
  "bun-sql.pgsql.reserve",
  "bun-sql.mysql.raw-bindings",
  "bun-sql.mysql.reserve",
  "bun-redis.commands",
  "bun-redis.transactions",
  "bun-redis.pubsub",
  "bun-s3.client",
  "bun-image.laravel-api",
  "als.await",
  "als.timers",
  "als.stream-body",
  "als.async-generator",
  "als.direct-stream",
  "als.serve-callbacks",
];

/** The env without any XARAVEL_PROBE_* variable. */
function envWithoutBackends(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("XARAVEL_PROBE_") && key !== "BUN_OPTIONS" && key !== "NODE_OPTIONS") {
      env[key] = value;
    }
  }
  return env;
}

/** The supported operations the image probe names today (its `supported (<n>): ...` list). */
const IMAGE_SUPPORTED = ["resize", "scale", "orient", "grayscale", "flipVertically", "flipHorizontally", "toWebp", "toJpeg", "toPng", "dimensions"];

/** Whether an unsupported backend-free probe's evidence still shows every sub-check that passes today. */
function unsupportedEvidenceHolds(id: string, evidence: string): boolean {
  switch (id) {
    case "als.async-generator":
    case "als.direct-stream":
      return evidence.endsWith("restores the frame: yes");
    case "als.serve-callbacks":
      return evidence.includes("/a [true,true,true], /b [true,true,true]") && evidence.includes("(interleaved: yes)") && evidence.endsWith("restores the frame: yes");
    case "bun-image.laravel-api": {
      const list = /; supported \((\d+)\): (.*)$/.exec(evidence);
      return list !== null && list[2] === IMAGE_SUPPORTED.join(", ") && Number(list[1]) === IMAGE_SUPPORTED.length && IMAGE_SUPPORTED.every((operation) => operation in IMAGE_OPERATIONS);
    }
    default:
      return false;
  }
}

let liveOnce: Promise<Map<string, LiveResult>> | null = null;
/** The live results with no backend variable, run once per file. */
const live = (): Promise<Map<string, LiveResult>> => (liveOnce ??= runProbes({}));

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync([process.execPath, "--no-env-file", CLI, ...args], { cwd: root, env: envWithoutBackends(), stdout: "pipe", stderr: "pipe", timeout: CLI_TIMEOUT });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

/** A record with every probe present: the real record, plus each unrecorded backend probe as supported. */
function completeRecord(): ProbeRecord {
  const record = readRecord(root);
  for (const probe of PROBES) {
    record.probes[probe.id] ??= { status: "supported", escalation: null };
  }
  return record;
}

/** A fixture root: a record (default `completeRecord()`), its rendered REPORT.md, `.bun-version` and the Story's Escalations. */
function fixture(record: ProbeRecord = completeRecord(), files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-probes-"));
  roots.push(dir);
  mkdirSync(join(dir, "conformance", "probes"), { recursive: true });
  mkdirSync(join(dir, ESCALATIONS_DIR), { recursive: true });
  for (const name of readdirSync(join(root, ESCALATIONS_DIR)).filter((file) => file.startsWith("ESC-8.3-"))) {
    cpSync(join(root, ESCALATIONS_DIR, name), join(dir, ESCALATIONS_DIR, name));
  }
  cpSync(join(root, BUN_VERSION_FILE), join(dir, BUN_VERSION_FILE));
  writeFileSync(join(dir, RESULTS_FILE), serializeRecord(record));
  writeFileSync(join(dir, REPORT_FILE), renderReport(PROBES, record));
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

// ---------------------------------------------------------------------------
// XT-conformance-155

xaravelTest(
  "XT-conformance-155",
  "Xaravel Tests under conformance/probes/ run every OQ-11 Bun primitive probe on Bun 1.4.3 and compare it with the committed record; probes:check fails closed and runs in CI against Postgres, MySQL, Redis and S3 (OQ-11, AD-5, AD-20)",
  async () => {
    // The registry is the spec's probe list, and every OQ-11 group has a probe.
    expect(PROBES.map((probe) => probe.id)).toEqual(EXPECTED_IDS);
    expect([...GROUPS]).toEqual(["bun test", "Bun.sql", "Bun.redis", "Bun.S3Client", "Bun.Image", "AsyncLocalStorage"]);
    for (const group of GROUPS) {
      expect([group, PROBES.some((probe) => probe.group === group)]).toEqual([group, true]);
    }
    const backends = PROBES.filter((probe) => probe.backend !== null).map((probe) => [probe.id, probe.backend]);
    expect(backends).toEqual([
      ["bun-sql.pgsql.raw-bindings", PROBE_ENV.pgsql],
      ["bun-sql.pgsql.reserve", PROBE_ENV.pgsql],
      ["bun-sql.mysql.raw-bindings", PROBE_ENV.mysql],
      ["bun-sql.mysql.reserve", PROBE_ENV.mysql],
      ["bun-redis.commands", PROBE_ENV.redis],
      ["bun-redis.transactions", PROBE_ENV.redis],
      ["bun-redis.pubsub", PROBE_ENV.redis],
      ["bun-s3.client", PROBE_ENV.s3],
    ]);

    // The record: Bun 1.4.3, ids sorted, and the committed text is what `record` would serialise.
    const record = readRecord(root);
    expect(record.bun).toBe(readFileSync(join(root, BUN_VERSION_FILE), "utf8").trim());
    expect(record.bun).toBe("1.4.3");
    const recordText = readFileSync(join(root, RESULTS_FILE), "utf8");
    expect(recordText).toBe(serializeRecord(record));
    expect(Object.keys(record.probes)).toEqual(Object.keys(record.probes).sort());

    // Each probe, live: a backend-free probe equals its record; a backend probe is not-run without its variable and is recorded.
    const results = await live();
    expect([...results.keys()]).toEqual(EXPECTED_IDS);
    for (const probe of PROBES) {
      const result = results.get(probe.id)!;
      const recorded = record.probes[probe.id]?.status ?? "missing from the record";
      if (probe.backend === null) {
        expect([probe.id, ["supported", "unsupported"].includes(result.status)]).toEqual([probe.id, true]);
        expect([probe.id, result.status, result.evidence !== ""]).toEqual([probe.id, recorded, true]);
        if (result.status === "unsupported") {
          // An unsupported record must not hide a sub-check that regressed: its evidence is pinned too.
          expect([probe.id, unsupportedEvidenceHolds(probe.id, result.evidence)]).toEqual([probe.id, true]);
        }
      } else {
        expect([probe.id, result.status, result.evidence]).toEqual([probe.id, "not-run", `${probe.backend} unset`]);
        expect([probe.id, ["supported", "unsupported"].includes(recorded)]).toEqual([probe.id, true]);
      }
    }

    // REPORT.md is wholly generated from the registry and the record.
    expect(readFileSync(join(root, REPORT_FILE), "utf8")).toBe(renderReport(PROBES, record));

    // CI: the required `check` job runs probes:check --require-backends against the four services, after porting:check.
    interface Step {
      name?: string;
      run?: string;
      env?: Record<string, string>;
    }
    interface Service {
      image: string;
      ports: string[];
      env?: Record<string, string>;
      options?: string;
    }
    const ci = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as { jobs: Record<string, { services?: Record<string, Service>; steps: Step[] }> };
    const check = ci.jobs["check"]!;
    const runs = check.steps.map((step) => step.run);
    const probeStep = check.steps.find((step) => step.run === "bun run probes:check --require-backends");
    expect(probeStep?.name).toBe("Probe the Bun primitives");
    expect(runs.indexOf("bun run probes:check --require-backends")).toBe(runs.indexOf("bun run porting:check") + 1);
    expect(probeStep?.env).toEqual({
      XARAVEL_PROBE_PGSQL_URL: "postgres://probes:probes@127.0.0.1:55432/probes",
      XARAVEL_PROBE_MYSQL_URL: "mysql://root@127.0.0.1:53306/probes",
      XARAVEL_PROBE_REDIS_URL: "redis://127.0.0.1:56379",
      XARAVEL_PROBE_S3_ENDPOINT: "http://127.0.0.1:59090",
    });
    // The variables are set on that step only.
    for (const step of check.steps.filter((candidate) => candidate !== probeStep)) {
      expect([step.run ?? step.name, Object.keys(step.env ?? {}).filter((key) => key.startsWith("XARAVEL_PROBE_"))]).toEqual([step.run ?? step.name, []]);
    }
    const services = check.services ?? {};
    expect(Object.fromEntries(Object.entries(services).map(([name, service]) => [name, [service.image, service.ports]]))).toEqual({
      postgres: ["postgres:18", ["55432:5432"]],
      mysql: ["mysql:9.7", ["53306:3306"]],
      redis: ["redis:8.10.2", ["56379:6379"]],
      s3: ["adobe/s3mock:5.2.3", ["59090:9090"]],
    });
    for (const [name, service] of Object.entries(services)) {
      expect([name, service.options?.includes("--health-cmd") ?? false]).toEqual([name, true]);
    }
    expect(services["s3"]?.env?.["COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS"]).toBe("probes");

    // Fixture roots. A complete, consistent record passes the local check.
    const ok = run(["check", "--root", fixture()]);
    expect(ok.stderr).toBe("");
    const counts = { supported: 0, unsupported: 0 };
    for (const result of results.values()) {
      if (result.status !== "not-run") {
        counts[result.status]++;
      }
    }
    const okLines = ok.stdout.split("\n");
    expect(okLines.slice(0, 20).map((line) => line.split(": ")[0])).toEqual(EXPECTED_IDS);
    expect(okLines.slice(0, 20).map((line) => line.split(": ")[1])).toEqual(EXPECTED_IDS.map((id) => results.get(id)!.status));
    expect(okLines.slice(20)).toEqual([`PROBES OK: ${counts.supported} supported, ${counts.unsupported} unsupported, 8 not run (of 20).`, ""]);
    expect(ok.code).toBe(0);

    // Drift: live unsupported, recorded supported.
    const drifted = completeRecord();
    drifted.probes["als.direct-stream"] = { status: "supported", escalation: null };
    const drift = run(["check", "--root", fixture(drifted)]);
    expect(drift.code).toBe(1);
    expect(drift.stderr).toContain(`als.direct-stream: live unsupported, recorded supported: ${results.get("als.direct-stream")!.evidence}\n`);

    // A missing backend under --require-backends.
    const missing = run(["check", "--require-backends", "--root", fixture()]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("bun-redis.commands: not run (XARAVEL_PROBE_REDIS_URL unset)\n");
    expect(missing.stderr.split("\n").filter((line) => line.includes(": not run (")).length).toBe(8);

    // Report drift, named at its first differing line.
    const lines = renderReport(PROBES, completeRecord()).split("\n");
    const at = lines.findIndex((line) => line.includes("`als.await`"));
    lines[at] = lines[at]!.replace("| supported |", "| unsupported |");
    const reportDrift = run(["check", "--root", fixture(completeRecord(), { [REPORT_FILE]: lines.join("\n") })]);
    expect(reportDrift.code).toBe(1);
    expect(reportDrift.stderr).toBe(`${REPORT_FILE}: drift at line ${at + 1}; run bun run probes:generate\n`);

    // The pure check: unrecorded, unregistered, bun mismatch; it never writes the record.
    const partial = completeRecord();
    delete partial.probes["als.await"];
    partial.probes["bun-test.gone"] = { status: "supported", escalation: null };
    const partialRoot = fixture(partial, { [BUN_VERSION_FILE]: "1.4.4\n" });
    const before = readFileSync(join(partialRoot, RESULTS_FILE), "utf8");
    const pure = checkProbes(partialRoot, results, { requireBackends: false });
    expect(pure.violations).toEqual([
      `running Bun ${Bun.version}, ${BUN_VERSION_FILE} 1.4.4`,
      `${RESULTS_FILE}: bun 1.4.3 differs from ${BUN_VERSION_FILE} 1.4.4`,
      "bun-test.gone: recorded but not in the registry",
      `als.await: missing from the record (live supported: ${results.get("als.await")!.evidence})`,
    ]);
    expect(readFileSync(join(partialRoot, RESULTS_FILE), "utf8")).toBe(before);

    // The Bun that ran the probes must be the pinned one, whatever the record says.
    const pinnedRoot = fixture();
    expect(checkProbes(pinnedRoot, results, { requireBackends: false, runningBun: "1.4.4" }).violations).toEqual([`running Bun 1.4.4, ${BUN_VERSION_FILE} 1.4.3`]);
    expect(checkProbes(pinnedRoot, results, { requireBackends: false, runningBun: "1.4.3" }).violations).toEqual([]);

    // record refuses while any probe is not-run, and writes nothing.
    const refuseRoot = fixture();
    const recordBefore = readFileSync(join(refuseRoot, RESULTS_FILE), "utf8");
    const refused = run(["record", "--root", refuseRoot]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("refusing to record: not run: bun-sql.pgsql.raw-bindings (XARAVEL_PROBE_PGSQL_URL unset)");
    expect(readFileSync(join(refuseRoot, RESULTS_FILE), "utf8")).toBe(recordBefore);

    // Usage errors exit 2 with the usage on stderr.
    for (const argv of [[], ["verify"], ["check", "--bogus"], ["run", "--require-backends"], ["check", "--json"], ["generate", "--root"], ["check", "--root", "--json"]]) {
      const usage = run(argv);
      expect([argv, usage.code, usage.stderr.includes("Usage: bun conformance/probes/probes.ts")]).toEqual([argv, 2, true]);
    }
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-conformance-156

xaravelTest(
  "XT-conformance-156",
  "an unsupported Bun primitive names an Escalation ESC-8.3-<n> that cites this test and proposes a deferred: item or a workaround, and REPORT.md links it and its decision path; an unescalated gap fails probes:check (OQ-11, FR-114)",
  async () => {
    const record = readRecord(root);
    const report = readFileSync(join(root, REPORT_FILE), "utf8").split("\n");
    const unsupported = Object.entries(record.probes).filter(([, entry]) => entry.status === "unsupported");
    expect(unsupported.length).toBeGreaterThan(0);
    for (const [id, entry] of unsupported) {
      expect([id, /^ESC-8\.3-[1-9][0-9]*$/.test(entry.escalation ?? "")]).toEqual([id, true]);
      const file = `${ESCALATIONS_DIR}/${entry.escalation}.md`;
      const parsed = parseEscalation(file, readFileSync(join(root, file), "utf8"));
      expect([id, parsed.violations]).toEqual([id, []]);
      expect([id, parsed.escalation!.testIds]).toEqual([id, ["XT-conformance-156"]]);
      expect([id, parsed.escalation!.trigger]).toEqual([id, "open-question"]);
      expect([id, parsed.escalation!.proposed.includes("deferred:") || /workaround/i.test(parsed.escalation!.proposed)]).toEqual([id, true]);
      expect([id, readFileSync(join(root, file), "utf8").includes(`\`${id}\``)]).toEqual([id, true]);
      const row = report.find((line) => line.includes(`| \`${id}\` |`));
      expect([id, row?.includes(`[${entry.escalation}](../escalations/${entry.escalation}.md)`)]).toEqual([id, true]);
      expect([id, row?.includes(`[decisions/${entry.escalation}.md](../../decisions/${entry.escalation}.md)`)]).toEqual([id, true]);
    }
    // A supported probe names no Escalation.
    for (const [id, entry] of Object.entries(record.probes).filter(([, candidate]) => candidate.status === "supported")) {
      expect([id, entry.escalation]).toEqual([id, null]);
    }

    // An unescalated gap fails the CLI.
    const gap = completeRecord();
    gap.probes["als.direct-stream"] = { status: "unsupported", escalation: null };
    const unescalated = run(["check", "--root", fixture(gap)]);
    expect(unescalated.code).toBe(1);
    expect(unescalated.stderr).toBe("als.direct-stream: unsupported with no Escalation\n");

    // The pure check: a missing Escalation file, one that does not cite XT-conformance-156 or proposes neither, and a supported probe with one.
    const results = await live();
    const bad = completeRecord();
    bad.probes["als.direct-stream"] = { status: "unsupported", escalation: "ESC-8.3-9" };
    bad.probes["als.async-generator"] = { status: "unsupported", escalation: "ESC-8.3-8" };
    bad.probes["als.await"] = { status: "supported", escalation: "ESC-8.3-1" };
    const escalation = (testId: string, proposed: string): string =>
      ["---", "test_ids:", `  - ${testId}`, "trigger: open-question", `proposed: ${proposed}`, "evidence: the probe output", "---", "", "# body", ""].join("\n");
    const badRoot = fixture(bad, { [`${ESCALATIONS_DIR}/ESC-8.3-8.md`]: escalation("XT-conformance-155", "ask the Maintainer") });
    const pure = checkProbes(badRoot, results, { requireBackends: false });
    expect(pure.violations).toEqual([
      "als.await: supported but names Escalation ESC-8.3-1",
      "als.async-generator: ESC-8.3-8 test_ids do not include XT-conformance-156",
      "als.async-generator: ESC-8.3-8 proposed names neither a deferred: item nor a workaround",
      `als.direct-stream: unsupported with no Escalation (${ESCALATIONS_DIR}/ESC-8.3-9.md does not exist)`,
    ]);
  },
  TIMEOUT,
);
