// The public conformance dashboard and the Epic review view (Story 7.2; FR-5, UJ-5).
//
//   bun --no-env-file tools/conformance-report/site.ts [--root <dir>] [--report <file>]
//       [--history <file>] [--out <dir>] [--repo <owner/name>] [--api-surface <file>]
//       (`bun run conformance:site`, run by `.github/workflows/dashboard.yml`
//       after `conformance:history`) renders a static site into `--out`
//       (default `<root>/.cache/conformance/site`, replaced on every run):
//       `index.html`, one `epics/<N>.html` per Epic with a Story manifest,
//       one `api-surface/<component>.html` per API-surface Component, `.nojekyll`, `report.json` and `history.jsonl`. It prints
//       `conformance:site: wrote <n> pages to <dir>`.
//
// Inputs:
// - `--report`: Story 7.1's `report.json` (default `<root>/.cache/conformance/report.json`).
//   Every rate, count and alpha figure is read from it; nothing is recomputed.
// - `--history`: the `history.jsonl` from `dashboard-data` (`conformance:history
//   --history-out`); absent means an empty history.
// - `--repo`: the GitHub `owner/name` that record links point at (default
//   `$GITHUB_REPOSITORY`); when neither is set, names render as plain text.
// - `--api-surface`: a precomputed `ComponentDiff[]` JSON file; when absent the
//   site calls `diffComponents(root, componentsOf(root))` (which runs `tsc -b`).
// - the Escalations (`conformance/escalations/ESC-*.md`), the Divergence
//   Records (`decisions/DIV-*.md`), the Expectations File (Quarantined tests),
//   the Story manifests and sprint status, and git history at `--root` (the
//   Epic review view).
//
// Every interpolated string is HTML-escaped. docs/ops/conformance-report.md
// documents the pages.
//
// Exit codes: 0 ok, 1 data error (a missing or malformed report or history,
// an unreadable input, a git failure), 2 usage error.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compareUnits } from "../inventory/inventory";
import { readExpectations } from "../pin-bump/pin-bump";
import { ESCALATIONS_DIR, DECISIONS_DIR, escalationStatus, parseEscalation, parseEscalationId, type EscalationStatus } from "../escalations/escalations";
import { applySprintStatus, readManifests, STORIES_DIR, type Manifest, type Status as StoryStatus } from "../ownership/ownership";
import { componentsOf, countsOf, diffComponents, type ComponentDiff } from "../api-surface/api-surface";
import { DEFAULT_OUT, REASON_KINDS, serialiseReport, type Bucket, type Report } from "./report";
import { git, readReport, serialiseRecord, type HistoryRecord } from "./history";

export const DEFAULT_SITE_OUT = ".cache/conformance/site";
/** The Divergences always listed (DIV-1..DIV-12, PRD); any other `DIV-<n>` a reason names is added. */
export const BASE_DIVS = 12;

/** A data error: the CLI exits 1. */
export class SiteError extends Error {}

// ---------------------------------------------------------------------------
// HTML helpers

/** Escapes `&`, `<`, `>`, `"` and `'`. */
export function esc(value: string | number): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A rate as a percentage with two decimals, or `n/a` when null. */
export function formatRate(rate: number | null): string {
  return rate === null ? "n/a" : `${(rate * 100).toFixed(2)}%`;
}

/** `text` linked to `path` at `ref` in `repo`, or plain text when `repo` is null. */
function repoLink(repo: string | null, ref: string, path: string, text: string): string {
  if (repo === null) {
    return esc(text);
  }
  return `<a href="${esc(`https://github.com/${repo}/blob/${ref}/${path}`)}">${esc(text)}</a>`;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[], empty: string): string {
  if (rows.length === 0) {
    return `<p class="empty">${esc(empty)}</p>`;
  }
  const head = headers.map((header) => `<th>${esc(header)}</th>`).join("");
  const body = rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("\n");
  return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`;
}

const STYLE = [
  "body{font-family:system-ui,sans-serif;max-width:72rem;margin:2rem auto;padding:0 1rem;color:#1f2328;background:#fff}",
  "table{border-collapse:collapse;margin:.5rem 0 1rem}th,td{border:1px solid #d0d7de;padding:.25rem .5rem;text-align:left}",
  "td{font-variant-numeric:tabular-nums}.empty{color:#59636e}.blocking{border:2px solid #cf222e;padding:.5rem 1rem;margin:1rem 0}",
  ".blocking h2{color:#cf222e}.figure{font-size:1.25rem}.chart .overall{stroke:#0969da}.chart .alpha{stroke:#bc4c00}",
  ".chart circle.overall{fill:#0969da}.chart circle.alpha{fill:#bc4c00}.chart .marker{stroke:#59636e;stroke-dasharray:4 3}.chart text{font-size:11px;fill:#59636e}",
].join("\n");

function page(title: string, body: string): string {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>\n${STYLE}\n</style>\n</head>\n<body>\n${body}\n<footer><p>Xaravel is a TypeScript port of Laravel.</p></footer>\n</body>\n</html>\n`;
}

