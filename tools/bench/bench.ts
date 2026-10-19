// The benchmark runner (Story 5.7; AD-28). Benchmarks are information only:
// they run nightly (.github/workflows/nightly.yml) and never fail a job.
//
//   bun tools/bench/bench.ts [--root <dir>] [--iterations <n>]
//       (`bun run bench`) discovers `packages/*/bench/**/*.bench.ts` and
//       `conformance/bench/**/*.bench.ts` under the root, sorted. Each file
//       default-exports `{ name: string, fn: () => unknown }[]`. Every
//       benchmark gets a warm-up, then timed iterations: `--iterations <n>`
//       of them, or by default as many as fit in about 250 ms (at least 5, at
//       most 10,000). It prints one line per benchmark
//
//         BENCH <file> <name> median_ns=<n> iterations=<k>
//
//       where <n> is the median wall time of one call in nanoseconds, then
//
//         BENCH-SUMMARY ran=<n> errors=<e>
//
//       A `fn` that returns a thenable is awaited, so it is timed to
//       completion. A benchmark that throws or rejects (in its warm-up or any
//       iteration), or a file
//       that fails to load or whose default export is not that shape, prints
//       `BENCH-ERROR <file> <name|-> <first message line>` and counts as an
//       error; the other benchmarks still run. All lines go to stdout.
//
// Exit codes: always 0, except 2 on a usage error.
import { join, resolve } from "node:path";

export const BENCH_GLOBS = ["packages/*/bench/**/*.bench.ts", "conformance/bench/**/*.bench.ts"] as const;
/** The default time budget for one benchmark's timed iterations. */
const BUDGET_NS = 250_000_000;
const MIN_ITERATIONS = 5;
const MAX_ITERATIONS = 10_000;

export class UsageError extends Error {}

export interface Benchmark {
  readonly name: string;
  readonly fn: () => unknown;
}

export interface BenchOptions {
  /** A fixed number of timed iterations; default: as many as fit in the budget. */
  readonly iterations?: number | null;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n")[0]!.trim() || (error instanceof Error ? error.name : "error");
}

/** The benchmark files under `root`, repo-relative, sorted. */
export function benchFiles(root: string): string[] {
  const found = new Set<string>();
  for (const glob of BENCH_GLOBS) {
    for (const file of new Bun.Glob(glob).scanSync({ cwd: root, onlyFiles: true })) {
      const rel = file.replaceAll("\\", "/");
      if (!rel.split("/").includes("node_modules")) {
        found.add(rel);
      }
    }
  }
  return [...found].sort(compare);
}

function isBenchmarks(value: unknown): value is Benchmark[] {
  return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && typeof (item as Benchmark).name === "string" && (item as Benchmark).name !== "" && typeof (item as Benchmark).fn === "function");
}

function median(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as { then?: unknown }).then === "function";
}

/** Calls the benchmark once, awaiting a thenable result, so an async one is timed to completion and its rejection throws here. */
async function call(benchmark: Benchmark): Promise<void> {
  const result = benchmark.fn();
  if (isThenable(result)) {
    await result;
  }
}

/** Times one benchmark; throws (or rejects with) what it throws. */
async function time(benchmark: Benchmark, iterations: number | null): Promise<{ medianNs: number; iterations: number }> {
  await call(benchmark);
  const samples: number[] = [];
  const started = Bun.nanoseconds();
  for (;;) {
    const at = Bun.nanoseconds();
    await call(benchmark);
    samples.push(Bun.nanoseconds() - at);
    if (iterations !== null) {
      if (samples.length >= iterations) {
        break;
      }
    } else if (samples.length >= MAX_ITERATIONS || (samples.length >= MIN_ITERATIONS && Bun.nanoseconds() - started >= BUDGET_NS)) {
      break;
    }
  }
  return { medianNs: median(samples), iterations: samples.length };
}

/** Runs every benchmark under `root` and returns the report lines (see the header). */
export async function runBenchmarks(rootArg: string, options: BenchOptions = {}): Promise<string[]> {
  const root = resolve(rootArg);
  const iterations = options.iterations ?? null;
  const out: string[] = [];
  let ran = 0;
  let errors = 0;
  for (const file of benchFiles(root)) {
    let benchmarks: Benchmark[];
    try {
      const module = (await import(join(root, file))) as { default?: unknown };
      if (!isBenchmarks(module.default)) {
        throw new Error("the default export is not { name: string, fn: () => unknown }[]");
      }
      benchmarks = module.default;
    } catch (error) {
      errors++;
      out.push(`BENCH-ERROR ${file} - ${firstLine(error)}`);
      continue;
    }
    for (const benchmark of benchmarks) {
      try {
        const result = await time(benchmark, iterations);
        ran++;
        out.push(`BENCH ${file} ${benchmark.name} median_ns=${result.medianNs} iterations=${result.iterations}`);
      } catch (error) {
        errors++;
        out.push(`BENCH-ERROR ${file} ${benchmark.name} ${firstLine(error)}`);
      }
    }
  }
  out.push(`BENCH-SUMMARY ran=${ran} errors=${errors}`);
  return out;
}

const USAGE = "Usage: bun tools/bench/bench.ts [--root <dir>] [--iterations <n>]";

/** The CLI's root and options; throws `UsageError` (exit 2). */
export function parseArgs(argv: readonly string[]): { root: string; iterations: number | null } {
  let root = resolve(import.meta.dir, "..", "..");
  let iterations: number | null = null;
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root" && arg !== "--iterations") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (seen.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    seen.add(arg);
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
      root = resolve(value);
    } else {
      if (!/^[1-9]\d{0,5}$/.test(value)) {
        throw new UsageError(`--iterations must be a whole number from 1 to 999999, got ${JSON.stringify(value)}`);
      }
      iterations = Number(value);
    }
  }
  return { root, iterations };
}

export async function main(argv: readonly string[]): Promise<number> {
  let args: { root: string; iterations: number | null };
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
  try {
    const lines = await runBenchmarks(args.root, { iterations: args.iterations });
    process.stdout.write(lines.map((line) => `${line}\n`).join(""));
  } catch (error) {
    // Benchmarks never fail a job: even the runner's own failure is reported, not raised.
    process.stdout.write(`BENCH-ERROR - - ${firstLine(error)}\nBENCH-SUMMARY ran=0 errors=1\n`);
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
