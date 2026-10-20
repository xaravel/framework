// The MCP half of Boost framework mode (Stories 7.3 and 7.4): `createServer`
// registers the six tools of src/tools.ts, and `connectStdio` serves them over
// stdio. src/server.ts, the entry point, imports this module only after
// `lockdown(root)`, so the data layer it loads (src/data.ts and its `node:fs`
// imports) binds to the locked-down functions.
//
// `createServer` used in-process (outside src/server.ts) is not locked down;
// every read still goes through `dataPath` (src/data.ts).
import { fromJsonSchema, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { TOOL_DEFINITIONS, ToolError, type ToolArgs, type ToolDefinition } from "./tools";
import { DataError, DataScopeError } from "./data";
import { ReadOnlyError } from "./lockdown";
import { resolve } from "node:path";

export const SERVER_NAME = "boost-framework";
export const SERVER_VERSION = "0.0.0";

/** Every tool's annotations: read-only, idempotent, closed-world. */
/** The repository holding this file (the same as src/server.ts's DEFAULT_ROOT; importing that module here would deadlock its top-level await). */
const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");

export const TOOL_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs one tool call: the value as text and structured content, or a tool error. */
export function callTool(definition: ToolDefinition, root: string, args: ToolArgs): CallToolResult {
  try {
    const value = definition.handler(root, args);
    return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
  } catch (error) {
    const known = error instanceof ToolError || error instanceof DataError || error instanceof DataScopeError || error instanceof ReadOnlyError;
    return { content: [{ type: "text", text: `${known ? "" : "internal error: "}${message(error)}` }], isError: true };
  }
}

/** An MCP server with every tool registered, reading the repository at `root`. */
export function createServer(root: string = REPO_ROOT): McpServer {
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

/** Serves `createServer(root)` over stdio. */
export async function connectStdio(root: string): Promise<void> {
  await createServer(root).connect(new StdioServerTransport());
}
