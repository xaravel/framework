// The devcontainer's alpha gate (Story 5.10; AD-17, AD-28, epics.md 5.10 AC2).
//
//   bun run harness | bun --no-env-file tools/devcontainer/alpha.ts
//       (`bun run devcontainer:alpha`) reads a harness report on stdin and
//       fails when any alpha Variant (`ALPHA_VARIANTS`) is `NOT-RUN`
//
// The container sets no `CI`, so the harness reports a Variant whose backend
// is unreachable as `NOT-RUN` and does not fail. The devcontainer job checks it
// here instead. Only alpha Variants count: non-alpha backends (MySQL, MariaDB,
// SQL Server, Beanstalkd …) have no sidecar until Phase 9, so their `NOT-RUN`
// is expected. A report with no `SUMMARY` line is a violation too.
//
// Exit codes: 0 pass (prints `devcontainer alpha: not-run=0 over <n> alpha
// variant(s)`), 1 violations (printed to stderr, one per line).
import { ALPHA_VARIANTS } from "../inventory/inventory";

/** One violation per alpha `NOT-RUN [<v>]` line, plus one when the report has no `SUMMARY` line; empty when it passes. */
export function alphaNotRun(report: string): string[] {
  const out: string[] = [];
  let summary = false;
  for (const line of report.split("\n")) {
    if (line.startsWith("SUMMARY ")) {
      summary = true;
      continue;
    }
    const match = /^NOT-RUN \[([^\]]+)\]/.exec(line);
    if (match !== null && ALPHA_VARIANTS.includes(match[1]!)) {
      out.push(`devcontainer alpha: ${match[1]!} is NOT-RUN: ${line}`);
    }
  }
  if (!summary) {
    out.push("devcontainer alpha: the harness report has no SUMMARY line");
  }
  return out;
}

export function main(report: string): number {
  const violations = alphaNotRun(report);
  if (violations.length > 0) {
    process.stderr.write(`${violations.join("\n")}\n`);
    return 1;
  }
  process.stdout.write(`devcontainer alpha: not-run=0 over ${ALPHA_VARIANTS.length} alpha variant(s)\n`);
  return 0;
}

if (import.meta.main) {
  process.exit(main(await Bun.stdin.text()));
}
