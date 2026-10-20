// Boost framework mode: a read-only MCP server over Xaravel's conformance data
// (Stories 7.3 and 7.4; FR-109, UJ-4).
//
//   bun --no-env-file tools/boost-framework/src/server.ts [--root <dir>]
//       serves the six tools of src/tools.ts (`conformance.rate`,
//       `divergence.get`, `escalations.open`, `expectations.status`,
//       `inventory.get`, `story.tests`) over stdio JSON-RPC. `<root>` is the
//       repository whose `conformance/`, `stories/` and `decisions/` it reads;
//       it defaults to the repository holding this file, not the cwd. The
//       repo's `.mcp.json` registers it as `boost-framework`.
//
// Nothing but JSON-RPC goes to stdout. A bad flag prints the usage to stderr
// and exits 2. docs/framework-mode.md documents the tools, the data scope,
// the lockdown and the mirrored rules.
//
// Entry order (Story 7.4). This file statically imports only ./lockdown (and,
// through it, ./scope) and node:path, so no `node:fs` named import is bound
// yet. `main` parses the arguments, calls `lockdown(root)` (every write, spawn
// and out-of-scope read now throws), and only then imports ./mcp, whose data
// layer binds to the locked-down `node:fs`. createServer, callTool and the
// server constants live in src/mcp.ts.
import { isDirectory, lockdown } from "./lockdown";
import { resolve } from "node:path";

/** The repository holding this file. */
export const DEFAULT_ROOT = resolve(import.meta.dir, "..", "..", "..");

class UsageError extends Error {}

const USAGE = "Usage: bun --no-env-file tools/boost-framework/src/server.ts [--root <dir>]";

export function parseArgs(argv: readonly string[]): { root: string } {
  let root = DEFAULT_ROOT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    root = resolve(value);
    if (!isDirectory(root)) {
      throw new UsageError(`--root ${value} is not a directory`);
    }
  }
  return { root };
}

/** Locks the process down, then starts the stdio server; returns 2 on a usage error, otherwise 0 once connected. */
export async function main(argv: readonly string[]): Promise<number> {
  let root: string;
  try {
    root = parseArgs(argv).root;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
  lockdown(root);
  const { connectStdio } = await import("./mcp");
  await connectStdio(root);
  return 0;
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2));
  if (code !== 0) {
    process.exit(code);
  }
}
