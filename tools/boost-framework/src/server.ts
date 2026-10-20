// Boost framework mode: a read-only MCP server over Xaravel's conformance data
// (Story 7.3; FR-109, UJ-4).
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
// and exits 2. The server never writes files, runs commands or touches git;
// every read goes through `dataPath` (src/data.ts). docs/framework-mode.md
// documents the tools, the data scope and the mirrored rules.
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fromJsonSchema, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { TOOL_DEFINITIONS, ToolError, type ToolArgs, type ToolDefinition } from "./tools";
import { DataError, DataScopeError } from "./data";

export const SERVER_NAME = "boost-framework";
export const SERVER_VERSION = "0.0.0";

/** Every tool's annotations: read-only, idempotent, closed-world. */
export const TOOL_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** The repository holding this file. */
export const DEFAULT_ROOT = resolve(import.meta.dir, "..", "..", "..");

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs one tool call: the value as text and structured content, or a tool error. */
export function callTool(definition: ToolDefinition, root: string, args: ToolArgs): CallToolResult {
  try {
    const value = definition.handler(root, args);
    return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
  } catch (error) {
    const prefix = error instanceof ToolError || error instanceof DataError || error instanceof DataScopeError ? "" : "internal error: ";
    return { content: [{ type: "text", text: `${prefix}${message(error)}` }], isError: true };
  }
}

/** An MCP server with every tool registered, reading the repository at `root`. */
export function createServer(root: string = DEFAULT_ROOT): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  for (const definition of TOOL_DEFINITIONS) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: fromJsonSchema<ToolArgs>(definition.inputSchema),
        annotations: { ...TOOL_ANNOTATIONS },
      },
      (args: ToolArgs) => callTool(definition, root, args ?? {}),
    );
  }
  return server;
}

// ---------------------------------------------------------------------------
// CLI

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
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      throw new UsageError(`--root ${value} is not a directory`);
    }
  }
  return { root };
}

/** Starts the stdio server; returns 2 on a usage error, otherwise 0 once connected. */
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
  await createServer(root).connect(new StdioServerTransport());
  return 0;
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2));
  if (code !== 0) {
    process.exit(code);
  }
}