// ---------------------------------------------------------------------------
// History chart (FR-5.4)

export interface HistoryPoint {
  commit: string;
  /** Overall passing / pairs, or null when there is no pair. */
  rate: number | null;
  /** Alpha passing / applicable, or null when nothing is applicable. */
  alpha: number | null;
}

export interface HistorySeries {
  pin: { tag: string; commit: string };
  /** The index, across all records, of the series' first point. */
  start: number;
  points: HistoryPoint[];
}

export interface HistoryMarker {
  /** The index of the first record on the new Pin. */
  index: number;
  tag: string;
}

/** Splits `records`, in file order, into one series per run of the same Baseline Pin; each change is a marker. */
export function historySeries(records: readonly HistoryRecord[]): { series: HistorySeries[]; markers: HistoryMarker[] } {
  const series: HistorySeries[] = [];
  const markers: HistoryMarker[] = [];
  records.forEach((record, index) => {
    const last = series.at(-1);
    if (last === undefined || last.pin.tag !== record.pin.tag || last.pin.commit !== record.pin.commit) {
      if (last !== undefined) {
        markers.push({ index, tag: record.pin.tag });
      }
      series.push({ pin: { tag: record.pin.tag, commit: record.pin.commit }, start: index, points: [] });
    }
    series.at(-1)!.points.push({
      commit: record.commit,
      rate: record.overall.pairs === 0 ? null : record.overall.passing / record.overall.pairs,
      alpha: record.alpha.applicable === 0 ? null : record.alpha.passing / record.alpha.applicable,
    });
  });
  return { series, markers };
}

const CHART = { width: 800, height: 260, left: 48, right: 16, top: 24, bottom: 24 } as const;

/** The history chart as inline SVG: one `<polyline>` per series for overall and for alpha, one marker per Pin change. */
export function renderHistoryChart(records: readonly HistoryRecord[]): string {
  if (records.length === 0) {
    return `<p class="empty">no history yet</p>`;
  }
  const { series, markers } = historySeries(records);
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (index: number): number => CHART.left + (records.length === 1 ? plotWidth / 2 : (index * plotWidth) / (records.length - 1));
  const y = (rate: number): number => CHART.top + (1 - rate) * plotHeight;
  const round = (value: number): string => String(Math.round(value * 100) / 100);
  const parts: string[] = [];
  parts.push(`<svg class="chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART.width} ${CHART.height}" width="${CHART.width}" height="${CHART.height}" role="img" aria-label="Conformance Rate history">`);
  parts.push(`<title>Conformance Rate (overall) and alpha-gate figure per commit; a dashed line marks each Baseline Pin change</title>`);
  for (const tick of [0, 0.5, 1]) {
    parts.push(`<line x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${round(y(tick))}" y2="${round(y(tick))}" stroke="#d0d7de"/>`);
    parts.push(`<text x="${CHART.left - 6}" y="${round(y(tick) + 4)}" text-anchor="end">${tick * 100}%</text>`);
  }
  for (const marker of markers) {
    const at = round(x(marker.index - 0.5));
    parts.push(`<line class="marker" x1="${at}" x2="${at}" y1="${CHART.top}" y2="${CHART.height - CHART.bottom}"/>`);
    parts.push(`<text class="marker-label" x="${at}" y="${CHART.top - 8}" text-anchor="middle">${esc(marker.tag)}</text>`);
  }
  series.forEach((one, s) => {
    for (const key of ["rate", "alpha"] as const) {
      const points = one.points
        .map((point, i) => (point[key] === null ? null : `${round(x(one.start + i))},${round(y(point[key]))}`))
        .filter((point): point is string => point !== null)
        .join(" ");
      parts.push(`<polyline class="${key === "rate" ? "overall" : "alpha"}" data-series="${s}" data-pin="${esc(one.pin.tag)}" fill="none" stroke-width="2" points="${points}"/>`);
      // A circle per point, so a one-point series is visible and every point can be identified.
      one.points.forEach((point, i) => {
        const value = point[key];
        if (value !== null) {
          const label = `${point.commit.slice(0, 12)} · ${one.pin.tag} · ${key === "rate" ? "overall" : "alpha"} ${formatRate(value)}`;
          parts.push(`<circle class="${key === "rate" ? "overall" : "alpha"}" data-series="${s}" cx="${round(x(one.start + i))}" cy="${round(y(value))}" r="3"><title>${esc(label)}</title></circle>`);
        }
      });
    }
  });
  parts.push(`</svg>`);
  const legend = `<p class="legend"><span style="color:#0969da">overall (passing / pairs)</span> · <span style="color:#bc4c00">alpha (passing / applicable Test IDs)</span> · dashed line: Baseline Pin change</p>`;
  return `${parts.join("\n")}\n${legend}`;
}

