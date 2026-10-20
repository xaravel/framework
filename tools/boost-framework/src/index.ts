// The public surface of Boost framework mode (Stories 7.3 and 7.4).
export { DEFAULT_ROOT, main } from "./server";
export { callTool, createServer, SERVER_NAME, TOOL_ANNOTATIONS } from "./mcp";
export { lockdown, ReadOnlyError } from "./lockdown";
export { inScope } from "./scope";
export {
  computeBuckets,
  conformanceRate,
  decisionStatus,
  divergenceClauses,
  divergenceGet,
  escalationDigest,
  escalationsOpen,
  expectationsStatus,
  globToRegExp,
  inventoryGet,
  parseSource,
  storyTests,
  TOOL_DEFINITIONS,
  ToolError,
  type Bucket,
  type JsonObject,
  type ToolDefinition,
} from "./tools";
export { DATA_DIRS, DataError, dataPath, DataScopeError } from "./data";
