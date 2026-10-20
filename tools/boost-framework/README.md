# @xaravel/boost-framework

Boost framework mode: an MCP server over Xaravel's conformance data (private tooling). Part of Xaravel, a TypeScript port of Laravel.

It has no Upstream Laravel package of its own.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Dependencies

- `@modelcontextprotocol/server` 2.3.1 (exact pin), the MCP TypeScript SDK. It is the only dependency (spine AD-2).

## Usage

```sh
bun --no-env-file tools/boost-framework/src/server.ts [--root <dir>]
```

It speaks MCP over stdio. The repository's `.mcp.json` registers it as `boost-framework`, so an agent session started at the repository root (or at a worktree's root) gets it; the script path in it is relative to the cwd. `--root` points it at another checkout; by default it reads the repository that holds the server file, not the cwd.

## Tools

All six are read-only, and read only `conformance/`, `stories/` and `decisions/`:

| Tool | Arguments | Returns |
| --- | --- | --- |
| `inventory.get` | `id` or `glob` (exactly one), `limit` 1..1000 (default 100) | Inventory entries with the `conformance/upstream/` source path, line range and assertion multiset |
| `expectations.status` | `id`, `variant?` | every Expectations line of the id, with its shard |
| `conformance.rate` | `component?` | Story 7.1's Conformance Rate bucket, overall or for one Component |
| `story.tests` | `story` | a Story manifest's component, status, Test IDs and Xaravel Test IDs |
| `divergence.get` | `id` (`DIV-<n>` or `DIV-<n>.<k>`) | a Divergence Record and its numbered clauses |
| `escalations.open` | `story?` | the open Escalations |

See [docs/framework-mode.md](docs/framework-mode.md) for the result shapes, the mirrored rules and the limits.