/** Parses a `history.jsonl` file; throws SiteError naming the line of a malformed record. */
export function readHistory(file: string): HistoryRecord[] {
  if (!existsSync(file)) {
    throw new SiteError(`${file} does not exist`);
  }
  const text = readFileSync(file, "utf8");
  const records: HistoryRecord[] = [];
  text.split("\n").forEach((line, index) => {
    if (line === "") {
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new SiteError(`${file}:${index + 1}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const record = value as Partial<HistoryRecord> | null;
    if (
      record === null ||
      typeof record !== "object" ||
      typeof record.commit !== "string" ||
      typeof record.pin?.tag !== "string" ||
      typeof record.pin.commit !== "string" ||
      typeof record.overall?.pairs !== "number" ||
      typeof record.overall.passing !== "number" ||
      typeof record.alpha?.applicable !== "number" ||
      typeof record.alpha.passing !== "number"
    ) {
      throw new SiteError(`${file}:${index + 1}: not a history record`);
    }
    records.push(record as HistoryRecord);
  });
  return records;
}

// ---------------------------------------------------------------------------
// Records

export interface EscalationEntry {
  id: string;
  /** Repo-relative path. */
  file: string;
  /** Null when the file does not parse. */
  trigger: string | null;
  testIds: string[];
  /** Null when the status cannot be read. */
  status: EscalationStatus | null;
}

/** The Escalation at repo-relative `file` under `root`, or null when the file does not exist. */
function readEscalation(root: string, file: string): EscalationEntry | null {
  const path = join(root, file);
  if (!existsSync(path)) {
    return null;
  }
  const id = (file.split("/").pop() ?? file).replace(/\.md$/, "");
  const parsed = parseEscalation(file, readFileSync(path, "utf8")).escalation;
  let status: EscalationStatus | null;
  try {
    status = escalationStatus(id, root);
  } catch {
    status = null;
  }
  return { id, file, trigger: parsed?.trigger ?? null, testIds: parsed?.testIds ?? [], status };
}

/** Every `conformance/escalations/ESC-*.md` under `root`, sorted by id. */
export function readEscalations(root: string): EscalationEntry[] {
  const dir = join(root, ESCALATIONS_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.startsWith("ESC-") && name.endsWith(".md"))
    .sort(compareEscalations)
    .map((name) => readEscalation(root, `${ESCALATIONS_DIR}/${name}`))
    .filter((entry): entry is EscalationEntry => entry !== null);
}

/** Orders `ESC-<a>.<b>-<n>` by the numbers in it, then by code units. */
function compareEscalations(a: string, b: string): number {
  const nums = (value: string): number[] => (value.match(/\d+/g) ?? []).map(Number);
  const [x, y] = [nums(a), nums(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) {
      return x[i]! - y[i]!;
    }
  }
  return x.length !== y.length ? x.length - y.length : compareUnits(a, b);
}

/** The `DIV-<n>` records under `decisions/`, as `DIV-<n>` names. */
export function readDivRecords(root: string): Set<string> {
  const dir = join(root, DECISIONS_DIR);
  if (!existsSync(dir)) {
    return new Set();
  }
  return new Set(
    readdirSync(dir)
      .filter((name) => /^DIV-[1-9]\d*\.md$/.test(name))
      .map((name) => name.slice(0, -".md".length)),
  );
}

export interface QuarantinedLine {
  id: string;
  variant: string;
  escalation: string | null;
}

/** Every Expectations line with `status: quarantined`, in shard and line order. */
export function readQuarantined(root: string): QuarantinedLine[] {
  const out: QuarantinedLine[] = [];
  for (const shard of readExpectations(root)) {
    for (const line of shard.lines) {
      if (line["status"] === "quarantined") {
        out.push({ id: String(line["id"]), variant: String(line["variant"]), escalation: typeof line["escalation"] === "string" ? line["escalation"] : null });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Epic review view (UJ-5)

export interface StorySummary {
  id: string;
  status: StoryStatus;
  commits: number;
  /** Distinct files changed across the Story's commits. */
  files: number;
  added: number;
  deleted: number;
}

export interface EpicReview {
  epic: number;
  /** The Epic's Components, sorted; `bucket` is null when the Component has no Test IDs in the Inventory. */
  components: { component: string; bucket: Bucket | null }[];
  /** The parent of the Epic's oldest Story commit, or null when no Story has a commit (or that commit has no parent). */
  began: string | null;
  /** The Divergence Records added in `began..HEAD`, as `DIV-<n>` with their paths. */
  divergences: { id: string; file: string }[];
  /** The Escalations added in `began..HEAD`. */
  escalations: EscalationEntry[];
  /**
   * Every open (or undecidable) Escalation that concerns the Epic, whenever it was added: its Story ID is one of the
   * Epic's (`<N>.`), or its `test_ids` intersect the Epic's Stories' `test_ids`/`xaravel_test_ids`. They block acceptance.
   */
  blocking: EscalationEntry[];
  stories: StorySummary[];
}

/** Whether an Escalation with `status` counts as open: `open`, or a status that cannot be read (not decided). */
export function isOpen(status: EscalationStatus | null): boolean {
  return status === null || status === "open";
}

function compareStoryIds(a: string, b: string): number {
  const [ae, as] = a.split(".").map(Number) as [number, number];
  const [be, bs] = b.split(".").map(Number) as [number, number];
  return ae - be || as - bs;
}

export interface LoggedCommit {
  sha: string;
  parents: string[];
  subject: string;
  /** `[added, deleted, path]` per changed file; binary files count 0 lines. */
  numstat: [number, number, string][];
}

/** Every commit reachable from HEAD at `root`, oldest first, with its numstat; empty outside git or without HEAD. */
function logCommits(root: string): LoggedCommit[] {
  if (git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).exitCode !== 0) {
    return [];
  }
  const run = git(root, ["log", "--reverse", "--topo-order", "--no-renames", "--numstat", "--format=%x01%H%x09%P%x09%s", "HEAD"]);
  if (run.exitCode !== 0) {
    throw new SiteError(`git log failed: ${run.stderr.trim() || `exit ${run.exitCode}`}`);
  }
  return run.stdout
    .split("\x01")
    .filter((chunk) => chunk !== "")
    .map((chunk) => {
      const [header = "", ...rest] = chunk.split("\n");
      const [sha = "", parents = "", ...subject] = header.split("\t");
      const numstat = rest
        .filter((line) => line.trim() !== "")
        .map((line): [number, number, string] => {
          const [added = "", deleted = "", ...path] = line.split("\t");
          return [Number(added) || 0, Number(deleted) || 0, path.join("\t")];
        });
      return { sha, parents: parents === "" ? [] : parents.split(" "), subject: subject.join("\t"), numstat };
    });
}

/** What every Epic's review reads from the repository: the manifests (with sprint status) and the commit log. */
export interface EpicSources {
  manifests: readonly Manifest[];
  commits: readonly LoggedCommit[];
  /** Every Escalation under `conformance/escalations/`. */
  escalations: readonly EscalationEntry[];
}

/** Reads the `EpicSources` of `root` once, to share across Epics. */
export function epicSources(root: string): EpicSources {
  return { manifests: applySprintStatus(root, storyManifests(root)).manifests, commits: logCommits(root), escalations: readEscalations(root) };
}

/** The Epic review view of `epic` at `root`, reading Component figures from `report`; `sources` defaults to `epicSources(root)`. */
export function epicReview(root: string, epic: number, report: Report, sources: EpicSources = epicSources(root)): EpicReview {
  const manifests = sources.manifests
    .filter((manifest: Manifest) => manifest.epic === epic)
    .sort((a, b) => compareStoryIds(a.storyId, b.storyId));
  const components = [...new Set(manifests.map((manifest) => manifest.component))].sort(compareUnits).map((component) => ({ component, bucket: report.components[component] ?? null }));

  const commits = sources.commits;
  const ofStory = (id: string): LoggedCommit[] => commits.filter((commit) => commit.subject.startsWith(`${id}: `));
  const stories: StorySummary[] = manifests.map((manifest) => {
    const own = ofStory(manifest.storyId);
    const files = new Set<string>();
    let added = 0;
    let deleted = 0;
    for (const commit of own) {
      for (const [a, d, path] of commit.numstat) {
        files.add(path);
        added += a;
        deleted += d;
      }
    }
    return { id: manifest.storyId, status: manifest.status, commits: own.length, files: files.size, added, deleted };
  });

  const ids = new Set(manifests.map((manifest) => manifest.storyId));
  const oldest = commits.find((commit) => [...ids].some((id) => commit.subject.startsWith(`${id}: `)));
  const began = oldest?.parents[0] ?? null;
  const divergences: { id: string; file: string }[] = [];
  const escalations: EscalationEntry[] = [];
  if (began !== null) {
    const run = git(root, ["log", "--no-renames", "--diff-filter=A", "--name-only", "--format=", `${began}..HEAD`, "--", DECISIONS_DIR, ESCALATIONS_DIR]);
    if (run.exitCode !== 0) {
      throw new SiteError(`git log failed: ${run.stderr.trim() || `exit ${run.exitCode}`}`);
    }
    const added = [...new Set(run.stdout.split("\n").filter((line) => line !== ""))];
    for (const file of added.filter((path) => new RegExp(`^${DECISIONS_DIR}/DIV-[1-9]\\d*\\.md$`).test(path)).sort((a, b) => compareEscalations(a, b))) {
      // A record added and then deleted before HEAD is not listed.
      if (git(root, ["cat-file", "-e", `HEAD:${file}`]).exitCode !== 0) {
        continue;
      }
      divergences.push({ id: file.slice(DECISIONS_DIR.length + 1, -".md".length), file });
    }
    for (const file of added.filter((path) => path.startsWith(`${ESCALATIONS_DIR}/ESC-`) && path.endsWith(".md")).sort(compareEscalations)) {
      const entry = readEscalation(root, file);
      if (entry !== null) {
        escalations.push(entry);
      }
    }
  }
  const epicTestIds = new Set(manifests.flatMap((manifest) => [...manifest.testIds, ...manifest.xaravelTestIds]));
  const blocking = sources.escalations.filter(
    (entry) => isOpen(entry.status) && (parseEscalationId(entry.id)?.storyId?.startsWith(`${epic}.`) === true || entry.testIds.some((id) => epicTestIds.has(id))),
  );
  return { epic, components, began, divergences, escalations, blocking, stories };
}

/** The Story manifests under `root` (none without a `stories/` directory); invalid manifests are left out. */
function storyManifests(root: string): Manifest[] {
  return existsSync(join(root, STORIES_DIR)) ? readManifests(root).manifests : [];
}

/** The Epics with at least one Story manifest at `root`, ascending. */
export function epicsOf(root: string): number[] {
  return [...new Set(storyManifests(root).map((manifest) => manifest.epic))].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Pages

export interface SiteInput {
  report: Report;
  history: readonly HistoryRecord[];
  /** `owner/name` for links, or null for plain text. */
  repo: string | null;
  /** The `DIV-<n>` names with a record under `decisions/`. */
  divRecords: ReadonlySet<string>;
  escalations: readonly EscalationEntry[];
  quarantined: readonly QuarantinedLine[];
  apiSurface: readonly ComponentDiff[];
  epics: readonly EpicReview[];
}

function refOf(report: Report): string {
  return report.commit ?? "HEAD";
}

function divNumber(name: string): number {
  return Number(name.slice("DIV-".length));
}

function statusCell(status: EscalationStatus | null): string {
  return esc(status ?? "unknown");
}

function bucketRow(name: string, bucket: Bucket): string[] {
  return [esc(name), esc(bucket.pairs), esc(bucket.passing), esc(formatRate(bucket.rate)), esc(bucket.failKnown), esc(bucket.statuses.quarantined), esc(bucket.adapted)];
}

const BUCKET_HEADERS = ["Component", "pairs", "passing", "rate", "fail-known", "quarantined", "adapted"];

function reasonsTable(bucket: Bucket): string {
  return table(
    REASON_KINDS.map((kind) => kind),
    [REASON_KINDS.map((kind) => esc(bucket.reasons[kind]))],
    "",
  );
}

function escalationRows(repo: string | null, ref: string, entries: readonly EscalationEntry[], withStatus: boolean): string[][] {
  return entries.map((entry) => {
    const cells = [repoLink(repo, ref, entry.file, entry.id), esc(entry.trigger ?? "unparseable"), esc(entry.testIds.join(", "))];
    return withStatus ? [...cells, statusCell(entry.status)] : cells;
  });
}

function renderIndex(input: SiteInput): string {
  const { report, repo } = input;
  const ref = refOf(report);
  const overall = report.overall;
  const alpha = report.alpha;
  const out: string[] = [];
  out.push(`<h1>Xaravel conformance</h1>`);
  out.push(`<p>Commit ${esc(report.commit ?? "unknown")} · Baseline Pin laravel/framework ${esc(report.pin.tag)} (${esc(report.pin.commit)})</p>`);

  out.push(`<section id="rate">\n<h2>Conformance Rate</h2>`);
  out.push(`<p class="figure" id="full-rate">Full rate: <strong>${esc(formatRate(overall.rate))}</strong> = ${esc(overall.passing)} / ${esc(overall.pairs)} pairs</p>`);
  out.push(
    `<p class="figure" id="alpha">Alpha gate (SM-1): <strong>${esc(formatRate(alpha.rate))}</strong> = ${esc(alpha.passing)} / ${esc(alpha.applicable)} applicable Test IDs · target ${esc(formatRate(alpha.target))} · met: ${alpha.met ? "yes" : "no"} · remaining not-ported-yet ${esc(alpha.remaining["not-ported-yet"])}, blocked-by ${esc(alpha.remaining["blocked-by"])}</p>`,
  );
  out.push(`<p>Overall bucket: pass ${esc(overall.statuses.pass)} · fail-known ${esc(overall.failKnown)} · skip ${esc(overall.statuses.skip)} · quarantined ${esc(overall.statuses.quarantined)} · adapted ${esc(overall.adapted)}</p>`);
  out.push(table(BUCKET_HEADERS, Object.entries(report.components).map(([name, bucket]) => bucketRow(name, bucket)), "no Components in the Inventory"));
  out.push(`</section>`);

  out.push(`<section id="skip-reasons">\n<h2>Skip Reasons</h2>`);
  out.push(reasonsTable(overall));
  out.push(table(["reason", "pairs"], Object.entries(overall.reasonsDetail).map(([reason, n]) => [esc(reason), esc(n)]), "no skips"));
  out.push(`</section>`);

  const named = Object.keys(overall.reasonsDetail)
    .filter((reason) => /^intentional-divergence:DIV-[1-9]\d*$/.test(reason))
    .map((reason) => reason.slice("intentional-divergence:".length));
  const divs = [...new Set([...Array.from({ length: BASE_DIVS }, (_, i) => `DIV-${i + 1}`), ...named, ...input.divRecords])].sort((a, b) => divNumber(a) - divNumber(b));
  out.push(`<section id="divergences">\n<h2>Divergences</h2>`);
  out.push(
    table(
      ["DIV", "pairs", "Divergence Record"],
      divs.map((div) => [esc(div), esc(overall.reasonsDetail[`intentional-divergence:${div}`] ?? 0), input.divRecords.has(div) ? repoLink(repo, ref, `${DECISIONS_DIR}/${div}.md`, `${DECISIONS_DIR}/${div}.md`) : "no record yet"]),
      "",
    ),
  );
  out.push(`</section>`);

  const open = input.escalations.filter((entry) => isOpen(entry.status));
  out.push(`<section id="escalations">\n<h2>Open Escalations (${esc(open.length)})</h2>`);
  out.push(table(["Escalation", "trigger", "Test IDs", "status"], escalationRows(repo, ref, open, true), "no open Escalations"));
  out.push(`</section>`);

  out.push(`<section id="quarantined">\n<h2>Quarantined tests (${esc(input.quarantined.length)})</h2>`);
  out.push(
    table(
      ["Test ID", "variant", "Escalation"],
      input.quarantined.map((line) => [esc(line.id), esc(line.variant), line.escalation === null ? "" : repoLink(repo, ref, `${ESCALATIONS_DIR}/${line.escalation}.md`, line.escalation)]),
      "no Quarantined tests",
    ),
  );
  out.push(`</section>`);

  out.push(`<section id="api-surface">\n<h2>API-surface diff</h2>`);
  out.push(
    table(
      ["Component", "upstream", "matched", "missing", "renamed", "extra", "unexplained"],
      input.apiSurface.map((diff) => {
        const counts = countsOf(diff);
        return [`<a href="api-surface/${esc(diff.component)}.html">${esc(diff.component)}</a>`, esc(counts.upstream), esc(counts.matched), esc(counts.missing), esc(counts.renamed), esc(counts.extra), esc(counts.unexplained)];
      }),
      "no API-surface Components",
    ),
  );
  out.push(`</section>`);

  out.push(`<section id="history">\n<h2>History</h2>`);
  out.push(renderHistoryChart(input.history));
  out.push(`</section>`);

  out.push(`<section id="epics">\n<h2>Epic review</h2>`);
  out.push(input.epics.length === 0 ? `<p class="empty">no Epics</p>` : `<ul>\n${input.epics.map((review) => `<li><a href="epics/${esc(review.epic)}.html">Epic ${esc(review.epic)}</a></li>`).join("\n")}\n</ul>`);
  out.push(`</section>`);
  return page("Xaravel conformance", out.join("\n"));
}

function renderEpic(input: SiteInput, review: EpicReview): string {
  const { report, repo } = input;
  const ref = refOf(report);
  const failKnown = review.components.reduce((sum, { bucket }) => sum + (bucket?.failKnown ?? 0), 0);
  const open = review.blocking;
  const out: string[] = [];
  out.push(`<p><a href="../index.html">Dashboard</a></p>`);
  out.push(`<h1>Epic ${esc(review.epic)} review</h1>`);
  out.push(`<section id="blocking" class="blocking">\n<h2>Blocking acceptance</h2>`);
  out.push(
    `<p id="fail-known">fail-known (the Epic's Components' count across all Epics): <strong>${esc(failKnown)}</strong>${failKnown > 0 ? " (blocks acceptance)" : ""}</p>`,
  );
  out.push(`<p id="open-escalations">open Escalations concerning this Epic: <strong>${esc(open.length)}</strong>${open.length > 0 ? " (blocks acceptance)" : ""}</p>`);
  out.push(table(["Escalation", "trigger", "Test IDs", "status"], escalationRows(repo, ref, open, true), "no open Escalations"));
  out.push(`</section>`);

  out.push(`<section id="components">\n<h2>Components</h2>`);
  if (review.components.length === 0) {
    out.push(`<p class="empty">no Components</p>`);
  }
  for (const { component, bucket } of review.components) {
    out.push(`<h3>${esc(component)}</h3>`);
    if (bucket === null) {
      out.push(`<p class="empty">no Test IDs in the Inventory</p>`);
      continue;
    }
    out.push(`<p>Rate: <strong>${esc(formatRate(bucket.rate))}</strong> = ${esc(bucket.passing)} / ${esc(bucket.pairs)} pairs · fail-known ${esc(bucket.failKnown)} · quarantined ${esc(bucket.statuses.quarantined)} · adapted ${esc(bucket.adapted)}</p>`);
    out.push(reasonsTable(bucket));
  }
  out.push(`</section>`);

  out.push(`<section id="since">\n<h2>Added since the Epic began</h2>`);
  out.push(`<p>Began at: ${review.began === null ? "not begun (no Story commit)" : esc(review.began)}</p>`);
  out.push(`<h3>Divergence Records</h3>`);
  out.push(table(["DIV", "record"], review.divergences.map((div) => [esc(div.id), repoLink(repo, ref, div.file, div.file)]), "none"));
  out.push(`<h3>Escalations</h3>`);
  out.push(table(["Escalation", "trigger", "Test IDs", "status"], escalationRows(repo, ref, review.escalations, true), "none"));
  out.push(`</section>`);

  out.push(`<section id="stories">\n<h2>Stories</h2>`);
  out.push(
    table(
      ["Story", "status", "commits", "files", "lines added", "lines deleted"],
      review.stories.map((story) => [esc(story.id), esc(story.status), esc(story.commits), esc(story.files), `+${esc(story.added)}`, `-${esc(story.deleted)}`]),
      "no Stories",
    ),
  );
  out.push(`</section>`);
  return page(`Xaravel conformance: Epic ${review.epic} review`, out.join("\n"));
}

/** One Component's API-surface diff: every item, with its category, kind, FQCN, member, rename target and explanation. */
function renderApiSurface(diff: ComponentDiff): string {
  const counts = countsOf(diff);
  const out: string[] = [];
  out.push(`<p><a href="../index.html">Dashboard</a></p>`);
  out.push(`<h1>API-surface diff: ${esc(diff.component)}</h1>`);
  out.push(`<p>upstream ${esc(counts.upstream)} · matched ${esc(counts.matched)} · missing ${esc(counts.missing)} · renamed ${esc(counts.renamed)} · extra ${esc(counts.extra)} · unexplained ${esc(counts.unexplained)}</p>`);
  out.push(
    table(
      ["category", "kind", "fqcn", "member", "to", "explained"],
      diff.items.map((item) => [esc(item.category), esc(item.kind), esc(item.fqcn), esc(item.member ?? ""), esc(item.to ?? ""), esc(item.explained ?? "unexplained")]),
      "no items",
    ),
  );
  return page(`Xaravel conformance: API-surface diff of ${diff.component}`, out.join("\n"));
}

/** The site's files (path to content), pure over `input`. */
export function buildSite(input: SiteInput): Map<string, string> {
  const files = new Map<string, string>();
  files.set(".nojekyll", "");
  files.set("index.html", renderIndex(input));
  for (const review of input.epics) {
    files.set(`epics/${review.epic}.html`, renderEpic(input, review));
  }
  for (const diff of input.apiSurface) {
    files.set(`api-surface/${diff.component}.html`, renderApiSurface(diff));
  }
  files.set("report.json", serialiseReport(input.report));
  files.set("history.jsonl", input.history.map(serialiseRecord).join(""));
  return files;
}

/** Reads every input of the site at `root` other than the report, the history and the API-surface diff. */
export function collectSiteInput(options: { root: string; report: Report; history: readonly HistoryRecord[]; repo: string | null; apiSurface: readonly ComponentDiff[] }): SiteInput {
  const { root, report } = options;
  const sources = epicSources(root);
  return {
    report,
    history: options.history,
    repo: options.repo,
    divRecords: readDivRecords(root),
    escalations: readEscalations(root),
    quarantined: readQuarantined(root),
    apiSurface: options.apiSurface,
    epics: epicsOf(root).map((epic) => epicReview(root, epic, report, sources)),
  };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE =
  "Usage: bun --no-env-file tools/conformance-report/site.ts [--root <dir>] [--report <file>] [--history <file>] [--out <dir>] [--repo <owner/name>] [--api-surface <file>]";
const FLAGS = ["--root", "--report", "--history", "--out", "--repo", "--api-surface"] as const;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

interface Args {
  root: string;
  report: string | null;
  history: string | null;
  out: string | null;
  repo: string | null;
  apiSurface: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const env = process.env["GITHUB_REPOSITORY"];
  const args: Args = { root: resolve(import.meta.dir, "..", ".."), report: null, history: null, out: null, repo: env === undefined || env === "" ? null : env, apiSurface: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!(FLAGS as readonly string[]).includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
      args.root = resolve(value);
    } else if (arg === "--report") {
      args.report = resolve(value);
    } else if (arg === "--history") {
      args.history = resolve(value);
    } else if (arg === "--out") {
      args.out = resolve(value);
    } else if (arg === "--repo") {
      args.repo = value;
    } else {
      args.apiSurface = resolve(value);
    }
  }
  if (args.repo !== null && !REPO.test(args.repo)) {
    throw new UsageError(`--repo ${JSON.stringify(args.repo)} is not <owner>/<name>`);
  }
  return args;
}

function readApiSurface(file: string): ComponentDiff[] {
  if (!existsSync(file)) {
    throw new SiteError(`${file} does not exist`);
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new SiteError(`${file}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(value) || value.some((diff) => diff === null || typeof diff !== "object" || typeof (diff as ComponentDiff).component !== "string" || !/^[a-z][a-z0-9-]*$/.test((diff as ComponentDiff).component) || !Array.isArray((diff as ComponentDiff).items))) {
    throw new SiteError(`${file} is not a ComponentDiff[] array`);
  }
  return value as ComponentDiff[];
}

/** Replaces `dir` with `files`; refuses a non-empty directory that is not a previous site. */
function writeSite(dir: string, files: ReadonlyMap<string, string>): void {
  if (existsSync(dir)) {
    const entries = readdirSync(dir);
    if (entries.length > 0 && !entries.includes(".nojekyll")) {
      throw new SiteError(`${dir} is not empty and holds no previous site (.nojekyll); refusing to replace it`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
  for (const [path, content] of files) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

export function main(argv: readonly string[]): number {
  try {
    const args = parseArgs(argv);
    const report = readReport(args.report ?? join(args.root, DEFAULT_OUT));
    const history = args.history === null ? [] : readHistory(args.history);
    const apiSurface = args.apiSurface === null ? diffComponents(args.root, componentsOf(args.root)) : readApiSurface(args.apiSurface);
    const files = buildSite(collectSiteInput({ root: args.root, report, history, repo: args.repo, apiSurface }));
    const out = args.out ?? join(args.root, DEFAULT_SITE_OUT);
    writeSite(out, files);
    const pages = [...files.keys()].filter((path) => path.endsWith(".html")).length;
    process.stdout.write(`conformance:site: wrote ${pages} pages to ${out}\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`conformance:site: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
